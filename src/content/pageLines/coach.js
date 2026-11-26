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
  weekCallsNone: 'No calls this week.',
  monthNone: 'Nothing settled yet this month.',
  // The offer for now as Today's main button (Tim's walk, item 23), in the coach's own voice, as client Home's.
  offerButtons: { plan: 'Plan my day', close: 'Close my day', review: 'Start my weekly review', energy: 'Rate my energy' },
  offerNotNow: 'Not now',
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
/** The calendar's one main action (the example; Tim's walk, item 25): booking a call is its one step. */
export const CALENDAR_ADD = 'Add a session';
/** The quiet link under the calendar that opens its settings in place (Tim's walk, item 26). */
export const CALENDAR_SETTINGS = 'Calendar settings';

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

// ---------------------------------------------------------------- Polish 1, Stage B, B5: the coach's work and frame
// Finances, To-dos, Settings, Boards, Automations, a coaching session, Open for calls, a poll, a workshop and Your hours
// and pay. One line each, what the page is for, in the portal's voice.

/** Finances (every tab): what the page is for, with the financial year's first month ("April"). */
export const financesLine = (startMonth) => `What’s come in, what’s due and what’s ahead, for the year from 1 ${startMonth}.`;

export const FINANCES = Object.freeze({
  newInvoice: 'New invoice',
  // The income chart with nothing in it yet (rule 16: a sentence and one next step, never a blank chart).
  chartEmpty: 'Nothing has come in this year yet. Each month’s income shows here once a payment is in.',
  chartEmptyAction: 'Add a payment',
  statsLabel: 'At a glance',
});

export const TODOS_LINE = 'Everything you plan to do, by day. Only you can see it.';
export const todoListLine = (finished) => (finished ? 'This list is finished. Its to-dos stay here.' : 'A list of your own to-dos. Only you can see it.');
export const SETTINGS_LINE = 'How your practice runs: your details, booking, calendars and the rest.';
export const settingsSectionLine = (label) => `Your ${label.charAt(0).toLowerCase()}${label.slice(1)} settings.`;
export const BOARDS_LINE = 'Anything you track in stages, one card at a time.';
export const boardPageLine = (shared) => (shared ? 'Shared with your associates, who can read it but not change it.' : 'Only you can see this board.');
export const AUTOMATIONS_LINE = 'Small jobs done for you as leads move. Nothing is ever sent.';
export const OPEN_FOR_CALLS_LINE = 'Times people outside can book a call with you.';
export const POLL_LINE = 'The times you offered, and who can make each one.';
/** A poll's line: who it's with (when the title is its own words), then what the page shows. */
export const pollLine = (names) => (names ? `With ${names}. The times you offered, and who can make each one.` : POLL_LINE);

/** A coaching session's line: who it's with, then where it stands. */
export function sessionLine({ name, sent = false, happened = false, outcome = null }) {
  if (sent) return `With ${name}. The recap has been sent, so this session stays as it is.`;
  if (!happened && !outcome) return `With ${name}. It hasn’t happened yet.`;
  return `With ${name}. Say what happened, then write and send the recap.`;
}

// ---------------------------------------------------------------------------------------------------------------
// B4, the coach's people (Polish 1, Stage B): Clients, Past clients, a client's page, an organisation, a group,
// Leads, a lead, Cold leads, Lead reports and Network. Their openings, card labels and empty states.

export const PEOPLE = Object.freeze({
  clientsTitle: 'Clients',
  clientsLine: 'The people you coach, and when you see each of them next.',
  everyone: 'Everyone',
  yourClients: 'Your clients',
  groupsLabel: 'Groups',
  workshopsLabel: 'Workshops',
  noClients: 'Your clients will appear here once you add them.',
  noClientsAct: 'Add a whole team from a spreadsheet',
  noMatch: 'Nobody matches. Clear the search or the filters to see everyone.',
  noGroups: 'A group is a team you coach together. Your groups will appear here.',
  noWorkshops: 'Your workshops will appear here once you add one.',
  addTeam: 'Add a team from a spreadsheet',
  export: 'Export',
  pastClients: 'Past clients',
  quickName: 'Their name',
  quickMore: 'Add their details too',
  notBooked: 'Not booked',
  pastTitle: 'Past clients',
  pastLine: 'The people you’ve coached, and when to check in with each of them.',
  pastLabel: 'Past clients',
  leadsTitle: 'Leads',
  leadsLine: 'The people who might become clients, and the next step with each of them.',
  leadsAll: 'All leads',
  leadName: 'Their name',
  coldTitle: 'Cold leads',
  coldLine: 'Leads that went quiet, with what happened and when to check in again.',
  reportsTitle: 'Lead reports',
  reportsLine: 'Where your clients come from, and how many of your leads become clients.',
  networkTitle: 'Network',
  networkLine: 'The people you keep in touch with, and who is due a catch-up.',
  orgLine: 'The people you coach there, and what you know about the organisation.',
  groupLine: 'The people in this group and its coaching sessions.',
});

/** A client's page: their role and city when known, else what the page is for. */
export function clientLine({ role = '', city = '' } = {}) {
  const facts = [role, city].filter(Boolean);
  if (facts.length === 2) return `${facts[0]}, ${facts[1]}.`;
  if (facts.length === 1) return `${facts[0]}.`;
  return 'Their coaching, notes and what comes next, in one place.';
}

/** A workshop's line: who it's for and where, then where it stands. */
export function workshopLine({ organisation = null, place = null, past = false }) {
  const where = [organisation ? `For ${organisation}` : null, place ? `${organisation ? 'at' : 'At'} ${place}` : null].filter(Boolean).join(' ');
  const state = past ? 'Who came and what they said.' : 'Who has registered, and what goes to them.';
  return where ? `${where}. ${state}` : state;
}

/** A lead's page (B4): what the page is for, in a sentence. */
export function leadLine({ first = '', won = false, cold = false } = {}) {
  if (won) return `${first} is a client now. Their story so far is kept here.`;
  if (cold) return `${first} went quiet. What happened, and when to check in again, are here.`;
  return `Where things stand with ${first}, and the next step.`;
}
