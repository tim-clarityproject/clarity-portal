import { getLocalDateKey } from '../../lib/dateFormatter';

// Dates for the calendar and date fields, as the device's own calendar
// day (CLAUDE.md rule 19): keys are "YYYY-MM-DD" from getLocalDateKey,
// never from toISOString.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export const toKey = (date) => getLocalDateKey(date);

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function addDays(key, n) {
  const date = fromKey(key);
  date.setDate(date.getDate() + n);
  return toKey(date);
}

// The coming Monday (a week on when today is a Monday), so "Today" and
// "next Monday" are never the same day.
export function nextMondayKey(from = todayKey()) {
  const date = fromKey(from);
  const ahead = ((8 - date.getDay()) % 7) || 7;
  date.setDate(date.getDate() + ahead);
  return toKey(date);
}

// "Mon 26 Oct", and "Mon 26 Oct 2027" when it isn't this year.
export function dayLabel(key) {
  const date = fromKey(key);
  const base = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

// "26 October 2026", for screen readers.
export function fullDateLabel(key) {
  const date = fromKey(key);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}
