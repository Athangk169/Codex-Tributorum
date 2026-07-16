// src/components/shared/RecoveryDossier.jsx
// Per-tag AR audit overlay — the full chronological statement behind a
// Recovery Manifest entry. Opened from the Overview manifest rows and
// the Ledger [R: tag] chips. Queries all-time (the slides only carry
// the current month; debts span months).
import { useState, useEffect, useCallback } from 'react';
import { AREngine } from '../../utils/engine';

// Shared with ExpenditureDossier — both overlays use the same scrim/panel
// look; keep class names rd-* so either stylesheet copy works.
export const RD_STYLES = `
  @keyframes rdScrimIn  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rdPanelIn  {
    from { opacity: 0; transform: translateY(10px) scale(0.985); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes rdRowIn {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .rd-scrim {
    position: fixed; inset: 0; z-index: 900;
    background: rgba(2, 0, 0, 0.78);
    backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center;
    animation: rdScrimIn 0.2s ease;
  }
  .rd-panel {
    background: var(--panel-mid);
    border: 1px solid var(--ba-border);
    box-shadow: 0 0 30px rgba(180,20,0,0.15), inset 0 0 25px rgba(0,0,0,0.5);
    width: min(580px, 92vw); max-height: 82vh;
    display: flex; flex-direction: column;
    position: relative; overflow: hidden;
    font-family: var(--mono);
    animation: rdPanelIn 0.25s ease;
  }
  .rd-panel::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
  }
  .rd-hdr {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--ba-border-lo);
    flex-shrink: 0;
  }
  .rd-ttl {
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
    color: var(--ba-gold-dim);
  }
  .rd-ttl .rd-tag-name { color: var(--border-hi); text-shadow: var(--glow); }
  .rd-x {
    background: transparent; border: 1px solid var(--ba-border);
    color: var(--ba-gold-mute); font-family: var(--mono); font-size: 10px;
    padding: 3px 8px; cursor: pointer; letter-spacing: 1px; transition: all 0.2s;
  }
  .rd-x:hover { border-color: var(--ba-crimson); color: #fff; }

  .rd-cols {
    display: grid; grid-template-columns: 78px 1fr 76px 76px;
    gap: 8px; padding: 8px 16px 6px;
    font-size: 8px; letter-spacing: 1.5px; color: var(--ba-gold-mute);
    border-bottom: 1px solid var(--ba-border-lo); flex-shrink: 0;
  }
  .rd-scroll { overflow-y: auto; padding: 4px 16px; flex: 1; }
  .rd-scroll::-webkit-scrollbar       { width: 3px; }
  .rd-scroll::-webkit-scrollbar-track { background: #050000; }
  .rd-scroll::-webkit-scrollbar-thumb { background: rgba(204,34,0,0.5); border-radius: 2px; }

  .rd-row {
    display: grid; grid-template-columns: 78px 1fr 76px 76px;
    gap: 8px; align-items: baseline;
    padding: 6px 0; border-bottom: 1px dashed rgba(74,10,0,0.3);
    font-size: 10px; animation: rdRowIn 0.25s ease both;
  }
  .rd-date { color: var(--ba-gold-mute); font-size: 9px; }
  .rd-desc { color: var(--ba-gold-dim); text-transform: uppercase; letter-spacing: 0.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rd-amt  { text-align: right; font-weight: bold; }
  .rd-amt.charge  { color: var(--ba-crimson); text-shadow: 0 0 8px #cc220055; }
  .rd-amt.receipt { color: var(--border-hi);  text-shadow: var(--glow); }
  .rd-run  { text-align: right; color: #fff; }
  .rd-run.negative { color: var(--amber); }

  .rd-foot {
    border-top: 1px solid var(--ba-border-lo);
    padding: 10px 16px 12px; flex-shrink: 0;
  }
  .rd-totals {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 9px; letter-spacing: 1px; color: var(--ba-gold-mute);
    margin-bottom: 10px;
  }
  .rd-owed { font-size: 14px; font-weight: bold; color: var(--border-hi); text-shadow: var(--glow); }
  .rd-owed.settled { color: var(--ba-gold-mute); text-shadow: none; }
  .rd-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .rd-btn {
    background: transparent; border: 1px solid var(--border);
    color: var(--text-d); font-family: var(--mono); font-size: 9px;
    padding: 5px 12px; cursor: pointer; letter-spacing: 1.5px; transition: all 0.2s;
  }
  .rd-btn:hover { border-color: var(--border-hi); color: #fff; box-shadow: inset 0 0 10px rgba(74,222,128,0.15); }
  .rd-btn.done { border-color: var(--border-hi); color: var(--border-hi); cursor: default; }

  .rd-empty {
    text-align: center; font-size: 10px; color: var(--ba-gold-mute);
    letter-spacing: 1px; padding: 24px 0;
  }

  .rd-arch-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 0; border-bottom: 1px dashed rgba(74,10,0,0.3);
    font-size: 10px; cursor: pointer; transition: background 0.15s;
  }
  .rd-arch-row:hover { background: rgba(200,34,0,0.06); }
  .rd-arch-tag { color: var(--ba-gold-dim); letter-spacing: 1px; text-transform: uppercase; }
  .rd-arch-state { font-size: 8px; letter-spacing: 1px; color: var(--ba-gold-mute); }
  .rd-arch-state.overpaid { color: var(--amber); }
  .rd-back {
    background: transparent; border: none; color: var(--ba-gold-mute);
    font-family: var(--mono); font-size: 9px; letter-spacing: 1px;
    cursor: pointer; padding: 0; margin-right: 10px;
  }
  .rd-back:hover { color: var(--ba-gold); }
`;

