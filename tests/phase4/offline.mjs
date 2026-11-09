// Phase 4 step 8: the portal opens with no connection ("Works on a flight").
// A real production build (vite build, with the service worker) of this
// branch on the TEST database only, served like Vercel by
// tests/phase4/serve-build.mjs, signed in as the invented test client.
// Every other host and every email call is blocked; /api/ is never served.
//
//   node --import ./tests/scores/register.mjs tests/phase4/offline.mjs [folder for the builds]
//
// In Chromium AND WebKit:
// 1. After one online visit in a fresh profile, offline: the portal opens
//    from the start URL "/" and shows Today, the sprint and the plan, plus
//    Plan my day, Review my day, the debrief, My Plans, My Reviews and a
//    tool never opened, all as last seen; a page never opened with no copy
//    yet says calmly that it needs a connection the first time.
// 2. Offline: a day's logging (Home), Plan my day and Review my day. The
//    access token is then made expired (a long flight), and back online the
//    sign-in refreshes first, then each save is sent exactly once (every
//    write request is recorded, and the database checked).
// 3. An update: a second build with a changed version while a draft is
//    being typed and a save waits in the queue. No reload mid-typing (the
//    page visible, then hidden with the cursor in the box); it takes over
//    once the page is hidden and nobody is typing, and the draft and the
//    queue survive. Then an old app opening after the update (every window
//    closed): the new version, with the draft and the queued save.
// 4. The outside Health Check is untouched: the same response with and
//    without the portal's worker, nothing it loads comes from the worker,
//    and the Health Check never registers one.
// 5. The dashboard and the check-in (Phase 5): after one online visit in a
//    fresh profile (neither page opened), offline both open as last seen
//    from the device's warmed copies, the whole check-in is done and
//    finished, nothing reaches the database, and back online it is sent
//    exactly once: one finished row with every answer, no duplicate write.
//
// Offline is the browser's own offline mode in Chromium. WebKit's offline
// mode in Playwright stops every navigation before a service worker can
// answer it, so in WebKit "no signal" is the server and the pass-through
// to the database dropping every connection instead (the device itself
// still says online, like a plane's WiFi with no internet).
//
// The clock is fixed (tests/phase2/fixed-day.mjs). The seed is built around
// the fixed day; what the test adds is deleted, and the test client is put
// back on the real today at the end (plan v3.2, Sprint 1).
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, fixClock, fixedLabel, seedFixed, seedForReal } from '../phase2/fixed-day.mjs';
import { proxyTo, serveBuild } from './serve-build.mjs';
import { checkinMonth } from '../../src/lib/performance/checkin.js';

const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const PORT = Number(process.env.OFFLINE_PORT || 4175);
const DB_PORT = PORT + 1;
// The builds talk to the test database through a pass-through on this
// machine (serve-build.mjs proxyTo), which only ever forwards to the test
// project: the test can drop the database's connection in any browser,
// and sees every request.
const DB_URL = `http://127.0.0.1:${DB_PORT}`;
const BUILDS = process.argv[2] || join(tmpdir(), 'clarity-offline-builds');
mkdirSync(BUILDS, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(String(n));
const BROWSERS = (process.env.BROWSERS || 'chromium,webkit').split(',');

const results = [];
const notes = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = signIn.user.id;
const today = FIXED_TODAY;
console.log(`Fixed day: ${fixedLabel()}`);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000, every = 300) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return v;
}

