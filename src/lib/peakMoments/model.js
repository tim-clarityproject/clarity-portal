// Peak moments (mock-up M18, version 28, approved 11 Nov; Phase 8b part A):
// the rules, with no screen. Pure code: no database, no React, no device
// clock (today is passed in), tested in tests/performance/peak-moments.test.mjs.
//
// A peak moment is a moment that needs more of your energy, attention and
// focus, because of its cognitive, physical or social demands. One is kept as
//   { id, name, area: 'work' | 'personal', kind: 'perform' | 'present' | 'rested',
//     startsOn, endsOn ('YYYY-MM-DD', the same for one day),
//     placeCity, placeZone (both null: at home; else a city and its IANA zone),
//     repeat: null | { every: 'week' | 'month_date' | 'month_weekday' | 'year', until?: 'YYYY-MM-DD' },
//     lesson, shared, createdAt, updatedAt }
// as migration 048 keeps it (public.peak_moments). A repeat is a rule, never
// a list of dates (time zone rule 3): each time it comes round (an
// "occurrence") gets its own lead-up and its own review after.
//
// Words follow the writing rules: countdowns read "3 days to go", never
// "left" (5e 29an); every answer people tap is a full sentence in their own
// voice (29aa), with no second line repeating it (29ap).

import { addDays, daysBetween, weekday } from '../scores/dates.js';
import { cleanName } from '../signIn/words.js';

export const TOOL_NAME = 'Peak moments';
export const ADD_NAME = 'Add peak moment';
export const PATH = '/peak-moments';
export const NAME_MAX = 80;
export const LEAD_UP_MAX = 300;
export const LESSON_MAX = 600;
export const ADD_TIME = '~1 minute';
export const REVIEW_TIME = '~2 minutes';
/** The lead-up: the 3 days before (Home's card and the Daily plan's question). */
export const LEAD_UP_DAYS = 3;
/** The review after stays offered on Home for this many days from the day after. */
export const REVIEW_OFFER_DAYS = 3;

export const DEFINITION = 'A moment that needs more of your energy, attention and focus, because of its cognitive, physical or social demands.';
/** "What’s a peak moment?" opens the shared side panel (Explain.jsx), never an ⓘ on the title. */
export const EXPLAIN = {
  title: 'What’s a peak moment?',
  terms: [{ term: 'Peak moment', meaning: DEFINITION }],
};

export const AREAS = [
  { value: 'work', label: 'It’s for work', short: 'Work' },
  { value: 'personal', label: 'It’s for my personal life', short: 'Personal' },
];
export const PERSONAL_NOTE = 'Only you ever see personal moments.';

// The answer is a full sentence in the person's voice; the short name is
// the list's meta line (M18: kind short name).
export const KINDS = [
  { value: 'perform', label: 'I need to perform at my best', short: 'Perform at my best' },
  { value: 'present', label: 'I want to be fully present', short: 'Be fully present' },
  { value: 'rested', label: 'I want to arrive at a break rested', short: 'Taper before a break' },
];

export const SPAN = { day: 'day', days: 'days' };
export const SPANS = [
  { value: SPAN.day, label: 'It’s one day' },
  { value: SPAN.days, label: 'It runs over several days' },
];

export const HOME = 'home';
export const AT_HOME = 'It’s at home';

export const REPEATS = [
  { value: 'none', label: 'It doesn’t repeat' },
  { value: 'week', label: 'Every week' },
  { value: 'month_date', label: 'Every month on this date' },
  { value: 'month_weekday', label: 'A set day each month' },
  { value: 'year', label: 'Every year' },
];

export const NEEDS = {
  name: 'Type its name to carry on.',
  area: 'Choose one to carry on.',
  kind: 'Choose one to carry on.',
  day: 'Choose its day to carry on.',
  ends: 'Choose the day it ends to carry on.',
  endsBefore: 'It can’t end before it starts. Choose another end day.',
  until: 'It can’t stop before it starts. Choose a later day, or none.',
};

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORDINAL = ['first', 'second', 'third', 'fourth', 'last'];

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const words = (v) => (typeof v === 'string' ? v : '');
const parts = (key) => key.split('-').map(Number);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const keyOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * A name as it is kept: characters nobody can see (zero-width spaces,
 * direction marks such as U+202E, control characters) taken out and the
 * spaces trimmed, as sign-in rule 38's cleanName does, so a name of only
 * unseen characters is no name (the break-it tester, 18 Nov).
 */
export const cleanMomentName = (value) => cleanName(value).slice(0, NAME_MAX);

