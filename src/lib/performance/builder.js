// Build your plan and editing the plan (mock-up M6, "Build your plan"):
// the answers as one draft, what in it is complete enough to save, and
// which saves turn what is saved into what the draft says. Pure code, no
// database and no React (tested in tests/performance/builder.test.mjs).
//
// Save as you go against strict tables (audit risk R1): an objective or a
// habit is written only once it is complete, because the database refuses
// half-filled ones; until then it lives in the draft on the device
// (useDraft). Strategies are written once they have a name. Parents go
// before children (the plan, objectives and Strategies, then the links and
// habits), and removals go children first.
//
// Removing something the plan's last version holds archives it (kept for
// history); removing something never in a version deletes it.

import { DEFAULT_STANDARD, DEFAULT_WORKING_DAYS, m7IsValidStandard, m7StandardFor } from '../scores/index.js';
import { planSnapshot } from './versions';
import { shortDate, plainNumber } from './words';

export const MAX_OBJECTIVES = 4;
export const NAME_MAX = 80;      // objective, Strategy and habit names (the tables' checks)
export const MISSION_MAX = 120;  // performance_plans.mission
export const UNIT_MAX = 30;
export const SPRINT_LENGTHS = Object.freeze([4, 6, 8, 12, 16]);
export const SUGGESTED_LENGTH = 12;
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 16;
export const TEMPLATE_WEEKS = 13; // "Just started a new role?": the first 90 days
export const TEMPLATE_LABEL = 'First 90 days in a new role';

// ---------------------------------------------------------------- objectives

/** How an objective is tracked (decisions "Three ways to track"), with M6's two lines under the choice. */
export const OBJECTIVE_KINDS = Object.freeze([
  { value: 'number', label: 'Number', lines: ['A figure you move towards a target.', 'If you can’t count it, rate it out of 10 instead.'] },
  { value: 'milestone', label: 'Milestone', lines: ['Something you get done once, by a date.', 'Tick it off when it’s done.'] },
  { value: 'rating', label: 'Rating /10', lines: ['Your own honest score out of 10.', 'You update it in each Weekly performance debrief.'] },
]);

