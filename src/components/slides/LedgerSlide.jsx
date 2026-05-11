// src/components/slides/LedgerSlide.jsx
import React, { useState, useEffect, useRef } from 'react';
import { CategorizationEngine } from '../../utils/engine';

// ── Cryptographic Placeholder Component ──
const CryptoPlaceholder = ({ text, active }) => {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!active) return;
    let iter = 0;
    const chars = "01X4A8C9#F>";
    const interval = setInterval(() => {
      setDisplay(text.split('').map((char, i) => {
        if (char === ' ' || char === '·') return char;
        if (i < iter) return char;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));
      if (iter >= text.length) clearInterval(interval);
      iter += 1/4;
    }, 40);
    return () => clearInterval(interval);
  }, [text, active]);

  if (!active) return null;

  return (
    <div style={{ 
      position: 'absolute', top: '35px', left: '12px', 
      color: 'var(--ba-gold-mute)', pointerEvents: 'none', 
      fontFamily: 'var(--mono)', fontSize: '12px', opacity: 0.7 
    }}>
      {display}
    </div>
  );
};

const LedgerServoSkull = ({ x, y, status }) => {
  const containerRef = useRef(null);
  const mvRef        = useRef(null);
  const trackingCooldownRef = useRef(false); // ← NEW
  
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    import('@google/model-viewer').catch(console.error);
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const mv = document.createElement('model-viewer');
    const glbPath = window.electronDistPath?.distPath
      ? `file:///${window.electronDistPath.distPath.replace(/^\//, '')}/servo-skull_warhammer.glb`
      : 'servo-skull_warhammer.glb';
    mv.setAttribute('src', glbPath);
    mv.setAttribute('camera-orbit', '45deg 75deg 2.5m');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');
    Object.assign(mv.style, {
      width: '100%', height: '100%',
      backgroundColor: 'transparent',
      '--progress-bar-color': 'transparent',
      '--progress-bar-height': '0px',
    });
    container.appendChild(mv);
    mvRef.current = mv;
    return () => {
      if (mvRef.current && container.contains(mvRef.current))
        container.removeChild(mvRef.current);
      container.innerHTML = '';
    };
  }, []);

  // ── Action State Camera Controls ──
  useEffect(() => {
    if (!mvRef.current) return;
    mvRef.current.style.transition = 'filter 0.5s ease';

    if (status === 'idle') {
      // ✅ FIX 1: Explicitly reset orbit on dock return
      mvRef.current.setAttribute('camera-orbit', '45deg 75deg 2.5m');
      // ✅ FIX 3: Cooldown prevents mouse immediately hijacking after state change
      trackingCooldownRef.current = true;
      setTimeout(() => { trackingCooldownRef.current = false; }, 800);
    } else if (status === 'focus') {
      mvRef.current.setAttribute('camera-orbit', '160deg 75deg 2.0m');
    } else {
      mvRef.current.setAttribute('camera-orbit', '45deg 75deg 2.5m');
    }

    switch(status) {
      case 'idle':   mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)'; break;
      case 'focus':  mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.2)'; break;
      case 'scan':   mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(85deg) brightness(1.4)'; break;
      case 'error':  mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.3)'; break;
      case 'delete': mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.0)'; break;
      default:       mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)';
    }
  }, [status]);

  // ── Cursor Tracking Logic (Idle Only) ──
  useEffect(() => {
    const handleMouseMove = (e) => {
      // ✅ FIX 3: Respect cooldown so dock transition isn't immediately stomped
      if (status !== 'idle' || trackingCooldownRef.current) {
        setMouseOffset({ x: 0, y: 0 });
        return;
      }

      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = (e.clientY / window.innerHeight) * 2 - 1;
      setMouseOffset({ x: normX * 10, y: normY * 10 });

      if (mvRef.current) {
        // ✅ FIX 2: Wider theta sweep (+/-45 deg), clamped phi avoids gimbal lock
        const theta      = 45 - (normX * 70);
        const phi        = 75 - (normY * 30);
        const clampedPhi = Math.max(45, Math.min(120, phi));
        mvRef.current.setAttribute('camera-orbit', `${theta}deg ${clampedPhi}deg 2.5m`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [status]);

  // ... rest of JSX unchanged

  return (
    <div 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, 
        width: '68px', height: '68px',
        transform: `translate(${x}px, ${y}px)`,
        transition: 'transform 2.5s ease-in-out', 
        zIndex: 100,
        pointerEvents: 'none'
      }}
    >
      <div 
        className={`servo-skull-inquisitor ${status === 'error' ? 'skull-shake' : ''}`}
        style={{ 
          width: '100%', height: '100%',
          transform: `translate(${mouseOffset.x}px, ${mouseOffset.y}px)`,
          transition: 'transform 0.2s ease-out',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        
        {/* NEW: Input Scanning Laser Effect */}
        {status === 'focus' && (
          <div className="typing-laser" style={{
            position: 'absolute', 
            right: '45px', // Start from left side of skull
            top: '36px',   // Eye level
            width: '180px',// Project far into the input field
            height: '2px',
            background: 'linear-gradient(270deg, #cc2200 0%, rgba(204,34,0,0) 100%)',
            boxShadow: '0 0 10px 2px rgba(204,34,0,0.8)',
            transformOrigin: 'right center',
            zIndex: -1
          }} />
        )}

        {/* Ledger Row Scan Effect */}
        {status === 'scan' && (
          <div className="laser-sweep" style={{
            position: 'absolute', left: '50%', top: '55px', width: '2px',
            background: '#4ade80', boxShadow: '0 0 12px 2px #4ade80', zIndex: -1
          }} />
        )}
        
        {/* Warning Targeting Effect */}
        {status === 'delete' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: '150px', height: '1px',
            background: 'linear-gradient(90deg, #cc2200, transparent)', transform: 'translateY(-50%)',
            opacity: 0.6, zIndex: -1
          }} />
        )}
      </div>
    </div>
  );
};

