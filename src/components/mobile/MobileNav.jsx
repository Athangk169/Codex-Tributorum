import React from 'react';

// Standardised minimalist SVGs for the bottom tab bar
const ICONS = {
  overview:  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>,
  ledger:    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>,
  bank:      <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z"/>,
  auspex:    <path d="M3 3v18h18V3H3zm6 14H7v-5h2v5zm4 0h-2v-3h2v3zm0-5h-2v-2h2v2zm4 5h-2V7h2v10z"/>,
  liquidity: <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zM7.83 14c.37 0 .67.26.74.62 1.41 6.27 5.09 3.09 5.86 1.94.22-.32.65-.4 1-.18.35.22.43.65.21 1-1.37 1.93-5.26 5.25-7.54-4.88-.1-.4.2-.78.58-.87.05-.01.1-.01.15-.01z"/>,
  holo:      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
};

const MOBILE_NAV_STYLES = `
  .mob-nav-btn {
    flex: 1;
    background: rgba(1, 8, 3, 0.95); /* Mechanicum dark green tint */
    border: none;
    border-top: 2px solid transparent;
    color: var(--text-d, #4ade8088); /* Dim green default */
    padding: 6px 0 4px 0;
    cursor: pointer;
    font-family: var(--mono, monospace);
    font-size: 9px;
    letter-spacing: 1px;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.2s ease;
    
    /* Disable double-tap zoom delay on mobile */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .mob-nav-btn svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
    opacity: 0.7;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .mob-nav-btn.tac-active {
    background: rgba(100, 5, 5, 0.35); /* Blood Angels crimson */
    border-top: 2px solid #c9a84c;     /* Gold rune-line */
    color: #ffffff;
    text-shadow: 0 0 10px rgba(204, 34, 0, 0.7);
    box-shadow: inset 0 30px 20px -20px rgba(204, 34, 0, 0.15);
  }

  .mob-nav-btn.tac-active svg {
    fill: #c9a84c; /* Gold icon */
    opacity: 1;
    transform: translateY(-1px);
    filter: drop-shadow(0 0 4px rgba(201, 168, 76, 0.5));
  }
`;

export const MobileNav = ({ activeSlide, setActiveSlide }) => {
  const navItems = [
    { id: 'overview',  label: 'OVERVIEW'  },
    { id: 'ledger',    label: 'LEDGER'    },
    { id: 'bank',      label: 'BANK'      },
    { id: 'auspex',    label: 'AUSPEX'    },
    { id: 'liquidity', label: 'LIQUIDITY' },
    { id: 'holo',      label: 'RECON'     },
  ];

  return (
    <>
      <style>{MOBILE_NAV_STYLES}</style>
      <nav style={{
        display: 'flex',
        background: 'linear-gradient(180deg, #060002 0%, #04000a 100%)',
        borderTop: '1px solid var(--border, #2a3a2a)',
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.5)',
        flexShrink: 0,
        zIndex: 50,
        
        /* The magic iOS rule to lift the tabs above the home bar */
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mob-nav-btn ${activeSlide === item.id ? 'tac-active' : ''}`}
            onClick={() => setActiveSlide(item.id)}
          >
            <svg viewBox="0 0 24 24">
              {ICONS[item.id]}
            </svg>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};

export default MobileNav;