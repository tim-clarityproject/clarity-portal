// The rules test: npm run test:rules
//
// Acts as each person in config.mjs (the four test accounts, the invented
// Phase 1 people, and someone signed out) on the TEST database, and checks
// that each can read, add, change and remove only what config.mjs says, on
// every table and function listed there, then runs the scenarios (several
// steps as different people). Everything runs inside one transaction that is
// rolled back (scripts/dry-run-on-test.sh), so nothing is ever kept.
//
// Signing in happens inside the database, as Supabase does it for the app:
// the database role (authenticated or anon) and the account's id in
// request.jwt.claims, which auth.uid() reads. No password is used. Invented
// people are made inside the transaction and vanish with it.
//
// Exit status 0 when every result matches config.mjs (known gaps are
// reported but don't fail), 1 otherwise.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PEOPLE, RELATIONSHIPS, SETUP, TABLES, LOCKED_TABLES, FUNCTIONS, SCENARIOS, KNOWN_GAPS, OWN,
} from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CHUNK = 1500; // checks per statement, to stay well inside the time limit

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const isAnon = (person) => person.role === 'anon';
const uid = (person) => (isAnon(person) ? 'null::uuid' : `current_setting('rules.${person.key}')::uuid`);
const signedIn = PEOPLE.filter((p) => !isAnon(p));
const byKey = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
const keyOf = (t) => t.key || 'id';
const access = (spec, action) => (spec.access && spec.access[action]) || OWN;
const relatedFn = (viewer, owner) => (kind) =>
  RELATIONSHIPS.some((r) => r.from === viewer.key && r.to === owner.key && r.kind === kind);
const may = (rule, viewer, owner) => Boolean(rule({ viewer, owner, related: relatedFn(viewer, owner || viewer) }));
const ownersOf = (t) => (t.owners ? t.owners.map((k) => byKey[k]) : signedIn.filter((p) => p.email));

// ------------------------------------------------------------ set-up SQL
const setup = [];
const real = signedIn.filter((p) => p.email);
const invented = signedIn.filter((p) => !p.email);
setup.push(`do $people$
declare who record; found_id uuid;
begin
  for who in select * from (values ${real.map((p) => `(${lit(p.key)}, ${lit(p.email)})`).join(', ')}) v(key, email) loop
    select id into found_id from auth.users where email = who.email;
    if found_id is null then
      raise exception 'The test account % is missing on the test database (scripts/README-test-database.md, step 3).', who.email;
    end if;
    if not exists (select 1 from public.profiles where id = found_id) then
      raise exception 'The test account % has no profile row on the test database.', who.email;
    end if;
    perform set_config('rules.' || who.key, found_id::text, true);
  end loop;
  -- Invented people, made here and undone with everything else.
  for who in select * from (values ${invented.map((p) => `(${lit(p.key)}, ${lit(p.label)})`).join(', ') || "('', '')"}) v(key, label) loop
    continue when who.key = '';
    found_id := gen_random_uuid();
    insert into auth.users (id, email, aud, role)
    values (found_id, 'rules-' || who.key || '-' || found_id || '@example.invalid', 'authenticated', 'authenticated');
    update public.profiles set first_name = split_part(who.label, ' ', 1), last_name = 'Rules test' where id = found_id;
    perform set_config('rules.' || who.key, found_id::text, true);
  end loop;
end
$people$;`);
for (const s of SETUP) setup.push(s);