const LedgerSlide = ({ data, dbTransactions, dbMetadata, user }) => {
  const transactions = data?.transactions || [];
  const accounts = data?.accounts || [];
  const cards = data?.cards || [];
  const categories = [
                        ...(data?.expenseCategories  || []),
                        ...(data?.positiveCategories || []),
                        ...(data?.neutralCategories  || []),
                      ];
  const positiveCategories = data?.positiveCategories || [];
  const neutralCategories = data?.neutralCategories || [];

  const slideRef = useRef(null);
  const rowRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    method: 'Bank',
    category: 'Uncategorized',
    isReimbursable: false
  });

  const [isEditing, setIsEditing] = useState(null);
  const [lastAddedId, setLastAddedId] = useState(null);

  const [isDescFocused, setIsDescFocused] = useState(false);
  const [isAmtFocused, setIsAmtFocused] = useState(false);

  // FIX: When accounts load in, seed `method` to the first real account name.
  // Without this, the select's controlled value stays as the literal string
  // 'Bank' (which matches no option), so the browser shows the first account
  // visually but React still submits sub_account: 'Bank' on a fresh form.
  useEffect(() => {
    if (formData.method === 'Bank' && accounts.length > 0) {
      setFormData(prev => ({ ...prev, method: accounts[0].name }));
    }
  }, [accounts]);

  // Skull State
  const idleDock = { x: 380, y: 8 };
  const [skullState, setSkullState] = useState({ ...idleDock, status: 'idle' });

  const aimSkull = (element, offsetX = 0, offsetY = 0, status = 'idle') => {
    if (!element || !slideRef.current) {
      setSkullState({ ...idleDock, status: 'idle' });
      return;
    }
    const slideRect = slideRef.current.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    
    setSkullState({
      x: elRect.right - slideRect.left + offsetX,
      y: elRect.top - slideRect.top + offsetY - 15,
      status
    });
  };

  useEffect(() => {
    if (lastAddedId && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => aimSkull(rowRef.current, -80, -10, 'scan'), 300); 

      const timer = setTimeout(() => {
        setLastAddedId(null);
        aimSkull(null);
      }, 2500); 

      return () => clearTimeout(timer);
    }
  }, [lastAddedId, transactions]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFocus = (e, type) => {
    if (type === 'desc') setIsDescFocused(true);
    if (type === 'amt') setIsAmtFocused(true);
    // Put skull 30px to the right of the field so the laser projects properly left
    aimSkull(e.target, 30, 0, 'focus'); 
  };

  const handleBlur = (e, type) => {
    if (type === 'amt') setIsAmtFocused(false);
    aimSkull(null);
  };

  const handleDescriptionBlur = async (e) => {
    setIsDescFocused(false);
    aimSkull(null);
    const desc = e.target.value;
    if (!desc || !dbMetadata || !user) return;

    const suggestedCategory = await CategorizationEngine.autoTag(desc, dbMetadata, user);
    if (suggestedCategory !== 'Uncategorized') {
      setFormData(prev => ({ ...prev, category: suggestedCategory }));
    }
  };

  const handleInscribe = async (e) => {
    e.preventDefault();

    if (!formData.description || !formData.amount || Number(formData.amount) <= 0) {
      setSkullState(prev => ({ ...prev, status: 'error' }));
      setTimeout(() => setSkullState(prev => ({ ...prev, status: 'idle' })), 600);
      return;
    }

    let actType = 'Bank';
    if (formData.method === 'Cash') actType = 'Cash';
    else if (cards.find(c => c.name === formData.method || c.id === formData.method)) actType = 'Card';

    const newTitheId = isEditing || `${formData.date}T${new Date().toISOString().split('T')[1]}Z`;
    const rawAmt = Number(formData.amount);
    const isIncomeCategory = positiveCategories.includes(formData.category);
    const signedAmount = isIncomeCategory ? Math.abs(rawAmt) : -Math.abs(rawAmt);

    const newTithe = {
      _id: newTitheId,
      type: 'transaction',
      user_id: user || 'Athang',
      date: formData.date,
      amount: signedAmount,
      description: formData.description,
      category: formData.category,
      account_type: actType,
      sub_account: formData.method,
      is_reimbursable: formData.isReimbursable
    };

    if (dbTransactions) {
      if (isEditing) {
        try {
          const existing = await dbTransactions.get(isEditing);
          await dbTransactions.put({ ...existing, ...newTithe });
        } catch (err) {
          console.error("Update failed:", err);
        }
      } else {
        await dbTransactions.put(newTithe);
      }
    }

    setLastAddedId(newTitheId);

    setFormData({
      ...formData,
      description: '',
      amount: '',
      isReimbursable: false,
      category: 'Uncategorized'
    });
    setIsEditing(null);
  };

  const handleEdit = (tx) => {
    setFormData({
      date: tx.date || tx._id.split('T')[0],
      description: tx.description || '',
      amount: Math.abs(tx.amount || 0).toString(),
      method: tx.sub_account || tx.account_type || 'Bank',
      category: tx.category || 'Uncategorized',
      isReimbursable: tx.is_reimbursable || false
    });
    setIsEditing(tx._id);
  };

  const handleDelete = async (id) => {
    aimSkull(null);
    if (dbTransactions) {
      try {
        const doc = await dbTransactions.get(id);
        await dbTransactions.remove(doc);
      } catch (err) {
        console.error("Purge failed:", err);
      }
    }
  };

  const resolveMethodName = (tx) => {
    const rawId = tx.sub_account || tx.account_type;
    const cardMatch = cards.find(c => c.id === rawId || c.name === rawId);
    if (cardMatch) return cardMatch.name;
    const accMatch = accounts.find(a => a.id === rawId || a.name === rawId);
    if (accMatch) return accMatch.name;
    return rawId || 'BANK';
  };

  const getTransactionType = (category) => {
    if (positiveCategories.includes(category)) return 'income';
    if (neutralCategories.includes(category)) return 'neutral';
    return 'expense';
  };

  return (
    <div className="slide-container active" ref={slideRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '15px', position: 'relative' }}>
      
      {/* ── Servo Skull Injection ── */}
      <LedgerServoSkull x={skullState.x} y={skullState.y} status={skullState.status} />

      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }

        .mech-input, .mech-select { border-left: 2px solid var(--border); }
        .mech-input:focus, .mech-select:focus {
          border-left: 3px solid var(--ba-crimson) !important;
          border-color: var(--border-hi) !important;
        }

        .mech-select optgroup { background: #000 !important; color: var(--text-d) !important; font-family: var(--mono); padding: 5px; }
        .mech-select option { background: #000 !important; color: var(--border-hi) !important; font-family: var(--mono); padding: 8px; }

        .ledger-scroll::-webkit-scrollbar { width: 4px; }
        .ledger-scroll::-webkit-scrollbar-track { background: #050000; border-left: 1px solid var(--ba-border-lo); }
        .ledger-scroll::-webkit-scrollbar-thumb { background: rgba(204,34,0,0.5); border-radius: 2px; }
        .ledger-scroll::-webkit-scrollbar-thumb:hover { background: var(--ba-crimson); }

        @keyframes skullShake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-4px, 0) rotate(-5deg); }
          50% { transform: translate(4px, 0) rotate(5deg); }
          75% { transform: translate(-4px, 0) rotate(-5deg); }
        }
        .skull-shake { animation: skullShake 0.4s ease-in-out; }

        @keyframes typingPulse {
          0%, 100% { transform: scaleX(0.9); opacity: 0.6; }
          50% { transform: scaleX(1.1); opacity: 1; }
        }
        .typing-laser { animation: typingPulse 0.4s ease-in-out infinite; }

        @keyframes laserSweep {
          0% { height: 0; opacity: 1; }
          50% { height: 60px; opacity: 1; }
          100% { height: 0; opacity: 0; transform: translateY(60px); }
        }
        .laser-sweep { animation: laserSweep 2s ease-in-out forwards; }

        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        @keyframes targetLockPulse {
          0%   { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 20px rgba(204,34,0,0.5); background: rgba(204,34,0,0.15); }
          50%  { box-shadow: inset 0 0 0 1px var(--ba-gold), inset 0 0 30px rgba(201,168,76,0.4); background: rgba(201,168,76,0.15); }
          100% { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 20px rgba(204,34,0,0.5); background: rgba(204,34,0,0.15); }
        }

        .ledger-row {
          animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          transition: background 0.2s ease, box-shadow 0.2s ease;
        }
        .target-locked { animation: targetLockPulse 1s ease-in-out infinite !important; }

        .ledger-row:hover:not(.target-locked) {
          background: rgba(200, 34, 0, 0.08);
          box-shadow: inset 0 0 15px rgba(200, 34, 0, 0.15);
        }
        .ledger-row td:first-child, .ledger-row td:last-child { position: relative; }
        .ledger-row:hover td:first-child::before, .target-locked td:first-child::before {
          content: ''; position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px; border-top: 1px solid #cc2200; border-left: 1px solid #cc2200;
        }
        .ledger-row:hover td:last-child::after, .target-locked td:last-child::after {
          content: ''; position: absolute; bottom: 4px; right: 4px;
          width: 6px; height: 6px; border-bottom: 1px solid #cc2200; border-right: 1px solid #cc2200;
        }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '15px', flex: 1, minHeight: 0 }}>
        
        {/* ── LEFT COLUMN: Form ── */}
        <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px', overflowY: 'auto' }}>
          <div className="sec-ttl" style={{ marginBottom: '20px', color: isEditing ? 'var(--amber)' : 'var(--text-d)' }}>
            {isEditing ? 'RECALIBRATE TITHE · EDIT ENTRY' : 'INSCRIBE TITHE · LOG ENTRY'}
          </div>

          <form onSubmit={handleInscribe} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', flex: 1, alignContent: 'start' }}>
            
            <div style={{ position: 'relative' }}>
              <label className="kpi-lbl">IDENTIFIER · DESCRIPTION</label>
              <input
                type="text" name="description" value={formData.description}
                onChange={handleInputChange} onFocus={(e) => handleFocus(e, 'desc')} onBlur={handleDescriptionBlur}
                className="mech-input" required autoComplete="off"
              />
              <CryptoPlaceholder text="AWAITING DESIGNATION..." active={!formData.description && !isDescFocused} />
            </div>

            <div style={{ position: 'relative' }}>
              <label className="kpi-lbl">QUANTITY</label>
              <input 
                type="number" name="amount" value={formData.amount} 
                onChange={handleInputChange} onFocus={(e) => handleFocus(e, 'amt')} onBlur={(e) => handleBlur(e, 'amt')}
                className="mech-input" required min="0" step="0.01" 
              />
              <CryptoPlaceholder text="0.00" active={!formData.amount && !isAmtFocused} />
            </div>

            <div>
              <label className="kpi-lbl">TEMPORAL STAMP</label>
              <input 
                type="date" name="date" value={formData.date} onChange={handleInputChange} className="mech-input" required 
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')} onBlur={() => aimSkull(null)}
              />
            </div>

            <div>
              <label className="kpi-lbl">TRANSACTION METHOD</label>
              <select 
                name="method" value={formData.method} onChange={handleInputChange} className="mech-select"
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')} onBlur={() => aimSkull(null)}
              >
                <optgroup label="BANK ACCOUNTS">
                  {accounts.map(acc => <option key={acc.id} value={acc.name}>{acc.name}</option>)}
                </optgroup>
                <optgroup label="CREDIT CARDS">
                  {cards.map(card => <option key={card.id} value={card.name}>{card.name}</option>)}
                </optgroup>
                <optgroup label="PHYSICAL RESERVE">
                  <option value="Cash">CASH RESERVE</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="kpi-lbl">CLASSIFICATION</label>
              <select 
                name="category" value={formData.category} onChange={handleInputChange} className="mech-select"
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')} onBlur={() => aimSkull(null)}
              >
                <option value="Uncategorized">-- AWAITING CLASSIFICATION --</option>
                {Array.from(new Set([...categories, formData.category]))
                  .filter(cat => cat && cat !== 'Uncategorized')
                  .sort()
                  .map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label className="kpi-lbl">RECOVERY DIRECTIVE</label>
              <div 
                style={{ display: 'flex', gap: '6px', marginTop: '5px', flex: 1 }}
                onMouseEnter={(e) => aimSkull(e.currentTarget, 30, 0, 'focus')}
                onMouseLeave={() => aimSkull(null)}
              >
                <button
                  type="button" onClick={() => setFormData({ ...formData, isReimbursable: false })}
                  style={{
                    flex: 1, padding: '10px 4px', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer',
                    background: !formData.isReimbursable ? 'rgba(204,34,0,0.15)' : 'rgba(2,8,4,0.7)',
                    color: !formData.isReimbursable ? '#fff' : 'var(--ba-gold-mute)',
                    border: '1px solid', borderColor: !formData.isReimbursable ? 'var(--ba-crimson)' : 'var(--ba-border-lo)',
                    boxShadow: !formData.isReimbursable ? 'inset 0 0 10px rgba(204,34,0,0.2)' : 'none', transition: 'all 0.2s', letterSpacing: '1px'
                  }}
                >
                  [ PERSONAL ]
                </button>
                <button
                  type="button" onClick={() => setFormData({ ...formData, isReimbursable: true })}
                  style={{
                    flex: 1, padding: '10px 4px', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer',
                    background: formData.isReimbursable ? 'rgba(74,222,128,0.15)' : 'rgba(2,8,4,0.7)',
                    color: formData.isReimbursable ? '#fff' : 'var(--ba-gold-mute)',
                    border: '1px solid', borderColor: formData.isReimbursable ? 'var(--border-hi)' : 'var(--ba-border-lo)',
                    boxShadow: formData.isReimbursable ? 'inset 0 0 10px rgba(74,222,128,0.2)' : 'none', transition: 'all 0.2s', letterSpacing: '1px'
                  }}
                >
                  [ RECOVERY ]
                </button>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: 'auto', paddingTop: '10px' }}>
              {isEditing && (
                <button type="button" className="mech-btn" style={{ marginBottom: '10px', background: 'transparent', color: 'var(--text-d)' }} onClick={() => setIsEditing(null)}>
                  ABORT EDIT
                </button>
              )}
              <button 
                type="submit" className="mech-btn" style={{ margin: 0, borderColor: isEditing ? 'var(--amber)' : 'var(--border-hi)' }}
                onMouseEnter={(e) => aimSkull(e.target, 30, -10, 'idle')} onMouseLeave={() => aimSkull(null)}
              >
                {isEditing ? 'COMMIT MODIFICATION' : 'AUTHORIZE & INSCRIBE'}
              </button>
            </div>
          </form>
        </div>

        {/* ── RIGHT COLUMN: Ledger Table ── */}
        <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'hidden' }}>
          <div className="sec-ttl" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span>ARCHIVAL LEDGER · {user?.toUpperCase()}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-d)', fontWeight: 'normal' }}>
              RECORDS: {transactions.length}
            </span>
          </div>

          <div className="ledger-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
            <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--ba-bg-panel)', zIndex: 10 }}>
                <tr>
                  <th>DATE STAMP</th>
                  <th>IDENTIFIER</th>
                  <th>METHOD</th>
                  <th style={{ textAlign: 'right' }}>QUANTITY</th>
                  <th style={{ textAlign: 'right', width: '80px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map((tx, index) => {
                    const txType = getTransactionType(tx.category);
                    const isTargetLocked = tx._id === lastAddedId;
                    const animDelay = `${Math.min(index * 0.05, 0.5)}s`;

                    return (
                      <tr 
                        key={tx._id} ref={isTargetLocked ? rowRef : null}
                        className={`ledger-row ${isTargetLocked ? 'target-locked' : ''}`}
                        style={{ animationDelay: isTargetLocked ? '0s' : animDelay }}
                      >
                        <td style={{ color: 'var(--text-d)', fontSize: '11px', fontFamily: 'var(--mono)', verticalAlign: 'top', paddingTop: '12px' }}>
                          {tx.date}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                          <div style={{ color: '#fff', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                            {tx.description || 'UNKNOWN'}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-d)' }}>
                            {tx.category} {tx.is_reimbursable && <span style={{ color: 'var(--border-hi)', marginLeft: '5px' }}>[R]</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: '10px', color: 'var(--text-d)', textTransform: 'uppercase', verticalAlign: 'top', paddingTop: '12px' }}>
                          {resolveMethodName(tx)}
                        </td>
                        <td
                          className={txType === 'income' ? 'ok' : txType === 'neutral' ? '' : 'warn'}
                          style={{ textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '12px', fontSize: '14px' }}
                        >
                          {Math.abs(tx.amount).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '10px' }}>
                          <button className="action-btn" onClick={() => handleEdit(tx)}>EDIT</button>
                          <button 
                            className="action-btn del" onClick={() => handleDelete(tx._id)}
                            onMouseEnter={(e) => aimSkull(e.target, -70, -10, 'delete')} onMouseLeave={() => aimSkull(null)}
                          >
                            DEL
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}><span className="blink">AWAITING DATA STREAM...</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LedgerSlide;