export const fmtShortDate = (iso) => {
  if (!iso) return '--------';
  const [y, m, d] = iso.split('-');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${d} ${months[Number(m) - 1] || '???'} ${y}`;
};

const buildTransmitText = (history) => {
  const lines = [`RECOVERY MANIFEST — ${history.tag.toUpperCase()}`, ''];
  const descWidth = Math.min(
    28, Math.max(12, ...history.entries.map(e => e.description.length))
  );
  history.entries.forEach(e => {
    const desc = e.description.length > descWidth
      ? e.description.slice(0, descWidth - 1) + '…'
      : e.description.padEnd(descWidth);
    const amt = `${e.signed >= 0 ? '+' : '-'}${Math.abs(e.signed).toLocaleString()}`;
    lines.push(`${fmtShortDate(e.date)}  ${desc}  ${amt}`);
  });
  lines.push('');
  lines.push(`CHARGED ${Math.round(history.totalCharged).toLocaleString()} | RECOVERED ${Math.round(history.totalReceived).toLocaleString()}`);
  lines.push(`OUTSTANDING: ${Math.round(history.outstanding).toLocaleString()}`);
  return lines.join('\n');
};

// mode: open with a tag → statement view. Open with tag=null → archive
// picker (settled/overpaid tags the manifest no longer shows).
const RecoveryDossier = ({ tag, onClose, dbTransactions, userId }) => {
  // Ledger chips carry the tag as typed; aggregation is lowercase.
  const [activeTag, setActiveTag]   = useState(tag ? tag.toString().toLowerCase().trim() : null);
  const [history, setHistory]       = useState(null);
  const [archive, setArchive]       = useState(null);
  const [transmitted, setTransmitted] = useState(false);
  const fromArchive = !tag;

  const loadHistory = useCallback(async (t) => {
    setHistory(null);
    const h = await AREngine.getTagHistory(dbTransactions, userId, t);
    setHistory(h);
  }, [dbTransactions, userId]);

  useEffect(() => {
    if (activeTag) { loadHistory(activeTag); return; }
    (async () => {
      const balances = await AREngine.getAllTagBalances(dbTransactions, userId);
      setArchive(
        Object.entries(balances)
          .filter(([, bal]) => bal <= 0)
          .sort((a, b) => a[0].localeCompare(b[0]))
      );
    })();
  }, [activeTag, dbTransactions, userId, loadHistory]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleTransmit = async () => {
    if (!history) return;
    try {
      await navigator.clipboard.writeText(buildTransmitText(history));
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
            {fromArchive && activeTag && (
              <button className="rd-back" onClick={() => { setActiveTag(null); setHistory(null); }}>◄ ARCHIVE</button>
            )}
            {activeTag
              ? <>RECOVERY LEDGER // <span className="rd-tag-name">{activeTag}</span></>
              : 'ARCHIVED DEBTS // SETTLED RECORDS'}
          </span>
          <button className="rd-x" onClick={onClose}>TERMINATE</button>
        </div>

        {/* ── Archive picker ── */}
        {!activeTag && (
          <div className="rd-scroll" style={{ padding: '6px 16px 14px' }}>
            {archive === null ? (
              <div className="rd-empty">ACCESSING ARCHIVES...</div>
            ) : archive.length === 0 ? (
              <div className="rd-empty">NO SETTLED RECORDS ON FILE</div>
            ) : archive.map(([t, bal]) => (
              <div key={t} className="rd-arch-row" onClick={() => setActiveTag(t)}>
                <span className="rd-arch-tag">{t}</span>
                <span className={`rd-arch-state ${bal < 0 ? 'overpaid' : ''}`}>
                  {bal < 0 ? `OVERPAID ${Math.abs(Math.round(bal)).toLocaleString()}` : 'DEBT ABSOLVED'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Statement ── */}
        {activeTag && (
          history === null ? (
            <div className="rd-empty">ACCESSING ARCHIVES...</div>
          ) : (
            <>
              <div className="rd-cols">
                <span>DATE STAMP</span><span>DESIGNATION</span>
                <span style={{ textAlign: 'right' }}>DEBT</span>
                <span style={{ textAlign: 'right' }}>BALANCE</span>
              </div>
              <div className="rd-scroll">
                {history.entries.length === 0 ? (
                  <div className="rd-empty">NO RECORDS BEAR THIS DESIGNATION</div>
                ) : history.entries.map((e, i) => (
                  <div key={e.txnId} className="rd-row" style={{ animationDelay: `${Math.min(i * 0.03, 0.4)}s` }}>
                    <span className="rd-date">{fmtShortDate(e.date)}</span>
                    <span className="rd-desc" title={e.description}>{e.description}</span>
                    <span className={`rd-amt ${e.isReceipt ? 'receipt' : 'charge'}`}>
                      {e.signed >= 0 ? '+' : '-'}{Math.abs(Math.round(e.signed)).toLocaleString()}
                    </span>
                    <span className={`rd-run ${e.runningBalance < 0 ? 'negative' : ''}`}>
                      {Math.round(e.runningBalance).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rd-foot">
                <div className="rd-totals">
                  <span>
                    CHARGED {Math.round(history.totalCharged).toLocaleString()}
                    {' // '}RECOVERED {Math.round(history.totalReceived).toLocaleString()}
                  </span>
                  <span className={`rd-owed ${history.outstanding <= 0 ? 'settled' : ''}`}>
                    {history.outstanding > 0
                      ? `OWED ${Math.round(history.outstanding).toLocaleString()}`
                      : history.outstanding < 0
                        ? `OVERPAID ${Math.abs(Math.round(history.outstanding)).toLocaleString()}`
                        : 'DEBT ABSOLVED'}
                  </span>
                </div>
                <div className="rd-actions">
                  <button
                    className={`rd-btn ${transmitted ? 'done' : ''}`}
                    onClick={handleTransmit}
                    disabled={transmitted || history.entries.length === 0}
                  >
                    {transmitted ? 'MANIFEST TRANSMITTED ◈' : 'TRANSMIT MANIFEST'}
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
};

export default RecoveryDossier;
