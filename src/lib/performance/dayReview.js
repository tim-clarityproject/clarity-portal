// What Daily review shows (mock-up M5, approved 23 Oct), worked out from
// the rows in one place. Pure code: no database, no React, no device
// clock (the day and the hour are passed in), tested in tests/performance.
//
// The day's to-dos are Daily plan's own (dayPlanView, the same picks in
// the same order), and the week's to-dos, habits and score come from the
// sprint page's view (sprintPageView), so they are the same as the sprint
// shows: M2 for the to-dos, M1 for the habits, M5 "so far" for the score.
// What the methods don't define is a screen choice made here and listed
// in progress.md (CHOICE or UNDEFINED): which day a review after midnight
// is for, a day with no plan, ticking a habit on the week's list.

import { weekday } from '../scores/dates.js';
import { addDayKey, dayPlanView } from './dayPlan';
import { settingForWeek, toMeasure } from './rows';
import { plainNumber, wayRatingSaved, wayRatingWord } from './words';
import { sprintPageView } from './sprintPage';

export const REVIEW_TEXT_MAX = 4000;   // went_well, differently, on_my_mind
export const WHERE_MAX = 1000;         // where_it_showed
export const MAX_TOMORROW = 3;         // day_reviews.tomorrow holds up to three
export const TOMORROW_ITEM_MAX = 300;  // the to-do limit (audit R7); day_reviews holds the same once 039 has run
export const REVIEW_EARLY_HOURS = 4;   // a review started before 04:00 can be for the day before

export const DIFFERENTLY_EXAMPLE = 'Leave ten minutes between calls, so I start each one ready.';
export const TOMORROW_EXAMPLE = 'Call Evan before 09:00 about the referral.';
export const MOVED_LEVELS = Object.freeze({ 1: 'Low', 2: 'Medium', 3: 'High' });

// "Calm" reads "calm" inside a sentence; an acronym ("CEO-like") and the word "I" ("I’m present") keep their capital.
const lowerFirst = (t) => (t && !/^(?:.[A-Z]|I(?![a-z]))/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/**
 * Which day a review is for. UNDEFINED (audit R0, a review done after
 * midnight). CHOICE: before 04:00, if the day before has a plan and no
 * finished review, the review is for the day before (its date shows in
 * the top bar); otherwise it is for today.
 */
export function reviewDayFor({ today, hour, yesterdayPlanned = false, yesterdayReviewed = false }) {
  if (hour < REVIEW_EARLY_HOURS && yesterdayPlanned && !yesterdayReviewed) return addDayKey(today, -1);
  return today;
}

/** "How calm under pressure were you today?" (M5), answered in the five words, never 1 to 10 (Tim, 10 Nov, 23:22). */
export function wayQuestion(way) {
  const w = (way || '').trim().replace(/[.!?]+$/, '');
  return w ? `How ${lowerFirst(w)} were you today?` : 'How was today?';
}

/** The morning's reminder (M5): both Strategies of the day, by name. */
export function reminderLine(names = []) {
  if (!names.length) return 'Choose any that moved today.';
  return `This morning you said today would serve ${names.join(' and ')} most.`;
}

/** Writing rule 64: a question about one thing names it. */
export function movedQuestion(name) {
  return `How much did “${name}” move?`;
}

function listWords(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * An amount of time as a person would say it (Tim, 5 Nov, 10:37): "half an
 * hour", "45 minutes", "1 hour", "1 and a half hours", "12 hours".
 * `hours` may be in minutes when `unit` is minutes.
 */
export function timeWords(value, unit = 'hours') {
  const hours = unit === 'minutes' ? Number(value) / 60 : Number(value);
  if (!(hours > 0)) return unit === 'minutes' ? '0 minutes' : '0 hours';
  if (hours === 0.5) return 'half an hour';
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  const whole = Math.floor(hours);
  const rest = Math.round((hours - whole) * 60);
  if (rest === 0) return `${whole} hour${whole === 1 ? '' : 's'}`;
  if (rest === 30) return `${whole} and a half hours`;
  return `${plainNumber(Math.round(hours * 10) / 10)} hours`;
}

const TIME_UNITS = new Set(['hours', 'hour', 'minutes', 'minute', 'h', 'mins']);
const plural = (word) => {
  if (/s$/i.test(word)) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(ch|sh|x)$/i.test(word)) return `${word}es`;
  return `${word}s`;
};
const singular = (word) => {
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x)es$/i.test(word)) return word.slice(0, -2);
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
};
/** "training sessions" for 4, "training session" for 1; names longer than three words stay as they are. */
function countNoun(name, count) {
  const words = lowerFirst(name).split(' ');
  if (words.length > 3) return words.join(' ');
  const last = words[words.length - 1];
  return [...words.slice(0, -1), count === 1 ? singular(last) : plural(last)].join(' ');
}
/** A verb for each kind of thing (Tim's model): sent, read, completed, else done. */
function verbFor(name) {
  if (/message|email|call|text|note to|thank/i.test(name)) return 'sent';
  if (/read|book|page/i.test(name)) return 'read';
  if (/session|workout|training|run|class|swim|ride|match|game|practice/i.test(name)) return 'completed';
  return 'done';
}

