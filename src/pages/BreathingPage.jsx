import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  TECHNIQUES, TECHNIQUE_ORDER, GUIDANCE, MIN_SESSION_SECONDS,
  loadBreathingPreference, saveBreathingPreference, saveBreathingSession,
  loadLatestBreathingSession, formatSessionLength,
} from '../lib/breathing';
import DesignHeader from '../components/DesignHeader';
import BreathingVisual, { useBreathingPhase } from '../components/ui/BreathingVisual';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function useShapeSize() {
  const [size, setSize] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 170 : 150));
  useEffect(() => {
    const onResize = () => setSize(window.innerWidth <= 768 ? 170 : 150);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// Fixed bottom bar on BOTH desktop and phone (unlike PhoneActionBar,
// which is phone-only) - spec section 9: Start breathing must always
// be visible, including on a ~700px-tall desktop window.
function StartBar({ children }) {
  const barRef = useRef(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => {
      document.documentElement.style.setProperty('--breathe-bar-height', `${el.getBoundingClientRect().height}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={barRef} className="breathe-start-bar">
      {children}
    </div>
  );
}

export default function BreathingPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [technique, setTechnique] = useState('sigh');
  const [isLoading, setIsLoading] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [lastSession, setLastSession] = useState(null);
  const [sessionCount, setSessionCount] = useState(null);
  const sessionStartRef = useRef(null);
  const shapeSize = useShapeSize();
  const { message, showToast } = useToast();
  const { phaseLabel, countdown, elapsedSeconds, color: phaseColor } = useBreathingPhase(technique, sessionActive);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setIsLoading(false); return; }
      const pref = await loadBreathingPreference(user.id);
      if (!cancelled) setTechnique(pref);
      try {
        const latest = await loadLatestBreathingSession(user.id);
        if (!cancelled) setLastSession(latest);
      } catch (error) {
        console.error('[BreathingPage] latest session lookup failed:', error);
      }
      try {
        const { count } = await supabase
          .from('breathing_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (!cancelled) setSessionCount(count || 0);
      } catch (error) {
        console.error('[BreathingPage] session count failed:', error);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSwitchTechnique = (key) => {
    setTechnique(key);
    if (user) saveBreathingPreference(user.id, key);
  };

  const handleStart = () => {
    sessionStartRef.current = Date.now();
    setSessionActive(true);
  };

  const handleDone = async () => {
    setSessionActive(false);
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (!user) return;
    if (durationSeconds < MIN_SESSION_SECONDS) {
      showToast('Session ended. Sessions under 10 seconds are not saved.');
      return;
    }
    try {
      await saveBreathingSession(user.id, technique, durationSeconds);
      setLastSession({ breathing_mode: technique, duration: durationSeconds });
      setSessionCount((c) => (c === null ? null : c + 1));
      showToast('Session saved.');
    } catch (error) {
      console.error('[BreathingPage] session save failed:', error);
      showToast('Could not save this session - please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  const guidance = GUIDANCE[technique];

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page breathe-page">
        <div className="plan-header">
          <span className="plan-overline">Ground</span>
          <div className="ui-title">Breathe</div>
          <p className="ui-subtitle">Choose a technique, then settle in and begin.</p>
        </div>

        <div className="breathe-shape-wrap">
          <BreathingVisual technique={technique} active={sessionActive} size={shapeSize} />
        </div>

        {sessionActive && (
          <div className="breathe-session-info">
            <div className="breathe-phase" aria-live="polite" style={{ color: phaseColor }}>{phaseLabel}</div>
            <div className="breathe-count">{countdown}</div>
            <div className="breathe-timer">{Math.floor(elapsedSeconds / 60)}:{pad2(elapsedSeconds % 60)}</div>
          </div>
        )}

        <div className="breathe-technique-select" role="group" aria-label="Breathing technique">
          {TECHNIQUE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`breathe-technique-option breathe-button${technique === key ? ' active' : ''}`}
              aria-pressed={technique === key}
              onClick={() => handleSwitchTechnique(key)}
            >
              {TECHNIQUES[key].label}
            </button>
          ))}
        </div>

        <div className="breathe-guidance">
          {guidance.map((g) => (
            <div className="breathe-guidance-col" key={g.label}>
              <span className="breathe-guidance-label">{g.label}</span>
              <span className="breathe-guidance-rule" aria-hidden="true" />
              <p className="breathe-guidance-text">{g.text}</p>
            </div>
          ))}
        </div>

        <div className="breathe-meta-row">
          <span className="breathe-meta-item">
            {lastSession ? `Last session: ${TECHNIQUES[lastSession.breathing_mode]?.label || lastSession.breathing_mode}, ${formatSessionLength(lastSession.duration) || '—'}` : 'No sessions yet'}
          </span>
          <button type="button" className="breathe-meta-item breathe-meta-link" onClick={() => navigate('/breathing-sessions-summary')}>
            Breathing Sessions{sessionCount !== null ? ` · ${sessionCount}` : ''}
          </button>
        </div>
      </div>

      <StartBar>
        {sessionActive ? (
          <button type="button" className="ui-btn-primary" onClick={handleDone}>Done</button>
        ) : (
          <button type="button" className="ui-btn-primary" onClick={handleStart}>Start breathing</button>
        )}
      </StartBar>
      <Toast message={message} />
    </div>
  );
}