/** An entry a list holds itself, never one every object carries ("constructor", "__proto__"). */
export const ownEntry = (list, key) => (list && typeof key === 'string' && Object.hasOwn(list, key) ? list[key] : undefined);

// ---------------------------------------------------------------- one moment

/** A new moment, before anything is answered (M18: Work, Perform at my best, at home, no repeat). */
export function emptyMoment(id, today) {
  return {
    id,
    name: '',
    area: null,
    kind: null,
    span: SPAN.day,
    startsOn: null,
    endsOn: null,
    placeCity: null,
    placeZone: null,
    repeat: null,
    lesson: '',
    shared: false,
    createdAt: null,
    updatedAt: null,
    today: today || null,
  };
}

/**
 * A moment as a page may read it, whatever was kept (an older copy, a damaged
 * one, the table's row): never a blank screen (the break-it tester, 14 Nov).
 * Returns null when it can't be read as a moment at all.
 */
export function tidyMoment(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.id !== 'string' || !m.id) return null;
  const startsOn = isDay(m.startsOn) ? m.startsOn : null;
  const endsOn = isDay(m.endsOn) && startsOn && m.endsOn >= startsOn ? m.endsOn : startsOn;
  // A stop day before the start would leave nothing to show: it is let go (the break-it tester, 18 Nov).
  const kept = tidyRepeat(m.repeat);
  const repeat = kept?.until && startsOn && kept.until < startsOn ? { every: kept.every } : kept;
  const place = typeof m.placeCity === 'string' && m.placeCity.trim() && typeof m.placeZone === 'string' && m.placeZone
    ? { placeCity: m.placeCity.trim().slice(0, 120), placeZone: m.placeZone }
    : { placeCity: null, placeZone: null };
  const area = m.area === 'personal' ? 'personal' : m.area === 'work' ? 'work' : null;
  return {
    ...m,
    name: cleanMomentName(words(m.name)),
    area,
    kind: KINDS.some((k) => k.value === m.kind) ? m.kind : null,
    span: startsOn && endsOn && endsOn > startsOn ? SPAN.days : (m.span === SPAN.days ? SPAN.days : SPAN.day),
    startsOn,
    endsOn,
    ...place,
    repeat,
    lesson: words(m.lesson).slice(0, LESSON_MAX),
    // A personal moment is never shared (Tim, 11 Nov: "Personal peak moments are only ever yours.").
    shared: area === 'work' && m.shared === true,
  };
}

export function tidyRepeat(r) {
  if (!r || typeof r !== 'object' || !['week', 'month_date', 'month_weekday', 'year'].includes(r.every)) return null;
  return isDay(r.until) ? { every: r.every, until: r.until } : { every: r.every };
}

/** Whether a moment has everything it needs to be saved. */
export function isComplete(m) {
  return Boolean(m && cleanMomentName(m.name) && m.area && m.kind && m.startsOn && m.endsOn && m.endsOn >= m.startsOn && !repeatProblem(m));
}

/** The first question still to answer, by its step key, or 'sum'. */
export function firstUnanswered(m) {
  if (!cleanMomentName(m.name)) return 'name';
  if (!m.area) return 'area';
  if (!m.kind) return 'kind';
  if (!m.startsOn || !m.endsOn) return 'when';
  if (repeatProblem(m)) return 'repeat';
  return 'sum';
}

/** The calm line a step shows when Next is pressed too early (never a greyed-out button). */
export function whenProblem(m) {
  if (!m.startsOn) return NEEDS.day;
  if (m.span === SPAN.days && !m.endsOn) return NEEDS.ends;
  if (m.span === SPAN.days && m.endsOn <= m.startsOn) return NEEDS.endsBefore;
  return null;
}

export function repeatProblem(m) {
  if (m.repeat?.until && m.startsOn && m.repeat.until < m.startsOn) return NEEDS.until;
  return null;
}

/**
 * The day picked for "When is it?", with the end kept in step (one day: the
 * same day). A repeat's stop day that would now fall before the start is
 * let go, so the summary shows it keeps going and nothing is saved that
 * never comes round (the break-it tester, 18 Nov).
 */
export function withStart(m, startsOn) {
  const endsOn = m.span === SPAN.days && m.endsOn && m.endsOn > startsOn ? m.endsOn : (m.span === SPAN.days ? null : startsOn);
  const repeat = m.repeat?.until && startsOn && m.repeat.until < startsOn ? { every: m.repeat.every } : m.repeat;
  return { ...m, startsOn, endsOn, repeat };
}

export function withSpan(m, span) {
  if (span === SPAN.day) return { ...m, span, endsOn: m.startsOn };
  return { ...m, span, endsOn: m.endsOn && m.startsOn && m.endsOn > m.startsOn ? m.endsOn : null };
}

