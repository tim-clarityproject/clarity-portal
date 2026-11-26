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
export const financesLine = (startMonth) => `Here is what’s come in, what’s due and what’s ahead, for the year from 1 ${startMonth}.`;

export const FINANCES = Object.freeze({
  newInvoice: 'New invoice',
  // The income chart with nothing in it yet (rule 16: a sentence and one next step, never a blank chart).
  chartEmpty: 'Nothing has come in this year yet, and each month’s income will show here as it does.',
  chartEmptyAction: 'Add a payment',
  statsLabel: 'At a glance',
});

// Who can see a page is the eye beside its title, never words in its line (5e rule 10; Tim's walk of Stage B, item 5).
export const TODOS_LINE = 'Everything you plan to do is here, day by day.';
export const todoListLine = (finished) => (finished ? 'This list is finished, and its to-dos stay here.' : 'This list holds your own to-dos.');
export const SETTINGS_LINE = 'Set how your practice runs here: your details, booking, calendars and the rest.';
export const settingsSectionLine = (label) => `Your ${label.charAt(0).toLowerCase()}${label.slice(1)} settings are here.`;
export const BOARDS_LINE = 'Track anything that moves in stages, one card at a time.';
export const boardPageLine = (shared) => (shared ? 'The cards on this board move through it stage by stage.' : 'Your cards move across this board stage by stage.');
export const AUTOMATIONS_LINE = 'Small jobs are done for you as leads move, and nothing is ever sent.';
export const OPEN_FOR_CALLS_LINE = 'These are the times people outside can book a call with you.';
export const POLL_LINE = 'Here are the times you offered, and who can make each one.';
/** A poll's line: who it's with (when the title is its own words), then what the page shows. */
export const pollLine = (names) => (names ? `Here are the times you offered ${names}, and who can make each one.` : POLL_LINE);

/** A coaching session's line: who it's with, then where it stands. */
export function sessionLine({ name, sent = false, happened = false, outcome = null }) {
  if (sent) return 'The recap has been sent, so this session stays as it is.';
  if (!happened && !outcome) return `Your session with ${name} hasn’t happened yet.`;
  return `Say what happened with ${name}, then write and send the recap.`;
}

// ---------------------------------------------------------------------------------------------------------------
// B4, the coach's people (Polish 1, Stage B): Clients, Past clients, a client's page, an organisation, a group,
// Leads, a lead, Cold leads, Lead reports and Network. Their openings, card labels and empty states.

export const PEOPLE = Object.freeze({
  clientsTitle: 'Clients',
  clientsLine: 'Here are the people you coach, and when you see each of them next.',
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
  pastLine: 'Here are the people you’ve coached, and when to check in with each of them.',
  pastLabel: 'Past clients',
  leadsTitle: 'Leads',
  leadsLine: 'Here are the people who might become clients, and the next step with each of them.',
  leadsAll: 'All leads',
  leadName: 'Their name',
  coldTitle: 'Cold leads',
  coldLine: 'These leads went quiet, and each shows what happened and when to check in again.',
  reportsTitle: 'Lead reports',
  reportsLine: 'See where your clients come from, and how many of your leads become clients.',
  networkTitle: 'Network',
  networkLine: 'Here are the people you keep in touch with, and who is due a catch-up.',
  orgLine: 'Here are the people you coach there, and what you know about the organisation.',
  groupLine: 'Here are the people in this group and its coaching sessions.',
});

/** A client's page: their role and city when known, else what the page is for. */
export function clientLine({ role = '', city = '' } = {}) {
  const facts = [role, city].filter(Boolean);
  if (role && city) return `Their role is ${role}, and they’re based in ${city}.`;
  if (role) return `Their role is ${role}.`;
  if (city) return `They’re based in ${city}.`;
  return 'Their coaching, notes and what comes next are all in one place.';
}

/** A workshop's line: who it's for and where, then where it stands. */
export function workshopLine({ organisation = null, place = null, past = false }) {
  const where = [organisation ? `For ${organisation}` : null, place ? `${organisation ? 'at' : 'At'} ${place}` : null].filter(Boolean).join(' ');
  const state = past ? 'See who came and what they said.' : 'See who has registered, and what goes to them.';
  return where ? `${where}, ${state.charAt(0).toLowerCase()}${state.slice(1)}` : state;
}

