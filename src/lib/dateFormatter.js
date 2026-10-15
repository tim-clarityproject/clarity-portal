// The live `decisions`/`journal_entries` created_at/updated_at columns
// are "timestamp without time zone" holding a UTC clock reading (the
// repo's migration files say timestamptz, but the live database does
// not match them - confirmed from the live data, not just the SQL
// files). Supabase therefore returns a string like
// "2026-10-13T09:02:56.213858" with no Z or +hh:mm ending. `new
// Date(...)` on a string with no ending reads it as the DEVICE'S
// local time, not UTC - a plan saved at 10:02 BST comes back out as
// "09:02 local", an hour behind. Every read of a saved timestamp
// should go through this first. Already-correct values (a trailing Z,
// a +hh:mm/-hh:mm offset, or an actual Date instance - e.g. once the
// column type is ever fixed to timestamptz) are returned unchanged.
export const parseDbTimestamp = (value) => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date(value);
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);
  return new Date(`${value.replace(' ', 'T')}Z`);
};

// "2026-10-13" from the device's own local date, never from
// toISOString() (which is UTC - between midnight and 1am BST that
// gives yesterday's date).
export const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// The one place a time of day is turned into text. 24 hour clock, no
// am/pm, leading zero ("07:53", "19:26"), in the DEVICE's local time
// (parseDbTimestamp reads the stored UTC reading as UTC, and the Date
// getters below convert it to the device's own offset, BST/GMT
// included). Everything that shows a time goes through this.
export const formatClockTime = (value) => {
  if (!value) return '';
  const date = parseDbTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// "14 Oct, 19:26" - UK day-before-month order, 3-letter month, 24 hour.
export const formatDayMonthTime = (value) => {
  if (!value) return '';
  const date = parseDbTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${date.getDate()} ${month}, ${formatClockTime(value)}`;
};

export const formatDateWithOrdinal = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });

  // Get ordinal suffix
  let ordinal = 'th';
  if (day % 10 === 1 && day !== 11) ordinal = 'st';
  else if (day % 10 === 2 && day !== 12) ordinal = 'nd';
  else if (day % 10 === 3 && day !== 13) ordinal = 'rd';

  return `${weekday} ${day}${ordinal} ${month}, ${year}`;
};

export const formatDateAndTime = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });

  // Get ordinal suffix
  let ordinal = 'th';
  if (day % 10 === 1 && day !== 11) ordinal = 'st';
  else if (day % 10 === 2 && day !== 12) ordinal = 'nd';
  else if (day % 10 === 3 && day !== 13) ordinal = 'rd';

  const timeStr = formatClockTime(dateStr);

  return `${weekday} ${day}${ordinal} ${month}, ${year} - ${timeStr}`;
};

// Format date with abbreviated month and ordinal suffix (e.g. "Friday 25th Sep, 2026")
export const formatReviewDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });

  // Get ordinal suffix
  let ordinal = 'th';
  if (day % 10 === 1 && day !== 11) ordinal = 'st';
  else if (day % 10 === 2 && day !== 12) ordinal = 'nd';
  else if (day % 10 === 3 && day !== 13) ordinal = 'rd';

  return `${weekday} ${day}${ordinal} ${month}, ${year}`;
};

// "Friday 2nd October" - weekday, ordinal day, full month, no year (the
// small coral date label above a review's title - prompt 8). Takes a
// Date (already run through parseDbTimestamp by the caller) or a
// "YYYY-MM-DD" local date key.
export const formatReviewDayLabel = (value) => {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : value;
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-GB', { month: 'long' });
  const day = date.getDate();
  let ordinal = 'th';
  if (day % 10 === 1 && day !== 11) ordinal = 'st';
  else if (day % 10 === 2 && day !== 12) ordinal = 'nd';
  else if (day % 10 === 3 && day !== 13) ordinal = 'rd';
  return `${weekday} ${day}${ordinal} ${month}`;
};

// "Friday 2 October" - plain words, cardinal day (no ordinal), no
// year (Daily Journal's date heading and its log rows - the spec is
// explicit that this one uses plain words, not formatReviewDayLabel's
// ordinal form). Takes a Date or a "YYYY-MM-DD" local date key.
export const formatPlainDayLabel = (value) => {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : value;
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} ${date.getDate()} ${month}`;
};

// "29 Sep" - day + short month, no year, no weekday (Weekly Momentum
// Check-in's generated title: "Weekly momentum check-in, week of 29
// Sep" - prompt 10b). Takes a "YYYY-MM-DD" local date key.
export const formatWeekOf = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// Plain UK date, no time (e.g. "13 October 2026") - for summary pages'
// "Created <date>" line (prompt 7).
export const formatUkDate = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

// "Fri 2 Oct 2026" - short weekday, cardinal day, short month, year, no
// time (Personal Operating Plan's version history/archived-plan rows -
// prompt 9 fidelity patch, matching the approved mock-up exactly).
export const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

// Time only, 24 hour (e.g. "15:14") - see formatClockTime.
export const formatTimeOnly = (dateStr) => formatClockTime(dateStr);

// Format date and time with ordinal suffix on day (e.g. "Sep 24th, 2026, 14:08")
export const formatDateTimeWithOrdinal = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  // Get ordinal suffix
  let ordinal = 'th';
  if (day % 10 === 1 && day !== 11) ordinal = 'st';
  else if (day % 10 === 2 && day !== 12) ordinal = 'nd';
  else if (day % 10 === 3 && day !== 13) ordinal = 'rd';

  const timeStr = formatClockTime(dateStr);

  return `${month} ${day}${ordinal}, ${year}, ${timeStr}`;
};
