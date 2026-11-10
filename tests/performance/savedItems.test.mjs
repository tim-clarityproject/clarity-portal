// My Plans and My Reviews (src/lib/savedItems.js, Phase 4 step 4): every
// saved item named in words with its tool and its date on the right
// (writing rule 60), the area it belongs to, the hubs' recent rows and the
// Health Check's teams. Fixed days only. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayName, healthCheckTeams, listFilters, planRows, recentRows, reviewRows } from '../../src/lib/savedItems.js';
import { formatSavedDate } from '../../src/lib/dateFormatter.js';

const TODAY = '2026-10-21'; // a Wednesday

test('dates on the right: Today, Yesterday, then the day, with the year only when it differs', () => {
  assert.equal(formatSavedDate('2026-10-21', TODAY), 'Today');
  assert.equal(formatSavedDate('2026-10-20', TODAY), 'Yesterday');
  assert.equal(formatSavedDate('2026-10-19', TODAY), 'Mon 19 Oct');
  assert.equal(formatSavedDate('2025-10-03', TODAY), 'Fri 3 Oct 2025');
  assert.equal(formatSavedDate('2026-11-01', '2026-11-02'), 'Yesterday'); // across a month
});

test('day plans and reviews: Today’s, Yesterday’s, then Day plan or Day review', () => {
  assert.equal(dayName(TODAY, TODAY, 'plan'), 'Today’s plan');
  assert.equal(dayName('2026-10-20', TODAY, 'review'), 'Yesterday’s review');
  assert.equal(dayName('2026-10-12', TODAY, 'plan'), 'Daily plan');
  assert.equal(dayName('2026-10-12', TODAY, 'review'), 'Daily review');
});

const at = (day, time = '09:00:00') => `${day}T${time}`;

const PLANS = {
  decisions: [
    { id: 'd1', tool_type: 'daily_plan', title: 'Friday 2nd Oct, 2026', created_at: at('2026-10-20') },
    { id: 'd2', tool_type: 'plan_meeting', title: 'Harbour introduction call', created_at: at('2026-10-14') },
    { id: 'd3', tool_type: 'grow', title: 'Referral pipeline', created_at: at('2026-10-19'), status: 'draft' },
    { id: 'd4', tool_type: 'inversion', title: 'Harbour proposal', created_at: at('2026-10-15') },
    { id: 'd5', tool_type: 'strategic-alignment', title: 'Leadership team', created_at: at('2026-09-01') },
    { id: 'd6', tool_type: 'strategic-alignment', title: 'Leadership team', created_at: at('2026-10-12') },
    { id: 'd7', tool_type: 'strategic-alignment', title: 'Product team', created_at: at('2026-09-02') },
    { id: 'd8', tool_type: 'tough-conversation', title: 'Late reports', created_at: at('2026-10-10') },
  ],
  planReviews: [{ id: 'r1', status: 'final', data: { planKind: 'plan_meeting', planId: 'd2' } }],
  plans: [{ id: 'p1', status: 'active', major: 3, minor: 2, updated_at: at('2026-10-05') }],
  sprints: [{ id: 's1', number: 1, label: null, start_on: '2026-09-28', status: 'running' }],
  dayPlans: [
    { id: 'dp1', local_date: TODAY, status: 'finished' },
    { id: 'dp2', local_date: '2026-10-18', status: 'draft', way_of_being: 'Calm' },
    { id: 'dp3', local_date: '2026-10-17', status: 'draft' }, // sleep only: not a plan
  ],
  missions: [{ id: 'm1', title: 'Grow the studio', updated_at: at('2026-06-01'), archived_at: at('2026-09-01') }],
};

test('My Plans: every type, named in words, with its tool, area and date', () => {
  const rows = planRows(PLANS, TODAY);
  const by = (id) => rows.find((r) => r.id === id);
  assert.equal(by('decision:d1').title, 'Yesterday’s plan', 'an old day plan is never named by its date');
  assert.equal(by('decision:d1').typeLabel, 'Daily plan');
  assert.equal(by('decision:d2').area, 'interpersonal');
  assert.equal(by('decision:d2').reviewed, true);
  assert.equal(by('decision:d3').isDraft, true);
  assert.equal(by('decision:d4').to.path, '/pre-mortem/summary');
  assert.equal(by('decision:d6').version, 'Version 2');
  assert.equal(by('decision:d6').area, 'strategic');
  assert.equal(by('decision:d8').typeLabel, 'Give difficult feedback');
  assert.equal(by('plan:p1').title, 'Version 3.2');
  assert.equal(by('sprint:s1').title, 'Performance Sprint 1');
  assert.equal(by('sprint:s1').to.path, '/performance-sprint');
  assert.equal(by('day-plan:dp1').title, 'Today’s plan');
  assert.equal(by('day-plan:dp1').dateLabel, 'Today');
  assert.equal(by('day-plan:dp2').isDraft, true);
  assert.equal(by('day-plan:dp2').edit.path, '/daily-plan/2026-10-18');
  assert.equal(by('day-plan:dp3'), undefined);
  assert.equal(by('pop:m1').to.path, '/personal-operating-plan-archived/m1');
  for (const r of rows) {
    assert.ok(r.title && !/^\d|^(mon|tue|wed|thu|fri|sat|sun)/i.test(r.title), `${r.id} is named in words: ${r.title}`);
    assert.ok(r.typeLabel && r.dateLabel, `${r.id} has its tool and date`);
  }
});

