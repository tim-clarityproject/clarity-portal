// Invented Individual Performance Plan and running Performance Sprint for
// the TEST client, so the Phase 2 pages can be checked with real content
// (M1's example: Sam's plan). TEST database only; it refuses any other.
//
//   node scripts/seed-test-plan.mjs           adds the plan if there is none
//   node scripts/seed-test-plan.mjs --reset   removes the client's plan first
//   node scripts/seed-test-plan.mjs --empty   removes it and adds nothing, so
//                                             Build your plan starts from empty
//   node scripts/seed-test-plan.mjs --ended   removes it and adds the plan with a
//                                             finished Performance Sprint 1, a
//                                             Recovery, and Sprint 2 ended but not
//                                             reviewed (for the end-of-sprint review
//                                             and View your year)
//   node scripts/seed-test-plan.mjs --reset --recovery[=N,M]
//                                             the usual plan and running sprint,
//                                             with a Recovery started N days ago
//                                             for M days (default 3 and 7), still
//                                             open, "Let [coach] know" ticked
//
// Signed in as the test client (~/.clarity-test-accounts.env, never
// printed), it writes only what the app itself writes, through the same
// rules every client has: no SQL, nothing a person couldn't do in the app.
// The version snapshots use the app's own planSnapshot.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { planSnapshot } from '../src/lib/performance/versions.js';

const TEST_REF = 'gqtqljngeenqzxneucoc';
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) {
  console.error('Not the test project: nothing was written.');
  process.exit(1);
}
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({
  email: env.TEST_CLIENT_EMAIL,
  password: env.TEST_CLIENT_PASSWORD,
});
if (signInError) throw signInError;
const me = signIn.user.id;

async function put(table, rows) {
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
}

// Today in London, as the app works out the person's local day.
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
const day = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10); // a pure date sum in UTC, never "today"
};
const weekday = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0

const empty = process.argv.includes('--empty');
const ended = process.argv.includes('--ended');
const { data: existing } = await db.from('performance_plans').select('id').eq('user_id', me).eq('status', 'active');
if (existing?.length || empty) {
  if (!process.argv.includes('--reset') && !empty && !ended) {
    console.log('The test client already has a plan. Run with --reset to replace it.');
    process.exit(0);
  }
  // Recovery and wins aren't under the plan, so they go first.
  await db.from('recovery_periods').delete().eq('user_id', me);
  await db.from('wins').delete().eq('user_id', me);
  await db.from('todos').delete().eq('user_id', me);
  await db.from('sprints').delete().eq('user_id', me);
  const { error } = await db.from('performance_plans').delete().eq('user_id', me);
  if (error) throw error;
  await db.from('working_patterns').delete().eq('user_id', me);
  console.log('Removed the old plan.');
}
if (empty) {
  console.log('The test client now has no plan.');
  process.exit(0);
}

await db.from('person_settings').upsert({ user_id: me, time_zone: 'Europe/London', units: 'metric' }, { onConflict: 'user_id' });

const planId = randomUUID();
const mission = 'Be a world-class high-performance coach';
await put('performance_plans', [{ id: planId, user_id: me, mission, major: 3, minor: 2, created_at: '2025-11-03T09:00:00Z' }]);

const O = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const objectives = [
  { id: O[0], name: 'Coaching clients', kind: 'number', unit: null, direction: 'up', start_value: 24, target_value: 40, by_when: '2027-12-31', due_on: null, sort_order: 0 },
  { id: O[1], name: 'How world-class is my coaching?', kind: 'rating', unit: null, direction: 'up', start_value: 6, target_value: 9, by_when: '2027-12-31', due_on: null, sort_order: 1 },
  { id: O[2], name: 'Annual revenue', kind: 'number', unit: '£k', direction: 'up', start_value: 140, target_value: 250, by_when: '2027-12-31', due_on: null, sort_order: 2 },
  { id: O[3], name: 'Publish my coaching book', kind: 'milestone', unit: null, direction: 'up', start_value: null, target_value: null, by_when: null, due_on: '2027-06-30', sort_order: 3 },
];
await put('outcome_objectives', objectives.map((o) => ({ ...o, user_id: me, plan_id: planId, start_set_on: '2025-11-03' })));
await put('objective_figures', [
  { objective_id: O[0], value: 28, recorded_on: '2026-06-30' },
  { objective_id: O[0], value: 31, recorded_on: day(today, -9) },
  { objective_id: O[1], value: 7, recorded_on: day(today, -9) },
  { objective_id: O[2], value: 172, recorded_on: day(today, -9) },
].map((f) => ({ ...f, id: randomUUID(), user_id: me })));