/**
 * The one sentence for the weekly habits on the numbers screen, written the
 * way a person would say it (Tim, 5 Nov, 10:37, his model): "So far this
 * week you've completed 1 out of 4 training sessions, read half an hour of
 * your 3 hours of reading and sent 4 out of 5 check-in messages, and you've
 * still got your weekly strategic block to do." What's left is still to
 * come, never missed. The figures are the sprint's own (logRow's
 * weekFigures), never worked out here.
 */
export function weeklySentence(habits = []) {
  const done = [];
  const toCome = [];
  for (const h of habits) {
    const name = lowerFirst(h.name);
    const f = h.weekFigures;
    if (h.measure === 'yes_no_weekly') {
      const isDone = h.weekDone ?? /^Done/.test(h.weekLine || '');
      if (isDone) done.push(`done your ${name}`);
      else toCome.push(`your ${name}`);
      continue;
    }
    if (h.measure === 'count_limit' && f) {
      done.push(`had ${plainNumber(f.got)} ${countNoun(h.name, f.got)}, with a limit of ${plainNumber(f.limit)}`);
      continue;
    }
    if ((h.measure === 'count' || h.measure === 'amount') && f) {
      const timed = h.measure === 'amount' && TIME_UNITS.has(String(h.unit || '').toLowerCase());
      if (!(f.got > 0)) {
        if (timed) toCome.push(`${timeWords(f.of, h.unit)} of ${name}`);
        else if (h.measure === 'amount') toCome.push(`${plainNumber(f.of)} ${h.unit || ''} of ${name}`.replace(/\s+/g, ' '));
        else toCome.push(`${plainNumber(f.of)} ${countNoun(h.name, f.of)}`);
        continue;
      }
      if (timed) done.push(`${verbFor(h.name) === 'read' ? 'read' : 'done'} ${timeWords(f.got, h.unit)} of your ${timeWords(f.of, h.unit)} of ${name}`);
      else if (h.measure === 'amount') done.push(`done ${plainNumber(f.got)} out of ${plainNumber(f.of)} ${h.unit || ''} of ${name}`.replace(/\s+/g, ' '));
      else done.push(`${verbFor(h.name)} ${plainNumber(f.got)} out of ${plainNumber(f.of)} ${countNoun(h.name, f.of)}`);
      continue;
    }
    // Anything else: its own week line, as a full clause.
    if (h.weekLine) done.push(`logged ${name} at ${h.weekLine.replace(/ this week/, '')}`);
  }
  if (!done.length && !toCome.length) return '';
  const still = toCome.length ? `you’ve still got ${listWords(toCome)} to do` : '';
  if (!done.length) return `So far this week ${still}.`;
  // The verbs: "you've completed 1 out of 4 training sessions, 3 out of 5 ..."
  const body = `So far this week you’ve ${listWords(done)}`;
  return still ? `${body}, and ${still}.` : `${body}.`;
}

