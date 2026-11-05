// The Hardware and Software check-in (src/lib/performance/checkin.js,
// mock-up M12 v14, methods M13): the questions and their stored answers,
// the results (with the methods' worked example M13-1), what improved,
// one thing to work on, the graph's points, the month's name, when it's
// due, Home's lines and the saved items. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUESTIONS,
  TIPS,
  SUGGESTED,
  answeredShare,
  changeLine,
  checkinDue,
  checkinKind,
  checkinMonth,
  checkinPath,
  checkinPoints,
  checkinPrompt,
  checkinResults,
  checkinTitle,
  cleanAnswers,
  cleanGoals,
  finishToastWords,
  goalQuestions,
  homeSuggestion,
  longHaulTrips,
  monthFromParam,
  noSprintLine,
  previousCheckin,
  questionsFor,
  quietLines,
  tripsWords,
  whoSeesLines,
  whyLines,
} from '../../src/lib/performance/index.js';
import { m13Points } from '../../src/lib/scores/index.js';
import { reviewRows } from '../../src/lib/savedItems.js';

// Methods M13, test case M13-1.
const M13_1 = { H1: 'h7_8', H2: 'good', H3: 'sometimes', H4: 'h1_2_5', H5: 'd1', H6: 'h8_10', H7: 'good', H8: 'u8_14', H9: 'never', H10: 'ok', H11: 'high', H12: 'good', H13: 'a_little' };
const SOFT = { S1: 'often', S2: 'sometimes', S3: 'always', S4: 'often', S5: 'rarely', S6: 'never' };
const TODAY = '2026-10-23';

test('every answer is one the scoring library and 029 take, and the questions follow M12', () => {
  for (const q of QUESTIONS) {
    for (const o of q.options) {
      if (/^H1[4-6]$/.test(q.code)) assert.equal(m13Points(q.code, o.value), null, `${q.code} is context, not scored`);
      else assert.equal(typeof m13Points(q.code, o.value), 'number', `${q.code} ${o.value}`);
    }
  }
  assert.equal(QUESTIONS.length, 22);
  // Past-month questions say "on average" (Tim, 22 Oct); sitting and travel aren't past-month averages.
  for (const q of QUESTIONS.filter((x) => x.question.startsWith('In the past month'))) assert.match(q.question, /^In the past month, on average, /);
  assert.equal(QUESTIONS.find((q) => q.code === 'H6').question, 'On a typical workday, how many hours do you spend sitting?');
  // Sleep quality uses the portal's five words, Fair stored as 'ok' (part 4, 3 Nov).
  assert.deepEqual(QUESTIONS.find((q) => q.code === 'H2').options.map((o) => o.label), ['Very poor', 'Poor', 'Fair', 'Good', 'Very good']);
  assert.equal(QUESTIONS.find((q) => q.code === 'H2').options[2].value, 'ok');
  // The nudges the decisions approved.
  assert.equal(QUESTIONS.find((q) => q.code === 'H4').nudges[0], 'Count anything that gets you breathing harder, like a run, a spin or high-intensity class, a hike or sport.');
  assert.equal(QUESTIONS.find((q) => q.code === 'H5').nudges[0], 'Count weights, resistance bands or bodyweight training.');
  // Software: the task first, then the statement (writing rule 51).
  const s1 = QUESTIONS.find((q) => q.code === 'S1');
  assert.equal(s1.question, 'In the past month, on average, how often was this true?');
  assert.equal(s1.statement, 'When things went wrong, I bounced back quickly.');
});

test('the travel pair is asked only after a Yes, and dropped again after a No', () => {
  assert.equal(questionsFor({}).length, 20);
  assert.equal(questionsFor({ H14: 'yes' }).length, 22);
  assert.deepEqual(cleanAnswers({ H14: 'no', H15: '2', H16: 'well', H1: 'h7_8' }), { H14: 'no', H1: 'h7_8' });
  assert.deepEqual(cleanAnswers({ H14: 'yes', H15: '2', H1: 'nonsense', X: 'y' }), { H14: 'yes', H15: '2' });
  assert.equal(longHaulTrips({ H14: 'yes', H15: '2' }), 2);
  assert.equal(longHaulTrips({ H14: 'no', H15: '2' }), 0);
  assert.equal(tripsWords(1), '1 long-haul trip');
  assert.equal(tripsWords(4), '4 or more long-haul trips');
});

