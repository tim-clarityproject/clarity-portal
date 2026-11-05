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

import { HARDWARE_AREAS, SOFTWARE_AREAS, m0Bands, m0Round, m13CheckinScores, m13Results } from '../scores/index.js';

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
  // By drinks (Tim, 5 Nov, 10:25: people count what they know, the portal
  // does the maths): one row per drink, the units added up live and saved
  // as the band below (029 takes only these answers).
  { code: 'H8', label: 'Hardware · Alcohol', question: 'On average, what do you drink in a week?',
    nudges: ['Count a typical week in the past month.'], why: 'alcohol', drinks: true,
    options: opts([['none', 'None'], ['u1_7', '1 to 7 units'], ['u8_14', '8 to 14 units'], ['u15_21', '15 to 21 units'], ['u22_35', '22 to 35 units'], ['over_35', 'Over 35 units']]) },
  { code: 'H9', label: 'Hardware · Alcohol', question: `${PAST}how often did you have a heavy drinking session?`,
    nudges: ['Count 6 or more units for women, or 8 or more for men.', '8 units is about 4 pints of lower-strength beer.'], why: 'alcohol',
    options: opts([['never', 'Never'], ['less_than_monthly', 'Less than monthly'], ['monthly', 'Monthly'], ['weekly', 'Weekly'], ['daily', 'Daily or almost daily']]) },
  { code: 'H10', label: 'Hardware · Mood and energy', question: `${PAST}how has your mood been?`, why: 'mood', options: LEVEL },
  { code: 'H11', label: 'Hardware · Mood and energy', question: `${PAST}how have your energy levels been?`, why: 'mood', options: LEVEL },
  { code: 'H12', label: 'Hardware · Health', question: `${PAST}how would you rate your physical health?`, why: 'health', options: QUALITY },
  { code: 'H13', label: 'Hardware · Health', question: `${PAST}how much has pain or injury got in the way of what you do?`, why: 'health', options: HOW_MUCH },
  // Asked of everyone as one tap first; the recovery question only after
  // a trip (Tim, 5 Nov, 10:27). The three answers are kept as H14 and H15
  // (tripAnswers), the only values 029 takes.
  { code: 'H14', label: 'Hardware · Travel', question: 'Did you travel this month?', trip: true, options: opts([['no', 'No'], ['yes', 'Yes']]) },
  { code: 'H15', label: 'Hardware · Travel', question: 'How many trips crossed 3 or more time zones?', travel: true, longOnly: true,
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

/** The questions asked, in order: the trips across time zones only after long journeys, how you recovered only after a trip. */
export function questionsFor(answers = {}) {
  const trip = tripKind(answers);
  return QUESTIONS.filter((q) => (!q.travel || answers.H14 === 'yes') && (!q.longOnly || trip === 'long'));
}

// ------------------------------------------------------------------ travel, asked only when it applies

/** "Did you travel this month?" (Tim, 5 Nov, 10:27; long drives count as long journeys). */
export const TRIP_OPTIONS = Object.freeze([
  { value: 'no', label: 'No' },
  { value: 'short', label: 'Short trips' },
  { value: 'long', label: 'Long journeys or time zones' },
]);
export const TRIP_NUDGE = 'Long drives count as long journeys.';

/** Which of the three it was, from the answers ('_trip' is the device's own note of the choice). */
export function tripKind(answers = {}) {
  if (answers._trip) return answers._trip;
  if (answers.H14 === 'no') return 'no';
  if (answers.H14 === 'yes') return answers.H15 === '0' ? 'short' : 'long';
  return null;
}

/** The answers after choosing one of the three: No skips the recovery question and nothing is scored for travel. */
export function tripAnswers(answers = {}, kind) {
  const next = { ...answers, _trip: kind };
  if (kind === 'no') {
    next.H14 = 'no';
    delete next.H15;
    delete next.H16;
  } else {
    next.H14 = 'yes';
    if (kind === 'short') next.H15 = '0';
    else if (next.H15 === '0') delete next.H15;
  }
  return next;
}

// ------------------------------------------------------------------ alcohol, by drinks

/**
 * Units per drink, from the NHS's alcohol units guidance
 * (https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/,
 * last reviewed 27 Aug 2024, read 5 Nov 2026; claims register R34). The
 * pint and the bottle or can are worked out from the NHS's own figures and
 * say how (claims register C48).
 */
export const DRINKS = Object.freeze([
  // NHS: 14 units "is equivalent to 6 pints of average-strength beer", so 14 / 6.
  { key: 'pint', label: 'Pint of beer or cider', units: 14 / 6 },
  // NHS: a 330ml bottle at 5% is 1.7 units and a 440ml can at 5.5% is 2.4, so the middle of the two.
  { key: 'bottle', label: 'Bottle or can of beer', units: (1.7 + 2.4) / 2 },
  // NHS: a standard glass (175ml, 12%) is 2.1 units.
  { key: 'wine', label: 'Glass of wine (standard)', units: 2.1 },
  // NHS: a large glass (250ml, 12%) is 3 units.
  { key: 'wine_large', label: 'Glass of wine (large)', units: 3 },
  // NHS: a single small shot of spirits (25ml, 40%) is 1 unit.
  { key: 'spirit', label: 'Single spirit', units: 1 },
]);
/** The most of any one drink a week on the steppers (experience rule 49). */
export const DRINK_MAX = 99;

/** The week's units from the drinks counted and any other units typed. */
export function drinkUnits(drinks = {}) {
  let total = 0;
  for (const d of DRINKS) total += (Number(drinks[d.key]) || 0) * d.units;
  const other = Number(String(drinks.other ?? '').replace(',', '.'));
  if (Number.isFinite(other) && other > 0) total += other;
  return total;
}

/** H8's answer for the units (the band 029 scores): whole units, as shown on screen. */
export function unitsAnswer(units) {
  const u = Math.round(units);
  if (!(units > 0)) return 'none';
  if (u <= 7) return 'u1_7';
  if (u <= 14) return 'u8_14';
  if (u <= 21) return 'u15_21';
  if (u <= 35) return 'u22_35';
  return 'over_35';
}

/** "That's about 9 units a week." as one full sentence, in whole units. */
export function unitsLine(units) {
  if (!(units > 0)) return 'That’s no alcohol in a typical week.';
  const u = Math.round(units);
  if (u < 1) return 'That’s less than 1 unit a week.';
  return `That’s about ${u} unit${u === 1 ? '' : 's'} a week.`;
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
    if (q.longOnly && answers.H15 == null) continue;
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
  fuel: ['Two alcohol-free days in a row each week', 'Two days in a row gives your body a full break.'],
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
  fuel: { as: 'habit', habit: { name: 'Alcohol-free day', measure: 'yes_no_days_target', target: '2', per: 'week' } },
  mood_energy: { as: 'habit', habit: { name: 'One thing I enjoy for its own sake', measure: 'yes_no_days_target', target: '7', per: 'week' } },
  health: { as: 'todo', todo: 'Book the check-up I’ve been putting off' },
});

