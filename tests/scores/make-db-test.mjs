// Writes supabase/032_scores_in_database_test.sql from tests/scores/cases.mjs,
// so the database copies of the scores (migration 032) are tested on exactly
// the same inputs and answers as src/lib/scores/ (npm run test:scores).
//
//   node tests/scores/make-db-test.mjs          write the test
//   node tests/scores/make-db-test.mjs --check  exit 1 if it is out of date

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M5_CASES, CALENDAR_CASES, M6_CASES, M9_CASES, M18_CASES, M19_CASES } from './cases.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(REPO, 'supabase/032_scores_in_database_test.sql');
const PRELUDE = fs.readFileSync(path.join(REPO, 'tests/scores/db-test-prelude.sql'), 'utf8');
const TABLES = fs.readFileSync(path.join(REPO, 'tests/scores/db-test-tables.sql'), 'utf8');

const j = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$j$')) throw new Error('JSON holds $j$');
  return `$j$${s}$j$::jsonb`;
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (v) => (v == null ? 'null' : String(v));
const name = (c, what) => q(`${c.id}: ${what}`);

const lines = [];
const add = (s) => lines.push(`    ${s}`);

for (const c of M5_CASES) {
  add(`r := public.score_week_raw(${j(c.input)});`);
  add(`f := f || pg_temp.t_near(${name(c, 'score')}, (r ->> 'score')::numeric, ${num(c.expect.score)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'shown')}, public.score_round((r ->> 'score')::numeric)::text, ${c.expect.shown == null ? 'null' : q(c.expect.shown)});`);
  for (const [id, v] of Object.entries(c.expect.strategies)) {
    add(`f := f || pg_temp.t_near(${name(c, `Strategy ${id}`)}, (select (x ->> 'score')::numeric from jsonb_array_elements(r -> 'strategies') x where x ->> 'id' = ${q(id)}), ${num(v)});`);
  }
}
for (const c of CALENDAR_CASES) {
  add(`r := public.score_sprint_calendar(${j(c.input.sprint)}, date ${q(c.input.today)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'weeks')}, (select jsonb_agg(w - 'days' order by (w ->> 'number')::integer) from jsonb_array_elements(r -> 'weeks') w)::text, ${j(c.expect.weeks)}::text);`);
  add(`f := f || pg_temp.t_eq(${name(c, 'planned end')}, r ->> 'plannedEnd', ${q(c.expect.plannedEnd)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'actual end')}, r ->> 'actualEnd', ${c.expect.actualEnd == null ? 'null' : q(c.expect.actualEnd)});`);
}
for (const c of M6_CASES) {
  const e = c.expect;
  add(`r := public.score_m6_sprint(${j(c.input.weeks)}, ${c.input.standard}, ${num(c.input.previousAverage)});`);
  add(`f := f || pg_temp.t_near(${name(c, 'average')}, (r ->> 'average')::numeric, ${num(e.average)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'shown')}, public.score_round((r ->> 'average')::numeric)::text, ${e.shown == null ? 'null' : q(e.shown)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'finished weeks')}, r ->> 'finishedWeeks', ${q(e.finishedWeeks)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'weeks at the standard')}, r ->> 'weeksAtStandard', ${q(e.weeksAtStandard)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'best week')}, r -> 'best' ->> 'number', ${e.best ? q(e.best.number) : 'null'});`);
  if (e.best) add(`f := f || pg_temp.t_near(${name(c, 'best score')}, (r -> 'best' ->> 'score')::numeric, ${e.best.score});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'change')}, r ->> 'change', ${e.change == null ? 'null' : q(e.change)});`);
}
for (const c of M9_CASES) {
  add(`r := public.score_m9_objective(${j(c.input.objective)}, date ${q(c.input.asOf)}, ${c.input.sprintStart ? `date ${q(c.input.sprintStart)}` : 'null'});`);
  for (const [k, v] of Object.entries(c.expect)) {
    if (typeof v === 'number') add(`f := f || pg_temp.t_near(${name(c, k)}, (r ->> ${q(k)})::numeric, ${v});`);
    else add(`f := f || pg_temp.t_eq(${name(c, k)}, r ->> ${q(k)}, ${v == null ? 'null' : q(v)});`);
  }
}
for (const c of M18_CASES) {
  add(`r := public.score_m18_pulse(${j(c.input.answers)}, ${c.input.previous ? j(c.input.previous) : 'null'});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'answers')}, r ->> 'answers', ${q(c.expect.answers)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'lowest')}, r ->> 'lowest', ${q(c.expect.lowest)});`);
  for (const [k, v] of Object.entries(c.expect.measures)) {
    add(`f := f || pg_temp.t_near(${name(c, `${k} figure`)}, (r -> 'measures' -> ${q(k)} ->> 'figure')::numeric, ${num(v.figure)});`);
    add(`f := f || pg_temp.t_eq(${name(c, `${k} answers`)}, r -> 'measures' -> ${q(k)} ->> 'answers', ${q(v.answers)});`);
    add(`f := f || pg_temp.t_eq(${name(c, `${k} change`)}, r -> 'measures' -> ${q(k)} ->> 'change', ${v.change == null ? 'null' : q(v.change)});`);
  }
}
for (const c of M19_CASES) {
  const e = c.expect;
  add(`r := public.score_m19_group(${j(c.input.seats)});`);
  add(`f := f || pg_temp.t_near(${name(c, 'headline')}, (r -> 'headline' ->> 'percent')::numeric, ${num(e.headline)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'shown')}, r -> 'headline' ->> 'shown', ${q(e.shown)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'counted')}, r -> 'headline' ->> 'counted', ${q(e.counted)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'too early')}, r -> 'headline' ->> 'tooEarly', ${q(e.tooEarly)});`);
  add(`f := f || pg_temp.t_eq(${name(c, 'seats')}, r ->> 'seats', ${q(e.seats)});`);
  if (e.use == null) add(`f := f || pg_temp.t_eq(${name(c, 'use figures hidden')}, jsonb_typeof(r -> 'use'), 'null');`);
  else for (const [k, v] of Object.entries(e.use)) add(`f := f || pg_temp.t_near(${name(c, `use ${k}`)}, (r -> 'use' ->> ${q(k)})::numeric, ${num(v)});`);
  add(`f := f || pg_temp.t_near(${name(c, 'at their own standard')}, (r -> 'behaviour' ->> 'atOwnStandard')::numeric, ${num(e.atOwnStandard)});`);
  add(`f := f || pg_temp.t_near(${name(c, 'average Strategy score')}, (r -> 'behaviour' ->> 'averageStrategyScore')::numeric, ${num(e.averageStrategyScore)});`);
}

