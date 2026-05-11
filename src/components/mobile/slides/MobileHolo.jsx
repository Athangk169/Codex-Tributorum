// src/components/slides/MobileHolo.jsx
import React, { useState, useEffect, useCallback } from 'react';
import ScrambleText from '../../shared/ScrambleText';

// ── Fallback lore ──
const defaultLoreSnippets = [
  "THOUGHT FOR THE DAY: INNOCENCE PROVES NOTHING.",
  "THE EMPEROR PROTECTS. THE MUNITORUM COLLECTS.",
  "BLOOD IS THE COIN OF THE IMPERIUM. PAY YOUR DEBTS.",
  "THE ENEMY DOES NOT WAIT FOR YOUR LEDGER TO BALANCE.",
  "FEAR IS THE MIND-KILLER. DOUBT IS THE SOUL-KILLER.",
  "A WARRIOR WITHOUT DISCIPLINE IS MERELY A BEAST WITH A BOLTER.",
  "SANGUINIUS CHOSE DEATH OVER CORRUPTION. CHOOSE WISELY.",
  "THE GREAT ANGEL BLED FOR TERRA. YOUR SACRIFICE IS A ROUNDING ERROR.",
  "WE ARE THE RED ANGELS. WE DO NOT BREAK. WE BLEED AND ENDURE.",
  "THE SONS OF BAAL DO NOT MOURN WHAT IS LOST. THEY AVENGE IT.",
  "PERFECTION IS NOT ACHIEVED. IT IS BLED FOR, DAILY.",
  "SUFFERING IS THE CRUCIBLE. GLORY IS WHAT SURVIVES IT."
];

// ── Keyword Tag ──
const KeywordTag = ({ kw, onDelete }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        background: pressed ? 'rgba(204,34,0,0.12)' : 'rgba(26,93,44,0.12)',
        border: `1px solid ${pressed ? 'rgba(204,34,0,0.5)' : 'var(--border)'}`,
        padding: '5px 9px', gap: '6px', fontSize: '11px',
        transition: 'all 0.2s',
      }}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
    >
      <span style={{ color: pressed ? 'var(--ba-crimson)' : 'var(--text-m)', transition: 'color 0.2s' }}>{kw}</span>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'none', border: 'none',
            color: 'var(--ba-crimson)', cursor: 'pointer',
            fontSize: '12px', padding: '0 2px', lineHeight: 1,
          }}
        >✕</button>
      )}
    </div>
  );
};

// ── Status Bar (replaces lore ticker on mobile) ──
const StatusBar = ({ statusMsg, rulesCount, loreText }) => (
  <div style={{
    padding: '10px 16px',
    borderTop: '1px solid var(--ba-border-lo)',
    fontSize: '10px', letterSpacing: '1px',
    color: statusMsg?.error ? 'var(--ba-crimson)' : 'var(--border-hi)',
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'rgba(0,0,0,0.6)', flexShrink: 0,
    transition: 'color 0.3s', minHeight: '40px',
  }}>
    <span style={{
      display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
      background: statusMsg?.error ? 'var(--ba-crimson)' : 'var(--border-hi)',
      boxShadow: statusMsg?.error ? '0 0 6px var(--ba-crimson)' : '0 0 6px var(--border-hi)',
      flexShrink: 0,
      animation: statusMsg?.text ? 'blinker 0.6s step-start 3' : 'none',
    }} />
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
      {statusMsg?.text
        ? statusMsg.text
        : loreText
          ? <ScrambleText text={loreText} key={loreText} />
          : <>// SYSTEM READY :: <ScrambleText text={rulesCount} /> RULES INDEXED</>
      }
    </span>
  </div>
);

const TABS = ['INDEX', 'TARGET', 'MATRIX'];

