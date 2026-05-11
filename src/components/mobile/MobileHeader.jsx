import React from 'react';

// Assuming the image is placed in the root of your public folder.
// Adjust to '/assets/angel.png' or similar if nested.
const ANGEL_SRC = '/angel.png';

const MOBILE_BA_STYLES = `
  @keyframes brandPulse {
    0%, 100% { opacity: 1; text-shadow: 0 0 14px #cc220099, 0 0 28px #8B000055; }
    50%      { opacity: 0.85; text-shadow: 0 0 6px #cc220044, 0 0 12px #8B000033; }
  }
  @keyframes sigilFloat {
    0%, 100% { transform: translateY(0px) scale(1);   filter: drop-shadow(0 0 8px #cc220099)  drop-shadow(0 0 18px #8B000077); }
    50%      { transform: translateY(-2px) scale(1.03); filter: drop-shadow(0 0 14px #cc2200cc) drop-shadow(0 0 28px #8B0000aa); }
  }
  @keyframes ledPulseOk {
    0%   { box-shadow: 0 0 4px #4ade80; }
    100% { box-shadow: 0 0 12px #4ade80, 0 0 20px #4ade8066; }
  }
  @keyframes ledPulseIdle {
    0%   { box-shadow: 0 0 3px #b8923e; opacity: 0.55; }
    100% { box-shadow: 0 0 9px #c9a84c; opacity: 1; }
  }
  @keyframes ledShake {
    0%, 100% { transform: translateX(0); }
    20%      { transform: translateX(-2px); }
    40%      { transform: translateX(2px); }
    60%      { transform: translateX(-2px); }
    80%      { transform: translateX(2px); }
  }

  .ba-brand-mobile {
    animation: brandPulse 4s ease-in-out infinite;
  }
  .ba-sigil-mobile {
    animation: sigilFloat 4s ease-in-out infinite;
    mix-blend-mode: screen;
  }
  .led-ba-idle {
    background: #c9a84c;
    animation: ledPulseIdle 2s ease-in-out infinite alternate;
  }
  .led-ba-ok { 
    background: #4ade80; 
    animation: ledPulseOk 1.2s ease-in-out infinite alternate; 
  }
  .led-ba-warn { 
    background: #eab308; 
    box-shadow: 0 0 8px #eab308; 
  }
  .led-ba-red { 
    background: #ff4444; 
    box-shadow: 0 0 8px #ff4444; 
    animation: ledShake 0.4s ease-in-out infinite; 
  }
`;

export const MobileHeader = ({ financeData, user, syncLed = 'idle' }) => {
  
  // Map the syncLed prop to the corresponding CSS class
  const ledClass = { 
    idle: 'led-ba-idle', 
    ok: 'led-ba-ok', 
    warn: 'led-ba-warn', 
    red: 'led-ba-red' 
  }[syncLed] || 'led-ba-idle';

  return (
    <>
      <style>{MOBILE_BA_STYLES}</style>
      
      <header style={{
        flexShrink: 0, 
        height: '44px',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid #7a2010',
        background: 'linear-gradient(90deg, #0e0000 0%, #160000 45%, #0e0000 100%)',
        textTransform: 'uppercase', 
        position: 'relative', 
        overflow: 'hidden',
        zIndex: 50 // Ensures it sits cleanly above the scrolling MobileContent
      }}>
        
        {/* LEFT: Sigil + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={ANGEL_SRC}
            alt="IX Legion Sigil"
            className="ba-sigil-mobile"
            style={{ height: '26px', width: 'auto' }}
          />
          <div className="ba-brand-mobile" style={{ fontWeight: 'bold' }}>
            <span style={{
              color: '#c9a84c', 
              fontSize: '1.05rem', 
              letterSpacing: '2px',
              textShadow: '0 0 10px #c9a84c66',
            }}>
              CODEX TRIBUTORUM
            </span>
          </div>
        </div>

        {/* RIGHT: LED Pip */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className={ledClass} style={{
            display: 'inline-block', 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%',
            border: '1px solid rgba(0,0,0,0.3)'
          }} />
        </div>
        
      </header>
    </>
  );
};

export default MobileHeader;