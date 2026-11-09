// Plan my day: the newest choice wins (Phase 5 follow-up 2, open fault 1).
// In one full run of quick-ticks.mjs a habit chosen straight after two
// to-dos, while the page was refreshing, came off the screen. This test
// repeats that exact sequence 20 times (RUNS= to change it) and every run
// must pass:
//
//   the page's copy is on the device; the page is reloaded with its quiet
//   refresh and its read of the day's choices (day_plan_habits) held back
//   2.5 seconds, and every save of the day's to-dos slowed by a second; two
//   to-dos and then a habit are chosen at once.
//
// The miss in quick-ticks.mjs was its own leftover: Review my day's runs
// had saved the morning's habit for the same day, so it showed as already
// chosen and the third tap unchose it. This test starts every run with
// day_plan_habits cleared too, so a miss here is the app's.
//
// After each run the three are still chosen on screen (checked again once
// every late read has landed), the database holds the two to-dos in the
// day's plan and the habit in day_plan_habits, and nothing was refused as
// "changed in another window". On a miss the screen and device state are
// printed. Signed in as the invented test client on the TEST database
// only; every other host and every email call is blocked. Each run starts
// from nothing chosen, and everything it saved is deleted at the end.
//
//   node --import ./tests/scores/register.mjs tests/phase5/plan-picks-race.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const RUNS = Number(process.env.RUNS || 20);
let failures = 0;
let passes = 0;
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else failures += 1;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
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

console.log(`Fixed day: ${fixedLabel()}, ${RUNS} runs`);
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

seedFixed('--reset');
const DRAFT = 'Draft the Harbour case study';
const SHORT = 'Shortlist breathing sound loops';
const TRAIN = 'Training sessions';
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const todoId = async (text) => (await db.from('todos').select('id').eq('user_id', me).eq('text', text).eq('sprint_id', sprint.id)).data[0].id;
const ids = { [DRAFT]: await todoId(DRAFT), [SHORT]: await todoId(SHORT) };
const train = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data.find((h) => h.name === TRAIN).id;