/** A lead's page (B4): what the page is for, in a sentence. */
export function leadLine({ first = '', won = false, cold = false } = {}) {
  if (won) return `${first} is a client now, and their story so far is kept here.`;
  if (cold) return `See why ${first} went quiet, and when to check in again.`;
  return `See where things stand with ${first}, and the next step.`;
}

// ---------------------------------------------------------------------------------------------------------------
// C4, the agreement screens M28 v6 doesn't draw (Polish 1, Stage C): an agreement's own page, its changes in focus
// mode (Extend, Pause, End early, Give money back, Cancel within 14 days), What to say and an organisation's billing.
export const AGREEMENT_LINES = Object.freeze({
  whatToSay: 'Here are words for the moments people go soft on, for you to say and never to send.',
  orgBilling: 'Set it once, and every invoice to them follows it.',
  billingEmpty: 'Their billing isn’t set up yet, so invoices go to their main contact with 30 days to settle.',
  changeClosed: 'Nothing has changed.',
  checkQuestion: 'Does this read right?',
  sessionsEmpty: 'No coaching sessions are booked yet.',
});

/** An agreement's own page: where it stands, in one sentence. Days are already in words. */
export function agreementLine({ first = '', status = '', signedOn = '', end = '', pausedTo = '', endingOn = '' } = {}) {
  if (status === 'cancelled') return 'It was cancelled within the 14 days.';
  if (status === 'ended' || status === 'ended_not_renewed' || status === 'expired') return end ? `It ended on ${end}.` : 'It has ended.';
  if (!signedOn) return first ? `${first} hasn’t signed it yet.` : 'It hasn’t been signed yet.';
  if (endingOn) return `It was signed on ${signedOn}, and it ends early, on ${endingOn}.`;
  if (pausedTo) return `Coaching is paused until ${pausedTo}, and it now runs until ${end}.`;
  return end ? `It was signed on ${signedOn}, and it runs until ${end}.` : `It was signed on ${signedOn}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// C2, the coach's money screens (Polish 1, Stage C; M28 v6 "needs", "sent", "invoice", "hours"): Needs you, Sent, a
// new organisation invoice and a block of hours. Each page's one line, in the portal's voice.
const C2_NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** Needs you's line (M28: "Five things are drafted and waiting for you. Nothing goes until you send it."). */
export function needsYouLine(count) {
  if (!count) return 'Nothing is waiting for you. Drafted reminders and invoices will show here.';
  const n = count <= 10 ? C2_NUMBERS[count] : String(count);
  return `${n} ${count === 1 ? 'thing is' : 'things are'} drafted and waiting for you. Nothing goes until you send it.`;
}

export const MONEY_LINES = Object.freeze({
  newInvoice: 'From the coaching sessions logged since the last invoice. Untick any to leave off.',
  // Who sees the balance is the eye's to say, never the line's (5e rule 10; FX7): the line says what the page is for.
  hours: () => 'Each entry here comes off the block, and the balance shows what’s left.',
  invoiceSent: 'Here is where it went, when it’s due and whether it’s settled.',
});

// ---------------------------------------------------------------------------------------------------------------
// C1, the agreement builder, packages and standard terms (Polish 1, Stage C; M28 v6 "build" and "packages").
export const BUILDER_LINES = Object.freeze({
  packages: 'Set up once, then start any agreement from one and adjust it for the person.',
  terms: 'Every clause is here in order, and what you change becomes the wording for new agreements, while signed ones keep theirs.',
  termsAssociate: 'Every clause is here in order, as your practice’s owner has set it.',
  solicitor: 'Have a solicitor check any change before you use it with a client.',
  clauses: (first) => `Every clause is here in order, and you can edit any of them for ${first} or for everyone.`,
  clausesAssociate: (first) => `Every clause is here in order, and you can edit any of them for ${first}.`,
  check: (first) => `Here is every way this agreement differs from your standard, then what ${first} will see first.`,
  sign: (first) => `You sign first, then ${first} gets an email from you to read and sign it in the portal.`,
  start: (first) => `An agreement is with a client, so ${first} becomes your client first, and you can undo it.`,
});
/** × on the builder: "Saved. Pick up where you left off from Sam’s page." */
export const builderClosed = (where) => `Saved. Pick up where you left off from ${where}.`;
