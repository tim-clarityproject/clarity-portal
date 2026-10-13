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

  // Format time as 12-hour with am/pm
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;

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

// Plain UK date, no time (e.g. "13 October 2026") - for summary pages'
// "Created <date>" line (prompt 7).
export const formatUkDate = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Format time only as 12-hour with am/pm (e.g. "03:14 PM")
export const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDbTimestamp(dateStr);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Format date and time with ordinal suffix on day (e.g. "Sep 24th, 2026, 02:08 PM")
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

  // Format time as 12-hour with AM/PM
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  return `${month} ${day}${ordinal}, ${year}, ${timeStr}`;
};
