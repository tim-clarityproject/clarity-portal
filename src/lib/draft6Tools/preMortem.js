import { anyWords, asRows, dateKey, filled, quote, text, titleFrom } from './shared.js';

// The Pre-mortem to Draft 6 (Tim, 27 Nov 2026, 12:54; question rules of the
// same day), word for word: ten screens, saved as before in `decisions`
// (tool_type 'inversion'). Every question but the last can be skipped.
//
// What's saved (form_data, version 6):
//   goal      the plan (the old pages' "goal", so older readers still find it)
//   going     what's already going for it: [{ id, text }]
//   gone      what happened when it went badly: [{ id, text }]
//   wreck     how you'd wreck it: [{ id, text }] (added to the causes)
//   likely    the causes most likely, up to three: [id]
//   hurt      the causes that would hurt most, up to three: [id]
//   prevent   { id: what will stop it }
//   warn      { id: the early warning sign }
//   first     { text, date }: what you'll do first, and when
//   risks, riskAnswers   the ranked causes and what will stop each, as the
//             older pages saved them, so the plan's review (ReviewPlan) and
//             anything else reading the old shape still shows them.
// A pre-mortem saved by the older pages (goal, risks, riskAnswers, or an
// older single "plan") opens with its goal as the plan, its risks as what
// happened and its answers as what will stop each.

export const TOOL_TYPE = 'inversion';
export const TOOL_NAME = 'Pre-mortem';
export const VERSION = 6;
export const PICK_MAX = 3;
export const SUMMARY_PATH = '/pre-mortem/summary';

export const QUESTIONS = Object.freeze({
  plan: 'What’s the plan?',
  going: 'What’s already going for it?',
  gone: 'Imagine it’s six months on and it’s gone badly. What happened?',
  wreck: 'If you wanted to wreck it, what would you do?',
  likely: 'Which of these is most likely?',
  hurt: 'Which would hurt you most?',
  first: 'What will you do first, and when?',
});
export const preventQuestion = (cause) => `You said “${quote(cause)}”. What will stop that happening?`;
export const warnQuestion = (cause) => `What’s your early warning sign for “${quote(cause)}”?`;

/** "See an example" under the first question: three different ones (question rule 10). */
export const PLAN_EXAMPLES = Object.freeze(['Launch the new service by March', 'Win promotion this season', 'Run a sub-3 marathon in April']);

export const NEEDS = Object.freeze({
  firstText: 'Type what you’ll do first to carry on.',
  firstDate: 'Choose a day to carry on.',
});

export function emptyAnswers() {
  return { plan: '', going: [], gone: [], wreck: [], likely: [], hurt: [], prevent: {}, warn: {}, first: { text: '', date: '' } };
}

/** Every cause, from what happened and how you'd wreck it, in that order. */
export function causes(a) {
  return [...filled(a.gone), ...filled(a.wreck)];
}

/**
 * The causes picked, ranked: most likely and most hurtful first, then most
 * likely, then most hurtful, each in the order they were chosen.
 */
export function ranked(a) {
  const all = causes(a);
  const ok = (id) => all.some((c) => c.id === id);
  const likely = (a.likely || []).filter(ok);
  const hurt = (a.hurt || []).filter(ok);
  const order = [...likely.filter((id) => hurt.includes(id)), ...likely.filter((id) => !hurt.includes(id)), ...hurt.filter((id) => !likely.includes(id))];
  return order.map((id) => all.find((c) => c.id === id));
}

/** The answer boxes for "Which of these…?": every cause. */
export const causeOptions = (a) => causes(a).map((c) => ({ value: c.id, label: c.text.trim() }));

/** What the commit question still needs, or null. It can't be skipped. */
export function firstProblem(a) {
  if (!`${a.first?.text || ''}`.trim()) return NEEDS.firstText;
  if (!dateKey(a.first?.date)) return NEEDS.firstDate;
  return null;
}

export function hasAnswers(a) {
  return anyWords(a.plan, a.first?.text, a.first?.date)
    || causes(a).length > 0 || filled(a.going).length > 0;
}

export const titleOf = (a) => titleFrom(a.plan, 'New pre-mortem');

/** What's saved: version 6, with the older pages' fields kept in step. */
export function toForm(a, before = {}) {
  const top = ranked(a);
  const keep = (rows) => filled(rows).map((r) => ({ id: r.id, text: r.text }));
  const ids = new Set(causes(a).map((c) => c.id));
  const only = (map) => Object.fromEntries(Object.entries(map || {}).filter(([id, v]) => ids.has(id) && `${v || ''}`.trim()));
  const { plan: _oldPlan, ...rest } = before && typeof before === 'object' ? before : {};
  return {
    ...rest,
    v: VERSION,
    goal: a.plan,
    going: keep(a.going),
    gone: keep(a.gone),
    wreck: keep(a.wreck),
    likely: (a.likely || []).filter((id) => ids.has(id)),
    hurt: (a.hurt || []).filter((id) => ids.has(id)),
    prevent: only(a.prevent),
    warn: only(a.warn),
    first: { text: text(a.first?.text), date: dateKey(a.first?.date) },
    risks: top.map((c) => c.text.trim()),
    riskAnswers: top.map((c) => text(a.prevent?.[c.id])),
  };
}

/** A saved pre-mortem, this version's or an older one, as the tool's answers. */
export function fromForm(form, makeId) {
  const f = form && typeof form === 'object' ? form : {};
  const map = (m) => (m && typeof m === 'object' && !Array.isArray(m) ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, text(v)])) : {});
  if (f.v >= VERSION) {
    return {
      plan: text(f.goal),
      going: asRows(f.going, makeId),
      gone: asRows(f.gone, makeId),
      wreck: asRows(f.wreck, makeId),
      likely: Array.isArray(f.likely) ? f.likely.filter((x) => typeof x === 'string') : [],
      hurt: Array.isArray(f.hurt) ? f.hurt.filter((x) => typeof x === 'string') : [],
      prevent: map(f.prevent),
      warn: map(f.warn),
      first: { text: text(f.first?.text), date: dateKey(f.first?.date) },
    };
  }
  // The older pages: a goal, its risks and what you'd do about each.
  const gone = asRows((Array.isArray(f.risks) ? f.risks : []).filter((r) => `${r || ''}`.trim()), makeId);
  const answers = Array.isArray(f.riskAnswers) && f.riskAnswers.length === (f.risks || []).length
    ? f.riskAnswers.filter((_, i) => `${f.risks[i] || ''}`.trim()) : [];
  const prevent = {};
  gone.forEach((c, i) => { if (`${answers[i] || ''}`.trim()) prevent[c.id] = answers[i]; });
  return {
    ...emptyAnswers(),
    plan: text(f.goal),
    gone,
    likely: Object.keys(prevent),
    prevent,
    first: { text: answers.length ? '' : text(f.plan), date: '' },
  };
}
