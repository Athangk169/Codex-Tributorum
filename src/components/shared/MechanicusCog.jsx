import React from 'react';

// ─────────────────────────────────────────────────────────────
// MechanicusCog
// The Opus Machina cog-skull (public/cog.jpeg) spinning as the
// noospheric link readout. The source is bronze on pure black, so
// mixBlendMode: 'screen' drops the black and leaves only the cog —
// the same trick angel.png uses in this header. Pure CSS rotation,
// no JS loop. Spin speed tracks the sync rate; on error/red the
// cog judders via a shake layered over the spin.
//
// Props
//   rate   — seconds-per-beat from the sync state (lower = busier).
//   color  — unused for tint (the bronze stays bronze); kept for a
//            consistent call signature with the other readouts.
//   size   — pixels, square (defaults to 20).
//   state  — optional syncLed value; 'error'/'red' triggers judder.
//   active — when false the spin freezes in place (link is down). The
//            judder still plays on error so a severed link rattles in
//            alarm rather than turning.
// ─────────────────────────────────────────────────────────────

const MechanicusCog = ({
  rate = 2,
  // eslint-disable-next-line no-unused-vars
  color = '#4ade80',
  size = 20,
  state = 'idle',
  active = true,
}) => {
  const spinDur = (rate * 2.6).toFixed(2);
  const judder = state === 'error' || state === 'red';

  return (
    <span
      className={judder ? 'cog-shake' : undefined}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        width: `${size}px`,
        height: `${size}px`,
        lineHeight: 0,
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes cogSpin { to { transform: rotate(360deg); } }
        @keyframes cogShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-0.7px); }
          50% { transform: translateX(0.7px); }
          75% { transform: translateX(-0.7px); }
        }
        .cog-img {
          transform-origin: center;
          animation: cogSpin var(--cog-dur, 5s) linear infinite;
        }
        .cog-shake { animation: cogShake 0.18s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cog-img { animation-duration: 120s; }
          .cog-shake { animation: none; }
        }
      `}</style>
      <img
        className="cog-img"
        src="/cog.jpeg"
        alt=""
        width={size}
        height={size}
        style={{
          '--cog-dur': `${spinDur}s`,
          animationPlayState: active ? 'running' : 'paused',
          display: 'block',
          objectFit: 'cover',
          mixBlendMode: 'screen',
          filter: 'contrast(1.12) brightness(1.15)',
        }}
      />
    </span>
  );
};

export default MechanicusCog;
