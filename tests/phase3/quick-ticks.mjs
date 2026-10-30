// Quick ticks are never lost (Phase 3, 30 Oct). In one full run of
// review-my-day.mjs the summary once said "1 of 3 done" after three quick
// ticks. This test makes the races happen on purpose, with delays on the
// network (page.route), signed in as the invented test client on the TEST
// database only (every other host and every email call is blocked):
//
//   stale load   a page's quiet refresh (useCachedLoad) is held back and
//                lands after several quick ticks have saved. Before the
//                fix it put the older server copy on screen (the ticks
//                vanished) and told the version book the older versions,
//                so the next change to one of those rows was refused as
//                "changed in another window".
//   double load  the first visit, with the second of React's two loads
//                (StrictMode, in development) held back: the same race,
//                the way it happened in the review test.
//   offline      ticks made offline, then the page refreshed just as the
//                connection comes back, with every save slowed: the queue
//                sends them in order, and the page shows them all.
//   same row     tick, untick, tick one row quickly with every save
//                slowed and a stale load in the middle: it ends ticked,
//                and nothing is refused.
//
// On Review my day, the Performance Sprint page and Plan my day. After each,
// the screen and the database rows are both checked, and "This was changed
// in another window" must never show (one window only).
//
//   node --import ./tests/scores/register.mjs tests/phase3/quick-ticks.mjs
//
// The seed is built around one fixed day and every browser's clock starts
// on it (tests/phase2/fixed-day.mjs). The seed is put back on the real
// today at the end. ONLY=review,sprint,plan runs some pages only.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = (name) => !ONLY.length || ONLY.includes(name);
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`;
  results.push(line);
  console.log(line);
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

console.log(`Fixed day: ${fixedLabel()}`);
const today = FIXED_TODAY;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return v;
}

// ---------------------------------------------------------------- the data
seedFixed('--reset');
const DRAFT = 'Draft the Harbour case study';
const SHORT = 'Shortlist breathing sound loops';
const PHYSIO = 'Book a physio assessment';
const TRAIN = 'Training sessions';
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const todoId = async (text) => (await db.from('todos').select('id').eq('user_id', me).eq('text', text).eq('sprint_id', sprint.id)).data[0].id;
const ids = { [DRAFT]: await todoId(DRAFT), [SHORT]: await todoId(SHORT), [PHYSIO]: await todoId(PHYSIO) };
const sprintHabits = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data;
const hid = (name) => sprintHabits.find((h) => h.name === name).id;
const logsBefore = (await db.from('habit_logs').select('sprint_habit_id, local_date, value').eq('user_id', me).eq('local_date', today)).data;
const doneOn = async (text) => (await db.from('todos').select('done_on').eq('id', ids[text])).data?.[0]?.done_on ?? null;
const logOf = async (name) => (await db.from('habit_logs').select('value').eq('sprint_habit_id', hid(name)).eq('local_date', today)).data?.[0]?.value ?? null;

async function cleanTicks() {
  await db.from('todos').update({ done_on: null }).in('id', Object.values(ids));
  await db.from('habit_logs').delete().eq('user_id', me).eq('local_date', today);
  if (logsBefore.length) await db.from('habit_logs').insert(logsBefore.map((l) => ({ ...l, user_id: me })));
}

// The morning's plan, as Plan my day saves it (for Review my day).
async function morningPlan() {
  await db.from('day_reviews').delete().eq('user_id', me);
  const old = (await db.from('day_plans').select('id').eq('user_id', me)).data.map((p) => p.id);
  if (old.length) {
    await db.from('day_plan_todos').delete().in('day_plan_id', old);
    await db.from('day_plan_strategies').delete().in('day_plan_id', old);
  }
  await db.from('day_plans').delete().eq('user_id', me);
  const id = (await db.from('day_plans').insert({ user_id: me, local_date: today, way_of_being: 'Calm under pressure', status: 'finished', finished_at: `${today}T08:00:00Z` }).select('id').single()).data.id;
  await db.from('day_plan_todos').insert([
    { day_plan_id: id, todo_id: ids[DRAFT], user_id: me, is_top: true },
    { day_plan_id: id, todo_id: ids[SHORT], user_id: me, is_top: false },
  ]);
}
const planLocal = { habits: [hid(TRAIN)], order: [`todo:${ids[DRAFT]}`, `todo:${ids[SHORT]}`, `habit:${hid(TRAIN)}`], top: `todo:${ids[DRAFT]}` };

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

// Delays on the network: each rule holds back matching requests (method
// and a pattern on the address) for `ms`, the first `times` of them (or
// every one), after skipping the first `skip`. Each held request is kept,
// so the test can wait for its answer.
async function signedIn(tag, { withPlanLocal = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await fixClock(context);
  await context.addInitScript(([key, local]) => {
    try {
      localStorage.setItem('clarity-colour-mode', 'dark');
      if (key && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(local));
    } catch { /* blocked */ }
  }, [withPlanLocal ? `clarity-day-plan-local:${me}:${today}` : null, planLocal]);
  const w = { context, rules: [], held: [] };
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (process.env.DEBUG && /rest\/v1/.test(url)) console.log('REQ', req.method(), url.slice(url.indexOf('/rest/v1/'), url.indexOf('/rest/v1/') + 40));
    for (const r of w.rules) {
      if (r.method !== req.method() || !r.re.test(url)) continue;
      r.seen += 1;
      if (r.seen <= (r.skip || 0) || (r.times != null && r.seen > (r.skip || 0) + r.times)) continue;
      w.held.push(req);
      // A read is answered late: the server reads now, the page hears it
      // later (what a slow connection does). A save is sent late.
      if (req.method() === 'GET') {
        try {
          const response = await route.fetch();
          await sleep(r.ms);
          return await route.fulfill({ response });
        } catch {
          return null;
        }
      }
      await sleep(r.ms);
      break;
    }
    return route.fallback().catch(() => null);
  });
  w.delay = (method, re, ms, opts = {}) => { const r = { method, re, ms, seen: 0, ...opts }; w.rules.push(r); return r; };
  w.clearDelays = () => { w.rules.length = 0; w.held.length = 0; };
  const page = await context.newPage();
  w.page = page;
  page.on('pageerror', (e) => pass(`${tag}: no page errors`, false, e.message));
  w.refused = 0;
  await page.exposeFunction('reportSuperseded', () => { w.refused += 1; });
  await context.addInitScript(() => {
    let said = false;
    new MutationObserver(() => {
      const now = Boolean(document.body?.innerText.includes('This was changed in another window'));
      if (now && !said) window.reportSuperseded?.();
      said = now;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return w;
}

// When the page's copy on the device was last written (useCachedLoad).
const cacheAt = (page, name) => page.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null')?.at ?? null; } catch { return null; }
}, `clarity-cache:${me}:${name}`);
// Nothing waiting to send: the queue and the sends cut off are empty, and
// no save is on its way (the page's own status reads Saved, Will sync goes).
const queueEmpty = (page) => page.evaluate((u) => {
  const q = JSON.parse(localStorage.getItem(`clarity-queue:${u}`) || '[]');
  return q.length === 0 && !localStorage.getItem(`clarity-sending:${u}`);
}, me);

// Every held request has had its answer, and the page has since written
// its copy again (the quiet refresh applied, or set aside and redone).
const answered = (reqs) => Promise.race([
  Promise.all(reqs.map((r) => r.response().catch(() => null))),
  sleep(20000),
]);
async function heldLanded(w, name, before) {
  await answered(w.held);
  const fresh = await until(async () => {
    const at = await cacheAt(w.page, name);
    return at != null && at !== before && await queueEmpty(w.page);
  }, 20000);
  return Boolean(fresh);
}

const checkbox = (page, name) => page.getByRole('checkbox', { name, exact: true }).first();
const checked = async (page, name) => (await checkbox(page, name).getAttribute('aria-checked')) === 'true';

// ---------------------------------------------------------------- Review my day
async function reviewRuns() {
  const tag = 'review';
  const cache = `day-review:${today}`;
  const openReview = async (page) => {
    await page.goto(`${APP}/my-day/review`);
    await page.waitForSelector('.ds-todo', { timeout: 30000 });
  };

  // 1. Stale load: a second visit shows the copy at once; its quiet
  // refresh is held back 2.5 seconds while three things are ticked.
  await morningPlan();
  await cleanTicks();
  let w = await signedIn(tag);
  try {
    await openReview(w.page);
    await until(() => cacheAt(w.page, cache));
    const trainBefore = Number(await logOf(TRAIN) || 0);
    const before = await cacheAt(w.page, cache);
    w.delay('GET', /\/rest\/v1\/todos\?/, 2500, { times: 2 });
    w.delay('PATCH', /\/rest\/v1\/(todos|habit_logs)/, 1000);
    w.delay('POST', /\/rest\/v1\/habit_logs/, 1000);
    await openReview(w.page);
    for (const name of [DRAFT, SHORT, TRAIN]) await checkbox(w.page, name).click();
    pass(`${tag} stale load: the refresh was held back`, w.held.length > 0);
    pass(`${tag} stale load: the refresh landed`, await heldLanded(w, cache, before));
    for (const name of [DRAFT, SHORT, TRAIN]) pass(`${tag} stale load: "${name}" still ticked on screen`, await checked(w.page, name));
    pass(`${tag} stale load: both to-dos done in the database`, (await doneOn(DRAFT)) === today && (await doneOn(SHORT)) === today, `${await doneOn(DRAFT)} ${await doneOn(SHORT)}`);
    pass(`${tag} stale load: the habit logged one more`, Number(await logOf(TRAIN)) === trainBefore + 1, `${trainBefore} then ${await logOf(TRAIN)}`);
    // The next change to the same rows goes through: nothing based on the
    // older copy the late refresh brought.
    w.clearDelays();
    await checkbox(w.page, DRAFT).click();
    pass(`${tag} stale load: an untick after it is saved`, Boolean(await until(async () => (await doneOn(DRAFT)) === null)));
    await checkbox(w.page, DRAFT).click();
    pass(`${tag} stale load: and the tick again`, Boolean(await until(async () => (await doneOn(DRAFT)) === today)));
    pass(`${tag} stale load: nothing refused as another window's`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} stale load ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();

  // 2. Double load: a first visit, the second of the page's loads held back.
  await cleanTicks();
  w = await signedIn(tag);
  try {
    w.delay('GET', /\/rest\/v1\/todos\?/, 2500, { skip: 1, times: 3 });
    await openReview(w.page);
    const before = await cacheAt(w.page, cache);
    for (const name of [DRAFT, SHORT]) await checkbox(w.page, name).click();
    if (w.held.length) pass(`${tag} double load: the late load landed`, await heldLanded(w, cache, before));
    for (const name of [DRAFT, SHORT]) pass(`${tag} double load: "${name}" still ticked on screen`, await checked(w.page, name));
    pass(`${tag} double load: both done in the database`, Boolean(await until(async () => (await doneOn(DRAFT)) === today && (await doneOn(SHORT)) === today)));
    pass(`${tag} double load: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} double load ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();

  // 3. Offline, then a refresh as the connection comes back, every save slowed.
  await cleanTicks();
  w = await signedIn(tag);
  try {
    await openReview(w.page);
    await until(() => cacheAt(w.page, cache));
    await w.context.setOffline(true);
    for (const name of [DRAFT, SHORT, TRAIN]) await checkbox(w.page, name).click();
    pass(`${tag} offline: the ticks wait on the device`, Boolean(await until(async () => !(await queueEmpty(w.page)), 5000)));
    w.delay('PATCH', /\/rest\/v1\//, 600);
    w.delay('POST', /\/rest\/v1\/habit_logs/, 600);
    w.delay('GET', /\/rest\/v1\/todos\?/, 1500, { times: 2 });
    await w.context.setOffline(false);
    await w.page.reload();
    await w.page.waitForSelector('.ds-todo', { timeout: 30000 });
    pass(`${tag} offline: every save sent`, Boolean(await until(() => queueEmpty(w.page), 30000)));
    pass(`${tag} offline: both to-dos done in the database`, Boolean(await until(async () => (await doneOn(DRAFT)) === today && (await doneOn(SHORT)) === today)));
    await answered(w.held);
    const shown = await until(async () => (await checked(w.page, DRAFT)) && (await checked(w.page, SHORT)) && (await checked(w.page, TRAIN)), 15000);
    pass(`${tag} offline: the page shows all three ticked`, Boolean(shown));
    pass(`${tag} offline: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} offline ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();

  // 4. Same row: tick, untick, tick with every save slowed, and a stale
  // refresh (an online event) landing in the middle.
  await cleanTicks();
  w = await signedIn(tag);
  try {
    await openReview(w.page);
    await until(() => cacheAt(w.page, cache));
    const before = await cacheAt(w.page, cache);
    w.delay('PATCH', /\/rest\/v1\/todos/, 700);
    w.delay('GET', /\/rest\/v1\/todos\?/, 1800, { times: 2 });
    // A quiet refresh (the connection noticed back) while the saves go.
    await checkbox(w.page, PHYSIO).count();
    await checkbox(w.page, DRAFT).click();
    await w.page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    await checkbox(w.page, DRAFT).click();
    await checkbox(w.page, DRAFT).click();
    pass(`${tag} same row: the refresh landed`, await heldLanded(w, cache, before));
    pass(`${tag} same row: ends ticked in the database`, Boolean(await until(async () => (await doneOn(DRAFT)) === today)));
    pass(`${tag} same row: ends ticked on screen`, await checked(w.page, DRAFT));
    w.clearDelays();
    await checkbox(w.page, DRAFT).click();
    pass(`${tag} same row: the next untick is saved`, Boolean(await until(async () => (await doneOn(DRAFT)) === null)));
    pass(`${tag} same row: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} same row ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();
}

// ---------------------------------------------------------------- the sprint page
async function sprintRuns() {
  const tag = 'sprint';
  const cache = 'performance-sprint';
  const todoBox = (page, text) => page.locator('.ds-todo').filter({ hasText: text }).first().getByRole('checkbox');
  const habitRow = (page, name) => page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: new RegExp(`^${name}$`) }) });
  const habitBox = (page, name) => page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: new RegExp(`^${name}$`) }) }).getByRole('checkbox');
  const WEEKLY = 'Weekly strategic block';
  const openSprint = async (page) => {
    await page.goto(`${APP}/performance-sprint`);
    await page.waitForSelector('.sprint-page', { timeout: 30000 });
    await page.getByRole('button', { name: 'Today', exact: true }).click().catch(() => null);
    await page.waitForSelector('.ds-todo', { timeout: 30000 });
  };
  const weeklyLog = async () => logOf(WEEKLY);

  await cleanTicks();
  let w = await signedIn(tag);
  try {
    await openSprint(w.page);
    await until(() => cacheAt(w.page, cache));
    const before = await cacheAt(w.page, cache);
    w.delay('GET', /\/rest\/v1\/todos\?/, 2500, { times: 2 });
    w.delay('PATCH', /\/rest\/v1\/(todos|habit_logs)/, 1000);
    w.delay('POST', /\/rest\/v1\/habit_logs/, 1000);
    await openSprint(w.page);
    const coffeesBefore = Number(await logOf('Coffees') || 0);
    await todoBox(w.page, DRAFT).click();
    await todoBox(w.page, SHORT).click();
    await habitBox(w.page, WEEKLY).click();
    await habitRow(w.page, 'Coffees').getByRole('button', { name: /One more/ }).click();
    pass(`${tag} stale load: the refresh was held back`, w.held.length > 0);
    pass(`${tag} stale load: the refresh landed`, await heldLanded(w, cache, before));
    pass(`${tag} stale load: both to-dos still ticked on screen`, (await todoBox(w.page, DRAFT).getAttribute('aria-checked')) === 'true' && (await todoBox(w.page, SHORT).getAttribute('aria-checked')) === 'true');
    pass(`${tag} stale load: the habit still ticked on screen`, (await habitBox(w.page, WEEKLY).getAttribute('aria-checked')) === 'true');
    pass(`${tag} stale load: both to-dos done in the database`, (await doneOn(DRAFT)) === today && (await doneOn(SHORT)) === today, `${await doneOn(DRAFT)} ${await doneOn(SHORT)}`);
    pass(`${tag} stale load: the habit logged`, Number(await weeklyLog()) === 1, `${await weeklyLog()}`);
    // A count counts on from what the screen shows: one more after the
    // late refresh must make two, never one again.
    await habitRow(w.page, 'Coffees').getByRole('button', { name: /One more/ }).click();
    const coffees = await until(async () => Number(await logOf('Coffees')) === coffeesBefore + 2, 8000);
    pass(`${tag} stale load: one more, twice, logs two more in the database`, Boolean(coffees), `${coffeesBefore} then ${await logOf('Coffees')}`);
    w.clearDelays();
    await todoBox(w.page, DRAFT).click();
    pass(`${tag} stale load: an untick after it is saved`, Boolean(await until(async () => (await doneOn(DRAFT)) === null)));
    await habitBox(w.page, WEEKLY).click();
    pass(`${tag} stale load: the habit's untick after it is saved`, Boolean(await until(async () => (await weeklyLog()) == null || Number(await weeklyLog()) === 0)));
    pass(`${tag} stale load: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} stale load ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();

  // Double load on a first visit, plus the same row three times with slow saves.
  await cleanTicks();
  w = await signedIn(tag);
  try {
    w.delay('GET', /\/rest\/v1\/todos\?/, 2500, { skip: 1, times: 3 });
    w.delay('PATCH', /\/rest\/v1\/todos/, 500);
    await openSprint(w.page);
    const before = await cacheAt(w.page, cache);
    await todoBox(w.page, DRAFT).click();
    await todoBox(w.page, DRAFT).click();
    await todoBox(w.page, DRAFT).click();
    await todoBox(w.page, SHORT).click();
    if (w.held.length) await heldLanded(w, cache, before);
    pass(`${tag} double load: ticked on screen`, (await todoBox(w.page, DRAFT).getAttribute('aria-checked')) === 'true' && (await todoBox(w.page, SHORT).getAttribute('aria-checked')) === 'true');
    pass(`${tag} double load: done in the database`, Boolean(await until(async () => (await doneOn(DRAFT)) === today && (await doneOn(SHORT)) === today)));
    pass(`${tag} double load: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} double load ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();
}

// ---------------------------------------------------------------- Plan my day
async function planRuns() {
  const tag = 'plan';
  const cache = `day-plan:${today}`;
  const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
  const pick = (page, name) => page.locator('.ds-answer--pick', { hasText: name }).first();
  const pressed = async (page, name) => (await pick(page, name).getAttribute('aria-pressed')) === 'true';
  const planTodos = async () => {
    const plan = (await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', today)).data?.[0];
    return plan ? (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data.map((r) => r.todo_id) : [];
  };
  async function next(page) {
    const before = await heading(page);
    for (let i = 0; i < 6; i += 1) {
      await page.locator('.ds-guide-next').click();
      if (await until(async () => (await heading(page)) !== before, 1200)) return;
    }
    throw new Error(`Next didn't move on from "${before}"`);
  }

  await cleanTicks();
  const old = (await db.from('day_plans').select('id').eq('user_id', me)).data.map((p) => p.id);
  if (old.length) {
    await db.from('day_plan_todos').delete().in('day_plan_id', old);
    await db.from('day_plan_strategies').delete().in('day_plan_id', old);
  }
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('day_plans').delete().eq('user_id', me);
  // Nothing chosen on the device yet (the morning's habit is chosen here).
  const w = await signedIn(tag, { withPlanLocal: false });
  try {
    await w.page.goto(`${APP}/my-day/plan`);
    await w.page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    for (let i = 0; i < 3; i += 1) await next(w.page);
    pass(`${tag}: on What will you do today?`, (await heading(w.page)) === 'What will you do today?', await heading(w.page));
    await until(() => cacheAt(w.page, cache));
    const before = await cacheAt(w.page, cache);
    // The step is remembered: a refresh comes back to it from the copy,
    // with the quiet refresh held back while three are picked.
    w.delay('GET', /\/rest\/v1\/todos\?/, 2500, { times: 2 });
    w.delay('POST', /\/rest\/v1\/day_plan_todos/, 1000);
    await w.page.reload();
    await w.page.waitForSelector('.ds-answer--pick', { timeout: 30000 });
    for (const name of [DRAFT, SHORT, TRAIN]) await pick(w.page, name).click();
    pass(`${tag}: the refresh landed`, await heldLanded(w, cache, before));
    for (const name of [DRAFT, SHORT, TRAIN]) pass(`${tag}: "${name}" still chosen on screen`, await pressed(w.page, name));
    const rows = await until(async () => { const t = await planTodos(); return t.includes(ids[DRAFT]) && t.includes(ids[SHORT]) ? t : null; });
    pass(`${tag}: both to-dos are in the day's plan in the database`, Boolean(rows), JSON.stringify(await planTodos()));
    pass(`${tag}: nothing refused`, w.refused === 0, `${w.refused}`);
  } catch (e) {
    pass(`${tag} ran to the end`, false, e.message.split('\n')[0]);
  }
  await w.context.close();
}

if (run('review')) await reviewRuns();
if (run('sprint')) await sprintRuns();
if (run('plan')) await planRuns();

await browser.close();
await cleanTicks();
await db.from('day_reviews').delete().eq('user_id', me);
{
  const old = (await db.from('day_plans').select('id').eq('user_id', me)).data.map((p) => p.id);
  if (old.length) {
    await db.from('day_plan_todos').delete().in('day_plan_id', old);
    await db.from('day_plan_strategies').delete().in('day_plan_id', old);
  }
  await db.from('day_plans').delete().eq('user_id', me);
}
seedForReal('--reset');

console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