// Each check runs in its own sub-transaction that is always undone, as the
// person given, and reports what happened: a count, the rows changed, a
// value, "ran", "skipped" (the table or function isn't on this database) or
// the error. A scenario is several steps, each as its own person; the last
// step's value is the result.
setup.push(`create function pg_temp.rules_try(p_role text, p_user uuid, p_kind text, p_sql text, p_needs text)
returns text language plpgsql as $try$
declare n bigint; v text; outcome text; step jsonb;
begin
  if p_needs is not null and to_regclass(p_needs) is null and to_regprocedure(p_needs) is null then
    return 'skipped';
  end if;
  begin
    if p_kind = 'scenario' then
      for step in select * from jsonb_array_elements(p_sql::jsonb) loop
        perform set_config('role', 'none', true);
        perform set_config('request.jwt.claims',
          case when step ->> 'uid' is null then json_build_object('role', step ->> 'role')
               else json_build_object('sub', step ->> 'uid', 'role', step ->> 'role') end::text, true);
        perform set_config('request.jwt.claim.sub', coalesce(step ->> 'uid', ''), true);
        perform set_config('role', step ->> 'role', true);
        execute step ->> 'sql' into v;
      end loop;
      outcome := coalesce(v, 'null');
    else
      perform set_config('request.jwt.claims',
        case when p_user is null then json_build_object('role', p_role)
             else json_build_object('sub', p_user, 'role', p_role) end::text, true);
      perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
      perform set_config('role', p_role, true);
      if p_kind = 'count' then
        execute p_sql into n;
        outcome := n::text;
      elsif p_kind = 'call' then
        execute p_sql;
        outcome := 'ran';
      else
        execute p_sql;
        get diagnostics n = row_count;
        outcome := n::text;
      end if;
    end if;
    raise exception using errcode = 'RT001', message = 'undo this check';
  exception
    when sqlstate 'RT001' then null;
    when others then outcome := 'error ' || sqlstate || ': ' || sqlerrm;
  end;
  if current_user <> session_user then
    raise exception 'The rules test could not switch back from %.', current_user;
  end if;
  return outcome;
end
$try$;`);

// The rows each check acts on: one per owner per table, made here.
const fixtures = {}; // table -> person key -> SQL for that row's key
let n = 0;
const rowOfFor = (ownerKey) => (table, who = ownerKey) => fixtures[table][who];
for (const t of TABLES) {
  fixtures[t.table] = {};
  for (const p of ownersOf(t)) {
    n += 1;
    const id = t.keyIsOwner ? uid(p) : t.rowKey ? t.rowKey({ rowOf: rowOfFor(p.key) }) : lit(randomUUID());
    fixtures[t.table][p.key] = id;
    if (!t.madeAtSignUp) {
      const sql = t.make({ owner: uid(p), id, n, rowOf: rowOfFor(p.key) });
      setup.push(t.ifExists
        ? `do $fx$ begin if to_regclass(${lit('public.' + t.table)}) is not null then execute ${lit(sql)}; end if; end $fx$;`
        : sql + ';');
    }
  }
}
for (const t of LOCKED_TABLES) {
  n += 1;
  const sql = t.make({ id: lit(randomUUID()), n });
  setup.push(t.ifExists
    ? `do $fx$ begin if to_regclass(${lit('public.' + t.table)}) is not null then execute ${lit(sql)}; end if; end $fx$;`
    : sql + ';');
}

// ------------------------------------------------------------ the checks
const checks = [];
const add = (c) => checks.push({ id: checks.length + 1, ...c });