/** "Where did being calm under pressure show today?" (rule 64: the question names it). */
export function whereQuestion(way) {
  const w = (way || '').trim().replace(/[.!?]+$/, '');
  return w ? `Where did being ${lowerFirst(w)} show today?` : 'Where did it show today?';
}

/**
 * A habit ticked as done on the review's list. UNDEFINED (audit R1).
 * CHOICE: a count logs one more that day (one fewer when unticked, down to
 * not logged); a once-a-week yes or no logs yes that day (cleared when
 * unticked). Anything else (an amount) logs nothing here: its row is on
 * the numbers screen. Returns the day's new value, null to clear it, or
 * undefined for "no log".
 */
export function habitTickValue(measure, current, ticked) {
  const now = current == null ? 0 : Number(current);
  if (measure === 'count' || measure === 'count_limit') {
    if (ticked) return now + 1;
    return now > 1 ? now - 1 : null;
  }
  if (measure === 'yes_no_weekly') return ticked ? 1 : null;
  return undefined;
}

/** Whether a habit is logged a day at a time (the numbers screen) or across the week. */
export function isDailyHabit(m) {
  if (m.measure === 'count' || m.measure === 'amount') return m.targetPer === 'day';
  if (m.measure === 'count_limit') return m.limitPer === 'day';
  return m.measure === 'yes_no_days_limit' || m.measure === 'yes_no_days_target' || m.measure === 'rating';
}

/** How a habit is entered on the numbers screen (as the sprint's Log today). */
export function entryKind(measure) {
  if (measure === 'count' || measure === 'count_limit') return 'stepper';
  if (measure === 'yes_no_days_limit' || measure === 'yes_no_days_target') return 'yesno';
  if (measure === 'rating') return 'rating';
  if (measure === 'yes_no_weekly') return 'tick';
  return 'number';
}

/** The things for tomorrow as day_reviews.tomorrow: typed rows only, three at most, each within the limit. */
export function tomorrowToRow(rows = []) {
  return rows.map((t) => (t || '').trim()).filter(Boolean).slice(0, MAX_TOMORROW).map((t) => t.slice(0, TOMORROW_ITEM_MAX));
}

/** The review's own answers from its row, as the page keeps them. */
export function reviewAnswersFromRow(row) {
  const tomorrow = (row?.tomorrow || []).filter((t) => (t || '').trim());
  return {
    rating: row?.way_of_being_rating ?? null,
    where: row?.where_it_showed || '',
    wentWell: row?.went_well || '',
    differently: row?.differently || '',
    tomorrow: tomorrow.length ? tomorrow : [''],
    onMind: row?.on_my_mind || '',
  };
}

/** The page's answers as the day_reviews columns (empty text saved as none). */
export function reviewAnswersToRow(a) {
  const text = (v) => (v && v.trim() ? v.trim() : null);
  return {
    // A whole number from 1 to 10 or nothing, whatever a draft on the device held.
    way_of_being_rating: wayRatingSaved(a.rating),
    where_it_showed: text(a.where),
    went_well: text(a.wentWell),
    differently: text(a.differently),
    tomorrow: tomorrowToRow(a.tomorrow),
    on_my_mind: text(a.onMind),
  };
}

/**
 * The saves for "Which Strategies moved today?" from `before` to `after`
 * (each { [strategy id]: level 1 to 3 }): removals first, then each new
 * or changed level (found by the review and the Strategy, so a resend
 * writes the same row).
 */
