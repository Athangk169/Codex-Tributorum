// src/components/slides/OverviewSlide.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── ScrambleText ──────────────────────────────────────────────
const ScrambleText = ({ text, speed = 60, step = 0.08 }) => {
  const [display, setDisplay] = useState(String(text));
  useEffect(() => {
    let iter = 0;
    const chars   = '01X4A8C9#F>';
    const strText = String(text);
    const skip    = new Set([' ', '₹', ',', '.', '+', '-', '%']);
    const iv = setInterval(() => {
      setDisplay(strText.split('').map((c, i) => {
        if (skip.has(c) || i < iter) return c;
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(''));
      if (iter >= strText.length) { clearInterval(iv); setDisplay(strText); }
      iter += step;
    }, speed);
    return () => clearInterval(iv);
  }, [text]);
  return <>{display}</>;
};

// ── Autonomous Servo Skull ────────────────────────────────────
const ServoSkullOverview = ({ syncLed, globalAuditState, slideRef, dockRef }) => {
  const containerRef = useRef(null);
  const mvRef        = useRef(null);
  const activeTargetRef = useRef(null);
  const [skullMode, setSkullMode] = useState('dock');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [beamSide, setBeamSide] = useState('left');

  const moveToElement = useCallback((element, mode = 'scan') => {
    if (!element || !slideRef.current) return;
    const slideRect = slideRef.current.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    const scanFromRight = Math.random() > 0.5;
    setBeamSide(scanFromRight ? 'left' : 'right');
    const rawX = mode === 'dock'
      ? elRect.left - slideRect.left
      : scanFromRight
        ? elRect.right - slideRect.left + 12
        : elRect.left - slideRect.left - 78;
    const rawY = mode === 'dock'
      ? elRect.top - slideRect.top
      : elRect.top - slideRect.top + Math.max(0, (elRect.height - 68) / 2);

    activeTargetRef.current?.classList.remove('ov-skull-active');
    if (mode === 'dock') {
      activeTargetRef.current = null;
    } else {
      element.classList.add('ov-skull-active');
      activeTargetRef.current = element;
    }

    setSkullMode(mode);
    setPosition({
      x: Math.max(4, Math.min(slideRect.width - 72, rawX)),
      y: Math.max(4, Math.min(slideRect.height - 72, rawY)),
    });
  }, [slideRef]);

  const moveToDock = useCallback(() => {
    activeTargetRef.current?.classList.remove('ov-skull-active');
    activeTargetRef.current = null;
    moveToElement(dockRef.current, 'dock');
  }, [dockRef, moveToElement]);

  useEffect(() => {
    import('@google/model-viewer').catch(() => {});
    const container = containerRef.current;
    if (!container) return;
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', '/servo-skull_warhammer.glb');
    mv.setAttribute('camera-orbit', '20deg 80deg 2.8m');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');
    Object.assign(mv.style, {
      width: '100%', height: '100%',
      backgroundColor: 'transparent',
      '--progress-bar-color': 'transparent',
      '--progress-bar-height': '0px',
      transition: 'filter 0.8s ease',
    });
    container.appendChild(mv);
    mvRef.current = mv;
    return () => { container.innerHTML = ''; };
  }, []);

  useEffect(() => {
    const mv = mvRef.current;
    if (!mv) return;
    if (skullMode === 'scan') {
      mv.style.filter = 'sepia(1) saturate(6) hue-rotate(85deg) brightness(1.5) drop-shadow(0 0 10px #4ade8088)';
      return;
    }
    if (skullMode === 'glitch') {
      mv.style.filter = 'sepia(1) saturate(8) hue-rotate(-20deg) brightness(1.6) drop-shadow(0 0 12px rgba(204,34,0,0.9))';
      return;
    }
    if (syncLed !== 'ok' || globalAuditState === 'CORRUPTED') {
      mv.style.filter = 'sepia(1) saturate(5) hue-rotate(-30deg) brightness(0.65) drop-shadow(0 0 8px rgba(204,34,0,0.8))';
    } else if (globalAuditState === 'RESTLESS') {
      mv.style.filter = 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(0.8)';
    } else {
      mv.style.filter = 'sepia(1) saturate(4) hue-rotate(85deg) brightness(0.75)';
    }
  }, [syncLed, globalAuditState, skullMode]);

  useEffect(() => {
    let t = 0;
    const iv = setInterval(() => {
      if (!mvRef.current) return;

      t += 0.018;

      let theta, phi;
      switch (skullMode) {
        case 'scan':
          theta = (beamSide === 'right' ? -125 : 125) + Math.sin(t * 1.6) * 7;
          phi   = 76 + Math.sin(t * 1.2 + 0.9) * 4;
          break;
        case 'focus':
          theta = (beamSide === 'right' ? -145 : 145) + Math.sin(t * 0.8) * 4;
          phi   = 74 + Math.sin(t * 0.5) * 2;
          break;
        case 'glitch':
          theta = (Math.random() - 0.5) * 180;
          phi   = 55 + Math.random() * 50;
          break;
        default:
          theta = Math.sin(t) * 38;
          phi   = 80 + Math.sin(t * 0.4 + 1.2) * 7;
      }

      mvRef.current.setAttribute('camera-orbit', `${theta}deg ${phi}deg 2.8m`);
    }, 50);

    return () => clearInterval(iv);
  }, [skullMode]);

  useEffect(() => {
    moveToDock();
    const handleResize = () => moveToDock();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [moveToDock]);

  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    const chooseNextAction = () => {
      if (cancelled || !slideRef.current) return;
      const targets = [...slideRef.current.querySelectorAll('.ov-target-hover, .ov-relay-row, .ov-ar-row, .ov-bar-track')]
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

      if (!targets.length) {
        moveToDock();
        timeoutId = setTimeout(chooseNextAction, 5000);
        return;
      }

      const scanCount = 2 + Math.floor(Math.random() * 2);
      let step = 0;
      const usedTargets = new Set();

      const scanNextTarget = () => {
        if (cancelled) return;
        const available = targets.filter(target => !usedTargets.has(target));
        const pool = available.length > 0 ? available : targets;
        const target = pool[Math.floor(Math.random() * pool.length)];
        usedTargets.add(target);
        moveToElement(target, Math.random() < 0.1 ? 'glitch' : 'scan');
        step += 1;

        if (step < scanCount) {
          timeoutId = setTimeout(scanNextTarget, 9800 + Math.random() * 2200);
          return;
        }

        timeoutId = setTimeout(() => {
          if (cancelled) return;
          if (Math.random() < 0.72) moveToDock();
          timeoutId = setTimeout(chooseNextAction, 9000 + Math.random() * 6000);
        }, 9800 + Math.random() * 2600);
      };

      scanNextTarget();
    };

    timeoutId = setTimeout(chooseNextAction, 2200);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      activeTargetRef.current?.classList.remove('ov-skull-active');
    };
  }, [moveToDock, moveToElement, slideRef]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '68px', height: '68px',
      transform: `translate(${position.x}px, ${position.y}px)`,
      transition: 'transform 7.5s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 60,
      pointerEvents: 'none',
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {(skullMode === 'scan' || skullMode === 'focus') && <div className={`ov-skull-laser ${beamSide === 'right' ? 'to-right' : 'to-left'}`} />}
      <div style={{
        position: 'absolute', bottom: 2, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: '7px', fontFamily: 'var(--mono)', fontWeight: 'bold',
          letterSpacing: '2px', padding: '0 3px', background: 'rgba(0,0,0,0.7)',
          color: skullMode === 'scan'  ? '#4ade80'
               : skullMode === 'glitch' ? '#cc2200'
               : (syncLed === 'ok' && globalAuditState === 'PURE') ? '#4ade80' : '#cc2200',
          textShadow: skullMode === 'scan'  ? '0 0 8px #4ade80'
                    : skullMode === 'glitch' ? '0 0 8px #cc2200'
                    : (syncLed === 'ok' && globalAuditState === 'PURE')
                      ? '0 0 6px #4ade8099' : '0 0 6px #cc220099',
          transition: 'color 0.3s, text-shadow 0.3s',
        }}>
          {skullMode === 'scan'   ? 'SCAN'
         : skullMode === 'focus'  ? 'LOCK'
         : skullMode === 'glitch' ? 'ERR!'
         : globalAuditState === 'CORRUPTED' ? 'CORR'
         : syncLed === 'offline'  ? 'OFFL'
         : syncLed === 'error'    ? 'ERR'
         : globalAuditState === 'RESTLESS' ? 'WARN' : 'PURE'}
        </span>
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────
const OV_STYLES = `
  @keyframes plasmaShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes scrapGlitch {
    0%, 96% { transform: translate(0,0); text-shadow: none; }
    97% { transform: translate(-2px, 1px); text-shadow: 2px 0 cyan, -2px 0 red; }
    98% { transform: translate(2px, -1px); text-shadow: -2px 0 cyan, 2px 0 red; }
    99% { transform: translate(0,0); text-shadow: none; }
  }
  @keyframes ovCritBlink  { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes ovDebtPulse  {
    0%,100% { opacity: 1; text-shadow: 0 0 10px #cc220099; }
    50%     { opacity: 0.65; text-shadow: 0 0 20px #cc2200cc; }
  }
  @keyframes bracketPulse {
    0%,100% { border-color: #c9a84c; }
    50%     { border-color: #ffe082; box-shadow: 0 0 8px #c9a84c66; }
  }
  @keyframes skullBob {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-4px); }
  }
  @keyframes barGrow { from { width: 0; } }
  @keyframes streamScrollVert {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }

  .ov-panel {
    background: var(--panel-mid);
    border: 1px solid var(--ba-border);
    box-shadow: 0 0 12px rgba(180,20,0,0.06), inset 0 0 20px rgba(0,0,0,0.4);
    position: relative; overflow: hidden;
  }
  .ov-panel::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
    background-size: 200% 100%;
    animation: plasmaShimmer 5s linear infinite;
  }
  .ov-panel-hi .corner-tl, .ov-panel-hi .corner-tr,
  .ov-panel-hi .corner-bl, .ov-panel-hi .corner-br {
    animation: bracketPulse 4s ease-in-out infinite;
  }
  .ov-target-hover { transition: background 0.2s, box-shadow 0.2s; cursor: crosshair; }
  .ov-target-hover:hover {
    background: rgba(200,34,0,0.06);
    box-shadow: inset 0 0 15px rgba(200,34,0,0.12);
  }
  .ov-skull-active {
    background: rgba(204,34,0,0.07) !important;
    box-shadow: inset 0 0 18px rgba(204,34,0,0.2), 0 0 14px rgba(204,34,0,0.1) !important;
  }
  .glitch-crit { animation: scrapGlitch 2.5s infinite; }

  .ov-kpi-lbl { font-size: 9px; letter-spacing: 2px; color: var(--ba-gold-dim); text-transform: uppercase; margin-bottom: 4px; font-family: var(--mono); }
  .ov-kpi-sub { font-size: 8px; color: var(--ba-gold-mute); letter-spacing: 1px; margin-top: 4px; font-family: var(--mono); }
  .ov-kpi-val-lg { font-size: 32px; font-weight: bold; font-family: var(--mono); line-height: 1; }
  .ov-kpi-val-md { font-size: 22px; font-weight: bold; font-family: var(--mono); line-height: 1; }
  .ov-kpi-val-sm { font-size: 16px; font-weight: bold; font-family: var(--mono); line-height: 1; }
  .ov-kpi-green { color: var(--border-hi);  text-shadow: var(--glow); }
  .ov-kpi-red   { color: var(--ba-crimson); text-shadow: 0 0 10px rgba(204,34,0,0.6); }
  .ov-kpi-amber { color: var(--amber);      text-shadow: 0 0 8px rgba(234,179,8,0.5); }
  .ov-kpi-white { color: #fff; }
  .ov-kpi-muted { color: var(--ba-gold-dim); }

  .ov-ttl {
    font-size: 10px; font-family: var(--mono); letter-spacing: 2px;
    color: var(--ba-gold-dim); text-transform: uppercase;
    padding-bottom: 8px; margin-bottom: 10px;
    border-bottom: 1px solid var(--ba-border-lo);
    display: flex; align-items: center; justify-content: space-between;
  }
  .ov-ttl::after { content: '◈'; color: #4a0a00; font-size: 9px; }
  .ov-ttl:hover { animation: scrapGlitch 0.4s forwards; }

  .ov-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11px; }
  .ov-rl  { color: var(--ba-gold-mute); font-size: 10px; letter-spacing: 1px; }
  .ov-rv  { color: #fff; font-family: var(--mono); }
  .ov-rv.ok      { color: var(--border-hi); text-shadow: var(--glow); }
  .ov-rv.warn    { color: var(--amber); }
  .ov-rv.offline { color: var(--ba-crimson); }

  .ov-scroll-wrap { flex: 1; overflow: hidden; padding-right: 4px; }
  .ov-stream-marquee {
    display: flex; flex-direction: column;
    animation: streamScrollVert 28s linear infinite;
  }

  .ov-relay-row {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 7px 8px 7px 0; border-bottom: 1px solid #1a0500;
    font-size: 10px; font-family: var(--mono);
  }
  .ov-relay-meta { display: flex; flex-direction: column; gap: 2px; font-size: 9px; color: #4a2010; min-width: 48px; text-align: right; flex-shrink: 0; }
  .ov-relay-row.lore-ok   { border-left: 2px solid var(--border); padding-left: 6px; }
  .ov-relay-row.lore-crit { border-left: 2px solid #cc2200;       padding-left: 6px; }

  .ov-badge { padding: 2px 5px; font-size: 9px; font-weight: bold; letter-spacing: 1px; border-radius: 1px; flex-shrink: 0; align-self: flex-start; margin-top: 1px; }
  .ov-badge-tx   { background: rgba(26,93,44,0.3);   border: 1px solid var(--border); color: var(--border-hi); }
  .ov-badge-ok   { background: rgba(26,93,44,0.2);   border: 1px solid var(--border); color: var(--border-hi); }
  .ov-badge-r    { background: rgba(74,222,128,0.1); border: 1px solid #4ade80;       color: #4ade80; }
  .ov-badge-crit { background: rgba(204,34,0,0.2); border: 1px solid #cc2200; color: #cc2200; text-shadow: 0 0 6px #cc220099; animation: ovCritBlink 1s ease-in-out infinite; }
  .ov-amt-pos { color: var(--border-hi); text-shadow: var(--glow); }
  .ov-amt-neg { color: #cc2200; text-shadow: 0 0 8px #cc220077; }

  .ov-debt-warn { color: #cc2200; text-shadow: 0 0 12px #cc220099; animation: ovDebtPulse 1.5s ease-in-out infinite; }
  .ov-debt-ok   { color: var(--border-hi); text-shadow: var(--glow); }

  .ov-bar-track { width: 100%; height: 3px; background: rgba(74,10,0,0.4); border-radius: 1px; overflow: hidden; }
  .ov-bar-fill  { height: 100%; background: var(--ba-crimson); box-shadow: 0 0 4px var(--ba-crimson); animation: barGrow 0.8s ease-out; }

  .ov-ar-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; border-bottom: 1px dashed rgba(74,10,0,0.3); font-size: 10px;
  }
  .ov-ar-tag { color: var(--ba-gold-dim); letter-spacing: 1px; text-transform: uppercase; }
  .ov-ar-amt { color: var(--border-hi); font-weight: bold; font-family: var(--mono); }

  .skull-dock {
    width: 68px; height: 68px; position: relative; flex-shrink: 0;
    border: 1px dashed rgba(74,222,128,0.22);
    background: radial-gradient(circle, rgba(74,222,128,0.08), transparent 65%);
  }
  .skull-dock-ring {
    position: absolute; inset: 10px;
    border: 1px solid rgba(201,168,76,0.26);
    box-shadow: inset 0 0 12px rgba(0,0,0,0.8), 0 0 10px rgba(74,222,128,0.08);
  }
  .ov-skull-sweep {
    position: absolute; left: 50%; top: 55px; width: 2px; height: 90px;
    background: #4ade80; box-shadow: 0 0 12px 2px #4ade80;
    transform: translateX(-50%); z-index: -1;
    animation: ovScanPulse 0.7s ease-in-out infinite alternate;
  }
  .ov-skull-laser {
    position: absolute; top: 36px; width: 190px; height: 2px;
    box-shadow: 0 0 10px 2px rgba(204,34,0,0.8);
    z-index: -1;
    animation: ovLaserPulse 0.55s ease-in-out infinite alternate;
  }
  .ov-skull-laser.to-left {
    right: 45px;
    background: linear-gradient(270deg, #cc2200 0%, rgba(204,34,0,0) 100%);
    transform-origin: right center;
  }
  .ov-skull-laser.to-right {
    left: 45px;
    background: linear-gradient(90deg, #cc2200 0%, rgba(204,34,0,0) 100%);
    transform-origin: left center;
  }
  @keyframes ovScanPulse {
    from { height: 62px; opacity: 0.55; }
    to   { height: 112px; opacity: 0.95; }
  }
  @keyframes ovLaserPulse {
    from { opacity: 0.55; filter: brightness(0.85); }
    to   { opacity: 1; filter: brightness(1.35); }
  }
  .skull-bob { animation: skullBob 4s ease-in-out infinite; }
  .ov-noosphere-ttl::after { display: none; }

  .ov-wm {
    position: absolute; inset: 0; pointer-events: none;
    background-repeat: no-repeat; background-position: center; background-size: 55%;
    opacity: 0.045; z-index: 0;
  }
`;

const LORE = {
  crit: {
    opener:   ['SCRAP-CODE INFLUX DETECTED.','HERETEK DATA-SPOOR DETECTED.','NOOSPHERIC CONTAMINATION CONFIRMED.','COGITATOR SEIZURE EVENT DETECTED.'],
    detail:   ['ORIGIN UNKNOWN.','SOURCE MASKED BY STATIC.','OUTER RELAYS REPORT CORRUPTION.','MACHINE-SPIRIT DISTRESS RESPONSES ESCALATING.'],
    response: ['MAGOS VENERATUS NOTIFIED.','PURGE RITES COMMENCING.','SANCTIFIED FIREWALLS ENGAGED.','DATA-LOOMS SEALED.'],
    blood:    ['CORBULO SUMMONED.','RED THIRST INDEX ESCALATING.','DEATH COMPANY WATCH INITIATED.','CHAPLAINCY ALERT STATUS RAISED.'],
    closing:  ['OMNISSIAH PRESERVE THIS ENGINE.','SANGUINIUS WATCHES IN SILENCE.','ALL NON-SANCTIONED ACCESS REVOKED.'],
  },
  ok: {
    opener:   ['AUSPEX SWEEP COMPLETE.','DIAGNOSTIC CANTICLE COMPLETE.','RECONCILIATION RITE COMPLETE.','COGITATOR BENEDICTION COMPLETE.'],
    detail:   ['NO CHAOS SIGNATURE DETECTED.','HOSTILE TRACE NEGATIVE.','NO HERETEK SPOOR IDENTIFIED.','WARP ECHO ABSENT.'],
    response: ['MACHINE-SPIRIT CALM.','NOOSPHERIC LINK STABLE.','PRIMARY RELAYS OPERATING WITHIN TOLERANCE.','AUSPEX RETURNS CLEAN.'],
    blood:    ['BAALITE VAULTS SECURE.','SANGUINIUS WATCHES.','RED THIRST CONTAINED.','THE IX LEGION ENDURES.'],
    closing:  ['GLORY TO THE ANGEL.','PRAISE THE OMNISSIAH.','ALL SYSTEMS REMAIN LOYAL.'],
  },
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── Main ──────────────────────────────────────────────────────
const OverviewSlide = ({ data, syncLed, dbTransactions, userId }) => {
  const slideRef = useRef(null);
  const skullDockRef = useRef(null);
  const txns         = data?.transactions       || [];
  const metrics      = data?.metrics            || {};
  const buckets      = data?.buckets            || {};
  const positiveCats = data?.positiveCategories || [];
  const neutralCats  = data?.neutralCategories  || [];

  const income     = metrics.grossIncome  || 0;
  const expense    = metrics.grossExpense || 0;
  const netIncome  = metrics.netIncome    || 0;
  const netExpense = metrics.netExpense   || 0;

  const bankTotal  = buckets.Bank || 0;
  const cashTotal  = buckets.Cash || 0;
  const cardTotal  = buckets.Card || 0;
  const ar         = buckets.AR          || 0;
  const provisions = buckets.Provisions  || 0;

  const liquidReserve  = bankTotal + cashTotal;
  const netPosition    = liquidReserve - cardTotal;
  const totalCardLimit = (data?.cards || []).reduce((sum, c) => sum + (c.limit || 0), 0);
  const creditHeadroom = Math.max(0, totalCardLimit - cardTotal);

  const formatDate = (ds) => {
    if (!ds) return 'NO DEBT DETECTED';
    const d = new Date(ds);
    if (isNaN(d)) return ds;
    const day = d.getDate();
    const mon = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
    const sfx = ['th','st','nd','rd'];
    const v = day % 100;
    return day + (sfx[(v-20)%10] || sfx[v] || sfx[0]) + ' ' + mon;
  };
  const nextBucket = data?.cardObligations?.buckets?.find(b => b.status !== 'paid') || {};
  const ccDueAmt   = nextBucket.outstanding || 0;
  const ccDueDate  = nextBucket.due_date ? formatDate(nextBucket.due_date) : 'NO DEBT DETECTED';

  const bankAccounts = (data?.accounts || []).filter(a => a.parent === 'Bank');
  let maxDays = 0;
  if (bankAccounts.length > 0) {
    maxDays = Math.max(...bankAccounts.map(acc => {
      const last = acc.last_audited_date || new Date(Date.now() - 86400000 * 8).toISOString();
      return Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 86400000));
    }));
  }
  const globalAuditState = maxDays >= 7 ? 'CORRUPTED' : maxDays >= 4 ? 'RESTLESS' : 'PURE';
  const auditColor       = globalAuditState === 'CORRUPTED' ? '#cc2200' : globalAuditState === 'RESTLESS' ? '#eab308' : 'var(--border-hi)';
  const isGlobalCrit     = globalAuditState === 'CORRUPTED';

  const catSpend = {};
  txns.forEach(tx => {
    const cat = tx.category || 'UNCATEGORIZED';
    const tag = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
    if (!positiveCats.includes(cat) && !neutralCats.includes(cat) && !tag) {
      catSpend[cat] = (catSpend[cat] || 0) + Math.abs(tx.amount || 0);
    }
  });
  const topCats = Object.entries(catSpend).sort((a,b) => b[1]-a[1]).slice(0, 5);

  const arByTag = data?.arByTag && Object.keys(data.arByTag).length > 0
    ? data.arByTag
    : (() => {
        const local = {};
        txns.forEach(tx => {
          const tag       = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
          const isReceipt = tx.category === 'Reimbursement Received';
          
          if (!tag && !isReceipt) return;
          
          const effectiveTag = (tag || 'untagged').toString().toLowerCase().trim();
          const amt          = Math.abs(tx.amount || 0);
          
          if (isReceipt) {
            // THE LEFTOVER MATH.MAX AND DELETE WERE WIPED OUT FROM HERE
            local[effectiveTag] = (local[effectiveTag] || 0) - amt;
          } else {
            local[effectiveTag] = (local[effectiveTag] || 0) + amt;
          }
        });
        return local;
      })();
      
  const openAR = Object.entries(arByTag).filter(([,a]) => a > 0).sort((a,b) => b[1]-a[1]);

  const handleClearAR = useCallback(async (tag, amt) => {
    if (!dbTransactions || !userId) return;
    const suffix  = Math.random().toString(36).substring(2, 10);
    const today   = new Date().toISOString().split('T')[0];
    const defAcct = data?.accounts?.find(a => a.is_default && a.parent === 'Bank')?._id?.split(':').pop() || 'bank_hdfc';
    await dbTransactions.put({
      _id:               `txn:${userId}:${today}:${suffix}`,
      type:              'transaction', user_id: userId,
      date:              today,
      description:       `Reimbursement from ${tag}`,
      amount:            Math.round(amt),
      category:          'Reimbursement Received',
      account_type:      'Bank', sub_account: defAcct,
      reimbursement_tag: tag, notes: null,
      created_at:        new Date().toISOString(),
    });
  }, [dbTransactions, userId, data]);

  const recentTxns = txns.slice(0, 12);
  const streamData = [];
  recentTxns.forEach((tx, i) => {
    const hexId   = tx._id ? `0X${tx._id.slice(-4).toUpperCase()}` : '0X0000';
    const timeStr = `${String(Math.floor(Math.random()*24)).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
    streamData.push({ type: 'tx', id: hexId, time: timeStr, data: tx });
    if (i % 3 === 0) {
      const isCrit = Math.random() > 0.6;
      const pool   = isCrit ? LORE.crit : LORE.ok;
      streamData.push({
        type: 'lore',
        id: `0X${Math.floor(Math.random()*65535).toString(16).toUpperCase().padStart(4,'0')}`,
        time: timeStr, status: isCrit ? 'CRIT' : 'OK',
        text: [pick(pool.opener), pick(pool.detail), pick(pool.response), pick(pool.blood),
               ...(Math.random() > 0.45 ? [pick(pool.closing)] : [])].join(' '),
      });
    }
  });

  const resolveAcc = (subId) => {
    if (!subId) return 'UNKNOWN';
    if (subId === 'cash_main') return 'CASH';
    const card = (data?.cards || []).find(c => c._id?.split(':').pop() === subId);
    if (card) return card.name.toUpperCase();
    const acc = (data?.accounts || []).find(a => a._id?.split(':').pop() === subId);
    if (acc) return acc.name.toUpperCase();
    return subId.toUpperCase();
  };

  return (
    <>
      <style>{OV_STYLES}</style>
      <div ref={slideRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px', position: 'relative' }}>
        <ServoSkullOverview
          syncLed={syncLed}
          globalAuditState={globalAuditState}
          slideRef={slideRef}
          dockRef={skullDockRef}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr 0.8fr', gap: '10px', flexShrink: 0 }}>
          <div className="ov-panel ov-panel-hi ov-target-hover" style={{ padding: '14px 18px', position: 'relative' }}>
            <span className="corner-tl"/><span className="corner-tr"/>
            <span className="corner-bl"/><span className="corner-br"/>
            
            <img 
              src="/purity_seal.jpg" 
              alt="Sanctified Purity Seal" 
              style={{ 
                position: 'absolute', 
                top: '-4px', 
                right: '12px', 
                width: '38px', 
                zIndex: 10, 
                filter: 'drop-shadow(2px 4px 5px rgba(0,0,0,0.85))',
                pointerEvents: 'none'
              }} 
            />

            <div className="ov-kpi-lbl" style={{ color: 'var(--border-hi)' }}>LIQUID RESERVE</div>
            <div className="ov-kpi-val-lg ov-kpi-green">
              ₹ <ScrambleText text={liquidReserve.toLocaleString()} />
            </div>
            <div className="ov-kpi-sub">BANK + CASH · REAL MONEY</div>
          </div>

          <div className="ov-panel ov-target-hover" style={{ padding: '14px 16px' }}>
            <div className="ov-kpi-lbl">NET POSITION</div>
            <div className={`ov-kpi-val-md ${netPosition >= 0 ? 'ov-kpi-green' : 'ov-kpi-red'}`}>
              ₹ <ScrambleText text={netPosition.toLocaleString()} />
            </div>
            <div className="ov-kpi-sub">LIQUID − DEBT</div>
          </div>

          <div className="ov-panel ov-target-hover" style={{ padding: '14px 16px' }}>
            <div className="ov-kpi-lbl" style={{ color: 'var(--amber)' }}>CREDIT HEADROOM</div>
            <div className="ov-kpi-val-md ov-kpi-amber">
              ₹ <ScrambleText text={creditHeadroom.toLocaleString()} />
            </div>
            <div className="ov-kpi-sub">LIMIT − UTILISED</div>
          </div>

          <div className="ov-panel ov-target-hover" style={{ padding: '12px 14px' }}>
            <div className="ov-kpi-lbl">TITHE INFLOW</div>
            <div className="ov-kpi-val-md ov-kpi-green">
              ₹ <ScrambleText text={income.toLocaleString()} />
            </div>
          </div>

          <div className="ov-panel ov-target-hover" style={{ padding: '12px 14px' }}>
            <div className="ov-kpi-lbl">EXPENDITURE</div>
            <div className="ov-kpi-val-md ov-kpi-red">
              ₹ <ScrambleText text={expense.toLocaleString()} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.5fr 1fr', gap: '10px', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="ov-panel" style={{ padding: '12px 14px' }}>
              <div className="ov-ttl">SYSTEM UPLINK</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div ref={skullDockRef} className="skull-dock">
                  <div className="skull-dock-ring" />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="ov-row">
                    <span className="ov-rl">CYCLE</span>
                    <span className="ov-rv" style={{ fontSize: '10px' }}>
                      <ScrambleText text={new Date().toLocaleDateString('en-GB')} />
                    </span>
                  </div>
                  <div className="ov-row">
                    <span className="ov-rl">UPLINK</span>
                    <span className={`ov-rv ${syncLed === 'ok' ? 'ok' : syncLed === 'offline' ? 'offline' : 'warn'}`}>
                      ◈ {syncLed === 'ok' ? 'ESTABLISHED' : syncLed === 'offline' ? 'NO SIGNAL' : syncLed === 'error' ? 'SEVERED' : 'AWAITING'}
                    </span>
                  </div>
                  <div className="ov-row">
                    <span className="ov-rl">PURITY</span>
                    <span className={isGlobalCrit ? 'glitch-crit' : ''} style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: auditColor }}>
                      ◈ {globalAuditState}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ov-panel ov-target-hover" style={{ padding: '12px 14px' }}>
              <div className="ov-ttl">OBLIGATIONS</div>
              <div style={{ textAlign: 'center' }}>
                <div className="ov-kpi-lbl" style={{ marginBottom: '4px' }}>NEXT RITUAL DUE</div>
                <div style={{ fontSize: '16px', color: ccDueAmt > 0 ? '#e0c070' : 'var(--border-hi)', fontWeight: 'bold', fontFamily: 'var(--mono)', marginBottom: '10px' }}>
                  <ScrambleText text={ccDueDate} />
                </div>
                <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, #4a0a00, transparent)', marginBottom: '10px' }} />
                <div className="ov-kpi-lbl" style={{ color: ccDueAmt > 0 ? '#cc2200' : 'var(--ba-gold-dim)' }}>BLOOD DEBT</div>
                <div className={ccDueAmt > 0 ? 'ov-debt-warn glitch-crit' : 'ov-debt-ok'} style={{ fontSize: '26px', fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                  ₹ <ScrambleText text={ccDueAmt.toLocaleString()} />
                </div>
              </div>
            </div>

            <div className="ov-panel ov-panel-hi" style={{ padding: '12px 14px', position: 'relative' }}>
              <span className="corner-tl"/><span className="corner-tr"/>
              <span className="corner-bl"/><span className="corner-br"/>
              <div className="ov-wm" style={{ backgroundImage: "url('/the-emperor-protects-1.jpg')" }} />
              <div className="ov-ttl" style={{ position: 'relative', zIndex: 1 }}>ADJUSTED LEDGER</div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <div className="ov-kpi-lbl">NET INCOME</div>
                  <div className="ov-kpi-val-sm ov-kpi-green">₹ <ScrambleText text={netIncome.toLocaleString()} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div className="ov-kpi-lbl">NET SPEND</div>
                  <div className="ov-kpi-val-sm ov-kpi-red">₹ <ScrambleText text={netExpense.toLocaleString()} /></div>
                </div>
              </div>
            </div>
          </div>

          <div className="ov-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 6px 12px 14px' }}>
            <div className="ov-ttl ov-noosphere-ttl" style={{ marginRight: '10px' }}>
              <span>NOOSPHERE RELAY</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: 'auto' }}>
                {['var(--border-hi)', '#eab308', '#cc2200'].map((c,i) => (
                  <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}`, display: 'inline-block' }} />
                ))}
              </div>
            </div>
            <div style={{ fontSize: '9px', color: '#4a2010', borderBottom: '1px solid #2a0800', paddingBottom: '6px', marginBottom: '8px', marginRight: '10px', letterSpacing: '1px' }}>
              ◈ UPLINK SECURE · SECTOR 7-ALPHA · STREAM ACTIVE
            </div>
            <div className="ov-scroll-wrap">
              <div className="ov-stream-marquee">
                {[...streamData, ...streamData].map((item, i) => {
                  if (item.type === 'lore') {
                    const isCrit = item.status === 'CRIT';
                    return (
                      <div key={i} className={`ov-relay-row ${isCrit ? 'lore-crit' : 'lore-ok'}`}>
                        <div className="ov-relay-meta"><span>{item.time}</span><span>{item.id}</span></div>
                        <span className={`ov-badge ${isCrit ? 'ov-badge-crit' : 'ov-badge-ok'}`}>{item.status}</span>
                        <div className={isCrit ? 'glitch-crit' : ''} style={{ flex: 1, color: isCrit ? '#cc2200' : 'var(--text-m)', textTransform: 'uppercase', lineHeight: '1.4' }}>
                          {item.text}
                        </div>
                      </div>
                    );
                  }
                  const tx     = item.data;
                  const isNeg  = tx.amount < 0;
                  const isR    = !!(tx.reimbursement_tag || tx.is_reimbursable);
                  const effectiveTag = (tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null))?.toString().toUpperCase();
                  return (
                    <div key={i} className="ov-relay-row">
                      <div className="ov-relay-meta"><span>{item.time}</span><span>{item.id}</span></div>
                      <span className="ov-badge ov-badge-tx">TX</span>
                      {isR && <span className="ov-badge ov-badge-r">R</span>}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textTransform: 'uppercase' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ color: '#fff' }}>{tx.description || tx.category}</span>
                          <span style={{ color: '#3a0800' }}>—</span>
                          <span className={isNeg ? 'ov-amt-neg' : 'ov-amt-pos'}>
                            {isNeg ? '' : '+'}₹{Math.abs(tx.amount || 0).toLocaleString()}
                          </span>
                          <span style={{ color: '#4a2010', fontSize: '9px' }}>{tx.category}</span>
                        </div>
                        <div style={{ color: '#4a2010', fontSize: '9px' }}>
                          VIA {resolveAcc(tx.sub_account)}
                          {isR && <span style={{ color: '#4ade8055', marginLeft: '8px' }}>[R: {effectiveTag}]</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="ov-panel ov-target-hover" style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div className="ov-wm" style={{ backgroundImage: "url('/cog.jpeg')" }} />
              <div className="ov-ttl" style={{ position: 'relative', zIndex: 1 }}>EXPENDITURE VECTORS</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: '8px', position: 'relative', zIndex: 1 }}>
                {topCats.length > 0 ? topCats.map(([cat, amt]) => {
                  const pct = Math.min((amt / (topCats[0]?.[1] || 1)) * 100, 100);
                  return (
                    <div key={cat}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--ba-gold-dim)', letterSpacing: '1px', marginBottom: '3px' }}>
                        <span>{cat.toUpperCase()}</span>
                        <span style={{ color: 'var(--text-d)' }}>₹ {amt.toLocaleString()}</span>
                      </div>
                      <div className="ov-bar-track">
                        <div className="ov-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                }) : <div style={{ fontSize: '10px', color: '#7a4a20', textAlign: 'center' }}>NO OUTFLOW DETECTED</div>}
              </div>
            </div>

            <div className="ov-panel" style={{ padding: '12px 14px', flexShrink: 0 }}>
              <div className="ov-ttl">RECOVERY MANIFEST</div>
              {openAR.length > 0 ? (
                <>
                  {openAR.slice(0, 4).map(([tag, amt]) => (
                    <div key={tag} className="ov-ar-row">
                      <span className="ov-ar-tag">{tag}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="ov-ar-amt">₹ {Math.round(amt).toLocaleString()}</span>
                        {dbTransactions && (
                          <button
                            onClick={() => handleClearAR(tag, amt)}
                            style={{
                              background: 'transparent', border: '1px solid var(--border)',
                              color: 'var(--text-d)', fontFamily: 'var(--mono)', fontSize: '8px',
                              padding: '2px 5px', cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { e.target.style.borderColor = 'var(--border-hi)'; e.target.style.color = '#fff'; }}
                            onMouseLeave={e => { e.target.style.borderColor = 'var(--border)';    e.target.style.color = 'var(--text-d)'; }}
                          >CLEAR</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--ba-border-lo)', fontSize: '10px' }}>
                    <span style={{ color: 'var(--ba-gold-mute)', letterSpacing: '1px' }}>TOTAL OUTSTANDING</span>
                    <span style={{ color: 'var(--border-hi)', fontWeight: 'bold', fontFamily: 'var(--mono)' }}>
                      ₹ {Math.round(openAR.reduce((s,[,a]) => s+a, 0)).toLocaleString()}
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '10px', color: '#7a4a20', textAlign: 'center', padding: '10px 0' }}>
                  ALL DEBTS CLEARED
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flexShrink: 0 }}>
              <div className="ov-panel ov-target-hover" style={{ padding: '10px 12px' }}>
                <div className="ov-kpi-lbl">PENDING AR</div>
                <div className="ov-kpi-val-sm ov-kpi-green">₹ <ScrambleText text={openAR.reduce((s,[,a]) => s+a, 0).toLocaleString()} /></div>
              </div>
              <div className="ov-panel ov-target-hover" style={{ padding: '10px 12px' }}>
                <div className="ov-kpi-lbl">PROVISIONS</div>
                <div className="ov-kpi-val-sm ov-kpi-white">₹ <ScrambleText text={provisions.toLocaleString()} /></div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default OverviewSlide;
