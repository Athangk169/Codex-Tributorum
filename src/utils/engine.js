// src/utils/engine.js
// ─────────────────────────────────────────────────────────────
// Codex Tributorum — Finance Engine v2
//
// Document model: all IDs use namespaced format
//   finance:account:userId:accountId
//   finance:card:userId:cardId
//   finance:rule:userId:categorySlug
//   finance:config:categories:userId
//   finance:config:routes          (system-wide)
//   finance:config:analytics       (system-wide)
//   finance:snapshot:userId:YYYY-MM
//   finance:investments:current:userId
//   finance:investments:snapshot:userId:YYYY-MM
//
// Transaction IDs (finances DB):
//   txn:userId:YYYY-MM-DD:randomSuffix
//
// Balance state shape (subaccount-aware):
//   {
//     Bank: { bank_hdfc: 4591, bank_sbi: 743 },
//     Card: { card_SBI_cc: 5172 },
//     Cash: { cash_main: 0 },
//     AR: 0,
//     Provisions: 0
//   }
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// CategorizationEngine
// ─────────────────────────────────────────────────────────────
export const CategorizationEngine = {

  async autoTag(rawDescription, metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:rule:${userId}:`,
        endkey:   `finance:rule:${userId}:\uffff`
      });

      const rules = result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:rule' && d.is_active);

      let phrases = [];
      rules.forEach(rule => {
        (rule.keywords || []).forEach(kw => {
          phrases.push({ phrase: kw.toLowerCase(), length: kw.length, category: rule.category_name });
        });
      });
      phrases.sort((a, b) => b.length - a.length);

      const clean = rawDescription.toLowerCase();
      for (const item of phrases) {
        if (clean.includes(item.phrase)) return item.category;
      }
      return 'Uncategorized';
    } catch (err) {
      console.error('CategorizationEngine.autoTag failed:', err);
      return 'Uncategorized';
    }
  },

  async teachEngine(keyword, targetCategory, metadataDB, userId) {
    try {
      const cleanKw = keyword.toLowerCase().trim();
      const slug    = targetCategory.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const ruleId  = `finance:rule:${userId}:${slug}`;

      try {
        const existing = await metadataDB.get(ruleId);
        if (!existing.keywords.includes(cleanKw)) {
          existing.keywords.push(cleanKw);
          existing.updated = new Date().toISOString();
          await metadataDB.put(existing);
        }
      } catch (err) {
        if (err.name === 'not_found') {
          await metadataDB.put({
            _id:           ruleId,
            type:          'finance:rule',
            user_id:       userId,
            category_name: targetCategory,
            keywords:      [cleanKw],
            is_active:     true,
            created:       new Date().toISOString(),
            updated:       new Date().toISOString()
          });
        } else throw err;
      }
      return true;
    } catch (err) {
      console.error('CategorizationEngine.teachEngine failed:', err);
      return false;
    }
  },

  async addCategory(categoryName, type, keywords = [], metadataDB, userId) {
    const slug   = categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const ruleId = `finance:rule:${userId}:${slug}`;

    try { await metadataDB.get(ruleId); return { ok: false, reason: 'already_exists' }; } catch (_) {}

    await metadataDB.put({
      _id:           ruleId,
      type:          'finance:rule',
      user_id:       userId,
      category_name: categoryName,
      keywords,
      is_active:     true,
      created:       new Date().toISOString(),
      updated:       new Date().toISOString()
    });

    const configId = `finance:config:categories:${userId}`;
    let config;
    try {
      config = await metadataDB.get(configId);
    } catch {
      config = {
        _id: configId, type: 'finance:config', user_id: userId,
        income_categories: [], neutral_categories: [],
        expense_categories: [], system_entries: []
      };
    }

    if (type === 'income')       config.income_categories.push(categoryName);
    else if (type === 'neutral') config.neutral_categories.push(categoryName);
    else                         config.expense_categories = [...(config.expense_categories || []), categoryName];

    await metadataDB.put(config);
    return { ok: true };
  },

  async deleteCategory(categoryName, metadataDB, userId) {
    const slug   = categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const ruleId = `finance:rule:${userId}:${slug}`;

    try {
      const doc = await metadataDB.get(ruleId);
      if (doc.user_id === userId) await metadataDB.remove(doc);
    } catch (_) {}

    try {
      const config = await metadataDB.get(`finance:config:categories:${userId}`);
      config.income_categories  = (config.income_categories  || []).filter(c => c !== categoryName);
      config.neutral_categories = (config.neutral_categories || []).filter(c => c !== categoryName);
      config.expense_categories = (config.expense_categories || []).filter(c => c !== categoryName);
      await metadataDB.put(config);
    } catch (_) {}

    return { ok: true };
  },

  async updateCategoryKeywords(categoryName, keywords, metadataDB, userId) {
    const slug   = categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const ruleId = `finance:rule:${userId}:${slug}`;
    try {
      const doc = await metadataDB.get(ruleId);
      if (doc.user_id === userId) {
        doc.keywords = keywords;
        doc.updated  = new Date().toISOString();
        await metadataDB.put(doc);
      }
      return { ok: true };
    } catch (_) { return { ok: false }; }
  }
};

// ─────────────────────────────────────────────────────────────
// TransferEngine
// ─────────────────────────────────────────────────────────────
export const TransferEngine = {

  async getRoutes(metadataDB) {
    try {
      const doc = await metadataDB.get('finance:config:routes');
      return doc.routes || {};
    } catch (_) { return {}; }
  },

  async resolveRoute(category, metadataDB) {
    const routes = await this.getRoutes(metadataDB);
    return routes[category] || null;
  },

  // Apply a transfer to the subaccount-aware state.
  applyTransfer(state, route, amount, txn) {
    const { from, to } = route;
    const absAmt = Math.abs(amount);

    if (from && state[from] !== undefined) {
      if (typeof state[from] === 'object' && txn?.sub_account) {
        const sub = txn.sub_account;
        if (state[from][sub] !== undefined) state[from][sub] -= absAmt;
        else {
          const first = Object.keys(state[from])[0];
          if (first) state[from][first] -= absAmt;
        }
      } else if (typeof state[from] === 'number') {
        state[from] -= absAmt;
      }
    }

    if (to && state[to] !== undefined) {
      if (typeof state[to] === 'object') {
        const first = Object.keys(state[to])[0];
        if (first) {
          state[to][first] = to === 'Card'
            ? state[to][first] - absAmt
            : state[to][first] + absAmt;
        }
      } else if (typeof state[to] === 'number') {
        state[to] = to === 'Card'
          ? state[to] - absAmt
          : state[to] + absAmt;
      }
    }

    return state;
  }
};

// ─────────────────────────────────────────────────────────────
// CardEngine
// ─────────────────────────────────────────────────────────────
export const CardEngine = {

  _parseTxnDate(src) {
    if (src && src.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(src.substring(0, 10));
    return new Date();
  },

  getDueDateBucket(txnDateSrc, card) {
    const d          = this._parseTxnDate(txnDateSrc);
    const billingDay = card.billing_day      || 20;
    const dueDay     = card.due_day          || 10;
    const dueOffset  = card.due_month_offset || 1;

    let sMonth = d.getMonth(), sYear = d.getFullYear();
    if (d.getDate() > billingDay) {
      sMonth += 1;
      if (sMonth > 11) { sMonth = 0; sYear += 1; }
    }

    let dMonth = sMonth + dueOffset, dYear = sYear;
    if (dMonth > 11) { dMonth -= 12; dYear += 1; }

    return `${dYear}-${String(dMonth + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  },

  _isThisCard(d, card) {
    if (d.account_type !== 'Card') return false;
    const sub    = String(d.sub_account || '').toLowerCase();
    const cardId = (card._id || '').split(':').pop().toLowerCase();
    if (sub === cardId) return true;
    if (card.is_default && d.account_type === 'Card') return true;
    return false;
  },

  async buildBuckets(transactionsDB, metadataDB, userId, cardId) {
    try {
      const cards = await AccountEngine.getCards(metadataDB, userId);
      const card  = (cardId ? cards.find(c => c._id?.endsWith(`:${cardId}`) || c._id === cardId) : null)
                 || cards.find(c => c.is_default)
                 || cards[0];

      if (!card) return { error: 'card_not_found' };

      const result  = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });
      const allDocs = result.rows.map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId);

      const EXCLUDED = new Set(['Credit Card Bill', 'Credit Card Payment', 'Opening Balance', 'Account Closure']);
      const txns     = allDocs.filter(d => this._isThisCard(d, card) && !EXCLUDED.has(d.category));

      const buckets = {};
      txns.forEach(txn => {
        const key = this.getDueDateBucket(txn.date, card);
        if (!buckets[key]) buckets[key] = { due_date: key, total: 0, paid: 0, transactions: [] };
        buckets[key].total += Math.abs(txn.amount);
        buckets[key].transactions.push(txn);
      });

      let sortedKeys = Object.keys(buckets).sort();

      let openingDebt = 0;
      try {
        const snaps = await metadataDB.allDocs({
          include_docs: true,
          startkey: `finance:snapshot:${userId}:`,
          endkey:   `finance:snapshot:${userId}:\uffff`
        });
        const genesis = snaps.rows
          .map(r => r.doc)
          .filter(d => d.type === 'finance:snapshot' && d.is_genesis)[0];
        const cardSubId = (card._id || '').split(':').pop();
        openingDebt = genesis?.balances?.Card?.[cardSubId] || 0;
      } catch (_) {}

      if (openingDebt > 0) {
        const oldestKey = sortedKeys[0] || this.getDueDateBucket(new Date().toISOString(), card);
        if (!buckets[oldestKey]) buckets[oldestKey] = { due_date: oldestKey, total: 0, paid: 0, transactions: [] };
        buckets[oldestKey].total += openingDebt;
        if (!sortedKeys.includes(oldestKey)) sortedKeys.push(oldestKey);
        sortedKeys = sortedKeys.sort();
      }

      const payments = allDocs
        .filter(d => d.category === 'Credit Card Payment' && this._isThisCard(d, card))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      payments.forEach(pmt => {
        const pmtDate = (pmt.date || '').substring(0, 10);
        let rem = Math.abs(pmt.amount);
        for (const key of sortedKeys) {
          if (pmtDate > key) continue;
          const b   = buckets[key];
          const due = b.total - b.paid;
          if (due <= 0 || rem <= 0) continue;
          const apply = Math.min(rem, due);
          b.paid += apply;
          rem    -= apply;
        }
      });

      const today        = new Date().toISOString().substring(0, 10);
      const finalBuckets = sortedKeys.map(key => {
        const b           = buckets[key];
        const outstanding = Math.max(0, b.total - b.paid);
        const status      = outstanding <= 0 ? 'paid' : key < today ? 'overdue' : 'outstanding';
        return { ...b, outstanding, status };
      });

      return { card, buckets: finalBuckets };

    } catch (err) { return { error: err.message }; }
  }
};

