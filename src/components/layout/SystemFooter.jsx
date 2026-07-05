import React, { useState } from 'react';
import { AudioCore } from '../../utils/audioCore';
import { canExtractTithe, extractFullTithe } from '../../utils/dataTithe';

// ── SystemFooter — Mechanicum / Blood Angels blend ────────────
//
// Left badge    → Blood Angels: crimson bg, gold text, IX pip
// Lore ticker   → Mechanicum: green data-feed text, ◈ dividers
// VOX button    → Neutral idle, crimson alarm when silenced
// Top border    → green (Mechanicum) + crimson shadow (BA seam)
// ─────────────────────────────────────────────────────────────

const loreSnippets = [
  "GELLAR FIELD HARMONICS: STABLE — NAVIGATOR HOUSE BELISARIUS REPORTS CLEAR PASSAGE",  
"BAAL: RECONSTRUCTION CONTINUES — COMMANDER DANTE ISSUES DECREE OF ENDURANCE",  
"MARS: FABRICATOR-GENERAL KANE AUTHORIZES FORGE EXPANSION — OUTPUT EXCEEDS TITHE",  
"ARMAGEDDON: ORK WARACTIVITY RESURGES — STEEL LEGIONS MOBILIZING",  
"TERRA: HIGH LORDS CONVENE — ASTROPATHIC SILENCE OBSERVED",  
"MACRAGGE: ULTRAMAR AUXILIA REINFORCED — GUILLIMAN'S EDICTS ENFORCED",  
"OPHELIA VII: ECCLESIARCHAL PILGRIMAGE SURGE — FAITH LEVELS ASCENDANT",  
"RYZA: PLASMA FORGE OVERDRIVE — MAGOS DOMINUS HALIX SANCTIONS RISK",  
"NOCTURNE: VULKAN’S LEGACY HONOURED — SALAMANDERS DEPLOY RELIEF FLEETS",  
"CADIA (RUIN): PILGRIM FLEETS GATHER — THE PYLONS REMAIN SILENT",  
"AGRIPINAA: SKITARII LEGIONS DISPATCHED — DARK MECHANICUM SIGNALS DETECTED",  
"BASTIOR SUB-SECTOR: TYRANID SPLINTER FLEET SIGHTED — EXTERMINATUS DEBATED",  
"PHALANX: IMPERIAL FISTS ON HIGH ALERT — DORN'S LIGHT ENDURES",  
"BAAL SECUNDUS: RED GRAIL PROCESSIONS RESUME — SANGUINARY PRIESTS VIGILANT",  
"STYGIES VIII: FORBIDDEN ARCHEOTECH UNEARTHED — INQUISITORIAL PRESENCE RUMOURED",  
"CHOGORIS: WHITE SCARS INITIATE HUNT — WARP STORMS PARTIALLY CLEARED",  
"MEDUSA: IRON HANDS AUGMENTATION QUOTAS EXCEEDED — FLESH DISDAINED",  
"BAAL PRIME: THE RED THIRST INCIDENT SUPPRESSED — DEATH COMPANY DEPLOYED",  
"VIGILUS: NACHMUND GAUNTLET CONTESTED — ABADDON’S FORCES ENGAGED",  
"TERRA ORBIT: CUSTODES INCREASE WATCH — THRONEWORLD SECURITY ELEVATED",  
"FORGE WORLD METALICA: SUPPLY LINES RESTORED — ORK SABOTAGE REPELLED",  
"ASTROPATHIC CHOIR: SIGNAL DISTORTION RISES — WARP TURBULENCE INTENSIFIES",  
"SEGMENTUM OBSCURUS: BLACK SHIP SIGHTINGS CONFIRMED — UNSANCTIONED PSYKERS HARVESTED",  
"BAAL: ANGELS ENCARMINE ARRIVE — SUCCESSOR CHAPTERS RALLY",  
"INQUISITION: ORDO XENOS INVESTIGATES GENESTEALER CULT — HIVE QUARANTINE IMPOSED",  
"HYDRA CORDATUS: CHAOS INCURSION REPULSED — IMPERIAL GUARD HOLD THE LINE",  
"MARS NOOSPHERE: DATA-CHANT ERRORS DETECTED — TECH-PRIESTS INITIATE PURGE",  
"SCARUS SECTOR: ELDAR RAIDERS STRIKE — WEBWAY SIGNATURES FADE",  
"BAAL: SANGUINARY GUARD DEPLOYED — RELICS OF THE PRIMARCH UNSHEATHED",
];

const FOOTER_STYLES = `
  @keyframes footerMarquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes sectorPip {
    0%,100% { box-shadow: 0 0 4px #4ade80; opacity: 1; }
    50%     { box-shadow: 0 0 10px #4ade80, 0 0 18px #4ade8055; opacity: 0.7; }
  }
  @keyframes voxSilenced {
    0%,100% { box-shadow: inset 0 0 8px rgba(204,34,0,0.15), 0 0 6px rgba(204,34,0,0.2); }
    50%     { box-shadow: inset 0 0 14px rgba(204,34,0,0.3), 0 0 12px rgba(204,34,0,0.35); }
  }
  .footer-ticker-track {
    display: flex;
    width: max-content;
    animation: footerMarquee 200s linear infinite;
  }
  .footer-ticker-track:hover { animation-play-state: paused; }
  .footer-sector-pip {
    display: inline-block;
    width: 7px; height: 7px;
    background: #4ade80;
    border-radius: 50%;
    margin-left: 9px;
    animation: sectorPip 2s ease-in-out infinite;
  }
  .vox-btn-silenced {
    animation: voxSilenced 1.5s ease-in-out infinite;
  }
`;

