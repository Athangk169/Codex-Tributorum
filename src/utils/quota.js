// ─────────────────────────────────────────────────────────────
// quota.js — the single derivation for per-category monthly caps.
//
// Targets come from `finance:budget:` docs (useBudgets); actuals are
// read from the current month's `byCategory` trend. Nothing here
// touches the DB — it's a pure transform, so every surface that shows
// a quota (the Auspex decree, the Overview standing panel, the header
// KPI, the nav seal, the ledger inscribe warning, the dossier line)
// derives from the same numbers and cannot disagree.
//
// Extracted verbatim out of AuspexSlide's QuotaView. Semantics are
// unchanged — including the quirk that `sanctioned` is filtered from
// `expenseCategories`, so a cap on a category that has fallen out of
// the rule list stays hidden until the rule comes back.
//
// NOTE on the actuals basis: `trends` comes from
// AnalyticsEngine.getMonthlyTrends, which deliberately drops
// obligation transactions, external loan payments, and any
// `do_not_track` category. That's the right basis for a budget, but
// it means Σ quota spend will not tie out against the Overview's raw
// expense figure. The difference is surfaced as `offTithe`.
// ─────────────────────────────────────────────────────────────

// ── Quota status ─────────────────────────────────────────────
// paid = within cap · pending = on pace to exceed · met = fully
// drawn (at the cap) · overdue = over. `met` uses a small tolerance
// because spent is a float sum that rarely lands exactly on the cap.
export const quotaStatus = (spent, cap, paceFrac) => {
  if (spent > cap) return 'overdue';
  if (cap > 0 && spent >= cap - cap * 0.005) return 'met';   // within ~0.5% of cap = fully drawn (0-cap held at zero stays "within")
  const projected = paceFrac > 0 ? spent / paceFrac : spent;
  return projected > cap ? 'pending' : 'paid';
};

export const QUOTA_BADGE = { paid: 'WITHIN', pending: 'NEARING', met: 'AT LIMIT', overdue: 'EXCEEDED' };

// Verdict → decree stamp wording/class. Shared so the Overview panel
// stamps identically to the Auspex decree.
export const QUOTA_STAMP_WORD  = { paid: 'WITHIN MEANS', pending: 'NEARING LIMIT', overdue: 'OVERDRAWN', none: 'UNSEALED' };
export const QUOTA_STAMP_CLASS = { paid: 'ok',           pending: 'warn',          overdue: 'over',      none: 'none'     };

// How far through the cycle we are — drives the pace marker and the
// "on pace to exceed" projection.
export const paceFraction = (now = new Date()) => {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth > 0 ? now.getDate() / daysInMonth : 0;
};

