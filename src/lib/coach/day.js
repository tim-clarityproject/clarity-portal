// The coaching day's rules (Phase 6a run 2; mock-up M11, seq 77): the
// coach's own to-dos, Today, the brief, after a call and sessions left.
// Pure functions only, as model.js: nothing here reads the database, the
// device or the clock by itself, so every rule is a unit test
// (tests/performance/coach-day.test.mjs).
import { addDays, clean, coverState, cut, dayWords, firstName, fromDayKey, minutesWords, possessive, rangeWords, sessionsLeft, timeCredit, toDayKey } from './model.js';
import { DEFAULT_STANDARD, m7IsValidStandard, m7WeekColour } from '../scores/m7.js';
import { overdueRows } from './agreements.js';
import { countFigure, countWords } from './numbers.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const daysBetween = (a, b) => Math.round((fromDayKey(b) - fromDayKey(a)) / 86400000);
const p2 = (n) => String(n).padStart(2, '0');
/** "10:00" from a saved time ("10:00:00"). */
export const timeWords = (time) => (/^\d{2}:\d{2}/.test(String(time || '')) ? String(time).slice(0, 5) : '');

// ---------------------------------------------------------------- how long a to-do takes

export const ESTIMATES = [15, 30, 60, 120];
/** Other: 45 minutes to 8 hours in 15-minute steps (3 hours is suggested first). */
export const OTHER_ESTIMATES = Array.from({ length: (480 - 45) / 15 + 1 }, (_, i) => 45 + i * 15).filter((m) => !ESTIMATES.includes(m));
export const OTHER_SUGGESTED = 180;
export const estimateOk = (m) => m == null || (Number.isInteger(m) && m >= 15 && m <= 480 && m % 15 === 0);
/** "15 minutes", "1 hour", "1 hour 30 minutes": full words, never "min" (tidy follow-up 4). Empty for none. */
export const estimateWords = (m) => (m ? minutesWords(m) : '');

// ---------------------------------------------------------------- where a to-do shows

/** 'done', 'today' (planned for today or carried over), 'upcoming' or 'someday' (no day yet). */
export function todoSection(todo, todayKey) {
  if (todo.done_at) return 'done';
  if (!todo.planned_on) return 'someday';
  return todo.planned_on <= todayKey ? 'today' : 'upcoming';
}

/** "From yesterday" or "From Fri 13 Nov" for a to-do carried over (never "overdue"); empty otherwise. */
export function carriedWords(todo, todayKey) {
  const from = todo.first_planned_on && todo.first_planned_on < (todo.planned_on || todayKey) ? todo.first_planned_on : todo.planned_on;
  if (!from || from >= todayKey || todo.done_at) return '';
  return from === addDays(todayKey, -1) ? 'From yesterday' : `From ${dayWords(from, todayKey)}`;
}

/** "Today", "Tomorrow" (single words), otherwise "Planned for Wed 18 Nov, 10:00". Empty for no day. */
export function plannedWords(todo, todayKey) {
  if (!todo.planned_on) return '';
  const time = timeWords(todo.planned_time);
  if (todo.planned_on === todayKey) return 'Today';
  if (todo.planned_on === addDays(todayKey, 1)) return 'Tomorrow';
  return `Planned for ${dayWords(todo.planned_on, todayKey)}${time ? `, ${time}` : ''}`;
}

/** "Due Fri" inside the next week, "Due today", otherwise "Due Fri 27 Nov". Empty for no deadline. */
export function dueWords(todo, todayKey) {
  if (!todo.due_on || !fromDayKey(todo.due_on)) return '';
  const gap = daysBetween(todayKey, todo.due_on);
  if (gap === 0) return 'Due today';
  if (gap === 1) return 'Due tomorrow';
  if (gap > 1 && gap < 7) return `Due ${SHORT_DAYS[fromDayKey(todo.due_on).getDay()]}`;
  return `Due ${dayWords(todo.due_on, todayKey)}`;
}

/** "2 of 3" for a checklist with items; empty otherwise. */
export function checklistWords(todo) {
  const list = Array.isArray(todo.checklist) ? todo.checklist : [];
  return list.length ? `${countFigure(list.filter((i) => i.done).length)} of ${countFigure(list.length)}` : '';
}

/**
 * The quiet facts under a to-do's title, in M11's order: when (not on
 * Today's own list, where it is understood), the deadline, its list or
 * client, its checklist, "From email".
 * @param {{ lists?: object[], clients?: object[], view?: 'today'|'upcoming'|'someday'|'list' }} ctx
 */
export function todoFacts(todo, ctx = {}, todayKey) {
  const out = [];
  const carried = carriedWords(todo, todayKey);
  if (carried) out.push(carried);
  else if (ctx.view === 'list' || ctx.view === 'upcoming' || ctx.view === 'plan') { const w = plannedWords(todo, todayKey); if (w) out.push(w); }
  else if (ctx.view === 'today' && timeWords(todo.planned_time)) out.push(timeWords(todo.planned_time));
  const due = dueWords(todo, todayKey);
  if (due) out.push(due);
  const list = (ctx.lists || []).find((l) => l.id === todo.list_id);
  const client = (ctx.clients || []).find((c) => c.id === todo.profile_id);
  if (list && ctx.view !== 'list') out.push(list.name);
  else if (client) out.push(client.name);
  const chk = checklistWords(todo);
  if (chk) out.push(chk);
  if (todo.repeat_rule) out.push(repeatWords(todo.repeat_rule, todo.planned_on));
  if (todo.from_email_sender) out.push('From email');
  return out;
}