async function cleanDay() {
  const old = (await db.from('day_plans').select('id').eq('user_id', me)).data.map((p) => p.id);
  if (old.length) {
    await db.from('day_plan_todos').delete().in('day_plan_id', old);
    await db.from('day_plan_strategies').delete().in('day_plan_id', old);
  }
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('day_plans').delete().eq('user_id', me);
  await db.from('day_plan_habits').delete().eq('user_id', me);
}
const planTodos = async () => {
  const plan = (await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', today)).data?.[0];
  return plan ? (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data.map((r) => r.todo_id) : [];
};
const dayHabits = async () => (await db.from('day_plan_habits').select('habit_ids').eq('user_id', me).eq('local_date', today)).data?.[0]?.habit_ids || [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
await fixClock(context);
await context.addInitScript(() => { try { localStorage.setItem('clarity-colour-mode', 'dark'); } catch { /* blocked */ } });
const rules = [];
const held = [];
await context.route('**/*', async (route) => {
  const req = route.request();
  const url = req.url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\//.test(url)) return route.abort();
  for (const r of rules) {
    if (r.method !== req.method() || !r.re.test(url)) continue;
    r.seen += 1;
    if (r.times != null && r.seen > r.times) continue;
    held.push(req);
    // A read is answered late (the server reads now, the page hears it
    // later); a save is sent late.
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
const delay = (method, re, ms, opts = {}) => rules.push({ method, re, ms, seen: 0, ...opts });
const clearDelays = () => { rules.length = 0; held.length = 0; };

const page = await context.newPage();
page.on('pageerror', (e) => pass('no page errors', false, e.message));
let refused = 0;
await page.exposeFunction('reportSuperseded', () => { refused += 1; });
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

const cache = `day-plan:${today}`;
const cacheAt = () => page.evaluate((k) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null')?.at ?? null; } catch { return null; }
}, `clarity-cache:${me}:${cache}`);
const queueEmpty = () => page.evaluate((u) => {
  const q = JSON.parse(localStorage.getItem(`clarity-queue:${u}`) || '[]');
  return q.length === 0 && !localStorage.getItem(`clarity-sending:${u}`);
}, me);
const heading = async () => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const pick = (name) => page.locator('.ds-answer--pick', { hasText: name }).first();
const pressed = async (name) => (await pick(name).getAttribute('aria-pressed')) === 'true';
async function next() {
  const before = await heading();
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    if (await until(async () => (await heading()) !== before, 1200)) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
const screenState = () => page.evaluate(() => ({
  picks: [...document.querySelectorAll('.ds-answer--pick')].map((e) => `${e.textContent.trim().slice(0, 30)}=${e.getAttribute('aria-pressed')}`),
  device: Object.keys(localStorage).filter((k) => /day-plan-local/.test(k)).map((k) => `${k.slice(-10)}: ${localStorage.getItem(k).slice(0, 300)}`),
}));

// The device forgets the day (its choices, the page's copy and the step),
// so every run starts from the same place: nothing chosen.
const forgetDay = () => page.evaluate(([u, d]) => {
  for (const k of Object.keys(localStorage)) {
    if (k.includes(d) && (k.includes('day-plan') || k.includes(`day-plan-${u}`))) localStorage.removeItem(k);
  }
}, [me, today]);

for (let run = 1; run <= RUNS; run += 1) {
  const tag = `run ${run}`;
  clearDelays();
  try {
    await cleanDay();
    await page.goto(`${APP}/welcome`);
    await forgetDay();
    await page.goto(`${APP}/my-day/plan`);
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    for (let i = 0; i < 6 && (await heading()) !== 'What will you do today?'; i += 1) await next();
    if ((await heading()) !== 'What will you do today?') throw new Error(`Not on What will you do today? ("${await heading()}")`);
    await until(() => cacheAt());
    await until(() => queueEmpty());
    const before = await cacheAt();
    // The step is remembered: the reload comes back to it from the copy,
    // with the quiet refresh held back while three are chosen.
    delay('GET', /\/rest\/v1\/todos\?/, 2500, { times: 2 });
    delay('GET', /\/rest\/v1\/day_plan_habits\?/, 2500, { times: 2 });
    delay('POST', /\/rest\/v1\/day_plan_todos/, 1000);
    await page.reload();
    await page.waitForSelector('.ds-answer--pick', { timeout: 30000 });
    for (const name of [DRAFT, SHORT, TRAIN]) await pick(name).click();
    await Promise.race([Promise.all(held.map((r) => r.response().catch(() => null))), sleep(20000)]);
    const landed = await until(async () => {
      const at = await cacheAt();
      return at != null && at !== before && await queueEmpty();
    }, 20000);
    pass(`${tag}: the refresh landed`, Boolean(landed));
    // Every late read has had time to land (the day's choices too).
    await sleep(1500);
    for (const name of [DRAFT, SHORT, TRAIN]) {
      const on = await pressed(name);
      pass(`${tag}: "${name}" still chosen on screen`, on, on ? '' : JSON.stringify(await screenState()));
    }
    const rows = await until(async () => { const t = await planTodos(); return t.includes(ids[DRAFT]) && t.includes(ids[SHORT]) ? t : null; });
    pass(`${tag}: both to-dos in the day's plan in the database`, Boolean(rows), JSON.stringify(await planTodos()));
    const habit = await until(async () => (await dayHabits()).includes(train));
    pass(`${tag}: the habit in day_plan_habits in the database`, Boolean(habit), JSON.stringify(await dayHabits()));
    pass(`${tag}: nothing refused`, refused === 0, `${refused}`);
  } catch (e) {
    pass(`${tag} ran to the end`, false, e.message.split('\n')[0]);
  }
  console.log(`${tag}: ${failures ? `${failures} failed so far` : 'passed'}`);
}

await browser.close();
await cleanDay();
seedForReal('--reset');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
