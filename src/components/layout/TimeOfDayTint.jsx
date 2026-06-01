import React, { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// TimeOfDayTint
// Soft overlay that tints the whole UI based on local hour, so
// the screen feels cooler at night and warmer at dawn/dusk. No
// `filter:` on body (which would break `position: fixed`), just
// a mix-blend tint layer.
//
// 06–18 → DAY    (no tint)
// 18–20 → DUSK   (faint warm amber)
// 20–24 → NIGHT  (cool blue dim)
// 00–05 → NIGHT  (deepest cool dim)
// 05–06 → DAWN   (faint warm)
//
// Honours prefers-reduced-motion (skips the long fade).
// ─────────────────────────────────────────────────────────────

const STYLES = `
  .tod-tint-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9998;
    background: transparent;
    mix-blend-mode: multiply;
    transition: background 8s linear;
    will-change: background;
  }
  .tod-tint-overlay[data-mode="dusk"]  { background: rgba(255, 170, 90,  0.06); mix-blend-mode: screen; }
  .tod-tint-overlay[data-mode="night"] { background: rgba(30,  40,  70,  0.18); mix-blend-mode: multiply; }
  .tod-tint-overlay[data-mode="deep"]  { background: rgba(20,  30,  55,  0.26); mix-blend-mode: multiply; }
  .tod-tint-overlay[data-mode="dawn"]  { background: rgba(255, 200, 120, 0.05); mix-blend-mode: screen; }

  @media (prefers-reduced-motion: reduce) {
    .tod-tint-overlay { transition: none; }
  }
`;

function modeFromHour(h) {
  if (h >= 6  && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'dusk';
  if (h >= 20 && h < 24) return 'night';
  if (h >= 0  && h < 5)  return 'deep';
  return 'dawn'; // 5–6
}

const TimeOfDayTint = () => {
  const [mode, setMode] = useState(() => modeFromHour(new Date().getHours()));

  useEffect(() => {
    const update = () => {
      const next = modeFromHour(new Date().getHours());
      setMode(next);
      document.documentElement.dataset.timeShift = next;
    };
    update();
    const iv = setInterval(update, 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="tod-tint-overlay"
        data-mode={mode}
        aria-hidden="true"
      />
    </>
  );
};

export default TimeOfDayTint;
