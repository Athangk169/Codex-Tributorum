// src/components/slides/mobile/MobileAuspex.jsx
import React, { useState, useEffect, useRef } from 'react';
import ScrambleText from '../../shared/ScrambleText';
import { FinanceEngine } from '../../../utils/engine';

const formatMonthLabel = (monthPrefix) => {
  if (!monthPrefix) return '';
  const [y, m] = monthPrefix.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
};
const fmtINR = (n) => `${Math.round(n || 0).toLocaleString('en-IN')}`;

const MOB_RITE_STEPS = [
  { code: '01010110', label: 'VOX-LINK STABILISING',      duration: 700 },
  { code: '01000011', label: 'COG-DAEMON AWAKENED',       duration: 750 },
  { code: '01010000', label: 'PURITY SEALS BROKEN',       duration: 650 },
  { code: '01000001', label: 'PATHWAYS BOUND',            duration: 750 },
  { code: '01000100', label: 'ARCHIVE UNSEALED',          duration: 800 },
];

const mobRandomBinary = () => {
  let s = '';
  for (let i = 0; i < 4; i++) {
    let nib = '';
    for (let j = 0; j < 4; j++) nib += Math.random() < 0.5 ? '0' : '1';
    s += (i ? ' ' : '') + nib;
  }
  return s;
};

