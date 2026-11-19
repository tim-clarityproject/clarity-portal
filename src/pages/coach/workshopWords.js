import { zonePlace } from '../../lib/time';

// A workshop's day and times, in its own place ("Thu 26 Nov, 09:30 to
// 12:30"), with the place named when the reader is somewhere else. Dates
// in words, 24-hour times (time zone rules 4 and 6).
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function partsIn(instant, zone) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: get('weekday'), time: `${get('hour')}:${get('minute')}` };
}

/** The day key ("2026-11-26") of an instant in a place. */
export function dayKeyIn(instant, zone) {
  const p = partsIn(instant, zone || 'Europe/London');
  if (!p) return '';
  const two = (n) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

export function workshopWhen(workshop, { readerZone = null, thisYear = new Date().getFullYear() } = {}) {
  const zone = workshop?.time_zone || 'Europe/London';
  const a = workshop?.starts_at ? partsIn(workshop.starts_at, zone) : null;
  if (!a) return '';
  const b = workshop.ends_at ? partsIn(workshop.ends_at, zone) : null;
  const day = `${DAYS.includes(a.weekday) ? a.weekday : a.weekday.slice(0, 3)} ${a.day} ${MONTHS[a.month - 1]}${a.year === thisYear ? '' : ` ${a.year}`}`;
  const times = b ? `${a.time} to ${b.time}` : a.time;
  const elsewhere = readerZone && readerZone !== zone;
  return `${day}, ${times}${elsewhere ? ` ${zonePlace(zone)} time` : ''}`;
}