/** A personal moment is never shared; a work one follows the page's choice. */
export function withArea(m, area, shareWork = false) {
  return { ...m, area, shared: area === 'work' && Boolean(shareWork) };
}

export function withRepeat(m, every) {
  if (!every || every === 'none') return { ...m, repeat: null };
  return { ...m, repeat: { every, ...(m.repeat?.until ? { until: m.repeat.until } : {}) } };
}

export function withUntil(m, until) {
  if (!m.repeat) return m;
  return { ...m, repeat: until ? { every: m.repeat.every, until } : { every: m.repeat.every } };
}

// ---------------------------------------------------------------- words

/** "Sat 31 Oct", with the year only when it isn't this year ("Sun 25 Apr 2027"). */
export function dayWords(key, today) {
  const [y, m, d] = parts(key);
  const base = `${DAY_SHORT[weekday(key)]} ${d} ${MONTHS[m - 1]}`;
  return today && key.slice(0, 4) !== today.slice(0, 4) ? `${base} ${y}` : base;
}

/** "Sat 31 Oct", "Thu 12 to Fri 13 Nov", "Sat 19 to Sat 26 Dec", "Mon 30 Nov to Wed 2 Dec" (M18). */
export function whenWords(startsOn, endsOn, today) {
  if (!startsOn) return '';
  if (!endsOn || endsOn === startsOn) return dayWords(startsOn, today);
  const [y1, m1, d1] = parts(startsOn);
  const [y2] = parts(endsOn);
  const end = dayWords(endsOn, today);
  if (y1 === y2 && m1 === parts(endsOn)[1]) return `${DAY_SHORT[weekday(startsOn)]} ${d1} to ${end}`;
  if (y1 === y2) return `${DAY_SHORT[weekday(startsOn)]} ${d1} ${MONTHS[m1 - 1]} to ${end}`;
  return `${dayWords(startsOn, '0000')} to ${dayWords(endsOn, '0000')}`;
}

function ordinalDay(d) {
  const tens = d % 100;
  if (tens >= 11 && tens <= 13) return `${d}th`;
  return `${d}${({ 1: 'st', 2: 'nd', 3: 'rd' })[d % 10] || 'th'}`;
}

/** Which weekday of the month a day is: 1 to 4, or 5 for the last one. */
export function weekOfMonth(key) {
  return Math.ceil(parts(key)[2] / 7);
}

/**
 * What a repeat says in words, for the list's meta line and the summary:
 * "Every Thursday", "The 12th of every month", "First Tuesday of every month",
 * "Every year on 12 Nov", with ", until Sat 30 Jan" when it stops.
 */
export function repeatWords(m, today) {
  if (!m?.repeat || !m.startsOn) return '';
  const day = m.startsOn;
  const [, mo, d] = parts(day);
  let text;
  if (m.repeat.every === 'week') text = `Every ${DAY_FULL[weekday(day)]}`;
  else if (m.repeat.every === 'month_date') text = `The ${ordinalDay(d)} of every month`;
  else if (m.repeat.every === 'month_weekday') {
    const n = weekOfMonth(day);
    const which = ORDINAL[n - 1];
    text = `${which[0].toUpperCase()}${which.slice(1)} ${DAY_FULL[weekday(day)]} of every month`;
  } else text = `Every year on ${d} ${MONTHS[mo - 1]}`;
  return m.repeat.until ? `${text}, until ${dayWords(m.repeat.until, today)}` : text;
}

/** The repeat choices with what each means for this start day (an example, never a repeat of the answer: 29ap). */
export function repeatOptions(startsOn) {
  if (!startsOn) return REPEATS.map((r) => ({ value: r.value, label: r.label }));
  const [, mo, d] = parts(startsOn);
  const wd = DAY_FULL[weekday(startsOn)];
  const hints = {
    week: `On ${wd}s`,
    month_date: `On the ${ordinalDay(d)}`,
    month_weekday: `On the ${ORDINAL[weekOfMonth(startsOn) - 1]} ${wd}`,
    year: `On ${d} ${MONTHS[mo - 1]}`,
  };
  return REPEATS.map((r) => ({ value: r.value, label: r.label, ...(hints[r.value] ? { hint: hints[r.value] } : {}) }));
}

export const kindOf = (value) => KINDS.find((k) => k.value === value) || null;
export const areaOf = (value) => AREAS.find((a) => a.value === value) || null;

