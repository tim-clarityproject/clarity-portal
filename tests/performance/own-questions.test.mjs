// Your own questions (mock-up version 3; Phase 6a run 7): the rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/own-questions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNT_FROM, MAX_PER_TOOL, SCALES, TOOLS, WORDING_MAX, WORRY_LINE,
  answerWords, answered, cleanWording, countLine, daySummaryRows, freePlace, hintFor, homeSuggestionLine,
  kindLine, occasionOf, placesLine, questionsFor, ratingScore, scaleLabel, soundsLikeWorry, suggestedBy,
  waitingSuggestions, weekSummaryRows,
} from '../../src/lib/ownQuestions/model.js';
import { tidyState } from '../../src/lib/ownQuestions/tidy.js';

const q = (id, tool, position, extra = {}) => ({ id, tool, position, wording: `Question ${id}?`, answerType: 'written', scale: null, createdAt: '2026-11-01T00:00:00Z', ...extra });

test('names follow the portal, not the mock-up', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ['Daily plan', 'Daily review', 'Weekly performance debrief']);
  assert.equal(MAX_PER_TOOL, 2);
});

test('six five-word scales, each shown with its first and last word, How often first', () => {
  assert.equal(SCALES.length, 6);
  for (const s of SCALES) assert.equal(s.words.length, 5);
  assert.equal(SCALES[0].key, 'often');
  assert.equal(scaleLabel('often'), 'How often: Never to Always');
  assert.equal(scaleLabel('agree'), 'How much you agree: Strongly disagree to Strongly agree');
  assert.equal(kindLine({ answerType: 'rating', scale: 'often' }), 'A rating, Never to Always');
  assert.equal(kindLine({ answerType: 'yes_no' }), 'Yes or no');
  assert.equal(kindLine({ answerType: 'written' }), 'Written');
});

test('ratings score 0, 25, 50, 75 and 100 (methods 1.5)', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(ratingScore), [0, 25, 50, 75, 100]);
  assert.equal(ratingScore(0), null);
  assert.equal(ratingScore(6), null);
});

test('120 characters at most, a count only in the last 20, unseen characters out', () => {
  assert.equal(cleanWording('a'.repeat(130)).length, WORDING_MAX);
  assert.equal(countLine('a'.repeat(COUNT_FROM)), null);
  assert.equal(countLine('a'.repeat(COUNT_FROM + 1)), '101 of 120');
  assert.equal(cleanWording('What​ now?\nReally'), 'What now? Really');
  assert.equal(cleanWording('​​').trim(), '');
});

test('the worry line: Daily plan only, advice, every form of the words', () => {
  for (const w of ['stress', 'stressed', 'stressful', 'worry', 'worried', 'worrying', 'anxious', 'anxiety', 'nervous', 'nervousness', 'dread', 'dreading']) {
    assert.ok(soundsLikeWorry(`What am I ${w} about?`), w);
  }
  assert.ok(!soundsLikeWorry('What would make today a win?'));
  assert.equal(hintFor('daily_plan', 'What am I most worried about today?'), WORRY_LINE);
  assert.notEqual(hintFor('daily_review', 'What am I most worried about today?'), WORRY_LINE);
  assert.equal(hintFor('daily_plan', 'What would make today a win?'), 'Questions that start with What or How, and look ahead to today, work best.');
});

test('places: 2 a tool, deleted and refused ones free theirs', () => {
  const list = [q('a', 'daily_review', 1), q('b', 'daily_review', 2)];
  assert.equal(freePlace(list, 'daily_review'), null);
  assert.equal(freePlace(list, 'daily_plan'), 1);
  assert.equal(freePlace([q('a', 'daily_review', 1, { deletedAt: 'x' }), q('b', 'daily_review', 2)], 'daily_review'), 1);
  assert.equal(freePlace([q('a', 'daily_review', 1, { refused: 'full' }), q('b', 'daily_review', 2)], 'daily_review'), 1);
  assert.equal(placesLine(0), '0 of 2');
  assert.deepEqual(questionsFor([q('b', 'daily_review', 2), q('a', 'daily_review', 1)], 'daily_review').map((x) => x.id), ['a', 'b']);
});

test('an answer belongs to its day, or its sprint week', () => {
  assert.equal(occasionOf('daily_plan', { date: '2026-11-03' }), '2026-11-03');
  assert.equal(occasionOf('weekly_debrief', { sprintId: 's1', week: 2 }), 's1:2');
  assert.equal(occasionOf('daily_review', { date: 'nope' }), null);
});

