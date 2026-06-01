// src/components/mobile/MobileShell.jsx
// ─────────────────────────────────────────────────────────────
// Mobile equivalent of CrtShell.
//
// Key differences from desktop CrtShell:
//
//  1. height: 100dvh — dynamic viewport height accounts for
//     iOS Safari's collapsing browser chrome. 100vh on iOS
//     overflows behind the address bar.
//
//  2. Scanlines use position: absolute (not fixed) — fixed
//     overlays on iOS Safari trigger expensive repaint on
//     every scroll frame, killing frame rate.
//
//  3. Scanline opacity halved (0.12 vs 0.22) — thinner lines,
//     less GPU compositing work on low-end devices.
//
//  4. Vignette is lighter and also absolute — same reason as
//     scanlines. Gradient is shallower.
//
//  5. overscroll-behavior: none on root — prevents the
//     pull-to-refresh gesture interfering with the UI.
//
//  6. The inner content wrapper uses overflow-y: auto with
//     -webkit-overflow-scrolling: touch for momentum scrolling
//     on iOS. Without this, scroll feels sluggish.
//
//  7. touch-action: manipulation on root — disables double-tap
//     zoom which causes 300ms click delay on older iOS.
// ─────────────────────────────────────────────────────────────

import React from 'react';
import SlideTransition from '../shared/SlideTransition';
import CrtAmbient from '../layout/CrtAmbient';

const MOBILE_SHELL_STYLES = `
  /* ── Mobile root ── */
  .mobile-root {
    display:            flex;
    flex-direction:     column;
    height:             100dvh;      /* dvh = dynamic, accounts for iOS chrome */
    width:              100vw;
    overflow:           hidden;
    overscroll-behavior:none;        /* block pull-to-refresh */
    touch-action:       manipulation; /* kill 300ms double-tap delay */
    position:           relative;
    background:         var(--bg);
  }

  /* ── CRT overlays — absolute not fixed ── */
  .mobile-scanlines {
    position:      absolute;
    inset:         0;
    z-index:       1000;
    pointer-events:none;
    background:    linear-gradient(
                     rgba(18, 16, 16, 0) 50%,
                     rgba(0, 0, 0, 0.12) 50%
                   );
    background-size: 100% 3px;      /* slightly tighter lines on small screen */
  }

  .mobile-vignette {
    position:      absolute;
    inset:         0;
    z-index:       1000;
    pointer-events:none;
    background:    radial-gradient(
                     circle at center,
                     transparent 40%,
                     rgba(0, 0, 0, 0.3) 100%
                   );
  }

  /* ── Content area ── */
  /* This is the flex child that actually scrolls.
     Header, Nav, Footer are flex-shrink: 0 siblings.
     Only this middle section scrolls. */
  .mobile-content {
    flex:                       1;
    overflow-y:                 auto;
    overflow-x:                 hidden;
    -webkit-overflow-scrolling: touch;  /* momentum scroll on iOS */
    overscroll-behavior-y:      contain; /* prevent scroll chaining */
    padding:                    12px;
    display:                    flex;
    flex-direction:             column;
    position:                   relative; /* stacking context for children */
    z-index:                    1;
  }

  /* Prevent text selection on long press (feels wrong on a terminal UI) */
  .mobile-root * {
    -webkit-user-select: none;
    user-select:         none;
  }

  /* But allow selection inside input fields */
  .mobile-root input,
  .mobile-root textarea {
    -webkit-user-select: text;
    user-select:         text;
  }

  /* ── Safe area insets for notched phones ── */
  /* Applied to Nav (bottom) and Header (top) via their own components.
     Shell just declares the env() variables are respected. */
  @supports (padding: env(safe-area-inset-bottom)) {
    .mobile-root {
      padding-bottom: env(safe-area-inset-bottom);
    }
  }

`;

const MobileShell = ({ children, effectsEnabled = true }) => {
  return (
    <>
      <style>{MOBILE_SHELL_STYLES}</style>
      <div className={`mobile-root ${effectsEnabled ? 'crt-active' : ''}`}>

        {/* CRT overlays — absolute so they don't trigger scroll repaints */}
        {effectsEnabled && (
          <>
            <div className="mobile-scanlines" aria-hidden="true" />
            <div className="mobile-vignette"  aria-hidden="true" />
            {/* Random tube-flicker — longer min delay on mobile to spare
                battery; capacitor webview composites the overlay cheaply. */}
            <CrtAmbient minDelayMs={12000} maxDelayMs={28000} />
          </>
        )}

        {/* Children: Header, content, Nav — laid out by flex column */}
        {children}

      </div>
    </>
  );
};

// MobileContent is exported separately so App.jsx can wrap just
// the slide area, keeping Header and Nav outside the scroll zone.
// When `slideKey` changes, an auspex scan-wipe transition plays.
export const MobileContent = ({ children, slideKey, direction = 'forward' }) => (
  <div className="mobile-content">
    <SlideTransition slideKey={slideKey} direction={direction}>{children}</SlideTransition>
  </div>
);

export default MobileShell;