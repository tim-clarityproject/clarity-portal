// Stage D item 1: the Pre-mortem, Pressure plan and Meeting planner to
// Draft 6 (src/lib/draft6Tools). The questions word for word, the
// commit question the only one that can't be skipped, their own words
// quoted back, and every older saved item still opening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { asRows, quote, rowTexts, titleFrom, withRows } from '../../src/lib/draft6Tools/shared.js';
import * as PM from '../../src/lib/draft6Tools/preMortem.js';
import * as PP from '../../src/lib/draft6Tools/pressurePlan.js';
import * as MP from '../../src/lib/draft6Tools/meetingPlanner.js';
import { roleWords } from '../../src/lib/roleWords.js';

let n = 0;
const makeId = () => `id-${++n}`;
const rows = (...texts) => texts.map((text) => ({ id: makeId(), text }));

test('every question is Draft 6’s, with typographic apostrophes, What or How, never Why', () => {
  assert.deepEqual(Object.values(PM.QUESTIONS), [
    'What’s the plan?',
    'What’s already going for it?',
    'Imagine it’s six months on and it’s gone badly. What happened?',
    'If you wanted to wreck it, what would you do?',
    'Which of these is most likely?',
    'Which would hurt you most?',
    'What will you do first, and when?',
  ]);
  assert.equal(PM.preventQuestion('We run out of cash.'), 'You said “We run out of cash”. What will stop that happening?');
  assert.equal(PM.warnQuestion('We run out of cash'), 'What’s your early warning sign for “We run out of cash”?');
  assert.deepEqual(Object.values(PP.QUESTIONS), [
    'What’s the moment?',
    'When is it?',
    'When have you handled a moment like this well?',
    'What’s on your mind about it?',
    'What does this moment give you the chance to show?',
    'What’s your routine in the minutes before?',
    'When will you rehearse your routine?',
  ]);
  assert.equal(PP.holdQuestion('The numbers'), 'For “The numbers”, which is true?');
  assert.equal(PP.actQuestion('My slides'), 'You control “My slides”. What will you do about it?');
  assert.equal(PP.ifThenQuestion('They challenge me'), 'If “They challenge me” happens, what will you do?');
  assert.deepEqual(PP.HOLDS.map((h) => h.label), ['I control this.', 'I can influence this.', 'I can’t change this.']);
  assert.deepEqual(Object.values(MP.QUESTIONS), [
    'What type of meeting is it?',
    'Imagine it’s ended and gone brilliantly. What’s been agreed?',
    'Who’s in the room, and what does each of them want?',
    'Who’s with you, and who’ll push back?',
    'What won’t you give up?',
    'What will they ask, and what do they need to hear?',
    'What do they need to hear early, before it surprises them?',
    'What’s the one decision you need from them?',
    'How will you open?',
    'What will you do before the meeting, and when?',
  ]);
  for (const q of [...Object.values(PM.QUESTIONS), ...Object.values(PP.QUESTIONS), ...Object.values(MP.QUESTIONS)]) {
    assert.doesNotMatch(q, /^Why\b|'/, q);
  }
});

test('"See an example" offers three different examples, never one', () => {
  for (const list of [PM.PLAN_EXAMPLES, PP.MOMENT_EXAMPLES, PP.IF_THEN_EXAMPLES]) {
    assert.equal(list.length, 3);
    assert.equal(new Set(list).size, 3);
  }
});

test('the Meeting planner’s [board] is in the person’s words for their role and country', () => {
  const board = (person) => MP.kinds(roleWords(person)).find((k) => k.value === 'board').label;
  assert.equal(board({ role: 'leader', country: 'GB' }), 'It’s with the board.');
  assert.equal(board({ role: 'head_coach', country: 'GB' }), 'It’s with the board or owners.');
  assert.equal(board({ role: 'head_coach', country: 'US' }), 'It’s with the owners or front office.');
});

test('lists keep each row’s id through typing, removing and Undo', () => {
  const list = rows('a', 'b', 'c');
  const typed = withRows(list, ['a', 'b2', 'c'], undefined, makeId);
  assert.deepEqual(typed.map((r) => r.id), list.map((r) => r.id));
  const removed = withRows(typed, ['a', 'c'], { removed: 1 }, makeId);
  assert.deepEqual(removed.map((r) => r.id), [list[0].id, list[2].id]);
  const back = withRows(removed, ['a', 'b2', 'c'], { restored: 1 }, makeId);
  assert.equal(back[0].id, list[0].id);
  assert.equal(back[2].id, list[2].id);
  assert.ok(back[1].id && back[1].id !== list[1].id);
  const added = withRows(list, ['a', 'b', 'c', ''], undefined, makeId);
  assert.equal(added.length, 4);
  assert.deepEqual(rowTexts([]), ['']);
  assert.deepEqual(asRows(['x', '', { text: 'y' }], makeId).map((r) => r.text), ['x', '', 'y']);
});

test('their own words are quoted without a last full stop, and long ones are cut', () => {
  assert.equal(quote('  the board meeting.  '), 'the board meeting');
  assert.equal(quote('x'.repeat(100)).length, 80);
  assert.ok(quote('x'.repeat(100)).endsWith('…'));
  assert.equal(titleFrom('', 'New pre-mortem'), 'New pre-mortem');
  assert.equal(titleFrom('y'.repeat(70), '').length, 60);
});

test('Pre-mortem: causes picked are ranked, most likely and most hurtful first', () => {
  const a = { ...PM.emptyAnswers(), gone: rows('Cash runs out', 'Key person leaves'), wreck: rows('Ignore the customers') };
  const [cash, leaves, ignore] = PM.causes(a);
  assert.equal(PM.causeOptions(a).length, 3);
  a.likely = [cash.id, ignore.id];
  a.hurt = [leaves.id, ignore.id];
  assert.deepEqual(PM.ranked(a).map((c) => c.text), ['Ignore the customers', 'Cash runs out', 'Key person leaves']);
});

test('Pre-mortem: only the commit question can’t be skipped, and it needs what and when', () => {
  const a = PM.emptyAnswers();
  assert.equal(PM.firstProblem(a), PM.NEEDS.firstText);
  a.first = { text: 'Call the bank', date: '' };
  assert.equal(PM.firstProblem(a), PM.NEEDS.firstDate);
  a.first.date = '2026-12-01';
  assert.equal(PM.firstProblem(a), null);
});

test('Pre-mortem: saved as version 6, with the older fields kept for its review', () => {
  const a = { ...PM.emptyAnswers(), plan: 'Launch by March', going: rows('A good team', ''), gone: rows('Cash runs out', 'Late') };
  const [cash] = PM.causes(a);
  a.likely = [cash.id];
  a.prevent = { [cash.id]: 'Agree the overdraft now' };
  a.warn = { [cash.id]: 'Two late invoices' };
  a.first = { text: 'Call the bank', date: '2026-12-01' };
  const form = PM.toForm(a);
  assert.equal(form.v, 6);
  assert.equal(form.goal, 'Launch by March');
  assert.deepEqual(form.going.map((g) => g.text), ['A good team']);
  assert.deepEqual(form.risks, ['Cash runs out']);
  assert.deepEqual(form.riskAnswers, ['Agree the overdraft now']);
  const back = PM.fromForm(form, makeId);
  assert.equal(back.plan, 'Launch by March');
  assert.equal(back.warn[cash.id], 'Two late invoices');
  assert.deepEqual(back.first, { text: 'Call the bank', date: '2026-12-01' });
  assert.equal(PM.titleOf(a), 'Launch by March');
  assert.ok(PM.hasAnswers(a));
  assert.ok(!PM.hasAnswers(PM.emptyAnswers()));
});

test('Pre-mortem: an older pre-mortem opens with its goal, risks and answers', () => {
  const old = PM.fromForm({ goal: 'Land the proposal', risks: ['Too dear', '', 'Late'], riskAnswers: ['Show the value', '', ''] }, makeId);
  assert.equal(old.plan, 'Land the proposal');
  assert.deepEqual(old.gone.map((g) => g.text), ['Too dear', 'Late']);
  assert.deepEqual(PM.ranked(old).map((c) => c.text), ['Too dear']);
  assert.equal(old.prevent[old.gone[0].id], 'Show the value');
  const oldest = PM.fromForm({ goal: 'Win', risks: ['Injury'], plan: 'Rest more' }, makeId);
  assert.equal(oldest.first.text, 'Rest more');
  // Saved again, the older single plan isn't kept twice.
  assert.equal('plan' in PM.toForm(oldest, { goal: 'Win', plan: 'Rest more' }), false);
});

test('Pressure plan: what they control, the hardest thing, and the commit question', () => {
  const a = { ...PP.emptyAnswers(), mind: [{ id: 'm1', text: 'My slides', hold: 'control' }, { id: 'm2', text: 'Their mood', hold: 'influence' }, { id: 'm3', text: 'The weather', hold: 'cant' }] };
  assert.deepEqual(PP.controlled(a).map((m) => m.text), ['My slides']);
  assert.equal(PP.hardest(a).text, 'The weather');
  assert.equal(PP.hardest({ ...a, mind: a.mind.slice(0, 2) }).text, 'Their mood');
  assert.equal(PP.hardest(PP.emptyAnswers()), null);
  assert.equal(PP.rehearseProblem(a), PP.NEEDS.rehearseDate);
  a.rehearse = { date: '2026-12-01', time: '' };
  assert.equal(PP.rehearseProblem(a), PP.NEEDS.rehearseTime);
  a.rehearse.time = '07:30';
  assert.equal(PP.rehearseProblem(a), null);
});

test('Pressure plan: saved as version 6 with the older situation and items, and an older plan opens', () => {
  const a = {
    ...PP.emptyAnswers(),
    moment: 'The board presentation',
    noDate: true,
    date: '2026-12-01',
    mind: [{ id: 'm1', text: 'My slides', hold: 'control' }, { id: 'm2', text: '', hold: null }],
    acts: { m1: 'Cut to ten', gone: 'x' },
    items: [{ id: 'i1', ifCondition: 'they challenge the numbers', thenAction: 'go to page 3' }, { id: 'i2', ifCondition: '', thenAction: '' }],
    routine: { breathe: 'Box breathing', cue: 'Steady', first: 'Smile' },
    rehearse: { date: '2026-11-30', time: '18:00' },
  };
  const form = PP.toForm(a);
  assert.equal(form.v, 6);
  assert.equal(form.situation, 'The board presentation');
  assert.equal(form.date, '');
  assert.equal(form.noDate, true);
  assert.equal(form.mind.length, 1);
  assert.deepEqual(form.acts, { m1: 'Cut to ten' });
  assert.equal(form.items.length, 1);
  const back = PP.fromForm(form, makeId);
  assert.equal(back.moment, 'The board presentation');
  assert.equal(back.routine.cue, 'Steady');
  assert.equal(PP.titleOf(back), 'The board presentation');
  const old = PP.fromForm({ situation: 'Cup final', items: [{ id: 1, ifCondition: 'we concede', thenAction: 'reset' }] }, makeId);
  assert.equal(old.moment, 'Cup final');
  assert.deepEqual(old.items, [{ id: '1', ifCondition: 'we concede', thenAction: 'reset' }]);
});

test('Meeting planner: politics and [board] answers are kept only for their kind, and an older plan keeps everything', () => {
  const a = {
    ...MP.emptyAnswers(),
    kind: 'politics',
    agreed: 'The budget is signed off',
    people: [{ id: 'p1', name: 'Jo', wants: 'Less risk' }, { id: 'p2', name: '', wants: '' }],
    allies: rows('Jo'),
    pushback: rows('Sam'),
    wontGive: 'The launch date',
    ask: 'Costs',
    before: { text: 'Brief Jo', date: '2026-12-01' },
  };
  const form = MP.toForm(a);
  assert.equal(form.v, 6);
  assert.equal(form.people.length, 1);
  assert.equal(form.wontGive, 'The launch date');
  assert.equal(form.ask, '');
  assert.equal(MP.beforeProblem(a), null);
  assert.equal(MP.beforeProblem(MP.emptyAnswers()), MP.NEEDS.beforeText);
  const older = { title: 'Quarterly review', date: '2026-10-01', objectives: [{ id: 1, text: 'Agree budget' }], flowItems: [{ id: 1, item: 'Budget', length: '20' }] };
  assert.ok(MP.isOlder(older));
  const kept = MP.toForm(MP.fromForm(older, makeId), older);
  assert.equal(kept.title, 'Quarterly review');
  assert.deepEqual(kept.flowItems, older.flowItems);
  assert.equal(MP.titleOf(a, older), 'Quarterly review');
  assert.equal(MP.titleOf(a), 'The budget is signed off');
  assert.ok(!MP.isOlder(kept));
});
