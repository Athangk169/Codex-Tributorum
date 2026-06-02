import React, { useMemo } from 'react';

// ◈ SHRINE BACKDROP ◈
// Candlelit Mechanicus shrine plate behind the boot screen, shared by the
// desktop (BootScreen) and mobile (MobileBootScreen) boot flows. All visual
// styling lives in GlobalStyles.css §21 — this component only places the
// graded photo, a centre-darkening well, and the screen-blended candle-glow
// + incense-smoke layers that bring the static plate to life.
//
//   <ShrineBackdrop />                 full effect (login / prompt)
//   <ShrineBackdrop dim />             darkened, for the terminal phase
//   <ShrineBackdrop mobile />          fewer glow/smoke nodes for phones
//
// Positions are percentages tuned to the candle clusters in shrine_candles.jpg
// (warm pools flanking left & right, plus the lower-centre pool by the walkway).

const GLOWS = [
  { x: 7,  y: 70, s: 210 },   // far-left candelabra
  { x: 15, y: 86, s: 180 },   // left floor pool
  { x: 93, y: 70, s: 210 },   // far-right candelabra
  { x: 85, y: 86, s: 180 },   // right floor pool
  { x: 50, y: 94, s: 210 },   // lower-centre pool (foot of the walkway)
];

const SMOKE = [
  { x: 10, y: 70 },           // off the left pools
  { x: 90, y: 70 },           // off the right pools
  { x: 50, y: 86 },           // centre walkway
  { x: 29, y: 56 },           // left rail
  { x: 71, y: 56 },           // right rail
];

const rand = (min, max) => (min + Math.random() * (max - min));

export default function ShrineBackdrop({ dim = false, mobile = false }) {
  // Randomise flicker/smoke timing once on mount so the candles never beat in
  // unison. useMemo keeps the seeds stable across re-renders (phase changes).
  const glows = useMemo(
    () => (mobile ? GLOWS.slice(0, 4) : GLOWS).map(g => ({
      ...g,
      dur:   rand(1.7, 3.3).toFixed(2),
      delay: (-rand(0, 3)).toFixed(2),
    })),
    [mobile],
  );

  const smoke = useMemo(
    () => (mobile ? SMOKE.slice(0, 2) : SMOKE).map(s => ({
      ...s,
      dur:   rand(9, 16).toFixed(2),
      delay: (-rand(0, 9)).toFixed(2),
      drift: Math.round(rand(-22, 22)),
      max:   rand(0.20, 0.38).toFixed(2),
    })),
    [mobile],
  );

  const glowScale  = mobile ? 0.7 : 1;
  const smokeW     = mobile ? 150 : 240;
  const smokeH     = mobile ? 210 : 320;

  return (
    <div className={`shrine-backdrop${dim ? ' is-dim' : ''}`} aria-hidden="true">
      <div className="shrine-backdrop__img" />
      <div className="shrine-backdrop__center" />

      {glows.map((g, i) => (
        <div
          key={`g${i}`}
          className="candle-glow-pos"
          style={{ left: `${g.x}%`, top: `${g.y}%`, width: g.s * glowScale, height: g.s * glowScale }}
        >
          <div className="candle-glow" style={{ '--fdur': `${g.dur}s`, '--fdelay': `${g.delay}s` }} />
        </div>
      ))}

      {smoke.map((s, i) => (
        <div
          key={`s${i}`}
          className="incense-pos"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: smokeW, height: smokeH }}
        >
          <div
            className="incense"
            style={{
              '--sdur':   `${s.dur}s`,
              '--sdelay': `${s.delay}s`,
              '--sdrift': `${s.drift}px`,
              '--smax':   s.max,
            }}
          />
        </div>
      ))}
    </div>
  );
}
