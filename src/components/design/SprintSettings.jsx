import { useId, useRef, useState } from 'react';
import { CalendarPopover } from './Calendar';
import { Choice } from './Choice';
import InlineChoice from './InlineChoice';
import FieldLabel from './FieldLabel';
import HelpPanel from './HelpPanel';
import { NumberField } from './LoggingRow';
import { ToggleTile } from './Tile';
import { dayLabel, nextMondayKey, todayKey } from './dates';
import { DEFAULT_STANDARD, STANDARD_CHOICES } from '../../lib/scores/index.js';
import { MAX_LENGTH, MIN_LENGTH, SPRINT_LENGTHS, SUGGESTED_LENGTH, typedNumber } from '../../lib/performance';
import './design.css';

// A sprint's settings, one per guided step (M6 lenBody, startBody,
// stdBody), shared by Build your plan (the first sprint) and Start a
// sprint. Each takes the sprint's answers and gives back a patch.
//
// sprint: { len, other, otherLen, tpl, start, extraStart, std, stdOther, otherStd }

/**
 * How long (M6 lenBody): 4, 6, 8, 12 (suggested) or 16 weeks as tiles,
 * Other for any length from 2 to 16 (the brief: "2 to 16 weeks"), and the
 * "Just started a new role?" tile for the first 90 days (13 weeks).
 */
export function SprintLengthChoice({ sprint, onChange, label = 'How long is this sprint?' }) {
  const id = useId();
  // Answer boxes with one line of words each (Polish 1, Stage B, requests-b2 6: rule 7, words never
  // wrap inside a control); the suggested length is the hint line under them, as the standard's is.
  const options = [...SPRINT_LENGTHS.map((n) => ({ value: n, label: `${n} weeks` })), { value: 'other', label: 'Other' }];
  const current = sprint.tpl ? null : sprint.other ? 'other' : sprint.len;
  const pick = (value) => onChange(value === 'other' ? { other: true, tpl: false } : { len: value, other: false, tpl: false });
  const n = typedNumber(sprint.otherLen);
  const otherBad = sprint.other && String(sprint.otherLen || '').trim() && !(Number.isInteger(n) && n >= MIN_LENGTH && n <= MAX_LENGTH);
  return (
    <div className="ds-sprintset">
      <InlineChoice ariaLabel={label} form="boxes" options={options} value={current} onChange={pick} />
      {!sprint.other && <p className="ds-hint">{`${SUGGESTED_LENGTH} weeks is suggested.`}</p>}
      {sprint.other && (
        <div className="ds-sprintset-other">
          <FieldLabel label="How many weeks?" htmlFor={`${id}-weeks`} />
          <div className="ds-sprintset-figure">
            <NumberField id={`${id}-weeks`} size="box" maxDigits={2} value={sprint.otherLen} onChange={(otherLen) => onChange({ otherLen })} />
            <span aria-hidden="true">weeks</span>
          </div>
          <p className="ds-hint">{otherBad ? `Any figure from ${MIN_LENGTH} to ${MAX_LENGTH}.` : `Any length from ${MIN_LENGTH} to ${MAX_LENGTH} weeks.`}</p>
        </div>
      )}
      <ToggleTile
        pressed={Boolean(sprint.tpl)}
        onClick={() => onChange({ tpl: !sprint.tpl, other: false })}
        title="Just started a new role?"
        line="Here’s a first 90 days template to get you started."
      />
    </div>
  );
}

/**
 * When it starts (M6 startBody; decisions "Sprints can start on any
 * day"): Today, next Monday (suggested), or Another day from the calendar.
 */
export function SprintStartChoice({ sprint, onChange, label = 'When does it start?', earliest = null }) {
  const [open, setOpen] = useState(false);
  const anotherRef = useRef(null);
  const today = todayKey();
  const monday = nextMondayKey(today);
  // `earliest`: the first day it may start, when that is after today (the
  // last sprint finished today, so today is still its day).
  const first = earliest && earliest > today ? earliest : today;
  const options = [
    ...(first === today ? [{ value: today, label: `Today, ${dayLabel(today)}` }] : []),
    { value: monday, label: dayLabel(monday), note: 'suggested' },
  ];
  const extra = sprint.extraStart && sprint.extraStart >= first && sprint.extraStart !== today && sprint.extraStart !== monday ? sprint.extraStart : null;
  if (extra) options.push({ value: extra, label: dayLabel(extra) });
  return (
    <div className="ds-sprintset">
      <Choice ariaLabel={label} form="rows" options={options} value={sprint.start} onChange={(start) => onChange({ start })} />
      <div className="ds-rows-tail">
        <button ref={anotherRef} type="button" className="ds-answer" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          Another day
        </button>
      </div>
      <CalendarPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anotherRef}
        title={label}
        value={sprint.start}
        min={first}
        onChange={(start) => onChange({ start, extraStart: start })}
      />
    </div>
  );
}

/**
 * The performance standard (M6 stdBody; methods M7): 75, 80, 85 or 90%,
 * or Other for any whole figure from 50 to 100, with 85% suggested. In an
 * organisation seat it is 85% and can't be changed (`fixed`).
 */
export function StandardChoice({ sprint, onChange, fixed = null, label = 'What’s your performance standard?' }) {
  const id = useId();
  return (
    <div className="ds-sprintset">
      {fixed != null ? (
        <p className="ds-sprintset-fixed">{`Your organisation sets your performance standard at ${fixed}%.`}</p>
      ) : (
        <>
          <Choice
            ariaLabel={label}
            options={[...STANDARD_CHOICES.map((v) => ({ value: v, label: `${v}%` })), { value: 'other', label: 'Other' }]}
            value={sprint.stdOther ? 'other' : sprint.std}
            onChange={(v) => onChange(v === 'other' ? { stdOther: true } : { stdOther: false, std: v })}
          />
          {sprint.stdOther ? (
            <div className="ds-sprintset-other">
              <FieldLabel label="What percentage?" htmlFor={`${id}-pct`} />
              <div className="ds-sprintset-figure">
                <NumberField id={`${id}-pct`} size="box" maxDigits={3} value={sprint.otherStd} onChange={(otherStd) => onChange({ otherStd })} />
                <span aria-hidden="true">%</span>
              </div>
              <p className="ds-hint">Any figure from 50 to 100.</p>
            </div>
          ) : <p className="ds-hint">{`${DEFAULT_STANDARD}% is suggested.`}</p>}
        </>
      )}
      <HelpPanel
        line="Your performance standard is the weekly Performance score that counts as a good week."
        example="For example: 85% means you completed most of your plan, not all of it."
      />
    </div>
  );
}
