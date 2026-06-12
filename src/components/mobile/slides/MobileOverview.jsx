// src/components/slides/mobile/MobileOverview.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { localDateStr } from '../../../utils/localDate';
import ScrambleText from '../../shared/ScrambleText';
import LoreTicker from '../../shared/LoreTicker';

// ─────────────────────────────────────────────────────────────────────────────
// SERVO SKULL 3D VIEWER  (ported 1:1 from OverviewSlide, mobile sizing)
// ─────────────────────────────────────────────────────────────────────────────
const ServoSkullViewer = ({ syncLed, auditState, slideRef, dockRef }) => {
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
        ? elRect.right - slideRect.left + 8
        : elRect.left - slideRect.left - 72;
    const rawY = mode === 'dock'
      ? elRect.top - slideRect.top
      : elRect.top - slideRect.top + Math.max(0, (elRect.height - 64) / 2);

    activeTargetRef.current?.classList.remove('mo-skull-active');
    if (mode === 'dock') {
      activeTargetRef.current = null;
    } else {
      element.classList.add('mo-skull-active');
      activeTargetRef.current = element;
    }

    setSkullMode(mode);
    setPosition({
      x: Math.max(2, Math.min(slideRect.width - 66, rawX)),
      y: Math.max(2, Math.min(slideRect.height - 66, rawY)),
    });
  }, [slideRef]);

  const moveToDock = useCallback(() => {
    activeTargetRef.current?.classList.remove('mo-skull-active');
    activeTargetRef.current = null;
    moveToElement(dockRef.current, 'dock');
  }, [dockRef, moveToElement]);

  useEffect(() => {
    import('@google/model-viewer');

    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', '/servo-skull_warhammer.glb');
    mv.setAttribute('camera-orbit', '0deg 75deg 2.5m');
    mv.setAttribute('disable-zoom', '');
    mv.setAttribute('interaction-prompt', 'none');

    Object.assign(mv.style, {
      width:                    '100%',
      height:                   '100%',
      position:                 'absolute',
      top:                      0,
      left:                     0,
      backgroundColor:          'transparent',
      '--progress-bar-color':   'transparent',
      '--progress-bar-height':  '0px',
      transition:               'filter 1s ease',
    });

    containerRef.current.appendChild(mv);
    mvRef.current = mv;

    return () => {
      if (mvRef.current && containerRef.current?.contains(mvRef.current)) {
        containerRef.current.removeChild(mvRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mvRef.current) return;
    if (skullMode === 'scan' || skullMode === 'focus') {
      mvRef.current.style.filter = 'sepia(1) saturate(6) hue-rotate(-28deg) brightness(1.25) drop-shadow(0 0 10px rgba(204,34,0,0.85))';
    } else if (skullMode === 'glitch' || syncLed !== 'ok' || auditState === 'CORRUPTED') {
      mvRef.current.style.filter = 'sepia(1) saturate(5) hue-rotate(-30deg) brightness(0.65) drop-shadow(0 0 8px rgba(204,34,0,0.8))';
    } else if (auditState === 'RESTLESS') {
      mvRef.current.style.filter = 'sepia(1) saturate(3) hue-rotate(-10deg) brightness(0.8) drop-shadow(0 0 5px rgba(255,165,0,0.4))';
    } else {
      mvRef.current.style.filter = 'sepia(1) saturate(4) hue-rotate(85deg) brightness(0.75)';
    }
  }, [syncLed, auditState, skullMode]);

  useEffect(() => {
    let t = 0;
    const iv = setInterval(() => {
      if (!mvRef.current) return;
      t += 0.018;
      let theta, phi;
      switch (skullMode) {
        case 'scan':
          theta = (beamSide === 'right' ? -125 : 125) + Math.sin(t * 1.6) * 7;
          phi = 76 + Math.sin(t * 1.2 + 0.9) * 4;
          break;
        case 'focus':
          theta = (beamSide === 'right' ? -145 : 145) + Math.sin(t * 0.8) * 4;
          phi = 74 + Math.sin(t * 0.5) * 2;
          break;
        case 'glitch':
          theta = (Math.random() - 0.5) * 180;
          phi = 55 + Math.random() * 50;
          break;
        default:
          theta = Math.sin(t) * 38;
          phi = 80 + Math.sin(t * 0.4 + 1.2) * 7;
      }
      mvRef.current.setAttribute('camera-orbit', `${theta}deg ${phi}deg 2.5m`);
    }, 50);

    return () => clearInterval(iv);
  }, [beamSide, skullMode]);

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
      const targets = [...slideRef.current.querySelectorAll('.mo-panel, .mo-relay-row, .mo-ar-row')]
        .filter(el => el !== dockRef.current && !el.contains(dockRef.current))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
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
        const visibleTargets = targets.filter(target => {
          const rect = target.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        });
        const available = visibleTargets.filter(target => !usedTargets.has(target));
        const pool = available.length > 0 ? available : visibleTargets.length > 0 ? visibleTargets : targets;
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
      activeTargetRef.current?.classList.remove('mo-skull-active');
    };
  }, [dockRef, moveToDock, moveToElement, slideRef]);

  const badgeColor = auditState === 'CORRUPTED' ? '#cc2200'
    : syncLed === 'offline'     ? '#cc2200'
    : syncLed === 'warn'        ? '#eab308'
    : auditState === 'RESTLESS' ? '#eab308'
    : '#4ade80';
  const badgeText = auditState === 'CORRUPTED' ? 'CORR'
    : syncLed === 'offline'     ? 'LINK'
    : syncLed === 'warn'        ? 'WARN'
    : auditState === 'RESTLESS' ? 'WARN'
    : 'PURE';

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '64px',
      height: '64px',
      transform: `translate(${position.x}px, ${position.y}px)`,
      transition: 'transform 7.5s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 60,
      pointerEvents: 'none',
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', borderRadius: '2px' }} />
      {(skullMode === 'scan' || skullMode === 'focus') && <div className={`mo-skull-laser ${beamSide === 'right' ? 'to-right' : 'to-left'}`} />}
      <div style={{
        position: 'absolute', bottom: '3px', left: 0, right: 0,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 5,
      }}>
        <span style={{
          fontSize: '7px', fontFamily: 'var(--mono)', fontWeight: 'bold',
          letterSpacing: '2px', padding: '1px 5px',
          background: 'rgba(0,0,0,0.75)',
          color: badgeColor,
          textShadow: `0 0 6px ${badgeColor}99`,
        }}>
          {skullMode === 'scan' ? 'SCAN' : skullMode === 'focus' ? 'LOCK' : skullMode === 'glitch' ? 'ERR' : badgeText}
        </span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
  /* ── Plasma shimmer on panel top-rule ── */
  @keyframes plasmaShimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }

  /* ── Glitch ── */
  @keyframes scrapGlitch {
    0%, 96% { transform: translate(0, 0); text-shadow: none; }
    97%     { transform: translate(-2px,  1px); text-shadow: 2px 0 cyan, -2px 0 red; }
    98%     { transform: translate( 2px, -1px); text-shadow: -2px 0 cyan, 2px 0 red; }
    99%     { transform: translate(0, 0); text-shadow: none; }
  }
  .glitch-crit { animation: scrapGlitch 2.5s infinite; }

  /* ── Debt pulse ── */
  @keyframes ovDebtPulse {
    0%, 100% { opacity: 1;    text-shadow: 0 0 10px #cc220099; }
    50%      { opacity: 0.65; text-shadow: 0 0 20px #cc2200cc; }
  }
  .ov-debt-warn { color: #cc2200; text-shadow: 0 0 12px #cc220099; animation: ovDebtPulse 1.5s ease-in-out infinite; }
  .ov-debt-ok   { color: var(--border-hi); text-shadow: var(--glow); }

  @keyframes ovCritBlink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }

  /* ── Stream marquee ── */
  @keyframes streamScrollVert {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
  .ov-stream-marquee {
    display: flex;
    flex-direction: column;
    animation: streamScrollVert 28s linear infinite;
  }

  /* ── Panel chrome ── */
  .mo-panel {
    background: rgba(4, 1, 1, 0.85);
    border: 1px solid #2a0800;
    box-shadow: 0 0 12px rgba(180,20,0,0.08), inset 0 0 20px rgba(0,0,0,0.4);
    position: relative;
    overflow: hidden;
    padding: 12px 14px;
  }
  /* Gold plasma shimmer on top edge */
  .mo-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, #c9a84c22, #c9a84cbb, #c9a84c22, transparent);
    background-size: 200% 100%;
    animation: plasmaShimmer 5s linear infinite;
  }
  .mo-skull-active {
    background: rgba(204,34,0,0.07) !important;
    box-shadow: inset 0 0 18px rgba(204,34,0,0.2), 0 0 14px rgba(204,34,0,0.1) !important;
  }
  .mo-skull-dock {
    width: 64px; height: 64px; position: relative; flex-shrink: 0;
    border: 1px dashed rgba(74,222,128,0.22);
    background: radial-gradient(circle, rgba(74,222,128,0.08), transparent 65%);
    box-shadow: inset 0 0 12px rgba(0,0,0,0.9);
  }
  .mo-skull-dock::after {
    content: ''; position: absolute; inset: 9px;
    border: 1px solid rgba(201,168,76,0.26);
    box-shadow: inset 0 0 12px rgba(0,0,0,0.8), 0 0 10px rgba(74,222,128,0.08);
  }
  .mo-skull-laser {
    position: absolute; top: 34px; width: 142px; height: 2px;
    box-shadow: 0 0 10px 2px rgba(204,34,0,0.8);
    z-index: -1;
    animation: moLaserPulse 0.55s ease-in-out infinite alternate;
  }
  .mo-skull-laser.to-left {
    right: 42px;
    background: linear-gradient(270deg, #cc2200 0%, rgba(204,34,0,0) 100%);
    transform-origin: right center;
  }
  .mo-skull-laser.to-right {
    left: 42px;
    background: linear-gradient(90deg, #cc2200 0%, rgba(204,34,0,0) 100%);
    transform-origin: left center;
  }
  @keyframes moLaserPulse {
    from { opacity: 0.55; filter: brightness(0.85); }
    to   { opacity: 1; filter: brightness(1.35); }
  }

  /* ── Panel title ── */
  .mo-ttl {
    font-size: 9px;
    font-family: var(--mono, monospace);
    letter-spacing: 3px;
    color: #b8923e;
    text-shadow: 0 0 8px #b8923e44;
    text-transform: uppercase;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 1px solid #3a0800;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .mo-ttl::after { content: '◈'; color: #4a0a00; font-size: 8px; }

  /* ── KPI value styles ── */
  .mo-val {
    font-family: var(--mono, monospace);
    font-weight: bold;
    color: var(--border-hi, #4ade80);
    text-shadow: var(--glow, 0 0 8px #4ade80);
    line-height: 1;
  }
  .mo-val.expense { color: #cc2200; text-shadow: 0 0 10px #cc220077; }
  .mo-val.ok      { color: #4ade80; text-shadow: 0 0 10px #4ade8077; }
  .mo-val.white   { color: #ffffff; }

  /* ── Corner bracket decoration (animated) ── */
  @keyframes bracketPulse {
    0%, 100% { box-shadow: 0 0 4px #c9a84c44; border-color: #c9a84c; }
    50%      { box-shadow: 0 0 12px #c9a84c99; border-color: #ffe082; }
  }
  .mo-cornered::after, .mo-cornered::before {
    content: ''; position: absolute; width: 10px; height: 10px; border-style: solid; z-index: 6;
    animation: bracketPulse 4s ease-in-out infinite;
  }
  .mo-cornered::before { top: 0;    left: 0;  border-width: 2px 0 0 2px; }
  .mo-cornered::after  { bottom: 0; right: 0; border-width: 0 2px 2px 0; }

  /* ── Relay stream ── */
  .mo-relay-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid #1a0500;
    font-size: 9px;
    font-family: var(--mono, monospace);
  }
  .mo-relay-row.lore-ok   { border-left: 2px solid var(--border, #1a5d2c); padding-left: 8px; }
  .mo-relay-row.lore-crit { border-left: 2px solid #cc2200;                padding-left: 8px; }
  .mo-relay-meta {
    display: flex; flex-direction: column; gap: 2px;
    font-size: 8px; color: #4a2010; min-width: 42px; flex-shrink: 0; text-align: right;
  }

  /* ── Badges ── */
  .mo-badge { padding: 2px 4px; font-size: 8px; font-weight: bold; border-radius: 1px; flex-shrink: 0; align-self: flex-start; margin-top: 1px; }
  .mo-badge-tx   { background: rgba(26,93,44,0.3);  border: 1px solid var(--border, #1a5d2c); color: var(--border-hi, #4ade80); }
  .mo-badge-ok   { background: rgba(26,93,44,0.2);  border: 1px solid var(--border, #1a5d2c); color: var(--border-hi, #4ade80); }
  .mo-badge-crit { background: rgba(204,34,0,0.2);  border: 1px solid #cc2200; color: #cc2200;
                   text-shadow: 0 0 6px #cc220099; animation: ovCritBlink 1s ease-in-out infinite; }

  .mo-amt-pos { color: var(--border-hi, #4ade80); text-shadow: var(--glow, 0 0 8px #4ade80); }
  .mo-amt-neg { color: #cc2200; text-shadow: 0 0 8px #cc220077; }

  /* ── Status rows (uplink panel) ── */
  .mo-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 10px; font-family: var(--mono, monospace); }
  .mo-rl  { color: #b8923e; font-size: 9px; letter-spacing: 1px; }
  .mo-rv  { color: #fff; }
  .mo-rv.ok   { color: var(--border-hi, #4ade80); text-shadow: var(--glow); }
  .mo-rv.warn { color: #eab308; text-shadow: 0 0 8px #eab30877; }

  /* ── AR Recovery rows ── */
  .mo-ar-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 0; border-bottom: 1px dashed rgba(74,10,0,0.35); font-size: 10px;
  }
  .mo-ar-tag { color: #b8923e; letter-spacing: 1px; text-transform: uppercase; font-family: var(--mono, monospace); }
  .mo-ar-amt { color: #e0c070; font-weight: bold; font-family: var(--mono, monospace); text-shadow: 0 0 6px rgba(224,192,112,0.35); }
  .mo-ar-clear {
    background: transparent; border: 1px solid #2a0800; color: #4a2010;
    font-family: var(--mono, monospace); font-size: 8px; padding: 3px 7px;
    cursor: pointer; letter-spacing: 1px; transition: border-color 0.2s, color 0.2s;
  }
  .mo-ar-clear:active { border-color: var(--border-hi, #4ade80); color: #fff; }

  /* ── KPI colour variants ── */
  .mo-val.amber  { color: #eab308; text-shadow: 0 0 8px #eab30877; }
  .mo-val.red    { color: #cc2200; text-shadow: 0 0 10px #cc220077; }

  /* ── Horizontal divider ── */
  .mo-divider {
    width: 100%; height: 1px;
    background: linear-gradient(90deg, transparent, #4a0a00, transparent);
    margin: 10px 0;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// LORE POOLS  (identical to desktop)
// ─────────────────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const LORE = {
  crit: {
    opener:  ['SCRAP-CODE INFLUX DETECTED.','HERETEK DATA-SPOOR DETECTED.','NOOSPHERIC CONTAMINATION CONFIRMED.','BINHARIC LITANY FAILURE REGISTERED.','COGITATOR SEIZURE EVENT DETECTED.'],
    detail:  ['ORIGIN UNKNOWN.','SOURCE MASKED BY STATIC.','LINGUA DIABOLIS TRACE PRESENT.','OUTER RELAYS REPORT CORRUPTION.','MACHINE-SPIRIT DISTRESS RESPONSES ESCALATING.'],
    response:['MAGOS VENERATUS NOTIFIED.','PURGE RITES COMMENCING.','SANCTIFIED FIREWALLS ENGAGED.','DATA-LOOMS SEALED.','NOOSPHERIC FIREBREAKS ACTIVATED.'],
    blood:   ['CORBULO SUMMONED.','RED GRAIL ARCHIVES LOCKED.','RED THIRST INDEX ESCALATING.','CHAPLAINCY ALERT STATUS RAISED.','DEATH COMPANY WATCH INITIATED.'],
    closing: ['OMNISSIAH PRESERVE THIS ENGINE.','SANGUINIUS WATCHES IN SILENCE.','ALL NON-SANCTIONED ACCESS REVOKED.','QUARANTINE SEALS HOLD FOR NOW.'],
  },
  ok: {
    opener:  ['AUSPEX SWEEP COMPLETE.','DIAGNOSTIC CANTICLE COMPLETE.','SECTOR SCAN COMPLETE.','RECONCILIATION RITE COMPLETE.','COGITATOR BENEDICTION COMPLETE.'],
    detail:  ['NO CHAOS SIGNATURE DETECTED.','WARP ECHO ABSENT.','SECTOR TERTIUS CLEAR.','HOSTILE TRACE NEGATIVE.','NO HERETEK SPOOR IDENTIFIED.'],
    response:['MACHINE-SPIRIT CALM.','NOOSPHERIC LINK STABLE.','COGITATOR CORE SANCTIFIED.','AUSPEX RETURNS CLEAN.','PRIMARY RELAYS OPERATING WITHIN TOLERANCE.'],
    blood:   ['BAALITE VAULTS SECURE.','SANGUINIUS WATCHES.','RED THIRST CONTAINED.','THE IX LEGION ENDURES.','RED GRAIL RECORDS VERIFIED.'],
    closing: ['GLORY TO THE ANGEL.','PRAISE THE OMNISSIAH.','ALL SYSTEMS REMAIN LOYAL.','HONOUR THE CHAPTER.'],
  },
};

function buildLoreText(pool) {
  return [pick(pool.opener), pick(pool.detail), pick(pool.response), pick(pool.blood),
    ...(Math.random() > 0.45 ? [pick(pool.closing)] : [])].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE FORMATTER  (ordinal like "10th MAY" matching desktop)
// ─────────────────────────────────────────────────────────────────────────────
const formatDateToText = (dateString) => {
  if (!dateString) return 'NO DEBT DETECTED';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const day = d.getDate();
  const month = d.toLocaleString('en-GB', { month: 'long' }).toUpperCase();
  const suffix = ['th','st','nd','rd'];
  const v = day % 100;
  const ordinal = day + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
  return `${ordinal} ${month}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function MobileOverview({ data, syncLed, dbTransactions, userId }) {
  const slideRef = useRef(null);
  const skullDockRef = useRef(null);

  // ── Data extraction (identical to OverviewSlide) ──
  const txns    = data?.transactions  || [];
  const metrics = data?.metrics       || {};
  const buckets = data?.buckets       || {};

  const income     = metrics.grossIncome  || 0;
  const expense    = metrics.grossExpense || 0;
  const netIncome  = metrics.netIncome    || 0;
  const netExpense = metrics.netExpense   || 0;
  // Main inflow mirrors gross expenditure: ALL money in, reimbursements
  // included. The adjusted ledger's NET INCOME stays actual earned
  // income (grossIncome, reimbursements excluded).
  const reimbursementsReceived = metrics.reimbursementsReceived || 0;
  const totalIncome = income + reimbursementsReceived;

  const bank       = buckets.Bank ?? data?.liveBalances?.total ?? 0;
  const cash       = buckets.Cash       || 0;
  const ar         = buckets.AR         || 0;
  const provisions = buckets.Provisions || 0;

  // ── Card obligations (aggregated across all cards) ──
  const formatDateShort = (ds) => {
    if (!ds) return '—';
    const d = new Date(ds);
    if (isNaN(d)) return ds;
    const mon = d.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
    return `${d.getDate()} ${mon}`;
  };
  const upcomingBuckets = (data?.cardObligations?.allBuckets || []).filter(b => b.status !== 'paid');
  const cardTotal       = data?.totalDebt ?? (buckets.Card || 0);
  const totalDebt       = cardTotal;
  const totalCardDebt   = cardTotal;
  // A net-prepaid card carries a credit — negative debt.
  const isNetCredit     = totalCardDebt < 0;
  const debtMagnitude   = Math.abs(totalCardDebt);

  // Three distinct financial views — matching desktop
  const liquidReserve  = bank + cash;
  const fundsAvailable = liquidReserve;
  const netPosition    = liquidReserve - cardTotal;
  const totalCardLimit = (data?.cards || []).reduce((sum, c) => sum + (c.limit || 0), 0);
  const creditHeadroom = Math.max(0, totalCardLimit - cardTotal);

  // ── Global Auditor state ──
  const bankAccounts = (data?.accounts || []).filter(a => a.parent === 'Bank');
  let maxDaysSinceAudit = 0;
  if (bankAccounts.length > 0) {
    maxDaysSinceAudit = Math.max(...bankAccounts.map(acc => {
      const lastAudited = acc.last_audited_date || new Date(Date.now() - 86400000 * 8).toISOString();
      return Math.max(0, Math.floor((Date.now() - new Date(lastAudited).getTime()) / (1000 * 60 * 60 * 24)));
    }));
  }
  let globalAuditState = 'PURE';
  let auditColor = 'var(--border-hi, #4ade80)';
  let isGlobalCrit = false;
  if (maxDaysSinceAudit >= 7) { globalAuditState = 'CORRUPTED'; auditColor = '#cc2200'; isGlobalCrit = true; }
  else if (maxDaysSinceAudit >= 4) { globalAuditState = 'RESTLESS'; auditColor = '#eab308'; }

  const positiveCats = data?.positiveCategories || [];
  const neutralCats  = data?.neutralCategories  || [];
  // System/obligation entries are balance events, not consumption — keep
  // them out of the spending vectors (mirrors OverviewSlide).
  const systemCats = new Set(['Loan Drawdown', 'Loan Payment', 'EMI Payment', 'Opening Balance', 'Account Closure', 'Cash c/d']);
  const categorySpending = {};
  txns.forEach(tx => {
    const cat = tx.category || 'UNCATEGORIZED';
    const tag = tx.reimbursement_tag || (tx.is_reimbursable ? 'untagged' : null);
    if (systemCats.has(cat) || tx.loan_id || tx.emi_id) return;
    if (!positiveCats.includes(cat) && !neutralCats.includes(cat) && !tag) {
      categorySpending[cat] = (categorySpending[cat] || 0) + Math.abs(tx.amount);
    }
  });
  const topCategories = Object.entries(categorySpending).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Recovery manifest — all-time AR from engine (cross-month correct) ──
  // Trust the engine result whenever it's present: an empty object means
  // "all settled", NOT "not loaded". Falling back to a current-month-only
  // recompute when settled resurrected phantom pending AR (cross-month
  // receipts missing + Math.max clamping). Only fall back pre-load.
  const arByTag = data?.arByTag
    ? data.arByTag
    : (() => {
        const local = {};
        txns.forEach(tx => {
          const tag = tx.reimbursement_tag;
          if (!tag) return;
          if (tx.category === 'Reimbursement Received') {
            local[tag] = Math.max(0, (local[tag] || 0) - Math.abs(tx.amount));
            if (local[tag] === 0) delete local[tag];
          } else {
            local[tag] = (local[tag] || 0) + Math.abs(tx.amount);
          }
        });
        return local;
      })();
  const openAR = Object.entries(arByTag).filter(([,a]) => a > 0).sort((a,b) => b[1]-a[1]);

  // ── Clear AR — log Reimbursement Received (matching desktop) ──
  const handleClearAR = useCallback(async (tag, amt) => {
    if (!dbTransactions || !userId) return;
    const suffix  = Math.random().toString(36).substring(2, 10);
    const today   = localDateStr();
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

  // ── Stream data ──
  const recentTxns = txns.slice(0, 15);
  const streamData = [];
  recentTxns.forEach((tx, i) => {
    const hexId  = tx._id ? `0X${tx._id.substring(tx._id.length - 4).toUpperCase()}` : '0X0000';
    const timeStr = `${String(Math.floor(Math.random() * 24)).padStart(2,'0')}:${String(Math.floor(Math.random() * 60)).padStart(2,'0')}`;
    streamData.push({ type: 'tx', id: hexId, time: timeStr, data: tx });
    if (i % 3 === 0) {
      const isCrit = Math.random() > 0.6;
      const loreHex = `0X${Math.floor(Math.random() * 65535).toString(16).toUpperCase().padStart(4,'0')}`;
      const pool = isCrit ? LORE.crit : LORE.ok;
      streamData.push({ type: 'lore', id: loreHex, time: timeStr, status: isCrit ? 'CRIT' : 'OK', text: buildLoreText(pool) });
    }
  });

  return (
    <>
      <style>{STYLES}</style>
      <div ref={slideRef} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px 28px', fontFamily: 'var(--mono, monospace)', color: 'var(--text-d, #4ade80)', position: 'relative' }}>
        <ServoSkullViewer
          syncLed={syncLed}
          auditState={globalAuditState}
          slideRef={slideRef}
          dockRef={skullDockRef}
        />

        {/* ── 1. FUNDS AVAILABLE ── hero card ── */}
        <div className="mo-panel mo-cornered">
          <div className="mo-ttl" style={{ color: '#4ade80', borderBottomColor: 'rgba(74,222,128,0.2)' }}>
            FUNDS AVAILABLE
          </div>
          <div className={`mo-val ${totalDebt > fundsAvailable ? 'expense' : 'ok'}`} style={{ fontSize: '32px' }}>
            <ScrambleText text={fundsAvailable.toLocaleString()} speed={80} step={0.067} />
          </div>
          <div style={{ fontSize: '9px', marginTop: '6px', letterSpacing: '1px' }}>
            <span style={{ color: '#4a2010' }}>
              BANK {bank > 0 ? `${bank.toLocaleString()}` : '—'} · CASH {cash > 0 ? `${cash.toLocaleString()}` : '—'} ·{' '}
            </span>
            <span style={{ color: totalDebt > 0 ? '#cc2200' : totalDebt < 0 ? '#c9a84c' : '#4a2010' }}>
              {totalDebt < 0 ? `CREDIT ${Math.abs(totalDebt).toLocaleString()}` : `DEBT ${totalDebt > 0 ? totalDebt.toLocaleString() : 'NONE'}`}
            </span>
          </div>
        </div>

        {/* ── 2. KPI 2×3 GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>GROSS TITHE</div>
            <div className={`mo-val ${totalIncome === 0 ? 'white' : ''}`} style={{ fontSize: '18px' }}><ScrambleText text={totalIncome.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>TOTAL EXPEND</div>
            <div className={`mo-val ${expense === 0 ? 'white' : 'expense'}`} style={{ fontSize: '18px' }}><ScrambleText text={expense.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>BANK RESERVE</div>
            <div className={`mo-val ${bank === 0 ? 'white' : ''}`} style={{ fontSize: '18px' }}><ScrambleText text={bank.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>CASH RESERVE</div>
            <div className={`mo-val ${cash === 0 ? 'white' : ''}`} style={{ fontSize: '18px' }}><ScrambleText text={cash.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>NET POSITION</div>
            <div className={`mo-val ${netPosition >= 0 ? 'ok' : 'red'}`} style={{ fontSize: '18px' }}>
              <ScrambleText text={netPosition.toLocaleString()} speed={80} step={0.067} />
            </div>
            <div style={{ fontSize: '8px', color: '#4a2010', marginTop: '4px', letterSpacing: '1px' }}>LIQUID − DEBT</div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px', color: '#eab308' }}>CREDIT HEADROOM</div>
            <div className="mo-val amber" style={{ fontSize: '18px' }}>
              <ScrambleText text={creditHeadroom.toLocaleString()} speed={80} step={0.067} />
            </div>
            <div style={{ fontSize: '8px', color: '#4a2010', marginTop: '4px', letterSpacing: '1px' }}>LIMIT − UTILISED</div>
          </div>
        </div>

        {/* ── 3. SYSTEM UPLINK STATUS  (Servo Skull lives here) ── */}
        <div className="mo-panel">
          <div className="mo-ttl">SYSTEM UPLINK STATUS</div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>

            <div ref={skullDockRef} className="mo-skull-dock" />

            {/* Status rows */}
            <div style={{ flex: 1 }}>
              <div className="mo-row">
                <span className="mo-rl">DATA CYCLE</span>
                <span className="mo-rv"><ScrambleText text={formatDateToText(new Date().toISOString())} /></span>
              </div>
              <div className="mo-row">
                <span className="mo-rl">UPLINK</span>
                <span
                  className={`mo-rv ${syncLed === 'ok' ? 'ok' : syncLed === 'offline' ? '' : 'warn'}`}
                  style={syncLed === 'offline' ? { color: '#cc2200', textShadow: '0 0 8px #cc220077' } : {}}
                >
                  ◈ {syncLed === 'ok' ? 'ESTABLISHED' : syncLed === 'offline' ? 'NO SIGNAL' : 'AWAITING'}
                </span>
              </div>
              <div className="mo-row">
                <span className="mo-rl">LEDGER PURITY</span>
                <span className={isGlobalCrit ? 'glitch-crit' : ''} style={{ fontFamily: 'var(--mono)', color: auditColor, textShadow: `0 0 8px ${auditColor}77` }}>
                  ◈ {globalAuditState}
                </span>
              </div>
            </div>
          </div>
          <div style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid #2a0800',
          }}>
            <LoreTicker style={{ fontSize: '7.5px', letterSpacing: '0.4px' }} />
          </div>
        </div>

        {/* ── 4. IMPENDING OBLIGATIONS ── */}
        <div className="mo-panel">
          <div className="mo-ttl">IMPENDING OBLIGATIONS</div>
          {upcomingBuckets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              {isNetCredit ? (
                <>
                  <div style={{ fontSize: '9px', color: '#b8923e', marginBottom: '4px', letterSpacing: '2px' }}>
                    PREPAID CREDIT
                  </div>
                  <div className="mo-val" style={{ fontSize: '26px', color: 'var(--ba-gold)', textShadow: '0 0 8px rgba(201,168,76,0.5)' }}>
                    <ScrambleText text={`+${debtMagnitude.toLocaleString()}`} />
                  </div>
                  <div style={{ fontSize: '9px', color: '#b8923e', letterSpacing: '2px', marginTop: '4px' }}>
                    TITHE PAID IN ADVANCE
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '9px', color: '#b8923e', marginBottom: '4px', letterSpacing: '2px' }}>
                    DEBT
                  </div>
                  <div className="mo-val ov-debt-ok" style={{ fontSize: '26px' }}>
                    <ScrambleText text="0" />
                  </div>
                  <div style={{ fontSize: '9px', color: '#b8923e', letterSpacing: '2px', marginTop: '4px' }}>
                    NO DEBT DETECTED
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ fontSize: '9px', color: '#b8923e', marginBottom: '6px', letterSpacing: '2px' }}>
                UPCOMING DUES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {upcomingBuckets.map(b => (
                  <div key={b.due_date} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    fontFamily: 'var(--mono)', fontSize: '13px',
                    padding: '3px 0',
                  }}>
                    <span style={{
                      color: b.status === 'overdue' ? '#cc2200' : '#e0c070',
                      letterSpacing: '1px',
                    }}>
                      {formatDateShort(b.due_date)}
                      {b.status === 'overdue' && <span style={{ fontSize: '9px', marginLeft: '4px' }}>LATE</span>}
                    </span>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>
                      {Math.round(b.outstanding).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mo-divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '9px', color: isNetCredit ? '#b8923e' : '#cc2200', letterSpacing: '2px' }}>
                  {isNetCredit ? 'NET CREDIT' : 'DEBT'}
                </span>
                <span
                  className={isNetCredit ? 'mo-val' : 'mo-val ov-debt-warn glitch-crit'}
                  style={{ fontSize: '22px', color: isNetCredit ? 'var(--ba-gold)' : undefined, textShadow: isNetCredit ? '0 0 8px rgba(201,168,76,0.5)' : undefined }}
                >
                  <ScrambleText text={isNetCredit ? `+${debtMagnitude.toLocaleString()}` : totalCardDebt.toLocaleString()} />
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── 5. RECOVERY MANIFEST ── */}
        {openAR.length > 0 && (
          <div className="mo-panel">
            <div className="mo-ttl">RECOVERY MANIFEST</div>
            {openAR.slice(0, 4).map(([tag, amt]) => (
              <div key={tag} className="mo-ar-row">
                <span className="mo-ar-tag">{tag}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="mo-ar-amt">{Math.round(amt).toLocaleString()}</span>
                  {dbTransactions && (
                    <button className="mo-ar-clear" onClick={() => handleClearAR(tag, amt)}>
                      CLEAR
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #2a0800', fontSize: '9px' }}>
              <span style={{ color: '#b8923e', letterSpacing: '1px' }}>TOTAL OUTSTANDING</span>
              <span style={{ color: '#e0c070', fontWeight: 'bold', fontFamily: 'var(--mono)', textShadow: '0 0 6px rgba(224,192,112,0.35)' }}>
                {Math.round(openAR.reduce((s,[,a]) => s+a, 0)).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* ── 6. REIMBURSEMENTS & PROVISIONS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>REIMBURSE</div>
            <div className="mo-val" style={{ fontSize: '18px' }}><ScrambleText text={ar.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
          <div className="mo-panel">
            <div className="mo-ttl" style={{ fontSize: '8px' }}>PROVISIONS</div>
            <div className="mo-val white" style={{ fontSize: '18px' }}><ScrambleText text={provisions.toLocaleString()} speed={80} step={0.067} /></div>
          </div>
        </div>

        {/* ── 7. EXPENDITURE VECTORS ── */}
        <div className="mo-panel">
          <div className="mo-ttl">EXPENDITURE VECTORS</div>
          {topCategories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topCategories.map(([cat, amt]) => {
                const maxAmt = topCategories[0]?.[1] || 1;
                const pct = Math.min((amt / maxAmt) * 100, 100);
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#b8923e', letterSpacing: '1px', marginBottom: '4px' }}>
                      <span>{cat.toUpperCase()}</span>
                      <span>{amt.toLocaleString()}</span>
                    </div>
                    <div style={{ width: '100%', height: '2px', background: '#2a0800' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#cc2200', boxShadow: '0 0 4px #cc2200', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '9px', color: '#7a4a20', textAlign: 'center', padding: '10px 0' }}>NO OUTFLOW DETECTED</div>
          )}
        </div>

        {/* ── 8. ADJUSTED LEDGER ── */}
        <div className="mo-panel mo-cornered">
          <div className="mo-ttl">ADJUSTED LEDGER</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '9px', color: '#7a4a20', letterSpacing: '1px' }}>NET INCOME</div>
              <div className="mo-val" style={{ fontSize: '18px' }}><ScrambleText text={netIncome.toLocaleString()} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '9px', color: '#7a4a20', letterSpacing: '1px' }}>NET EXPENDITURE</div>
              <div className="mo-val expense" style={{ fontSize: '18px' }}><ScrambleText text={netExpense.toLocaleString()} /></div>
            </div>
          </div>
        </div>

        {/* ── 9. NOOSPHERE RELAY ── */}
        <div className="mo-panel" style={{ height: '220px', display: 'flex', flexDirection: 'column' }}>
          <div className="mo-ttl">
            <span>NOOSPHERE RELAY</span>
            {/* Live indicator dots */}
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginLeft: 'auto', marginRight: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--border-hi, #4ade80)', boxShadow: 'var(--glow)', display: 'inline-block' }} />
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 5px #eab308', display: 'inline-block' }} />
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#cc2200', boxShadow: '0 0 5px #cc2200', display: 'inline-block' }} />
            </div>
          </div>
          <div style={{ fontSize: '8px', color: '#4a2010', borderBottom: '1px solid #2a0800', paddingBottom: '6px', marginBottom: '8px', letterSpacing: '1px' }}>
            ◈ UPLINK SECURE · SECTOR 7-ALPHA · STREAM ACTIVE
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div className="ov-stream-marquee">
              {[...streamData, ...streamData].map((item, i) => {
                if (item.type === 'lore') {
                  const isCrit = item.status === 'CRIT';
                  return (
                    <div key={i} className={`mo-relay-row ${isCrit ? 'lore-crit' : 'lore-ok'}`}>
                      <div className="mo-relay-meta"><span>{item.time}</span><span>{item.id}</span></div>
                      <span className={`mo-badge ${isCrit ? 'mo-badge-crit' : 'mo-badge-ok'}`}>{item.status}</span>
                      <div className={isCrit ? 'glitch-crit' : ''} style={{ flex: 1, color: isCrit ? '#cc2200' : 'var(--text-m, #7a5a30)', lineHeight: '1.4', textTransform: 'uppercase' }}>
                        {item.text}
                      </div>
                    </div>
                  );
                }
                const tx = item.data;
                const displayName = tx.description || tx.category;
                const accName = tx.sub_account || tx.account_type || 'UNKNOWN';
                const isNeg = tx.amount < 0;
                return (
                  <div key={i} className="mo-relay-row">
                    <div className="mo-relay-meta"><span>{item.time}</span><span>{item.id}</span></div>
                    <span className="mo-badge mo-badge-tx">TX</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textTransform: 'uppercase' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        <span style={{ color: '#fff' }}>{displayName}</span>
                        <span style={{ color: '#3a0800' }}>—</span>
                        <span className={isNeg ? 'mo-amt-neg' : 'mo-amt-pos'}>{isNeg ? '' : '+'}{Math.abs(tx.amount).toLocaleString()}</span>
                      </div>
                      <div style={{ color: '#4a2010', fontSize: '8px' }}>{tx.category} VIA {accName}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
