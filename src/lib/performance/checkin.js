// The Hardware and Software check-in (mock-up M12 version 14, approved by
// Tim on 23 Oct; Phase 5 step 1), worked out in one place. Pure code: no
// database, no React, no device clock (today is passed in), tested in
// tests/performance/checkin.test.mjs.
//
// Two flows on the same questions: the First check-in for coaching
// clients (its five goal questions first) and the monthly check-in for
// everyone. One question per screen, one tap each, the % bar. Every score
// and figure comes from src/lib/scores (methods M13, m13.js); this file
// only holds the words, the order of the screens and what the results
// screen says about those figures.
//
// The answers are stored as the option chosen (029's checkins.answers),
// never the score, with the keys m13.js scores. Sleep quality, eating
// and physical health use the portal's five words, Fair in the middle
// (part 4, 3 Nov); the database keeps 'ok' for it, as 029 requires.
//
// A check-in belongs to the calendar month it is started in (029: one row
// per person and month, the month's first day), named in words: "October
// check-in", or "First check-in" (writing rule 60).

import { HARDWARE_AREAS, SOFTWARE_AREAS, m0Round, m13CheckinScores, m13Results } from '../scores/index.js';

export const CHECKIN_TIME = '~3 minutes';
/** The First check-in with its goals (spec: about 6 minutes the first time). */
export const FIRST_CHECKIN_TIME = '~6 minutes';
export const CHECKIN_ROUTE = '/check-in';
/** Each goal answer is kept short enough for the coach's page (029 caps the goals at 20,000 bytes in all). */
export const GOAL_MAX = 1000;
export const GOAL_ITEM_MAX = 150;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ------------------------------------------------------------------ answers

const opts = (pairs) => pairs.map(([value, label]) => ({ value, label }));
// The portal's five quality words (part 4, 3 Nov): Fair, stored as 'ok'.
const QUALITY = opts([['very_poor', 'Very poor'], ['poor', 'Poor'], ['ok', 'Fair'], ['good', 'Good'], ['very_good', 'Very good']]);
const LEVEL = opts([['very_low', 'Very low'], ['low', 'Low'], ['ok', 'OK'], ['high', 'High'], ['very_high', 'Very high']]);
const OFTEN = opts([['never', 'Never'], ['rarely', 'Rarely'], ['sometimes', 'Sometimes'], ['often', 'Often'], ['always', 'Always']]);
const HOW_MUCH = opts([['not_at_all', 'Not at all'], ['a_little', 'A little'], ['moderately', 'Moderately'], ['quite_a_lot', 'Quite a lot'], ['very_much', 'Very much']]);

const PAST = 'In the past month, on average, ';

/** What each ⓘ on a personal question says (writing rule 45): what the area is, why it's asked, then who uses it. */
export function whyLines(kind, coachName) {
  const use = coachName ? `${coachName} uses this to help, never to judge.` : 'It’s here to help you, never to judge.';
  if (kind === 'alcohol') return ['Alcohol counts in Fuel and alcohol, one of the six Hardware areas.', 'Alcohol affects sleep and recovery.', use];
  if (kind === 'mood') return ['Mood and energy is one of the six Hardware areas.', 'Mood and energy shape how you lead and decide.', use];
  return ['Health is one of the six Hardware areas.', 'Health affects everything else.', use];
}

/**
 * The one-tap questions, in M12's order (copied from its intakeSteps).
 * H14 to H16 (travel) are context, never scored; H15 and H16 are asked
 * only after a Yes to H14. H5 has the three answers the methods and 029
 * score and store (0, 1, 2 or more days), see the report.
 */