test('M13-1 on the results screen: Hardware 68/100, one thing to work on is Movement', () => {
  const r = checkinResults({ answers: { ...M13_1, ...SOFT } });
  assert.equal(r.hardware.value, 68);
  assert.equal(r.software.value, 54); // (75 + 50 + 100 + 75 + 25 + 0) ÷ 6 = 54.17
  assert.equal(r.hardware.change, null);
  assert.equal(r.compared, false);
  assert.equal(r.workOn.name, 'Movement');
  assert.deepEqual(r.workOn.tip, TIPS.movement);
  assert.equal(r.workOn.tip[0], 'Three 30-minute training sessions a week');
  assert.equal(r.hardwareAreas.lowest, 'Lowest: Movement 45/100');
  assert.equal(r.softwareAreas.lowest, 'Lowest: Conflict 0/100');
  assert.deepEqual(r.hardwareAreas.rows.map((x) => [x.name, x.value]), [['Sleep', 88], ['Movement', 45], ['Fuel and alcohol', 85], ['Stress', 50], ['Mood and energy', 63], ['Health', 75]]);
});

test('against last month: the change from the rounded figures, what rose, biggest first, at most three', () => {
  const before = { month: '2026-09-01', status: 'finished', answers: { ...M13_1, ...SOFT, H3: 'often', H10: 'low', H12: 'poor', S5: 'never' } };
  const r = checkinResults({ answers: { ...M13_1, ...SOFT }, previous: before });
  assert.equal(r.compared, true);
  assert.equal(r.hardware.change.text, 'Your score is up 11 from 57 last month.');
  assert.equal(r.hardware.change.up, 'up 11');
  assert.equal(r.software.change.text, 'Your score is up 4 from 50 last month.');
  // Stress +25, Health +25, Communication +25, Mood and energy +12.5: three, the tie in M13's order.
  assert.deepEqual(r.improved.map((x) => x.name), ['Stress', 'Health', 'Communication']);
  assert.equal(r.improved[0].line, 'Stress rose since last month.');
  assert.equal(r.improvedEmpty, null);
  const same = checkinResults({ answers: M13_1, previous: { answers: M13_1 } });
  assert.equal(same.hardware.change.text, 'Your score is the same as last month.');
  assert.equal(same.improvedEmpty, 'Everything held steady this month.');
  const down = checkinResults({ answers: { ...M13_1, H3: 'always' }, previous: { answers: M13_1 } });
  assert.equal(down.hardware.change.text, 'Your score is down 9 from 68 last month.');
  assert.equal(down.improvedEmpty, 'No area rose since last month.');
  assert.deepEqual(changeLine(-3, 52), { lead: 'Your score is down 3 from 52 last month.', up: null, rest: '', text: 'Your score is down 3 from 52 last month.' });
});

test('one thing to work on: the lowest Hardware area, ties in M13 order, with a suggestion for each', () => {
  for (const key of Object.keys(TIPS)) assert.ok(SUGGESTED[key], key);
  const tie = checkinResults({ answers: { H1: 'h5_6', H2: 'poor', H3: 'often' } }); // Sleep 32.5 and Stress 25
  assert.equal(tie.workOn.name, 'Stress');
  const health = checkinResults({ answers: { ...M13_1, H12: 'very_poor', H13: 'very_much' } });
  assert.equal(health.workOn.key, 'health');
  assert.equal(health.workOn.suggestion.as, 'todo');
  assert.equal(noSprintLine({ kind: 'first', coachName: 'Tim' }), 'Add it when you build your plan with Tim.');
});

