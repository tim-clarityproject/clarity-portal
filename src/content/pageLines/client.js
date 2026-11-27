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

/** What every tool says when its × closes it part-way (rule 21; the lead, Polish 1 Stage B). The Life balance
 *  review's check-in keeps its own. */
export const TOOL_CLOSED = 'Saved. Pick up where you left off from Home.';

/** The Daily plan, inside its tool frame (rule 21). Its name is "Daily plan" everywhere, the eyebrow included
 *  (rule 26a; walk item 9, 27 Nov: the example page's "Plan my day" was its old name). */
export const DAILY_PLAN = Object.freeze({
  name: 'Daily plan',
  closed: TOOL_CLOSED,
});

/* ------------------------------------------------------------------ B1 (Stage B): hubs, the plan, the sprint and the lists */

/** Each hub's opening line (Plan, Reset and Review keep their M3 lines from navigation.js's HUBS). */
export const HUB_LINES = Object.freeze({
  personal: 'Your dashboard and the tools to plan, reset and review are all here.',
  plan: 'Set your direction and decide well.',
  reset: 'Get back to your best when the pressure is on.',
  review: 'Turn what happened into better performance.',
  interpersonal: 'These tools help with the conversations and meetings that matter.',
  strategic: 'These tools help you set your team’s direction and check its work backs it.',
});

/** The label over a hub's first group of tiles, where a hub has more than one group or the brief names one. */
export const HUB_FIRST_GROUP = Object.freeze({ plan: 'Plan ahead', review: 'Reflect' });

/** How long a tile's tool takes, where navigation.js's TOOLS has no time of its own. */
export const HUB_TIMES = Object.freeze({ ipp: 'Set up once, ~20 minutes', sprint: 'Every week' });

export const B1_LINES = Object.freeze({
  myPlans: 'Every plan you’ve saved is here, newest first.',
  myReviews: 'Every review you’ve saved is here, newest first.',
  myJournals: 'Every journal entry you’ve written is here, newest first.',
  afterAction: 'Look back on one event while it’s fresh.',
  plan: 'This is what you’re aiming for, and the Strategies that get you there.',
  planEmpty: 'Your plan isn’t set up yet.',
  planHistory: 'Every version of your plan is here, newest first.',
  planVersion: 'This is your plan as it was saved in this version.',
  sprint: 'Here are this week’s habits and to-dos, and how the week is going.',
  sprintNone: 'No sprint is running right now.',
  sprintYear: 'Here are your sprints this year, week by week.',
  recovery: 'Take a lighter week and come back stronger.',
  recoveryToday: 'Today is about getting back to your best.',
  pop: 'This is your Personal Operating Plan, as you wrote it.',
  popEdit: 'Edit your Personal Operating Plan.',
  popHistory: 'Every version of your Personal Operating Plan is kept here.',
  popArchived: 'Plans you’ve put away stay here, and you can still read them.',
  about: 'Here is who is behind The Clarity Portal, and why it exists.',
  profile: 'This is the name your coach and the portal use for you.',
  coaching: 'Your coaching agreements, sessions and invoices are all here.',
  coachingSessions: 'Your coaching sessions, past and coming, are all here.',
  legal: 'These are the terms that apply when you use The Clarity Portal.',
});

/* ------------------------------------------------------------------ B3 (Stage B): the tools */

/** The Journal's question, in its tool frame (Tim's walk of Stage B, item 1: the Journal runs in focus mode). */
export const JOURNAL_QUESTION = 'What’s on your mind?';

/** The opening line of each tool's own page (the tools themselves run in focus mode, rule 21). Who can see a page is
 *  the eye alone, never words in its line (5e rule 10; Tim's walk of Stage B, item 5). */
export const B3_LINES = Object.freeze({
  journal: 'Write what’s on your mind, for as long as you like.',
  breathe: 'Take a few slow minutes to settle your body before what comes next.',
  breathingSessions: 'Every breathing session you’ve finished is here, newest first.',
  peakMoments: 'Plan how you’ll be at your best for the moments that matter most.',
  travelPlan: 'Arrive rested: when to sleep, eat and see daylight on your trip.',
  strategicAlignment: 'See how well a team’s work lines up with its strategy.',
  feedbackSummary: 'Here is your script and the questions you’ll ask.',
  preMortemSummary: 'Here is how this could go wrong, and what you’ll do about it.',
  meetingSummary: 'Your meeting is on one page, ready to share.',
  timeAuditSummary: 'Here is what you’ll stop, hand over or shrink, and the time it gives back.',
  pressurePlanSummary: 'This is what you’ll do if the pressure comes.',
  missionReview: 'See how you’re living your Mission this month.',
  getUnstuck: 'Here is your plan to get unstuck, from your goal to your first step.',
  teamCheck: 'See how your team is performing, person by person, and what you’ll do next.',
  emotionalWash: 'Here is what happened, how it felt, and what you’ll do now.',
});

/* ------------------------------------------------------------------ B2 (Stage B): the daily, weekly and monthly reviews */

/** The opening line of each review's own page (the reviews themselves run in focus mode, rule 21). */
export const B2_LINES = Object.freeze({
  dailyReview: 'Close your day: what you did, what went well and what’s next.',
  debrief: 'Look back on your week, then set up the next one.',
  monthlyReview: 'Once a month, check your hardware and your software.',
  sprintReview: 'Look back on your sprint before you start the next one.',
  sprintStart: 'Choose your habits and dates for the weeks ahead.',
  sprintReviewRead: 'This is how your sprint went, in your own words.',
  lifeBalance: 'See how satisfied you are across your life, and how it changes over time.',
  lifeBalanceAreas: 'Choose the areas on your wheel, and removed areas keep their past scores.',
  lifeBalanceTargets: 'Choose the score you’d be happy with in each area, since not every area needs a 10.',
  dailyPlanSummary: 'This is the plan you made for this day.',
  reviewSummary: 'This is what you wrote when you looked back.',
  reviewPlanSummary: 'This is how the day went against your plan.',
  reviewPlan: 'Look back on the day against your plan.',
});

/** The Life balance review's check-in, inside its tool frame (rule 21). */
export const LIFE_BALANCE_TOOL = Object.freeze({
  name: 'Life balance review',
  closed: 'Saved. Pick up where you left off with Continue check-in.',
});
