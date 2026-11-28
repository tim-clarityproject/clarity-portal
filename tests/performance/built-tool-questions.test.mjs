// Stage D, Draft 11 (approved by Tim, 27 Nov 2026): the built tools'
// questions, their commit questions and Decide who decides' colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { examplesOf } from '../../src/components/design/examples.js';
import { COMMIT_NEEDED, DAY_ONE_QUESTION, MONDAY_QUESTION, PLAN_FIRST_QUESTION, commitTodo } from '../../src/lib/performance/commitQuestions.js';
import { MOST_IMPORTANT, RISK_QUESTION, responseQuestion, topFirst } from '../../src/lib/performance/dayPlan.js';
import { habitsQuestion } from '../../src/lib/performance/builder.js';
import { pendingStart } from '../../src/lib/performance/sprintStart.js';
import { REVIEW_NEXT } from '../../src/lib/peakMoments/model.js';
import { COACHING_QUESTIONS } from '../../src/content/coachingQuestions.js';
import {
  DECIDE_COLOURS, REQUIRED, addPerson, commitMessage, commitPerson, commitText, emptyCheck, question,
  savedAnswers, checkFrom, setCommit, setRating, setWorking,
} from '../../src/lib/teamCheck/model.js';

test('See an example: two or three different examples at once, never one chosen by role', () => {
  assert.deepEqual(examplesOf('One.'), ['One.']);
  assert.deepEqual(examplesOf({ ceo: 'A', coach: 'B', leader: 'C' }), ['A', 'B', 'C']);
  assert.deepEqual(examplesOf(['A', 'A', ' ', 'B', 'C', 'D']), ['A', 'B', 'C']);
  assert.deepEqual(examplesOf(null), []);
  assert.deepEqual(examplesOf(''), []);
});

test('the commit questions, word for word, and the to-do each answer becomes', () => {
  assert.equal(PLAN_FIRST_QUESTION, 'What will you do first, and when?');
  assert.equal(DAY_ONE_QUESTION, 'What will you do on day one?');
  assert.equal(MONDAY_QUESTION, 'What will you do first on Monday?');
  assert.equal(COMMIT_NEEDED, 'Type what you’ll do to carry on.');
  const strategies = [{ id: 's1', name: 'Grow my people' }, { id: 's2', name: 'Protect deep work' }];
  assert.deepEqual(commitTodo('  Call   Priya  on Tuesday ', 's2', strategies), { text: 'Call Priya on Tuesday', strategyId: 's2' });
  assert.deepEqual(commitTodo('Call Priya', 'gone', strategies), { text: 'Call Priya', strategyId: 's1' }, 'an unknown Strategy takes the first');
  assert.deepEqual(commitTodo('Call Priya', null, [{ value: 'v1', label: 'X' }]), { text: 'Call Priya', strategyId: 'v1' });
  assert.equal(commitTodo('   ', 's1', strategies), null);
  assert.equal(commitTodo('Call Priya', 's1', []), null, 'every to-do serves a Strategy');
  assert.equal(commitTodo('x'.repeat(400), 's1', strategies).text.length, 300);
});

test('a sprint start carries the commit to-do with its own id, so a resend writes the same row', () => {
  let n = 0;
  const makeId = () => `id-${(n += 1)}`;
  const p = pendingStart({ planId: 'pl', number: 1, startOn: '2026-11-30', lengthWeeks: 12, standard: 85, firstTodo: { text: 'Book the off-site', strategyId: 's1', createdOn: '2026-11-27' } }, makeId);
  assert.equal(p.firstTodo.text, 'Book the off-site');
  assert.equal(p.firstTodo.strategyId, 's1');
  assert.equal(p.firstTodo.createdOn, '2026-11-27');
  assert.ok(p.firstTodo.id);
  assert.equal(pendingStart({ planId: 'pl', number: 1, startOn: '2026-11-30', lengthWeeks: 12, standard: 85 }, makeId).firstTodo, null);
  assert.equal(pendingStart({ planId: 'pl', number: 1, startOn: '2026-11-30', lengthWeeks: 12, standard: 85, firstTodo: { text: 'x', strategyId: null } }, makeId).firstTodo, null);
});

test('Daily plan: one risk question, the commit quoting their answer, the first to-do the most important', () => {
  assert.equal(RISK_QUESTION, 'What’s most likely to knock today off course?');
  assert.equal(responseQuestion('The 10:00 runs over.'), 'If “The 10:00 runs over” happens, what will you do?');
  assert.equal(responseQuestion('  '), 'If it happens, what will you do?');
  assert.ok(responseQuestion('x'.repeat(200)).includes('…'));
  assert.equal(MOST_IMPORTANT, 'Most important');
  // Home and the Daily review read the highest priority first: the saved top leads the list.
  assert.deepEqual(topFirst(['todo:a', 'todo:b', 'habit:c'], 'todo:b'), ['todo:b', 'todo:a', 'habit:c']);
});

test('Build your plan quotes the Strategy chosen; Peak moments and the coaching prompt use "will"', () => {
  assert.equal(habitsQuestion('Grow my people'), 'What will you do each week to deliver “Grow my people”?');
  assert.equal(habitsQuestion(''), 'What will you do each week to deliver your Strategies?');
  assert.equal(REVIEW_NEXT, 'What will you keep, and what will you change?');
  assert.ok(COACHING_QUESTIONS.includes('Which of your strengths will help here?'));
  assert.equal(COACHING_QUESTIONS.length, 8, 'saved choices are by place: the list keeps its length');
});

test('Team performance check: what’s working, one commit question naming one person, kept round trip', () => {
  let c = emptyCheck();
  c = addPerson(c, { id: 'a', name: 'Priya Shah', role: '' });
  c = addPerson(c, { id: 'b', name: 'Tom Ellis', role: '' });
  assert.equal(question('w', c.people[0]), 'What’s working well with Priya Shah right now?');
  assert.equal(question('c', c.people[1]), 'What will you do first with Tom Ellis, and when?');
  c = setWorking(c, 'a', 'She runs the Monday numbers');
  assert.equal(c.people[0].w, 'She runs the Monday numbers');
  // Rated: Priya in Chaotic (autonomy only) is named first by the questions to start with.
  for (const [id, t, a, u] of [['a', 4, 2, 5], ['b', 5, 5, 5]]) {
    c = setRating(c, id, 't', t); c = setRating(c, id, 'a', a); c = setRating(c, id, 'u', u);
  }
  assert.equal(commitPerson(c).id, 'a');
  assert.equal(commitMessage(c), REQUIRED.commit);
  c = setCommit(c, 'Ask Priya to explain the plan back to me on Tuesday');
  assert.equal(commitMessage(c), null);
  assert.equal(commitText(c), 'Ask Priya to explain the plan back to me on Tuesday');
  const back = checkFrom(savedAnswers(c), false);
  assert.equal(back.people[0].w, 'She runs the Monday numbers');
  assert.deepEqual(back.commit, { id: 'a', text: 'Ask Priya to explain the plan back to me on Tuesday' });
  // The answer was about Priya; if the question now names someone else, it starts empty.
  c = setRating(c, 'a', 'a', 5);
  if (commitPerson(c).id !== 'a') assert.equal(commitText(c), '');
});

test('Decide who decides: three colours, word for word, never coral', () => {
  assert.deepEqual(DECIDE_COLOURS.map((x) => [x.name, x.meaning]), [
    ['Green', 'They decide, act and report back.'],
    ['Amber', 'They decide, and I confirm before they act.'],
    ['Red', 'I decide.'],
  ]);
});
