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
        background: 'rgba(26, 93, 44, 0.12)',
        border: `1px solid ${pressed ? 'rgba(204,34,0,0.5)' : 'var(--border)'}`,
        padding: '6px 10px', gap: '8px', fontSize: '11px',
        transition: 'border-color 0.2s',
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
            color: pressed ? 'var(--ba-crimson)' : 'var(--border)',
            cursor: 'pointer', fontSize: '10px', padding: '4px',
            lineHeight: 1, transition: 'color 0.2s',
          }}
        >✕</button>
      )}
    </div>
  );
};

const MobileHolo = ({ data, db, userId }) => {
  const [rules, setRules] = useState([]);
  const [categoryConfig, setCategoryConfig] = useState({ income_categories: [], neutral_categories: [], expense_categories: [] });
  
  const [selectedRuleId, setSelectedRuleId] = useState('');
  
  // Sheet states
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddKeyword, setShowAddKeyword]   = useState(false);
  const [editingRule, setEditingRule]         = useState(null);

  // Form states
  const [newKeyword, setNewKeyword]           = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [editName, setEditName]               = useState('');
  
  const [statusMsg, setStatusMsg]             = useState(null);
  const [loreIdx, setLoreIdx]                 = useState(0);

  // ◈ V2 SCHEMA LOAD ◈
  const loadRules = useCallback(async () => {
    if (!db || !userId) return;

    try {
      const allDocs = await db.allDocs({ 
        include_docs: true,
        startkey: `finance:rule:${userId}:`,
        endkey:   `finance:rule:${userId}:\uffff`
      });

      const uniqueRules = {};
      allDocs.rows
        .map(row => row.doc)
        .filter(d => d.type === 'finance:rule' && d.user_id === userId && d.is_active)
        .forEach(rule => { uniqueRules[rule.category_name] = rule; });

      const r = Object.values(uniqueRules).sort((a, b) => a.category_name.localeCompare(b.category_name));
      setRules(r);

      let config;
      try {
        config = await db.get(`finance:config:categories:${userId}`);
      } catch {
        config = { _id: `finance:config:categories:${userId}`, type: 'finance:config', user_id: userId, income_categories: [], neutral_categories: [], expense_categories: [] };
      }
      setCategoryConfig(config);

      setSelectedRuleId(prev => (!prev && r.length > 0 ? r[0]._id : prev));
    } catch (err) {
      flash('// DB READ FAILURE', true);
    }
  }, [db, userId]);

  useEffect(() => { loadRules(); }, [loadRules, userId]);

  // Lore ticker
  useEffect(() => {
    const iv = setInterval(() => setLoreIdx(i => (i + 1) % defaultLoreSnippets.length), 8000);
    return () => clearInterval(iv);
  }, []);

  const flash = (text, error = false) => {
    setStatusMsg({ text, error });
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const getCatType = (name) => {
    if (categoryConfig.income_categories?.includes(name)) return 'income';
    if (categoryConfig.neutral_categories?.includes(name)) return 'neutral';
    return 'expense';
  };

  const handleUpdateType = async (categoryName, newType) => {
    try {
      const confId = `finance:config:categories:${userId}`;
      let conf;
      try { conf = await db.get(confId); } 
      catch { conf = { _id: confId, type: 'finance:config', user_id: userId, income_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.income_categories  = (conf.income_categories || []).filter(c => c !== categoryName);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== categoryName);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== categoryName);

      if (newType === 'income') conf.income_categories.push(categoryName);
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
      await db.put({ ...rule, keywords: [...rule.keywords, kw], updated: new Date().toISOString() });
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
      await db.put({ ...rule, keywords: rule.keywords.filter(k => k !== kw), updated: new Date().toISOString() });
      flash(`// KEYWORD PURGED >> ${kw.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !userId) return;

    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const id = `finance:rule:${userId}:${slug}`;

    if (rules.find(r => r._id === id || r.category_name.toLowerCase() === name.toLowerCase())) {
      flash('// CATEGORY ALREADY EXISTS', true);
      return;
    }

    try {
      await db.put({
        _id: id, type: 'finance:rule', user_id: userId,
        category_name: name, keywords: [], is_active: true,
        created: new Date().toISOString(), updated: new Date().toISOString()
      });

      const confId = `finance:config:categories:${userId}`;
      let conf;
      try { conf = await db.get(confId); } 
      catch { conf = { _id: confId, type: 'finance:config', user_id: userId, income_categories: [], neutral_categories: [], expense_categories: [] }; }

      if (newCategoryType === 'income') conf.income_categories.push(name);
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

      const confId = `finance:config:categories:${userId}`;
      let conf;
      try { conf = await db.get(confId); } 
      catch { conf = { _id: confId, type: 'finance:config', user_id: userId, income_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.income_categories  = (conf.income_categories || []).filter(c => c !== rule.category_name);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== rule.category_name);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== rule.category_name);

      await db.put(conf);

      if (selectedRuleId === rule._id) setSelectedRuleId('');
      flash(`// CATEGORY EXPUNGED >> ${rule.category_name.toUpperCase()}`);
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const handleRenameSubmit = async (e) => {
    e.stopPropagation();
    const newName = editName.trim();
    if (!newName || !editingRule) return;
    const rule = rules.find(r => r._id === editingRule._id);
    if (!rule) return;
    const oldName = rule.category_name;

    try {
      await db.put({ ...rule, category_name: newName, updated: new Date().toISOString() });

      const confId = `finance:config:categories:${userId}`;
      let conf;
      try { conf = await db.get(confId); } 
      catch { conf = { _id: confId, type: 'finance:config', user_id: userId, income_categories: [], neutral_categories: [], expense_categories: [] }; }

      conf.income_categories  = (conf.income_categories || []).map(c => c === oldName ? newName : c);
      conf.neutral_categories = (conf.neutral_categories || []).map(c => c === oldName ? newName : c);
      conf.expense_categories = (conf.expense_categories || []).map(c => c === oldName ? newName : c);

      await db.put(conf);

      flash(`// CATEGORY RENAMED >> ${newName.toUpperCase()}`);
      setEditingRule(null);
      setEditName('');
      loadRules();
    } catch { flash('// WRITE ERROR', true); }
  };

  const selectedRule = rules.find(r => r._id === selectedRuleId);

  return (
    <div className="mobile-slide-container active" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <style>{`
        .target-locked {
          background: rgba(204,34,0,0.1) !important;
          box-shadow: inset 0 0 0 1px var(--ba-crimson), inset 0 0 15px rgba(204,34,0,0.2) !important;
          border-color: transparent !important;
        }
        .manifest-row { transition: background 0.2s ease, box-shadow 0.2s ease; position: relative; border: 1px solid var(--border); margin-bottom: 8px; }
        .manifest-row:active { background: rgba(200,34,0,0.08); }

        .holo-sheet {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
          background: #060200; border-top: 1px solid var(--ba-crimson);
          box-shadow: 0 -10px 40px rgba(0,0,0,0.9); padding: 20px 16px 30px 16px;
          transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.1, 0.9, 0.2, 1);
        }
        .holo-sheet.open { transform: translateY(0); }
      `}</style>

      {/* ── TOP HEADER / STATUS ── */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--ba-border-lo)', background: 'linear-gradient(180deg, #0a0200 0%, #000 100%)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', color: 'var(--ba-gold-dim)', letterSpacing: '2px' }}>ORBITAL CLASSIFICATION</span>
          <span style={{ color: statusMsg?.error ? 'var(--ba-crimson)' : 'var(--border-hi)', fontSize: '10px' }}>
            {statusMsg ? (statusMsg.text) : (<><ScrambleText text={rules.length} /> FILES</>)}
          </span>
        </div>
        <div style={{ fontSize: '9px', color: '#4a2010', fontStyle: 'italic', letterSpacing: '1px' }}>
          <ScrambleText text={defaultLoreSnippets[loreIdx]} />
        </div>
      </div>

      {/* ── SCROLLABLE LIST OF CATEGORIES ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {rules.map((rule) => {
          const isSelected = selectedRuleId === rule._id;
          const type = getCatType(rule.category_name);
          const typeColor = type === 'income' ? 'var(--border-hi)' : type === 'neutral' ? 'var(--ba-gold)' : 'var(--ba-crimson)';

          return (
            <div key={rule._id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
              
              {/* Category Header Row */}
              <div 
                className={`manifest-row ${isSelected ? 'target-locked' : ''}`}
                onClick={() => setSelectedRuleId(isSelected ? '' : rule._id)} 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', margin: 0 }}
              >
                {editingRule?._id === rule._id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1 }} onClick={e => e.stopPropagation()}>
                    <input className="mech-input" value={editName} onChange={e => setEditName(e.target.value)} style={{ marginTop: 0, flex: 1 }} />
                    <button className="mob-action-btn edit-active" onClick={handleRenameSubmit}>✓</button>
                    <button className="mob-action-btn" onClick={() => setEditingRule(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                      <span style={{ color: typeColor, fontSize: '10px' }}>■</span>
                      <span style={{ fontSize: '13px', color: isSelected ? '#fff' : 'var(--text-m)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isSelected ? 'bold' : 'normal' }}>
                        {rule.category_name.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--text-d)', fontSize: '10px' }}>[{rule.keywords.length}]</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="mob-action-btn" onClick={(e) => { e.stopPropagation(); setEditingRule(rule); setEditName(rule.category_name); }}>EDIT</button>
                      <button className="mob-action-btn del" onClick={(e) => handleDeleteCategory(rule, e)}>DEL</button>
                    </div>
                  </>
                )}
              </div>

              {/* Expanded Details (Keywords & Type) */}
              {isSelected && !editingRule && (
                <div style={{ padding: '12px 14px', background: 'rgba(204,34,0,0.03)', border: '1px solid rgba(204,34,0,0.1)', borderTop: 'none', marginLeft: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-d)' }}>CLASS TYPE</span>
                    <select className="mech-select" value={type} onChange={(e) => handleUpdateType(rule.category_name, e.target.value)} style={{ width: '120px', margin: 0, padding: '6px' }}>
                      <option value="expense">EXPENSE</option>
                      <option value="income">INCOME</option>
                      <option value="neutral">NEUTRAL</option>
                    </select>
                  </div>

                  <div style={{ fontSize: '10px', color: 'var(--ba-gold-dim)', marginBottom: '10px' }}>UPLINKED KEYWORDS</div>
                  {rule.keywords.length === 0 ? (
                    <div style={{ color: 'var(--text-d)', fontSize: '11px', fontStyle: 'italic', marginBottom: '10px' }}>// NO KEYWORDS DETECTED</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                      {rule.keywords.map(kw => <KeywordTag key={kw} kw={kw} onDelete={() => handleDeleteKeyword(rule._id, kw)} />)}
                    </div>
                  )}

                  <button className="mech-btn" onClick={() => setShowAddKeyword(true)} style={{ width: '100%', margin: 0, padding: '10px', fontSize: '10px', borderColor: 'var(--border-hi)', color: 'var(--border-hi)' }}>
                    + ADD KEYWORD
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── FLOATING ACTION BUTTON ── */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--ba-border-lo)', background: '#0a0200', flexShrink: 0 }}>
        <button 
          className="mech-btn" 
          onClick={() => setShowAddCategory(true)}
          style={{ width: '100%', padding: '14px', fontSize: '12px', borderColor: 'var(--ba-crimson)', margin: 0 }}
        >
          [ AUTHORIZE NEW CATEGORY ]
        </button>
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM SHEETS
          ══════════════════════════════════════════ */}
      
      {/* ── Add Category Sheet ── */}
      <div className={`holo-sheet ${showAddCategory ? 'open' : ''}`}>
        <div style={{ fontSize: '11px', color: '#fff', letterSpacing: '2px', marginBottom: '16px' }}>
          // NEW CATEGORY DESIGNATION
        </div>
        <input
          className="mech-input"
          placeholder="TARGET NAME..."
          value={newCategoryName}
          onChange={e => setNewCategoryName(e.target.value)}
          style={{ width: '100%', fontSize: '14px', marginBottom: '12px' }}
        />
        <select className="mech-select" value={newCategoryType} onChange={e => setNewCategoryType(e.target.value)} style={{ width: '100%', fontSize: '13px', marginBottom: '20px' }}>
          <option value="expense">EXPENSE OUTFLOW</option>
          <option value="income">INCOME STREAM</option>
          <option value="neutral">NEUTRAL TRANSFER</option>
        </select>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="mech-btn" onClick={handleAddCategory} style={{ flex: 1, margin: 0, padding: '14px', background: 'rgba(204,34,0,0.2)' }}>AUTHORIZE</button>
          <button className="mech-btn" onClick={() => setShowAddCategory(false)} style={{ flex: 1, margin: 0, padding: '14px', color: 'var(--text-d)', borderColor: 'var(--ba-border-lo)' }}>ABORT</button>
        </div>
      </div>

      {/* ── Add Keyword Sheet ── */}
      <div className={`holo-sheet ${showAddKeyword ? 'open' : ''}`}>
        <div style={{ fontSize: '11px', color: '#fff', letterSpacing: '2px', marginBottom: '16px' }}>
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
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999 }}
          onClick={() => { setShowAddCategory(false); setShowAddKeyword(false); }}
        />
      )}

    </div>
  );
};

export default MobileHolo;