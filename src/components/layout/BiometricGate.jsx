import React, { useEffect, useState, useCallback, useRef } from 'react';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Capacitor } from '@capacitor/core';

// ─────────────────────────────────────────────────────────────
// BiometricGate
// Wraps the app. On cold launch:
//   * Capacitor + enrolled biometry + cached auth token present
//     → block UI until fingerprint/face passes.
//   * No biometry / no cached token / web build → pass straight
//     through so dev experience is unaffected.
//
// The gate uses the presence of `mech_username` in localStorage
// as the "user has previously logged in" signal. Authentication
// happens on the device, never against a server — losing this
// step does NOT grant access to CouchDB (the password is no
// longer cached anywhere; the user still has to type it). The
// gate only stops bystanders from seeing the username/UI between
// app launches.
//
// On every resume of the app (App returning from background) the
// gate re-locks if it had previously been opened. This is the
// "phone in your pocket → app open" defence.
// ─────────────────────────────────────────────────────────────

// We previously gated on the presence of a cached base64 token in
// localStorage. The token is gone (passwords no longer touch disk —
// see couchAuth + BootScreen). The gate now keys off the username
// stub, which is still kept as a UX prefill and is also a reliable
// signal of "this user has logged in here at least once."
const TOKEN_KEY = 'mech_username';

const STYLES = `
  @keyframes bgPulseRune {
    0%, 100% { transform: scale(1);   opacity: 1;   filter: drop-shadow(0 0 12px rgba(204,34,0,0.6))  drop-shadow(0 0 28px rgba(139,0,0,0.4)); }
    50%      { transform: scale(1.04); opacity: 0.85; filter: drop-shadow(0 0 22px rgba(204,34,0,0.9))  drop-shadow(0 0 44px rgba(139,0,0,0.6)); }
  }
  @keyframes bgScan {
    0%   { transform: translateY(-100%); opacity: 0; }
    10%  { opacity: 0.7; }
    90%  { opacity: 0.7; }
    100% { transform: translateY(100vh);  opacity: 0; }
  }
  .biolock-root {
    position: fixed; inset: 0;
    z-index: 10001;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 18px;
    background: radial-gradient(ellipse at center,
                  #1a0500 0%,
                  #0c0200 55%,
                  #000 100%);
    color: #c9a84c;
    font-family: var(--mono, "Courier New", monospace);
    text-transform: uppercase;
    overflow: hidden;
  }
  .biolock-root::after {
    content: '';
    position: absolute; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(204,34,0,0.6) 30%, #ff4422 50%, rgba(204,34,0,0.6) 70%, transparent);
    box-shadow: 0 0 12px 2px rgba(204,34,0,0.55);
    animation: bgScan 4.5s linear infinite;
    pointer-events: none;
  }
  .biolock-sigil {
    font-size: 64px;
    color: #cc2200;
    animation: bgPulseRune 3s ease-in-out infinite;
  }
  .biolock-title {
    font-size: 14px;
    letter-spacing: 8px;
    color: #c9a84c;
    text-shadow: 0 0 10px rgba(201,168,76,0.6);
  }
  .biolock-sub {
    font-size: 10px;
    letter-spacing: 4px;
    color: #7a2010;
  }
  .biolock-btn {
    margin-top: 22px;
    background: rgba(0,0,0,0.85);
    color: #c9a84c;
    border: 1px solid #cc2200;
    padding: 12px 28px;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 4px;
    text-transform: uppercase;
    transition: background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
  }
  .biolock-btn:hover, .biolock-btn:focus-visible {
    background: rgba(204,34,0,0.18);
    color: #fff;
    box-shadow: 0 0 22px rgba(204,34,0,0.55);
    outline: none;
  }
  .biolock-link {
    margin-top: 4px;
    background: transparent;
    border: none;
    color: rgba(201,168,76,0.5);
    font-family: inherit;
    font-size: 9px;
    letter-spacing: 3px;
    cursor: pointer;
    padding: 4px 8px;
    text-transform: uppercase;
  }
  .biolock-link:hover { color: #cc2200; }
  .biolock-error {
    margin-top: 8px;
    color: #ff4422;
    font-size: 10px;
    letter-spacing: 3px;
    max-width: 80vw;
    text-align: center;
  }
`;

