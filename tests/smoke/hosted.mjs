// The hosted test project's smoke check, once at the end of a run (Tim, 25 Nov
// 2026). Every other suite runs on the local stand-in (tests/target.mjs);
// this is the one short, read-mostly visit to clarity-portal-test, which went
// over Supabase's free quota from suites and testers.
//
//   HOSTED=1 APP_URL=<the app built or served against the test project> \
//     node --import ./tests/scores/register.mjs tests/smoke/hosted.mjs [--coach]
//
// What it does, in one browser, one size, light mode:
//   - signs in as the invented test client (the accounts file, never printed);
//   - opens one page per area: Home, Personal, Interpersonal, Strategic, My plans,
//     This week, My Account;
//   - makes one PDF (the first saved meeting plan's Download PDF, light) when
//     the client has one, without saving it anywhere;
//   - with --coach, signs in as the test coach-owner and opens the coach portal's
//     Today (the page is shown a stand-in authenticator, as the coach suites do).
// Nothing is written: every write to the test project (anything but GET,
// HEAD and OPTIONS, apart from signing in and the reads sent as POST) is
// answered here and never sent; /api/ calls are answered here; every other
// host is blocked. It prints what it asked for and how many bytes came back.
import { chromium } from 'playwright';
import { accountsEnv, HOSTED, TEST_HOSTNAME, isTestDatabaseUrl } from '../target.mjs';
import { asAal2 } from '../signin/aal2.mjs';

if (!HOSTED) {
  console.log('The hosted smoke check runs only with HOSTED=1 (it is the one end-of-run visit to the hosted test project).');
  process.exit(2);
}
const APP = (process.env.APP_URL || 'http://localhost:4317').replace(/\/$/, '');
const COACH = process.argv.includes('--coach');
const env = accountsEnv();
if (!isTestDatabaseUrl(env.TEST_SUPABASE_URL)) throw new Error('Not the test project.');

const READ_RPC = /\/rest\/v1\/rpc\/(coach_auth_state|guest_claim|alignment_claim)(\?|$)/;
const AREAS = [
  ['Home', '/welcome'],
  ['Personal', '/personal'],
  ['Interpersonal', '/interpersonal'],
  ['Strategic', '/strategic'],
  ['My plans', '/my-plans'],
  ['This week', '/performance-sprint'],
  ['My Account', '/my-account'],
];

let passed = 0;
const failed = [];
const pass = (what, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ok   ${what}`); return; }
  failed.push(what);
  console.log(`  FAIL ${what}${detail ? `: ${detail}` : ''}`);
};
const traffic = { requests: 0, bytes: 0, blocked: 0, answered: 0 };

async function guardContext(context) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === new URL(APP).origin) {
      if (url.pathname.startsWith('/api/')) { traffic.answered += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }); }
      return route.fallback();
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.fallback();
    if (url.hostname !== TEST_HOSTNAME) { traffic.blocked += 1; return route.abort(); }
    const method = req.method();
    const signIn = url.pathname.startsWith('/auth/v1/');
    if (!signIn && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !READ_RPC.test(url.pathname)) {
      // A write: answered here, never sent.
      traffic.answered += 1;
      return route.fulfill({ status: method === 'POST' ? 201 : 204, contentType: 'application/json', body: method === 'POST' ? '[]' : '' });
    }
    if (/guest_claim|alignment_claim/.test(url.pathname)) { traffic.answered += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '0' }); }
    traffic.requests += 1;
    return route.fallback();
  });
  context.on('response', async (res) => {
    try {
      if (new URL(res.url()).hostname !== TEST_HOSTNAME) return;
      const len = Number(res.headers()['content-length']);
      traffic.bytes += Number.isFinite(len) ? len : (await res.body()).length;
    } catch { /* gone */ }
  });
}

async function signIn(page, email, password, coach = false) {
  await page.goto(`${APP}${coach ? '/coach/sign-in' : '/auth/login'}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  // ---- the client
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', serviceWorkers: 'block', acceptDownloads: true });
  await guardContext(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await signIn(page, env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  const home = await page.waitForURL(/\/welcome/, { timeout: 30000 }).then(() => true, () => false);
  pass('the test client signs in and lands on Home', home);
  if (home) {
    for (const [name, path] of AREAS) {
      const res = await page.goto(`${APP}${path}`, { waitUntil: 'domcontentloaded' });
      const h1 = await page.locator('h1').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
      const loadError = await page.getByText(/needs a connection|didn.t load|Something went wrong/i).count();
      pass(`${name} (${path}) opens with its title`, Boolean(res?.ok()) && h1 && loadError === 0, `status ${res?.status()}`);
    }
    // ---- one PDF
    await page.goto(`${APP}/my-plans`);
    const plan = page.locator('a[href*="meeting-summary"], [data-kind="plan_meeting"]').first();
    const saved = await page.getByText(/kick-off|review/i).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (saved && await plan.count()) {
      await plan.click();
      await page.waitForURL(/meeting-summary/, { timeout: 15000 }).catch(() => {});
    } else if (saved) {
      await page.getByText(/kick-off|review/i).first().click();
      await page.waitForURL(/meeting-summary/, { timeout: 15000 }).catch(() => {});
    }
    const button = page.getByRole('button', { name: /^download pdf$/i });
    if (await button.waitFor({ timeout: 15000 }).then(() => true, () => false)) {
      await button.click();
      await page.getByRole('button', { name: /^Light, for/ }).first().click().catch(() => {});
      const download = await page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
      const path = download ? await download.path().catch(() => null) : null;
      pass('one PDF: the saved meeting plan downloads', Boolean(path && download.suggestedFilename().endsWith('.pdf')));
    } else {
      console.log('  note one PDF: the test client has no saved meeting plan on the test project, so no PDF was made');
    }
  }
  pass('no page error on the client\'s pages', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();

  // ---- the coach (optional)
  if (COACH) {
    const cctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', serviceWorkers: 'block' });
    await guardContext(cctx);
    const cpage = await cctx.newPage();
    await asAal2(cpage, { host: TEST_HOSTNAME, totpKey: env.TEST_COACH_OWNER_TOTP_KEY || null });
    await signIn(cpage, env.TEST_COACH_OWNER_EMAIL, env.TEST_COACH_OWNER_PASSWORD, true);
    const today = await cpage.locator('.cc-app').first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    pass('the test coach-owner signs in and the coach portal opens', today);
    await cctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nHosted smoke check: ${passed} passed, ${failed.length} failed. ${traffic.requests} requests reached the test project (${Math.round(traffic.bytes / 1024)} KB back); ${traffic.answered} writes and /api/ calls answered here; ${traffic.blocked} other hosts blocked.`);
if (failed.length) process.exitCode = 1;
