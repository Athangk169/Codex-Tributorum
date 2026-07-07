// src/components/slides/ProvisionsSlide.jsx
// ─────────────────────────────────────────────────────────────
// MUNITORUM — Provision Vaults
//
// The ledger's Provisions bucket (fed by the "Provisions" route,
// drained by "Provision Sweep") is the pool of money actually
// parked in FDs at the bank. This slide layers meaning on top:
// named vaults (China Trip, General…) funded by append-only
// movement entries between the UNALLOCATED pool and each vault.
//
// Unallocated is derived, never stored:
//   unallocated = ledger pool − Σ vault balances
// Negative unallocated ⇒ vaults claim more than the ledger holds
// (a sweep was logged but nothing redeemed here yet, or vice
// versa) and the header flags it until both halves reconcile.
//
// Desktop-only slide — mobile logs provision txns via its normal
// ledger; allocation happens here.
// ─────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ProvisionEngine } from '../../utils/engine';
import { localDateStr } from '../../utils/localDate';
import ScrambleText from '../shared/ScrambleText';

const UNALLOC = 'unallocated';

const fmtDay = (ds) => {
  if (!ds) return '--';
  const d = new Date(ds);
  if (isNaN(d.getTime())) return ds;
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
};

const emptyAction = { bucketId: null, mode: null, amount: '', date: '', maturity: '', note: '' };