/**
 * One thing to work on as a short choice (Tim, 5 Nov, 10:29: unconditional
 * positive regard, never assume someone isn't already doing something):
 * "What could help with sleep?" then up to 3 of these at a time, each with
 * "Already doing this", and "Something else" in their own words. Options
 * never say what someone should do, and their reasons say what the habit
 * gives, never that anyone is outside a guideline.
 *
 * Every option knows its kind (Tim, 10:35): a repeating one is added only
 * as a habit with a measure, named for the day it is ticked; a one-off only
 * as a to-do. A fourth option takes the place of one already being done.
 */
export const OPTIONS = Object.freeze({
  sleep: [
    { key: 'wake', text: 'The same wake-up time every day', reason: 'A steady wake-up time sets your body clock, so sleep comes more easily.', as: 'habit', habit: { name: 'Same wake-up time', measure: 'yes_no_days_target', target: '7', per: 'week' } },
    { key: 'wind', text: 'A Sleep wind down most evenings', reason: 'Writing down what’s on your mind makes it easier to switch off.', as: 'habit', habit: { name: 'Sleep wind down', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'screens', text: 'No screens in the hour before bed', reason: 'A quieter last hour helps you fall asleep sooner.', as: 'habit', habit: { name: 'No screens in the hour before bed', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'caffeine', text: 'No caffeine after midday', reason: 'Caffeine late in the day can keep sleep light.', as: 'habit', habit: { name: 'No caffeine after midday', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  ],
  stress: [
    { key: 'breathe', text: 'A 3-minute Breathe before your hardest meeting', reason: 'Short, regular resets bring stress down more than one long break.', as: 'habit', habit: { name: 'A 3-minute Breathe before my hardest meeting', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'break', text: 'A 10-minute break away from screens each afternoon', reason: 'A real break lets your mind settle before the rest of the day.', as: 'habit', habit: { name: '10-minute break away from screens', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'block', text: 'One block of protected thinking time this week', reason: 'Time set aside for the big things stops them pressing on every hour.', as: 'todo', todo: 'Book one block of protected thinking time' },
    { key: 'shutdown', text: 'A clear end to each workday', reason: 'Closing the day on purpose makes it easier to switch off at night.', as: 'habit', habit: { name: 'Close my workday on purpose', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  ],
  movement: [
    { key: 'training', text: 'Three 30-minute training sessions a week', reason: 'Choose the kind of training that suits you.', as: 'habit', habit: { name: '30-minute training session', measure: 'count', target: '3', per: 'week' } },
    { key: 'strength', text: 'Two strength sessions a week', reason: 'Strength keeps your body ready for everything else you do.', as: 'habit', habit: { name: 'Strength session', measure: 'count', target: '2', per: 'week' } },
    { key: 'trainer', text: 'A session with a trainer or coach', reason: 'One session gives you a plan that fits your body.', as: 'todo', todo: 'Book a session with a trainer or coach' },
    { key: 'stand', text: 'Standing up and moving every hour at work', reason: 'Breaking up long sitting keeps your energy steadier.', as: 'habit', habit: { name: 'Up and moving every hour', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  ],
  fuel: [
    { key: 'af_days', text: 'Two alcohol-free days in a row each week', reason: 'Two days in a row gives your body a full break.', as: 'habit', habit: { name: 'Alcohol-free day', measure: 'yes_no_days_target', target: '2', per: 'week' } },
    { key: 'water', text: 'A glass of water with every meal', reason: 'Staying topped up keeps your focus and energy steadier.', as: 'habit', habit: { name: 'Water with every meal', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'meals', text: 'Planning the week’s meals ahead', reason: 'Deciding ahead makes the easy choice the good one.', as: 'habit', habit: { name: 'Plan the week’s meals', measure: 'yes_no_weekly', target: '', per: 'week' } },
    { key: 'lunch', text: 'A proper lunch away from your desk', reason: 'A real meal at midday keeps the afternoon steady.', as: 'habit', habit: { name: 'Proper lunch away from my desk', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  ],
  mood_energy: [
    { key: 'enjoy', text: 'One thing each day you enjoy for its own sake', reason: 'Small, regular pleasures lift mood fastest.', as: 'habit', habit: { name: 'One thing I enjoy for its own sake', measure: 'yes_no_days_target', target: '7', per: 'week' } },
    { key: 'daylight', text: 'Time outside in daylight each morning', reason: 'Morning light lifts your energy for the day.', as: 'habit', habit: { name: 'Time outside in daylight', measure: 'yes_no_days_target', target: '5', per: 'week' } },
    { key: 'forward', text: 'Something to look forward to this month', reason: 'Having something ahead lifts the weeks before it.', as: 'todo', todo: 'Book something to look forward to' },
    { key: 'connect', text: 'Time with someone who gives you energy', reason: 'Good company is one of the quickest lifts there is.', as: 'habit', habit: { name: 'Time with someone who gives me energy', measure: 'count', target: '2', per: 'week' } },
  ],
  health: [
    { key: 'checkup', text: 'The check-up you’ve been putting off', reason: 'One appointment this month.', as: 'todo', todo: 'Book the check-up I’ve been putting off' },
    { key: 'physio', text: 'A physio assessment', reason: 'An expert eye finds what’s getting in the way.', as: 'todo', todo: 'Book a physio assessment' },
    { key: 'mobility', text: '10 minutes of mobility each day', reason: 'A few minutes a day keeps you moving freely.', as: 'habit', habit: { name: '10 minutes of mobility', measure: 'yes_no_days_target', target: '5', per: 'week' } },
  ],
});
/** How long "Already doing this" keeps an option from being offered again (Tim: "a few months"). */
export const ALREADY_DOING_DAYS = 90;
/** Up to this many options at a time. */
export const OPTIONS_SHOWN = 3;

/** The options still to offer: never one already being done in the last 90 days. `doing`: { [area:key]: 'YYYY-MM-DD' }. */
export function optionsToOffer(area, doing = {}, today) {
  const recent = (key) => {
    const on = doing[`${area}:${key}`];
    if (!on || !today) return Boolean(on);
    return (Date.parse(today) - Date.parse(on)) / 864e5 < ALREADY_DOING_DAYS;
  };
  return (OPTIONS[area] || []).filter((o) => !recent(o.key)).slice(0, OPTIONS_SHOWN);
}

/** "What could help with fuel and alcohol?" */
export function workOnQuestion(name) {
  return `What could help with ${String(name || '').toLowerCase()}?`;
}

/** The descriptions under the first results' two scores (M12 kresults; glossary, writing rule 40). */
export const SCORE_LINES = Object.freeze({
  hardware: 'Sleep, stress, movement, fuel, energy and health.',
  software: 'Your decision-making, emotional control and communication.',
});

/** What each combined score is and how it's worked out, behind its "i" (Tim, 5 Nov; methods M13). */
export const SCORE_INFO = Object.freeze({
  hardware: [
    'Hardware is your body’s physiology.',
    'Your Hardware score is the average of six areas: sleep, stress, movement, fuel and alcohol, mood and energy, and health.',
    'Each area is scored out of 100 from your answers.',
  ],
  software: [
    'Software is your decision-making, emotional control and communication.',
    'Your Software score is the average of six areas: bouncing back, emotions, focus, decisions, communication and conflict.',
    'Each area is scored out of 100 from how often each statement was true.',
  ],
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

/**
 * One fold's rows (M12 rows): each area, its bar and NN/100, the bar in its
 * band (methods M0.8: the single lowest coral). No "Lowest: …" line: the
 * colour says it (Tim, 5 Nov).
 */
function areaFold(areas, scores) {
  const rows = areas.filter((a) => scores[a.key] != null).map((a) => ({ key: a.key, name: a.name, value: rounded(scores[a.key]) }));
  const bands = m0Bands(rows.map((r) => r.value));
  return { rows: rows.map((r, i) => ({ ...r, band: bands[i] })) };
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
  const workOn = r.workOn ? { key: r.workOn.key, name: r.workOn.name, question: workOnQuestion(r.workOn.name), tip: TIPS[r.workOn.key], suggestion: SUGGESTED[r.workOn.key] } : null;
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
