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
  const date = new Date(dateStr);
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

// Format time only as 12-hour with am/pm (e.g. "03:14 PM")
export const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

// Format date and time with ordinal suffix on day (e.g. "Sep 24th, 2026, 02:08 PM")
export const formatDateTimeWithOrdinal = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
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