/** A figure typed into a box, or null when it isn't one. Commas in "10,000" are allowed. */
export function typedNumber(text) {
  if (text == null) return null;
  const t = String(text).trim().replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  if (t === '' || !/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const between = (n, lo, hi) => n != null && n >= lo && n <= hi;

export function emptyObjective(id) {
  return { id, name: '', kind: 'number', start: '', target: '', date: '', unit: null, saved: false };
}

/** Is the objective complete enough for the table to take it? */
export function objectiveComplete(o) {
  const name = (o.name || '').trim();
  if (!name || name.length > NAME_MAX || !o.date) return false;
  if (o.kind === 'milestone') return true;
  const start = typedNumber(o.start);
  const target = typedNumber(o.target);
  if (o.kind === 'rating') return between(start, 0, 10) && between(target, 0, 10);
  return start != null && target != null;
}

/** An objective as the plan's rows hold it (api.saveObjective's shape). */
export function objectiveRow(o, sortOrder, today) {
  const start = typedNumber(o.start);
  const target = typedNumber(o.target);
  const row = {
    id: o.id,
    name: o.name.trim(),
    kind: o.kind,
    unit: o.kind === 'number' ? (o.unit || null) : null,
    // A number can go down (costs, hours worked): the target says which way (Claude's call).
    direction: o.kind === 'number' && target < start ? 'down' : 'up',
    start: o.kind === 'milestone' ? null : start,
    target: o.kind === 'milestone' ? null : target,
    byWhen: o.kind === 'milestone' ? null : o.date,
    dueOn: o.kind === 'milestone' ? o.date : null,
    sortOrder,
  };
  // A new objective starts today; an existing one keeps the day it started.
  if (!o.saved && today) row.startOn = today;
  return row;
}

/** A rating box out of range, said as what to type ("Any figure from 0 to 10."). */
export function ratingHint(text) {
  const n = typedNumber(text);
  return String(text || '').trim() && !between(n, 0, 10) ? 'Any figure from 0 to 10.' : null;
}

// ---------------------------------------------------------------- habits

/**
 * The seven ways to measure a habit (methods M1), as M6 names them, each
 * with its example and the words after the target box. `per` is where the
 * target counts when the habit is new (M6: counts a week, amounts and
 * limits a day); a habit loaded from the plan keeps its own.
 */
export const HABIT_MEASURES = Object.freeze([
  { value: 'count', label: 'Count', hint: 'e.g. training sessions', per: 'week' },
  { value: 'amount', label: 'Amount with a unit', hint: 'e.g. steps or litres of water', per: 'day' },
  { value: 'yes_no_days_target', label: 'Yes or no each day', hint: 'e.g. phone off by 21:00' },
  { value: 'yes_no_days_limit', label: 'Yes or no each day, under a limit', hint: 'e.g. no more than 2 late finishes' },
  { value: 'yes_no_weekly', label: 'Once a week', hint: 'e.g. a strategic block happened' },
  { value: 'count_limit', label: 'Keep a count under a limit', hint: 'e.g. no more than 2 coffees', per: 'day' },
  { value: 'rating', label: 'Rating 1 to 5', hint: 'e.g. focus, rated each day' },
]);

export const IMPACTS = Object.freeze([
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
]);

export const RATING_DIRECTIONS = Object.freeze([
  { value: 'higher', label: 'Higher is better' },
  { value: 'lower', label: 'Lower is better' },
]);

const measureOf = (value) => HABIT_MEASURES.find((m) => m.value === value) || HABIT_MEASURES[0];

export function emptyHabit(id, strategyId) {
  return { id, strategyId, name: '', measure: 'count', target: '', unit: '', per: 'week', direction: 'higher', impact: 2, topNumber: null };
}

/** The habit after a new way to measure is picked: the target counts per its new default. */
export function withMeasure(h, measure) {
  const m = measureOf(measure);
  return { ...h, measure, per: m.per || h.per || 'week' };
}

/** The words after the target box (M6): "a week", "days a week", "days at most", "average". */
export function targetSuffix(h) {
  switch (h.measure) {
    case 'count':
    case 'amount':
    case 'count_limit':
      return h.per === 'day' ? 'a day' : 'a week';
    case 'yes_no_days_target': return 'days a week';
    case 'yes_no_days_limit': return 'days at most';
    case 'rating': return 'average';
    default: return '';
  }
}

/** The range a habit's target must sit in, or null when any figure of 0 or more will do. */
function targetRange(h) {
  switch (h.measure) {
    case 'yes_no_days_target': return [1, 7];
    case 'yes_no_days_limit': return [0, 7];
    case 'rating': return h.direction === 'lower' ? [1, 4] : [2, 5];
    default: return null;
  }
}

const whole = (n) => n != null && Number.isInteger(n);

/** Is the target a figure this way of measuring takes? */
export function habitTargetOk(h) {
  if (h.measure === 'yes_no_weekly') return true;
  const n = typedNumber(h.target);
  if (n == null) return false;
  const range = targetRange(h);
  if (range) return whole(n) && between(n, range[0], range[1]);
  if (h.measure === 'count') return whole(n) && n >= 1;
  if (h.measure === 'count_limit') return whole(n);
  return n > 0; // an amount
}

/** What to type when the target is out of range ("Any figure from 2 to 5."), else null. */
export function habitTargetHint(h) {
  if (h.measure === 'yes_no_weekly' || !String(h.target || '').trim() || habitTargetOk(h)) return null;
  const range = targetRange(h);
  if (range) return `Any figure from ${range[0]} to ${range[1]}.`;
  if (h.measure === 'amount') return 'Any figure above 0.';
  return h.measure === 'count' ? 'Any whole number from 1.' : 'Any whole number from 0.';
}

/** Is the habit complete enough for the table to take it? */
export function habitComplete(h) {
  const name = (h.name || '').trim();
  if (!name || name.length > NAME_MAX || !h.strategyId) return false;
  if (h.measure === 'amount' && !(h.unit || '').trim()) return false;
  if (h.measure === 'rating' && !['higher', 'lower'].includes(h.direction)) return false;
  return habitTargetOk(h);
}

/** A habit as the plan's rows hold it (api.saveHabit's shape), with only the fields its measure uses. */
export function habitRow(h, sortOrder) {
  const n = typedNumber(h.target);
  const row = {
    id: h.id,
    strategyId: h.strategyId,
    name: h.name.trim(),
    measure: h.measure,
    unit: null,
    target: null,
    targetPer: null,
    limit: null,
    limitPer: null,
    direction: null,
    topNumber: h.topNumber ?? null,
    impact: [1, 2, 3].includes(h.impact) ? h.impact : 2,
    sortOrder,
  };
  const unit = (h.unit || '').trim() || null;
  switch (h.measure) {
    case 'count':
    case 'amount':
      Object.assign(row, { unit, target: n, targetPer: h.per === 'day' ? 'day' : 'week' });
      break;
    case 'count_limit':
      Object.assign(row, { unit, limit: n, limitPer: h.per === 'week' ? 'week' : 'day' });
      break;
    case 'yes_no_days_target':
      row.target = n;
      break;
    case 'yes_no_days_limit':
      row.limit = n;
      break;
    case 'rating':
      Object.assign(row, { target: n, direction: h.direction });
      break;
    default:
      break;
  }
  // A top number only means something for a count (M1).
  if (!['count', 'count_limit', 'amount'].includes(h.measure)) row.topNumber = null;
  return row;
}

// ---------------------------------------------------------------- the draft

const text = (v) => (v == null ? '' : String(v));

/**
 * The draft from what is saved (loadPlanEditor's rows), so the editor opens
 * on the plan as it stands. `planId` is the plan's id, made on the device
 * when there's no plan yet.
 */
export function draftFromRows(data, { planId, sprint } = {}) {
  const objectives = (data.objectives || []).map((o) => ({
    id: o.id,
    name: o.name,
    kind: o.kind,
    start: o.kind === 'milestone' ? '' : text(o.start_value),
    target: o.kind === 'milestone' ? '' : text(o.target_value),
    date: (o.kind === 'milestone' ? o.due_on : o.by_when) || '',
    unit: o.unit || null,
    saved: true,
  }));
  const links = data.links || [];
  const strategies = (data.strategies || []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    objectiveIds: links.filter((l) => l.strategy_id === s.id).map((l) => l.objective_id)
      .filter((id) => objectives.some((o) => o.id === id)),
  }));
  const habits = (data.habits || []).map((h) => {
    const limit = ['yes_no_days_limit', 'count_limit'].includes(h.measure);
    return {
      id: h.id,
      strategyId: h.strategy_id,
      name: h.name,
      measure: h.measure,
      target: text(limit ? h.limit_value : h.target),
      unit: h.unit || '',
      per: (limit ? h.limit_per : h.target_per) || measureOf(h.measure).per || 'week',
      direction: h.direction || 'higher',
      impact: h.impact ?? 2,
      topNumber: h.top_number ?? null,
    };
  });
  const latestPattern = [...(data.workingPatterns || [])].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1))[0];
  return {
    planId: data.plan?.id || planId,
    mission: data.plan?.mission || '',
    help: { open: false, known: '', serve: '', great: '' },
    objectives,
    strategies,
    habits,
    habitStrategy: strategies[0]?.id || null,
    workingDays: latestPattern ? [...latestPattern.days].sort() : [...DEFAULT_WORKING_DAYS],
    sprint: sprint || null,
  };
}

