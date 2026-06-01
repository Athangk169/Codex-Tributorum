import React, { useState, useEffect, useRef } from 'react';
import ScrambleText from '../shared/ScrambleText';
import { FinanceEngine } from '../../utils/engine';

// ── Month helpers ─────────────────────────────────────────────
const formatMonthLabel = (monthPrefix) => {
  if (!monthPrefix) return '';
  const [y, m] = monthPrefix.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
};

const fmtINR = (n) => `${Math.round(n || 0).toLocaleString('en-IN')}`;

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

// ManifestOverrideModal — Data Entry Terminal
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
    if (!ticker || !shares || !avgPrice) return alert('ERROR: INCOMPLETE MANIFEST DATA.');
    onSave(ticker.toUpperCase(), parseFloat(shares), parseFloat(avgPrice));
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="panel mech-panel" style={{ width: 320, padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div className="sec-ttl" style={{ margin: 0, color: 'var(--border-hi)' }}>{holding ? 'OVERRIDE HOLDING' : 'INITIATE NEW HOLDING'}</div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-d)', marginBottom: 4 }}>TICKER DESIGNATION (e.g. BEL.NS)</div>
          <input className="mech-input" value={ticker} onChange={e => setTicker(e.target.value)} disabled={!!holding} style={{ marginTop: 0 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-d)', marginBottom: 4 }}>UNITS ACQUIRED</div>
          <input className="mech-input" type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} style={{ marginTop: 0 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-d)', marginBottom: 4 }}>AVERAGE COST BASIS</div>
          <input className="mech-input" type="number" step="any" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} style={{ marginTop: 0 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button className="mech-btn ok" style={{ flex: 1, marginTop: 0 }} onClick={handleSave}>SECURE</button>
          <button className="mech-btn warn" style={{ flex: 1, marginTop: 0, borderColor: 'var(--red)', color: 'var(--red)', background: 'rgba(248,113,113,0.1)' }} onClick={onClose}>ABORT</button>
        </div>
      </div>
    </div>
  );
};

// InteractiveMechChart — Dynamic SVG line chart
const InteractiveMechChart = ({ months, series, isDual, yPrefix = '', showAverage = true, onPointClick = null }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  if (!months.length || series.every(s => !s.values.length)) return null;

  const W = 600, H = 250;
  const PAD = { t: isDual ? 45 : 20, r: 20, b: 60, l: 60 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const allVals = series.flatMap(s => s.values.filter(v => isFinite(v)));
  const maxVal = Math.max(...allVals, 1);
  const chartMax = maxVal * 1.15;
  const n = months.length;
  const xAt = i => PAD.l + (n < 2 ? cW / 2 : (i / (n - 1)) * cW);
  const yAt = v => PAD.t + cH - (v / chartMax) * cH;

  // SMOOTH LINE GENERATOR
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

  const formatYAxis = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v);
  const yTicks = [0, chartMax * 0.25, chartMax * 0.5, chartMax * 0.75, chartMax];

  const formatXMonth = m => {
    const [year, month] = m.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  };

  const handleMouseMove = e => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPos = (e.clientX - rect.left) * (W / rect.width);
    let closestIdx = 0, minDiff = Infinity;
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
        <text key={`val-${i}`} x={8} y={currentY} fill={s.color} fontSize={9} fontFamily="var(--mono)">
          {s.label}: {yPrefix}{s.values[hoverIdx].toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </text>
      );
      currentY += 14;
      if (showAverage && s.values.length > 0) {
        const avg = s.values.reduce((sum, val) => sum + val, 0) / s.values.length;
        elements.push(
          <text key={`avg-${i}`} x={8} y={currentY} fill={s.color} fontSize={9} fontFamily="var(--mono)" opacity={0.6}>
            AVG: {yPrefix}{avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </text>
        );
        currentY += 14;
      }
    });
    return { elements, height: currentY - 4 };
  };

  const tooltipData = getTooltipContent();

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', cursor: onPointClick ? 'pointer' : 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}
        onClick={() => { if (onPointClick && hoverIdx !== null) onPointClick(months[hoverIdx]); }}>
        <defs>
          {/* Chart Grid Pattern for Area Fill */}
          <pattern id="chart-grid" width={12} height={12} patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          </pattern>
          <clipPath id={clipId}>
            <rect x={0} y={0} height="100%" className="anim-reveal" />
          </clipPath>
          <style>{`
            /* Stutter-step tactical wipe animation */
            @keyframes stutterRevealRect {
              0% { width: 0 } 20% { width: 30% } 25% { width: 25% }
              50% { width: 60% } 60% { width: 55% } 80% { width: 90% }
              85% { width: 85% } 100% { width: 100% }
            }
            .anim-reveal { animation: stutterRevealRect 1.2s steps(20, end) forwards; }
            .mech-anim-path { transition: d 0.4s ease-in-out; }
          `}</style>
        </defs>

        {/* Grid */}
        <g stroke="rgba(34,197,94,0.08)" strokeWidth={0.5}>
          {months.map((_, i) => <line key={`v-${i}`} x1={xAt(i)} x2={xAt(i)} y1={PAD.t} y2={PAD.t + cH} />)}
          {yTicks.map((v, i) => <line key={`h-${i}`} x1={PAD.l} x2={W - PAD.r} y1={yAt(v)} y2={yAt(v)} />)}
        </g>

        {/* Axis Labels */}
        <g fill="rgba(34,197,94,0.5)" fontSize={9} fontFamily="var(--mono)">
          {yTicks.map((v, i) => <text key={`yt-${i}`} x={PAD.l - 8} y={yAt(v) + 3} textAnchor="end">{yPrefix}{formatYAxis(v)}</text>)}
          {months.map((m, i) => (
            <text key={`xt-${i}`} x={xAt(i)} y={PAD.t + cH + 15} textAnchor="end"
              transform={`rotate(-45, ${xAt(i)}, ${PAD.t + cH + 15})`}>{formatXMonth(m)}</text>
          ))}
        </g>

        {/* Dual Legend */}
        {isDual && (
          <g transform={`translate(${W / 2}, 15)`} fontFamily="var(--mono)" fontSize={9} letterSpacing="1px">
            <rect x={-140} y={-8} width={50} height={14} fill="none" stroke={series[0].color} strokeWidth={1} strokeDasharray="2 2" />
            <line x1={-140} x2={-90} y1={-1} y2={-1} stroke={series[0].color} strokeWidth={2} />
            <text x={-80} y={3} fill="#ccc">{series[0].label}</text>
            <rect x={20} y={-8} width={50} height={14} fill="none" stroke={series[1].color} strokeWidth={1} />
            <line x1={20} x2={70} y1={-1} y2={-1} stroke={series[1].color} strokeWidth={2} />
            <text x={80} y={3} fill="#ccc">{series[1].label}</text>
          </g>
        )}

        {/* Average lines */}
        {showAverage && series.map((s, si) => {
          if (s.values.length === 0) return null;
          const avg = s.values.reduce((sum, val) => sum + val, 0) / s.values.length;
          const yAvg = yAt(avg);
          return (
            <g key={`avg-${si}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yAvg} y2={yAvg} stroke={s.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.35} />
              <text x={W - PAD.r} y={yAvg - 5} fill={s.color} fontSize={9} fontFamily="var(--mono)" opacity={0.6} textAnchor="end" letterSpacing="1px">AVG {yPrefix}{formatYAxis(avg)}</text>
            </g>
          );
        })}

        {/* Series: Area + Line + Nodes */}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s, si) => (
            <g key={`series-${si}`}>
              {/* Phosphor Decay Area Fills */}
              <path d={toAreaPath(s.values)} fill="url(#chart-grid)" opacity={0.5} />
              <path d={toAreaPath(s.values)} fill={s.color} opacity={0.08} />
              <path className="mech-anim-path" d={toSmoothPath(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {/* Tactical Square Nodes */}
              {s.values.map((v, i) => (
                <rect key={`node-${i}`} x={xAt(i) - 2.5} y={yAt(v) - 2.5} width={5} height={5} fill="#000" stroke={s.color} strokeWidth={1.5} />
              ))}
            </g>
          ))}
        </g>

        {/* Tactical Targeting Reticle + Tooltip */}
        {hoverIdx !== null && (
          <g>
            {/* Animated crosshairs */}
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PAD.t} y2={PAD.t + cH} stroke="var(--ba-crimson)" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
            <line x1={PAD.l} x2={W - PAD.r} y1={yAt(series[0].values[hoverIdx])} y2={yAt(series[0].values[hoverIdx])} stroke="var(--ba-crimson)" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.4} />
            <g transform={`translate(${xAt(hoverIdx) > W / 2 ? xAt(hoverIdx) - tooltipW - 12 : xAt(hoverIdx) + 12}, ${PAD.t})`}>
              <rect x={0} y={0} width={tooltipW} height={tooltipData.height} fill="rgba(8,1,1,0.95)" stroke="none" />
              {/* Blood Angels Corner Brackets */}
              <path d={`M 0 6 L 0 0 L 6 0`} fill="none" stroke="var(--ba-gold)" strokeWidth={1.5} />
              <path d={`M ${tooltipW} 6 L ${tooltipW} 0 L ${tooltipW - 6} 0`} fill="none" stroke="var(--ba-gold)" strokeWidth={1.5} />
              <path d={`M 0 ${tooltipData.height - 6} L 0 ${tooltipData.height} L 6 ${tooltipData.height}`} fill="none" stroke="var(--ba-gold)" strokeWidth={1.5} />
              <path d={`M ${tooltipW} ${tooltipData.height - 6} L ${tooltipW} ${tooltipData.height} L ${tooltipW - 6} ${tooltipData.height}`} fill="none" stroke="var(--ba-gold)" strokeWidth={1.5} />
              <text x={8} y={14} fill="var(--ba-gold-dim)" fontSize={9} fontFamily="var(--mono)" fontWeight="bold">{formatXMonth(months[hoverIdx]).toUpperCase()}</text>
              {tooltipData.elements}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ArchiveRitual — staged loading sequence shown while a past
// month is being summoned. Resets each time the key changes.
// ─────────────────────────────────────────────────────────────
const RITE_STEPS = [
  { code: '01010110', label: 'VOX-LINK STABILISING',       duration: 700 },
  { code: '01000011', label: 'COG-DAEMON AWAKENED',        duration: 750 },
  { code: '01010000', label: 'PURITY SEALS BROKEN',        duration: 650 },
  { code: '01000001', label: 'NOOSPHERIC PATHWAYS BOUND',  duration: 750 },
  { code: '01000100', label: 'ARCHIVE OF BAAL UNSEALED',   duration: 800 },
];

const randomBinaryWord = () => {
  let s = '';
  for (let i = 0; i < 4; i++) {
    let nibble = '';
    for (let j = 0; j < 4; j++) nibble += Math.random() < 0.5 ? '0' : '1';
    s += (i ? ' ' : '') + nibble;
  }
  return s;
};

const ArchiveRitual = ({ ritualKey }) => {
  const [stage, setStage]     = useState(0);
  const [progress, setProgress] = useState(0);
  const [binharic, setBinharic] = useState(() => randomBinaryWord());

  // Drive stage + per-stage progress
  useEffect(() => {
    setStage(0); setProgress(0);
    let cancelled = false;
    let raf;

    const runStage = (i) => {
      if (cancelled || i >= RITE_STEPS.length) return;
      const duration = RITE_STEPS[i].duration;
      const start = performance.now();
      const tick = () => {
        if (cancelled) return;
        const elapsed = performance.now() - start;
        const pct = Math.min(100, (elapsed / duration) * 100);
        setProgress(pct);
        if (pct >= 100) {
          setStage(i + 1);
          setProgress(0);
          // small breath between stages
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

  // Binharic litany at the bottom — rolls every 140ms
  useEffect(() => {
    const iv = setInterval(() => setBinharic(randomBinaryWord()), 140);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="arch-ritual">
      <div className="arch-rite-head">
        <span className="arch-rite-title">RITE OF RECOLLECTION</span>
      </div>

      <div className="arch-rite-tbl">
        {RITE_STEPS.map((s, i) => {
          const done    = i < stage;
          const active  = i === stage;
          const pending = i > stage;
          const pct     = active ? progress : done ? 100 : 0;
          return (
            <div
              key={`${ritualKey}-${i}`}
              className={`arch-rite-row ${done ? 'done' : active ? 'active' : 'pending'}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="arch-rite-code">{s.code}</span>
              <span>{s.label}{active ? '...' : ''}</span>
              <div className="arch-rite-bar"><span style={{ width: `${pct}%` }} /></div>
              <span className="arch-rite-mark">{done ? '✓' : active ? '◈' : '·'}</span>
            </div>
          );
        })}
      </div>

      <div className="arch-binharic">
        <span>«</span> BINHARIC LITANY · {binharic} <span>»</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// ArchiveView — past-month ledger dossier
// ─────────────────────────────────────────────────────────────
const ArchiveView = ({ archiveMonth, setArchiveMonth, archiveData, archiveLoading, trends, todayMonth, genesisMonth, positiveCategories = [], neutralCategories = [] }) => {
  const incomeSet  = new Set(positiveCategories);
  const neutralSet = new Set(neutralCategories);
  const txnKind = (tx) => {
    const cat = tx.category;
    if (incomeSet.has(cat))  return 'income';
    if (neutralSet.has(cat)) return 'transfer';
    return 'expense';
  };
  // Build month list: union of trend months + last 12 months back from today
  const monthOptions = (() => {
    const set = new Set((trends || []).map(t => t.month).filter(Boolean));
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
  const isPreGenesis = genesisMonth && archiveMonth < genesisMonth;

  return (
    <>
      <style>{`
        .arch-dossier {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
          padding: 14px 16px; border-bottom: 1px solid var(--ba-border-lo);
        }
        .arch-stat { font-family: var(--mono); }
        .arch-stat-lbl { font-size: 9px; color: var(--ba-gold-dim); letter-spacing: 2px; text-transform: uppercase; }
        .arch-stat-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
        .arch-stat-val.income  { color: var(--border-hi); text-shadow: 0 0 8px rgba(74,222,128,0.4); }
        .arch-stat-val.expense { color: var(--ba-crimson); text-shadow: 0 0 8px rgba(204,34,0,0.4); }
        .arch-stat-val.net     { color: var(--ba-gold);  text-shadow: 0 0 8px rgba(201,168,76,0.4); }

        .arch-tbl { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 11px; }
        .arch-tbl thead th {
          position: sticky; top: 0;
          background: rgba(8,2,2,0.95); padding: 8px 10px;
          font-size: 9px; letter-spacing: 2px; color: var(--ba-gold-dim);
          font-weight: normal; text-align: left;
          border-bottom: 1px solid var(--ba-border-lo);
        }
        .arch-tbl tbody tr { border-bottom: 1px solid var(--ba-border-lo); transition: background 0.15s; }
        .arch-tbl tbody tr:nth-child(even) { background: rgba(201,168,76,0.03); }
        .arch-tbl tbody tr:hover { background: rgba(204,34,0,0.08); }
        .arch-tbl td { padding: 7px 10px; vertical-align: top; }
        .arch-amt { text-align: right; font-weight: bold; white-space: nowrap; }
        .arch-amt.income   { color: var(--border-hi); }
        .arch-amt.expense  { color: var(--ba-crimson); }
        .arch-amt.transfer { color: var(--ba-gold); }
        .arch-cat {
          font-size: 9px; color: var(--ba-gold-mute); letter-spacing: 1px;
          text-transform: uppercase;
        }
        .arch-live-tag {
          font-size: 9px; padding: 2px 8px; margin-left: 8px;
          background: rgba(74,222,128,0.12); border: 1px solid var(--border-hi);
          color: var(--border-hi); letter-spacing: 2px;
        }

        /* ── Pre-Genesis warning banner ── */
        .arch-warn {
          display: flex; align-items: stretch; gap: 0;
          margin: 0; flex-shrink: 0;
          background: linear-gradient(90deg,
            rgba(204,34,0,0.18) 0%,
            rgba(234,179,8,0.10) 25%,
            rgba(234,179,8,0.10) 75%,
            rgba(204,34,0,0.18) 100%);
          border-top: 1px solid var(--ba-crimson);
          border-bottom: 2px solid var(--ba-crimson);
          font-family: var(--mono);
          color: #eab308;
          animation: archWarnPulse 1.6s ease-in-out infinite;
          position: relative;
          overflow: hidden;
        }
        .arch-warn::before {
          content: '';
          position: absolute; top: 0; bottom: 0;
          width: 200%;
          background: repeating-linear-gradient(45deg,
            transparent 0 8px,
            rgba(204,34,0,0.12) 8px 12px);
          animation: archWarnSlide 6s linear infinite;
          z-index: 0;
        }
        .arch-warn-sidebar {
          flex-shrink: 0;
          width: 56px;
          background: rgba(204,34,0,0.45);
          color: #fff;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-size: 22px;
          text-shadow: 0 0 12px #cc2200, 0 0 4px #fff;
          border-right: 1px solid var(--ba-crimson);
          z-index: 1;
        }
        .arch-warn-sidebar small {
          font-size: 7px; letter-spacing: 2px; margin-top: 2px; opacity: 0.85;
        }
        .arch-warn-body {
          flex: 1; padding: 10px 14px;
          display: flex; flex-direction: column; gap: 3px;
          z-index: 1;
        }
        .arch-warn-title {
          font-size: 11px; letter-spacing: 3px;
          color: var(--ba-crimson);
          font-weight: bold;
          text-shadow: 0 0 8px rgba(204,34,0,0.7);
          text-transform: uppercase;
        }
        .arch-warn-detail {
          font-size: 10px; letter-spacing: 1px; line-height: 1.5;
          color: #fbe9b0;
          text-shadow: 0 0 6px rgba(234,179,8,0.4);
        }
        @keyframes archWarnPulse {
          0%, 100% { box-shadow: inset 0 0 18px rgba(204,34,0,0.25); }
          50%      { box-shadow: inset 0 0 28px rgba(204,34,0,0.55); }
        }
        @keyframes archWarnSlide {
          0%   { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }

        /* ── Ritual loader — Mechanicus binharic rite log ── */
        .arch-ritual {
          padding: 28px 22px 34px;
          display: flex; flex-direction: column; align-items: stretch;
          gap: 18px; font-family: var(--mono);
          position: relative;
          background:
            linear-gradient(180deg, transparent 0%, rgba(204,34,0,0.04) 50%, transparent 100%);
          background-size: 100% 6px;
          animation: archRitualScan 3.5s linear infinite;
          overflow: hidden;
        }
        @keyframes archRitualScan {
          0%   { background-position: 0 0; }
          100% { background-position: 0 100%; }
        }
        .arch-ritual::before {
          content: '';
          position: absolute; left: 0; right: 0; top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--ba-crimson), transparent);
          animation: archSweep 2.8s cubic-bezier(0.4,0,0.2,1) infinite;
          box-shadow: 0 0 8px rgba(204,34,0,0.6);
        }
        @keyframes archSweep {
          0%   { transform: translateY(0);     opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(380px); opacity: 0; }
        }

        .arch-rite-head {
          display: flex; align-items: center; justify-content: center; gap: 16px;
        }
        .arch-rite-glyph {
          font-size: 28px; color: var(--ba-crimson);
          text-shadow: 0 0 14px rgba(204,34,0,0.8), 0 0 4px #fff;
          animation: archGlyphStutter 0.6s steps(4, end) infinite;
          letter-spacing: 6px;
        }
        @keyframes archGlyphStutter {
          0%   { transform: translate(0, 0)   rotate(0deg);   opacity: 0.55; }
          25%  { transform: translate(-1px, 1px) rotate(-3deg); opacity: 1; filter: brightness(1.4); }
          50%  { transform: translate(0, 0)   rotate(0deg);   opacity: 0.85; }
          75%  { transform: translate(1px, -1px) rotate(3deg); opacity: 1; filter: brightness(1.4); }
          100% { transform: translate(0, 0)   rotate(0deg);   opacity: 0.55; }
        }
        .arch-rite-title {
          font-size: 12px; letter-spacing: 4px; color: var(--ba-gold);
          text-shadow: 0 0 8px rgba(201,168,76,0.5);
          font-weight: bold;
        }

        .arch-rite-tbl {
          display: flex; flex-direction: column; gap: 8px;
          font-size: 11px; letter-spacing: 1.5px;
          padding: 8px 14px;
          border-top: 1px solid var(--ba-border-lo);
          border-bottom: 1px solid var(--ba-border-lo);
          background: rgba(0,0,0,0.35);
        }
        .arch-rite-row {
          display: grid;
          grid-template-columns: 100px 1fr 140px 20px;
          align-items: center; gap: 14px;
          opacity: 0; transform: translateX(-8px);
          animation: archRiteRowIn 220ms cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes archRiteRowIn { to { opacity: 1; transform: translateX(0); } }
        .arch-rite-row.pending { opacity: 0.28; }
        .arch-rite-row.done    { color: var(--border-hi); text-shadow: 0 0 6px rgba(74,222,128,0.35); }
        .arch-rite-row.active  { color: var(--ba-crimson); text-shadow: 0 0 8px rgba(204,34,0,0.55); }
        .arch-rite-code { color: var(--ba-gold-dim); font-size: 10px; }
        .arch-rite-row.done .arch-rite-code,
        .arch-rite-row.active .arch-rite-code { color: inherit; opacity: 0.7; }
        .arch-rite-bar {
          height: 8px; background: rgba(0,0,0,0.6);
          border: 1px solid var(--ba-border-lo);
          position: relative; overflow: hidden;
        }
        .arch-rite-bar > span {
          display: block; height: 100%;
          background: repeating-linear-gradient(90deg,
            var(--ba-crimson) 0 6px,
            rgba(204,34,0,0.4) 6px 8px);
          box-shadow: 0 0 6px rgba(204,34,0,0.5);
          transition: width 60ms linear;
        }
        .arch-rite-row.done .arch-rite-bar > span {
          background: repeating-linear-gradient(90deg,
            var(--border-hi) 0 6px,
            rgba(74,222,128,0.4) 6px 8px);
          box-shadow: 0 0 6px rgba(74,222,128,0.4);
        }
        .arch-rite-mark {
          font-size: 14px; text-align: center; line-height: 1;
        }
        .arch-rite-row.done .arch-rite-mark   { color: var(--border-hi); animation: archStamp 360ms cubic-bezier(0.16,1,0.3,1) both; }
        .arch-rite-row.active .arch-rite-mark { color: var(--ba-crimson); animation: archMarkPulse 0.45s steps(2, end) infinite; }
        @keyframes archStamp {
          0%   { transform: scale(2.2); opacity: 0; filter: brightness(2.5); }
          60%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes archMarkPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }

        .arch-binharic {
          font-size: 10px; letter-spacing: 3px;
          color: var(--ba-gold-dim);
          text-align: center; opacity: 0.6;
        }
        .arch-binharic span { color: var(--ba-crimson); text-shadow: 0 0 6px rgba(204,34,0,0.4); }
      `}</style>

      <div className="panel mech-panel" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Pre-Genesis warning — placed BEFORE picker so it's the first thing seen */}
        {isPreGenesis && (
          <div className="arch-warn">
            <div className="arch-warn-sidebar">
              ⚠
              <small>HERETEK</small>
            </div>
            <div className="arch-warn-body">
              <div className="arch-warn-title">
                ◈ DATA-SPOOR PREDATES GENESIS RITE
              </div>
              <div className="arch-warn-detail">
                Records prior to <strong style={{ color: '#fff' }}>{formatMonthLabel(genesisMonth)}</strong> were
                translated from a legacy cogitator. Categorisation, sub-account routing, and balances may be incomplete.
                Treat as approximation, not record.
              </div>
            </div>
          </div>
        )}

        {/* Picker + dossier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--ba-border-lo)' }}>
          <div className="sec-ttl" style={{ margin: 0 }}>MONTHLY DOSSIER</div>
          <select
            className="mech-select"
            value={archiveMonth}
            onChange={e => setArchiveMonth(e.target.value)}
            style={{ width: 200, marginTop: 0 }}
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>
          {isLive && <span className="arch-live-tag">LIVE</span>}
          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ba-gold-mute)', letterSpacing: 1 }}>
            {archiveLoading ? 'COMPILING...' : `${sorted.length} RECORDS`}
          </div>
        </div>

        <div className="arch-dossier">
          <div className="arch-stat">
            <div className="arch-stat-lbl">GROSS TITHE</div>
            <div className="arch-stat-val income">
              <ScrambleText text={fmtINR(metrics.grossIncome)} speed={50} step={0.25} />
            </div>
          </div>
          <div className="arch-stat">
            <div className="arch-stat-lbl">GROSS EXPENDITURE</div>
            <div className="arch-stat-val expense">
              <ScrambleText text={fmtINR(metrics.grossExpense)} speed={50} step={0.25} />
            </div>
          </div>
          <div className="arch-stat">
            <div className="arch-stat-lbl">NET INCOME</div>
            <div className="arch-stat-val income">
              <ScrambleText text={fmtINR(metrics.netIncome)} speed={50} step={0.25} />
            </div>
          </div>
          <div className="arch-stat">
            <div className="arch-stat-lbl">NET EXPENDITURE</div>
            <div className="arch-stat-val expense">
              <ScrambleText text={fmtINR(metrics.netExpense)} speed={50} step={0.25} />
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {archiveLoading ? (
            <ArchiveRitual ritualKey={archiveMonth} />
          ) : sorted.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ba-gold-mute)', fontSize: 12, letterSpacing: 2 }}>
              NO RECORDS FOR {formatMonthLabel(archiveMonth)}
            </div>
          ) : (
            <table className="arch-tbl">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>DATE</th>
                  <th>DESCRIPTION</th>
                  <th style={{ width: 130 }}>CATEGORY</th>
                  <th style={{ width: 110 }}>ACCOUNT</th>
                  <th style={{ width: 110, textAlign: 'right' }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(tx => {
                  const kind = txnKind(tx);
                  const prefix = kind === 'income' ? '+' : kind === 'expense' ? '−' : '';
                  return (
                    <tr key={tx._id}>
                      <td style={{ color: 'var(--ba-gold-mute)' }}>{tx.date}</td>
                      <td style={{ color: '#fff' }}>{tx.description || tx.category || '—'}</td>
                      <td className="arch-cat">{tx.category || '—'}</td>
                      <td className="arch-cat">{tx.sub_account || tx.account_type || '—'}</td>
                      <td className={`arch-amt ${kind}`}>
                        {prefix}{fmtINR(Math.abs(Number(tx.amount) || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};

// AuspexSlide
const AuspexSlide = ({ data, dbInvestments, dbTransactions, dbMetadata, userId }) => {
  const [mode, setMode] = useState('trends');
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);

  // Archive (past-month dossier) state
  const todayMonth = new Date().toISOString().substring(0, 7);
  const [archiveMonth, setArchiveMonth] = useState(todayMonth);
  const [archiveData, setArchiveData] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // FIX: Use fallback empty arrays so nothing crashes when data is null/undefined
  const expenseTrends = data?.trends ?? [];
  // FIX 1: Inherit the strictly filtered categories from useFinanceData.
  const expenseCategories = data?.expenseCategories ?? [];

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

        // FIX: Correct guard — only reject if userId is set, non-default, AND doesn't match
        if (userId && userId !== 'default' && hDoc.user_id && hDoc.user_id !== userId) {
          setHoldings([]);
        } else {
          setHoldings((hDoc.assets ?? []).map(normalizeAsset));
        }

        // Auto-select the most recent year that has data if current selection has no data
        if (selectedYear !== 'ALL' && snaps.length > 0 && !snaps.some(s => s.month.startsWith(selectedYear))) {
          setSelectedYear(snaps[snaps.length - 1].month.substring(0, 4));
        }
      } catch (err) {
        console.error('AUSPEX:TRACE', err);
      }
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
  // The fetch is fast, but we hold the ritual loader for a minimum
  // duration so the lore animation has time to play.
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

  useEffect(() => {
    if (!dbInvestments || holdings.length === 0) return;
    const autoCommitByDate = async () => {
      const today = new Date();
      // FIX: Was `< 28` which prevented ALL snapshots before the 28th.
      // Now commits whenever holdings exist and the snapshot for this month is missing.
      const monthStr = today.toISOString().substring(0, 7);
      const docId = `snapshot_${monthStr}`;
      try {
        const existing = await dbInvestments.get(docId).catch(() => null);
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
        if (totalInvested === 0 && totalCurrent === 0) return;
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
      } catch (err) {
        console.error(err);
      }
    };
    const timeoutId = setTimeout(autoCommitByDate, 2000);
    return () => clearTimeout(timeoutId);
  }, [dbInvestments, holdings, userId]);

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
      // FIX: Was `idx > 0` which skipped updating the first asset (index 0),
      // causing a duplicate to be created instead. Changed to `idx >= 0`.
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
    } catch (err) {
      console.error('VAULT REJECTION:', err);
    }
  };

  const isAllYears = selectedYear === 'ALL';
  const filteredExpenses = isAllYears
    ? expenseTrends
    : expenseTrends.filter(t => t.month.startsWith(selectedYear));
  const expenseMonths = filteredExpenses.map(t => t.month);
  const expenseValues = filteredExpenses.map(t => {
    if (selectedCategory === 'ALL') {
      // FIX 2: Dynamically calculate total by summing ONLY valid expenses.
      let trueTotal = 0;
      if (t.byCategory) expenseCategories.forEach(cat => { trueTotal += Math.abs(t.byCategory[cat] || 0); });
      return trueTotal;
    } else {
      return Math.abs(t.byCategory?.[selectedCategory] || 0);
    }
  });

  const filteredHistory = isAllYears ? history : history.filter(h => h.month.startsWith(selectedYear));
  const investMonths = filteredHistory.map(h => h.month);
  const investedValues = filteredHistory.map(h => h.invested ?? h.current ?? 0);
  const currentValues = filteredHistory.map(h => h.current ?? 0);

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
  
  const totalPL = totalValue - totalInvested;
  const totalPLPct = totalInvested > 0 ? ((totalPL / totalInvested) * 100).toFixed(2) : '0.00';

  return (
    <div className="slide-container active" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 15 }}>
      {/* MANIFEST STYLES */}
      <style>{`
        .manifest-row { transition: background 0.2s ease, box-shadow 0.2s ease; position: relative; }
        .manifest-row:hover { background: rgba(200,34,0,0.08); box-shadow: inset 0 0 15px rgba(200,34,0,0.15); }
        .manifest-row td:first-child { position: relative; }
        .manifest-row td:last-child { position: relative; }
        .manifest-row:hover td:first-child::before { content: ''; position: absolute; top: 4px; left: 4px; width: 6px; height: 6px; border-top: 1px solid #cc2200; border-left: 1px solid #cc2200; }
        .manifest-row:hover td:last-child::after { content: ''; position: absolute; bottom: 4px; right: 4px; width: 6px; height: 6px; border-bottom: 1px solid #cc2200; border-right: 1px solid #cc2200; }
        @keyframes dataAssimilate {
          0% { opacity: 0; transform: translateY(-8px) scale(0.98); filter: brightness(2); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .assimilate-in { animation: dataAssimilate 0.4s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; opacity: 0; }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 15, flexShrink: 0 }}>
        <div className="panel mech-panel" style={{ padding: 15, display: 'flex', gap: 10 }}>
          {['manifest', 'trends', 'archive'].map(m => (
            <button key={m} className={`mech-btn${mode === m ? ' active' : ''}`}
              style={{ flex: 1, margin: 0, background: mode === m ? 'var(--border-hi)' : 'transparent', color: mode === m ? '#000' : 'var(--text-d)' }}
              onClick={() => setMode(m)}>{m.toUpperCase()}</button>
          ))}
          {mode === 'manifest' && (
            <button className="mech-btn ok" style={{ flex: 1, margin: 0, borderColor: 'var(--border-hi)', color: 'var(--border-hi)', background: 'rgba(34,197,94,0.05)' }}
              onClick={() => { setEditingHolding(null); setIsModalOpen(true); }}>+ ASSET</button>
          )}
        </div>
        <div className="panel mech-panel" style={{ padding: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="kpi-lbl">CAPITAL DEPLOYED</div>
            <div className="kpi-val" style={{ fontSize: 18 }}><ScrambleText text={`${totalInvested.toLocaleString()}`} /></div>
          </div>
          <div>
            <div className="kpi-lbl">MARKET VALUE</div>
            <div className="kpi-val" style={{ fontSize: 18 }}><ScrambleText text={`${totalValue.toLocaleString()}`} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi-lbl">NET YIELD</div>
            <div className={`kpi-val${totalPL >= 0 ? ' ok' : ' warn'}`} style={{ fontSize: 18 }}>
              <ScrambleText text={`${totalPL >= 0 ? '+' : '-'}${Math.abs(totalPL).toLocaleString()} (${totalPLPct}%)`} />
            </div>
          </div>
        </div>
      </div>

      {/* MANIFEST MODE: Portfolio Table */}
      {mode === 'archive' ? (
        <ArchiveView
          archiveMonth={archiveMonth}
          setArchiveMonth={setArchiveMonth}
          archiveData={archiveData}
          archiveLoading={archiveLoading}
          trends={expenseTrends}
          todayMonth={todayMonth}
          genesisMonth={data?.genesisMonth}
          positiveCategories={data?.positiveCategories || []}
          neutralCategories={data?.neutralCategories || []}
        />
      ) : mode === 'manifest' ? (
        <div className="panel mech-panel" style={{ padding: 20, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="sec-ttl">PORTFOLIO MATRIX</div>
          {holdings.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-d)', fontSize: 12 }}>
              NO HOLDINGS — INITIATE A NEW ASSET TO BEGIN
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="investment-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-d)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['TICKER', 'SHARES', 'AVG', 'INVESTED', 'CUR. VALUE', 'P&L'].map(h => (
                      <th key={h} style={{ padding: '10px 8px 10px 0', textAlign: ['INVESTED', 'CUR. VALUE', 'P&L'].includes(h) ? 'right' : 'left', fontSize: 10, color: 'var(--text-d)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((ast, index) => {
                    // Defensive checks: ensure all values are valid numbers
                    const shares = Number(ast.shares) || 0;
                    const avgPrice = Number(ast.avgPrice) || 0;
                    const currentPrice = Number(ast.currentprice ?? ast.price ?? ast.ltp ?? ast.avgPrice) || 0;
                    
                    const invested = avgPrice * shares;
                    const value = currentPrice * shares;
                    const pl = value - invested;
                    const animDelay = `${Math.min(index * 0.05, 0.4)}s`;
                    return (
                      <tr key={ast.id} className="manifest-row assimilate-in"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', animationDelay: animDelay }}>
                        <td style={{ padding: '10px 8px 10px 0' }}>
                          <button className="mech-btn" style={{ margin: 0, padding: '4px 8px', fontSize: 11, color: 'var(--border-hi)', border: '1px solid transparent', background: 'rgba(34,197,94,0.05)', width: 'auto' }}
                            onClick={() => { setEditingHolding(ast); setIsModalOpen(true); }}>{ast.ticker}</button>
                        </td>
                        <td style={{ padding: '10px 8px 10px 0', color: 'var(--text-d)' }}>{shares.toLocaleString()}</td>
                        <td style={{ padding: '10px 8px 10px 0', color: 'var(--text-d)' }}>{avgPrice.toLocaleString()}</td>
                        <td style={{ padding: '10px 8px 10px 0', textAlign: 'right' }}>{invested.toLocaleString()}</td>
                        <td style={{ padding: '10px 8px 10px 0', textAlign: 'right', color: 'var(--text-d)' }}>{value.toLocaleString()}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right' }} className={pl >= 0 ? 'ok' : 'warn'}>
                          {pl >= 0 ? '+' : ''}{pl.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* TRENDS MODE: Charts */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, flex: 1, minHeight: 0 }}>
          {/* EXPENSE VELOCITY */}
          <div className="panel mech-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="sec-ttl" style={{ margin: 0 }}>EXPENSE VELOCITY</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="mech-select" style={{ width: 85, marginTop: 0 }} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                  <option value="ALL">ALL YEARS</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
                <select className="mech-select" style={{ width: 120, marginTop: 0 }} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                  <option value="ALL">ALL EXPENSES</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {filteredExpenses.length > 0
                ? <InteractiveMechChart
                    key={`exp-${selectedYear}-${selectedCategory}`}
                    months={expenseMonths}
                    isDual={false}
                    showAverage={true}
                    series={[{ values: expenseValues, color: '#22c55e', label: selectedCategory === 'ALL' ? 'EXPENSES' : selectedCategory.toUpperCase() }]}
                    onPointClick={(m) => { setArchiveMonth(m); setMode('archive'); }}
                  />
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-d)', fontSize: 12 }}>
                    NO DATA FOR {selectedYear}
                  </div>
              }
            </div>
          </div>

          {/* PORTFOLIO GROWTH */}
          <div className="panel mech-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="sec-ttl" style={{ margin: 0 }}>PORTFOLIO GROWTH</div>
              {/* FIX: Show helpful message with year context instead of just "VAULT IS EMPTY" */}
              <div style={{ fontSize: 9, color: 'var(--text-d)', letterSpacing: '0.06em' }}>TIMELINE: {selectedYear}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {filteredHistory.length > 0
                ? <InteractiveMechChart
                    key={`inv-${selectedYear}`}
                    months={investMonths}
                    isDual={true}
                    yPrefix=""
                    showAverage={false}
                    series={[
                      { values: investedValues, color: '#d97706', label: 'AMOUNT INVESTED' },
                      { values: currentValues, color: '#22c55e', label: 'CURRENT VALUE' },
                    ]}
                  />
                : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-d)', fontSize: 12 }}>
                    {/* FIX: Show accurate message — "no data for year" vs truly "vault is empty" */}
                    {history.length === 0
                      ? 'VAULT IS EMPTY — ADD HOLDINGS TO BEGIN TRACKING'
                      : `NO SNAPSHOTS FOR ${selectedYear} — TRY "ALL YEARS"`
                    }
                  </div>
              }
            </div>
          </div>
        </div>
      )}

      {/* OVERRIDE MODAL */}
      <ManifestOverrideModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        holding={editingHolding}
        onSave={saveHoldingToVault}
      />
    </div>
  );
};

export default AuspexSlide;
