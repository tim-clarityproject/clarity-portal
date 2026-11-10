import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  BreathOrb,
  Button,
  EndScreen,
  GuidedTool,
  IconTextRow,
  InfoWords,
  RowList,
  WhoSees,
  useOrbStyle,
  useToast,
} from '../../components/design';
import { useDraft } from '../../lib/drafts';
import { friendlyError } from '../../lib/friendlyError';
import { WIND_DOWN_BREATHE_SECONDS, WIND_DOWN_THOUGHT_MAX, localToday, windDownNight } from '../../lib/performance';
import { finishWindDown, readWindDown, refreshWindDown, saveWindDownThoughts } from '../../lib/performance/windDownStore';
import './performance.css';

// Sleep wind down (mock-up M19, approved by Tim on 29 Oct; read in full
// with its notes, and breathe-orb.html). A tool in Reset, offered on Home
// from 21:00 (home.js). Three screens in the shared guided tool:
//   Tomorrow   "What’s on your mind for tomorrow?" one row per thought
//              (lists are rows), 300 characters each and no limit on how
//              many; Skip goes straight to the breathing
//   Breathe    the orb only, in the person's own style (Rings or Level),
//              4 seconds in and 6 out for 5 minutes, no words; it ends by
//              itself, or with End early
//   Sleep well three lines and Back to Home, nothing to act on (brief:
//              the last screen before sleep reassures in words only)
// The breathing and Sleep well use the night colours (the mode's own, one
// step quieter). The sound under the breathing is left out until there
// are real audio files: WIND_DOWN_SOUNDS is empty, so no button shows, and
// the choice is off until chosen and never plays by itself.
//
// The thoughts save as they are typed (Saving, then Saved), kept as a
// draft too, for the night they belong to: a wind-down before 04:00 is
// the night before. They are kept on this device and, once migration 039
// has run, in wind_down_nights (windDownStore.js is the one place that
// reads and writes them), and tomorrow's Daily plan lists them under
// Carried over.

const SAVE_AFTER_MS = 600;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

export default function SleepWindDown() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [orbStyle] = useOrbStyle();
  // The night it is for, read once, so a wind-down carried past midnight stays on its night.
  const [night] = useState(() => windDownNight({ today: localToday(), hour: new Date().getHours() }));
  const [thoughts, setThoughts] = useState(() => {
    const kept = readWindDown(userId, night).thoughts;
    return kept.length ? kept : [''];
  });
  const [save, setSave] = useState('idle');
  const typed = useRef(false);
  const timer = useRef(null);
  const latest = useRef(thoughts);
  useEffect(() => { latest.current = thoughts; }, [thoughts]);

  // Thoughts written for tonight on another device, once 039 has run:
  // shown when nothing has been typed here yet.
  useEffect(() => {
    let live = true;
    refreshWindDown(userId, { night }).then((changed) => {
      if (!live || !changed || typed.current) return;
      const kept = readWindDown(userId, night).thoughts;
      if (kept.length) setThoughts(kept);
    });
    return () => { live = false; };
  }, [userId, night]);

  // Typing survives a refresh ("Draft restored").
  const { clear: clearThoughtsDraft } = useDraft({
    userId,
    name: `wind-down:${night}`,
    value: thoughts,
    ready: true,
    onRestore: (d) => {
      if (!Array.isArray(d)) return;
      typed.current = true;
      setThoughts(d.length ? d.map((t) => (typeof t === 'string' ? t : '')) : ['']);
    },
  });

  const sendNow = async () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (!typed.current) return true;
    setSave('saving');
    try {
      await saveWindDownThoughts(userId, night, latest.current);
      setSave('saved');
      clearThoughtsDraft();
      return true;
    } catch (e) {
      setSave('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  // A moment after each change, the thoughts are saved for the night.
  useEffect(() => {
    if (!typed.current) return undefined;
    setSave('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { sendNow(); }, SAVE_AFTER_MS);
    return undefined;
    // Only when the thoughts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thoughts]);

  // Leaving the page with typing still waiting saves it now.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      saveWindDownThoughts(userId, night, latest.current).catch(() => null);
    }
  }, [userId, night]);

  const change = (rows) => {
    typed.current = true;
    setThoughts(rows);
  };

  const backTo = location.state?.from || '/welcome';
  const close = () => {
    sendNow();
    navigate(backTo, { replace: true });
  };

  const steps = [
    {
      key: 'tomorrow',
      name: 'Tomorrow',
      question: 'What’s on your mind for tomorrow?',
      nudges: ['Write a few quick lines, then let them go.', 'They’ll wait for you in tomorrow’s Daily plan.'],
      skippable: true,
      render: () => (
        <div className="day-narrow">
          <IconTextRow className="ds-wind-who">
            <WhoSees audience="me" />
            <InfoWords title="Why write it down" text="In a sleep study, people who wrote a to-do list for the next day fell asleep faster.">
              Why write it down
            </InfoWords>
          </IconTextRow>
          <RowList
            numbered
            rows={thoughts}
            onChange={change}
            max={Infinity}
            maxLength={WIND_DOWN_THOUGHT_MAX}
            itemLabel={(n) => `Thought ${n}`}
            addLabel="Add a thought"
          />
        </div>
      ),
    },
    {
      key: 'breathe',
      name: 'Breathe',
      plain: true,
      className: 'ds-night',
      render: (tool) => <NightBreathe style={orbStyle} headingRef={tool.headingRef} onEnd={() => tool.go(2)} />,
    },
    {
      key: 'sleep',
      name: 'Sleep well',
      plain: true,
      className: 'ds-night',
      render: (tool) => (
        <SleepWell
          headingRef={tool.headingRef}
          onShown={() => finishWindDown(userId, night)}
          onHome={() => navigate('/welcome', { replace: true })}
        />
      ),
    },
  ];

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name="Sleep wind down"
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        saveState={save}
        onSkip={() => { sendNow(); }}
        onClose={close}
        onFinish={close}
      />
    </div>
  );
}

// The breathing (M19 Breathe, breathe-orb.html night): the orb alone, 4 in
// and 6 out, for 5 minutes, then Sleep well. No phase words, no count.
function NightBreathe({ style, headingRef, onEnd }) {
  const [startedAt] = useState(() => performance.now());
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), WIND_DOWN_BREATHE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  const label = style === 'level'
    ? 'Breathe in for 4 seconds as the level rises, and out for 6 seconds as it falls, for 5 minutes.'
    : 'Breathe in for 4 seconds as the circle grows, and out for 6 seconds as it shrinks, for 5 minutes.';
  return (
    <div className="ds-night-breathe">
      <h2 ref={headingRef} tabIndex={-1} className="ds-sr">Breathe slowly</h2>
      <BreathOrb style={style} pattern="wind" startedAt={startedAt} night size="night" label={label} />
      {/* Room for "Change the sound" (M19): it shows once WIND_DOWN_SOUNDS has audio files. */}
      <Button variant="text" onClick={() => onEndRef.current()}>End early</Button>
    </div>
  );
}

function SleepWell({ headingRef, onShown, onHome }) {
  const shown = useRef(onShown);
  useEffect(() => { shown.current(); }, []);
  return (
    <EndScreen
      kind="night"
      title="Sleep well"
      lines={['Your thoughts are saved for the morning.', 'Your Daily plan will have them ready.']}
      headingRef={headingRef}
      action={<Button variant="outline" onClick={onHome}>Back to Home</Button>}
    />
  );
}
