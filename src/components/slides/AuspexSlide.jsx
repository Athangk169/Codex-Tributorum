import React, { useState, useEffect, useRef } from 'react';
import ScrambleText from '../shared/ScrambleText';

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
const InteractiveMechChart = ({ months, series, isDual, yPrefix = '₹' }, { showAverage = true } = {}) => {
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
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
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

// AuspexSlide
const AuspexSlide = ({ data, dbInvestments, userId }) => {
  const [mode, setMode] = useState('trends');
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);

  // FIX: Use fallback empty arrays so nothing crashes when data is null/undefined
  const expenseTrends = data?.trends ?? [];
  // FIX 1: Inherit the strictly filtered categories from useFinanceData.
  const expenseCategories = data?.expenseCategories ?? [];

  useEffect(() => {
    const fetchInvestments = async () => {
      if (!dbInvestments) return;
      try {
        const result = await dbInvestments.allDocs({ include_docs: true });
        const snaps = result.rows
          .map(r => r.doc)
          .filter(doc =>
            doc.month &&
            doc.type === 'investment_snapshot' &&
            doc._id.startsWith('snapshot_') &&
            (!userId || userId === 'default' || doc.user_id === userId)
          )
          .sort((a, b) => a.month.localeCompare(b.month));
        setHistory(snaps);

        const hDoc = await dbInvestments
          .get('current_holdings')
          .catch(() => ({ assets: [], user_id: userId }));

        // FIX: Correct guard — only reject if userId is set, non-default, AND doesn't match
        if (userId && userId !== 'default' && hDoc.user_id && hDoc.user_id !== userId) {
          setHoldings([]);
        } else {
          setHoldings(hDoc.assets ?? []);
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
  }, [dbInvestments, data, userId]);

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
        if (existing) return;
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
        const doc = {
          _id: docId,
          type: 'investment_snapshot',
          month: monthStr,
          invested: totalInvested,
          current: totalCurrent,
          user_id: userId,
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
      const manifestId = 'current_holdings';
      const doc = await dbInvestments.get(manifestId).catch(() => ({
        _id: manifestId,
        type: 'investment_manifest',
        assets: [],
        user_id: userId,
      }));

      if (!doc.user_id) doc.user_id = userId;
      if (doc.user_id === 'default' && userId !== 'default') doc.user_id = userId;

      const idx = doc.assets.findIndex(a => a.ticker === ticker);
      // FIX: Was `idx > 0` which skipped updating the first asset (index 0),
      // causing a duplicate to be created instead. Changed to `idx >= 0`.
      if (idx >= 0) {
        doc.assets[idx].shares = newShares;
        doc.assets[idx].avgPrice = newAvgPrice;
      } else {
        doc.assets.push({
          id: `ast${Date.now()}`,
          ticker,
          shares: newShares,
          avgPrice: newAvgPrice,
          currentprice: newAvgPrice,
        });
      }
      await dbInvestments.put(doc);
      setHoldings(doc.assets);
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
          {['manifest', 'trends'].map(m => (
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
            <div className="kpi-val" style={{ fontSize: 18 }}><ScrambleText text={`₹${totalInvested.toLocaleString()}`} /></div>
          </div>
          <div>
            <div className="kpi-lbl">MARKET VALUE</div>
            <div className="kpi-val" style={{ fontSize: 18 }}><ScrambleText text={`₹${totalValue.toLocaleString()}`} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi-lbl">NET YIELD</div>
            <div className={`kpi-val${totalPL >= 0 ? ' ok' : ' warn'}`} style={{ fontSize: 18 }}>
              <ScrambleText text={`${totalPL >= 0 ? '+' : '-'}₹${Math.abs(totalPL).toLocaleString()} (${totalPLPct}%)`} />
            </div>
          </div>
        </div>
      </div>

      {/* MANIFEST MODE: Portfolio Table */}
      {mode === 'manifest' ? (
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
                        <td style={{ padding: '10px 8px 10px 0', color: 'var(--text-d)' }}>₹{avgPrice.toLocaleString()}</td>
                        <td style={{ padding: '10px 8px 10px 0', textAlign: 'right' }}>₹{invested.toLocaleString()}</td>
                        <td style={{ padding: '10px 8px 10px 0', textAlign: 'right', color: 'var(--text-d)' }}>₹{value.toLocaleString()}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right' }} className={pl >= 0 ? 'ok' : 'warn'}>
                          {pl >= 0 ? '+' : ''}₹{pl.toLocaleString()}
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
                    yPrefix="₹"
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