const byOrder = (a, b) => (Number(Boolean(b.important)) - Number(Boolean(a.important))) || ((a.position || 0) - (b.position || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
/** Important first, then the coach's own order. */
export const sortTodos = (todos) => [...todos].sort(byOrder);

/** Today's list: the working day's to-dos, then After work. */
export function todayTodos(todos, todayKey) {
  const today = sortTodos((todos || []).filter((t) => todoSection(t, todayKey) === 'today'));
  return { work: today.filter((t) => !t.after_work), afterWork: today.filter((t) => t.after_work) };
}

/** Upcoming, grouped by day: "Tomorrow", then "Thu 19 Nov"…, and everything more than a week away together as "Later" (M11). */
export function upcomingGroups(todos, todayKey) {
  const groups = new Map();
  const lastDay = addDays(todayKey, 7);
  for (const t of (todos || []).filter((x) => todoSection(x, todayKey) === 'upcoming')) {
    const key = t.planned_on > lastDay ? 'later' : t.planned_on;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const inOrder = (a, b) => String(a.planned_time || '99').localeCompare(String(b.planned_time || '99')) || byOrder(a, b);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => (day === 'later'
    ? { day, label: 'Later', later: true, items: [...items].sort((a, b) => a.planned_on.localeCompare(b.planned_on) || inOrder(a, b)) }
    : { day, label: day === addDays(todayKey, 1) ? 'Tomorrow' : dayWords(day, todayKey), items: [...items].sort(inOrder) }));
}

export const somedayTodos = (todos, todayKey) => sortTodos((todos || []).filter((t) => todoSection(t, todayKey) === 'someday'));

/** Done this week (since its Monday), newest first. */
export function doneThisWeek(todos, todayKey) {
  const from = weekStart(todayKey);
  return (todos || []).filter((t) => t.done_at && toDayKey(new Date(t.done_at)) >= from).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
}

/** A position that sorts between two neighbours (either may be missing). */
export function positionBetween(before, after) {
  if (before == null && after == null) return 1000;
  if (before == null) return after - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}

/** A to-do moved to a day: it keeps the day it was first planned for, and loses its old time. */
export function moveToDay(todo, dayKey) {
  return { ...todo, planned_on: dayKey, planned_time: null, someday: false, first_planned_on: todo.first_planned_on || todo.planned_on || null };
}

/** A to-do with no day: Someday. */
export const moveToSomeday = (todo) => ({ ...todo, planned_on: null, planned_time: null, someday: true, first_planned_on: null });

/** "Mon 16 Nov": the day a to-do was done. Empty when it isn't done. */
export const doneWords = (todo, todayKey) => (todo.done_at ? dayWords(toDayKey(new Date(todo.done_at)), todayKey) : '');

/** "3 open", "1 open": a list's to-dos still to do. */
export const openWords = (todos) => `${countFigure((todos || []).filter((t) => !t.done_at).length)} open`;

/**
 * Where a to-do lands when it is put at `index` among a list's others: a
 * position between its nearest neighbours of the same importance (Important
 * ones always sort first, so only those neighbours decide its place).
 * @param {object} todo the to-do being moved
 * @param {object[]} listTodos the list it lands in, in the order shown
 * @param {number} index its new place among the others (0 is the top)
 */
export function positionAt(todo, listTodos, index) {
  const others = (listTodos || []).filter((t) => t.id !== todo.id);
  const same = (t) => Boolean(t.important) === Boolean(todo.important);
  const at = Math.max(0, Math.min(index, others.length));
  const before = others.slice(0, at).filter(same).at(-1);
  const after = others.slice(at).filter(same)[0];
  return positionBetween(before ? Number(before.position) || 0 : null, after ? Number(after.position) || 0 : null);
}

/** The days "Date" offers for several to-dos at once: Today, Tomorrow, Next week (its Monday) and Someday (no day). */
export const quickDays = (todayKey) => [
  { label: 'Today', day: todayKey },
  { label: 'Tomorrow', day: addDays(todayKey, 1) },
  { label: 'Next week', day: addDays(weekStart(todayKey), 7) },
  { label: 'Someday', day: null },
];

// ---------------------------------------------------------------- repeats (a rule, never a list of dates)

export const REPEATS = [
  { value: 'never', label: 'Never', rule: null },
  { value: 'day', label: 'Every day', rule: { every: 'day' } },
  { value: 'weekday', label: 'Every weekday', rule: { every: 'weekday' } },
  { value: 'week', label: 'Every week', rule: { every: 'week' } },
  { value: 'week2', label: 'Every 2 weeks', rule: { every: 'week', interval: 2 } },
  { value: 'month', label: 'Every month', rule: { every: 'month' } },
  { value: 'year', label: 'Every year', rule: { every: 'year' } },
  // M11's "2 weeks after I finish it": counted from the day it is ticked, not the day it was planned for.
  { value: 'week2done', label: '2 weeks after I finish it', rule: { every: 'week', interval: 2, from: 'done' } },
];

/** A repeat counted from the day the to-do is finished ("2 weeks after I finish it"), not from its planned day. */
export const fromFinishing = (rule) => Boolean(rule && rule.every && rule.from === 'done');

export function repeatValue(rule) {
  if (!rule || !rule.every) return 'never';
  if (fromFinishing(rule)) {
    const n = Number(rule.interval) || 1;
    return rule.every === 'week' && n === 2 ? 'week2done' : `done:${rule.every}:${n}`;
  }
  if (rule.every === 'week' && Number(rule.interval) === 2) return 'week2';
  return REPEATS.some((r) => r.value === rule.every) ? rule.every : 'never';
}

/**
 * The Repeats choices for a to-do: the usual list, and the to-do's own
 * rule where the list hasn't got it (a quick add's "3 days after I finish
 * it"), so the drop-down always shows what is set.
 */
export function repeatChoices(rule, plannedOn) {
  const value = repeatValue(rule);
  if (REPEATS.some((r) => r.value === value)) return REPEATS;
  return [...REPEATS, { value, label: repeatWords(rule, plannedOn), rule }];
}

/** "Every Thursday", "Every 2 weeks", "Every weekday", "Every month", "2 weeks after I finish it". */
export function repeatWords(rule, plannedOn) {
  if (!rule || !rule.every) return '';
  const n = Number(rule.interval) || 1;
  if (fromFinishing(rule)) {
    const unit = { day: 'day', weekday: 'weekday', week: 'week', month: 'month', year: 'year' }[rule.every] || 'week';
    return `${n} ${unit}${n === 1 ? '' : 's'} after I finish it`;
  }
  const d = fromDayKey(plannedOn);
  if (rule.every === 'day') return n > 1 ? `Every ${n} days` : 'Every day';
  if (rule.every === 'weekday') return 'Every weekday';
  if (rule.every === 'week') return n > 1 ? `Every ${n} weeks` : (d ? `Every ${DAY_NAMES[d.getDay()]}` : 'Every week');
  if (rule.every === 'month') return n > 1 ? `Every ${n} months` : 'Every month';
  return 'Every year';
}

function stepRepeat(rule, key) {
  const n = Math.max(1, Number(rule.interval) || 1);
  const d = fromDayKey(key);
  if (!d) return null;
  if (rule.every === 'day') return addDays(key, n);
  if (rule.every === 'weekday') {
    let next = addDays(key, 1);
    while ([0, 6].includes(fromDayKey(next).getDay())) next = addDays(next, 1);
    return next;
  }
  if (rule.every === 'week') return addDays(key, 7 * n);
  // A month or a year on: the same date, or the month's last day where it has no such date (31 Jan, then 28 Feb).
  const months = rule.every === 'month' ? n : 12 * n;
  const y = d.getFullYear() + Math.floor((d.getMonth() + months) / 12);
  const m = (d.getMonth() + months) % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return toDayKey(new Date(y, m, Math.min(d.getDate(), last), 12));
}

/**
 * The next day a repeating to-do comes round: after the day it was planned
 * for and after today, so one ticked late never comes back in the past.
 * A repeat counted from finishing ("2 weeks after I finish it") is counted
 * from today, the day it is ticked. Null when the rule has stopped (its
 * "until" has passed) or there is none.
 */
export function nextRepeat(rule, plannedOn, todayKey) {
  if (!rule || !rule.every) return null;
  if (fromFinishing(rule)) {
    const next = stepRepeat(rule, todayKey);
    if (!next || (rule.until && next > rule.until)) return null;
    return next;
  }
  const base = plannedOn || todayKey;
  let next = base;
  // A monthly rule keeps its own day of the month (31 Jan, 28 Feb, 31 Mar): each step starts from the first day.
  let steps = 0;
  do {
    steps += 1;
    next = rule.every === 'month' || rule.every === 'year' ? stepRepeat({ ...rule, interval: (Number(rule.interval) || 1) * steps }, base) : stepRepeat(rule, next);
    if (!next || steps > 5000) return null;
  } while (next <= todayKey);
  if (rule.until && next > rule.until) return null;
  return next;
}

/**
 * The id of a repeating to-do's next one, the same wherever it is made: the
 * ticked to-do's id and the next one's day, hashed (128 bits, in a uuid's
 * shape). Two tabs or two devices ticking the same to-do make one next
 * to-do, saved twice, never two (the break-it tester, 22 Nov).
 */
export function repeatId(todoId, day) {
  const text = `${todoId}>${day}`;
  let h1 = 1779033703; let h2 = 3144134277; let h3 = 1013904242; let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Ticking a to-do. A repeating one makes the next (a new row, with its
 * checklist unticked); otherwise just the tick. `newId` is the next one's
 * id, or a function of its day (repeatId).
 * @returns {{ done: object, next: object|null }}
 */
export function completeTodo(todo, nowIso, todayKey, newId) {
  const done = { ...todo, done_at: nowIso };
  const day = nextRepeat(todo.repeat_rule, todo.planned_on, todayKey);
  if (!day) return { done, next: null };
  const next = {
    ...todo, id: typeof newId === 'function' ? newId(day) : newId, done_at: null, planned_on: day, first_planned_on: null, repeat_of: todo.id,
    checklist: (todo.checklist || []).map((i) => ({ ...i, done: false })), created_at: nowIso, updated_at: nowIso,
  };
  return { done: { ...done, repeat_rule: null }, next };
}

// ---------------------------------------------------------------- the quick add

const WORD_DAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const nextWeekday = (todayKey, dow) => { let k = addDays(todayKey, 1); while (fromDayKey(k).getDay() !== dow) k = addDays(k, 1); return k; };
const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/**
 * What was typed into "What needs doing?", read in plain words:
 * "Send the renewal pack to Dana tomorrow 10:00 30m #Kestrel renewal @Email !"
 * A day (today, tomorrow, a weekday), a time (10:00), an estimate (30m, 1h,
 * 1h30), "every Monday" and friends, "someday", "after work", # a list or
 * client, @ a tag, ! important. What isn't recognised stays in the title.
 * `defaultDay`: the day a to-do goes to when no day is typed (Today's own
 * list adds to today); typing "someday" still means no day.
 * @param {{ todayKey: string, lists?: object[], tags?: object[], clients?: object[], defaultDay?: string|null }} ctx
 */
export function parseQuickAdd(text, { todayKey, lists = [], tags = [], clients = [], defaultDay = null } = {}) {
  let rest = ` ${String(text || '').replace(/\s+/g, ' ')} `;
  const out = { title: '', planned_on: null, planned_time: null, minutes: null, important: false, list_id: null, new_list: null, profile_id: null, tag_ids: [], new_tags: [], repeat_rule: null, someday: false, after_work: false };
  const take = (re, fn) => { rest = rest.replace(re, (...m) => { const keep = fn(...m); return keep === false ? m[0] : ' '; }); };

  take(/\s!(?=\s)|\s!important(?=\s)/gi, () => { out.important = true; });
  // # a list or a client: the longest name that matches wins ("#Kestrel renewal").
  take(/\s#([^#@!]+?)(?=\s[#@!]|\s+$)/g, (_m, raw) => {
    const words = clean(raw).split(' ');
    for (let n = words.length; n > 0; n -= 1) {
      const name = words.slice(0, n).join(' ');
      const list = lists.find((l) => sameName(l.name, name) && !l.finished_at);
      const client = clients.find((c) => sameName(c.name, name) || (n === 1 && sameName(firstName(c.name), name)));
      if (list || client) {
        if (list) out.list_id = list.id; else out.profile_id = client.id;
        rest = `${rest} ${words.slice(n).join(' ')} `;
        return true;
      }
    }
    // One word that starts exactly one list's name is that list ("#Kestrel" is "Kestrel renewal": M11).
    const starts = lists.filter((l) => !l.finished_at && sameName(String(l.name || '').split(' ')[0], words[0]));
    if (starts.length === 1) {
      out.list_id = starts[0].id;
      rest = `${rest} ${words.slice(1).join(' ')} `;
      return true;
    }
    out.new_list = cut(clean(raw), 80);
    return true;
  });
  take(/\s@([^\s#@!]+)/g, (_m, raw) => {
    const tag = tags.find((t) => sameName(t.name, raw));
    if (tag) out.tag_ids.push(tag.id); else out.new_tags.push(cut(clean(raw), 40));
  });
  // M11: "2 weeks after I finish it", "every 3 days after done", "every month after I finished".
  take(/\s(?:every\s+(?:(\d+)\s+)?|(\d+)\s+)(day|week|month)s?\s+after\s+(?:i\s+)?(?:finish|finished|done)(?:\s+it)?(?=\s)/gi, (_m, a, b2, unit) => {
    const n = Number(a || b2 || 1);
    if (!(n >= 1 && n <= 52)) return false;
    out.repeat_rule = { every: unit.toLowerCase(), ...(n > 1 ? { interval: n } : {}), from: 'done' };
    return undefined;
  });
  take(/\severy (day|weekday|week|month|year|other week|2 weeks|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s)/gi, (_m, w) => {
    const word = w.toLowerCase();
    if (word in WORD_DAYS) { out.repeat_rule = { every: 'week' }; out.planned_on = fromDayKey(todayKey).getDay() === WORD_DAYS[word] ? todayKey : nextWeekday(todayKey, WORD_DAYS[word]); } else if (word === 'other week' || word === '2 weeks') out.repeat_rule = { every: 'week', interval: 2 };
    else out.repeat_rule = { every: word };
  });
  take(/\safter work(?=\s)/gi, () => { out.after_work = true; });
  take(/\ssomeday(?=\s)/gi, () => { out.someday = true; });
  take(/\s(today|tomorrow)(?=\s)/gi, (_m, w) => { out.planned_on = w.toLowerCase() === 'today' ? todayKey : addDays(todayKey, 1); });
  take(/\s(?:on |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs)?|fri|sat)(?=\s)/gi, (_m, w) => {
    if (out.planned_on) return false;
    out.planned_on = nextWeekday(todayKey, WORD_DAYS[w.toLowerCase()]);
    return true;
  });
  take(/\s(?:at )?([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s)/g, (_m, h, m) => { out.planned_time = `${p2(h)}:${m}`; });
  take(/\s(\d{1,2})\s?h(?:(?:ours?|rs?)?\s?([0-5]?\d)\s?m(?:in(?:s|utes)?)?)?(?=\s)|\s(\d{1,3})\s?m(?:in(?:s|utes)?)?(?=\s)/gi, (_m, h, hm, m) => {
    const mins = h != null ? Number(h) * 60 + (Number(hm) || 0) : Number(m);
    if (!estimateOk(mins)) return false;
    out.minutes = mins;
    return true;
  });

  if (out.someday) { out.planned_on = null; out.planned_time = null; } else if (!out.planned_on && (out.planned_time || out.repeat_rule || out.after_work)) out.planned_on = todayKey;
  if (!out.someday && !out.planned_on && defaultDay) out.planned_on = defaultDay;
  if (!out.planned_on) { out.someday = true; out.planned_time = null; }
  const title = clean(rest);
  out.title = cut(title ? title[0].toUpperCase() + title.slice(1) : '', 300);
  return out;
}

/** The chips under the quick add, saying how it was read: "Tomorrow", "at 10:00", the list, tags, "Important", "30 minutes". */
export function quickAddChips(parsed, { todayKey, lists = [], tags = [], clients = [] } = {}) {
  if (!parsed || !parsed.title) return [];
  const chips = [];
  if (parsed.after_work) chips.push('After work, today');
  else if (parsed.someday || !parsed.planned_on) chips.push('Someday');
  else if (parsed.planned_on === todayKey) chips.push('Today');
  else if (parsed.planned_on === addDays(todayKey, 1)) chips.push('Tomorrow');
  else chips.push(dayWords(parsed.planned_on, todayKey));
  if (parsed.planned_time) chips.push(`at ${parsed.planned_time}`);
  if (parsed.repeat_rule) chips.push(repeatWords(parsed.repeat_rule, parsed.planned_on));
  const list = lists.find((l) => l.id === parsed.list_id);
  if (list) chips.push(list.name);
  if (parsed.new_list) chips.push(`New list: ${parsed.new_list}`);
  const client = clients.find((c) => c.id === parsed.profile_id);
  if (client) chips.push(client.name);
  for (const id of parsed.tag_ids) { const t = tags.find((x) => x.id === id); if (t) chips.push(t.name); }
  for (const name of parsed.new_tags) chips.push(`New tag: ${name}`);
  if (parsed.important) chips.push('Important');
  if (parsed.minutes) chips.push(estimateWords(parsed.minutes));
  return chips;
}

/** Where a new to-do went, for its toast: "Added to Today.", "Added to Thu 19 Nov." */
export function addedWords(parsed, todayKey) {
  if (parsed.after_work) return 'Added to After work.';
  if (!parsed.planned_on) return 'Added to Someday.';
  if (parsed.planned_on === todayKey) return 'Added to Today.';
  if (parsed.planned_on === addDays(todayKey, 1)) return 'Added to Tomorrow.';
  return `Added to ${dayWords(parsed.planned_on, todayKey)}.`;
}

// ---------------------------------------------------------------- the working day, and a day that is over-full

const DEFAULT_HOURS = { mon: { from: '09:00', to: '17:00' }, tue: { from: '09:00', to: '17:00' }, wed: { from: '09:00', to: '17:00' }, thu: { from: '09:00', to: '17:00' }, fri: { from: '09:00', to: '17:00' } };
const clockMinutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** The coach's working day on a day: { from, to, minutes }, or null for a day off. */
export function workingDay(settings, dayKey) {
  const d = fromDayKey(dayKey);
  if (!d) return null;
  const own = settings?.working_hours && Object.keys(settings.working_hours).length ? settings.working_hours : DEFAULT_HOURS;
  const h = own[WEEK_KEYS[d.getDay()]];
  const a = clockMinutes(h?.from);
  const b = clockMinutes(h?.to);
  if (a == null || b == null || b <= a) return null;
  return { from: h.from, to: h.to, minutes: b - a };
}

/** The sessions on a day that are still to happen or went ahead (a moved, cancelled or missed one takes no time). */
export function callsOn(sessions, dayKey) {
  return (sessions || []).filter((s) => toDayKey(new Date(s.starts_at)) === dayKey && (!s.outcome || s.outcome === 'held'))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

/**
 * How full a day is: the calls booked, the to-dos from their time
 * estimates (After work and done ones left out), and the working day.
 * `over` is the minutes it runs past the working day, 0 when it fits.
 */
export function dayLoad({ sessions = [], todos = [], settings = null, dayKey }) {
  const calls = callsOn(sessions, dayKey);
  const callMinutes = calls.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const work = todayTodos(todos, dayKey).work;
  const todoMinutes = work.reduce((n, t) => n + (Number(t.minutes) || 0), 0);
  const day = workingDay(settings, dayKey);
  const dayMinutes = day ? day.minutes : 0;
  return { calls: calls.length, callMinutes, todoMinutes, day, dayMinutes, over: day ? Math.max(0, callMinutes + todoMinutes - dayMinutes) : 0 };
}

/** "45 minutes over", "1 hour 15 minutes over": the words that are the link in "Today is 45 minutes over." */
export const overWords = (minutes) => `${minutesWords(minutes)} over`;

/**
 * Choose what to move: enough of today's to-dos to fit the day, taken from
 * the bottom of the list up, never an Important one and never one with no
 * estimate (moving it frees nothing).
 * @returns {string[]} the ids suggested, in the list's order
 */
export function suggestMoves(workTodos, over) {
  if (!(over > 0)) return [];
  const picked = [];
  let freed = 0;
  for (let i = workTodos.length - 1; i >= 0 && freed < over; i -= 1) {
    const t = workTodos[i];
    if (t.important || !(Number(t.minutes) > 0)) continue;
    picked.push(t.id);
    freed += Number(t.minutes);
  }
  const ids = new Set(picked);
  return workTodos.filter((t) => ids.has(t.id)).map((t) => t.id);
}

/** As boxes are ticked: what is still over, the line that says so and the button's words. */
export function moveState(workTodos, tickedIds, over) {
  const ids = new Set(tickedIds);
  const freed = workTodos.filter((t) => ids.has(t.id)).reduce((n, t) => n + (Number(t.minutes) || 0), 0);
  const still = Math.max(0, over - freed);
  return {
    still,
    line: still > 0 ? `Still ${minutesWords(still)} over.` : 'That fits your day.',
    button: `Move ${countFigure(ids.size)} to tomorrow`,
    count: ids.size,
  };
}

// ---------------------------------------------------------------- the week and capacity

/** The Monday of a day's week. */
export function weekStart(dayKey) {
  const d = fromDayKey(dayKey);
  if (!d) return null;
  return addDays(dayKey, -((d.getDay() + 6) % 7));
}

// "17", "16.5", "15,270": a thousands comma as every count (tidy follow-up 4).
const hoursWords = (minutes) => (Math.round((minutes / 60) * 10) / 10).toLocaleString('en-GB', { maximumFractionDigits: 1 });

/**
 * Capacity: this week's coaching hours (sessions that went ahead or are
 * still to come) against the coach's target. A week over reads "17 of 15"
 * with a small "2 over"; its bar is full, in soft coral, never mint.
 */
export function capacity(sessions, target, todayKey) {
  const from = weekStart(todayKey);
  const to = addDays(from, 6);
  const mine = (sessions || []).filter((s) => { const k = toDayKey(new Date(s.starts_at)); return k >= from && k <= to && (!s.outcome || s.outcome === 'held'); });
  const minutes = mine.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const goal = Number(target) > 0 ? Number(target) : 15;
  const overMinutes = Math.max(0, minutes - goal * 60);
  return {
    minutes, calls: mine.length, target: goal,
    words: `${hoursWords(minutes)} of ${hoursWords(goal * 60)}`,
    over: overMinutes > 0,
    overWords: overMinutes > 0 ? `${hoursWords(overMinutes)} over` : '',
    percent: Math.min(100, Math.round((minutes / (goal * 60)) * 100)),
    spoken: `${hoursWords(minutes)} of ${hoursWords(goal * 60)} coaching hours this week${overMinutes > 0 ? `, ${hoursWords(overMinutes)} over` : ''}`,
  };
}

/** What a typed capacity must be: whole or half hours from 1 to 80. Returns the number, or null. */
export function capacityFromTyped(typed) {
  const n = Number(clean(typed).replace(/\s*hours?$/i, ''));
  return Number.isFinite(n) && n >= 1 && n <= 80 && Number.isInteger(n * 2) ? n : null;
}

export const ENERGY = [
  { value: 'poor', label: 'Poor' }, { value: 'fair', label: 'Fair' }, { value: 'good', label: 'Good' },
  { value: 'very_good', label: 'Very good' }, { value: 'excellent', label: 'Excellent' },
];
export const energyWord = (value) => ENERGY.find((e) => e.value === value)?.label || '';

/**
 * Today's one offer row (never two at once): Close the day in the evening
 * (from the working day's end, or 17:00); on a Friday afternoon Rate my
 * energy until it is rated, then the Weekly review until it is done; in the
 * morning Plan my day until it is planned, only until 12:00 and only on a
 * working day (Settings, Working hours; tidy follow-up 3, run 6's 13). Null
 * when there is none, or it
 * was put off with Not now (kept for the visit by the page).
 * @param {{ now: Date, todayKey: string, day?: object, week?: object, settings?: object, putOff?: string[] }} a
 */
export function todayOffer({ now, todayKey, day = null, week = null, settings = null, putOff = [] }) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const hours = workingDay(settings, todayKey);
  const evening = Math.max(clockMinutes(hours?.to) ?? 17 * 60, 16 * 60);
  const friday = fromDayKey(todayKey)?.getDay() === 5;
  const off = new Set(putOff);
  const planned = Boolean(day?.planned_at);
  if (mins >= evening) return !day?.closed_at && !off.has('close') ? 'close' : null;
  if (friday && mins >= 12 * 60 && !week?.energy && !off.has('energy')) return 'energy';
  if (friday && !week?.reviewed_at && (planned || day?.plan_skipped || mins >= 12 * 60) && !off.has('review')) return 'review';
  if (hours && mins < 12 * 60 && !planned && !day?.plan_skipped && !off.has('plan')) return 'plan';
  if (friday && !week?.reviewed_at && !off.has('review')) return 'review';
  return null;
}

// ---------------------------------------------------------------- cover, as the cover coach sees it

const COVER_WORDS = { waiting: 'Waiting for the client to agree', before: 'Agreed', on: 'Covering now' };

/**
 * Today's short list for a cover coach (tidy follow-up 3, run 6's 14): each
 * client they cover for another coach that isn't over yet, soonest first,
 * with the dates and where it stands. The client's name shows only once the
 * database lets the cover coach read it (between the dates, after the
 * client agreed: 049's covers_profile); before that the row says whose
 * client it is. The covering coach's own cover only: never the owner's
 * view of everyone's (that is Settings, Away and cover).
 * @returns {{ id, name, coach, title, facts: string[], label, state }[]}
 */
export function coveringRows({ covers = [], coachId, profiles = [], coaches = [], todayKey }) {
  const coachName = (id) => firstName(coaches.find((c) => c.coach_id === id)?.first_name || coaches.find((c) => c.coach_id === id)?.full_name || '') || 'another coach';
  return covers
    .filter((c) => c && c.cover_coach_id === coachId && coverState(c, todayKey) !== 'over')
    .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)) || String(a.id).localeCompare(String(b.id)))
    .map((c) => {
      const state = coverState(c, todayKey);
      const profile = profiles.find((p) => p.id === c.profile_id) || null;
      const coach = coachName(c.coach_id);
      const name = profile?.name ? clean(profile.name) : `One of ${possessive(coach)} clients`;
      const dates = `${rangeWords(c.starts_on, c.ends_on, todayKey)}, for ${coach}`;
      return { id: c.id, name, coach, state, title: name, facts: [dates, COVER_WORDS[state]], label: `${name}, ${dates}. ${COVER_WORDS[state]}.` };
    });
}

