import React from 'react';

// ─────────────────────────────────────────────────────────────
// HeartbeatTrace
// Scrolling EKG-style status trace. Pure SVG, no JS animation loop.
// Two side-by-side copies of the heart waveform scroll left, with
// the right copy filling the gap the left one leaves — giving an
// endless tape.
//
// Props
//   rate   — seconds per beat (faster = more frequent). Idle: 2s.
//            Active/sync: ~0.8s. Error: 0.5s (rapid).
//   color  — stroke color. Pass a syncLed-derived hue.
//   width  — pixels (defaults to 48). Height fixed at 14.
// ─────────────────────────────────────────────────────────────

const WAVE = "0,7 8,7 10,4 12,10 14,2 16,12 18,7 28,7 32,5 34,9 36,7 48,7";

const HeartbeatTrace = ({
  rate = 2,
  color = '#4ade80',
  width = 48,
}) => {
  return (
    <span
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        width: `${width}px`,
        height: '14px',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes ekgScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-${width}px); }
        }
        .ekg-track {
          animation: ekgScroll var(--ekg-dur, 2s) linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ekg-track { animation-duration: 60s; }
        }
      `}</style>
      <svg
        width={width * 2}
        height="14"
        viewBox={`0 0 ${width * 2} 14`}
        style={{ display: 'block' }}
      >
        <g className="ekg-track" style={{ '--ekg-dur': `${rate}s` }}>
          <polyline
            points={WAVE}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={WAVE}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            transform={`translate(${width} 0)`}
          />
        </g>
      </svg>
    </span>
  );
};

export default HeartbeatTrace;