export const QUESTIONS = Object.freeze([
  { code: 'H1', label: 'Hardware · Sleep', question: `${PAST}how many hours of sleep did you get a night?`, nudges: ['Count actual sleep, not time in bed.'],
    options: opts([['under_5', 'Under 5 hours'], ['h5_6', '5 to 6 hours'], ['h6_7', '6 to 7 hours'], ['h7_8', '7 to 8 hours'], ['h8_9', '8 to 9 hours'], ['over_9', 'Over 9 hours']]) },
  { code: 'H2', label: 'Hardware · Sleep', question: `${PAST}how would you rate the quality of your sleep?`, options: QUALITY },
  { code: 'H3', label: 'Hardware · Stress', question: `${PAST}how often did you feel tense, restless, nervous or anxious, or find it hard to switch off at night?`, options: OFTEN },
  { code: 'H4', label: 'Hardware · Movement', question: `${PAST}how much moderate to hard exercise did you do a week?`,
    nudges: ['Count anything that gets you breathing harder, like a run, a spin or high-intensity class, a hike or sport.', 'The guideline is at least 2½ hours a week.'],
    options: opts([['none', 'None'], ['under_1', 'Under 1 hour'], ['h1_2_5', '1 to 2½ hours'], ['h2_5_5', '2½ to 5 hours'], ['over_5', 'Over 5 hours']]) },
  { code: 'H5', label: 'Hardware · Movement', question: `${PAST}on how many days a week did you do strength training?`,
    nudges: ['Count weights, resistance bands or bodyweight training.', 'The guideline is at least 2 days.'],
    options: opts([['d0', '0 days'], ['d1', '1 day'], ['d2_plus', '2 days or more']]) },
  { code: 'H6', label: 'Hardware · Movement', question: 'On a typical workday, how many hours do you spend sitting?',
    options: opts([['under_4', 'Under 4 hours'], ['h4_6', '4 to 6 hours'], ['h6_8', '6 to 8 hours'], ['h8_10', '8 to 10 hours'], ['over_10', 'Over 10 hours']]) },
  { code: 'H7', label: 'Hardware · Fuel', question: `${PAST}how would you rate how well you’ve eaten?`, options: QUALITY },
  { code: 'H8', label: 'Hardware · Alcohol', question: `${PAST}how many units of alcohol did you drink a week?`,
    nudges: ['The low-risk guideline is no more than 14 units a week, spread over 3 or more days.'], why: 'alcohol', units: true,
    options: opts([['none', 'None'], ['u1_7', '1 to 7 units'], ['u8_14', '8 to 14 units'], ['u15_21', '15 to 21 units'], ['u22_35', '22 to 35 units'], ['over_35', 'Over 35 units']]) },
  { code: 'H9', label: 'Hardware · Alcohol', question: `${PAST}how often did you have a heavy drinking session?`,
    nudges: ['Count 6 or more units for women, or 8 or more for men.', '8 units is about 4 pints of lower-strength beer.'], why: 'alcohol',
    options: opts([['never', 'Never'], ['less_than_monthly', 'Less than monthly'], ['monthly', 'Monthly'], ['weekly', 'Weekly'], ['daily', 'Daily or almost daily']]) },
  { code: 'H10', label: 'Hardware · Mood and energy', question: `${PAST}how has your mood been?`, why: 'mood', options: LEVEL },
  { code: 'H11', label: 'Hardware · Mood and energy', question: `${PAST}how have your energy levels been?`, why: 'mood', options: LEVEL },
  { code: 'H12', label: 'Hardware · Health', question: `${PAST}how would you rate your physical health?`, why: 'health', options: QUALITY },
  { code: 'H13', label: 'Hardware · Health', question: `${PAST}how much has pain or injury got in the way of what you do?`, why: 'health', options: HOW_MUCH },
  { code: 'H14', label: 'Hardware · Travel', question: 'Did you travel for work in the past month?', options: opts([['no', 'No'], ['yes', 'Yes']]) },
  { code: 'H15', label: 'Hardware · Travel', question: 'How many trips crossed 3 or more time zones?', travel: true,
    options: opts([['0', 'None'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4 or more']]) },
  { code: 'H16', label: 'Hardware · Travel', question: 'How well did you recover after travelling?', travel: true,
    options: opts([['very_poorly', 'Very poorly'], ['poorly', 'Poorly'], ['ok', 'OK'], ['well', 'Well'], ['very_well', 'Very well']]) },
  // The task first, then the statement, then the answers (writing rule 51).
  ...[
    ['S1', 'Bouncing back', 'When things went wrong, I bounced back quickly.'],
    ['S2', 'Emotions', 'When pressure rose, I stayed composed and chose my response.'],
    ['S3', 'Focus', 'I focused on what mattered most without getting pulled into distractions.'],
    ['S4', 'Decisions', 'I made important decisions clearly and in good time.'],
    ['S5', 'Communication', 'My communication was clear and easy to act on.'],
    ['S6', 'Conflict', 'When there was disagreement, I raised it directly and respectfully.'],
  ].map(([code, area, statement]) => ({ code, label: `Software · ${area}`, question: `${PAST}how often was this true?`, statement, options: OFTEN })),
]);

const BY_CODE = new Map(QUESTIONS.map((q) => [q.code, q]));

/** The questions asked, in order: the travel pair only after a Yes. */
export function questionsFor(answers = {}) {
  return QUESTIONS.filter((q) => !q.travel || answers.H14 === 'yes');
}

/** The words of an answer, as people saw it ("Fair"), or null. */
export function answerWords(code, value) {
  return BY_CODE.get(code)?.options.find((o) => o.value === value)?.label || null;
}

/**
 * Only answers the database takes: known questions and options, and no
 * travel follow-ups once travel is No (029's checkins_score refuses the rest).
 */
export function cleanAnswers(answers = {}) {
  const out = {};
  for (const q of QUESTIONS) {
    const v = answers[q.code];
    if (v == null || !q.options.some((o) => o.value === v)) continue;
    if (q.travel && answers.H14 !== 'yes') continue;
    out[q.code] = v;
  }
  return out;
}

/** How much of the questions are answered, 0 to 1 (Home's "about halfway through"). */
export function answeredShare(answers = {}) {
  const asked = questionsFor(answers);
  return asked.length ? asked.filter((q) => answers[q.code] != null).length / asked.length : 0;
}

/** NHS figures, as M12 lists them (with H8, behind "What’s a unit?"). */
export const UNITS_GUIDE = Object.freeze({
  lead: 'One unit is 10ml of pure alcohol.',
  rows: [
    ['Pint of lower-strength beer, lager or cider, 3.6%', '2 units'],
    ['Pint of higher-strength beer, lager or cider, 5.2%', '3 units'],
    ['330ml bottle of lager or beer, 5%', '1.7 units'],
    ['Small glass of wine, 125ml', '1.5 units'],
    ['Standard glass of wine, 175ml', '2.1 units'],
    ['Large glass of wine, 250ml', '3 units'],
    ['Bottle of wine, 750ml', '10 units'],
    ['Single measure of spirits, 25ml', '1 unit'],
    ['Can of premixed drink, 275ml', '1.5 units'],
  ],
});

// ------------------------------------------------------------------ the goals (First check-in)

/**
 * The five goal questions (M12 intakeSteps), each with its example for
 * the person's role (CEO or executive, Head coach, Leader; Other gets
 * Leader's). G3 is three boxes, one thing each.
 */
export function goalQuestions(coachName) {
  const coach = coachName || 'your coach';
  return [
    { code: 'G1', question: 'In 12 months’ time, how would you know this coaching had been useful?', nudges: ['Describe what you’d be doing and what others would notice.'],
      example: {
        ceo: 'I’d lead the board through the merger without losing sleep, and my exec team would bring me solutions, not problems.',
        coach: 'I’d run the season with a clear head, and my staff and players would say I’m calmer under pressure.',
        leader: 'I’d run my team meeting without preparing until midnight, and my team would bring me solutions, not problems.',
      } },
    { code: 'G2', question: 'What’s prompting you to start coaching now?',
      example: {
        ceo: 'I’ve just stepped up to lead the business and I want to start well.',
        coach: 'Pre-season starts in six weeks and I want to be ready.',
        leader: 'I’ve just taken on a bigger team and I want to start well.',
      } },
    { code: 'G3', question: 'What 3 things do you most want from coaching?', nudges: ['Write one in each box.'], three: true },
    { code: 'G4', question: 'What has got in the way of progress before?',
      example: {
        ceo: 'I plan well, then the week takes over and I drop the things that matter.',
        coach: 'Match weeks take over and my own routines are the first thing to go.',
        leader: 'I plan well, then the week takes over and I drop the things that matter.',
      } },
    { code: 'G5', question: 'How do you like to be challenged?', nudges: [`Add anything else ${coach} should know about you.`],
      example: 'Be direct with me. I work best with a clear next step.' },
  ];
}

/** Only goals the database takes: G1 to G5, G3 as three short answers, trimmed of nothing but length. */
export function cleanGoals(goals = {}) {
  const out = {};
  for (const k of ['G1', 'G2', 'G4', 'G5']) {
    const v = typeof goals[k] === 'string' ? goals[k].slice(0, GOAL_MAX) : '';
    if (v.trim()) out[k] = v;
  }
  const three = Array.isArray(goals.G3) ? goals.G3.slice(0, 3).map((t) => (typeof t === 'string' ? t.slice(0, GOAL_ITEM_MAX) : '')) : [];
  if (three.some((t) => t.trim())) out.G3 = [0, 1, 2].map((i) => three[i] || '');
  return out;
}

// ------------------------------------------------------------------ months and names

/** The month a check-in on `today` belongs to: its first day, as 029 stores it. */
export function checkinMonth(today) {
  return `${today.slice(0, 7)}-01`;
}

export function monthName(month) {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** "Oct" for the graph's axis. */
export function monthShort(month) {
  return monthName(month).slice(0, 3);
}

/** "October 2026" for pop-ups and tables. */
export function monthFull(month) {
  return `${monthName(month)} ${month.slice(0, 4)}`;
}

/** The address of a month's check-in: /check-in/2026-10. */
export function checkinPath(month) {
  return `${CHECKIN_ROUTE}/${month.slice(0, 7)}`;
}

/** "2026-10" from an address, as the month's first day, or null. */
export function monthFromParam(param) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(param || '') ? `${param}-01` : null;
}

/** Saved items name it in words (writing rule 60): "First check-in", or "October check-in". */
export function checkinTitle(row) {
  if (row.kind === 'first') return 'First check-in';
  return `${monthName(row.month)} check-in`;
}

export const finishedOnly = (checkins = []) => checkins.filter((c) => c.status === 'finished');

/**
 * Which check-in someone does now (M12): a coaching client who has never
 * finished one does the First check-in, with the goals; everyone else the
 * monthly one. A row already started this month keeps its kind.
 * @param {{ hasCoach: boolean, checkins: object[], month: string }} input
 */
export function checkinKind({ hasCoach, checkins = [], month }) {
  const here = checkins.find((c) => c.month === month);
  if (here) return here.kind;
  return hasCoach && !finishedOnly(checkins).length ? 'first' : 'monthly';
}

/**
 * Whether the check-in is due (Claude's call, Phase 5 step 1; methods M13
 * doesn't define "due", see the report): 029 keeps one check-in per
 * calendar month, so it's due whenever this month's isn't finished yet.
 */
export function checkinDue({ checkins = [], month }) {
  return !checkins.some((c) => c.month === month && c.status === 'finished');
}

/** The latest finished check-in from an earlier month than `month`, or null ("last month", M13). */
export function previousCheckin(checkins = [], month) {
  return finishedOnly(checkins).filter((c) => c.month < month).sort((a, b) => (a.month < b.month ? 1 : -1))[0] || null;
}

// ------------------------------------------------------------------ results

// One thing to work on (M12 TIPS, verbatim): the large line, then the
// plain lines under it. M12 has suggestions only for the Hardware areas,
// which is where methods M13 picks from.
export const TIPS = Object.freeze({
  sleep: ['Same wake-up time every day', 'Keep it within 30 minutes, weekends too.', 'It’s the most reliable way to improve sleep quality.'],
  stress: ['A 3-minute Breathe before your hardest meeting', 'Short, regular resets bring stress down more than one long break.'],
  movement: ['Three 30-minute training sessions a week', 'Choose the kind of training that suits you.', 'That gets you most of the way to 150 minutes.'],
  fuel: ['Two alcohol-free days in a row each week', 'It keeps you within the low-risk guideline and helps sleep.'],
  mood_energy: ['One thing each day you enjoy for its own sake', 'Small, regular pleasures lift mood fastest.'],
  health: ['Book the check-up you’ve been putting off', 'One appointment this month.'],
});

/**
 * What Add to my sprint offers for each tip (Claude's calls: M12 shows
 * the habit path without its measure, and methods M13 names none). The
 * person can change any of it before adding. A one-off (the check-up) is
 * a to-do; the rest are habits.
 */
export const SUGGESTED = Object.freeze({
  sleep: { as: 'habit', habit: { name: 'Same wake-up time every day', measure: 'yes_no_days_target', target: '7', per: 'week' } },
  stress: { as: 'habit', habit: { name: 'A 3-minute Breathe before my hardest meeting', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  movement: { as: 'habit', habit: { name: '30-minute training sessions', measure: 'count', target: '3', per: 'week' } },
  fuel: { as: 'habit', habit: { name: 'Two alcohol-free days in a row', measure: 'yes_no_weekly', target: '', per: 'week' } },
  mood_energy: { as: 'habit', habit: { name: 'One thing I enjoy for its own sake', measure: 'yes_no_days_target', target: '7', per: 'week' } },
  health: { as: 'todo', todo: 'Book the check-up I’ve been putting off' },
});

/** The descriptions under the first results' two scores (M12 kresults; glossary, writing rule 40). */
export const SCORE_LINES = Object.freeze({
  hardware: 'Sleep, stress, movement, fuel, energy and health.',
  software: 'Your decision-making, emotional control and communication.',
});

/** The "What are hardware and software?" pop-up (writing rule 40, verbatim). */
export const HARDWARE_SOFTWARE = Object.freeze([
  'Hardware is your body’s physiology.',
  'Software is your decision-making, emotional control and communication.',
  'Software relies on hardware being maintained, so we look after both.',
]);

/**
 * The change against last month as one full sentence (26 Oct rule 9,
 * over M12's "Up 7 from 52 last month."), split so "up 7" can be mint.
 * Change and last month's figure come from the rounded figures (M0.1).
 */
export function changeLine(change, before) {
  if (change == null || before == null) return null;
  if (change > 0) return { lead: 'Your score is ', up: `up ${change}`, rest: ` from ${before} last month.`, text: `Your score is up ${change} from ${before} last month.` };
  if (change < 0) return { lead: `Your score is down ${-change} from ${before} last month.`, up: null, rest: '', text: `Your score is down ${-change} from ${before} last month.` };
  return { lead: 'Your score is the same as last month.', up: null, rest: '', text: 'Your score is the same as last month.' };
}

const rounded = (v) => (v == null ? null : m0Round(v));

/** One fold's rows (M12 rows): each area, its bar and NN/100; and its one-line summary ("Lowest: Movement 45/100"). */
function areaFold(areas, scores) {
  const rows = areas.filter((a) => scores[a.key] != null).map((a) => ({ key: a.key, name: a.name, value: rounded(scores[a.key]) }));
  let low = null;
  for (const r of rows) if (!low || r.value < low.value) low = r;
  return { rows, lowest: low ? `Lowest: ${low.name} ${low.value}/100` : null };
}

/**
 * Everything the results screen shows (M12 kresults and mresults), from
 * m13CheckinScores and m13Results. `previous` is last month's finished
 * row (or null), whose answers are scored the same way.
 */
export function checkinResults({ answers, previous = null }) {
  const now = m13CheckinScores(cleanAnswers(answers));
  const before = previous ? m13CheckinScores(cleanAnswers(previous.answers || {})) : null;
  const r = m13Results(now, before);
  const hw = rounded(now.hardware);
  const sw = rounded(now.software);
  const hwBefore = before ? rounded(before.hardware) : null;
  const swBefore = before ? rounded(before.software) : null;
  const changedSomething = before
    ? [...HARDWARE_AREAS, ...SOFTWARE_AREAS].some((a) => {
      const x = now.hardwareAreas[a.key] ?? now.softwareAreas[a.key];
      const y = before.hardwareAreas[a.key] ?? before.softwareAreas[a.key];
      return x != null && y != null && rounded(x) !== rounded(y);
    })
    : false;
  let improvedEmpty = null;
  if (before && !r.improved.length) improvedEmpty = changedSomething ? 'No area rose since last month.' : 'Everything held steady this month.';
  const workOn = r.workOn ? { key: r.workOn.key, name: r.workOn.name, tip: TIPS[r.workOn.key], suggestion: SUGGESTED[r.workOn.key] } : null;
  return {
    hardware: hw == null ? null : { value: hw, change: before && hwBefore != null ? changeLine(r.hardwareChange, hwBefore) : null },
    software: sw == null ? null : { value: sw, change: before && swBefore != null ? changeLine(r.softwareChange, swBefore) : null },
    compared: Boolean(before),
    // Until real data sets each area's typical swing, a rise only says what moved (methods M13).
    improved: r.improved.map((x) => ({ key: x.key, name: x.name, change: x.change, line: `${x.name} rose since last month.` })),
    improvedEmpty,
    workOn,
    hardwareAreas: areaFold(HARDWARE_AREAS, now.hardwareAreas),
    softwareAreas: areaFold(SOFTWARE_AREAS, now.softwareAreas),
    scores: now,
  };
}

// ------------------------------------------------------------------ over time (the two-line graph)

/** Trips across 3 or more time zones in a month (H15), or 0. M12 rings a month with one or more. */
export function longHaulTrips(answers = {}) {
  if (answers.H14 !== 'yes') return 0;
  const n = Number(answers.H15);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The graph's points, oldest first: every finished check-in, with the one
 * being finished now (`current`, its answers) in its month's place. Each:
 * { month, axis 'Oct', when 'October 2026', hardware, software, trips }.
 * Shared with the dashboard's card (Phase 5 step 2).
 */
export function checkinPoints(checkins = [], current = null) {
  const byMonth = new Map();
  for (const c of finishedOnly(checkins)) {
    const s = c.answers ? m13CheckinScores(cleanAnswers(c.answers)) : { hardware: c.hardware_score, software: c.software_score };
    byMonth.set(c.month, { month: c.month, hardware: rounded(s.hardware), software: rounded(s.software), trips: longHaulTrips(c.answers) });
  }
  if (current?.month) {
    const s = m13CheckinScores(cleanAnswers(current.answers || {}));
    byMonth.set(current.month, { month: current.month, hardware: rounded(s.hardware), software: rounded(s.software), trips: longHaulTrips(current.answers) });
  }
  return [...byMonth.values()]
    .filter((p) => p.hardware != null || p.software != null)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((p) => ({ ...p, axis: monthShort(p.month), when: monthFull(p.month) }));
}

/** "2 long-haul trips" for a travel ring's pop-up and the table. */
export function tripsWords(n) {
  if (!n) return 'No long-haul travel';
  if (n >= 4) return '4 or more long-haul trips';
  return `${n} long-haul trip${n === 1 ? '' : 's'}`;
}

// ------------------------------------------------------------------ Home and finishing

/**
 * Home's lines for the check-in (M2 QL.chk and sugCard newc; M12 notes),
 * or null. A coaching client with no finished check-in has the First
 * check-in (as the card while they're new, otherwise a quiet line); for
 * everyone else, the monthly line while this month's is due. Gone once done.
 * @returns {{ key, first, draft, question, lines, time, action: { label, to } } | null}
 */
export function checkinPrompt({ hasCoach, coachName, checkins = [], today }) {
  const month = checkinMonth(today);
  const kind = checkinKind({ hasCoach, checkins, month });
  if (!checkinDue({ checkins, month })) return null;
  const draft = checkins.find((c) => c.month === month && c.status !== 'finished') || null;
  const coach = coachName || 'your coach';
  if (kind === 'first') {
    const share = draft ? answeredShare(draft.answers || {}) : 0;
    const halfway = share >= 0.35 && share <= 0.65;
    return draft
      ? {
        key: 'first-checkin',
        first: true,
        draft: true,
        question: 'Ready to finish your first check-in?',
        lines: [...(halfway ? ['You’re about halfway through.'] : []), `It helps ${coach} get the most from your first session.`],
        time: CHECKIN_TIME,
        action: { label: 'Finish my first check-in', to: CHECKIN_ROUTE },
      }
      : {
        key: 'first-checkin',
        first: true,
        draft: false,
        question: 'Ready for your first check-in?',
        lines: [`It helps ${coach} get the most from your first session.`],
        time: FIRST_CHECKIN_TIME,
        action: { label: 'Start my first check-in', to: CHECKIN_ROUTE },
      };
  }
  return draft
    ? { key: 'checkin', first: false, draft: true, question: 'Ready to finish your monthly check-in?', lines: [], time: CHECKIN_TIME, action: { label: 'Finish my check-in', to: CHECKIN_ROUTE } }
    : { key: 'checkin', first: false, draft: false, question: 'Ready for your monthly check-in?', lines: [], time: CHECKIN_TIME, action: { label: 'Start my check-in', to: CHECKIN_ROUTE } };
}

/** The toast when a check-in is finished (M12 act 'finish'). `sharing`: the coach sees it. */
export function finishToastWords({ kind, coachName, sharing }) {
  if (kind === 'first' && coachName && sharing) return `Saved. ${coachName} will see this before your first session.`;
  if (coachName && sharing) return 'Saved. Your coach can see it before your next session.';
  return 'Saved. Your next check-in is in a month.';
}

export const CLOSE_TOAST = 'Saved. Carry on from Home whenever you like.';
export const LATER_TOAST = 'Saved. Home will ask you to finish before your first session.';

/** The Who sees my answers? fold (M12 whoSees). */
export function whoSeesLines({ coachName, sharing }) {
  if (coachName && sharing) {
    return [`Only you and ${coachName} see your answers.`, 'Your organisation never sees them.', `You can switch off ${coachName}’s view any time in My Account.`];
  }
  return ['Only you see your answers.', 'Your organisation never sees them.'];
}

/** The line under One thing to work on when there is no running sprint to add it to. */
export function noSprintLine({ kind, coachName }) {
  if (kind === 'first' && coachName) return `Add it when you build your plan with ${coachName}.`;
  return 'You can add it to your Performance Sprint once one is running.';
}

/** The line once it's added (M12): "It’s in Performance Sprint 4 as a habit." */
export function addedLine(sprintName, as) {
  return `It’s in ${sprintName} as a ${as === 'todo' ? 'to-do' : 'habit'}.`;
}