const MobileHolo = ({ loreSnippets = defaultLoreSnippets, data, db, userId }) => {
  // ── Data State ──
  const [rules, setRules] = useState([]);
  const [categoryConfig, setCategoryConfig] = useState({ positive_categories: [], neutral_categories: [], expense_categories: [] });
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [editingRule, setEditingRule] = useState(null);
  const [editName, setEditName] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  // ── Holo & UI State ──
  const [activeHolo, setActiveHolo] = useState('baal');
  const [isHoloExpanded, setIsHoloExpanded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeTab, setActiveTab] = useState('INDEX');
  const [loreIndex, setLoreIndex] = useState(0);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddKeyword, setShowAddKeyword] = useState(false);

  // ── Lore Rotation ──
  useEffect(() => {
    const interval = setInterval(() => {
      setLoreIndex((prev) => (prev + 1) % loreSnippets.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [loreSnippets.length]);

  // ── DB Load ──
  const loadRules = useCallback(async () => {
    if (!db || !userId) return;
    try {
      const allDocs = await db.allDocs({ include_docs: true });
      const uniqueRules = {};
      allDocs.rows
        .map(row => row.doc)
        .filter(d => d.type === 'category_rule' && d.user_id === userId)
        .forEach(rule => { uniqueRules[rule.category_name] = rule; });

      const r = Object.values(uniqueRules).sort((a, b) =>
        a.category_name.localeCompare(b.category_name)
      );
      setRules(r);

      let config;
      try { config = await db.get(`config_category_types_${userId}`); }
      catch {
        try { config = await db.get('config_category_types'); }
        catch { config = { _id: 'config_category_types', positive_categories: [], neutral_categories: [], expense_categories: [] }; }
      }
      setCategoryConfig(config);
      setSelectedRuleId(prev => (!prev && r.length > 0 ? r[0]._id : prev));
    } catch (err) {
      flash('// DB READ FAILURE', true);
      console.error(err);
    }
  }, [db, userId]);

  useEffect(() => { loadRules(); }, [loadRules, userId]);

  const flash = (text, error = false) => {
    setStatusMsg({ text, error });
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const getCatType = (name) => {
    if (categoryConfig.positive_categories?.includes(name)) return 'income';
    if (categoryConfig.neutral_categories?.includes(name)) return 'neutral';
    return 'expense';
  };

  // ── Handlers (mirrored from desktop) ──
  const handleUpdateType = async (categoryName, newType) => {
    try {
      const confId = `config_category_types_${userId}`;
      let conf;
      try { conf = await db.get(confId); }
      catch { conf = { _id: confId, type: 'system_config', user_id: userId, positive_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.positive_categories = (conf.positive_categories || []).filter(c => c !== categoryName);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== categoryName);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== categoryName);

      if (newType === 'income') conf.positive_categories.push(categoryName);
      else if (newType === 'neutral') conf.neutral_categories.push(categoryName);
      else conf.expense_categories.push(categoryName);

      await db.put(conf);
      flash(`// TYPE RECALIBRATED >> ${newType.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim() || !selectedRuleId) return;
    const rule = rules.find(r => r._id === selectedRuleId);
    if (!rule) return;
    const kw = newKeyword.trim().toLowerCase();
    if (rule.keywords.includes(kw)) { flash('// KEYWORD ALREADY EXISTS', true); return; }
    try {
      await db.put({ ...rule, keywords: [...rule.keywords, kw] });
      setNewKeyword('');
      setShowAddKeyword(false);
      flash(`// KEYWORD UPLINKED >> ${kw.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleDeleteKeyword = async (ruleId, kw) => {
    const rule = rules.find(r => r._id === ruleId);
    if (!rule) return;
    try {
      await db.put({ ...rule, keywords: rule.keywords.filter(k => k !== kw) });
      flash(`// KEYWORD PURGED >> ${kw.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !userId) return;
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const id = `rule_${slug}`;
    if (rules.find(r => r._id === id || r.category_name.toLowerCase() === name.toLowerCase())) {
      flash('// CATEGORY ALREADY EXISTS', true); return;
    }
    try {
      await db.put({ _id: id, type: 'category_rule', user_id: userId, category_name: name, keywords: [], is_active: true });

      const confId = `config_category_types_${userId}`;
      let conf;
      try { conf = await db.get(confId); }
      catch { conf = { _id: confId, type: 'system_config', user_id: userId, positive_categories: [], neutral_categories: [], expense_categories: [] }; }

      if (newCategoryType === 'income') conf.positive_categories.push(name);
      else if (newCategoryType === 'neutral') conf.neutral_categories.push(name);
      else conf.expense_categories.push(name);

      await db.put(conf);
      setNewCategoryName('');
      setNewCategoryType('expense');
      setShowAddCategory(false);
      flash(`// CATEGORY INITIALIZED >> ${name.toUpperCase()}`);
      setSelectedRuleId(id);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleDeleteCategory = async (rule, e) => {
    e.stopPropagation();
    try {
      await db.remove(rule);
      const confId = `config_category_types_${userId}`;
      let conf;
      try { conf = await db.get(confId); }
      catch { conf = { _id: confId, positive_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.positive_categories = (conf.positive_categories || []).filter(c => c !== rule.category_name);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== rule.category_name);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== rule.category_name);

      await db.put(conf);
      if (selectedRuleId === rule._id) setSelectedRuleId('');
      flash(`// CATEGORY EXPUNGED >> ${rule.category_name.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleRenameSubmit = async (e) => {
    e?.stopPropagation?.();
    const newName = editName.trim();
    if (!newName || !editingRule) return;
    const rule = rules.find(r => r._id === editingRule._id);
    if (!rule) return;
    const oldName = rule.category_name;
    try {
      await db.put({ ...rule, category_name: newName });
      const confId = `config_category_types_${userId}`;
      let conf;
      try { conf = await db.get(confId); }
      catch { conf = { _id: confId, type: 'system_config', user_id: userId, positive_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.positive_categories = (conf.positive_categories || []).map(c => c === oldName ? newName : c);
      conf.neutral_categories = (conf.neutral_categories || []).map(c => c === oldName ? newName : c);
      conf.expense_categories = (conf.expense_categories || []).map(c => c === oldName ? newName : c);

      await db.put(conf);
      flash(`// CATEGORY RENAMED >> ${newName.toUpperCase()}`);
      setEditingRule(null);
      setEditName('');
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  // ── Holo Expand (with cogitator delay matching desktop) ──
  const handleExpandToggle = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setIsHoloExpanded(prev => !prev);
      setIsTransitioning(false);
    }, 500);
  };

  // ── Derived ──
  const selectedRule = rules.find(r => r._id === selectedRuleId);
  const incomes  = rules.filter(r => getCatType(r.category_name) === 'income');
  const neutrals = rules.filter(r => getCatType(r.category_name) === 'neutral');
  const expenses = rules.filter(r => getCatType(r.category_name) === 'expense');

  return (
    <div
      className="mobile-slide-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--mono)', color: 'var(--text-m)', position: 'relative', overflow: 'hidden' }}
    >

      {/* ── Slide-Specific Animations ── */}
      <style>{`
        @keyframes targetLockPulse {
          0%   { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 12px rgba(204,34,0,0.3); background: rgba(204,34,0,0.1); }
          50%  { box-shadow: inset 0 0 0 1px var(--ba-gold), inset 0 0 20px rgba(201,168,76,0.25); background: rgba(201,168,76,0.1); }
          100% { box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 12px rgba(204,34,0,0.3); background: rgba(204,34,0,0.1); }
        }
        .mob-target-locked {
          animation: targetLockPulse 1.5s ease-in-out infinite !important;
          border-color: transparent !important;
        }
        .mob-target-locked::before {
          content: ''; position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px;
          border-top: 1px solid var(--ba-crimson); border-left: 1px solid var(--ba-crimson);
          pointer-events: none;
        }
        .mob-target-locked::after {
          content: ''; position: absolute; bottom: 4px; right: 4px;
          width: 6px; height: 6px;
          border-bottom: 1px solid var(--ba-crimson); border-right: 1px solid var(--ba-crimson);
          pointer-events: none;
        }
        .mob-manifest-row {
          transition: background 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .mob-manifest-row:active:not(.mob-target-locked) {
          background: rgba(200,34,0,0.08) !important;
          box-shadow: inset 0 0 15px rgba(200,34,0,0.15);
        }
        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .mob-assimilate-in {
          animation: dataAssimilate 0.35s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          opacity: 0;
        }
        @keyframes overridePulse {
          0%   { opacity: 0.7; background: rgba(204,34,0,0.2); }
          50%  { opacity: 1.0; background: rgba(204,34,0,0.6); box-shadow: 0 0 10px rgba(204,34,0,0.5); }
          100% { opacity: 0.7; background: rgba(204,34,0,0.2); }
        }
        .mob-btn-loading {
          animation: overridePulse 0.4s ease-in-out infinite !important;
          pointer-events: none;
          color: #fff !important;
          border-color: var(--ba-crimson) !important;
        }
        @keyframes blinker { 50% { opacity: 0; } }
      `}</style>

      {/* ── FULLSCREEN HOLOGRAM OVERLAY ── */}
      {isHoloExpanded && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
          {/* Overlay Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ba-crimson)', background: 'rgba(0,0,0,0.9)', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: 'var(--ba-crimson)', letterSpacing: '2px' }}>
              MULTI-SYSTEM ORBITAL RECON // MAXIMIZED UPLINK ACTIVE
            </span>
            <button
              className={`mech-btn ${isTransitioning ? 'mob-btn-loading' : ''}`}
              onClick={handleExpandToggle}
              style={{ margin: 0, padding: '6px 12px', fontSize: '9px', width: 'auto', background: 'rgba(204,34,0,0.15)', color: '#fff', borderColor: 'var(--ba-crimson)' }}
            >
              {isTransitioning ? '[ REVERTING... ]' : '[ COLLAPSE ]'}
            </button>
          </div>
          {/* Overlay Toggle */}
          <div style={{ display: 'flex', gap: '6px', padding: '10px 16px', background: 'rgba(0,0,0,0.9)', flexShrink: 0 }}>
            <button className="mech-btn" onClick={() => setActiveHolo('baal')} style={{ flex: 1, margin: 0, padding: '8px', fontSize: '10px', background: activeHolo === 'baal' ? 'rgba(204,34,0,0.15)' : 'transparent', color: activeHolo === 'baal' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'baal' ? 'var(--ba-crimson)' : 'var(--ba-border-lo)' }}>[ BAAL PRIME ]</button>
            <button className="mech-btn" onClick={() => setActiveHolo('terra')} style={{ flex: 1, margin: 0, padding: '8px', fontSize: '10px', background: activeHolo === 'terra' ? 'rgba(201,168,76,0.15)' : 'transparent', color: activeHolo === 'terra' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'terra' ? 'var(--ba-gold)' : 'var(--ba-border-lo)' }}>[ HOLY TERRA ]</button>
          </div>
          {/* Overlay Iframe */}
          <div style={{ flex: 1, position: 'relative' }}>
            <iframe title="Orbital Holo Survey" src={activeHolo === 'baal' ? 'Baal_holo.html' : 'Terra_holo.html'} style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }} />
            <div className="scanlines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }} />
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ba-border-lo)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.4)' }}>
        <span style={{ fontSize: '11px', color: '#fff', letterSpacing: '3px' }}>
          <ScrambleText text="HOLO-LITHIC ARCHIVE" />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--border-hi)', boxShadow: '0 0 6px var(--border-hi)', display: 'inline-block' }} />
          <span style={{ fontSize: '9px', color: 'var(--text-d)', letterSpacing: '1px' }}>UPLINK ACTIVE</span>
        </div>
      </div>

      {/* ── COMPACT HOLOGRAM PANEL ── */}
      <div className="panel mech-panel" style={{ margin: '12px 16px 0', padding: 0, flexShrink: 0 }}>
        {/* Panel Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--ba-border-lo)' }}>
          <span style={{ fontSize: '10px', letterSpacing: '1.5px', color: 'var(--ba-gold-mute)' }}>ORBITAL RECON</span>
          <button
            className={`mech-btn ${isTransitioning ? 'mob-btn-loading' : ''}`}
            onClick={handleExpandToggle}
            style={{ margin: 0, padding: '4px 10px', fontSize: '9px', width: 'auto' }}
          >
            {isTransitioning ? '[ OVERRIDE... ]' : '[ MAXIMIZE ]'}
          </button>
        </div>
        {/* Planet Toggle */}
        <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', borderBottom: '1px solid var(--ba-border-lo)' }}>
          <button className="mech-btn" onClick={() => setActiveHolo('baal')} style={{ flex: 1, margin: 0, padding: '6px', fontSize: '9px', background: activeHolo === 'baal' ? 'rgba(204,34,0,0.15)' : 'transparent', color: activeHolo === 'baal' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'baal' ? 'var(--ba-crimson)' : 'var(--ba-border-lo)' }}>[ BAAL PRIME ]</button>
          <button className="mech-btn" onClick={() => setActiveHolo('terra')} style={{ flex: 1, margin: 0, padding: '6px', fontSize: '9px', background: activeHolo === 'terra' ? 'rgba(201,168,76,0.15)' : 'transparent', color: activeHolo === 'terra' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'terra' ? 'var(--ba-gold)' : 'var(--ba-border-lo)' }}>[ HOLY TERRA ]</button>
        </div>
        {/* Hologram Iframe */}
        <div style={{ height: '140px', position: 'relative', background: '#000' }}>
          <iframe
            title="Orbital Holo Survey"
            src={activeHolo === 'baal' ? '/Baal_holo.html' : '/Terra_holo.html'}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
          />
          <div className="scanlines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }} />
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ display: 'flex', margin: '12px 16px 0', borderBottom: '1px solid var(--ba-border-lo)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab ? 'var(--ba-crimson)' : 'transparent'}`,
              color: activeTab === tab ? '#fff' : 'var(--text-d)',
              fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px',
              padding: '8px 4px', cursor: 'pointer', transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT (scrollable) ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', minHeight: 0 }}>

        {/* ── INDEX TAB ── */}
        {activeTab === 'INDEX' && (
          <div className="mob-assimilate-in" style={{ opacity: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-d)', letterSpacing: '2px' }}>CATEGORY INDEX</span>
              <span style={{ fontSize: '9px', color: 'var(--text-m)' }}><ScrambleText text={rules.length} /> TOTAL</span>
            </div>

            {rules.map((rule, index) => {
              const isSelected = selectedRuleId === rule._id;
              const type = getCatType(rule.category_name);
              const typeColor = type === 'income' ? 'var(--border-hi)' : type === 'neutral' ? 'var(--ba-gold)' : 'var(--ba-crimson)';
              return (
                <div
                  key={rule._id}
                  className={`mob-manifest-row ${isSelected ? 'mob-target-locked' : ''}`}
                  onClick={() => { setSelectedRuleId(rule._id); setActiveTab('TARGET'); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 10px', marginBottom: '6px',
                    border: '1px solid var(--border)',
                    cursor: 'pointer', minHeight: '48px',
                    animationDelay: `${Math.min(index * 0.04, 0.3)}s`,
                  }}
                >
                  {editingRule?._id === rule._id ? (
                    <div style={{ display: 'flex', gap: '6px', flex: 1 }} onClick={e => e.stopPropagation()}>
                      <input
                        className="mech-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(e); if (e.key === 'Escape') setEditingRule(null); }}
                        autoFocus
                        style={{ marginTop: 0, flex: 1, fontSize: '12px' }}
                      />
                      <button className="action-btn" onClick={handleRenameSubmit} style={{ padding: '4px 10px' }}>✓</button>
                      <button className="action-btn" onClick={() => setEditingRule(null)} style={{ padding: '4px 10px' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ color: typeColor, fontSize: '8px' }}>■</span>
                        <span style={{ fontSize: '12px', color: isSelected ? '#fff' : 'var(--text-m)' }}>
                          {isSelected ? '▶ ' : ''}{rule.category_name.toUpperCase()}
                          <span style={{ color: 'var(--text-d)', fontSize: '10px', marginLeft: '8px', opacity: 0.6 }}>[{rule.keywords.length}]</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          className="action-btn"
                          onClick={e => { e.stopPropagation(); setEditingRule(rule); setEditName(rule.category_name); }}
                          style={{ padding: '6px 10px', fontSize: '9px' }}
                        >EDIT</button>
                        <button
                          className="action-btn del"
                          onClick={e => handleDeleteCategory(rule, e)}
                          style={{ padding: '6px 10px', fontSize: '9px' }}
                        >DEL</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => setShowAddCategory(true)}
              className="mech-btn"
              style={{ width: '100%', margin: '10px 0 0', padding: '12px', fontSize: '10px', letterSpacing: '2px' }}
            >
              + NEW CATEGORY
            </button>
          </div>
        )}

        {/* ── TARGET LOCK TAB ── */}
        {activeTab === 'TARGET' && (
          <div className="mob-assimilate-in" style={{ opacity: 0 }}>
            {!selectedRule ? (
              <div style={{ color: 'var(--text-d)', fontSize: '11px', textAlign: 'center', marginTop: '40px', letterSpacing: '1px' }}>
                // AWAITING TARGET SELECTION
              </div>
            ) : (
              <>
                {/* Category Header + Type Select */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px dashed rgba(204,34,0,0.3)' }}>
                  <span style={{ fontSize: '12px', color: '#fff', letterSpacing: '1px' }}>▶ {selectedRule.category_name.toUpperCase()}</span>
                  <select
                    className="mech-select"
                    value={getCatType(selectedRule.category_name)}
                    onChange={e => handleUpdateType(selectedRule.category_name, e.target.value)}
                    style={{ width: '110px', marginTop: 0, fontSize: '10px' }}
                  >
                    <option value="expense">EXPENSE</option>
                    <option value="income">INCOME</option>
                    <option value="neutral">NEUTRAL</option>
                  </select>
                </div>

                {/* Keywords */}
                <div style={{ fontSize: '9px', color: 'var(--ba-gold-mute)', letterSpacing: '2px', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '6px', marginBottom: '12px' }}>
                  ASSIGNED KEYWORDS [{selectedRule.keywords.length}]
                </div>

                {selectedRule.keywords.length === 0 ? (
                  <div style={{ color: 'var(--ba-gold-mute)', fontSize: '10px', marginBottom: '16px' }}>// NO KEYWORDS DETECTED</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    {selectedRule.keywords.map(kw => (
                      <KeywordTag key={kw} kw={kw} onDelete={() => handleDeleteKeyword(selectedRuleId, kw)} />
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowAddKeyword(true)}
                  className="mech-btn"
                  style={{ width: '100%', margin: 0, padding: '12px', fontSize: '10px', letterSpacing: '2px', background: 'rgba(26,93,44,0.2)', borderColor: 'var(--border-hi)', color: '#fff' }}
                >
                  + UPLINK KEYWORD
                </button>
              </>
            )}
          </div>
        )}

        {/* ── MATRIX TAB ── */}
        {activeTab === 'MATRIX' && (
          <div className="mob-assimilate-in" style={{ opacity: 0, display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {[
              { label: 'INCOME STREAMS',    color: 'var(--border-hi)',  items: incomes,  bg: 'rgba(74,222,128,0.05)', border: 'rgba(74,222,128,0.3)' },
              { label: 'NEUTRAL TRANSFERS', color: 'var(--ba-gold)',    items: neutrals, bg: 'rgba(201,168,76,0.05)', border: 'rgba(201,168,76,0.3)' },
              { label: 'EXPENSE OUTFLOWS',  color: 'var(--ba-crimson)', items: expenses, bg: 'rgba(204,34,0,0.05)',   border: 'rgba(204,34,0,0.3)' },
            ].map(({ label, color, items, bg, border }) => (
              <div key={label}>
                <div style={{ fontSize: '10px', color, borderBottom: `1px dashed ${color}`, paddingBottom: '4px', marginBottom: '10px', letterSpacing: '1px' }}>
                  {label} // <ScrambleText text={items.length} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {items.length === 0
                    ? <span style={{ color: 'var(--text-d)', fontSize: '10px' }}>// NONE</span>
                    : items.map(r => (
                        <span
                          key={r._id}
                          onClick={() => { setSelectedRuleId(r._id); setActiveTab('TARGET'); }}
                          style={{ fontSize: '10px', background: bg, padding: '5px 8px', border: `1px solid ${border}`, color, cursor: 'pointer' }}
                        >
                          {r.category_name}
                        </span>
                      ))
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── STATUS BAR (lore ticker + flash messages) ── */}
      <StatusBar
        statusMsg={statusMsg}
        rulesCount={rules.length}
        loreText={!statusMsg ? loreSnippets[loreIndex] : null}
      />

      {/* ── ADD CATEGORY BOTTOM SHEET ── */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, width: '100%',
          background: 'var(--bg, #02080c)', borderTop: '2px solid var(--ba-crimson)',
          padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
          zIndex: 50, transition: 'transform 0.3s ease-in-out',
          transform: showAddCategory ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        <div style={{ fontSize: '10px', color: '#fff', letterSpacing: '2px', marginBottom: '16px' }}>// NEW CATEGORY INITIALIZATION</div>
        <input
          className="mech-input"
          placeholder="CATEGORY DESIGNATION..."
          value={newCategoryName}
          onChange={e => setNewCategoryName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
          style={{ width: '100%', fontSize: '13px', marginBottom: '10px' }}
        />
        <select
          className="mech-select"
          value={newCategoryType}
          onChange={e => setNewCategoryType(e.target.value)}
          style={{ width: '100%', marginBottom: '14px', fontSize: '12px' }}
        >
          <option value="expense">EXPENSE</option>
          <option value="income">INCOME</option>
          <option value="neutral">NEUTRAL</option>
        </select>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="mech-btn" onClick={handleAddCategory} style={{ flex: 1, margin: 0, padding: '12px', fontSize: '11px' }}>INITIALIZE</button>
          <button className="mech-btn" onClick={() => setShowAddCategory(false)} style={{ flex: 1, margin: 0, padding: '12px', fontSize: '11px', color: 'var(--text-d)', borderColor: 'var(--ba-border-lo)' }}>ABORT</button>
        </div>
      </div>

      {/* ── ADD KEYWORD BOTTOM SHEET ── */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, width: '100%',
          background: 'var(--bg, #02080c)', borderTop: '2px solid var(--border-hi)',
          padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
          zIndex: 50, transition: 'transform 0.3s ease-in-out',
          transform: showAddKeyword ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        <div style={{ fontSize: '10px', color: '#fff', letterSpacing: '2px', marginBottom: '16px' }}>
          // UPLINK KEYWORD TO {selectedRule?.category_name?.toUpperCase()}
        </div>
        <input
          className="mech-input"
          placeholder="KEYWORD DESIGNATION..."
          value={newKeyword}
          onChange={e => setNewKeyword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddKeyword(); if (e.key === 'Escape') setShowAddKeyword(false); }}
          autoFocus={showAddKeyword}
          style={{ width: '100%', fontSize: '13px', marginBottom: '14px' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="mech-btn" onClick={handleAddKeyword} style={{ flex: 1, margin: 0, padding: '12px', fontSize: '11px', background: 'rgba(26,93,44,0.2)', borderColor: 'var(--border-hi)', color: '#fff' }}>UPLINK</button>
          <button className="mech-btn" onClick={() => setShowAddKeyword(false)} style={{ flex: 1, margin: 0, padding: '12px', fontSize: '11px', color: 'var(--text-d)', borderColor: 'var(--ba-border-lo)' }}>ABORT</button>
        </div>
      </div>

      {/* ── DIM OVERLAY for bottom sheets ── */}
      {(showAddCategory || showAddKeyword) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 40 }}
          onClick={() => { setShowAddCategory(false); setShowAddKeyword(false); }}
        />
      )}

    </div>
  );
};

export default MobileHolo;