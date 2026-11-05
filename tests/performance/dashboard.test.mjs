// The Individual Performance Dashboard (src/lib/performance/dashboard.js;
// mock-up M4 v47, Phase 5 step 2): every figure checked against the score
// function it comes from (src/lib/scores), the person's settings (order,
// switched-off parts, closed sections), and the empty frames.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allSprintWeeks, dashboardView, moveSection, readDashboardPrefs, storedPrefs, toggleFold, toggleHidden, glance,
} from '../../src/lib/performance/dashboard.js';
import { addDays } from '../../src/lib/scores/dates.js';
import {
  m0Round, m6SprintFigures, m8UsualRange, m10ImprovingAndHoldingBack, m11DebriefStreak, m12SleepHours,
} from '../../src/lib/scores/index.js';
import { SLEEP_TARGET_DEFAULT } from '../../src/lib/performance/sleepChart.js';
import { checkinPoints } from '../../src/lib/performance/checkin.js';

const TODAY = '2026-10-28'; // a Wednesday, week 5 of a sprint starting Mon 28 Sep
const target = { ...SLEEP_TARGET_DEFAULT, own: false };

const sprint = { id: 's2', plan_id: 'p', number: 2, label: null, start_on: '2026-09-28', length_weeks: 8, standard: 85, status: 'running', planned_end_on: '2026-11-22', actual_end_on: null };
const before = { id: 's1', plan_id: 'p', number: 1, label: null, start_on: '2026-08-03', length_weeks: 8, standard: 85, status: 'finished', planned_end_on: '2026-09-27', actual_end_on: '2026-09-27' };
const OLD = [80, 82, 90, 78, 88, 86, 84, 79];
const weekScores = OLD.map((v, i) => ({
  sprint_id: 's1', sprint_week: i + 1, week_end: addDays('2026-08-03', i * 7 + 6), score: v, eligible: true, final: true,
  strategy_scores: [{ id: 'a', served: 2, score: v + 5 }, { id: 'b', served: 1, score: v - 10 }],
}));

const weekDay = (week, i) => addDays(sprint.start_on, (week - 1) * 7 + i); // i: 0 Mon … 6 Sun
const logs = [];
for (let w = 1; w <= 5; w += 1) {
  // Referral conversations: 3 a week, kept up every week.
  for (const i of [0, 1, 2]) if (weekDay(w, i) <= TODAY) logs.push({ sprint_habit_id: 'h1', local_date: weekDay(w, i), value: 1, to_confirm: false });
  // Training: 3 a week in weeks 1 and 2, then once a week.
  const days = w <= 2 ? [0, 1, 2] : [0];
  for (const i of days) if (weekDay(w, i) <= TODAY) logs.push({ sprint_habit_id: 'h2', local_date: weekDay(w, i), value: 1, to_confirm: false });
}
const setting = (id, hid) => ({ id, sprint_habit_id: hid, from_week: 1, measure: 'count', unit: null, target: 3, target_per: 'week', limit_value: null, limit_per: null, direction: null, top_number: null, impact: 2 });

