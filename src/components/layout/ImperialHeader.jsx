import React, { useState, useEffect } from 'react';
import BinaryCantStream from '../shared/BinaryCantStream';
import MechanicusCog from '../shared/MechanicusCog';
import NumberTick from '../shared/NumberTick';

const LORE_STRINGS = [
  'SANGUINARY PROTOCOL ENGAGED',
'OMNISSIAH SANCTIONS THE IX',
'GENE-SEED PURITY: VERIFIED',
'THE ANGEL ENDURES',
'MARTIAN CANTICLES RESONATE',
'BLOOD RITE STABILIZED',
'ARCHIVE OF BAAL: SECURED',
'RED GRAIL STATUS: SACRED',
'LITANY OF STEEL AND BLOOD',
'SERAPHIC HOST ALIGNED',
'MECHANICUM BLESSINGS BESTOWED',
'THE THIRST ABATES... FOR NOW',
'AUGURY: FAVOURABLE OMENS',
'HOLY CIRCUITS UNBROKEN',
];

const BA_STYLES = `
  @keyframes marqueeBA {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes brandPulse {
    0%, 100% { opacity: 1; text-shadow: 0 0 14px #cc220099, 0 0 28px #8B000055; }
    50%       { opacity: 0.85; text-shadow: 0 0 6px #cc220044, 0 0 12px #8B000033; }
  }
  @keyframes brandFlicker {
    0%, 91%, 94%, 100% { opacity: 1; }
    92%, 93%            { opacity: 0.12; }
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
  @keyframes scanlineBA {
    0%   { top: -8%;  opacity: 0; }
    5%   { opacity: 0.05; }
    95%  { opacity: 0.05; }
    100% { top: 110%; opacity: 0; }
  }
  @keyframes goldCornerPulse {
    0%, 100% { border-color: #c9a84c44; }
    50%       { border-color: #c9a84caa; }
  }
  @keyframes tickerFlicker {
    0%, 88%, 91%, 100% { opacity: 1; }
    89%, 90%           { opacity: 0.35; }
  }

  .ba-brand {
    animation: brandPulse 4s ease-in-out infinite, brandFlicker 20s linear infinite;
  }
  .ba-ticker-track {
    display: flex;
    width: max-content;
    animation: marqueeBA 58s linear infinite;
  }
  .ba-ticker-track:hover { animation-play-state: paused; }

  .ba-clock-box {
    position: relative;
    animation: goldCornerPulse 3s ease-in-out infinite;
  }
  .ba-clock-box::before,
  .ba-clock-box::after {
    content: '';
    position: absolute;
    width: 9px; height: 9px;
    border-color: #c9a84c;
    border-style: solid;
  }
  .ba-clock-box::before { top: -1px; left: -1px;  border-width: 2px 0 0 2px; }
  .ba-clock-box::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

  .ba-scanline {
    position: absolute;
    left: 0; right: 0;
    height: 8px;
    background: linear-gradient(to bottom, transparent, rgba(204,34,0,0.06), transparent);
    pointer-events: none;
    animation: scanlineBA 9s ease-in-out infinite;
    z-index: 5;
  }
  .ba-sigil {
    animation: sigilFloat 4s ease-in-out infinite;
    mix-blend-mode: screen;
  }
  .led-ba-idle {
    background: #c9a84c;
    animation: ledPulseIdle 2s ease-in-out infinite alternate;
  }
  .led-ba-ok   { background: #4ade80; animation: ledPulseOk 1.2s ease-in-out infinite alternate; }
  .led-ba-warn { background: #eab308; box-shadow: 0 0 8px #eab308; }
  .led-ba-red  { background: #ff4444; box-shadow: 0 0 8px #ff4444; animation: ledShake 0.4s ease-in-out infinite; }
`;