// ─────────────────────────────────────────────────────────────
// ProvisionEngine
// ─────────────────────────────────────────────────────────────
export const ProvisionEngine = {

  async getAll(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:provision:${userId}:`,
        endkey:   `finance:provision:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc).filter(d => d.type === 'finance:provision');
    } catch (_) { return []; }
  },

  async add(name, targetAmount = null, metadataDB, userId) {
    const id = `finance:provision:${userId}:prov_${Date.now()}`;
    await metadataDB.put({
      _id:           id,
      type:          'finance:provision',
      user_id:       userId,
      name,
      target_amount: targetAmount,
      created:       new Date().toISOString()
    });
    return { ok: true };
  },

  async remove(provisionId, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(provisionId);
      if (doc.user_id === userId) await metadataDB.remove(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  }
};

// ─────────────────────────────────────────────────────────────
// AREngine — Accounts Receivable tag utilities
// ─────────────────────────────────────────────────────────────
export const AREngine = {

  getOpenTags(arByTag) {
    return Object.entries(arByTag || {})
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);
  },

  getTotal(arByTag) {
    return Object.values(arByTag || {}).reduce((a, b) => a + b, 0);
  },

  computeFromTxns(txns) {
    const arByTag = {};
    (txns || []).forEach(tx => {
      const tag       = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
      const isReceipt = tx.category === 'Reimbursement Received';

      if (!tag && !isReceipt) return;

      const effectiveTag = (tag || 'untagged').toString().toLowerCase().trim();
      const amt          = Math.abs(tx.amount || 0);

      if (isReceipt) {
        // Absolutely NO Math.max or delete allowed here
        arByTag[effectiveTag] = (arByTag[effectiveTag] || 0) - amt;
      } else {
        arByTag[effectiveTag] = (arByTag[effectiveTag] || 0) + amt;
      }
    });
    return Object.fromEntries(Object.entries(arByTag).filter(([, v]) => v > 0));
  },

  getAllTags(txns) {
    const tags = new Set();
    (txns || []).forEach(tx => {
      const tag = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
      if (tag && tag !== 'untagged') {
        tags.add(tag);
      }
    });
    return Array.from(tags).sort();
  }
};