export function dayReviewStrategyOps(userId, reviewId, before = {}, after = {}) {
  const ops = [];
  for (const id of Object.keys(before)) {
    if (after[id] == null) ops.push({ table: 'day_review_strategies', kind: 'delete', match: { day_review_id: reviewId, strategy_id: id, user_id: userId } });
  }
  for (const [id, level] of Object.entries(after)) {
    if (before[id] !== level) {
      ops.push({ table: 'day_review_strategies', kind: 'upsert', onConflict: 'day_review_id,strategy_id', values: { day_review_id: reviewId, strategy_id: id, user_id: userId, level } });
    }
  }
  return ops;
}

/** The days a win can be added to: this sprint week up to the review's day, or Monday to that day with no sprint. */
function winDaysFor(sprint, date) {
  if (sprint?.state === 'running') return sprint.winDays;
  const short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const out = [];
  for (let k = addDayKey(date, -weekday(date)); k <= date; k = addDayKey(k, 1)) out.push({ value: k, label: short[weekday(k)] });
  return out;
}

/**
 * The page's whole view for one day.
 * @param {object} d rows from loadDayReview (loadDayPlan's, plus the review)
 * @param {{ date: string, planLocal: object, local: object }} opts the day;
 *   what the device keeps for that day's plan ({ habits, order, top });
 *   and for this review ({ habitTicks, extra, wins }): the habits ticked,
 *   the things ticked on this week's list, and the wins added here.
 */
