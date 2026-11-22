// EXPLAIN ANALYZE of the reads the pages make, as the person who makes them
// (role authenticated, their JWT claims, aal2 for coaches), on a copy of the
// seeded stand-in. Shows each plan's time, rows, and any sequential scan of
// a big table. Local only.
//
//   node tests/scale/explain.mjs --from <base-scale.tar> [--only name,...]
import { openDb } from './db.mjs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
const id = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const owner = id('coach1');
const associate = id('coach2');
const client = id('client1');

// The reads, as PostgREST runs them (its own SQL is the same select under the same rules).
const READS = [
  ['owner', 'shell: coach_cal_items select * limit 5000', 'select * from public.coach_cal_items limit 5000'],
  ['owner', 'shell: coach_sessions select * limit 5000', 'select * from public.coach_sessions limit 5000'],
  ['owner', 'shell: coach_session_people select * limit 5000', 'select * from public.coach_session_people limit 5000'],
  ['owner', 'shell: coach_session_notes select * limit 5000', 'select * from public.coach_session_notes limit 5000'],
  ['owner', 'shell: client_notes select * limit 5000', 'select * from public.client_notes limit 5000'],
  ['owner', 'shell: engagements select * limit 5000', 'select * from public.engagements limit 5000'],
  ['owner', 'shell: time_entries select * limit 5000', 'select * from public.time_entries limit 5000'],
  ['owner', 'shell: coach_todos select * limit 5000', 'select * from public.coach_todos limit 5000'],
  ['owner', 'shell: coach_lead_events select * limit 5000', 'select * from public.coach_lead_events limit 5000'],
  ['owner', 'shell: activity_log select * limit 5000', 'select * from public.activity_log limit 5000'],
  ['owner', 'shell: coach_notifications select * limit 5000', 'select * from public.coach_notifications limit 5000'],
  ['owner', 'shell: client_profiles select * limit 5000', 'select * from public.client_profiles limit 5000'],
  ['owner', 'shell: coach_bookings select * limit 5000', 'select * from public.coach_bookings limit 5000'],
  ['owner', 'shell: coach_leads select * limit 5000', 'select * from public.coach_leads limit 5000'],
  ['owner', 'rpc coach_admin_clients()', 'select * from public.coach_admin_clients()'],
  ['owner', 'rpc coach_client_list()', 'select * from public.coach_client_list(null, null, null, 200, 0)'],
  ['owner', "rpc network_page (table, first 50)", "select public.network_page()"],
  ['owner', 'rpc network_map()', 'select public.network_map()'],
  ['owner', 'rpc network_counts()', 'select public.network_counts()'],
  ['associate', 'shell: coach_session_people (associate)', 'select * from public.coach_session_people limit 5000'],
  ['associate', 'shell: coach_session_notes (associate)', 'select * from public.coach_session_notes limit 5000'],
  ['client', 'home: own_question_answers since 70 days or weekly', `select * from public.own_question_answers where user_id = '${client}' and (on_date >= current_date - 70 or tool = 'weekly_debrief')`],
  ['client', 'dashboard: habit_logs for 20 sprint habits', `select id, sprint_habit_id, local_date, value from public.habit_logs where sprint_habit_id in (select id from public.sprint_habits where user_id = '${client}')`],
  ['client', 'dashboard: day_plans 6 months', `select id, local_date, sleep_hours, sleep_quality from public.day_plans where user_id = '${client}' and local_date >= current_date - 182 order by local_date`],
  ['client', 'dashboard: day_reviews 6 months', `select local_date, way_of_being_rating from public.day_reviews where user_id = '${client}' and local_date >= current_date - 182 order by local_date limit 400`],
  ['client', 'home: week_scores all', `select sprint_id, sprint_week, week_end, score from public.week_scores where user_id = '${client}' order by week_end`],
  ['client', 'sprint: todos this sprint and backlog', `select * from public.todos where user_id = '${client}' and deleted_at is null and (sprint_id = '${id('sprint1-5')}' or sprint_id is null)`],
];

const db = await openDb(opt('from'));
const claims = (who) => {
  const sub = who === 'owner' ? owner : who === 'associate' ? associate : client;
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({ sub, role: 'authenticated', aal: who === 'client' ? 'aal1' : 'aal2', iat: now, session_id: id(`session-${who}`), amr: [{ method: 'password', timestamp: now }] });
};
for (const [who, name, sql] of READS) {
  if (ONLY && !ONLY.has(name)) continue;
  await db.exec('begin');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(who)]);
  await db.exec('set local role authenticated');
  let plan;
  try {
    plan = (await db.query(`explain (analyze, buffers, format text) ${sql}`)).rows.map((r) => r['QUERY PLAN']);
  } catch (e) {
    plan = [`error: ${e.message}`];
  }
  await db.exec('rollback');
  const total = plan.find((l) => /Execution Time/.test(l)) || '';
  const top = plan[0] || '';
  const seq = plan.filter((l) => /Seq Scan on (\w+)/.test(l)).map((l) => l.trim().replace(/\s+\(cost.*?\)/, '').slice(0, 140));
  const sub = plan.filter((l) => /SubPlan|InitPlan|Function Scan|Filter:/.test(l)).slice(0, 4).map((l) => l.trim().slice(0, 160));
  console.log(`\n## ${who}: ${name}\n  ${total.trim()}\n  ${top.trim().slice(0, 160)}`);
  for (const l of seq) console.log(`  seq: ${l}`);
  for (const l of sub) console.log(`  ${l}`);
}
await db.close();