const S = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const strategies = [
  { id: S[0], name: 'Maintain my availability to do good work', sort_order: 0 },
  { id: S[1], name: 'Deepen my coaching craft', sort_order: 1 },
  { id: S[2], name: 'Grow through referrals', sort_order: 2 },
  { id: S[3], name: 'Build The Clarity Portal', sort_order: 3 },
];
await put('plan_strategies', strategies.map((s) => ({ ...s, user_id: me, plan_id: planId })));
const links = [[S[0], O[0]], [S[0], O[1]], [S[1], O[1]], [S[1], O[3]], [S[2], O[0]], [S[2], O[2]], [S[3], O[2]]]
  .map(([strategy_id, objective_id]) => ({ strategy_id, objective_id, user_id: me }));
await put('strategy_objectives', links);

const H = {};
const habitList = [
  ['steps', S[0], 'Steps', { measure: 'amount', unit: 'steps', target: 10000, target_per: 'day', impact: 2 }],
  ['train', S[0], 'Training sessions', { measure: 'count', unit: 'sessions', target: 4, target_per: 'week', top_number: 3, impact: 3 }],
  ['water', S[0], 'Water', { measure: 'amount', unit: 'litres', target: 2, target_per: 'day', impact: 1 }],
  ['late', S[0], 'Late finishes', { measure: 'yes_no_days_limit', limit_value: 2, impact: 2 }],
  ['focus', S[0], 'Focus', { measure: 'rating', direction: 'higher', target: 4, impact: 2 }],
  ['notes', S[1], 'Reflective notes', { measure: 'count', unit: 'notes', target: 5, target_per: 'week', top_number: 10, impact: 3 }],
  ['read', S[1], 'Reading', { measure: 'amount', unit: 'hours', target: 3, target_per: 'week', impact: 1 }],
  ['msgs', S[2], 'Check-in messages', { measure: 'count', unit: 'messages', target: 5, target_per: 'week', impact: 3 }],
  ['block', S[3], 'Weekly strategic block', { measure: 'yes_no_weekly', impact: 3 }],
  ['screens', S[0], 'No screens after 21:00', { measure: 'yes_no_days_target', target: 4, impact: 2 }],
  ['coffee', S[0], 'Coffees', { measure: 'count_limit', unit: 'coffees', limit_value: 2, limit_per: 'day', impact: 1 }],
];
const habits = habitList.map(([key, strategyId, name, m], i) => {
  H[key] = randomUUID();
  return { id: H[key], user_id: me, plan_id: planId, strategy_id: strategyId, name, sort_order: i, ...m };
});
await put('habits', habits);

// Version history: 1.0, then the changes that led to 3.2.
const snap = (over = {}) => planSnapshot({ mission, objectives, strategies, links, habits, ...over });
const versions = [
  [1, 0, 'start', '2025-11-03T09:30:00Z', snap({ mission: 'Be a great coach', objectives: objectives.slice(0, 2), links: links.filter((l) => l.objective_id !== O[2] && l.objective_id !== O[3]), strategies: strategies.slice(0, 3), habits: habits.filter((h) => h.strategy_id !== S[3]) })],
  [2, 0, 'major', '2026-01-12T18:05:00Z', snap({ objectives: objectives.slice(0, 3), strategies: strategies.slice(0, 3), links: links.filter((l) => l.objective_id !== O[3]), habits: habits.filter((h) => h.strategy_id !== S[3]) })],
  [3, 0, 'major', '2026-04-06T08:40:00Z', snap({ habits: habits.filter((h) => h.name !== 'Focus' && h.name !== 'Reading') })],
  [3, 1, 'minor', '2026-07-20T07:55:00Z', snap({ habits: habits.filter((h) => h.name !== 'Focus') })],
  [3, 2, 'minor', '2026-10-02T09:30:00Z', snap()],
];
await put('plan_versions', versions.map(([major, minor, kind, created_at, snapshot]) => ({
  id: randomUUID(), plan_id: planId, user_id: me, major, minor, kind, created_at, snapshot,
})));

// A sprint: its row, each plan habit copied in (plus any for this sprint
// only), with settings from week 1.
async function makeSprint({ number, startOn, length, status = 'running', actualEnd = null, extra = [] }) {
  const id = randomUUID();
  await put('sprints', [{
    id, user_id: me, plan_id: planId, number, start_on: startOn, length_weeks: length, standard: 85,
    status, actual_end_on: actualEnd, finished_at: status === 'finished' ? `${actualEnd}T20:00:00Z` : null,
  }]);
  const keys = {};
  const all = [...habits.map((h, i) => ({ key: habitList[i][0], habit_id: h.id, ...h })), ...extra];
  const rowsOf = all.map((h, i) => {
    keys[h.key] = randomUUID();
    return { id: keys[h.key], sprint_id: id, user_id: me, habit_id: h.habit_id || null, strategy_id: h.strategy_id, name: h.name, sort_order: i };
  });
  await put('sprint_habits', rowsOf);
  await put('sprint_habit_settings', all.map((h, i) => ({
    id: randomUUID(), sprint_habit_id: rowsOf[i].id, user_id: me, from_week: 1,
    measure: h.measure, unit: h.unit ?? null, target: h.target ?? null, target_per: h.target_per ?? null,
    limit_value: h.limit_value ?? null, limit_per: h.limit_per ?? null, direction: h.direction ?? null,
    top_number: h.top_number ?? null, impact: h.impact,
  })));
  return { id, keys };
}