/** A draft's first sprint, as M6 starts it: 12 weeks, next Monday, 85%. */
export function startingSprint(nextMonday, standard = DEFAULT_STANDARD) {
  return { len: SUGGESTED_LENGTH, other: false, otherLen: '', tpl: false, start: nextMonday, extraStart: null, std: standard, stdOther: false, otherStd: '' };
}

/** The sprint's length in weeks, or null while "Other" holds no usable figure. */
export function sprintWeeks(sprint) {
  if (!sprint) return null;
  if (sprint.tpl) return TEMPLATE_WEEKS;
  if (sprint.other) {
    const n = typedNumber(sprint.otherLen);
    return whole(n) && between(n, MIN_LENGTH, MAX_LENGTH) ? n : null;
  }
  return sprint.len;
}

/** The standard chosen, or null while "Other" holds no figure from 50 to 100. */
export function sprintStandard(sprint, fixed = null) {
  if (fixed != null) return m7StandardFor({ orgSeat: true });
  if (!sprint) return null;
  if (sprint.stdOther) {
    const n = typedNumber(sprint.otherStd);
    return m7IsValidStandard(n) ? n : null;
  }
  return sprint.std;
}

/**
 * What the draft says the database should hold: only what is complete
 * enough to save. Links join a saved Strategy to a saved objective; a
 * habit needs its Strategy saved.
 */