function rows(over = {}) {
  const dayPlans = [];
  for (let i = 0; i < 31; i += 1) {
    const date = addDays(sprint.start_on, i);
    if (date > TODAY) break;
    dayPlans.push({ local_date: date, sleep_hours: i % 3 === 0 ? 6.5 : 7.5, sleep_quality: i % 2 ? 'good' : 'fair', sleep_to_confirm: false, way_of_being: 'Calm under pressure' });
  }
  return {
    plan: { id: 'p' },
    sprint,
    sprints: [before, sprint],
    recoveries: [],
    workingPatterns: [],
    personSettings: { time_zone: 'Europe/London', units: 'metric' },
    weekScores,
    objectives: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
    planObjectives: [
      { id: 'o1', plan_id: 'p', name: 'Coaching clients', kind: 'number', unit: null, direction: 'up', start_value: 20, start_set_on: '2026-01-05', target_value: 38, by_when: '2027-06-30', sort_order: 0 },
      { id: 'o2', plan_id: 'p', name: 'How world-class is my coaching?', kind: 'rating', unit: null, direction: 'up', start_value: 5, start_set_on: '2026-01-05', target_value: 9, by_when: '2027-06-30', sort_order: 1 },
      { id: 'o3', plan_id: 'p', name: 'Publish my coaching book', kind: 'milestone', start_set_on: '2026-01-05', due_on: '2027-06-30', reached_on: null, sort_order: 2 },
    ],
    figures: [
      { id: 'f1', objective_id: 'o1', value: 22, recorded_on: '2026-09-20', created_at: '2026-09-20T09:00:00' },
      { id: 'f2', objective_id: 'o1', value: 31, recorded_on: '2026-10-20', created_at: '2026-10-20T09:00:00' },
      { id: 'f3', objective_id: 'o2', value: 7, recorded_on: '2026-09-01', created_at: '2026-09-01T09:00:00' },
    ],
    strategies: [{ id: 'a', name: 'Grow through referrals', sort_order: 0 }, { id: 'b', name: 'Sustain my energy', sort_order: 1 }],
    links: [{ strategy_id: 'a', objective_id: 'o1' }, { strategy_id: 'a', objective_id: 'o2' }, { strategy_id: 'b', objective_id: 'o2' }],
    debriefs: [],
    sprintHabits: [{ id: 'h1', sprint_id: 's2', strategy_id: 'a', name: 'Referral conversations', sort_order: 0 }, { id: 'h2', sprint_id: 's2', strategy_id: 'b', name: 'Training', sort_order: 1 }],
    sprintSettings: [setting('x1', 'h1'), setting('x2', 'h2')],
    logs,
    todos: [],
    todoMoves: [],
    wins: [
      { id: 'w1', what: 'Landed a referral from a past client', local_date: '2026-10-22', impact: 2 },
      { id: 'w2', what: 'Fixed the booking page', local_date: '2026-10-06', impact: 1 },
    ],
    winLinks: [{ win_id: 'w1', strategy_id: 'a' }],
    dayPlans,
    dayReviews: dayPlans.map((p, i) => ({ local_date: p.local_date, way_of_being_rating: i % 2 ? 8 : 6, status: 'finished' })),
    allDebriefs: [
      ...OLD.map((_, i) => ({ sprint_id: 's1', sprint_week: i + 1, stress: null, status: 'finished' })),
      { sprint_id: 's2', sprint_week: 1, stress: 'a_little', status: 'finished' },
      { sprint_id: 's2', sprint_week: 2, stress: 'moderately', status: 'finished' },
      { sprint_id: 's2', sprint_week: 3, stress: 'not_at_all', status: 'finished' },
      { sprint_id: 's2', sprint_week: 4, stress: 'a_little', status: 'finished' },
    ],
    checkins: [],
    breathingDays: ['2026-10-26T07:30:00Z', '2026-10-27T07:30:00Z', '2026-10-20T07:30:00Z'],
    controlChecks: [],
    lifeChecks: [],
    coach: null,
    checkinShared: true,
    ...over,
  };
}

test('the person’s settings: cleaned, moved, switched off and closed, stored small', () => {
  const s = readDashboardPrefs({});
  assert.deepEqual(s.order, ['chain', 'more']);
  assert.equal(s.hidden.hero, false);
  assert.equal(s.closed.sum, false);
  const odd = readDashboardPrefs({ dashboard: { order: ['more', 'nonsense'], hidden: { sum: true, nope: true }, closed: { chain: 1 } } });
  assert.deepEqual(odd.order, ['more', 'chain']);
  assert.equal(odd.hidden.sum, true);
  assert.equal('nope' in odd.hidden, false);
  assert.equal(odd.closed.chain, true);
  assert.deepEqual(moveSection(s, 'more', -1).order, ['more', 'chain']);
  assert.deepEqual(moveSection(s, 'chain', -1).order, ['chain', 'more']); // already first
  const closed = toggleFold(toggleFold(s, 'obj'), 'chain');
  assert.equal(closed.closed.chain, true);
  assert.equal(closed.closed.obj, true);
  // Opening Objectives and Strategies again opens its two groups (M4).
  assert.equal(toggleFold(closed, 'chain').closed.obj, false);
  assert.deepEqual(storedPrefs(toggleHidden(s, 'hero')), { order: ['chain', 'more'], hidden: { hero: true }, closed: {} });
});

