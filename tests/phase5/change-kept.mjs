// Nothing is ever lost (experience rule 2; Tim's check of 10 Nov, 09:15).
// A change made from a summary (Change beside an answer) is kept the moment
// it's made: a refresh, or closing the tab and opening the tool again,
// reopens that same step with the change still there and "Save my edit"
// still going straight back to the summary.
//
//   A  Daily plan, finished: Change To-dos, choose a third, refresh.
//   B  The same with the refresh in the middle of the save (the save held
//      back 1.5 seconds), so the change is only on the device when the
//      page goes.
//   C  Typed words: Change Gratitude, type, refresh at once.
//   D  The tab is closed instead and the tool opened again in a new one.
//   E  Daily review, finished: Change an answer, refresh.
//   F  Back from a change (the chevron) forgets it: a refresh after that
//      opens the summary.
//
// Signed in as the invented test client on the TEST database only, on the
// fixed day; every other host and every email call is blocked. Everything
// it saved is removed at the end and the seed is put back on the real day.
//
//   node --import ./tests/scores/register.mjs tests/phase5/change-kept.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
let failures = 0;
let passes = 0;
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
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

seedFixed('--reset');
const DRAFT = 'Draft the Harbour case study';
const SHORT = 'Shortlist breathing sound loops';
const TRAIN = 'Training sessions';

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
const dayPlan = async () => (await db.from('day_plans').select('*').eq('user_id', me).eq('local_date', today)).data?.[0] || null;
const dayReview = async () => (await db.from('day_reviews').select('*').eq('user_id', me).eq('local_date', today)).data?.[0] || null;
const dayHabits = async () => (await db.from('day_plan_habits').select('habit_ids').eq('user_id', me).eq('local_date', today)).data?.[0]?.habit_ids || [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light' });
await fixClock(context);
const rules = [];
await context.route('**/*', async (route) => {
  const req = route.request();
  const url = req.url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\//.test(url)) return route.abort();
  for (const r of rules) {
    if (r.method !== req.method() || !r.re.test(url)) continue;
    await sleep(r.ms);
    break;
  }
  return route.fallback().catch(() => null);
});
const delay = (method, re, ms) => rules.push({ method, re, ms });
const clearDelays = () => { rules.length = 0; };

let page = await context.newPage();
const watch = (p) => p.on('pageerror', (e) => pass('no page errors', false, e.message));
watch(page);
await page.goto(`${APP}/auth/login`);
await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL(/welcome/, { timeout: 30000 });

const queueEmpty = () => page.evaluate((u) => {
  const q = JSON.parse(localStorage.getItem(`clarity-queue:${u}`) || '[]');
  return q.length === 0 && !localStorage.getItem(`clarity-sending:${u}`);
}, me);
const heading = async () => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const nextLabel = async () => ((await page.locator('.ds-guide-next').first().textContent().catch(() => '')) || '').trim();
const pick = (name) => page.locator('.ds-answer--pick', { hasText: name }).first();
const pressed = async (name) => (await pick(name).getAttribute('aria-pressed')) === 'true';
const summaryText = async () => ((await page.locator('.ds-guide-summary').first().textContent().catch(() => '')) || '');
async function next() {
  const before = await heading();
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    if (await until(async () => (await heading()) !== before, 1200)) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
const change = async (label) => {
  await page.getByRole('button', { name: new RegExp(`^(Edit|Add) ${label}$`, "i") }).click();
  await until(async () => (await nextLabel()) === 'Save my edit', 5000);
};
const onSummary = async () => Boolean(await until(async () => (await page.locator('.ds-guide-summary').count()) > 0, 8000));
// A tap in the first moment after a screen appears is ignored (a double
// tap never skips a screen), so the test taps as a person would: once the
// screen has settled, and again if nothing moved.
async function saveMyChange() {
  for (let i = 0; i < 5; i += 1) {
    await sleep(450);
    if (await page.locator('.ds-guide-summary').count()) return true;
    await page.locator('.ds-guide-next').click().catch(() => null);
    if (await until(async () => (await page.locator('.ds-guide-summary').count()) > 0, 1500)) return true;
  }
  return false;
}

const PLAN = process.env.PLAN_PATH || '/daily-plan';
const REVIEW = process.env.REVIEW_PATH || '/daily-review';
const DO = 'What will you do today?';

// ------------------------------------------------------------ the Daily plan, set
async function setTheDay() {
  await cleanDay();
  await page.goto(`${APP}/welcome`);
  await page.evaluate(([u, d]) => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes(d) && (k.includes('day-plan') || k.includes('day-review') || k.includes(`-${u}-`))) localStorage.removeItem(k);
    }
  }, [me, today]);
  await page.goto(`${APP}${PLAN}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  for (let i = 0; i < 6 && (await heading()) !== DO; i += 1) await next();
  await pick(DRAFT).click();
  await pick(SHORT).click();
  await until(async () => (await pressed(DRAFT)) && (await pressed(SHORT)));
  await next();
  // Highest priority: one tap moves on by itself.
  await page.locator('.ds-answer', { hasText: DRAFT }).first().click();
  await until(async () => /Strateg/.test(await heading()), 5000);
  await next();
  await next();
  if (!(await onSummary())) throw new Error(`Not on the summary ("${await heading()}")`);
  for (let i = 0; i < 5 && (await dayPlan())?.status !== 'finished'; i += 1) {
    await sleep(450);
    await page.locator('.ds-guide-next').click().catch(() => null);
    await until(async () => (await dayPlan())?.status === 'finished', 4000);
  }
  await until(() => queueEmpty());
}

try {
  await setTheDay();
  pass('the day is set, with two to-dos', (await dayPlan())?.status === 'finished', JSON.stringify(await dayPlan()));

  // A. A third thing chosen from the summary, then a refresh.
  await page.goto(`${APP}${PLAN}`);
  pass('A: a finished plan opens on its summary', await onSummary());
  pass('A: the summary heading is "This was your plan", with no line under it', (await heading()) === 'This was your plan' && (await page.locator('.ds-guide-nudge').count()) === 0, await heading());
  pass('A: the % shows once', ((await page.locator('.ds-guide-page').innerText()).match(/100%/g) || []).length === 1);
  await change('To-dos');
  pass('A: Change opens the to-dos step', (await heading()) === DO, await heading());
  await pick(TRAIN).click();
  await until(() => pressed(TRAIN));
  await until(() => queueEmpty());
  await page.reload();
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('A: after a refresh the same step is open', (await heading()) === DO, await heading());
  pass('A: the button still reads Save my edit', (await nextLabel()) === 'Save my edit', await nextLabel());
  await page.waitForSelector('.ds-answer--pick', { timeout: 15000 });
  for (const name of [DRAFT, SHORT, TRAIN]) pass(`A: "${name}" is still chosen`, await pressed(name));
  await sleep(1500); // every late read has landed
  pass('A: the third is still chosen once the quiet refresh has landed', await pressed(TRAIN));
  pass('A: Save my edit goes straight back to the summary', await saveMyChange());
  pass('A: the summary lists the third', (await summaryText()).includes(TRAIN), await summaryText());
  pass('A: the habit is in the database', (await until(async () => (await dayHabits()).length === 1)) === true);
  await page.reload();
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('A: with no change in progress, a refresh opens the summary', await onSummary());

  // B. The refresh lands in the middle of the save.
  await change('To-dos');
  delay('POST', /\/rest\/v1\/(day_plan_todos|day_plan_habits)/, 1500);
  delay('PATCH', /\/rest\/v1\/(day_plan_todos|day_plan_habits)/, 1500);
  delay('DELETE', /\/rest\/v1\/(day_plan_todos|day_plan_habits)/, 1500);
  await pick(SHORT).click(); // unchosen
  await until(async () => !(await pressed(SHORT)), 3000);
  await page.reload();
  clearDelays();
  await page.waitForSelector('.ds-answer--pick', { timeout: 30000 });
  pass('B: after a refresh mid-save the same step is open', (await heading()) === DO && (await nextLabel()) === 'Save my edit', `${await heading()} / ${await nextLabel()}`);
  pass('B: the change is still there', !(await pressed(SHORT)) && (await pressed(DRAFT)) && (await pressed(TRAIN)));
  await until(() => queueEmpty(), 20000);
  await sleep(1500);
  pass('B: and still there once everything has been sent and read again', !(await pressed(SHORT)) && (await pressed(DRAFT)));
  const plan = await dayPlan();
  const rows = await until(async () => {
    const r = (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data || [];
    return r.length === 1 ? r : null;
  });
  pass('B: the database holds the change', Boolean(rows));
  pass('B: Save my edit goes back to the summary', await saveMyChange());
  pass('B: the summary no longer lists it', !(await summaryText()).includes(SHORT), await summaryText());

  // C. Typed words, refreshed at once.
  await change('Gratitude');
  const WORDS = 'A quiet hour before the first call';
  await page.locator('.ds-guide-body textarea').first().fill(WORDS);
  await page.reload();
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('C: after a refresh the gratitude step is open', /grateful/.test(await heading()) && (await nextLabel()) === 'Save my edit', `${await heading()} / ${await nextLabel()}`);
  pass('C: the typed words are still there', (await until(async () => (await page.locator('.ds-guide-body textarea').first().inputValue()) === WORDS, 5000)) === true);
  pass('C: Save my edit goes back to the summary', await saveMyChange());
  pass('C: the summary shows the words', (await summaryText()).includes(WORDS));
  pass('C: the database has the words', (await until(async () => (await dayPlan())?.grateful_for === WORDS)) === true);

  // D. The tab closed in the middle of a change, the tool opened again.
  await change('Biggest risk');
  const RISK = 'The afternoon fills with calls';
  await page.locator('.ds-guide-body textarea').first().fill(RISK);
  await page.close();
  page = await context.newPage();
  watch(page);
  await page.goto(`${APP}${PLAN}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('D: opened again, the risk step is open', /risk/.test(await heading()) && (await nextLabel()) === 'Save my edit', `${await heading()} / ${await nextLabel()}`);
  pass('D: the typed words are still there', (await until(async () => (await page.locator('.ds-guide-body textarea').first().inputValue()) === RISK, 5000)) === true);
  pass('D: Save my edit goes back to the summary', await saveMyChange());
  pass('D: the summary shows the words', (await summaryText()).includes(RISK));
  pass('D: the database has the words', (await until(async () => (await dayPlan())?.biggest_risk === RISK)) === true);

  // F. Back from a change forgets it.
  await change('Gratitude');
  await page.locator('.ds-guide-back').click();
  pass('F: Back returns to the summary', await onSummary());
  await page.reload();
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('F: a refresh then opens the summary', await onSummary());
  // Closing a finished tool forgets the step too.
  await change('Gratitude');
  await page.locator('.ds-guide-close').click();
  await page.waitForURL((u) => !u.pathname.startsWith(PLAN), { timeout: 10000 });
  await page.goto(`${APP}${PLAN}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('F: closed and opened again, a finished plan opens on its summary', await onSummary());

  // E. The Daily review: finished, then one answer changed and refreshed.
  await page.goto(`${APP}${REVIEW}`);
  await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 30000 });
  for (let i = 0; i < 12 && !(await page.locator('.ds-guide-summary').count()); i += 1) {
    // One-answer screens: the first answer; the rest: Next.
    if (await page.locator('.ds-guide-next').count()) await next();
    else {
      const before = await heading();
      await page.locator('.ds-guide-body .ds-answer').first().click();
      await until(async () => (await heading()) !== before, 3000);
    }
  }
  if (!(await onSummary())) throw new Error(`The review didn't reach its summary ("${await heading()}")`);
  for (let i = 0; i < 5 && (await dayReview())?.status !== 'finished'; i += 1) {
    await sleep(450);
    await page.locator('.ds-guide-next').click().catch(() => null);
    await until(async () => (await dayReview())?.status === 'finished', 4000);
  }
  pass('E: the review is finished', (await dayReview())?.status === 'finished');
  await until(() => queueEmpty());
  await page.goto(`${APP}${REVIEW}`);
  pass('E: a finished review opens on its summary', await onSummary());
  pass('E: the review summary heading is "This was your day", with no line under it', (await heading()) === 'This was your day' && (await page.locator('.ds-guide-nudge').count()) === 0, await heading());
  const first = page.locator('.ds-guide-summary-change').first();
  const what = await first.getAttribute('aria-label');
  await first.click();
  await until(async () => (await nextLabel()) === 'Save my edit' || !(await page.locator('.ds-guide-next').count()), 5000);
  const step = await heading();
  await page.reload();
  await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 30000 });
  pass(`E: after a refresh "${what}" is still open`, (await heading()) === step, `${await heading()} (was ${step})`);
  await page.locator('.ds-guide-back').click();
  pass('E: Back returns to the summary', await onSummary());
} catch (e) {
  pass('ran to the end', false, e.message.split('\n')[0]);
}

await browser.close();
await cleanDay();
seedForReal('--reset');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
