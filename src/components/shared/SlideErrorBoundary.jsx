import React from 'react';

// ─────────────────────────────────────────────────────────────
// SlideErrorBoundary
// Catches render-time exceptions thrown by a single slide so one
// blown component doesn't black-screen the whole app. Shows a
// themed fault panel with a retry button and the error message.
//
// Auto-clears the error if the surrounding slideName changes (the
// user navigates away) — so a broken slide doesn't stay broken
// looking once they move on.
// ─────────────────────────────────────────────────────────────

class SlideErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log so it shows up in browser console + remote error tracking
    // if you wire one in later.
    // eslint-disable-next-line no-console
    console.error(`◈ SLIDE FAULT [${this.props.slideName}]`, error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.slideName !== this.props.slideName && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error?.message || String(this.state.error);
    const slideLabel = (this.props.slideName || 'UNKNOWN').toUpperCase();

    return (
      <>
        <style>{`
          .slide-fault {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 18px;
            padding: 32px;
            background: rgba(20, 0, 0, 0.45);
            border: 1px dashed #cc2200;
            color: #c9a84c;
            font-family: var(--mono, "Courier New", monospace);
          }
          .slide-fault__title {
            color: #ff4422;
            font-size: 13px;
            letter-spacing: 6px;
            text-shadow: 0 0 12px rgba(204, 34, 0, 0.6);
            text-transform: uppercase;
          }
          .slide-fault__sub {
            color: #b8923e;
            font-size: 10px;
            letter-spacing: 3px;
            opacity: 0.85;
          }
          .slide-fault__msg {
            color: #ffb070;
            font-size: 11px;
            max-width: 720px;
            text-align: center;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid #6a1a00;
            padding: 10px 14px;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .slide-fault__btn {
            background: rgba(204, 34, 0, 0.18);
            color: #fff;
            border: 1px solid #cc2200;
            font-family: inherit;
            font-size: 11px;
            letter-spacing: 3px;
            padding: 8px 18px;
            cursor: pointer;
            text-transform: uppercase;
            transition: background .15s ease, box-shadow .15s ease;
          }
          .slide-fault__btn:hover {
            background: rgba(204, 34, 0, 0.4);
            box-shadow: 0 0 18px rgba(204, 34, 0, 0.6);
          }
        `}</style>
        <div className="slide-fault" role="alert">
          <div className="slide-fault__title">✠ SLIDE FAULT [{slideLabel}]</div>
          <div className="slide-fault__sub">// COGITATOR EXCEPTION CAUGHT — DIAGNOSTICS RECOVERED</div>
          <div className="slide-fault__msg">{msg}</div>
          <button type="button" className="slide-fault__btn" onClick={this.reset}>
            [ ATTEMPT RECONSECRATION ]
          </button>
          <div style={{ fontSize: 9, color: '#7a2010', letterSpacing: 2 }}>
            OTHER SLIDES REMAIN OPERATIONAL — NAVIGATE TO CONTINUE
          </div>
        </div>
      </>
    );
  }
}

export default SlideErrorBoundary;