test('glance figures: +5, −3, ±0 (M6, M0.1)', () => {
  assert.equal(glance(5), '+5');
  assert.equal(glance(-3), '−3');
  assert.equal(glance(0), '±0');
  assert.equal(glance(null), null);
});

test('the weeks across sprints: the earlier sprint frozen, this one live, weeks to come after this one', () => {
  const w = allSprintWeeks(rows(), TODAY);
  assert.equal(w.length, 16);
  assert.deepEqual(w.slice(0, 8).map((x) => x.raw), OLD);
  assert.equal(w[0].strategies.get('a'), 85);
  assert.deepEqual(w.slice(8).map((x) => (x.future ? 'next' : x.now ? 'now' : 'done')), ['done', 'done', 'done', 'done', 'now', 'next', 'next', 'next']);
});

test('the top: the sprint’s score (M6), its change since the last sprint, the line against the standard and the usual range (M8)', () => {
  const d = rows();
  const v = dashboardView(d, { today: TODAY, target });
  const w = allSprintWeeks(d, TODAY);
  const mine = w.filter((x) => x.sprintId === 's2');
  const prev = m6SprintFigures(w.filter((x) => x.sprintId === 's1').map((x) => ({ number: x.number, score: x.raw, finished: x.finished })), 85).average;
  const f = m6SprintFigures(mine.map((x) => ({ number: x.number, score: x.raw, finished: x.finished })), 85, prev);
  assert.equal(v.hero.value, `${m0Round(f.average)}%`);
  assert.equal(v.hero.change.text, glance(f.change));
  assert.equal(v.hero.good, m0Round(f.average) >= 85);
  assert.equal(v.state, 'running');
  const usual = m8UsualRange(w.filter((x) => x.finished && x.eligible).map((x) => x.raw));
  assert.deepEqual([v.hero.chart.band.low, v.hero.chart.band.high], [usual.low, usual.high]);
  assert.equal(v.hero.usualLine, null); // the band says it once there is a range
  assert.equal(v.hero.chart.bars.length, 16);
  assert.equal(v.hero.chart.bars[0].sprintLabel, 'Sprint 1');
  assert.equal(v.hero.chart.bars[8].sprintLabel, 'Sprint 2');
  assert.equal(v.hero.chart.bars[12].state, 'now');
  assert.equal(v.hero.chart.bars[13].tip.value, 'To come');
  assert.equal(v.hero.chart.bars.filter((b) => b.best).length, 1);
});

test('this week’s logging line (M11): working days so far', () => {
  const v = dashboardView(rows(), { today: TODAY, target });
  // Mon to Wed so far; logs on Mon to Wed for Referral conversations.
  assert.equal(v.logging, 'You’ve logged every working day so far this week.');
  const fewer = dashboardView(rows({ logs: logs.filter((l) => l.local_date !== '2026-10-27') }), { today: TODAY, target });
  assert.equal(fewer.logging, 'You logged on 2 of your 3 working days so far this week.');
});

