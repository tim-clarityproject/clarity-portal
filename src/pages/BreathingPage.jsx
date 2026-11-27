import './toolFocus/breathe.css';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  BREATHE_EXERCISES, BREATHE_LENGTHS, DEFAULT_BREATHE_LENGTH, MIN_SESSION_SECONDS,
  aboutMinutes, breathedFor, loadBreathingPreference, offeredSounds, saveBreathingSession, soundSrc,
} from '../lib/breathing';
import { refreshPins, setPreference, usePreferences } from '../lib/menuPins';
import { BreathOrb, BreathWords, Button, Dropdown, SegmentedControl, useOrbStyle, useToast } from '../components/design';
import { ORB_LABEL } from '../lib/breathOrb';
import { useFocusMode } from '../components/design/Frame';

// Breathe in the 25 Nov style (Tim, 26 Nov, decisions part 12; NEXT-BREATHE-TOOLS.md points 1 to 9; the approved tools
// mock-up). A tool in focus mode, like every tool: the thin × at the top left closes it (a session is kept first), no
// menu, one 640px column. Three screens:
//   choose    "Which breathing do you want?": the three exercises as answer boxes, then How long? (1, 3 or 5 min),
//             Orb (Rings or Level) and Sound (shown once a sound has a file; breathing.js), and Start breathing.
//   breathe   the orb (280px, 240px on a phone) with its words beside it on a laptop and under it on a phone, and
//             Finish breathing. It ends by itself after the chosen length.
//   done      "That's 3 minutes of breathing." with where it counts, Done and Breathe again.
// Each choice is remembered on the account (person_settings.page_preferences, through the offline queue, this device's
// copy first: menuPins.js), as the orb's style already was (orb_style, useOrbStyle). The exercise was kept in
// profiles.breathing_settings before; that is read once when the account has no choice here yet.
// The session is saved exactly as before (saveBreathingSession, at least 10 seconds), so it counts towards the week.

const TECHNIQUE_KEY = 'breathe_technique';
const LENGTH_KEY = 'breathe_length';
const SOUND_KEY = 'breathe_sound';
const isTechnique = (v) => BREATHE_EXERCISES.some((e) => e.value === v);

// The person's choices: the account's copy on this device first, a tap shown at once.
function useBreatheChoices(userId) {
  const prefs = usePreferences(userId);
  const [tapped, setTapped] = useState({});
  const [legacy, setLegacy] = useState(null);
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]);
  const saved = prefs?.[TECHNIQUE_KEY];
  // The exercise chosen before this round (profiles.breathing_settings), only while nothing is saved here.
  useEffect(() => {
    if (!userId || isTechnique(saved)) return undefined;
    let live = true;
    loadBreathingPreference(userId).then((t) => { if (live && isTechnique(t)) setLegacy(t); });
    return () => { live = false; };
  }, [userId, saved]);
  const pick = (key, ok, fallback) => {
    if (key in tapped && ok(tapped[key])) return tapped[key];
    if (ok(prefs?.[key])) return prefs[key];
    return fallback;
  };
  const technique = pick(TECHNIQUE_KEY, isTechnique, isTechnique(legacy) ? legacy : 'sigh');
  const length = pick(LENGTH_KEY, (v) => BREATHE_LENGTHS.includes(v), DEFAULT_BREATHE_LENGTH);
  const sound = pick(SOUND_KEY, (v) => offeredSounds().some((s) => s.value === v), 'off');
  const choose = useCallback((key, value) => {
    setTapped((t) => ({ ...t, [key]: value }));
    if (userId) setPreference(userId, key, value).catch(() => null); // kept on this device either way
  }, [userId]);
  return {
    technique, length, sound,
    setTechnique: (v) => choose(TECHNIQUE_KEY, v),
    setLength: (v) => choose(LENGTH_KEY, v),
    setSound: (v) => choose(SOUND_KEY, v),
  };
}

