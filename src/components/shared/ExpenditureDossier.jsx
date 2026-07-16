// src/components/shared/ExpenditureDossier.jsx
// Per-category spend audit overlay — the month's transactions behind an
// Expenditure Vectors bar. Opened from the Overview bars. Read-only:
// works entirely off the current cycle's transactions the slide already
// carries (no DB query — unlike AR, spend doesn't span months here).
import { useState, useEffect } from 'react';
import { RD_STYLES, fmtShortDate } from './RecoveryDossier';

const buildTransmitText = (category, entries, total) => {
  const lines = [`EXPENDITURE LEDGER — ${category.toUpperCase()}`, ''];
  const descWidth = Math.min(
    28, Math.max(12, ...entries.map(e => e.description.length))
  );
  entries.forEach(e => {
    const desc = e.description.length > descWidth
      ? e.description.slice(0, descWidth - 1) + '…'
      : e.description.padEnd(descWidth);
    lines.push(`${fmtShortDate(e.date)}  ${desc}  -${Math.round(e.amount).toLocaleString()}`);
  });
  lines.push('');
  lines.push(`ENTRIES ${entries.length} | TOTAL EXPENDED ${Math.round(total).toLocaleString()}`);
  return lines.join('\n');
};

const ExpenditureDossier = ({ category, txns, resolveAcc, onClose }) => {
  const [transmitted, setTransmitted] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Chronological, with a running cumulative like the AR statement.
  let running = 0;
  const entries = [...txns]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(tx => {
      const amount = Math.abs(tx.amount || 0);
      running += amount;
      return {
        txnId: tx._id,
        date: tx.date,
        description: (tx.description || tx.category || 'UNKNOWN').toString(),
        via: resolveAcc ? resolveAcc(tx.sub_account) : null,
        amount,
        cumulative: running,
      };
    });
  const total = running;

  const handleTransmit = async () => {
    try {
      await navigator.clipboard.writeText(buildTransmitText(category, entries, total));
      setTransmitted(true);
      setTimeout(() => setTransmitted(false), 2200);
    } catch (_) { /* clipboard denied — button simply stays idle */ }
  };

  return (
    <div className="rd-scrim" onClick={onClose}>
      <style>{RD_STYLES}</style>
      <div className="rd-panel" onClick={e => e.stopPropagation()}>
        <span className="corner-tl"/><span className="corner-tr"/>
        <span className="corner-bl"/><span className="corner-br"/>

        <div className="rd-hdr">
          <span className="rd-ttl">
            EXPENDITURE LEDGER // <span className="rd-tag-name" style={{ color: 'var(--ba-crimson)', textShadow: '0 0 8px #cc220055' }}>{category}</span>
          </span>
          <button className="rd-x" onClick={onClose}>TERMINATE</button>
        </div>

        <div className="rd-cols">
          <span>DATE STAMP</span><span>DESIGNATION</span>
          <span style={{ textAlign: 'right' }}>COST</span>
          <span style={{ textAlign: 'right' }}>CUMULATIVE</span>
        </div>
        <div className="rd-scroll">
          {entries.length === 0 ? (
            <div className="rd-empty">NO RECORDS BEAR THIS DESIGNATION</div>
          ) : entries.map((e, i) => (
            <div key={e.txnId || i} className="rd-row" style={{ animationDelay: `${Math.min(i * 0.03, 0.4)}s` }}>
              <span className="rd-date">{fmtShortDate(e.date)}</span>
              <span className="rd-desc" title={e.via ? `${e.description} — VIA ${e.via}` : e.description}>
                {e.description}
                {e.via && <span style={{ color: '#4a2010', fontSize: '8px', marginLeft: '6px' }}>VIA {e.via}</span>}
              </span>
              <span className="rd-amt charge">-{Math.round(e.amount).toLocaleString()}</span>
              <span className="rd-run">{Math.round(e.cumulative).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="rd-foot">
          <div className="rd-totals">
            <span>ENTRIES {entries.length} // CURRENT CYCLE</span>
            <span className="rd-owed" style={{ color: 'var(--ba-crimson)', textShadow: '0 0 8px #cc220055' }}>
              EXPENDED {Math.round(total).toLocaleString()}
            </span>
          </div>
          <div className="rd-actions">
            <button
              className={`rd-btn ${transmitted ? 'done' : ''}`}
              onClick={handleTransmit}
              disabled={transmitted || entries.length === 0}
            >
              {transmitted ? 'MANIFEST TRANSMITTED ◈' : 'TRANSMIT MANIFEST'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenditureDossier;