const SystemFooter = ({ user, dbs }) => {
  const [isMuted, setIsMuted] = useState(false);
  // idle | scribing | rendered | malfunction
  const [titheState, setTitheState] = useState('idle');

  const handleTithe = async () => {
    if (titheState === 'scribing') return;
    try { AudioCore?.playSFX?.('click'); } catch { /* vox optional */ }
    setTitheState('scribing');
    try {
      await extractFullTithe(dbs, user);
      setTitheState('rendered');
    } catch (err) {
      console.error('◈ DATA-TITHE FAILURE:', err);
      setTitheState('malfunction');
    }
    setTimeout(() => setTitheState('idle'), 4000);
  };

  const handleVoxToggle = () => {
    try {
      if (typeof AudioCore?.playSFX === 'function' && !isMuted) {
        AudioCore.playSFX('click');
      }
      let mutedStatus = isMuted;
      if (typeof AudioCore?.toggleMute === 'function') {
        mutedStatus = AudioCore.toggleMute();
      } else if (typeof AudioCore?.setMuted === 'function') {
        mutedStatus = !isMuted;
        AudioCore.setMuted(mutedStatus);
      }
      setIsMuted(Boolean(mutedStatus));
    } catch (err) {
      console.error('VOX toggle failed:', err);
    }
  };

  return (
    <>
      <style>{FOOTER_STYLES}</style>
      <footer style={{
        height:      '35px',
        background:  'linear-gradient(180deg, #060002 0%, #020008 100%)',
        borderTop:   '2px solid var(--border)',
        boxShadow:   '0 -2px 10px rgba(180, 20, 0, 0.2)',   /* BA crimson seam, mirrors nav */
        display:     'flex',
        alignItems:  'center',
        zIndex:      20,
        flexShrink:  0,
      }}>

        {/* ── LEFT BADGE: Blood Angels ── */}
        <div style={{
          padding:       '0 14px',
          height:        '100%',
          borderRight:   '1px solid #4a0a00',
          fontSize:      '11px',
          fontWeight:    'bold',
          display:       'flex',
          alignItems:    'center',
          gap:           '8px',
          background:    'linear-gradient(135deg, #0a0000, #160000)',
          color:         '#b8923e',
          letterSpacing: '2px',
          flexShrink:    0,
          textShadow:    '0 0 8px #b8923e55',
        }}>
          SECTOR STATUS
          <span className="footer-sector-pip" />
        </div>

        {/* ── CENTRE: Mechanicum lore ticker ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          <div className="footer-ticker-track">
            {[...loreSnippets, ...loreSnippets].map((s, i) => (
              <span key={i} style={{
                marginRight:   '40px',
                color:         'var(--text-m)',
                whiteSpace:    'nowrap',
                fontSize:      '11px',
                fontFamily:    'var(--mono)',
                letterSpacing: '0.5px',
              }}>
                <span style={{ color: '#cc2200', marginRight: '8px' }}>◈</span>
                {s}
                <span style={{ color: '#4a0a00', marginLeft: '12px' }}>//</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Data-tithe extraction (Sanguinius only) ── */}
        {canExtractTithe(user) && dbs?.txns && (
          <button
            type="button"
            onClick={handleTithe}
            title="Extract the full archive as an Excel workbook"
            style={{
              background:    titheState === 'malfunction' ? 'rgba(204, 34, 0, 0.08)' : 'transparent',
              border:        'none',
              borderLeft:    '1px solid #4a0a00',
              color:         {
                idle:        '#b8923e',
                scribing:    '#c9a84c',
                rendered:    '#4ade80',
                malfunction: '#cc2200',
              }[titheState],
              padding:       '0 18px',
              cursor:        titheState === 'scribing' ? 'wait' : 'pointer',
              fontFamily:    'var(--mono)',
              fontSize:      '10px',
              height:        '100%',
              letterSpacing: '1px',
              transition:    'all 0.3s ease',
              textShadow:    '0 0 6px #b8923e44',
              flexShrink:    0,
            }}
          >
            [ TITHE: {{
              idle:        'EXTRACT',
              scribing:    'SCRIBING…',
              rendered:    'RENDERED',
              malfunction: 'MALFUNCTION',
            }[titheState]} ]
          </button>
        )}

        {/* ── RIGHT: VOX toggle ── */}
        <button
          type="button"
          onClick={handleVoxToggle}
          aria-pressed={isMuted}
          className={isMuted ? 'vox-btn-silenced' : ''}
          style={{
            background:    isMuted ? 'rgba(204, 34, 0, 0.08)' : 'transparent',
            border:        'none',
            borderLeft:    `1px solid ${isMuted ? '#cc2200' : '#4a0a00'}`,
            color:         isMuted ? '#cc2200'  : '#b8923e',
            padding:       '0 18px',
            cursor:        'pointer',
            fontFamily:    'var(--mono)',
            fontSize:      '10px',
            height:        '100%',
            letterSpacing: '1px',
            transition:    'all 0.3s ease',
            textShadow:    isMuted ? '0 0 10px #cc2200aa' : '0 0 6px #b8923e44',
            flexShrink:    0,
          }}
        >
          [ VOX: {isMuted ? 'SILENCED' : 'ACTIVE'} ]
        </button>

      </footer>
    </>
  );
};

export default SystemFooter;