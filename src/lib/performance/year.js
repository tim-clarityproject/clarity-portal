// View your year (mock-up M1, R.year): every week of the year as a slim
// bar, the sprints and Recovery marked, worked out from the rows in one
// place. Pure code: no database, no React, no device clock (today is
// passed in), tested in tests/performance/year.test.mjs.
//
// Every score comes from src/lib/scores: M0 for each sprint's calendar
// (Recovery pauses sprint time) and the standard, M5 for the running
// sprint's weeks (through sprintPageView, the same figures the sprint page
// shows), the frozen week_scores for every other sprint, M6 for each
// sprint's average and M7 for a week's colour.
//
// UNDEFINED in the methods (audit, section 4, item 5), the safe choice
// made here and listed in progress.md: the year is the ISO year of today,
// in ISO weeks (Monday start, 52 or 53 of them). A sprint week sits in the
// calendar week of its first day. A calendar week with no sprint week is
// "Recovery" when Recovery covers 4 or more of its days
// (MOSTLY_RECOVERY_DAYS, as M0.5); a sprint week keeps its bar even then,
// and its pop-up says how many days Recovery covered. If two sprint weeks
// ever land in one calendar week (a sprint finished early and the next
// started the same week), the later sprint's week shows.

import { addDays, dayNumber, weekday } from '../scores/dates.js';
import {
  MOSTLY_RECOVERY_DAYS,
  m0Round,
  m0SprintCalendar,
  m6SprintFigures,
  m7WeekColour,
} from '../scores/index.js';
import { openRecovery, toRecoveries } from './rows';
import { dayName, sprintPageView, weekRange } from './sprintPage';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- ISO weeks

/** The ISO week a day falls in: { year, week }. */
export function isoWeek(key) {
  const thursday = addDays(key, 3 - weekday(key));
  const year = Number(thursday.slice(0, 4));
  return { year, week: Math.floor((dayNumber(thursday) - dayNumber(`${year}-01-01`)) / 7) + 1 };
}

/** 52 or 53. */
export function isoWeeksInYear(year) {
  return isoWeek(`${year}-12-28`).week;
}

/** The Monday of an ISO week. */
export function isoWeekMonday(year, week) {
  const jan4 = `${year}-01-04`;
  return addDays(addDays(jan4, -weekday(jan4)), 7 * (week - 1));
}

// ---------------------------------------------------------------- sprints

/**
 * A sprint's weeks as it held them (M0.4): its calendar, cut at its
 * actual end once it is finished (a sprint finished early holds no weeks
 * after that day, and a week it only partly held isn't one of its weeks).
 */
export function heldWeeks(sprint, recoveries, today) {
  const calendar = m0SprintCalendar(
    { start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: toRecoveries(recoveries || []) },
    today,
  );
  const end = sprint.status === 'finished' ? sprint.actual_end_on : null;
  return { calendar, weeks: end ? calendar.weeks.filter((w) => w.end <= end) : calendar.weeks };
}

/**
 * A finished (or paused) sprint's weeks from the frozen week_scores, each
 * with its state and pop-up as the sprint page shows them. A week with no
 * frozen row yet has no score ("Not scored yet"); the page freezes it.
 */
export function frozenWeeks(sprint, recoveries, weekScores, today) {
  const { weeks } = heldWeeks(sprint, recoveries, today);
  const frozen = new Map((weekScores || []).filter((w) => w.sprint_id === sprint.id).map((w) => [w.sprint_week, w]));
  return weeks.map((wk) => {
    const when = `Week ${wk.number}, ${weekRange(wk, today)}`;
    if (!wk.finished) {
      return { number: wk.number, start: wk.start, end: wk.end, finished: false, raw: null, score: null, state: 'next', tip: { value: 'To come', when } };
    }
    const row = frozen.get(wk.number);
    const raw = row && row.score != null ? Number(row.score) : null;
    const colour = m7WeekColour(raw, sprint.standard);
    let tip;
    if (!row) tip = { value: 'Not scored yet', when };
    else if (colour === 'none') tip = { value: 'Nothing planned this week', when };
    else tip = { value: `Performance score ${m0Round(raw)}%`, when, extra: [colour === 'good' ? 'At or above your standard' : 'Below your standard'] };
    return { number: wk.number, start: wk.start, end: wk.end, finished: true, frozen: Boolean(row?.final), raw, score: m0Round(raw), state: colour, tip };
  });
}

