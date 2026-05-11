export const CategorizationEngine = {

async autoTag(rawDescription, metadataDB, userId) {
try {
const result = await metadataDB.allDocs({ include_docs: true });
const rules = result.rows.map(r => r.doc)
.filter(d => d.type === 'category_rule' && d.is_active && d.user_id === userId);

let phrases = [];
rules.forEach(rule => {
rule.keywords.forEach(kw => {
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
const ruleId = `rule_${targetCategory.toLowerCase().replace(/\s+/g, '_')}`;

try {
const existing = await metadataDB.get(ruleId);
if (!existing.keywords.includes(cleanKw)) {
existing.keywords.push(cleanKw);
await metadataDB.put(existing);
}
} catch (err) {
if (err.name === 'not_found') {
await metadataDB.put({
_id: ruleId,
type: 'category_rule',
user_id: userId,
category_name: targetCategory,
keywords: [cleanKw],
is_active: true
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
const ruleId = `rule_${categoryName.toLowerCase().replace(/\s+/g, '_')}`;

try {
await metadataDB.get(ruleId);
return { ok: false, reason: 'already_exists' };
} catch (e) {}

await metadataDB.put({
_id: ruleId,
type: 'category_rule',
user_id: userId,
category_name: categoryName,
keywords,
is_active: true
});

// Update per-user config_category_types
let config;
try {
config = await metadataDB.get(`config_category_types_${userId}`);
} catch {
config = {
_id: `config_category_types_${userId}`,
type: 'system_config',
user_id: userId,
positive_categories: [],
neutral_categories: [],
expense_categories: []
};
}

if (type === 'income') config.positive_categories.push(categoryName);
else if (type === 'neutral') config.neutral_categories.push(categoryName);
else config.expense_categories = [...(config.expense_categories || []), categoryName];

await metadataDB.put(config);
return { ok: true };
},

async deleteCategory(categoryName, metadataDB, userId) {
const ruleId = `rule_${categoryName.toLowerCase().replace(/\s+/g, '_')}`;
try {
const doc = await metadataDB.get(ruleId);
if (doc.user_id === userId) {
await metadataDB.remove(doc);
}
} catch (e) {}

try {
const config = await metadataDB.get(`config_category_types_${userId}`);
config.positive_categories = (config.positive_categories || []).filter(c => c !== categoryName);
config.neutral_categories = (config.neutral_categories || []).filter(c => c !== categoryName);
config.expense_categories = (config.expense_categories || []).filter(c => c !== categoryName);
await metadataDB.put(config);
} catch (e) {}

return { ok: true };
},

async updateCategoryKeywords(categoryName, keywords, metadataDB, userId) {
const ruleId = `rule_${categoryName.toLowerCase().replace(/\s+/g, '_')}`;
try {
const doc = await metadataDB.get(ruleId);
if (doc.user_id === userId) {
doc.keywords = keywords;
await metadataDB.put(doc);
}
return { ok: true };
} catch (e) {
return { ok: false };
}
}
};

export const TransferEngine = {
async getRoutes(metadataDB) {
try {
const doc = await metadataDB.get('config_finance_routes');
return doc.routes || {};
} catch (e) { return {}; }
},

async resolveRoute(category, metadataDB) {
const routes = await this.getRoutes(metadataDB);
return routes[category] || null;
},

applyTransfer(state, route, amount) {
const { from, to } = route;
const absAmt = Math.abs(amount);
if (state[from] !== undefined) state[from] -= absAmt;
if (state[to] !== undefined) state[to] += absAmt;
return state;
}
};

export const CardEngine = {

// ---------------------------------------------------------------------------
// _parseTxnDate(src)
// ---------------------------------------------------------------------------
_parseTxnDate(src) {
if (src && src.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(src.substring(0, 10));
const digits = (src || '').replace(/\D/g, '').substring(0, 8);
if (digits.length === 8) {
const dd = digits.substring(0, 2), mm = digits.substring(2, 4), yyyy = digits.substring(4, 8);
return new Date(`${yyyy}-${mm}-${dd}`);
}
return new Date();
},

// ---------------------------------------------------------------------------
// getDueDateBucket(txnDateSrc, card)
// ---------------------------------------------------------------------------
getDueDateBucket(txnDateSrc, card) {
const d = this._parseTxnDate(txnDateSrc);
const billingDay = card.billing_day || 20;
const dueDay = card.due_day || 10;
const dueMonthOffset = card.due_month_offset || 1;

let sMonth = d.getMonth(), sYear = d.getFullYear();
if (d.getDate() > billingDay) {
sMonth += 1;
if (sMonth > 11) { sMonth = 0; sYear += 1; }
}

let dMonth = sMonth + dueMonthOffset, dYear = sYear;
if (dMonth > 11) { dMonth -= 12; dYear += 1; }
return `${dYear}-${String(dMonth + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
},

// ---------------------------------------------------------------------------
// _isThisCard(d, card)
// ---------------------------------------------------------------------------
_isThisCard(d, card) {
const acc = String(d.account_type || d.acc || '').toLowerCase();
const sub = String(d.sub_account || '').toLowerCase();
const cardId = String(card.id || '').toLowerCase();
const cardName = String(card.name || '').toLowerCase();

const isCardType = acc.includes('card') || sub.includes('card');
if (!isCardType) return false;

if (cardId && sub.includes(cardId)) return true;
if (cardName && sub.includes(cardName)) return true;
if (card.is_default && sub.includes('card')) return true;

return false;
},

// ---------------------------------------------------------------------------
// buildBuckets(transactionsDB, metadataDB, userId, cardId)
// ---------------------------------------------------------------------------
async buildBuckets(transactionsDB, metadataDB, userId, cardId) {
try {
const cardsDoc = await metadataDB.get('config_cards').catch(() => ({ cards: [] }));
const card = cardsDoc.cards.find(c =>
c.id === cardId ||
String(c.name).toLowerCase() === String(cardId).toLowerCase()
) || cardsDoc.cards.find(c => c.is_default) || cardsDoc.cards[0];

if (!card) return { error: 'card_not_found' };

const result = await transactionsDB.allDocs({ include_docs: true });
const allDocs = result.rows.map(r => r.doc).filter(d => {
if (d.type !== 'transaction') return false;
if (userId && userId !== 'default' && d.user_id && d.user_id !== userId) return false;
return true;
});

const EXCLUDED = new Set(['Credit Card Bill', 'Credit Card Payment', 'Balance c/d']);

const txns = allDocs.filter(d =>
this._isThisCard(d, card) && !EXCLUDED.has(d.category)
);

const buckets = {};
txns.forEach(txn => {
const dateSrc = txn.date || txn._id;
const key = this.getDueDateBucket(dateSrc, card);
if (!buckets[key]) {
buckets[key] = { due_date: key, total: 0, paid: 0, transactions: [] };
}
buckets[key].total += Math.abs(txn.amount);
buckets[key].transactions.push(txn);
});

let sortedKeys = Object.keys(buckets).sort();

const billDocs = allDocs
.filter(d => d.category === 'Credit Card Bill' && this._isThisCard(d, card))
.sort((a, b) => {
const da = a.date || a._id.substring(0, 10);
const db = b.date || b._id.substring(0, 10);
return db.localeCompare(da);
});

const carryForward = billDocs.length > 0 ? Math.abs(billDocs[0].amount) : 0;

if (carryForward > 0) {
const oldestKey = sortedKeys[0] || this.getDueDateBucket(new Date().toISOString(), card);
if (!buckets[oldestKey]) {
buckets[oldestKey] = { due_date: oldestKey, total: 0, paid: 0, transactions: [] };
}
buckets[oldestKey].total += carryForward;
if (!sortedKeys.includes(oldestKey)) sortedKeys.push(oldestKey);
sortedKeys = sortedKeys.sort();
}

const payments = allDocs
.filter(d => d.category === 'Credit Card Payment' && this._isThisCard(d, card))
.sort((a, b) => (a.date || a._id).localeCompare(b.date || b._id));

payments.forEach(pmt => {
const pmtDate = (pmt.date || pmt._id).substring(0, 10);
let rem = Math.abs(pmt.amount);

for (const key of sortedKeys) {
if (pmtDate > key) continue;

const b = buckets[key];
const due = b.total - b.paid;
if (due <= 0 || rem <= 0) continue;

const apply = Math.min(rem, due);
b.paid += apply;
rem -= apply;
}
});

const today = new Date().toISOString().substring(0, 10);
const finalBuckets = sortedKeys.map(key => {
const b = buckets[key];
const outstanding = Math.max(0, b.total - b.paid);
const status = outstanding <= 0 ? 'paid'
: key < today ? 'overdue'
: 'outstanding';
return { ...b, outstanding, status };
});

return { card, buckets: finalBuckets };

} catch (err) { return { error: err.message }; }
}
};

export const ProvisionEngine = {

async getAll(metadataDB, userId) {
try {
const doc = await metadataDB.get('config_provisions');
return (doc.provisions || []).filter(p => !userId || p.user_id === userId);
} catch (e) { return []; }
},

async add(name, targetAmount = null, metadataDB, userId) {
let doc;
try { doc = await metadataDB.get('config_provisions'); }
catch (e) { doc = { _id: 'config_provisions', type: 'system_config', provisions: [] }; }
doc.provisions.push({
id: `prov_${Date.now()}`,
name,
target_amount: targetAmount,
user_id: userId,
created: new Date().toISOString()
});
await metadataDB.put(doc);
return { ok: true };
},

async remove(provisionId, metadataDB, userId) {
const doc = await metadataDB.get('config_provisions');
doc.provisions = doc.provisions.filter(p => !(p.id === provisionId && (!userId || p.user_id === userId)));
await metadataDB.put(doc);
return { ok: true };
}
};

export const FinanceEngine = {

// ---------------------------------------------------------------------------
// _getAnchor
// ---------------------------------------------------------------------------
async _getAnchor(metadataDB, transactionsDB, monthPrefix, userId, config, routes) {
const snapId = `snapshot_${userId}_${monthPrefix}`;
const GENESIS_MONTH = '2026-05';

try {
const snap = await metadataDB.get(snapId);
return snap.balances;
} catch (err) {

if (monthPrefix <= GENESIS_MONTH) {
let balances = { Bank: 0, Cash: 0, Card: 0, AR: 0, Provisions: 0 };
try {
const legacyId = userId && userId !== 'default'
? `active_snapshot_${userId}`
: 'active_snapshot';
const anchor = await metadataDB.get(legacyId);
balances = anchor.balances || balances;
} catch (e) {}

const currentResult = await transactionsDB.allDocs({
include_docs: true,
startkey: monthPrefix,
endkey: monthPrefix + '\uffff'
});

const monthDocs = currentResult.rows.map(r => r.doc)
.filter(d => d.type === 'transaction' && (!userId || userId === 'default' || d.user_id === userId));

monthDocs.forEach(txn => {
const cat = (txn.category || '').toLowerCase();
const amt = Math.abs(txn.amount);

if (cat === 'balance c/d' && txn.account_type === 'Bank') balances.Bank += amt; 
if (cat === 'cash c/d' && txn.account_type === 'Cash') balances.Cash += amt;   
});

return balances;
}

const [y, m] = monthPrefix.split('-');
let prevM = parseInt(m, 10) - 1, prevY = parseInt(y, 10);
if (prevM === 0) { prevM = 12; prevY -= 1; }
const prevMonthPrefix = `${prevY}-${String(prevM).padStart(2, '0')}`;

const prevResult = await this.reconstructBalances(transactionsDB, metadataDB, prevMonthPrefix, userId);
const prevFinalBalances = prevResult.buckets;

const currentResult = await transactionsDB.allDocs({
include_docs: true,
startkey: monthPrefix,
endkey: monthPrefix + '\uffff'
});

const monthDocs = currentResult.rows.map(r => r.doc)
.filter(d => d.type === 'transaction' && (!userId || userId === 'default' || d.user_id === userId));

let balanceCD = 0;
let cashCD = 0;

monthDocs.forEach(txn => {
const cat = (txn.category || '').toLowerCase();
const amt = Math.abs(txn.amount);

if (cat === 'balance c/d' && txn.account_type === 'Bank') balanceCD += amt;
if (cat === 'cash c/d' && txn.account_type === 'Cash') cashCD += amt;
});

return {
Bank: prevFinalBalances.Bank + balanceCD,
Cash: prevFinalBalances.Cash + cashCD,
AR: prevFinalBalances.AR,
Card: prevFinalBalances.Card,
Provisions: prevFinalBalances.Provisions
};
}
},

// ---------------------------------------------------------------------------
// reconstructBalances
// ---------------------------------------------------------------------------
async reconstructBalances(transactionsDB, metadataDB, monthPrefix, userId) {
let state = { Bank: 0, Cash: 0, Card: 0, AR: 0, Provisions: 0 };
let flows = {
grossIncome: 0, reimbursementsReceived: 0, netIncome: 0,
grossExpense: 0, reimbursableExpenses: 0, netExpense: 0
};

try {
let config = { positive_categories: [], neutral_categories: [] };
try {
config = await metadataDB.get(`config_category_types_${userId}`);
} catch (e) {
// Fallback to global config if user-specific config is missing
try { config = await metadataDB.get('config_category_types'); } catch (err) {}
}

let routes = {};
try { routes = await TransferEngine.getRoutes(metadataDB); } catch (e) {}

// Gets the OPENING balance for the month
state = await this._getAnchor(metadataDB, transactionsDB, monthPrefix, userId, config, routes);

const result = await transactionsDB.allDocs({
include_docs: true,
startkey: monthPrefix,
endkey: monthPrefix + '\uffff'
});

const docs = result.rows.map(r => r.doc)
.filter(d => d.type === 'transaction' && (!userId || userId === 'default' || d.user_id === userId));

// Now we loop through the month's transactions and UPDATE the balance live
docs.forEach(txn => {
const amt = txn.amount;
const cat = txn.category || 'Uncategorized';
const catLower = cat.toLowerCase();

const isIncome = config.positive_categories?.includes(cat);
const isTransfer = config.neutral_categories?.includes(cat);

if (catLower === 'balance c/d' || catLower === 'cash c/d') return;

if (txn.is_reimbursable) state.AR += Math.abs(amt);
if (cat === 'Reimbursement Received') state.AR -= Math.abs(amt);

if (isIncome && cat !== 'Reimbursement Received') {
flows.grossIncome += Math.abs(amt);

// 🟢 LIVE TRACKING RESTORED: Add income to bank and cash balances
if (txn.account_type === 'Bank') state.Bank += Math.abs(amt);
if (txn.account_type === 'Cash') state.Cash += Math.abs(amt);
}

if (cat === 'Reimbursement Received') {
flows.reimbursementsReceived += Math.abs(amt);
}

if (isTransfer) {
const route = routes[cat];
if (route) TransferEngine.applyTransfer(state, route, amt);
}

if (!isIncome && !isTransfer) {
flows.grossExpense += Math.abs(amt);
if (txn.is_reimbursable) flows.reimbursableExpenses += Math.abs(amt);

// 🔴 LIVE TRACKING RESTORED: Subtract expenses from bank/cash
if (txn.account_type === 'Bank') state.Bank -= Math.abs(amt);
if (txn.account_type === 'Cash') state.Cash -= Math.abs(amt);
if (txn.account_type === 'Card') state.Card += Math.abs(amt);
}
});

flows.netIncome = flows.grossIncome - flows.reimbursementsReceived;
flows.netExpense = flows.grossExpense - flows.reimbursableExpenses;

return {
buckets: state,
metrics: flows,
transactions: docs
};

} catch (err) {
console.error('FinanceEngine.reconstructBalances error:', err);
return { buckets: state, metrics: flows, transactions: [] };
}
},

// ---------------------------------------------------------------------------
// getBankAccountBalances
// ---------------------------------------------------------------------------
async getBankAccountBalances(transactionsDB, metadataDB, userId) {
try {
const accounts = await AccountEngine.getBankAccounts(metadataDB, userId);
if (!accounts.length) return { accounts: [], total: 0 };

let config = { positive_categories: [], neutral_categories: [] };
try {
config = await metadataDB.get(`config_category_types_${userId}`);
} catch (e) {
// Fallback to global config
try { config = await metadataDB.get('config_category_types'); } catch (err) {}
}

const result = await transactionsDB.allDocs({ include_docs: true });
const txns = result.rows.map(r => r.doc).filter(d =>
d.type === 'transaction' &&
d.account_type === 'Bank' &&
(!userId || userId === 'default' || d.user_id === userId)
);

const balances = {};
accounts.forEach(acc => {
balances[acc.id] = { account: acc, balance: 0, transactionCount: 0 };
});

txns.forEach(txn => {
const sub = txn.sub_account;
if (!sub) return;

const matched = accounts.find(a =>
a.name.toLowerCase() === sub.toLowerCase() ||
a.id.toLowerCase() === sub.toLowerCase()
);
if (!matched) return;

const key = matched.id;
const amt = txn.amount;
const cat = txn.category || '';

if (cat === 'Opening Balance' || cat === 'Balance c/d') {
balances[key].balance += Math.abs(amt);
}
else if (config.positive_categories?.includes(cat)) {
balances[key].balance += Math.abs(amt);
}
else if (config.neutral_categories?.includes(cat)) {
balances[key].balance += amt;
}
else {
balances[key].balance -= Math.abs(amt);
}

balances[key].transactionCount++;
});

const accountList = Object.values(balances);
const total = accountList.reduce((sum, b) => sum + b.balance, 0);

return { accounts: accountList, total };
} catch (err) {
console.error('getBankAccountBalances error:', err);
return { accounts: [], total: 0 };
}
}

};

export const TemporalEngine = {
async getLedgerForMonth(transactionsDB, year, month, userId) {
try {
const mm = month.toString().padStart(2, '0');
const prefix = `${year}-${mm}`;
const result = await transactionsDB.allDocs({ include_docs: true });
return result.rows.map(r => r.doc).filter(d => {
if (d.type !== 'transaction') return false;
if (userId && d.user_id && d.user_id !== userId) return false;
if (d.date && d.date.startsWith(prefix)) return true;
if (d._id.startsWith(prefix)) return true;
const compact = d._id.replace(/\D/g, '').substring(0, 8);
if (compact.length === 8) {
const dy = compact.substring(4, 8);
const dm = compact.substring(2, 4);
if (dy === String(year) && dm === mm) return true;
}
return false;
});
} catch (err) {
console.error('TemporalEngine.getLedgerForMonth failed:', err);
return [];
}
},

async getAllMonths(transactionsDB, userId) {
try {
const result = await transactionsDB.allDocs({ include_docs: true });
const months = new Set();
result.rows.map(r => r.doc)
.filter(d => d.type === 'transaction' && (!userId || d.user_id === userId))
.forEach(d => {
// FIX-7: use d.date when available
const src = d.date || d._id;
if (src && src.length >= 7) months.add(src.substring(0, 7));
});
return Array.from(months).sort();
} catch (err) { return []; }
}
};

export const AnalyticsEngine = {

_getMonthKey(dateSrc) {
const src = dateSrc || '';
if (src.match(/^\d{4}-\d{2}/)) return src.substring(0, 7);
const digits = src.replace(/\D/g, '').substring(0, 8);
if (digits.length === 8) {
return `${digits.substring(4, 8)}-${digits.substring(2, 4)}`;
}
return null;
},

async getMonthlyTrends(transactionsDB, metadataDB, userId) {
try {
let config = { positive_categories: [], neutral_categories: [] };
try { 
config = await metadataDB.get(`config_category_types_${userId}`); 
} catch (e) {
// ADDED: Fallback to global config
try { config = await metadataDB.get('config_category_types'); } catch (err) {}
}

const result = await transactionsDB.allDocs({ include_docs: true });
const txns = result.rows.map(r => r.doc)
.filter(d => d.type === 'transaction' && (!userId || d.user_id === userId));

const months = {};
txns.forEach(txn => {
const key = this._getMonthKey(txn.date || txn._id);
if (!key) return;

if (!months[key]) months[key] = {
month: key, income: 0, expense: 0, investment: 0, net: 0, byCategory: {}
};

const cat = txn.category;
const amt = Math.abs(txn.amount);
const isIncome = config.positive_categories?.includes(cat);
const isTransfer = config.neutral_categories?.includes(cat);

if (isTransfer) return;

if (isIncome && cat !== 'Reimbursement Received') {
months[key].income += amt;
} else if (!isIncome) {
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

export const AccountEngine = {

async getAccounts(metadataDB, userId) {
try {
const doc = await metadataDB.get('config_accounts');
return (doc.accounts || []).filter(a => !userId || a.user_id === userId);
} catch (e) { return []; }
},

// FIX-4: single definition of getBankAccounts (duplicate removed)
async getBankAccounts(metadataDB, userId) {
const all = await this.getAccounts(metadataDB, userId);
return all.filter(a => a.parent === 'Bank');
},

async getCards(metadataDB, userId) {
try {
const doc = await metadataDB.get('config_cards');
return (doc.cards || []).filter(c => !userId || c.user_id === userId);
} catch (e) { return []; }
},

async getDefaultAccount(metadataDB, userId, parentType) {
const accounts = await this.getAccounts(metadataDB, userId);
const match = accounts.find(a => a.parent === parentType && a.is_default);
return match || accounts.find(a => a.parent === parentType) || null;
},

async getDefaultCard(metadataDB, userId) {
const cards = await this.getCards(metadataDB, userId);
return cards.find(c => c.is_default) || cards[0] || null;
},

// FIX-4: single definition of addAccount (duplicate removed).
// Uses accountData.parent || 'Bank' so non-Bank account types are preserved.
async addAccount(accountData, metadataDB, userId) {
try {
let doc;
try {
doc = await metadataDB.get('config_accounts');
} catch {
doc = { _id: 'config_accounts', type: 'system_config', accounts: [], user_id: userId };
}

const newAcc = {
id: accountData.id || `bank_${Date.now()}`,
name: accountData.name,
parent: accountData.parent || 'Bank',
is_default: !!accountData.is_default,
user_id: userId,
bank_name: accountData.bank_name || '',
account_number: accountData.account_number || '',
notes: accountData.notes || '',
created: new Date().toISOString()
};

if (newAcc.is_default) {
doc.accounts.forEach(a => {
if (a.parent === newAcc.parent) a.is_default = false;
});
}

doc.accounts.push(newAcc);
await metadataDB.put(doc);
return { ok: true, account: newAcc };
} catch (err) {
return { ok: false, error: err.message };
}
},

async updateAccount(accountId, updates, metadataDB, userId) {
try {
const doc = await metadataDB.get('config_accounts');
const index = doc.accounts.findIndex(a => a.id === accountId && a.user_id === userId);
if (index === -1) return { ok: false, error: 'Account not found' };

const updated = { ...doc.accounts[index], ...updates, updated: new Date().toISOString() };

if (updates.is_default) {
doc.accounts.forEach((a, i) => {
if (i !== index && a.parent === updated.parent) a.is_default = false;
});
}

doc.accounts[index] = updated;
await metadataDB.put(doc);
return { ok: true, account: updated };
} catch (err) {
return { ok: false, error: err.message };
}
},

// FIX-4: single definition of deleteAccount (duplicate removed)
async deleteAccount(accountId, metadataDB, userId) {
try {
const doc = await metadataDB.get('config_accounts');
const index = doc.accounts.findIndex(a => a.id === accountId && a.user_id === userId);
if (index === -1) return { ok: false, error: 'Account not found' };

const deleted = doc.accounts.splice(index, 1)[0];
await metadataDB.put(doc);
return { ok: true, deleted };
} catch (err) {
return { ok: false, error: err.message };
}
}

};

window.FinanceEngine = FinanceEngine;
window.AnalyticsEngine = AnalyticsEngine;
window.TemporalEngine = TemporalEngine;
window.AccountEngine = AccountEngine;