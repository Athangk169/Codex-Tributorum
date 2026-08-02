// src/components/slides/LedgerSlide.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { localDateStr } from '../../utils/localDate';
import { CategorizationEngine, AREngine } from '../../utils/engine';
import RecoveryDossier from '../shared/RecoveryDossier';
import QuotaLine, { QUOTA_STYLES } from '../shared/QuotaLine';
import { quotaForCategory, projectQuota } from '../../utils/quota';

// ── CryptoPlaceholder ─────────────────────────────────────────
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

// ── LedgerServoSkull ──────────────────────────────────────────
const LedgerServoSkull = ({ x, y, status }) => {
  const containerRef = useRef(null);
  const mvRef        = useRef(null);
  const trackingCooldownRef = useRef(false);
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    import('@google/model-viewer').catch(console.error);
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', '/servo-skull_warhammer.glb');
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
      case 'idle':   mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)'; break;
      case 'focus':  mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.2)'; break;
      case 'scan':   mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(85deg) brightness(1.4)'; break;
      case 'error':  mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-10deg) brightness(1.3)'; break;
      case 'delete': mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.0)'; break;
      default:       mvRef.current.style.filter = 'sepia(1) saturate(2) hue-rotate(85deg) brightness(0.7)';
    }
  }, [status]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (status !== 'idle' || trackingCooldownRef.current) {
        setMouseOffset({ x: 0, y: 0 });
        return;
      }
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = (e.clientY / window.innerHeight) * 2 - 1;
      setMouseOffset({ x: normX * 10, y: normY * 10 });
      if (mvRef.current) {
        const theta      = 45 - (normX * 70);
        const phi        = 75 - (normY * 30);
        const clampedPhi = Math.max(45, Math.min(120, phi));
        mvRef.current.setAttribute('camera-orbit', `${theta}deg ${clampedPhi}deg 2.5m`);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [status]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '68px', height: '68px',
      transform: `translate(${x}px, ${y}px)`,
      transition: 'transform 2.5s ease-in-out',
      zIndex: 100, pointerEvents: 'none'
    }}>
      <div
        className={`servo-skull-inquisitor ${status === 'error' ? 'skull-shake' : ''}`}
        style={{
          width: '100%', height: '100%',
          transform: `translate(${mouseOffset.x}px, ${mouseOffset.y}px)`,
          transition: 'transform 0.2s ease-out',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {status === 'focus' && (
          <div className="typing-laser" style={{
            position: 'absolute', right: '45px', top: '36px',
            width: '180px', height: '2px',
            background: 'linear-gradient(270deg, #cc2200 0%, rgba(204,34,0,0) 100%)',
            boxShadow: '0 0 10px 2px rgba(204,34,0,0.8)',
            transformOrigin: 'right center', zIndex: -1
          }} />
        )}
        {status === 'scan' && (
          <div className="laser-sweep" style={{
            position: 'absolute', left: '50%', top: '55px', width: '2px',
            background: '#4ade80', boxShadow: '0 0 12px 2px #4ade80', zIndex: -1
          }} />
        )}
        {status === 'delete' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: '150px', height: '1px',
            background: 'linear-gradient(90deg, #cc2200, transparent)',
            transform: 'translateY(-50%)', opacity: 0.6, zIndex: -1
          }} />
        )}
      </div>
    </div>
  );
};

// ── LedgerSlide ───────────────────────────────────────────────
// Loans were removed as a feature: 'Loan Drawdown' / 'Loan Payment' are no
// longer offered for new entries. isLoanCategory is retained only so existing
// loan transactions still render read-only in the ledger and are treated as
// obligations (no reimbursement tagging) when present.
const isLoanCategory = (category) => category === 'Loan Drawdown' || category === 'Loan Payment';
const isEmiCategory = (category) => category === 'EMI Payment';
const isObligationCategory = (category) => isLoanCategory(category) || isEmiCategory(category);