// Logs: three fuller weeks, then this week so far (M1's EXA and EXD).
const week = [
  { steps: [11200, 8400, 10300, 9800, 12100, null, 6400], train: [1, 0, 1, 0, 1, 1, 0], water: [2, 1.5, 2, 2, 1.5, 2, null], late: [0, 1, 0, 1, 0, 0, 0], focus: [4, 3, 4, 4, 3, null, 4], notes: [2, 1, 1, 1, 1, 0, 0], read: [0.5, 0, 1, 0, 0.5, 1, 0], msgs: [1, 2, 0, 1, 0, 0, 0], block: [1, null, null, null, null, null, null], screens: [1, 1, 0, 1, 1, null, null], coffee: [2, 3, 1, 2, 2, null, null] },
  { steps: [9000, 7600, 10100, 8800, 9900, 4000, null], train: [1, 0, 1, 0, 0, 1, 0], water: [1.5, 1.5, 2, 1, 1.5, null, null], late: [1, 1, 0, 1, 0, 0, 0], focus: [3, 3, 4, 3, 3, null, null], notes: [1, 1, 0, 1, 1, 0, 0], read: [0, 0, 1, 0, 0.5, 0, 0], msgs: [1, 1, 0, 1, 0, 0, 0], block: [null, null, null, 0, null, null, null], screens: [0, 1, 0, 1, 0, null, null], coffee: [3, 2, 2, 3, 2, null, null] },
  { steps: [12000, 10400, 11000, 10200, 12500, 8000, 9000], train: [1, 1, 0, 1, 0, 1, 0], water: [2, 2, 2, 2, 2, 2, 2], late: [0, 0, 1, 0, 0, 0, 0], focus: [4, 4, 5, 4, 4, null, null], notes: [1, 1, 1, 1, 1, 1, 0], read: [1, 0, 1, 0, 0.5, 0.5, 0], msgs: [2, 1, 1, 1, 1, 0, 0], block: [null, 1, null, null, null, null, null], screens: [1, 1, 1, 1, 0, null, null], coffee: [2, 1, 2, 2, 1, null, null] },
  { steps: [11200, 8400, null, null, null, null, null], train: [1, 0, null, null, null, null, null], water: [2, 1.5, null, null, null, null, null], late: [0, 1, null, null, null, null, null], focus: [4, 3, null, null, null, null, null], notes: [2, 1, null, null, null, null, null], read: [0.5, 0, null, null, null, null, null], msgs: [1, 2, null, null, null, null, null], block: [null, null, null, null, null, null, null], screens: [1, 0, null, null, null, null, null], coffee: [2, 2, null, null, null, null, null] },
];
// Each week's logs from the pattern, every day before today.
function logsFor(sprintKeys, startOn, pattern) {
  const out = [];
  pattern.forEach((w, wi) => {
    Object.entries(w).forEach(([key, values]) => {
      if (!sprintKeys[key]) return;
      values.forEach((v, di) => {
        const date = day(startOn, wi * 7 + di);
        if (v == null || date >= today) return;
        out.push({ id: randomUUID(), user_id: me, sprint_habit_id: sprintKeys[key], local_date: date, value: v });
      });
    });
  });
  return out;
}