// ---------------------------------------------------------------- the view

/**
 * The page's whole view.
 * @param {object} d rows from loadYearPage: the running sprint's rows as
 *   loadSprintPage, plus every sprint (`sprints`) and every debrief
 *   (`allDebriefs`)
 * @param {{ today: string, showResults?: boolean }} opts the person's local today
 */
export function yearView(d, { today, showResults = false }) {
  if (!d) return null;
  const { year, week: thisWeek } = isoWeek(today);
  const count = isoWeeksInYear(year);
  const recoveries = d.recoveries || [];
  // In Recovery the running sprint is paused, so its weeks come from the
  // frozen scores like any other; they are hidden unless "Show my
  // results" was tapped on this visit (M15).
  const paused = Boolean(openRecovery(recoveries));
  const hidden = paused && !showResults;
  const debriefDone = new Set((d.allDebriefs || []).filter((x) => x.status === 'finished').map((x) => `${x.sprint_id}:${x.sprint_week}`));

  const slots = Array.from({ length: count }, (_, i) => {
    const start = isoWeekMonday(year, i + 1);
    return { week: i + 1, start, end: addDays(start, 6), kind: 'empty', thisWeek: i + 1 === thisWeek, recoveryDays: 0 };
  });

  // Recovery days in each calendar week: from its start to the day before
  // "I'm ready to go again", or to today while it is still running.
  for (const r of recoveries) {
    const last = r.ended_at ? addDays(r.end_on, -1) : today;
    for (let key = r.start_on; key <= last; key = addDays(key, 1)) {
      const w = isoWeek(key);
      if (w.year === year) slots[w.week - 1].recoveryDays += 1;
    }
  }

  // Each sprint's weeks: the running one exactly as the sprint page shows
  // it (this week so far included), the others from week_scores.
  const sprints = [...(d.sprints || [])].sort((a, b) => a.number - b.number);
  const running = d.sprint || null;
  const runningView = running && !paused ? sprintPageView(d, { today }) : null;
  const toFreeze = [];
  const list = [];
  for (const s of sprints) {
    const isRunning = running && s.id === running.id;
    let weeks;
    if (isRunning && runningView?.weeks) {
      weeks = runningView.weeks;
      for (const n of runningView.toFreeze || []) toFreeze.push({ sprintId: s.id, week: n });
    } else {
      weeks = frozenWeeks(s, recoveries, d.weekScores, today);
      for (const w of weeks) if (w.finished && !w.frozen) toFreeze.push({ sprintId: s.id, week: w.number });
    }
    const name = `Performance Sprint ${s.number}`;
    const placed = [];
    for (const w of weeks) {
      const at = isoWeek(w.start);
      if (at.year !== year) continue;
      const slot = slots[at.week - 1];
      const extra = [...(w.tip?.extra || [])];
      if (w.state === 'now') extra.unshift('This week so far');
      else if (w.state !== 'next') extra.unshift(weekRange(w, today));
      if (slot.recoveryDays >= MOSTLY_RECOVERY_DAYS) extra.push(`Recovery covered ${slot.recoveryDays} days of this week.`);
      Object.assign(slot, {
        kind: 'sprint',
        sprintId: s.id,
        sprintNumber: s.number,
        sprintName: name,
        sprintWeek: w.number,
        state: hidden ? 'hidden' : w.state,
        score: hidden ? null : w.score,
        debriefed: debriefDone.has(`${s.id}:${w.number}`),
        tip: hidden
          ? { value: 'Scores are hidden while you’re in recovery', when: `${name}, week ${w.number}` }
          : { value: w.state === 'next' ? 'To come' : w.tip?.value, when: `${name}, week ${w.number}`, extra },
      });
      placed.push(at.week);
    }
    if (!placed.length) continue;
    const figures = m6SprintFigures(weeks.map((w) => ({ number: w.number, score: w.raw, finished: w.finished })), s.standard);
    list.push({
      id: s.id,
      number: s.number,
      name,
      label: s.label || null,
      running: Boolean(isRunning),
      // Over but not reviewed yet (R5): it still counts as running.
      waiting: Boolean(isRunning && runningView?.state === 'over'),
      standard: s.standard,
      lengthWeeks: s.length_weeks,
      first: Math.min(...placed),
      last: Math.max(...placed),
      weeksText: `${s.length_weeks} weeks, weeks ${Math.min(...placed)} to ${Math.max(...placed)}`,
      average: hidden || figures.average == null ? null : `${m0Round(figures.average)}%`,
    });
  }

  for (const slot of slots) {
    const when = `Week ${slot.week}, ${dayName(slot.start, today)} to ${dayName(slot.end, today)}`;
    if (slot.kind === 'empty' && slot.recoveryDays >= MOSTLY_RECOVERY_DAYS) {
      slot.kind = 'recovery';
      slot.tip = { value: 'Recovery', when, extra: ['You were in recovery this week.'] };
    } else if (slot.kind === 'empty') {
      slot.tip = { value: 'No sprint running', when };
    }
  }

  // The standard: one line when every sprint shown shares it, else one
  // labelled line over each sprint's own weeks.
  const standards = [...new Set(list.map((s) => s.standard))];
  const standardLines = hidden || !list.length
    ? []
    : standards.length === 1
      ? [{ value: standards[0], from: 1, to: count }]
      : list.map((s) => ({ value: s.standard, from: s.first, to: s.last }));

  // Months along the bottom, at the calendar week holding the 1st.
  const months = MONTHS.map((label, i) => {
    const w = isoWeek(`${year}-${String(i + 1).padStart(2, '0')}-01`);
    return { label, week: w.year === year ? w.week : 1 };
  });

  // The week picked first: this sprint week, else this calendar week.
  const now = slots.find((s) => s.state === 'now');
  return {
    year,
    count,
    thisWeek,
    hidden,
    paused,
    slots,
    sprints: list,
    standardLines,
    months,
    toFreeze,
    selected: now ? now.week : thisWeek,
  };
}

/**
 * What the panel under the chart says for the week picked (M1 .ysel), as
 * lines of words: a title, then each line in turn, and whether it can
 * open the sprint page ("Open this week").
 */
export function selectedWeek(view, week) {
  const slot = view.slots[week - 1];
  if (!slot) return null;
  const title = `Week ${slot.week}`;
  if (slot.kind === 'recovery') return { title, lines: ['Recovery', 'You were in recovery this week.'] };
  if (slot.kind === 'empty') return { title, lines: ['No sprint running'] };
  const where = `${slot.sprintName}, week ${slot.sprintWeek}`;
  if (slot.state === 'hidden') return { title, lines: [where, 'Your scores are hidden while you’re in recovery.'] };
  if (slot.state === 'next') return { title, lines: [`This week is still to come in ${slot.sprintName}.`] };
  if (slot.state === 'now') {
    return { title, lines: [where, 'This week so far'], score: slot.score, open: true };
  }
  return {
    title,
    lines: [where, ...(slot.debriefed ? ['Debriefed'] : [])],
    score: slot.score,
    nothing: slot.score == null ? slot.tip.value : null,
    // "Open the week summary" (M1): that week's debrief.
    summary: { sprintId: slot.sprintId, week: slot.sprintWeek },
  };
}
