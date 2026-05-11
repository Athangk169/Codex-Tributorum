import React, { useState, useEffect, useRef } from 'react';

// ── OverviewSlide — Mechanicum / Blood Angels dual-faction blend ──
//
// Mechanicum (green):  data values, TX badges, radar, stream text,
//                      uplink status, positive amounts
// Blood Angels (red/gold): panel titles, section headers, expense
//                      values, CRIT badges, debt warnings, borders
//                      panel top-rules, corner brackets
// ─────────────────────────────────────────────────────────────────

// ── Cryptographic Boot-up Component ──
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
      iter += 1/15; // Controls speed of decryption
    }, 80);

    return () => clearInterval(interval);
  }, [text]);

  return <>{display}</>;
};

// ── Servo Skull 3D Viewer — uses <model-viewer> via CDN, zero npm deps ──
const ServoSkullViewer = ({ syncLed, globalAuditState }) => {
  const containerRef = useRef(null);
  const mvRef        = useRef(null);

  useEffect(() => {
    // Register model-viewer from local npm package (works offline)
    import('@google/model-viewer');

    // Imperatively create the <model-viewer> element so React doesn't
    // complain about unknown JSX attributes
    const mv = document.createElement('model-viewer');
    const glbPath = window.electronDistPath?.distPath
    ? `file:///${window.electronDistPath.distPath.replace(/^\//, '')}/servo-skull_warhammer.glb`
    : 'servo-skull_warhammer.glb';
    mv.setAttribute('src', glbPath);
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('rotation-per-second', '22deg');
    mv.setAttribute('camera-orbit', '0deg 75deg 2.5m');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');

    Object.assign(mv.style, {
      width:           '68px',
      height:          '68px',
      backgroundColor: 'transparent',
      '--progress-bar-color':   'transparent',
      '--progress-bar-height':  '0px',
      transition:      'all 1s ease'
    });

    containerRef.current.appendChild(mv);
    mvRef.current = mv;

    return () => {
      if (mvRef.current && containerRef.current?.contains(mvRef.current)) {
        containerRef.current.removeChild(mvRef.current);
      }
    };
  }, []);

  // CSS filter tints the whole skull based on BOTH Uplink and Audit purity
  useEffect(() => {
    if (!mvRef.current) return;
    
    if (syncLed !== 'ok' || globalAuditState === 'CORRUPTED') {
      mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-30deg) brightness(0.65) drop-shadow(0 0 8px rgba(204,34,0,0.8))';
    } else if (globalAuditState === 'RESTLESS') {
      mvRef.current.style.filter = 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(0.8) drop-shadow(0 0 5px rgba(255,165,0,0.4))';
    } else {
      mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(85deg) brightness(0.75)';
    }
  }, [syncLed, globalAuditState]);

  return <div ref={containerRef} style={{ width: '68px', height: '68px' }} />;
};

