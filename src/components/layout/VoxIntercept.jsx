import React, { useState, useEffect } from 'react';

// ── VoxIntercept — severity-aware rotating status line ────────
//
// ok   → Mechanicum green  — nominal operations
// warn → amber             — audit / anomaly
// crit → Blood Angels red  — warp breach / combat / emergency
// ─────────────────────────────────────────────────────────────

const phrases = [
  { t: "GELLAR FIELD INTEGRITY: 98.7% — NAVIGATOR PRIME COMPENSATING",               l: "ok"   },
  { t: "SCRAP CODE INFLUX DETECTED — ORIGIN: UNKNOWN — MAGOS VENERATUS NOTIFIED",    l: "crit" },
  { t: "BLOOD TITHE LEDGER UPDATED — SANGUINARY PRIEST WITNESS SEAL APPLIED",        l: "ok"   },
  { t: "WARP BREACH: DECK IX — GREY KNIGHTS INTERCEPT REQUESTED — AWAITING RESPONSE",l: "crit" },
  { t: "LITANY OF SACRED MAINTENANCE RECITED — MACHINE SPIRIT APPEASED",             l: "ok"   },
  { t: "MUNITORUM TITHE VARIANCE DETECTED — INITIATING AUDIT PROTOCOLS",             l: "warn" },
  { t: "NOOSPHERE UPLINK STABLE — ASTROPATHIC CHOIR SINGING IN HARMONY",             l: "ok"   },
  { t: "WARNING: PLASMA DRIVE FLUCTUATIONS — ENGAGE EMERGENCY COOLANT",              l: "crit" },
  { t: "ADEPTUS ARBITES DEPLOYED TO SECTOR 4 — QUELLING HERETICAL UPRISING",         l: "warn" },
  { t: "INQUISITORIAL MANDATE RECEIVED — ALL COMMS LOGGED FOR REVIEW",               l: "warn" },
];

const VOX_STYLES = `
  @keyframes voxCritPulse {
    0%,100% { opacity: 1;    text-shadow: 0 0 8px #cc2200bb; }
    50%     { opacity: 0.55; text-shadow: 0 0 18px #cc2200ff; }
  }
  @keyframes voxFadeIn {
    from { opacity: 0; transform: translateY(3px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes voxPipOk {
    0%,100% { box-shadow: 0 0 4px #4ade80; }
    50%     { box-shadow: 0 0 10px #4ade80, 0 0 18px #4ade8055; }
  }
  @keyframes voxPipWarn {
    0%,100% { box-shadow: 0 0 4px #eab308; }
    50%     { box-shadow: 0 0 10px #eab308, 0 0 18px #eab30855; }
  }
  @keyframes voxPipCrit {
    0%,100% { box-shadow: 0 0 4px #cc2200; }
    50%     { box-shadow: 0 0 12px #cc2200, 0 0 22px #cc220077; }
  }
  .vox-line-ok   { color: var(--text-m); animation: voxFadeIn 0.4s ease; }
  .vox-line-warn { color: #eab308;       animation: voxFadeIn 0.4s ease; text-shadow: 0 0 8px #eab30877; }
  .vox-line-crit { color: #cc2200;       animation: voxCritPulse 1.1s ease-in-out infinite, voxFadeIn 0.4s ease; }

  .vox-pip-ok   { background: #4ade80; border-radius: 50%; display: inline-block; width: 6px; height: 6px; margin-right: 10px; animation: voxPipOk   1.5s ease-in-out infinite; }
  .vox-pip-warn { background: #eab308; border-radius: 50%; display: inline-block; width: 6px; height: 6px; margin-right: 10px; animation: voxPipWarn 1.5s ease-in-out infinite; }
  .vox-pip-crit { background: #cc2200; border-radius: 50%; display: inline-block; width: 6px; height: 6px; margin-right: 10px; animation: voxPipCrit 0.7s ease-in-out infinite; }
`;

const VoxIntercept = () => {
  const [activePhrase, setActivePhrase] = useState(phrases[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePhrase(phrases[Math.floor(Math.random() * phrases.length)]);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const { t, l } = activePhrase;

  return (
    <>
      <style>{VOX_STYLES}</style>
      <div className="echo-stream" style={{
        display:    'flex',
        alignItems: 'center',
        fontSize:   '11px',
        fontFamily: 'var(--mono)',
        overflow:   'hidden',
        height:     '100%',
        padding:    '0 12px',
      }}>
        <span className={`vox-pip-${l}`} />
        <span className={`vox-line-${l}`}>
          ◈ {t}
        </span>
      </div>
    </>
  );
};

export default VoxIntercept;