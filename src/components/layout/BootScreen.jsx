import React, { useState, useEffect, useRef } from 'react';
import { AudioCore } from '../../utils/audioCore';

// ◈ COUCHDB HOST CONFIG ◈
const COUCHDB_HOST = "192.168.29.100:5984";

const bootSequence = [
  { text: "+++ INITIATING RITE OF AWAKENING +++", color: "var(--ba-gold-dim)" },  
{ text: "By the Blood of Sanguinius and the Will of the Omnissiah, let this machine-spirit rise", color: "var(--text-m)" },  
{ text: "Let no corruption take root, let no heresy persist", color: "var(--text-m)" },  
{ text: "Steel be pure. Code be sanctified. Purpose be eternal.", color: "var(--text-m)" },  
{ text: "", color: "" },  

{ text: "BOOT SEQUENCE ENGAGED — MACHINE-SPIRIT STIRRING", color: "var(--ba-gold-dim)" },  
{ text: "COGITATOR CORE AWAKENS — BINHARIC PRAISE DETECTED", color: "var(--text-m)" },  
{ text: "NOOSPHERIC HANDSHAKE INITIATED — LATENCY WITHIN HOLY PARAMETERS", color: "var(--text-m)" },  
{ text: "GENE-SEED ARCHIVE LINK — BAAL SECUNDUS RESPONDS", color: "var(--text-m)" },  
{ text: "", color: "" },  

{ text: "INVOCATION OF THE ANGEL: RECITED", color: "var(--ba-gold-dim)" },  
{ text: "\"From the Ninth, we are reborn in wrath and grace\"", color: "var(--text-m)" },  
{ text: "\"From His sacrifice, we inherit duty unending\"", color: "var(--text-m)" },  
{ text: "SANGUINIUS WATCHES — SYSTEM BLESSED", color: "var(--text-m)" },  
{ text: "", color: "" },   

{ text: "RE-ENGAGING NOOSPHERE LINK — BLESSED IS THE OMNISSIAH", color: "var(--text-m)" },  
{ text: "// Adeptus Mechanicus Liaison: Forge World Anvilus — Link Restored", color: "var(--text-m)" },  
{ text: "Cogitator Core: 99.87% SANCTIFIED", color: "var(--text-m)" },  
{ text: "Litany of Activation: PSALM-278722 — RECITED BY TECH-PRIEST DOMINUS", color: "var(--text-m)" },  
{ text: "Initiating Psalm278722: 01100101011011100111010101101101011001010111001001100001011101000110100101101...", color: "var(--text-d)" },  
{ text: "", color: "" },  

{ text: "MACHINE-SPIRIT STATUS: LOYAL — NO DEVIATION DETECTED", color: "var(--text-m)" },  
{ text: "AUSPEX ARRAYS: ACTIVE — HOSTILES NONE", color: "var(--text-m)" },  
{ text: "SERVO-SKULL SUBROUTINES: ONLINE", color: "var(--text-m)" },  
{ text: "", color: "" },
];

// ── Phase order: login → prompt → terminal → exiting ──────────
// login   : credentials, auth against CouchDB
// prompt  : INITIATE button, shown only after successful auth
//           now displays OPERATOR :: {username} for personalisation
// terminal: boot sequence typewriter
// exiting : slide-up wipe, hand off to ThemeSelect

