// src/components/slides/mobile/MobileBank.jsx
import React, { useState, useEffect, useRef } from 'react';
import ScrambleText from '../../shared/ScrambleText';
import { AccountEngine } from '../../../utils/engine';

// ─────────────────────────────────────────────
// VIEW CONSTANTS
// ─────────────────────────────────────────────
const VIEW_LIST   = 'list';
const VIEW_DETAIL = 'detail';

// ─────────────────────────────────────────────
// AUDIT STATE HELPERS
// ─────────────────────────────────────────────
const getAuditState = (lastAuditedDate) => {
  const fallback = new Date(Date.now() - 86400000 * 8).toISOString();
  const days = Math.max(0, Math.floor(
    (Date.now() - new Date(lastAuditedDate || fallback).getTime()) / (1000 * 60 * 60 * 24)
  ));
  if (days >= 7) return { state: 'corrupted', days };
  if (days >= 4) return { state: 'restless',  days };
  return           { state: 'pure',      days };
};

const AUDIT_LABELS = {
  pure:      { color: 'var(--mb-green)',   text: 'LEDGER SANCTIFIED. MACHINE SPIRIT APPEASED.' },
  restless:  { color: 'var(--mb-gold)',    text: 'WARNING: TEMPORAL DRIFT DETECTED. RITE REQUIRED.' },
  corrupted: { color: 'var(--mb-crimson)', text: 'HERESY: NOOSPHERE SEVERED. PURITY COMPROMISED.' },
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const MobileBank = ({ data, dbTransactions, dbMetadata, userId }) => {
  // ── Data State ──
  const [accounts,   setAccounts]   = useState([]);
  const [balances,   setBalances]   = useState({ accounts: [], total: 0 });
  const [recentTxns, setRecentTxns] = useState([]);
  const [statusMsg,  setStatusMsg]  = useState(null);

  // ── Navigation State ──
  const [view,            setView]            = useState(VIEW_LIST);
  const [selectedAccount, setSelectedAccount] = useState(null);

  // ── Sheet State ──
  const [isAddOpen,     setIsAddOpen]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Form State ──
  const [form,     setForm]     = useState({ name: '', bank_name: '', minimum_balance: '' });
  const [isAdding, setIsAdding] = useState(false);

  // ── Audit Ritual State ──
  const [auditProgress, setAuditProgress] = useState(0);
  const [isAuditing,    setIsAuditing]    = useState(false);
  const auditTimerRef = useRef(null);

  // ─────────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────────
  // FIX: loadData now reads from the `data` prop supplied by useFinanceData
  // instead of re-fetching from the engines directly. The hook already runs
  // getBankAccountBalances + getAccounts on every sync change, so we just
  // consume its output. Adding data?.liveBalances / data?.accounts as deps
  // means this callback gets a new identity — and the effect below re-fires —
  // whenever the hook pushes fresh numbers.
  const loadData = React.useCallback(() => {
    const accs    = data?.accounts    ?? [];
    const balData = data?.liveBalances ?? { accounts: [], total: 0 };

    setAccounts(accs);
    setBalances(balData);

    setSelectedAccount(prev => {
      if (!prev) return null;
      return accs.find(a => a.id === prev.id) || prev;
    });
  }, [data?.accounts, data?.liveBalances]); // ← key fix: react to hook output

  // Re-run whenever the hook delivers new data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cleanup audit timers
  useEffect(() => { return () => clearInterval(auditTimerRef.current); }, []);

  // ── Recent Transactions for selected account ──
  useEffect(() => {
    const load = async () => {
      if (!selectedAccount || !dbTransactions) return;
      const result      = await dbTransactions.allDocs({ include_docs: true });
      const accountName = selectedAccount.name.toLowerCase();
      const accountId   = selectedAccount.id.toLowerCase();

      const txns = result.rows
        .map(r => r.doc)
        .filter(d => {
          if (d.type !== 'transaction' || d.account_type !== 'Bank') return false;
          if (userId && d.user_id && d.user_id !== userId) return false;
          const sub  = (d.sub_account || '').toLowerCase().trim();
          const desc = (d.description || '').toLowerCase();
          return sub === accountName || sub === accountId || desc.includes(accountName);
        })
        .sort((a, b) => (b.date || b._id).localeCompare(a.date || a._id))
        .slice(0, 15);

      setRecentTxns(txns);
    };
    load();
    // FIX: depend on data?.transactions so recent txns refresh when the hook
    // delivers new transaction data (no separate PouchDB listener needed here).
  }, [selectedAccount, dbTransactions, userId, data?.transactions]);

  const handleSelectAccount = (account) => {
    setSelectedAccount(account);
    setView(VIEW_DETAIL);
  };

  const handleBack = () => {
    setView(VIEW_LIST);
  };

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
        minimum_balance:   Number(form.minimum_balance) || 0,
        last_audited_date: new Date().toISOString()
      }, dbMetadata, userId);
      setForm({ name: '', bank_name: '', minimum_balance: '' });
      setIsAddOpen(false);
      showStatus('success', 'Account created. Machine Spirit bound.');
      await loadData();
    } else {
      showStatus('error', result.error);
    }
    setIsAdding(false);
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm || !dbMetadata) return;
    const result = await AccountEngine.deleteAccount(deleteConfirm.id, dbMetadata, userId);
    if (result.ok) {
      showStatus('success', `Uplink severed: ${deleteConfirm.name}`);
      if (selectedAccount?.id === deleteConfirm.id) {
        setSelectedAccount(null);
        setView(VIEW_LIST);
      }
      setDeleteConfirm(null);
      await loadData();
    } else {
      showStatus('error', result.error || 'Failed to delete');
    }
  };

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const closeSheets = () => {
    setIsAddOpen(false);
    setDeleteConfirm(null);
  };

  // ── Audit Ritual ──
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

  // ─────────────────────────────────────────────
  // RENDER CALCULATIONS
  // ─────────────────────────────────────────────
  const activeBalance = balances.accounts.find(
    b => b.account.id === selectedAccount?.id
  )?.balance || 0;

  const minBalance       = selectedAccount?.minimum_balance || 0;
  const isBalanceCritical = activeBalance < minBalance;
  const { state: auditState, days: daysSinceAudit } = getAuditState(selectedAccount?.last_audited_date);
  const auditLabel = AUDIT_LABELS[auditState];

  const fmt = (n) => `₹ ${Math.abs(n || 0).toLocaleString()}`;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="mb-root">
      <style>{`
        /* ── CSS Variables ── */
        .mb-root {
          --mb-bg:       #060400;
          --mb-panel:    #0c0900;
          --mb-green:    #4ade80;
          --mb-gold:     #c9a84c;
          --mb-gold-dim: #6a4a1a;
          --mb-crimson:  #cc2200;
          --mb-dim:      #3a2a10;
          --mb-border:   #2a1e08;
          --mb-text:     #a08040;
          --mb-mono:     'Courier New', Courier, monospace;
        }

        /* ── Layout ── */
        .mb-root {
          font-family: var(--mb-mono);
          background: var(--mb-bg);
          color: var(--mb-text);
          height: 100%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* ── Scanline overlay ── */
        .mb-root::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 3px,
            rgba(0,0,0,0.08) 3px,
            rgba(0,0,0,0.08) 4px
          );
          pointer-events: none;
          z-index: 10;
        }

        /* ── Header ── */
        .mb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px 10px;
          border-bottom: 1px solid var(--mb-dim);
          flex-shrink: 0;
        }
        .mb-header-title {
          font-size: 11px;
          letter-spacing: 3px;
          color: var(--mb-gold);
          text-transform: uppercase;
        }
        .mb-header-sub {
          font-size: 9px;
          color: var(--mb-dim);
          letter-spacing: 2px;
          margin-top: 2px;
        }
        .mb-back-btn {
          background: none;
          border: 1px solid var(--mb-dim);
          color: var(--mb-text);
          font-family: var(--mb-mono);
          font-size: 9px;
          letter-spacing: 2px;
          padding: 5px 10px;
          cursor: pointer;
          text-transform: uppercase;
          -webkit-tap-highlight-color: transparent;
          transition: border-color 0.2s, color 0.2s;
        }
        .mb-back-btn:active {
          border-color: var(--mb-gold);
          color: var(--mb-gold);
        }

        /* ── Status Toast ── */
        .mb-status {
          position: absolute;
          top: 56px;
          left: 16px; right: 16px;
          z-index: 60;
          padding: 8px 12px;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          border: 1px solid;
          animation: mb-fadein 0.3s ease;
        }
        .mb-status.success { color: var(--mb-green); border-color: var(--mb-green); background: rgba(74,222,128,0.05); }
        .mb-status.error   { color: var(--mb-crimson); border-color: var(--mb-crimson); background: rgba(204,34,0,0.08); }
        @keyframes mb-fadein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Scrollable body ── */
        .mb-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 12px 16px 100px;
          -webkit-overflow-scrolling: touch;
        }
        .mb-body::-webkit-scrollbar { width: 3px; }
        .mb-body::-webkit-scrollbar-track { background: var(--mb-bg); }
        .mb-body::-webkit-scrollbar-thumb { background: var(--mb-dim); }

        /* ── Section title ── */
        .mb-sec {
          font-size: 9px;
          letter-spacing: 3px;
          color: var(--mb-gold-dim);
          text-transform: uppercase;
          border-bottom: 1px solid var(--mb-border);
          padding-bottom: 6px;
          margin-bottom: 10px;
          margin-top: 20px;
        }
        .mb-sec:first-child { margin-top: 0; }

        /* ── Account Row (List View) ── */
        .mb-acc-row {
          border: 1px solid var(--mb-border);
          padding: 12px 14px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: border-color 0.2s, background 0.2s;
          position: relative;
        }
        .mb-acc-row:active {
          background: rgba(201,168,76,0.07);
          border-color: var(--mb-gold-dim);
        }
        .mb-acc-row.warning {
          border-color: rgba(204,34,0,0.4);
        }
        .mb-acc-name {
          font-size: 12px;
          color: #d4a84b;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .mb-acc-bank {
          font-size: 9px;
          color: var(--mb-dim);
          margin-top: 2px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .mb-acc-balance {
          text-align: right;
        }
        .mb-acc-balance-amt {
          font-size: 13px;
          font-weight: bold;
        }
        .mb-acc-balance-amt.ok      { color: var(--mb-green); }
        .mb-acc-balance-amt.warn    { color: var(--mb-crimson); }
        .mb-acc-balance-min {
          font-size: 8px;
          color: var(--mb-dim);
          margin-top: 2px;
        }
        .mb-acc-chevron {
          font-size: 10px;
          color: var(--mb-dim);
          margin-left: 10px;
        }

        /* ── Empty State ── */
        .mb-empty {
          border: 1px dashed var(--mb-border);
          padding: 30px 16px;
          text-align: center;
          font-size: 10px;
          color: var(--mb-dim);
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        /* ── Total Balance Banner ── */
        .mb-total {
          border: 1px solid var(--mb-border);
          padding: 12px 14px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(201,168,76,0.03);
        }
        .mb-total-label { font-size: 9px; letter-spacing: 2px; color: var(--mb-gold-dim); text-transform: uppercase; }
        .mb-total-amt   { font-size: 18px; font-weight: bold; color: var(--mb-gold); }

        /* ── Floating Action Button ── */
        .mb-fab {
          position: absolute;
          bottom: 20px;
          left: 16px; right: 16px;
          z-index: 20;
          padding: 14px;
          background: var(--mb-panel);
          border: 1px solid var(--mb-gold-dim);
          color: var(--mb-gold);
          font-family: var(--mb-mono);
          font-size: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: border-color 0.2s, background 0.2s;
          text-align: center;
        }
        .mb-fab:active { background: rgba(201,168,76,0.1); border-color: var(--mb-gold); }

        /* ── Detail: Balance Panel ── */
        .mb-balance-panel {
          border: 1px solid var(--mb-border);
          padding: 14px;
          margin-bottom: 12px;
        }
        .mb-balance-label { font-size: 9px; letter-spacing: 2px; color: var(--mb-gold-dim); margin-bottom: 4px; }
        .mb-balance-amt {
          font-size: 30px;
          font-weight: bold;
          letter-spacing: 1px;
          line-height: 1;
        }
        .mb-balance-amt.critical { color: var(--mb-crimson); text-shadow: 0 0 10px rgba(204,34,0,0.5); }
        .mb-balance-amt.healthy  { color: var(--mb-green);   text-shadow: 0 0 10px rgba(74,222,128,0.3); }
        .mb-telemetry {
          width: 100%; height: 3px;
          background: rgba(74,222,128,0.15);
          margin-top: 10px;
          position: relative;
          overflow: hidden;
        }
        .mb-telemetry-fill {
          position: absolute; top: 0; bottom: 0; left: 0;
          transition: width 0.8s ease;
        }
        .mb-telemetry-fill.healthy  { background: var(--mb-green); box-shadow: 0 0 6px var(--mb-green); }
        .mb-telemetry-fill.critical { background: var(--mb-crimson); animation: mb-danger 1.5s infinite alternate; }
        @keyframes mb-danger { from { opacity: 1; } to { opacity: 0.3; } }
        .mb-balance-meta {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: var(--mb-dim);
          margin-top: 8px;
        }

        /* ── Auditor Shrine ── */
        .mb-shrine {
          border: 1px solid;
          padding: 12px 14px;
          margin-bottom: 12px;
          transition: border-color 0.5s, box-shadow 0.5s;
        }
        .mb-shrine.pure      { border-color: rgba(74,222,128,0.3);  box-shadow: none; }
        .mb-shrine.restless  { border-color: rgba(201,168,76,0.4);  box-shadow: none; }
        .mb-shrine.corrupted { border-color: var(--mb-crimson);     box-shadow: inset 0 0 12px rgba(204,34,0,0.15); }

        .mb-shrine-header {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: var(--mb-dim);
          letter-spacing: 2px;
          border-bottom: 1px dotted var(--mb-border);
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .mb-shrine-status {
          font-size: 10px;
          text-transform: uppercase;
          line-height: 1.4;
          letter-spacing: 1px;
          margin-bottom: 10px;
          min-height: 28px;
        }
        .mb-shrine-status.corrupted { animation: mb-glitch 2.5s infinite; }
        @keyframes mb-glitch {
          0%, 94% { transform: none; filter: none; }
          95%     { transform: translate(-2px,  1px); filter: hue-rotate(90deg); }
          97%     { transform: translate( 2px, -1px); filter: hue-rotate(-90deg); }
          99%     { transform: none; filter: none; }
        }

        /* ── Rite of Reconciliation button ── */
        .mb-rite-btn {
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 10px;
          background: rgba(204,34,0,0.08);
          border: 1px dashed var(--mb-crimson);
          color: #fff;
          font-family: var(--mb-mono);
          font-size: 9px;
          letter-spacing: 2px;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          text-transform: uppercase;
        }
        .mb-rite-btn:active { transform: scale(0.99); }
        .mb-rite-fill {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          background: rgba(201,168,76,0.25);
          transition: width 0.1s linear;
          z-index: 0;
        }
        .mb-rite-label { position: relative; z-index: 1; }

        /* ── Transaction Row ── */
        .mb-txn {
          border-bottom: 1px solid var(--mb-border);
          padding: 10px 0;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          animation: mb-fadein 0.3s ease both;
        }
        .mb-txn-date  { font-size: 9px; color: var(--mb-dim); min-width: 50px; padding-top: 2px; }
        .mb-txn-desc  { font-size: 11px; color: #c8a060; text-transform: uppercase; flex: 1; }
        .mb-txn-cat   { font-size: 8px; color: var(--mb-dim); margin-top: 2px; text-transform: uppercase; }
        .mb-txn-amt   { font-size: 11px; font-weight: bold; white-space: nowrap; }
        .mb-txn-amt.pos { color: var(--mb-green); }
        .mb-txn-amt.neg { color: var(--mb-crimson); }

        /* ── Delete button on detail ── */
        .mb-del-btn {
          width: 100%;
          padding: 12px;
          background: none;
          border: 1px solid rgba(204,34,0,0.4);
          color: var(--mb-crimson);
          font-family: var(--mb-mono);
          font-size: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          margin-top: 4px;
        }
        .mb-del-btn:active { background: rgba(204,34,0,0.15); }

        /* ── Bottom Sheet ── */
        .mb-sheet {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 50;
          padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
          transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .mb-sheet.closed { transform: translateY(100%); }
        .mb-sheet.open   { transform: translateY(0); }
        .mb-sheet.add-sheet    { background: var(--mb-panel); border-top: 2px solid var(--mb-gold-dim); }
        .mb-sheet.delete-sheet { background: #110202;          border-top: 2px solid var(--mb-crimson); }

        .mb-sheet-pill {
          width: 40px; height: 4px;
          border-radius: 2px;
          margin: 0 auto 16px;
          cursor: pointer;
        }
        .add-sheet    .mb-sheet-pill { background: var(--mb-gold-dim); }
        .delete-sheet .mb-sheet-pill { background: rgba(204,34,0,0.5); }

        .mb-sheet-title {
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          border-bottom: 1px solid;
          padding-bottom: 10px;
          margin-bottom: 16px;
        }
        .add-sheet    .mb-sheet-title { color: var(--mb-gold); border-color: var(--mb-border); }
        .delete-sheet .mb-sheet-title { color: var(--mb-crimson); border-color: rgba(204,34,0,0.3); }

        /* ── Form inputs ── */
        .mb-field { margin-bottom: 12px; }
        .mb-label {
          display: block;
          font-size: 9px;
          letter-spacing: 2px;
          color: var(--mb-dim);
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .mb-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(0,0,0,0.5);
          border: 1px solid var(--mb-border);
          border-left: 2px solid var(--mb-gold-dim);
          padding: 9px 10px;
          color: var(--mb-gold);
          font-family: var(--mb-mono);
          font-size: 12px;
          outline: none;
          -webkit-appearance: none;
        }
        .mb-input:focus { border-color: var(--mb-gold-dim); border-left-color: var(--mb-gold); }
        .mb-input[type="number"]::-webkit-inner-spin-button,
        .mb-input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .mb-input[type="number"] { -moz-appearance: textfield; }
        .mb-input-row { display: flex; gap: 10px; }
        .mb-input-row .mb-field { flex: 1; }

        .mb-submit-btn {
          width: 100%;
          padding: 13px;
          background: rgba(201,168,76,0.08);
          border: 1px solid var(--mb-gold-dim);
          color: var(--mb-gold);
          font-family: var(--mb-mono);
          font-size: 10px;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
          margin-top: 4px;
          -webkit-tap-highlight-color: transparent;
        }
        .mb-submit-btn:active { background: rgba(201,168,76,0.18); }
        .mb-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── Delete confirmation buttons ── */
        .mb-confirm-text {
          font-size: 11px;
          color: rgba(204,34,0,0.8);
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .mb-confirm-text strong { color: var(--mb-crimson); }
        .mb-confirm-row { display: flex; gap: 12px; }
        .mb-confirm-abort, .mb-confirm-execute {
          flex: 1;
          padding: 12px;
          font-family: var(--mb-mono);
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .mb-confirm-abort   { background: none;                    border: 1px solid rgba(204,34,0,0.4); color: rgba(204,34,0,0.7); }
        .mb-confirm-execute { background: rgba(204,34,0,0.15);    border: 1px solid var(--mb-crimson);  color: var(--mb-crimson);  }
        .mb-confirm-abort:active   { background: rgba(204,34,0,0.1); }
        .mb-confirm-execute:active { background: rgba(204,34,0,0.3); }

        /* ── Backdrop ── */
        .mb-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          z-index: 40;
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
        }

        /* ── Corner brackets decoration ── */
        .mb-bracketed { position: relative; }
        .mb-bracketed::before, .mb-bracketed::after {
          content: '';
          position: absolute;
          width: 8px; height: 8px;
        }
        .mb-bracketed::before { top: 0; left: 0; border-top: 1px solid var(--mb-gold-dim); border-left: 1px solid var(--mb-gold-dim); }
        .mb-bracketed::after  { bottom: 0; right: 0; border-bottom: 1px solid var(--mb-gold-dim); border-right: 1px solid var(--mb-gold-dim); }
      `}</style>

      {/* ── Header ── */}
      <div className="mb-header">
        <div>
          <div className="mb-header-title">
            <ScrambleText text="MUNITORUM VAULTS" />
          </div>
          <div className="mb-header-sub">
            {view === VIEW_LIST
              ? `${balances.accounts.length} UPLINK${balances.accounts.length !== 1 ? 'S' : ''} ACTIVE`
              : selectedAccount?.name?.toUpperCase()}
          </div>
        </div>
        {view === VIEW_DETAIL && (
          <button className="mb-back-btn" onClick={handleBack}>
            ◀ RETURN
          </button>
        )}
      </div>

      {/* ── Status Toast ── */}
      {statusMsg && (
        <div className={`mb-status ${statusMsg.type}`}>{statusMsg.text}</div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* LIST VIEW                              */}
      {/* ══════════════════════════════════════ */}
      {view === VIEW_LIST && (
        <div className="mb-body">
          {/* Total balance */}
          {balances.total > 0 && (
            <div className="mb-total mb-bracketed">
              <div className="mb-total-label">Total Reserves</div>
              <div className="mb-total-amt">₹{balances.total.toLocaleString()}</div>
            </div>
          )}

          <div className="mb-sec">Bank Accounts</div>

          {balances.accounts.length > 0 ? (
            balances.accounts.map(({ account, balance }) => {
              const accMin    = account.minimum_balance || 0;
              const isWarning = balance < accMin;
              return (
                <div
                  key={account.id}
                  className={`mb-acc-row mb-bracketed ${isWarning ? 'warning' : ''}`}
                  onClick={() => handleSelectAccount(account)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mb-acc-name">{account.name}</div>
                    {account.bank_name && (
                      <div className="mb-acc-bank">{account.bank_name}</div>
                    )}
                  </div>
                  <div className="mb-acc-balance">
                    <div className={`mb-acc-balance-amt ${isWarning ? 'warn' : 'ok'}`}>
                      {fmt(balance)}
                    </div>
                    {accMin > 0 && (
                      <div className="mb-acc-balance-min">
                        MIN ₹{(accMin / 1000).toFixed(0)}k
                      </div>
                    )}
                  </div>
                  <div className="mb-acc-chevron">▶</div>
                </div>
              );
            })
          ) : (
            <div className="mb-empty">
              <ScrambleText text="NO ACTIVE UPLINKS DETECTED" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* DETAIL VIEW                            */}
      {/* ══════════════════════════════════════ */}
      {view === VIEW_DETAIL && selectedAccount && (
        <div className="mb-body">

          {/* Balance Panel */}
          <div className="mb-balance-panel mb-bracketed">
            <div className="mb-balance-label">CURRENT LIQUIDITY</div>
            <div className={`mb-balance-amt ${isBalanceCritical ? 'critical' : 'healthy'}`}>
              ₹ <ScrambleText text={Math.abs(activeBalance).toLocaleString()} />
            </div>
            <div className="mb-telemetry">
              <div
                className={`mb-telemetry-fill ${isBalanceCritical ? 'critical' : 'healthy'}`}
                style={{ width: isBalanceCritical ? '28%' : '100%' }}
              />
            </div>
            <div className="mb-balance-meta">
              {minBalance > 0 && <span>RESERVE FLOOR: ₹{minBalance.toLocaleString()}</span>}
              <span>{selectedAccount.bank_name || 'NO INSTITUTION FILED'}</span>
            </div>
          </div>

          {/* Auditor Shrine */}
          <div className={`mb-shrine ${auditState}`}>
            <div className="mb-shrine-header">
              <span>SERVO-AUDITOR STATUS</span>
              <span>T-{Math.max(0, 7 - daysSinceAudit)} DAYS TO CORRUPTION</span>
            </div>
            <div
              className={`mb-shrine-status ${auditState}`}
              style={{ color: auditLabel.color }}
            >
              {auditLabel.text}
            </div>
            <button
              className="mb-rite-btn"
              onMouseDown={startAuditRitual}
              onMouseUp={stopAuditRitual}
              onMouseLeave={stopAuditRitual}
              onTouchStart={startAuditRitual}
              onTouchEnd={stopAuditRitual}
            >
              <div className="mb-rite-fill" style={{ width: `${auditProgress}%` }} />
              <span className="mb-rite-label">
                {isAuditing
                  ? '[ APPLYING PURITY SEAL... ]'
                  : '[ HOLD: RITE OF RECONCILIATION ]'}
              </span>
            </button>
          </div>

          {/* Recent Transactions */}
          <div className="mb-sec">Recent Tithe Activity</div>
          {recentTxns.length > 0 ? (
            recentTxns.map((txn, i) => {
              const isNeg = txn.amount < 0;
              return (
                <div key={txn._id} className="mb-txn" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="mb-txn-date">{txn.date}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mb-txn-desc">{txn.description}</div>
                    <div className="mb-txn-cat">{txn.category || 'UNKNOWN CLASS'}</div>
                  </div>
                  <div className={`mb-txn-amt ${isNeg ? 'neg' : 'pos'}`}>
                    {isNeg ? '' : '+'}₹{Math.abs(txn.amount).toLocaleString()}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mb-empty" style={{ marginTop: 0 }}>
              No transmissions detected
            </div>
          )}

          {/* Sever Uplink */}
          <div className="mb-sec" style={{ marginTop: 24 }}>Dangerous Operations</div>
          <button
            className="mb-del-btn"
            onClick={() => setDeleteConfirm(selectedAccount)}
          >
            ⚠ Sever Uplink
          </button>
        </div>
      )}

      {/* ── Floating Action Button (list only) ── */}
      {view === VIEW_LIST && !isAddOpen && (
        <button className="mb-fab" onClick={() => setIsAddOpen(true)}>
          <ScrambleText text="+ ESTABLISH NEW UPLINK" />
        </button>
      )}

      {/* ════════════════════════════════════════ */}
      {/* ADD ACCOUNT BOTTOM SHEET                 */}
      {/* ════════════════════════════════════════ */}
      <div className={`mb-sheet add-sheet ${isAddOpen ? 'open' : 'closed'}`}>
        <div className="mb-sheet-pill" onClick={closeSheets} />
        <div className="mb-sheet-title">
          <ScrambleText text="INITIALIZE VAULT PROTOCOL" />
        </div>
        <form onSubmit={handleAddAccount}>
          <div className="mb-field">
            <label className="mb-label">Account Designation *</label>
            <input
              className="mb-input"
              type="text"
              name="name"
              required
              value={form.name}
              onChange={handleInputChange}
              placeholder="e.g. Gringotts, Munitorum"
              autoComplete="off"
            />
          </div>
          <div className="mb-field">
            <label className="mb-label">Financial Institution</label>
            <input
              className="mb-input"
              type="text"
              name="bank_name"
              value={form.bank_name}
              onChange={handleInputChange}
              placeholder="e.g. Adeptus Bank, SBI"
              autoComplete="off"
            />
          </div>
          <div className="mb-field">
            <label className="mb-label">Minimum Reserve (₹)</label>
            <input
              className="mb-input"
              type="number"
              name="minimum_balance"
              value={form.minimum_balance}
              onChange={handleInputChange}
              placeholder="0"
              min="0"
            />
          </div>
          <button
            type="submit"
            className="mb-submit-btn"
            disabled={isAdding || !form.name.trim()}
          >
            {isAdding ? 'AUTHORIZING...' : 'INSCRIBE ACCOUNT'}
          </button>
        </form>
      </div>

      {/* ════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION BOTTOM SHEET         */}
      {/* ════════════════════════════════════════ */}
      <div className={`mb-sheet delete-sheet ${deleteConfirm ? 'open' : 'closed'}`}>
        <div className="mb-sheet-pill" onClick={closeSheets} />
        <div className="mb-sheet-title">⚠ Initiating Exterminatus</div>
        <p className="mb-confirm-text">
          Sever uplink for{' '}
          <strong>{deleteConfirm?.name?.toUpperCase()}</strong>?{' '}
          This action cannot be undone by the Tech-Priests.
        </p>
        <div className="mb-confirm-row">
          <button className="mb-confirm-abort"   onClick={closeSheets}>Abort</button>
          <button className="mb-confirm-execute" onClick={handleDeleteAccount}>Execute</button>
        </div>
      </div>

      {/* ── Backdrop ── */}
      {(isAddOpen || deleteConfirm) && (
        <div className="mb-backdrop" onClick={closeSheets} />
      )}
    </div>
  );
};

export default MobileBank;