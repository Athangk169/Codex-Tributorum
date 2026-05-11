// src/components/slides/HoloSlide.jsx
import React, { useState, useEffect, useCallback } from 'react';

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

const KeywordTag = ({ kw, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(26, 93, 44, 0.12)',
        border: `1px solid ${hovered ? 'rgba(204,34,0,0.5)' : 'var(--border)'}`,
        padding: '3px 7px',
        gap: '5px',
        fontSize: '10px',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ color: hovered ? 'var(--ba-crimson)' : 'var(--text-m)', transition: 'color 0.2s' }}>{kw}</span>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'none',
            border: 'none',
            color: hovered ? 'var(--ba-crimson)' : 'var(--border)',
            cursor: 'pointer',
            fontSize: '9px',
            padding: 0,
            lineHeight: 1,
            transition: 'color 0.2s',
          }}
        >✕</button>
      )}
    </div>
  );
};

const StatusBar = ({ statusMsg, rulesCount }) => (
  <div style={{
    padding: '8px 15px',
    borderTop: '1px solid var(--ba-border-lo)',
    fontSize: '10px',
    letterSpacing: '1px',
    color: statusMsg?.error ? 'var(--ba-crimson)' : 'var(--border-hi)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(0,0,0,0.6)',
    transition: 'color 0.3s',
  }}>
    <span style={{
      display: 'inline-block',
      width: '6px', height: '6px',
      borderRadius: '50%',
      background: statusMsg?.error ? 'var(--ba-crimson)' : 'var(--border-hi)',
      boxShadow: statusMsg?.error ? '0 0 6px var(--ba-crimson)' : '0 0 6px var(--border-hi)',
      flexShrink: 0,
      animation: statusMsg?.text ? 'blinker 0.6s step-start 3' : 'none',
    }} />
    {statusMsg?.text || <>// SYSTEM READY :: <ScrambleText text={rulesCount} /> RULES INDEXED</>}
  </div>
);

const HoloSlide = ({ data, db, userId }) => {
  const [rules, setRules] = useState([]);
  const [categoryConfig, setCategoryConfig] = useState({ positive_categories: [], neutral_categories: [], expense_categories: [] });
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [editingRule, setEditingRule] = useState(null);
  const [editName, setEditName] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  
  // ── MULTI-SYSTEM FEED STATE ──
  const [activeHolo, setActiveHolo] = useState('baal');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // ◈ NEW: Tactical Loading State

  const loadRules = useCallback(async () => {
    if (!db || !userId) return;

    try {
      const allDocs = await db.allDocs({ include_docs: true });

      const uniqueRules = {};
      allDocs.rows
        .map(row => row.doc)
        .filter(d => d.type === 'category_rule' && d.user_id === userId)
        .forEach(rule => {
          uniqueRules[rule.category_name] = rule;
        });

      const r = Object.values(uniqueRules).sort((a, b) => 
        a.category_name.localeCompare(b.category_name)
      );
      setRules(r);

      let config;
      try {
        config = await db.get(`config_category_types_${userId}`);
      } catch {
        try {
          config = await db.get('config_category_types');
        } catch {
          config = { 
            _id: 'config_category_types', 
            positive_categories: [], 
            neutral_categories: [], 
            expense_categories: [] 
          };
        }
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

  const handleUpdateType = async (categoryName, newType) => {
    try {
      const confId = `config_category_types_${userId}`;
      let conf;
      try {
        conf = await db.get(confId);
      } catch {
        conf = {
          _id: confId,
          type: 'system_config',
          user_id: userId,
          positive_categories: [],
          neutral_categories: [],
          expense_categories: []
        };
      }

      conf.positive_categories = (conf.positive_categories || []).filter(c => c !== categoryName);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== categoryName);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== categoryName);

      if (newType === 'income') conf.positive_categories.push(categoryName);
      else if (newType === 'neutral') conf.neutral_categories.push(categoryName);
      else conf.expense_categories.push(categoryName);

      await db.put(conf);
      flash(`// TYPE RECALIBRATED >> ${newType.toUpperCase()}`);
      loadRules();
    } catch {
      flash('// WRITE ERROR', true);
    }
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
      flash('// CATEGORY ALREADY EXISTS', true);
      return;
    }

    try {
      await db.put({
        _id: id,
        type: 'category_rule',
        user_id: userId,
        category_name: name,
        keywords: [],
        is_active: true
      });

      const confId = `config_category_types_${userId}`;
      let conf;
      try {
        conf = await db.get(confId);
      } catch {
        conf = {
          _id: confId,
          type: 'system_config',
          user_id: userId,
          positive_categories: [],
          neutral_categories: [],
          expense_categories: []
        };
      }

      if (newCategoryType === 'income') conf.positive_categories.push(name);
      else if (newCategoryType === 'neutral') conf.neutral_categories.push(name);
      else conf.expense_categories.push(name);

      await db.put(conf);

      setNewCategoryName('');
      setNewCategoryType('expense');
      flash(`// CATEGORY INITIALIZED >> ${name.toUpperCase()}`);
      setSelectedRuleId(id);
      loadRules();
    } catch {
      flash('// WRITE ERROR', true);
    }
  };

  const handleDeleteCategory = async (rule, e) => {
    e.stopPropagation();
    try {
      await db.remove(rule);

      const confId = `config_category_types_${userId}`;
      let conf;
      try {
        conf = await db.get(confId);
      } catch {
        conf = { _id: confId, positive_categories: [], neutral_categories: [], expense_categories: [] };
      }

      conf.positive_categories = (conf.positive_categories || []).filter(c => c !== rule.category_name);
      conf.neutral_categories = (conf.neutral_categories || []).filter(c => c !== rule.category_name);
      conf.expense_categories = (conf.expense_categories || []).filter(c => c !== rule.category_name);

      await db.put(conf);

      if (selectedRuleId === rule._id) setSelectedRuleId('');
      flash(`// CATEGORY EXPUNGED >> ${rule.category_name.toUpperCase()}`);
      loadRules();
    } catch {
      flash('// WRITE ERROR', true);
    }
  };

  const handleRenameSubmit = async (e) => {
    e.stopPropagation();
    const newName = editName.trim();
    if (!newName || !editingRule) return;

    const rule = rules.find(r => r._id === editingRule._id);
    if (!rule) return;

    const oldName = rule.category_name;

    try {
      await db.put({ ...rule, category_name: newName });

      const confId = `config_category_types_${userId}`;
      let conf;
      try {
        conf = await db.get(confId);
      } catch {
        conf = {
          _id: confId,
          type: 'system_config',
          user_id: userId,
          positive_categories: [],
          neutral_categories: [],
          expense_categories: []
        };
      }

      conf.positive_categories = (conf.positive_categories || []).map(c => c === oldName ? newName : c);
      conf.neutral_categories = (conf.neutral_categories || []).map(c => c === oldName ? newName : c);
      conf.expense_categories = (conf.expense_categories || []).map(c => c === oldName ? newName : c);

      await db.put(conf);

      flash(`// CATEGORY RENAMED >> ${newName.toUpperCase()}`);
      setEditingRule(null);
      setEditName('');
      loadRules();
    } catch {
      flash('// WRITE ERROR', true);
    }
  };

  // ◈ NEW: TACTICAL EXPANSION LOGIC ◈
  const handleExpandToggle = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    
    // Simulate cogitator recalibration delay before snapping the UI
    setTimeout(() => {
      setIsExpanded(prev => !prev);
      setIsTransitioning(false);
    }, 600);
  };

  const selectedRule = rules.find(r => r._id === selectedRuleId);
  const incomes = rules.filter(r => getCatType(r.category_name) === 'income');
  const neutrals = rules.filter(r => getCatType(r.category_name) === 'neutral');
  const expenses = rules.filter(r => getCatType(r.category_name) === 'expense');

  const inlineBtn = {
    background: 'rgba(26,93,44,0.2)',
    border: '1px solid var(--border-hi)',
    color: '#fff',
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    padding: '8px 12px',
    cursor: 'pointer',
    letterSpacing: '1.5px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.2s',
  };

  const sectionLabel = {
    fontSize: '10px',
    color: 'var(--ba-gold-mute)',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--ba-border-lo)',
    paddingBottom: '6px',
    marginBottom: '10px',
  };

  return (
    <div className="slide-container active" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', height: '100%' }}>
      
      {/* ── Slide Specific Styles & Animations ── */}
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

        /* ◈ NEW: Button Loading Pulse ◈ */
        @keyframes overridePulse {
          0%   { opacity: 0.7; background: rgba(204, 34, 0, 0.2); box-shadow: inset 0 0 5px rgba(204, 34, 0, 0.1); }
          50%  { opacity: 1.0; background: rgba(204, 34, 0, 0.6); box-shadow: inset 0 0 15px rgba(204, 34, 0, 0.8), 0 0 10px rgba(204, 34, 0, 0.5); }
          100% { opacity: 0.7; background: rgba(204, 34, 0, 0.2); box-shadow: inset 0 0 5px rgba(204, 34, 0, 0.1); }
        }
        
        .btn-loading {
          animation: overridePulse 0.4s ease-in-out infinite !important;
          pointer-events: none;
          color: #fff !important;
          border-color: var(--ba-crimson) !important;
        }

        /* Tactical Hover & Assimilation */
        .manifest-row {
          transition: background 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .manifest-row:hover:not(.target-locked) {
          background: rgba(200, 34, 0, 0.08) !important;
          box-shadow: inset 0 0 15px rgba(200, 34, 0, 0.15);
        }
        .manifest-row:hover::before, .target-locked::before {
          content: ''; position: absolute; top: 4px; left: 4px;
          width: 6px; height: 6px; border-top: 1px solid var(--ba-crimson); border-left: 1px solid var(--ba-crimson); pointer-events: none;
        }
        .manifest-row:hover::after, .target-locked::after {
          content: ''; position: absolute; bottom: 4px; right: 4px;
          width: 6px; height: 6px; border-bottom: 1px solid var(--ba-crimson); border-right: 1px solid var(--ba-crimson); pointer-events: none;
        }

        @keyframes dataAssimilate {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .assimilate-in {
          animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          opacity: 0;
        }

        /* Active Field Illumination */
        .mech-input { border-left: 2px solid var(--border); }
        .mech-input:focus {
          border-left: 3px solid var(--ba-crimson) !important;
          border-color: var(--border-hi) !important;
        }
      `}</style>

      {/* ── BACKDROP FOR MAXIMIZED MODE ── */}
      {isExpanded && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
            zIndex: 9998
          }}
          onClick={() => { if (!isTransitioning) handleExpandToggle(); }}
        />
      )}

      {/* ── LEFT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: 0 }}>
        
        <div 
          className="panel mech-panel" 
          style={{ 
            padding: '15px', display: 'flex', flexDirection: 'column', 
            transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
            ...(isExpanded ? {
              // Maximized Override Styling
              position: 'fixed', top: '30px', left: '30px', right: '30px', bottom: '30px',
              zIndex: 9999, height: 'auto',
              boxShadow: '0 0 60px rgba(204, 34, 0, 0.5)',
              borderColor: 'var(--ba-crimson)'
            } : {
              // Standard Grid Styling
              height: '340px', flexShrink: 0 
            })
          }}
        >
          {/* Header & Maximize Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="sec-ttl" style={{ padding: '0', margin: 0, fontSize: '10px', color: isExpanded ? 'var(--ba-crimson)' : 'inherit', transition: 'color 0.3s' }}>
              MULTI-SYSTEM ORBITAL RECON {isExpanded ? '// MAXIMIZED UPLINK ACTIVE' : ''}
            </div>
            
            <button 
              className={`mech-btn ${isTransitioning ? 'btn-loading' : ''}`} 
              style={{ 
                margin: 0, padding: '4px 10px', fontSize: '9px', width: 'auto',
                background: isExpanded ? 'rgba(204, 34, 0, 0.15)' : 'transparent',
                color: isExpanded ? '#fff' : 'var(--text-d)',
                borderColor: isExpanded ? 'var(--ba-crimson)' : 'var(--ba-border-lo)',
                transition: 'all 0.2s'
              }} 
              onClick={handleExpandToggle}
            >
              {isTransitioning 
                ? (isExpanded ? '[ REVERTING... ]' : '[ OVERRIDING... ]') 
                : (isExpanded ? '[ COLLAPSE ]' : '[ MAXIMIZE ]')}
            </button>
          </div>
          
          {/* Orbital Feed Toggle */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexShrink: 0 }}>
            <button 
              className="mech-btn" 
              style={{ flex: 1, margin: 0, padding: '8px', fontSize: '10px', background: activeHolo === 'baal' ? 'rgba(204,34,0,0.15)' : 'rgba(2,8,4,0.7)', color: activeHolo === 'baal' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'baal' ? 'var(--ba-crimson)' : 'var(--ba-border-lo)' }} 
              onClick={() => setActiveHolo('baal')}
            >
              [ BAAL PRIME ]
            </button>
            <button 
              className="mech-btn" 
              style={{ flex: 1, margin: 0, padding: '8px', fontSize: '10px', background: activeHolo === 'terra' ? 'rgba(201,168,76,0.15)' : 'rgba(2,8,4,0.7)', color: activeHolo === 'terra' ? '#fff' : 'var(--ba-gold-mute)', borderColor: activeHolo === 'terra' ? 'var(--ba-gold)' : 'var(--ba-border-lo)' }} 
              onClick={() => setActiveHolo('terra')}
            >
              [ HOLY TERRA ]
            </button>
          </div>

          <div style={{ flex: 1, position: 'relative', border: '1px solid var(--ba-border-lo)', background: '#000' }}>
            <iframe 
              title="Orbital Holo Survey" 
              src={activeHolo === 'baal' ? "Baal_holo.html" : "Terra_holo.html"} 
              style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }} 
            />
            <div className="scanlines" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }} />
          </div>
        </div>

        <div className="panel mech-panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: '250px' }}>
          <div className="sec-ttl" style={{ padding: '12px 15px', marginBottom: 0, fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span>CATEGORY INDEX</span>
            <span style={{ color: 'var(--text-m)' }}><ScrambleText text={rules.length} /> TOTAL</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 15px' }}>
            {rules.map((rule, index) => {
              const isSelected = selectedRuleId === rule._id;
              const type = getCatType(rule.category_name);
              
              const typeColor = type === 'income' ? 'var(--border-hi)' : type === 'neutral' ? 'var(--ba-gold)' : 'var(--ba-crimson)';
              const animDelay = `${Math.min(index * 0.05, 0.4)}s`;

              return (
                <div 
                  key={rule._id} 
                  className={`manifest-row assimilate-in ${isSelected ? 'target-locked' : ''}`}
                  onClick={() => setSelectedRuleId(rule._id)} 
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', marginBottom: '6px',
                    border: `1px solid var(--border)`,
                    cursor: 'pointer',
                    animationDelay: animDelay
                  }}
                >
                  {editingRule?._id === rule._id ? (
                    <div style={{ display: 'flex', gap: '6px', flex: 1 }} onClick={e => e.stopPropagation()}>
                      <input className="mech-input" value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(e); if (e.key === 'Escape') setEditingRule(null); }} autoFocus style={{ marginTop: 0 }} />
                      <button className="action-btn" onClick={handleRenameSubmit}>✓</button>
                      <button className="action-btn" onClick={() => setEditingRule(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ color: typeColor, fontSize: '8px' }}>■</span>
                        <span style={{ fontSize: '11px', color: isSelected ? '#fff' : 'var(--text-m)' }}>
                          {isSelected ? '▶ ' : ''}{rule.category_name.toUpperCase()}
                          <span style={{ color: 'var(--text-d)', fontSize: '10px', marginLeft: '8px', opacity: 0.6 }}>[{rule.keywords.length}]</span>
                        </span>
                      </div>
                      <div style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.4 }}>
                        <button className="action-btn" onClick={(e) => { e.stopPropagation(); setEditingRule(rule); setEditName(rule.category_name); }}>EDIT</button>
                        <button className="action-btn del" onClick={(e) => handleDeleteCategory(rule, e)}>DEL</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '10px 15px', borderTop: '1px dashed var(--ba-border-lo)', background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input className="mech-input" placeholder="NEW CATEGORY..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} style={{ marginTop: 0 }} />
              <select className="mech-select" value={newCategoryType} onChange={e => setNewCategoryType(e.target.value)} style={{ width: '100px', marginTop: 0 }}>
                <option value="expense">EXPENSE</option>
                <option value="income">INCOME</option>
                <option value="neutral">NEUTRAL</option>
              </select>
              <button className="action-btn" onClick={handleAddCategory} style={{ padding: '6px 12px' }}>+ ADD</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
        
        <div className="panel mech-panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: '0 0 50%', minHeight: 0 }}>
          <div className="sec-ttl" style={{ padding: '12px 15px', marginBottom: 0, fontSize: '10px', color: '#fff' }}>
            TARGET LOCK // {selectedRule ? selectedRule.category_name.toUpperCase() : 'NONE'}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
            {!selectedRule ? (
              <div style={{ color: 'var(--text-d)', fontSize: '11px', textAlign: 'center', marginTop: '20px', fontStyle: 'italic' }}>// AWAITING TARGET SELECTION</div>
            ) : (
              <div key={selectedRule._id} className="assimilate-in" style={{ opacity: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px dashed rgba(204, 34, 0, 0.3)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-d)' }}>CLASSIFICATION TYPE</span>
                  <select className="mech-select" value={getCatType(selectedRule.category_name)} onChange={(e) => handleUpdateType(selectedRule.category_name, e.target.value)} style={{ width: '120px', marginTop: 0 }}>
                    <option value="expense">EXPENSE</option>
                    <option value="income">INCOME</option>
                    <option value="neutral">NEUTRAL</option>
                  </select>
                </div>

                <div style={sectionLabel}>ASSIGNED KEYWORDS [{selectedRule.keywords.length}]</div>
                {selectedRule.keywords.length === 0 ? (
                  <div style={{ color: 'var(--ba-gold-mute)', fontSize: '10px', marginBottom: '15px' }}>// NO KEYWORDS DETECTED</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                    {selectedRule.keywords.map(kw => <KeywordTag key={kw} kw={kw} onDelete={() => handleDeleteKeyword(selectedRuleId, kw)} />)}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedRule && (
            <div style={{ padding: '10px 15px', borderTop: '1px dashed var(--ba-border-lo)', background: 'rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input className="mech-input" placeholder="NEW KEYWORD..." value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddKeyword()} style={{ marginTop: 0 }} />
                <button style={inlineBtn} onClick={handleAddKeyword}>UPLINK</button>
              </div>
            </div>
          )}
        </div>

        <div className="panel mech-panel" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="sec-ttl" style={{ padding: '12px 15px', marginBottom: 0, fontSize: '10px' }}>CLASSIFICATION MATRIX</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            <div>
              <div style={{ fontSize: '10px', color: 'var(--border-hi)', borderBottom: '1px dashed var(--border-hi)', paddingBottom: '4px', marginBottom: '8px' }}>
                INCOME STREAMS // <ScrambleText text={incomes.length} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {incomes.length === 0 ? <span style={{ color: 'var(--text-d)', fontSize: '9px' }}>// NONE</span> : incomes.map(r => <span key={r._id} style={{ fontSize: '9px', background: 'rgba(74,222,128,0.05)', padding: '4px 6px', border: '1px solid rgba(74,222,128,0.3)', color: 'var(--border-hi)' }}>{r.category_name}</span>)}
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ba-gold)', borderBottom: '1px dashed var(--ba-gold)', paddingBottom: '4px', marginBottom: '8px' }}>
                NEUTRAL TRANSFERS // <ScrambleText text={neutrals.length} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {neutrals.length === 0 ? <span style={{ color: 'var(--ba-gold-mute)', fontSize: '9px' }}>// NONE</span> : neutrals.map(r => <span key={r._id} style={{ fontSize: '9px', background: 'rgba(201,168,76,0.05)', padding: '4px 6px', border: '1px solid rgba(201,168,76,0.3)', color: 'var(--ba-gold)' }}>{r.category_name}</span>)}
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ba-crimson)', borderBottom: '1px dashed var(--ba-crimson)', paddingBottom: '4px', marginBottom: '8px' }}>
                EXPENSE OUTFLOWS // <ScrambleText text={expenses.length} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {expenses.length === 0 ? <span style={{ color: 'var(--text-d)', fontSize: '9px' }}>// NONE</span> : expenses.map(r => <span key={r._id} style={{ fontSize: '9px', background: 'rgba(204,34,0,0.05)', padding: '4px 6px', border: '1px solid rgba(204,34,0,0.3)', color: 'var(--ba-crimson)' }}>{r.category_name}</span>)}
              </div>
            </div>

          </div>
          <StatusBar statusMsg={statusMsg} rulesCount={rules.length} />
        </div>
      </div>
    </div>
  );
};

export default HoloSlide;