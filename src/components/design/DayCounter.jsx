import { useId } from 'react';
import Crosshair from './Crosshair';
import './design.css';

// The day counter (M15 dstep; Tim, 26 Oct, 16:24 to 16:26): minus and
// plus, one day at a time, between `min` and `max` (1 to 30 for
// Recovery). Whole weeks read "1 week", "2 weeks"; the suggested length
// says "suggested" under it. The number box keeps its width, so changing
// it never moves anything else on the page (experience rule 45).
//
// value:     the number of days
// words:     how a number reads ("3 days", "1 week"), e.g. dayCountWords
// suggested: the number to mark "suggested", or leave it out
// label:     what the counter is for ("How many days?"), for screen readers
//
// At a limit the button stays focusable but does nothing (aria-disabled),
// as the shared Stepper, so keyboard focus is never dropped.
export default function DayCounter({ value, onChange, min = 1, max = 30, words = (n) => String(n), suggested, label }) {
  const outputId = useId();
  const step = (by) => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <div className="ds-daycount" role="group" aria-label={label}>
      <button
        type="button"
        className="ds-daycount-btn"
        aria-label="One day fewer"
        aria-describedby={outputId}
        aria-disabled={value <= min}
        onClick={() => step(-1)}
      >
        <span className="ds-daycount-minus" aria-hidden="true" />
      </button>
      <output id={outputId} className="ds-daycount-value" aria-live="polite">
        <span>{words(value)}</span>
        {suggested != null && <small className={value === suggested ? '' : 'ds-daycount-hide'}>suggested</small>}
      </output>
      <button
        type="button"
        className="ds-daycount-btn"
        aria-label="One day more"
        aria-describedby={outputId}
        aria-disabled={value >= max}
        onClick={() => step(1)}
      >
        <Crosshair />
      </button>
    </div>
  );
}
