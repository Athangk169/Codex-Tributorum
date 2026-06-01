import React, { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// SlideTransition — Auspex scan-wipe between slides.
//
// When `slideKey` changes a red laser bar sweeps top→bottom,
// a faint scan glow trails it, and the incoming slide assimilates
// in with a brief brightness flare. Reuses the project's crimson
// palette. Honours `prefers-reduced-motion`.
//
// Direction: 'forward' (default) slides incoming content in from
// the right; 'backward' from the left. Caller derives direction
// from the slide nav order (see utils/slideOrder.js).
//
// CSS lives in GlobalStyles.css under `.scan-wipe-host`.
// ─────────────────────────────────────────────────────────────

const DURATION_MS = 420;

const SlideTransition = ({ slideKey, children, className = '', direction = 'forward' }) => {
  const [scanning, setScanning] = useState(false);
  const prevKey = useRef(slideKey);

  useEffect(() => {
    if (prevKey.current === slideKey) return;
    prevKey.current = slideKey;
    setScanning(true);
    const t = setTimeout(() => setScanning(false), DURATION_MS + 40);
    return () => clearTimeout(t);
  }, [slideKey]);

  const dirClass = direction === 'backward' ? 'sw-dir-backward' : 'sw-dir-forward';

  return (
    <div className={`scan-wipe-host ${scanning ? 'sw-scanning' : ''} ${dirClass} ${className}`}>
      <div key={slideKey} className="sw-slide">
        {children}
      </div>
    </div>
  );
};

export default SlideTransition;
