// Where the browser suites and testers run (Tim, 25 Nov 2026).
//
// By default every suite runs on the LOCAL STAND-IN (tests/scale/stack.mjs:
// PGlite + PostgREST + a small GoTrue stand-in on this machine), never on the
// hosted test project, which went over Supabase's free quota (egress 7.7 of
// 5 GB, logs 6.9 of 1 GB in one cycle) almost entirely from suites and
// testers. HOSTED=1 points a suite at the hosted test project instead: only
// for the short end-of-run smoke check (tests/smoke/hosted.mjs) or a suite
// that truly needs real Supabase, once, never in a loop.
//
// The local stand-in, once per machine (README in tests/scale):
//   cd tests/scale && npm install
//   node db.mjs --base <scratch>/base.tar                       (migrations 024 on)
//   node seed.mjs --from <scratch>/base.tar --to <scratch>/base-suites.tar --only 5
//   POSTGREST_BIN=<path>/postgrest node stack.mjs --snapshot <scratch>/base-suites.tar --port 54400
// and the app built or served against it:
//   VITE_SUPABASE_URL=http://127.0.0.1:54400 VITE_SUPABASE_ANON_KEY=<printed by stack.mjs with SCALE_PRINT_ANON=1>
//
// Suites read their accounts through accountsText() (ported to the stand-in)
// or hostedAccountsText() (not ported yet: opt-in with HOSTED=1). Nothing
// else reads ~/.clarity-test-accounts.env (tests/performance/hosted-guard.test.mjs).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ANON_KEY, PASSWORD } from './scale/local-keys.mjs';
import { HOSTED_TEST_REF } from './hosted-guard.mjs';

export const HOSTED = process.env.HOSTED === '1';
export const LOCAL_URL = (process.env.LOCAL_SUPABASE_URL || 'http://127.0.0.1:54400').replace(/\/$/, '');

/** The database's origin, host (with port) and hostname, for the suites' request filters. */
export const DB_ORIGIN = HOSTED ? `https://${HOSTED_TEST_REF}.supabase.co` : new URL(LOCAL_URL).origin;
export const TEST_HOST = new URL(DB_ORIGIN).host;
export const TEST_HOSTNAME = new URL(DB_ORIGIN).hostname;

/**
 * The four standing accounts on the local stand-in (tests/scale/seed/05-standing-accounts.sql).
 * The TOTP keys are made-up stand-ins: the local GoTrue stand-in takes any six-digit code
 * from a coach with an authenticator, so the coaches reach aal2 the real way (challenge, verify).
 */
export const LOCAL_ACCOUNTS = {
  TEST_SUPABASE_URL: LOCAL_URL,
  TEST_SUPABASE_ANON_KEY: ANON_KEY,
  TEST_COACH_OWNER_EMAIL: 'local-coach-owner@example.com',
  TEST_COACH_OWNER_PASSWORD: PASSWORD,
  TEST_COACH_OWNER_TOTP_KEY: 'JBSWY3DPEHPK3PXP',
  TEST_COACH_TWO_EMAIL: 'local-coach-two@example.com',
  TEST_COACH_TWO_PASSWORD: PASSWORD,
  TEST_COACH_TWO_TOTP_KEY: 'JBSWY3DPEHPK3PXP',
  TEST_CLIENT_EMAIL: 'local-client@example.com',
  TEST_CLIENT_PASSWORD: PASSWORD,
  TEST_ORG_CLIENT_EMAIL: 'local-org-client@example.com',
  TEST_ORG_CLIENT_PASSWORD: PASSWORD,
};

const ACCOUNTS_FILE = join(homedir(), '.clarity-test-accounts.env');
let told = false;

function say(line) {
  if (told) return;
  told = true;
  console.log(line);
}

/** True when a URL is the database this run is meant for. */
export function isTestDatabaseUrl(url) {
  try { return new URL(String(url)).origin === DB_ORIGIN; } catch { return false; }
}

function standInAnswers() {
  try {
    const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', `${LOCAL_URL}/auth/v1/health`], { encoding: 'utf8' });
    return code.trim() === '200';
  } catch { return false; }
}

/**
 * The accounts as the text of an env file (KEY=value lines), for the suites'
 * own parsers: the local stand-in's by default, the hosted file's with HOSTED=1.
 * Locally it stops with how to start the stand-in when nothing answers.
 */
export function accountsText() {
  if (HOSTED) {
    say('HOSTED=1: this run uses the hosted test project. Keep it to the end-of-run smoke check or one needed suite (Tim, 25 Nov: the project is over its free quota).');
    return readFileSync(ACCOUNTS_FILE, 'utf8');
  }
  if (process.env.TARGET_SKIP_PROBE !== '1' && !standInAnswers()) {
    console.log(`Nothing answers at ${LOCAL_URL}. The suites run on the local stand-in by default (Tim, 25 Nov 2026).`);
    console.log('Start it (tests/scale/README.md): POSTGREST_BIN=<path>/postgrest node tests/scale/stack.mjs --snapshot <base-suites.tar> --port 54400');
    console.log('(the snapshot made with: node tests/scale/seed.mjs --from <base.tar> --to <base-suites.tar> --only 5), and build the app against it.');
    console.log('Or set HOSTED=1 to use the hosted test project, only for a smoke check or a suite that truly needs it.');
    process.exit(2);
  }
  say(`Local stand-in at ${LOCAL_URL} (the default since 25 Nov; HOSTED=1 for the hosted test project).`);
  return Object.entries(LOCAL_ACCOUNTS).map(([k, v]) => `${k}=${v}`).join('\n');
}

/** The accounts as an object. */
export function accountsEnv() {
  const env = {};
  for (const line of accountsText().split('\n')) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  if (!isTestDatabaseUrl(env.TEST_SUPABASE_URL)) throw new Error(HOSTED ? 'Not the test project.' : 'Not the local stand-in.');
  return env;
}

/**
 * For a suite not yet ported to the local stand-in: the hosted accounts with
 * HOSTED=1; otherwise it stops (exit 2, "not run") and says how to run it.
 */
export function hostedAccountsText(fileUrl, why = 'it is not ported to the local stand-in yet') {
  const name = fileUrl ? relative(process.cwd(), fileURLToPath(fileUrl)) : 'This suite';
  if (!HOSTED) {
    console.log(`${name} was not run: it uses the hosted test project (${why}).`);
    console.log(`Since 25 Nov 2026 that is opt-in (Tim: the project is over its free quota): HOSTED=1 node ... ${name}, once, never in a loop.`);
    process.exit(2);
  }
  return accountsText();
}

/** For a suite that truly needs real Supabase: stops unless HOSTED=1. */
export function needsHosted(fileUrl, why) {
  if (!HOSTED) hostedAccountsText(fileUrl, why);
}
