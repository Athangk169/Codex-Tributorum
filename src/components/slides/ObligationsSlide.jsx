// src/components/slides/ObligationsSlide.jsx
// ─────────────────────────────────────────────────────────────
// Two-tab slide:
//   Tab 1 — RECURRING TITHE   declared repeating expenses + status
//   Tab 2 — OUTSTANDING DEBTS loans + EMI purchases
//
// Reads from:  data.obligations (populated by useFinanceData)
// Writes via:  ObligationsEngine (add/edit/delete forms inline)
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { localDateStr } from '../../utils/localDate';
import { CategorizationEngine, ObligationsEngine } from '../../utils/engine';

// ── Shared ScrambleText ────────────────────────────────────────
import ScrambleText from '../shared/ScrambleText';

const OBL_STYLES = `

  .mech-input[type="number"]::-webkit-outer-spin-button,
  .mech-input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .mech-input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .mech-input[type="date"]::-webkit-calendar-picker-indicator {
    filter: sepia(1) saturate(4) hue-rotate(55deg) brightness(0.85);
    opacity: 0.8;
  }

  /* ── Tab strip ── */
  .obl-tabs {
    display:     flex;
    gap:         4px;
    flex-shrink: 0;
    margin-bottom: 14px;
  }
  .obl-tab {
    flex:          1;
    padding:       9px 0;
    background:    rgba(1,8,3,0.85);
    border:        1px solid var(--border);
    border-top:    2px solid transparent;
    color:         var(--text-d);
    font-family:   var(--mono);
    font-size:     12px;
    letter-spacing:2px;
    cursor:        pointer;
    text-transform:uppercase;
    transition:    all 0.2s;
  }
  .obl-tab.active {
    background:  rgba(100,5,5,0.35);
    border:      1px solid var(--ba-crimson);
    border-top:  2px solid var(--ba-gold);
    color:       #fff;
    text-shadow: 0 0 10px rgba(204,34,0,0.7);
    box-shadow:  inset 0 0 14px rgba(204,34,0,0.18);
  }
  .obl-tab:not(.active):hover {
    background:  rgba(80,5,5,0.25);
    border-color:#6a1a00;
    color:       #cc9966;
  }
  .obl-tab-panel {
    animation: oblReveal 0.22s ease-out both;
  }

  /* Lift the slide content above the patron-saint watermark (.wm-saint) */
  .obl-tabs, .obl-tab-panel { position: relative; z-index: 1; }

  /* ── Stats bar ── */
  .obl-stats-bar {
    display:       flex;
    gap:           8px;
    margin-bottom: 14px;
    flex-shrink:   0;
  }
  .obl-stat-chip {
    flex:          1;
    padding:       8px 12px;
    background:    var(--ba-bg-panel);
    border:        1px solid var(--ba-border);
    position:      relative;
    overflow:      hidden;
  }
  .obl-stat-chip::before {
    content:  '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--ba-gold-dim), transparent);
  }
  .obl-stat-chip-label {
    font-size:     9px;
    color:         var(--ba-gold-dim);
    letter-spacing:2px;
    text-transform:uppercase;
    margin-bottom: 4px;
  }
  .obl-stat-chip-val {
    font-size:   20px;
    font-weight: bold;
    font-family: var(--mono);
    color:       #fff;
  }
  .obl-stat-chip-val.paid    { color: var(--border-hi); text-shadow: var(--glow); }
  .obl-stat-chip-val.overdue { color: var(--ba-crimson); text-shadow: 0 0 10px rgba(204,34,0,0.6); }
  .obl-stat-chip-val.load    { color: var(--ba-gold); text-shadow: 0 0 10px rgba(201,168,76,0.5); }

  /* ── Recurring list ── */
  .obl-rec-row {
    display:       flex;
    align-items:   center;
    gap:           12px;
    padding:       11px 14px;
    border-bottom: 1px solid var(--ba-border-lo);
    font-family:   var(--mono);
    font-size:     12px;
    transition:    background 0.15s, border-color 0.25s, box-shadow 0.25s;
  }
  .obl-rec-row:hover { background: rgba(74,10,0,0.15); }

  .obl-rec-status {
    width:        8px;
    height:       8px;
    border-radius:50%;
    flex-shrink:  0;
  }
  .obl-rec-status.paid    { background: var(--border-hi); box-shadow: 0 0 6px var(--border-hi); }
  .obl-rec-status.pending { background: var(--ba-gold); box-shadow: 0 0 6px var(--ba-gold); animation: oblPipIdle 2s ease-in-out infinite alternate; }
  .obl-rec-status.overdue { background: var(--ba-crimson); box-shadow: 0 0 8px var(--ba-crimson); animation: oblPipCrit 0.8s ease-in-out infinite; }

  .obl-rec-name  { flex: 1; color: #fff; text-transform: uppercase; }
  .obl-rec-freq  { font-size: 10px; color: var(--ba-gold-mute); min-width: 90px; }
  .obl-rec-due   { font-size: 10px; color: var(--ba-gold-mute); min-width: 60px; text-align: right; }
  .obl-rec-amt   { min-width: 90px; text-align: right; font-weight: bold; color: var(--text-m); }
  .obl-rec-badge {
    padding:       2px 8px;
    font-size:     9px;
    letter-spacing:1px;
    border-radius: 1px;
    min-width:     60px;
    text-align:    center;
    font-weight:   bold;
  }
  .obl-rec-badge.paid    { background: rgba(74,222,128,0.12); border: 1px solid var(--border-hi); color: var(--border-hi); }
  .obl-rec-badge.pending { background: rgba(201,168,76,0.1);  border: 1px solid var(--ba-gold-dim); color: var(--ba-gold); }
  .obl-rec-badge.overdue { background: rgba(204,34,0,0.15);   border: 1px solid var(--ba-crimson); color: var(--ba-crimson); animation: oblBadgePulse 1.2s ease-in-out infinite; }

  /* ── Loan / EMI cards ── */
  .obl-card {
    background:   var(--ba-bg-panel);
    border:       1px solid var(--ba-border);
    margin-bottom:12px;
    position:     relative;
    overflow:     hidden;
    animation:    oblReveal 0.22s ease-out both;
    transition:   border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  }
  .obl-card:hover { transform: translateY(-1px); border-color: var(--ba-gold-dim); }
  .obl-card::before {
    content:  '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--ba-gold-dim), var(--ba-gold), var(--ba-gold-dim), transparent);
  }
  .obl-card-header {
    display:     flex;
    align-items: center;
    justify-content: space-between;
    padding:     12px 16px 10px;
    border-bottom: 1px solid var(--ba-border-lo);
  }
  .obl-card-title {
    font-size:     13px;
    font-weight:   bold;
    color:         var(--ba-gold);
    letter-spacing:2px;
    text-shadow:   0 0 8px rgba(201,168,76,0.4);
    text-transform:uppercase;
    font-family:   var(--mono);
  }
  .obl-card-badge {
    padding:       2px 10px;
    font-size:     9px;
    letter-spacing:2px;
    border-radius: 1px;
    font-family:   var(--mono);
  }
  .obl-card-badge.moratorium { background: rgba(234,179,8,0.1);  border: 1px solid #eab308; color: #eab308; }
  .obl-card-badge.repayment  { background: rgba(201,168,76,0.1); border: 1px solid var(--ba-gold-dim); color: var(--ba-gold); }
  .obl-card-badge.active     { background: rgba(201,168,76,0.1); border: 1px solid var(--ba-gold-dim); color: var(--ba-gold); }
  .obl-card-badge.discharged { background: rgba(74,222,128,0.12); border: 1px solid var(--border-hi); color: var(--border-hi); }
  .obl-auto-flag {
    font-size: 9px; margin-left: 4px; color: var(--ba-gold-dim);
    cursor: help; opacity: 0.85;
  }
  .obl-rec-editing {
    background: rgba(201,168,76,0.08);
    box-shadow: inset 0 0 14px rgba(201,168,76,0.18);
    border-left: 2px solid var(--ba-gold-dim);
  }

  .obl-card-body {
    padding:  12px 16px;
    display:  grid;
    grid-template-columns: 1fr 1fr;
    gap:      8px 24px;
    font-family: var(--mono);
    font-size: 11px;
  }
  .obl-card-row { display: flex; justify-content: space-between; align-items: center; }
  .obl-card-lbl { color: var(--ba-gold-mute); letter-spacing: 1px; }
  .obl-card-val { color: #fff; font-weight: bold; }
  .obl-card-val.crit { color: var(--ba-crimson); text-shadow: 0 0 8px rgba(204,34,0,0.5); }
  .obl-card-val.ok   { color: var(--border-hi); text-shadow: var(--glow); }

  /* Progress bar */
  .obl-progress-wrap {
    padding: 10px 16px 14px;
    border-top: 1px solid var(--ba-border-lo);
  }
  .obl-progress-label {
    display:       flex;
    justify-content:space-between;
    font-size:     9px;
    color:         var(--ba-gold-mute);
    margin-bottom: 5px;
    font-family:   var(--mono);
    letter-spacing:1px;
  }
  .obl-progress-track {
    height:      6px;
    background:  rgba(0,15,0,0.4);
    border:      1px solid var(--ba-border);
    border-radius:1px;
    overflow:    hidden;
  }
  .obl-progress-fill {
    height:     100%;
    border-radius:1px;
    min-width:  3px;            /* always show a tick, even at 0% */
    transition: width 0.6s ease;
  }
  .obl-progress-fill.loan { background: linear-gradient(90deg, var(--ba-crimson), #ff6633); box-shadow: 0 0 8px rgba(204,34,0,0.4); }
  .obl-progress-fill.emi  { background: linear-gradient(90deg, var(--border-hi), #88ffcc);  box-shadow: 0 0 8px rgba(74,222,128,0.3); }

  /* Projection table zebra striping */
  .obl-proj-tbody tr:nth-child(even) { background: rgba(201,168,76,0.04); }
  .obl-proj-tbody tr:hover           { background: rgba(204,34,0,0.08); }

  /* Card actions */
  .obl-card-actions {
    display:     flex;
    flex-wrap:   wrap;
    gap:         6px;
    padding:     8px 16px 12px;
    border-top:  1px solid var(--ba-border-lo);
  }
  .obl-action-btn {
    padding:       4px 12px;
    font-size:     10px;
    font-family:   var(--mono);
    letter-spacing:1px;
    cursor:        pointer;
    background:    transparent;
    border:        1px solid var(--ba-border);
    color:         var(--ba-gold-mute);
    transition:    all 0.2s;
    text-transform:uppercase;
  }
  .obl-action-btn:hover        { border-color: var(--ba-gold-dim); color: var(--ba-gold); }
  .obl-action-btn.primary      { border-color: var(--ba-crimson); color: var(--ba-crimson); }
  .obl-action-btn.primary:hover{ background: rgba(204,34,0,0.15); }

  /* Section dividers */
  .obl-section-hdr {
    font-size:     10px;
    color:         var(--ba-gold-dim);
    letter-spacing:3px;
    text-transform:uppercase;
    padding:       8px 0 6px;
    border-bottom: 1px solid var(--ba-border-lo);
    margin-bottom: 10px;
    font-family:   var(--mono);
    display:       flex;
    justify-content:space-between;
    align-items:   center;
  }

  /* Add form */
  .obl-form-wrap {
    background:  var(--ba-bg-panel);
    border:      1px solid var(--ba-border);
    padding:     16px;
    margin-top:  14px;
    position:    relative;
  }
  .obl-reveal {
    animation: oblReveal 0.22s ease-out both;
  }
  .obl-form-wrap::before {
    content:  '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--ba-gold-dim), transparent);
  }
  .obl-form-grid {
    display:               grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap:                   10px;
    margin-bottom:         12px;
  }
  .obl-form-grid.wide { grid-template-columns: 1fr 1fr; }
  .obl-field-lbl {
    font-size:     9px;
    color:         var(--ba-gold-dim);
    letter-spacing:2px;
    margin-bottom: 4px;
    font-family:   var(--mono);
    text-transform:uppercase;
  }

  /* Empty state */
  .obl-empty {
    text-align:  center;
    padding:     40px 20px;
    color:       var(--ba-gold-mute);
    font-family: var(--mono);
    font-size:   11px;
    letter-spacing:2px;
  }
  .obl-empty-icon { font-size: 28px; margin-bottom: 12px; opacity: 0.5; }

  /* Scroll area */
  .obl-scroll {
    flex:       1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
  }
  .obl-scroll::-webkit-scrollbar       { width: 3px; }
  .obl-scroll::-webkit-scrollbar-track { background: #050000; }
  .obl-scroll::-webkit-scrollbar-thumb { background: var(--ba-border); border-radius: 2px; }

  /* Two-col layout */
  .obl-layout { display: grid; grid-template-columns: 1.1fr 1.6fr; gap: 14px; flex: 1; min-height: 0; }
  .obl-col    { display: flex; flex-direction: column; overflow: hidden; }

  .obl-highlight {
    animation: oblSavedPulse 1.4s ease-out both;
  }

  @keyframes oblPipIdle {
    0%   { box-shadow: 0 0 4px var(--ba-gold); opacity: 0.7; }
    100% { box-shadow: 0 0 10px var(--ba-gold); opacity: 1; }
  }
  @keyframes oblPipCrit {
    0%,100% { box-shadow: 0 0 6px var(--ba-crimson); opacity: 1; }
    50%     { box-shadow: 0 0 14px var(--ba-crimson); opacity: 0.5; }
  }
  @keyframes oblBadgePulse {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.45; }
  }
  @keyframes oblReveal {
    from { opacity: 0; transform: translateY(6px); filter: brightness(1.25); }
    to   { opacity: 1; transform: translateY(0); filter: brightness(1); }
  }
  @keyframes oblSavedPulse {
    0%   { box-shadow: inset 0 0 0 1px var(--border-hi), 0 0 22px rgba(74,222,128,0.35); border-color: var(--border-hi); }
    55%  { box-shadow: inset 0 0 0 1px var(--ba-gold), 0 0 18px rgba(201,168,76,0.3); border-color: var(--ba-gold); }
    100% { box-shadow: none; }
  }
`;