export const OFFERS = {
  plan: { title: 'Plan my day', time: '~3 minutes' },
  close: { title: 'Close the day', time: '~2 minutes' },
  review: { title: 'Weekly review', time: '~3 minutes' },
  energy: { title: 'Rate my energy', time: '~30 seconds' },
};

// ---------------------------------------------------------------- sessions

export const OUTCOMES = [
  { value: 'held', label: 'It went ahead' },
  { value: 'late_cancel', label: 'Cancelled with under 24 hours’ notice' },
  { value: 'no_show', label: 'No-show' },
  { value: 'moved', label: 'Moved' },
];
export const SESSION_LENGTHS = [30, 60, 90];
export const SESSION_KINDS = { coaching: 'Coaching session', group: 'Group session', three_way: 'Three-way meeting', review: 'Review', chemistry: 'Chemistry Call', other: 'Session' };

/** Does a session count as one of the engagement's? (The database decides the same way: 050's session_counts.) */
export const sessionCounts = (s) => Boolean(s) && (s.outcome === 'held' || s.outcome === 'no_show' || (s.outcome === 'late_cancel' && !s.waived));

/** Was a cancellation late: under 24 hours before the session's start? */
export function isLateCancellation(startsAt, cancelledAt) {
  const gap = new Date(startsAt).getTime() - new Date(cancelledAt).getTime();
  return Number.isFinite(gap) && gap < 24 * 60 * 60 * 1000;
}