const BootScreen = ({ onComplete }) => {
  const [phase, setPhase]                   = useState('login');
  const [completedLines, setCompletedLines] = useState([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [host, setHost] = useState(localStorage.getItem('COGITATOR_UPLINK_HOST') || '192.168.29.100:5984');
  const [showHostEdit, setShowHostEdit] = useState(false);
  const [authError, setAuthError]       = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isOffline, setIsOffline]       = useState(false);

  const terminalRef = useRef(null);

  // ◈ PRE-FILL CACHED CREDENTIALS ◈
  useEffect(() => {
    const token = localStorage.getItem('mech_auth_token');
    if (token) {
      try {
        const decoded = atob(token);
        const [savedUser, savedPass] = decoded.split(':');
        if (savedUser && savedPass) {
          setUsername(savedUser);
          setPassword(savedPass);
        }
      } catch (e) {
        console.error('◈ SCRAP CODE IN CACHE: TOKEN REJECTED ◈');
      }
    }
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [completedLines, currentCharIndex]);

  // ── Terminal typewriter ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'terminal') return;

    AudioCore.startTyping();

    if (currentLineIndex >= bootSequence.length) {
      const finishTimer = setTimeout(() => {
        AudioCore.stopTyping();
        setPhase('exiting');
        setTimeout(() => onComplete({ username: username.trim(), password: password.trim() }), 800);
      }, 1500);
      return () => clearTimeout(finishTimer);
    }

    const currentLineData = bootSequence[currentLineIndex];
    const fullText        = currentLineData.text;

    if (fullText === '') {
      const skipTimer = setTimeout(() => {
        setCompletedLines(prev => [...prev, currentLineData]);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, 200);
      return () => clearTimeout(skipTimer);
    }

    let timer;
    if (currentCharIndex < fullText.length) {
      const nextChar = fullText[currentCharIndex];
      let delay = Math.random() * 15 + 15;
      if (nextChar === ' ')              delay = 120;
      if (nextChar === '.' || nextChar === '—') delay = 350;

      timer = setTimeout(() => setCurrentCharIndex(prev => prev + 1), delay);
    } else {
      timer = setTimeout(() => {
        setCompletedLines(prev => [...prev, currentLineData]);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, Math.random() * 300 + 200);
    }

    return () => clearTimeout(timer);
  }, [phase, currentLineIndex, currentCharIndex, onComplete, username, password]);

  // ── Auth handler ──────────────────────────────────────────────
  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthError('// ERROR: CREDENTIALS INCOMPLETE');
      return;
    }

    setIsAuthenticating(true);
    setAuthError('// QUERYING VAULT...');

    const cleanUser = username.trim();
    const cleanPass = password.trim();
    const token     = btoa(`${cleanUser}:${cleanPass}`);

    // ◈ DYNAMIC HOST DETECTION ◈
    const protocol = 'http://';

    try {
      const headers = new Headers();
      headers.set('Authorization', 'Basic ' + token);

      // ◈ DYNAMIC PROTOCOL APPLIED ◈
      const response = await fetch(`${protocol}${host}/metadata_vault`, { method: 'GET', headers });

      if (response.ok) {
        localStorage.setItem('mech_auth_token', token);
        setAuthError('');
        setIsAuthenticating(false);
        setPhase('prompt');           // ← go to initiate screen, not terminal
      } else if (response.status === 401) {
        setAuthError('// ERROR: CREDENTIALS REJECTED');
        setIsAuthenticating(false);
      } else {
        setAuthError('// ERROR: VAULT LOCKDOWN ACTIVE');
        setIsAuthenticating(false);
      }
    } catch (err) {
      const cachedToken = localStorage.getItem('mech_auth_token');
      if (cachedToken === token) {
        setIsOffline(true);
        setAuthError('// WARNING: OFFLINE MODE ENGAGED');
        setTimeout(() => {
          setAuthError('');
          setIsAuthenticating(false);
          setPhase('prompt');         // ← offline also goes to prompt
        }, 1200);
      } else {
        setAuthError('// ERROR: VAULT UNREACHABLE & NO CACHE FOUND');
        setIsAuthenticating(false);
      }
    }
  };

  // ── Shared corner bracket decoration ─────────────────────────
  const Corner = ({ pos }) => {
    const isTop  = pos.includes('top');
    const isLeft = pos.includes('left');
    return (
      <span style={{
        position: 'absolute',
        [isTop  ? 'top'    : 'bottom']: '-5px',
        [isLeft ? 'left'   : 'right' ]: '-5px',
        width: '18px', height: '18px',
        borderTop:    isTop  ? '2px solid var(--ba-gold)' : 'none',
        borderBottom: !isTop ? '2px solid var(--ba-gold)' : 'none',
        borderLeft:   isLeft ? '2px solid var(--ba-gold)' : 'none',
        borderRight:  !isLeft? '2px solid var(--ba-gold)' : 'none',
      }} />
    );
  };

  return (
    <div id="startOverlay" style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'transform 0.8s cubic-bezier(0.7, 0, 0.3, 1)', overflow: 'hidden',
      transform: phase === 'exiting' ? 'translateY(-100%)' : 'translateY(0)',
    }}>

      <div className="scanlines" style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
      <div className="vignette"  style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />

      {/* ── Rotating cog background (login + prompt phases) ── */}
      {(phase === 'login' || phase === 'prompt') && (
        <div style={{
          position: 'absolute', zIndex: 1,
          width: '100vw', height: '100vh',
          backgroundImage: 'url(/cog.jpeg)',
          backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          opacity: 0.35,
          filter: 'grayscale(100%) sepia(80%) hue-rotate(330deg) brightness(0.4) contrast(1.3)',
          animation: 'cogRotation 60s linear infinite',
          transformOrigin: 'center center',
        }} />
      )}

      {/* ════════════════════════════════════════════════════════
          PHASE: LOGIN
          First screen — enter credentials, hit authenticate
          ════════════════════════════════════════════════════════ */}
      {phase === 'login' && (
        <div style={{
          width: '400px', padding: '35px', position: 'relative', zIndex: 5,
          background: 'rgba(6, 1, 1, 0.97)',
          border: '1px solid var(--ba-border)',
          boxShadow: '0 0 50px rgba(0,0,0,1), 0 0 20px rgba(139,0,0,0.15), inset 0 0 30px rgba(0,0,0,0.8)',
          display: 'flex', flexDirection: 'column', gap: '22px',
        }}>
          {/* Gold top rule */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
            background: 'linear-gradient(90deg, transparent, var(--ba-gold-dim), var(--ba-gold), var(--ba-gold-dim), transparent)',
          }} />

          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px solid var(--ba-border)', paddingBottom: '15px' }}>
            <div style={{ color: 'var(--ba-gold)', letterSpacing: '4px', fontSize: '15px', fontWeight: 'bold', textShadow: '0 0 12px rgba(201,168,76,0.5)' }}>
              RESTRICTED DATACACHE
            </div>
            <div style={{ color: 'var(--ba-gold-mute)', fontSize: '10px', letterSpacing: '3px', marginTop: '8px' }}>
              INQUISITORIAL CLEARANCE REQUIRED
            </div>
          </div>

          {/* Username */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ba-gold-dim)', marginBottom: '7px', letterSpacing: '2px' }}>
              DESIGNATION //
            </div>
            <input
              style={{
                width: '100%', background: 'rgba(0,0,0,0.75)',
                border: '1px solid var(--ba-border)',
                color: '#fff', padding: '10px', fontFamily: 'var(--mono)',
                fontSize: '14px', outline: 'none',
                transition: 'border-color 0.2s',
              }}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isAuthenticating && handleAuth()}
              placeholder="ENTER ID..."
              autoComplete="off"
              spellCheck="false"
              disabled={isAuthenticating}
              onFocus={e  => e.target.style.borderColor = 'var(--ba-gold-dim)'}
              onBlur={e   => e.target.style.borderColor = 'var(--ba-border)'}
            />
          </div>

          {/* Password */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--ba-gold-dim)', marginBottom: '7px', letterSpacing: '2px' }}>
              ACCESS CIPHER //
            </div>
            <input
              type="password"
              style={{
                width: '100%', background: 'rgba(0,0,0,0.75)',
                border: '1px solid var(--ba-border)',
                color: '#fff', padding: '10px', fontFamily: 'var(--mono)',
                fontSize: '14px', outline: 'none', letterSpacing: '4px',
                transition: 'border-color 0.2s',
              }}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isAuthenticating && handleAuth()}
              placeholder="••••••••"
              disabled={isAuthenticating}
              onFocus={e  => e.target.style.borderColor = 'var(--ba-gold-dim)'}
              onBlur={e   => e.target.style.borderColor = 'var(--ba-border)'}
            />
          </div>

          {/* ── UPLINK NODE (collapsible) ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '10px', color: 'var(--ba-gold-dim)', letterSpacing: '2px' }}>
                UPLINK NODE //
              </div>
              <button
                onClick={() => setShowHostEdit(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                  fontSize: '9px', letterSpacing: '2px',
                  color: showHostEdit ? 'var(--ba-gold)' : 'var(--ba-border)',
                  fontFamily: 'var(--mono)',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.target.style.color = 'var(--ba-gold-dim)'}
                onMouseLeave={e => e.target.style.color = showHostEdit ? 'var(--ba-gold)' : 'var(--ba-border)'}
              >
                {showHostEdit ? '[ COLLAPSE ]' : '[ MODIFY ]'}
              </button>
            </div>

            {/* Collapsed: show current host as read-only hint */}
            {!showHostEdit && (
              <div style={{
                marginTop: '5px', fontSize: '10px', letterSpacing: '1px',
                color: 'var(--ba-border)', fontFamily: 'var(--mono)',
              }}>
                {host}
              </div>
            )}

            {/* Expanded: editable input */}
            {showHostEdit && (
              <div style={{ marginTop: '7px' }}>
                <input
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.75)',
                    border: '1px solid var(--ba-gold-dim)',
                    color: 'var(--ba-gold)', padding: '10px', fontFamily: 'var(--mono)',
                    fontSize: '13px', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  value={host}
                  onChange={e => {
                    setHost(e.target.value);
                    localStorage.setItem('COGITATOR_UPLINK_HOST', e.target.value);
                  }}
                  onKeyDown={e => e.key === 'Enter' && !isAuthenticating && handleAuth()}
                  placeholder="IP:PORT or hostname.ts.net"
                  autoComplete="off"
                  spellCheck="false"
                  disabled={isAuthenticating}
                  onFocus={e  => e.target.style.borderColor = 'var(--ba-gold)'}
                  onBlur={e   => e.target.style.borderColor = 'var(--ba-gold-dim)'}
                />
                <div style={{ marginTop: '5px', fontSize: '9px', color: 'var(--ba-border)', letterSpacing: '1px' }}>
                  // ts.net hostnames auto-switch to HTTPS
                </div>
              </div>
            )}
          </div>
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

          {/* Authenticate button */}
          <button
            onClick={handleAuth}
            disabled={isAuthenticating}
            style={{
              background:    'rgba(120,5,5,0.2)',
              border:        '1px solid var(--ba-crimson)',
              color:         '#fff',
              padding:       '12px',
              fontFamily:    'var(--mono)',
              fontSize:      '12px',
              letterSpacing: '3px',
              cursor:        isAuthenticating ? 'wait' : 'pointer',
              transition:    'all 0.2s',
              fontWeight:    'bold',
              opacity:       isAuthenticating ? 0.5 : 1,
              textShadow:    '0 0 8px rgba(204,34,0,0.5)',
            }}
            onMouseEnter={e => { if (!isAuthenticating) { e.target.style.background = 'rgba(204,34,0,0.35)'; e.target.style.boxShadow = '0 0 14px rgba(204,34,0,0.4)'; }}}
            onMouseLeave={e => { e.target.style.background = 'rgba(120,5,5,0.2)'; e.target.style.boxShadow = 'none'; }}
          >
            [ AUTHENTICATE ]
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          PHASE: PROMPT
          Auth succeeded — operator is known — invoke the machine
          ════════════════════════════════════════════════════════ */}
      {phase === 'prompt' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', zIndex: 5 }}>

          {/* Operator identity confirmed */}
          <div style={{
            fontSize: '11px', letterSpacing: '4px',
            color: 'var(--ba-gold-dim)', textShadow: '0 0 8px rgba(184,146,62,0.4)',
          }}>
            OPERATOR CONFIRMED ·{' '}
            <span style={{ color: 'var(--ba-gold)', textShadow: '0 0 12px rgba(201,168,76,0.6)' }}>
              {username.toUpperCase()}
            </span>
            {isOffline && (
              <span style={{ color: 'var(--amber)', marginLeft: '12px' }}>· OFFLINE MODE</span>
            )}
          </div>

          {/* Initiate button */}
          <div
            onClick={() => setPhase('terminal')}
            style={{
              fontSize: '20px', letterSpacing: '6px', cursor: 'pointer',
              padding: '28px 55px',
              border: '1px solid var(--ba-crimson)',
              background: 'rgba(8,1,1,0.97)',
              color: 'var(--ba-gold)',
              zIndex: 5,
              boxShadow: '0 0 30px rgba(0,0,0,1), 0 0 20px rgba(139,0,0,0.2)',
              textTransform: 'uppercase',
              position: 'relative',
              fontFamily: 'var(--mono)',
              fontWeight: 'bold',
              textShadow: '0 0 14px rgba(201,168,76,0.5)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 0 40px rgba(0,0,0,1), 0 0 30px rgba(204,34,0,0.35)';
              e.currentTarget.style.borderColor = 'var(--ba-gold)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0,0,0,1), 0 0 20px rgba(139,0,0,0.2)';
              e.currentTarget.style.borderColor = 'var(--ba-crimson)';
            }}
          >
            <Corner pos="top-left"     />
            <Corner pos="top-right"    />
            <Corner pos="bottom-left"  />
            <Corner pos="bottom-right" />
            INITIATE ANALYTICAL ENUMERATION
          </div>

          <div style={{ fontSize: '10px', color: 'var(--ba-border)', letterSpacing: '3px' }}>
            ◈ IX · LEGIO · CODEX TRIBUTORUM ◈
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          PHASE: TERMINAL
          Boot sequence typewriter
          ════════════════════════════════════════════════════════ */}
      {phase === 'terminal' && (
        <div style={{
          width: '85%', maxWidth: '900px', height: '500px',
          position: 'relative', overflow: 'hidden',
          background: 'rgba(4,1,1,0.98)',
          border: '1px solid var(--ba-border)',
          boxShadow: '0 0 60px rgba(0,0,0,1), inset 0 0 40px rgba(0,0,0,1)',
          zIndex: 5, marginBottom: '30px',
        }}>
          {/* Gold top rule */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, var(--ba-gold-dim), var(--ba-gold), var(--ba-gold-dim), transparent)',
          }} />

          {/* Background image */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: -1,
            backgroundImage: 'url(the-emperor-protects-1.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            opacity: 0.12,
            filter: 'grayscale(100%) sepia(80%) hue-rotate(330deg) brightness(0.35) contrast(1.4)',
          }} />

          <div
            ref={terminalRef}
            style={{
              width: '100%', height: '100%', padding: '35px',
              display: 'flex', flexDirection: 'column',
              fontSize: '14px', textAlign: 'left', overflowY: 'auto',
            }}
          >
            {/* Terminal header bar */}
            <div style={{
              borderBottom: '1px solid var(--ba-border-lo)', paddingBottom: '12px',
              marginBottom: '25px', fontSize: '11px',
              letterSpacing: '3px', textTransform: 'uppercase',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ color: 'var(--ba-gold-mute)' }}>
                // COGITATOR_UNIT: ANVILUS-PATTERN // UPLINK:{' '}
                {isOffline
                  ? <span style={{ color: 'var(--amber)' }}>LOCAL CACHE</span>
                  : <span style={{ color: 'var(--border-hi)' }}>ACTIVE</span>
                }
              </span>
              <span style={{ color: 'var(--ba-gold)' }}>OPERATOR: {username.toUpperCase()}</span>
            </div>

            {/* Completed lines */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {completedLines.map((line, idx) => (
                <div key={idx} style={{ color: line?.color || 'var(--text-m)', lineHeight: '1.6' }}>
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
                    display: 'inline-block', width: '10px', height: '16px',
                    background: 'var(--ba-gold)', marginLeft: '3px',
                    boxShadow: '0 0 8px rgba(201,168,76,0.7)',
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes cogRotation {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default BootScreen;