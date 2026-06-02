// src/components/mobile/MobileBootScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { couchLogin } from '../../utils/couchAuth';
import ShrineBackdrop from '../layout/ShrineBackdrop';

// ── Shorter, mobile-specific boot sequence ──────────────────────
const bootSequence = [
  { text: "+++ PORTABLE UPLINK UNIT DETECTED +++",              color: "var(--ba-gold-dim)" },
  { text: "WARNING: REDUCED COGITATOR CAPACITY",                color: "var(--ba-crimson)"  },
  { text: "",                                                    color: ""                   },
  { text: "Field-grade binharic suite loading...",              color: "var(--text-m)"      },
  { text: "Noospheric link: MOBILE RELAY ONLY",                 color: "var(--text-m)"      },
  { text: "Full sanctification rites: SUSPENDED",               color: "var(--text-m)"      },
  { text: "Litany of Limitation: ACKNOWLEDGED",                 color: "var(--text-m)"      },
  { text: "",                                                    color: ""                   },
  { text: "MACHINE-SPIRIT STABLE — FIELD MODE ENGAGED",         color: "var(--ba-gold-dim)" },
  { text: "◈ SANGUINIUS WATCHES, EVEN IN THE FIELD ◈",         color: "var(--text-d)"      },
];

// ── Corner bracket decoration ────────────────────────────────────
const Corner = ({ pos }) => {
  const isTop  = pos.includes('top');
  const isLeft = pos.includes('left');
  return (
    <span style={{
      position: 'absolute',
      [isTop  ? 'top'    : 'bottom']: '-5px',
      [isLeft ? 'left'   : 'right' ]: '-5px',
      width: '16px', height: '16px',
      borderTop:    isTop  ? '2px solid var(--ba-gold)' : 'none',
      borderBottom: !isTop ? '2px solid var(--ba-gold)' : 'none',
      borderLeft:   isLeft ? '2px solid var(--ba-gold)' : 'none',
      borderRight:  !isLeft? '2px solid var(--ba-gold)' : 'none',
    }} />
  );
};