const sql = `-- =============================================================================
-- 032_scores_in_database_test.sql
-- Checks 032_scores_in_database.sql. RUN ORDER: 026 to 032, then this.
--
-- Written by tests/scores/make-db-test.mjs from tests/scores/cases.mjs: the
-- same cases, inputs and answers as npm run test:scores, so the database and
-- the scoring library can never disagree. Don't edit it by hand: change the
-- cases and run node tests/scores/make-db-test.mjs.
--
-- WHAT IT DOES
--   1. Every shared case (M0.4 calendar, M5, M6, M9, M18, M19) through the
--      database copies.
--   2. The same arithmetic reached through the tables: M5-1 saved as real
--      rows and frozen (freeze_week), a frozen end-of-sprint summary
--      (make_sprint_summary), the organisation figures and their group-size
--      rules (org_figures), the pulse (pulse_results) and impact
--      (impact_results), as invented people. Everything is undone at the end.
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

${PRELUDE}
-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  r jsonb;
${TABLES.split('-- @DECLARE@')[0].trim().split('\n').map((l) => `  ${l}`).join('\n')}
begin
  begin
    -- ------------------------------------------------ 1. the shared cases (${M5_CASES.length + CALENDAR_CASES.length + M6_CASES.length + M9_CASES.length + M18_CASES.length + M19_CASES.length} cases)
${lines.join('\n')}

    -- ------------------------------------------------ 2. through the tables
${TABLES.split('-- @DECLARE@')[1].trim().split('\n').map((l) => `    ${l}`).join('\n')}

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice 'ALL CHECKS PASSED';
end
$t$;
`;

if (process.argv.includes('--check')) {
  if (fs.readFileSync(OUT, 'utf8') !== sql) {
    console.log('supabase/032_scores_in_database_test.sql is out of date. Run node tests/scores/make-db-test.mjs.');
    process.exit(1);
  }
  console.log('supabase/032_scores_in_database_test.sql matches tests/scores/cases.mjs.');
} else {
  fs.writeFileSync(OUT, sql);
  console.log(`Wrote ${path.relative(REPO, OUT)} (${lines.length} shared-case checks).`);
}