test('what’s improving and what’s holding you back come from M10, in its order, each holding-back item with its fix', () => {
  const v = dashboardView(rows(), { today: TODAY, target });
  const kinds = (l) => l.map((x) => x.kind);
  assert.deepEqual(kinds(v.current.improving), ['objective_improving', 'strategy_at_standard', 'habit_kept_up']);
  assert.equal(v.current.improving[0].big.text, '+9');
  assert.equal(v.current.holdingBack[0].kind, 'strategy_below');
  assert.equal(v.current.holdingBack[0].title, 'Sustain my energy');
  assert.deepEqual(v.current.holdingBack[0].fix, { label: 'Plan it into this week', to: '/performance-sprint', state: { addTodoFor: 'b' } });
  const notMoving = v.current.holdingBack.find((x) => x.kind === 'objective_not_moving');
  assert.equal(notMoving.line, 'Your rating is still 7/10 this sprint, while the work behind it is on track.');
  assert.equal(notMoving.fix.label, 'Review its Strategies');
  assert.equal(v.current.lead, 'This is week 5 of 8 of Sprint 2.');
  assert.equal(v.current.closedLine, `3 things are improving and ${v.current.holdingBack.length} are holding you back.`);
  // The same lists as M10 itself gives, from the finished weeks.
  const w = allSprintWeeks(rows(), TODAY).filter((x) => x.sprintId === 's2' && x.finished);
  const direct = m10ImprovingAndHoldingBack({
    standard: 85,
    objectives: [],
    strategies: ['a', 'b'].map((id) => ({ id, name: id, weeks: w.map((x) => ({ score: x.strategies.get(id) })) })),
    habits: [],
  });
  assert.deepEqual(direct.holdingBack.map((x) => x.id), ['b']);
});

test('empty lists say so plainly', () => {
  const quiet = rows({ logs: [], wins: [], figures: [], dayPlans: [] });
  const v = dashboardView(quiet, { today: '2026-09-30', target });
  assert.deepEqual(v.current.improving, []);
  assert.equal(v.current.improvingEmpty, 'Nothing has improved yet. Results often lag effort by a few weeks.');
  assert.equal(v.current.holdingBackEmpty, 'Nothing is holding you back this sprint.');
  assert.equal(v.hero.value, 'Not yet');
  assert.deepEqual(v.hero.lines, ['Your first week isn’t finished yet.']);
});

test('Outcome Objectives: progress, pace, effort, the change this sprint and the milestone (M9)', () => {
  const v = dashboardView(rows(), { today: TODAY, target });
  const [o1, o2, o3] = v.chain.objectives.rows;
  assert.equal(o1.value, '31');
  assert.equal(o1.of, 'of 38');
  assert.equal(o1.label, 'Up 9 this sprint');
  assert.equal(o1.line, 'You’re on pace to reach 38 by 30 Jun 2027.');
  assert.equal(o1.effortLine, 'The work behind it is on track.');
  assert.ok(Math.abs(o1.bar.value - 31 / 38) < 1e-9);
  assert.equal(o2.label, 'Steady this sprint');
  assert.equal(o2.of, 'Target 9/10');
  assert.equal(o3.line, 'You haven’t reached this milestone yet.');
  assert.equal(o3.value, '8 months');
  assert.equal(o3.of, 'left');
  assert.equal(o3.label, 'Due 30 Jun 2027');
  assert.equal(v.chain.objectives.summary, '1 of 2 are improving this sprint, and the milestone is due by 30 Jun 2027, 8 months left.');
});

test('Strategies: the strip for the span, the latest figure, last week at the standard', () => {
  const v = dashboardView(rows(), { today: TODAY, target });
  const [a, b] = v.chain.strategies.rows;
  assert.equal(a.strip.length, 8);
  assert.deepEqual(a.serves.map((s) => s.number), [1, 2]);
  assert.equal(a.latest.now, true);
  assert.equal(a.latestLabel, 'This week so far');
  assert.equal(b.strip[3].state, 'below');
  assert.equal(v.chain.strategies.summary, '1 of 2 were at your standard last week.');
  const all = dashboardView(rows(), { today: TODAY, target, span: 'all' });
  assert.equal(all.chain.strategies.rows[0].strip.length, 13); // 8 finished, 4 finished and this week
  assert.equal(all.chain.spanLine, 'This section shows all time.');
  const three = dashboardView(rows(), { today: TODAY, target, span: '3m' });
  assert.equal(three.chain.strategies.rows[0].strip.length, 13);
});

