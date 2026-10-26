// Date keys for the scoring library. Every day here is a person's own local
// day, written 'YYYY-MM-DD' (methods M0.2); the arithmetic is on whole days,
// so time zones and clock changes never move a day. Pure code: no Date
// object ever reads the device's clock or zone.

const DAY_MS = 86400000;

/** Days since 1970-01-01 for a date key. */
export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** The date key for a day number. */
export function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The date key n days after (or before, for negative n) a date key. */
export function addDays(key, n) {
  return fromDayNumber(dayNumber(key) + n);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/** Day of the week, Monday 0 to Sunday 6. */
export function weekday(key) {
  // 1970-01-01 was a Thursday (3).
  return (((dayNumber(key) + 3) % 7) + 7) % 7;
}

/** Every date key from a to b, both included. */
export function dateRange(a, b) {
  const out = [];
  for (let n = dayNumber(a); n <= dayNumber(b); n += 1) out.push(fromDayNumber(n));
  return out;
}

/** Calendar months of 30.44 days between two date keys (methods M9.1). */
export const DAYS_PER_MONTH = 30.44;
export function monthsBetween(a, b) {
  return daysBetween(a, b) / DAYS_PER_MONTH;
}