const ProvisionsSlide = ({ data, dbMetadata, userId }) => {
  const poolTotal = data?.buckets?.Provisions || 0;

  const [bucketDocs, setBucketDocs] = useState([]);
  const [movements,  setMovements]  = useState([]);
  const [tick,       setTick]       = useState(0);

  const [bucketForm, setBucketForm] = useState(null);   // null | {name, target}
  const [action,     setAction]     = useState(emptyAction);

  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!dbMetadata || !userId) return;
    let alive = true;
    (async () => {
      const [docs, moves] = await Promise.all([
        ProvisionEngine.getAll(dbMetadata, userId),
        ProvisionEngine.getMovements(dbMetadata, userId),
      ]);
      if (!alive) return;
      setBucketDocs(docs);
      setMovements(moves);
    })();
    return () => { alive = false; };
  }, [dbMetadata, userId, tick, data]);

  const { byBucket, allocated, unallocated } = useMemo(
    () => ProvisionEngine.computeAllocation(bucketDocs, movements, poolTotal),
    [bucketDocs, movements, poolTotal]
  );
  const overAllocated = unallocated < 0;
  const today = localDateStr();

  // ── Actions ──
  const handleAddBucket = async (e) => {
    e.preventDefault();
    if (!bucketForm?.name?.trim()) return;
    await ProvisionEngine.add(bucketForm.name.trim(), Number(bucketForm.target) || null, dbMetadata, userId);
    setBucketForm(null);
    reload();
  };

  const handlePurge = async (bucketId) => {
    const b = byBucket[bucketId];
    if (!b || Math.round(b.balance) !== 0) return;   // never purge a funded vault
    await ProvisionEngine.remove(b.doc._id, dbMetadata, userId);
    reload();
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    const { bucketId, mode, amount, date, maturity, note } = action;
    if (!bucketId || !amount) return;
    await ProvisionEngine.addMovement({
      from:         mode === 'consign' ? UNALLOC : bucketId,
      to:           mode === 'consign' ? bucketId : UNALLOC,
      amount:       Number(amount),
      date:         date || today,
      note,
      maturityDate: mode === 'consign' ? (maturity || null) : null,
    }, dbMetadata, userId);
    setAction(emptyAction);
    reload();
  };

  const handleRedeem = async (entry) => {
    await ProvisionEngine.redeemMovement(entry._id, dbMetadata, userId);
    reload();
  };

  const bucketIds = Object.keys(byBucket)
    .sort((a, b) => (byBucket[a].doc.created || '').localeCompare(byBucket[b].doc.created || ''));

  return (
    <div className="slide-container active" style={{ height: '100%' }}>
      <style>{`
        .prov-root { display: grid; grid-template-rows: auto 1fr; height: 100%; gap: 10px; }
        .prov-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 10px;
          overflow-y: auto;
          align-content: start;
          padding-right: 4px;
          min-height: 0;
        }
        .prov-stat { text-align: right; }
        .prov-stat .kpi-lbl { margin-bottom: 2px; }
        .prov-entry { transition: background 0.2s; }
        .prov-entry:hover { background: rgba(200,34,0,0.08); }
        .prov-entry-dim td { color: var(--text-d) !important; opacity: 0.55; }
        .prov-mini-form input { margin-bottom: 0; }
        @keyframes maturedPulse {
          0%,100% { box-shadow: 0 0 4px rgba(204,34,0,0.4); }
          50%     { box-shadow: 0 0 12px rgba(204,34,0,0.9); }
        }
        .prov-matured { animation: maturedPulse 1.2s ease-in-out infinite; }
        @keyframes dataAssimilate {
          from { opacity: 0; transform: translateY(-6px); filter: brightness(2); }
          to   { opacity: 1; transform: translateY(0);    filter: brightness(1); }
        }
        .assimilate-in { animation: dataAssimilate 0.35s cubic-bezier(0.1,0.9,0.2,1) forwards; opacity: 0; }
        .prov-panel-shine::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
          background-size: 200% 100%;
          animation: plasmaShimmerProv 5s linear infinite;
        }
        @keyframes plasmaShimmerProv {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>

      <div className="prov-root">

        {/* ── TOP BAR: title + pool metrics + establish ── */}
        <div className="panel mech-panel prov-panel-shine" style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', gap: '20px', position: 'relative', flexShrink: 0 }}>
          <div className="sec-ttl" style={{ margin: 0, border: 'none', color: 'var(--ba-crimson)', flexShrink: 0, paddingRight: '10px', borderRight: '1px solid var(--ba-border)' }}>
            MUNITORUM
          </div>

          <div style={{ display: 'flex', gap: '26px', flex: 1, alignItems: 'center' }}>
            <div className="prov-stat" style={{ textAlign: 'left' }}>
              <div className="kpi-lbl">RESERVE POOL // LEDGER</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: '#fff' }}>
                <ScrambleText text={poolTotal.toLocaleString()} />
              </div>
            </div>
            <div className="prov-stat" style={{ textAlign: 'left' }}>
              <div className="kpi-lbl">CONSIGNED TO VAULTS</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: 'var(--ba-gold-dim)' }}>
                <ScrambleText text={allocated.toLocaleString()} />
              </div>
            </div>
            <div className="prov-stat" style={{ textAlign: 'left' }}>
              <div className="kpi-lbl" style={{ color: overAllocated ? 'var(--ba-crimson)' : undefined }}>
                {overAllocated ? 'OVER-ALLOCATED' : 'UNALLOCATED'}
              </div>
              <div className={overAllocated ? 'warn blink' : ''} style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: overAllocated ? 'var(--ba-crimson)' : 'var(--ba-gold)' }}>
                <ScrambleText text={`${overAllocated ? '−' : ''}${Math.abs(unallocated).toLocaleString()}`} />
              </div>
            </div>
            {overAllocated && (
              <div style={{ fontSize: '9px', color: 'var(--ba-crimson)', fontFamily: 'var(--mono)', maxWidth: '260px', lineHeight: 1.5 }}>
                // VAULTS CLAIM MORE THAN THE LEDGER HOLDS — REDEEM OR RECLAIM THE SWEPT SUM //
              </div>
            )}
          </div>

          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button
              className="mech-btn"
              style={{ marginTop: 0, padding: '5px 15px', width: 'auto', background: bucketForm ? 'var(--ba-crimson)' : 'rgba(204,34,0,0.15)', borderColor: 'var(--ba-crimson)', color: '#fff' }}
              onClick={() => setBucketForm(bucketForm ? null : { name: '', target: '' })}
            >
              {bucketForm ? '[ ABORT ]' : '[ ESTABLISH VAULT ]'}
            </button>
          </div>
        </div>

        {/* ── VAULT GRID ── */}
        <div className="prov-grid">

          {/* Establish form card */}
          {bucketForm && (
            <div className="panel mech-panel assimilate-in" style={{ padding: '16px', border: '1px solid var(--ba-gold-dim)' }}>
              <div className="sec-ttl">ESTABLISH NEW VAULT</div>
              <form onSubmit={handleAddBucket} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label className="kpi-lbl">DESIGNATION</label>
                  <input type="text" className="mech-input" value={bucketForm.name} autoFocus required
                         placeholder="e.g. China Trip"
                         onChange={e => setBucketForm({ ...bucketForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="kpi-lbl">TARGET SUM (OPTIONAL)</label>
                  <input type="number" className="mech-input" value={bucketForm.target} min="0"
                         placeholder="e.g. 200000"
                         onChange={e => setBucketForm({ ...bucketForm, target: e.target.value })} />
                </div>
                <button type="submit" className="mech-btn" style={{ borderColor: 'var(--ba-gold)' }}>SANCTION VAULT</button>
              </form>
            </div>
          )}

          {bucketIds.map((id, idx) => {
            const b       = byBucket[id];
            const target  = b.doc.target_amount || 0;
            const pct     = target ? Math.min(100, (b.balance / target) * 100) : 0;
            const entries = [...b.entries].reverse();   // newest first
            const acting  = action.bucketId === id ? action : null;

            return (
              <div key={id} className="panel mech-panel assimilate-in" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', animationDelay: `${Math.min(idx * 0.05, 0.4)}s`, position: 'relative' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '8px', marginBottom: '10px' }}>
                  <div>
                    <div className="sec-ttl" style={{ border: 'none', margin: 0, padding: 0 }}>{b.doc.name?.toUpperCase()}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-d)', fontFamily: 'var(--mono)' }}>
                      EST. {fmtDay(b.doc.created)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: b.balance > 0 ? 'var(--ba-gold)' : 'var(--text-d)', textShadow: b.balance > 0 ? '0 0 8px rgba(201,168,76,0.4)' : 'none' }}>
                      <ScrambleText text={b.balance.toLocaleString()} />
                    </div>
                  </div>
                </div>

                {/* Target progress */}
                {target > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>
                      <span>TARGET {target.toLocaleString()}</span>
                      <span style={{ color: pct >= 100 ? 'var(--ba-gold)' : 'var(--ba-gold-dim)' }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="bar-track" style={{ height: '6px', background: 'rgba(0,0,0,0.8)', border: '1px solid var(--border)' }}>
                      <div className="bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--ba-gold)' : 'var(--ba-gold-dim)', boxShadow: 'var(--glow)', transition: 'width 1s ease-in-out' }} />
                    </div>
                  </div>
                )}

                {/* Movement history */}
                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '190px', paddingRight: '4px', marginBottom: '10px' }}>
                  <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {entries.length > 0 ? entries.map(mv => {
                        const isFd      = !!mv.maturity_date && mv.signed > 0;
                        const redeemed  = mv.status === 'redeemed';
                        const matured   = isFd && !redeemed && mv.maturity_date <= today;
                        return (
                          <tr key={`${mv._id}-${mv.signed}`} className={`prov-entry ${redeemed ? 'prov-entry-dim' : ''}`}>
                            <td style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--text-d)', whiteSpace: 'nowrap', padding: '6px 4px' }}>
                              {fmtDay(mv.date)}
                            </td>
                            <td style={{ fontSize: '10px', color: 'var(--ba-gold-mute)', padding: '6px 4px' }}>
                              {mv.note || (mv.signed > 0 ? 'CONSIGNED' : 'RECLAIMED')}
                              {isFd && (
                                <span className={`n-badge ${matured ? 'n-badge-crit prov-matured' : redeemed ? '' : 'n-badge-tx'}`} style={{ width: 'auto', padding: '2px 6px', marginLeft: '6px', fontSize: '8px' }}>
                                  {redeemed ? 'REDEEMED' : matured ? 'MATURED' : `MAT ${fmtDay(mv.maturity_date)}`}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 'bold', whiteSpace: 'nowrap', padding: '6px 4px', color: redeemed ? 'var(--text-d)' : mv.signed > 0 ? 'var(--ba-gold-dim)' : 'var(--ba-crimson)' }}>
                              {mv.signed > 0 ? '+' : '−'}{Math.abs(mv.signed).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 0 6px 4px', whiteSpace: 'nowrap' }}>
                              {isFd && !redeemed && (
                                <button className="action-btn del" style={matured ? { borderColor: 'var(--ba-crimson)', color: '#fff' } : {}} onClick={() => handleRedeem(mv)}>
                                  REDEEM
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td style={{ textAlign: 'center', padding: '16px', fontSize: '10px', color: 'var(--ba-border)', fontFamily: 'var(--mono)' }}>// VAULT EMPTY // CONSIGN FUNDS //</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Inline consign / reclaim form */}
                {acting ? (
                  <form onSubmit={handleMovement} className="prov-mini-form" style={{ borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label className="kpi-lbl">{acting.mode === 'consign' ? 'SUM TO CONSIGN' : 'SUM TO RECLAIM'}</label>
                        <input type="number" className="mech-input" value={acting.amount} min="1" required autoFocus
                               onChange={e => setAction({ ...acting, amount: e.target.value })} />
                      </div>
                      <div>
                        <label className="kpi-lbl">DATE</label>
                        <input type="date" className="mech-input" value={acting.date || today}
                               onChange={e => setAction({ ...acting, date: e.target.value })} />
                      </div>
                    </div>
                    {acting.mode === 'consign' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="kpi-lbl">FD MATURITY (OPTIONAL)</label>
                          <input type="date" className="mech-input" value={acting.maturity}
                                 onChange={e => setAction({ ...acting, maturity: e.target.value })} />
                        </div>
                        <div>
                          <label className="kpi-lbl">NOTE</label>
                          <input type="text" className="mech-input" value={acting.note} placeholder="e.g. SBI FD @7.2%"
                                 onChange={e => setAction({ ...acting, note: e.target.value })} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="mech-btn" style={{ marginTop: 0, background: 'transparent', color: 'var(--text-d)', borderColor: 'var(--ba-border)' }} onClick={() => setAction(emptyAction)}>ABORT</button>
                      <button type="submit" className="mech-btn" style={{ marginTop: 0, borderColor: acting.mode === 'consign' ? 'var(--ba-gold)' : 'var(--ba-crimson)' }}>
                        {acting.mode === 'consign' ? 'COMMIT CONSIGNMENT' : 'COMMIT RECLAMATION'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '10px', display: 'flex', gap: '8px' }}>
                    <button className="mech-btn" style={{ marginTop: 0, padding: '4px 10px', width: 'auto', fontSize: '10px', borderColor: 'var(--ba-gold-dim)' }}
                            onClick={() => setAction({ ...emptyAction, bucketId: id, mode: 'consign', date: today })}>
                      + CONSIGN
                    </button>
                    <button className="mech-btn" style={{ marginTop: 0, padding: '4px 10px', width: 'auto', fontSize: '10px', background: 'transparent', color: 'var(--ba-gold-mute)', borderColor: 'var(--ba-border)' }}
                            onClick={() => setAction({ ...emptyAction, bucketId: id, mode: 'reclaim', date: today })}>
                      − RECLAIM
                    </button>
                    {Math.round(b.balance) === 0 && (
                      <button className="action-btn del" style={{ marginLeft: 'auto' }} onClick={() => handlePurge(id)}>
                        PURGE
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {bucketIds.length === 0 && !bucketForm && (
            <div className="panel mech-panel" style={{ gridColumn: '1 / -1', padding: '50px', textAlign: 'center' }}>
              <span className="blink" style={{ color: 'var(--border-hi)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                // NO VAULTS ESTABLISHED // THE MUNITORUM AWAITS YOUR SANCTION //
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProvisionsSlide;