const LedgerSlide = ({ data, dbTransactions, dbMetadata, user }) => {
  const transactions       = useMemo(() => data?.transactions       || [], [data?.transactions]);
  const accounts           = useMemo(() => data?.accounts           || [], [data?.accounts]);
  const cards              = useMemo(() => data?.cards              || [], [data?.cards]);
  const expenseCategories  = useMemo(() => data?.expenseCategories  || [], [data?.expenseCategories]);
  const positiveCategories = useMemo(() => data?.positiveCategories || [], [data?.positiveCategories]);
  const neutralCategories  = useMemo(() => data?.neutralCategories  || [], [data?.neutralCategories]);
  const emis               = useMemo(() => data?.obligations?.emis  || [], [data?.obligations?.emis]);
  const allCategories = [
    ...expenseCategories,
    ...positiveCategories,
    ...neutralCategories,
    'EMI Payment',
  ];

  // All previously used AR tags — drives datalist autocomplete
  const existingTags = AREngine.getAllTags(transactions);

  const slideRef = useRef(null);
  const rowRef   = useRef(null);

  const blankForm = {
    date: localDateStr(),
    description: '', amount: '', method: '',
    category: 'Uncategorized',
    isReimbursable: false, reimbursementTag: '', notes: '',
    emiId: '',
  };

  const [formData,      setFormData]      = useState(blankForm);
  const [isEditing,     setIsEditing]     = useState(null);
  const [lastAddedId,   setLastAddedId]   = useState(null);
  const [isDescFocused, setIsDescFocused] = useState(false);
  const [isAmtFocused,  setIsAmtFocused]  = useState(false);
  const [dossierTag,    setDossierTag]    = useState(null);

  // ── Tithe check at the point of inscription ──
  // The decree's whole purpose is to be seen *before* the spend, so the
  // sanctioned cap for the chosen category is shown under the form and
  // projected against the amount being typed. A reimbursable entry is
  // excluded because getMonthlyTrends drops tagged spend from the
  // actuals this projects against — counting it would double-warn on
  // money that never lands in the quota.
  const quotaLine = quotaForCategory(data?.quota, formData.category);
  const quotaProj = quotaLine && !formData.isReimbursable
    ? projectQuota(quotaLine, formData.amount, data?.quota?.paceFrac || 0)
    : null;
  // An edit already contributes its old amount to `spent`; re-projecting
  // the full amount on top would double-count it.
  const quotaProjActive = quotaProj && !isEditing && quotaProj.add > 0 ? quotaProj : null;

  const resolveSubAccountInput = (raw) => {
    const value = (raw || '').trim();
    if (!value) return '';
    if (value === 'cash_main' || value === 'external') return value;

    const byId = [...accounts, ...cards].find(item => {
      const subId = item._id?.split(':').pop();
      return item._id === value || subId === value;
    });
    if (byId) return byId._id?.split(':').pop() || value;

    const byName = [...accounts, ...cards].find(item =>
      (item.name || '').toLowerCase() === value.toLowerCase()
    );
    return byName?._id?.split(':').pop() || value;
  };

  const getFallbackMethod = () =>
    accounts[0]?._id?.split(':').pop()
    || cards[0]?._id?.split(':').pop()
    || 'cash_main';

  const getEmiAccountMethod = (emi) => resolveSubAccountInput(emi?.account);

  const selectedEmi  = emis.find(emi => emi._id === formData.emiId);

  // Loans are gone; historical loan rows only need a display label from the id.
  const resolveLoanLabel = (loanId) => loanId?.split(':').pop() || 'UNKNOWN LOAN';

  const resolveEmiLabel = (emiId) => {
    const emi = emis.find(item => item._id === emiId);
    return emi?.name || emiId?.split(':').pop() || 'UNKNOWN EMI';
  };

  const calculateEmiPaymentComponents = (emi, amount, existingTxn = null) => {
    const absAmount = Math.abs(Number(amount) || 0);
    if (!emi || absAmount <= 0) return { principal: 0, interest: 0 };

    const oldPrincipal = existingTxn?.emi_id === emi._id && existingTxn?.category === 'EMI Payment'
      ? Number(existingTxn.principal_component || 0)
      : 0;
    const financedAmount = Math.max(0, Number(emi.financed_amount ?? (
      Number(emi.total_amount || 0) - Number(emi.down_payment || 0)
    )));
    const liveOutstanding = Number(emi.balance?.outstanding || 0);
    const outstanding = (liveOutstanding > 0 ? liveOutstanding : financedAmount) + oldPrincipal;
    const totalPayable = Math.max(
      Number(emi.emi_amount || 0) * Number(emi.tenure_months || 0),
      financedAmount
    );
    const principalRatio = totalPayable > 0 ? financedAmount / totalPayable : 1;
    const principal = Math.min(outstanding, absAmount * principalRatio);

    return {
      principal,
      interest: Math.max(0, absAmount - principal),
    };
  };

  const markInvalid = () => {
    setSkullState(prev => ({ ...prev, status: 'error' }));
    setTimeout(() => setSkullState(prev => ({ ...prev, status: 'idle' })), 600);
  };

  // Skull state
  const idleDock = { x: 380, y: 8 };
  const [skullState, setSkullState] = useState({ ...idleDock, status: 'idle' });

  const aimSkull = (element, offsetX = 0, offsetY = 0, status = 'idle') => {
    if (!element || !slideRef.current) {
      setSkullState({ ...idleDock, status: 'idle' });
      return;
    }
    const slideRect = slideRef.current.getBoundingClientRect();
    const elRect    = element.getBoundingClientRect();
    setSkullState({
      x: elRect.right - slideRect.left + offsetX,
      y: elRect.top   - slideRect.top  + offsetY - 15,
      status
    });
  };

  useEffect(() => {
    if (!lastAddedId || !rowRef.current) return;

    // Instant scroll so the row is in its final position before we read coordinates
    rowRef.current.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Clear the target-lock highlight after a moment
    const t = setTimeout(() => {
      setLastAddedId(null);
    }, 2800);

    return () => clearTimeout(t);
  }, [lastAddedId, transactions]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'category') {
        if (value === 'Reimbursement Received') next.isReimbursable = true;
        if (isObligationCategory(value)) {
          next.isReimbursable = false;
          next.reimbursementTag = '';
        }
        if (!isEmiCategory(value)) next.emiId = '';
        if (isEmiCategory(value) && !next.emiId && emis.length > 0) {
          next.emiId = emis[0]._id;
        }
      }

      const category = name === 'category' ? value : next.category;

      if (isEmiCategory(category) && (name === 'category' || name === 'emiId')) {
        const emi = emis.find(item => item._id === next.emiId);
        const method = getEmiAccountMethod(emi);
        if (method) next.method = method;
        if (!next.amount && emi?.emi_amount) next.amount = String(emi.emi_amount);
      }

      return next;
    });
  };

  const handleFocus = (e, type) => {
    if (type === 'desc') setIsDescFocused(true);
    if (type === 'amt')  setIsAmtFocused(true);
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
    const suggested = await CategorizationEngine.autoTag(desc, dbMetadata, user);
    if (suggested !== 'Uncategorized')
      setFormData(prev => ({
        ...prev,
        category:       suggested,
        isReimbursable: suggested === 'Reimbursement Received' ? true : prev.isReimbursable,
      }));
  };

  // Resolve account_type from subaccount ID
  const resolveAccountType = (subId) => {
    if (!subId || subId === 'cash_main') return 'Cash';
    if (cards.find(c => c._id?.split(':').pop() === subId)) return 'Card';
    return 'Bank';
  };

  // Resolve display label from sub_account ID
  const resolveMethodLabel = (subId) => {
    if (!subId) return 'UNKNOWN';
    if (subId === 'cash_main') return 'CASH';
    if (subId === 'external') return 'EXTERNAL';
    const card = cards.find(c => c._id?.split(':').pop() === subId);
    if (card) return card.name.toUpperCase();
    const acc = accounts.find(a => a._id?.split(':').pop() === subId);
    if (acc) return acc.name.toUpperCase();
    // Legacy fallback — old transactions stored display names
    const accByName = accounts.find(a => a.name === subId);
    if (accByName) return accByName.name.toUpperCase();
    const cardByName = cards.find(c => c.name === subId);
    if (cardByName) return cardByName.name.toUpperCase();
    return subId.toUpperCase();
  };

  const getTransactionType = (category) => {
    if (category === 'Loan Drawdown') return 'income';
    if (positiveCategories.includes(category)) return 'income';
    if (neutralCategories.includes(category))  return 'neutral';
    return 'expense';
  };

  const handleInscribe = async (e) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || Number(formData.amount) <= 0) {
      markInvalid();
      return;
    }
    if (formData.isReimbursable && !formData.reimbursementTag.trim()) {
      markInvalid();
      return;
    }
    if (isEmiCategory(formData.category) && !formData.emiId) {
      markInvalid();
      return;
    }


    let existingTxn = null;
    if (isEditing && dbTransactions) {
      try {
        existingTxn = await dbTransactions.get(isEditing);
      } catch (err) {
        console.error('EDIT LOAD FAILED:', err);
        markInvalid();
        return;
      }
    }

    const rawAmt        = Number(formData.amount);
    const category      = formData.category;
    const emi           = emis.find(item => item._id === formData.emiId);
    const fallback      = getFallbackMethod();
    const requestedSub  = resolveSubAccountInput(formData.method);
    const subId         = requestedSub
      || (isEmiCategory(category) ? getEmiAccountMethod(emi) : '')
      || fallback;
    const actType       = resolveAccountType(subId);
    const isIncome      = positiveCategories.includes(category);
    const signedAmt     = isIncome ? Math.abs(rawAmt) : -Math.abs(rawAmt);
    const suffix        = Math.random().toString(36).substring(2, 10);
    const txnId         = isEditing || `txn:${user}:${formData.date}:${suffix}`;
    const emiParts      = category === 'EMI Payment'
      ? calculateEmiPaymentComponents(emi, rawAmt, existingTxn)
      : null;

    const newTxn = {
      _id:               txnId,
      type:              'transaction',
      user_id:           user,
      date:              formData.date,
      amount:            signedAmt,
      description:       formData.description,
      category,
      account_type:      actType,
      sub_account:       subId,
      reimbursement_tag: formData.isReimbursable
                           ? (formData.reimbursementTag.trim() || 'untagged')
                           : null,
      notes:             formData.notes.trim() || null,
      // Explicit nulls clear stale obligation tags when editing entries.
      loan_id:           null,
      emi_id:            isEmiCategory(category) ? formData.emiId : null,
      paid_by:           null,
      principal_component: emiParts ? emiParts.principal : null,
      interest_component:  emiParts ? emiParts.interest  : null,
      created_at:        new Date().toISOString(),
    };

    if (dbTransactions) {
      try {
        if (isEditing) {
          await dbTransactions.put({ ...existingTxn, ...newTxn, _rev: existingTxn._rev });
        } else {
          await dbTransactions.put(newTxn);
        }
        setLastAddedId(txnId);
      } catch (err) {
        console.error('◈ INSCRIBE FAILED:', err);
        setSkullState(prev => ({ ...prev, status: 'error' }));
        setTimeout(() => setSkullState(prev => ({ ...prev, status: 'idle' })), 800);
        return;
      }
    }

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

    const category = tx.category || 'Uncategorized';

    setFormData({
      date:             tx.date || localDateStr(),
      description:      tx.description || '',
      amount:           Math.abs(tx.amount || 0).toString(),
      method:           subId,
      category,
      isReimbursable:   !isObligationCategory(category) && !!(tx.reimbursement_tag || tx.is_reimbursable),
      reimbursementTag: (tx.reimbursement_tag && tx.reimbursement_tag !== 'untagged')
                          ? tx.reimbursement_tag : '',
      notes:            tx.notes || '',
      emiId:            tx.emi_id || '',
    });
    setIsEditing(tx._id);
  };

  const handleDelete = async (id) => {
    aimSkull(null);
    if (dbTransactions) {
      try {
        const doc = await dbTransactions.get(id);
        await dbTransactions.remove(doc);
      } catch (err) { console.error('◈ PURGE FAILED:', err); }
    }
  };

  return (
    <div
      className="slide-container active"
      ref={slideRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '15px', position: 'relative' }}
    >
      <LedgerServoSkull x={skullState.x} y={skullState.y} status={skullState.status} />

      <style>{`
        ${QUOTA_STYLES}
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        .mech-input, .mech-select { border-left: 2px solid var(--border); }
        .mech-input:focus, .mech-select:focus {
          border-left: 3px solid var(--ba-crimson) !important;
          border-color: var(--border-hi) !important;
        }
        .mech-select optgroup { background: #000 !important; color: var(--text-d) !important; font-family: var(--mono); }
        .mech-select option   { background: #000 !important; color: var(--border-hi) !important; font-family: var(--mono); }
        .ledger-scroll::-webkit-scrollbar       { width: 4px; }
        .ledger-scroll::-webkit-scrollbar-track { background: #050000; }
        .ledger-scroll::-webkit-scrollbar-thumb { background: rgba(204,34,0,0.5); border-radius: 2px; }
        @keyframes skullShake {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          25%     { transform: translate(-4px,0) rotate(-5deg); }
          50%     { transform: translate(4px,0) rotate(5deg); }
          75%     { transform: translate(-4px,0) rotate(-5deg); }
        }
        .skull-shake { animation: skullShake 0.4s ease-in-out; }
        @keyframes typingPulse {
          0%,100% { transform: scaleX(0.9); opacity: 0.6; }
          50%     { transform: scaleX(1.1); opacity: 1; }
        }
        .typing-laser { animation: typingPulse 0.4s ease-in-out infinite; }
        @keyframes laserSweep {
          0%   { height: 0; opacity: 1; }
          50%  { height: 60px; opacity: 1; }
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
          background: rgba(200,34,0,0.08);
          box-shadow: inset 0 0 15px rgba(200,34,0,0.15);
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
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reimb-tag-row { animation: fadeSlideIn 0.25s ease forwards; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '15px', flex: 1, minHeight: 0 }}>

        {/* ── LEFT: Form ── */}
        <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px', overflowY: 'auto' }}>
          <div className="sec-ttl" style={{ marginBottom: '20px', color: isEditing ? 'var(--amber)' : 'var(--text-d)' }}>
            {isEditing ? 'RECALIBRATE TITHE · EDIT ENTRY' : 'INSCRIBE TITHE · LOG ENTRY'}
          </div>

          <form onSubmit={handleInscribe} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', flex: 1, alignContent: 'start' }}>

            <div style={{ position: 'relative' }}>
              <label className="kpi-lbl">IDENTIFIER · DESCRIPTION</label>
              <input
                type="text" name="description" value={formData.description}
                onChange={handleInputChange}
                onFocus={(e) => handleFocus(e, 'desc')}
                onBlur={handleDescriptionBlur}
                className="mech-input" required autoComplete="off"
              />
              <CryptoPlaceholder text="AWAITING DESIGNATION..." active={!formData.description && !isDescFocused} />
            </div>

            <div style={{ position: 'relative' }}>
              <label className="kpi-lbl">QUANTITY</label>
              <input
                type="number" name="amount" value={formData.amount}
                onChange={handleInputChange}
                onFocus={(e) => handleFocus(e, 'amt')}
                onBlur={(e) => handleBlur(e, 'amt')}
                className="mech-input" required min="0" step="0.01"
              />
              <CryptoPlaceholder text="0.00" active={!formData.amount && !isAmtFocused} />
            </div>

            <div>
              <label className="kpi-lbl">TEMPORAL STAMP</label>
              <input
                type="date" name="date" value={formData.date}
                onChange={handleInputChange} className="mech-input" required
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              />
            </div>

            <div>
              <label className="kpi-lbl">TRANSACTION METHOD</label>
              <select
                name="method" value={formData.method || getFallbackMethod()}
                onChange={handleInputChange} className="mech-select"
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
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

            <div>
              <label className="kpi-lbl">CLASSIFICATION</label>
              <select
                name="category" value={formData.category}
                onChange={handleInputChange} className="mech-select"
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              >
                <option value="Uncategorized">-- AWAITING CLASSIFICATION --</option>
                {Array.from(new Set([...allCategories, formData.category]))
                  .filter(cat => cat && cat !== 'Uncategorized')
                  .sort()
                  .map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {/* ── TITHE CHECK ── the sanctioned cap for this classification,
                projected against the amount being inscribed. */}
            {quotaLine && (
              <div style={{ gridColumn: '1 / -1', padding: '8px 10px', border: '1px solid var(--ba-border)', background: 'rgba(0,0,0,0.25)' }}>
                <QuotaLine
                  line={quotaLine}
                  proj={quotaProjActive}
                  paceFrac={data?.quota?.paceFrac || 0}
                />
                {formData.isReimbursable && (
                  <div style={{ marginTop: '6px', fontSize: '9px', color: 'var(--ba-gold-mute)', letterSpacing: '1px' }}>
                    ✠ REIMBURSABLE — DRAWS NO TITHE
                  </div>
                )}
              </div>
            )}

            {isEmiCategory(formData.category) && (
              <div className="reimb-tag-row" style={{ gridColumn: '1 / -1' }}>
                <label className="kpi-lbl">OBLIGATION TARGET // EMI PURCHASE</label>
                <select
                  name="emiId" value={formData.emiId}
                  onChange={handleInputChange} className="mech-select" required
                  onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
                  onBlur={() => aimSkull(null)}
                  style={!formData.emiId ? { borderColor: 'var(--ba-crimson)', boxShadow: 'inset 0 0 8px rgba(204,34,0,0.2)' } : {}}
                >
                  <option value="">-- SELECT EMI --</option>
                  {emis.map(emi => (
                    <option key={emi._id} value={emi._id}>
                      {emi.name} // {Math.round(emi.emi_amount || 0).toLocaleString()} / MO
                    </option>
                  ))}
                </select>
                {selectedEmi && (
                  <div style={{ marginTop: '6px', fontSize: '9px', color: 'var(--ba-gold-mute)', letterSpacing: '1px' }}>
                    REMAINING {selectedEmi.balance?.monthsRemaining ?? selectedEmi.tenure_months} // OUTSTANDING {Math.round(selectedEmi.balance?.outstanding ?? selectedEmi.financed_amount ?? 0).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {!isObligationCategory(formData.category) && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label className="kpi-lbl">RECOVERY DIRECTIVE</label>
              <div
                style={{ display: 'flex', gap: '6px', marginTop: '5px', flex: 1 }}
                onMouseEnter={(e) => aimSkull(e.currentTarget, 30, 0, 'focus')}
                onMouseLeave={() => aimSkull(null)}
              >
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isReimbursable: false, reimbursementTag: '' }))}
                  style={{
                    flex: 1, padding: '10px 4px', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer',
                    background: !formData.isReimbursable ? 'rgba(204,34,0,0.15)' : 'rgba(2,8,4,0.7)',
                    color: !formData.isReimbursable ? '#fff' : 'var(--ba-gold-mute)',
                    border: '1px solid', borderColor: !formData.isReimbursable ? 'var(--ba-crimson)' : 'var(--ba-border-lo)',
                    boxShadow: !formData.isReimbursable ? 'inset 0 0 10px rgba(204,34,0,0.2)' : 'none',
                    transition: 'all 0.2s', letterSpacing: '1px'
                  }}
                >[ PERSONAL ]</button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isReimbursable: true }))}
                  style={{
                    flex: 1, padding: '10px 4px', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer',
                    background: formData.isReimbursable ? 'rgba(74,222,128,0.15)' : 'rgba(2,8,4,0.7)',
                    color: formData.isReimbursable ? '#fff' : 'var(--ba-gold-mute)',
                    border: '1px solid', borderColor: formData.isReimbursable ? 'var(--border-hi)' : 'var(--ba-border-lo)',
                    boxShadow: formData.isReimbursable ? 'inset 0 0 10px rgba(74,222,128,0.2)' : 'none',
                    transition: 'all 0.2s', letterSpacing: '1px'
                  }}
                >[ RECOVERY ]</button>
              </div>
            </div>
            )}

            {formData.isReimbursable && !isObligationCategory(formData.category) && (
              <div className="reimb-tag-row" style={{ gridColumn: '1 / -1' }}>
                <label className="kpi-lbl">RECOVERY TARGET // WHO OWES YOU</label>
                <input
                  type="text" name="reimbursementTag" value={formData.reimbursementTag}
                  onChange={handleInputChange}
                  placeholder="e.g. Rahul, Work Expense..."
                  className="mech-input"
                  list="ar-tags-datalist"
                  required
                  onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
                  onBlur={() => aimSkull(null)}
                  style={!formData.reimbursementTag.trim() ? { borderColor: 'var(--ba-crimson)', boxShadow: 'inset 0 0 8px rgba(204,34,0,0.2)' } : {}}
                />
                <datalist id="ar-tags-datalist">
                  {existingTags.map(tag => <option key={tag} value={tag} />)}
                </datalist>
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="kpi-lbl">FIELD NOTES // OPTIONAL</label>
              <input
                type="text" name="notes" value={formData.notes}
                onChange={handleInputChange}
                placeholder="Additional context..."
                className="mech-input"
                onFocus={(e) => aimSkull(e.target, 30, 0, 'focus')}
                onBlur={() => aimSkull(null)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: 'auto', paddingTop: '10px' }}>
              {isEditing && (
                <button
                  type="button" className="mech-btn"
                  style={{ marginBottom: '10px', background: 'transparent', color: 'var(--text-d)' }}
                  onClick={() => { setIsEditing(null); setFormData(blankForm); }}
                >ABORT EDIT</button>
              )}
              <button
                type="submit" className="mech-btn"
                style={{
                  margin: 0,
                  borderColor: isEditing ? 'var(--amber)'
                    : quotaProjActive?.projOver ? 'var(--ba-crimson)'
                    : 'var(--border-hi)',
                  color: !isEditing && quotaProjActive?.projOver ? 'var(--ba-crimson)' : undefined,
                }}
                onMouseEnter={(e) => aimSkull(e.target, 30, -10, 'idle')}
                onMouseLeave={() => aimSkull(null)}
              >
                {isEditing ? 'COMMIT MODIFICATION'
                  : quotaProjActive?.projOver ? 'AUTHORIZE BEYOND TITHE'
                  : 'AUTHORIZE & INSCRIBE'}
              </button>
            </div>
          </form>
        </div>

        {/* ── RIGHT: Ledger Table ── */}
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
                    const txType    = getTransactionType(tx.category);
                    const isLocked  = tx._id === lastAddedId;
                    const animDelay = `${Math.min(index * 0.05, 0.5)}s`;
                    return (
                      <tr
                        key={tx._id}
                        ref={isLocked ? rowRef : null}
                        className={`ledger-row ${isLocked ? 'target-locked' : ''}`}
                        style={{ animationDelay: isLocked ? '0s' : animDelay }}
                      >
                        <td style={{ color: 'var(--text-d)', fontSize: '11px', verticalAlign: 'top', paddingTop: '12px' }}>
                          {tx.date}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                          <div style={{ color: '#fff', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                            {tx.description || 'UNKNOWN'}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-d)' }}>
                            {tx.category}
                            {tx.reimbursement_tag && (
                              <span
                                onClick={() => setDossierTag(tx.reimbursement_tag)}
                                title="OPEN RECOVERY LEDGER"
                                style={{ color: 'var(--border-hi)', marginLeft: '6px', cursor: 'crosshair', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
                              >
                                [R: {tx.reimbursement_tag}]
                              </span>
                            )}
                            {tx.loan_id && (
                              <span style={{ color: 'var(--ba-gold)', marginLeft: '6px' }}>
                                [L: {resolveLoanLabel(tx.loan_id)}]
                              </span>
                            )}
                            {tx.emi_id && (
                              <span style={{ color: 'var(--ba-gold)', marginLeft: '6px' }}>
                                [EMI: {resolveEmiLabel(tx.emi_id)}]
                              </span>
                            )}
                            {(tx.category === 'Loan Payment' || tx.category === 'EMI Payment') && (tx.principal_component || tx.interest_component) && (
                              <span style={{ color: 'var(--ba-gold-mute)', marginLeft: '6px' }}>
                                [P: {Math.round(tx.principal_component || 0).toLocaleString()} / I: {Math.round(tx.interest_component || 0).toLocaleString()}]
                              </span>
                            )}
                            {tx.notes && (
                              <span style={{ color: 'var(--ba-gold-mute)', marginLeft: '6px' }}>
                                // {tx.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '10px', color: 'var(--text-d)', textTransform: 'uppercase', verticalAlign: 'top', paddingTop: '12px' }}>
                          {resolveMethodLabel(tx.sub_account)}
                        </td>
                        <td
                          className={txType === 'income' ? 'ok' : txType === 'neutral' ? '' : 'warn'}
                          style={{ textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top', paddingTop: '12px', fontSize: '14px' }}
                        >
                          {Math.abs(tx.amount).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '10px' }}>
                          {/* Loans were removed; historical loan rows are read-only (no edit). */}
                          {!(tx.loan_id || isLoanCategory(tx.category)) && (
                            <button className="action-btn" onClick={() => handleEdit(tx)}>EDIT</button>
                          )}
                          <button
                            className="action-btn del"
                            onClick={() => handleDelete(tx._id)}
                            onMouseEnter={(e) => aimSkull(e.target, -70, -10, 'delete')}
                            onMouseLeave={() => aimSkull(null)}
                          >DEL</button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                      <span className="blink">AWAITING DATA STREAM...</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {dossierTag && dbTransactions && (
        <RecoveryDossier
          tag={dossierTag}
          onClose={() => setDossierTag(null)}
          dbTransactions={dbTransactions}
          userId={user}
        />
      )}
    </div>
  );
};

export default LedgerSlide;
