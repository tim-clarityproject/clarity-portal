// Tim, 25 Nov 2026: the hosted test project went over Supabase's free quota
// from browser suites and testers. Suites run on the local stand-in by default
// (tests/target.mjs), large seeds and load tests are refused when anything
// points at a hosted target (tests/hosted-guard.mjs), and the hosted project
// gets only the end-of-run smoke check (tests/smoke/hosted.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HOSTED_TEST_REF, hostedTargets, isHostedTarget, isLoadSqlFile, refuseHostedLoad } from '../hosted-guard.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
const codeOnly = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

test('hosted targets: the test project, any Supabase host and any address off this machine', () => {
  assert.equal(isHostedTarget(`https://${HOSTED_TEST_REF}.supabase.co`), true);
  assert.equal(isHostedTarget('https://abcdefghijklmnopqrst.supabase.co'), true);
  assert.equal(isHostedTarget('postgresql://postgres.x:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres'), true);
  assert.equal(isHostedTarget('https://clarity-portal-git-feature.vercel.app'), true);
  assert.equal(isHostedTarget(`postgres://someone@db.${HOSTED_TEST_REF}.example:5432/x`), true);
});

test('local targets are never refused', () => {
  for (const v of ['http://127.0.0.1:54400', 'http://localhost:4317', 'http://[::1]:5173', 'postgres://postgres@127.0.0.1:54401/postgres', 'http://app.localhost:3000', '', undefined, null, '/tmp/base-scale.tar', '--only', '5']) {
    assert.equal(isHostedTarget(v), false, String(v));
  }
});

test('hostedTargets names the settings and arguments, never their values', () => {
  const secret = `postgresql://postgres:s3cret@db.${HOSTED_TEST_REF}.supabase.co:5432/postgres`;
  const hits = hostedTargets({ env: { DB_URL: secret, VITE_SUPABASE_URL: 'http://127.0.0.1:54400', APP_URL: 'http://localhost:4317' }, argv: ['--from', 'x.tar', `--url=https://${HOSTED_TEST_REF}.supabase.co`] });
  assert.deepEqual(hits, ['DB_URL', 'argument 3']);
  const message = refuseHostedLoad('A seed', { env: { DB_URL: secret }, argv: [], exit: false });
  assert.match(message, /^A seed refused: DB_URL points at the hosted test project/);
  assert.doesNotMatch(message, /s3cret|supabase\.co/);
  assert.deepEqual(hostedTargets({ env: { HOSTED: '1' }, argv: [] }), ['HOSTED=1']);
});

test('nothing hosted: no refusal', () => {
  assert.equal(refuseHostedLoad('A seed', { env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54400' }, argv: ['--from', 'a.tar'], exit: false }), null);
  assert.match(refuseHostedLoad('The old scale test', { always: 'it runs on the hosted test project', exit: false }), /refused: it runs on the hosted test project\./);
});

test('large seed and load SQL files are recognised', () => {
  for (const f of ['tests/scale/seed.sql', 'tests/scale/measure.sql', '/x/clarity-portal/tests/scale/seed/01-people.sql', 'tests/scale/guests.sql', 'tests/other/load-coaches.sql']) assert.equal(isLoadSqlFile(f), true, f);
  for (const f of ['supabase/migrations/065_agreements.sql', 'supabase/064_test.sql', 'scripts/seed-test-data.sql', 'supabase/manual/coach_test_roles.sql']) assert.equal(isLoadSqlFile(f), false, f);
});

test('every seed and load entry point calls the guard', () => {
  for (const f of ['seed.mjs', 'run.mjs', 'timing.mjs', 'first-screen-check.mjs', 'role-check.mjs', 'offline-reload.mjs', 'trace-first.mjs', 'explain.mjs']) {
    const text = readFileSync(join(ROOT, 'tests/scale', f), 'utf8');
    assert.match(text, /import \{ refuseHostedLoad \} from '\.\.\/hosted-guard\.mjs';/, f);
    assert.match(codeOnly(text), /^refuseHostedLoad\(/m, f);
  }
  assert.match(readFileSync(join(ROOT, 'scripts/check-dry-run-sql.mjs'), 'utf8'), /isLoadSqlFile\(file\)/);
});

test('the dry-run checker refuses a scale seed before anything is run', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check-dry-run-sql.mjs'), join(ROOT, 'tests/scale/seed.sql')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /large seed or load test/);
});

test('the old hosted scale test and a hosted load run stop with exit 3', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'tests/scale/run.mjs')], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(run.status, 3);
  assert.match(run.stderr, /refused/);
  const seed = spawnSync(process.execPath, [join(ROOT, 'tests/scale/seed.mjs'), '--from', 'x.tar'], { encoding: 'utf8', env: { PATH: process.env.PATH, VITE_SUPABASE_URL: `https://${HOSTED_TEST_REF}.supabase.co` }, cwd: join(ROOT, 'tests/scale') });
  assert.equal(seed.status, 3);
  assert.match(seed.stderr, /VITE_SUPABASE_URL points at the hosted test project/);
});

test('suites default to the local stand-in', async () => {
  const saved = process.env.HOSTED;
  delete process.env.HOSTED;
  try {
    const t = await import(`../target.mjs?local=${Date.now()}`);
    assert.equal(t.HOSTED, false);
    assert.equal(isHostedTarget(t.DB_ORIGIN), false);
    assert.equal(isHostedTarget(t.LOCAL_ACCOUNTS.TEST_SUPABASE_URL), false);
    assert.ok(Object.values(t.LOCAL_ACCOUNTS).every((v) => !String(v).includes(HOSTED_TEST_REF)));
    assert.equal(t.isTestDatabaseUrl(`https://${HOSTED_TEST_REF}.supabase.co`), false);
  } finally {
    if (saved !== undefined) process.env.HOSTED = saved;
  }
});

test('a suite not yet ported stops (exit 2, not run) without HOSTED=1', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { hostedAccountsText } from ${JSON.stringify(join(ROOT, 'tests/target.mjs'))}; hostedAccountsText(); console.log('ran');`], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /was not run: it uses the hosted test project/);
  assert.doesNotMatch(r.stdout, /ran/);
});

test('nothing but tests/target.mjs reads the accounts file, and no suite names the hosted project itself', () => {
  const allowedFile = new Set(['tests/target.mjs', 'tests/performance/hosted-guard.test.mjs']);
  const allowedRef = new Set(['tests/hosted-guard.mjs', 'tests/phase4/offline.mjs', 'tests/performance/clear-on-sign-out.test.mjs', 'tests/performance/hosted-guard.test.mjs']);
  const readers = [];
  const naming = [];
  for (const p of [...walk(join(ROOT, 'tests')), ...walk(join(ROOT, 'scripts'))]) {
    const rel = relative(ROOT, p);
    const code = codeOnly(readFileSync(p, 'utf8'));
    if (code.includes('.clarity-test-accounts.env') && !allowedFile.has(rel)) readers.push(rel);
    if (code.includes(HOSTED_TEST_REF) && !allowedRef.has(rel)) naming.push(rel);
  }
  assert.deepEqual(readers, [], 'these read the accounts file directly instead of through tests/target.mjs');
  assert.deepEqual(naming, [], 'these name the hosted test project instead of taking it from tests/target.mjs');
});
