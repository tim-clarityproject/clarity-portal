// The client pages' opening lines (Polish 1, rule 12; example-pages-25nov.html): every page opens
// with its title and one 16px grey line saying what the page is for or what's happening today, in
// the portal's voice: a full sentence, no jargon, never "pay". Kept here, one file, so Tim can read
// and approve them together. A line that depends on the day is a function of plain facts.

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const count = (n) => NUMBER_WORDS[n] || String(n);

/**
 * Home's line (example: "Two things need you today, and your coaching session is tomorrow at 09:00.").
 * needs: how many things are waiting on the person. session: the soonest coaching session as
 * { when: 'today' | 'tomorrow' | 'later', day: 'Mon 30 Nov', time: '09:00' } or null.
 * coached: whether the person has a coach (with no coach there is no session to mention).
 */
export function homeLine({ needs = 0, session = null, coached = false } = {}) {
  const needsPart = needs === 0 ? 'Nothing needs you today' : `${count(needs)} ${needs === 1 ? 'thing needs' : 'things need'} you today`;
  if (session) {
    const at = session.when === 'today' ? `today at ${session.time}`
      : session.when === 'tomorrow' ? `tomorrow at ${session.time}`
        : `on ${session.day} at ${session.time}`;
    return `${needsPart}, and your coaching session is ${at}.`;
  }
  if (coached) return `${needsPart}, and no coaching session is booked yet.`;
  return needs === 0 ? 'Here is your day: what to log, and what’s on today.' : `${needsPart}.`;
}

export const HOME = Object.freeze({
  needsLabel: 'What needs you',
  needsNone: 'Nothing needs you right now.',
  needsAll: 'View all',
  upcomingLabel: 'Upcoming',
  upcomingNone: 'Nothing in the next few weeks.',
  upcomingAll: 'View calendar',
  logLabel: 'Log today',
  logLink: 'View your week',
  todayLabel: 'Today',
  addLabel: 'Add to-do',
});

export const DASHBOARD_LINE = 'How your weeks are going, and what’s moving.';

export const ACCOUNT_LINE = 'Your details, your coaching and how the portal looks.';

/** The brand-new client (polish 1, "A brand-new client"): the title, then this line, on every page that would be empty. */
export const preparingTitle = (firstName) => (firstName ? `Welcome, ${firstName}` : 'Welcome');
export const preparingLine = (coachFirstName) => `Your portal is still being prepared. ${coachFirstName || 'Your coach'} will let you know as soon as it’s ready.`;

/** The Daily plan, inside its tool frame (rule 21). */
export const DAILY_PLAN = Object.freeze({
  name: 'Plan my day',
  closed: 'Saved. Pick up where you left off from Home.',
});