export function dayReviewView(d, { date, planLocal = {}, local = {} }) {
  const plan = dayPlanView(d, { date, local: planLocal });
  const sprint = sprintPageView(d, { today: date });
  const running = plan.running;
  const todoRows = new Map([...(d.todos || []), ...(d.looseTodos || [])].filter((t) => !t.deleted_at).map((t) => [t.id, t]));
  const habitRows = new Map((running ? sprint.habits : []).map((h) => [h.id, h]));
  const measureOf = (id) => {
    const setting = running ? settingForWeek(d.sprintSettings || [], id, sprint.current) : null;
    return setting ? toMeasure(setting) : null;
  };
  const habitTicks = local.habitTicks || {};
  const extra = local.extra || {};

  // Today's to-dos: the plan's picks, the highest priority first.
  const today = plan.ordered.map((o, i) => {
    const done = o.kind === 'habit'
      ? (habitTicks[o.id] ?? Boolean(habitRows.get(o.id)?.values?.[date] > 0))
      : Boolean(todoRows.get(o.id)?.done_on);
    return { key: o.value, kind: o.kind, id: o.id, text: o.label, strategyName: o.detail || '', top: i === 0, done, measure: o.kind === 'habit' ? measureOf(o.id)?.measure : null };
  });
  const picked = new Set(plan.picks);

  // This week's list (M5 "Show this week's list"): the rest of the week's
  // open to-dos (and any ticked done on this day), then the weekly habits
  // not yet met (or ticked here), each with its tag.
  const week = [];
  if (running) {
    for (const t of sprint.todos.thisWeek) {
      const row = todoRows.get(t.id);
      if (t.movedOut || picked.has(`todo:${t.id}`) || !row) continue;
      if (row.done_on && row.done_on !== date) continue;
      week.push({ key: `todo:${t.id}`, kind: 'todo', id: t.id, text: t.text, strategyName: t.strategyName, tags: [t.rolledFrom ? `Rolled over from week ${t.rolledFrom}` : 'To-do this week'], done: Boolean(row.done_on) });
    }
    for (const h of sprint.habits) {
      const m = measureOf(h.id);
      if (!m || picked.has(`habit:${h.id}`)) continue;
      const weeklyCount = (m.measure === 'count' && m.targetPer === 'week') || m.measure === 'yes_no_weekly';
      if (!weeklyCount) continue;
      const logged = Object.values(h.values || {});
      const met = m.measure === 'yes_no_weekly' ? logged.some((v) => v > 0) : m.target != null && logged.reduce((s, v) => s + v, 0) >= m.target;
      if (met && extra[`habit:${h.id}`] == null) continue;
      week.push({ key: `habit:${h.id}`, kind: 'habit', id: h.id, text: h.name, strategyName: h.strategyName, tags: [`Habit, ${lowerFirst(h.weekLine)}`], done: Boolean(extra[`habit:${h.id}`]), measure: m.measure });
    }
  } else {
    for (const row of d.looseTodos || []) {
      if (row.deleted_at || picked.has(`todo:${row.id}`) || (row.done_on && row.done_on !== date)) continue;
      const name = plan.strategies.find((s) => s.value === row.strategy_id)?.label || '';
      week.push({ key: `todo:${row.id}`, kind: 'todo', id: row.id, text: row.text, strategyName: name, tags: ['To-do'], done: Boolean(row.done_on) });
    }
  }

  // Today's numbers: the habits logged a day at a time, plus an amount a
  // week chosen for today (its tick logs nothing; the amount goes in here).
  const numbers = [];
  const weekly = [];
  if (running) {
    for (const h of sprint.habits) {
      const m = measureOf(h.id);
      if (!m) continue;
      const chosenAmount = m.measure === 'amount' && picked.has(`habit:${h.id}`);
      if (isDailyHabit(m) || chosenAmount) numbers.push({ ...h, kind: entryKind(m.measure) });
      else weekly.push(h);
    }
  }

  const strategyName = new Map(plan.strategies.map((s) => [s.value, s.label]));
  const wins = (d.wins || [])
    .filter((w) => !w.deleted_at && (w.local_date === date || (local.wins || []).includes(w.id)))
    .map((w) => ({
      id: w.id,
      text: w.what,
      strategyName: (d.winLinks || []).filter((l) => l.win_id === w.id).map((l) => strategyName.get(l.strategy_id)).filter(Boolean).join(', '),
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday(w.local_date)],
    }));

  const doneToday = today.filter((t) => t.done).length;
  const doneFromWeek = week.filter((t) => t.done).length;
  const review = d.dayReview;
  return {
    date,
    hasPlan: plan.hasPlan,
    running,
    inRecovery: plan.inRecovery,
    sprintId: plan.sprintId,
    week: plan.week,
    firstName: plan.firstName,
    strategies: plan.strategies,
    way: (d.dayPlan?.way_of_being || '').trim(),
    today,
    weekList: week,
    numbers,
    weeklyLine: weeklySentence(weekly),
    wins,
    winDays: winDaysFor(sprint, date),
    // In the plan's order (the database keeps no order for the day's two).
    reminder: reminderLine(plan.strategies.filter((s) => plan.dayStrategies.includes(s.value)).map((s) => s.label)),
    moved: Object.fromEntries((d.reviewStrategies || []).filter((s) => strategyName.has(s.strategy_id)).map((s) => [s.strategy_id, s.level])),
    doneToday,
    doneFromWeek,
    // The summary's to-do line (M5 "2 of 3 done", "Plus 1 more from this week’s list.").
    todoLine: today.length ? `${doneToday} of ${today.length} done` : (doneFromWeek ? `${doneFromWeek} done from this week’s list` : ''),
    todoPlus: today.length && doneFromWeek ? `Plus ${doneFromWeek} more from this week’s list.` : null,
    winsLine: wins.length ? `Plus ${wins.length} unplanned win${wins.length === 1 ? '' : 's'}.` : null,
    finished: review?.status === 'finished',
    score: plan.score,
  };
}

/** "Grow through referrals, High" for the summary (labels before levels; no dots). */
export function movedLines(moved = {}, strategies = []) {
  return strategies.filter((s) => moved[s.value] != null).map((s) => `${s.label}, ${MOVED_LEVELS[moved[s.value]]}`);
}

/** "Calm under pressure, Very good" for the summary (a saved 1 to 10 reads as its word). */
export function howYouWere(way, rating) {
  const word = wayRatingWord(rating);
  if (!word) return '';
  return `${(way || '').trim() || 'Today'}, ${word}`;
}
