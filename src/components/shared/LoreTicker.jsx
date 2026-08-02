// src/components/shared/LoreTicker.jsx
// ─────────────────────────────────────────────────────────────
// Rotates a short lore quote in the Overview's System Uplink box.
// Swaps to a new (random, non-repeating) quote every 5-10s and
// uses ScrambleText so the transition fits the project's voice.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ScrambleText from './ScrambleText';
import { LORE_QUOTES } from './loreQuotes';

// Munitorum censure — mixed into the rotation only while a tithe is
// overdrawn, naming the offending category. `%C` is the category slot.
const CENSURE = [
  'THE MUNITORUM RECORDS AN OVERDRAWN TITHE UPON %C.',
  'EXCESS IN %C IS NOTED. THE LEDGER FORGETS NOTHING.',
  '%C EXCEEDS ITS SANCTION. ACCOUNT FOR THY PROFLIGACY.',
  'AUDIT FLAG RAISED — %C DRAWN BEYOND ITS GRANT.',
  'THE ADEPTUS ADMINISTRATUM QUERIES THY SPENDING ON %C.',
  'A TITHE BREACHED IN %C. TEMPERANCE IS A DUTY, NOT A VIRTUE.',
];

const pickFrom = (pool, current) => {
  if (pool.length <= 1) return pool[0];
  let next;
  do {
    next = pool[Math.floor(Math.random() * pool.length)];
  } while (next === current);
  return next;
};

// `quota` — the roll-up from financeData. When a cap is breached the
// censure pool joins the corpus, so the ticker starts scolding without
// needing a new UI surface.
const LoreTicker = ({ style = {}, speed = 40, step = 1, quota = null }) => {
  // Breach set as a stable string, so the pool is only rebuilt when the
  // offending categories actually change — not on every parent render.
  const breachKey = (quota?.breached || []).map(b => b.cat).sort().join('|');

  const pool = useMemo(() => {
    if (!breachKey) return LORE_QUOTES;
    const cats = breachKey.split('|');
    const lines = cats.flatMap(cat => CENSURE.map(c => c.replace('%C', cat.toUpperCase())));
    // Weighted twice so censure actually surfaces against the full
    // lore corpus rather than showing up once an hour.
    return [...LORE_QUOTES, ...lines, ...lines];
  }, [breachKey]);

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
      setQuote(prev => pickFrom(pool, prev));
    }, scrambleMs + settledMs);
    return () => clearTimeout(timerRef.current);
  }, [quote, speed, step, pool]);

  // Censure reads crimson; ordinary lore keeps the gold.
  const isCensure = CENSURE.some(c => {
    const head = c.split('%C')[0];
    return head.length > 0 && quote.startsWith(head);
  });

  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: '8px',
        letterSpacing: '0.6px',
        color: isCensure ? 'var(--ba-crimson, #cc2200)' : 'var(--ba-gold-dim, #b8923e)',
        textAlign: 'center',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textShadow: isCensure
          ? '0 0 6px rgba(204,34,0,0.5)'
          : '0 0 6px rgba(184,146,62,0.35)',
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
