import { anyWords, asRows, clock, dateKey, filled, quote, text, titleFrom } from './shared.js';

// The Pressure plan to Draft 6 (Tim, 27 Nov 2026, 12:54; question rules of
// the same day), word for word: eleven screens, a Reset tool, so shorter
// and steadier, one thing at a time. Saved as before in `decisions`
// (tool_type 'if_then_planning'); every question but the last can be skipped.
//
// What's saved (form_data, version 6):
//   situation  the moment (the older page's "situation", so older readers still find it)
//   date, noDate   when it is, or "No set date"
//   well       when you handled a moment like this well
//   mind       what's on your mind: [{ id, text, hold }], hold 'control',
//              'influence' or 'cant' ("For “…”, which is true?")
//   acts       { id: what you'll do about it }, for the ones you control
//   todos      { id: the to-do it was added as }, "Add to this week"
//   chance     what this moment gives you the chance to show
//   items      the if-then plans: [{ id, ifCondition, thenAction }], as before
//   routine    { breathe, cue, first }: the minutes before
//   rehearse   { date, time }: when you'll rehearse it
// A plan saved by the older page (situation and items) opens as it was.

export const TOOL_TYPE = 'if_then_planning';
export const TOOL_NAME = 'Pressure plan';
export const VERSION = 6;
export const SUMMARY_PATH = '/pressure-plan/summary';

export const QUESTIONS = Object.freeze({
  moment: 'What’s the moment?',
  when: 'When is it?',
  well: 'When have you handled a moment like this well?',
  mind: 'What’s on your mind about it?',
  chance: 'What does this moment give you the chance to show?',
  routine: 'What’s your routine in the minutes before?',
  rehearse: 'When will you rehearse your routine?',
});
export const holdQuestion = (item) => `For “${quote(item)}”, which is true?`;
export const actQuestion = (item) => `You control “${quote(item)}”. What will you do about it?`;
// Draft 6 quotes the hardest thing on their mind; with nothing listed the
// question asks about the moment itself (Claude's words, for Tim to check).
export const ifThenQuestion = (item) => (item ? `If “${quote(item)}” happens, what will you do?` : 'If it doesn’t go to plan, what will you do?');

export const NO_DATE = 'No set date';
export const HOLDS = Object.freeze([
  { value: 'control', label: 'I control this.' },
  { value: 'influence', label: 'I can influence this.' },
  { value: 'cant', label: 'I can’t change this.' },
]);
export const ROUTINE = Object.freeze([
  { key: 'breathe', label: 'Breathe' },
  { key: 'cue', label: 'Cue word' },
  { key: 'first', label: 'First action' },
]);

export const MOMENT_EXAMPLES = Object.freeze(['The board presentation', 'Saturday’s final', 'A hard talk at home']);
export const IF_THEN_EXAMPLES = Object.freeze([
  'If they challenge the numbers, I’ll go to page 3',
  'If we concede early, I’ll reset the shape',
  'If my mind goes blank, I’ll breathe and look at my notes',
]);

export const NEEDS = Object.freeze({
  rehearseDate: 'Choose a day to carry on.',
  rehearseTime: 'Choose a time to carry on.',
});

export function emptyAnswers() {
  return {
    moment: '', date: '', noDate: false, well: '', mind: [], acts: {}, todos: {}, chance: '',
    items: [], routine: { breathe: '', cue: '', first: '' }, rehearse: { date: '', time: '' },
  };
}

/** What's on their mind, with words in it. */
export const mindItems = (a) => filled(a.mind);
/** The ones they control: each gets "What will you do about it?". */
export const controlled = (a) => mindItems(a).filter((m) => m.hold === 'control');
/** The hardest thing on their mind: the first they can't change, else the first they can influence, else the first. */
export function hardest(a) {
  const items = mindItems(a);
  return items.find((m) => m.hold === 'cant') || items.find((m) => m.hold === 'influence') || items[0] || null;
}

/** The if-then plans with words in them. */
export const ifThens = (a) => (a.items || []).filter((i) => `${i.ifCondition || ''}${i.thenAction || ''}`.trim());

/** What the commit question still needs, or null. It can't be skipped. */
export function rehearseProblem(a) {
  if (!dateKey(a.rehearse?.date)) return NEEDS.rehearseDate;
  if (!clock(a.rehearse?.time)) return NEEDS.rehearseTime;
  return null;
}

export function hasAnswers(a) {
  return anyWords(a.moment, a.date, a.well, a.chance, a.routine?.breathe, a.routine?.cue, a.routine?.first, a.rehearse?.date)
    || mindItems(a).length > 0 || ifThens(a).length > 0;
}

export const titleOf = (a) => titleFrom(a.moment, 'New pressure plan');

const holdOf = (v) => (HOLDS.some((h) => h.value === v) ? v : null);

/** What's saved: version 6, keeping the older page's situation and items. */
export function toForm(a, before = {}) {
  const mind = mindItems(a).map((m) => ({ id: m.id, text: m.text, hold: holdOf(m.hold) }));
  const ids = new Set(mind.map((m) => m.id));
  const only = (map) => Object.fromEntries(Object.entries(map || {}).filter(([id, v]) => ids.has(id) && `${v || ''}`.trim()));
  return {
    ...(before && typeof before === 'object' ? before : {}),
    v: VERSION,
    situation: a.moment,
    date: a.noDate ? '' : dateKey(a.date),
    noDate: Boolean(a.noDate),
    well: text(a.well),
    mind,
    acts: only(a.acts),
    todos: only(a.todos),
    chance: text(a.chance),
    items: ifThens(a).map((i) => ({ id: i.id, ifCondition: text(i.ifCondition), thenAction: text(i.thenAction) })),
    routine: { breathe: text(a.routine?.breathe), cue: text(a.routine?.cue), first: text(a.routine?.first) },
    rehearse: { date: dateKey(a.rehearse?.date), time: clock(a.rehearse?.time) },
  };
}

/** A saved plan, this version's or the older page's, as the tool's answers. */
export function fromForm(form, makeId) {
  const f = form && typeof form === 'object' ? form : {};
  const map = (m) => (m && typeof m === 'object' && !Array.isArray(m) ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, text(v)])) : {});
  const items = (Array.isArray(f.items) ? f.items : [])
    .filter((i) => i && typeof i === 'object')
    .map((i) => ({ id: i.id != null ? String(i.id) : makeId(), ifCondition: text(i.ifCondition), thenAction: text(i.thenAction) }));
  return {
    moment: text(f.situation),
    date: dateKey(f.date),
    noDate: f.noDate === true,
    well: text(f.well),
    mind: asRows(f.mind, makeId).map((m) => ({ ...m, hold: holdOf(m.hold) })),
    acts: map(f.acts),
    todos: map(f.todos),
    chance: text(f.chance),
    items,
    routine: { breathe: text(f.routine?.breathe), cue: text(f.routine?.cue), first: text(f.routine?.first) },
    rehearse: { date: dateKey(f.rehearse?.date), time: clock(f.rehearse?.time) },
  };
}