test('My Plans: the area filter, the tool and team choices, the recent rows and the teams', () => {
  const rows = planRows(PLANS, TODAY);
  const { filters, subFilters, subLabels } = listFilters(rows);
  assert.deepEqual(filters.map((f) => f.id), ['personal', 'interpersonal', 'strategic']);
  assert.equal(subLabels.strategic, 'Which team?');
  assert.deepEqual(subFilters.strategic.map((f) => f.label), ['Leadership team', 'Product team']);
  assert.equal(subLabels.personal, 'Which tool?');
  const recent = recentRows(rows, 'personal');
  assert.deepEqual(recent.map((r) => r.title), ['Today’s plan', 'Yesterday’s plan', 'Harbour proposal'], 'no drafts, no plan or sprint rows');
  assert.deepEqual(healthCheckTeams(rows, TODAY), [
    { team: 'Leadership team', line: '2 versions, latest Mon 12 Oct' },
    { team: 'Product team', line: '1 version, Wed 2 Sep' },
  ]);
});

const REVIEWS = {
  entries: [
    { id: 'e1', review_type: 'plan-review', title: 'Tuesday 20th October', content: JSON.stringify({ planKind: 'daily_plan', planId: 'x', dateKey: '2026-10-20' }), created_at: at('2026-10-20', '19:00:00') },
    { id: 'e2', review_type: 'plan-review', title: 'Harbour introduction call', content: JSON.stringify({ planKind: 'plan_meeting', planId: 'd2' }), created_at: at('2026-10-15') },
    { id: 'e3', review_type: 'weekly-momentum', title: 'Weekly momentum check-in, week of 29 Sep', status: 'final', created_at: at('2026-10-02') },
    { id: 'e4', review_type: 'after-action', title: 'Harbour discovery call', status: 'final', created_at: at('2026-10-15') },
  ],
  missionReviews: [{ id: 'mr1', status: 'draft', created_at: at('2026-08-01'), review_data: { mission_title: 'Grow the studio' }, version: 'Version 1.2' }],
  journals: [{ id: 'j1', journal_date: '2026-10-19', status: 'final', created_at: at('2026-10-19') }],
  checkins: [
    { id: 'w1', checkinAt: '2026-10-01T10:00:00Z', date: '2026-10-01', areas: [{ key: 'health', label: 'Health / Fitness' }], focusAreaKey: 'health' },
    { id: 'w3', checkinAt: '2026-10-02T10:00:00Z', date: '2026-10-02', areas: [{ key: 'custom-sleep', label: 'Sleep' }], focusAreaKey: 'custom-sleep' },
    { id: 'w2', checkinAt: '2026-09-01T10:00:00Z', date: '2026-09-01', areas: [], focusAreaKey: null },
  ],
  dayReviews: [{ id: 'dr1', local_date: TODAY, status: 'finished' }, { id: 'dr2', local_date: '2026-10-19', status: 'draft' }],
  debriefs: [{ id: 'db1', sprint_id: 's1', sprint_week: 3, status: 'finished' }],
  sprints: [{ id: 's1', number: 1, start_on: '2026-09-28', planned_end_on: '2026-11-22' }, { id: 's0', number: 4, start_on: '2026-07-06', actual_end_on: '2026-09-27' }],
  sprintReviews: [{ sprint_id: 's0', finished_at: '2026-09-27T18:00:00Z' }],
};

test('My Reviews: every type, named in words, with its tool, area and date', () => {
  const rows = reviewRows(REVIEWS, TODAY);
  const by = (id) => rows.find((r) => r.id === id);
  assert.equal(by('entry:e1').title, 'Yesterday’s review');
  assert.equal(by('entry:e1').typeLabel, 'Daily review');
  assert.equal(by('entry:e2').area, 'interpersonal');
  assert.equal(by('entry:e2').typeLabel, 'Meeting review');
  assert.equal(by('entry:e3').title, 'Weekly check-in');
  assert.equal(by('entry:e4').title, 'Harbour discovery call');
  assert.equal(by('pop-review:mr1').canEdit, false, 'POP reviews stay read only');
  assert.equal(by('journal:j1').title, 'Journal entry');
  assert.equal(by('wheel:w1').title, 'Focus on health');
  assert.equal(by('wheel:w3').title, 'Focus on Sleep', 'their own area as typed');
  assert.equal(by('wheel:w2').title, 'September review');
  assert.equal(by('day-review:dr1').title, 'Today’s review');
  assert.equal(by('day-review:dr2'), undefined, 'an empty draft is not a review');
  assert.equal(by('debrief:db1').title, 'Sprint 1, week 3');
  assert.equal(by('debrief:db1').dateLabel, 'Sun 18 Oct');
  assert.equal(by('sprint-review:s0').title, 'Performance Sprint 4');
  assert.equal(by('sprint-review:s0').to.path, '/performance-sprint/review/s0');
  assert.ok(!recentRows(rows, 'personal', 10).some((r) => r.source === 'journal'), 'journal entries never show on a hub');
});
