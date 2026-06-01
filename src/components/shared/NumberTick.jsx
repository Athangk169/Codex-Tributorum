import React, { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// NumberTick
// Animates a numeric value from its previous render to the new
// one over `duration` ms using ease-out-cubic, then snaps to the
// final value. Use anywhere you'd render a raw number that
// changes (financial totals, counters, etc.).
//
// Honours prefers-reduced-motion by snapping to the new value
// immediately.
//
// Props
//   value     - target number
//   duration  - ms (default 600)
//   format    - (n) => string. Default toLocaleString().
//   decimals  - if format is omitted, rounding precision. Default 0.
//   prefix    - rendered before the formatted number
//   suffix    - rendered after
// ─────────────────────────────────────────────────────────────

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NumberTick = ({
  value,
  duration = 600,
  format,
  decimals = 0,
  prefix = '',
  suffix = '',
}) => {
  const numeric = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(numeric);
  const prevRef = useRef(numeric);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = numeric;
    if (from === to) return;
    if (reducedMotion()) {
      prevRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [numeric, duration]);

  const factor = Math.pow(10, decimals);
  const rounded = Math.round(display * factor) / factor;
  const text = format ? format(rounded) : rounded.toLocaleString();

  return (
    <>
      {prefix}
      {text}
      {suffix}
    </>
  );
};

export default NumberTick;
