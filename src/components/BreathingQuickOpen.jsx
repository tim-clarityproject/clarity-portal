import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AuthContext } from '../context/AuthContext';
import {
  TECHNIQUES, TECHNIQUE_ORDER, MIN_SESSION_SECONDS,
  loadBreathingPreference, saveBreathingPreference, saveBreathingSession,
} from '../lib/breathing';
import BreathingVisual, { useBreathingPhase, useDialSize } from './ui/BreathingVisual';

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Quick-open breathing pop-up (prompt 11, redesigned patch 3B area E) -
// replaces BreathingGuide.jsx. Shared by the floating Breathe button
// and the Home "Need a moment?" panel. The shell (scrim/card, mount/
// unmount animation) is driven only by `isOpen` - switching technique
// or starting/finishing a session inside never remounts or re-animates
// it, so there is no flash either way (spec section 10).
export default function BreathingQuickOpen({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [shouldRender, setShouldRender] = useState(false);
  const [technique, setTechnique] = useState('sigh');
  const [sessionActive, setSessionActive] = useState(false);
  const sessionStartRef = useRef(null);
  const dialogRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = 'breathing-quick-open-title';
  const { phaseLabel, countdown, elapsedSeconds, color: phaseColor } = useBreathingPhase(technique, sessionActive);

  const sessionHostRef = useRef(null);
  const sessionStackRef = useRef(null);
  const dialSize = useDialSize(sessionHostRef, sessionStackRef, 64, sessionActive);

  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      previousFocusRef.current = document.activeElement;
      setShouldRender(true);
      if (user) loadBreathingPreference(user.id).then(setTechnique);
    } else if (shouldRender) {
      closeTimeoutRef.current = setTimeout(() => setShouldRender(false), 260);
    }
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && shouldRender && dialogRef.current) {
      const focusable = dialogRef.current.querySelector('button, [href], [tabindex]:not([tabindex="-1"])');
      (focusable || dialogRef.current).focus();
    } else if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen, shouldRender]);

  const finishSession = async () => {
    if (!sessionActive || !user) {
      setSessionActive(false);
      return;
    }
    setSessionActive(false);
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (durationSeconds >= MIN_SESSION_SECONDS) {
      try {
        await saveBreathingSession(user.id, technique, durationSeconds);
      } catch (error) {
        console.error('[BreathingQuickOpen] session save failed:', error);
      }
    }
  };

  const handleClose = () => {
    finishSession();
    onClose();
  };

  // Escape ends a running session and returns to the technique screen
  // (mock-up's own el._esc: if(st.stop)done();else close()) - it only
  // closes the whole pop-up when no session is running.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sessionActive) finishSession(); else handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionActive, technique]);

  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = original; };
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const handleSwitchTechnique = (key) => {
    setTechnique(key);
    if (user) saveBreathingPreference(user.id, key);
  };

  const handleStart = () => {
    sessionStartRef.current = Date.now();
    setSessionActive(true);
  };

  // A click on the scrim never interrupts a running session (mock-up
  // only wires this handler in its idle markup, not its run markup).
  const handleScrimClick = () => {
    if (!sessionActive) handleClose();
  };

  const goTo = (path) => {
    finishSession();
    onClose();
    navigate(path);
  };

  return createPortal(
    <div className="ui-root">
      <style>{`
        .bqo-scrim {
          position: fixed; inset: 0; background: var(--scrim); z-index: 5101;
          opacity: ${isOpen ? 1 : 0}; transition: opacity var(--dur) var(--ease);
        }
        .bqo-card {
          position: fixed; top: 50%; left: 50%; width: 100%; max-width: 440px;
          box-sizing: border-box; background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius-card); z-index: 5102;
          opacity: ${isOpen ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${isOpen ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
        }
        .bqo-card.idle {
          padding: var(--space-5); max-height: calc(100vh - var(--space-5) * 2); overflow-y: auto;
          display: flex; flex-direction: column; align-items: center; text-align: center;
        }
        .bqo-card.running {
          padding: 0; height: 600px; max-height: calc(100vh - 16px); overflow: hidden;
        }
        @media (max-width: 768px) {
          .bqo-card.running { height: 560px; }
        }
        .bqo-close {
          all: unset; cursor: pointer; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2); font-size: 20px; border-radius: 50%; flex: none;
        }
        .bqo-close:hover, .bqo-close:focus-visible { color: var(--text); }
        .bqo-header { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: var(--space-3); }
        .bqo-header h2 { margin: 0; }
        .bqo-intro { font-size: var(--fs-small); color: var(--text-2); margin: 0 0 var(--space-3); }
        .bqo-select { margin: 0 0 var(--space-3); width: 100%; }
        .bqo-links { display: flex; justify-content: space-between; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; width: 100%; }
        .bqo-run-header {
          position: absolute; left: var(--space-4); right: var(--space-3); top: var(--space-3);
          display: flex; justify-content: space-between; align-items: center; z-index: 2;
        }
        .bqo-run-header h3 { margin: 0; }
        .bqo-session-host { position: absolute; inset: 0; }
      `}</style>

      <div className="bqo-scrim" onClick={handleScrimClick} aria-hidden="true" />

      <div
        ref={dialogRef}
        className={`bqo-card ${sessionActive ? 'running' : 'idle'}`}
        role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      >
        {!sessionActive ? (
          <>
            <div className="bqo-header">
              <h2 id={titleId} className="plan-overline">Take a breath</h2>
              <button type="button" className="bqo-close" onClick={handleClose} aria-label="Close">×</button>
            </div>
            <p className="bqo-intro">Pick a technique and breathe for as long as you need.</p>

            <BreathingVisual technique={technique} active={false} size={120} />

            <div className="breathe-technique-select bqo-select" role="group" aria-label="Breathing technique">
              {TECHNIQUE_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`breathe-technique-option${technique === key ? ' active' : ''}`}
                  aria-pressed={technique === key}
                  onClick={() => handleSwitchTechnique(key)}
                >
                  {TECHNIQUES[key].label}
                </button>
              ))}
            </div>

            <button type="button" className="ui-btn-primary" style={{ width: '100%' }} onClick={handleStart}>Start breathing</button>

            <div className="bqo-links">
              <button type="button" className="plan-link-btn" onClick={() => goTo('/breathe')}>All breathing tools</button>
              <button type="button" className="plan-link-btn" onClick={() => goTo('/breathing-sessions-summary')}>Breathing Sessions</button>
            </div>
          </>
        ) : (
          <>
            <div ref={sessionHostRef} className="bqo-session-host">
              <div className="breathe-session-fg">
                <div className="breathe-session-field" style={{ width: dialSize, height: dialSize }}>
                  <BreathingVisual technique={technique} active size={dialSize} />
                </div>
                <div ref={sessionStackRef} className="breathe-session-info">
                  <div className="breathe-phase" aria-live="polite" style={{ color: phaseColor }}>{phaseLabel}</div>
                  <div className="breathe-count">{countdown}</div>
                  <div className="breathe-timer">{Math.floor(elapsedSeconds / 60)}:{pad2(elapsedSeconds % 60)}</div>
                  <button type="button" className="ui-btn-ghost breathe-session-done" onClick={finishSession}>Done</button>
                </div>
              </div>
            </div>
            <div className="bqo-run-header">
              <h3 id={titleId} className="plan-overline">{TECHNIQUES[technique].label}</h3>
              <button type="button" className="bqo-close" onClick={finishSession} aria-label="Close">×</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