const BiometricGate = ({ children }) => {
  const [phase, setPhase] = useState('checking');  // 'checking' | 'locked' | 'open'
  const [error, setError] = useState('');
  const [hadOpened, setHadOpened] = useState(false);

  // Cached result of the initial biometry availability check. Persists
  // across re-renders so the visibilitychange handler can read it
  // without re-querying the native plugin.
  // Three states:
  //   null    — initial check hasn't completed yet
  //   true    — Capacitor + biometry enrolled, gate is meaningful
  //   false   — desktop web build, or no biometry on this device. Gate
  //             is a no-op; never lock on tab visibility either.
  const biometryAvailableRef = useRef(null);

  const attemptUnlock = useCallback(async () => {
    setError('');
    try {
      await BiometricAuth.authenticate({
        reason: 'UNLOCK COGITATOR',
        cancelTitle: 'CANCEL',
        allowDeviceCredential: true,
        androidTitle: 'CODEX TRIBUTORUM',
        androidSubtitle: 'BIOMETRIC SEAL',
        androidConfirmationRequired: false,
      });
      setPhase('open');
      setHadOpened(true);
    } catch (e) {
      setError((e?.message || 'AUTHENTICATION FAILED').toUpperCase());
    }
  }, []);

  // Initial check on mount.
  useEffect(() => {
    let cancelled = false;

    // Web/desktop build (no Capacitor host): biometry can never work.
    // Skip the plugin call entirely — some plugin web shims throw,
    // some return isAvailable=false, but either way we want the same
    // outcome: pass through, never lock.
    if (!Capacitor.isNativePlatform()) {
      biometryAvailableRef.current = false;
      setPhase('open');
      setHadOpened(true);
      return;
    }

    (async () => {
      try {
        const result = await BiometricAuth.checkBiometry();
        if (cancelled) return;
        const available = !!result?.isAvailable;
        biometryAvailableRef.current = available;

        const hasToken = !!localStorage.getItem(TOKEN_KEY);
        if (available && hasToken) {
          setPhase('locked');
          attemptUnlock();
        } else {
          setPhase('open');
          setHadOpened(true);
        }
      } catch (_e) {
        // Plugin not present, no biometry hardware, etc. Pass through.
        if (!cancelled) {
          biometryAvailableRef.current = false;
          setPhase('open');
          setHadOpened(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [attemptUnlock]);

  // Re-lock on returning from background — only on a real biometric-
  // capable device. Without this guard a desktop tab switch would
  // dead-end at the lock screen with no way to authenticate out.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      if (!hadOpened) return;
      if (biometryAvailableRef.current !== true) return;
      if (!localStorage.getItem(TOKEN_KEY)) return;
      setPhase('locked');
      attemptUnlock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [hadOpened, attemptUnlock]);

  const wipeAndContinue = () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_e) {}
    setPhase('open');
    setHadOpened(true);
  };

  if (phase === 'checking') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#000',
        zIndex: 10001,
      }} aria-hidden="true" />
    );
  }
  if (phase === 'open') return children;

  // Locked screen
  return (
    <>
      <style>{STYLES}</style>
      <div className="biolock-root" role="dialog" aria-modal="true" aria-label="Biometric unlock">
        <div className="biolock-sigil">✠</div>
        <div className="biolock-title">SEAL VERIFICATION REQUIRED</div>
        <div className="biolock-sub">PRESENT GENE-PRINT TO PROCEED</div>
        {error && <div className="biolock-error">{error}</div>}
        <button type="button" className="biolock-btn" onClick={attemptUnlock}>
          [ AUTHENTICATE ]
        </button>
        <button type="button" className="biolock-link" onClick={wipeAndContinue}>
          purge cached creds + manual login
        </button>
      </div>
    </>
  );
};

export default BiometricGate;