// ---------------------------------------------------------------- the builds
// Two production builds on the test project, with different versions.
function buildApp(dir, version) {
  execFileSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir'], {
    stdio: 'pipe',
    env: { ...process.env, VITE_SUPABASE_URL: DB_URL, VITE_SUPABASE_ANON_KEY: env.TEST_SUPABASE_ANON_KEY, VERCEL_GIT_COMMIT_SHA: version, VERCEL_ENV: '' },
  });
  const js = readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8'));
  if (!js.some((t) => t.includes(DB_URL))) throw new Error('The build is not on the pass-through to the test project.');
  if (js.some((t) => /https:\/\/(?!gqtqljngeenqzxneucoc)[a-z]{20}\.supabase\.co/.test(t))) throw new Error('The build names another database.');
}
const DIST_A = join(BUILDS, 'a');
const DIST_B = join(BUILDS, 'b');
// REUSE_BUILDS=1 keeps the last run's builds (for a rerun of one part).
if (process.env.REUSE_BUILDS !== '1' || !existsSync(join(DIST_B, 'sw.js'))) {
  console.log('Building version a and version b…');
  buildApp(DIST_A, 'offline-test-a');
  buildApp(DIST_B, 'offline-test-b');
}
const scriptOf = (dir) => /src="(\/assets\/index-[^"]+\.js)"/.exec(readFileSync(join(dir, 'index.html'), 'utf8'))[1];
const SCRIPT_A = scriptOf(DIST_A);
const SCRIPT_B = scriptOf(DIST_B);
pass('the two builds are different versions', SCRIPT_A !== SCRIPT_B);
const sw = readFileSync(join(DIST_A, 'sw.js'), 'utf8');
const list = JSON.parse(sw.slice(sw.indexOf('=') + 1, sw.indexOf(';\n')));
pass('sw.js lists the app shell, the fonts and the brand images', list.precache.includes('/index.html') && list.precache.includes('/fonts/Nekst-Regular.woff2') && list.precache.includes('/brand/logomark-negative.png') && list.precache.includes(SCRIPT_A));
pass('sw.js leaves out the Health Check, version.json and the design gallery', !list.precache.some((f) => /health-check|healthCheck|version\.json|designReference|mount-|\.mp4|\.vtt/.test(f)), list.precache.filter((f) => /health|version|design|mp4|vtt/.test(f)).join(', '));

const srv = await serveBuild({ root: DIST_A, port: PORT });
const APP = srv.url;
const dbProxy = await proxyTo({ target: env.TEST_SUPABASE_URL, port: DB_PORT });

// ---------------------------------------------------------------- the data
const WATER_A = 1.5;
const WATER_B = 2;
async function waterLog() {
  const { data: sh } = await db.from('sprint_habits').select('id').eq('user_id', me).eq('name', 'Water');
  const ids = (sh || []).map((x) => x.id);
  if (!ids.length) return null;
  const { data } = await db.from('habit_logs').select('value').in('sprint_habit_id', ids).eq('local_date', today);
  return data?.length ? data.map((r) => Number(r.value)) : [];
}
async function cleanDay() {
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
  await db.from('day_reviews').delete().eq('user_id', me).eq('local_date', today);
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'plan_my_day']);
  const { data: sh } = await db.from('sprint_habits').select('id').eq('user_id', me);
  const ids = (sh || []).map((x) => x.id);
  if (ids.length) await db.from('habit_logs').delete().in('sprint_habit_id', ids).eq('local_date', today);
}

