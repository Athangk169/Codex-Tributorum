// src/components/shared/LoreTicker.jsx
// ─────────────────────────────────────────────────────────────
// Rotates a short lore quote in the Overview's System Uplink box.
// Swaps to a new (random, non-repeating) quote every 5-10s and
// uses ScrambleText so the transition fits the project's voice.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import ScrambleText from './ScrambleText';
import { LORE_QUOTES } from './loreQuotes';

const pickDifferent = (current) => {
  if (LORE_QUOTES.length <= 1) return LORE_QUOTES[0];
  let next;
  do {
    next = LORE_QUOTES[Math.floor(Math.random() * LORE_QUOTES.length)];
  } while (next === current);
  return next;
};

const LoreTicker = ({ style = {}, speed = 40, step = 1 }) => {
  const [quote, setQuote] = useState(
    () => LORE_QUOTES[Math.floor(Math.random() * LORE_QUOTES.length)]
  );
  const timerRef = useRef(null);

  // ScrambleText resolves at (length / step) iterations × speed ms.
  // Hold the quote for that long PLUS a 5-10s settled window so it
  // can be read after the scramble finishes.
  useEffect(() => {
    const scrambleMs = Math.ceil(quote.length / step) * speed;
    const settledMs  = 5000 + Math.random() * 5000;
    timerRef.current = setTimeout(() => {
      setQuote(prev => pickDifferent(prev));
    }, scrambleMs + settledMs);
    return () => clearTimeout(timerRef.current);
  }, [quote, speed, step]);

  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '8px',
        letterSpacing: '0.6px',
        color: 'var(--ba-gold-dim, #b8923e)',
        textAlign: 'center',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textShadow: '0 0 6px rgba(184,146,62,0.35)',
        ...style,
      }}
    >
      <span style={{ color: 'var(--ba-crimson, #cc2200)', marginRight: '4px' }}>◈</span>
      <ScrambleText text={quote} speed={speed} step={step} />
      <span style={{ color: 'var(--ba-crimson, #cc2200)', marginLeft: '4px' }}>◈</span>
    </div>
  );
};

export default LoreTicker;
