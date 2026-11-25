// The guard that keeps large seeds and load tests off hosted databases
// (Tim, 25 Nov 2026: the hosted test project went over Supabase's free quota,
// egress 7.7 of 5 GB and logs 6.9 of 1 GB in one cycle, almost all from
// browser suites and testers). Large seeds, scale runs and load tests run on
// the local stand-in only (tests/scale/stack.mjs); the hosted test project
// gets a short smoke check at the end of a run (tests/smoke/hosted.mjs).
//
// Called where every seed or load starts: tests/scale/seed.mjs, run.mjs,
// timing.mjs and the other tests/scale tools, scripts/dry-run-on-test.sh
// (through check-dry-run-sql.mjs) and the standing-account seeds under
// HOSTED=1. Names of settings are reported, never their values (DB_URL holds
// a password).

/** The hosted test project (clarity-portal-test). */
export const HOSTED_TEST_REF = 'gqtqljngeenqzxneucoc';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** True when a value names a hosted database or a hosted copy of the app: the test project, any Supabase host, or any web or Postgres address that isn't this machine. */
export function isHostedTarget(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (text.includes(HOSTED_TEST_REF)) return true;
  if (/\bsupabase\.(co|com|net|in)\b/i.test(text)) return true;
  let url;
  try { url = new URL(text); } catch { return false; }
  if (!/^(https?|postgres|postgresql|wss?):$/.test(url.protocol)) return false;
  return !LOCAL_HOSTS.has(url.hostname) && !url.hostname.endsWith('.localhost');
}

/** The settings a seed or load could reach a database or app through. */
export const TARGET_SETTINGS = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'TEST_SUPABASE_URL', 'LOCAL_SUPABASE_URL', 'DB_URL', 'DATABASE_URL', 'APP_URL', 'BASE_URL', 'SCALE_URL'];

/**
 * The names (never the values) of what points at a hosted target: settings in
 * `env`, and command-line values in `argv` (shown as "argument N").
 */
export function hostedTargets({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const hits = [];
  for (const name of TARGET_SETTINGS) if (isHostedTarget(env[name])) hits.push(name);
  argv.forEach((value, i) => {
    const v = String(value).replace(/^--[a-z-]+=/i, '');
    if (isHostedTarget(v)) hits.push(`argument ${i + 1}`);
  });
  if (env.HOSTED === '1') hits.push('HOSTED=1');
  return hits;
}

/** The message a refused run prints. */
export function refusal(what, hits, always = null) {
  const why = always ? `${always}` : `${hits.join(', ')} point${hits.length === 1 ? 's' : ''} at the hosted test project (or another hosted target)`;
  return `${what} refused: ${why}. `
    + 'Large seeds, scale runs and load tests run on the local stand-in only (tests/scale/stack.mjs, README there); '
    + 'the hosted project gets only the end-of-run smoke check (tests/smoke/hosted.mjs). Tim, 25 Nov 2026: it went over its free quota.';
}

/**
 * Stops the run (exit 3) when anything points at a hosted target. `always`
 * names why the tool itself is hosted (for a tool that only ever runs there).
 * `exit: false` returns the message instead, for tests.
 */
export function refuseHostedLoad(what, { env = process.env, argv = process.argv.slice(2), always = null, exit = true } = {}) {
  const hits = always ? [always] : hostedTargets({ env, argv });
  if (!hits.length) return null;
  const message = refusal(what, hits, always);
  if (!exit) return message;
  console.error(message);
  process.exit(3);
}

/** SQL files that are large seeds or load tests (refused by scripts/dry-run-on-test.sh). */
export function isLoadSqlFile(path) {
  const p = String(path).replace(/\\/g, '/');
  return /(^|\/)tests\/scale\//.test(p) || (/(^|\/)tests\//.test(p) && /(^|\/)(seed|measure|load)[^/]*\.sql$/i.test(p));
}