for (const t of TABLES) {
  const T = `public.${t.table}`;
  const k = keyOf(t);
  const owners = ownersOf(t);
  const needs = t.ifExists ? T : null;
  for (const viewer of PEOPLE) {
    for (const owner of owners) {
      const row = fixtures[t.table][owner.key];
      const base = { table: t.table, viewer, owner, role: viewer.role, needs };
      add({ ...base, action: 'read', kind: 'count', expected: may(access(t, 'read'), viewer, owner),
        sql: `select count(*) from ${T} t where t.${k} = ${row}` });
      n += 1;
      const make = t.makeForCheck || t.make;
      add({ ...base, action: 'add', kind: 'rows', expected: may(access(t, 'add'), viewer, owner),
        sql: make({ owner: uid(owner), id: t.keyIsOwner ? uid(owner) : lit(randomUUID()), n, rowOf: rowOfFor(owner.key) }) });
      add({ ...base, action: 'change', kind: 'rows', expected: may(access(t, 'change'), viewer, owner),
        sql: `update ${T} t set ${t.change} where t.${k} = ${row}` });
      add({ ...base, action: 'remove', kind: 'rows', expected: may(access(t, 'remove'), viewer, owner),
        sql: `delete from ${T} t where t.${k} = ${row}` });
      const own = fixtures[t.table][viewer.key];
      if (!isAnon(viewer) && viewer.key !== owner.key && own && t.handTo) {
        add({ ...base, action: 'hand over', kind: 'rows', expected: false,
          sql: `update ${T} t set ${t.handTo({ other: uid(owner), rowOf: rowOfFor(owner.key) })} where t.${k} = ${own}` });
        for (const target of t.links || []) {
          if (!fixtures[target][owner.key]) continue;
          n += 1;
          const rowOf = (table, who = viewer.key) => fixtures[table][table === target ? owner.key : who];
          add({ ...base, action: 'link', target, kind: 'rows', expected: false,
            sql: t.make({ owner: uid(viewer), id: lit(randomUUID()), n, rowOf }) });
        }
      }
    }
    // Every row a viewer can see that isn't theirs (the test data included).
    const othersReadable = owners.some((o) => o.key !== viewer.key && may(access(t, 'read'), viewer, o));
    add({ table: t.table, viewer, owner: null, role: viewer.role, action: 'read others', kind: 'count', expected: othersReadable, needs,
      sql: !isAnon(viewer)
        ? `select count(*) from ${T} t where (${t.owner}) is distinct from ${uid(viewer)}`
        : `select count(*) from ${T} t` });
  }
}

for (const t of LOCKED_TABLES) {
  const T = `public.${t.table}`;
  const needs = t.ifExists ? T : null;
  for (const viewer of PEOPLE) {
    const base = { table: t.table, viewer, owner: null, role: viewer.role, needs, expected: false, locked: true };
    n += 1;
    add({ ...base, action: 'read', kind: 'count', sql: `select count(*) from ${T} t` });
    add({ ...base, action: 'add', kind: 'rows', sql: t.make({ id: lit(randomUUID()), n }) });
    add({ ...base, action: 'change', kind: 'rows', sql: `update ${T} t set ${t.change}` });
    add({ ...base, action: 'remove', kind: 'rows', sql: `delete from ${T} t` });
  }
}

for (const f of FUNCTIONS) {
  for (const viewer of PEOPLE) {
    add({ table: null, fn: f.sig, viewer, owner: null, role: viewer.role, action: 'call', kind: 'call',
      needs: f.ifExists ? `public.${f.sig}` : null, expected: may(f.access, viewer, null), sql: f.call });
  }
}

const sqlFor = (s) => s.replace(/\{(\w+)\}/g, (_, key) => {
  if (!byKey[key]) throw new Error(`Unknown person {${key}} in a scenario`);
  return uid(byKey[key]);
});
for (const s of SCENARIOS) {
  const steps = s.steps.map((st) => {
    const who = byKey[st.as];
    if (!who) throw new Error(`Unknown person ${st.as} in scenario ${s.name}`);
    return { role: who.role, uid: isAnon(who) ? null : `__UID_${who.key}__`, sql: sqlFor(st.sql) };
  });
  add({ table: null, scenario: s.name, viewer: byKey[s.steps[s.steps.length - 1].as], owner: null, role: 'scenario',
    action: 'scenario', kind: 'scenario', expected: s.expect, steps, needs: s.needs || null });
}

