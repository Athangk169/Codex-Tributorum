// src/components/slides/LiquiditySlide.jsx
import React, { useState, useEffect } from 'react';
import { CardEngine, AccountEngine } from '../../utils/engine';

// ── ScrambleText ──────────────────────────────────────────────
const ScrambleText = ({ text }) => {
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    let iter = 0;
    const chars   = '01X4A8C9#F>';
    const strText = String(text);
    const iv = setInterval(() => {
      setDisplay(strText.split('').map((char, i) => {
        if (char === ' ' || char === '₹' || char === ',') return char;
        if (i < iter) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));
      if (iter >= strText.length) clearInterval(iv);
      iter += 1/4;
    }, 40);
    return () => clearInterval(iv);
  }, [text]);
  return <>{display}</>;
};

const LiquiditySlide = ({ data, dbTransactions, dbMetadata, userId }) => {
  const cards = data?.cards || [];

  const [activeCardId,  setActiveCardId]  = useState('');
  const [localBuckets,  setLocalBuckets]  = useState([]);
  const [localCardInfo, setLocalCardInfo] = useState({});
  const [isManaging,    setIsManaging]    = useState(false);

  useEffect(() => {
    if (!activeCardId && cards.length > 0) {
      const defCard = cards.find(c => c.is_default) || cards[0];
      setActiveCardId(defCard._id);
    }
  }, [cards, activeCardId]);

  useEffect(() => {
    const fetchBuckets = async () => {
      if (!dbTransactions || !dbMetadata || !activeCardId) {
        setLocalBuckets(data?.cardObligations?.buckets || []);
        setLocalCardInfo(data?.cardObligations?.card   || {});
        return;
      }
      const res = await CardEngine.buildBuckets(dbTransactions, dbMetadata, userId, activeCardId);
      setLocalBuckets(res.buckets || []);
      setLocalCardInfo(res.card   || {});
    };
    fetchBuckets();
  }, [activeCardId, data, dbTransactions, dbMetadata, userId]);

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

  const formatDate = (ds) => {
    if (!ds) return 'NO DEBT DETECTED';
    const d = new Date(ds);
    if (isNaN(d.getTime())) return ds;
    const day = d.getDate();
    const mon = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
    const sfx = ['th','st','nd','rd'];
    const v = day % 100;
    return day + (sfx[(v-20)%10] || sfx[v] || sfx[0]) + ' ' + mon;
  };

  const nextBucket      = localBuckets.find(b => b.status !== 'paid') || {};
  const dueDate         = nextBucket.due_date ? new Date(nextBucket.due_date) : null;
  const daysRemaining   = dueDate
    ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : '--';
  const isCritical      = daysRemaining !== '--' && daysRemaining <= 5;
  const totalPendingDebt = localBuckets.reduce((acc, b) => acc + b.outstanding, 0);
  const limitPct        = localCardInfo.limit
    ? Math.min(100, (totalPendingDebt / localCardInfo.limit) * 100) : 0;
  const isLimitCritical = limitPct >= 80;

  const fmtLimit = (v) => !v ? '--'
    : v >= 100000 ? (v/100000).toFixed(1) + 'L'
    : (v/1000).toFixed(0) + 'k';

  return (
    <div className="slide-container active" style={{ height: '100%' }}>
      <style>{`
        .liq-root {
          display: grid;
          grid-template-rows: auto 1fr;
          height: 100%;
          gap: 10px;
        }
        .liq-dash {
          display: grid;
          grid-template-rows: auto auto 1fr;
          gap: 10px;
          min-height: 0;
        }

        /* ── Input styles ── */
        .mech-input { border-left: 2px solid var(--border); }
        .mech-input:focus {
          border-left: 3px solid var(--ba-crimson) !important;
          border-color: var(--border-hi) !important;
        }
        .mech-input[type="number"]::-webkit-outer-spin-button,
        .mech-input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .mech-input[type="number"] { -moz-appearance: textfield; }
        .mech-select, .mech-select option, .mech-select optgroup {
          background-color: #0a0a0a !important; color: #ccc !important; font-family: var(--mono);
        }

        /* ── Card ribbon button ── */
        .card-btn {
          padding: 5px 14px;
          font-size: 10px;
          font-family: var(--mono);
          cursor: pointer;
          white-space: nowrap;
          text-transform: uppercase;
          transition: all 0.2s;
          position: relative;
          letter-spacing: 1px;
        }
        .card-btn-inactive {
          background: rgba(4,1,1,0.8);
          color: var(--ba-gold-mute);
          border: 1px solid var(--ba-border);  /* #4a0a00 — visible dark crimson */
          box-shadow: none;
        }
        .card-btn-inactive:hover {
          background: rgba(74,10,0,0.25);
          border-color: var(--ba-gold-dim);
          color: var(--ba-gold-dim);
          box-shadow: 0 0 8px rgba(201,168,76,0.15);
        }
        .card-btn-active {
          background: rgba(120,5,5,0.35);
          color: #fff;
          border: 1px solid var(--ba-crimson);
          border-top: 2px solid var(--ba-gold-dim);
          box-shadow: inset 0 0 12px rgba(204,34,0,0.2), 0 0 8px rgba(204,34,0,0.3);
          text-shadow: 0 0 8px rgba(204,34,0,0.6);
        }
        .card-btn-active .card-btn-pri {
          color: var(--ba-gold);
          text-shadow: 0 0 6px rgba(201,168,76,0.6);
        }

        /* ── Manifest rows ── */
        .manifest-row { transition: background 0.2s, box-shadow 0.2s; position: relative; }
        .manifest-row:hover { background: rgba(200,34,0,0.08); box-shadow: inset 0 0 15px rgba(200,34,0,0.15); }
        .manifest-row td:first-child { position: relative; }
        .manifest-row td:last-child  { position: relative; }
        .manifest-row:hover td:first-child::before {
          content: ''; position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px; border-top: 1px solid #cc2200; border-left: 1px solid #cc2200;
        }
        .manifest-row:hover td:last-child::after {
          content: ''; position: absolute; bottom: 4px; right: 4px;
          width: 6px; height: 6px; border-bottom: 1px solid #cc2200; border-right: 1px solid #cc2200;
        }
        @keyframes dataAssimilate {
          from { opacity: 0; transform: translateY(-6px); filter: brightness(2); }
          to   { opacity: 1; transform: translateY(0);    filter: brightness(1); }
        }
        .assimilate-in { animation: dataAssimilate 0.35s cubic-bezier(0.1,0.9,0.2,1) forwards; opacity: 0; }
        @keyframes tithePulse {
          0%,100% { box-shadow: 0 0 10px rgba(204,34,0,0.5); background: var(--ba-crimson); }
          50%     { box-shadow: 0 0 25px rgba(204,34,0,1);   background: #ff4422; }
        }
        @keyframes plasmaShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .liq-panel-shine::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
          background-size: 200% 100%;
          animation: plasmaShimmer 5s linear infinite;
        }
      `}</style>

      <div className="liq-root">

        {/* ── TOP BAR: title + card ribbon + configure ── */}
        <div className="panel mech-panel liq-panel-shine" style={{ display: 'flex', alignItems: 'center', padding: '8px 15px', gap: '16px', position: 'relative', flexShrink: 0 }}>

          {/* Title */}
          <div className="sec-ttl" style={{ margin: 0, border: 'none', color: 'var(--ba-crimson)', flexShrink: 0, paddingRight: '6px', borderRight: '1px solid var(--ba-border)' }}>
            BLOOD DEBT AUSPEX
          </div>

          {/* Card ribbon */}
          {!isManaging && (
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {cards.map(c => {
                const isActive = activeCardId === c._id;
                return (
                  <button
                    key={c._id}
                    onClick={() => setActiveCardId(c._id)}
                    className={`card-btn ${isActive ? 'card-btn-active' : 'card-btn-inactive'}`}
                  >
                    {c.name}
                    {c.is_default && (
                      <span className="card-btn-pri" style={{ marginLeft: '5px', fontSize: '8px' }}>PRI</span>
                    )}
                    {isActive && c.limit > 0 && (
                      <span style={{ marginLeft: '6px', fontSize: '8px', color: isLimitCritical ? 'var(--ba-crimson)' : 'var(--text-d)' }}>
                        {limitPct.toFixed(0)}%
                      </span>
                    )}
                  </button>
                );
              })}
              {cards.length === 0 && (
                <span style={{ fontSize: '10px', color: 'var(--ba-border)', fontFamily: 'var(--mono)' }}>// NO LINES DETECTED</span>
              )}
            </div>
          )}

          {/* Configure button */}
          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button
              className="mech-btn"
              style={{ marginTop: 0, padding: '5px 15px', width: 'auto', background: isManaging ? 'var(--ba-crimson)' : 'rgba(204,34,0,0.15)', borderColor: 'var(--ba-crimson)', color: '#fff' }}
              onClick={() => setIsManaging(!isManaging)}
            >
              {isManaging ? '[ RETURN TO AUSPEX ]' : '[ CONFIGURE ]'}
            </button>
          </div>
        </div>

        {/* ── CONTENT AREA ── */}
        {isManaging ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px', minHeight: 0 }}>

            {/* Form */}
            <div className="panel mech-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <div className="sec-ttl">{form._docId ? 'RECALIBRATE LINE' : 'REGISTER NEW CREDIT LINE'}</div>
              <form onSubmit={handleSaveCard} style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                <div>
                  <label className="kpi-lbl">DESIGNATION</label>
                  <input type="text" name="name" value={form.name} onChange={handleInputChange} className="mech-input" required placeholder="e.g. HDFC Infinia" autoComplete="off" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="kpi-lbl">BILLING CYCLE DAY</label>
                    <input type="number" name="billing_day" value={form.billing_day} onChange={handleInputChange} className="mech-input" required min="1" max="31" />
                  </div>
                  <div>
                    <label className="kpi-lbl">DUE DATE DAY</label>
                    <input type="number" name="due_day" value={form.due_day} onChange={handleInputChange} className="mech-input" required min="1" max="31" />
                  </div>
                </div>
                <div>
                  <label className="kpi-lbl">CREDIT LIMIT</label>
                  <input type="number" name="limit" value={form.limit || ''} onChange={handleInputChange} className="mech-input" required min="0" placeholder="e.g. 500000" />
                </div>
                <div>
                  <label className="kpi-lbl">OFFSET PROTOCOL (MONTHS)</label>
                  <select name="due_month_offset" value={form.due_month_offset} onChange={handleInputChange} className="mech-select">
                    <option value={0}>SAME MONTH (0)</option>
                    <option value={1}>NEXT MONTH (+1)</option>
                    <option value={2}>TWO MONTHS (+2)</option>
                  </select>
                  <div style={{ fontSize: '9px', color: 'var(--text-d)', marginTop: '4px' }}>Due date falls in current or next month.</div>
                </div>
                <div>
                  <button type="button" className={`toggle-btn ${form.is_default ? 'active' : ''}`} onClick={() => setForm({ ...form, is_default: !form.is_default })}>
                    <span>IS PRIMARY LINE</span>
                    <span style={{ color: form.is_default ? 'var(--ba-gold)' : 'inherit' }}>{form.is_default ? '[ TRUE ]' : '[ FALSE ]'}</span>
                  </button>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  {form._docId && (
                    <button type="button" className="mech-btn" style={{ background: 'transparent', color: 'var(--text-d)', borderColor: 'var(--ba-border)' }} onClick={() => setForm(initialForm)}>ABORT</button>
                  )}
                  <button type="submit" className="mech-btn" style={{ borderColor: form._docId ? 'var(--ba-gold)' : 'var(--ba-crimson)' }}>
                    {form._docId ? 'COMMIT CHANGES' : 'AUTHORIZE LINE'}
                  </button>
                </div>
              </form>
            </div>

            {/* Registered lines */}
            <div className="panel mech-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="sec-ttl">REGISTERED LINES</div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--ba-bg-panel)', zIndex: 10 }}>
                    <tr>
                      <th>DESIGNATION</th>
                      <th>LIMIT</th>
                      <th>BILLING / DUE</th>
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c, i) => (
                      <tr key={c._id} className="manifest-row assimilate-in" style={{ animationDelay: `${i * 0.05}s` }}>
                        <td style={{ color: '#fff', fontSize: '12px' }}>
                          {c.name}
                          {c.is_default && <span style={{ color: 'var(--ba-gold)', fontSize: '10px', marginLeft: '5px' }}>[PRI]</span>}
                        </td>
                        <td style={{ color: 'var(--text-d)', fontFamily: 'var(--mono)' }}>₹{fmtLimit(c.limit)}</td>
                        <td style={{ color: 'var(--text-d)' }}>{c.billing_day} → {c.due_day}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="action-btn" onClick={() => setForm({ _docId: c._id, name: c.name, billing_day: c.billing_day, due_day: c.due_day, due_month_offset: c.due_month_offset, limit: c.limit || 0, is_default: !!c.is_default })}>EDIT</button>
                          <button className="action-btn del" onClick={() => handleDeleteCard(c._id)}>DEL</button>
                        </td>
                      </tr>
                    ))}
                    {cards.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>NO LINES CONFIGURED</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        ) : (

          /* ── DASHBOARD: grid-template-rows ensures no outer scroll ── */
          <div className="liq-dash">

            {/* ROW 1: Status + Parameters — auto height */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>

              {/* Next due */}
              <div className="panel mech-panel liq-panel-shine" style={{ padding: '14px 18px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '8px', marginBottom: '12px' }}>
                  <span className="sec-ttl" style={{ border: 'none', margin: 0, padding: 0 }}>NEXT RITUAL DUE</span>
                  <span className={`status-led ${nextBucket.status === 'overdue' || isCritical ? 'warn pulse' : 'ok'}`} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px', letterSpacing: '1px' }}>TARGET DATE</div>
                    <div style={{ fontSize: '20px', color: isCritical ? 'var(--ba-crimson)' : '#fff', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                      {formatDate(nextBucket.due_date)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ba-crimson)', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '1px' }}>REQUIRED TITHE</div>
                    <div className={nextBucket.outstanding > 0 ? 'warn' : 'ok'} style={{ fontSize: '26px', fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                      ₹ <ScrambleText text={(nextBucket.outstanding || 0).toLocaleString()} />
                    </div>
                  </div>
                </div>
                {/* Time gauge */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '5px' }}>
                    <span>TEMPORAL WINDOW</span>
                    <span className={isCritical ? 'warn blink' : 'ok'}>
                      {daysRemaining === '--' ? '--' : `${daysRemaining} DAYS REMAINING`}
                    </span>
                  </div>
                  <div className="bar-track" style={{ height: '8px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${isCritical ? 'var(--ba-crimson)' : 'var(--border)'}` }}>
                    <div className="bar-fill" style={{
                      width: daysRemaining === '--' ? '0%' : `${Math.max(0, Math.min(100, (daysRemaining / 30) * 100))}%`,
                      background: isCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                      boxShadow: isCritical ? 'none' : 'var(--glow)',
                      animation: isCritical ? 'tithePulse 1s ease-in-out infinite alternate' : 'none',
                      transition: 'width 1s ease-in-out',
                    }} />
                  </div>
                </div>
              </div>

              {/* Parameters */}
              <div className="panel mech-panel liq-panel-shine" style={{ padding: '14px 18px', position: 'relative' }}>
                <div className="sec-ttl">LIQUIDITY PARAMETERS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12px' }}>
                  <div className="row" style={{ padding: 0 }}>
                    <span className="rl">ACTIVE CREDIT LINE</span>
                    <span className="rv" style={{ color: '#fff' }}>{localCardInfo.name || 'UNKNOWN'}</span>
                  </div>
                  <div className="row" style={{ padding: 0 }}>
                    <span className="rl">BILLING CYCLE ANCHOR</span>
                    <span className="rv">{localCardInfo.billing_day || '--'}th of Month</span>
                  </div>
                  <div className="row" style={{ padding: 0 }}>
                    <span className="rl">MAXIMUM YIELD LIMIT</span>
                    <span className="rv">₹ {localCardInfo.limit ? localCardInfo.limit.toLocaleString() : 'UNSET'}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '10px', marginTop: '2px' }}>
                    <div className="row" style={{ padding: 0 }}>
                      <span className="rl" style={{ fontSize: '13px', color: 'var(--ba-gold-dim)' }}>TOTAL PENDING DEBT</span>
                      <span className="rv warn" style={{ fontSize: '16px', fontWeight: 'bold' }}>
                        ₹ <ScrambleText text={totalPendingDebt.toLocaleString()} />
                      </span>
                    </div>
                    {localCardInfo.limit > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>
                          <span>LINE UTILIZATION</span>
                          <span style={{ color: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)' }}>
                            {limitPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="bar-track" style={{ height: '5px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${isLimitCritical ? 'var(--ba-crimson)' : 'var(--border)'}` }}>
                          <div className="bar-fill" style={{
                            width: `${limitPct}%`,
                            background: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                            boxShadow: isLimitCritical ? '0 0 8px var(--ba-crimson)' : 'var(--glow)',
                            transition: 'width 1s ease-in-out',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 2: Obligation manifest — 1fr, scrolls internally */}
            <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '14px 18px', minHeight: 0 }}>
              <div className="sec-ttl" style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <span>OBLIGATION MANIFEST // UPCOMING TITHES</span>
                <span style={{ fontSize: '10px', color: 'var(--ba-gold-mute)', fontWeight: 'normal' }}>
                  ACTIVE BUCKETS: {localBuckets.length}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--ba-bg-panel)', zIndex: 10 }}>
                    <tr>
                      <th>DUE DATE</th>
                      <th>CYCLE STATUS</th>
                      <th>TOTAL</th>
                      <th>PAID</th>
                      <th style={{ textAlign: 'right' }}>OUTSTANDING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localBuckets.length > 0 ? localBuckets.map((b, i) => (
                      <tr
                        key={`${activeCardId}-${i}`}
                        className="manifest-row assimilate-in"
                        style={{ animationDelay: `${Math.min(i * 0.05, 0.4)}s`, background: b.status === 'overdue' ? 'rgba(204,34,0,0.08)' : 'transparent' }}
                      >
                        <td style={{ color: 'var(--text-d)', fontSize: '12px', fontFamily: 'var(--mono)', verticalAlign: 'top', paddingTop: '12px', textTransform: 'uppercase' }}>
                          {formatDate(b.due_date)}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                          <span className={`n-badge ${b.status === 'paid' ? 'n-badge-ok' : b.status === 'overdue' ? 'n-badge-crit' : 'n-badge-tx'}`} style={{ width: 'auto', padding: '3px 8px' }}>
                            {b.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ color: 'var(--ba-gold-mute)', fontSize: '11px', verticalAlign: 'top', paddingTop: '12px', fontFamily: 'var(--mono)' }}>
                          ₹ {b.total?.toLocaleString()}
                        </td>
                        <td style={{ color: 'var(--border-hi)', fontSize: '11px', verticalAlign: 'top', paddingTop: '12px', fontFamily: 'var(--mono)' }}>
                          ₹ {b.paid?.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '12px', color: b.status === 'paid' ? 'var(--text-d)' : 'var(--ba-crimson)', fontSize: '14px' }}>
                          ₹ {b.outstanding.toLocaleString()}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                          <span className="blink" style={{ color: 'var(--border-hi)' }}>
                            // ZERO BLOOD DEBT DETECTED // PRAISE THE OMNISSIAH //
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default LiquiditySlide;