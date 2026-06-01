import React, { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// CrtAmbient
// Periodic, subtle CRT-tube ambient flicker. A fixed overlay
// briefly pulses with a green/crimson tint and a 1-2 px vertical
// jitter, then fades out. Triggered at random 8-22s intervals.
//
// Pure overlay (no filter on body) so mobile webview compositing
// stays cheap. Honours prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────

const STYLES = `
  @keyframes crtAmbientFlicker {
    0%   { background: transparent; opacity: 0;   transform: translateY(0); }
    18%  { background: rgba(80, 130, 60, 0.16); opacity: 1; transform: translateY(1px); }
    34%  { background: rgba(190, 30, 0, 0.14);  opacity: 1; transform: translateY(-1px); }
    62%  { background: rgba(120, 90, 30, 0.10); opacity: 0.85; transform: translateY(0); }
    100% { background: transparent; opacity: 0; transform: translateY(0); }
  }
  .crt-ambient-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9500;
    mix-blend-mode: overlay;
    opacity: 0;
    will-change: opacity, background;
  }
  .crt-ambient-layer.crt-amb-fire {
    animation: crtAmbientFlicker 0.22s steps(4) forwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .crt-ambient-layer.crt-amb-fire { animation: none; opacity: 0 !important; }
  }
`;

const CrtAmbient = ({
  minDelayMs = 8000,
  maxDelayMs = 22000,
}) => {
  const [firing, setFiring] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mql?.matches) return;

    let timer = null;
    let stopped = false;

    const schedule = () => {
      const dt = minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
      timer = setTimeout(() => {
        if (stopped || document.hidden) {
          // Skip while tab hidden, reschedule
          schedule();
          return;
        }
        setFiring(true);
        // Remove the class after the animation completes so it can
        // re-trigger next round.
        setTimeout(() => setFiring(false), 260);
        schedule();
      }, dt);
    };

    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [minDelayMs, maxDelayMs]);

  return (
    <>
      <style>{STYLES}</style>
      <div
        className={`crt-ambient-layer ${firing ? 'crt-amb-fire' : ''}`}
        aria-hidden="true"
      />
    </>
  );
};

export default CrtAmbient;
