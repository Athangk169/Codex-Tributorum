// src/components/slides/MobileLiquidity.jsx
import React, { useState, useEffect } from 'react';
import { CardEngine, AccountEngine } from '../../../utils/engine';
import ScrambleText from '../../shared/ScrambleText';

const MobileLiquidity = ({ data, dbTransactions, dbMetadata, userId }) => {
  const cards = data?.cards || [];

  // ── STATE ──
  const [activeCardId, setActiveCardId] = useState('');
  const [localBuckets, setLocalBuckets] = useState([]);
  const [localCardInfo, setLocalCardInfo] = useState({});
  const [localCredit, setLocalCredit] = useState(0);
  const [isManaging, setIsManaging] = useState(false);
  const [showCardSelect, setShowCardSelect] = useState(false);

  // Initialise default card
  useEffect(() => {
    if (!activeCardId && cards.length > 0) {
      const defCard = cards.find(c => c.is_default) || cards[0];
      setActiveCardId(defCard._id);
    }
  }, [cards, activeCardId]);

  // Recompute buckets on card / db change
  useEffect(() => {
    const fetchBuckets = async () => {
      if (!dbTransactions || !dbMetadata || !activeCardId) {
        setLocalBuckets(data?.cardObligations?.buckets || []);
        setLocalCardInfo(data?.cardObligations?.card || {});
        setLocalCredit(data?.cardObligations?.creditBalance || 0);
        return;
      }
      const res = await CardEngine.buildBuckets(dbTransactions, dbMetadata, userId, activeCardId);
      setLocalBuckets(res.buckets || []);
      setLocalCardInfo(res.card || {});
      setLocalCredit(res.creditBalance || 0);
    };
    fetchBuckets();
  }, [activeCardId, data, dbTransactions, dbMetadata, userId]);

  // ── CARD MANAGEMENT STATE (V2 SCHEMA) ──
  const initialForm = { _docId: '', name: '', billing_day: 15, due_day: 5, due_month_offset: 1, limit: 100000, is_default: false };
  const [form, setForm] = useState(initialForm);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleSaveCard = async (e) => {
    e.preventDefault();
    if (!dbMetadata || !userId) return;
    try {
      if (form._docId) {
        const doc = await dbMetadata.get(form._docId);
        if (form.is_default && !doc.is_default) {
          const existing = await AccountEngine.getCards(dbMetadata, userId);
          for (const card of existing) {
            if (card._id !== form._docId && card.is_default)
              await dbMetadata.put({ ...card, is_default: false });
          }
        }
        await dbMetadata.put({
          ...doc,
          name: form.name, billing_day: form.billing_day,
          due_day: form.due_day, due_month_offset: form.due_month_offset,
          limit: form.limit, is_default: form.is_default,
          updated: new Date().toISOString(),
        });
      } else {
        await AccountEngine.addCard(form, dbMetadata, userId);
      }
      setForm(initialForm);
    } catch (err) { console.error('Failed to save card config:', err); }
  };

  const handleDeleteCard = async (cardDocId) => {
    if (!dbMetadata || !userId) return;
    try { await AccountEngine.deleteCard(cardDocId, dbMetadata, userId); }
    catch (err) { console.error('Purge failed:', err); }
  };

  // ── FORMATTERS ──
  const formatTemporalDate = (dateString) => {
    if (!dateString) return 'NO DEBT DETECTED';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'long' });
    const suffix = ['th', 'st', 'nd', 'rd'];
    const v = day % 100;
    return `${day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])} ${month}`;
  };

  // ── METRICS ──
  const nextBucket = localBuckets.find(b => b.status !== 'paid') || {};
  const today = new Date();
  const dueDate = nextBucket.due_date ? new Date(nextBucket.due_date) : null;
  const daysRemaining = dueDate
    ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : '--';
  const isCritical = daysRemaining !== '--' && daysRemaining <= 5;
  const totalOutstanding = localBuckets.reduce((acc, b) => acc + b.outstanding, 0);
  // Net position: outstanding debt minus prepayment credit. Negative
  // when the card is prepaid (paid beyond all billed debt).
  const netDebt = totalOutstanding - localCredit;
  const isPrepaid = netDebt < 0;
  const limitPct = localCardInfo.limit ? Math.min(100, (Math.max(0, netDebt) / localCardInfo.limit) * 100) : 0;
  const isLimitCritical = limitPct >= 80;

  const activeCard = cards.find(c => c._id === activeCardId);

  return (
    <div className="slide-container active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', gap: '10px', padding: '10px' }}>

      <style>{`
        /* ── Spin button purge ── */
        .mech-input[type="number"]::-webkit-outer-spin-button,
        .mech-input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .mech-input[type="number"] { -moz-appearance: textfield; }

        /* ── Mobile select ── */
        .mech-select, .mech-select option { background-color: #0a0a0a !important; color: #ccc !important; font-family: var(--mono); }

        /* ── Tactical row hover ── */
        .manifest-row { transition: background 0.2s ease; }
        .manifest-row:active { background: rgba(200, 34, 0, 0.12); }

        /* ── Assimilation entrance ── */
        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .assimilate-in { animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; opacity: 0; }

        /* ── Tithe pulse ── */
        @keyframes tithePulse {
          0%, 100% { box-shadow: 0 0 10px rgba(204,34,0,0.5); background: var(--ba-crimson); }
          50%       { box-shadow: 0 0 25px rgba(204,34,0,1);   background: #ff4422; }
        }

        /* ── Card selector dropdown (mobile) ── */
        .card-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
          border: 1px solid var(--ba-border); background: var(--ba-bg-panel);
          box-shadow: 0 4px 20px rgba(0,0,0,0.8);
        }
        .card-dropdown-item {
          padding: 10px 14px; font-size: 11px; font-family: var(--mono);
          color: #ccc; cursor: pointer; border-bottom: 1px solid var(--ba-border-lo);
          transition: background 0.15s ease;
        }
        .card-dropdown-item:last-child { border-bottom: none; }
        .card-dropdown-item.active-card { color: var(--ba-gold); }
        .card-dropdown-item:active { background: rgba(200,34,0,0.1); }
        .card-select-rune {
          display: inline-flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; flex: 0 0 18px;
          border: 1px solid var(--ba-border);
          color: var(--ba-gold); font-size: 10px; line-height: 1;
          box-shadow: inset 0 0 8px rgba(201,168,76,0.12), 0 0 8px rgba(201,168,76,0.08);
        }
        .card-select-rune.open {
          border-color: var(--ba-gold);
          background: rgba(201,168,76,0.08);
          text-shadow: 0 0 8px rgba(201,168,76,0.8);
        }

        /* ── Bucket status badge ── */
        .status-badge {
          display: inline-block; padding: 2px 6px; font-size: 9px; letter-spacing: 0.05em;
          font-family: var(--mono); font-weight: bold; border-radius: 2px;
        }
        .status-paid    { background: rgba(34,200,80,0.15);  color: #22c85a; border: 1px solid rgba(34,200,80,0.3);  }
        .status-pending { background: rgba(200,170,0,0.15);  color: var(--ba-gold); border: 1px solid rgba(200,170,0,0.3); }
        .status-overdue { background: rgba(200,34,0,0.2);    color: var(--ba-crimson); border: 1px solid rgba(200,34,0,0.4); }
      `}</style>

      {/* ════════════ TOP CONTROL BAR ════════════ */}
      <div className="panel mech-panel" style={{ padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="sec-ttl" style={{ margin: 0, border: 'none', color: 'var(--ba-crimson)', fontSize: '11px' }}>
            BLOOD DEBT AUSPEX
          </span>
          <button
            className="mech-btn"
            style={{ marginTop: 0, padding: '5px 10px', width: 'auto', fontSize: '10px', background: isManaging ? 'var(--ba-crimson)' : 'rgba(204,34,0,0.15)', borderColor: 'var(--ba-crimson)', color: '#fff' }}
            onClick={() => { setIsManaging(!isManaging); setShowCardSelect(false); }}
          >
            {isManaging ? '[ AUSPEX ]' : '[ CONFIG ]'}
          </button>
        </div>

        {/* Card selector — only in dashboard mode */}
        {!isManaging && (
          <div style={{ position: 'relative', marginTop: '10px' }}>
            <button
              style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--ba-border)', color: '#ccc', fontFamily: 'var(--mono)', fontSize: '11px', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setShowCardSelect(s => !s)}
            >
              <span>{activeCard ? `${activeCard.name}${activeCard.is_default ? ' [PRI]' : ''}` : 'NO CARD SELECTED'}</span>
              <span className={`card-select-rune ${showCardSelect ? 'open' : ''}`} aria-hidden="true">
                {showCardSelect ? '◈' : '◇'}
              </span>
            </button>
            {showCardSelect && (
              <div className="card-dropdown">
                {cards.length > 0 ? cards.map(c => (
                  <div
                    key={c._id}
                    className={`card-dropdown-item ${c._id === activeCardId ? 'active-card' : ''}`}
                    onClick={() => { setActiveCardId(c._id); setShowCardSelect(false); }}
                  >
                    {c.name} {c.is_default && <span style={{ color: 'var(--ba-gold)', fontSize: '9px' }}>[PRI]</span>}
                    <span style={{ float: 'right', color: 'var(--text-d)' }}>{c.limit ? (c.limit / 1000).toFixed(0) + 'k' : '--'}</span>
                  </div>
                )) : (
                  <div className="card-dropdown-item">NO LINES CONFIGURED</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════ MODE: CONFIGURATION ════════════ */}
      {isManaging ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

          {/* Add / Edit Form */}
          <div className="panel mech-panel" style={{ padding: '14px' }}>
            <div className="sec-ttl" style={{ fontSize: '10px' }}>{form._docId ? 'RECALIBRATE LINE' : 'REGISTER NEW LINE'}</div>
            <form onSubmit={handleSaveCard} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              <div>
                <label className="kpi-lbl" style={{ fontSize: '9px' }}>DESIGNATION</label>
                <input type="text" name="name" value={form.name} onChange={handleInputChange} className="mech-input" required placeholder="e.g. HDFC Infinia" autoComplete="off" style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label className="kpi-lbl" style={{ fontSize: '9px' }}>BILLING DAY</label>
                  <input type="number" name="billing_day" value={form.billing_day} onChange={handleInputChange} className="mech-input" min="1" max="31" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="kpi-lbl" style={{ fontSize: '9px' }}>DUE DAY</label>
                  <input type="number" name="due_day" value={form.due_day} onChange={handleInputChange} className="mech-input" min="1" max="31" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label className="kpi-lbl" style={{ fontSize: '9px' }}>DUE MONTH OFFSET</label>
                  <input type="number" name="due_month_offset" value={form.due_month_offset} onChange={handleInputChange} className="mech-input" min="0" max="3" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="kpi-lbl" style={{ fontSize: '9px' }}>YIELD LIMIT</label>
                  <input type="number" name="limit" value={form.limit} onChange={handleInputChange} className="mech-input" min="0" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" name="is_default" checked={form.is_default} onChange={(e) => setForm(p => ({ ...p, is_default: e.target.checked }))} id="mob-default" />
                <label htmlFor="mob-default" className="kpi-lbl" style={{ fontSize: '9px', cursor: 'pointer' }}>SET AS PRIMARY</label>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="mech-btn" style={{ flex: 1, marginTop: 0, fontSize: '10px', padding: '8px' }}>
                  {form._docId ? '[ UPDATE ]' : '[ REGISTER ]'}
                </button>
                {form._docId && (
                  <button type="button" className="mech-btn" style={{ marginTop: 0, fontSize: '10px', padding: '8px 12px', background: 'rgba(200,34,0,0.15)', borderColor: 'var(--ba-crimson)', color: 'var(--ba-crimson)' }}
                    onClick={() => setForm(initialForm)}>
                    CANCEL
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Registered Lines List */}
          <div className="panel mech-panel" style={{ padding: '14px', flex: 1 }}>
            <div className="sec-ttl" style={{ fontSize: '10px' }}>REGISTERED LINES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {cards.length > 0 ? cards.map((c, i) => (
                <div key={c._id} className="assimilate-in" style={{ animationDelay: `${i * 0.05}s`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--ba-border-lo)', background: 'rgba(0,0,0,0.3)' }}>
                  <div>
                    <span style={{ color: '#fff', fontSize: '11px' }}>{c.name}</span>
                    {c.is_default && <span style={{ color: 'var(--ba-gold)', fontSize: '9px', marginLeft: '6px' }}>[PRI]</span>}
                    <div style={{ fontSize: '10px', color: 'var(--text-d)', marginTop: '2px' }}>
                      {c.limit ? (c.limit / 1000).toFixed(0) + 'k' : '--'} · BILL {c.billing_day} / DUE {c.due_day}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="action-btn" style={{ fontSize: '9px' }} onClick={() => setForm({ _docId: c._id, name: c.name, billing_day: c.billing_day, due_day: c.due_day, due_month_offset: c.due_month_offset, limit: c.limit || 0, is_default: !!c.is_default })}>EDIT</button>
                    <button className="action-btn del" style={{ fontSize: '9px' }} onClick={() => handleDeleteCard(c._id)}>DEL</button>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-d)', fontSize: '11px' }}>NO LINES CONFIGURED</div>
              )}
            </div>
          </div>

        </div>

      ) : (
        /* ════════════ MODE: DASHBOARD ════════════ */
        <>
          {/* ── NEXT RITUAL DUE ── */}
          <div className="panel mech-panel" style={{ padding: '14px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '8px', marginBottom: '12px' }}>
              <span className="sec-ttl" style={{ border: 'none', margin: 0, padding: 0, fontSize: '10px' }}>NEXT RITUAL DUE</span>
              <span className={`status-led ${nextBucket.status === 'overdue' || isCritical ? 'warn pulse' : 'ok'}`} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>TARGET DATE</div>
                <div style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {formatTemporalDate(nextBucket.due_date)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'var(--ba-crimson)', marginBottom: '4px', fontWeight: 'bold' }}>REQUIRED TITHE</div>
                <div className={nextBucket.outstanding > 0 ? 'warn pulse' : 'ok'} style={{ fontSize: '22px', fontWeight: 'bold' }}>
                  <ScrambleText text={(nextBucket.outstanding || 0).toLocaleString()} />
                </div>
              </div>
            </div>

            {/* Temporal gauge */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '5px' }}>
                <span>TEMPORAL WINDOW</span>
                <span className={isCritical ? 'warn blink' : 'ok'}>
                  {daysRemaining === '--' ? '--' : `${daysRemaining} DAYS`}
                </span>
              </div>
              <div className="bar-track" style={{ height: '8px', background: 'rgba(0,0,0,0.8)', border: isCritical ? '1px solid var(--ba-crimson)' : '1px solid var(--border)' }}>
                <div className="bar-fill" style={{
                  width: daysRemaining === '--' ? '0%' : `${Math.max(0, Math.min(100, (daysRemaining / 30) * 100))}%`,
                  background: isCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                  boxShadow: isCritical ? 'none' : 'var(--glow)',
                  animation: isCritical ? 'tithePulse 1s ease-in-out infinite alternate' : 'none',
                  transition: 'width 1s ease-in-out'
                }} />
              </div>
            </div>
          </div>

          {/* ── LIQUIDITY PARAMETERS ── */}
          <div className="panel mech-panel" style={{ padding: '14px', flexShrink: 0 }}>
            <div className="sec-ttl" style={{ fontSize: '10px' }}>LIQUIDITY PARAMETERS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>

              <div className="row" style={{ padding: 0 }}>
                <span className="rl">ACTIVE LINE</span>
                <span className="rv" style={{ color: '#fff' }}>{localCardInfo.name || 'UNKNOWN'}</span>
              </div>
              <div className="row" style={{ padding: 0 }}>
                <span className="rl">BILLING ANCHOR</span>
                <span className="rv">{localCardInfo.billing_day || '--'}th of Month</span>
              </div>
              <div className="row" style={{ padding: 0 }}>
                <span className="rl">YIELD LIMIT</span>
                <span className="rv">{localCardInfo.limit ? localCardInfo.limit.toLocaleString() : 'UNSET'}</span>
              </div>
              <div className="row" style={{ padding: 0, marginTop: '6px', borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '10px' }}>
                <span className="rl" style={{ fontSize: '12px', color: 'var(--ba-gold-dim)' }}>
                  {isPrepaid ? 'PREPAID CREDIT' : 'TOTAL PENDING DEBT'}
                </span>
                <span className="rv" style={{
                  fontSize: '16px', fontWeight: 'bold',
                  color: isPrepaid ? 'var(--ba-gold)' : 'var(--ba-crimson)',
                  textShadow: isPrepaid ? '0 0 8px rgba(201,168,76,0.5)' : 'none',
                }}>
                  <ScrambleText text={`${isPrepaid ? '+' : ''}${Math.abs(netDebt).toLocaleString()}`} />
                </span>
              </div>

              {/* Utilization bar */}
              {localCardInfo.limit > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>
                    <span>LINE UTILIZATION</span>
                    <span className={isLimitCritical ? 'warn blink' : 'ok'} style={{ color: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)' }}>
                      {limitPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="bar-track" style={{ height: '6px', background: 'rgba(0,0,0,0.8)', border: isLimitCritical ? '1px solid var(--ba-crimson)' : '1px solid var(--border)' }}>
                    <div className="bar-fill" style={{
                      width: `${limitPct}%`,
                      background: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                      boxShadow: isLimitCritical ? '0 0 8px var(--ba-crimson)' : 'var(--glow)',
                      transition: 'width 1s ease-in-out'
                    }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── OBLIGATION MANIFEST ── */}
          <div className="panel mech-panel" style={{ padding: '14px', flex: 1 }}>
            <div className="sec-ttl" style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>OBLIGATION MANIFEST</span>
              <span style={{ color: 'var(--ba-gold-mute)', fontWeight: 'normal' }}>
                {localBuckets.length} BUCKET{localBuckets.length !== 1 ? 'S' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {localBuckets.length > 0 ? (
                localBuckets.map((b, i) => (
                  <div
                    key={i}
                    className="manifest-row assimilate-in"
                    style={{
                      animationDelay: `${Math.min(i * 0.05, 0.4)}s`,
                      padding: '10px',
                      border: b.status === 'overdue' ? '1px solid rgba(204,34,0,0.4)' : '1px solid var(--ba-border-lo)',
                      background: b.status === 'overdue' ? 'rgba(204,34,0,0.08)' : 'rgba(0,0,0,0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-d)', textTransform: 'uppercase' }}>
                        {b.due_date ? formatTemporalDate(b.due_date) : 'UNDATED'}
                      </span>
                      <span className={`status-badge status-${b.status || 'pending'}`}>
                        {(b.status || 'PENDING').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-d)' }}>OUTSTANDING TITHE</span>
                      <span className={b.status === 'overdue' ? 'warn' : 'ok'} style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        <ScrambleText text={(b.outstanding || 0).toLocaleString()} />
                      </span>
                    </div>
                  </div>
                ))
              ) : isPrepaid ? (
                <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--ba-gold)', textShadow: '0 0 8px rgba(201,168,76,0.5)', border: '1px dashed var(--ba-border-lo)' }}>
                  <ScrambleText text={`// CREDIT +${localCredit.toLocaleString()} HELD IN ADVANCE //`} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', fontSize: '11px', color: 'var(--text-d)', border: '1px dashed var(--ba-border-lo)' }}>
                  <ScrambleText text="// ZERO BLOOD DEBT DETECTED //" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MobileLiquidity;