/** The one line under "What happened?" for anything but a session that went ahead. */
export function outcomeLine(outcome, name, waived = false) {
  const first = firstName(name) || 'the client';
  if (outcome === 'late_cancel') return waived ? 'Waived. It no longer counts as used.' : `It counts as one of ${possessive(first)} sessions.`;
  if (outcome === 'no_show') return 'It counts as used, and only you see it.';
  if (outcome === 'moved') return 'It doesn’t count as used.';
  return '';
}

/**
 * An engagement with its count as it stands on this device: the sessions
 * held before sessions were recorded one by one, plus every recorded one
 * that counts (its own, and a group session's own-engagement members). The
 * database keeps sessions_held the same way once 050 is there.
 * `older` (store.js's sessionsOlder): while a first load's older sessions
 * aren't on the device yet, the database's count of those that count
 * (057), so the count is the whole one from the first screen on.
 */
// Each engagement's sessions that count (its own, and its members' of group sessions), worked out once per change to
// the sessions or their people and kept for those two lists (coach first screen run: counting them again for every
// engagement, every client and every draw took most of a second of the owner's return visit on a slowed phone).
const countMemo = new WeakMap(); // sessions -> WeakMap(people -> Map(engagement id -> count))
function countsByEngagement(sessions, people) {
  let byPeople = countMemo.get(sessions);
  if (!byPeople) { byPeople = new WeakMap(); countMemo.set(sessions, byPeople); }
  let counts = byPeople.get(people);
  if (!counts) {
    counts = new Map();
    const add = (id) => { if (id != null) counts.set(id, (counts.get(id) || 0) + 1); };
    const byId = new Map();
    for (const s of sessions) { if (s && !byId.has(s.id)) byId.set(s.id, s); if (s && sessionCounts(s)) add(s.engagement_id); }
    for (const sp of people) if (sp && sp.engagement_id != null && sessionCounts(byId.get(sp.session_id))) add(sp.engagement_id);
    byPeople.set(people, counts);
  }
  return counts;
}