export function savableRows(draft, today) {
  const objectives = draft.objectives.filter(objectiveComplete).map((o, i) => objectiveRow(o, i, today));
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const strategies = draft.strategies
    .filter((s) => (s.name || '').trim() && s.name.trim().length <= NAME_MAX)
    .map((s, i) => ({ id: s.id, name: s.name.trim(), description: s.description ?? null, sortOrder: i }));
  const strategyIds = new Set(strategies.map((s) => s.id));
  const links = [];
  for (const s of draft.strategies) {
    if (!strategyIds.has(s.id)) continue;
    for (const oid of s.objectiveIds) if (objectiveIds.has(oid)) links.push({ strategyId: s.id, objectiveId: oid });
  }
  const habits = draft.habits.filter((h) => habitComplete(h) && strategyIds.has(h.strategyId)).map((h, i) => habitRow(h, i));
  return {
    plan: { id: draft.planId, mission: (draft.mission || '').trim().slice(0, MISSION_MAX) },
    objectives,
    strategies,
    links,
    habits,
    workingDays: draft.workingDays?.length ? [...draft.workingDays].sort() : null,
  };
}

/** The plan as a version keeps it, from savable rows. */
export function rowsSnapshot(rows) {
  return planSnapshot({ mission: rows.plan?.mission, objectives: rows.objectives, strategies: rows.strategies, links: rows.links, habits: rows.habits });
}

