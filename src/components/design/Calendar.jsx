import { useEffect, useId, useRef, useState } from 'react';
import FieldLabel from './FieldLabel';
import Popover from './Popover';
import { addDays, dayLabel, fromKey, fullDateLabel, MONTH_NAMES, todayKey, toKey } from './dates';
import './design.css';

// The branded calendar (decisions: "The 'By' date is picked from a
// calendar"; M6 "Another day" on When does it start? and By when? on an
// objective). A panel with the question as its title, the month with
// previous and next, today marked, past days greyed out and the chosen
// day filled. On a laptop it opens beside the field like the drop-down;
// on a phone it slides up from the bottom (Popover.jsx). Weeks start on
// Monday.
//
// Keyboard (as a date grid): arrows move a day or a week, Home and End
// go to the start or end of the week, Page Up and Page Down change the
// month (with Shift, the year), Enter or Space picks the day, Escape
// closes; focus goes back to the field.

const WEEKDAYS = [['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'],
  ['Fr', 'Friday'], ['Sa', 'Saturday'], ['Su', 'Sunday']];

const CHEVRON_LEFT = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>;
const CHEVRON_RIGHT = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>;

function monthStart(key) {
  const d = fromKey(key);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(key, n) {
  const d = fromKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return toKey(target);
}

// Monday-first weeks for the month that holds `key`.
function weeksOf(key) {
  const first = monthStart(key);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null)];
  for (let d = 1; d <= days; d += 1) cells.push(toKey(new Date(first.getFullYear(), first.getMonth(), d)));
  // Always six weeks, so the panel never changes height between months
  // and the arrows stay under the thumb.
  while (cells.length < 42) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function CalendarGrid({ value, min, onPick, focusRef }) {
  const today = todayKey();
  const startAt = value && value >= min ? value : (today >= min ? today : min);
  const [focusKey, setFocusKey] = useState(startAt);
  const moved = useRef(false);
  const gridRef = useRef(null);
  const titleId = useId();

  const view = monthStart(focusKey);
  const viewKey = toKey(view);
  const atMin = toKey(monthStart(min)) >= viewKey;
  const weeks = weeksOf(viewKey);

  // After a keyboard move, focus follows (into another month if needed).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }, [focusKey]);

  const moveTo = (key) => {
    const next = key < min ? min : key;
    moved.current = true;
    setFocusKey(next);
  };

  const onKey = (e) => {
    const d = fromKey(focusKey);
    const weekday = (d.getDay() + 6) % 7;
    const map = {
      ArrowLeft: () => addDays(focusKey, -1),
      ArrowRight: () => addDays(focusKey, 1),
      ArrowUp: () => addDays(focusKey, -7),
      ArrowDown: () => addDays(focusKey, 7),
      Home: () => addDays(focusKey, -weekday),
      End: () => addDays(focusKey, 6 - weekday),
      PageUp: () => addMonths(focusKey, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusKey, e.shiftKey ? 12 : 1),
    };
    if (map[e.key]) {
      e.preventDefault();
      moveTo(map[e.key]());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusKey >= min) onPick(focusKey);
    }
  };

  const changeMonth = (n) => {
    const next = addMonths(focusKey, n);
    setFocusKey(next < min ? min : next);
  };

  return (
    <div className="ds-cal">
      <div className="ds-cal-month">
        <button type="button" className="ds-cal-nav" aria-label="Previous month" disabled={atMin} onClick={() => changeMonth(-1)}>
          {CHEVRON_LEFT}
        </button>
        <span id={titleId} aria-live="polite">{`${MONTH_NAMES[view.getMonth()]} ${view.getFullYear()}`}</span>
        <button type="button" className="ds-cal-nav" aria-label="Next month" onClick={() => changeMonth(1)}>
          {CHEVRON_RIGHT}
        </button>
      </div>
      <table ref={gridRef} className="ds-cal-grid" role="grid" aria-labelledby={titleId} onKeyDown={onKey}>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => <th key={short} scope="col" abbr={long}>{short}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean) || `week-${weeks.indexOf(week)}`}>
              {week.map((key, i) => (
                <td key={key || `blank-${i}`} role="gridcell">
                  {key && (
                    <button
                      type="button"
                      data-key={key}
                      ref={key === focusKey ? focusRef : undefined}
                      className={`ds-cal-day${key === today ? ' ds-cal-day--today' : ''}`}
                      tabIndex={key === focusKey ? 0 : -1}
                      aria-pressed={key === value}
                      aria-disabled={key < min || undefined}
                      aria-label={`${fullDateLabel(key)}${key === today ? ', today' : ''}`}
                      onClick={() => { if (key >= min) onPick(key); }}
                      onFocus={() => { if (key !== focusKey) setFocusKey(key); }}
                    >
                      {fromKey(key).getDate()}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The calendar on its own, opened from any control (anchorRef), e.g. the
// "Another day" row.
export function CalendarPopover({ open, onClose, anchorRef, title, value, onChange, min = todayKey() }) {
  const focusRef = useRef(null);
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      title={title}
      variant="panel"
      width="css"
      initialFocusRef={focusRef}
    >
      <CalendarGrid value={value} min={min} focusRef={focusRef} onPick={(key) => { onChange(key); onClose(); }} />
    </Popover>
  );
}

// A date field: the box shows the date as "Mon 26 Oct" (or "Pick a
// date"), and opens the calendar with the question as its title.
export default function DatePicker({ label, who, coachName, value, onChange, min, placeholder = 'Pick a date' }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="ds-choice">
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <button
        ref={boxRef}
        type="button"
        className={`ds-dd ds-date${value ? '' : ' ds-dd--empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={valueId} className="ds-dd-value">{value ? dayLabel(value) : placeholder}</span>
      </button>
      <CalendarPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={boxRef}
        title={label}
        value={value}
        onChange={onChange}
        min={min}
      />
    </div>
  );
}