// The page fills the frame's height, so a session's orb sits in the middle and its button at the foot.
function useFillHeight(ref, key) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const main = el.closest('.ds-frame-main');
      const frame = el.closest('.ds-frame');
      const top = el.getBoundingClientRect().top + window.scrollY;
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const fs = frame ? getComputedStyle(frame) : null;
      const below = fs ? (parseFloat(fs.marginBottom) || 0) + (parseFloat(fs.borderBottomWidth) || 0) : 0;
      el.style.setProperty('--bt-fill', `${Math.max(0, window.innerHeight - top - pad - below)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    // The frame's foot changes once focus mode and the Breathe button settle: measured again then.
    const main = el.closest('.ds-frame-main');
    const watch = typeof ResizeObserver === 'function' && main ? new ResizeObserver(fit) : null;
    watch?.observe(main, { box: 'border-box' });
    return () => { window.removeEventListener('resize', fit); watch?.disconnect(); };
  }, [ref, key]);
}

// A sound under the breathing, looped, only while a session runs and only when it has a file.
function useSound(src, on) {
  useEffect(() => {
    if (!on || !src || typeof Audio === 'undefined') return undefined;
    const audio = new Audio(src);
    audio.loop = true;
    audio.play().catch(() => null);
    return () => { audio.pause(); };
  }, [src, on]);
}

function TopBar({ onClose, right = null }) {
  return (
    <div className="bt-top">
      <button type="button" className="ds-tool-x" aria-label="Close and save my place" title="Close" onClick={onClose}>
        <span className="ds-x" aria-hidden="true" />
      </button>
      {right}
    </div>
  );
}

// The three exercises as answer boxes (one answer, arrow keys move it).
function Exercises({ value, onChange, labelledBy }) {
  const refs = useRef([]);
  const at = Math.max(0, BREATHE_EXERCISES.findIndex((e) => e.value === value));
  const move = (i) => {
    const n = (i + BREATHE_EXERCISES.length) % BREATHE_EXERCISES.length;
    onChange(BREATHE_EXERCISES[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className="bt-ans" role="radiogroup" aria-labelledby={labelledBy}>
      {BREATHE_EXERCISES.map((e, i) => (
        <button
          key={e.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={e.value === value}
          tabIndex={i === at ? 0 : -1}
          className="ds-bt-ans"
          onClick={() => onChange(e.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') { ev.preventDefault(); move(i + 1); }
            if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') { ev.preventDefault(); move(i - 1); }
          }}
        >
          <span className="bt-ans-name">{e.label}</span>
          <span className="bt-ans-line">{e.line}</span>
        </button>
      ))}
    </div>
  );
}

export default function BreathingPage() {
  useFocusMode(true);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const userId = user?.id || null;
  const { technique, length, sound, setTechnique, setLength, setSound } = useBreatheChoices(userId);
  const [orbStyle, setOrbStyle] = useOrbStyle();
  const [screen, setScreen] = useState('choose');
  const [session, setSession] = useState(null); // { startedAt (performance.now), wall (Date.now), technique }
  const [breathed, setBreathed] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const pageRef = useRef(null);
  const headingRef = useRef(null);
  const ending = useRef(false);
  useFillHeight(pageRef, screen);
  useSound(soundSrc(sound), screen === 'breathe');

  // Each new screen puts focus on its heading, as a tool's steps do.
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0); }, [screen]);

  const leave = useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/welcome');
  }, [navigate]);

  const start = () => {
    ending.current = false;
    setSession({ startedAt: performance.now(), wall: Date.now(), technique });
    setSaveState('idle');
    setScreen('breathe');
  };

  // Ends the session and saves it as before (10 seconds or more counts). `andLeave`: × during a session.
  const finish = useCallback(async (andLeave = false) => {
    if (!session || ending.current) return;
    ending.current = true;
    const seconds = Math.round((Date.now() - session.wall) / 1000);
    if (seconds < MIN_SESSION_SECONDS) {
      toast.show('Session ended. Sessions under 10 seconds are not saved.');
      setSession(null);
      if (andLeave) leave(); else setScreen('choose');
      return;
    }
    setBreathed(seconds);
    setSaveState('saving');
    if (andLeave) leave(); else setScreen('done');
    if (!userId) return;
    try {
      await saveBreathingSession(userId, session.technique, seconds);
      setSaveState('saved');
      if (andLeave) toast.show('Session saved.');
    } catch (error) {
      console.error('[BreathingPage] session save failed:', error);
      setSaveState('failed');
      toast.error('This session didn’t save. Check your connection and try again.');
    }
  }, [session, toast, leave, userId]);

  // It ends by itself after the chosen length; Escape ends it early, as Finish breathing does.
  useEffect(() => {
    if (screen !== 'breathe' || !session) return undefined;
    const t = setTimeout(() => finish(false), length * 60 * 1000 - (Date.now() - session.wall));
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [screen, session, length, finish]);

  const sounds = offeredSounds();
  const exercise = BREATHE_EXERCISES.find((e) => e.value === (session?.technique || technique)) || BREATHE_EXERCISES[0];

  if (screen === 'breathe' && session) {
    return (
      <div className="ui-root bt-page bt-page--breathe" ref={pageRef} data-breathe="breathe">
        <TopBar onClose={() => finish(true)} />
        <div className="bt-body ds-bsession">
          <h1 className="ds-sr" ref={headingRef} tabIndex={-1}>{exercise.label}</h1>
          <div className="ds-bsession-stage">
            <div className="ds-bstage">
              <BreathOrb style={orbStyle} pattern={session.technique} startedAt={session.startedAt} size="tool" label={ORB_LABEL} />
              <BreathWords pattern={session.technique} startedAt={session.startedAt} name={exercise.label} />
            </div>
          </div>
          <div className="ds-bsession-foot">
            <Button variant="outline" onClick={() => finish(false)}>Finish breathing</Button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    return (
      <div className="ui-root bt-page bt-page--done" ref={pageRef} data-breathe="done">
        <TopBar onClose={leave} />
        <div className="bt-body">
          <div className="bt-done">
            <h1 className="ds-bt-done-title" ref={headingRef} tabIndex={-1}>{`That’s ${breathedFor(breathed)} of breathing.`}</h1>
            <p className="bt-done-line">
              {saveState === 'failed' ? 'It didn’t save, so it won’t count this week.' : 'It counts towards your breathing this week.'}
            </p>
          </div>
          <div className="bt-foot">
            <Button variant="primary" onClick={leave}>Done</Button>
            <button type="button" className="ds-bt-link" onClick={start}>Breathe again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-root bt-page bt-page--choose" ref={pageRef} data-breathe="choose">
      <TopBar onClose={leave} />
      <div className="bt-body">
        <div className="bt-label">Breathe</div>
        <h1 className="ds-q bt-q" id="bt-q" ref={headingRef} tabIndex={-1}>Which breathing do you want?</h1>
        <Exercises value={technique} onChange={setTechnique} labelledBy="bt-q" />
        <div className="bt-rows">
          <div className="bt-row">
            <span className="bt-row-name" id="bt-len">How long?</span>
            <SegmentedControl
              label="How long?"
              options={BREATHE_LENGTHS.map((m) => ({ value: m, label: `${m} min` }))}
              value={length}
              onChange={setLength}
            />
          </div>
          <div className="bt-row">
            <span className="bt-row-name">Orb</span>
            <SegmentedControl
              label="Orb"
              options={[{ value: 'rings', label: 'Rings' }, { value: 'level', label: 'Level' }]}
              value={orbStyle}
              onChange={setOrbStyle}
            />
          </div>
          {/* Sound: shown once a sound has a file (none has yet; breathing.js BREATHE_SOUNDS). */}
          {sounds.length > 1 && (
            <div className="bt-row">
              <span className="bt-row-name">Sound</span>
              <Dropdown label="Sound" options={sounds.map((s) => ({ value: s.value, label: s.label }))} value={sound} onChange={setSound} className="ds-dd--row bt-sound" />
            </div>
          )}
        </div>
        <div className="bt-foot bt-foot--start">
          <Button variant="primary" onClick={start}>Start breathing</Button>
          <span className="bt-foot-note">{aboutMinutes(length)}</span>
        </div>
      </div>
    </div>
  );
}
