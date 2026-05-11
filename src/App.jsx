// src/App.jsx
import React, { useState, useEffect } from 'react';
import { AudioCore } from './utils/audioCore';

// Core Layout & Wrappers
import CrtShell from './components/CrtShell';
import BootScreen from './components/layout/BootScreen';
import ImperialHeader from './components/layout/ImperialHeader';
import TacticalNav from './components/layout/TacticalNav';
import SystemFooter from './components/layout/SystemFooter';

// ── MOBILE IMPORTS ──
import useIsMobile from './hooks/useIsMobile';
import MobileShell, { MobileContent } from './components/mobile/MobileShell';
import MobileHeader from './components/mobile/MobileHeader';
import MobileNav from './components/mobile/MobileNav';
import MobileBootScreen from './components/mobile/MobileBootScreen';

import MobileOverview from './components/mobile/slides/MobileOverview';
import MobileLedger from './components/mobile/slides/MobileLedger';
import MobileAuspex from './components/mobile/slides/MobileAuspex';
import MobileLiquidity from './components/mobile/slides/MobileLiquidity';
import MobileHolo from './components/mobile/slides/MobileHolo';
import MobileBank from './components/mobile/slides/MobileBank';

// Data Engine
import { useFinanceData } from './hooks/useFinanceData';

// Tactical Slides
import OverviewSlide from './components/slides/OverviewSlide';
import LedgerSlide from './components/slides/LedgerSlide';
import AuspexSlide from './components/slides/AuspexSlide';
import LiquiditySlide from './components/slides/LiquiditySlide';
import HoloSlide from './components/slides/HoloSlide';
import BankAccountsSlide from './components/slides/BankAccountsSlide';

function App() {
  const isMobile = useIsMobile();
  
  const [isBooting, setIsBooting] = useState(true);
  const [activeSlide, setActiveSlide] = useState('overview');
  const [credentials, setCredentials] = useState(null);

  const { financeData, isLoading, syncLed, dbs } = useFinanceData(credentials);

  useEffect(() => {
    if (!isBooting) {
      AudioCore.playBGM();
    }
    return () => AudioCore.stopBGM();
  }, [isBooting]);

  if (isBooting) {
    const handleComplete = (creds) => {
      setCredentials(creds);
      setIsBooting(false);
    };

    return isMobile
      ? <MobileBootScreen onComplete={handleComplete} />
      : <BootScreen onComplete={handleComplete} />;
  }

  // ── MOBILE RENDER TREE ──
  if (isMobile) {
    return (
      <MobileShell>
        <MobileHeader 
          financeData={financeData} 
          user={credentials?.username} 
          syncLed={syncLed} 
        />
        
        <MobileContent>
          {activeSlide === 'overview' && (
            <MobileOverview data={financeData} syncLed={syncLed} />
          )}
          {activeSlide === 'ledger' && (
            <MobileLedger 
              data={financeData} 
              dbTransactions={dbs?.txns} 
              dbMetadata={dbs?.meta} 
              user={credentials?.username} 
            />
          )}
          {activeSlide === 'auspex' && (
            <MobileAuspex 
              data={financeData} 
              dbInvestments={dbs?.inv} 
              userId={credentials?.username} 
            />
          )}
          {activeSlide === 'liquidity' && (
            <MobileLiquidity 
              data={financeData} 
              dbTransactions={dbs?.txns} 
              dbMetadata={dbs?.meta} 
              userId={credentials?.username} 
            />
          )}
          {activeSlide === 'holo' && (
            <MobileHolo 
              data={financeData} 
              db={dbs?.meta} 
              userId={credentials?.username} 
            />
          )}
          {activeSlide === 'bank' && (
            <MobileBank 
              data={financeData} 
              dbTransactions={dbs?.txns} 
              dbMetadata={dbs?.meta} 
              userId={credentials?.username} 
            />
          )}
        </MobileContent>

        <MobileNav 
          activeSlide={activeSlide} 
          setActiveSlide={(slide) => {
            AudioCore.playSFX('click');
            setActiveSlide(slide);
          }} 
        />
      </MobileShell>
    );
  }

  // ── DESKTOP RENDER TREE ──
  return (
    <CrtShell>
      <ImperialHeader
        isLoading={isLoading}
        metrics={financeData?.metrics}
        syncLed={syncLed}
        user={credentials?.username}
        financeData={financeData}
      />

      <TacticalNav
        activeSlide={activeSlide}
        setActiveSlide={(slide) => {
          AudioCore.playSFX('click');
          setActiveSlide(slide);
        }}
      />

      <main className="system-content-layer">
        {activeSlide === 'overview' && (
          <OverviewSlide data={financeData} syncLed={syncLed} />
        )}

        {activeSlide === 'ledger' && (
          <LedgerSlide
            data={financeData}
            dbTransactions={dbs?.txns}
            dbMetadata={dbs?.meta}
            user={credentials?.username}
          />
        )}

        {activeSlide === 'auspex' && (
          <AuspexSlide 
            data={financeData} 
            dbInvestments={dbs?.inv}
            userId={credentials?.username} 
          />
        )}

        {activeSlide === 'liquidity' && (
          <LiquiditySlide
            data={financeData}
            dbTransactions={dbs?.txns}
            dbMetadata={dbs?.meta}
            userId={credentials?.username} 
          />
        )}

        {activeSlide === 'holo' && (
          <HoloSlide 
            data={financeData} 
            db={dbs?.meta}
            userId={credentials?.username} 
          />
        )}

        {activeSlide === 'bank' && (
          <BankAccountsSlide
            data={financeData}
            dbTransactions={dbs?.txns}
            dbMetadata={dbs?.meta}
            userId={credentials?.username}
          />
        )}
      </main>

      <SystemFooter user={credentials?.username} />
    </CrtShell>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('◈ OFFLINE LINK ESTABLISHED', reg))
      .catch(err => console.error('◈ OFFLINE LINK FAILED', err));
  });
}

export default App;