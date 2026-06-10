// src/components/slides/MobileLedger.jsx
import React, { useState, useEffect, useRef } from 'react';
import { CategorizationEngine, AREngine } from '../../../utils/engine';
import { localDateStr } from '../../../utils/localDate';

// ── Cryptographic Placeholder ──
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
      iter += 1 / 4;
    }, 40);
    return () => clearInterval(interval);
  }, [text, active]);
  if (!active) return null;
  return (
    <div style={{ position: 'absolute', top: 35, left: 12, color: 'var(--ba-gold-mute, #8c732c)', pointerEvents: 'none', fontFamily: 'var(--mono, monospace)', fontSize: 12, opacity: 0.7 }}>
      {display}
    </div>
  );
};

// ── Touch-Aware Servo Skull ──
const TouchServoSkull = ({ x, y, status }) => {
  const containerRef = useRef(null);
  const mvRef = useRef(null);
  const trackingCooldownRef = useRef(false);
  const [touchOffset, setTouchOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    import('@google/model-viewer').catch(console.error);
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', 'servo-skull/warhammer.glb');
    mv.setAttribute('camera-orbit', '45deg 75deg 2.5m');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');
    Object.assign(mv.style, {
      width: '100%', height: '100%', backgroundColor: 'transparent',
      '--progress-bar-color': 'transparent', '--progress-bar-height': '0px',
    });
    container.appendChild(mv);
    mvRef.current = mv;
    return () => {
      if (mvRef.current && container.contains(mvRef.current)) container.removeChild(mvRef.current);
      container.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    if (!mvRef.current) return;
    mvRef.current.style.transition = 'filter 0.5s ease';
    if (status === 'idle') {
      mvRef.current.setAttribute('camera-orbit', '45deg 75deg 2.5m');
      trackingCooldownRef.current = true;
      setTimeout(() => { trackingCooldownRef.current = false; }, 800);
    } else if (status === 'focus') {
      mvRef.current.setAttribute('camera-orbit', '160deg 75deg 2.0m');
    } else {
      mvRef.current.setAttribute('camera-orbit', '45deg 75deg 2.5m');
    }
    switch (status) {
      case 'idle':  mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)'; break;
      case 'focus': mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.2)'; break;
      case 'scan':  mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(85deg) brightness(1.4)'; break;
      case 'error': mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.3)'; break;
      case 'delete':mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.0)'; break;
      default:      mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)';
    }
  }, [status]);

  useEffect(() => {
    const handleTouchMove = (e) => {
      if (status !== 'idle' || trackingCooldownRef.current) { setTouchOffset({ x: 0, y: 0 }); return; }
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const normX = (touch.clientX / window.innerWidth) * 2 - 1;
      const normY = (touch.clientY / window.innerHeight) * 2 - 1;
      setTouchOffset({ x: normX * 10, y: normY * 10 });
      if (mvRef.current) {
        const theta = 45 - normX * 70;
        const clampedPhi = Math.max(45, Math.min(120, 75 - normY * 30));
        mvRef.current.setAttribute('camera-orbit', `${theta}deg ${clampedPhi}deg 2.5m`);
      }
    };
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => window.removeEventListener('touchmove', handleTouchMove);
  }, [status]);

  return (
    <div style={{ position: 'absolute', top: y, left: x, width: 50, height: 50, transform: `translate(${x}px, ${y}px)`, transition: 'transform 1.5s cubic-bezier(0.2, 0.8, 0.2, 1)', zIndex: 100, pointerEvents: 'none' }}>
      <div className={status === 'error' ? 'skull-shake' : ''} style={{ width: '100%', height: '100%', transform: `translate(${touchOffset.x}px, ${touchOffset.y}px)`, transition: 'transform 0.1s linear' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {status === 'focus' && <div className="typing-laser" style={{ position: 'absolute', right: 35, top: 25, width: 120, height: 2, background: 'linear-gradient(270deg, #cc2200 0%, rgba(204,34,0,0) 100%)', boxShadow: '0 0 10px 2px rgba(204,34,0,0.8)', transformOrigin: 'right center', zIndex: -1 }} />}
        {status === 'scan' && <div className="laser-sweep" style={{ position: 'absolute', left: '50%', top: 50, width: 2, background: '#4ade80', boxShadow: '0 0 12px 2px #4ade80', zIndex: -1 }} />}
      </div>
    </div>
  );
};

// ── Styles ──
const MOBILELEDGER_STYLES = `
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  .mech-input, .mech-select { border-left: 2px solid var(--border); width: 100%; }
  .mech-input:focus, .mech-select:focus { border-left: 3px solid var(--ba-crimson) !important; border-color: var(--border-hi) !important; outline: none; }
  .mech-select optgroup { background: #000 !important; color: var(--text-d) !important; font-family: var(--mono); }
  .mech-select option { background: #000 !important; color: var(--border-hi) !important; font-family: var(--mono); padding: 8px; }
  .mob-tab-bar { display: flex; border-bottom: 1px solid var(--border, #2a3a2a); background: rgba(1,8,3,0.85); flex-shrink: 0; }
  .mob-tab { flex: 1; padding: 12px 0; text-align: center; font-family: var(--mono); font-size: 11px; letter-spacing: 2px; color: var(--text-d); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s; }
  .mob-tab.active { color: var(--border-hi); border-bottom: 2px solid var(--border-hi); background: rgba(74,222,128,0.1); text-shadow: var(--glow); }
  .mob-form-wrapper { padding: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 14px; }
  .mob-input-group { display: flex; flex-direction: column; gap: 6px; position: relative; }
  .mob-log-wrapper { padding: 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .mob-tx-card { background: rgba(4,1,1,0.85); border: 1px solid #2a0800; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.2s ease; }
  .mob-tx-card.target-locked { animation: targetLockPulse 1s ease-in-out infinite; }
  .mob-tx-card.assimilate-in { animation: dataAssimilate 0.4s cubic-bezier(0.1,0.9,0.2,1) forwards; opacity: 0; }
  .mob-tx-row-1 { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-d); }
  .mob-tx-row-2 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .mob-tx-desc { font-size: 12px; color: #fff; text-transform: uppercase; font-family: var(--mono); flex: 1; word-break: break-word; }
  .mob-tx-amt { font-size: 16px; font-weight: bold; font-family: var(--mono); white-space: nowrap; }
  .mob-tx-row-3 { display: flex; justify-content: space-between; align-items: flex-end; }
  .mob-tx-cat { font-size: 9px; color: #b8923e; letter-spacing: 1px; }
  .mob-action-btn { background: transparent; border: 1px solid var(--border); color: var(--text-d); font-size: 9px; padding: 5px 10px; font-family: var(--mono); cursor: pointer; transition: background 0.15s ease; }
  .mob-action-btn:active { background: rgba(255,255,255,0.05); }
  .mob-action-btn.del { border-color: #cc2200; color: #cc2200; }
  .mob-action-btn.del:active { background: rgba(204,34,0,0.2); }
  .mob-action-btn.edit-active { border-color: var(--amber, #eab308); color: var(--amber, #eab308); }
  .mob-log-wrapper::-webkit-scrollbar { width: 3px; }
  .mob-log-wrapper::-webkit-scrollbar-track { background: #050000; }
  .mob-log-wrapper::-webkit-scrollbar-thumb { background: rgba(204,34,0,0.5); border-radius: 2px; }
  @keyframes skullShake { 0%, 100% { transform: translate(0,0) rotate(0deg); } 25% { transform: translate(-4px,0) rotate(-5deg); } 50% { transform: translate(4px,0) rotate(5deg); } 75% { transform: translate(-4px,0) rotate(-5deg); } }
  .skull-shake { animation: skullShake 0.4s ease-in-out; }
  @keyframes typingPulse { 0%, 100% { transform: scaleX(0.9); opacity: 0.6; } 50% { transform: scaleX(1.1); opacity: 1; } }
  .typing-laser { animation: typingPulse 0.4s ease-in-out infinite; }
  @keyframes laserSweep { 0% { height: 0; opacity: 1; } 50% { height: 60px; opacity: 1; } 100% { height: 0; opacity: 0; transform: translateY(60px); } }
  .laser-sweep { animation: laserSweep 2s ease-in-out forwards; }
  @keyframes dataAssimilate { 0% { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); } }
  @keyframes targetLockPulse { 0% { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 20px rgba(204,34,0,0.5); border-color: var(--ba-crimson); } 50% { box-shadow: inset 0 0 0 1px var(--ba-gold), inset 0 0 30px rgba(201,168,76,0.4); border-color: var(--ba-gold); } 100% { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 20px rgba(204,34,0,0.5); border-color: var(--ba-crimson); } }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .reimb-tag-row { animation: fadeSlideIn 0.25s ease forwards; }
`;

// ── Main Component ──
export default function MobileLedger({ data, dbTransactions, dbMetadata, user }) {
  const [activeTab, setActiveTab] = useState('entry');

  const transactions       = data?.transactions       ?? [];
  const accounts           = data?.accounts           ?? [];
  const cards              = data?.cards              ?? [];
  const expenseCategories  = data?.expenseCategories  ?? [];
  const positiveCategories = data?.positiveCategories ?? [];
  const neutralCategories  = data?.neutralCategories  ?? [];
  
  const existingTags = AREngine.getAllTags(transactions);

  const blankForm = {
    date: localDateStr(),
    description: '', amount: '', method: '',
    category: 'Uncategorized',
    isReimbursable: false, reimbursementTag: '', notes: '',
  };

  const [formData, setFormData]           = useState(blankForm);
  const [isEditing, setIsEditing]         = useState(null);
  const [lastAddedId, setLastAddedId]     = useState(null);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [isAmtFocused, setIsAmtFocused]   = useState(false);

  // Seed default method
  useEffect(() => {
    if (!formData.method && accounts.length > 0) {
      const firstSubId = accounts[0]._id?.split(':').pop() || '';
      setFormData(prev => ({ ...prev, method: firstSubId }));
    }
  }, [accounts]);

  // Skull positioning logic
  const getIdleDock = () => ({ x: window.innerWidth - 62, y: 10 });
  const [skullState, setSkullState] = useState({ ...getIdleDock(), status: 'idle' });

  const aimSkull = (element, offsetX = 0, offsetY = 0, status = 'idle') => {
    if (!element) { setSkullState({ ...getIdleDock(), status: 'idle' }); return; }
    const rect = element.getBoundingClientRect();
    setSkullState({ x: rect.right - 50 + offsetX, y: rect.top - 25 + offsetY, status });
  };

  const newRowRef = useRef(null);

  useEffect(() => {
    if (!lastAddedId) return;
    setActiveTab('log');
    const timer = setTimeout(() => {
      if (newRowRef.current) {
        newRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = newRowRef.current.getBoundingClientRect();
        setSkullState({ x: rect.right - 60, y: rect.top - 25, status: 'scan' });
      }
      const clearTimer = setTimeout(() => {
        setLastAddedId(null);
        setSkullState({ ...getIdleDock(), status: 'idle' });
      }, 2500);
      return () => clearTimeout(clearTimer);
    }, 300);
    return () => clearTimeout(timer);
  }, [lastAddedId, transactions]);

  // ── Handlers ──
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'category' && value === 'Reimbursement Received') next.isReimbursable = true;
      return next;
    });
  };

  const handleFocus = (e, type) => {
    if (type === 'desc') setIsDescFocused(true);
    if (type === 'amt')  setIsAmtFocused(true);
    aimSkull(e.target, 10, 0, 'focus');
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
    const suggested = await CategorizationEngine.autoTag(desc, dbMetadata, user);
    if (suggested !== 'Uncategorized') {
      setFormData(prev => ({
        ...prev,
        category: suggested,
        isReimbursable: suggested === 'Reimbursement Received' ? true : prev.isReimbursable,
      }));
    }
  };

  // Resolve V2 Sub Account Type
  const resolveAccountType = (subId) => {
    if (!subId || subId === 'cash_main') return 'Cash';
    if (cards.find(c => c._id?.split(':').pop() === subId)) return 'Card';
    return 'Bank';
  };

  const resolveMethodLabel = (subId) => {
    if (!subId) return 'UNKNOWN';
    if (subId === 'cash_main') return 'CASH';
    const card = cards.find(c => c._id?.split(':').pop() === subId);
    if (card) return card.name.toUpperCase();
    const acc = accounts.find(a => a._id?.split(':').pop() === subId);
    if (acc) return acc.name.toUpperCase();
    const accByName = accounts.find(a => a.name === subId);
    if (accByName) return accByName.name.toUpperCase();
    const cardByName = cards.find(c => c.name === subId);
    if (cardByName) return cardByName.name.toUpperCase();
    return subId.toUpperCase();
  };

  const getTransactionType = (category) => {
    if (positiveCategories.includes(category)) return 'income';
    if (neutralCategories.includes(category))  return 'neutral';
    return 'expense';
  };

  const handleInscribe = async (e) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || Number(formData.amount) <= 0) {
      setSkullState(prev => ({ ...prev, status: 'error' }));
      setTimeout(() => setSkullState(prev => ({ ...prev, status: 'idle' })), 600);
      return;
    }

    const subId     = formData.method || accounts[0]?._id?.split(':').pop() || 'bank_hdfc';
    const actType   = resolveAccountType(subId);
    const rawAmt    = Number(formData.amount);
    const isIncome  = positiveCategories.includes(formData.category);
    const signedAmt = isIncome ? Math.abs(rawAmt) : -Math.abs(rawAmt);
    const suffix    = Math.random().toString(36).substring(2, 10);
    const txnId     = isEditing || `txn:${user}:${formData.date}:${suffix}`;

    const newTxn = {
      _id:               txnId,
      type:              'transaction',
      user_id:           user || 'Athang',
      date:              formData.date,
      amount:            signedAmt,
      description:       formData.description,
      category:          formData.category,
      account_type:      actType,
      sub_account:       subId,
      reimbursement_tag: formData.isReimbursable ? (formData.reimbursementTag.trim() || 'untagged') : null,
      notes:             formData.notes.trim() || null,
      created_at:        new Date().toISOString(),
    };

    if (dbTransactions) {
      if (isEditing) {
        try {
          const existing = await dbTransactions.get(isEditing);
          await dbTransactions.put({ ...existing, ...newTxn });
        } catch (err) { console.error('Update failed:', err); }
      } else {
        await dbTransactions.put(newTxn);
      }
    }

    setLastAddedId(txnId);
    setFormData(prev => ({ ...blankForm, date: prev.date, method: prev.method }));
    setIsEditing(null);
  };

  const handleEdit = (tx) => {
    const subId = (() => {
      const raw = tx.sub_account;
      if (!raw) return formData.method;
      if (raw === 'cash_main') return raw;
      if (accounts.find(a => a._id?.split(':').pop() === raw)) return raw;
      if (cards.find(c => c._id?.split(':').pop() === raw)) return raw;
      const acc = accounts.find(a => a.name === raw);
      if (acc) return acc._id?.split(':').pop() || raw;
      const card = cards.find(c => c.name === raw);
      if (card) return card._id?.split(':').pop() || raw;
      return formData.method;
    })();

    setFormData({
      date:             tx.date || tx._id.split('T')[0],
      description:      tx.description || '',
      amount:           Math.abs(tx.amount || 0).toString(),
      method:           subId,
      category:         tx.category || 'Uncategorized',
      isReimbursable:   !!(tx.reimbursement_tag || tx.is_reimbursable),
      reimbursementTag: (tx.reimbursement_tag && tx.reimbursement_tag !== 'untagged') ? tx.reimbursement_tag : '',
      notes:            tx.notes || '',
    });
    setIsEditing(tx._id);
    setActiveTab('entry');
  };

  const handleDelete = async (id) => {
    aimSkull(null);
    if (dbTransactions) {
      try {
        const doc = await dbTransactions.get(id);
        await dbTransactions.remove(doc);
      } catch (err) { console.error('Purge failed:', err); }
    }
  };

  const handleAbortEdit = () => {
    setIsEditing(null);
    setFormData(prev => ({ ...blankForm, date: prev.date, method: accounts[0]?._id?.split(':').pop() || 'Bank' }));
    aimSkull(null);
  };

  // ── Render ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <style>{MOBILELEDGER_STYLES}</style>

      {/* Skull — always mounted */}
      <TouchServoSkull x={skullState.x} y={skullState.y} status={skullState.status} />

      {/* TAB BAR */}
      <div className="mob-tab-bar">
        <button className={`mob-tab ${activeTab === 'entry' ? 'active' : ''}`} onClick={() => setActiveTab('entry')}>
          {isEditing ? 'RECALIBRATE' : 'INSCRIBE'}
        </button>
        <button className={`mob-tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
          LEDGER · {transactions.length}
        </button>
      </div>

      {/* ENTRY FORM */}
      {activeTab === 'entry' && (
        <form onSubmit={handleInscribe} className="mob-form-wrapper">
          <div style={{ fontSize: 11, letterSpacing: 2, color: isEditing ? 'var(--amber, #eab308)' : 'var(--text-d)', borderLeft: `2px solid ${isEditing ? 'var(--amber, #eab308)' : 'var(--ba-border-lo)'}`, paddingLeft: 8 }}>
            {isEditing ? 'RECALIBRATE TITHE · EDIT ENTRY' : 'INSCRIBE TITHE · LOG ENTRY'}
          </div>

          <div className="mob-input-group">
            <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>IDENTIFIER · DESCRIPTION</label>
            <input
              type="text" name="description" value={formData.description}
              onChange={handleInputChange}
              onFocus={e => handleFocus(e, 'desc')}
              onBlur={handleDescriptionBlur}
              className="mech-input"
              style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
              required autoComplete="off"
            />
            <CryptoPlaceholder text="AWAITING DESIGNATION..." active={!formData.description && !isDescFocused} />
          </div>

          <div className="mob-input-group">
            <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>QUANTITY</label>
            <input
              type="number" name="amount" value={formData.amount}
              onChange={handleInputChange}
              onFocus={e => handleFocus(e, 'amt')}
              onBlur={e => handleBlur(e, 'amt')}
              className="mech-input"
              style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
              required min="0" step="0.01"
            />
            <CryptoPlaceholder text="0.00" active={!formData.amount && !isAmtFocused} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="mob-input-group">
              <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>TEMPORAL STAMP</label>
              <input
                type="date" name="date" value={formData.date}
                onChange={handleInputChange}
                className="mech-input"
                style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
                required
                onFocus={e => aimSkull(e.target, 10, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              />
            </div>
            <div className="mob-input-group">
              <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>METHOD</label>
              <select
                name="method" value={formData.method}
                onChange={handleInputChange}
                className="mech-select"
                style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
                onFocus={e => aimSkull(e.target, 10, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              >
                <optgroup label="BANK ACCOUNTS">
                  {accounts.map(acc => {
                    const subId = acc._id?.split(':').pop() || acc._id;
                    return <option key={acc._id} value={subId}>{acc.name}</option>;
                  })}
                </optgroup>
                <optgroup label="CREDIT LINES">
                  {cards.map(card => {
                    const subId = card._id?.split(':').pop() || card._id;
                    return <option key={card._id} value={subId}>{card.name}</option>;
                  })}
                </optgroup>
                <optgroup label="PHYSICAL RESERVE">
                  <option value="cash_main">CASH RESERVE</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div className="mob-input-group">
            <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>CLASSIFICATION</label>
            <select
              name="category" value={formData.category}
              onChange={handleInputChange}
              className="mech-select"
              style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
              onFocus={e => aimSkull(e.target, 10, 0, 'focus')}
              onBlur={() => aimSkull(null)}
            >
              <option value="Uncategorized">-- AWAITING CLASSIFICATION --</option>
              {positiveCategories.length > 0 && (
                <optgroup label="── TITHE INCOME ──">
                  {positiveCategories.filter(cat => cat && cat !== 'Uncategorized').sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </optgroup>
              )}
              {neutralCategories.length > 0 && (
                <optgroup label="── TRANSFERS ──">
                  {neutralCategories.filter(cat => cat && cat !== 'Uncategorized').sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </optgroup>
              )}
              {expenseCategories.length > 0 && (
                <optgroup label="── EXPENDITURES ──">
                  {Array.from(new Set([...expenseCategories, formData.category]))
                    .filter(cat => cat && cat !== 'Uncategorized' && !positiveCategories.includes(cat) && !neutralCategories.includes(cat))
                    .sort().map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {/* Recovery directive toggle */}
          <div className="mob-input-group" style={{ flexDirection: 'row', gap: 8 }}>
            <button type="button" onClick={() => setFormData({ ...formData, isReimbursable: false, reimbursementTag: '' })}
              style={{ flex: 1, padding: '12px 4px', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer', background: !formData.isReimbursable ? 'rgba(204,34,0,0.15)' : 'rgba(0,0,0,0.5)', color: !formData.isReimbursable ? '#fff' : '#8c732c', border: '1px solid', borderColor: !formData.isReimbursable ? '#cc2200' : 'var(--border)', boxShadow: !formData.isReimbursable ? 'inset 0 0 10px rgba(204,34,0,0.2)' : 'none', transition: 'all 0.2s', letterSpacing: 1 }}>
              PERSONAL
            </button>
            <button type="button" onClick={() => setFormData({ ...formData, isReimbursable: true })}
              style={{ flex: 1, padding: '12px 4px', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer', background: formData.isReimbursable ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.5)', color: formData.isReimbursable ? '#fff' : '#8c732c', border: '1px solid', borderColor: formData.isReimbursable ? 'var(--border-hi)' : 'var(--border)', boxShadow: formData.isReimbursable ? 'inset 0 0 10px rgba(74,222,128,0.2)' : 'none', transition: 'all 0.2s', letterSpacing: 1 }}>
              RECOVERY
            </button>
          </div>

          {/* New Tag Input */}
          {formData.isReimbursable && (
            <div className="mob-input-group reimb-tag-row">
              <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>RECOVERY TARGET // WHO OWES YOU</label>
              <input
                type="text" name="reimbursementTag" value={formData.reimbursementTag}
                onChange={handleInputChange}
                placeholder="e.g. Rahul, Work Expense..."
                className="mech-input"
                list="mob-ar-tags-datalist"
                style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
                onFocus={e => aimSkull(e.target, 10, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              />
              <datalist id="mob-ar-tags-datalist">
                {existingTags.map(tag => <option key={tag} value={tag} />)}
              </datalist>
            </div>
          )}

          {/* New Notes Input */}
          <div className="mob-input-group">
            <label className="kpi-lbl" style={{ fontSize: 9, color: '#b8923e' }}>FIELD NOTES // OPTIONAL</label>
            <input
              type="text" name="notes" value={formData.notes}
              onChange={handleInputChange}
              placeholder="Additional context..."
              className="mech-input"
              style={{ padding: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', fontFamily: 'var(--mono)' }}
              onFocus={e => aimSkull(e.target, 10, 0, 'focus')}
              onBlur={() => aimSkull(null)}
            />
          </div>

          {isEditing && (
            <button type="button" onClick={handleAbortEdit}
              style={{ padding: 10, background: 'transparent', border: '1px solid var(--ba-border-lo)', color: 'var(--text-d)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer' }}>
              ABORT EDIT
            </button>
          )}

          <button type="submit"
            style={{ padding: 14, background: 'transparent', border: `1px solid ${isEditing ? 'var(--amber, #eab308)' : 'var(--border-hi)'}`, color: isEditing ? 'var(--amber, #eab308)' : 'var(--border-hi)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: 2, cursor: 'pointer' }}
            onTouchStart={e => aimSkull(e.currentTarget, 10, -10, 'idle')}
            onTouchEnd={() => aimSkull(null)}>
            {isEditing ? 'COMMIT MODIFICATION' : 'AUTHORIZE · INSCRIBE'}
          </button>
        </form>
      )}

      {/* TRANSACTION LOG */}
      {activeTab === 'log' && (
        <div className="mob-log-wrapper">
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-d)', fontSize: 12, fontFamily: 'var(--mono)' }}>
              AWAITING DATA STREAM...
            </div>
          ) : (
            transactions.map((tx, index) => {
              const txType      = getTransactionType(tx.category);
              const amountColor = txType === 'income' ? 'var(--border-hi)' : txType === 'neutral' ? 'var(--text-m, #888)' : '#cc2200';
              const isTargetLocked = tx._id === lastAddedId;
              const isNew          = index === 0;
              const animDelay      = `${Math.min(index * 0.04, 0.5)}s`;

              return (
                <div
                  key={tx._id}
                  ref={isTargetLocked ? newRowRef : null}
                  className={`mob-tx-card${isTargetLocked ? ' target-locked' : ''}${isNew ? ' assimilate-in' : ''}`}
                  style={{ animationDelay: isNew ? animDelay : '0s' }}
                >
                  <div className="mob-tx-row-1">
                    <span style={{ fontFamily: 'var(--mono)' }}>{tx.date}</span>
                    <span style={{ color: '#8c732c' }}>{resolveMethodLabel(tx.sub_account)}</span>
                  </div>

                  <div className="mob-tx-row-2">
                    <span className="mob-tx-desc">
                      {tx.description || 'UNKNOWN'}
                      {tx.reimbursement_tag && (
                        <span style={{ color: 'var(--border-hi)', marginLeft: 6, fontSize: 10 }}>[R: {tx.reimbursement_tag}]</span>
                      )}
                    </span>
                    <span className="mob-tx-amt" style={{ color: amountColor, textShadow: txType === 'income' ? 'var(--glow)' : 'none' }}>
                      {txType === 'income' ? '+' : ''}{Math.abs(tx.amount).toLocaleString()}
                    </span>
                  </div>

                  <div className="mob-tx-row-3">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className="mob-tx-cat">{tx.category || 'UNCATEGORIZED'}</span>
                      {tx.notes && <span style={{ fontSize: '8px', color: 'var(--ba-gold-mute)' }}>// {tx.notes}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className={`mob-action-btn${isEditing === tx._id ? ' edit-active' : ''}`} onClick={() => handleEdit(tx)}>EDIT</button>
                      <button className="mob-action-btn del" onClick={() => handleDelete(tx._id)}>DEL</button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}