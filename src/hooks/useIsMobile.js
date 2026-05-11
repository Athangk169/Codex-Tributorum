// src/hooks/useIsMobile.js
// ─────────────────────────────────────────────────────────────
// Returns true when the viewport is ≤ 768px wide.
// Updates reactively on window resize so rotating a tablet
// between portrait and landscape re-evaluates correctly.
//
// Breakpoint logic:
//   ≤ 768px  → mobile   (phones, small tablets portrait)
//   > 768px  → desktop  (tablets landscape, laptops, monitors)
//
// Usage:
//   import { useIsMobile } from '../hooks/useIsMobile';
//   const isMobile = useIsMobile();
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    // Safe initialisation — works in browser and during SSR
    typeof window !== 'undefined'
      ? window.innerWidth <= MOBILE_BREAKPOINT
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    // Use matchMedia where available — more efficient than resize polling
    if (window.matchMedia) {
      const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
      setIsMobile(mq.matches);

      // Modern API
      if (mq.addEventListener) {
        mq.addEventListener('change', e => setIsMobile(e.matches));
        return () => mq.removeEventListener('change', e => setIsMobile(e.matches));
      }

      // Legacy fallback (Safari < 14)
      mq.addListener(handleResize);
      return () => mq.removeListener(handleResize);
    }

    // Plain resize fallback
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

export default useIsMobile;