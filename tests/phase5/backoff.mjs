// Phase 5 follow-up, Step 2 in the running app (Tim, 5 Nov, 22:28): when
// the database doesn't answer, an open tab never floods it. TEST database
// only; every other host, /functions/v1/, /api/ and every email call is
// blocked. The test client's Home is used; today's Water log is the save.
//   node --import ./tests/scores/register.mjs tests/phase5/backoff.mjs [folder]
//
// Every write to /rest/v1/ is answered 503 ("Service Unavailable", as the
// gateway answers for a database that is down), reads go through. Then:
//   1. one change, then more changes while it waits: the writes the page
//      tries are counted over 45 seconds and must slow down (about 2, 4, 8,
//      16 seconds apart), never one per change; the page says Will sync and
//      shows no error;
//   2. the tab hidden for 40 seconds: no write at all;
//   3. shown again: one try at once;
//   4. the database answers again: the latest value lands, once.
// Today's Water log is put back as it was at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const out = process.argv[2] || join(process.cwd(), 'tmp-backoff');
mkdirSync(out, { recursive: true });

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? `: ${String(detail).slice(0, 300)}` : ''}`); console.error(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const note = (s) => results.push(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(250); } return v; }

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
const me = s.user.id;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { data: sh } = await db.from('sprint_habits').select('id').eq('user_id', me).eq('name', 'Water');
const ids = (sh || []).map((x) => x.id);
const waterNow = async () => (await db.from('habit_logs').select('id, value').in('sprint_habit_id', ids).eq('local_date', today)).data || [];
const before = await waterNow();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
await context.route(/\/auth\/v1\/(signup|recover|otp|magiclink|invite|resend)|\/api\/.*|\/functions\/v1\//, (r) => r.abort());
let down = false;
const writes = [];
await context.route('**/*', (route) => {
  const req = route.request();
  const url = req.url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (down && url.includes('/rest/v1/') && req.method() !== 'GET' && req.method() !== 'HEAD') {
    writes.push(Date.now());
    return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' });
  }
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', (e) => pass('no page errors', false, e.message));
const errorShown = async () => (await page.locator('.ds-toast--error, [role=alert]').count()) > 0;
const setHidden = (hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

try {
  if (!ids.length) throw new Error('The test client has no Water habit.');
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => ['/welcome', '/auth/welcome-back'].includes(new URL(u).pathname), { timeout: 30000 });
  if (new URL(page.url()).pathname === '/auth/welcome-back') await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((u) => new URL(u).pathname === '/welcome', { timeout: 30000 });
  const box = page.getByLabel('Water today').first();
  await box.waitFor({ timeout: 30000 });
  await sleep(6000); // the first visit's quiet reads and warming settle

  // 1. The database stops answering writes.
  down = true;
  const t0 = Date.now();
  await box.fill('1.1');
  await box.blur();
  // More changes while it waits: each would be a write without the back-off.
  for (const v of ['1.2', '1.3', '1.4', '1.5', '1.6']) {
    await sleep(3000);
    await box.fill(v);
    await box.blur();
  }
  await sleep(45000 - (Date.now() - t0));
  const gaps = writes.slice(1).map((t, i) => t - writes[i]);
  pass('1. writes while the database is down: few, never one per change', writes.length >= 2 && writes.length <= 7, `${writes.length} writes in 45s: gaps ${gaps.map((g) => `${(g / 1000).toFixed(1)}s`).join(', ')}`);
  pass('1. the retries slow down (each gap longer than the one before, allowing the randomness)', gaps.length >= 2 && gaps.slice(1).every((g, i) => g > gaps[i] * 1.2), gaps.map((g) => `${(g / 1000).toFixed(1)}s`).join(', '));
  pass('1. no error shown, only a calm wait', !(await errorShown()));

  // 2. Hidden for 40 seconds: nothing at all.
  await setHidden(true);
  const hiddenFrom = writes.length;
  await sleep(40000);
  pass('2. a hidden tab sends nothing', writes.length === hiddenFrom, `${writes.length - hiddenFrom} write(s) while hidden`);

  // 3. Shown again: one try at once.
  await setHidden(false);
  await sleep(1500);
  pass('3. shown again: one try at once', writes.length === hiddenFrom + 1, `${writes.length - hiddenFrom} write(s)`);

  // 4. The database answers again: the latest value lands once (the
  // next retry, or the page shown again).
  down = false;
  await setHidden(true);
  await setHidden(false);
  const landed = await until(async () => (await waterNow()).some((r) => Number(r.value) === 1.6), 30000);
  pass('4. back up: the latest change lands', Boolean(landed), JSON.stringify(await waterNow()));
  const rows = await waterNow();
  pass('4. ... once (one row for today)', rows.length === 1, JSON.stringify(rows));
  await page.screenshot({ path: join(out, 'backoff-home.png') });
  note(`writes counted while down: ${writes.length}, first at +${((writes[0] - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  pass('the run finished', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  // Today's Water log as it was.
  if (before.length) {
    for (const r of before) await db.from('habit_logs').update({ value: r.value }).eq('id', r.id);
    note(`today's Water log put back to ${before.map((r) => r.value).join(', ')}`);
  } else await db.from('habit_logs').delete().in('sprint_habit_id', ids).eq('local_date', today);
}
console.log(results.join('\n'));
const counted = results.filter((r) => !r.startsWith('NOTE'));
console.log(`\n${counted.length - failures} of ${counted.length} passed`);
process.exit(failures ? 1 : 0);