const OV_STYLES = `

  /* ── Panel chrome & Ambient Plasma Shimmer ── */
  @keyframes plasmaShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .ov-panel {
    background:  rgba(4, 1, 1, 0.85);
    border:      1px solid #2a0800;
    box-shadow:  0 0 12px rgba(180,20,0,0.08), inset 0 0 20px rgba(0,0,0,0.4);
    position:    relative;
    overflow:    hidden;
  }
  
  /* Gold top-rule with moving plasma shimmer */
  .ov-panel::before {
    content:    '';
    position:   absolute;
    top: 0; left: 0; right: 0;
    height:     1px;
    background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
    background-size: 200% 100%;
    animation:  plasmaShimmer 5s linear infinite;
  }

  /* ── Tactical Reticle Hover State ── */
  .ov-target-hover {
    transition: background 0.2s ease, box-shadow 0.2s ease;
    position: relative;
    cursor: crosshair;
  }
  .ov-target-hover:hover {
    background: rgba(200, 34, 0, 0.08);
    box-shadow: inset 0 0 15px rgba(200, 34, 0, 0.15);
  }
  .ov-target-hover::after, .ov-target-hover::before {
    content: ''; position: absolute; opacity: 0; transition: opacity 0.2s;
    width: 8px; height: 8px; border-color: #cc2200; border-style: solid; z-index: 5;
  }
  .ov-target-hover::before { top: 2px; left: 2px; border-width: 1px 0 0 1px; }
  .ov-target-hover::after  { bottom: 2px; right: 2px; border-width: 0 1px 1px 0; }
  .ov-target-hover:hover::before, .ov-target-hover:hover::after { opacity: 1; }

  /* ── Section titles & Scrap-Code Glitch ── */
  @keyframes scrapGlitch {
    0%, 96% { transform: translate(0, 0); text-shadow: none; }
    97%     { transform: translate(-2px, 1px); text-shadow: 2px 0 cyan, -2px 0 red; }
    98%     { transform: translate(2px, -1px); text-shadow: -2px 0 cyan, 2px 0 red; }
    99%     { transform: translate(0, 0); text-shadow: none; }
  }
  
  .glitch-crit {
    animation: scrapGlitch 2.5s infinite;
  }

  .ov-ttl {
    font-size:     11px;
    font-family:   var(--mono);
    letter-spacing:2px;
    color:         #b8923e;
    text-shadow:   0 0 8px #b8923e44;
    text-transform:uppercase;
    padding-bottom:8px;
    margin-bottom: 10px;
    border-bottom: 1px solid #3a0800;
    display:       flex;
    align-items:   center;
    justify-content: space-between;
  }
  .ov-ttl::after {
    content: '◈';
    color: #4a0a00;
    font-size: 9px;
  }
  /* Glitch headers occasionally on hover */
  .ov-ttl:hover { animation: scrapGlitch 0.4s forwards; }

  /* ── KPI cards ── */
  .ov-kpi-lbl {
    font-size:     10px;
    letter-spacing:2px;
    color:         #b8923e;
    text-transform:uppercase;
    margin-bottom: 6px;
    font-family:   var(--mono);
  }
  .ov-kpi-val {
    font-size:     24px;
    font-weight:   bold;
    font-family:   var(--mono);
    color:         var(--border-hi);
    text-shadow:   var(--glow);
    line-height:   1;
  }
  .ov-kpi-val.expense {
    color:       #cc2200;
    text-shadow: 0 0 10px #cc220077;
  }
  .ov-kpi-val.ok {
    color:       #4ade80;
    text-shadow: 0 0 10px #4ade8077;
  }

  /* ── Astropathic Oscilloscope ── */
  @keyframes oscWaveSlide {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes oscErraticPulse {
    0%, 100% { transform: translateX(0) scaleY(1); }
    25%      { transform: translateX(-12.5%) scaleY(1.6); }
    50%      { transform: translateX(-25%) scaleY(0.7); filter: drop-shadow(0 0 12px #cc2200); }
    75%      { transform: translateX(-37.5%) scaleY(2); }
  }
  
  .osc-container {
    background: #040101; 
    border: 1px solid #2a0800;
    position: relative; 
    overflow: hidden;
    display: flex; 
    align-items: center; 
    box-shadow: inset 0 0 12px rgba(0,0,0,0.9);
  }
  .osc-svg {
    width: 200%; height: 100%; flex-shrink: 0;
  }
  .osc-svg.ok { 
    animation: oscWaveSlide 2s linear infinite; 
    stroke: #4ade80; 
    filter: drop-shadow(0 0 4px #4ade80); 
  }
  .osc-svg.warn { 
    animation: oscErraticPulse 0.4s linear infinite, oscWaveSlide 1s linear infinite; 
    stroke: #cc2200; 
    filter: drop-shadow(0 0 8px #cc2200);
  }

  /* ── Noosphere relay rows ── */
  .ov-relay-row {
    display:       flex;
    gap:           10px;
    align-items:   flex-start;
    padding:       8px 10px 8px 0;
    border-bottom: 1px solid #1a0500;
    font-size:     11px;
    font-family:   var(--mono);
  }
  .ov-relay-meta {
    display:       flex;
    flex-direction:column;
    gap:           2px;
    font-size:     9px;
    color:         #4a2010;
    min-width:     52px;
    flex-shrink:   0;
    text-align:    right;
  }

  /* Badges */
  .ov-badge {
    padding:       2px 6px;
    font-size:     9px;
    font-weight:   bold;
    letter-spacing:1px;
    border-radius: 1px;
    flex-shrink:   0;
    align-self:    flex-start;
    margin-top:    1px;
  }
  .ov-badge-tx   { background: rgba(26,93,44,0.3);  border: 1px solid var(--border); color: var(--border-hi); }
  .ov-badge-ok   { background: rgba(26,93,44,0.2);  border: 1px solid var(--border); color: var(--border-hi); }
  .ov-badge-crit {
    background:  rgba(204,34,0,0.2);
    border:      1px solid #cc2200;
    color:       #cc2200;
    text-shadow: 0 0 6px #cc220099;
    animation:   ovCritBlink 1s ease-in-out infinite;
  }

  /* Lore row severity left-border */
  .ov-relay-row.lore-ok   { border-left: 2px solid var(--border); padding-left: 8px; }
  .ov-relay-row.lore-crit { border-left: 2px solid #cc2200;       padding-left: 8px; }

  /* Positive / negative amounts */
  .ov-amt-pos { color: var(--border-hi); text-shadow: var(--glow); }
  .ov-amt-neg { color: #cc2200; text-shadow: 0 0 8px #cc220077; }

  /* Scroll wrap */
  .ov-scroll-wrap {
    flex:       1;
    overflow:   hidden;
    padding-right: 4px;
  }

  /* ── Continuous Marquee Animation ── */
  @keyframes streamScrollVert {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
  .ov-stream-marquee {
    display: flex;
    flex-direction: column;
    animation: streamScrollVert 25s linear infinite;
  }
  .ov-stream-marquee:hover {
    animation-play-state: paused;
  }

  /* Gold corner brackets (Orbital Auspex / Net Metrics) */
  @keyframes bracketPulse {
    0%, 100% { box-shadow: 0 0 4px #c9a84c44; border-color: #c9a84c; }
    50%      { box-shadow: 0 0 12px #c9a84c99; border-color: #ffe082; }
  }
  
  .ov-corner-frame {
    position: relative;
  }
  .ov-corner-frame::before,
  .ov-corner-frame::after {
    content:      '';
    position:     absolute;
    width:        10px; height: 10px;
    border-style: solid;
    z-index:      6;
    animation:    bracketPulse 4s ease-in-out infinite;
  }
  .ov-corner-frame::before { top: 0;    left: 0;  border-width: 2px 0 0 2px; }
  .ov-corner-frame::after  { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

  /* Debt warning pulse */
  .ov-debt-warn {
    color:      #cc2200;
    text-shadow:0 0 12px #cc220099;
    animation:  ovDebtPulse 1.5s ease-in-out infinite;
  }
  .ov-debt-ok {
    color:      var(--border-hi);
    text-shadow:var(--glow);
  }

  @keyframes ovCritBlink {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.4; }
  }
  @keyframes ovDebtPulse {
    0%,100% { opacity: 1;    text-shadow: 0 0 10px #cc220099; }
    50%     { opacity: 0.65; text-shadow: 0 0 20px #cc2200cc; }
  }

  /* Status row helpers */
  .ov-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11px; }
  .ov-rl  { color: #b8923e; font-size: 10px; letter-spacing: 1px; }
  .ov-rv  { color: #fff; font-family: var(--mono); }
  .ov-rv.ok   { color: var(--border-hi); text-shadow: var(--glow); }
  .ov-rv.warn { color: #eab308; text-shadow: 0 0 8px #eab30877; }
`;

