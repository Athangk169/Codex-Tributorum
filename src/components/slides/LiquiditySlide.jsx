import React, { useState, useEffect } from 'react';
import { CardEngine } from '../../utils/engine';

// ── Cryptographic Scrambler ──
const ScrambleText = ({ text }) => {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    let iter = 0;
    const chars = "01X4A8C9#F>";
    const strText = String(text);
    const maxIter = strText.length;

    const interval = setInterval(() => {
      setDisplay(strText.split('').map((char, i) => {
        if (char === ' ' || char === '₹' || char === ',') return char;
        if (i < iter) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));

      if (iter >= maxIter) clearInterval(interval);
      iter += 1/4; 
    }, 40); 

    return () => clearInterval(interval);
  }, [text]);

  return <>{display}</>;
};

const LiquiditySlide = ({ data, dbTransactions, dbMetadata, userId }) => {
  const cards = data?.cards || [];

  // ── LOCAL STATE ──
  const [activeCardId, setActiveCardId] = useState('');
  const [localBuckets, setLocalBuckets] = useState([]);
  const [localCardInfo, setLocalCardInfo] = useState({});
  const [isManaging, setIsManaging] = useState(false);

  // Initialize the active card selector on boot
  useEffect(() => {
    if (!activeCardId && cards.length > 0) {
      const defCard = cards.find(c => c.is_default) || cards[0];
      setActiveCardId(defCard.id);
    }
  }, [cards, activeCardId]);

  // Dynamically calculate buckets when the selected card or database changes
  useEffect(() => {
    const fetchBuckets = async () => {
      if (!dbTransactions || !dbMetadata || !activeCardId) {
        setLocalBuckets(data?.cardObligations?.buckets || []);
        setLocalCardInfo(data?.cardObligations?.card || {});
        return;
      }
      const res = await CardEngine.buildBuckets(dbTransactions, dbMetadata, userId, activeCardId);
      setLocalBuckets(res.buckets || []);
      setLocalCardInfo(res.card || {});
    };
    fetchBuckets();
  }, [activeCardId, data, dbTransactions, dbMetadata, userId]);

  // ── CARD MANAGEMENT STATE ──
  // ADDED: `limit` to the initial form
  const initialForm = { id: '', name: '', billing_day: 15, due_day: 5, due_month_offset: 1, limit: 100000, is_default: false };
  const [form, setForm] = useState(initialForm);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? Number(value) : value 
    }));
  };

  const handleSaveCard = async (e) => {
    e.preventDefault();
    if (!dbMetadata) return;

    try {
      let doc;
      try { doc = await dbMetadata.get('config_cards'); }
      catch (err) { doc = { _id: 'config_cards', type: 'system_config', cards: [] }; }

      let updatedCards = [...doc.cards];

      if (form.is_default) {
        updatedCards = updatedCards.map(c => ({ ...c, is_default: false }));
      }

      if (form.id) {
        const idx = updatedCards.findIndex(c => c.id === form.id);
        if (idx >= 0) updatedCards[idx] = { ...form };
      } else {
        updatedCards.push({ ...form, id: `card_${Date.now()}` });
      }

      if (updatedCards.length === 1) updatedCards[0].is_default = true;

      doc.cards = updatedCards;
      await dbMetadata.put(doc);
      setForm(initialForm);
    } catch (err) {
      console.error("Failed to save card config", err);
    }
  };

  const handleDeleteCard = async (id) => {
    if (!dbMetadata) return;
    try {
      const doc = await dbMetadata.get('config_cards');
      doc.cards = doc.cards.filter(c => c.id !== id);
      if (doc.cards.length > 0 && !doc.cards.find(c => c.is_default)) {
        doc.cards[0].is_default = true;
      }
      await dbMetadata.put(doc);
    } catch(err) { console.error("Purge failed:", err); }
  };

  // ── TEMPORAL FORMATTER ──
  const formatTemporalDate = (dateString) => {
    if (!dateString) return 'NO DEBT DETECTED';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'long' });

    const suffix = ["th", "st", "nd", "rd"];
    const v = day % 100;
    const ordinal = day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);

    return `${ordinal} ${month}`;
  };

  // ── RENDER METRICS ──
  const nextBucket = localBuckets.find(b => b.status !== 'paid') || {};
  const today = new Date();
  const dueDate = nextBucket.due_date ? new Date(nextBucket.due_date) : null;
  const daysRemaining = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : '--';
  const isCritical = daysRemaining !== '--' && daysRemaining <= 5;

  // ADDED: Utilization Calculations
  const totalPendingDebt = localBuckets.reduce((acc, b) => acc + b.outstanding, 0);
  const limitPct = localCardInfo.limit ? Math.min(100, (totalPendingDebt / localCardInfo.limit) * 100) : 0;
  const isLimitCritical = limitPct >= 80;

  return (
    <div className="slide-container active" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '15px' }}>
      
      {/* ── Slide Specific Styles & Animations ── */}
      <style>{`
        /* Active Field Illumination */
        .mech-input { border-left: 2px solid var(--border); }
        .mech-input:focus {
          border-left: 3px solid var(--ba-crimson) !important;
          border-color: var(--border-hi) !important;
        }
          /* Purge Native Spin Buttons */
        .mech-input[type="number"]::-webkit-outer-spin-button,
        .mech-input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .mech-input[type="number"] {
          -moz-appearance: textfield;
        }

        /* Dark Select Overlay */
        .mech-select, .mech-select option, .mech-select optgroup {
          background-color: #0a0a0a !important; color: #ccc !important; font-family: var(--mono);
        }

        /* Tactical Target Lock (Rows) */
        .manifest-row {
          transition: background 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .manifest-row:hover {
          background: rgba(200, 34, 0, 0.08);
          box-shadow: inset 0 0 15px rgba(200, 34, 0, 0.15);
        }
        .manifest-row td:first-child { position: relative; }
        .manifest-row td:last-child { position: relative; }
        .manifest-row:hover td:first-child::before {
          content: ''; position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px; border-top: 1px solid #cc2200; border-left: 1px solid #cc2200;
        }
        .manifest-row:hover td:last-child::after {
          content: ''; position: absolute; bottom: 4px; right: 4px;
          width: 6px; height: 6px; border-bottom: 1px solid #cc2200; border-right: 1px solid #cc2200;
        }

        /* Data Assimilation */
        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .assimilate-in {
          animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          opacity: 0;
        }

        /* Blood Tithe Plasma Pulse */
        @keyframes tithePulse {
          0%, 100% { box-shadow: 0 0 10px rgba(204,34,0,0.5); background: var(--ba-crimson); }
          50%      { box-shadow: 0 0 25px rgba(204,34,0,1); background: #ff4422; }
        }
      `}</style>

      {/* ── TOP CONTROL BAR ── */}
      <div className="panel mech-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', flexShrink: 0 }}>
        <div className="sec-ttl" style={{ margin: 0, border: 'none', color: 'var(--ba-crimson)' }}>
          BLOOD DEBT AUSPEX // {isManaging ? 'COGITATOR CONFIG' : 'LIQUIDITY MONITOR'}
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {!isManaging && (
            <select 
              className="mech-select" 
              style={{ width: '250px', marginTop: 0, padding: '5px 10px', borderColor: 'var(--ba-border)' }}
              value={activeCardId}
              onChange={(e) => setActiveCardId(e.target.value)}
            >
              {cards.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.is_default ? '[PRIMARY]' : ''}</option>
              ))}
              {cards.length === 0 && <option value="">NO CARDS DETECTED</option>}
            </select>
          )}
          <button 
            className="mech-btn" 
            style={{ marginTop: 0, padding: '5px 15px', width: 'auto', background: isManaging ? 'var(--ba-crimson)' : 'rgba(204, 34, 0, 0.15)', borderColor: 'var(--ba-crimson)', color: '#fff' }}
            onClick={() => setIsManaging(!isManaging)}
          >
            {isManaging ? '[ RETURN TO AUSPEX ]' : '[ CONFIGURE LINES ]'}
          </button>
        </div>
      </div>

      {/* ── MODE: CONFIGURATION ── */}
      {isManaging ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '15px', flex: 1, minHeight: 0 }}>
          
          <div className="panel mech-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div className="sec-ttl">{form.id ? 'RECALIBRATE LINE' : 'REGISTER NEW CREDIT LINE'}</div>
            
            <form onSubmit={handleSaveCard} style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
              <div>
                <label className="kpi-lbl">DESIGNATION (NAME)</label>
                <input type="text" name="name" value={form.name} onChange={handleInputChange} className="mech-input" required placeholder="e.g. HDFC Infinia" autoComplete="off" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="kpi-lbl">BILLING CYCLE DAY</label>
                  <input type="number" name="billing_day" value={form.billing_day} onChange={handleInputChange} className="mech-input" required min="1" max="31" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="kpi-lbl">DUE DATE DAY</label>
                  <input type="number" name="due_day" value={form.due_day} onChange={handleInputChange} className="mech-input" required min="1" max="31" />
                </div>
              </div>
              
              {/* ADDED: Credit Limit Input */}
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
                <div style={{ fontSize: '9px', color: 'var(--text-d)', marginTop: '5px' }}>Determines if the due date falls in the current month or the next.</div>
              </div>

              <div style={{ marginTop: '10px' }}>
                <button type="button" className={`toggle-btn ${form.is_default ? 'active' : ''}`} onClick={() => setForm({...form, is_default: !form.is_default})}>
                  <span>IS PRIMARY LINE</span>
                  <span style={{ color: form.is_default ? 'var(--ba-gold)' : 'inherit' }}>{form.is_default ? '[ TRUE ]' : '[ FALSE ]'}</span>
                </button>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                {form.id && (
                  <button type="button" className="mech-btn" style={{ background: 'transparent', color: 'var(--text-d)', borderColor: 'var(--ba-border)' }} onClick={() => setForm(initialForm)}>ABORT</button>
                )}
                <button type="submit" className="mech-btn" style={{ borderColor: form.id ? 'var(--ba-gold)' : 'var(--ba-crimson)' }}>
                  {form.id ? 'COMMIT CHANGES' : 'AUTHORIZE LINE'}
                </button>
              </div>
            </form>
          </div>

          <div className="panel mech-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="sec-ttl">REGISTERED LINES</div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
              <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--ba-bg-panel)', zIndex: 10 }}>
                  <tr>
                    <th>DESIGNATION</th>
                    <th>LIMIT</th>
                    <th>CYCLE</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c, i) => {
                    const animDelay = `${Math.min(i * 0.05, 0.4)}s`;
                    return (
                      <tr key={c.id} className="manifest-row assimilate-in" style={{ animationDelay: animDelay }}>
                        <td style={{ color: '#fff', fontSize: '12px' }}>
                          {c.name} {c.is_default && <span style={{ color: 'var(--ba-gold)', fontSize: '10px', marginLeft: '5px' }}>[PRI]</span>}
                        </td>
                        {/* ADDED: Limit Display in Table */}
                        <td style={{ color: 'var(--text-d)', fontFamily: 'var(--mono)' }}>
                           ₹{c.limit ? (c.limit / 1000).toFixed(0) + 'k' : '--'}
                        </td>
                        <td style={{ color: 'var(--text-d)' }}>{c.billing_day} to {c.due_day}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="action-btn" onClick={() => setForm(c)}>EDIT</button>
                          <button className="action-btn del" onClick={() => handleDeleteCard(c.id)}>DEL</button>
                        </td>
                      </tr>
                    );
                  })}
                  {cards.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>NO LINES CONFIGURED</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      ) : (

        /* ── MODE: DASHBOARD ── */
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', flexShrink: 0 }}>
            
            {/* LEFT: MAIN STATUS PANEL */}
            <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '10px', marginBottom: '15px' }}>
                <span className="sec-ttl" style={{ border: 'none', margin: 0, padding: 0 }}>NEXT RITUAL DUE // DEADLINE</span>
                <span className={`status-led ${nextBucket.status === 'overdue' || isCritical ? 'warn pulse' : 'ok'}`} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-d)', marginBottom: '5px' }}>TARGET DATE</div>
                  <div style={{ fontSize: '24px', color: '#fff', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    {formatTemporalDate(nextBucket.due_date)}
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--ba-crimson)', marginBottom: '5px', fontWeight: 'bold' }}>REQUIRED TITHE</div>
                  <div className={nextBucket.outstanding > 0 ? 'warn pulse' : 'ok'} style={{ fontSize: '32px', fontWeight: 'bold' }}>
                    ₹ <ScrambleText text={(nextBucket.outstanding || 0).toLocaleString()} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-d)', marginBottom: '8px' }}>
                  <span>TEMPORAL WINDOW</span>
                  <span className={isCritical ? 'warn blink' : 'ok'}>
                    {daysRemaining === '--' ? '--' : `${daysRemaining} DAYS REMAINING`}
                  </span>
                </div>
                
                {/* Plasma Gauge Progress Bar */}
                <div className="bar-track" style={{ height: '10px', background: 'rgba(0,0,0,0.8)', border: isCritical ? '1px solid var(--ba-crimson)' : '1px solid var(--border)' }}>
                  <div 
                    className="bar-fill" 
                    style={{ 
                      width: daysRemaining === '--' ? '0%' : `${Math.max(0, Math.min(100, (daysRemaining / 30) * 100))}%`, 
                      background: isCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                      boxShadow: isCritical ? 'none' : 'var(--glow)',
                      animation: isCritical ? 'tithePulse 1s ease-in-out infinite alternate' : 'none',
                      transition: 'width 1s ease-in-out'
                    }} 
                  />
                </div>
              </div>
            </div>

            {/* RIGHT: BREAKDOWN PANEL */}
            <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
              <div className="sec-ttl">LIQUIDITY PARAMETERS</div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px', fontSize: '12px' }}>
                <div className="row" style={{ padding: 0 }}>
                  <span className="rl">ACTIVE CREDIT LINE</span>
                  <span className="rv" style={{ color: '#fff' }}>{localCardInfo.name || 'UNKNOWN'}</span>
                </div>
                <div className="row" style={{ padding: 0 }}>
                  <span className="rl">BILLING CYCLE ANCHOR</span>
                  <span className="rv">{localCardInfo.billing_day || '--'}th of Month</span>
                </div>
                
                {/* ADDED: Limit Display */}
                <div className="row" style={{ padding: 0 }}>
                  <span className="rl">MAXIMUM YIELD LIMIT</span>
                  <span className="rv">₹ {localCardInfo.limit ? localCardInfo.limit.toLocaleString() : 'UNSET'}</span>
                </div>
                
                <div className="row" style={{ marginTop: '10px', borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '15px' }}>
                  <span className="rl" style={{ fontSize: '14px', color: 'var(--ba-gold-dim)' }}>TOTAL PENDING DEBT</span>
                  <span className="rv warn" style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    ₹ <ScrambleText text={totalPendingDebt.toLocaleString()} />
                  </span>
                </div>

                {/* ADDED: Utilization Progress Bar */}
                {localCardInfo.limit > 0 && (
                  <div style={{ marginTop: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-d)', marginBottom: '5px' }}>
                      <span>LINE UTILIZATION</span>
                      <span className={isLimitCritical ? 'warn blink' : 'ok'} style={{ color: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)' }}>
                        {limitPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="bar-track" style={{ height: '6px', background: 'rgba(0,0,0,0.8)', border: isLimitCritical ? '1px solid var(--ba-crimson)' : '1px solid var(--border)' }}>
                      <div 
                        className="bar-fill" 
                        style={{ 
                          width: `${limitPct}%`, 
                          background: isLimitCritical ? 'var(--ba-crimson)' : 'var(--ba-gold-dim)',
                          boxShadow: isLimitCritical ? '0 0 8px var(--ba-crimson)' : 'var(--glow)',
                          transition: 'width 1s ease-in-out'
                        }} 
                      />
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* BOTTOM: OBLIGATION MANIFEST */}
          <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px', flex: 1, minHeight: 0 }}>
            <div className="sec-ttl" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>OBLIGATION MANIFEST // UPCOMING TITHES</span>
              <span style={{ fontSize: '10px', color: 'var(--ba-gold-mute)', fontWeight: 'normal' }}>
                ACTIVE BUCKETS: {localBuckets.length}
              </span>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--ba-bg-panel)', zIndex: 10 }}>
                  <tr>
                    <th>DUE DATE</th>
                    <th>CYCLE STATUS</th>
                    <th style={{ textAlign: 'right' }}>OUTSTANDING QUANTITY</th>
                  </tr>
                </thead>
                <tbody>
                  {localBuckets.length > 0 ? (
                    localBuckets.map((b, i) => {
                      const animDelay = `${Math.min(i * 0.05, 0.4)}s`;
                      return (
                        <tr key={i} className="manifest-row assimilate-in" style={{ animationDelay: animDelay, background: b.status === 'overdue' ? 'rgba(204, 34, 0, 0.1)' : 'transparent' }}>
                          <td style={{ color: 'var(--text-d)', fontSize: '12px', fontFamily: 'var(--mono)', verticalAlign: 'top', paddingTop: '12px', textTransform: 'uppercase' }}>
                            {formatTemporalDate(b.due_date)}
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                            <span className={`n-badge ${b.status === 'paid' ? 'n-badge-ok' : 'n-badge-crit'}`} style={{ width: 'auto', padding: '4px 8px' }}>
                              {b.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '12px', color: b.status === 'paid' ? 'var(--text-d)' : 'var(--ba-crimson)' }}>
                            ₹ {b.outstanding.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', padding: '40px' }}>
                        <span className="blink" style={{ color: 'var(--border-hi)' }}>// ZERO BLOOD DEBT DETECTED // PRAISE THE OMNISSIAH //</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LiquiditySlide;