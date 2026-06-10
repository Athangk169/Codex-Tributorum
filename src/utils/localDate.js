// ─────────────────────────────────────────────────────────────
// localDate
//
// `new Date().toISOString().substring(0, 10)` yields the *UTC* date,
// which is off by one for any timezone ahead of UTC (e.g. IST, UTC+5:30)
// during the post-midnight window — a tithe logged at 02:00 IST would
// default to yesterday, a snapshot on the 1st would file to last month.
//
// These helpers format a Date in the browser's LOCAL timezone instead.
// Use them anywhere "today" / "this month" is needed as a YYYY-MM-DD /
// YYYY-MM key. (Full ISO timestamps for created/updated fields should
// stay UTC — don't route those through here.)
// ─────────────────────────────────────────────────────────────

export const localDateStr = (d = new Date()) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

export const localMonthStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