export function withSessions(engagement, sessions = [], people = [], older = null) {
  if (!engagement) return engagement;
  const counted = (countsByEngagement(sessions || [], people || []).get(engagement.id) || 0)
    + (Number(older?.held?.[engagement.id]) || 0);
  // Before 050 (or before its row has come back) there is no base: the count kept so far is it.
  const known = engagement.sessions_held_base != null;
  const base = known ? Number(engagement.sessions_held_base) : (Number(engagement.sessions_held) || 0);
  return { ...engagement, sessions_held: Math.max(0, base + counted), sessions_recorded: counted, sessions_held_base: base };
}

/**
 * An engagement as it is saved for any reason but a typed count (its dates,
 * its name, ending it, a close, an Undo): the count it carries is the base
 * plus every recorded session that counts, as it stands now. Migration 050
 * reads a count that differs from the database's as one the coach typed and
 * moves the base, so a row saved with the count it had when it was loaded
 * would lose the sessions recorded since. Before there is a base (before
 * 050, and before any count is typed) the kept count is the base, and the
 * row goes as it is.
 */
export function engagementToSave(engagement, sessions = [], people = [], older = null) {
  if (!engagement || engagement.sessions_held_base == null) return engagement;
  return { ...engagement, sessions_held: withSessions(engagement, sessions, people, older).sessions_held };
}

/** A count the coach types: the base moves so the total is what they typed. */
export const withHeldTyped = (engagement, typed, recorded = 0) => ({ ...engagement, sessions_held: Math.max(0, typed), sessions_held_base: Math.max(0, typed) - recorded });

/** "2 sessions left", "1 session left", "No sessions left"; empty when it isn't counted in sessions. */
export function leftWords(engagement, packs) {
  const s = sessionsLeft(engagement, packs);
  if (!s) return '';
  return s.left === 0 ? 'No sessions left' : `${countWords(s.left, 'session')} left`;
}

const ended = (s) => new Date(s.starts_at).getTime() + (Number(s.minutes) || 0) * 60000;
// Oldest first (or newest first), sessions at the same moment in the order of their ids: the same pick whichever order
// they came in (a first load sends some older sessions before the rest arrive; 057).
const byStart = (a, b) => (new Date(a.starts_at) - new Date(b.starts_at)) || String(a.id).localeCompare(String(b.id));
const byStartNewest = (a, b) => (new Date(b.starts_at) - new Date(a.starts_at)) || String(a.id).localeCompare(String(b.id));

/** A session's row on the client's page: its name, its quiet facts and its day. */
export function sessionRow(session, todayKey) {
  const day = dayWords(toDayKey(new Date(session.starts_at)), todayKey);
  const mins = `${session.minutes} minutes`;
  if (session.outcome === 'late_cancel') return { title: 'Late cancellation', facts: [session.waived ? 'Waived' : 'Counts as used'], when: day };
  if (session.outcome === 'no_show') return { title: 'No-show', facts: ['Counts as used'], when: day };
  if (session.outcome === 'moved') return { title: 'Moved', facts: session.moved_to ? [`To ${dayWords(toDayKey(new Date(session.moved_to)), todayKey)}`] : [], when: day };
  const title = SESSION_KINDS[session.kind] || SESSION_KINDS.coaching;
  if (!session.outcome) return { title, facts: [mins], when: day };
  return { title, facts: [mins, session.recap_sent_at ? 'Recap sent' : (clean(session.recap) ? 'Recap to send' : 'No recap yet')], when: day };
}

/** Sessions that have ended and haven't been written up, oldest first. */
export const toWriteUp = (sessions, now) => (sessions || []).filter((s) => !s.outcome && ended(s) <= new Date(now).getTime()).sort(byStart);

export const RECAP_NUDGE_HOURS = 24;
/** Recaps still unsent 24 hours after a call that went ahead (the quiet line on Today), oldest first. */
export function recapNudges(sessions, now) {
  const limit = new Date(now).getTime() - RECAP_NUDGE_HOURS * 60 * 60 * 1000;
  return (sessions || []).filter((s) => s.outcome === 'held' && !s.recap_sent_at && ended(s) <= limit).sort(byStart);
}

/** The last session with someone that happened before a moment, and the next one after it. */
export function lastSession(sessions, match, before) {
  const t = new Date(before).getTime();
  return (sessions || []).filter((s) => match(s) && s.outcome === 'held' && new Date(s.starts_at).getTime() < t).sort(byStartNewest)[0] || null;
}
export function nextSession(sessions, match, after) {
  const t = new Date(after).getTime();
  return (sessions || []).filter((s) => match(s) && !s.outcome && ended(s) > t).sort(byStart)[0] || null;
}

/** "Today, 12:30", "Tomorrow, 09:00", "Thu 19 Nov, 16:00" on the device's own clock. */
export function whenWords(at, todayKey) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const key = toDayKey(d);
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (key === todayKey) return `Today, ${time}`;
  if (key === addDays(todayKey, 1)) return `Tomorrow, ${time}`;
  return `${dayWords(key, todayKey)}, ${time}`;
}
export const clockTime = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : `${p2(d.getHours())}:${p2(d.getMinutes())}`; };

// ---------------------------------------------------------------- the brief

/**
 * Since last time: the average performance score of the weeks that ended
 * since the last session (the last 4 weeks for a first session).
 * @param {{ week_end: string, score: number|null }[]} weekScores what the client shares
 * @returns {{ label: string, value: string|null, none: string }} value is "81%", or null with `none` to say instead
 */
export function averageSince(weekScores, lastSessionAt, todayKey) {
  const since = lastSessionAt ? toDayKey(new Date(lastSessionAt)) : addDays(todayKey, -28);
  const rows = (weekScores || []).filter((w) => w.score != null && w.week_end > since && w.week_end <= todayKey);
  const label = lastSessionAt ? `Average performance score since ${dayWords(since, todayKey)}` : 'Average performance score over the last 4 weeks';
  if (!rows.length) return { label, value: null, none: lastSessionAt ? `No check-ins since ${dayWords(since, todayKey)}.` : 'No check-ins in the last 4 weeks.' };
  const avg = rows.reduce((n, w) => n + Number(w.score), 0) / rows.length;
  return { label, value: `${Math.round(avg)}%`, none: '' };
}

/**
 * The client's own standard for the brief's bar (run 6, item 5): the
 * standard of the sprint of the newest week the average counts (each
 * week_scores row carries its sprint's `standard`, as the client's own
 * dashboard reads it from their sprint), else of the newest week shared at
 * all; the default 85 only when there is none.
 * @param {{ week_end: string, score: number|null, standard?: number|null }[]} weekScores
 * @returns {number}
 */
export function standardSince(weekScores, lastSessionAt, todayKey) {
  const since = lastSessionAt ? toDayKey(new Date(lastSessionAt)) : addDays(todayKey, -28);
  const own = (weekScores || []).filter((w) => m7IsValidStandard(Number(w.standard)) && w.week_end <= todayKey)
    .sort((a, b) => String(b.week_end).localeCompare(String(a.week_end)));
  const counted = own.find((w) => w.score != null && w.week_end > since);
  return Number((counted || own[0])?.standard ?? DEFAULT_STANDARD);
}

/** Is an average ("81%") below the client's standard (the bar's grey band)? As the client's own dashboard colours a week (M7). */
export const belowStandard = (value, standard = DEFAULT_STANDARD) => value != null && m7WeekColour(parseFloat(value), standard) === 'below';

/** "Sam added this on Sun 15 Nov." */
export const prepLine = (name, notedAt, todayKey) => `${firstName(name)} added this on ${dayWords(toDayKey(new Date(notedAt)), todayKey)}.`;

// ---------------------------------------------------------------- who needs attention (coaching facts only)

/**
 * Who needs attention: coaching facts only, never flags from portal use.
 * A session to write up, a recap to send, 2 sessions or fewer left (with
 * Offer a renewal), time credit running low, and no next session booked;
 * then invoices overdue on the payer's own clock (Phase 6b run 1; M11 B1:
 * agreements.js's overdueRows), the coach's own, then for the owner every
 * associate's, after every row above, which keep their order.
 * @returns {{ key: string, profileId: string, name: string, line: string, action: string, to: string, state?: object }[]}
 */
