import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  SLEEP_OWN_LINE,
  SLEEP_TARGET_MAX,
  SLEEP_TARGET_MIN,
  SLEEP_TARGET_STEP,
  stepSleepTarget,
} from '../../lib/performance/sleepChart';
import { friendlyError } from '../../lib/friendlyError';
import { useQueueState } from '../../lib/syncQueue';
import { Button } from './Button';
import { Stepper } from './LoggingRow';
import { SaveStatus } from './Status';
import { useToast } from './toastContext';
import './design.css';

// The person's sleep target range (Tim, 3 Nov 2026): 7 to 9 hours until
// they change it, then their own. One control, on Recovery's Home beside
// the sleep chart's action and in My Account (Settings): "Change my target
// range", a quiet link, opens two steppers in place, "From 7 hours" and
// "To 9 hours", in half hours from 4 up to 12, the start always below the
// end (the portal's stepper: a plain line for minus, the crosshair for
// plus). It saves by itself ("Saving", then "Saved", or "Will sync"
// offline), then says "This is your own target range."
//
// Kept in the account with the person's other page settings
// (person_settings.page_preferences.sleep_target; menuPins.js
// setPreference), through the offline queue, with the device's copy shown
// at once.

const SAVE_AFTER_MS = 600;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

/** The quiet link that opens the control in place. */
export function SleepTargetLink({ open, onToggle, controls }) {
  return (
    <Button variant="text" className="ds-starget-link" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      Edit my target range
    </Button>
  );
}

/** The two steppers, saving by themselves. */
export function SleepTargetEditor({ id, target, onChange }) {
  const toast = useToast();
  const [draft, setDraft] = useState({ from: target.from, to: target.to });
  const [state, setState] = useState('idle');
  const [mine, setMine] = useState(target.own);
  const timer = useRef(null);
  // The ends pressed since the last send: only those are sent, on top of
  // the latest saved range (another tab's change is never undone).
  const sides = useRef({});
  const fromId = useId();
  const toId = useId();

  const send = useCallback(async () => {
    timer.current = null;
    try {
      const pressed = sides.current;
      sides.current = {};
      const how = await onChange(pressed);
      setState(how === 'queued' ? 'offline' : 'saved');
      setMine(true);
    } catch (e) {
      setState('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
    }
  }, [onChange, toast]);

  // Leaving with a change still waiting sends it: through the app's own
  // links, and when the page is hidden, closed or reloaded.
  useEffect(() => {
    const now = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      send();
    };
    const hidden = () => { if (document.visibilityState === 'hidden') now(); };
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', hidden);
      now();
    };
  }, [send]);

  // "Will sync", then "Saved" once the waiting saves have gone.
  const queue = useQueueState();
  useEffect(() => {
    if (state === 'offline' && queue.waiting === 0 && queue.failed === 0) setState('saved');
  }, [state, queue.waiting, queue.failed]);

  // With nothing waiting, the steppers follow the saved range (changed in
  // another tab, on another device, or put together with this one's).
  useEffect(() => {
    if (timer.current || state === 'saving') return;
    setDraft((d) => (d.from === target.from && d.to === target.to ? d : { from: target.from, to: target.to }));
  }, [target.from, target.to, state]);

  const press = (which, value) => {
    const next = stepSleepTarget(draft, which, value);
    if (next.from === draft.from && next.to === draft.to) return;
    // Both ends when a press moved the other one along.
    if (next.from !== draft.from) sides.current.from = next.from;
    if (next.to !== draft.to) sides.current.to = next.to;
    setDraft(next);
    setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(send, SAVE_AFTER_MS);
  };

  return (
    <div id={id} className="ds-starget">
      <div className="ds-starget-rows">
        <div className="ds-starget-row">
          <span className="ds-starget-name" id={fromId}>From</span>
          <Stepper
            label="From"
            value={draft.from}
            onChange={(v) => press('from', v)}
            min={SLEEP_TARGET_MIN}
            max={draft.to - SLEEP_TARGET_STEP}
            step={SLEEP_TARGET_STEP}
            lessLabel="From: half an hour less"
            moreLabel="From: half an hour more"
            unit="hours"
          />
        </div>
        <div className="ds-starget-row">
          <span className="ds-starget-name" id={toId}>To</span>
          <Stepper
            label="To"
            value={draft.to}
            onChange={(v) => press('to', v)}
            min={draft.from + SLEEP_TARGET_STEP}
            max={SLEEP_TARGET_MAX}
            step={SLEEP_TARGET_STEP}
            lessLabel="To: half an hour less"
            moreLabel="To: half an hour more"
            unit="hours"
          />
        </div>
      </div>
      <div className="ds-starget-foot">
        <SaveStatus state={state} />
        {mine && state !== 'saving' && <p className="ds-starget-own">{SLEEP_OWN_LINE}</p>}
      </div>
    </div>
  );
}