test('what’s behind: wins, streaks, sleep (Recovery’s chart and range), stress and the way of being, each from its section', () => {
  const v = dashboardView(rows(), { today: TODAY, target });
  const by = Object.fromEntries(v.behind.rows.map((r) => [r.key, r]));
  assert.deepEqual(v.behind.rows.map((r) => r.key), ['wins', 'rhythm', 'check', 'lbr', 'be', 'sleep', 'stress']);
  assert.equal(by.wins.line, 'You added 2 unplanned wins this sprint, the latest “Landed a referral from a past client”.');
  assert.deepEqual(by.wins.items[0].served, ['Grow through referrals']);
  // M11: four finished weeks of this sprint debriefed, and all of Sprint 1.
  assert.equal(m11DebriefStreak([{ debriefDone: true }]), 1);
  assert.equal(by.rhythm.figure.text, '12');
  assert.match(by.rhythm.line, /^You’ve done your debrief 12 weeks in a row, and used Breathe (twice|2 times) this week\.$/);
  // M12 sleep over the sprint's nights so far.
  const nights = rows().dayPlans.map((p) => ({ value: p.sleep_hours }));
  assert.equal(by.sleep.figure.text, String(m12SleepHours(nights).shown));
  assert.equal(by.sleep.slots.length, 56);
  assert.equal(by.sleep.slots.find((s) => s.last).axis, 'Last night');
  // Last night (day 31) was 6.5 hours, under the suggested 7 to 9.
  assert.deepEqual(by.sleep.action.lines, ['Last night was under your target range.', 'Tonight, Sleep wind down could help.']);
  assert.equal(by.stress.line, 'You answered “Not at all” or “A little” in 3 of 4 weeks this sprint.');
  assert.equal(by.stress.dots[1].good, false);
  assert.equal(by.be.figure.text, '7');
  assert.equal(by.be.line, 'You rated it 7/10 on average this sprint.');
  assert.equal(by.check.line, 'You haven’t done a check-in yet.');
  assert.equal(by.lbr.line, 'You haven’t done a life balance review yet.');
  // No tool writes the emotional control checks yet: the row waits for the first one.
  assert.equal(by.line, undefined);
  // Patterns appear only once a pattern exists (Step 3 fills the slot).
  assert.equal(by.pat, undefined);
  const withPattern = dashboardView(rows(), { today: TODAY, target, patterns: [{ key: 'x' }] });
  assert.equal(withPattern.behind.rows[2].key, 'pat');
  assert.equal(withPattern.behind.closedLine, 'Your wins, streaks, 1 pattern and more.');
});

test('a new person with no sprint: empty frames, each with its start line', () => {
  const v = dashboardView({ plan: null, sprint: null, sprints: [], recoveries: [], weekScores: [], planObjectives: [], strategies: [], links: [] }, { today: TODAY, target });
  assert.equal(v.state, 'none');
  assert.equal(v.hero.value, 'Not yet');
  assert.deepEqual(v.hero.lines, ['Your score starts with your first Performance Sprint.']);
  assert.equal(v.current, null);
  assert.deepEqual(v.behind.rows.map((r) => r.line), [
    'You haven’t added an unplanned win this sprint.',
    'Your streaks start with your first Performance Sprint.',
    'You haven’t done a check-in yet.',
    'You haven’t done a life balance review yet.',
    'You haven’t rated it yet.',
    'You haven’t logged sleep yet.',
    'This starts after your first weekly debrief.',
  ]);
});

test('Recovery hides the scores until Show my results', () => {
  const rec = rows({ recoveries: [{ id: 'r', sprint_id: 's2', start_on: '2026-10-27', chosen_days: 7, extended_days: 0, ended_at: null }] });
  assert.equal(dashboardView(rec, { today: TODAY, target }).hidden, true);
  assert.equal(dashboardView(rec, { today: TODAY, target, showResults: true }).hidden, false);
  assert.equal(dashboardView(rec, { today: TODAY, target }).state, 'paused');
});

