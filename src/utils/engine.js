// src/utils/engine.js
import { localDateStr } from './localDate';
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

  obligationRules: [
    {
      category_name: 'Loan Drawdown',
      keywords: [
        'loan drawdown',
        'loan disbursal',
        'loan disbursement',
        'loan disbursed',
        'loan credited'
      ]
    },
    {
      category_name: 'Loan Payment',
      keywords: [
        'loan repayment',
        'loan payment',
        'loan emi',
        'emi debit',
        'emi repayment'
      ]
    },
    {
      category_name: 'EMI Payment',
      keywords: [
        'emi payment',
        'consumer emi',
        'card emi'
      ]
    }
  ],

  _slug(categoryName) {
    return categoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  },

  _defaultRuleId(userId, categoryName) {
    return `finance:rule:${userId}:${this._slug(categoryName)}`;
  },

  async ensureObligationRules(metadataDB, userId) {
    if (!metadataDB || !userId) return { ok: false };

    try {
      for (const rule of this.obligationRules) {
        const ruleId = this._defaultRuleId(userId, rule.category_name);
        try {
          const existing = await metadataDB.get(ruleId);
          const mergedKeywords = [...new Set([...(existing.keywords || []), ...rule.keywords])];
          if (mergedKeywords.length !== (existing.keywords || []).length) {
            await metadataDB.put({
              ...existing,
              keywords: mergedKeywords,
              is_active: existing.is_active !== false,
              updated: new Date().toISOString()
            });
          }
        } catch (err) {
          if (err.name !== 'not_found') throw err;
          await metadataDB.put({
            _id:           ruleId,
            type:          'finance:rule',
            user_id:       userId,
            category_name: rule.category_name,
            keywords:      rule.keywords,
            is_active:     true,
            is_system:     true,
            created:       new Date().toISOString(),
            updated:       new Date().toISOString()
          });
        }
      }
      return { ok: true };
    } catch (err) {
      console.error('CategorizationEngine.ensureObligationRules failed:', err);
      return { ok: false, error: err.message };
    }
  },

  async autoTag(rawDescription, metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:rule:${userId}:`,
        endkey:   `finance:rule:${userId}:\uffff`
      });

      const rules = result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:rule' && d.is_active);
      const allRules = [...rules, ...this.obligationRules];

      let phrases = [];
      allRules.forEach(rule => {
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
      const slug    = this._slug(targetCategory);
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
    const slug   = this._slug(categoryName);
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
    const slug   = this._slug(categoryName);
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
    const slug   = this._slug(categoryName);
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
        const oldestKey = sortedKeys[0] || this.getDueDateBucket(localDateStr(), card);
        if (!buckets[oldestKey]) buckets[oldestKey] = { due_date: oldestKey, total: 0, paid: 0, transactions: [] };
        buckets[oldestKey].total += openingDebt;
        if (!sortedKeys.includes(oldestKey)) sortedKeys.push(oldestKey);
        sortedKeys = sortedKeys.sort();
      }

      const payments = allDocs
        .filter(d => d.category === 'Credit Card Payment' && this._isThisCard(d, card))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // First pass — date-aware allocation: a payment settles buckets
      // due on or after the payment date. Anything it can't place is
      // held back in the credit pool rather than discarded.
      let creditPool = 0;
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
        creditPool += rem;
      });

      // Second pass — the pooled overflow pays down any still-open
      // bucket oldest-first, so a late payment still clears its overdue
      // cycle instead of leaving debt and a credit showing at once.
      // Whatever survives is genuine prepayment: money paid beyond all
      // billed debt, surfaced as a positive credit balance.
      for (const key of sortedKeys) {
        if (creditPool <= 0) break;
        const b   = buckets[key];
        const due = b.total - b.paid;
        if (due <= 0) continue;
        const apply = Math.min(creditPool, due);
        b.paid     += apply;
        creditPool -= apply;
      }
      const creditBalance = creditPool;

      const today        = localDateStr();
      const finalBuckets = sortedKeys.map(key => {
        const b           = buckets[key];
        const outstanding = Math.max(0, b.total - b.paid);
        const status      = outstanding <= 0 ? 'paid' : key < today ? 'overdue' : 'outstanding';
        return { ...b, outstanding, status };
      });

      return { card, buckets: finalBuckets, creditBalance };

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

    if (cat === 'Loan Drawdown') {
      if (accType === 'Bank' && sub && state.Bank[sub] !== undefined) state.Bank[sub] += amt;
      else if (accType === 'Cash') state.Cash.cash_main = (state.Cash.cash_main || 0) + amt;
      return;
    }

    if (cat === 'Loan Payment') {
      if (accType === 'Bank' && sub && state.Bank[sub] !== undefined) state.Bank[sub] -= amt;
      else if (accType === 'Cash') state.Cash.cash_main = (state.Cash.cash_main || 0) - amt;
      else if (accType === 'Card' && sub && state.Card[sub] !== undefined) state.Card[sub] += amt;
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

  _isObligationTxn(txn) {
    return txn?.category === 'Loan Drawdown'
      || txn?.category === 'Loan Payment'
      || txn?.category === 'EMI Payment'
      || !!txn?.loan_id
      || !!txn?.emi_id;
  },

  _isExternalLoanPayment(txn) {
    return txn?.category === 'Loan Payment'
      && txn?.loan_id
      && (txn.account_type === 'External' || txn.sub_account === 'external');
  },

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
        if (this._isObligationTxn(txn)) return;
        if (this._isExternalLoanPayment(txn)) return;

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

// ─────────────────────────────────────────────────────────────
// ObligationsEngine
//
// Manages three obligation types stored in metadata_vault:
//
//  1. Recurring expenses  finance:recurring:userId:id
//     Declared repeating bills (Spotify, WiFi, etc.)
//     Verified against the transaction ledger each cycle.
//
//  2. Loans               finance:loan:userId:id
//     Full loan lifecycle — moratorium phase (drawdowns,
//     interest accrual, third-party payments) through to
//     repayment phase (EMI with principal/interest split).
//     Supports floating rates via rate_history log.
//
//  3. EMI purchases        finance:emi:userId:id
//     Consumer instalment purchases (phone, laptop, etc.)
//     Fixed schedule from a single purchase event.
//     Simpler than loans — no drawdowns, no rate changes.
//
// Transaction tagging:
//   Loan drawdowns: { loan_id, category: 'Loan Drawdown' }
//   Loan payments:  { loan_id, category: 'Loan Payment',
//                     principal_component, interest_component,
//                     paid_by }
//   EMI payments:   { emi_id, category: 'EMI Payment' }
//
// Document ID conventions (match engine.js namespace):
//   finance:recurring:userId:slug
//   finance:loan:userId:loanId
//   finance:emi:userId:emiId
// ─────────────────────────────────────────────────────────────

export const ObligationsEngine = {

  // ═══════════════════════════════════════════════════════════
  // SECTION 1 — RECURRING EXPENSES
  // ═══════════════════════════════════════════════════════════

  // ── getRecurring ──────────────────────────────────────────
  // Returns all active recurring expense declarations for a user.
  async getRecurring(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:recurring:${userId}:`,
        endkey:   `finance:recurring:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:recurring' && d.active !== false);
    } catch (_) { return []; }
  },

  // ── addRecurring ──────────────────────────────────────────
  // Declares a new recurring expense.
  //
  // data shape:
  //   name              string   — display name (e.g. "Netflix")
  //   amount            number   — expected amount in ₹
  //   tolerance         number   — fraction tolerance, default 0.10
  //   frequency         string   — 'daily'|'weekly'|'fortnightly'|
  //                                'monthly'|'quarterly'|
  //                                'bi-annual'|'annual'
  //   frequency_interval number  — e.g. 2 for "every 2 months"
  //   start_date        string   — YYYY-MM-DD anchor for cycle calc
  //   day_of_cycle      number   — day within cycle when due
  //   category          string   — must match ledger category
  //   account           string   — sub_account value in ledger
  //   match_by          string   — 'category+account'|'description'
  //   keywords          string[] — used when match_by='description'
  //   notes             string
  async addRecurring(data, metadataDB, userId) {
    try {
      const slug = (data.name || `r${Date.now()}`)
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      const id = `finance:recurring:${userId}:${slug}_${Date.now()}`;

      const doc = {
        _id:                id,
        type:               'finance:recurring',
        user_id:            userId,
        name:               data.name,
        amount:             Number(data.amount) || 0,
        tolerance:          data.tolerance          ?? 0.10,
        frequency:          data.frequency          || 'monthly',
        frequency_interval: data.frequency_interval || 1,
        start_date:         data.start_date         || localDateStr(),
        day_of_cycle:       data.day_of_cycle        || 1,
        category:           data.category           || 'Uncategorized',
        account:            data.account            || '',
        match_by:           data.match_by           || 'category+account',
        keywords:           data.keywords           || [],
        active:             true,
        notes:              data.notes              || '',
        created:            new Date().toISOString(),
        updated:            new Date().toISOString()
      };

      await metadataDB.put(doc);
      return { ok: true, id, doc };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── updateRecurring ───────────────────────────────────────
  async updateRecurring(id, updates, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      const updated = { ...doc, ...updates, updated: new Date().toISOString() };
      await metadataDB.put(updated);
      return { ok: true, doc: updated };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── deleteRecurring ───────────────────────────────────────
  // Soft-deletes by setting active: false (preserves history).
  async deleteRecurring(id, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      doc.active  = false;
      doc.updated = new Date().toISOString();
      await metadataDB.put(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── getCurrentCycleWindow ─────────────────────────────────
  // Given a recurring item, returns the current cycle's
  // { cycleStart, cycleEnd, dueDate } relative to today.
  //
  // Algorithm:
  //   1. Convert frequency + interval to days per cycle.
  //   2. Count cycles elapsed since start_date.
  //   3. Current cycle = floor(elapsed / cycleDays) * cycleDays.
  //   4. Due date = cycleStart + day_of_cycle - 1.
  //
  // For calendar-aligned frequencies (monthly, quarterly,
  // bi-annual, annual) we use calendar arithmetic rather than
  // fixed-day counts to handle month-length variance.
  getCurrentCycleWindow(recurring) {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const start    = new Date(recurring.start_date);
    start.setHours(0, 0, 0, 0);
    const freq     = recurring.frequency          || 'monthly';
    const interval = recurring.frequency_interval || 1;
    const dueDay   = recurring.day_of_cycle        || 1;

    // Calendar-aligned frequencies — use month arithmetic
    const calendarAligned = ['monthly', 'quarterly', 'bi-annual', 'annual'];
    if (calendarAligned.includes(freq)) {
      const monthsPerCycle = {
        monthly:   1,
        quarterly: 3,
        'bi-annual': 6,
        annual:    12
      }[freq] * interval;

      // Find how many complete cycles have elapsed
      const totalMonthsElapsed =
        (today.getFullYear() - start.getFullYear()) * 12
        + (today.getMonth() - start.getMonth());

      const cycleNumber      = Math.floor(totalMonthsElapsed / monthsPerCycle);
      const cycleStartMonth  = cycleNumber * monthsPerCycle;

      const cycleStart = new Date(start);
      cycleStart.setMonth(cycleStart.getMonth() + cycleStartMonth);
      cycleStart.setDate(1);

      const cycleEnd = new Date(cycleStart);
      cycleEnd.setMonth(cycleEnd.getMonth() + monthsPerCycle);
      cycleEnd.setDate(0); // last day of previous month

      // Due date = day_of_cycle within the cycle's month
      const dueDate = new Date(cycleStart);
      const maxDay  = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
      dueDate.setDate(Math.min(dueDay, maxDay));

      return {
        cycleStart: localDateStr(cycleStart),
        cycleEnd:   localDateStr(cycleEnd),
        dueDate:    localDateStr(dueDate),
      };
    }

    // Fixed-day frequencies — use day arithmetic
    const daysPerCycle = {
      daily:       1,
      weekly:      7,
      fortnightly: 14,
    }[freq] * interval;

    const daysSinceStart = Math.floor((today - start) / 86400000);
    const cycleNumber    = Math.floor(daysSinceStart / daysPerCycle);

    const cycleStartMs = start.getTime() + cycleNumber * daysPerCycle * 86400000;
    const cycleEndMs   = cycleStartMs + daysPerCycle * 86400000 - 1;

    const cycleStart = new Date(cycleStartMs);
    const cycleEnd   = new Date(cycleEndMs);
    const dueDate    = new Date(cycleStartMs + (Math.min(dueDay, daysPerCycle) - 1) * 86400000);

    return {
      cycleStart: localDateStr(cycleStart),
      cycleEnd:   localDateStr(cycleEnd),
      dueDate:    localDateStr(dueDate),
    };
  },

  // ── checkRecurringStatus ──────────────────────────────────
  // For each active recurring item, checks whether a matching
  // transaction exists in the current cycle window.
  //
  // Returns array of:
  //   { item, status, matchedTx, cycleStart, cycleEnd,
  //     dueDate, daysUntilDue, daysOverdue }
  //
  // Status values:
  //   'paid'    — matching transaction found in current cycle
  //   'pending' — due date not yet passed
  //   'overdue' — due date passed, no match found
  async checkRecurringStatus(metadataDB, transactionsDB, userId) {
    try {
      const recurring = await this.getRecurring(metadataDB, userId);
      if (!recurring.length) return [];

      const today = localDateStr();
      const [accounts, cards] = await Promise.all([
        AccountEngine.getAccounts(metadataDB, userId),
        AccountEngine.getCards(metadataDB, userId)
      ]);

      // Load all transactions in one pass — avoid per-item queries
      const allTxnsResult = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });
      const allTxns = allTxnsResult.rows.map(r => r.doc)
        .filter(d => d.type === 'transaction' && d.user_id === userId
                  && !d.loan_id && !d.emi_id); // exclude tagged obligation txns

      return recurring.map(item => {
        const window = this.getCurrentCycleWindow(item);
        const { cycleStart, cycleEnd, dueDate } = window;

        // Filter transactions to current cycle window
        const cycleTxns = allTxns.filter(tx => {
          const txDate = tx.date || tx._id.split(':')[2] || '';
          return txDate >= cycleStart && txDate <= cycleEnd;
        });

        // Match transactions against this recurring item
        const matchedTx = this._findMatchingTransaction(item, cycleTxns, accounts, cards);

        // Calculate status
        let status;
        if (matchedTx) {
          status = 'paid';
        } else if (today <= dueDate) {
          status = 'pending';
        } else {
          status = 'overdue';
        }

        const dueDateObj  = new Date(dueDate);
        const todayObj    = new Date(today);
        const diffMs      = dueDateObj - todayObj;
        const diffDays    = Math.ceil(diffMs / 86400000);

        return {
          item,
          status,
          matchedTx:    matchedTx || null,
          cycleStart,
          cycleEnd,
          dueDate,
          daysUntilDue: diffDays > 0 ? diffDays : 0,
          daysOverdue:  diffDays < 0 ? Math.abs(diffDays) : 0,
        };
      });

    } catch (err) {
      console.error('ObligationsEngine.checkRecurringStatus error:', err);
      return [];
    }
  },

  // ── _findMatchingTransaction (private) ────────────────────
  // Finds the best-matching transaction for a recurring item
  // within a set of candidate transactions.
  //
  // Matching priority:
  //   1. category + account + amount within tolerance
  //   2. description keywords (if match_by = 'description')
  //   3. If multiple matches, pick closest amount to declared
  _accountAliases(accountRef, accounts = [], cards = []) {
    const raw = (accountRef || '').toString().trim();
    if (!raw) return new Set();

    const lowerRaw = raw.toLowerCase();
    const aliases = new Set([raw, lowerRaw]);
    [...accounts, ...cards].forEach(account => {
      const subId = account._id?.split(':').pop();
      const name = account.name || '';
      if (
        raw === account._id ||
        raw === subId ||
        lowerRaw === name.toLowerCase()
      ) {
        [account._id, subId, name, name.toLowerCase()].filter(Boolean).forEach(a => aliases.add(a));
      }
    });

    return aliases;
  },

  _accountMatches(itemAccount, tx, accounts = [], cards = []) {
    if (!itemAccount) return true;
    const aliases = this._accountAliases(itemAccount, accounts, cards);
    const txnAliases = this._accountAliases(tx.sub_account || '', accounts, cards);
    if (tx.account_type) txnAliases.add(tx.account_type);

    return [...aliases].some(alias => txnAliases.has(alias));
  },

  _findMatchingTransaction(item, txns, accounts = [], cards = []) {
    const expectedAmt = item.amount;
    const tolerance   = item.tolerance ?? 0.10;
    const minAmt      = expectedAmt * (1 - tolerance);
    const maxAmt      = expectedAmt * (1 + tolerance);

    let candidates = [];

    if (item.match_by === 'description' && item.keywords?.length) {
      const kws = item.keywords.map(k => k.toLowerCase());
      candidates = txns.filter(tx => {
        const desc = (tx.description || '').toLowerCase();
        return kws.some(k => desc.includes(k))
          && Math.abs(tx.amount) >= minAmt
          && Math.abs(tx.amount) <= maxAmt;
      });
    } else {
      // category + account match (default)
      candidates = txns.filter(tx => {
        const amtMatch      = Math.abs(tx.amount) >= minAmt && Math.abs(tx.amount) <= maxAmt;
        const categoryMatch = tx.category === item.category;
        const accountMatch  = this._accountMatches(item.account, tx, accounts, cards);
        return amtMatch && categoryMatch && accountMatch;
      });
    }

    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];

    // Multiple candidates — return closest amount match
    return candidates.reduce((best, tx) =>
      Math.abs(Math.abs(tx.amount) - expectedAmt) <
      Math.abs(Math.abs(best.amount) - expectedAmt) ? tx : best
    );
  },


  // ═══════════════════════════════════════════════════════════
  // SECTION 2 — LOANS
  // ═══════════════════════════════════════════════════════════

  // ── getLoans ──────────────────────────────────────────────
  async getLoans(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:loan:${userId}:`,
        endkey:   `finance:loan:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:loan' && d.status !== 'closed');
    } catch (_) { return []; }
  },

  // ── addLoan ───────────────────────────────────────────────
  // data shape:
  //   name               string   — "SBI Education Loan"
  //   loan_type          string   — 'education'|'home'|'personal'|
  //                                 'vehicle'|'other'
  //   sanctioned_amount  number   — total sanctioned
  //   disbursed_amount   number   — drawn so far (0 if not started)
  //   interest_rate      number   — current rate (percentage p.a.)
  //   rate_type          string   — 'fixed'|'floating'
  //   phase              string   — 'moratorium'|'repayment'
  //   moratorium_end     string   — YYYY-MM-DD when repayment starts
  //   emi                number   — 0 during moratorium
  //   tenure_months      number   — repayment duration used for EMI planning
  //   emi_day            number   — day of month EMI is due
  //   payment_sources    array    — external payers
  //   debit_account      string   — account drawdowns credit to
  //   emi_account        string   — account EMI debits from
  //   start_date         string   — loan start date
  async addLoan(data, metadataDB, userId) {
    try {
      const loanId = `loan_${Date.now()}`;
      const id     = `finance:loan:${userId}:${loanId}`;

      const doc = {
        _id:               id,
        type:              'finance:loan',
        user_id:           userId,
        name:              data.name,
        loan_type:         data.loan_type          || 'other',
        sanctioned_amount: Number(data.sanctioned_amount) || 0,
        disbursed_amount:  Number(data.disbursed_amount)  || 0,
        interest_rate:     Number(data.interest_rate)     || 0,
        rate_type:         data.rate_type          || 'floating',
        rate_history:      [{
          date: data.start_date || localDateStr(),
          rate: Number(data.interest_rate) || 0
        }],
        phase:             data.phase              || 'moratorium',
        moratorium_end:    data.moratorium_end     || null,
        emi:               Number(data.emi)         || 0,
        tenure_months:     Number(data.tenure_months) || null,
        emi_day:           data.emi_day            || 5,
        payment_sources:   data.payment_sources    || [],
        debit_account:     data.debit_account      || '',
        emi_account:       data.emi_account        || null,
        start_date:        data.start_date         || localDateStr(),
        expected_end_date: data.expected_end_date  || null,
        status:            'active',
        notes:             data.notes              || '',
        created:           new Date().toISOString(),
        updated:           new Date().toISOString()
      };

      await metadataDB.put(doc);
      return { ok: true, id, doc };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── updateLoan ────────────────────────────────────────────
  async updateLoan(id, updates, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };

      // If rate is being updated, append to rate_history
      if (updates.interest_rate !== undefined && updates.interest_rate !== doc.interest_rate) {
        const effectiveDate = updates.rate_effective_date
          || localDateStr();
        const history = [...(doc.rate_history || []), {
          date: effectiveDate,
          rate: Number(updates.interest_rate)
        }];
        updates.rate_history = history;
        delete updates.rate_effective_date;
      }

      const updated = { ...doc, ...updates, updated: new Date().toISOString() };
      await metadataDB.put(updated);
      return { ok: true, doc: updated };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── updateLoanRate ────────────────────────────────────────
  // Convenience method — rate change with explicit effective date.
  async updateLoanRate(loanId, newRate, effectiveDate, metadataDB, userId) {
    return this.updateLoan(loanId, {
      interest_rate:        newRate,
      rate_effective_date:  effectiveDate
    }, metadataDB, userId);
  },

  calculateLoanEmi(principal, annualRate, tenureMonths) {
    const p = Math.max(0, Number(principal) || 0);
    const n = Math.max(0, Number(tenureMonths) || 0);
    const r = (Number(annualRate) || 0) / 100 / 12;
    if (p <= 0 || n <= 0) return 0;
    if (r <= 0) return p / n;
    const factor = Math.pow(1 + r, n);
    return (p * r * factor) / (factor - 1);
  },

  _monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  },

  _formatDateOnly(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  _dateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  },

  _effectiveLoanPhase(loan, asOfDate = null) {
    const storedPhase = loan?.phase || 'moratorium';
    if (storedPhase !== 'moratorium') return storedPhase;

    const moratoriumEnd = this._dateOnly(loan?.moratorium_end);
    if (!moratoriumEnd) return storedPhase;

    const asOf = this._dateOnly(asOfDate) || new Date();
    return asOf >= moratoriumEnd ? 'repayment' : 'moratorium';
  },

  _addMonths(date, count = 1) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + count);
    return next;
  },

  _rateForDate(loan, date) {
    const target = this._dateOnly(date) || new Date();
    const history = (loan.rate_history || [])
      .map(entry => ({ date: this._dateOnly(entry.date), rate: Number(entry.rate) || 0 }))
      .filter(entry => entry.date)
      .sort((a, b) => a.date - b.date);

    let rate = Number(loan.interest_rate) || 0;
    for (const entry of history) {
      if (entry.date <= target) rate = entry.rate;
      else break;
    }
    return rate;
  },

  // ── deleteLoan ────────────────────────────────────────────
  async deleteLoan(id, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      doc.status  = 'closed';
      doc.updated = new Date().toISOString();
      await metadataDB.put(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── recordDrawdown ────────────────────────────────────────
  // Logs a loan drawdown as a transaction (money IN to your account)
  // and updates the loan's disbursed_amount.
  async recordDrawdown(loanId, amount, date, description, transactionsDB, metadataDB, userId) {
    try {
      const loan   = await metadataDB.get(loanId);
      if (loan.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      const absAmount = Math.abs(Number(amount) || 0);

      const txnId = `txn:${userId}:${date}:drawdown_${Date.now()}`;
      await transactionsDB.put({
        _id:          txnId,
        type:         'transaction',
        user_id:      userId,
        date,
        amount:       Math.abs(amount),   // positive — money coming in
        description:  description || `${loan.name} — Drawdown`,
        category:     'Loan Drawdown',
        account_type: 'Bank',
        sub_account:  loan.debit_account,
        loan_id:      loanId,
        created:      new Date().toISOString()
      });

      // Update disbursed_amount on the loan document
      let priorDrawdownTotal = 0;
      try {
        const result = await transactionsDB.allDocs({
          include_docs: true,
          startkey: `txn:${userId}:`,
          endkey:   `txn:${userId}:\uffff`
        });
        priorDrawdownTotal = result.rows.map(r => r.doc)
          .filter(d =>
            d.type === 'transaction' &&
            d.user_id === userId &&
            d.loan_id === loanId &&
            d.category === 'Loan Drawdown' &&
            d._id !== txnId
          )
          .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      } catch {
        priorDrawdownTotal = 0;
      }

      const declaredDrawn = Math.max(0, Number(loan.disbursed_amount) || 0);
      const startDate = this._dateOnly(loan.start_date || loan.created);
      const drawdownDate = this._dateOnly(date);
      const looksLikeOpeningDrawdown =
        priorDrawdownTotal <= 0 &&
        declaredDrawn > 0 &&
        absAmount <= declaredDrawn &&
        (!startDate || !drawdownDate || drawdownDate <= startDate);

      if (!looksLikeOpeningDrawdown) {
        loan.disbursed_amount = declaredDrawn + absAmount;
      }
      loan.updated          = new Date().toISOString();
      await metadataDB.put(loan);

      return { ok: true, txnId, disbursedAmountUpdated: !looksLikeOpeningDrawdown };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── recordPayment ─────────────────────────────────────────
  // Logs a loan payment as a transaction.
  // For moratorium phase: all goes to interest (or capitalises).
  // For repayment phase: split provided by caller or calculated.
  //
  // If principal_component + interest_component are not provided,
  // the engine calculates the split from current outstanding + rate.
  async recordPayment(loanId, amount, date, paidBy, transactionsDB, metadataDB, userId, components = null, accountOverride = null) {
    try {
      const loan    = await metadataDB.get(loanId);
      if (loan.user_id !== userId) return { ok: false, error: 'Unauthorised' };

      let principalComponent = 0;
      let interestComponent  = Math.abs(amount);

      if (components) {
        principalComponent = components.principal || 0;
        interestComponent  = components.interest  || 0;
      } else if (this._effectiveLoanPhase(loan, date) === 'repayment' && loan.emi > 0) {
        const balance = await this.getLoanBalance(loan, transactionsDB, userId, date);
        interestComponent = Math.min(Math.abs(amount), Math.max(0, balance.outstandingInterest || balance.nextInterestDue || 0));
        principalComponent = Math.max(0, Math.abs(amount) - interestComponent);
      }

      const account = paidBy === userId
        ? accountOverride || loan.emi_account || loan.debit_account
        : null; // external payer — no sub_account

      const txnId = `txn:${userId}:${date}:loanpmt_${Date.now()}`;
      await transactionsDB.put({
        _id:                  txnId,
        type:                 'transaction',
        user_id:              userId,
        date,
        amount:               -Math.abs(amount),  // negative — money going out
        description:          `${loan.name} — Payment`,
        category:             'Loan Payment',
        account_type:         account ? 'Bank' : 'External',
        sub_account:          account || 'external',
        loan_id:              loanId,
        paid_by:              paidBy || userId,
        principal_component:  principalComponent,
        interest_component:   interestComponent,
        created:              new Date().toISOString()
      });

      return { ok: true, txnId, principalComponent, interestComponent };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── getLoanBalance ────────────────────────────────────────
  // Calculates the current outstanding balance from tagged transactions.
  // Handles rate changes by applying the correct rate to each period.
  //
  // Returns:
  //   outstanding         — current principal owed
  //   totalDrawn          — sum of all drawdowns
  //   totalPaid           — sum of all payments made
  //   principalPaid       — principal component paid to date
  //   interestPaid        — interest component paid to date
  //   capitalizedInterest — interest added to principal (shortfall)
  //   nextInterestDue     — projected interest for current month
  //   nextDueDate         — date of next scheduled payment
  //   phase               — current phase
  async getLoanBalance(loan, transactionsDB, userId, asOfDate = null) {
    try {
      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });

      const asOf = this._dateOnly(asOfDate) || new Date();
      const effectivePhase = this._effectiveLoanPhase(loan, asOf);
      const loanTxns = result.rows.map(r => r.doc)
        .filter(d =>
          d.type === 'transaction' &&
          d.user_id === userId &&
          d.loan_id === loan._id &&
          (!d.date || this._dateOnly(d.date) <= asOf)
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const drawdowns = loanTxns.filter(t => t.category === 'Loan Drawdown');
      const payments  = loanTxns.filter(t => t.category === 'Loan Payment');

      const totalDrawn    = drawdowns.reduce((s, t) => s + Math.abs(t.amount), 0);
      const totalPaid     = payments.reduce((s, t)  => s + Math.abs(t.amount), 0);
      const declaredDrawn = Number(loan.disbursed_amount || 0);
      const openingPrincipal = Math.max(0, declaredDrawn - totalDrawn);
      let balance = openingPrincipal;
      let outstandingInterest = 0;
      let accruedInterest = 0;
      let interestPaid = 0;
      let principalPaid = 0;

      const startDate = this._dateOnly(loan.start_date)
        || this._dateOnly(loan.created)
        || (loanTxns[0] ? this._dateOnly(loanTxns[0].date) : null)
        || asOf;

      const events = [
        ...drawdowns.map(txn => ({ type: 'drawdown', date: this._dateOnly(txn.date), amount: Math.abs(Number(txn.amount) || 0) })),
        ...payments.map(txn => ({
          type: 'payment',
          date: this._dateOnly(txn.date),
          amount: Math.abs(Number(txn.amount) || 0),
          principalComponent: txn.principal_component !== undefined && txn.principal_component !== null
            ? Math.max(0, Number(txn.principal_component) || 0)
            : null,
          interestComponent: txn.interest_component !== undefined && txn.interest_component !== null
            ? Math.max(0, Number(txn.interest_component) || 0)
            : null
        }))
      ].filter(event => event.date && event.date <= asOf);

      for (let accrualDate = this._addMonths(startDate, 1); accrualDate <= asOf; accrualDate = this._addMonths(accrualDate, 1)) {
        events.push({ type: 'accrual', date: new Date(accrualDate), amount: 0 });
      }

      events.sort((a, b) => {
        const diff = a.date - b.date;
        if (diff !== 0) return diff;
        const order = { drawdown: 0, accrual: 1, payment: 2 };
        return order[a.type] - order[b.type];
      });

      for (const event of events) {
        if (event.type === 'drawdown') {
          balance += event.amount;
          continue;
        }

        if (event.type === 'accrual') {
          if (balance <= 0) continue;
          const monthlyRate = this._rateForDate(loan, event.date) / 100 / 12;
          const interest = balance * monthlyRate;
          accruedInterest += interest;
          outstandingInterest += interest;
          balance += interest;
          continue;
        }

        if (event.type === 'payment') {
          const payment = Math.min(event.amount, balance);
          let interestComponent = Math.min(payment, outstandingInterest);
          let principalComponent = Math.max(0, payment - interestComponent);

          if (event.principalComponent !== null || event.interestComponent !== null) {
            const explicitInterest = event.interestComponent ?? Math.max(0, payment - (event.principalComponent || 0));
            interestComponent = Math.min(payment, explicitInterest);
            principalComponent = Math.min(
              Math.max(0, payment - interestComponent),
              event.principalComponent ?? Math.max(0, payment - interestComponent)
            );
          }

          outstandingInterest = Math.max(0, outstandingInterest - interestComponent);
          interestPaid += interestComponent;
          principalPaid += principalComponent;
          balance = Math.max(0, balance - payment);
        }
      }

      const currentMonthlyRate = this._rateForDate(loan, asOf) / 100 / 12;
      const nextInterestDue = balance * currentMonthlyRate;

      // Next due date is only a repayment-cycle EMI date. During moratorium,
      // show the moratorium end date as the next milestone instead.
      let nextDueDate = loan.moratorium_end || null;
      if (effectivePhase === 'repayment') {
        const basisDate = this._dateOnly(asOf) || new Date();
        let nextDue = new Date(basisDate.getFullYear(), basisDate.getMonth(), loan.emi_day || 5);
        if (nextDue < basisDate) nextDue = new Date(basisDate.getFullYear(), basisDate.getMonth() + 1, loan.emi_day || 5);
        nextDueDate = this._formatDateOnly(nextDue);
      }

      return {
        outstanding:          balance,
        totalDrawn,
        totalPaid,
        principalPaid,
        interestPaid,
        accruedInterest,
        outstandingInterest,
        capitalizedInterest:  outstandingInterest,
        nextInterestDue,
        nextDueDate,
        phase:               effectivePhase,
        storedPhase:         loan.phase || 'moratorium',
        transactionCount:    loanTxns.length
      };

    } catch (err) {
      console.error('ObligationsEngine.getLoanBalance error:', err);
      return { outstanding: loan.disbursed_amount || 0, totalDrawn: 0, totalPaid: 0,
               principalPaid: 0, interestPaid: 0, nextInterestDue: 0,
               nextDueDate: null, phase: loan.phase || 'moratorium', transactionCount: 0 };
    }
  },

  // ── getLoanProjection ─────────────────────────────────────
  // Projects the full repayment schedule from a given outstanding
  // balance. Used for displaying payoff date and total interest.
  //
  // Returns:
  //   schedule[]    — array of { month, emi, principal, interest, balance }
  //   payoffDate    — projected YYYY-MM when loan is fully paid
  //   totalRemInterest   — total interest remaining
  //   totalRemPrincipal  — total principal remaining
  getLoanProjection(loan, currentOutstanding) {
    const effectivePhase = this._effectiveLoanPhase(loan);
    if (!loan.emi || loan.emi <= 0 || effectivePhase !== 'repayment') {
      // Moratorium phase — can't project without EMI
      return { schedule: [], payoffDate: null, totalRemInterest: 0, totalRemPrincipal: currentOutstanding, unpayable: false };
    }

    let   balance     = currentOutstanding;
    const schedule    = [];
    let   month       = new Date();
    let   iterations  = 0;
    const MAX_MONTHS  = 600; // 50 years hard cap

    while (balance > 0.01 && iterations < MAX_MONTHS) {
      const monthlyRate = this._rateForDate(loan, month) / 100 / 12;
      const interest  = balance * monthlyRate;
      if (monthlyRate > 0 && interest >= loan.emi) {
        return {
          schedule,
          payoffDate: null,
          totalRemInterest: schedule.reduce((s, r) => s + r.interest, 0),
          totalRemPrincipal: balance,
          unpayable: true,
          minimumEmi: interest + 0.01
        };
      }
      const principal = Math.min(Math.max(0, loan.emi - interest), balance);
      balance         = Math.max(0, balance + interest - loan.emi);

      const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      schedule.push({ month: monthStr, emi: loan.emi, principal, interest, balance, rate: this._rateForDate(loan, month) });

      month.setMonth(month.getMonth() + 1);
      iterations++;
    }

    const totalRemInterest  = schedule.reduce((s, r) => s + r.interest,  0);
    const totalRemPrincipal = schedule.reduce((s, r) => s + r.principal, 0);
    const payoffDate        = schedule.length > 0 ? schedule[schedule.length - 1].month : null;

    return { schedule, payoffDate, totalRemInterest, totalRemPrincipal, unpayable: false };
  },


  // ═══════════════════════════════════════════════════════════
  // SECTION 3 — EMI PURCHASES
  // ═══════════════════════════════════════════════════════════

  // ── getEMIs ───────────────────────────────────────────────
  async getEMIs(metadataDB, userId) {
    try {
      const result = await metadataDB.allDocs({
        include_docs: true,
        startkey: `finance:emi:${userId}:`,
        endkey:   `finance:emi:${userId}:\uffff`
      });
      return result.rows.map(r => r.doc)
        .filter(d => d.type === 'finance:emi' && d.status !== 'closed');
    } catch (_) { return []; }
  },

  // ── addEMI ────────────────────────────────────────────────
  // data shape:
  //   name             string  — "iPhone 15 Pro"
  //   total_amount     number  — full purchase price
  //   down_payment     number  — paid upfront (can be 0)
  //   financed_amount  number  — total_amount - down_payment
  //   emi_amount       number  — monthly instalment
  //   tenure_months    number  — total EMI count
  //   interest_rate    number  — 0 for no-cost EMI schemes
  //   rate_type        string  — always 'fixed' for consumer EMI
  //   account          string  — card/bank account EMI hits
  //   purchase_date    string  — YYYY-MM-DD
  //   first_emi_date   string  — YYYY-MM-DD
  //   category         string  — e.g. 'Electronics'
  async addEMI(data, metadataDB, userId) {
    try {
      const emiId = `emi_${Date.now()}`;
      const id    = `finance:emi:${userId}:${emiId}`;

      const financed = data.financed_amount !== undefined
        ? Number(data.financed_amount)
        : Number(data.total_amount || 0) - Number(data.down_payment || 0);

      const doc = {
        _id:             id,
        type:            'finance:emi',
        user_id:         userId,
        name:            data.name,
        total_amount:    Number(data.total_amount)  || 0,
        down_payment:    Number(data.down_payment)  || 0,
        financed_amount: financed,
        emi_amount:      Number(data.emi_amount)    || 0,
        tenure_months:   Number(data.tenure_months) || 12,
        months_paid:     0,
        interest_rate:   Number(data.interest_rate) || 0,
        rate_type:       'fixed',
        account:         data.account               || '',
        purchase_date:   data.purchase_date         || localDateStr(),
        first_emi_date:  data.first_emi_date        || null,
        category:        data.category              || 'Uncategorized',
        status:          'active',
        notes:           data.notes                 || '',
        created:         new Date().toISOString(),
        updated:         new Date().toISOString()
      };

      await metadataDB.put(doc);
      return { ok: true, id, doc };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── updateEMI ─────────────────────────────────────────────
  async updateEMI(id, updates, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      const updated = { ...doc, ...updates, updated: new Date().toISOString() };
      await metadataDB.put(updated);
      return { ok: true, doc: updated };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── deleteEMI ─────────────────────────────────────────────
  async deleteEMI(id, metadataDB, userId) {
    try {
      const doc = await metadataDB.get(id);
      if (doc.user_id !== userId) return { ok: false, error: 'Unauthorised' };
      doc.status  = 'closed';
      doc.updated = new Date().toISOString();
      await metadataDB.put(doc);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  // ── getEMIBalance ─────────────────────────────────────────
  // Derives months_paid from tagged transactions, calculates
  // remaining balance and projected payoff date.
  //
  // Returns:
  //   monthsPaid        — count of tagged EMI payments found
  //   monthsRemaining   — tenure - monthsPaid
  //   outstanding       — remaining financed amount
  //   nextDueDate       — date of next EMI
  //   payoffDate        — projected completion month
  //   percentComplete   — 0–100
  async recordEMIPayment(emiId, amount, date, transactionsDB, metadataDB, userId, components = null) {
    try {
      const emi = await metadataDB.get(emiId);
      if (emi.user_id !== userId) return { ok: false, error: 'Unauthorised' };

      const absAmount = Math.abs(Number(amount) || 0);
      const financedAmount = Math.max(0, Number(emi.financed_amount ?? (
        Number(emi.total_amount || 0) - Number(emi.down_payment || 0)
      )));
      const totalPayable = Math.max(
        Number(emi.emi_amount || 0) * Number(emi.tenure_months || 0),
        financedAmount,
        absAmount
      );
      const principalComponent = components?.principal !== undefined
        ? Number(components.principal) || 0
        : Math.min(financedAmount, totalPayable > 0 ? absAmount * (financedAmount / totalPayable) : absAmount);
      const interestComponent = components?.interest !== undefined
        ? Number(components.interest) || 0
        : Math.max(0, absAmount - principalComponent);

      const txnId = `txn:${userId}:${date}:emipmt_${Date.now()}`;
      await transactionsDB.put({
        _id:                 txnId,
        type:                'transaction',
        user_id:             userId,
        date,
        amount:              -absAmount,
        description:         `${emi.name} - EMI Payment`,
        category:            'EMI Payment',
        account_type:        emi.account_type || 'Bank',
        sub_account:         emi.account || '',
        emi_id:              emiId,
        principal_component: principalComponent,
        interest_component:  interestComponent,
        created:             new Date().toISOString()
      });

      return { ok: true, txnId, principalComponent, interestComponent };
    } catch (err) { return { ok: false, error: err.message }; }
  },

  async getEMIBalance(emi, transactionsDB, userId) {
    try {
      const result = await transactionsDB.allDocs({
        include_docs: true,
        startkey: `txn:${userId}:`,
        endkey:   `txn:${userId}:\uffff`
      });

      const emiTxns = result.rows.map(r => r.doc)
        .filter(d =>
          d.type === 'transaction' &&
          d.user_id === userId &&
          d.emi_id === emi._id &&
          d.category === 'EMI Payment'
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const tenureMonths   = Math.max(0, Number(emi.tenure_months || 0));
      const emiAmount      = Math.max(0, Number(emi.emi_amount || 0));
      const financedAmount = Math.max(0, Number(emi.financed_amount ?? (
        Number(emi.total_amount || 0) - Number(emi.down_payment || 0)
      )));
      const totalPayable   = Math.max(emiAmount * tenureMonths, financedAmount);
      const fallbackRatio  = totalPayable > 0 ? financedAmount / totalPayable : 1;

      const totalPaid = emiTxns.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
      const principalPaidRaw = emiTxns.reduce((s, t) => {
        if (t.principal_component !== undefined && t.principal_component !== null) {
          return s + Math.max(0, Number(t.principal_component) || 0);
        }
        return s + (Math.abs(Number(t.amount || 0)) * fallbackRatio);
      }, 0);
      const interestPaid = emiTxns.reduce((s, t) => {
        if (t.interest_component !== undefined && t.interest_component !== null) {
          return s + Math.max(0, Number(t.interest_component) || 0);
        }
        return s + Math.max(0, Math.abs(Number(t.amount || 0)) * (1 - fallbackRatio));
      }, 0);
      const principalPaid = Math.min(financedAmount, principalPaidRaw);
      const outstanding = Math.max(0, financedAmount - principalPaid);
      const monthsPaid = emiAmount > 0
        ? Math.min(tenureMonths, Math.floor((totalPaid + 0.01) / emiAmount))
        : Math.min(tenureMonths, emiTxns.length);
      const scheduledMonthsRemaining = Math.max(0, tenureMonths - monthsPaid);
      const principalPerMonth = tenureMonths > 0 ? financedAmount / tenureMonths : 0;
      const balanceMonthsRemaining = principalPerMonth > 0
        ? Math.ceil(outstanding / principalPerMonth)
        : scheduledMonthsRemaining;
      const monthsRemaining = Math.min(scheduledMonthsRemaining, balanceMonthsRemaining);

      // Next due date
      let nextDueDate = null;
      if (emi.first_emi_date && monthsRemaining > 0) {
        const first = new Date(emi.first_emi_date);
        first.setMonth(first.getMonth() + monthsPaid);
        nextDueDate = localDateStr(first);
      }

      // Payoff date
      let payoffDate = null;
      if (emi.first_emi_date) {
        const first = new Date(emi.first_emi_date);
        first.setMonth(first.getMonth() + tenureMonths - 1);
        payoffDate = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
      }

      const percentComplete = financedAmount > 0
        ? Math.min(100, Math.round(((financedAmount - outstanding) / financedAmount) * 100))
        : tenureMonths > 0
          ? Math.min(100, Math.round((monthsPaid / tenureMonths) * 100))
          : 0;
      const totalRemaining = Math.max(0, (emiAmount * monthsRemaining) - Math.max(0, totalPaid - (emiAmount * monthsPaid)));

      return {
        monthsPaid,
        monthsRemaining,
        outstanding,
        totalPaid,
        principalPaid,
        interestPaid,
        totalRemaining,
        nextDueDate,
        payoffDate,
        percentComplete,
        transactionCount: emiTxns.length
      };

    } catch (err) {
      console.error('ObligationsEngine.getEMIBalance error:', err);
      const monthsPaid = emi.months_paid || 0;
      const tenureMonths = Number(emi.tenure_months || 0);
      const financedAmount = Math.max(0, Number(emi.financed_amount ?? (
        Number(emi.total_amount || 0) - Number(emi.down_payment || 0)
      )));
      return {
        monthsPaid,
        monthsRemaining: Math.max(0, tenureMonths - monthsPaid),
        outstanding: financedAmount,
        totalPaid: 0,
        principalPaid: 0,
        interestPaid: 0,
        totalRemaining: Math.max(0, (tenureMonths - monthsPaid) * Number(emi.emi_amount || 0)),
        nextDueDate: null, payoffDate: null, percentComplete: 0, transactionCount: 0
      };
    }
  },

  // ── getSummary ────────────────────────────────────────────
  // Convenience method called by useFinanceData.
  // Returns everything needed for ObligationsSlide in one call.
  //
  // Returns:
  //   recurring         — checkRecurringStatus results
  //   loans             — loan docs + balance for each
  //   emis              — EMI docs + balance for each
  //   totalMonthlyLoad  — sum of all recurring + active EMIs + loan EMIs
  //   recurringStats    — { paid, pending, overdue, total }
  async getSummary(metadataDB, transactionsDB, userId) {
    try {
      const [recurringStatus, loans, emis] = await Promise.all([
        this.checkRecurringStatus(metadataDB, transactionsDB, userId),
        this.getLoans(metadataDB, userId),
        this.getEMIs(metadataDB, userId)
      ]);

      const [loanBalances, emiBalances] = await Promise.all([
        Promise.all(loans.map(l => this.getLoanBalance(l, transactionsDB, userId))),
        Promise.all(emis.map(e => this.getEMIBalance(e, transactionsDB, userId)))
      ]);

      const loansWithBalance = loans.map((l, i) => ({
        ...l,
        storedPhase: l.phase || 'moratorium',
        phase: loanBalances[i]?.phase || l.phase || 'moratorium',
        balance: loanBalances[i]
      }));
      const emisWithBalance  = emis.map((e,  i) => ({ ...e, balance: emiBalances[i] }));

      // Monthly load calculation
      const recurringMonthlyLoad = recurringStatus.reduce((s, r) => {
        // Normalise all frequencies to monthly equivalent
        const freqToMonthly = {
          daily:       30,
          weekly:      4.33,
          fortnightly: 2.17,
          monthly:     1,
          quarterly:   1 / 3,
          'bi-annual': 1 / 6,
          annual:      1 / 12
        };
        const multiplier = freqToMonthly[r.item.frequency] || 1;
        return s + (r.item.amount * multiplier * (r.item.frequency_interval || 1));
      }, 0);

      const emiMonthlyLoad  = emisWithBalance
        .filter(e => e.balance.monthsRemaining > 0)
        .reduce((s, e) => s + e.emi_amount, 0);

      const loanMonthlyLoad = loansWithBalance
        .filter(l => l.phase === 'repayment' && l.emi > 0)
        .reduce((s, l) => s + l.emi, 0);

      const totalMonthlyLoad = recurringMonthlyLoad + emiMonthlyLoad + loanMonthlyLoad;

      const recurringStats = {
        paid:    recurringStatus.filter(r => r.status === 'paid').length,
        pending: recurringStatus.filter(r => r.status === 'pending').length,
        overdue: recurringStatus.filter(r => r.status === 'overdue').length,
        total:   recurringStatus.length
      };

      return {
        recurring:        recurringStatus,
        loans:            loansWithBalance,
        emis:             emisWithBalance,
        totalMonthlyLoad,
        recurringMonthlyLoad,
        emiMonthlyLoad,
        loanMonthlyLoad,
        recurringStats
      };

    } catch (err) {
      console.error('ObligationsEngine.getSummary error:', err);
      return { recurring: [], loans: [], emis: [], totalMonthlyLoad: 0,
               recurringMonthlyLoad: 0, emiMonthlyLoad: 0, loanMonthlyLoad: 0,
               recurringStats: { paid: 0, pending: 0, overdue: 0, total: 0 } };
    }
  }
};