process.on('uncaughtException', async (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  console.log(results.join('\n'));
  try { await cleanDay(); seedForReal('--reset'); } catch { /* reported above */ }
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

seedFixed('--reset');
await cleanDay();

// ---------------------------------------------------------------- the browser
// "No signal": Chromium's offline mode; in WebKit the server and the
// database drop every connection (see the top).
async function newContext(kind) {
  const browser = await (kind === 'webkit' ? webkit : chromium).launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await fixClock(context);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  // Requests to the database, from now on (the pass-through's record).
  const state = {
    from: 0,
    mark() { this.from = dbProxy.hits.length; },
    get requests() { return dbProxy.hits.slice(this.from).filter((h) => h.write || /\/auth\/v1\/token/.test(h.url)); },
  };
  const page = await context.newPage();
  page.on('pageerror', (e) => notes.push(`${kind} page error: ${e.message.split('\n')[0]}`));
  const offline = async (on) => {
    if (kind === 'webkit') {
      srv.setDown(on);
      dbProxy.setDown(on);
    } else {
      await context.setOffline(on);
    }
  };
  return { browser, context, page, state, offline };
}

async function signInPage(page) {
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
}

const controlled = (page) => page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
const cacheKey = (name) => `clarity-cache:${me}:${name}`;
const WARMED = ['performance-plan', 'performance-plan-head', 'performance-sprint', `home-day:${today}`, `day-plan:${today}`, `day-review:${today}`, 'debrief:now', 'saved-plans', 'saved-reviews', 'checkins', 'checkin-page', 'performance-dashboard', 'performance-patterns'];
const queued = (page) => page.evaluate((id) => {
  const q = JSON.parse(localStorage.getItem(`clarity-queue:${id}`) || '[]');
  const s = JSON.parse(localStorage.getItem(`clarity-sending:${id}`) || '[]');
  return q.length + s.length;
}, me);
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const bodyText = (page) => page.locator('body').innerText();
const FIRST_OPEN = 'This page needs a connection the first time it opens on this device, so try again when you’re back online.';

async function next(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click({ timeout: 5000 });
    if (await until(async () => (await heading(page)) !== before, 1500)) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}

// Opens a page by its address (a full open, like a link from the Home Screen).
async function openPage(page, path, selector) {
  await page.goto(`${APP}${path}`);
  return page.waitForSelector(selector, { timeout: 30000 }).then(() => true, () => false);
}

// Plan my day, start to Set my day, with the fewest answers.
async function planMyDay(page) {
  await openPage(page, '/my-day/plan', '.ds-guide-question');
  for (let i = 0; i < 14; i += 1) {
    const h = await heading(page);
    const body = page.locator('.ds-guide-body');
    if (/^Here’s your day/.test(h)) {
      return until(async () => {
        if (!/\/my-day\/plan/.test(new URL(page.url()).pathname)) return true;
        await page.getByRole('button', { name: 'Set my day' }).click({ timeout: 2000 }).catch(() => null);
        return !/\/my-day\/plan/.test(new URL(page.url()).pathname);
      }, 15000);
    }
    if (h === 'How did you sleep last night?') {
      await page.getByRole('button', { name: 'Half an hour more' }).click();
      await page.getByRole('radio', { name: 'Good', exact: true }).click();
    } else if (h === 'What’s one thing you’re grateful for today?') {
      await body.locator('textarea').first().fill('A quiet flight with time to think.');
    } else if (h === 'How do you want to be today?') {
      await body.locator('textarea').first().fill('Steady');
    } else if (h === 'What will you do today?') {
      await page.locator('.ds-answer--pick').first().click();
      await until(async () => (await page.locator('.ds-answer--pick[aria-pressed="true"]').count()) >= 1, 5000);
    } else if (h === 'Which one is your highest priority?') {
      await body.getByRole('radio').first().click();
    } else if (h === 'Which Strategies does today serve most?') {
      await page.getByRole('button', { name: 'Grow through referrals' }).click();
    } else if (h === 'What’s the biggest risk to today?') {
      await body.locator('textarea').nth(0).fill('The connection drops before landing.');
      await body.locator('textarea').nth(1).fill('Keep working on the device.');
    }
    await next(page);
  }
  throw new Error(`Plan my day didn't reach its summary (last: "${await heading(page)}")`);
}

// Review my day, start to Work's done for today.
async function reviewMyDay(page) {
  await openPage(page, '/my-day/review', '.ds-guide-question');
  for (let i = 0; i < 14; i += 1) {
    const h = await heading(page);
    const body = page.locator('.ds-guide-body');
    if (h === 'Ready to close the day?') {
      return until(async () => {
        if ((await page.locator('.ds-end-title').count()) > 0) return true;
        await page.getByRole('button', { name: 'Close my day' }).click({ timeout: 2000 }).catch(() => null);
        return (await page.locator('.ds-end-title').count()) > 0;
      }, 15000);
    }
    if (/^On a scale of 1 to 10/.test(h)) {
      await page.getByRole('radio', { name: '7', exact: true }).click();
    } else if (h === 'What went well today?') {
      await body.locator('textarea').first().fill('Wrote the plan on the flight.');
    } else if (h === 'What would you do differently next time?') {
      await body.locator('textarea').first().fill('Download the papers before boarding.');
    } else if (h === 'What are the most important things to do tomorrow?') {
      await page.getByRole('textbox', { name: 'Priority 1 for tomorrow' }).fill('Send the board pack');
    }
    await next(page);
  }
  throw new Error(`Review my day didn't reach Close the day (last: "${await heading(page)}")`);
}

async function logWater(page, value) {
  await openPage(page, '/welcome', '.home-page .ds-page-title');
  const box = page.getByLabel('Water today').first();
  await box.waitFor({ timeout: 20000 });
  await box.fill(String(value));
  await box.blur();
}

// ---------------------------------------------------------------- 1 and 2: open offline, work offline, land
for (const kind of BROWSERS) {
  if (!part(1) && !part(2)) break;
  const tag = kind;
  const { browser, page, state, offline } = await newContext(kind);
  try {
    // One online visit in a fresh profile.
    await signInPage(page);
    pass(`${tag}: the first visit is looked after by the service worker`, Boolean(await until(() => controlled(page), 20000)));
    const warmed = await until(async () => {
      const keys = await page.evaluate(() => Object.keys(localStorage));
      const missing = WARMED.filter((n) => !keys.includes(cacheKey(n)));
      return missing.length === 0 ? true : null;
    }, 45000, 500);
    const missing = await page.evaluate((want) => want.filter((k) => localStorage.getItem(k) == null), WARMED.map(cacheKey));
    pass(`${tag}: after one visit the key pages' data is on the device (Home's day, the plan, the sprint, Plan and Review my day, the debrief, My Plans, My Reviews, the check-in, the dashboard and its patterns)`, Boolean(warmed), missing.join(', '));

    if (part(1)) {
      await offline(true);
      await page.goto('about:blank');
      const opened = await openPage(page, '/', '.home-page .ds-page-title');
      pass(`${tag}: offline, the start URL opens the portal`, opened);
      pass(`${tag}: offline, the start URL lands on Home`, new URL(page.url()).pathname === '/welcome', page.url());
      pass(`${tag}: offline, Home shows Today`, (await page.locator('.home-today').count()) === 1);
      pass(`${tag}: offline, Home shows the day's log`, (await page.getByLabel('Water today').count()) > 0);
      pass(`${tag}: offline, the calm offline line shows`, Boolean(await until(async () => (await page.locator('.ds-connection').count()) > 0, 20000)));
      pass(`${tag}: offline, the sprint opens with its score`, await openPage(page, '/performance-sprint', '.ds-sdial-big--score'));
      pass(`${tag}: offline, the plan opens with its Strategies`, await openPage(page, '/performance-plan', '.ds-page-title') && Boolean(await until(async () => (await bodyText(page)).includes('Grow through referrals'), 10000)));
      pass(`${tag}: offline, Plan my day opens`, await openPage(page, '/my-day/plan', '.ds-guide-question'));
      pass(`${tag}: offline, Review my day opens`, await openPage(page, '/my-day/review', '.ds-guide-question'));
      const debrief = await openPage(page, '/performance-sprint/debrief', '.ds-page-title, .ds-guide-question');
      pass(`${tag}: offline, the debrief opens without a load error`, debrief && !(await bodyText(page)).includes('didn’t load') && !(await bodyText(page)).includes(FIRST_OPEN), ((await bodyText(page)).match(/.{0,120}(didn’t load|needs a connection the first time).{0,60}/s) || [''])[0]);
      pass(`${tag}: offline, My Plans opens with its list`, await openPage(page, '/my-plans', '.ds-page-title') && !(await bodyText(page)).includes('didn’t load') && !(await bodyText(page)).includes(FIRST_OPEN));
      pass(`${tag}: offline, My Reviews opens with its list`, await openPage(page, '/my-reviews', '.ds-page-title') && !(await bodyText(page)).includes('didn’t load') && !(await bodyText(page)).includes(FIRST_OPEN));
      pass(`${tag}: offline, a tool never opened (Get unstuck) opens`, await openPage(page, '/get-unstuck', '.ds-page-title, .ds-guide-question, h1'));
      // Its own code file comes from the device; never opened, it has no copy of its data yet.
      await openPage(page, '/life-balance-review', '.plan-page');
      pass(`${tag}: offline, a lazily loaded tool never opened (Life balance review) opens and says it needs a connection the first time`, Boolean(await until(async () => (await bodyText(page)).includes(FIRST_OPEN), 20000)), (await bodyText(page)).slice(0, 300));
      await openPage(page, '/performance-sprint/year', '.ds-page-title');
      pass(`${tag}: offline, a page never opened with no copy says it needs a connection the first time`, Boolean(await until(async () => (await bodyText(page)).includes(FIRST_OPEN), 20000)), (await bodyText(page)).slice(0, 200));
      await offline(false);
    }

    if (part(2)) {
      await offline(true);
      await logWater(page, WATER_A);
      pass(`${tag}: offline, the day's log waits on the device`, Boolean(await until(async () => (await queued(page)) >= 1, 10000)));
      pass(`${tag}: offline, Plan my day finishes`, Boolean(await planMyDay(page).catch((e) => { notes.push(`${tag} plan: ${e.message}`); return false; })));
      pass(`${tag}: offline, Review my day finishes`, Boolean(await reviewMyDay(page).catch((e) => { notes.push(`${tag} review: ${e.message}`); return false; })));
      const waiting = await queued(page);
      pass(`${tag}: offline, every save waits on the device`, waiting >= 3, String(waiting));
      pass(`${tag}: nothing reached the database while offline`, (await waterLog())?.length === 0 && !(await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', today)).data?.length);
      // A long flight: the access token has expired by landing (the refresh token still works).
      await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('clarity-portal-auth'));
        raw.expires_at = Math.floor(Date.now() / 1000) - 600;
        raw.access_token = `${raw.access_token.split('.').slice(0, 2).join('.')}.expired`;
        localStorage.setItem('clarity-portal-auth', JSON.stringify(raw));
      });
      // Still signed in on the device, offline.
      await page.goto(`${APP}/welcome`);
      await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
      pass(`${tag}: an expired sign-in offline still opens signed in`, new URL(page.url()).pathname === '/welcome');
      state.mark();
      await offline(false);
      // Back online: refreshed first, then each save sent once.
      const landed = await until(async () => (await queued(page)) === 0, 150000, 1000);
      pass(`${tag}: back online, the queue empties`, Boolean(landed), String(await queued(page)));
      const firstRefresh = state.requests.findIndex((r) => /\/auth\/v1\/token\?grant_type=refresh_token/.test(r.url));
      const firstWrite = state.requests.findIndex((r) => r.write);
      pass(`${tag}: the sign-in refreshes before anything is sent`, firstRefresh >= 0 && firstWrite > firstRefresh, `refresh ${firstRefresh}, first write ${firstWrite}`);
      const writes = state.requests.filter((r) => r.write);
      const seen = new Map();
      for (const w of writes) {
        const k = `${w.method} ${w.url} ${w.body}`;
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      const twice = [...seen.entries()].filter(([, n]) => n > 1);
      pass(`${tag}: no save is sent twice`, twice.length === 0, twice.map(([k]) => k.slice(0, 120)).join(' | '));
      pass(`${tag}: the day's log arrived once`, Boolean(await until(async () => JSON.stringify(await waterLog()) === JSON.stringify([WATER_A]), 15000)), JSON.stringify(await waterLog()));
      const plans = (await db.from('day_plans').select('status, grateful_for, biggest_risk').eq('user_id', me).eq('local_date', today)).data || [];
      pass(`${tag}: the plan arrived once, set`, plans.length === 1 && plans[0].status === 'finished' && plans[0].grateful_for === 'A quiet flight with time to think.', JSON.stringify(plans));
      const reviews = (await db.from('day_reviews').select('status, went_well, tomorrow').eq('user_id', me).eq('local_date', today)).data || [];
      pass(`${tag}: the review arrived once, finished`, reviews.length === 1 && reviews[0].status === 'finished' && JSON.stringify(reviews[0].tomorrow || []).includes('Send the board pack'), JSON.stringify(reviews));
      const todos = (await db.from('todos').select('id').eq('user_id', me).eq('source', 'plan_my_day')).data || [];
      pass(`${tag}: no duplicate rows from the plan`, todos.length === new Set(todos.map((t) => t.id)).size);
      pass(`${tag}: still signed in after landing`, !/\/auth\//.test(new URL(page.url()).pathname));
      pass(`${tag}: "Saved" once everything is sent`, Boolean(await until(async () => (await page.locator('.ds-connection').count()) === 0, 15000)));
      await cleanDay();
    }
  } catch (e) {
    pass(`${tag}: parts 1 and 2 finished`, false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- 3: an update while a draft is open
for (const kind of BROWSERS) {
  if (!part(3)) break;
  const tag = `${kind} update`;
  srv.setRoot(DIST_A);
  const { browser, context, page, state } = await newContext(kind);
  const runs = (p) => p.evaluate(() => document.querySelector('script[type=module][src*="/assets/index-"]')?.getAttribute('src'));
  const DRAFT = 'Notes typed just before the update arrived.';
  try {
    await signInPage(page);
    await until(() => controlled(page), 20000);
    pass(`${tag}: version a runs`, (await runs(page)) === SCRIPT_A);
    // A save waits in the queue: a dropped connection on the write itself.
    dbProxy.setBlockWrites(true);
    await logWater(page, WATER_B);
    pass(`${tag}: a save waits in the queue`, Boolean(await until(async () => (await queued(page)) >= 1, 15000)));
    // A draft, being typed.
    await openPage(page, '/daily-journal', 'textarea');
    const box = page.locator('textarea').first();
    await box.click();
    await box.pressSequentially(DRAFT, { delay: 5 });
    await page.evaluate(() => { window.__notReloaded = true; });
    // Version b is deployed; the browser finds and installs it.
    srv.setRoot(DIST_B);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    const installed = await until(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.waiting))), 60000, 500);
    pass(`${tag}: version b installs quietly and waits`, Boolean(installed));
    await page.clock.runFor(2000);
    pass(`${tag}: no reload while typing (page visible)`, await page.evaluate(() => window.__notReloaded === true) && (await box.inputValue()) === DRAFT);
    // The page is hidden for over a minute with the cursor still in the box.
    const hide = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await hide(true);
    await page.clock.runFor(65000);
    await sleep(1500);
    pass(`${tag}: no reload while the cursor is in the box, even hidden`, await page.evaluate(() => window.__notReloaded === true).catch(() => false));
    pass(`${tag}: version a still runs while mid-entry`, (await runs(page)) === SCRIPT_A);
    await hide(false);
    // Typing stops and the cursor leaves the box; then hidden again.
    await page.evaluate(() => document.activeElement?.blur());
    await page.clock.runFor(12000);
    await hide(true);
    await page.clock.runFor(65000);
    const reloaded = await until(() => page.evaluate(() => window.__notReloaded !== true).catch(() => false), 30000, 500);
    pass(`${tag}: hidden and nobody typing, version b takes over and the page reloads`, Boolean(reloaded));
    await page.waitForSelector('textarea', { timeout: 30000 });
    pass(`${tag}: version b runs after the reload`, (await runs(page)) === SCRIPT_B, await runs(page));
    pass(`${tag}: the draft survives the update`, Boolean(await until(async () => (await page.locator('textarea').first().inputValue()) === DRAFT, 10000)), await page.locator('textarea').first().inputValue());
    pass(`${tag}: the queued save survives the update`, (await queued(page)) >= 1);

    // An old app opening after the update: every window closed, then opened.
    srv.setRoot(DIST_A);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await until(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.waiting))), 60000, 500);
    // (version a again plays the newer version here: any change of version is an update)
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(`${APP}/daily-journal`);
    await reopened.waitForSelector('textarea', { timeout: 30000 });
    pass(`${tag}: an old app opening after the update gets the new version`, (await runs(reopened)) === SCRIPT_A, await runs(reopened));
    pass(`${tag}: …with the draft`, Boolean(await until(async () => (await reopened.locator('textarea').first().inputValue()) === DRAFT, 10000)));
    pass(`${tag}: …and the queued save`, (await queued(reopened)) >= 1);
    // The connection is good again: the save is sent, once.
    state.mark();
    dbProxy.setBlockWrites(false);
    // (the app notices by itself: it tries the connection every few seconds)
    const sent = await until(async () => (await queued(reopened)) === 0, 150000, 1000);
    pass(`${tag}: the queued save is sent after the update`, Boolean(sent));
    pass(`${tag}: the day's log arrived once`, Boolean(await until(async () => JSON.stringify(await waterLog()) === JSON.stringify([WATER_B]), 15000)), JSON.stringify(await waterLog()));
    const writes = state.requests.filter((r) => r.write);
    pass(`${tag}: sent exactly once`, writes.length >= 1 && new Set(writes.map((w) => `${w.method} ${w.url} ${w.body}`)).size === writes.length, writes.map((w) => `${w.method} ${w.url.slice(-60)}`).join(' | '));
  } catch (e) {
    pass(`${tag}: finished`, false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
    srv.setRoot(DIST_A);
    dbProxy.setBlockWrites(false);
    await cleanDay();
  }
}

// ---------------------------------------------------------------- 4: the outside Health Check
for (const kind of BROWSERS) {
  if (!part(4)) break;
  const tag = `${kind} Health Check`;
  srv.setRoot(DIST_A);
  const HC = `${APP}/health-check/offline-test-not-a-real-link`;
  const watch = (page) => {
    const seen = [];
    page.on('response', (r) => { if (new URL(r.url()).origin === APP) seen.push({ url: r.url(), fromSW: r.fromServiceWorker() }); });
    return seen;
  };
  // Without the portal ever opened in this browser.
  const fresh = await newContext(kind);
  let freshBody = '';
  try {
    const seen = watch(fresh.page);
    const res = await fresh.page.goto(HC);
    freshBody = await res.text();
    await fresh.page.waitForLoadState('networkidle').catch(() => null);
    pass(`${tag}: served health-check.html`, freshBody.includes('<title>Strategic Alignment Health Check</title>'));
    pass(`${tag}: the Health Check never registers a service worker`, (await fresh.page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))) === 0);
    pass(`${tag}: no service worker controls it`, !(await controlled(fresh.page)));
    pass(`${tag}: nothing it loads comes from a worker`, seen.length > 1 && seen.every((s) => !s.fromSW));
  } finally {
    await fresh.browser.close();
  }
  // In a browser that has the portal's worker.
  const used = await newContext(kind);
  try {
    await used.page.goto(`${APP}/auth/login`);
    await until(() => controlled(used.page), 20000);
    const seen = watch(used.page);
    const res = await used.page.goto(HC);
    const body = await res.text();
    await used.page.waitForLoadState('networkidle').catch(() => null);
    pass(`${tag}: with the portal's worker, the same response`, body === freshBody);
    pass(`${tag}: with the portal's worker, the page itself comes from the network`, !res.fromServiceWorker());
    pass(`${tag}: with the portal's worker, nothing it loads comes from the worker`, seen.length > 1 && seen.every((s) => !s.fromSW), seen.filter((s) => s.fromSW).map((s) => s.url).join(', '));
    pass(`${tag}: its own page shows (not the portal)`, (await used.page.title()) === 'Strategic Alignment Health Check', await used.page.title());
    const hcControlled = await controlled(used.page);
    notes.push(`${tag}: in a browser that also has the portal, the Health Check page is inside the worker's scope ("/", kept for existing Home Screen installs), so navigator.serviceWorker.controller is ${hcControlled ? 'set' : 'empty'}; the worker passes every one of its requests to the network untouched.`);
    // The sign-in email links always go to the network, never the worker.
    // (/api/ is never reached at all: this test blocks it, so no email can go.)
    for (const link of ['/auth/callback', '/auth/reset-password', '/email-confirmation', '/check-email-confirmation']) {
      const r = await used.page.goto(`${APP}${link}`, { waitUntil: 'commit' }).catch(() => null);
      pass(`${tag}: ${link} goes to the network`, Boolean(r) && !r.fromServiceWorker());
    }
    const portal = await used.page.goto(`${APP}/welcome`, { waitUntil: 'commit' });
    pass(`${tag}: (a portal page, by contrast, comes from the worker)`, portal.fromServiceWorker());
  } finally {
    await used.browser.close();
  }
}

