import { anyWords, asRows, dateKey, filled, text, titleFrom } from './shared.js';

// The Meeting planner to Draft 6 (Tim, 27 Nov 2026, 12:54; question rules of
// the same day), word for word, with [board] in the person's words for their
// role and country (src/lib/roleWords.js). Saved as before in `decisions`
// (tool_type 'plan_meeting'); every question but the last can be skipped.
// Politics and [board] each add their own two questions.
//
// What's saved (form_data, version 6):
//   kind       'regular', 'politics' or 'board'
//   agreed     what's been agreed when it's gone brilliantly
//   people     who's in the room: [{ id, name, wants }]
//   allies, pushback   who's with you and who'll push back: [{ id, text }]
//   wontGive   what you won't give up
//   ask        what they'll ask and need to hear
//   early, earlyNothing   what they need to hear early, or "Nothing"
//   decision   the one decision you need
//   opening    your first two sentences
//   before     { text, date }: what you'll do before the meeting, and when
// A plan saved by the older page (title, date, time, chair, objectives,
// agenda, context, preparation) keeps all of that: the summary and the PDF
// still show it, and an edit here only adds to it.

export const TOOL_TYPE = 'plan_meeting';
export const TOOL_NAME = 'Meeting planner';
export const VERSION = 6;
export const SUMMARY_PATH = '/meeting-summary';

export const QUESTIONS = Object.freeze({
  kind: 'What type of meeting is it?',
  agreed: 'Imagine it’s ended and gone brilliantly. What’s been agreed?',
  room: 'Who’s in the room, and what does each of them want?',
  sides: 'Who’s with you, and who’ll push back?',
  wontGive: 'What won’t you give up?',
  ask: 'What will they ask, and what do they need to hear?',
  early: 'What do they need to hear early, before it surprises them?',
  decision: 'What’s the one decision you need from them?',
  opening: 'How will you open?',
  before: 'What will you do before the meeting, and when?',
});
export const NOTHING = 'Nothing';

/**
 * The three kinds, with [board] in the person's words. Draft 6 writes
 * "It's with [board]."; the table's words need "the" before them to read
 * as a sentence ("It’s with the board or owners.").
 */
export function kinds(words) {
  return [
    { value: 'regular', label: 'It’s a regular meeting.' },
    { value: 'politics', label: 'There’s politics in the room.' },
    { value: 'board', label: `It’s with the ${words?.board || 'board'}.` },
  ];
}

export const NEEDS = Object.freeze({
  beforeText: 'Type what you’ll do before the meeting to carry on.',
  beforeDate: 'Choose a day to carry on.',
});

export function emptyAnswers() {
  return {
    kind: null, agreed: '', people: [], allies: [], pushback: [], wontGive: '', ask: '', early: '', earlyNothing: false,
    decision: '', opening: '', before: { text: '', date: '' },
  };
}

const kindOf = (v) => (['regular', 'politics', 'board'].includes(v) ? v : null);
/** Who's in the room, with a name or what they want. */
export const peopleIn = (a) => (a.people || []).filter((p) => `${p.name || ''}${p.wants || ''}`.trim());

/** What the commit question still needs, or null. It can't be skipped. */
export function beforeProblem(a) {
  if (!`${a.before?.text || ''}`.trim()) return NEEDS.beforeText;
  if (!dateKey(a.before?.date)) return NEEDS.beforeDate;
  return null;
}

export function hasAnswers(a) {
  return Boolean(a.kind) || anyWords(a.agreed, a.wontGive, a.ask, a.early, a.decision, a.opening, a.before?.text, a.before?.date)
    || peopleIn(a).length > 0 || filled(a.allies).length > 0 || filled(a.pushback).length > 0;
}

/** A saved plan's name: the older page's meeting name, else what's been agreed. */
export const titleOf = (a, before = {}) => titleFrom(before?.title || a.agreed, 'Meeting plan');

/** What's saved: version 6, with whatever the older page saved kept as it was. */
export function toForm(a, before = {}) {
  const keep = (rows) => filled(rows).map((r) => ({ id: r.id, text: r.text }));
  const politics = a.kind === 'politics';
  const board = a.kind === 'board';
  return {
    ...(before && typeof before === 'object' ? before : {}),
    v: VERSION,
    kind: kindOf(a.kind),
    agreed: text(a.agreed),
    people: peopleIn(a).map((p) => ({ id: p.id, name: text(p.name), wants: text(p.wants) })),
    // Answers for the other kind of meeting are kept only while that kind is chosen.
    allies: politics ? keep(a.allies) : [],
    pushback: politics ? keep(a.pushback) : [],
    wontGive: politics ? text(a.wontGive) : '',
    ask: board ? text(a.ask) : '',
    early: board && !a.earlyNothing ? text(a.early) : '',
    earlyNothing: board && Boolean(a.earlyNothing),
    decision: text(a.decision),
    opening: text(a.opening),
    before: { text: text(a.before?.text), date: dateKey(a.before?.date) },
  };
}

/** A saved plan, this version's or the older page's, as the tool's answers. */
export function fromForm(form, makeId) {
  const f = form && typeof form === 'object' ? form : {};
  return {
    kind: kindOf(f.kind),
    agreed: text(f.agreed),
    people: (Array.isArray(f.people) ? f.people : [])
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ id: p.id || makeId(), name: text(p.name), wants: text(p.wants) })),
    allies: asRows(f.allies, makeId),
    pushback: asRows(f.pushback, makeId),
    wontGive: text(f.wontGive),
    ask: text(f.ask),
    early: text(f.early),
    earlyNothing: f.earlyNothing === true,
    decision: text(f.decision),
    opening: text(f.opening),
    before: { text: text(f.before?.text), date: dateKey(f.before?.date) },
  };
}

/** True when a saved plan was made by the older page (it has an agenda, objectives or a meeting name). */
export function isOlder(form) {
  const f = form && typeof form === 'object' ? form : {};
  return !(f.v >= VERSION);
}