const monday = day(today, -weekday(today));
if (ended) {
  // Sprint 1: six weeks, finished. Then a Recovery of 10 days. Then
  // Sprint 2: eight weeks, its last day eight days ago, still running
  // because it hasn't been reviewed (R5). It has one habit for this
  // sprint only, kept up every week, for "Which habits have stuck?".
  const s2Start = day(monday, -63);
  const recStart = day(s2Start, -10);
  const s1Start = day(recStart, -42);
  const one = await makeSprint({ number: 1, startOn: s1Start, length: 6, status: 'finished', actualEnd: day(recStart, -1) });
  const mobility = { key: 'mobility', strategy_id: S[0], name: 'Mobility sessions', measure: 'count', unit: 'sessions', target: 3, target_per: 'week', top_number: 3, impact: 2 };
  const two = await makeSprint({ number: 2, startOn: s2Start, length: 8, extra: [mobility] });
  const full = week.slice(0, 3);
  const pattern = (n) => Array.from({ length: n }, (_, i) => ({ ...full[i % 3], mobility: [1, 0, 1, 0, 1, 0, 0] }));
  const logs1 = logsFor(one.keys, s1Start, pattern(6).map((w, i) => (i === 1 ? week[1] : w)));
  const logs2 = logsFor(two.keys, s2Start, pattern(8).map((w, i) => (i === 5 ? { ...week[1], mobility: [1, 0, 1, 0, 1, 0, 0] } : w)));
  await put('habit_logs', [...logs1, ...logs2]);
  await put('recovery_periods', [{ user_id: me, sprint_id: null, start_on: recStart, chosen_days: 7, extended_days: 3, ended_at: `${s2Start}T08:00:00Z`, end_on: s2Start, let_coach_know: false }]);
  await put('objective_figures', [
    { objective_id: O[0], value: 28, recorded_on: day(s2Start, -2) },
    { objective_id: O[1], value: 6, recorded_on: day(s2Start, -2) },
  ].map((f) => ({ ...f, id: randomUUID(), user_id: me })));
  await put('todos', [
    { strategy_id: S[2], text: 'Ask Evan for an introduction to Harbour', impact: 3, planned_week: 2, created_on: day(s2Start, 2), done_on: day(s2Start, 9) },
    { strategy_id: S[1], text: 'Book a supervision session', impact: 2, planned_week: 4, created_on: day(s2Start, 2), done_on: day(s2Start, 23) },
  ].map((t) => ({ ...t, id: randomUUID(), user_id: me, sprint_id: two.id, source: 'manual' })));
  // Sprint 1's weeks frozen, as its sprint page would have done.
  for (let w = 1; w <= 6; w += 1) {
    const { error } = await db.rpc('freeze_week', { p_sprint: one.id, p_week: w });
    if (error) throw new Error(`freeze_week: ${error.message}`);
  }
  console.log(`Seeded the test client's plan with Sprint 1 finished (from ${s1Start}), a Recovery and Sprint 2 ended on ${day(s2Start, 55)}, not reviewed.`);
  process.exit(0);
}

// A running 8-week sprint, in its fourth week today.
const startOn = day(day(today, -weekday(today)), -21);
const { id: sprintId, keys: SH } = await makeSprint({ number: 1, startOn, length: 8 });

const logs = logsFor(SH, startOn, week);
await put('habit_logs', logs);

await put('todos', [
  { strategy_id: S[0], text: 'Book a physio assessment', impact: 2, planned_week: 3, created_on: day(startOn, 14) },
  { strategy_id: S[2], text: 'Ask Evan for an introduction to Harbour', impact: 3, planned_week: 4, created_on: day(startOn, 16), done_on: monday },
  { strategy_id: S[2], text: 'Draft the Harbour case study', impact: 3, planned_week: 4, created_on: day(startOn, 16) },
  { strategy_id: S[3], text: 'Shortlist breathing sound loops', impact: 1, planned_week: 4, created_on: day(startOn, 18) },
  { strategy_id: S[2], text: 'Update my LinkedIn profile', impact: 1, planned_week: 5, created_on: day(startOn, 18) },
  { strategy_id: S[3], text: 'Test the new Plan my day with two clients', impact: 2, planned_week: 6, created_on: day(startOn, 18) },
  { strategy_id: S[1], text: 'Book a supervision session', impact: 2, planned_week: 7, created_on: day(startOn, 18) },
  { strategy_id: S[1], text: 'Renew supervision contract', impact: 2, planned_week: 2, created_on: day(startOn, 3), done_on: day(startOn, 9) },
].map((t) => ({ ...t, id: randomUUID(), user_id: me, sprint_id: sprintId, source: 'manual' })));

const winId = randomUUID();
await put('wins', [{ id: winId, user_id: me, what: 'Spoke at a breakfast event and two people asked about coaching', local_date: day(monday, 1) < today ? day(monday, 1) : monday, impact: 3 }]);
await put('win_strategies', [{ win_id: winId, strategy_id: S[2], user_id: me }]);

const recoveryArg = process.argv.find((a) => a === '--recovery' || a.startsWith('--recovery='));
if (recoveryArg) {
  const [ago, chosen] = (recoveryArg.split('=')[1] || '3,7').split(',').map(Number);
  await put('recovery_periods', [{
    user_id: me, sprint_id: sprintId, start_on: day(today, -(ago || 0)), chosen_days: chosen || 7, let_coach_know: true,
  }]);
  console.log(`Added an open Recovery from ${day(today, -(ago || 0))} for ${chosen || 7} days.`);
}

console.log(`Seeded the test client's plan (version 3.2) and Performance Sprint 1 (8 weeks from ${startOn}), ${logs.length} logs.`);