test('a check-in is named in words and belongs to its month', () => {
  assert.equal(checkinMonth(TODAY), '2026-10-01');
  assert.equal(checkinTitle({ kind: 'monthly', month: '2026-10-01' }), 'October check-in');
  assert.equal(checkinTitle({ kind: 'first', month: '2026-10-01' }), 'First check-in');
  assert.equal(checkinPath('2026-10-01'), '/check-in/2026-10');
  assert.equal(monthFromParam('2026-10'), '2026-10-01');
  assert.equal(monthFromParam('2026-13'), null);
  assert.equal(monthFromParam('x'), null);
});

test('who does which check-in, when it is due and what last month is', () => {
  const sep = { month: '2026-09-01', kind: 'first', status: 'finished', answers: M13_1 };
  assert.equal(checkinKind({ hasCoach: true, checkins: [], month: '2026-10-01' }), 'first');
  assert.equal(checkinKind({ hasCoach: false, checkins: [], month: '2026-10-01' }), 'monthly');
  assert.equal(checkinKind({ hasCoach: true, checkins: [sep], month: '2026-10-01' }), 'monthly');
  assert.equal(checkinKind({ hasCoach: true, checkins: [{ month: '2026-10-01', kind: 'first', status: 'draft' }], month: '2026-10-01' }), 'first');
  assert.equal(checkinDue({ checkins: [sep], month: '2026-10-01' }), true);
  assert.equal(checkinDue({ checkins: [{ ...sep, month: '2026-10-01' }], month: '2026-10-01' }), false);
  assert.equal(previousCheckin([sep, { month: '2026-08-01', status: 'finished' }, { month: '2026-10-01', status: 'finished' }], '2026-10-01').month, '2026-09-01');
  assert.equal(previousCheckin([{ month: '2026-09-01', status: 'draft' }], '2026-10-01'), null);
});

test('Home: the First check-in card for a new coaching client, then the monthly line while due', () => {
  const draft = { month: '2026-10-01', kind: 'first', status: 'draft', answers: Object.fromEntries(Object.entries(M13_1).slice(0, 10)) };
  assert.ok(Math.abs(answeredShare(draft.answers) - 0.5) < 0.01);
  const first = checkinPrompt({ hasCoach: true, coachName: 'Tim', checkins: [draft], today: TODAY });
  assert.equal(first.question, 'Ready to finish your first check-in?');
  assert.deepEqual(first.lines, ['You’re about halfway through.', 'It helps Tim get the most from your first session.']);
  assert.equal(first.time, '~3 minutes');
  assert.equal(first.action.label, 'Finish my first check-in');
  const card = homeSuggestion({ today: TODAY, hour: 9, person: 'new', hasCoach: true, firstCheckin: first });
  assert.equal(card.question, 'Ready to finish your first check-in?');
  assert.equal(card.action.to, '/check-in');
  // Not as a quiet line too while it's the card.
  assert.equal(quietLines({ person: 'new', hasCoach: true, checkin: first }).length, 0);
  // Someone already running a sprint gets it on the one card in its turn, never as a quiet line (Tim, 5 Nov).
  assert.equal(quietLines({ person: 'sprint', hasCoach: true, checkin: first }).length, 0);
  assert.equal(homeSuggestion({ today: TODAY, hour: 13, person: 'sprint', sprintView: { state: 'running', current: 3, lengthWeeks: 8 }, checkin: first }).question, 'Ready to finish your first check-in?');
  // Nothing started yet.
  assert.equal(checkinPrompt({ hasCoach: true, coachName: 'Tim', checkins: [], today: TODAY }).action.label, 'Start my first check-in');

  const monthly = checkinPrompt({ hasCoach: false, coachName: null, checkins: [{ month: '2026-09-01', kind: 'monthly', status: 'finished' }], today: TODAY });
  assert.deepEqual([monthly.question, monthly.action.label, monthly.time], ['Ready for your monthly check-in?', 'Start my check-in', '~3 minutes']);
  const lines = quietLines({ person: 'new', hasCoach: false, mission: null, joinedDaysAgo: 20, checkin: monthly });
  assert.deepEqual(lines.map((q) => q.key), ['mission']); // the check-in waits for the card
  assert.equal(monthly.time, '~3 minutes');
  // Gone once done.
  assert.equal(checkinPrompt({ hasCoach: false, checkins: [{ month: '2026-10-01', kind: 'monthly', status: 'finished' }], today: TODAY }), null);
  assert.equal(quietLines({ person: 'sprint', hasCoach: false, checkin: null }).length, 0);
  // A half-done monthly one.
  assert.equal(checkinPrompt({ hasCoach: false, checkins: [{ month: '2026-10-01', kind: 'monthly', status: 'draft', answers: {} }], today: TODAY }).action.label, 'Finish my check-in');
});