// ------------------------------------------------------------ run
const valueOf = (c) => {
  if (c.kind !== 'scenario') return `$q$${c.sql}$q$`;
  // The steps as JSON, with each person's id filled in by the database.
  let json = JSON.stringify(c.steps).replace(/'/g, "''");
  json = `'${json}'`;
  for (const p of signedIn) json = `replace(${json}, ${lit(`__UID_${p.key}__`)}, current_setting('rules.${p.key}'))`;
  return json;
};
for (const c of checks) {
  if (c.kind !== 'scenario' && c.sql.includes('$q$')) throw new Error(`check ${c.id} holds $q$`);
}
const statements = [];
for (let i = 0; i < checks.length; i += CHUNK) {
  const part = checks.slice(i, i + CHUNK);
  statements.push(`select 'R|' || v.id || '|' || pg_temp.rules_try(v.role, v.uid, v.kind, v.sql, v.needs)
  from (values
${part.map((c) => `(${c.id}, ${lit(c.role === 'scenario' ? 'authenticated' : c.role)}, ${c.kind === 'scenario' ? 'null::uuid' : uid(c.viewer)}, ${lit(c.kind)}, ${valueOf(c)}, ${c.needs ? lit(c.needs) : 'null'})`).join(',\n')}
  ) v(id, role, uid, kind, sql, needs)
 order by v.id;`);
}
const sql = [
  '-- Made by tests/rules/run.mjs. Runs only through scripts/dry-run-on-test.sh.',
  ...setup,
  ...statements,
  '',
].join('\n\n');

// Migrations 024 onwards run first, in the same rolled-back transaction, so
// the rules are checked as they will be once Tim has run them (each is safe
// to run twice, so one already run changes nothing). --as-is checks the
// test database exactly as it is.
const MIGRATIONS = path.join(REPO, 'supabase/migrations');
const pending = process.argv.includes('--as-is') ? [] : fs.readdirSync(MIGRATIONS)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 24)
  .sort()
  .map((f) => path.join(MIGRATIONS, f));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarity-rules-'));