export function attentionRows({ clients = [], engagements = [], packs = [], entries = [], sessions = [], people = [], older = null, now, todayKey,
  invoices = [], coachId = null, isOwner = false, admin = [], organisations = [], coaches = [], coachZone = null }) {
  const rows = [];
  const t = new Date(now).getTime();
  // Each client's own sessions, gathered once (they were searched for again for every client; coach first screen run).
  const byClient = new Map();
  for (const s of sessions) { if (!byClient.has(s.profile_id)) byClient.set(s.profile_id, []); byClient.get(s.profile_id).push(s); }
  for (const c of clients.filter((p) => p.status !== 'past' && !p.merged_into)) {
    const mine = byClient.get(c.id) || [];
    const first = firstName(c.name);
    const waiting = toWriteUp(mine, now)[0];
    if (waiting) {
      const day = toDayKey(new Date(waiting.starts_at));
      rows.push({ key: `w:${waiting.id}`, profileId: c.id, name: c.name, line: `${day === todayKey ? 'Today’s' : day === addDays(todayKey, -1) ? 'Yesterday’s' : `${possessive(dayWords(day, todayKey))}`} session is ready to write up.`, action: 'Write it up', to: `/coach/sessions/${waiting.id}` });
    }
    const unsent = mine.filter((s) => s.outcome === 'held' && !s.recap_sent_at && clean(s.recap)).sort(byStart)[0];
    if (unsent && unsent !== waiting) {
      const day = toDayKey(new Date(unsent.starts_at));
      rows.push({ key: `r:${unsent.id}`, profileId: c.id, name: c.name, line: `${day === addDays(todayKey, -1) ? 'Yesterday’s' : possessive(dayWords(day, todayKey))} recap is ready to check.`, action: 'Check the recap', to: `/coach/sessions/${unsent.id}` });
    }
    const raw = engagements.find((e) => e.profile_id === c.id && e.status !== 'ended');
    const engagement = withSessions(raw, sessions, people, older);
    const left = sessionsLeft(engagement, packs);
    if (left && left.total > 0 && left.left <= 2 && left.held > 0) {
      rows.push({ key: `l:${c.id}`, profileId: c.id, name: c.name, line: `${leftWords(engagement, packs)}.`.replace(/^(\d+ sessions? left)\.$/, `${first} has $1.`).replace(/^No sessions left\.$/, `${first} has no sessions left.`), short: leftWords(engagement, packs), action: 'Offer a renewal', to: `/coach/renewals/${c.id}`, later: true });
    }
    const credit = timeCredit(raw, packs, entries, now);
    if (credit && credit.total > 0 && credit.left <= 180) {
      rows.push({ key: `c:${c.id}`, profileId: c.id, name: c.name, line: `${minutesWords(credit.left)} of time credit ${credit.left === 60 || credit.left === 1 ? 'is' : 'are'} left.`, action: `Open ${possessive(first)} page`, to: `/coach/clients/${c.id}` });
    }
    const held = mine.some((s) => s.outcome === 'held');
    const upcoming = mine.some((s) => !s.outcome && new Date(s.starts_at).getTime() > t);
    if (held && !upcoming && left && left.left > 0 && !waiting) {
      rows.push({ key: `n:${c.id}`, profileId: c.id, name: c.name, line: 'No next session is booked.', action: `Open ${possessive(first)} page`, to: `/coach/clients/${c.id}` });
    }
  }
  if (invoices.length) rows.push(...overdueRows({ invoices, coachId, isOwner, clients, admin, organisations, coaches, now, coachZone }));
  return rows;
}

/** The first 4, then "Show all 9". */
export const ATTENTION_FIRST = 4;

// ---------------------------------------------------------------- the day's and the week's summaries

/** Close the day, step 1: "4 calls held, 3 recaps sent." */
export function dayDone({ sessions = [], todos = [], todayKey }) {
  const today = sessions.filter((s) => toDayKey(new Date(s.starts_at)) === todayKey);
  const held = today.filter((s) => s.outcome === 'held').length;
  const sent = today.filter((s) => s.recap_sent_at).length;
  const done = todos.filter((t) => t.done_at && toDayKey(new Date(t.done_at)) === todayKey).length;
  const n = (count, one, many) => countWords(count, one, many);
  return { calls: today.filter((s) => !s.outcome || s.outcome === 'held').length, held, sent, done, line: `${n(held, 'call', 'calls')} held, ${n(sent, 'recap', 'recaps')} sent.` };
}

/** The weekly review's figures: hours, calls, to-dos done and recaps sent this week, and next week's calls a day. */
export function weekDone({ sessions = [], todos = [], target, todayKey }) {
  const from = weekStart(todayKey);
  const to = addDays(from, 6);
  const inWeek = (at, a = from, b = to) => { const k = toDayKey(new Date(at)); return k >= a && k <= b; };
  const cap = capacity(sessions, target, todayKey);
  const next = Array.from({ length: 5 }, (_, i) => addDays(from, 7 + i));
  const shape = next.map((day) => ({ day, label: SHORT_DAYS[fromDayKey(day).getDay()], calls: callsOn(sessions, day).length }));
  const total = shape.reduce((n, d) => n + d.calls, 0);
  const max = Math.max(0, ...shape.map((d) => d.calls));
  const busiest = shape.filter((d) => d.calls === max && max > 0).map((d) => DAY_NAMES[fromDayKey(d.day).getDay()]);
  const shapeLine = total === 0 ? 'No calls are booked next week yet.'
    : `${countWords(total, 'call')}, the busiest on ${busiest.length > 2 ? `${busiest.slice(0, -1).join(', ')} and ${busiest.at(-1)}` : busiest.join(' and ')}.`;
  return {
    capacity: cap,
    todosDone: doneThisWeek(todos, todayKey),
    recapsSent: sessions.filter((s) => s.recap_sent_at && inWeek(s.recap_sent_at)).length,
    shape, shapeLine,
  };
}

// ---------------------------------------------------------------- Today's own rules (the page, Plan my day, Close the day)

const nameOfSession = (s, clients, groups) => (s.group_id ? (groups || []).find((g) => g.id === s.group_id)?.name : (clients || []).find((c) => c.id === s.profile_id)?.name) || '';

/**
 * The recap nudge's one quiet line: the oldest recap still unsent 24 hours
 * after its call, "and 2 more are waiting" when there are others. `older`
 * (store.js's sessionsOlder): the recaps not sent among the sessions not on
 * the device yet (057), counted in "more".
 * @returns {{ session: object, line: string, more: number }|null}
 */
export function recapNudgeLine({ sessions = [], clients = [], groups = [], older = null, now, todayKey }) {
  const waiting = recapNudges(sessions, now);
  if (!waiting.length) return null;
  const [first, ...rest] = waiting;
  const name = nameOfSession(first, clients, groups);
  const whose = first.group_id ? `The recap for ${name || 'the group'}` : `${possessive(firstName(name) || 'A client')} recap`;
  const others = rest.length + (Number(older?.nudges) || 0);
  const more = others ? `, and ${countFigure(others)} more ${others === 1 ? 'is' : 'are'} waiting` : '';
  return { session: first, more: others, line: `${whose} from ${dayWords(toDayKey(new Date(first.starts_at)), todayKey)} hasn’t been sent yet${more}.` };
}

/**
 * Plan my day, as it stands while boxes are ticked: carried-over to-dos
 * left unticked go to tomorrow, upcoming ones ticked come to today, and a
 * to-do given a time between calls takes it.
 * @param {{ todos: object[], keep?: Record<string, boolean>, picked?: Record<string, boolean>, times?: Record<string, string|null>, todayKey: string }} a
 *   `keep`: carried-over ids, false to move one to tomorrow; `picked`: upcoming ids brought to today; `times`: id to "HH:MM"
 * @returns {{ todos: object[], changed: object[], work: object[] }} every to-do as it would be, the ones that differ, and today's working list in order
 */
export function planChanges({ todos = [], keep = {}, picked = {}, times = {}, todayKey }) {
  const tomorrow = addDays(todayKey, 1);
  const changed = [];
  const all = todos.map((t) => {
    if (t.done_at) return t;
    const section = todoSection(t, todayKey);
    let next = t;
    if (section === 'today' && keep[t.id] === false) next = moveToDay(t, tomorrow);
    else if (section === 'upcoming' && picked[t.id]) next = moveToDay(t, todayKey);
    if (todoSection(next, todayKey) === 'today' && Object.hasOwn(times, t.id) && (timeWords(times[t.id]) || null) !== (timeWords(next.planned_time) || null)) {
      next = { ...next, planned_time: timeWords(times[t.id]) || null };
    }
    if (next !== t) changed.push(next);
    return next;
  });
  return { todos: all, changed, work: todayTodos(all, todayKey).work };
}

const hhmm = (mins) => `${p2(Math.floor(mins / 60))}:${p2(mins % 60)}`;
const startMinutes = (at) => { const d = new Date(at); return d.getHours() * 60 + d.getMinutes(); };

/**
 * The quarter hours a to-do can start at between calls: inside the working
 * day, clear of every call and of the to-dos already given a time.
 * @param {{ sessions: object[], settings: object, dayKey: string, minutes?: number, placed?: { time: string, minutes?: number }[] }} a
 * @returns {string[]} "09:00", "09:15"…
 */
export function freeStarts({ sessions = [], settings = null, dayKey, minutes = 15, placed = [] }) {
  const day = workingDay(settings, dayKey);
  if (!day) return [];
  const length = Math.max(15, Number(minutes) || 15);
  const busy = [
    ...callsOn(sessions, dayKey).map((s) => [startMinutes(s.starts_at), startMinutes(s.starts_at) + (Number(s.minutes) || 0)]),
    ...placed.filter((p) => clockMinutes(p.time) != null).map((p) => [clockMinutes(p.time), clockMinutes(p.time) + Math.max(15, Number(p.minutes) || 15)]),
  ];
  const out = [];
  for (let t = clockMinutes(day.from); t + length <= clockMinutes(day.to); t += 15) {
    if (!busy.some(([a, b]) => t < b && t + length > a)) out.push(hhmm(t));
  }
  return out;
}

