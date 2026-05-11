// src/components/shared/ScrambleText.jsx
// ─────────────────────────────────────────────────────────────
// Cryptographic boot-up text effect.
// Extracted from all slides so there is one canonical version.
//
// Props:
//   text     — the final string to resolve to (required)
//   speed    — interval ms per tick (default 40, slower = 80)
//   step     — how many chars resolve per tick (default 0.25)
//              OverviewSlide used 1/15 (slow), BankAccounts used
//              1/4 (fast). Pass as a number: 0.067 = slow, 0.25 = fast
//
// Usage:
//   import ScrambleText from '../shared/ScrambleText';
//   <ScrambleText text={value.toLocaleString()} />
//   <ScrambleText text={value} speed={80} step={0.067} />
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';

const CHARS = '01X4A8C9#F>';

// Characters that are always passed through unchanged
const PASSTHROUGH = new Set([' ', '₹', ',', '.', ':', '-', '+', '/']);

const ScrambleText = ({ text, speed = 40, step = 0.25 }) => {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    // Always re-run when text changes so live data updates scramble in
    let iter = 0;
    const strText = String(text);
    const maxIter = strText.length;

    const interval = setInterval(() => {
      setDisplay(
        strText.split('').map((char, i) => {
          if (PASSTHROUGH.has(char)) return char;
          if (i < iter)             return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        }).join('')
      );

      if (iter >= maxIter) {
        clearInterval(interval);
        setDisplay(strText); // Guarantee final state is always correct
      }

      iter += step;
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, step]);

  return <>{display}</>;
};

export default ScrambleText;