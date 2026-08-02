// src/components/shared/QuotaLine.jsx
// The Tithe-Grant rule, extracted so surfaces outside the Auspex decree
// can show a cap without importing AuspexSlide. Same visual vocabulary
// as `.q-dec-rule` / `.q-dec-ink` / `.q-dec-pace` — ink fill, crimson
// pace marker, purity seal — under a `ql-` prefix, because the decree's
// styles are scoped to AuspexSlide's own <style> tag and only exist
// while that slide is mounted.
//
// Fed by quotaForCategory() / projectQuota() from src/utils/quota.js.

const fmtINR = (n) => `${Math.round(n || 0).toLocaleString('en-IN')}`;

export const QUOTA_STYLES = `
  .ql-wrap { font-family: var(--mono); }
  .ql-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .ql-name { font-size: 10px; letter-spacing: 2px; color: var(--ba-gold-dim); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ql-sum { font-size: 11px; font-weight: bold; color: var(--ba-gold); flex-shrink: 0; }

  .ql-rule { position: relative; height: 5px; margin: 7px 0 5px; background: rgba(0,15,0,0.4); border: 1px solid var(--ba-border); overflow: hidden; }
  .ql-ink { position: absolute; top: 0; left: 0; bottom: 0; transition: width 0.45s ease; }
  .ql-ink.paid    { background: linear-gradient(90deg, var(--border-hi), #88ffcc); box-shadow: 0 0 6px rgba(74,222,128,0.3); }
  .ql-ink.pending { background: linear-gradient(90deg, var(--ba-gold-dim), var(--ba-gold)); box-shadow: 0 0 6px rgba(201,168,76,0.35); }
  .ql-ink.met     { background: linear-gradient(90deg, var(--ba-gold), #f0d27a); box-shadow: 0 0 8px rgba(201,168,76,0.55); }
  .ql-ink.overdue { background: linear-gradient(90deg, var(--ba-crimson-d), var(--ba-crimson)); box-shadow: 0 0 6px rgba(204,34,0,0.4); }

  /* the slice this entry would add, laid over the committed ink */
  .ql-ink.proj { opacity: 0.55; background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 3px, transparent 3px 6px); }
  .ql-pace { position: absolute; top: -2px; bottom: -2px; width: 0; border-left: 1px solid var(--ba-crimson); box-shadow: 0 0 4px rgba(204,34,0,0.7); }

  .ql-foot { display: flex; justify-content: space-between; gap: 10px; font-size: 9px; letter-spacing: 0.5px; color: var(--ba-gold-mute); }
  .ql-stat.paid    { color: var(--border-hi); }
  .ql-stat.pending { color: var(--ba-gold); }
  .ql-stat.met     { color: var(--ba-gold); font-weight: bold; text-shadow: 0 0 6px rgba(201,168,76,0.5); }
  .ql-stat.overdue { color: var(--ba-crimson); font-weight: bold; }

  /* breach warning strip — the decree speaking up at inscription */
  .ql-warn { margin-top: 7px; padding: 5px 9px; border: 1px solid var(--ba-crimson); background: rgba(204,34,0,0.09); color: var(--ba-crimson); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; animation: qlWarnPulse 1.6s ease-in-out infinite; }
  .ql-warn.already { border-color: var(--ba-gold-dim); background: rgba(201,168,76,0.08); color: var(--ba-gold); animation: none; }
  @keyframes qlWarnPulse { 0%,100% { box-shadow: inset 0 0 10px rgba(204,34,0,0.15); } 50% { box-shadow: inset 0 0 16px rgba(204,34,0,0.35); } }
`;

// line — from quotaForCategory(quota, category)
// proj — optional, from projectQuota(line, pendingAmount, paceFrac)
const QuotaLine = ({ line, proj, paceFrac = 0, showName = true, compact = false }) => {
  if (!line) return null;

  // With a pending amount the bar shows committed ink plus a hatched
  // slice for what this entry would add, and the status follows the
  // projection so the colour flips before you commit.
  const st       = proj ? proj.projSt : line.st;
  const baseFill = Math.min(line.fillPct, 100);
  const projFill = proj ? Math.max(0, Math.min(proj.projFillPct, 100) - baseFill) : 0;

  const remainAfter = proj ? proj.projRemaining : line.remaining;
  const overNow     = proj ? proj.projOver : line.over;

  return (
    <div className="ql-wrap">
      {showName && (
        <div className="ql-top">
          <span className="ql-name">{line.cat} · SANCTIONED</span>
          <span className="ql-sum">{fmtINR(line.cap)}</span>
        </div>
      )}

      <div className="ql-rule">
        <span className={`ql-ink ${line.over ? 'overdue' : st}`} style={{ width: `${baseFill}%` }} />
        {projFill > 0 && (
          <span className={`ql-ink proj ${st}`} style={{ left: `${baseFill}%`, width: `${projFill}%` }} />
        )}
        {paceFrac > 0 && paceFrac < 1 && (
          <i className="ql-pace" style={{ left: `${paceFrac * 100}%` }} title="pace expected by today" />
        )}
      </div>

      {!compact && (
        <div className="ql-foot">
          <span>
            expended {fmtINR(line.spent)}
            {proj && proj.add > 0 ? ` + ${fmtINR(proj.add)} pending` : ''}
            {' · '}
            {overNow ? `${fmtINR(-remainAfter)} over` : st === 'met' ? 'fully expended' : `${fmtINR(remainAfter)} remain`}
          </span>
          <span className={`ql-stat ${st}`}>
            {overNow ? 'overdrawn' : st === 'met' ? 'fully drawn' : st === 'pending' ? 'nearing limit' : 'within means'}
          </span>
        </div>
      )}

      {proj?.breaches && (
        <div className="ql-warn">
          ✠ this entry breaches the tithe by {fmtINR(-proj.projRemaining)} ✠
        </div>
      )}
      {proj && !proj.breaches && line.over && proj.add > 0 && (
        <div className="ql-warn already">
          ✠ tithe already overdrawn — {fmtINR(-proj.projRemaining)} beyond sanction ✠
        </div>
      )}
    </div>
  );
};

export default QuotaLine;