/**
 * A day at a glance: its calls and its to-dos that have a time, in time order.
 * @returns {{ kind: 'call'|'todo', id: string, time: string, minutes: number|null, session?: object, todo?: object }[]}
 */
export function dayLine({ sessions = [], todos = [], dayKey }) {
  return [
    ...callsOn(sessions, dayKey).map((s) => ({ kind: 'call', id: s.id, time: clockTime(s.starts_at), minutes: Number(s.minutes) || null, session: s })),
    ...(todos || []).filter((t) => !t.done_at && t.planned_on === dayKey && timeWords(t.planned_time)).map((t) => ({ kind: 'todo', id: t.id, time: timeWords(t.planned_time), minutes: Number(t.minutes) || null, todo: t })),
  ].sort((a, b) => a.time.localeCompare(b.time) || (a.kind === b.kind ? 0 : a.kind === 'call' ? -1 : 1));
}

export const PRESSURE_DAYS = 7;
/**
 * The pressure forecast: each client's shared work peak moments in the
 * next 7 days (tomorrow to a week today), soonest first. The coach is only
 * ever given shared work moments; anything else is left out here too.
 * @param {{ occurrences: { moment: object, on: string }[], clients: object[], todayKey: string }} a
 *   `occurrences` as src/lib/peakMoments gives them, each moment carrying its owner's `userId`
 * @returns {{ key: string, profileId: string, name: string, moment: string, short: string, day: string, when: string }[]}
 */
export function pressureRows({ occurrences = [], clients = [], todayKey }) {
  const to = addDays(todayKey, PRESSURE_DAYS);
  return occurrences
    .filter((o) => o?.moment && o.moment.area === 'work' && o.moment.shared === true && o.on > todayKey && o.on <= to)
    .map((o) => {
      const client = clients.find((c) => c.user_id && c.user_id === o.moment.userId && c.status !== 'past' && !c.merged_into);
      if (!client) return null;
      const name = clean(o.moment.name);
      const away = clean(o.moment.placeCity);
      return { key: `${o.moment.id}:${o.on}`, profileId: client.id, name: client.name, moment: away ? `${name}, ${away}` : name, short: name, day: o.on, when: dayWords(o.on, todayKey) };
    })
    .filter(Boolean)
    .sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
}

/** "6 moved to tomorrow", "1 moved to tomorrow". */
export const movedWords = (n) => `${countFigure(n)} moved to tomorrow`;

/** A call's length on Today: "60 minutes", or "Done" once it has been written up. */
export const callLength = (session) => (session.outcome === 'held' ? 'Done' : `${session.minutes} minutes`);

// ---------------------------------------------------------------- after a call: the recap, and what a sent one locks

/** The one line once a recap has gone: nothing the client was given changes afterwards. */
export const SENT_LINE = 'The recap has been sent, so this session stays as it is.';
export const ALREADY_SENT = 'This recap has already been sent.';
export const NEEDS_RECAP = 'Type the recap to carry on.';
export const NEEDS_NEW_TIME = 'Choose the new day and time to carry on.';
/** The most actions one recap carries. */
export const ACTIONS_MAX = 30;

/** Has this session's recap been sent? (Then it is locked: 050's guards, and sessionActions.js before 050.) */
export const sessionSent = (session) => Boolean(session?.recap_sent_at);

/** What a sent recap fixes on its session (050's coach_sessions_guard). */
export const LOCKED_FIELDS = ['recap', 'outcome', 'waived', 'moved_to', 'starts_at', 'profile_id', 'group_id', 'recap_sent_at', 'recap_sent_by'];
const same = (a, b) => (a ?? null) === (b ?? null) || ((a == null || a === false) && (b == null || b === false));

/**
 * A session's change, checked as the database checks it: once its recap is
 * sent, the recap, what happened, Waive it, when it was and who it was with
 * stay as they were. An unsent session can't be marked sent by a plain save.
 * @param {object|null} before the session as kept (null for a new one)
 * @param {object} next the session as it would be saved
 * @returns {{ ok: boolean, row: object, changed: string[] }} `changed`: the locked fields the save tried to change
 */
export function lockedSession(before, next) {
  if (!before || !sessionSent(before)) return { ok: true, row: next, changed: [] };
  const changed = LOCKED_FIELDS.filter((f) => !same(before[f], next[f]));
  const row = { ...next };
  for (const f of changed) { if (f in before) row[f] = before[f]; else delete row[f]; }
  return { ok: changed.length === 0, row, changed };
}

/**
 * An action's change, checked as the database checks it (050's
 * coach_session_actions_guard). Once the recap is sent: an action added
 * afterwards never goes to the client (send is false), none is reworded,
 * unticked, re-pointed or moved to another session, and one that went with
 * the recap can't be deleted. Done and "added to my to-dos" still change.
 * @param {object} session the action's session
 * @param {object|null} before the action as kept (null for a new one)
 * @param {object|null} next the action as it would be saved (null to delete it)
 * @returns {{ ok: boolean, row: object|null }} ok false: refused, nothing is saved
 */
export function lockedAction(session, before, next) {
  if (!sessionSent(session)) return { ok: true, row: next };
  if (!next) return { ok: !before?.send, row: null };
  if (!before) return { ok: true, row: { ...next, send: false } };
  const fixed = ['session_id', 'title', 'send', 'goes_to'];
  const ok = fixed.every((f) => same(before[f], next[f]));
  const row = { ...next };
  for (const f of fixed) row[f] = before[f];
  return { ok, row };
}

/** A session's actions, in the coach's order. */
export const actionsOf = (actions, sessionId) => (actions || []).filter((a) => a.session_id === sessionId)
  .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));

/** "Goes to this week" or "Goes to the Backlog": where a sent action lands for the client. */
export const goesWords = (action) => (action?.goes_to === 'backlog' ? 'Goes to the Backlog' : 'Goes to this week');

/** "Sent Mon 16 Nov, 16:05". Empty until the recap has gone. */
export function sentWords(session, todayKey) {
  if (!sessionSent(session)) return '';
  const d = new Date(session.recap_sent_at);
  return Number.isNaN(d.getTime()) ? 'Sent' : `Sent ${dayWords(toDayKey(d), todayKey)}, ${clockTime(d)}`;
}

/**
 * What the toast says once a recap is sent, exactly what happened.
 * `emailed`: the email went too (the live site, with 050); otherwise the
 * recap only shows in the portal.
 * @param {{ name?: string, people?: number, emailed?: boolean }} a `people`: how many are in the group (a group's session)
 */
export function recapSentWords({ name = '', people = 0, emailed = false } = {}) {
  if (people > 0) {
    const all = people === 1 ? 'The one member' : people === 2 ? 'Both' : `All ${people}`;
    return emailed ? `Sent. ${all} ${people === 1 ? 'gets' : 'get'} it by email and in the portal.` : `Sent. ${all} ${people === 1 ? 'sees' : 'see'} it in the portal.`;
  }
  const first = firstName(name) || 'Your client';
  return emailed ? `Sent. ${first} gets it by email and in the portal, with the actions you ticked.` : `Sent. ${first} sees it in the portal, with the actions you ticked.`;
}

/** "One recap to all 6", "One recap to both", "One recap to the group". */
export const oneRecapWords = (people) => (people > 2 ? `One recap to all ${people}` : people === 2 ? 'One recap to both' : 'One recap to the group');

/** The line under "What happened?" for a client's or a group's session. */
export function sessionOutcomeLine(session, { name = '', group = false } = {}) {
  if (!group) return outcomeLine(session.outcome, name, session.waived);
  if (session.outcome === 'late_cancel' && !session.waived) return 'It counts as one of the group’s sessions.';
  return outcomeLine(session.outcome, 'the group', session.waived);
}

/** Has a session's time come? (What happened can only be said once it has started.) */
export const sessionStarted = (session, now) => new Date(session.starts_at).getTime() <= new Date(now).getTime();

/**
 * What "What happened?" offers: everything once the session has started;
 * before it, only Moved, and a late cancellation in its last 24 hours.
 */
export function outcomeChoices(session, now) {
  if (sessionStarted(session, now)) return OUTCOMES;
  return OUTCOMES.filter((o) => o.value === 'moved' || (o.value === 'late_cancel' && isLateCancellation(session.starts_at, now)));
}

/** A day and a time on the device's own clock, as an instant; null when either is missing or isn't real. */
export function instantFrom(dayKey, time) {
  const d = fromDayKey(dayKey);
  const m = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!d || !m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2]), 0, 0);
  return toDayKey(out) === dayKey ? out.toISOString() : null;
}

/**
 * A new session, not yet written up.
 * @param {{ id: string, coachId: string, profileId?: string, groupId?: string, engagementId?: string, kind?: string, startsAt: string, minutes?: number, place?: string }} a
 */