/** The list's meta line, as separate items: "Perform at my best", "Work", "First Tuesday of every month". */
export function metaItems(m, today) {
  return [kindOf(m.kind)?.short, areaOf(m.area)?.short, repeatWords(m, today), m.placeCity || null].filter(Boolean);
}

/** "Cup final" in curly quotes, for questions (M18). */
export const quoted = (name) => `“${String(name || '').trim()}”`;

/**
 * The countdown, in the writing rules' words (5e 29an): "3 days to go",
 * "1 day to go", "today". Null when it has passed.
 */
export function countdownWords(on, today) {
  const n = daysBetween(today, on);
  if (n < 0) return null;
  if (n === 0) return 'today';
  return `${n} ${n === 1 ? 'day' : 'days'} to go`;
}

/** "Cup final, 3 days to go", "Cup final is today", "Cup final was yesterday". */
export function countdownLine(name, on, today) {
  const n = daysBetween(today, on);
  const nm = String(name || '').trim();
  if (n === 0) return `${nm} is today`;
  if (n === -1) return `${nm} was yesterday`;
  if (n < 0) return `${nm} was on ${dayWords(on, today)}`;
  return `${nm}, ${countdownWords(on, today)}`;
}

// ---------------------------------------------------------------- repeats

/** The nth weekday (1 to 4, or 5 for the last) of a month, or null. */
function nthWeekday(y, m, wd, n) {
  const first = keyOf(y, m, 1);
  const offset = (wd - weekday(first) + 7) % 7;
  if (n === 5) {
    const last = keyOf(y, m, daysInMonth(y, m));
    return addDays(last, -((weekday(last) - wd + 7) % 7));
  }
  const day = 1 + offset + 7 * (n - 1);
  return day <= daysInMonth(y, m) ? keyOf(y, m, day) : null;
}

/** The start day of the kth time a repeat comes round (k = 0 is the first), or null when that month or year has no such day. */
function startOf(m, k) {
  const start = m.startsOn;
  const [y, mo, d] = parts(start);
  const every = m.repeat?.every;
  if (!every) return k === 0 ? start : null;
  if (every === 'week') return addDays(start, 7 * k);
  if (every === 'year') {
    const yy = y + k;
    // 29 Feb comes round only in a leap year: a day that doesn't exist is never rolled on (time zone rule 2).
    return d <= daysInMonth(yy, mo) ? keyOf(yy, mo, d) : null;
  }
  const total = (mo - 1) + k;
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  if (every === 'month_date') return d <= daysInMonth(yy, mm) ? keyOf(yy, mm, d) : null;
  return nthWeekday(yy, mm, weekday(start), weekOfMonth(start));
}

/**
 * Each time a moment comes round that touches the days `from` to `to`
 * (both included), in date order: [{ moment, on, endsOn, key }]. `key` is
 * the moment's id and the day it starts ("id:2026-11-12"), the occurrence's
 * own name for its lead-up and its review.
 */
