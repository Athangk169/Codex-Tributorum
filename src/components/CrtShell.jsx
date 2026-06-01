import React, { useState } from 'react';
import CrtAmbient from './layout/CrtAmbient';

export const CrtShell = ({ children }) => {
  const [effectsEnabled] = useState(true);

  return (
    <div
      className={`finance-os-root ${effectsEnabled ? 'crt-active' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}
    >
      {effectsEnabled && (
        <>
          <div className="scanlines"></div>
          <div className="vignette"></div>
          <CrtAmbient />
        </>
      )}

      {children}
    </div>
  );
};

export default CrtShell;