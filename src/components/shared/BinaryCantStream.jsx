import React from 'react';

// ─────────────────────────────────────────────────────────────
// BinaryCantStream
// Scrolling stream of Mechanicus binary cant for the noospheric
// link readout. Pure CSS marquee — no JS animation loop.
// A fixed glyph string is rendered twice and translated -50% for a
// seamless tape; edges fade via a mask so glyphs ghost in and out.
// A handful of glyphs are rendered bright (data "packets") and
// flare as they scroll past.
//
// Props
//   rate   — seconds-per-beat from the sync state (lower = busier).
//            Drives scroll speed. Idle ~2.2s, sync ~1.1s, error ~0.45s.
//   color  — glyph hue (a syncLed-derived imperial tone).
//   width  — visible pixels (defaults to 72). Height fixed at 14.
// ─────────────────────────────────────────────────────────────

// Deterministic so it never reflows between renders. Reads as binary
// cant with the odd separator rune for texture.
const CANT = '01001 10110 01 11010 00101 1011 01001110 0110';
const GLYPHS = CANT.split('');

// Indices flagged as bright "packets".
const PACKETS = new Set([3, 11, 19, 27, 35]);

const BinaryCantStream = ({
  rate = 2,
  color = '#4ade80',
  width = 72,
}) => {
  // Whole glyph-set passes over a multiple of the beat rate so idle
  // drifts at a clearly readable pace and error races.
  const dur = (rate * 2.2).toFixed(2);

  const renderTape = (copy) =>
    GLYPHS.map((g, i) => {
      const packet = PACKETS.has(i);
      return (
        <span
          key={`${copy}-${i}`}
          style={{
            color,
            opacity: g === ' ' ? 1 : packet ? 1 : 0.62,
            textShadow: packet ? `0 0 6px ${color}, 0 0 10px ${color}88` : 'none',
            fontWeight: packet ? 700 : 400,
          }}
        >
          {g === ' ' ? ' ' : g}
        </span>
      );
    });

  return (
    <span
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        width: `${width}px`,
        height: '14px',
        overflow: 'hidden',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
        maskImage:
          'linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes cantScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .cant-track {
          display: flex;
          width: max-content;
          font-family: var(--mono, monospace);
          font-size: 11px;
          line-height: 14px;
          letter-spacing: 1.5px;
          animation: cantScroll var(--cant-dur, 8s) linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cant-track { animation-duration: 90s; }
        }
      `}</style>
      <div className="cant-track" style={{ '--cant-dur': `${dur}s` }}>
        {renderTape('a')}
        {renderTape('b')}
      </div>
    </span>
  );
};

export default BinaryCantStream;
