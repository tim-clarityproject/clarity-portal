import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Choice } from './Choice';
import { SlidePanel } from './Dialogs';
import TextField from './TextField';
import { useToast } from './toastContext';
import { useTimerLength } from './useTimerLength';
import {
  DEFAULT_MINUTES, MAX_MINUTES, MINUTES_ERROR, MIN_MINUTES, TIMER_LENGTHS,
  buttonLabel, cleanMinutes, formatTime, isCustom, leftAt, minutesWords, ringLabel, ringOffset, timerSetMessage,
} from '../../lib/timer';
import './design.css';
import './timer.css';

// The timer, the same everywhere in the portal (mock-up M9, Get unstuck;
// Tim, 13 Nov, 09:27 to 09:29): a 64px ring with the time inside, one
// outlined button beside it (Start the timer, Pause, Carry on, Start
// again) and, once started, Reset.
//
// Tapping the ring before it starts, or while it's paused, opens "How
// long?": 4, 6, 8 or 10 minutes, or Custom (a Minutes box, 1 to 60, with
// "Set the timer"). One tap on a length sets it, closes the panel and
// shows "The timer is set to 8 minutes.". The ring can't be tapped while
// it runs. The choice is remembered for next time (useTimerLength: the
// account, with this device's copy shown first), so every timer in the
// portal starts at the length last chosen.
//
// It counts down to an end time, not by counting ticks, so it is still
// right after the tab has been hidden. No sound.
//
//   <Timer />                          remembers its own length
//   <Timer onFinish={() => …} />       told once each time it reaches 0:00
//
// minutes, onMinutesChange: only for a page that keeps the length itself
//            (minutes 1 to 60). Leave both out and the timer remembers it.
// onFinish:  called when the time runs out.
// className: added to the row.
//
// Needs <ToastProvider> above it, as every page in the portal has.
const CUSTOM = 'custom';
const OPTIONS = [
  ...TIMER_LENGTHS.map((m) => ({ value: String(m), label: minutesWords(m) })),
  { value: CUSTOM, label: 'Custom' },
];
const IDLE = { endsAt: null, left: null }; // not started: the full length is left

export default function Timer({ minutes: given, onMinutesChange, onFinish, className = '' }) {
  const [kept, keep] = useTimerLength();
  const controlled = given != null;
  const minutes = cleanMinutes(controlled ? given : kept) ?? DEFAULT_MINUTES;
  const length = minutes * 60;

  // Running: `endsAt` (the clock time it reaches 0:00). Paused or finished:
  // `left`, the seconds still to go. `now` is the clock at the last repaint.
  const [run, setRun] = useState(IDLE);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const running = run.endsAt != null;
  const left = Math.min(length, running ? leftAt(run.endsAt, now) : run.left ?? length);
  const started = running || left < length;

  // Repaints as each second turns, and at once when the tab is shown again.
  useEffect(() => {
    const endsAt = run.endsAt;
    if (endsAt == null) return undefined;
    let id = null;
    const tick = () => {
      const t = Date.now();
      const ms = endsAt - t;
      setNow(t);
      if (ms <= 0) {
        setRun({ endsAt: null, left: 0 });
        onFinishRef.current?.();
        return;
      }
      id = setTimeout(tick, ms % 1000 || 1000);
    };
    id = setTimeout(tick, Math.max(0, endsAt - Date.now()) % 1000 || 1000);
    const onShown = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(id);
      tick();
    };
    document.addEventListener('visibilitychange', onShown);
    return () => {
      clearTimeout(id);
      document.removeEventListener('visibilitychange', onShown);
    };
  }, [run.endsAt]);

  const go = () => {
    const t = Date.now();
    setNow(t);
    if (running) {
      const still = leftAt(run.endsAt, t);
      setRun({ endsAt: null, left: still });
      if (still <= 0) onFinishRef.current?.();
      return;
    }
    // At 0:00 "Start again" starts from the full length.
    setRun({ endsAt: t + (left <= 0 ? length : left) * 1000, left: null });
  };

  const setLength = (next) => {
    setRun(IDLE);
    setOpen(false);
    if (!controlled) keep(next);
    onMinutesChange?.(next);
  };

  const time = formatTime(left);
  return (
    <div className={`ds-timer ${className}`.trim()}>
      <button
        type="button"
        className="ds-timer-ring"
        aria-label={ringLabel({ running, left, length })}
        aria-haspopup={running ? undefined : 'dialog'}
        disabled={running}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle className="ds-timer-track" cx="60" cy="60" r="56" fill="none" strokeWidth="3" />
          <circle
            className="ds-timer-arc"
            cx="60"
            cy="60"
            r="56"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={ringOffset({ left, length })}
          />
        </svg>
        <span className="ds-timer-time" role="timer" aria-label={`${time} left`}>{time}</span>
      </button>
      <div className="ds-timer-buttons">
        <Button onClick={go}>{buttonLabel({ running, left, length })}</Button>
        {started && <Button variant="text" className="ds-timer-reset" onClick={() => setRun(IDLE)}>Reset</Button>}
      </div>
      <TimerLengthPanel open={open} onClose={() => setOpen(false)} minutes={minutes} onSet={setLength} />
    </div>
  );
}

// "How long?": the four lengths and Custom as answer rows. A tap, Enter or
// Space on a length sets it; the arrow keys only move between the rows.
function TimerLengthPanel({ open, onClose, minutes, onSet }) {
  const toast = useToast();
  const start = () => ({
    picked: isCustom(minutes) ? CUSTOM : String(minutes),
    typed: isCustom(minutes) ? String(minutes) : '',
    wrong: false,
  });
  const [form, setForm] = useState(start);
  // Each opening starts from the length the timer has now.
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setForm(start());
  }
  const box = useRef(null);
  const toBox = useRef(false);
  const errorId = useId();
  const custom = form.picked === CUSTOM;

  // Choosing Custom shows the box and moves to it.
  useEffect(() => {
    if (!toBox.current || !box.current) return;
    toBox.current = false;
    box.current.focus();
  });

  const set = (value) => {
    onSet(value);
    toast.show(timerSetMessage(value));
  };

  const choose = (value) => {
    if (value !== CUSTOM) {
      set(Number(value));
      return;
    }
    toBox.current = true;
    setForm((f) => ({ ...f, picked: CUSTOM, wrong: false }));
  };

  const setTyped = () => {
    const value = cleanMinutes(form.typed);
    if (value == null) {
      setForm((f) => ({ ...f, wrong: true }));
      box.current?.focus();
      return;
    }
    set(value);
  };

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={<span className="ds-timer-title">How long?</span>}
      footer={custom ? <Button variant="primary" className="ds-timer-set" onClick={setTyped}>Set the timer</Button> : null}
    >
      <Choice
        className="ds-timer-options"
        ariaLabel="How long?"
        form="rows"
        options={OPTIONS}
        value={form.picked}
        onChange={(picked) => setForm((f) => ({ ...f, picked, wrong: false }))}
        onChoose={choose}
      />
      {custom && (
        <>
          <TextField
            ref={box}
            className="ds-timer-minutes"
            label="Minutes"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={1}
            placeholder="e.g. 12"
            autoComplete="off"
            value={form.typed}
            aria-invalid={form.wrong || undefined}
            aria-describedby={form.wrong ? errorId : undefined}
            onChange={(e) => setForm((f) => ({ ...f, typed: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              setTyped();
            }}
          />
          {form.wrong && <p id={errorId} className="ds-timer-error" role="alert">{MINUTES_ERROR}</p>}
        </>
      )}
    </SlidePanel>
  );
}