export const FinanceEngine = {

  async _loadConfig(metadataDB, userId) {
    try {
      return await metadataDB.get(`finance:config:categories:${userId}`);
    } catch (_) {
      return { income_categories: [], neutral_categories: [], expense_categories: [], system_entries: [] };
    }
  },

  async _emptyState(metadataDB, userId) {
    const accounts = await AccountEngine.getBankAccounts(metadataDB, userId);
    const cards    = await AccountEngine.getCards(metadataDB, userId);
    const state    = { Bank: {}, Card: {}, Cash: { cash_main: 0 }, AR: {}, Provisions: 0 };
    accounts.forEach(a => { state.Bank[a._id.split(':').pop()] = 0; });
    cards.forEach(c    => { state.Card[c._id.split(':').pop()] = 0; });
    return state;
  },

  _cloneState(balances) {
    const clone = {};
    for (const [k, v] of Object.entries(balances)) {
      if (k === 'AR') {
        clone.AR = (typeof v === 'object' && v !== null) ? { ...v } : {};
      } else {
        clone[k] = (typeof v === 'object' && v !== null) ? { ...v } : v;
      }
    }
    return clone;
  },

  _flattenState(state) {
    const sum = obj => typeof obj === 'object' && obj !== null
      ? Object.values(obj).reduce((a, b) => a + b, 0)
      : (obj || 0);
    return {
      Bank:       sum(state.Bank),
      Card:       sum(state.Card),
      Cash:       sum(state.Cash),
      AR:         (typeof state.AR === 'object' && state.AR !== null)
                    ? Object.values(state.AR).reduce((a, b) => a + b, 0)
                    : (state.AR || 0),
      Provisions: state.Provisions || 0
    };
  },

  _applyTxnToState(state, txn, config, routes, flows = null) {
    const cat    = txn.category || 'Uncategorized';
    const amt    = Math.abs(txn.amount || 0);
    const sub    = txn.sub_account;
    const accType = txn.account_type;

    const systemEntries = new Set([...(config.system_entries || []), 'Cash c/d']);

    if (systemEntries.has(cat)) return;

    if (cat === 'Opening Balance') {
      if (accType && state[accType] !== undefined) {
        if (typeof state[accType] === 'object' && sub) {
          state[accType][sub] = (state[accType][sub] || 0) + amt;
        } else if (typeof state[accType] === 'number') {
          state[accType] += amt;
        }
      }
      return;
    }

    const isIncome   = config.income_categories?.includes(cat);
    const isTransfer = config.neutral_categories?.includes(cat);

    const tag = txn.reimbursement_tag || (txn.is_reimbursable ? 'untagged' : null);

    if (tag && !isIncome && !isTransfer) {
      const effTag = tag.toString().toLowerCase().trim();
      if (!state.AR[effTag]) state.AR[effTag] = 0;
      state.AR[effTag] += amt;
    }
    if (cat === 'Reimbursement Received') {
      const effTag = (txn.reimbursement_tag || 'untagged').toString().toLowerCase().trim();
      // Absolute NO CLAMPING logic here either
      state.AR[effTag] = (state.AR[effTag] || 0) - amt;
    }

    if (isTransfer) {
      const route = routes[cat];
      if (route) TransferEngine.applyTransfer(state, route, amt, txn);
      return;
    }

    if (isIncome) {
      if (flows) {
        if (cat === 'Reimbursement Received') flows.reimbursementsReceived += amt;
        else flows.grossIncome += amt;
      }
      if (accType === 'Bank' && sub && state.Bank[sub] !== undefined) state.Bank[sub] += amt;
      else if (accType === 'Cash') state.Cash.cash_main = (state.Cash.cash_main || 0) + amt;
      return;
    }

    if (flows) {
      flows.grossExpense += amt;
      if (tag) flows.reimbursableExpenses += amt;
    }
    if (accType === 'Bank' && sub && state.Bank[sub] !== undefined) state.Bank[sub] -= amt;
    else if (accType === 'Cash') state.Cash.cash_main = (state.Cash.cash_main || 0) - amt;
    else if (accType === 'Card' && sub && state.Card[sub] !== undefined) state.Card[sub] += amt;
  },

  async _getAnchor(metadataDB, transactionsDB, monthPrefix, userId) {
    const [y, m] = monthPrefix.split('-').map(Number);
    let pm = m - 1, py = y;
    if (pm === 0) { pm = 12; py -= 1; }
    const prevMonth = `${py}-${String(pm).padStart(2, '0')}`;

    try {
      const snap = await metadataDB.get(`finance:snapshot:${userId}:${prevMonth}`);
      return this._cloneState(snap.balances);
    } catch (_) {}

    const allSnaps = await metadataDB.allDocs({
      include_docs: true,
      startkey: `finance:snapshot:${userId}:`,
      endkey:   `finance:snapshot:${userId}:\uffff`
    });

    const snapshots = allSnaps.rows
      .map(r => r.doc)
      .filter(d => d.type === 'finance:snapshot' && d.month < monthPrefix)
      .sort((a, b) => b.month.localeCompare(a.month));

    if (snapshots.length === 0) {
      return await this._emptyState(metadataDB, userId);
    }

    const nearest = snapshots[0];

    if (nearest.month === prevMonth) {
      return this._cloneState(nearest.balances);
    }

    return await this._reconstructForward(transactionsDB, metadataDB, nearest, monthPrefix, userId);
  },

  async _reconstructForward(transactionsDB, metadataDB, fromSnapshot, toMonthPrefix, userId) {
    const config = await this._loadConfig(metadataDB, userId);
    const routes = await TransferEngine.getRoutes(metadataDB);
    let state    = this._cloneState(fromSnapshot.balances);

    let [cy, cm] = fromSnapshot.month.split('-').map(Number);

    while (true) {
      cm += 1;
      if (cm > 12) { cm = 1; cy += 1; }
      const current = `${cy}-${String(cm).padStart(2, '0')}`;
      if (current >= toMonthPrefix) break;

      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:${current}`,
        endkey:   `txn:${userId}:${current}\uffff`
      });

      result.rows.map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId)
        .forEach(txn => this._applyTxnToState(state, txn, config, routes));
    }

    return state;
  },

  async reconstructBalances(transactionsDB, metadataDB, monthPrefix, userId) {
    const flows = {
      grossIncome: 0, reimbursementsReceived: 0, netIncome: 0,
      grossExpense: 0, reimbursableExpenses: 0, netExpense: 0
    };

    try {
      const config = await this._loadConfig(metadataDB, userId);
      const routes = await TransferEngine.getRoutes(metadataDB);
      const state  = await this._getAnchor(metadataDB, transactionsDB, monthPrefix, userId);

      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:${monthPrefix}`,
        endkey:   `txn:${userId}:${monthPrefix}\uffff`
      });

      const docs = result.rows.map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId);

      docs.forEach(txn => this._applyTxnToState(state, txn, config, routes, flows));

      flows.netIncome  = flows.grossIncome;
      flows.netExpense = flows.grossExpense - flows.reimbursableExpenses;

      return {
        buckets:      this._flattenState(state),
        subaccounts:  state,
        arByTag:      { ...(state.AR || {}) },
        metrics:      flows,
        transactions: docs
      };

    } catch (err) {
      console.error('FinanceEngine.reconstructBalances error:', err);
      return { buckets: { Bank: 0, Card: 0, Cash: 0, AR: 0, Provisions: 0 }, subaccounts: {}, metrics: flows, transactions: [] };
    }
  },

  async getBankAccountBalances(transactionsDB, metadataDB, userId) {
    try {
      const now         = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const result      = await this.reconstructBalances(transactionsDB, metadataDB, monthPrefix, userId);
      const accounts    = await AccountEngine.getBankAccounts(metadataDB, userId);

      const accountList = accounts.map(acc => {
        const subId   = acc._id.split(':').pop();
        const balance = result.subaccounts?.Bank?.[subId] ?? 0;
        return { account: acc, balance, transactionCount: 0 };
      });

      const total = accountList.reduce((sum, b) => sum + b.balance, 0);
      return { accounts: accountList, total };

    } catch (err) {
      console.error('getBankAccountBalances error:', err);
      return { accounts: [], total: 0 };
    }
  },

  async getARByTag(transactionsDB, userId) {
    try {
      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });

      const arByTag = {};

      result.rows
        .map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId)
        .sort((a, b) => (a.date || a._id).localeCompare(b.date || b._id))
        .forEach(tx => {
          const tag       = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
          const isReceipt = tx.category === 'Reimbursement Received';

          if (!tag && !isReceipt) return;

          const effectiveTag = (tag || 'untagged').toString().toLowerCase().trim();
          const amt          = Math.abs(tx.amount || 0);

          if (isReceipt) {
            // Absolutely NO Math.max clamping allowed here
            arByTag[effectiveTag] = (arByTag[effectiveTag] || 0) - amt;
          } else {
            arByTag[effectiveTag] = (arByTag[effectiveTag] || 0) + amt;
          }
        });

      return Object.fromEntries(
        Object.entries(arByTag).filter(([, v]) => v > 0)
      );

    } catch (err) {
      console.error('FinanceEngine.getARByTag error:', err);
      return {};
    }
  },

  async saveSnapshot(metadataDB, userId, month, balances) {
    const id = `finance:snapshot:${userId}:${month}`;
    let doc  = { _id: id };
    try { doc = await metadataDB.get(id); } catch (_) {}
    doc.type     = 'finance:snapshot';
    doc.user_id  = userId;
    doc.month    = month;
    doc.balances = balances;
    doc.created  = doc.created || new Date().toISOString();
    doc.updated  = new Date().toISOString();
    await metadataDB.put(doc);
    return { ok: true };
  }
};