export function occurrences(m, from, to, limit = 400) {
  if (!m?.startsOn) return [];
  const length = daysBetween(m.startsOn, m.endsOn || m.startsOn);
  const out = [];
  const until = m.repeat?.until || null;
  if (!m.repeat) {
    if (addDays(m.startsOn, length) >= from && m.startsOn <= to) out.push(occ(m, m.startsOn, length));
    return out;
  }
  // Start near `from`, never before the first.
  let k = 0;
  if (m.repeat.every === 'week') k = Math.max(0, Math.floor((daysBetween(m.startsOn, from) - length) / 7));
  else if (m.repeat.every === 'year') k = Math.max(0, Number(from.slice(0, 4)) - Number(m.startsOn.slice(0, 4)) - 1);
  else k = Math.max(0, (Number(from.slice(0, 4)) - Number(m.startsOn.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(m.startsOn.slice(5, 7)) - 1);
  // Far enough for a day that comes round rarely: 29 Feb (8 years from a
  // year after a leap year, past 2100), the 31st (every other month).
  for (let guard = 0; guard < limit * 3 + SKIPS && out.length < limit; guard += 1, k += 1) {
    const on = startOf(m, k);
    if (on == null) continue;
    if (on > to || (until && on > until)) break;
    if (addDays(on, length) >= from) out.push(occ(m, on, length));
  }
  return out;
}

/** The most times in a row a repeat can come round on no day at all (29 Feb: 7 years over 2100). */
const SKIPS = 12;

/** Whether a moment comes round on this day (a review's address must be one of its days). */
export function comesRoundOn(m, day) {
  return Boolean(m?.startsOn && occurrences(m, day, day).some((o) => o.on === day));
}

const occ = (m, on, length) => ({ moment: m, on, endsOn: addDays(on, length), key: `${m.id}:${on}` });

/** Every occurrence of every moment between two days, in date order (then by name). */
export function allOccurrences(moments, from, to) {
  return moments.flatMap((m) => occurrences(m, from, to)).sort(byDate);
}

const KIND_ORDER = { perform: 0, present: 1, rested: 2 };
function byDate(a, b) {
  if (a.on !== b.on) return a.on < b.on ? -1 : 1;
  if (a.endsOn !== b.endsOn) return a.endsOn < b.endsOn ? -1 : 1;
  return a.moment.name.localeCompare(b.moment.name);
}

/** The next time a moment comes round that hasn't ended before today, or null. Nine years ahead: 29 Feb skips 2100. */
export function nextOccurrence(m, today) {
  return occurrences(m, today, addDays(today, 9 * 366), 1)[0] || null;
}

/** The last time it came round that has ended before today, or null. */
export function lastOccurrence(m, today) {
  const past = occurrences(m, addDays(today, -3 * 366), addDays(today, -1)).filter((o) => o.endsOn < today);
  return past.at(-1) || null;
}

// ---------------------------------------------------------------- the list page

/**
 * The page's two lists (M18): Coming up, each moment's next time in date
 * order; Past, newest first: a moment that won't come round again, and each
 * time a repeating one came round that has a review, with its lesson.
 */
export function listView(moments, reviews, today) {
  const comingUp = [];
  const past = [];
  for (const m of moments) {
    const next = nextOccurrence(m, today);
    if (next) comingUp.push(next);
    if (!m.repeat) {
      if (!next) past.push({ ...occurrences(m, m.startsOn, m.endsOn)[0], lesson: reviewOf(reviews, m.id, m.startsOn)?.lesson || m.lesson || '' });
    } else {
      let shown = Boolean(next);
      for (const r of Object.values(reviews || {})) {
        if (r.momentId !== m.id || r.occursOn >= today) continue;
        const o = occurrences(m, r.occursOn, r.occursOn)[0];
        if (o && o.on === r.occursOn && o.endsOn < today) {
          past.push({ ...o, lesson: r.lesson || '' });
          shown = true;
        }
      }
      // A repeat that has stopped, with no review, still shows once: its last time.
      if (!shown) {
        const last = lastOccurrence(m, today);
        if (last) {
          past.push({ ...last, lesson: reviewOf(reviews, m.id, last.on)?.lesson || m.lesson || '' });
          shown = true;
        }
      }
      // One kept with no time it comes round at all (an older copy) still shows,
      // and can be opened, so it can be put right or deleted.
      if (!shown) past.push({ ...occ(m, m.startsOn, daysBetween(m.startsOn, m.endsOn || m.startsOn)), lesson: m.lesson || '', stray: true });
    }
  }
  comingUp.sort(byDate);
  past.sort((a, b) => -byDate(a, b));
  return { comingUp, past, empty: moments.length === 0 };
}

/** A review by its moment and day. */
export function reviewOf(reviews, momentId, on) {
  return ownEntry(reviews, `${momentId}:${on}`) || null;
}

// ---------------------------------------------------------------- the lead-up

/**
 * The time a moment comes round that today's lead-up is about: the nearest
 * one starting 1 to 3 days from today. Two on the same day: perform first,
 * then the one named first. At most one a day, so overlapping moments ask
 * about the nearer one (brief, step 3).
 */
export function leadUpFor(moments, today, { from = 1, to = LEAD_UP_DAYS } = {}) {
  const found = allOccurrences(moments, addDays(today, from), addDays(today, to)).filter((o) => {
    const n = daysBetween(today, o.on);
    return n >= from && n <= to;
  });
  found.sort((a, b) => (a.on !== b.on ? (a.on < b.on ? -1 : 1) : (KIND_ORDER[a.moment.kind] - KIND_ORDER[b.moment.kind]) || a.moment.name.localeCompare(b.moment.name)));
  return found[0] || null;
}

/** A break (an "arrive rested" moment) running today, after its first day: no work prompts then (brief, step 3). */
export function onBreak(moments, today) {
  return allOccurrences(moments.filter((m) => m.kind === 'rested'), addDays(today, -366), today)
    .find((o) => o.on < today && o.endsOn >= today) || null;
}

/** The Daily plan's lead-up question, in the kind's own words (M18; no line under it). */
export function leadUpQuestion(kind, name) {
  const q = quoted(name);
  if (kind === 'present') return `What will you do today so you can be fully present at ${q}?`;
  if (kind === 'rested') return `What will you do today so you arrive at ${q} rested?`;
  return `What will you do today to protect your energy for ${q}?`;
}

/** Full-sentence suggestions for the lead-up (M18 gives the perform set; the other two are Claude's, for Tim to confirm). */
export const LEAD_UP_SUGGESTIONS = {
  perform: ['I’ll be in bed by 22:30', 'I’ll take a lighter training day', 'I’ll have no meetings after 16:00', 'I’ll take a proper break at lunch'],
  present: ['I’ll leave work on time', 'I’ll put my phone away this evening', 'I’ll clear my diary the morning after', 'I’ll tell my team I’ll be offline'],
  rested: ['I’ll hand over what’s left', 'I’ll finish work by 17:00', 'I’ll set my out-of-office', 'I’ll be in bed by 22:30'],
};

/** Home's countdown card's question (M18: "How are you protecting your energy for “Cup final”?"). */
export function homeQuestion(kind, name) {
  const q = quoted(name);
  if (kind === 'present') return `How are you making room to be fully present at ${q}?`;
  if (kind === 'rested') return `How are you winding down before ${q}?`;
  return `How are you protecting your energy for ${q}?`;
}

/** Where "Plan for it" goes: the Pressure plan (the older page until it is rebuilt). */
export const PLAN_FOR_IT = '/pressure-plan';

/**
 * Home's peak moment card, or null (M18 "Home card"), in the order it takes
 * its turn on Home's one card (Tim, 5 Nov: anything timed queues for the
 * one card):
 *   - the review after, offered from the day after (REVIEW_OFFER_DAYS days);
 *   - in the 3 days before, the countdown: "Cup final, 3 days to go" with
 *     one button, Plan for it;
 *   - on the day: the same card, "Cup final is today". HOOK: once the
 *     Pressure plan is rebuilt (it is still the older page), a moment's
 *     built Pressure plan takes this card's place on the day (`onTheDay`).
 * `dismissed`: keys tapped Not now today ("We’ll ask again tomorrow.").
 */
export function homeCard(moments, reviews, today, dismissed = []) {
  const gone = new Set(dismissed);
  // The review after first: it is the one that goes stale.
  const due = reviewDue(moments, reviews, today).find((o) => !gone.has(`review:${o.key}`));
  if (due) {
    return {
      key: `review:${due.key}`,
      kind: 'review',
      occurrence: due,
      label: reviewLine(due, today),
      question: reviewQuestion(due.moment.kind, due.moment.name),
      lines: [],
      time: REVIEW_TIME,
      action: { label: 'Review it', to: reviewPath(due) },
      notNow: `review:${due.key}`,
    };
  }
  const soon = leadUpFor(moments, today, { from: 0, to: LEAD_UP_DAYS });
  if (soon && !gone.has(`lead:${soon.key}`)) {
    const onTheDay = soon.on === today;
    return {
      key: `lead:${soon.key}`,
      kind: onTheDay ? 'day' : 'lead',
      occurrence: soon,
      label: countdownLine(soon.moment.name, soon.on, today),
      question: homeQuestion(soon.moment.kind, soon.moment.name),
      lines: [],
      action: { label: 'Plan for it', to: PLAN_FOR_IT },
      notNow: `lead:${soon.key}`,
      // The hook for a built Pressure plan (see above).
      onTheDay,
    };
  }
  return null;
}

// ---------------------------------------------------------------- the review after

/** The day the review after is offered: the day after it ends, or after a break the day after it starts. */
export function reviewDay(o) {
  return o.moment.kind === 'rested' ? addDays(o.on, 1) : addDays(o.endsOn, 1);
}

/** The times moments came round whose review after is offered today (not yet reviewed), nearest first. */
export function reviewDue(moments, reviews, today) {
  return allOccurrences(moments, addDays(today, -400), today)
    .filter((o) => {
      const day = reviewDay(o);
      return day <= today && daysBetween(day, today) < REVIEW_OFFER_DAYS && !reviewOf(reviews, o.moment.id, o.on);
    })
    .sort((a, b) => -byDate(a, b));
}

/** The small line above the review's questions: "Cup final was yesterday", "Ski holiday started yesterday". */
export function reviewLine(o, today) {
  const name = String(o.moment.name || '').trim();
  if (o.moment.kind === 'rested') {
    return daysBetween(o.on, today) === 1 ? `${name} started yesterday` : `${name} started on ${dayWords(o.on, today)}`;
  }
  return daysBetween(o.endsOn, today) === 1 ? `${name} was yesterday` : `${name} was on ${dayWords(o.endsOn, today)}`;
}

export function reviewPath(o) {
  return `${PATH}/review/${o.moment.id}/${o.on}`;
}

/** Step 1's question, by kind (brief, step 3). */
export function reviewQuestion(kind, name) {
  if (kind === 'present') return 'Were you as present as you wanted to be?';
  if (kind === 'rested') return 'Did you arrive rested?';
  return `How did ${quoted(name)} go?`;
}

/** Step 1's answers, one tap, full sentences in the person's voice; values as 048 keeps them. */
export function reviewAnswers(kind) {
  if (kind === 'present') {
    return [
      { value: 'yes', label: 'I was as present as I wanted to be' },
      { value: 'partly', label: 'I was present some of the time' },
      { value: 'no', label: 'My mind was somewhere else' },
    ];
  }
  if (kind === 'rested') {
    return [
      { value: 'yes', label: 'I arrived rested' },
      { value: 'partly', label: 'I arrived a little tired' },
      { value: 'no', label: 'I arrived worn out' },
    ];
  }
  return [
    { value: 'very_well', label: 'It went better than I hoped' },
    { value: 'well', label: 'It went about as I hoped' },
    { value: 'not_well', label: 'It didn’t go as I hoped' },
  ];
}

export const REVIEW_HELPED = 'What helped your energy and focus most?';
export const REVIEW_NEXT = 'What will you keep, and what will you change?';
export const REVIEW_SAVED = 'Saved for your next peak moment';

/** The review's summary rows (M18 "Your review"), the lead-up last and with no Edit: it's a record. */
export function reviewRows(kind, review, leadUps) {
  const answer = reviewAnswers(kind).find((a) => a.value === review.answer)?.label || '';
  const rows = [
    { key: 'answer', label: 'How it went', step: 'answer', lines: [{ text: answer || 'Skipped' }] },
    { key: 'kept', label: 'What helped', step: 'kept', lines: [{ text: review.kept?.trim() || 'Skipped' }] },
    { key: 'lesson', label: 'Next time', step: 'lesson', lines: [{ text: review.lesson?.trim() || 'Skipped' }] },
  ];
  return { rows, leadUp: leadUpLines(leadUps) };
}

/**
 * What was done in the lead-up, shown only at the end of the review (M18:
 * "In bed by 22:30, 3 of 3 nights"): each answer once, with how often it
 * was done. `leadUps` are the occurrence's days: [{ day, text, did }].
 */
export function leadUpLines(leadUps = []) {
  const byText = new Map();
  for (const l of leadUps) {
    const text = String(l?.text || '').trim();
    if (!text) continue;
    const had = byText.get(text) || { text, days: 0, done: 0 };
    had.days += 1;
    if (l.did === true) had.done += 1;
    byText.set(text, had);
  }
  return [...byText.values()].map((x) => ({
    text: x.text,
    sub: x.days === 1 ? (x.done ? 'Done' : 'Not ticked') : `Done on ${x.done} of ${x.days} days`,
    good: x.done > 0 && x.done === x.days,
  }));
}

// ---------------------------------------------------------------- the sprint

/**
 * The 8 week bars' rings (M18 "In the sprint"): one ring for each week that
 * holds a peak moment; two or more show as one slightly larger ring with the
 * number in it. `weeks`: [{ number, start, end }]. A moment sits in the week
 * it starts in. Returns [{ week, occurrences: [...] }] in week order.
 */
export function weekRings(moments, weeks) {
  if (!weeks?.length) return [];
  const from = weeks[0].start;
  const to = weeks[weeks.length - 1].end;
  const list = allOccurrences(moments, from, to).filter((o) => o.on >= from && o.on <= to);
  const out = [];
  for (const w of weeks) {
    const inWeek = list.filter((o) => o.on >= w.start && o.on <= w.end);
    if (inWeek.length) out.push({ week: w.number, occurrences: inWeek });
  }
  return out;
}

/**
 * Which ring a tap or click means: the one whose centre is nearest, among
 * those whose tap area (radius `reach`) holds the point; null when none
 * does. M18 let the later ring in the drawing win where two tap areas
 * overlapped (a tap on week 5's own ring opened week 6); the nearer ring
 * wins here (brief, step 2).
 */
export function nearestRing(rings, point, reach) {
  let best = null;
  let bestD = Infinity;
  for (const r of rings) {
    const d = Math.hypot(r.x - point.x, r.y - point.y);
    if (d <= reach && d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** The ring's words for a screen reader (M18): "Peak moment, Investor call, Thu 15 Oct" or "2 peak moments in week 5". */
export function ringLabel(ring, today) {
  if (ring.occurrences.length === 1) {
    const o = ring.occurrences[0];
    return `Peak moment, ${o.moment.name}, ${whenWords(o.on, o.endsOn, today)}`;
  }
  return `${ring.occurrences.length} peak moments in week ${ring.week}`;
}

/** The line under a moment opened from a ring: its countdown, its lesson, or nothing. */
export function ringNote(o, reviews, today) {
  const left = countdownWords(o.on, today);
  if (left === 'today') return 'It’s today.';
  if (left) return `${left[0].toUpperCase()}${left.slice(1)}.`;
  const r = reviewOf(reviews, o.moment.id, o.on);
  return r?.lesson?.trim() || r?.kept?.trim() || o.moment.lesson?.trim() || '';
}

// ---------------------------------------------------------------- View your year

/**
 * View your year's plain list by month (M18): from this month to the month
 * of the last moment still to come (at least 3 months, at most 12), each
 * with the sprint it falls in and its moments; a moment beyond the current
 * sprint is "waiting" (brief, step 2). `sprints`: [{ number, start, end,
 * running }] in date order.
 */
export function yearMonths(moments, sprints, today, { min = 3, max = 12 } = {}) {
  const [ty, tm] = parts(today);
  const first = keyOf(ty, tm, 1);
  const ones = moments.filter((m) => !m.repeat).map((m) => m.startsOn).filter((d) => d && d >= first).sort();
  const lastOne = ones.at(-1);
  let months = min;
  if (lastOne) {
    const [ly, lm] = parts(lastOne);
    months = Math.max(min, Math.min(max, (ly - ty) * 12 + (lm - tm) + 1));
  }
  const running = sprints.find((s) => s.running) || null;
  const out = [];
  for (let i = 0; i < months; i += 1) {
    const total = tm - 1 + i;
    const y = ty + Math.floor(total / 12);
    const mo = (total % 12) + 1;
    const start = keyOf(y, mo, 1);
    const end = keyOf(y, mo, daysInMonth(y, mo));
    const inMonth = allOccurrences(moments, start, end).filter((o) => o.on >= start && o.on <= end);
    // The sprint that holds most of the month (M18: November is Sprint 5, though Sprint 4 ends on the 1st).
    const overlap = (s) => daysBetween(s.start > start ? s.start : start, s.end < end ? s.end : end) + 1;
    const held = sprints.filter((s) => s.start <= end && s.end >= start).sort((a, b) => overlap(b) - overlap(a)).slice(0, 1).map((s) => `Sprint ${s.number}`);
    out.push({
      key: start,
      month: `${MONTHS_FULL[mo - 1]} ${y}`,
      sprint: held.length ? held.join(' and ') : 'No sprint planned yet',
      moments: inMonth.map((o) => ({
        key: o.key,
        day: `${DAY_SHORT[weekday(o.on)]} ${Number(o.on.slice(8))}`,
        name: o.moment.name,
        until: o.endsOn !== o.on && o.endsOn > end ? `until ${dayWords(o.endsOn, today)}` : (o.endsOn !== o.on ? `until ${DAY_SHORT[weekday(o.endsOn)]} ${Number(o.endsOn.slice(8))}` : ''),
        past: o.endsOn < today,
        waiting: Boolean(o.on > today && (!running || o.on > running.end)),
      })),
    });
  }
  return out;
}

/** Sprint details' list (brief, step 2): every time a moment comes round inside the sprint, in date order. */
export function sprintMoments(moments, dates) {
  if (!dates?.start || !dates?.end) return [];
  return allOccurrences(moments, dates.start, dates.end).filter((o) => o.on >= dates.start && o.on <= dates.end);
}

// ---------------------------------------------------------------- the summary of one moment

/** "Your peak moment": one line per answer, no second line repeating it (29ap). */
export function summaryRows(m, today) {
  return [
    { key: 'name', label: 'Name', step: 'name', editName: 'its name', lines: [{ text: cleanMomentName(m.name) }] },
    { key: 'area', label: 'For', step: 'area', editName: 'work or personal', lines: [{ text: areaOf(m.area)?.label || '' }] },
    { key: 'kind', label: 'What you need from it', step: 'kind', editName: 'what you need from it', lines: [{ text: kindOf(m.kind)?.label || '' }] },
    { key: 'when', label: 'When', step: 'when', editName: 'when it is', lines: [{ text: whenWords(m.startsOn, m.endsOn, today) }] },
    { key: 'where', label: 'Where', step: 'where', editName: 'where it is', lines: [{ text: m.placeCity || 'At home' }] },
    { key: 'repeat', label: 'Repeats', step: 'repeat', editName: 'whether it repeats', lines: [{ text: m.repeat ? repeatWords(m, today) : 'It doesn’t repeat' }] },
  ];
}