// ── Main component ───────────────────────────────────────────────
const MobileBootScreen = ({ onComplete }) => {
  const [phase, setPhase]                       = useState('login');
  const [completedLines, setCompletedLines]     = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  const [username, setUsername]                 = useState('');
  const [password, setPassword]                 = useState('');
  const [host, setHost]                         = useState(
    localStorage.getItem('COGITATOR_UPLINK_HOST') || 'laptop-lg23d2mc.taild8bd6e.ts.net/db'
  );
  const [showHostEdit, setShowHostEdit]         = useState(false);
  const [authError, setAuthError]               = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isOffline, setIsOffline]               = useState(false);

  const terminalRef = useRef(null);

  // ◈ PRE-FILL CACHED USERNAME ◈
  // Password is no longer persisted — only the username is. See
  // BootScreen.jsx for full rationale.
  useEffect(() => {
    const savedUser = localStorage.getItem('mech_username');
    if (savedUser) setUsername(savedUser);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [completedLines, currentCharIndex]);

  // ── Terminal typewriter (faster on mobile) ───────────────────
  useEffect(() => {
    if (phase !== 'terminal') return;

    if (currentLineIndex >= bootSequence.length) {
      const finishTimer = setTimeout(() => {
        setPhase('exiting');
        setTimeout(() => onComplete({ username: username.trim(), password: password.trim() }), 600);
      }, 800);
      return () => clearTimeout(finishTimer);
    }

    const currentLineData = bootSequence[currentLineIndex];
    const fullText        = currentLineData.text;

    if (fullText === '') {
      const skipTimer = setTimeout(() => {
        setCompletedLines(prev => [...prev, currentLineData]);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, 120);
      return () => clearTimeout(skipTimer);
    }

    let timer;
    if (currentCharIndex < fullText.length) {
      // Faster typing on mobile — half the desktop delay
      let delay = Math.random() * 8 + 8;
      const nextChar = fullText[currentCharIndex];
      if (nextChar === ' ')                     delay = 40;
      if (nextChar === '.' || nextChar === '—') delay = 150;

      timer = setTimeout(() => setCurrentCharIndex(prev => prev + 1), delay);
    } else {
      timer = setTimeout(() => {
        setCompletedLines(prev => [...prev, currentLineData]);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, Math.random() * 150 + 100);
    }

    return () => clearTimeout(timer);
  }, [phase, currentLineIndex, currentCharIndex, onComplete, username, password]);

  // ── Auth handler ─────────────────────────────────────────────
  // Uses CouchDB /_session for cookie-based auth (the cookie is
  // HttpOnly and unreadable from JS). Password is held in React
  // state for the session only, never persisted.
  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthError('// ERROR: CREDENTIALS INCOMPLETE');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('// QUERYING VAULT...');

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    try {
      await couchLogin(host, cleanUser, cleanPass);
      localStorage.setItem('mech_username', cleanUser);
      setAuthError('');
      setIsAuthenticating(false);
      setPhase('prompt');
    } catch (err) {
      if (err?.status === 401) {
        setAuthError('// ERROR: CREDENTIALS REJECTED');
        setIsAuthenticating(false);
        return;
      }
      if (err?.status === 404) {
        setAuthError('// ERROR: SESSION ENDPOINT NOT FOUND — CHECK HOST PATH');
        setIsAuthenticating(false);
        return;
      }
      if (err?.status) {
        setAuthError(`// ERROR: VAULT REJECTED REQUEST [${err.status}]`);
        setIsAuthenticating(false);
        return;
      }
      // No status → network-level failure (DNS, refused, TLS, …).
      const cachedUser = localStorage.getItem('mech_username');
      if (cachedUser === cleanUser) {
        setIsOffline(true);
        setAuthError('// WARNING: OFFLINE MODE ENGAGED');
        setTimeout(() => {
          setAuthError('');
          setIsAuthenticating(false);
          setPhase('prompt');
        }, 1200);
      } else {
        setAuthError('// ERROR: VAULT UNREACHABLE & NO CACHE FOUND');
        setIsAuthenticating(false);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'transform 0.6s cubic-bezier(0.7, 0, 0.3, 1)', overflow: 'hidden',
      transform: phase === 'exiting' ? 'translateY(-100%)' : 'translateY(0)',
    }}>

      <div className="scanlines" style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
      <div className="vignette"  style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />

      {/* ── Candlelit shrine backdrop (all phases) ── */}
      <ShrineBackdrop mobile dim={phase === 'terminal'} />

      {/* ══════════════════════════════════════════
          PHASE: LOGIN
          ══════════════════════════════════════════ */}
      {phase === 'login' && (
        <div style={{
          width: 'min(400px, 92vw)',
          padding: '24px 20px',
          position: 'relative', zIndex: 5,
          background: 'rgba(6, 1, 1, 0.97)',
          border: '1px solid var(--ba-border)',
          boxShadow: '0 0 50px rgba(0,0,0,1), 0 0 20px rgba(139,0,0,0.15), inset 0 0 30px rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column', gap: '18px',
          boxSizing: 'border-box',
        }}>
          {/* Gold top rule */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
            background: 'linear-gradient(90deg, transparent, var(--ba-gold-dim), var(--ba-gold), var(--ba-gold-dim), transparent)',
          }} />

          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px solid var(--ba-border)', paddingBottom: '14px' }}>
            <div style={{ color: 'var(--ba-gold)', letterSpacing: '3px', fontSize: '13px', fontWeight: 'bold', textShadow: '0 0 12px rgba(201,168,76,0.5)' }}>
              RESTRICTED DATACACHE
            </div>
            <div style={{ color: 'var(--ba-gold-mute)', fontSize: '9px', letterSpacing: '2px', marginTop: '6px' }}>
              INQUISITORIAL CLEARANCE REQUIRED
            </div>
          </div>

          {/* Username */}
          <div>
            <div style={{ fontSize: '9px', color: 'var(--ba-gold-dim)', marginBottom: '6px', letterSpacing: '2px' }}>
              DESIGNATION //
            </div>
            <input
              style={{
                width: '100%', background: 'rgba(0,0,0,0.75)',
                border: '1px solid var(--ba-border)',
                color: '#fff', padding: '12px 10px',
                fontFamily: 'var(--mono)',
                fontSize: '16px', // 16px prevents iOS auto-zoom on focus
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ENTER ID..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={isAuthenticating}
              onFocus={e  => e.target.style.borderColor = 'var(--ba-gold-dim)'}
              onBlur={e   => e.target.style.borderColor = 'var(--ba-border)'}
            />
          </div>

          {/* Password */}
          <div>
            <div style={{ fontSize: '9px', color: 'var(--ba-gold-dim)', marginBottom: '6px', letterSpacing: '2px' }}>
              ACCESS CIPHER //
            </div>
            <input
              type="password"
              style={{
                width: '100%', background: 'rgba(0,0,0,0.75)',
                border: '1px solid var(--ba-border)',
                color: '#fff', padding: '12px 10px',
                fontFamily: 'var(--mono)',
                fontSize: '16px', // 16px prevents iOS auto-zoom on focus
                outline: 'none', letterSpacing: '4px', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isAuthenticating}
              onFocus={e  => e.target.style.borderColor = 'var(--ba-gold-dim)'}
              onBlur={e   => e.target.style.borderColor = 'var(--ba-border)'}
            />
          </div>

          {/* ── UPLINK NODE (collapsible) ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '9px', color: 'var(--ba-gold-dim)', letterSpacing: '2px' }}>
                UPLINK NODE //
              </div>
              <button
                onClick={() => setShowHostEdit(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
                  fontSize: '9px', letterSpacing: '2px',
                  color: showHostEdit ? 'var(--ba-gold)' : 'var(--ba-border)',
                  fontFamily: 'var(--mono)',
                }}
              >
                {showHostEdit ? '[ COLLAPSE ]' : '[ MODIFY ]'}
              </button>
            </div>

            {!showHostEdit && (
              <div style={{ marginTop: '4px', fontSize: '9px', letterSpacing: '1px', color: 'var(--ba-border)', fontFamily: 'var(--mono)' }}>
                {host}
              </div>
            )}

            {showHostEdit && (
              <div style={{ marginTop: '6px' }}>
                <input
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.75)',
                    border: '1px solid var(--ba-gold-dim)',
                    color: 'var(--ba-gold)', padding: '12px 10px',
                    fontFamily: 'var(--mono)', fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  value={host}
                  onChange={e => {
                    setHost(e.target.value);
                    localStorage.setItem('COGITATOR_UPLINK_HOST', e.target.value);
                  }}
                  placeholder="IP:PORT or hostname.ts.net"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  disabled={isAuthenticating}
                />
                <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--ba-border)', letterSpacing: '1px' }}>
                  // ts.net hostnames use http:// relay
                </div>
              </div>
            )}
          </div>

          {/* Auth error */}
          {authError && (
            <div style={{
              fontSize: '10px', textAlign: 'center', letterSpacing: '1px',
              color: authError.includes('WARNING') ? 'var(--amber)'
                   : authError.includes('QUERYING') ? 'var(--text-d)'
                   : 'var(--ba-crimson)',
              textShadow: authError.includes('QUERYING') ? 'none'
                        : authError.includes('WARNING')  ? '0 0 6px rgba(234,179,8,0.6)'
                        : '0 0 8px rgba(204,34,0,0.6)',
            }}>
              {authError}
            </div>
          )}

          {/* Authenticate button — full width, large touch target */}
          <button
            onClick={handleAuth}
            disabled={isAuthenticating}
            style={{
              width: '100%',
              background:    'rgba(120,5,5,0.2)',
              border:        '1px solid var(--ba-crimson)',
              color:         '#fff',
              padding:       '16px',
              fontFamily:    'var(--mono)',
              fontSize:      '12px',
              letterSpacing: '3px',
              cursor:        isAuthenticating ? 'wait' : 'pointer',
              transition:    'all 0.2s',
              fontWeight:    'bold',
              opacity:       isAuthenticating ? 0.5 : 1,
              textShadow:    '0 0 8px rgba(204,34,0,0.5)',
              boxSizing:     'border-box',
            }}
          >
            {isAuthenticating ? '[ QUERYING... ]' : '[ AUTHENTICATE ]'}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PHASE: PROMPT
          ══════════════════════════════════════════ */}
      {phase === 'prompt' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '24px', zIndex: 5, padding: '0 20px', width: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{
            fontSize: '10px', letterSpacing: '3px', textAlign: 'center',
            color: 'var(--ba-gold-dim)', textShadow: '0 0 8px rgba(184,146,62,0.4)',
          }}>
            OPERATOR CONFIRMED ·{' '}
            <span style={{ color: 'var(--ba-gold)', textShadow: '0 0 12px rgba(201,168,76,0.6)' }}>
              {username.toUpperCase()}
            </span>
            {isOffline && (
              <div style={{ color: 'var(--amber)', marginTop: '6px' }}>· OFFLINE MODE ·</div>
            )}
          </div>

          {/* Initiate button — nearly full width on mobile */}
          <div
            onClick={() => setPhase('terminal')}
            style={{
              width: 'min(380px, 88vw)',
              textAlign: 'center',
              fontSize: '15px', letterSpacing: '3px', cursor: 'pointer',
              padding: '24px 16px',
              border: '1px solid var(--ba-crimson)',
              background: 'rgba(8,1,1,0.97)',
              color: 'var(--ba-gold)',
              boxShadow: '0 0 30px rgba(0,0,0,1), 0 0 20px rgba(139,0,0,0.2)',
              textTransform: 'uppercase',
              position: 'relative',
              fontFamily: 'var(--mono)',
              fontWeight: 'bold',
              textShadow: '0 0 14px rgba(201,168,76,0.5)',
              boxSizing: 'border-box',
            }}
          >
            <Corner pos="top-left"     />
            <Corner pos="top-right"    />
            <Corner pos="bottom-left"  />
            <Corner pos="bottom-right" />
            INITIATE ANALYTICAL ENUMERATION
          </div>

          <div style={{ fontSize: '9px', color: 'var(--ba-border)', letterSpacing: '3px' }}>
            ◈ IX · LEGIO · CODEX TRIBUTORUM ◈
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          PHASE: TERMINAL
          Short field-mode boot sequence
          ══════════════════════════════════════════ */}
      {phase === 'terminal' && (
        <div style={{
          width: '92vw',
          height: 'calc(100vh - 80px)',
          maxHeight: '600px',
          position: 'relative', overflow: 'hidden',
          background: 'rgba(4,1,1,0.98)',
          border: '1px solid var(--ba-border)',
          boxShadow: '0 0 60px rgba(0,0,0,1), inset 0 0 40px rgba(0,0,0,1)',
          zIndex: 5,
        }}>
          {/* Gold top rule */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, var(--ba-gold-dim), var(--ba-gold), var(--ba-gold-dim), transparent)',
          }} />

          {/* Background image */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: -1,
            backgroundImage: 'url(/the-emperor-protects-1.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            opacity: 0.10,
            filter: 'grayscale(100%) sepia(80%) hue-rotate(330deg) brightness(0.35) contrast(1.4)',
          }} />

          <div
            ref={terminalRef}
            style={{
              width: '100%', height: '100%', padding: '20px 16px',
              display: 'flex', flexDirection: 'column',
              fontSize: '11px', textAlign: 'left', overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {/* Terminal header */}
            <div style={{
              borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '10px',
              marginBottom: '18px', fontSize: '9px',
              letterSpacing: '2px', textTransform: 'uppercase',
              display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px',
            }}>
              <span style={{ color: 'var(--ba-gold-mute)' }}>
                FIELD COGITATOR // UPLINK:{' '}
                {isOffline
                  ? <span style={{ color: 'var(--amber)' }}>LOCAL CACHE</span>
                  : <span style={{ color: 'var(--border-hi)' }}>ACTIVE</span>
                }
              </span>
              <span style={{ color: 'var(--ba-gold)' }}>{username.toUpperCase()}</span>
            </div>

            {/* Completed lines */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {completedLines.map((line, idx) => (
                <div key={idx} style={{ color: line?.color || 'var(--text-m)', lineHeight: '1.7' }}>
                  {line?.text}
                </div>
              ))}

              {/* Currently typing line */}
              {currentLineIndex < bootSequence.length && bootSequence[currentLineIndex].text !== '' && (
                <div style={{ color: bootSequence[currentLineIndex].color || 'var(--text-m)', display: 'flex' }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    {bootSequence[currentLineIndex].text.substring(0, currentCharIndex)}
                  </span>
                  <span className="blink" style={{
                    display: 'inline-block', width: '8px', height: '13px',
                    background: 'var(--ba-gold)', marginLeft: '2px',
                    boxShadow: '0 0 6px rgba(201,168,76,0.7)',
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MobileBootScreen;