// ── Frequency display helper ───────────────────────────────────
const freqLabel = (freq, interval = 1) => {
  const labels = {
    daily:       interval === 1 ? 'DAILY'       : `EVERY ${interval}D`,
    weekly:      interval === 1 ? 'WEEKLY'      : `EVERY ${interval}W`,
    fortnightly: 'FORTNIGHTLY',
    monthly:     interval === 1 ? 'MONTHLY'     : `EVERY ${interval}MO`,
    quarterly:   'QUARTERLY',
    'bi-annual': 'BI-ANNUAL',
    annual:      'ANNUAL',
  };
  return labels[freq] || freq.toUpperCase();
};

// ── Currency helper ────────────────────────────────────────────
const fmt = (n) => `${Math.round(n || 0).toLocaleString('en-IN')}`;

// ── Blank form states ──────────────────────────────────────────
const BLANK_REC = {
  name: '', amount: '', tolerance: '10', frequency: 'monthly',
  frequency_interval: '1', start_date: localDateStr(),
  day_of_cycle: '1', category: '', account: '', match_by: 'category+account',
  keywords: '', notes: ''
};

const BLANK_LOAN = {
  name: '', loan_type: 'education', sanctioned_amount: '', disbursed_amount: '',
  interest_rate: '', rate_type: 'floating', phase: 'moratorium',
  moratorium_end: '', emi: '0', emi_day: '5', debit_account: '', emi_account: '',
  start_date: localDateStr(), notes: ''
};

const BLANK_EMI = {
  name: '', total_amount: '', down_payment: '0', emi_amount: '',
  tenure_months: '12', interest_rate: '0', account: '',
  purchase_date: localDateStr(),
  first_emi_date: '', category: '', notes: ''
};

const blankLoanLog = () => ({
  amount: '',
  date: localDateStr(),
  description: '',
  paidBy: '',
  account: '',
  alreadyDeclared: false
});

