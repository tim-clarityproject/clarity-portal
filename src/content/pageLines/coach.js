// The coach pages' opening lines (Polish 1, rule 12; example-pages-25nov.html's Coach Today, Coach
// Calendar and the public booking page): every page opens with its title and one 16px grey line
// saying what the page is for or what's happening today, in the portal's voice: a full sentence,
// no jargon, never "pay". Kept here, one file, so Tim can read and approve them together. A line
// that depends on the day is a function of plain facts. They, them and their (coach rule 44).

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const count = (n) => NUMBER_WORDS[n] || String(n);
const lower = (w) => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w);

/**
 * Today's line (example: "Three coaching sessions and three things that need you.").
 * sessions: today's coaching sessions still to come or happening; needs: how many things need the coach.
 */
export function coachTodayLine({ sessions = 0, needs = 0 } = {}) {
  const s = sessions === 0 ? null : `${count(sessions)} coaching ${sessions === 1 ? 'session' : 'sessions'}`;
  const n = needs === 0 ? null : `${needs === 1 ? 'one thing that needs' : `${lower(count(needs))} things that need`} you`;
  if (s && n) return `${s} and ${n}.`;
  if (s) return `${s} today, and nothing needs you right now.`;
  if (n) return `No coaching sessions today, and ${n}.`;
  return 'No coaching sessions today, and nothing needs you right now.';
}

/** The main button for the next session today: "Open Sam’s session", or a group's own name. */
export const openSessionWords = ({ first, group = null }) => (group ? `Open ${group}` : `Open ${first}’s session`);

export const COACH_TODAY = Object.freeze({
  needsLabel: 'Needs you',
  needsNone: 'Nothing needs you right now.',
  sessionsLabel: 'Coaching sessions',
  sessionsNone: 'No coaching sessions today.',
  todosLabel: 'To-dos',
  todosAll: 'View all',
  todosNone: 'Nothing is planned for today.',
  attentionLabel: 'Who needs attention',
  monthLabel: 'This month',
  monthLink: 'Finances',
  weekLabel: 'This week',
  weekHours: 'Coaching hours',
  weekCalls: 'Calls',
  weekEdit: 'Edit',
});

/**
 * This month's sentence under the figure (example: "Settled so far. £2,250 is due in the next 7 days.").
 * urgent: Finances' one urgent note ("1 overdue", "Cash dips in May") or null.
 */
export function monthNote(urgent) {
  if (!urgent) return 'Settled so far.';
  const overdue = /^(\d+) overdue$/.exec(urgent);
  if (overdue) return `Settled so far. ${Number(overdue[1]) === 1 ? 'One invoice is' : `${count(Number(overdue[1]))} invoices are`} overdue.`;
  return `Settled so far. ${urgent.charAt(0).toUpperCase()}${urgent.slice(1)}.`;
}

export const CALENDAR_LINE = 'Your coaching sessions, calls and visits in one place.';

/** The calendar's one filter, in one drop-down (rule 17). */
export const CALENDAR_TYPES = Object.freeze([
  { value: 'all', label: 'All types' },
  { value: 'sessions', label: 'Coaching sessions' },
  { value: 'calls', label: 'Calls' },
  { value: 'todos', label: 'To-dos' },
  { value: 'other', label: 'Everything else' },
]);

/**
 * The public booking page (example: "A 30-minute call to talk about coaching. Choose a day, then a time.").
 * description: the call type's own sentence, if the coach wrote one.
 */
export function bookingLine({ minutes, zoom = false, description = '' }) {
  const length = `${minutes}-minute call${zoom ? ' on Zoom' : ''}`;
  const what = description ? `${description.trim().replace(/([^.!?])$/, '$1.')} It’s a ${length}.` : `A ${length}.`;
  return `${what} Choose a day, then a time.`;
}

export const BOOKING = Object.freeze({
  dayLabel: 'Choose a day',
  continue: 'Continue',
  back: 'Change the time',
  detailsTitle: 'Your details',
  detailsLine: (first) => (first ? `So ${first} knows who they’re speaking to.` : 'So we know who we’re speaking to.'),
  name: 'What’s your name?',
  email: 'What’s your email?',
  bookedTitle: 'You’re booked',
  zoneLine: (zone) => `Times are in ${zone}.`,
  zoneEdit: 'Change the time zone',
});