test('a day summary shows answered questions only, under the words they were answered with', () => {
  const qs = [q('a', 'daily_review', 1, { wording: 'Where did I lead today?' }), q('r', 'daily_review', 2, { answerType: 'rating', scale: 'often' })];
  const as = [
    { questionId: 'a', tool: 'daily_review', occasion: '2026-11-03', wording: 'Where did I lead rather than manage today?', answerType: 'written', written: 'I let Priya run the call.' },
  ];
  assert.deepEqual(daySummaryRows(qs, as, 'daily_review', '2026-11-03'), [
    { id: 'a', label: 'Where did I lead rather than manage today?', value: 'I let Priya run the call.' },
  ]);
  assert.ok(!answered({ answerType: 'written', written: '   ' }));
  assert.equal(answerWords({ answerType: 'rating', scale: 'often', rating: 4 }), 'Often');
  assert.equal(answerWords({ answerType: 'yes_no', yesNo: false }), 'No');
});

test('the week: a rating as the answer given most, a yes or no as a count, written as Read your answers, working days only', () => {
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  const qs = [
    q('d', 'weekly_debrief', 1, { wording: 'Did I protect my thinking time this week?', answerType: 'yes_no' }),
    q('r', 'daily_review', 2, { wording: 'How often did I listen before I spoke today?', answerType: 'rating', scale: 'often' }),
    q('w', 'daily_review', 1, { wording: 'Where did I lead rather than manage today?' }),
    q('y', 'daily_plan', 1, { wording: 'Did I plan a break?', answerType: 'yes_no' }),
  ];
  const r = (day, rating) => ({ questionId: 'r', tool: 'daily_review', occasion: day, wording: qs[1].wording, answerType: 'rating', scale: 'often', rating });
  const w = (day, text, wording = qs[2].wording) => ({ questionId: 'w', tool: 'daily_review', occasion: day, wording, answerType: 'written', written: text });
  const y = (day, yesNo) => ({ questionId: 'y', tool: 'daily_plan', occasion: day, wording: qs[3].wording, answerType: 'yes_no', yesNo });
  const as = [
    { questionId: 'd', tool: 'weekly_debrief', occasion: 's1:1', wording: qs[0].wording, answerType: 'yes_no', yesNo: true },
    r(days[0], 4), r(days[1], 4), r(days[2], 2), r(days[3], 4),
    r('2026-11-07', 1), // a Saturday: not a working day
    w(days[0], 'One', 'Where did I lead today?'), w(days[1], 'Two'), w(days[2], 'Three'), w(days[4], 'Four'),
    y(days[0], true), y(days[1], false), y(days[2], true),
  ];
  const rows = weekSummaryRows(qs, as, { sprintId: 's1', week: 1, workingDays: days });
  assert.deepEqual(rows.map((x) => [x.label, x.value]), [
    ['Did I protect my thinking time this week?', 'Yes'],
    ['Did I plan a break?', 'Yes on 2 of 5 days.'],
    ['Where did I lead rather than manage today?', 'You answered on 4 of 5 days.'],
    ['How often did I listen before I spoke today?', '“Often” on 3 of 5 days.'],
  ]);
  const written = rows.find((x) => x.kind === 'written');
  assert.equal(written.answers[0].wording, 'Where did I lead today?', 'an old answer keeps the words it was given to');
  assert.deepEqual(weekSummaryRows([], [], { sprintId: 's1', week: 1, workingDays: days }), []);
});

test('the coach’s name always from the data', () => {
  assert.equal(suggestedBy({ coachFirstName: 'Maya' }), 'Suggested by Maya');
  assert.equal(homeSuggestionLine({ coachFirstName: 'Tim' }), 'See the question Tim suggested');
  assert.equal(suggestedBy({}), 'Suggested by your coach');
  const s = [{ id: '2', tool: 'daily_review', status: 'waiting', createdAt: '2' }, { id: '1', tool: 'daily_review', status: 'waiting', createdAt: '1' }, { id: '3', tool: 'daily_review', status: 'not_now', createdAt: '0' }];
  assert.deepEqual(waitingSuggestions(s, 'daily_review').map((x) => x.id), ['1', '2']);
});

test('a damaged device copy still opens', () => {
  assert.deepEqual(tidyState(null), { questions: {}, answers: {}, suggestions: {} });
  const t = tidyState({
    questions: { a: { id: 'a', tool: 'daily_plan', wording: 'x'.repeat(200), answerType: 'rating', scale: 'nonsense', position: 7 }, b: { id: 'c', tool: 'daily_plan' }, __proto__: {} },
    answers: { 'a:2026-11-03': { questionId: 'a', tool: 'daily_plan', occasion: '2026-11-03', answerType: 'rating', rating: 9 } },
  });
  assert.equal(t.questions.a.wording.length, 120);
  assert.equal(t.questions.a.scale, 'often');
  assert.equal(t.questions.a.position, 1);
  assert.equal(t.questions.b, undefined);
  assert.equal(t.answers['a:2026-11-03'].rating, null);
});
