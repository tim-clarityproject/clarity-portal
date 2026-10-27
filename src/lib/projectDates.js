// Strategic Alignment Health Check: project dates (methods M20.1, "Project
// dates"; not scored). Each project item in the saved answers may carry, all
// optional:
//   started    the month it started, "YYYY-MM"
//   startedOn  an exact start date, "YYYY-MM-DD", inside the started month
//   due        the month it's due to finish, "YYYY-MM", or "open" (Open-ended)
//   dueOn      an exact finish date, "YYYY-MM-DD", inside the due month;
//              never with "open"
// They live inside the Health Check's answers (alignment_sessions.data), which
// already allows extra keys on a project item, so no database change is needed.
// A bad value already saved reads as blank, never as an error.

export const DATE_FIELDS = ['started', 'startedOn', 'due', 'dueOn'];
export const OPEN_ENDED = 'open';
export const FIRST_YEAR = 1990;
export const LAST_YEAR = 2100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DATE_MESSAGES = {
  month: 'Choose a month and a year from 1990 to 2100.',
  startedOn: 'Choose an exact start date inside the month it started.',
  dueOn: 'Choose an exact finish date inside the month it’s due to finish.',
  openDueOn: 'An open-ended project has no exact finish date.',
  order: 'The finish date can’t be before the start date.',
};

/** "YYYY-MM" with a real month and a year from 1990 to 2100, as {y, m}; else null. */
function readMonth(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (y < FIRST_YEAR || y > LAST_YEAR || m < 1 || m > 12) return null;
  return { y, m };
}

/** "YYYY-MM-DD", a real day in a valid month, as {y, m, d}; else null. */
function readDay(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = readMonth(match[1]);
  if (!month) return null;
  const d = Number(match[2]);
  const daysInMonth = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return null;
  return { ...month, d };
}

const blank = (value) => value == null || value === '';
const monthKey = ({ y, m }) => y * 12 + m;
const inMonth = (day, month) => day.y === month.y && day.m === month.m;

/**
 * Checks dates typed in the app before they are saved. Blank fields are left
 * out. An exact date given without its month takes its month from the date.
 * @param {{started?: string, startedOn?: string, due?: string, dueOn?: string}} input
 * @returns {{ok: true, dates: Object} | {ok: false, field: string, message: string}}
 */
export function checkProjectDates(dateInput) {
  const input = dateInput && typeof dateInput === 'object' ? dateInput : {};
  const dates = {};
  const fail = (field, key) => ({ ok: false, field, message: DATE_MESSAGES[key] });

  let started = null;
  let startedOn = null;
  if (!blank(input.startedOn)) {
    startedOn = readDay(input.startedOn);
    if (!startedOn) return fail('startedOn', 'startedOn');
  }
  if (!blank(input.started)) {
    started = readMonth(input.started);
    if (!started) return fail('started', 'month');
    if (startedOn && !inMonth(startedOn, started)) return fail('startedOn', 'startedOn');
  } else if (startedOn) {
    started = { y: startedOn.y, m: startedOn.m };
  }

  const open = input.due === OPEN_ENDED;
  let due = null;
  let dueOn = null;
  if (!blank(input.dueOn)) {
    if (open) return fail('dueOn', 'openDueOn');
    dueOn = readDay(input.dueOn);
    if (!dueOn) return fail('dueOn', 'dueOn');
  }
  if (!blank(input.due) && !open) {
    due = readMonth(input.due);
    if (!due) return fail('due', 'month');
    if (dueOn && !inMonth(dueOn, due)) return fail('dueOn', 'dueOn');
  } else if (dueOn) {
    due = { y: dueOn.y, m: dueOn.m };
  }

  if (started && due) {
    const before = monthKey(due) < monthKey(started)
      || (monthKey(due) === monthKey(started) && startedOn && dueOn && dueOn.d < startedOn.d);
    if (before) return fail('due', 'order');
  }

  const pad = (n) => String(n).padStart(2, '0');
  if (started) dates.started = `${started.y}-${pad(started.m)}`;
  if (startedOn) dates.startedOn = `${startedOn.y}-${pad(startedOn.m)}-${pad(startedOn.d)}`;
  if (open) dates.due = OPEN_ENDED;
  else if (due) dates.due = `${due.y}-${pad(due.m)}`;
  if (dueOn) dates.dueOn = `${dueOn.y}-${pad(dueOn.m)}-${pad(dueOn.d)}`;
  return { ok: true, dates };
}

/**
 * The valid dates on a saved (or draft) project item, for keeping through
 * every save and reopen. Anything that isn't valid is dropped, so it reads as
 * blank: a bad month or day, an exact date outside its month or without its
 * month, an exact finish date with "open", and a finish before the start
 * (both finish fields are dropped then; the start stays).
 * @param {Object} item a project item
 * @returns {{started?: string, startedOn?: string, due?: string, dueOn?: string}}
 */
export function projectDates(item) {
  const out = {};
  if (!item || typeof item !== 'object') return out;
  const started = readMonth(item.started);
  if (started) {
    out.started = item.started;
    const on = readDay(item.startedOn);
    if (on && inMonth(on, started)) out.startedOn = item.startedOn;
  }
  if (item.due === OPEN_ENDED) {
    out.due = OPEN_ENDED;
  } else {
    const due = readMonth(item.due);
    if (due) {
      out.due = item.due;
      const on = readDay(item.dueOn);
      if (on && inMonth(on, due)) out.dueOn = item.dueOn;
    }
  }
  if (out.started && out.due && out.due !== OPEN_ENDED) {
    const check = checkProjectDates(out);
    if (!check.ok && check.field === 'due') {
      delete out.due;
      delete out.dueOn;
    }
  }
  return out;
}

const monthWords = (value) => {
  const { y, m } = readMonth(value);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayWords = (value) => {
  const { y, m, d } = readDay(value);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * A project's dates in words, one line each, for the screens to lay out:
 * "Started Mar 2025" (or "Started 3 Mar 2025"), then "Due to finish Jun 2027"
 * (or "Due to finish 30 Jun 2027") or "Open-ended, with no agreed finish
 * date". Nothing at all when blank.
 * @param {Object} item a project item (bad values read as blank)
 * @returns {string[]}
 */
export function projectDatesText(item) {
  const dates = projectDates(item);
  const lines = [];
  if (dates.started) lines.push(`Started ${dates.startedOn ? dayWords(dates.startedOn) : monthWords(dates.started)}`);
  if (dates.due === OPEN_ENDED) lines.push('Open-ended, with no agreed finish date');
  else if (dates.due) lines.push(`Due to finish ${dates.dueOn ? dayWords(dates.dueOn) : monthWords(dates.due)}`);
  return lines;
}