export const monthKeyOf = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// ── The derivation ───────────────────────────────────────────
// trends            — AnalyticsEngine.getMonthlyTrends output
// budgets           — { [category_name]: budgetDoc } from useBudgets
// expenseCategories — financeData.expenseCategories
export function computeQuota({ trends = [], budgets = {}, expenseCategories = [], now = new Date() } = {}) {
  const monthKey = monthKeyOf(now);
  const paceFrac = paceFraction(now);

  const curByCat = (trends.find(t => t.month === monthKey)?.byCategory) || {};
  const spendOf  = (cat) => Math.abs(curByCat[cat] || 0);
  const capOf    = (cat) => Number(budgets[cat]?.monthly_cap) || 0;

  // Suggestion seed: average over up to 6 completed months in the ledger.
  const last6 = trends.filter(t => t.month < monthKey).slice(-6);
  const avgOf = (cat) =>
    last6.length ? last6.reduce((a, t) => a + Math.abs(t.byCategory?.[cat] || 0), 0) / last6.length : 0;

  // Real expense categories only — intersect the rule list with
  // categories that actually carry spend history, mirroring the Upkeep
  // matrix, so dormant/system/global rules don't show. This also drops
  // the income/neutral keys byCategory carries for the Trends chart.
  const expenseSet = new Set(expenseCategories);
  const everSpent  = new Set();
  trends.forEach(t => {
    const bc = t.byCategory || {};
    for (const c in bc) if (expenseSet.has(c) && Math.abs(bc[c]) > 0) everSpent.add(c);
  });
  const active = [...everSpent];

  const sanctioned = expenseCategories
    .filter(c => budgets[c])
    .sort((a, b) => (spendOf(b) / (capOf(b) || 1)) - (spendOf(a) / (capOf(a) || 1)));
  const unsanctioned = active.filter(c => !budgets[c])
    .sort((a, b) => (spendOf(b) - spendOf(a)) || a.localeCompare(b)); // this-cycle spend first

  const totalQuota = sanctioned.reduce((a, c) => a + capOf(c), 0);
  const totalSpent = sanctioned.reduce((a, c) => a + spendOf(c), 0);
  const remains    = totalQuota - totalSpent;

  // ── Cycle reconciliation — ties the budget to actual income/expense.
  const cur          = trends.find(t => t.month === monthKey) || {};
  const income       = Math.max(0, cur.income  || 0);
  const totalExpense = Math.max(0, cur.expense || 0);
  const net          = income - totalExpense;
  const offTithe     = Math.max(0, totalExpense - totalSpent); // spend outside any sanctioned tithe
  const ratePct      = income > 0 ? Math.round((net / income) * 100) : null;

  const rows = sanctioned.map(cat => {
    const cap = capOf(cat), spent = spendOf(cat);
    const over = spent > cap;
    // A 0 cap means "should stay at zero" — any spend is fully over.
    const frac = cap > 0 ? spent / cap : (over ? 1 : 0);
    return {
      cat, cap, spent, frac,
      pct: cap > 0 ? Math.round((spent / cap) * 100) : (over ? 100 : 0),
      fillPct: Math.min(frac, 1) * 100,
      st: quotaStatus(spent, cap, paceFrac),
      over,
      remaining: cap - spent,
    };
  });

  // Verdict reflects quota adherence (not cashflow): any cap breached →
  // exceeded; any fully-drawn or on-pace-to-exceed → nearing; all clear
  // → within; nothing sanctioned → unsealed.
  const verdict = rows.length === 0 ? 'none'
    : rows.some(r => r.over)                                ? 'overdue'
    : rows.some(r => r.st === 'pending' || r.st === 'met')  ? 'pending'
    :                                                         'paid';

  const breached = rows.filter(r => r.over);
  const nearing  = rows.filter(r => r.st === 'pending' || r.st === 'met');

  return {
    monthKey, paceFrac,
    rows, sanctioned, unsanctioned, active,
    totalQuota, totalSpent, remains,
    income, totalExpense, net, offTithe, ratePct,
    hasCats: sanctioned.length > 0 || unsanctioned.length > 0,
    verdict,
    stampWord:  QUOTA_STAMP_WORD[verdict],
    stampClass: QUOTA_STAMP_CLASS[verdict],
    breached, nearing,
    // Worst offender by overspend, else the closest to its cap. Drives
    // the header KPI subtitle and the nav badge tooltip.
    worst: breached.length
      ? breached.reduce((a, b) => (b.spent - b.cap) > (a.spent - a.cap) ? b : a)
      : (rows.length ? rows.reduce((a, b) => b.frac > a.frac ? b : a) : null),
    spendOf, capOf, avgOf,
  };
}

// Compact, serialisable roll-up for surfaces that only need the
// headline (header KPI, nav badge, lore censure). Deliberately drops
// the closures so this can live on financeData without holding trends
// captive.
export function summarizeQuota(q) {
  return {
    verdict:    q.verdict,
    stampWord:  q.stampWord,
    stampClass: q.stampClass,
    totalQuota: q.totalQuota,
    totalSpent: q.totalSpent,
    remains:    q.remains,
    offTithe:   q.offTithe,
    paceFrac:   q.paceFrac,
    monthKey:   q.monthKey,
    count:      q.rows.length,
    breached:   q.breached.map(r => ({ cat: r.cat, cap: r.cap, spent: r.spent, over: r.spent - r.cap })),
    nearing:    q.nearing.map(r => ({ cat: r.cat, cap: r.cap, spent: r.spent })),
    worst:      q.worst ? { cat: q.worst.cat, cap: q.worst.cap, spent: q.worst.spent, pct: q.worst.pct, st: q.worst.st } : null,
    seals:      q.rows.map(r => ({ cat: r.cat, st: r.st, pct: r.pct, fillPct: r.fillPct, cap: r.cap, spent: r.spent, remaining: r.remaining, over: r.over })),
  };
}

// Per-category lookup for the ledger inscribe warning and the
// expenditure dossier — returns null when the category has no cap.
export function quotaForCategory(quota, category) {
  if (!quota || !category) return null;
  return quota.seals?.find(s => s.cat === category) || null;
}

// What a pending amount would do to a cap. `null` when uncapped.
export function projectQuota(line, amount, paceFrac = 0) {
  if (!line) return null;
  const add       = Math.abs(Number(amount) || 0);
  const projected = line.spent + add;
  const cap       = line.cap;
  const over      = projected > cap;
  const frac      = cap > 0 ? projected / cap : (over ? 1 : 0);
  return {
    ...line,
    add,
    projected,
    projFillPct: Math.min(frac, 1) * 100,
    projSt: quotaStatus(projected, cap, paceFrac),
    projOver: over,
    projRemaining: cap - projected,
    // true only when the amount is what tips it over — so an already
    // breached cap doesn't keep shouting "this will breach".
    breaches: over && !line.over,
  };
}