const OverviewSlide = ({ data, syncLed }) => {

  const txns       = data?.transactions  || [];
  const metrics    = data?.metrics       || {};
  const buckets    = data?.buckets       || {};

  // Extracting both Gross and Net flows for the dashboard
  const income     = metrics.grossIncome  || 0;
  const expense    = metrics.grossExpense || 0;
  const netIncome  = metrics.netIncome    || 0;
  const netExpense = metrics.netExpense   || 0;
  
  const bank       = buckets.Bank ?? data?.liveBalances?.total ?? 0;
  const cash       = buckets.Cash         || 0;
  const ar         = buckets.AR           || 0;
  const provisions = buckets.Provisions   || 0;

  // Helper to turn "YYYY-MM-DD" into "10th MAY"
  const formatDateToText = (dateString) => {
    if (!dateString) return 'NO DEBT DETECTED';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    
    const day = d.getDate();
    const month = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
    const suffix = ["th", "st", "nd", "rd"];
    const v = day % 100;
    const ordinal = day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
    
    return `${ordinal} ${month}`;
  };

  const nextBucket = data?.cardObligations?.buckets?.find(b => b.status !== 'paid') || {};
  const ccDueAmt   = nextBucket.outstanding || 0;
  const ccDueDate  = nextBucket.due_date ? formatDateToText(nextBucket.due_date) : 'NO DEBT DETECTED';

  // 1. Calculate Funds Available (Bank + Cash - Total Card Debt)
  const totalDebt = data?.totalDebt || 0;
  const fundsAvailable = bank + cash - totalDebt;

  // 1.5 Calculate Global Ledger Purity (Auditor Ritual)
  const bankAccounts = (data?.accounts || []).filter(a => a.parent === 'Bank');
  let maxDaysSinceAudit = 0;

  if (bankAccounts.length > 0) {
    maxDaysSinceAudit = Math.max(...bankAccounts.map(acc => {
      // Default to 8 days ago if never audited to force a check
      const lastAudited = acc.last_audited_date || new Date(Date.now() - 86400000 * 8).toISOString();
      return Math.max(0, Math.floor((Date.now() - new Date(lastAudited).getTime()) / (1000 * 60 * 60 * 24)));
    }));
  }

  let globalAuditState = 'PURE';
  let auditColor = 'var(--border-hi)';
  let isGlobalCrit = false;

  if (maxDaysSinceAudit >= 7) {
    globalAuditState = 'CORRUPTED';
    auditColor = '#cc2200'; // Blood red
    isGlobalCrit = true;
  } else if (maxDaysSinceAudit >= 4) {
    globalAuditState = 'RESTLESS';
    auditColor = '#eab308'; // Warning amber
  }

  // 2. Calculate Category-wise Non-Reimbursable Spending
  const positiveCats = data?.positiveCategories || [];
  const neutralCats  = data?.neutralCategories || [];
  const categorySpending = {};

  txns.forEach(tx => {
    const cat = tx.category || 'UNCATEGORIZED';
    const isIncome = positiveCats.includes(cat);
    const isTransfer = neutralCats.includes(cat);

    // Filter out income, transfers, and reimbursables
    if (!isIncome && !isTransfer && !tx.is_reimbursable) {
      categorySpending[cat] = (categorySpending[cat] || 0) + Math.abs(tx.amount);
    }
  });

  // Get Top 4 highest spending categories
  const topCategories = Object.entries(categorySpending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // Build stream
  const recentTxns = txns.slice(0, 15);
  const streamData = [];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lorePools = {
    crit: {
      opener: [
        'SCRAP-CODE INFLUX DETECTED.',
        'HERETEK DATA-SPOOR DETECTED.',
        'NOOSPHERIC CONTAMINATION CONFIRMED.',
        'BINHARIC LITANY FAILURE REGISTERED.',
        'COGITATOR SEIZURE EVENT DETECTED.'
      ],
      detail: [
        'ORIGIN UNKNOWN.',
        'SOURCE MASKED BY STATIC.',
        'LINGUA DIABOLIS TRACE PRESENT.',
        'OUTER RELAYS REPORT CORRUPTION.',
        'MACHINE-SPIRIT DISTRESS RESPONSES ESCALATING.'
      ],
      response: [
        'MAGOS VENERATUS NOTIFIED.',
        'PURGE RITES COMMENCING.',
        'SANCTIFIED FIREWALLS ENGAGED.',
        'DATA-LOOMS SEALED.',
        'NOOSPHERIC FIREBREAKS ACTIVATED.'
      ],
      blood: [
        'CORBULO SUMMONED.',
        'RED GRAIL ARCHIVES LOCKED.',
        'RED THIRST INDEX ESCALATING.',
        'CHAPLAINCY ALERT STATUS RAISED.',
        'DEATH COMPANY WATCH INITIATED.'
      ],
      closing: [
        'OMNISSIAH PRESERVE THIS ENGINE.',
        'SANGUINIUS WATCHES IN SILENCE.',
        'ALL NON-SANCTIONED ACCESS REVOKED.',
        'QUARANTINE SEALS HOLD FOR NOW.'
      ]
    },
    ok: {
      opener: [
        'AUSPEX SWEEP COMPLETE.',
        'DIAGNOSTIC CANTICLE COMPLETE.',
        'SECTOR SCAN COMPLETE.',
        'RECONCILIATION RITE COMPLETE.',
        'COGITATOR BENEDICTION COMPLETE.'
      ],
      detail: [
        'NO CHAOS SIGNATURE DETECTED.',
        'WARP ECHO ABSENT.',
        'SECTOR TERTIUS CLEAR.',
        'HOSTILE TRACE NEGATIVE.',
        'NO HERETEK SPOOR IDENTIFIED.'
      ],
      response: [
        'MACHINE-SPIRIT CALM.',
        'NOOSPHERIC LINK STABLE.',
        'COGITATOR CORE SANCTIFIED.',
        'AUSPEX RETURNS CLEAN.',
        'PRIMARY RELAYS OPERATING WITHIN TOLERANCE.'
      ],
      blood: [
        'BAALITE VAULTS SECURE.',
        'SANGUINIUS WATCHES.',
        'RED THIRST CONTAINED.',
        'THE IX LEGION ENDURES.',
        'RED GRAIL RECORDS VERIFIED.'
      ],
      closing: [
        'GLORY TO THE ANGEL.',
        'PRAISE THE OMNISSIAH.',
        'ALL SYSTEMS REMAIN LOYAL.',
        'HONOUR THE CHAPTER.'
      ]
    }
  };

  recentTxns.forEach((tx, i) => {
    const hexId = tx._id
      ? `0X${tx._id.substring(tx._id.length - 4).toUpperCase()}`
      : '0X0000';

    const timeStr = `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;

    streamData.push({
      type: 'tx',
      id: hexId,
      time: timeStr,
      data: tx
    });

    if (i % 3 === 0) {
      const isCrit = Math.random() > 0.6;
      const loreHex = `0X${Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4, '0')}`;
      const pool = isCrit ? lorePools.crit : lorePools.ok;

      const text = [
        pick(pool.opener),
        pick(pool.detail),
        pick(pool.response),
        pick(pool.blood),
        ...(Math.random() > 0.45 ? [pick(pool.closing)] : [])
      ].join(' ');

      streamData.push({
        type: 'lore',
        id: loreHex,
        time: timeStr,
        status: isCrit ? 'CRIT' : 'OK',
        text
      });
    }
  });

  const kpis = [
    { label: 'FUNDS AVAILABLE',    val: fundsAvailable, cls: fundsAvailable < 0 ? 'expense' : 'ok' },
    { label: 'GROSS TITHE INFLOW', val: income,         cls: '' },
    { label: 'TOTAL EXPENDITURE',  val: expense,        cls: 'expense' },
    { label: 'BANK RESERVE',       val: bank,           cls: '' },
    { label: 'CASH RESERVE',       val: cash,           cls: '' },
  ];

  return (
    <>
      <style>{OV_STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>

        {/* ── ROW 1: KPI CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', flexShrink: 0 }}>
          {kpis.map((kpi, i) => (
            <div key={i} className="ov-panel ov-target-hover" style={{ padding: '12px 15px' }}>
              <div className="ov-kpi-lbl" style={{ color: kpi.label === 'FUNDS AVAILABLE' ? '#4ade80' : '#b8923e' }}>
                {kpi.label}
              </div>
              <div className={`ov-kpi-val ${kpi.cls}`}>
                ₹ <ScrambleText text={kpi.val.toLocaleString()} />
              </div>
            </div>
          ))}
        </div>

        {/* ── ROW 2: THREE COLUMNS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Uplink Status */}
            <div className="ov-panel" style={{ padding: '14px 15px' }}>
              <div className="ov-ttl">SYSTEM UPLINK STATUS</div>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                
                {/* ── Servo Skull (Replaces Oscilloscope) ── */}
                <div className="osc-container" style={{ width: '68px', height: '68px', flexShrink: 0 }}>
                  <ServoSkullViewer syncLed={syncLed} auditState={globalAuditState} />
                  {/* Status text badge pinned to bottom of the skull viewport */}
                  <div style={{
                    position: 'absolute', bottom: '4px', left: 0, right: 0,
                    display: 'flex', justifyContent: 'center',
                    pointerEvents: 'none', zIndex: 5,
                  }}>
                    <span style={{
                      fontSize: '7px', fontFamily: 'var(--mono)', fontWeight: 'bold',
                      letterSpacing: '2px', padding: '0 4px',
                      background: 'rgba(0,0,0,0.65)',
                      color:      (syncLed === 'ok' && !isGlobalCrit) ? '#4ade80' : '#cc2200',
                      textShadow: (syncLed === 'ok' && !isGlobalCrit) ? '0 0 6px #4ade8099' : '0 0 6px #cc220099',
                    }}>
                      {
  globalAuditState === 'CORRUPTED' ? 'CORR'
  : syncLed === 'offline'     ? 'LINK'
  : syncLed === 'warn'        ? 'WARN'
  : globalAuditState === 'RESTLESS' ? 'WARN'
  : 'PURE'
}
                    </span>
                  </div>
                </div>

                <div style={{ flex: 1, lineHeight: '2' }}>
                  <div className="ov-row">
                    <span className="ov-rl">DATA CYCLE</span>
                    <span className="ov-rv"><ScrambleText text={new Date().toLocaleDateString('en-GB')} /></span>
                  </div>
                  <div className="ov-row">
                    <span className="ov-rl">UPLINK</span>
                    <span className={`ov-rv ${syncLed === 'ok' ? 'ok' : syncLed === 'offline' ? '' : 'warn'}`}
              style={syncLed === 'offline' ? { color: '#cc2200', textShadow: '0 0 8px #cc220077' } : {}}>
                      ◈ {syncLed === 'ok' ? 'ESTABLISHED' : syncLed === 'offline' ? 'NO SIGNAL' : 'AWAITING'}
                    </span>
                  </div>
                  {/* NEW: Auditor Purity Metric */}
                  <div className="ov-row">
                    <span className="ov-rl">LEDGER PURITY</span>
                    <span className={isGlobalCrit ? 'glitch-crit' : ''} style={{ fontFamily: 'var(--mono)', color: auditColor, textShadow: `0 0 8px ${auditColor}77` }}>
                      ◈ {globalAuditState}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Impending Obligations */}
            <div className="ov-panel ov-target-hover" style={{ padding: '14px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="ov-ttl">IMPENDING OBLIGATIONS</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '10px' }}>

                <div>
                  <div style={{ fontSize: '9px', color: '#b8923e', letterSpacing: '2px', marginBottom: '4px' }}>
                    NEXT RITUAL DUE DATE
                  </div>
                  <div style={{ fontSize: '18px', color: ccDueAmt > 0 ? '#e0c070' : 'var(--border-hi)', fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                    <ScrambleText text={ccDueDate} />
                  </div>
                </div>

                <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, #4a0a00, transparent)' }} />

                <div>
                  <div style={{ fontSize: '9px', color: ccDueAmt > 0 ? '#cc2200' : '#b8923e', letterSpacing: '2px', marginBottom: '4px' }}>
                    BLOOD DEBT OUTSTANDING
                  </div>
                  <div className={ccDueAmt > 0 ? 'ov-debt-warn glitch-crit' : 'ov-debt-ok'} style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                    ₹ <ScrambleText text={ccDueAmt.toLocaleString()} />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── MIDDLE: Noosphere Relay ── */}
          <div className="ov-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '14px 6px 14px 15px' }}>

            <div className="ov-ttl" style={{ marginRight: '10px' }}>
              <span>NOOSPHERE RELAY</span>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginLeft: 'auto', marginRight: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--border-hi)', boxShadow: 'var(--glow)', display: 'inline-block' }} />
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 6px #eab308', display: 'inline-block' }} />
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#cc2200', boxShadow: '0 0 6px #cc2200', display: 'inline-block' }} />
              </div>
            </div>

            <div style={{ fontSize: '10px', color: '#4a2010', borderBottom: '1px solid #2a0800', paddingBottom: '8px', marginBottom: '10px', marginRight: '10px', letterSpacing: '1px' }}>
              ◈ UPLINK SECURE · SECTOR 7-ALPHA · STREAM ACTIVE
            </div>

            <div className="ov-scroll-wrap">
              <div className="ov-stream-marquee">
                {[...streamData, ...streamData].map((item, i) => {
                  if (item.type === 'lore') {
                    const isCrit = item.status === 'CRIT';
                    return (
                      <div key={i} className={`ov-relay-row ov-target-hover ${isCrit ? 'lore-crit' : 'lore-ok'}`}>
                        <div className="ov-relay-meta">
                          <span>{item.time}</span>
                          <span>{item.id}</span>
                        </div>
                        <span className={`ov-badge ${isCrit ? 'ov-badge-crit' : 'ov-badge-ok'}`}>
                          {item.status}
                        </span>
                        {/* Glitch applied to Critical Text logs */}
                        <div className={isCrit ? 'glitch-crit' : ''} style={{ flex: 1, color: isCrit ? '#cc2200' : 'var(--text-m)', textTransform: 'uppercase', lineHeight: '1.4', fontSize: '10px' }}>
                          {item.text}
                        </div>
                      </div>
                    );
                  }

                  const tx          = item.data;
                  const displayName = tx.description || tx.category;
                  const accName     = tx.sub_account  || tx.account_type || 'UNKNOWN';
                  const isNeg       = tx.amount < 0;

                  return (
                    <div key={i} className="ov-relay-row ov-target-hover">
                      <div className="ov-relay-meta">
                        <span>{item.time}</span>
                        <span>{item.id}</span>
                      </div>
                      <span className="ov-badge ov-badge-tx">TX</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', textTransform: 'uppercase' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <span style={{ color: '#fff' }}>{displayName}</span>
                          <span style={{ color: '#3a0800' }}>—</span>
                          <span className={isNeg ? 'ov-amt-neg' : 'ov-amt-pos'}>
                            {isNeg ? '' : '+'}₹{Math.abs(tx.amount).toLocaleString()}
                          </span>
                          <span style={{ color: '#3a0800' }}>—</span>
                          <span style={{ color: '#6a4020', fontSize: '10px' }}>{tx.category}</span>
                        </div>
                        <div style={{ color: '#4a2010', fontSize: '10px' }}>VIA {accName}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Row split: Pending Reimbursements & Strategic Provisions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flexShrink: 0 }}>
              <div className="ov-panel ov-target-hover" style={{ padding: '10px 12px' }}>
                <div className="ov-ttl" style={{ fontSize: '10px', marginBottom: '8px' }}>REIMBURSEMENT PENDING</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: 'var(--border-hi)', textShadow: 'var(--glow)' }}>
                  ₹ <ScrambleText text={ar.toLocaleString()} />
                </div>
              </div>

              <div className="ov-panel ov-target-hover" style={{ padding: '10px 12px' }}>
                <div className="ov-ttl" style={{ fontSize: '10px', marginBottom: '8px' }}>PROVISIONS</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: '#fff', textShadow: 'var(--glow)' }}>
                  ₹ <ScrambleText text={provisions.toLocaleString()} />
                </div>
              </div>
            </div>

            {/* NEW: Category-Wise Spending (Expenditure Vectors) */}
            <div className="ov-panel ov-target-hover" style={{ padding: '12px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="ov-ttl" style={{ fontSize: '11px' }}>EXPENDITURE VECTORS</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: '6px' }}>
                {topCategories.map(([cat, amt]) => {
                  const maxAmt = topCategories[0]?.[1] || 1;
                  const pct = Math.min((amt / maxAmt) * 100, 100);
                  
                  return (
                    <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#b8923e', letterSpacing: '1px' }}>
                        <span>{cat.toUpperCase()}</span>
                        <span>₹ {amt.toLocaleString()}</span>
                      </div>
                      {/* Mechanicum visual red progress bar */}
                      <div style={{ width: '100%', height: '2px', background: '#2a0800' }}>
                         <div style={{ height: '100%', width: `${pct}%`, background: '#cc2200', boxShadow: '0 0 4px #cc2200' }} />
                      </div>
                    </div>
                  );
                })}
                {topCategories.length === 0 && (
                  <div style={{ fontSize: '10px', color: '#7a4a20', textAlign: 'center', marginTop: '10px' }}>NO OUTFLOW DETECTED</div>
                )}
              </div>
            </div>

            {/* Adjusted Ledger (Net Flows) */}
            <div className="ov-panel ov-corner-frame" style={{ padding: '12px 15px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div className="ov-ttl" style={{ fontSize: '11px' }}>ADJUSTED LEDGER</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '9px', color: '#7a4a20', letterSpacing: '1px' }}>NET INCOME</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: 'var(--border-hi)', textShadow: 'var(--glow)', lineHeight: 1 }}>
                    ₹ <ScrambleText text={netIncome.toLocaleString()} />
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '9px', color: '#7a4a20', letterSpacing: '1px' }}>NET EXPENDITURE</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--mono)', color: '#cc2200', textShadow: '0 0 10px #cc220077', lineHeight: 1 }}>
                    ₹ <ScrambleText text={netExpense.toLocaleString()} />
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default OverviewSlide;