import { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AuthContext } from '../context/AuthContext';
import {
  TECHNIQUES, TECHNIQUE_ORDER, MIN_SESSION_SECONDS,
  loadBreathingPreference, saveBreathingPreference, saveBreathingSession,
} from '../lib/breathing';
import BreathingVisual from './ui/BreathingVisual';

// Quick-open breathing pop-up (prompt 11) - replaces BreathingGuide.jsx.
// Shared by the floating Breathe button and the Home "Need a moment?"
// panel. The shell (scrim/card, mount/unmount animation) is driven only
// by `isOpen` - switching technique or starting/finishing a session
// inside never remounts or re-animates it (spec section 10).
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
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
          position: fixed; top: 50%; left: 50%; width: 100%; max-width: 360px;
          box-sizing: border-box; background: var(--surface); border: 1px solid var(--line);
          border-radius: var(--radius-card); padding: var(--space-5); z-index: 5102;
          opacity: ${isOpen ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${isOpen ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
          display: flex; flex-direction: column; align-items: center; text-align: center;
        }
        .bqo-close {
          all: unset; cursor: pointer; position: absolute; top: var(--space-3); right: var(--space-3);
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
          color: var(--text-2); font-size: 20px; border-radius: 50%;
        }
        .bqo-close:hover, .bqo-close:focus-visible { color: var(--text); }
        .bqo-select { display: flex; gap: var(--space-2); margin: var(--space-4) 0; flex-wrap: wrap; justify-content: center; }
        .ui-root .bqo-pill {
          all: unset; cursor: pointer; box-sizing: border-box; min-height: 36px;
          padding: 0 var(--space-3) !important; border: 1px solid var(--line); border-radius: var(--radius-pill);
          font-size: var(--fs-small); color: var(--coral-text);
          transition: border-color var(--dur-fast) var(--ease);
        }
        .ui-root .bqo-pill[aria-pressed="true"] { border-color: var(--coral); }
        .bqo-actions { display: flex; gap: var(--space-3); width: 100%; margin-top: var(--space-4); }
        .bqo-actions .ui-btn-primary, .bqo-actions .ui-btn-ghost { flex: 1; }
        .bqo-links { display: flex; gap: var(--space-4); margin-top: var(--space-4); }
      `}</style>

      <div className="bqo-scrim" onClick={handleClose} aria-hidden="true" />

      <div ref={dialogRef} className="bqo-card" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className="bqo-close" onClick={handleClose} aria-label="Close">×</button>
        <h2 id={titleId} className="plan-overline" style={{ marginBottom: 'var(--space-4)' }}>{TECHNIQUES[technique].label}</h2>

        <BreathingVisual technique={technique} active={sessionActive} size={150} />

        <div className="bqo-select" role="group" aria-label="Breathing technique">
          {TECHNIQUE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="bqo-pill"
              aria-pressed={technique === key}
              onClick={() => handleSwitchTechnique(key)}
            >
              {TECHNIQUES[key].label}
            </button>
          ))}
        </div>

        <div className="bqo-actions">
          {sessionActive ? (
            <button type="button" className="ui-btn-primary" onClick={finishSession}>Done</button>
          ) : (
            <button type="button" className="ui-btn-primary" onClick={handleStart}>Start breathing</button>
          )}
        </div>

        <div className="bqo-links">
          <button type="button" className="plan-link-btn" onClick={() => goTo('/breathe')}>All breathing tools</button>
          <button type="button" className="plan-link-btn" onClick={() => goTo('/breathing-sessions-summary')}>Breathing Sessions</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
