import React from 'react';

// ◈ CRT OVERLAY ◈
// Drop-in scanlines + vignette for full-screen overlays that render ABOVE the
// shell's global CRT layer (z-index 1000) and would otherwise look "flat" and
// break the theme — e.g. the idle litany screensaver and the biometric lock.
//
// Positioned absolute so it fills its parent overlay; pointer-events:none so it
// never blocks the controls underneath. Reuses the global .scanlines/.vignette
// classes (defined in GlobalStyles §3), just re-anchored inside the overlay.
// Pass `z` to sit above the overlay's own content if that content is layered.
const CrtOverlay = ({ z = 50 }) => (
  <>
    <div className="scanlines" style={{ position: 'absolute', inset: 0, zIndex: z, pointerEvents: 'none' }} aria-hidden="true" />
    <div className="vignette"  style={{ position: 'absolute', inset: 0, zIndex: z, pointerEvents: 'none' }} aria-hidden="true" />
  </>
);

export default CrtOverlay;