test('the graph: every finished month, and this month in its place, oldest first', () => {
  const rows = [
    { month: '2026-09-01', status: 'finished', answers: { ...M13_1, H3: 'often' } },
    { month: '2026-08-01', status: 'finished', answers: { ...M13_1, H14: 'yes', H15: '3' } },
    { month: '2026-07-01', status: 'draft', answers: M13_1 },
  ];
  const p = checkinPoints(rows, { month: '2026-10-01', answers: { ...M13_1, ...SOFT } });
  assert.deepEqual(p.map((x) => [x.axis, x.hardware, x.software, x.trips]), [['Aug', 68, null, 3], ['Sep', 63, null, 0], ['Oct', 68, 54, 0]]);
  assert.equal(p[0].when, 'August 2026');
});

test('the goals, the toasts and the words around them', () => {
  const g = goalQuestions('Adie');
  assert.equal(g.length, 5);
  assert.equal(g[4].nudges[0], 'Add anything else Adie should know about you.');
  assert.ok(g[0].example.ceo && g[0].example.coach && g[0].example.leader);
  assert.deepEqual(cleanGoals({ G1: 'Lead well', G3: ['A', '', 'C', 'D'], G9: 'x', G2: '  ' }), { G1: 'Lead well', G3: ['A', '', 'C'] });
  assert.equal(finishToastWords({ kind: 'first', coachName: 'Tim', sharing: true }), 'Saved. Tim will see this before your first session.');
  assert.equal(finishToastWords({ kind: 'monthly', coachName: 'Tim', sharing: true }), 'Saved. Your coach can see it before your next session.');
  assert.equal(finishToastWords({ kind: 'monthly', coachName: 'Tim', sharing: false }), 'Saved. Your next check-in is in a month.');
  assert.equal(whoSeesLines({ coachName: 'Tim', sharing: true })[2], 'You can switch off Tim’s view any time in My Account.');
  assert.deepEqual(whoSeesLines({ coachName: null }), ['Only you see your answers.', 'Your organisation never sees them.']);
  // Every ⓘ starts by saying what the thing is, and names the coach only when there is one.
  assert.match(whyLines('alcohol', 'Tim')[0], /^Alcohol counts in Fuel and alcohol/);
  assert.equal(whyLines('mood', null)[2], 'It’s here to help you, never to judge.');
  assert.equal(whyLines('health', 'Tim')[2], 'Tim uses this to help, never to judge.');
});

test('My Reviews: finished check-ins named in words, and only this month’s draft', () => {
  const rows = reviewRows({
    hsCheckins: [
      { id: 'a', kind: 'first', month: '2026-09-01', status: 'finished', finished_at: '2026-09-12 08:00:00' },
      { id: 'b', kind: 'monthly', month: '2026-10-01', status: 'draft', updated_at: '2026-10-22 08:00:00' },
      { id: 'c', kind: 'monthly', month: '2026-08-01', status: 'draft', updated_at: '2026-08-02 08:00:00' },
    ],
  }, TODAY);
  assert.deepEqual(rows.map((r) => [r.title, r.typeLabel, r.isDraft, r.to.path]), [
    ['First check-in', 'Hardware and Software check-in', false, '/check-in/2026-09'],
    ['October check-in', 'Hardware and Software check-in', true, '/check-in'],
  ]);
  assert.equal(rows[0].area, 'personal');
});
