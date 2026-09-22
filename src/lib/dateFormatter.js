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