const file = path.join(dir, 'rules-test.sql');
fs.writeFileSync(file, sql, { mode: 0o600 });
if (process.argv.includes('--sql')) {
  console.log(`The SQL is in ${file} (not run). Run first: ${pending.map((f) => path.basename(f)).join(', ') || 'nothing'}.`);
  process.exit(0);
}
if (pending.length) console.log(`Running first, then undoing: ${pending.map((f) => path.basename(f, '.sql')).join(', ')}.`);
const run = spawnSync('bash', [path.join(REPO, 'scripts/dry-run-on-test.sh'), ...pending, file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
fs.rmSync(dir, { recursive: true, force: true });
const output = `${run.stdout || ''}${run.stderr || ''}`;
if (run.status !== 0 || !output.includes('Dry run finished and rolled back')) {
  console.log(output.split('\n').filter((l) => !/^NOTICE:/.test(l)).join('\n').trim().slice(-4000));
  console.log('\nRules test could not run (see above). Nothing was kept on the test database.');
  process.exit(1);
}

const results = new Map();
for (const line of output.split('\n')) {
  const m = /^R\|(\d+)\|(.*)$/.exec(line);
  if (m) results.set(Number(m[1]), m[2]);
}

// ------------------------------------------------------------ judge
const ALLOWED_BY_RULES = ['23505', '23503']; // the rules let it in; a key stopped it
function judge(c, out) {
  if (out === 'skipped') return 'skipped';
  if (c.kind === 'scenario') return out === c.expected || (c.expected.startsWith('error ') && out.startsWith(`${c.expected}:`));
  const err = /^error (\w{5}): /.exec(out);
  if (err) {
    if (err[1] === '42501') return false;
    if (c.kind === 'call') return true; // it ran, then its own checks stopped it
    if ((c.action === 'add' || c.action === 'link') && ALLOWED_BY_RULES.includes(err[1])) return true;
    return 'unclear';
  }
  if (c.kind === 'call') return out === 'ran';
  return Number(out) > 0;
}

const describe = (c) => {
  const v = c.viewer.label;
  const whose = c.owner && (c.owner.key === c.viewer.key ? 'their own' : `${c.owner.label}'s`);
  if (c.action === 'scenario') return `Scenario: ${c.scenario}`;
  if (c.action === 'call') return `${v} calling ${c.fn}`;
  if (c.action === 'read others') return `${v} reading rows in ${c.table} that aren't theirs`;
  if (c.action === 'hand over') return `${v} handing their own ${c.table} row to ${c.owner.label}`;
  if (c.action === 'link') return `${v} adding a ${c.table} row that points at ${c.owner.label}'s ${c.target} row`;
  if (c.locked) return `${v} trying to ${c.action} ${c.action === 'add' ? 'a row in' : 'rows in'} ${c.table}`;
  if (c.action === 'add') return `${v} adding a ${c.table} row for ${c.owner.key === c.viewer.key ? 'themselves' : c.owner.label}`;
  return `${v} trying to ${c.action} ${whose} ${c.table} row`;
};

const unexpected = [];
const unclear = [];
const gapHits = new Map(KNOWN_GAPS.map((g) => [g.id, []]));
let passed = 0;
let skipped = 0;
for (const c of checks) {
  const out = results.get(c.id);
  if (out === undefined) { unclear.push({ c, out: 'no result' }); continue; }
  const allowed = judge(c, out);
  if (allowed === 'skipped') { skipped += 1; continue; }
  if (allowed === 'unclear') { unclear.push({ c, out }); continue; }
  if (c.kind === 'scenario') {
    if (allowed) passed += 1;
    else unexpected.push({ c, out, scenario: true });
    continue;
  }
  c.allowed = allowed;
  if (allowed === c.expected) { passed += 1; continue; }
  const gap = KNOWN_GAPS.find((g) => g.match(c));
  if (gap) gapHits.get(gap.id).push(c);
  else unexpected.push({ c, out });
}

const lines = [];
const per = new Map();
for (const c of checks) {
  const k = c.table || (c.kind === 'scenario' ? 'scenarios' : 'functions');
  per.set(k, (per.get(k) || 0) + 1);
}
lines.push(`Rules test on the test database: ${checks.length} checks, as ${PEOPLE.map((p) => p.label).join(', ')}.`);
lines.push(`Tables and functions checked (${per.size}): ${[...per.keys()].join(', ')}.`);
if (skipped) lines.push(`Skipped ${skipped} checks for parts not on this database yet.`);
lines.push('');

for (const g of KNOWN_GAPS) {
  const hits = gapHits.get(g.id);
  if (!hits.length) continue;
  lines.push(`KNOWN GAP (found, not fixed): ${g.text}`);
  const shown = [...new Set(hits.map(describe))];
  for (const d of shown.slice(0, 8)) lines.push(`  - allowed: ${d}`);
  if (shown.length > 8) lines.push(`  - and ${shown.length - 8} more like these`);
  lines.push('');
}
const closed = KNOWN_GAPS.filter((g) => !gapHits.get(g.id).length);
for (const g of closed) {
  lines.push(`KNOWN GAP NO LONGER FOUND: ${g.id}. If it was fixed, take it out of KNOWN_GAPS in tests/rules/config.mjs.`);
}
for (const { c, out, scenario } of unexpected) {
  lines.push(scenario
    ? `UNEXPECTED: ${describe(c)}: expected ${c.expected}, got ${out}.`
    : `UNEXPECTED: ${describe(c)} was ${c.allowed ? 'allowed' : 'refused'}, but config.mjs says it should be ${c.expected ? 'allowed' : 'refused'} (the database said: ${out}).`);
}
for (const { c, out } of unclear) {
  lines.push(`UNCLEAR: ${describe(c)}: the check itself went wrong (${out}). Fix the check in tests/rules/config.mjs.`);
}
const failed = unexpected.length + unclear.length + closed.length;
const gapCount = [...gapHits.values()].filter((h) => h.length).length;
lines.push(failed === 0
  ? `ALL RULES CHECKS PASSED: ${passed} checks matched (${SCENARIOS.length} scenarios), ${gapCount} known gaps reported above. Nothing was kept on the test database.`
  : `${failed} RULES ${failed === 1 ? 'CHECK' : 'CHECKS'} FAILED (listed above). ${passed} matched. Nothing was kept on the test database.`);
console.log(lines.join('\n'));
process.exit(failed === 0 ? 0 : 1);
