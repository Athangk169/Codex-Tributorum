// src/components/slides/BankAccountsSlide.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AccountEngine } from '../../utils/engine';

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

// ── Servo Auditor 3D Viewer ──
const ServoAuditorViewer = ({ auditState }) => {
  const containerRef = useRef(null);
  const mvRef        = useRef(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    import('@google/model-viewer');

    const mv = document.createElement('model-viewer');
    const glbPath = window.electronDistPath?.distPath
    ? `file:///${window.electronDistPath.distPath.replace(/^\//, '')}/servo-skull_warhammer.glb`
    : 'servo-skull_warhammer.glb';
    mv.setAttribute('src', glbPath);
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');
    mv.style.outline = 'none';

    Object.assign(mv.style, {
      width: '100%',
      height: '100%',
      position: 'absolute',
      top: 0,
      left: 0,
      backgroundColor: 'transparent',
      '--progress-bar-color': 'transparent',
      '--progress-bar-height': '0px',
      transition: 'all 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)'
    });

    currentContainer.appendChild(mv);
    mvRef.current = mv;

    return () => {
      if (mv && currentContainer?.contains(mv)) {
        currentContainer.removeChild(mv);
      }
    };
  }, []);

  useEffect(() => {
    if (!mvRef.current) return;

    if (isScanning) {
      mvRef.current.setAttribute('field-of-view', '20deg');
    } else {
      mvRef.current.setAttribute('field-of-view', 'auto');
    }

    if (auditState === 'pure') {
      mvRef.current.setAttribute('camera-orbit', '0deg 75deg 2.5m');
      mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(85deg) brightness(0.75)';
    } else if (auditState === 'restless') {
      mvRef.current.setAttribute('camera-orbit', '0deg 75deg 1.7m');
      mvRef.current.style.filter = 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(0.8) drop-shadow(0 0 5px rgba(255,165,0,0.4))';
    } else {
      mvRef.current.setAttribute('camera-orbit', '0deg 75deg 1.0m');
      mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-30deg) brightness(0.55) drop-shadow(0 0 8px rgba(204,34,0,0.8))';
    }
  }, [auditState, isScanning]);

  const bobClass = auditState === 'pure' ? 'bob-pure' : (auditState === 'restless' ? 'bob-restless' : 'bob-corrupt');

  return (
    <div
      ref={containerRef}
      className={bobClass}
      onMouseEnter={() => setIsScanning(true)}
      onMouseLeave={() => setIsScanning(false)}
      style={{
        width: '80px',
        height: '80px',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '4px',
        cursor: 'crosshair'
      }}
    />
  );
};