const Input = ({ label, value, onChange, type = 'text', placeholder = '', ...rest }) => (
  <div>
    <div className="obl-field-lbl">{label}</div>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="mech-input"
      {...rest}
    />
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div>
    <div className="obl-field-lbl">{label}</div>
    <select value={value} onChange={e => onChange(e.target.value)} className="mech-select">
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  </div>
);

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const ObligationsSlide = ({ data, dbMetadata, dbTransactions, userId }) => {
  const [activeTab,  setActiveTab]  = useState('recurring');
  const [showRecForm,  setShowRecForm]  = useState(false);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showEmiForm,  setShowEmiForm]  = useState(false);
  const [recForm,  setRecForm]  = useState(BLANK_REC);
  const [loanForm, setLoanForm] = useState(BLANK_LOAN);
  const [emiForm,  setEmiForm]  = useState(BLANK_EMI);
  const [saving, setSaving]     = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [editingRecId, setEditingRecId] = useState(null);
  const [editingEmiId, setEditingEmiId] = useState(null);
  const [lastTouchedId, setLastTouchedId] = useState(null);
  const [loanLogTarget, setLoanLogTarget] = useState(null);
  const [loanLogForm, setLoanLogForm] = useState(blankLoanLog);
  const [emiPayTarget, setEmiPayTarget] = useState(null);
  const [emiPayForm, setEmiPayForm] = useState({ amount: '', date: localDateStr() });
  const [rateTarget, setRateTarget] = useState(null);
  const [rateForm, setRateForm] = useState({ rate: '', date: localDateStr() });
  const [simForm, setSimForm] = useState({ prepay: '', extra: '' });
  const [loanTxnsMap, setLoanTxnsMap] = useState({});
  const [editLoanDrawnLock, setEditLoanDrawnLock] = useState(null);

  const obligations = data?.obligations || {
    recurring: [], loans: [], emis: [],
    totalMonthlyLoad: 0, recurringMonthlyLoad: 0,
    emiMonthlyLoad: 0, loanMonthlyLoad: 0,
    recurringStats: { paid: 0, pending: 0, overdue: 0, total: 0 }
  };

  const { recurring, loans, emis, recurringStats,
          recurringMonthlyLoad, emiMonthlyLoad, loanMonthlyLoad, totalMonthlyLoad } = obligations;

  const categories = data?.expenseCategories || [];
  const accounts   = data?.accounts || [];
  const cards      = data?.cards || [];

  const accountOpts = accounts.map(a => ({ value: a._id?.split(':').pop() || a.name, label: a.name }));
  // Preserve a stored value that isn't in the current account list
  // (legacy free-text entries) so opening the edit form doesn't clobber it.
  const withCurrentOpt = (opts, current) =>
    current && !opts.some(o => o.value === current)
      ? [...opts, { value: current, label: current }]
      : opts;

  const flash = (msg, type = 'ok') => {
    setStatusMsg({ msg, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const markTouched = (id) => {
    if (!id) return;
    setLastTouchedId(id);
    setTimeout(() => setLastTouchedId(null), 1600);
  };

  // ── Recurring handlers ───────────────────────────────────────
  const resetRecForm = () => {
    setRecForm(BLANK_REC);
    setEditingRecId(null);
    setShowRecForm(false);
  };

  const handleSaveRecurring = async () => {
    if (!recForm.name || !recForm.amount) return;
    setSaving(true);
    const payload = {
      ...recForm,
      amount:             Number(recForm.amount),
      tolerance:          Number(recForm.tolerance) / 100,
      frequency_interval: Number(recForm.frequency_interval),
      day_of_cycle:       Number(recForm.day_of_cycle),
      keywords:           recForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
    };
    const result = editingRecId
      ? await ObligationsEngine.updateRecurring(editingRecId, payload, dbMetadata, userId)
      : await ObligationsEngine.addRecurring(payload, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash(editingRecId ? 'Recurring expense updated' : 'Recurring expense declared');
      markTouched(result.id || result.doc?._id || editingRecId);
      resetRecForm();
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const handleEditRecurring = (rec) => {
    setRecForm({
      name:               rec.name || '',
      amount:             String(rec.amount ?? ''),
      tolerance:          String(Math.round((rec.tolerance ?? 0.1) * 100)),
      frequency:          rec.frequency || 'monthly',
      frequency_interval: String(rec.frequency_interval ?? 1),
      start_date:         rec.start_date || localDateStr(),
      day_of_cycle:       String(rec.day_of_cycle ?? 1),
      category:           rec.category || '',
      account:            rec.account || '',
      match_by:           rec.match_by || 'category+account',
      keywords:           Array.isArray(rec.keywords) ? rec.keywords.join(', ') : (rec.keywords || ''),
      notes:              rec.notes || ''
    });
    setEditingRecId(rec._id);
    setShowRecForm(true);
  };

  const handleDeleteRecurring = async (id) => {
    if (!window.confirm('Remove this recurring expense? History remains intact.')) return;
    await ObligationsEngine.deleteRecurring(id, dbMetadata, userId);
    flash('Recurring expense removed');
    if (editingRecId === id) resetRecForm();
  };

  // ── Loan handlers ────────────────────────────────────────────
  const resetLoanForm = () => {
    setLoanForm(BLANK_LOAN);
    setEditingLoanId(null);
    setEditLoanDrawnLock(null);
    setShowLoanForm(false);
  };

  const openLoanLog = (loan, type) => {
    const isSame = loanLogTarget?.loanId === loan._id && loanLogTarget?.type === type;
    if (isSame) {
      setLoanLogTarget(null);
      setLoanLogForm(blankLoanLog());
      return;
    }
    setLoanLogTarget({ loanId: loan._id, type });
    setLoanLogForm({
      amount: type === 'payment' && loan.emi ? String(loan.emi) : '',
      date: localDateStr(),
      description: '',
      paidBy: userId || '',
      account: loan.emi_account || loan.debit_account || '',
      alreadyDeclared: false
    });
  };

  const handleRecurringNameBlur = async () => {
    const name = recForm.name.trim();
    if (!name || !dbMetadata || !userId) return;

    const suggested = await CategorizationEngine.autoTag(name, dbMetadata, userId);
    setRecForm(prev => {
      const next = { ...prev };
      if (suggested && suggested !== 'Uncategorized' && !prev.category) {
        next.category = suggested;
      }
      if (prev.match_by === 'description' && !prev.keywords.trim()) {
        next.keywords = name.toLowerCase();
      }
      return next;
    });
  };

  const normalizeLoanForm = () => ({
    ...loanForm,
    sanctioned_amount: Number(loanForm.sanctioned_amount) || 0,
    disbursed_amount:  Number(loanForm.disbursed_amount)  || 0,
    interest_rate:     Number(loanForm.interest_rate)     || 0,
    emi:               Number(loanForm.emi)               || 0,
    tenure_months:     loanForm.tenure_months ? Number(loanForm.tenure_months) : null,
    emi_day:           Math.min(31, Math.max(1, Number(loanForm.emi_day) || 5)),
    moratorium_end:    loanForm.moratorium_end || null,
    emi_account:       loanForm.emi_account || null,
  });

  const handleCalculateLoanEmi = () => {
    const principal = Number(loanForm.disbursed_amount || loanForm.sanctioned_amount || 0);
    const emi = ObligationsEngine.calculateLoanEmi(principal, loanForm.interest_rate, loanForm.tenure_months);
    if (!emi) {
      flash('Principal, rate, and tenure required', 'error');
      return;
    }
    setLoanForm(f => ({ ...f, emi: String(Math.round(emi)) }));
  };

  const handleSaveLoan = async () => {
    if (!loanForm.name || !loanForm.sanctioned_amount) return;
    const payload = normalizeLoanForm();
    if (payload.sanctioned_amount < 0 || payload.disbursed_amount < 0 ||
        payload.emi < 0 || (payload.tenure_months ?? 0) < 0) {
      flash('Amounts cannot be negative', 'error');
      return;
    }
    if (payload.interest_rate < 0 || payload.interest_rate > 100) {
      flash('Interest rate must be between 0 and 100%', 'error');
      return;
    }
    if (payload.disbursed_amount > payload.sanctioned_amount &&
        !window.confirm('Drawn amount exceeds the sanctioned amount. Save anyway?')) {
      return;
    }
    setSaving(true);
    const result = editingLoanId
      ? await ObligationsEngine.updateLoan(editingLoanId, payload, dbMetadata, userId)
      : await ObligationsEngine.addLoan(payload, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash(editingLoanId ? 'Loan updated' : 'Loan declared');
      markTouched(result.id || result.doc?._id || editingLoanId);
      resetLoanForm();
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const handleLoanLogSubmit = async (loan) => {
    if (!loan || !loanLogTarget || !dbTransactions || !dbMetadata || !userId) return;
    const amount = Number(loanLogForm.amount);
    if (!amount || amount <= 0 || !loanLogForm.date) {
      flash('Amount and date required', 'error');
      return;
    }

    if (loanLogTarget.type === 'drawdown') {
      const drawn = Number(loan.disbursed_amount) || 0;
      const sanc  = Number(loan.sanctioned_amount) || 0;
      if (!loanLogForm.alreadyDeclared && sanc > 0 && drawn + amount > sanc &&
          !window.confirm(`This drawdown takes the total drawn to ${fmt(drawn + amount)}, beyond the sanctioned ${fmt(sanc)}. Log anyway?`)) {
        return;
      }
    } else {
      const outstanding = loan.balance?.outstanding;
      if (outstanding !== undefined && amount > outstanding + 0.01 &&
          !window.confirm(`Payment exceeds the outstanding balance (${fmt(outstanding)}); the excess will not reduce the balance. Log anyway?`)) {
        return;
      }
    }

    setSaving(true);
    const result = loanLogTarget.type === 'drawdown'
      ? await ObligationsEngine.recordDrawdown(
          loan._id,
          amount,
          loanLogForm.date,
          loanLogForm.description || `${loan.name} Drawdown`,
          dbTransactions,
          dbMetadata,
          userId,
          { alreadyDeclared: loanLogForm.alreadyDeclared }
        )
      : await ObligationsEngine.recordPayment(
          loan._id,
          amount,
          loanLogForm.date,
          loanLogForm.paidBy || userId,
          dbTransactions,
          dbMetadata,
          userId,
          null,
          loanLogForm.paidBy === userId ? loanLogForm.account : null
        );
    setSaving(false);

    if (result.ok) {
      flash(loanLogTarget.type === 'drawdown' ? 'Drawdown logged' : 'Payment logged');
      markTouched(loan._id);
      setLoanLogTarget(null);
      setLoanLogForm(blankLoanLog());
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const handleEditLoan = (loan) => {
    // Once drawdowns are logged, disbursed_amount is partly derived —
    // direct edits would double-count them, so the field locks.
    const logged = loan.balance?.totalDrawn || 0;
    setEditLoanDrawnLock(logged > 0
      ? { logged, opening: Math.max(0, (Number(loan.disbursed_amount) || 0) - logged) }
      : null);
    setLoanForm({
      name: loan.name || '',
      loan_type: loan.loan_type || 'other',
      sanctioned_amount: String(loan.sanctioned_amount ?? ''),
      disbursed_amount: String(loan.disbursed_amount ?? ''),
      interest_rate: String(loan.interest_rate ?? ''),
      rate_type: loan.rate_type || 'floating',
      phase: loan.storedPhase || loan.phase || 'moratorium',
      moratorium_end: loan.moratorium_end || '',
      emi: String(loan.emi ?? '0'),
      tenure_months: loan.tenure_months ? String(loan.tenure_months) : '',
      emi_day: String(loan.emi_day ?? '5'),
      debit_account: loan.debit_account || '',
      emi_account: loan.emi_account || '',
      start_date: loan.start_date || localDateStr(),
      notes: loan.notes || ''
    });
    setEditingLoanId(loan._id);
    setShowLoanForm(true);
    setActiveTab('debts');
  };

  const openRateForm = (loan) => {
    if (rateTarget === loan._id) {
      setRateTarget(null);
      return;
    }
    setRateTarget(loan._id);
    setRateForm({ rate: String(loan.interest_rate ?? ''), date: localDateStr() });
  };

  const handleRateSubmit = async (loan) => {
    const rate = Number(rateForm.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      flash('Rate must be between 0 and 100%', 'error');
      return;
    }
    if (!rateForm.date) {
      flash('Effective date required', 'error');
      return;
    }
    setSaving(true);
    const result = await ObligationsEngine.updateLoanRate(loan._id, rate, rateForm.date, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash('Interest rate updated');
      markTouched(loan._id);
      setRateTarget(null);
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const loadLoanTxns = async (loanId) => {
    if (!dbTransactions || !userId) return;
    const txns = await ObligationsEngine.getLoanTransactions(loanId, dbTransactions, userId);
    setLoanTxnsMap(m => ({ ...m, [loanId]: txns }));
  };

  const toggleLoanExpand = (loan) => {
    const next = expandedLoan === loan._id ? null : loan._id;
    setExpandedLoan(next);
    setSimForm({ prepay: '', extra: '' });
    if (next) loadLoanTxns(loan._id);
  };

  const handleDeleteLoanTxn = async (loan, txn) => {
    const label = txn.category === 'Loan Drawdown' ? 'drawdown' : 'payment';
    if (!window.confirm(`Delete this ${label} of ${fmt(Math.abs(txn.amount))} dated ${txn.date}? Balances will be recalculated.`)) return;
    setSaving(true);
    const result = await ObligationsEngine.deleteLoanTransaction(txn._id, dbTransactions, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash('Entry deleted — balances recalculated');
      markTouched(loan._id);
      loadLoanTxns(loan._id);
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  // ── EMI handlers ─────────────────────────────────────────────
  const handleDeleteLoan = async (loan) => {
    if (!loan || !dbMetadata || !userId) return;
    if (!window.confirm(`Discharge ${loan.name || 'this loan'}? Transaction history will be preserved.`)) return;

    setSaving(true);
    const result = await ObligationsEngine.deleteLoan(loan._id, dbMetadata, userId);
    setSaving(false);

    if (result.ok) {
      flash('Loan discharged');
      if (expandedLoan === loan._id) setExpandedLoan(null);
      if (rateTarget === loan._id) setRateTarget(null);
      if (loanLogTarget?.loanId === loan._id) {
        setLoanLogTarget(null);
        setLoanLogForm(blankLoanLog());
      }
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const resetEmiForm = () => {
    setEmiForm(BLANK_EMI);
    setEditingEmiId(null);
    setShowEmiForm(false);
  };

  const handleSaveEMI = async () => {
    if (!emiForm.name || !emiForm.emi_amount) return;
    setSaving(true);
    const result = editingEmiId
      ? await ObligationsEngine.updateEMI(editingEmiId, {
          ...emiForm,
          total_amount:   Number(emiForm.total_amount) || 0,
          down_payment:   Number(emiForm.down_payment) || 0,
          emi_amount:     Number(emiForm.emi_amount)   || 0,
          tenure_months:  Number(emiForm.tenure_months) || 0,
          interest_rate:  Number(emiForm.interest_rate) || 0,
        }, dbMetadata, userId)
      : await ObligationsEngine.addEMI(emiForm, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash(editingEmiId ? 'EMI updated' : 'EMI purchase declared');
      markTouched(result.id || result.doc?._id || editingEmiId);
      resetEmiForm();
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const handleEditEMI = (emi) => {
    setEmiForm({
      name:           emi.name || '',
      total_amount:   String(emi.total_amount ?? ''),
      down_payment:   String(emi.down_payment ?? '0'),
      emi_amount:     String(emi.emi_amount ?? ''),
      tenure_months:  String(emi.tenure_months ?? '12'),
      interest_rate:  String(emi.interest_rate ?? '0'),
      account:        emi.account || '',
      purchase_date:  emi.purchase_date || localDateStr(),
      first_emi_date: emi.first_emi_date || '',
      category:       emi.category || '',
      notes:          emi.notes || ''
    });
    setEditingEmiId(emi._id);
    setShowEmiForm(true);
  };

  const openEmiPay = (emi) => {
    if (emiPayTarget === emi._id) {
      setEmiPayTarget(null);
      return;
    }
    setEmiPayTarget(emi._id);
    setEmiPayForm({
      amount: String(emi.emi_amount || ''),
      date:   localDateStr(),
    });
  };

  const handleEmiPaySubmit = async (emi) => {
    if (!emi || !dbTransactions || !dbMetadata || !userId) return;
    const amount = Number(emiPayForm.amount);
    if (!amount || amount <= 0 || !emiPayForm.date) {
      flash('Amount and date required', 'error');
      return;
    }
    setSaving(true);
    const result = await ObligationsEngine.recordEMIPayment(
      emi._id, amount, emiPayForm.date, dbTransactions, dbMetadata, userId
    );
    setSaving(false);
    if (result.ok) {
      flash('EMI payment logged');
      markTouched(emi._id);
      setEmiPayTarget(null);
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  const handleDischargeEMI = async (emi) => {
    if (!emi || !dbMetadata || !userId) return;
    if (!window.confirm(`Discharge ${emi.name || 'this EMI'}? History will be preserved.`)) return;
    setSaving(true);
    const result = await ObligationsEngine.deleteEMI(emi._id, dbMetadata, userId);
    setSaving(false);
    if (result.ok) {
      flash('EMI discharged');
      if (editingEmiId === emi._id) resetEmiForm();
      if (emiPayTarget === emi._id) setEmiPayTarget(null);
    } else {
      flash(result.error || 'Failed', 'error');
    }
  };

  // ── Input helper ─────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{OBL_STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>

        {/* Patron-saint watermark — faint reliquary presiding over the ledger */}
        <div className="wm-saint" aria-hidden="true" />

        {/* ── Tab strip ── */}
        <div className="obl-tabs">
          <button
            className={`obl-tab${activeTab === 'recurring' ? ' active' : ''}`}
            onClick={() => setActiveTab('recurring')}
          >
            [ RECURRING TITHE ]
          </button>
          <button
            className={`obl-tab${activeTab === 'debts' ? ' active' : ''}`}
            onClick={() => setActiveTab('debts')}
          >
            [ OUTSTANDING DEBTS ]
          </button>
        </div>

        {/* ── Status message ── */}
        {statusMsg && (
          <div style={{
            padding: '6px 14px', marginBottom: '10px',
            background: statusMsg.type === 'error' ? 'rgba(204,34,0,0.1)' : 'rgba(74,222,128,0.08)',
            border: `1px solid ${statusMsg.type === 'error' ? 'var(--ba-crimson)' : 'var(--border)'}`,
            color: statusMsg.type === 'error' ? 'var(--ba-crimson)' : 'var(--border-hi)',
            fontSize: '11px', fontFamily: 'var(--mono)', letterSpacing: '1px'
          }}>
            ◈ {statusMsg.msg}
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB 1 — RECURRING TITHE
            ════════════════════════════════════════════════════ */}
        {activeTab === 'recurring' && (
          <div className="obl-tab-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

            {/* Stats bar */}
            <div className="obl-stats-bar">
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">PAID THIS CYCLE</div>
                <div className="obl-stat-chip-val paid">
                  <ScrambleText text={`${recurringStats.paid} / ${recurringStats.total}`} speed={50} step={0.5} />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">PENDING</div>
                <div className="obl-stat-chip-val" style={{ color: 'var(--ba-gold)' }}>
                  <ScrambleText text={String(recurringStats.pending)} speed={50} step={0.5} />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">OVERDUE</div>
                <div className="obl-stat-chip-val overdue">
                  <ScrambleText text={String(recurringStats.overdue)} speed={50} step={0.5} />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">MONTHLY LOAD</div>
                <div className="obl-stat-chip-val load">
                  <ScrambleText text={fmt(recurringMonthlyLoad)} speed={50} step={0.3} />
                </div>
              </div>
            </div>

            {/* Two-column layout: list left, details/form right */}
            <div className="obl-layout" style={{ flex: 1, minHeight: 0 }}>

              {/* LEFT — recurring list */}
              <div className="obl-col">
                <div className="ov-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div className="obl-section-hdr" style={{ padding: '0 0 6px', margin: '12px 14px 0' }}>
                    <span>DECLARED RECURRENCES</span>
                    <span style={{ fontSize: '10px', color: 'var(--ba-gold-mute)' }}>
                      {recurring.length} ACTIVE
                    </span>
                  </div>

                  <div className="obl-scroll" style={{ flex: 1 }}>
                    {recurring.length === 0 ? (
                      <div className="obl-empty">
                        <div className="obl-empty-icon">◈</div>
                        NO RECURRING EXPENSES DECLARED
                      </div>
                    ) : (
                      recurring.map(({ item, status, dueDate, daysUntilDue, daysOverdue }) => (
                        <div key={item._id} className={`obl-rec-row${lastTouchedId === item._id ? ' obl-highlight' : ''}${editingRecId === item._id ? ' obl-rec-editing' : ''}`}>
                          <span className={`obl-rec-status ${status}`} />
                          <span className="obl-rec-name">{item.name}</span>
                          <span className="obl-rec-freq">
                            {freqLabel(item.frequency, item.frequency_interval)}
                            {item.day_of_cycle ? ` · ${item.day_of_cycle}${['st','nd','rd'][item.day_of_cycle - 1] || 'th'}` : ''}
                          </span>
                          <span className="obl-rec-amt">
                            {item.tolerance > 0 ? '~' : ''}{fmt(item.amount)}
                          </span>
                          <span className={`obl-rec-badge ${status}`}>
                            {status === 'paid'    ? '✓ PAID'
                            : status === 'overdue' ? `${daysOverdue}D LATE`
                            : daysUntilDue <= 3    ? `${daysUntilDue}D LEFT`
                            : 'PENDING'}
                          </span>
                          <button
                            className="action-btn"
                            onClick={() => handleEditRecurring(item)}
                            title="Edit recurring"
                          >EDIT</button>
                          <button
                            className="action-btn del"
                            onClick={() => handleDeleteRecurring(item._id)}
                            title="Remove recurring"
                          >DEL</button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add button */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--ba-border-lo)' }}>
                    <button
                      className="mech-btn"
                      style={{ marginTop: 0 }}
                      onClick={() => showRecForm ? resetRecForm() : setShowRecForm(true)}
                    >
                      {showRecForm ? 'CANCEL' : '+ DECLARE RECURRING EXPENSE'}
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT — add form or category summary */}
              <div className="obl-col">
                {showRecForm ? (
                  <div className="obl-form-wrap obl-reveal" style={{ flex: 1, overflowY: 'auto' }}>
                    <div className="obl-section-hdr" style={{ marginBottom: '14px' }}>
                      {editingRecId ? 'EDIT RECURRING EXPENSE' : 'DECLARE RECURRING EXPENSE'}
                    </div>

                    <div className="obl-form-grid">
                      <Input label="NAME" value={recForm.name}
                        onChange={v => setRecForm(f => ({ ...f, name: v }))}
                        onBlur={handleRecurringNameBlur}
                        placeholder="Netflix" />
                      <Input label="AMOUNT" type="number" value={recForm.amount}
                        onChange={v => setRecForm(f => ({ ...f, amount: v }))} placeholder="649" />
                      <Input label="TOLERANCE (%)" type="number" value={recForm.tolerance}
                        onChange={v => setRecForm(f => ({ ...f, tolerance: v }))} placeholder="10" />
                    </div>

                    <div className="obl-form-grid">
                      <Select label="FREQUENCY" value={recForm.frequency}
                        onChange={v => setRecForm(f => ({ ...f, frequency: v }))}
                        options={[
                          { value: 'daily',       label: 'DAILY' },
                          { value: 'weekly',      label: 'WEEKLY' },
                          { value: 'fortnightly', label: 'FORTNIGHTLY' },
                          { value: 'monthly',     label: 'MONTHLY' },
                          { value: 'quarterly',   label: 'QUARTERLY' },
                          { value: 'bi-annual',   label: 'BI-ANNUAL' },
                          { value: 'annual',      label: 'ANNUAL' },
                        ]}
                      />
                      <Input label="INTERVAL" type="number" value={recForm.frequency_interval}
                        onChange={v => setRecForm(f => ({ ...f, frequency_interval: v }))}
                        placeholder="1" />
                      <Input label="DUE DAY (OF CYCLE)" type="number" value={recForm.day_of_cycle}
                        onChange={v => setRecForm(f => ({ ...f, day_of_cycle: v }))}
                        placeholder="15" />
                    </div>

                    <div className="obl-form-grid">
                      <Select label="CATEGORY" value={recForm.category}
                        onChange={v => setRecForm(f => ({ ...f, category: v }))}
                        options={[
                          { value: '', label: '-- SELECT --' },
                          ...Array.from(new Set([...categories, recForm.category]))
                            .filter(Boolean)
                            .map(c => ({ value: c, label: c }))
                        ]}
                      />
                      <Select label="ACCOUNT" value={recForm.account}
                        onChange={v => setRecForm(f => ({ ...f, account: v }))}
                        options={[
                          { value: '', label: '-- ANY --' },
                          ...accounts.map(a => ({ value: a._id?.split(':').pop() || a.name, label: a.name })),
                          ...cards.map(c => ({ value: c._id?.split(':').pop() || c.name, label: c.name }))
                        ]}
                      />
                      <Select label="MATCH BY" value={recForm.match_by}
                        onChange={v => setRecForm(f => ({ ...f, match_by: v }))}
                        options={[
                          { value: 'category+account', label: 'CATEGORY + ACCOUNT' },
                          { value: 'description',      label: 'DESCRIPTION KEYWORDS' },
                        ]}
                      />
                    </div>

                    {recForm.match_by === 'description' && (
                      <div style={{ marginBottom: '10px' }}>
                        <Input label="KEYWORDS (COMMA SEPARATED)" value={recForm.keywords}
                          onChange={v => setRecForm(f => ({ ...f, keywords: v }))}
                          placeholder="airtel, wifi, broadband" />
                      </div>
                    )}

                    <Input label="START DATE" type="date" value={recForm.start_date}
                      onChange={v => setRecForm(f => ({ ...f, start_date: v }))} />

                    <button
                      className="mech-btn"
                      onClick={handleSaveRecurring}
                      disabled={saving || !recForm.name || !recForm.amount}
                    >
                      {saving
                        ? (editingRecId ? 'UPDATING...' : 'DECLARING...')
                        : (editingRecId ? 'AUTHORIZE & UPDATE'   : 'AUTHORIZE & DECLARE')}
                    </button>
                  </div>
                ) : (
                  /* Summary panel when form is hidden */
                  <div className="ov-panel" style={{ padding: '16px', flex: 1 }}>
                    <div className="obl-section-hdr" style={{ marginBottom: '14px' }}>
                      OBLIGATION LOAD SUMMARY
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                      {[
                        { label: 'RECURRING EXPENSES', val: recurringMonthlyLoad, note: '/mo' },
                        { label: 'ACTIVE EMI LOAD',    val: emiMonthlyLoad,       note: '/mo' },
                        { label: 'LOAN EMI LOAD',      val: loanMonthlyLoad,      note: '/mo' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ba-border-lo)' }}>
                          <span style={{ color: 'var(--ba-gold-mute)', letterSpacing: '1px' }}>{row.label}</span>
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>
                            <ScrambleText text={fmt(row.val)} speed={60} step={0.3} />
                            <span style={{ color: 'var(--ba-gold-mute)', fontSize: '10px', marginLeft: '4px' }}>{row.note}</span>
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 0' }}>
                        <span style={{ color: 'var(--ba-gold)', letterSpacing: '2px', fontWeight: 'bold' }}>TOTAL COMMITTED</span>
                        <span style={{ color: 'var(--ba-gold)', fontWeight: 'bold', fontSize: '20px', textShadow: '0 0 10px rgba(201,168,76,0.5)' }}>
                          <ScrambleText text={fmt(totalMonthlyLoad)} speed={50} step={0.25} />
                          <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.7 }}>/mo</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            TAB 2 — OUTSTANDING DEBTS
            ════════════════════════════════════════════════════ */}
        {activeTab === 'debts' && (
          <div className="obl-tab-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

            {/* Stats bar */}
            <div className="obl-stats-bar">
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">ACTIVE LOANS</div>
                <div className="obl-stat-chip-val" style={{ color: 'var(--ba-gold)' }}>
                  <ScrambleText text={String(loans.length)} speed={50} step={0.5} />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">ACTIVE EMIS</div>
                <div className="obl-stat-chip-val" style={{ color: 'var(--border-hi)' }}>
                  <ScrambleText text={String(emis.length)} speed={50} step={0.5} />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">TOTAL OUTSTANDING</div>
                <div className="obl-stat-chip-val overdue">
                  <ScrambleText
                    text={fmt(
                      loans.reduce((s, l) => s + (l.balance?.outstanding || 0), 0) +
                      emis.reduce((s,  e) => s + (e.balance?.outstanding  || 0), 0)
                    )}
                    speed={50} step={0.25}
                  />
                </div>
              </div>
              <div className="obl-stat-chip">
                <div className="obl-stat-chip-label">MONTHLY EMI LOAD</div>
                <div className="obl-stat-chip-val load">
                  <ScrambleText text={fmt(emiMonthlyLoad + loanMonthlyLoad)} speed={50} step={0.25} />
                </div>
              </div>
            </div>

            <div className="obl-scroll" style={{ flex: 1 }}>

              {/* ── LOANS section ── */}
              <div className="obl-section-hdr">
                <span>ACTIVE LOANS</span>
                <button
                  className="obl-action-btn primary"
                  onClick={() => showLoanForm ? resetLoanForm() : setShowLoanForm(true)}
                >
                  {showLoanForm ? 'CANCEL' : '+ DECLARE LOAN'}
                </button>
              </div>

              {showLoanForm && (
                <div className="obl-form-wrap obl-reveal" style={{ marginBottom: '14px' }}>
                  <div className="obl-section-hdr" style={{ marginBottom: '14px' }}>
                    {editingLoanId ? 'EDIT LOAN STATE' : 'DECLARE LOAN'}
                  </div>
                  <div className="obl-form-grid">
                    <Input label="LOAN NAME" value={loanForm.name}
                      onChange={v => setLoanForm(f => ({ ...f, name: v }))} placeholder="SBI Education Loan" />
                    <Select label="LOAN TYPE" value={loanForm.loan_type}
                      onChange={v => setLoanForm(f => ({ ...f, loan_type: v }))}
                      options={['education','home','personal','vehicle','other'].map(v => ({ value: v, label: v.toUpperCase() }))}
                    />
                    <Select label="PHASE" value={loanForm.phase}
                      onChange={v => setLoanForm(f => ({ ...f, phase: v }))}
                      options={[{ value: 'moratorium', label: 'MORATORIUM' }, { value: 'repayment', label: 'REPAYMENT' }]}
                    />
                  </div>
                  <div className="obl-form-grid">
                    <Input label="SANCTIONED" type="number" value={loanForm.sanctioned_amount}
                      onChange={v => setLoanForm(f => ({ ...f, sanctioned_amount: v }))} placeholder="2000000" />
                    <div>
                      <Input label="DRAWN SO FAR" type="number" value={loanForm.disbursed_amount}
                        onChange={v => setLoanForm(f => ({ ...f, disbursed_amount: v }))} placeholder="800000"
                        disabled={!!(editingLoanId && editLoanDrawnLock)}
                        title={editingLoanId && editLoanDrawnLock ? 'Logged drawdowns exist — adjust via LOG DRAWDOWN instead' : undefined} />
                      {editingLoanId && editLoanDrawnLock && (
                        <div style={{ fontSize: '9px', color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)', marginTop: '3px', letterSpacing: '1px' }}>
                          OPENING {fmt(editLoanDrawnLock.opening)} + LOGGED {fmt(editLoanDrawnLock.logged)} — ADJUST VIA DRAWDOWN LOG
                        </div>
                      )}
                    </div>
                    <Input label="INTEREST RATE (%)" type="number" step="0.1" value={loanForm.interest_rate}
                      onChange={v => setLoanForm(f => ({ ...f, interest_rate: v }))} placeholder="10.5" />
                  </div>
                  <div className="obl-form-grid">
                    <Select label="RATE TYPE" value={loanForm.rate_type}
                      onChange={v => setLoanForm(f => ({ ...f, rate_type: v }))}
                      options={[{ value: 'floating', label: 'FLOATING' }, { value: 'fixed', label: 'FIXED' }]}
                    />
                    <Input label="MORATORIUM END" type="date" value={loanForm.moratorium_end}
                      onChange={v => setLoanForm(f => ({ ...f, moratorium_end: v }))} />
                    <Input label="EMI DAY" type="number" min="1" max="31" value={loanForm.emi_day}
                      onChange={v => setLoanForm(f => ({ ...f, emi_day: v }))} placeholder="5" />
                  </div>
                  <div className="obl-form-grid">
                    <Input label="EMI AMOUNT" type="number" value={loanForm.emi}
                      onChange={v => setLoanForm(f => ({ ...f, emi: v }))} placeholder="25000" />
                    <Input label="TENURE (MONTHS)" type="number" value={loanForm.tenure_months}
                      onChange={v => setLoanForm(f => ({ ...f, tenure_months: v }))} placeholder="120" />
                    <Select label="EMI ACCOUNT" value={loanForm.emi_account}
                      onChange={v => setLoanForm(f => ({ ...f, emi_account: v }))}
                      options={[
                        { value: '', label: '-- NONE --' },
                        ...withCurrentOpt(accountOpts, loanForm.emi_account)
                      ]}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                    <button
                      className="obl-action-btn primary"
                      onClick={handleCalculateLoanEmi}
                      type="button"
                    >
                      CALCULATE EMI FROM RATE / TENURE
                    </button>
                  </div>
                  <div className="obl-form-grid wide">
                    <Select label="DEBIT ACCOUNT (DRAWDOWNS CREDITED TO)" value={loanForm.debit_account}
                      onChange={v => setLoanForm(f => ({ ...f, debit_account: v }))}
                      options={[
                        { value: '', label: '-- NONE --' },
                        ...withCurrentOpt(accountOpts, loanForm.debit_account)
                      ]}
                    />
                    <Input label="START DATE" type="date" value={loanForm.start_date}
                      onChange={v => setLoanForm(f => ({ ...f, start_date: v }))} />
                  </div>
                  <button className="mech-btn" onClick={handleSaveLoan} disabled={saving || !loanForm.name || !loanForm.sanctioned_amount}>
                    {saving
                      ? (editingLoanId ? 'UPDATING...' : 'DECLARING...')
                      : (editingLoanId ? 'AUTHORIZE & UPDATE LOAN' : 'AUTHORIZE & DECLARE LOAN')}
                  </button>
                </div>
              )}

              {loans.length === 0 && !showLoanForm && (
                <div className="obl-empty" style={{ padding: '20px' }}>
                  NO ACTIVE LOANS DECLARED
                </div>
              )}

              {loans.map(loan => {
                const bal      = loan.balance || {};
                const drawn    = loan.disbursed_amount || 0;
                const sanc     = loan.sanctioned_amount || 0;
                const drawnPct = sanc > 0 ? Math.min(100, Math.round((drawn / sanc) * 100)) : 0;
                  const isExpanded = expandedLoan === loan._id;
                  const phase = loan.balance?.phase || loan.phase || 'moratorium';
                  const storedPhase = loan.storedPhase || loan.balance?.storedPhase || loan.phase || 'moratorium';
                  const autoPhase = phase !== storedPhase;
                  const fullyRepaid = (bal.outstanding ?? drawn) <= 0.01 && (bal.totalPaid || 0) > 0;

                return (
                  <div key={loan._id} className={`obl-card${lastTouchedId === loan._id ? ' obl-highlight' : ''}`}>
                    <div className="obl-card-header">
                      <span className="obl-card-title">{loan.name}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '10px', color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)' }}>
                          {loan.loan_type?.toUpperCase()} · {loan.rate_type?.toUpperCase()}
                        </span>
                        {bal.unverified && (
                          <span className="obl-card-badge" style={{ border: '1px solid var(--ba-crimson)', color: 'var(--ba-crimson)' }}
                            title="Balance computation failed — figures fall back to the declared drawn amount">
                            BALANCE UNVERIFIED
                          </span>
                        )}
                        {fullyRepaid && (
                          <span className="obl-card-badge discharged" title="Outstanding is zero — discharge the indenture to archive it">
                            FULLY REPAID
                          </span>
                        )}
                        {!fullyRepaid && bal.emiStatus && (
                          <span className={`obl-rec-badge ${bal.emiStatus}`}>
                            {bal.emiStatus === 'paid'    ? '✓ EMI PAID'
                            : bal.emiStatus === 'overdue' ? `EMI ${bal.emiDaysOverdue}D LATE`
                            : 'EMI DUE'}
                          </span>
                        )}
                        <span className={`obl-card-badge ${phase}`}>
                          {phase === 'repayment' ? 'PENANCE' : phase?.toUpperCase()}
                          {autoPhase && (
                            <span className="obl-auto-flag" title={`Auto-flipped from ${storedPhase?.toUpperCase()} based on dates`}>
                              ⟳
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="obl-card-body">
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">SANCTIONED</span>
                        <span className="obl-card-val">{fmt(sanc)}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">DRAWN</span>
                        <span className="obl-card-val crit">{fmt(drawn)}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">OUTSTANDING</span>
                        <span className="obl-card-val crit">
                          <ScrambleText text={fmt(bal.outstanding || drawn)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">INTEREST RATE</span>
                        <span className="obl-card-val">{loan.interest_rate}% p.a.</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">EMI AMOUNT</span>
                        <span className="obl-card-val" style={{ color: 'var(--ba-gold)' }}>{loan.emi ? fmt(loan.emi) : '—'}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">MONTHLY INTEREST</span>
                        <span className="obl-card-val" style={{ color: 'var(--ba-gold)' }}>
                          <ScrambleText text={fmt(bal.nextInterestDue || 0)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">PRINCIPAL PAID</span>
                        <span className="obl-card-val ok">
                          <ScrambleText text={fmt(bal.principalPaid || 0)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">INTEREST PAID</span>
                        <span className="obl-card-val" style={{ color: 'var(--ba-gold)' }}>
                          <ScrambleText text={fmt(bal.interestPaid || 0)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">{phase === 'moratorium' ? 'MORATORIUM ENDS' : 'NEXT DUE'}</span>
                        <span className="obl-card-val">{bal.nextDueDate || '—'}</span>
                      </div>
                    </div>

                    {/* Drawn progress bar */}
                    <div className="obl-progress-wrap">
                      <div className="obl-progress-label">
                        <span>DRAWDOWN UTILISATION</span>
                        <span>{drawnPct}% OF SANCTIONED</span>
                      </div>
                      <div className="obl-progress-track">
                        <div className="obl-progress-fill loan" style={{ width: `${drawnPct}%` }} />
                      </div>
                    </div>

                    {/* Payment sources */}
                    {loan.payment_sources?.length > 0 && (
                      <div style={{ padding: '0 16px 12px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                        <div style={{ color: 'var(--ba-gold-mute)', letterSpacing: '1px', marginBottom: '6px' }}>PAYMENT SOURCES</div>
                        {loan.payment_sources.map((src, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--text-d)' }}>
                            <span>{src.name} · {src.frequency?.toUpperCase()}</span>
                            <span style={{ color: 'var(--border-hi)' }}>{fmt(src.amount_per_cycle)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="obl-card-actions">
                      <button className="obl-action-btn"
                        onClick={() => handleEditLoan(loan)}>
                        EDIT STATE
                      </button>
                      <button className="obl-action-btn primary"
                        onClick={() => toggleLoanExpand(loan)}>
                        {isExpanded ? 'HIDE DETAILS' : 'VIEW DETAILS'}
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => openRateForm(loan)}
                        disabled={!dbMetadata}
                      >
                        UPDATE RATE
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => openLoanLog(loan, 'drawdown')}
                        disabled={!dbTransactions || !dbMetadata}
                      >
                        LOG DRAWDOWN
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => openLoanLog(loan, 'payment')}
                        disabled={!dbTransactions || !dbMetadata}
                      >
                        LOG PAYMENT
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => handleDeleteLoan(loan)}
                        disabled={saving || !dbMetadata}
                      >
                        DISCHARGE INDENTURE
                      </button>
                    </div>

                    {rateTarget === loan._id && (
                      <div className="obl-reveal" style={{ padding: '0 16px 14px', borderTop: '1px solid var(--ba-border-lo)' }}>
                        <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                          UPDATE INTEREST RATE
                        </div>
                        <div className="obl-form-grid" style={{ marginBottom: '10px' }}>
                          <Input
                            label="NEW RATE (% P.A.)"
                            type="number"
                            step="0.05"
                            value={rateForm.rate}
                            onChange={v => setRateForm(f => ({ ...f, rate: v }))}
                            placeholder={String(loan.interest_rate ?? '')}
                          />
                          <Input
                            label="EFFECTIVE FROM"
                            type="date"
                            value={rateForm.date}
                            onChange={v => setRateForm(f => ({ ...f, date: v }))}
                          />
                          <div style={{ alignSelf: 'end', fontSize: '9px', color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)', letterSpacing: '1px', paddingBottom: '8px' }}>
                            INTEREST BEFORE THIS DATE KEEPS THE OLD RATE
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="mech-btn"
                            onClick={() => handleRateSubmit(loan)}
                            disabled={saving || rateForm.rate === '' || !rateForm.date}
                            style={{ marginTop: 0, flex: 1 }}
                          >
                            {saving ? 'UPDATING...' : 'AUTHORIZE RATE CHANGE'}
                          </button>
                          <button
                            className="obl-action-btn"
                            onClick={() => setRateTarget(null)}
                            style={{ flex: '0 0 120px' }}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {loanLogTarget?.loanId === loan._id && (
                      <div className="obl-reveal" style={{ padding: '0 16px 14px', borderTop: '1px solid var(--ba-border-lo)' }}>
                        <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                          {loanLogTarget.type === 'drawdown' ? 'LOG LOAN DRAWDOWN' : 'LOG LOAN PAYMENT'}
                        </div>
                        <div className="obl-form-grid" style={{ marginBottom: '10px' }}>
                          <Input
                            label="AMOUNT"
                            type="number"
                            value={loanLogForm.amount}
                            onChange={v => setLoanLogForm(f => ({ ...f, amount: v }))}
                            placeholder={loanLogTarget.type === 'payment' && loan.emi ? String(loan.emi) : '0'}
                          />
                          <Input
                            label="DATE"
                            type="date"
                            value={loanLogForm.date}
                            onChange={v => setLoanLogForm(f => ({ ...f, date: v }))}
                          />
                          {loanLogTarget.type === 'payment' ? (
                            <>
                              <Input
                                label="PAID BY"
                                value={loanLogForm.paidBy}
                                onChange={v => setLoanLogForm(f => ({ ...f, paidBy: v }))}
                                placeholder={userId || 'SELF'}
                              />
                              {loanLogForm.paidBy === userId && (
                                <Select
                                  label="SOURCE ACCOUNT"
                                  value={loanLogForm.account}
                                  onChange={v => setLoanLogForm(f => ({ ...f, account: v }))}
                                  options={[
                                    { value: '', label: '-- LOAN DEFAULT --' },
                                    ...accounts.map(a => ({
                                      value: a._id?.split(':').pop() || a.name,
                                      label: a.name
                                    }))
                                  ]}
                                />
                              )}
                            </>
                          ) : (
                            <Input
                              label="DESCRIPTION"
                              value={loanLogForm.description}
                              onChange={v => setLoanLogForm(f => ({ ...f, description: v }))}
                              placeholder={`${loan.name} Drawdown`}
                            />
                          )}
                        </div>
                        {loanLogTarget.type === 'drawdown' && (
                          <label style={{
                            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                            fontSize: '10px', fontFamily: 'var(--mono)', letterSpacing: '1px',
                            color: 'var(--ba-gold-mute)', cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={loanLogForm.alreadyDeclared}
                              onChange={e => setLoanLogForm(f => ({ ...f, alreadyDeclared: e.target.checked }))}
                            />
                            ALREADY COUNTED IN DECLARED DRAWN TOTAL (BACKFILLING HISTORY)
                          </label>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="mech-btn"
                            onClick={() => handleLoanLogSubmit(loan)}
                            disabled={saving || !loanLogForm.amount || !loanLogForm.date}
                            style={{ marginTop: 0, flex: 1 }}
                          >
                            {saving ? 'LOGGING...' : 'AUTHORIZE LOG'}
                          </button>
                          <button
                            className="obl-action-btn"
                            onClick={() => { setLoanLogTarget(null); setLoanLogForm(blankLoanLog()); }}
                            style={{ flex: '0 0 120px' }}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expanded details — projection, simulator, FY interest, rate & entry history */}
                    {isExpanded && (() => {
                      const outstanding = bal.outstanding ?? drawn;
                      const simPrepay   = Number(simForm.prepay) || 0;
                      const simExtra    = Number(simForm.extra)  || 0;
                      const simActive   = simPrepay > 0 || simExtra > 0;
                      const baseline    = ObligationsEngine.getLoanProjection(loan, outstanding);
                      const proj        = simActive
                        ? ObligationsEngine.getLoanProjection(loan, outstanding, { prepayNow: simPrepay, extraMonthly: simExtra })
                        : baseline;
                      const monthsSaved = simActive && !proj.unpayable
                        ? Math.max(0, baseline.schedule.length - proj.schedule.length)
                        : 0;
                      const interestAvoided = simActive
                        ? Math.max(0, (baseline.totalRemInterest || 0) - (proj.totalRemInterest || 0))
                        : 0;
                      const fyEntries   = Object.entries(bal.interestPaidByFY || {})
                        .sort((a, b) => b[0].localeCompare(a[0]));
                      const rateHistory = [...(loan.rate_history || [])]
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                      const loanTxns    = loanTxnsMap[loan._id];

                      return (
                        <div className="obl-reveal" style={{ padding: '0 16px 14px', borderTop: '1px solid var(--ba-border-lo)' }}>

                          {/* ── Repayment projection + simulator ── */}
                          <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                            <span>REPAYMENT PROJECTION{simActive ? ' · SIMULATED' : ''}</span>
                            <span>
                              {proj.indeterminate ? 'NO MORATORIUM END DATE'
                              : proj.needsEmi     ? 'NO EMI OR TENURE DECLARED'
                              : proj.unpayable    ? 'EMI BELOW MONTHLY INTEREST'
                              : proj.payoffDate   ? `PAYOFF: ${proj.payoffDate}` : ''}
                            </span>
                          </div>

                          {proj.indeterminate && (
                            <div style={{ color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px', marginBottom: '10px' }}>
                              SET A MORATORIUM END DATE TO PROJECT THE REPAYMENT PATH
                            </div>
                          )}
                          {proj.needsEmi && (
                            <div style={{ color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px', marginBottom: '10px' }}>
                              DECLARE AN EMI AMOUNT OR TENURE TO PROJECT REPAYMENT
                            </div>
                          )}
                          {proj.unpayable && (
                            <div style={{ color: 'var(--ba-crimson)', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px', marginBottom: '10px' }}>
                              MINIMUM EMI TO REDUCE BALANCE: {fmt(proj.minimumEmi || 0)}
                            </div>
                          )}

                          {!proj.indeterminate && !proj.needsEmi && (
                            <div className="obl-form-grid" style={{ marginBottom: '10px' }}>
                              <Input label="SIMULATE: PREPAY NOW" type="number" value={simForm.prepay}
                                onChange={v => setSimForm(f => ({ ...f, prepay: v }))} placeholder="100000" />
                              <Input label="SIMULATE: EXTRA PER EMI" type="number" value={simForm.extra}
                                onChange={v => setSimForm(f => ({ ...f, extra: v }))} placeholder="5000" />
                              <div style={{ alignSelf: 'end', fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', paddingBottom: '8px', color: simActive ? 'var(--border-hi)' : 'var(--ba-gold-mute)' }}>
                                {simActive
                                  ? `${monthsSaved} MO SAVED · ${fmt(interestAvoided)} INTEREST AVOIDED`
                                  : 'ENTER AMOUNTS TO SIMULATE PREPAYMENT'}
                              </div>
                            </div>
                          )}

                          {proj.moratoriumMonths > 0 && (
                            <div style={{ color: 'var(--ba-gold)', fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', marginBottom: '8px' }}>
                              MORATORIUM: {proj.moratoriumMonths} MONTHS REMAINING · BALANCE AT REPAYMENT START: {fmt(proj.balanceAtRepaymentStart)}
                              {proj.projectedEmi && !loan.emi ? ` · PROJECTED EMI: ${fmt(proj.projectedEmi)}` : ''}
                            </div>
                          )}

                          {proj.schedule.length > 0 && (
                            <div style={{ maxHeight: '180px', overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '4px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: 'var(--ba-gold-dim)' }}>
                                    {['MONTH','EMI','PRINCIPAL','INTEREST','BALANCE'].map(h => (
                                      <th key={h} style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="obl-proj-tbody">
                                  {proj.schedule.slice(0, 24).map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--ba-border-lo)', opacity: row.phase === 'moratorium' ? 0.65 : 1 }}>
                                      <td style={{ padding: '3px 6px', color: 'var(--ba-gold-mute)' }}>
                                        {row.month}{row.phase === 'moratorium' ? ' ◦' : ''}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '3px 6px', color: 'var(--text-m)' }}>{row.phase === 'moratorium' ? '—' : fmt(row.emi)}</td>
                                      <td style={{ textAlign: 'right', padding: '3px 6px', color: 'var(--border-hi)' }}>{fmt(row.principal)}</td>
                                      <td style={{ textAlign: 'right', padding: '3px 6px', color: 'var(--ba-crimson)' }}>{fmt(row.interest)}</td>
                                      <td style={{ textAlign: 'right', padding: '3px 6px', color: '#fff', fontWeight: 'bold' }}>{fmt(row.balance)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {proj.schedule.length > 24 && (
                                <div style={{ textAlign: 'center', color: 'var(--ba-gold-mute)', padding: '6px', letterSpacing: '1px' }}>
                                  + {proj.schedule.length - 24} MORE MONTHS · TOTAL INTEREST: {fmt(proj.totalRemInterest)}
                                </div>
                              )}
                              {proj.moratoriumMonths > 0 && (
                                <div style={{ color: 'var(--ba-gold-mute)', padding: '4px 6px', letterSpacing: '1px' }}>
                                  ◦ MORATORIUM MONTH — INTEREST CAPITALIZES
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Interest paid per financial year (Sec 80E) ── */}
                          {fyEntries.length > 0 && (
                            <>
                              <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                                <span>INTEREST PAID BY FINANCIAL YEAR</span>
                                {loan.loan_type === 'education' && <span>SEC 80E DEDUCTIBLE</span>}
                              </div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginBottom: '4px' }}>
                                {fyEntries.map(([fy, amt]) => (
                                  <div key={fy} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--ba-border-lo)' }}>
                                    <span style={{ color: 'var(--ba-gold-mute)' }}>FY {fy}</span>
                                    <span style={{ color: 'var(--ba-gold)', fontWeight: 'bold' }}>{fmt(amt)}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* ── Rate history ── */}
                          {rateHistory.length > 1 && (
                            <>
                              <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                                <span>RATE HISTORY</span>
                              </div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', marginBottom: '4px' }}>
                                {rateHistory.map((entry, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--ba-border-lo)' }}>
                                    <span style={{ color: 'var(--ba-gold-mute)' }}>{entry.date || '—'}</span>
                                    <span style={{ color: '#fff' }}>{entry.rate}% P.A.</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* ── Logged drawdowns & payments ── */}
                          <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                            <span>LEDGER ENTRIES</span>
                            <span>{loanTxns ? `${loanTxns.length} LOGGED` : 'LOADING...'}</span>
                          </div>
                          {loanTxns && loanTxns.length === 0 && (
                            <div style={{ color: 'var(--ba-gold-mute)', fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px' }}>
                              NO DRAWDOWNS OR PAYMENTS LOGGED
                            </div>
                          )}
                          {loanTxns && loanTxns.map(txn => (
                            <div key={txn._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', borderBottom: '1px solid var(--ba-border-lo)', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                              <span style={{ color: 'var(--ba-gold-mute)', minWidth: '74px' }}>{txn.date}</span>
                              <span style={{
                                minWidth: '46px', letterSpacing: '1px',
                                color: txn.category === 'Loan Drawdown' ? 'var(--ba-crimson)' : 'var(--border-hi)'
                              }}>
                                {txn.category === 'Loan Drawdown' ? 'DRAW' : 'PMT'}
                              </span>
                              <span style={{ flex: 1, color: 'var(--text-d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {txn.description}{txn.paid_by && txn.paid_by !== userId ? ` · BY ${txn.paid_by.toUpperCase()}` : ''}
                              </span>
                              <span style={{ color: '#fff', fontWeight: 'bold' }}>{fmt(Math.abs(txn.amount))}</span>
                              <button
                                className="action-btn del"
                                onClick={() => handleDeleteLoanTxn(loan, txn)}
                                disabled={saving}
                                title="Delete entry — balances recalculate"
                              >DEL</button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}

              {/* ── EMI PURCHASES section ── */}
              <div className="obl-section-hdr" style={{ marginTop: '20px' }}>
                <span>EMI PURCHASES</span>
                <button
                  className="obl-action-btn primary"
                  onClick={() => showEmiForm ? resetEmiForm() : setShowEmiForm(true)}
                >
                  {showEmiForm ? 'CANCEL' : '+ DECLARE EMI'}
                </button>
              </div>

              {showEmiForm && (
                <div className="obl-form-wrap obl-reveal" style={{ marginBottom: '14px' }}>
                  <div className="obl-section-hdr" style={{ marginBottom: '14px' }}>
                    {editingEmiId ? 'EDIT EMI PURCHASE' : 'DECLARE EMI PURCHASE'}
                  </div>
                  <div className="obl-form-grid">
                    <Input label="ITEM NAME" value={emiForm.name}
                      onChange={v => setEmiForm(f => ({ ...f, name: v }))} placeholder="iPhone 15 Pro" />
                    <Input label="TOTAL AMOUNT" type="number" value={emiForm.total_amount}
                      onChange={v => setEmiForm(f => ({ ...f, total_amount: v }))} placeholder="90000" />
                    <Input label="DOWN PAYMENT" type="number" value={emiForm.down_payment}
                      onChange={v => setEmiForm(f => ({ ...f, down_payment: v }))} placeholder="0" />
                  </div>
                  <div className="obl-form-grid">
                    <Input label="EMI AMOUNT" type="number" value={emiForm.emi_amount}
                      onChange={v => setEmiForm(f => ({ ...f, emi_amount: v }))} placeholder="7500" />
                    <Input label="TENURE (MONTHS)" type="number" value={emiForm.tenure_months}
                      onChange={v => setEmiForm(f => ({ ...f, tenure_months: v }))} placeholder="12" />
                    <Input label="INTEREST RATE (%)" type="number" step="0.1" value={emiForm.interest_rate}
                      onChange={v => setEmiForm(f => ({ ...f, interest_rate: v }))} placeholder="0" />
                  </div>
                  <div className="obl-form-grid">
                    <Select label="ACCOUNT" value={emiForm.account}
                      onChange={v => setEmiForm(f => ({ ...f, account: v }))}
                      options={[{ value: '', label: '-- SELECT --' }, ...accounts.map(a => ({ value: a.name, label: a.name }))]}
                    />
                    <Input label="PURCHASE DATE" type="date" value={emiForm.purchase_date}
                      onChange={v => setEmiForm(f => ({ ...f, purchase_date: v }))} />
                    <Input label="FIRST EMI DATE" type="date" value={emiForm.first_emi_date}
                      onChange={v => setEmiForm(f => ({ ...f, first_emi_date: v }))} />
                  </div>
                  <button className="mech-btn" onClick={handleSaveEMI} disabled={saving || !emiForm.name || !emiForm.emi_amount}>
                    {saving
                      ? (editingEmiId ? 'UPDATING...' : 'DECLARING...')
                      : (editingEmiId ? 'AUTHORIZE & UPDATE EMI' : 'AUTHORIZE & DECLARE EMI')}
                  </button>
                </div>
              )}

              {emis.length === 0 && !showEmiForm && (
                <div className="obl-empty" style={{ padding: '20px' }}>
                  NO EMI PURCHASES DECLARED
                </div>
              )}

              {emis.map(emi => {
                const bal = emi.balance || {};
                const pct = bal.percentComplete || 0;

                return (
                  <div key={emi._id} className={`obl-card${lastTouchedId === emi._id ? ' obl-highlight' : ''}`}>
                    <div className="obl-card-header">
                      <span className="obl-card-title">{emi.name}</span>
                      <span className="obl-card-badge active">BINDING</span>
                    </div>
                    <div className="obl-card-body">
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">TOTAL COST</span>
                        <span className="obl-card-val">{fmt(emi.total_amount)}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">MONTHLY EMI</span>
                        <span className="obl-card-val" style={{ color: 'var(--ba-gold)' }}>{fmt(emi.emi_amount)}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">OUTSTANDING</span>
                        <span className="obl-card-val crit">
                          <ScrambleText text={fmt(bal.outstanding || emi.financed_amount)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">PRINCIPAL PAID</span>
                        <span className="obl-card-val ok">
                          <ScrambleText text={fmt(bal.principalPaid || 0)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">INTEREST PAID</span>
                        <span className="obl-card-val" style={{ color: 'var(--ba-gold)' }}>
                          <ScrambleText text={fmt(bal.interestPaid || 0)} speed={60} step={0.2} />
                        </span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">REMAINING</span>
                        <span className="obl-card-val">{bal.monthsRemaining ?? emi.tenure_months} MONTHS</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">NEXT EMI</span>
                        <span className="obl-card-val">{bal.nextDueDate || '—'}</span>
                      </div>
                      <div className="obl-card-row">
                        <span className="obl-card-lbl">PAYOFF</span>
                        <span className="obl-card-val ok">{bal.payoffDate || '—'}</span>
                      </div>
                    </div>
                    <div className="obl-progress-wrap">
                      <div className="obl-progress-label">
                        <span>REPAYMENT PROGRESS</span>
                        <span>{pct}% COMPLETE · {bal.monthsPaid || 0}/{emi.tenure_months} EMIs</span>
                      </div>
                      <div className="obl-progress-track">
                        <div className="obl-progress-fill emi" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="obl-card-actions">
                      <button className="obl-action-btn" onClick={() => handleEditEMI(emi)}>
                        EDIT STATE
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => openEmiPay(emi)}
                        disabled={!dbTransactions || !dbMetadata}
                      >
                        LOG PAYMENT
                      </button>
                      <button
                        className="obl-action-btn"
                        onClick={() => handleDischargeEMI(emi)}
                        disabled={saving || !dbMetadata}
                      >
                        DISCHARGE INDENTURE
                      </button>
                    </div>

                    {emiPayTarget === emi._id && (
                      <div className="obl-reveal" style={{ padding: '0 16px 14px', borderTop: '1px solid var(--ba-border-lo)' }}>
                        <div className="obl-section-hdr" style={{ margin: '12px 0 8px' }}>
                          LOG EMI PAYMENT
                        </div>
                        <div className="obl-form-grid wide" style={{ marginBottom: '10px' }}>
                          <Input
                            label="AMOUNT"
                            type="number"
                            value={emiPayForm.amount}
                            onChange={v => setEmiPayForm(f => ({ ...f, amount: v }))}
                            placeholder={String(emi.emi_amount || 0)}
                          />
                          <Input
                            label="DATE"
                            type="date"
                            value={emiPayForm.date}
                            onChange={v => setEmiPayForm(f => ({ ...f, date: v }))}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="mech-btn"
                            onClick={() => handleEmiPaySubmit(emi)}
                            disabled={saving || !emiPayForm.amount || !emiPayForm.date}
                            style={{ marginTop: 0, flex: 1 }}
                          >
                            {saving ? 'LOGGING...' : 'AUTHORIZE LOG'}
                          </button>
                          <button
                            className="obl-action-btn"
                            onClick={() => setEmiPayTarget(null)}
                            style={{ flex: '0 0 120px' }}
                          >
                            CANCEL
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>{/* end obl-scroll */}
          </div>
        )}

      </div>
    </>
  );
};

export default ObligationsSlide;
