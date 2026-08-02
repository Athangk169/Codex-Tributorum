import React from 'react';

// ── TacticalNav — Mechanicum / Blood Angels dual-faction blend ──
//
// Inactive tabs  → Mechanicum: green text, green border, dark panel
// Active tab     → Blood Angels: crimson bg, gold brackets, gold top rune-line
// Hover          → transition from green to dim crimson before committing
// Nav seam       → green bottom border (Mechanicum) + crimson shadow (BA)
// ────────────────────────────────────────────────────────────────

const NAV_STYLES = `
  .tac-nav-btn {
    flex:          1;
    min-width:     95px;           /* prevent tabs collapsing too narrow with 7 items */
    background:    rgba(1, 8, 3, 0.85);
    border:        1px solid var(--border);
    border-top:    2px solid transparent;
    color:         var(--text-d);
    padding:       0;
    cursor:        pointer;
    font-family:   var(--mono);
    font-size:     12px;
    letter-spacing:2px;
    height:        100%;
    display:       flex;
    align-items:   center;
    justify-content: center;
    transition:    background 0.2s ease, border-color 0.2s ease,
                   color 0.2s ease, box-shadow 0.2s ease;
    position:      relative;
  }

  /* Hover — the Chapter takes notice */
  .tac-nav-btn:not(.tac-active):hover {
    background:   rgba(80, 5, 5, 0.25);
    border-color: #6a1a00;
    color:        #cc9966;
  }
  .tac-nav-btn:not(.tac-active):hover .tac-bracket {
    color: #7a3010;
  }

  /* Active — Blood Angels command state */
  .tac-nav-btn.tac-active {
    background:   rgba(100, 5, 5, 0.35);
    border:       1px solid #cc2200;
    border-top:   2px solid #c9a84c;      /* gold rune-line */
    color:        #ffffff;
    text-shadow:  0 0 10px rgba(204, 34, 0, 0.7);
    box-shadow:   inset 0 0 14px rgba(204, 34, 0, 0.18),
                  0 0 6px rgba(204, 34, 0, 0.15);
  }
  .tac-nav-btn.tac-active .tac-bracket {
    color: #c9a84c;
    text-shadow: 0 0 8px #c9a84c88;
  }

  /* Breach seal — a quota is overdrawn. The app's "look here" marker,
     rendered as a wax purity seal rather than a notification dot. */
  .tac-seal {
    position: absolute; top: 2px; right: 3px;
    width: 15px; height: 15px; pointer-events: none;
  }
  .tac-seal img {
    width: 100%; height: 100%; object-fit: contain;
    mix-blend-mode: screen;
    filter: sepia(0.6) saturate(3) hue-rotate(-35deg) brightness(0.9);
    animation: tacSealPulse 2.4s ease-in-out infinite;
  }
  .tac-seal.warn img {
    filter: sepia(0.7) saturate(1.7) hue-rotate(-12deg);
    animation: none;
  }
  @keyframes tacSealPulse {
    0%, 100% { opacity: 0.6; transform: rotate(-6deg) scale(1); }
    50%      { opacity: 1;   transform: rotate(-6deg) scale(1.12); }
  }
`;

export const TacticalNav = ({ activeSlide, setActiveSlide, quota }) => {
  const navItems = [
    { id: 'overview',     label: 'OVERVIEW'     },
    { id: 'ledger',       label: 'LEDGER'       },
    { id: 'bank',         label: 'BANK'         },
    { id: 'auspex',       label: 'AUSPEX'       },
    { id: 'liquidity',    label: 'LIQUIDITY'    },
    { id: 'provisions',   label: 'MUNITORUM'    },
    { id: 'obligations',  label: 'OBLIGATIONS'  },
    { id: 'holo',         label: 'RECON'        },
  ];

  return (
    <>
      <style>{NAV_STYLES}</style>
      <nav style={{
        display:       'flex',
        gap:           '4px',
        padding:       '8px 0',
        background:    'linear-gradient(180deg, #060002 0%, #04000a 100%)',
        borderBottom:  '2px solid var(--border)',
        boxShadow:     '0 2px 8px rgba(180, 20, 0, 0.25)',
        height:        '47px',
        flexShrink:    0,
        alignItems:    'center',
        overflowX:     'auto',
        overflowY:     'hidden',
        scrollbarWidth:'none',          /* hide scrollbar — swipe to navigate */
      }}
      onWheel={e => { e.currentTarget.scrollLeft += e.deltaY; }}  /* mouse wheel scrolls horizontally */
      >
        {navItems.map((item) => {
          // AUSPEX carries the tithe seal when a cap is breached (crimson,
          // pulsing) or merely nearing (amber, still). Clicking it deep-links
          // to the quota view rather than Auspex's default sub-view.
          const sealSt = item.id === 'auspex' && quota
            ? (quota.breached?.length ? 'over' : quota.nearing?.length ? 'warn' : null)
            : null;
          return (
            <button
              key={item.id}
              className={`tac-nav-btn${activeSlide === item.id ? ' tac-active' : ''}`}
              onClick={() => setActiveSlide(item.id, sealSt ? 'quota' : null)}
              title={sealSt === 'over'
                ? `TITHE BREACHED — ${quota.breached.map(b => b.cat).join(', ')}`
                : sealSt === 'warn'
                  ? `TITHE NEARING LIMIT — ${quota.nearing.map(b => b.cat).join(', ')}`
                  : undefined}
            >
              <span className="tac-bracket" style={{ marginRight: '7px' }}>[</span>
              {item.label}
              <span className="tac-bracket" style={{ marginLeft: '7px' }}>]</span>
              {sealSt && (
                <span className={`tac-seal${sealSt === 'warn' ? ' warn' : ''}`} aria-hidden="true">
                  <img src="/purity_seal.jpg" alt="" />
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
};

export default TacticalNav;