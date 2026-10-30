import { useId } from 'react';
import Crosshair from './Crosshair';
import Chevron from './Chevron';
import { Bar } from './Stat';
import './design.css';

// Number entry: opens the number keypad on phone, with the unit shown
// inside the field. `value` is the text as typed; the page decides how
// to store it.
// maxDigits keeps entries to a sensible size; grouping commas typed or
// pasted in whole numbers ("12,000") are accepted and dropped.
// size 'box': as tall and wide as a text box, for a form's figure boxes
// ("Where are you now?" in Build your plan).
export function NumberField({ value, onChange, unit, label, decimals = false, maxDigits = 7, size, ...rest }) {
  return (
    <label className={`ds-num${size === 'box' ? ' ds-num--box' : ''}`}>
      <input
        className="ds-num-input"
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        pattern={decimals ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        value={value}
        onChange={(e) => {
          let next = e.target.value.trim();
          if (!decimals) next = next.replace(/[,\s]/g, '');
          const allowed = decimals ? /^[0-9]*[.,]?[0-9]*$/ : /^[0-9]*$/;
          if (allowed.test(next) && next.replace(/[.,]/, '').length <= maxDigits) onChange(next);
        }}
        {...rest}
      />
      {unit && <span className="ds-num-unit" aria-hidden="true">{unit}</span>}
    </label>
  );
}

// Stepper: minus, the count, then the crosshair plus (decisions:
// "counters keep the crosshair plus and a minus").
// step:      how much each press changes it (0.5 for half hours, M5 sleep).
// format:    how the value shows ("7.5"); empty shows a dash.
// startFrom: where the first press starts when nothing is set yet (M5:
//            sleep starts from 7 hours).
// lessLabel, moreLabel: what each button says to a screen reader
//            ("Half an hour less"); "One fewer" and "One more" otherwise.
// unit:      a full word after the stepper, small and grey ("hours").
export function Stepper({ value, onChange, min = 0, max = Infinity, label, step: by = 1, format = (v) => `${v}`, startFrom, lessLabel, moreLabel, unit }) {
  const outputId = useId();
  const empty = value == null;
  // At a limit the button stays focusable but does nothing (aria-disabled
  // rather than disabled), so keyboard focus is never dropped and a held
  // key never runs on into the other button.
  const step = (dir) => {
    const from = empty ? (startFrom ?? min) : value;
    // Half steps are kept exact (7.5, never 7.499999).
    const next = Math.round(Math.min(max, Math.max(min, from + dir * by)) * 1000) / 1000;
    if (next !== value) onChange(next);
  };
  const stepper = (
    <span className="ds-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="ds-stepper-btn"
        aria-label={lessLabel || `One fewer: ${label}`}
        aria-describedby={outputId}
        aria-disabled={!empty && value <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <output id={outputId} className={`ds-stepper-value${by % 1 ? ' ds-stepper-value--wide' : ''}`} aria-live="polite">{empty ? '–' : format(value)}</output>
      <button
        type="button"
        className="ds-stepper-btn"
        aria-label={moreLabel || `One more: ${label}`}
        aria-describedby={outputId}
        aria-disabled={!empty && value >= max}
        onClick={() => step(1)}
      >
        <Crosshair />
      </button>
    </span>
  );
  if (!unit) return stepper;
  return (
    <span className="ds-stepper-with-unit">
      {stepper}
      <span className="ds-stepper-unit">{unit}</span>
    </span>
  );
}

const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

// The chevron at the end of a habit's row (M1 hrow .mo): opens the habit's
// week, target and impact. 44px, the one chevron turned right.
function MoreButton({ label, onClick }) {
  return (
    <button type="button" className="ds-log-more" aria-label={label} onClick={onClick}>
      <Chevron direction="right" size="sm" />
    </button>
  );
}

// Small pressed buttons in a row (M1 .seg and .rate): No and Yes, or 1 to
// 5. Tapping the chosen one again clears it, so a day can go back to not
// logged. 44px each.
function PressRow({ options, value, onChange, label, className = '' }) {
  return (
    <span className={`ds-log-press ${className}`.trim()} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="ds-log-press-btn"
          aria-pressed={value === o.value}
          aria-label={o.aria}
          onClick={() => onChange(value === o.value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

// A tick box on its own (a weekly yes or no): fills mint when done.
function TickBox({ checked, onChange, label }) {
  return (
    <button type="button" role="checkbox" className="ds-check-box" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span>{TICK}</span>
    </button>
  );
}

const YES_NO = [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }];
const RATINGS = [1, 2, 3, 4, 5].map((r) => ({ value: r, label: String(r) }));

// Logging row (design reference: Logging rows; M1 hrow). One habit per
// row: the name, one grey line (today against today's target, or the
// week so far), the entry, and a thin bar underneath (mint: progress
// towards the target). No impact tags while logging.
//
// kind 'number':  a number field (value is text); give `unit`.
// kind 'stepper': minus and plus (value is a number); give `min`/`max`
//                 (a count's sensible top number, M1).
// kind 'yesno':   No and Yes for today (value 0, 1 or null).
// kind 'rating':  1 to 5 (value or null).
// kind 'tick':    once a week, a tick box (value true or false).
// progress:       0 to 1 for the thin bar.
// onMore:         the chevron button for the habit's panel, read out as `moreLabel`.
export function LoggingRow({
  name,
  detail,
  kind = 'number',
  value,
  onChange,
  unit,
  decimals,
  min,
  max,
  progress,
  entryLabel,
  onMore,
  moreLabel,
  inputProps,
}) {
  const label = entryLabel || name;
  let entry;
  if (kind === 'stepper') entry = <Stepper value={value} onChange={onChange} min={min} max={max} label={label} />;
  else if (kind === 'yesno') entry = <PressRow options={YES_NO} value={value} onChange={onChange} label={label} />;
  else if (kind === 'rating') entry = <PressRow options={RATINGS} value={value} onChange={onChange} label={label} className="ds-log-press--rate" />;
  else if (kind === 'tick') entry = <TickBox checked={Boolean(value)} onChange={onChange} label={label} />;
  else entry = <NumberField value={value} onChange={onChange} unit={unit} decimals={decimals} label={label} {...inputProps} />;
  return (
    <div className={`ds-log${onMore ? ' ds-log--more' : ''}`}>
      <div className="ds-log-main">
        <div className="ds-log-name">{name}</div>
        {detail && <div className="ds-log-detail">{detail}</div>}
      </div>
      <div className="ds-log-entry">{entry}</div>
      {onMore && <MoreButton label={moreLabel || `${name}: week, target and impact`} onClick={onMore} />}
      {progress != null && <Bar value={progress} />}
    </div>
  );
}

// The week view of one habit (M1 hrow with view 'week'): a box for each
// day shown (the working days, and any day off already logged; M0.3),
// later days greyed out and today marked; or Yes and No in words for
// each day (never colour alone, Tim 23 Oct); or the week's one tick.
//
// kind 'boxes': `texts` holds what each day's box shows ({ [day]: text });
//               onChange(day, text) as typed, onBlur(day) when left.
// kind 'yesno': `values` holds 1, 0 or nothing per day; a tap goes
//               Yes, then No, then back to not logged.
// kind 'tick':  `value` true or false; onChange(value).
// days:         [{ key, box: 'Mo', full: 'Monday 26 Oct', today, later }]
//               (the weekly debrief passes every day of a finished week,
//               none later, so all seven are open).
// total:        { label: 'Total', value: '38,400 steps, 55%', good }: the
//               week's total and score in a right-hand column (the debrief;
//               the words come from src/lib, never worked out here). good:
//               true is mint (at or above the standard), false grey (below),
//               never coral; left out, the text colour.
// dashEmpty:    a day with nothing logged has a dashed edge (the debrief).
// tickWords:    words beside a once-a-week tick (M1 debrief: "Happened
//               this week"); the box itself is named by the habit.
export function LoggingWeekRow({
  name,
  detail,
  kind = 'boxes',
  days = [],
  texts = {},
  values = {},
  value,
  onChange,
  onBlur,
  decimals,
  progress,
  onMore,
  moreLabel,
  total,
  dashEmpty = false,
  tickWords,
}) {
  let entry;
  if (kind === 'tick') {
    entry = <TickBox checked={Boolean(value)} onChange={onChange} label={name} />;
    if (tickWords) entry = <>{entry}<span className="ds-logweek-tickwords" aria-hidden="true">{tickWords}</span></>;
  } else if (kind === 'yesno') {
    entry = (
      <div className="ds-logweek-days" style={{ '--days': days.length }} role="group" aria-label={name}>
        {days.map((d) => {
          const v = values[d.key];
          const words = v === 1 ? 'Yes' : v === 0 ? 'No' : '';
          return (
            <button
              key={d.key}
              type="button"
              className={`ds-logweek-yn${d.today ? ' ds-logweek--today' : ''}`}
              aria-pressed={v === 1}
              disabled={d.later}
              aria-label={`${name}, ${d.full}: ${d.later ? 'still to come' : v === 1 ? 'yes' : v === 0 ? 'no' : 'not logged'}`}
              onClick={() => onChange(d.key, v === 1 ? 0 : v === 0 ? null : 1)}
            >
              <span>{d.box}</span>
              <b>{d.later ? '' : words}</b>
            </button>
          );
        })}
      </div>
    );
  } else {
    // Every box is as wide as the longest figure in the row needs (12,500
    // steps is never cut off), at least 44px; a row that no longer fits
    // wraps onto a second line instead of squashing or scrolling.
    const chars = Math.max(1, ...days.map((d) => String(texts[d.key] ?? '').length));
    entry = (
      <div className="ds-logweek-days ds-logweek-days--boxes" style={{ '--days': days.length, '--chars': chars }}>
        {days.map((d) => (
          <label key={d.key} className={`ds-logweek-box${d.today ? ' ds-logweek--today' : ''}${dashEmpty && !(texts[d.key] ?? '') ? ' ds-logweek-box--empty' : ''}`}>
            <span aria-hidden="true">{d.box}</span>
            <input
              type="text"
              inputMode={decimals ? 'decimal' : 'numeric'}
              autoComplete="off"
              enterKeyHint="done"
              aria-label={`${name}, ${d.full}`}
              value={texts[d.key] ?? ''}
              disabled={d.later}
              onChange={(e) => {
                const next = e.target.value.trim();
                const allowed = decimals ? /^[0-9]*[.,]?[0-9]*$/ : /^[0-9]*$/;
                if (allowed.test(next) && next.replace(/[.,]/, '').length <= 7) onChange(d.key, next);
              }}
              onBlur={() => onBlur?.(d.key)}
            />
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className={`ds-log ds-logweek${kind === 'tick' ? ' ds-logweek--tick' : ''}${total ? ' ds-logweek--total' : ''}`}>
      <div className="ds-log-main">
        <div className="ds-log-name">{name}</div>
        {detail && <div className="ds-log-detail">{detail}</div>}
      </div>
      {kind === 'tick' && <div className="ds-log-entry">{entry}</div>}
      {onMore && <MoreButton label={moreLabel || `${name}: week, target and impact`} onClick={onMore} />}
      {kind !== 'tick' && <div className="ds-logweek-entry">{entry}</div>}
      {total && (
        <div className="ds-logweek-total">
          <span>{total.label}</span>
          <strong className={total.good === true ? 'ds-logweek-total--good' : total.good === false ? 'ds-logweek-total--below' : undefined}>{total.value}</strong>
        </div>
      )}
      {progress != null && <Bar value={progress} />}
    </div>
  );
}
