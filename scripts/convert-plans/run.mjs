// npm run convert:plans: the plan conversion, proposed and proved
// (phase-1-data-model-spec.md section 13).
//
//   1. Reads each person's old plan (their live mission, its strategies and
//      tactics, and how many versions, reviews and archived missions they
//      have) from the TEST database, inside a rolled-back dry run.
//   2. Proposes the new plan for each (propose.mjs) and writes a report per
//      person for the check with Tim.
//   3. Proves the proposals fit: in a second rolled-back dry run, writes each
//      proposed plan into the new tables and checks every row went in.
//
// It never reads the live database: every read goes through
// scripts/dry-run-on-test.sh, which reads only the test connection and
// always rolls back. For now it runs on invented old-style plans
// (invented-old-plans.sql); at go-live, after Tim's per-client check, the
// real conversion is run by Tim.
//
//   node scripts/convert-plans/run.mjs [--out folder]   (default tests/convert/reports)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proposePlan, reportFor, summaryText } from './propose.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(REPO, 'tests/convert/reports');
const MIGRATIONS = path.join(REPO, 'supabase/migrations');
const pending = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 24).sort().map((f) => path.join(MIGRATIONS, f));
const INVENTED = path.join(HERE, 'invented-old-plans.sql');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clarity-convert-'));
const dryRun = (files) => {
  const r = spawnSync('bash', [path.join(REPO, 'scripts/dry-run-on-test.sh'), ...pending, ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0 || !out.includes('Dry run finished and rolled back')) {
    console.log(out.split('\n').filter((l) => !/NOTICE:  (relation|column|trigger|policy|function|index|constraint|extension)/.test(l)).join('\n').slice(-3000));
    console.log('The conversion could not run (see above). Nothing was kept.');
    process.exit(1);
  }
  return out;
};
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

// ---------------------------------------------------------------- 1. read
const exportSql = path.join(tmp, 'export.sql');
fs.writeFileSync(exportSql, `do $x$
declare r record;
begin
  for r in
    select u.id, coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Someone') as name
    from auth.users u left join public.profiles p on p.id = u.id
    where exists (select 1 from public.missions m where m.user_id = u.id)
      -- the invented people only; the real conversion at go-live drops this line
      and u.email like 'oldplan-%@example.invalid'
    order by name, u.id
  loop
    raise notice 'PLAN|%', jsonb_build_object(
      'person', jsonb_build_object('id', r.id, 'name', r.name),
      'mission', (select jsonb_build_object('id', m.id, 'title', m.title) from public.missions m where m.user_id = r.id and m.archived_at is null order by m.created_at desc limit 1),
      'strategies', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'sort_order', s.sort_order,
          'tactics', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.created_at) from public.tactics t where t.strategy_id = s.id), '[]'))
          order by s.sort_order, s.created_at)
        from public.strategies s where s.mission_id = (select m.id from public.missions m where m.user_id = r.id and m.archived_at is null order by m.created_at desc limit 1)), '[]'),
      'versions', (select count(*) from public.mission_versions v where v.user_id = r.id),
      'reviews', (select count(*) from public.mission_progress_reviews v where v.user_id = r.id),
      'archivedMissions', (select count(*) from public.missions m where m.user_id = r.id and m.archived_at is not null));
  end loop;
end
$x$;
`);
const first = dryRun([INVENTED, exportSql]);
const plans = first.split('\n').map((l) => /PLAN\|(.*)$/.exec(l)).filter(Boolean).map((m) => JSON.parse(m[1]));

// ---------------------------------------------------------------- 2. propose and report
fs.mkdirSync(OUT, { recursive: true });
const proposals = plans.map(proposePlan);
for (const p of proposals) {
  fs.writeFileSync(path.join(OUT, `${p.person.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`), reportFor(p));
}
fs.writeFileSync(path.join(OUT, 'proposals.json'), `${JSON.stringify(proposals, null, 2)}\n`);

// ---------------------------------------------------------------- 3. prove they fit the new tables
const apply = [];
const expected = [];
for (const p of proposals) {
  const uid = lit(p.person.id);
  const planId = `md5('newplan-' || ${uid})::uuid`;
  apply.push(`insert into public.performance_plans (id, user_id, mission) values (${planId}, ${uid}::uuid, ${lit(p.mission)});`);
  let habits = 0; let todos = 0; let objectives = 0;
  p.strategies.forEach((s, si) => {
    const sid = `md5('newstrat-' || ${lit(s.from.id)})::uuid`;
    apply.push(`insert into public.plan_strategies (id, plan_id, user_id, name, description, sort_order) values (${sid}, ${planId}, ${uid}::uuid, ${lit(s.name)}, ${lit(s.description)}, ${si + 1});`);
    for (const t of s.tactics) {
      if (t.becomes === 'habit') {
        const h = t.habit;
        const counted = h.measure === 'count' || h.measure === 'amount';
        apply.push(`insert into public.habits (plan_id, strategy_id, user_id, name, measure, unit, target, target_per) values (${planId}, ${sid}, ${uid}::uuid, ${lit(t.name)}, ${lit(h.measure)}, ${lit(h.unit && h.unit.length <= 30 ? h.unit : null)}, ${counted ? (h.target ?? 1) : 'null'}, ${counted ? lit(h.targetPer) : 'null'});`);
        habits += 1;
      } else if (t.becomes === 'todo') {
        apply.push(`insert into public.todos (user_id, strategy_id, text, source, source_id) values (${uid}::uuid, ${sid}, ${lit(t.name)}, 'conversion', ${lit(t.from.id)}::uuid);`);
        todos += 1;
      } else if (t.becomes === 'objective_measure' || t.becomes === 'milestone') {
        const oid = `md5('newobj-' || ${lit(t.from.id)})::uuid`;
        if (t.becomes === 'milestone') {
          apply.push(`insert into public.outcome_objectives (id, plan_id, user_id, name, kind, due_on) values (${oid}, ${planId}, ${uid}::uuid, ${lit(t.name)}, 'milestone', current_date + 90);`);
        } else {
          const start = t.objective.start ?? 0;
          const target = t.objective.target ?? start + 1;
          apply.push(`insert into public.outcome_objectives (id, plan_id, user_id, name, kind, direction, unit, start_value, target_value, by_when) values (${oid}, ${planId}, ${uid}::uuid, ${lit(t.name)}, 'number', 'up', ${lit(t.objective.unit && t.objective.unit.length <= 30 ? t.objective.unit : null)}, ${start}, ${target}, current_date + 365);`);
        }
        apply.push(`insert into public.strategy_objectives (strategy_id, objective_id, user_id) values (${sid}, ${oid}, ${uid}::uuid);`);
        objectives += 1;
      }
    }
  });
  expected.push({ uid, strategies: p.strategies.length, habits, todos, objectives });
}
const checks = expected.map((e) => `select 'CHECK|' || ${e.uid} || '|' ||
  ((select count(*) from public.plan_strategies where user_id = ${e.uid}::uuid) = ${e.strategies}
   and (select count(*) from public.habits where user_id = ${e.uid}::uuid) = ${e.habits}
   and (select count(*) from public.todos where user_id = ${e.uid}::uuid) = ${e.todos}
   and (select count(*) from public.outcome_objectives where user_id = ${e.uid}::uuid) = ${e.objectives})::text;`);
const applySql = path.join(tmp, 'apply.sql');
fs.writeFileSync(applySql, `${apply.join('\n')}\n${checks.join('\n')}\n`);
const second = dryRun([INVENTED, applySql]);
const results = second.split('\n').map((l) => /CHECK\|([^|]+)\|(\w+)/.exec(l)).filter(Boolean);
fs.rmSync(tmp, { recursive: true, force: true });

const ok = results.length === proposals.length && results.every((r) => r[2] === 'true');
for (const p of proposals) {
  console.log(`${p.person.name}: ${summaryText(p.summary)} ${p.flags.length} to look at first.`);
}
console.log(`Reports written to ${path.relative(REPO, OUT)} (${proposals.length} people).`);
console.log(ok
  ? `CONVERSION PROVED: every proposed plan went into the new tables (${proposals.length} people), in a rolled-back dry run. Nothing was kept, and the live database was never read.`
  : `CONVERSION FAILED THE PROOF: ${results.filter((r) => r[2] !== 'true').length} plans didn't match. Nothing was kept.`);
process.exit(ok ? 0 : 1);