test('the check-in card: the latest scores and their change (M13 through checkin.js)', () => {
  const A = { H1: 'h7_8', H2: 'good', H3: 'sometimes', H4: 'h1_2_5', H5: 'd1', H6: 'h8_10', H7: 'good', H8: 'u8_14', H9: 'never', H10: 'ok', H11: 'high', H12: 'good', H13: 'a_little', H14: 'no', S1: 'sometimes', S2: 'often', S3: 'sometimes', S4: 'often', S5: 'often', S6: 'sometimes' };
  const B = { ...A, H3: 'rarely', H4: 'h2_5_plus', S1: 'often' };
  const cks = [
    { id: 'c1', kind: 'monthly', month: '2026-09-01', status: 'finished', answers: A },
    { id: 'c2', kind: 'monthly', month: '2026-10-01', status: 'finished', answers: B },
  ];
  const points = checkinPoints(cks);
  const [p0, p1] = points;
  const v = dashboardView(rows({ checkins: cks }), { today: TODAY, target });
  const check = v.behind.rows.find((r) => r.key === 'check');
  const move = (a, b) => (a > b ? `, up ${a - b}` : a < b ? `, down ${b - a}` : ', the same as last time');
  assert.equal(check.line, `Your Hardware score is ${p1.hardware}/100${move(p1.hardware, p0.hardware)}, and Software ${p1.software}/100${move(p1.software, p0.software)}.`);
  assert.ok(p1.hardware > p0.hardware);
  assert.equal(check.figure.text, `${p1.hardware}/${p1.software}`);
  assert.equal(check.points.length, 2);
  const one = dashboardView(rows({ checkins: [cks[1]] }), { today: TODAY, target }).behind.rows.find((r) => r.key === 'check');
  assert.equal(one.line, `Your first check-in scored Hardware ${p1.hardware}/100 and Software ${p1.software}/100.`);
});

test('the life balance review: the average and its move over the review’s 6 months (M20.2)', () => {
  const areas = [{ key: 'health' }, { key: 'work' }];
  const life = [
    { id: 'l1', checkin_at: '2026-09-04 08:00:00', checkin_date: '2026-09-04', scores: { health: 5, work: 8 }, areas },
    { id: 'l2', checkin_at: '2026-10-03 08:00:00', checkin_date: '2026-10-03', scores: { health: 7, work: 8 }, areas },
  ];
  const v = dashboardView(rows({ lifeChecks: life }), { today: TODAY, target });
  const lbr = v.behind.rows.find((r) => r.key === 'lbr');
  assert.equal(lbr.line, 'Your life balance average is 7.5, up 1.0 since 4 Sep.');
  assert.equal(lbr.stats.biggestRise.change, 2);
});

test('sleep inside the target range says keep going, and an unanswered last night names the latest night', () => {
  const d = rows();
  d.dayPlans = d.dayPlans.map((p) => (p.local_date === TODAY ? { ...p, sleep_hours: 8 } : p));
  const sleep = dashboardView(d, { today: TODAY, target }).behind.rows.find((r) => r.key === 'sleep');
  assert.deepEqual(sleep.action.lines, ['Last night was inside your target range.', 'Keep doing what’s working.']);
  assert.equal(sleep.action.windDown, false);
  const own = dashboardView(d, { today: TODAY, target: { from: 8.5, to: 10, own: true } }).behind.rows.find((r) => r.key === 'sleep');
  assert.equal(own.action.windDown, true);
  d.dayPlans = d.dayPlans.filter((p) => p.local_date !== TODAY);
  const latest = dashboardView(d, { today: TODAY, target }).behind.rows.find((r) => r.key === 'sleep');
  assert.equal(latest.action.lines[0], 'Your latest night was inside your target range.');
});
