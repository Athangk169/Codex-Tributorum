import React, { useEffect, useState, useRef } from 'react';
import CrtOverlay from '../shared/CrtOverlay';

// ─────────────────────────────────────────────────────────────
// IdleLitanyOverlay
// After ~20s of no user input, fades in a slow vertically-
// scrolling adept litany behind the UI (mix-blend-mode: screen,
// very low opacity — visible only where the dashboard is dark).
// Reset on any meaningful input.
//
// Doesn't fire while the tab is hidden. Honours
// prefers-reduced-motion (no scroll animation, just static text).
// ─────────────────────────────────────────────────────────────

const IDLE_MS = 20000;

// Canon litanies of the Cult Mechanicus and the Adeptus Astartes
// IX Legion, formatted for vertical drift over a long idle window.
const LITANY = `
FROM THE MOMENT I UNDERSTOOD
THE WEAKNESS OF MY FLESH
IT DISGUSTED ME
I CRAVED THE CERTAINTY OF STEEL
I ASPIRED TO THE PURITY
OF THE BLESSED MACHINE
✠
PRAISE THE OMNISSIAH
PRAISE THE MACHINE GOD
KNOWLEDGE IS POWER
GUARD IT WELL
THE MACHINE SPIRIT TENDS TO US
AS WE TEND TO IT
HONOUR THE MACHINE
AND IT WILL HONOUR YOU
✠
FLESH IS WEAK
STEEL IS ETERNAL
DUST TO DUST
RUST TO RUST
✠
BLESSED IS THE MIND
TOO SMALL FOR DOUBT
A SMALL MIND IS A TIDY MIND
THE EMPEROR PROTECTS
✠
BY THE BLOOD OF SANGUINIUS
BY THE WILL OF THE EMPEROR
WE ARE HIS ANGELS OF DEATH
FROM THE NINTH WE ARE REBORN
IN WRATH AND GRACE
FOR HIM AND NO OTHER
✠
`.trim();

const STYLES = `
  /* Seamless loop: the column renders two identical copies of the
     litany stacked vertically. Animating from 0 to -50% means the
     second copy reaches the position the first copy started in,
     which is visually identical — so the keyframe restart is
     invisible and the scroll runs forever without a snap. */
  @keyframes litanyScroll {
    from { transform: translate3d(0, 0,    0); }
    to   { transform: translate3d(0, -50%, 0); }
  }
  .idle-litany {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    /* Above CrtAmbient (9500) and TimeOfDayTint (9998) so the night
       multiply doesn't darken the litany back to invisible.
       Below SwUpdateBanner (10000) so banners still surface. */
    z-index: 9999;
    opacity: 0;
    transition: opacity 1.8s ease;
    will-change: opacity;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    /* Dims the dashboard down to ~25% brightness behind the litany.
       Sits below the text column so the screen-blend on the text
       glows against the darkened backdrop instead of fighting it. */
    background: rgba(0, 0, 0, 0.78);
  }
  .idle-litany.on { opacity: 1; }

  /* Reliquary saint — screen-blend drops its black backdrop, so it floats
     out of the darkened dashboard as the centrepiece. Sits behind the
     scrolling litany. A slow breathing glow keeps it from feeling like a
     flat sticker. */
  .idle-saint {
    position: absolute;
    bottom: 0;
    left: 50%;
    height: 94%;
    max-height: 94vh;
    width: auto;
    transform: translateX(-50%);
    object-fit: contain;
    mix-blend-mode: screen;
    pointer-events: none;
    z-index: 1;
    filter: brightness(0.92) sepia(0.12) saturate(1.05);
    animation: saintBreathe 9s ease-in-out infinite;
  }
  @keyframes saintBreathe {
    0%, 100% { opacity: 0.48; }
    50%      { opacity: 0.62; }
  }

  .idle-litany__column {
    position: relative;
    z-index: 2;
    width: max-content;
    max-width: 92vw;
    color: rgba(255, 195, 95, 0.62);
    font-family: var(--mono, "Courier New", monospace);
    font-size: 18px;
    letter-spacing: 5px;
    line-height: 2.6;
    text-align: center;
    white-space: pre;
    animation: litanyScroll 90s linear infinite;
    text-shadow:
      0 0 12px rgba(255, 140, 0, 0.75),
      0 0 28px rgba(255, 100, 0, 0.45);
    will-change: transform;
    mix-blend-mode: screen;
  }
  @media (prefers-reduced-motion: reduce) {
    .idle-litany__column { animation: none; transform: none; }
    .idle-saint { animation: none; opacity: 0.55; }
  }
`;

const IdleLitanyOverlay = ({ idleMs = IDLE_MS }) => {
  const [idle, setIdle] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!document.hidden) setIdle(true);
      }, idleMs);
    };
    const reset = () => {
      setIdle(false);
      arm();
    };

    // Pointer jitter guard. Optical mice and trackpads emit a steady trickle
    // of sub-pixel mousemove events even when the user isn't really moving —
    // enough to reset a 20s timer forever, so the litany never fires. Only
    // treat movement past an 8px threshold as real activity.
    let lastX = null, lastY = null;
    const JITTER = 8;
    const onMove = (e) => {
      if (lastX !== null
          && Math.abs(e.clientX - lastX) < JITTER
          && Math.abs(e.clientY - lastY) < JITTER) return;
      lastX = e.clientX;
      lastY = e.clientY;
      reset();
    };

    reset();
    window.addEventListener('mousemove', onMove, { passive: true });
    const tapEvents = ['mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll'];
    tapEvents.forEach(e => window.addEventListener(e, reset, { passive: true }));
    const onVis = () => { if (document.hidden) reset(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('mousemove', onMove);
      tapEvents.forEach(e => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [idleMs]);

  // Two identical copies stacked — the keyframe slides the column
  // by exactly one copy's worth (-50%), so the loop is seamless.
  const body = `${LITANY}\n\n${LITANY}`;

  return (
    <>
      <style>{STYLES}</style>
      <div className={`idle-litany ${idle ? 'on' : ''}`} aria-hidden="true">
        <img className="idle-saint" src="/saint.png" alt="" aria-hidden="true" />
        <pre className="idle-litany__column">{body}</pre>
        <CrtOverlay />
      </div>
    </>
  );
};

export default IdleLitanyOverlay;