const MobileArchiveRitual = ({ ritualKey }) => {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [binharic, setBinharic] = useState(() => mobRandomBinary());

  useEffect(() => {
    setStage(0); setProgress(0);
    let cancelled = false;
    let raf;
    const runStage = (i) => {
      if (cancelled || i >= MOB_RITE_STEPS.length) return;
      const duration = MOB_RITE_STEPS[i].duration;
      const start = performance.now();
      const tick = () => {
        if (cancelled) return;
        const elapsed = performance.now() - start;
        const pct = Math.min(100, (elapsed / duration) * 100);
        setProgress(pct);
        if (pct >= 100) {
          setStage(i + 1); setProgress(0);
          setTimeout(() => runStage(i + 1), 110);
        } else {
          raf = requestAnimationFrame(tick);
        }
      };
      raf = requestAnimationFrame(tick);
    };
    runStage(0);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [ritualKey]);

  useEffect(() => {
    const iv = setInterval(() => setBinharic(mobRandomBinary()), 140);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="mob-arch-ritual">
      <div className="mob-arch-head">
        <span className="mob-arch-head-ttl">RITE OF RECOLLECTION</span>
      </div>
      <div className="mob-arch-tbl">
        {MOB_RITE_STEPS.map((s, i) => {
          const done   = i < stage;
          const active = i === stage;
          const pct    = active ? progress : done ? 100 : 0;
          return (
            <div
              key={`${ritualKey}-${i}`}
              className={`mob-arch-row ${done ? 'done' : active ? 'active' : 'pending'}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="mob-arch-code">{s.code}</span>
              <span>{s.label}{active ? '...' : ''}</span>
              <div className="mob-arch-bar"><span style={{ width: `${pct}%` }} /></div>
              <span className="mob-arch-mark">{done ? '✓' : active ? '◈' : '·'}</span>
            </div>
          );
        })}
      </div>
      <div className="mob-arch-binharic">
        <span>«</span> {binharic} <span>»</span>
      </div>
    </div>
  );
};

const legacyManifestId = 'current_holdings';
const manifestIdForUser = (userId) => `finance:investments:current:${userId || 'default'}`;

const normalizeAsset = (asset) => ({
  ...asset,
  id: asset.id || asset.ticker,
  avgPrice: Number(asset.avgPrice ?? asset.avg_price ?? 0) || 0,
  currentprice: Number(asset.currentprice ?? asset.current_price ?? asset.price ?? asset.ltp ?? asset.avgPrice ?? asset.avg_price ?? 0) || 0,
});

const normalizeSnapshot = (doc) => ({
  ...doc,
  invested: Number(doc.invested ?? doc.total_invested ?? doc.current ?? 0) || 0,
  current: Number(doc.current ?? doc.total_current ?? doc.invested ?? 0) || 0,
});

const snapshotTimestamp = (doc) => Date.parse(doc.updated ?? doc.last_updated ?? doc.created ?? doc.created_at ?? '') || 0;
const snapshotTotal = (doc) => (Number(doc.invested) || 0) + (Number(doc.current) || 0);

const isBetterSnapshot = (candidate, current) => {
  if (!current) return true;

  const candidateHasValue = snapshotTotal(candidate) > 0;
  const currentHasValue = snapshotTotal(current) > 0;
  if (candidateHasValue !== currentHasValue) return candidateHasValue;

  const candidateTime = snapshotTimestamp(candidate);
  const currentTime = snapshotTimestamp(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;

  return snapshotTotal(candidate) > snapshotTotal(current);
};

const collapseSnapshotsByMonth = (snapshots) => {
  const byMonth = new Map();
  snapshots.forEach(snapshot => {
    if (isBetterSnapshot(snapshot, byMonth.get(snapshot.month))) {
      byMonth.set(snapshot.month, snapshot);
    }
  });
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
};

const isSnapshotDoc = (doc, userId) => {
  if (!doc?.month) return false;
  const typeMatch = doc.type === 'investment_snapshot' || doc.type === 'finance:investments:snapshot';
  const idMatch = doc._id?.startsWith('snapshot_') || doc._id?.startsWith('finance:investments:snapshot:');
  const userMatch = !userId || userId === 'default' || !doc.user_id || doc.user_id === userId;
  return typeMatch && idMatch && userMatch;
};

const getCurrentManifest = async (dbInvestments, userId) => {
  const canonicalId = manifestIdForUser(userId);
  const canonical = await dbInvestments.get(canonicalId).catch(() => null);
  if (canonical) return { doc: canonical, id: canonicalId };

  const legacy = await dbInvestments.get(legacyManifestId).catch(() => null);
  if (legacy) return { doc: legacy, id: legacyManifestId };

  return {
    id: canonicalId,
    doc: {
      _id: canonicalId,
      type: 'finance:investments:manifest',
      assets: [],
      user_id: userId || 'default',
    }
  };
};

// ─────────────────────────────────────────────
// ManifestOverrideModal — Mobile-Optimized Terminal
// ─────────────────────────────────────────────
const ManifestOverrideModal = ({ isOpen, onClose, holding, onSave }) => {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');

  useEffect(() => {
    if (holding) {
      setTicker(holding.ticker);
      setShares(holding.shares);
      setAvgPrice(holding.avgPrice);
    } else {
      setTicker(''); setShares(''); setAvgPrice('');
    }
  }, [holding, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!ticker || !shares || !avgPrice) return alert("◈ ERROR: INCOMPLETE MANIFEST DATA.");
    onSave(ticker.toUpperCase(), parseFloat(shares), parseFloat(avgPrice));
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)',
      zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px'
    }}>
      <div className="panel mech-panel" style={{ width: '100%', maxWidth: '340px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div className="sec-ttl" style={{ margin: 0, color: 'var(--border-hi)', fontSize: '12px' }}>
          {holding ? '◈ OVERRIDE HOLDING' : '◈ INITIATE NEW HOLDING'}
        </div>
        
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>TICKER DESIGNATION</div>
          <input className="mech-input" value={ticker} onChange={e => setTicker(e.target.value)} disabled={!!holding} style={{ marginTop: 0, padding: '12px' }} />
        </div>
        
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>UNITS ACQUIRED</div>
          <input className="mech-input" type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} style={{ marginTop: 0, padding: '12px' }} />
        </div>
        
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-d)', marginBottom: '4px' }}>AVERAGE COST BASIS</div>
          <input className="mech-input" type="number" step="any" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} style={{ marginTop: 0, padding: '12px' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button className="mech-btn ok" style={{ flex: 1, marginTop: 0, padding: '12px' }} onClick={handleSave}>[ SECURE ]</button>
          <button className="mech-btn warn" style={{ flex: 1, marginTop: 0, padding: '12px', borderColor: 'var(--ba-crimson)', color: 'var(--ba-crimson)', background: 'rgba(204, 34, 0, 0.1)' }} onClick={onClose}>[ ABORT ]</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// InteractiveMechChart — Touch-Aware Line Chart
// ─────────────────────────────────────────────
const InteractiveMechChart = ({ months, series, isDual, yPrefix = '', showAverage = true, onPointClick = null }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  if (!months.length || series.every(s => !s.values.length)) return null;

  const W = 600, H = 250;
  const PAD = { t: isDual ? 45 : 20, r: 20, b: 60, l: 60 }; 
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const allVals = series.flatMap(s => s.values).filter(v => isFinite(v));
  const maxVal  = Math.max(...allVals, 1);
  const chartMax = maxVal * 1.15; 
  const n       = months.length;

  const xAt = i  => PAD.l + (n < 2 ? cW / 2 : (i / (n - 1)) * cW);
  const yAt = v  => PAD.t + cH - (v / chartMax) * cH;

  const getControlPoint = (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const smoothing = 0.15; 
    const lengthX = n.x - p.x;
    const lengthY = n.y - p.y;
    const angle = Math.atan2(lengthY, lengthX) + (reverse ? Math.PI : 0);
    const length = Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)) * smoothing;
    return { x: current.x + Math.cos(angle) * length, y: current.y + Math.sin(angle) * length };
  };

  const toSmoothPath = values => {
    const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    return pts.reduce((acc, point, i, a) => {
      if (i === 0) return `M ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      const cps = getControlPoint(a[i - 1], a[i - 2], point);
      const cpe = getControlPoint(point, a[i - 1], a[i + 1], true);
      return `${acc} C ${cps.x.toFixed(1)},${cps.y.toFixed(1)} ${cpe.x.toFixed(1)},${cpe.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }, '');
  };

  const toAreaPath = values => {
    if (values.length === 0) return '';
    const smooth = toSmoothPath(values);
    return `${smooth} L ${xAt(values.length - 1).toFixed(1)},${(PAD.t + cH).toFixed(1)} L ${xAt(0).toFixed(1)},${(PAD.t + cH).toFixed(1)} Z`;
  };

  const formatYAxis = (v) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (v > 0 && v < 10) return v.toFixed(1);
    return Math.round(v);
  };
  
  const yTicks = [0, chartMax * 0.25, chartMax * 0.5, chartMax * 0.75, chartMax];

  const formatXMonth = (m) => {
    if (!m) return '';
    const parts = m.split('-');
    if (parts.length < 2) return m;
    const [year, month] = parts;
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleString('en-US', { month: 'short', year: '2-digit' }); 
  };

  const handlePointerMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    let clientX;
    if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
    else if (e.clientX) clientX = e.clientX;
    else return;

    const xPos = ((clientX - rect.left) / rect.width) * W;
    
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(xAt(i) - xPos);
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    }
    setHoverIdx(closestIdx);
  };

  const clipId = `clip-reveal-${isDual ? 'dual' : 'single'}`;
  const tooltipW = isDual ? 165 : 120;

  const getTooltipContent = () => {
    if (hoverIdx === null) return { elements: [], height: 0 };
    
    let currentY = 28;
    const elements = [];
    
    series.forEach((s, i) => {
      elements.push(
        <text key={`val-${i}`} x="8" y={currentY} fill={s.color} fontSize="9" fontFamily="var(--mono)">
          {s.label}: {yPrefix}{s.values[hoverIdx].toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </text>
      );
      currentY += 14;
    });
    
    return { elements, height: currentY - 4 };
  };

  const tooltipData = getTooltipContent();

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', touchAction: 'none', cursor: onPointClick ? 'pointer' : 'default' }}
        onMouseMove={handlePointerMove} onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={handlePointerMove} onTouchMove={handlePointerMove} onTouchEnd={() => setHoverIdx(null)}
        onClick={() => { if (onPointClick && hoverIdx !== null) onPointClick(months[hoverIdx]); }}
      >
        <defs>
          <pattern id="chart-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
          </pattern>
          <clipPath id={clipId}>
            <rect x="0" y="0" height="100%" fill="white" className="anim-reveal" />
          </clipPath>
          <style>
            {`
              @keyframes stutterRevealRect {
                0%   { width: 0%; }
                20%  { width: 30%; }
                25%  { width: 25%; }
                50%  { width: 60%; }
                60%  { width: 55%; }
                80%  { width: 90%; }
                85%  { width: 85%; }
                100% { width: 100%; }
              }
              .anim-reveal { animation: stutterRevealRect 1.2s steps(20, end) forwards; }
              .mech-anim-path { transition: d 0.4s ease-in-out; }
            `}
          </style>
        </defs>

        <g stroke="rgba(34, 197, 94, 0.08)" strokeWidth="0.5">
          {months.map((_, i) => (
            <line key={`v-${i}`} x1={xAt(i)} x2={xAt(i)} y1={PAD.t} y2={PAD.t + cH} />
          ))}
          {yTicks.map((v, i) => (
            <line key={`h-${i}`} x1={PAD.l} x2={W - PAD.r} y1={yAt(v)} y2={yAt(v)} />
          ))}
        </g>

        <g fill="rgba(34, 197, 94, 0.5)" fontSize="9" fontFamily="var(--mono)">
          {yTicks.map((v, i) => (
            <text key={`yt-${i}`} x={PAD.l - 8} y={yAt(v) + 3} textAnchor="end">
              {yPrefix}{formatYAxis(v)}
            </text>
          ))}
          {months.map((m, i) => (
            <text 
              key={`xt-${i}`} x={xAt(i)} y={PAD.t + cH + 15} textAnchor="end"
              transform={`rotate(-45, ${xAt(i)}, ${PAD.t + cH + 15})`}
            >
              {formatXMonth(m)}
            </text>
          ))}
        </g>

        {isDual && (
          <g transform={`translate(${W / 2}, 15)`} fontFamily="var(--mono)" fontSize="9" letterSpacing="1px">
            <rect x="-140" y="-8" width="50" height="14" fill="none" stroke={series[0].color} strokeWidth="1" strokeDasharray="2 2" />
            <line x1="-140" x2="-90" y1="-1" y2="-1" stroke={series[0].color} strokeWidth="2" />
            <text x="-80" y="3" fill="#ccc">{series[0].label}</text>

            <rect x="20" y="-8" width="50" height="14" fill="none" stroke={series[1].color} strokeWidth="1" />
            <line x1="20" x2="70" y1="-1" y2="-1" stroke={series[1].color} strokeWidth="2" />
            <text x="80" y="3" fill="#ccc">{series[1].label}</text>
          </g>
        )}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s, si) => (
            <g key={`series-${si}`}>
              <path d={toAreaPath(s.values)} fill="url(#chart-grid)" opacity="0.5" />
              <path d={toAreaPath(s.values)} fill={s.color} opacity="0.08" />
              <path className="mech-anim-path" d={toSmoothPath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) => (
                <rect key={`node-${i}`} x={xAt(i) - 2.5} y={yAt(v) - 2.5} width="5" height="5" fill="#000" stroke={s.color} strokeWidth="1.5" />
              ))}
            </g>
          ))}
        </g>

        {hoverIdx !== null && (
          <g>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PAD.t} y2={PAD.t + cH} stroke="var(--ba-crimson, #cc2200)" strokeWidth="1" strokeDasharray="4 4" opacity="0.7" />
            <g transform={`translate(${xAt(hoverIdx) < W / 2 ? xAt(hoverIdx) + 12 : xAt(hoverIdx) - tooltipW - 12}, ${PAD.t})`}>
              <rect x="0" y="0" width={tooltipW} height={tooltipData.height} fill="rgba(8, 1, 1, 0.95)" stroke="none" />
              <path d="M 0 6 L 0 0 L 6 0" fill="none" stroke="#c9a84c" strokeWidth="1.5" />
              <path d={`M ${tooltipW} 6 L ${tooltipW} 0 L ${tooltipW - 6} 0`} fill="none" stroke="#c9a84c" strokeWidth="1.5" />
              <path d={`M 0 ${tooltipData.height - 6} L 0 ${tooltipData.height} L 6 ${tooltipData.height}`} fill="none" stroke="#c9a84c" strokeWidth="1.5" />
              <path d={`M ${tooltipW} ${tooltipData.height - 6} L ${tooltipW} ${tooltipData.height} L ${tooltipW - 6} ${tooltipData.height}`} fill="none" stroke="#c9a84c" strokeWidth="1.5" />
              
              <text x="8" y="14" fill="#8c732c" fontSize="9" fontFamily="var(--mono)" fontWeight="bold">
                [ {formatXMonth(months[hoverIdx]).toUpperCase()} ]
              </text>
              {tooltipData.elements}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};

const MOBILE_AUSPEX_STYLES = `
  .mob-tab-bar {
    display: flex; border-bottom: 1px solid var(--border, #2a3a2a);
    background: rgba(1, 8, 3, 0.85); flex-shrink: 0; margin-bottom: 12px;
  }
  .mob-tab {
    flex: 1; padding: 12px 0; text-align: center; font-family: var(--mono);
    font-size: 11px; letter-spacing: 2px; color: var(--text-d);
    background: transparent; border: none; border-bottom: 2px solid transparent;
  }
  .mob-tab.active {
    color: var(--border-hi); border-bottom: 2px solid var(--border-hi);
    background: rgba(74, 222, 128, 0.1); text-shadow: var(--glow);
  }
  .mob-auspex-grid {
    display: flex; flex-direction: column; gap: 12px; padding: 0 16px 20px 16px;
  }
  .mob-kpi-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .mob-table-wrapper {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    border: 1px solid var(--border); padding-bottom: 8px;
    margin: 0 -4px;
  }
  .mob-chart-panel {
    background: rgba(4, 1, 1, 0.85); border: 1px solid #2a0800;
    padding: 12px; display: flex; flex-direction: column; height: 320px;
  }
  @keyframes dataAssimilate {
    0%   { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .assimilate-in { animation: dataAssimilate 0.4s ease-out forwards; }

  /* ── Pre-Genesis warning ── */
  .mob-arch-warn {
    display: flex;
    background: linear-gradient(90deg,
      rgba(204,34,0,0.22) 0%,
      rgba(234,179,8,0.12) 30%,
      rgba(234,179,8,0.12) 70%,
      rgba(204,34,0,0.22) 100%);
    border-top: 1px solid var(--ba-crimson);
    border-bottom: 2px solid var(--ba-crimson);
    font-family: var(--mono);
    animation: mobArchWarnPulse 1.6s ease-in-out infinite;
    position: relative;
    overflow: hidden;
  }
  .mob-arch-warn::before {
    content: '';
    position: absolute; top: 0; bottom: 0;
    width: 200%;
    background: repeating-linear-gradient(45deg,
      transparent 0 6px,
      rgba(204,34,0,0.14) 6px 10px);
    animation: mobArchWarnSlide 5s linear infinite;
    z-index: 0;
  }
  .mob-arch-warn-side {
    flex-shrink: 0; width: 44px;
    background: rgba(204,34,0,0.5);
    color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-size: 18px;
    text-shadow: 0 0 12px #cc2200, 0 0 4px #fff;
    border-right: 1px solid var(--ba-crimson);
    z-index: 1;
  }
  .mob-arch-warn-side small { font-size: 6px; letter-spacing: 2px; margin-top: 1px; }
  .mob-arch-warn-body {
    flex: 1; padding: 7px 10px;
    display: flex; flex-direction: column; gap: 2px;
    z-index: 1;
  }
  .mob-arch-warn-ttl {
    font-size: 10px; letter-spacing: 2px; font-weight: bold;
    color: var(--ba-crimson);
    text-shadow: 0 0 8px rgba(204,34,0,0.7);
  }
  .mob-arch-warn-sub {
    font-size: 9px; letter-spacing: 1px; line-height: 1.45;
    color: #fbe9b0;
    text-shadow: 0 0 6px rgba(234,179,8,0.4);
  }
  @keyframes mobArchWarnPulse {
    0%, 100% { box-shadow: inset 0 0 18px rgba(204,34,0,0.25); }
    50%      { box-shadow: inset 0 0 26px rgba(204,34,0,0.55); }
  }
  @keyframes mobArchWarnSlide {
    0% { transform: translateX(-50%); } 100% { transform: translateX(0); }
  }

  /* ── Ritual loader — Mechanicus binharic rite log ── */
  .mob-arch-ritual {
    padding: 22px 12px 26px;
    display: flex; flex-direction: column;
    gap: 14px; font-family: var(--mono);
    position: relative; overflow: hidden;
    background: linear-gradient(180deg, transparent 0%, rgba(204,34,0,0.04) 50%, transparent 100%);
    background-size: 100% 5px;
    animation: mobArchScan 3.5s linear infinite;
  }
  @keyframes mobArchScan { 0% { background-position: 0 0; } 100% { background-position: 0 100%; } }
  .mob-arch-ritual::before {
    content: '';
    position: absolute; left: 0; right: 0; top: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--ba-crimson), transparent);
    box-shadow: 0 0 8px rgba(204,34,0,0.6);
    animation: mobArchSweep 2.8s cubic-bezier(0.4,0,0.2,1) infinite;
  }
  @keyframes mobArchSweep {
    0%   { transform: translateY(0);     opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(320px); opacity: 0; }
  }

  .mob-arch-head { display: flex; align-items: center; justify-content: center; gap: 10px; }
  .mob-arch-head-glyph {
    font-size: 18px; color: var(--ba-crimson); letter-spacing: 4px;
    text-shadow: 0 0 12px rgba(204,34,0,0.8), 0 0 4px #fff;
    animation: mobArchGlyph 0.6s steps(4, end) infinite;
  }
  @keyframes mobArchGlyph {
    0%   { transform: translate(0,0) rotate(0deg); opacity: 0.55; }
    25%  { transform: translate(-1px,1px) rotate(-3deg); opacity: 1; filter: brightness(1.4); }
    50%  { transform: translate(0,0) rotate(0deg); opacity: 0.85; }
    75%  { transform: translate(1px,-1px) rotate(3deg); opacity: 1; filter: brightness(1.4); }
    100% { transform: translate(0,0) rotate(0deg); opacity: 0.55; }
  }
  .mob-arch-head-ttl {
    font-size: 10px; letter-spacing: 3px; color: var(--ba-gold); font-weight: bold;
    text-shadow: 0 0 6px rgba(201,168,76,0.5);
  }

  .mob-arch-tbl {
    display: flex; flex-direction: column; gap: 7px;
    padding: 6px 10px;
    border-top: 1px solid var(--ba-border-lo);
    border-bottom: 1px solid var(--ba-border-lo);
    background: rgba(0,0,0,0.35);
    font-size: 9px; letter-spacing: 1px;
  }
  .mob-arch-row {
    display: grid;
    grid-template-columns: 62px 1fr 60px 14px;
    gap: 8px; align-items: center;
    opacity: 0; transform: translateX(-8px);
    animation: mobArchRowIn 220ms cubic-bezier(0.16,1,0.3,1) forwards;
  }
  @keyframes mobArchRowIn { to { opacity: 1; transform: translateX(0); } }
  .mob-arch-row.pending { opacity: 0.28; }
  .mob-arch-row.done    { color: var(--border-hi); text-shadow: 0 0 5px rgba(74,222,128,0.35); }
  .mob-arch-row.active  { color: var(--ba-crimson); text-shadow: 0 0 6px rgba(204,34,0,0.55); }
  .mob-arch-code { font-size: 8px; color: var(--ba-gold-dim); }
  .mob-arch-row.done .mob-arch-code,
  .mob-arch-row.active .mob-arch-code { color: inherit; opacity: 0.7; }
  .mob-arch-bar {
    height: 6px; background: rgba(0,0,0,0.6);
    border: 1px solid var(--ba-border-lo); overflow: hidden;
  }
  .mob-arch-bar > span {
    display: block; height: 100%;
    background: repeating-linear-gradient(90deg, var(--ba-crimson) 0 5px, rgba(204,34,0,0.4) 5px 7px);
    box-shadow: 0 0 4px rgba(204,34,0,0.5);
    transition: width 60ms linear;
  }
  .mob-arch-row.done .mob-arch-bar > span {
    background: repeating-linear-gradient(90deg, var(--border-hi) 0 5px, rgba(74,222,128,0.4) 5px 7px);
    box-shadow: 0 0 4px rgba(74,222,128,0.4);
  }
  .mob-arch-mark { font-size: 11px; text-align: center; line-height: 1; }
  .mob-arch-row.done .mob-arch-mark   { color: var(--border-hi); animation: mobArchStamp 360ms cubic-bezier(0.16,1,0.3,1) both; }
  .mob-arch-row.active .mob-arch-mark { color: var(--ba-crimson); animation: mobArchMarkPulse 0.45s steps(2, end) infinite; }
  @keyframes mobArchStamp {
    0% { transform: scale(2.2); opacity: 0; filter: brightness(2.5); }
    60% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes mobArchMarkPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

  .mob-arch-binharic {
    font-size: 9px; letter-spacing: 2px; text-align: center;
    color: var(--ba-gold-dim); opacity: 0.6;
  }
  .mob-arch-binharic span { color: var(--ba-crimson); text-shadow: 0 0 5px rgba(204,34,0,0.4); }
`;

// ─────────────────────────────────────────────
// MobileAuspexSlide 
// ─────────────────────────────────────────────
export default function MobileAuspex({ data, dbInvestments, dbTransactions, dbMetadata, userId }) {
  const [mode, setMode]                 = useState('trends');
  const [holdings, setHoldings]         = useState([]);
  const [history, setHistory]           = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);

  // Archive (past-month dossier)
  const todayMonth = new Date().toISOString().substring(0, 7);
  const [archiveMonth, setArchiveMonth] = useState(todayMonth);
  const [archiveData, setArchiveData]   = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const expenseTrends = data?.trends ?? [];
  const expenseCategories = data?.expenseCategories ?? [];

  // MIRRORED EXACTLY FROM DESKTOP
  useEffect(() => {
    const fetchInvestments = async () => {
      if (!dbInvestments) return;
      try {
        const result = await dbInvestments.allDocs({ include_docs: true });
        
        const snaps = collapseSnapshotsByMonth(result.rows
          .map(r => r.doc)
          .filter(doc => isSnapshotDoc(doc, userId))
          .map(normalizeSnapshot)
        );
        
        setHistory(snaps);

        const { doc: hDoc } = await getCurrentManifest(dbInvestments, userId);

        if (userId && userId !== 'default' && hDoc.user_id && hDoc.user_id !== userId) {
          setHoldings([]);
        } else {
          setHoldings((hDoc.assets ?? []).map(normalizeAsset));
        }

        if (selectedYear !== 'ALL' && snaps.length > 0 && !snaps.some(s => s.month.startsWith(selectedYear))) {
          setSelectedYear(snaps[snaps.length - 1].month.substring(0, 4));
        }
      } catch (err) { console.error("◈ AUSPEX_TRACE:", err); }
    };
    fetchInvestments();
    const changes = dbInvestments?.changes({ live: true, since: 'now', include_docs: true });
    changes?.on('change', change => {
      const id = change.id || change.doc?._id || '';
      if (
        id === legacyManifestId ||
        id === manifestIdForUser(userId) ||
        id.startsWith('finance:investments:snapshot:') ||
        id.startsWith('snapshot_')
      ) {
        fetchInvestments();
      }
    });
    changes?.on('error', err => console.error('AUSPEX:CHANGES', err));
    return () => changes?.cancel();
  }, [dbInvestments, data, userId, selectedYear]);

  // ── Archive: reconstruct a past month's ledger on demand ─────
  // Hold the ritual loader for a minimum duration so the lore plays.
  useEffect(() => {
    if (mode !== 'archive' || !dbTransactions || !dbMetadata || !userId || !archiveMonth) return;
    let cancelled = false;
    setArchiveLoading(true);
    const minHold = new Promise(r => setTimeout(r, 4100));
    const fetch   = FinanceEngine.reconstructBalances(dbTransactions, dbMetadata, archiveMonth, userId);
    Promise.all([fetch, minHold])
      .then(([result]) => { if (!cancelled) setArchiveData(result); })
      .catch(err => { console.error('AUSPEX:ARCHIVE', err); if (!cancelled) setArchiveData(null); })
      .finally(() => { if (!cancelled) setArchiveLoading(false); });
    return () => { cancelled = true; };
  }, [mode, archiveMonth, dbTransactions, dbMetadata, userId]);

  // MIRRORED EXACTLY FROM DESKTOP
  useEffect(() => {
    if (!dbInvestments || holdings.length === 0) return;
    const autoCommitByDate = async () => {
      const today = new Date();
      const monthStr = today.toISOString().substring(0, 7);
      const docId = `snapshot_${monthStr}`;
      
      try {
        const existing = await dbInvestments.get(docId).catch(() => null);
        
        // Minor fix to allow replacing corrupt 0 values generated by the broken mobile app
        if (existing && (Number(existing.invested ?? existing.total_invested ?? 0) > 0 || Number(existing.current ?? existing.total_current ?? 0) > 0)) return;

        const totalInvested = holdings.reduce((acc, ast) => {
          const shares = Number(ast.shares) || 0;
          const avgPrice = Number(ast.avgPrice) || 0;
          return acc + (avgPrice * shares);
        }, 0);
        
        const totalCurrent = holdings.reduce((acc, ast) => {
          const shares = Number(ast.shares) || 0;
          const currentPrice = Number(ast.currentprice ?? ast.price ?? ast.ltp ?? ast.avgPrice) || 0;
          return acc + (currentPrice * shares);
        }, 0);

        if (totalInvested === 0 && totalCurrent === 0) return; // Prevent overwriting with 0s

        const doc = {
          _id: docId,
          _rev: existing?._rev,
          type: 'investment_snapshot',
          month: monthStr,
          invested: totalInvested,
          current: totalCurrent,
          user_id: userId,
          updated: new Date().toISOString(),
        };
        
        await dbInvestments.put(doc);
        
        setHistory(prev => {
          const filtered = prev.filter(s => s.month !== monthStr);
          return [...filtered, doc].sort((a, b) => a.month.localeCompare(b.month));
        });
      } catch (err) {}
    };
    const timeoutId = setTimeout(autoCommitByDate, 2000);
    return () => clearTimeout(timeoutId);
  }, [dbInvestments, holdings, userId]);

  // MIRRORED EXACTLY FROM DESKTOP
  const saveHoldingToVault = async (ticker, newShares, newAvgPrice) => {
    if (!dbInvestments) return;
    try {
      const { doc, id: manifestId } = await getCurrentManifest(dbInvestments, userId);
      doc._id = manifestId;
      doc.type = doc.type || 'finance:investments:manifest';
      doc.assets = doc.assets || [];

      if (!doc.user_id) doc.user_id = userId;
      if (doc.user_id === 'default' && userId !== 'default') doc.user_id = userId;

      const idx = doc.assets.findIndex(a => a.ticker === ticker);
      if (idx >= 0) {
        doc.assets[idx].shares = newShares;
        doc.assets[idx].avgPrice = newAvgPrice;
        doc.assets[idx].avg_price = newAvgPrice;
      } else {
        doc.assets.push({
          id: `ast${Date.now()}`,
          ticker,
          shares: newShares,
          avgPrice: newAvgPrice,
          avg_price: newAvgPrice,
          currentprice: newAvgPrice,
          current_price: newAvgPrice,
        });
      }
      
      await dbInvestments.put(doc);
      setHoldings((doc.assets ?? []).map(normalizeAsset));
      setIsModalOpen(false);
      setEditingHolding(null);
    } catch (err) {}
  };

  const isAllYears = selectedYear === 'ALL';
  const filteredExpenses = isAllYears ? expenseTrends : expenseTrends.filter(t => t.month.startsWith(selectedYear));
  const expenseMonths = filteredExpenses.map(t => t.month);

  const expenseValues = filteredExpenses.map(t => {
    if (selectedCategory === 'ALL') {
      let trueTotal = 0;
      if (t.byCategory) {
        expenseCategories.forEach(cat => { trueTotal += Math.abs(t.byCategory[cat] || 0); });
      }
      return trueTotal;
    } else {
      return Math.abs(t.byCategory?.[selectedCategory] || 0);
    }
  });

  const filteredHistory = isAllYears ? history : history.filter(h => h.month.startsWith(selectedYear));
  const investMonths   = filteredHistory.map(h => h.month);
  const investedValues = filteredHistory.map(h => h.invested ?? h.current ?? 0);
  const currentValues  = filteredHistory.map(h => h.current ?? 0);

  // MIRRORED EXACTLY FROM DESKTOP
  const totalInvested = holdings.reduce((acc, a) => {
    const shares = Number(a.shares) || 0;
    const avgPrice = Number(a.avgPrice) || 0;
    return acc + (avgPrice * shares);
  }, 0);
  
  const totalValue = holdings.reduce((acc, a) => {
    const shares = Number(a.shares) || 0;
    const currentPrice = Number(a.currentprice ?? a.price ?? a.ltp ?? a.avgPrice) || 0;
    return acc + (currentPrice * shares);
  }, 0);
  
  const totalPL       = totalValue - totalInvested;
  const totalPLPct    = totalInvested > 0 ? ((totalPL / totalInvested) * 100).toFixed(2) : '0.00';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <style>{MOBILE_AUSPEX_STYLES}</style>

      {/* ── TABS ── */}
      <div className="mob-tab-bar">
        <button className={`mob-tab ${mode === 'trends' ? 'active' : ''}`} onClick={() => setMode('trends')}>
          [ TRENDS ]
        </button>
        <button className={`mob-tab ${mode === 'manifest' ? 'active' : ''}`} onClick={() => setMode('manifest')}>
          [ MANIFEST ]
        </button>
        <button className={`mob-tab ${mode === 'archive' ? 'active' : ''}`} onClick={() => setMode('archive')}>
          [ ARCHIVE ]
        </button>
      </div>

      <div className="mob-auspex-grid">
        {/* ── SUMMARY KPIs (portfolio — hidden in archive) ── */}
        {mode !== 'archive' && (
          <div className="panel mech-panel" style={{ padding: '15px' }}>
            <div className="mob-kpi-row">
              <div>
                <div className="kpi-lbl" style={{ fontSize: '9px' }}>CAPITAL DEPLOYED</div>
                <div className="kpi-val" style={{ fontSize: '18px' }}><ScrambleText text={totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })} /></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="kpi-lbl" style={{ fontSize: '9px' }}>MARKET VALUE</div>
                <div className="kpi-val" style={{ fontSize: '18px' }}><ScrambleText text={totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} /></div>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #2a0800', paddingTop: '8px', marginTop: '4px', textAlign: 'center' }}>
                <div className="kpi-lbl" style={{ fontSize: '9px' }}>NET YIELD</div>
                <div className={`kpi-val ${totalPL >= 0 ? 'ok' : 'warn'}`} style={{ fontSize: '18px' }}>
                  <ScrambleText text={`${totalPL >= 0 ? '+' : ''}${Math.abs(totalPL).toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${totalPLPct}%)`} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ARCHIVE MODE ── */}
        {mode === 'archive' && (() => {
          const monthOptions = (() => {
            const set = new Set((expenseTrends || []).map(t => t.month).filter(Boolean));
            const [y, m] = todayMonth.split('-').map(Number);
            for (let i = 0; i < 12; i++) {
              const d = new Date(y, m - 1 - i, 1);
              set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            return [...set].sort().reverse();
          })();
          const metrics = archiveData?.metrics || {};
          const txns    = archiveData?.transactions || [];
          const sorted  = [...txns].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const isLive  = archiveMonth === todayMonth;
          const genesisMonth = data?.genesisMonth;
          const isPreGenesis = genesisMonth && archiveMonth < genesisMonth;
          const incomeSet  = new Set(data?.positiveCategories || []);
          const neutralSet = new Set(data?.neutralCategories  || []);
          const txnKind = (tx) => {
            const cat = tx.category;
            if (incomeSet.has(cat))  return 'income';
            if (neutralSet.has(cat)) return 'transfer';
            return 'expense';
          };
          const KIND_COLOR = {
            income:   'var(--border-hi)',
            expense:  'var(--ba-crimson)',
            transfer: 'var(--ba-gold)',
          };

          return (
            <div className="panel mech-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  className="mech-select"
                  value={archiveMonth}
                  onChange={e => setArchiveMonth(e.target.value)}
                  style={{ flex: 1, marginTop: 0, fontSize: '11px', padding: '6px' }}
                >
                  {monthOptions.map(opt => (
                    <option key={opt} value={opt}>{formatMonthLabel(opt)}</option>
                  ))}
                </select>
                {isLive && (
                  <span style={{ fontSize: '8px', padding: '3px 6px', border: '1px solid var(--border-hi)', color: 'var(--border-hi)', letterSpacing: '2px' }}>LIVE</span>
                )}
              </div>

              {isPreGenesis && (
                <div className="mob-arch-warn">
                  <div className="mob-arch-warn-side">
                    ⚠
                    <small>HERETEK</small>
                  </div>
                  <div className="mob-arch-warn-body">
                    <div className="mob-arch-warn-ttl">◈ PRE-GENESIS DATA</div>
                    <div className="mob-arch-warn-sub">
                      Records before <strong style={{ color: '#fff' }}>{formatMonthLabel(genesisMonth)}</strong>{' '}
                      translated from legacy cogitator. Treat as approximation.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ padding: '8px', border: '1px solid var(--ba-border-lo)' }}>
                  <div className="kpi-lbl" style={{ fontSize: '8px' }}>GROSS TITHE</div>
                  <div className="kpi-val ok" style={{ fontSize: '14px' }}>
                    <ScrambleText text={fmtINR(metrics.grossIncome)} speed={50} step={0.3} />
                  </div>
                </div>
                <div style={{ padding: '8px', border: '1px solid var(--ba-border-lo)' }}>
                  <div className="kpi-lbl" style={{ fontSize: '8px' }}>GROSS EXPEND</div>
                  <div className="kpi-val warn" style={{ fontSize: '14px' }}>
                    <ScrambleText text={fmtINR(metrics.grossExpense)} speed={50} step={0.3} />
                  </div>
                </div>
                <div style={{ padding: '8px', border: '1px solid var(--ba-border-lo)' }}>
                  <div className="kpi-lbl" style={{ fontSize: '8px' }}>NET INCOME</div>
                  <div className="kpi-val ok" style={{ fontSize: '14px' }}>
                    <ScrambleText text={fmtINR(metrics.netIncome)} speed={50} step={0.3} />
                  </div>
                </div>
                <div style={{ padding: '8px', border: '1px solid var(--ba-border-lo)' }}>
                  <div className="kpi-lbl" style={{ fontSize: '8px' }}>NET EXPEND</div>
                  <div className="kpi-val warn" style={{ fontSize: '14px' }}>
                    <ScrambleText text={fmtINR(metrics.netExpense)} speed={50} step={0.3} />
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '9px', color: 'var(--ba-gold-mute)', letterSpacing: '1px', borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '4px' }}>
                {archiveLoading ? 'COMPILING...' : `${sorted.length} RECORDS · ${formatMonthLabel(archiveMonth)}`}
              </div>

              {archiveLoading ? (
                <MobileArchiveRitual ritualKey={archiveMonth} />
              ) : sorted.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ba-gold-mute)', fontSize: '11px', letterSpacing: '2px' }}>
                  NO RECORDS FOR {formatMonthLabel(archiveMonth)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {sorted.map(tx => {
                    const amt    = Math.abs(Number(tx.amount) || 0);
                    const kind   = txnKind(tx);
                    const prefix = kind === 'income' ? '+' : kind === 'expense' ? '−' : '';
                    return (
                      <div key={tx._id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                        padding: '7px 4px', borderBottom: '1px solid var(--ba-border-lo)',
                        fontFamily: 'var(--mono)', fontSize: '11px'
                      }}>
                        <div style={{ flexShrink: 0, color: 'var(--ba-gold-mute)', fontSize: '9px', width: '52px' }}>
                          {tx.date?.substring(5) || '—'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {tx.description || tx.category || '—'}
                          </div>
                          <div style={{ color: 'var(--ba-gold-mute)', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            {tx.category || '—'} · {tx.sub_account || tx.account_type || '—'}
                          </div>
                        </div>
                        <div style={{
                          flexShrink: 0, fontWeight: 'bold', textAlign: 'right', whiteSpace: 'nowrap',
                          color: KIND_COLOR[kind]
                        }}>
                          {prefix}{fmtINR(amt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── MANIFEST MODE ── */}
        {mode === 'manifest' && (
          <div className="panel mech-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="sec-ttl" style={{ margin: 0, fontSize: '12px' }}>PORTFOLIO MATRIX</div>
              <button className="mech-btn ok" style={{ margin: 0, padding: '6px 12px', fontSize: '10px' }}
                onClick={() => { setEditingHolding(null); setIsModalOpen(true); }}>
                [ + ASSET ]
              </button>
            </div>
            
            <div className="mob-table-wrapper">
              <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['TICKER', 'UNITS', 'AVG', 'CUR. VALUE', 'P/L'].map(h => (
                      <th key={h} style={{ padding: '10px 4px', textAlign: h === 'CUR. VALUE' || h === 'P/L' ? 'right' : 'left', fontSize: '9px', color: 'var(--text-d)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((ast, index) => {
                    // MIRRORED EXACTLY FROM DESKTOP
                    const shares = Number(ast.shares) || 0;
                    const avgPrice = Number(ast.avgPrice) || 0;
                    const currentPrice = Number(ast.currentprice ?? ast.price ?? ast.ltp ?? ast.avgPrice) || 0;
                    
                    const invested = avgPrice * shares;
                    const value = currentPrice * shares;
                    const pl = value - invested;

                    return (
                      <tr key={ast.id} className="assimilate-in" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', animationDelay: `${index * 0.05}s` }}>
                        <td style={{ padding: '8px 4px', maxWidth: '90px' }}>
                          <button className="mech-btn" 
                            style={{ margin: 0, padding: '4px 6px', fontSize: '10px', color: 'var(--border-hi)', background: 'transparent', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                            title={ast.ticker}
                            onClick={() => { setEditingHolding(ast); setIsModalOpen(true); }}>
                            {ast.ticker} ⚙
                          </button>
                        </td>
                        <td style={{ padding: '8px 4px', color: 'var(--text-d)', fontSize: '11px' }}>{shares.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '8px 4px', color: 'var(--text-d)', fontSize: '11px' }}>{avgPrice.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-d)', fontSize: '11px' }}>{value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: '11px' }} className={pl >= 0 ? 'ok' : 'warn'}>
                          {pl >= 0 ? '+' : ''}{pl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                  {holdings.length === 0 && (
                     <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-d)', fontSize: '10px' }}>VAULT IS EMPTY</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TRENDS MODE ── */}
        {mode === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            {/* PORTFOLIO GROWTH CHART */}
            <div className="mob-chart-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="sec-ttl" style={{ margin: 0, fontSize: '12px' }}>PORTFOLIO GROWTH</div>
                <select className="mech-select" style={{ width: '85px', marginTop: 0, fontSize: '10px', padding: '4px' }}
                  value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                  <option value="ALL">ALL YRS</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {filteredHistory.length > 0 ? (
                  <InteractiveMechChart
                    key={`inv-${selectedYear}`} months={investMonths} isDual={true} yPrefix="" showAverage={false}
                    series={[
                      { values: investedValues, color: '#d97706', label: 'INVESTED' },
                      { values: currentValues, color: '#22c55e', label: 'VALUE' },
                    ]}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-d)', fontSize: '10px', textAlign: 'center', padding: '0 10px' }}>
                    {history.length === 0
                      ? '[ VAULT IS EMPTY ]'
                      : `[ NO SNAPSHOTS FOR ${selectedYear} ]`
                    }
                  </div>
                )}
              </div>
            </div>

            {/* EXPENSE VELOCITY CHART */}
            <div className="mob-chart-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="sec-ttl" style={{ margin: 0, fontSize: '12px' }}>EXPENSE VELOCITY</div>
                <select className="mech-select" style={{ width: '100px', marginTop: 0, fontSize: '10px', padding: '4px' }}
                  value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                  <option value="ALL">ALL CATS</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c.substring(0,8).toUpperCase()}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {filteredExpenses.length > 0 ? (
                  <InteractiveMechChart
                    key={`exp-${selectedYear}-${selectedCategory}`} months={expenseMonths} isDual={false} showAverage={true}
                    series={[{
                      values: expenseValues, color: '#22c55e', label: selectedCategory === 'ALL' ? 'EXPENSES' : selectedCategory.toUpperCase()
                    }]}
                    onPointClick={(m) => { setArchiveMonth(m); setMode('archive'); }}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-d)', fontSize: '10px' }}>
                    [ NO DATA FOR {selectedYear} ]
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
      
      <ManifestOverrideModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} holding={editingHolding} onSave={saveHoldingToVault} />
    </div>
  );
}