export const ImperialHeader = ({ financeData, user, syncLed = 'idle' }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase();

  const year         = time.getFullYear();
  const startOfYear  = new Date(year, 0, 1);
  const dayOfYear    = Math.floor((time - startOfYear) / 86400000) + 1;
  const fraction     = Math.floor((dayOfYear / 365) * 1000).toString().padStart(3, '0');
  const yearOfMil    = (year % 1000).toString().padStart(3, '0');
  const millennium   = Math.floor(year / 1000) + 1;
  const imperialDate = `0.${fraction} ${yearOfMil} .M${millennium}`;

  const displayUser = (user || 'default').toUpperCase();
  const metrics     = financeData?.metrics || {};
  const buckets     = financeData?.buckets || {};

  const financialItems = [
    { label: 'NET POSITION', val: metrics.netIncome || 0 },
    { label: 'BANK RESERVE', val: buckets.Bank      || 0 },
    { label: 'DEBT LOAD',    val: Math.abs(buckets.Card || 0) },
  ];

  const tickerItems = [];
  financialItems.forEach((item, i) => {
    tickerItems.push({ type: 'data', ...item });
    tickerItems.push({ type: 'lore', text: LORE_STRINGS[i % LORE_STRINGS.length] });
  });

  const ledClass = { idle: 'led-ba-idle', ok: 'led-ba-ok', warn: 'led-ba-warn', offline: 'led-ba-warn', error: 'led-ba-red', red: 'led-ba-red' }[syncLed] || 'led-ba-idle';

  // Heartbeat trace pacing — slow at idle, faster on activity, frantic on error.
  const beat = {
    idle:    { rate: 2.2, color: '#c9a84c' },
    ok:      { rate: 1.1, color: '#4ade80' },
    warn:    { rate: 0.8, color: '#eab308' },
    offline: { rate: 0.8, color: '#eab308' },
    error:   { rate: 0.45, color: '#ff4444' },
    red:     { rate: 0.45, color: '#ff4444' },
  }[syncLed] || { rate: 2.2, color: '#c9a84c' };

  return (
    <>
      <style>{BA_STYLES}</style>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* ── TICKER ── */}
        <div style={{
          background: '#0a0000', height: '34px',
          display: 'flex', alignItems: 'center',
          overflow: 'hidden', borderBottom: '1px solid #7a2010', position: 'relative',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #6a0000, #8B0000)',
            color: '#c9a84c', padding: '0 14px', height: '100%',
            display: 'flex', alignItems: 'center', gap: '8px',
            fontWeight: 'bold', fontSize: '11px', letterSpacing: '2px',
            borderRight: '1px solid #cc2200', flexShrink: 0, zIndex: 10,
            textShadow: '0 0 8px #c9a84c77',
          }}>
            <img
              src="/angel.png"
              alt="IX Legion"
              style={{ height: '22px', width: 'auto', mixBlendMode: 'screen', opacity: 0.9 }}
            />
            IX · LEGIO
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <div className="ba-ticker-track">
              {[...tickerItems, ...tickerItems].map((item, i) =>
                item.type === 'data' ? (
                  <span key={i} style={{
                    padding: '0 32px', color: '#b8923e', fontWeight: 'bold',
                    whiteSpace: 'nowrap', fontSize: '12px', letterSpacing: '1px',
                  }}>
                    {item.label}
                    <em style={{
                      color: '#fff', textShadow: '0 0 8px #cc220099',
                      fontStyle: 'normal', marginLeft: '10px', fontWeight: 'bold',
                    }}>
                      <NumberTick value={item.val} prefix="" />
                    </em>
                  </span>
                ) : (
                  <span key={i} style={{
                    padding: '0 32px', color: '#7a2010', fontSize: '10px',
                    letterSpacing: '3px', whiteSpace: 'nowrap', alignSelf: 'center',
                  }}>
                    ✦ {item.text} ✦
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── MAIN HEADER ── */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 24px',
          borderBottom: '1px solid #7a2010',
          background: 'linear-gradient(90deg, #0e0000 0%, #160000 45%, #0e0000 100%)',
          textTransform: 'uppercase', position: 'relative', overflow: 'hidden',
        }}>
          <div className="ba-scanline" />

          {/* LEFT: Sigil + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img
              src="/angel.png"
              alt="Blood Angels"
              className="ba-sigil"
              style={{ height: '44px', width: 'auto' }}
            />
            <div className="ba-brand" style={{ fontWeight: 'bold' }}>
              <span style={{
                color: '#c9a84c', fontSize: '1.15rem', letterSpacing: '3px',
                textShadow: '0 0 10px #c9a84c66',
              }}>
                CODEX TRIBUTORUM
              </span>
              <div style={{ color: '#7a2010', fontSize: '9px', letterSpacing: '4px', marginTop: '1px' }}>
                MECHANICUM · DATA · ENGINES · IX · LEGION
              </div>
            </div>
          </div>

          {/* CENTRE: Clock */}
          <div className="ba-clock-box" style={{
            textAlign: 'center', background: 'rgba(0,0,0,0.55)',
            padding: '5px 18px', border: '1px solid #c9a84c55', borderRadius: '2px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ color: '#b8923e', fontSize: '10px', letterSpacing: '2px' }}>
              TERRAN CYCLE {dateStr}
            </span>
            <span style={{
              color: '#fff', fontSize: '18px', fontWeight: 'bold',
              letterSpacing: '2px', textShadow: '0 0 12px #cc220077',
              fontFamily: 'var(--mono, monospace)',
            }}>
              {timeStr}
            </span>
            <span style={{ color: '#7a2010', fontSize: '10px', letterSpacing: '1px' }}>
              {imperialDate}
            </span>
          </div>

          {/* RIGHT: User + LED */}
          <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', gap: '16px' }}>
            <div style={{ color: '#b8923e', letterSpacing: '1px' }}>
              OPERATOR{' '}
              <span style={{ color: '#c9a84c', textShadow: '0 0 8px #c9a84c66' }}>::</span>{' '}
              <span style={{ color: '#fff' }}>{displayUser}</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              color: '#b8923e', fontSize: '10px', letterSpacing: '1px', gap: '8px',
            }}>
              NOOSPHERIC LINK
              {/* Cog-skull + binary cant stream, both paced by syncLed. */}
              <MechanicusCog rate={beat.rate} color={beat.color} size={20} state={syncLed} />
              <BinaryCantStream rate={beat.rate} color={beat.color} width={72} />
              <span className={ledClass} style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
              }} />
            </div>
          </div>
        </header>
      </div>
    </>
  );
};

export default ImperialHeader;