export function newSession({ id, coachId, profileId = null, groupId = null, engagementId = null, kind = null, startsAt, minutes = 60, place = null }) {
  return {
    id, coach_id: coachId, profile_id: groupId ? null : profileId, group_id: groupId, engagement_id: engagementId, kind: kind || (groupId ? 'group' : 'coaching'),
    starts_at: startsAt, minutes: SESSION_LENGTHS.includes(Number(minutes)) ? Number(minutes) : 60, place: place || null,
    outcome: null, waived: false, moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null,
  };
}

/**
 * A group session's members whose session counts against their own
 * engagement (049's counts_against 'own'): one row each, naming their own
 * active engagement (the newest), or none when they have none running.
 */
export function sessionPeopleRows(sessionId, members = [], engagements = []) {
  return members.filter((m) => m.counts_against === 'own' && m.profile_id).map((m) => {
    const own = engagements.filter((e) => e.profile_id === m.profile_id && e.status !== 'ended')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
    return { session_id: sessionId, profile_id: m.profile_id, engagement_id: own ? own.id : null };
  });
}

/**
 * Moved: this session is marked moved to the new time, and a new one, not
 * yet written up, is made at that time with the same people.
 * @returns {{ moved: object, made: object, people: object[] }}
 */
export function moveSession(session, newStartsAt, newId, people = [], items = []) {
  const made = newSession({ id: newId, coachId: session.coach_id, profileId: session.profile_id, groupId: session.group_id, engagementId: session.engagement_id, kind: session.kind, startsAt: newStartsAt, minutes: session.minutes, place: session.place });
  return {
    moved: { ...session, outcome: 'moved', waived: false, moved_to: newStartsAt },
    made,
    people: people.filter((p) => p.session_id === session.id).map((p) => ({ session_id: newId, profile_id: p.profile_id, engagement_id: p.engagement_id || null })),
    items: callMovedWithSession(items, session, made),
  };
}

/**
 * The calendar's call for a session written up as Moved goes with it to the
 * new time and the new session, with its travel time either side (run 8's
 * functionality tester, 23 Nov): left where it was, the old time stayed busy
 * on the calendar, a client's reminders still went for the old time, and
 * nothing at all went for the new one (a group's included), where the
 * database's own move for a client (051's my_booking_move) does the same.
 * A call with no calendar item, or one of a repeat's own rows, moves nothing.
 * @returns {object[]} the coach_cal_items rows to save, the call first
 */
export function callMovedWithSession(items, session, made) {
  const call = (items || []).find((i) => i && i.session_id === session.id && !i.removed && !i.repeat_rule && !i.all_day);
  const to = new Date(made?.starts_at).getTime();
  const from = new Date(call?.starts_at).getTime();
  if (!call || Number.isNaN(to) || Number.isNaN(from)) return [];
  const shift = to - from;
  const at = (v) => new Date(new Date(v).getTime() + shift).toISOString();
  return [{ ...call, session_id: made.id, starts_at: at(call.starts_at), ends_at: at(call.ends_at) },
    ...(items || []).filter((t) => t && t.travel_for === call.id && !t.removed).map((t) => ({ ...t, starts_at: at(t.starts_at), ends_at: at(t.ends_at) }))];
}

/** "7 held", "1 held": the Sessions and recaps fold when it is closed. */
export const heldWords = (engagement) => (engagement ? `${Number(engagement.sessions_held) || 0} held` : '');

/** "60 minutes, Zoom": a session's length and where it is (a link reads as Zoom). */
export const lengthPlace = (session) => `${session.minutes} minutes, ${isLink(session.place) || !clean(session.place) ? 'Zoom' : clean(session.place)}`;
/** Is this an https link (the only kind Join on Zoom opens)? */
export const isLink = (value) => /^https:\/\/[^\s]+$/i.test(String(value || '').trim());

// ---------------------------------------------------------------- the brief's parts

/** From last time: the actions that went with the last session's recap, each Done or Not yet. */
export function fromLastTime(actions, last) {
  if (!last) return [];
  return actionsOf(actions, last.id).filter((a) => a.send).map((a) => ({ action: a, done: Boolean(a.done_at), state: a.done_at ? 'Done' : 'Not yet' }));
}

export const COMING_UP_DAYS = 14;
/**
 * Coming up: a client's shared work peak moments from today to 14 days on, soonest first.
 * @param {{ moment: object, on: string }[]} occurrences as src/lib/peakMoments gives them
 * @returns {{ key: string, words: string }[]} "Board meeting, Wed 18 Nov"
 */
export function comingUp(occurrences, todayKey) {
  const to = addDays(todayKey, COMING_UP_DAYS);
  return (occurrences || [])
    .filter((o) => o?.moment && o.moment.area === 'work' && o.moment.shared === true && o.on >= todayKey && o.on <= to)
    .sort((a, b) => a.on.localeCompare(b.on) || clean(a.moment.name).localeCompare(clean(b.moment.name)))
    .map((o) => { const away = clean(o.moment.placeCity); return { key: `${o.moment.id}:${o.on}`, words: `${clean(o.moment.name)}${away ? `, ${away}` : ''}, ${o.on === todayKey ? 'today' : dayWords(o.on, todayKey)}` }; });
}

/**
 * The debrief after a big moment: the newest review of a shared work
 * moment since the last session (the last 4 weeks for a first session).
 * @param {{ moment_id: string, occurs_on: string }[]} reviews what the client shares
 * @param {object[]} moments the client's shared work moments
 * @returns {{ review: object, moment: object, line: string }|null}
 */
export function sharedReview(reviews, moments, lastSessionAt, todayKey, name) {
  const since = lastSessionAt ? toDayKey(new Date(lastSessionAt)) : addDays(todayKey, -28);
  const found = (reviews || [])
    .map((r) => ({ review: r, moment: (moments || []).find((m) => m.id === r.moment_id && m.area === 'work' && m.shared === true) }))
    .filter((x) => x.moment && x.review.occurs_on >= since && x.review.occurs_on <= todayKey)
    .sort((a, b) => String(b.review.occurs_on).localeCompare(String(a.review.occurs_on)))[0];
  if (!found) return null;
  return { ...found, line: `After “${clean(found.moment.name)}” on ${dayWords(found.review.occurs_on, todayKey)}, ${firstName(name) || 'your client'} wrote this.` };
}

// ---------------------------------------------------------------- the guided close

export const KEEPS = [{ value: 'individual', label: 'Individual' }, { value: 'free', label: 'Free' }];

/** "6-month coaching, Mon 4 May to Fri 4 Dec": the engagement being closed. */
export function closeLine(engagement, todayKey) {
  if (!engagement) return '';
  const dates = engagement.starts_on && engagement.ends_on ? `${dayWords(engagement.starts_on, todayKey)} to ${dayWords(engagement.ends_on, todayKey)}`
    : engagement.starts_on ? `from ${dayWords(engagement.starts_on, todayKey)}` : '';
  return [clean(engagement.name) || 'Coaching', dates].filter(Boolean).join(', ');
}

/**
 * Outcomes: the Hardware and Software scores at the start (the first
 * finished review) and now (the newest), from the reviews the client shares.
 * @param {{ month: string, status: string, hardware_score: number|null, software_score: number|null }[]} checkins
 * @returns {{ key: string, label: string, start: number, now: number, startWords: string }[]} empty when nothing is shared
 */
export function closeScores(checkins) {
  const done = (checkins || []).filter((c) => c.status === 'finished').sort((a, b) => String(a.month).localeCompare(String(b.month)));
  if (!done.length) return [];
  const first = done[0];
  const last = done.at(-1);
  return [['hardware', 'Hardware score', 'hardware_score'], ['software', 'Software score', 'software_score']]
    .filter(([, , col]) => last[col] != null)
    .map(([key, label, col]) => {
      const now = Math.round(Number(last[col]));
      const start = first[col] == null ? null : Math.round(Number(first[col]));
      return { key, label, now, start: done.length > 1 ? start : null, startWords: done.length > 1 && start != null ? `${start} at the start` : 'One review so far' };
    });
}

/** The First review's goals a client wrote, as rows: what they most want (up to 3), in their own words. */
export function closeGoals(checkins) {
  const first = (checkins || []).find((c) => c.kind === 'first' && c.goals && typeof c.goals === 'object');
  const three = Array.isArray(first?.goals?.G3) ? first.goals.G3 : [];
  return three.map((g) => clean(g)).filter(Boolean).slice(0, 3);
}

/** "Asked Mon 16 Nov": a request the coach has ticked as made. Empty when it hasn't been. */
export const askedWords = (day, todayKey) => (day && fromDayKey(day) ? `Asked ${dayWords(day, todayKey)}` : '');

/** The toast once a client is in Past clients. */
export const pastWords = (name) => { const first = firstName(name) || 'Your client'; return `${first} is in Past clients, still searchable, and you can start a new engagement from ${possessive(first)} page.`; };

/** The rows a close saves: the profile in Past clients from today, and its engagement ended. */
export function closeRows(profile, engagement, todayKey) {
  return {
    profile: { ...profile, status: 'past', ended_on: todayKey },
    engagement: engagement ? { ...engagement, status: 'ended' } : null,
  };
}