// ---------------------------------------------------------------- 5: the dashboard and the check-in
// The fixed day's month (the browser's clock is the fixed day's).
const CK_MONTH = checkinMonth(today);
const { data: ckBefore } = await db.from('checkins').select('*').eq('user_id', me).eq('month', CK_MONTH);
// The database keeps jsonb keys in its own order: compared key by key.
const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
const ckRows = async () => (await db.from('checkins').select('id, status, answers, kind').eq('user_id', me).eq('month', CK_MONTH)).data || [];
for (const kind of BROWSERS) {
  if (!part(5)) break;
  const tag = `${kind} dashboard and check-in`;
  srv.setRoot(DIST_A);
  await db.from('checkins').delete().eq('user_id', me).eq('month', CK_MONTH);
  const { browser, page, state, offline } = await newContext(kind);
  try {
    await signInPage(page);
    pass(`${tag}: the first visit is looked after by the service worker`, Boolean(await until(() => controlled(page), 20000)));
    const want = ['performance-dashboard', 'performance-patterns', 'checkins', 'checkin-page'].map(cacheKey);
    const warmed = await until(() => page.evaluate((w) => w.every((k) => localStorage.getItem(k) != null), want), 45000, 500);
    pass(`${tag}: after one visit (neither page opened) the dashboard, its patterns and the check-in are on the device`, Boolean(warmed), (await page.evaluate((w) => w.filter((k) => localStorage.getItem(k) == null), want)).join(', '));

    await offline(true);
    await page.goto('about:blank');
    const dash = await openPage(page, '/dashboard', '.dash-page .ds-page-title');
    pass(`${tag}: offline, the dashboard opens`, dash);
    pass(`${tag}: offline, the dashboard shows its parts as last seen`, Boolean(await until(async () => (await page.locator('.dash-sec').count()) > 0, 15000)) && !(await bodyText(page)).includes('didn’t load') && !(await bodyText(page)).includes(FIRST_OPEN), (await bodyText(page)).slice(0, 300));
    pass(`${tag}: offline, the dashboard's chart shows`, (await page.locator('.dash-hchart-bar, .dash-big, .dash-hero-value').count()) > 0);

    const ck = await openPage(page, '/check-in', '.ds-guide-question, .ds-guide-title');
    pass(`${tag}: offline, the check-in opens`, ck && !(await bodyText(page)).includes(FIRST_OPEN), (await bodyText(page)).slice(0, 200));
    const opening = await heading(page);
    pass(`${tag}: offline, the check-in opens on its first screen`, /^Ready /.test(opening), opening);
    await sleep(450);
    await page.locator('.ds-guide-next').click();
    // Every question, one tap each (the first answer; a travel Yes adds its pair).
    let answered = 0;
    for (let i = 0; i < 40; i += 1) {
      if (/^(Your month|Your starting point)$/.test(await heading(page))) break;
      const statement = () => page.evaluate(() => document.querySelector('.ds-statement')?.textContent || '');
      const before = `${await heading(page)}|${await statement()}`;
      const radio = page.locator('.ds-guide-body [role=radio]:not([aria-checked="true"])');
      if (await radio.count()) { await radio.nth(Math.min(1, (await radio.count()) - 1)).click(); answered += 1; }
      else { await sleep(450); await page.locator('.ds-guide-next').click(); }
      await until(async () => `${await heading(page)}|${await statement()}` !== before, 4000, 150);
    }
    const resultsHeading = await heading(page);
    pass(`${tag}: offline, every question answered and the results worked out on the device`, /^(Your month|Your starting point)$/.test(resultsHeading) && (await page.locator('.ck-scores .ds-stat').count()) === 2, `${resultsHeading} after ${answered} answers`);
    await sleep(450);
    await page.locator('.ds-guide-next').click();
    pass(`${tag}: offline, Finish works`, Boolean(await until(async () => (await page.locator('.ds-toast-text', { hasText: /^Saved\./ }).count()) > 0, 10000)));
    const waiting = await queued(page);
    pass(`${tag}: offline, the check-in waits on the device`, waiting >= 1, String(waiting));
    pass(`${tag}: nothing reached the database while offline`, (await ckRows()).length === 0);
    const onDevice = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), cacheKey('checkin-page'));
    const deviceRow = onDevice?.v?.checkins?.find((c) => c.month === CK_MONTH);

    state.mark();
    await offline(false);
    const landed = await until(async () => (await queued(page)) === 0, 150000, 1000);
    pass(`${tag}: back online, the queue empties`, Boolean(landed), String(await queued(page)));
    await sleep(3000);
    const rows = await ckRows();
    pass(`${tag}: back online, exactly one row, finished`, rows.length === 1 && rows[0].status === 'finished', JSON.stringify(rows.map((r) => r.status)));
    pass(`${tag}: back online, every answer arrived as given`, rows.length === 1 && Object.keys(rows[0].answers || {}).length >= answered && (!deviceRow?.answers || same(rows[0].answers, deviceRow.answers)), `${Object.keys(rows[0]?.answers || {}).length} of ${answered}`);
    const writes = state.requests.filter((r) => r.write && /\/rest\/v1\/checkins/.test(r.url));
    const finishedSends = writes.filter((w) => /"status":"finished"/.test(w.body || '')).length;
    pass(`${tag}: back online, Finish sent exactly once`, finishedSends === 1, `${finishedSends} of ${writes.length} writes`);
    const seen = new Map();
    for (const w of writes) seen.set(`${w.method} ${w.url} ${w.body}`, (seen.get(`${w.method} ${w.url} ${w.body}`) || 0) + 1);
    pass(`${tag}: no write sent twice`, [...seen.values()].every((n) => n === 1), [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.slice(0, 120)).join(' | '));
    pass(`${tag}: still signed in after landing`, !/\/auth\//.test(new URL(page.url()).pathname));
  } catch (e) {
    pass(`${tag}: finished`, false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
    await db.from('checkins').delete().eq('user_id', me).eq('month', CK_MONTH);
  }
}
if (ckBefore?.length) await db.from('checkins').insert(ckBefore.map(({ hardware_score: _h, software_score: _s, area_scores: _a, methods_version: _m, ...r }) => r));

await srv.close();
await dbProxy.close();
await cleanDay();
seedForReal('--reset');

console.log(results.join('\n'));
if (notes.length) console.log(`\nNOTES\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