// ─────────────────────────────────────────────────────────────
// TemporalEngine
// ─────────────────────────────────────────────────────────────
export const TemporalEngine = {

  async getLedgerForMonth(transactionsDB, year, month, userId) {
    try {
      const mm     = String(month).padStart(2, '0');
      const prefix = `txn:${userId}:${year}-${mm}`;
      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: prefix,
        endkey:   prefix + '\uffff'
      });
      return result.rows.map(r => r.doc).filter(d => d.type === 'transaction');
    } catch (err) {
      console.error('TemporalEngine.getLedgerForMonth failed:', err);
      return [];
    }
  },

  async getAllMonths(transactionsDB, userId) {
    try {
      const result = await transactionsDB.allDocs({
        include_docs: false,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });
      const months = new Set();
      result.rows.forEach(r => {
        const parts = r.id.split(':');
        if (parts[2] && parts[2].length >= 7) months.add(parts[2].substring(0, 7));
      });
      return Array.from(months).sort();
    } catch (_) { return []; }
  }
};

// ─────────────────────────────────────────────────────────────
// AnalyticsEngine
// ─────────────────────────────────────────────────────────────
export const AnalyticsEngine = {

  async getMonthlyTrends(transactionsDB, metadataDB, userId) {
    try {
      const config = await FinanceEngine._loadConfig(metadataDB, userId);

      let doNotTrack = new Set();
      try {
        const analyticsConfig = await metadataDB.get('finance:config:analytics');
        doNotTrack = new Set(analyticsConfig.do_not_track || []);
      } catch (_) {}

      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });

      const txns = result.rows.map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId);

      const months = {};
      txns.forEach(txn => {
        const key = txn.date?.substring(0, 7);
        if (!key) return;

        const cat      = txn.category || 'Uncategorized';
        const amt      = Math.abs(txn.amount);
        const isIncome = config.income_categories?.includes(cat);

        if (doNotTrack.has(cat)) return;

        if (!months[key]) months[key] = {
          month: key, income: 0, expense: 0, investment: 0, net: 0, byCategory: {}
        };

        if (isIncome && cat !== 'Reimbursement Received') {
          months[key].income += amt;
        } else if (!isIncome && cat !== 'Reimbursement Received' && !txn.reimbursement_tag && !txn.is_reimbursable) {
          months[key].expense += amt;
          if (cat === 'Investment') months[key].investment += amt;
          months[key].byCategory[cat] = (months[key].byCategory[cat] || 0) + amt;
        }
      });

      Object.values(months).forEach(m => { m.net = m.income - m.expense; });
      return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));

    } catch (err) {
      console.error('AnalyticsEngine.getMonthlyTrends failed:', err);
      return [];
    }
  },

  async getCategoryTrend(transactionsDB, metadataDB, userId, category) {
    const trends = await this.getMonthlyTrends(transactionsDB, metadataDB, userId);
    return trends.map(m => ({ month: m.month, amount: m.byCategory[category] || 0 }));
  }
};

