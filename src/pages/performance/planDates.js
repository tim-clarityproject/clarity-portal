import { formatClockTime, getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import { addDays, dayLabel } from '../../components/design';

// The plan pages' dates (writing rule 28): "today", "yesterday" or
// "Mon 19 Oct", from a saved timestamp read as UTC (CLAUDE.md rule 19).
export function dayWords(value, { capital = false } = {}) {
  if (!value) return '';
  const key = getLocalDateKey(parseDbTimestamp(value));
  const today = getLocalDateKey();
  let words = dayLabel(key);
  if (key === today) words = 'today';
  else if (key === addDays(today, -1)) words = 'yesterday';
  return capital ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

/** "Fri 2 Oct, 09:30" (24 hour, the device's time). */
export function dayAndTime(value) {
  if (!value) return '';
  return `${dayWords(value, { capital: true })}, ${formatClockTime(value)}`;
}