const linkKey = (l) => `${l.strategyId}>${l.objectiveId}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The saves that turn `saved` (what the database holds, as savableRows'
 * shape, or null for nothing yet) into `want`. In order: the plan, then
 * objectives and Strategies, links, habits, the working days; then
 * removals, children first.
 *
 * @param {object|null} saved
 * @param {object} want
 * @param {{ planExists: boolean, inVersion: Set<string> }} opts
 *   planExists: the plan row is saved; inVersion: ids the plan's last
 *   version holds, which are archived rather than deleted
 * @returns {{ kind: string, row?: object, table?: string, id?: string, link?: object, serves?: boolean, days?: number[] }[]}
 */
export function planSaves(saved, want, { planExists, inVersion = new Set() }) {
  const before = saved || { plan: null, objectives: [], strategies: [], links: [], habits: [], workingDays: null };
  const ops = [];
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const hasRows = want.objectives.length || want.strategies.length || want.habits.length || want.plan.mission;
  if ((!planExists && hasRows) || (planExists && (before.plan?.mission || '') !== want.plan.mission)) {
    ops.push({ kind: 'plan', row: want.plan });
  }
  // The working days belong to the person, not the plan.
  if (want.workingDays && !same(before.workingDays, want.workingDays)) ops.push({ kind: 'days', days: want.workingDays });
  // Nothing goes under a plan that isn't there.
  if (!planExists && !hasRows) return ops;

  const changed = (oldList, newList, kind) => {
    const old = byId(oldList);
    for (const row of newList) if (!same(old.get(row.id), row)) ops.push({ kind, row });
  };
  changed(before.objectives, want.objectives, 'objective');
  changed(before.strategies, want.strategies, 'strategy');
  const oldLinks = new Set(before.links.map(linkKey));
  const newLinks = new Set(want.links.map(linkKey));
  for (const l of want.links) if (!oldLinks.has(linkKey(l))) ops.push({ kind: 'link', link: l, serves: true });
  changed(before.habits, want.habits, 'habit');

  for (const l of before.links) if (!newLinks.has(linkKey(l))) ops.push({ kind: 'link', link: l, serves: false });
  const gone = (oldList, newList, table) => {
    const keep = new Set(newList.map((x) => x.id));
    for (const row of oldList) {
      if (!keep.has(row.id)) ops.push({ kind: inVersion.has(row.id) ? 'archive' : 'delete', table, id: row.id });
    }
  };
  gone(before.habits, want.habits, 'habits');
  gone(before.strategies, want.strategies, 'plan_strategies');
  gone(before.objectives, want.objectives, 'outcome_objectives');
  return ops;
}

/** What is saved once one of planSaves' saves has gone through (or waits in the queue). */
export function applySave(saved, op) {
  const s = saved || { plan: null, objectives: [], strategies: [], links: [], habits: [], workingDays: null };
  const put = (list, row) => (list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row]);
  const drop = (list, id) => list.filter((x) => x.id !== id);
  const lists = { outcome_objectives: 'objectives', plan_strategies: 'strategies', habits: 'habits' };
  switch (op.kind) {
    case 'plan': return { ...s, plan: op.row };
    case 'objective': return { ...s, objectives: put(s.objectives, op.row) };
    case 'strategy': return { ...s, strategies: put(s.strategies, op.row) };
    case 'habit': return { ...s, habits: put(s.habits, op.row) };
    case 'days': return { ...s, workingDays: op.days };
    case 'link': {
      const rest = s.links.filter((l) => linkKey(l) !== linkKey(op.link));
      return { ...s, links: op.serves ? [...rest, op.link] : rest };
    }
    case 'archive':
    case 'delete': {
      const key = lists[op.table];
      const next = { ...s, [key]: drop(s[key], op.id) };
      // The table removes a deleted row's links and habits with it.
      if (op.table === 'plan_strategies') {
        next.links = next.links.filter((l) => l.strategyId !== op.id);
        if (op.kind === 'delete') next.habits = next.habits.filter((h) => h.strategyId !== op.id);
      }
      if (op.table === 'outcome_objectives' && op.kind === 'delete') next.links = next.links.filter((l) => l.objectiveId !== op.id);
      return next;
    }
    default: return s;
  }
}

/** Ids a version snapshot holds (archived, not deleted, when removed). */
export function snapshotIds(snapshot) {
  const ids = new Set();
  for (const list of [snapshot?.objectives, snapshot?.strategies, snapshot?.habits]) {
    for (const x of list || []) ids.add(x.id);
  }
  return ids;
}

// ---------------------------------------------------------------- the steps

/** The objectives that have a name, each getting its own Strategies step (decisions "Strategies are guided"). */
export function namedObjectives(draft) {
  return draft.objectives.filter((o) => (o.name || '').trim());
}

/** M6 removes a Strategy from one objective's step: it stops serving it, and goes when it serves nothing else. */
export function removeStrategyFrom(draft, strategyId, objectiveId) {
  const s = draft.strategies.find((x) => x.id === strategyId);
  if (!s) return draft;
  const rest = objectiveId ? s.objectiveIds.filter((id) => id !== objectiveId) : [];
  if (objectiveId && rest.length) {
    return { ...draft, strategies: draft.strategies.map((x) => (x.id === strategyId ? { ...x, objectiveIds: rest } : x)) };
  }
  return {
    ...draft,
    strategies: draft.strategies.filter((x) => x.id !== strategyId),
    habits: draft.habits.filter((h) => h.strategyId !== strategyId),
    habitStrategy: draft.habitStrategy === strategyId ? null : draft.habitStrategy,
  };
}

/** An objective removed: it goes from every Strategy that served it. */
export function removeObjective(draft, objectiveId) {
  return {
    ...draft,
    objectives: draft.objectives.filter((o) => o.id !== objectiveId),
    strategies: draft.strategies.map((s) => ({ ...s, objectiveIds: s.objectiveIds.filter((id) => id !== objectiveId) })),
  };
}

/** Ideas not yet used as a Strategy's name (M6). */
export function unusedIdeas(draft, ideas) {
  const used = new Set(draft.strategies.map((s) => (s.name || '').trim().toLowerCase()));
  return ideas.filter((x) => !used.has(x.toLowerCase()));
}

// ---------------------------------------------------------------- Ready

/** One objective's detail on Ready: "31 now, target 40, by 31 Dec 2027". */
export function objectiveSummary(o) {
  if (o.kind === 'milestone') return `Milestone, by ${shortDate(o.date)}`;
  const start = typedNumber(o.start);
  const target = typedNumber(o.target);
  if (o.kind === 'rating') return `${plainNumber(start)}/10 now, target ${plainNumber(target)}/10, by ${shortDate(o.date)}`;
  return `${plainNumber(start)} now, target ${plainNumber(target)}, by ${shortDate(o.date)}`;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WORKING_DAY_OPTIONS = DAY_NAMES.map((label, value) => ({ value, label }));

/** "Monday to Friday", "Every day", or "Monday, Wednesday and Friday". */
export function workingDaysWords(days) {
  const d = [...new Set(days || [])].sort();
  if (!d.length) return '';
  if (d.length === 7) return 'Every day';
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (run && d.length > 2) return `${DAY_NAMES[d[0]]} to ${DAY_NAMES[d[d.length - 1]]}`;
  const names = d.map((x) => DAY_NAMES[x]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "3 habits across 2 Strategies". */
export function habitsWords(habitCount, strategyCount) {
  if (!habitCount) return '';
  return `${habitCount} ${habitCount === 1 ? 'habit' : 'habits'} across ${strategyCount} ${strategyCount === 1 ? 'Strategy' : 'Strategies'}`;
}

/** "Serves Coaching clients and Annual revenue". A label, so no full stop. */
export function servesNames(names) {
  if (!names.length) return 'Serves no objective yet';
  if (names.length === 1) return `Serves ${names[0]}`;
  return `Serves ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What the sprint set up here passes to Start a sprint (Phase 2 step 3 creates it). */
export function sprintSetupFrom(sprint, fixedStandard = null) {
  const weeks = sprintWeeks(sprint);
  return {
    lengthWeeks: weeks ?? SUGGESTED_LENGTH,
    startOn: sprint.start,
    standard: sprintStandard(sprint, fixedStandard) ?? DEFAULT_STANDARD,
    label: sprint.tpl ? TEMPLATE_LABEL : null,
    template: Boolean(sprint.tpl),
  };
}

/** "Draft my mission" (M6): the three answers in one line, cut at a word to fit 120. */
export function draftMission({ known, serve, great }) {
  const clean = (s, fallback) => ((s || '').trim().replace(/\.$/, '') || fallback);
  const line = `To be known for ${clean(known, 'performing under pressure')}, serving ${clean(serve, 'the people I lead')}, so that ${clean(great, 'we are the best in our field')}.`;
  if (line.length <= MISSION_MAX) return line;
  const cut = line.slice(0, MISSION_MAX - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,\s]+$/, '')}.`;
}