// ─────────────────────────────────────────────────────────────
// AccountEngine
// ─────────────────────────────────────────────────────────────
export const AccountEngine = {

  async getAccounts(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:account:${userId}:`,
        endkey:   `finance:account:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:account' && d.status !== 'closed');
    } catch (_) { return []; }
  },

  async getBankAccounts(metadataDB, userId) {
    const all = await this.getAccounts(metadataDB, userId);
    return all.filter(a => a.parent === 'Bank');
  },

  async getCards(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:card:${userId}:`,
        endkey:   `finance:card:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:card' && d.status !== 'closed');
    } catch (_) { return []; }
  },

  async getDefaultAccount(metadataDB, userId, parentType) {
    const accounts = await this.getAccounts(metadataDB, userId);
    return accounts.find(a => a.parent === parentType && a.is_default)
        || accounts.find(a => a.parent === parentType)
        || null;
  },

  async getDefaultCard(metadataDB, userId) {
    const cards = await this.getCards(metadataDB, userId);
    return cards.find(c => c.is_default) || cards[0] || null;
  },

  async addAccount(accountData, metadataDB, userId) {
    try {
      const subId = accountData.id || `bank_${Date.now()}`;
      const docId = `finance:account:${userId}:${subId}`;

      if (accountData.is_default) {
        const existing = await this.getAccounts(metadataDB, userId);
        for (const acc of existing) {
          if (acc.parent === (accountData.parent || 'Bank') && acc.is_default) {
            acc.is_default = false;
            await metadataDB.put(acc);
          }
        }
      }

      const newAcc = {
        _id:             docId,
        type:            'finance:account',
        user_id:         userId,
        name:            accountData.name,
        parent:          accountData.parent        || 'Bank',
        is_default:      !!accountData.is_default,
        status:          'active',
        bank_name:       accountData.bank_name      || '',
        account_number:  accountData.account_number || '',
        minimum_balance: accountData.minimum_balance || 0,
        notes:           accountData.notes           || '',
        created:         new Date().toISOString(),
        closed_date:     null
      };

      await metadataDB.put(newAcc);
      return { ok: true, account: newAcc };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  async updateAccount(accountId, updates, metadataDB, userId) {
    try {
      const docId = accountId.includes(':') ? accountId : `finance:account:${userId}:${accountId}`;
      const doc   = await metadataDB.get(docId);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };

      const updated = { ...doc, ...updates, updated: new Date().toISOString() };

      if (updates.is_default) {
        const existing = await this.getAccounts(metadataDB, userId);
        for (const acc of existing) {
          if (acc._id !== docId && acc.parent === updated.parent && acc.is_default) {
            acc.is_default = false;
            await metadataDB.put(acc);
          }
        }
      }

      await metadataDB.put(updated);
      return { ok: true, account: updated };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  async deleteAccount(accountId, metadataDB, userId) {
    try {
      const docId = accountId.includes(':') ? accountId : `finance:account:${userId}:${accountId}`;
      const doc   = await metadataDB.get(docId);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      doc.status      = 'closed';
      doc.closed_date = new Date().toISOString();
      doc.updated     = new Date().toISOString();
      await metadataDB.put(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  async addCard(cardData, metadataDB, userId) {
    try {
      const subId = cardData.id || `card_${Date.now()}`;
      const docId = `finance:card:${userId}:${subId}`;

      if (cardData.is_default) {
        const existing = await this.getCards(metadataDB, userId);
        for (const card of existing) {
          if (card.is_default) { card.is_default = false; await metadataDB.put(card); }
        }
      }

      const newCard = {
        _id:              docId,
        type:             'finance:card',
        user_id:          userId,
        name:             cardData.name,
        parent:           'Card',
        is_default:       !!cardData.is_default,
        status:           'active',
        limit:            cardData.limit            || 0,
        billing_day:      cardData.billing_day      || 20,
        due_day:          cardData.due_day          || 10,
        due_month_offset: cardData.due_month_offset || 1,
        notes:            cardData.notes            || '',
        created:          new Date().toISOString(),
        closed_date:      null
      };

      await metadataDB.put(newCard);
      return { ok: true, card: newCard };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  async deleteCard(cardId, metadataDB, userId) {
    try {
      const docId = cardId.includes(':') ? cardId : `finance:card:${userId}:${cardId}`;
      const doc   = await metadataDB.get(docId);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      doc.status      = 'closed';
      doc.closed_date = new Date().toISOString();
      doc.updated     = new Date().toISOString();
      await metadataDB.put(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  }
};