const BankAccountsSlide = ({ data, dbTransactions, dbMetadata, userId }) => {
  const [accounts,       setAccounts]       = useState([]);
  const [balances,       setBalances]       = useState({ accounts: [], total: 0 });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [recentTxns,     setRecentTxns]     = useState([]);

  const [form, setForm] = useState({
    name: '',
    bank_name: '',
    minimum_balance: ''
  });

  const [isAdding,     setIsAdding]     = useState(false);
  const [statusMsg,    setStatusMsg]    = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [auditProgress, setAuditProgress] = useState(0);
  const [isAuditing,    setIsAuditing]    = useState(false);
  const auditTimerRef = useRef(null);

  const formatAmount = (amt) => `₹ ${Math.abs(amt || 0).toLocaleString()}`;

  // ==================== DATA LOADING ====================
  // FIX: loadData now reads from the `data` prop supplied by useFinanceData
  // instead of re-fetching from the engines directly. The hook already runs
  // getBankAccountBalances + getAccounts on every sync change, so we just
  // consume its output. Adding data?.liveBalances / data?.accounts as deps
  // means this callback gets a new identity — and the effect below re-fires —
  // whenever the hook pushes fresh numbers.
  //
  // The separate PouchDB changes listener and txnChangeSeq counter have been
  // removed — the hook's sync handlers already cover live updates.
  const loadData = useCallback(() => {
    const accs    = data?.accounts    ?? [];
    const balData = data?.liveBalances ?? { accounts: [], total: 0 };

    setAccounts(accs);
    setBalances(balData);

    setSelectedAccount((prev) => {
      if (prev) {
        const freshAcc = accs.find(a => a.id === prev.id);
        return freshAcc || prev;
      }
      return accs.length > 0 ? accs[0] : null;
    });
  }, [data?.accounts, data?.liveBalances]); // ← key fix: react to hook output

  // Re-run whenever the hook delivers new data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearInterval(auditTimerRef.current);
  }, []);

  // ==================== RECENT TRANSACTIONS ====================
  useEffect(() => {
    const loadRecent = async () => {
      if (!selectedAccount || !dbTransactions) return;

      const result = await dbTransactions.allDocs({ include_docs: true });
      const accountName = selectedAccount.name.toLowerCase();
      const accountId = selectedAccount.id.toLowerCase();

      const txns = result.rows
        .map(r => r.doc)
        .filter(d => {
          if (d.type !== 'transaction' || d.account_type !== 'Bank') return false;
          if (userId && d.user_id && d.user_id !== userId) return false;

          const sub = (d.sub_account || '').toLowerCase().trim();
          const desc = (d.description || '').toLowerCase();

          return sub === accountName || sub === accountId || desc.includes(accountName);
        })
        .sort((a, b) => (b.date || b._id).localeCompare(a.date || a._id))
        .slice(0, 15);

      setRecentTxns(txns);
    };

    loadRecent();
    // FIX: depend on data?.transactions so recent txns refresh when the hook
    // delivers new transaction data (no separate PouchDB listener needed).
  }, [selectedAccount, dbTransactions, userId, data?.transactions]);

  // ==================== HANDLERS ====================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setIsAdding(true);

    const result = await AccountEngine.addAccount(form, dbMetadata, userId);
    if (result.ok) {
      await AccountEngine.updateAccount(result.account.id, {
        minimum_balance: Number(form.minimum_balance) || 0,
        last_audited_date: new Date().toISOString()
      }, dbMetadata, userId);

      setForm({ name: '', bank_name: '', minimum_balance: '' });
      setStatusMsg({ type: 'success', text: 'Account created. Machine Spirit bound.' });
      await loadData();
    } else {
      setStatusMsg({ type: 'error', text: result.error });
    }
    setIsAdding(false);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm || !dbMetadata) return;

    const result = await AccountEngine.deleteAccount(deleteConfirm.id, dbMetadata, userId);
    if (result.ok) {
      setStatusMsg({ type: 'success', text: `Account "${deleteConfirm.name}" deleted` });
      if (selectedAccount?.id === deleteConfirm.id) setSelectedAccount(null);
      setDeleteConfirm(null);
      await loadData();
    } else {
      setStatusMsg({ type: 'error', text: result.error || 'Failed to delete' });
    }
    setTimeout(() => setStatusMsg(null), 2500);
  };

  // ==================== AUDITOR RITUAL LOGIC ====================
  const startAuditRitual = () => {
    setIsAuditing(true);
    setAuditProgress(0);
    clearInterval(auditTimerRef.current);

    auditTimerRef.current = setInterval(() => {
      setAuditProgress(prev => {
        if (prev >= 100) {
          clearInterval(auditTimerRef.current);
          completeAuditRitual();
          return 100;
        }
        return prev + 4;
      });
    }, 100);
  };

  const stopAuditRitual = () => {
    clearInterval(auditTimerRef.current);
    setIsAuditing(false);
    if (auditProgress < 100) setAuditProgress(0);
  };

  const completeAuditRitual = async () => {
    if (!selectedAccount) return;
    await AccountEngine.updateAccount(selectedAccount.id, {
      last_audited_date: new Date().toISOString()
    }, dbMetadata, userId);

    setAuditProgress(0);
    setIsAuditing(false);
    loadData();
  };

  // ==================== RENDER CALCULATIONS ====================
  const activeBalance = balances.accounts.find(b => b.account.id === selectedAccount?.id)?.balance || 0;
  const minBalance = selectedAccount?.minimum_balance || 0;
  const isBalanceCritical = activeBalance < minBalance;

  const lastAudited = selectedAccount?.last_audited_date || new Date(Date.now() - 86400000 * 8).toISOString();
  const daysSinceAudit = Math.max(0, Math.floor((Date.now() - new Date(lastAudited).getTime()) / (1000 * 60 * 60 * 24)));

  let auditState = 'pure';
  if (daysSinceAudit >= 7) auditState = 'corrupted';
  else if (daysSinceAudit >= 4) auditState = 'restless';

  return (
    <div className="slide-container active" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>

      <style>{`
        /* Target Lock Pulse */
        @keyframes targetLockPulse {
          0%   { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 15px rgba(204,34,0,0.3); background: rgba(204,34,0,0.1); }
          50%  { box-shadow: inset 0 0 0 1px var(--ba-gold), inset 0 0 25px rgba(201,168,76,0.25); background: rgba(201,168,76,0.1); }
          100% { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 15px rgba(204,34,0,0.3); background: rgba(204,34,0,0.1); }
        }

        .target-locked {
          animation: targetLockPulse 1.5s ease-in-out infinite !important;
          border-color: transparent !important;
        }

        /* Tactical Hover & Assimilation */
        .acc-row { transition: background 0.2s ease, box-shadow 0.2s ease; position: relative; }
        .acc-row:hover:not(.target-locked) { background: rgba(200, 34, 0, 0.08) !important; box-shadow: inset 0 0 15px rgba(200, 34, 0, 0.15); }
        .acc-row:hover::before, .target-locked::before { content: ''; position: absolute; top: 4px; left: 4px; width: 6px; height: 6px; border-top: 1px solid #cc2200; border-left: 1px solid #cc2200; }
        .acc-row:hover::after, .target-locked::after { content: ''; position: absolute; bottom: 4px; right: 4px; width: 6px; height: 6px; border-bottom: 1px solid #cc2200; border-right: 1px solid #cc2200; }

        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .assimilate-in { animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }

        /* Form Inputs */
        .mech-input { border-left: 2px solid var(--border); }
        .mech-input:focus { border-left: 3px solid var(--ba-crimson) !important; border-color: var(--border-hi) !important; }

        /* Purge Native Spin Buttons */
        .mech-input[type="number"]::-webkit-outer-spin-button, .mech-input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .mech-input[type="number"] { -moz-appearance: textfield; }

        /* Relay Stream */
        .relay-scroll::-webkit-scrollbar { width: 4px; }
        .relay-scroll::-webkit-scrollbar-track { background: #050000; border-left: 1px solid var(--ba-border-lo); }
        .relay-scroll::-webkit-scrollbar-thumb { background: rgba(204,34,0,0.5); border-radius: 2px; }
        .relay-scroll::-webkit-scrollbar-thumb:hover { background: var(--ba-crimson); }

        /* Auditor Shrine specific */
        @keyframes glitchCorrupt {
          0%, 96% { transform: translate(0, 0); text-shadow: none; }
          97%     { transform: translate(-2px, 1px); text-shadow: 2px 0 cyan, -2px 0 red; }
          98%     { transform: translate(2px, -1px); text-shadow: -2px 0 cyan, 2px 0 red; }
          99%     { transform: translate(0, 0); text-shadow: none; }
        }
        .text-corrupted { animation: glitchCorrupt 2s infinite; color: var(--ba-crimson); }

        /* ── Suspensor Field Bobbing ── */
        @keyframes suspensorPure {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes suspensorRestless {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes suspensorCorrupt {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25%      { transform: translateY(-4px) rotate(-2deg); }
          50%      { transform: translateY(6px) rotate(3deg); }
          75%      { transform: translateY(-6px) rotate(-1deg); }
        }

        .bob-pure { animation: suspensorPure 4s ease-in-out infinite; }
        .bob-restless { animation: suspensorRestless 2.5s ease-in-out infinite; }
        .bob-corrupt { animation: suspensorCorrupt 0.4s linear infinite; }

        /* Hold-to-confirm button */
        .rite-btn {
          position: relative; overflow: hidden; background: rgba(204,34,0,0.1); border: 1px dashed var(--ba-crimson);
          color: #fff; font-family: var(--mono); padding: 8px; font-size: 10px; letter-spacing: 2px; cursor: pointer;
          transition: all 0.2s; user-select: none;
        }
        .rite-btn:active { transform: scale(0.98); }
        .rite-btn::before {
          content: ''; position: absolute; top: 0; left: 0; bottom: 0;
          background: rgba(201,168,76,0.3); z-index: 0; transition: width 0.1s linear;
        }
        .rite-content { position: relative; z-index: 1; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.85fr', gap: '20px', flex: 1, minHeight: 0 }}>

        {/* ── LEFT COLUMN: Account List & Creation ── */}
        <div className="panel mech-panel" style={{ display: 'flex', flexDirection: 'column', padding: '20px', overflowY: 'auto' }}>
          <div className="sec-ttl" style={{ marginBottom: '15px' }}>BANK ACCOUNTS</div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
            {balances.accounts.length > 0 ? (
              balances.accounts.map(({ account, balance }) => {
                const isSelected = selectedAccount?.id === account.id;
                const accMin = account.minimum_balance || 0;
                const isWarning = balance < accMin;

                return (
                  <div
                    key={account.id}
                    className={`acc-row ${isSelected ? 'target-locked' : ''}`}
                    style={{
                      padding: '12px 15px',
                      marginBottom: '8px',
                      border: `1px solid var(--border)`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedAccount(account)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: isSelected ? '#fff' : 'var(--text-m)' }}>
                        {account.name.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-d)' }}>
                        MIN: ₹{(accMin / 1000).toFixed(0)}k
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        <div className={isWarning ? 'warn blink' : 'ok'} style={{ fontWeight: 'bold' }}>
                          {formatAmount(balance)}
                        </div>
                      </div>
                      <button className="action-btn del" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(account); }}>DEL</button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-d)', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
                Awaiting Data Stream...
              </div>
            )}
          </div>

          {/* Add Account Form */}
          <div style={{ marginTop: '20px', borderTop: '1px dashed var(--ba-border-lo)', paddingTop: '18px', flexShrink: 0 }}>
            <div className="sec-ttl" style={{ fontSize: '11px', marginBottom: '12px' }}>ESTABLISH NEW RESERVE</div>
            <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input className="mech-input" placeholder="Account Designation *" name="name" value={form.name} onChange={handleInputChange} required autoComplete="off" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input className="mech-input" placeholder="Financial Institution" name="bank_name" value={form.bank_name} onChange={handleInputChange} autoComplete="off" style={{ flex: 1 }} />
                <input className="mech-input" type="number" placeholder="Min Balance" name="minimum_balance" value={form.minimum_balance} onChange={handleInputChange} min="0" style={{ width: '120px' }} />
              </div>
              <button type="submit" className="mech-btn" disabled={isAdding || !form.name.trim()} style={{ marginTop: '5px' }}>
                {isAdding ? 'AUTHORIZING...' : 'INSCRIBE ACCOUNT'}
              </button>
            </form>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Noosphere Uplink & Detail ── */}
        <div className="panel mech-panel" style={{ padding: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedAccount ? (
            <div key={selectedAccount.id} className="assimilate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

              {/* Header & Balance */}
              <div style={{ flexShrink: 0, paddingBottom: '15px' }}>
                <div className="sec-ttl" style={{ border: 'none', margin: 0, padding: 0 }}>
                  NOOSPHERE UPLINK · {selectedAccount.name.toUpperCase()}
                </div>

                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: '10px', color: 'var(--ba-gold-mute)', letterSpacing: '2px', marginBottom: '4px' }}>
                      CURRENT LIQUIDITY
                    </div>
                    {minBalance > 0 && (
                      <div style={{ fontSize: '9px', color: 'var(--text-d)' }}>
                        RESERVE FLOOR: ₹{minBalance.toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div style={{ fontFamily: 'var(--mono)', fontSize: '28px', fontWeight: 'bold', color: isBalanceCritical ? 'var(--ba-crimson)' : 'var(--border-hi)', textShadow: isBalanceCritical ? '0 0 10px rgba(204,34,0,0.6)' : 'var(--glow)' }}>
                    ₹ <ScrambleText text={Math.abs(activeBalance).toLocaleString()} />
                  </div>

                  {/* Liquid Telemetry Bar */}
                  <div style={{ width: '100%', height: '3px', background: isBalanceCritical ? 'rgba(204,34,0,0.2)' : 'rgba(74,222,128,0.2)', marginTop: '8px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, left: 0,
                      width: isBalanceCritical ? '30%' : '100%',
                      background: isBalanceCritical ? 'var(--ba-crimson)' : 'var(--border-hi)',
                      boxShadow: isBalanceCritical ? 'none' : '0 0 10px var(--border-hi)',
                      animation: isBalanceCritical ? 'dangerPulse 1.5s infinite alternate' : 'none'
                    }} />
                  </div>
                </div>
              </div>

              {/* ── THE SHRINE OF THE SERVO-AUDITOR ── */}
              <div style={{
                border: `1px solid ${auditState === 'corrupted' ? 'var(--ba-crimson)' : 'var(--ba-gold-mute)'}`,
                boxShadow: auditState === 'corrupted' ? 'inset 0 0 15px rgba(204,34,0,0.2)' : 'none',
                background: 'rgba(5,0,0,0.6)', padding: '10px', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', transition: 'all 0.5s'
              }}>
                <ServoAuditorViewer auditState={auditState} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-d)', fontFamily: 'var(--mono)', borderBottom: '1px dotted var(--ba-border-lo)', paddingBottom: '4px' }}>
                    <span>AUDITOR STATUS</span>
                    <span>T - {7 - daysSinceAudit} DAYS TO CORRUPTION</span>
                  </div>

                  <div className={auditState === 'corrupted' ? 'text-corrupted' : ''} style={{ fontSize: '10px', color: auditState === 'pure' ? 'var(--border-hi)' : (auditState === 'restless' ? 'var(--ba-gold)' : 'var(--ba-crimson)'), minHeight: '24px', textTransform: 'uppercase', lineHeight: 1.3 }}>
                    {auditState === 'pure' && "LEDGER SANCTIFIED. MACHINE SPIRIT APPEASED."}
                    {auditState === 'restless' && "WARNING: TEMPORAL DRIFT DETECTED. RITE OF AUDIT REQUIRED."}
                    {auditState === 'corrupted' && "HERESY DETECTED: NOOSPHERE SEVERED FROM MATERIUM. LEDGER PURITY COMPROMISED."}
                  </div>

                  <button
                    className="rite-btn"
                    onMouseDown={startAuditRitual}
                    onMouseUp={stopAuditRitual}
                    onMouseLeave={stopAuditRitual}
                    onTouchStart={startAuditRitual}
                    onTouchEnd={stopAuditRitual}
                  >
                    <style>{`.rite-btn::before { width: ${auditProgress}% !important; }`}</style>
                    <span className="rite-content">
                      {isAuditing ? '[ APPLYYING PURITY SEAL... ]' : '[ HOLD TO INITIATE RITE OF RECONCILIATION ]'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Noosphere Stream (Recent Activity) */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div className="sec-ttl" style={{ fontSize: '10px', marginBottom: '10px' }}>RECENT TITHE ACTIVITY</div>

                <div className="relay-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                  {recentTxns.length > 0 ? (
                    recentTxns.map((txn, index) => {
                      const isNeg = txn.amount < 0;
                      const hexId = txn._id ? `0X${txn._id.substring(txn._id.length - 4).toUpperCase()}` : '0X0000';
                      const animDelay = `${Math.min(index * 0.05, 0.4)}s`;

                      return (
                        <div key={txn._id} className="relay-row acc-row assimilate-in" style={{ animationDelay: animDelay, opacity: 0 }}>
                          <div className="relay-meta" style={{ minWidth: '60px' }}>
                            <span>{txn.date}</span>
                            <span style={{ fontSize: '8px' }}>{hexId}</span>
                          </div>
                          <span className="n-badge n-badge-tx">TX</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', textTransform: 'uppercase' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                              <span style={{ color: '#fff' }}>{txn.description}</span>
                              <span style={{ color: '#3a0800' }}>—</span>
                              <span className={isNeg ? 'warn' : 'ok'} style={{ fontWeight: 'bold' }}>
                                {isNeg ? '' : '+'}₹{Math.abs(txn.amount).toLocaleString()}
                              </span>
                              <span style={{ color: '#3a0800' }}>—</span>
                              <span style={{ color: '#6a4020', fontSize: '10px' }}>{txn.category || 'UNKNOWN'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: 'var(--text-d)', fontSize: '11px', fontStyle: 'italic', padding: '10px 0' }}>
                      No recent transactions detected in Noosphere.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-d)', textAlign: 'center', marginTop: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="radar-wrap" style={{ width: '40px', height: '40px', marginBottom: '15px', opacity: 0.5 }}>
                <div className="radar-grid" style={{ backgroundSize: '8px 8px' }} />
                <div className="radar-sweep" />
              </div>
              <span>AWAITING TARGET SELECTION</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
          <div className="panel mech-panel" style={{ width: '420px', padding: '25px', border: '1px solid var(--ba-crimson)' }}>
            <div className="sec-ttl" style={{ color: 'var(--ba-crimson)', marginBottom: '15px', borderBottomColor: 'var(--ba-crimson)' }}>WARNING: INITIATING EXTERMINATUS</div>
            <p style={{ color: 'var(--text-m)', fontSize: '12px', lineHeight: '1.5' }}>
              Are you certain you wish to sever the uplink for <strong style={{ color: '#fff' }}>{deleteConfirm.name.toUpperCase()}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
              <button className="mech-btn" onClick={() => setDeleteConfirm(null)} style={{ flex: 1, border: '1px solid var(--ba-gold-mute)', background: 'transparent' }}>ABORT</button>
              <button className="mech-btn" onClick={handleDeleteAccount} style={{ flex: 1, background: 'rgba(204,34,0,0.3)', borderColor: 'var(--ba-crimson)' }}>CONFIRM DELETION</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccountsSlide;