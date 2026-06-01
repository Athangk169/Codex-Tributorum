// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { AudioCore } from './utils/audioCore';
import { directionBetween } from './utils/slideOrder';

// Core Layout
import CrtShell from './components/CrtShell';
import BootScreen from './components/layout/BootScreen';
import ImperialHeader from './components/layout/ImperialHeader';
import TacticalNav from './components/layout/TacticalNav';
import SystemFooter from './components/layout/SystemFooter';
import SlideTransition from './components/shared/SlideTransition';
import SlideErrorBoundary from './components/shared/SlideErrorBoundary';
import SwUpdateBanner from './components/layout/SwUpdateBanner';
import TimeOfDayTint from './components/layout/TimeOfDayTint';
import IdleLitanyOverlay from './components/layout/IdleLitanyOverlay';

// Mobile
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

// Data
import { useFinanceData } from './hooks/useFinanceData';

// Desktop Slides
import OverviewSlide from './components/slides/OverviewSlide';
import LedgerSlide from './components/slides/LedgerSlide';
import AuspexSlide from './components/slides/AuspexSlide';
import LiquiditySlide from './components/slides/LiquiditySlide';
import HoloSlide from './components/slides/HoloSlide';
import BankAccountsSlide from './components/slides/BankAccountsSlide';
import ObligationsSlide from './components/slides/ObligationsSlide';

function App() {
  const isMobile = useIsMobile();

  const [isBooting,    setIsBooting]    = useState(true);
  const [activeSlide,  setActiveSlide]  = useState('overview');
  const [credentials,  setCredentials]  = useState(null);

  // Direction-aware slide transition. Compare prev vs current
  // against the canonical slide order; SlideTransition uses it to
  // pick forward (slide in from right) vs backward animation.
  const prevSlideRef = useRef('overview');
  const [slideDirection, setSlideDirection] = useState('forward');
  useEffect(() => {
    if (prevSlideRef.current === activeSlide) return;
    setSlideDirection(directionBetween(prevSlideRef.current, activeSlide));
    prevSlideRef.current = activeSlide;
  }, [activeSlide]);

  const { financeData, isLoading, syncLed, dbs } = useFinanceData(credentials);

  useEffect(() => {
    if (!isBooting) AudioCore.playBGM();
    return () => AudioCore.stopBGM();
  }, [isBooting]);

  const handleBootComplete = (creds) => {
    // Drop the password on the floor — auth is now carried by the
    // HttpOnly AuthSession cookie that BootScreen's /_session POST
    // already set on the browser. Storing only the username keeps the
    // password out of React state for the lifetime of the session.
    setCredentials({ username: creds.username });
    setIsBooting(false);
  };

  const handleNavChange = (slide) => {
    AudioCore.playSFX('click');
    setActiveSlide(slide);
  };

  if (isBooting) {
    return (
      <>
        <SwUpdateBanner />
<TimeOfDayTint />
<IdleLitanyOverlay />
        {isMobile
          ? <MobileBootScreen onComplete={handleBootComplete} />
          : <BootScreen       onComplete={handleBootComplete} />}
      </>
    );
  }

  // ── Mobile ──
  if (isMobile) {
    return (
      <>
      <SwUpdateBanner />
<TimeOfDayTint />
<IdleLitanyOverlay />
      <MobileShell>
        <MobileHeader
          financeData={financeData}
          user={credentials?.username}
          syncLed={syncLed}
        />
        <MobileContent slideKey={activeSlide} direction={slideDirection}>
          <SlideErrorBoundary slideName={activeSlide}>
            {activeSlide === 'overview'  && <MobileOverview  data={financeData} syncLed={syncLed} />}
            {activeSlide === 'ledger'    && <MobileLedger    data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} user={credentials?.username} />}
            {activeSlide === 'auspex'    && <MobileAuspex    data={financeData} dbInvestments={dbs?.inv}   dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
            {activeSlide === 'liquidity' && <MobileLiquidity data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
            {activeSlide === 'holo'      && <MobileHolo      data={financeData} db={dbs?.meta}             userId={credentials?.username} />}
            {activeSlide === 'bank'      && <MobileBank      data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
          </SlideErrorBoundary>
        </MobileContent>
        <MobileNav activeSlide={activeSlide} setActiveSlide={handleNavChange} />
      </MobileShell>
      </>
    );
  }

  // ── Desktop ──
  return (
    <>
    <SwUpdateBanner />
<TimeOfDayTint />
<IdleLitanyOverlay />
    <CrtShell>
      <ImperialHeader
        isLoading={isLoading}
        metrics={financeData?.metrics}
        syncLed={syncLed}
        user={credentials?.username}
        financeData={financeData}
      />
      <TacticalNav activeSlide={activeSlide} setActiveSlide={handleNavChange} />

      <main className="system-content-layer">
        <SlideTransition slideKey={activeSlide} direction={slideDirection}>
          <SlideErrorBoundary slideName={activeSlide}>
            {activeSlide === 'overview'  && <OverviewSlide    data={financeData} syncLed={syncLed} />}
            {activeSlide === 'ledger'    && <LedgerSlide      data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} user={credentials?.username} />}
            {activeSlide === 'auspex'    && <AuspexSlide      data={financeData} dbInvestments={dbs?.inv}   dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
            {activeSlide === 'liquidity' && <LiquiditySlide   data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
            {activeSlide === 'holo'      && <HoloSlide        data={financeData} db={dbs?.meta}             userId={credentials?.username} />}
            {activeSlide === 'bank'        && <BankAccountsSlide data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
            {activeSlide === 'obligations' && <ObligationsSlide  data={financeData} dbTransactions={dbs?.txns} dbMetadata={dbs?.meta} userId={credentials?.username} />}
          </SlideErrorBoundary>
        </SlideTransition>
      </main>

      <SystemFooter user={credentials?.username} />
    </CrtShell>
    </>
  );
}

export default App;