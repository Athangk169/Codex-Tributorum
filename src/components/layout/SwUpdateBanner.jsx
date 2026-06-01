import React, { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// SwUpdateBanner
// Listens for `codex-sw-update` (dispatched by main.jsx when a new
// service-worker has finished installing) and prompts the user to
// reload to pick up the new bundle. Renders nothing until then.
// ─────────────────────────────────────────────────────────────

const SwUpdateBanner = () => {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const onUpdate = () => setAvailable(true);
    window.addEventListener('codex-sw-update', onUpdate);
    return () => window.removeEventListener('codex-sw-update', onUpdate);
  }, []);

  if (!available) return null;

  return (
    <>
      <style>{`
        @keyframes swBannerSlide {
          from { transform: translate(-50%, -120%); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
        .sw-update-banner {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translate(-50%, 0);
          z-index: 10000;
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(10, 0, 0, 0.96);
          border: 1px solid #c9a84c;
          box-shadow:
            0 0 28px rgba(204, 34, 0, 0.45),
            inset 0 0 12px rgba(201, 168, 76, 0.18);
          color: #c9a84c;
          font-family: var(--mono, "Courier New", monospace);
          font-size: 11px;
          letter-spacing: 2px;
          padding: 10px 16px;
          animation: swBannerSlide 0.35s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          text-transform: uppercase;
        }
        .sw-update-banner__text { color: #c9a84c; }
        .sw-update-banner__text em { color: #fff; font-style: normal; }
        .sw-update-banner__btn {
          background: rgba(204, 34, 0, 0.22);
          border: 1px solid #cc2200;
          color: #fff;
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 2px;
          padding: 6px 14px;
          cursor: pointer;
          text-transform: uppercase;
          transition: background 0.15s ease, box-shadow 0.15s ease;
        }
        .sw-update-banner__btn:hover {
          background: rgba(204, 34, 0, 0.45);
          box-shadow: 0 0 14px rgba(204, 34, 0, 0.55);
        }
        .sw-update-banner__btn:focus-visible {
          outline: 1px solid #c9a84c;
          outline-offset: 3px;
        }
        .sw-update-banner__dismiss {
          background: transparent;
          border: 1px solid #c9a84c44;
          color: #c9a84c;
          font-family: inherit;
          font-size: 12px;
          padding: 4px 8px;
          cursor: pointer;
          line-height: 1;
        }
        @media (max-width: 560px) {
          .sw-update-banner { font-size: 12px; padding: 8px 12px; gap: 10px; width: calc(100% - 24px); justify-content: space-between; }
        }
      `}</style>
      <div className="sw-update-banner" role="status" aria-live="polite">
        <span className="sw-update-banner__text">
          ✠ NEW COGITATOR VERSION DETECTED &nbsp; <em>// REINITIATE TO APPLY</em>
        </span>
        <button
          type="button"
          className="sw-update-banner__btn"
          onClick={() => window.location.reload()}
        >
          [ REINITIATE ]
        </button>
        <button
          type="button"
          className="sw-update-banner__dismiss"
          onClick={() => setAvailable(false)}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </>
  );
};

export default SwUpdateBanner;
