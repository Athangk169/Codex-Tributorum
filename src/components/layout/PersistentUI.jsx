import React from 'react';

const loreSnippets = [
  "GELLAR FIELD INTEGRITY: 98.7% — NAVIGATOR PRIME COMPENSATING",
  "BLACK RAGE OUTBREAK: DECK VII — QUARANTINE SEAL ACTIVE",
  "RYZA: FORGE OUTPUT AT 104% — PRAISE THE OMNISSIAH",
  "CALTH: VOID WAR SURCHARGE ACTIVE — AUDIT PENDING"
];

const PersistentUI = ({ data, children, currentTab, onTabChange }) => {
  const metrics = data?.metrics || {};
  const buckets = data?.buckets || {};

  // Constructing the data string for the header
  const headerItems = [
    { label: "NET_POSITION", val: metrics.netIncome },
    { label: "BANK_RESERVE", val: buckets.Bank },
    { label: (buckets.Card || 0) < 0 ? "CARD_CREDIT" : "DEBT_LOAD", val: Math.abs(buckets.Card || 0) }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* ── HEADER TICKER: ENFORCED VISIBILITY ── */}
      <div className="ticker-wrap" style={{ flexShrink: 0, borderBottom: '2px solid var(--border)', zIndex: 1000 }}>
        <div className="ticker-badge">SANCTIFIED</div>
        <div className="ticker-inner">
          <div className="ticker-track">
            {/* Original Set */}
            {headerItems.map((item, i) => (
              <span key={`h1-${i}`} className="t-item">{item.label} <em>{item.val?.toLocaleString()}</em></span>
            ))}
            {/* Duplicated Set for Seamless Loop */}
            {headerItems.map((item, i) => (
              <span key={`h2-${i}`} className="t-item">{item.label} <em>{item.val?.toLocaleString()}</em></span>
            ))}
          </div>
        </div>
      </div>

      <header className="hdr" style={{ flexShrink: 0 }}>
        <div className="hdr-left">[SYS] CODEX <b>TRIBUTORUM</b></div>
        <div className="hdr-center">{new Date().toLocaleDateString('en-GB')} // 0 347 026 .M3</div>
        <div className="hdr-right">USER :: DEFAULT <span className="link-dot"></span></div>
      </header>

      <nav className="tactical-nav" style={{ flexShrink: 0 }}>
        {['slide1', 'slide2', 'slide3'].map((tab, idx) => (
          <button key={tab} className={`nav-btn ${currentTab === tab ? 'active' : ''}`} onClick={() => onTabChange(tab)}>
            [{['Overview', 'Ledger', 'Auspex'][idx]}]
          </button>
        ))}
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="system-content-layer" style={{ flex: 1 }}>
        {children}
      </main>

      {/* ── FOOTER TICKER: RECALIBRATED ANIMATION ── */}
      <div className="footer" style={{ flexShrink: 0, borderTop: '2px solid var(--border)' }}>
        <div className="foot-lbl">SECTOR STATUS</div>
        <div className="act-wrap">
          <div className="act-track">
            {loreSnippets.map((s, i) => <span key={`l1-${i}`} className="act-item">◈ {s} // </span>)}
            {/* Duplicated Set for Seamless Loop */}
            {loreSnippets.map((s, i) => <span key={`l2-${i}`} className="act-item">◈ {s} // </span>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersistentUI;