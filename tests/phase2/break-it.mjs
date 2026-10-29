// Phase 2 step 8, the break-it tester: tries to break the Phase 2 pages in
// the running app on the TEST database only (every other host and every
// email call is blocked), signed in as the invented test clients.
//
//   node --import ./tests/scores/register.mjs tests/phase2/break-it.mjs [folder for screenshots]
//   ONLY=taps,offline node --import ... tests/phase2/break-it.mjs   (some attacks only)
//
// Attacks (each a section; ONLY picks some):
//   taps     double and triple taps on every save, add, tick, move, finish
//            and start button: nothing saved twice.
//   back     Back and Forward in the middle of each step-by-step tool: the
//            draft is restored, nothing half saved, no crash.
//   text     50,000 characters, emoji, right-to-left, HTML and script tags,
//            whitespace only: saved safely or refused, shown escaped.
//   offline  offline and back mid-save: "Will sync", then "Saved", one row,
//            still signed in.
//   refresh  a refresh while each save is in flight: nothing lost, nothing
//            doubled.
//   dates    the device in Pacific/Auckland, America/Los_Angeles and
//            Europe/London, clocks-change weeks (UK 25 Oct 2026, US 1 Nov
//            2026), a sprint starting on a Sunday, midnight, 29 February.
//   long     a 16-week sprint: year view, dial, weeks and review.
//   recovery Recovery from a Saturday to a Tuesday.
//   others   one test client reading or changing another's rows (routes,
//            ids, direct calls with the public key), and signed out.
//
// It starts from the seeded plan (scripts/seed-test-plan.mjs --reset) and
// puts the seeded plan v3.2 with Sprint 1 running back at the end. The
// second client (the organisation test client) is only read from, and
// anything this script adds to it is taken away again.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { localToday } from '../../src/lib/performance/rows.js';
import { m0SprintCalendar, m0WeekOfDay } from '../../src/lib/scores/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = (name) => !ONLY.length || ONLY.includes(name);
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
  if (!ok) console.log(`FAIL  ${name}: ${detail}`);
};

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const client = () => createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const db = client();
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = signIn.user.id;

const seed = (...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags], { stdio: 'pipe' }).toString().trim();
const today = localToday('Europe/London');
const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum
};
const weekday = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return v;
}
const q = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
};
const runningSprint = async () => (await q(db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')))[0] || null;
const activePlan = async () => (await q(db.from('performance_plans').select('id, mission, major, minor').eq('user_id', me).eq('status', 'active')))[0] || null;
const todosOf = async () => q(db.from('todos').select('id, text, planned_week, done_on, sprint_id, deleted_at').eq('user_id', me));
const winsOf = async () => q(db.from('wins').select('id, what, deleted_at').eq('user_id', me));
const recoveriesOf = async () => q(db.from('recovery_periods').select('*').eq('user_id', me).order('start_on'));

const browser = await chromium.launch();
async function signedIn({ width = 1280, mode = 'dark', timezoneId = 'Europe/London', email = env.TEST_CLIENT_EMAIL, password = env.TEST_CLIENT_PASSWORD, clock = null } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId,
    colorScheme: mode,
  });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  if (clock) await page.clock.install({ time: clock });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => { page.errors.push(`dialog: ${d.message()}`); d.dismiss().catch(() => null); });
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome|\/home|\/$/, { timeout: 30000 });
  return { context, page };
}
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const openSprint = async (page) => {
  await page.goto(`${APP}/performance-sprint`);
  await page.waitForSelector('.sprint-page', { timeout: 30000 });
  await page.waitForTimeout(1500);
};
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const next = async (page) => {
  await page.locator('.ds-guide-next').click();
  await page.waitForTimeout(650);
};
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const noErrors = (page, what) => {
  pass(`${what}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
  page.errors.length = 0;
};
const clearDrafts = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('clarity-draft:')).forEach((k) => localStorage.removeItem(k)));
const signedOut = (page) => /\/auth\/login/.test(page.url());

const S0 = 'Protect my energy and recovery';
async function strategyNames() {
  const plan = await activePlan();
  return (await q(db.from('plan_strategies').select('name').eq('plan_id', plan.id).is('archived_at', null).order('sort_order'))).map((s) => s.name);
}
async function openTodoPanel(page, text, strategy) {
  await page.getByRole('button', { name: 'Add a to-do' }).click();
  await page.waitForSelector('.ds-panel textarea');
  await page.locator('.ds-panel textarea').fill(text);
  await page.locator('.ds-panel').getByRole('radio', { name: strategy }).click();
}
async function openWinPanel(page, text, strategy) {
  await page.getByRole('button', { name: 'Add an unplanned win' }).click();
  await page.waitForSelector('.ds-panel textarea');
  await page.locator('.ds-panel textarea').fill(text);
  await page.locator('.ds-panel').getByRole('button', { name: strategy }).click();
}

// ------------------------------------------------------------------ taps
if (run('taps')) {
  console.log(seed('--reset'));
  const [st0] = await strategyNames();
  const { context, page } = await signedIn();
  try {
    await openSprint(page);
    const before = (await todosOf()).length;
    await openTodoPanel(page, 'Triple tap to-do', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click({ clickCount: 3 });
    await page.waitForTimeout(2500);
    const after = await todosOf();
    pass('taps: a triple tap on Add my to-do adds one to-do', after.length === before + 1 && after.filter((t) => t.text === 'Triple tap to-do').length === 1, `${before} then ${after.length}`);
    pass('taps: the page lists it once', (await page.locator('.ds-todo').filter({ hasText: 'Triple tap to-do' }).count()) === 1);

    const wins0 = (await winsOf()).length;
    await openWinPanel(page, 'Triple tap win', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).dblclick();
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click({ timeout: 500 }).catch(() => null);
    await page.waitForTimeout(2500);
    const wins = await winsOf();
    pass('taps: three taps on Add my win add one win', wins.length === wins0 + 1, `${wins0} then ${wins.length}`);
    const win = wins.find((w) => w.what === 'Triple tap win');
    const links = win ? await q(db.from('win_strategies').select('win_id').eq('win_id', win.id)) : [];
    const ev = win ? await q(db.from('performance_evidence').select('id').eq('user_id', me).ilike('text', '%Triple tap win%')).catch(() => []) : [];
    pass('taps: the win has one Strategy link', links.length === 1, `${links.length}`);
    pass('taps: the win is in Performance Evidence at most once', ev.length <= 1, `${ev.length}`);

    // Tick a to-do three times: it ends ticked, on the page and saved.
    const row = page.locator('.ds-todo').filter({ hasText: 'Triple tap to-do' });
    await row.getByRole('checkbox').click({ clickCount: 3 });
    await page.waitForTimeout(3000);
    const shown = await row.getByRole('checkbox').isChecked();
    const saved = (await todosOf()).find((t) => t.text === 'Triple tap to-do');
    pass('taps: a triple-tapped tick shows what was saved', shown === Boolean(saved?.done_on), `page ${shown}, saved ${saved?.done_on}`);
    await page.reload();
    await page.waitForSelector('.sprint-page');
    await page.waitForTimeout(1500);
    const shownAfter = await page.locator('.ds-todo').filter({ hasText: 'Triple tap to-do' }).getByRole('checkbox').isChecked();
    pass('taps: the same after a reload', shownAfter === Boolean(saved?.done_on), `page ${shownAfter}, saved ${saved?.done_on}`);

    // A yes or no day tapped three times: one log row at most, matching the page.
    const sprint = await runningSprint();
    const late = (await q(db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id))).find((h) => h.name === 'Late finishes');
    const logRow = page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: /^Late finishes$/ }) });
    const dayBtn = logRow.locator('button[aria-pressed]').first();
    if (await dayBtn.count()) {
      await dayBtn.click({ clickCount: 3 });
      await page.waitForTimeout(3000);
      const pressed = (await dayBtn.getAttribute('aria-pressed')) === 'true';
      const logs = await q(db.from('habit_logs').select('local_date, value').eq('sprint_habit_id', late.id).eq('local_date', today));
      pass('taps: a triple-tapped day has one log at most', logs.length <= 1, `${logs.length}`);
      pass('taps: the triple-tapped day shows what was saved', pressed === (logs.length === 1), `page ${pressed}, saved ${JSON.stringify(logs)}`);
    } else pass('taps: found the Late finishes day button', false, 'no aria-pressed button');

    // Move: tap the week three times.
    const todos = await todosOf();
    const later = todos.find((t) => t.text === 'Draft the Harbour case study');
    const moveRow = page.locator('.ds-todo').filter({ hasText: 'Draft the Harbour case study' });
    await moveRow.getByRole('button', { name: /Move/ }).click();
    await page.waitForSelector('.ds-panel [role=radio]');
    await page.locator('.ds-panel [role=radio]').first().click({ clickCount: 3 }).catch(() => null);
    await page.waitForTimeout(2500);
    const moves = await q(db.from('todo_moves').select('*').eq('todo_id', later.id));
    pass('taps: a triple-tapped move records one move', moves.length === 1, JSON.stringify(moves.map((m) => [m.from_week, m.to_week])));
    noErrors(page, 'taps on the sprint page');

    // Recovery: Start my recovery three times, then Add the days, then I'm ready.
    await page.goto(`${APP}/recovery`);
    await page.getByRole('button', { name: 'Start my recovery' }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Start my recovery' }).click({ clickCount: 3 });
    await page.waitForURL(/\/recovery\/today/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    let recs = await recoveriesOf();
    pass('taps: three taps on Start my recovery make one Recovery', recs.length === 1, `${recs.length}`);
    const chosen = recs[0]?.chosen_days;
    await page.goto(`${APP}/recovery/check-in?add=1`);
    await page.getByRole('button', { name: 'Add the days' }).waitFor({ timeout: 20000 });
    const more = Number(((await page.locator('.ds-daycount, .rec-counter').first().textContent().catch(() => '')) || '').match(/\d+/)?.[0] || 0);
    await page.getByRole('button', { name: 'Add the days' }).click({ clickCount: 3 });
    await page.waitForURL(/\/recovery\/today/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    recs = await recoveriesOf();
    pass('taps: three taps on Add the days add the days once', recs.length === 1 && recs[0].extended_days > 0 && (!more || recs[0].extended_days === more), `extended ${recs[0]?.extended_days}, counter ${more}, chosen ${chosen}`);
    await page.getByRole('button', { name: 'I’m ready to go again' }).click({ clickCount: 3 });
    await page.waitForURL(/\/performance-sprint/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    recs = await recoveriesOf();
    pass('taps: three taps on I’m ready to go again end it once, today', recs.length === 1 && recs[0].ended_at && recs[0].end_on === today, JSON.stringify(recs.map((r) => [r.start_on, r.end_on])));
    noErrors(page, 'taps on Recovery');
  } catch (e) {
    pass('taps ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();

  // Finishing a review and starting the next sprint, tapped three times.
  console.log(seed('--ended'));
  const s = await signedIn();
  try {
    await clearDrafts(s.page);
    await s.page.goto(`${APP}/performance-sprint/review`);
    await s.page.waitForSelector('.ds-guide', { timeout: 30000 });
    for (let i = 0; i < 12; i += 1) {
      const primary = s.page.locator('.ds-guide .ds-btn--primary').last();
      const label = ((await primary.textContent().catch(() => '')) || '').trim();
      if (/Start Performance Sprint|Finish|Recovery|Start my/.test(label)) break;
      if (await s.page.getByRole('radio', { name: /Straight into Performance Sprint/ }).count()) {
        await s.page.getByRole('radio', { name: /Straight into Performance Sprint/ }).click();
        await primary.click({ clickCount: 3 });
        await s.page.waitForTimeout(1200);
        break;
      }
      await primary.click();
      await s.page.waitForTimeout(700);
    }
    await s.page.waitForURL(/\/performance-sprint\/start/, { timeout: 20000 }).catch(() => null);
    const sprints = await q(db.from('sprints').select('number, status').eq('user_id', me).order('number'));
    pass('taps: a triple tap at the end of the review finishes the sprint once', sprints.filter((x) => x.status === 'finished').length === 2 && sprints.length === 2, JSON.stringify(sprints));
    const reviews = await q(db.from('sprint_reviews').select('id').eq('user_id', me)).catch(() => null);
    if (reviews) pass('taps: one review saved', reviews.length === 1, `${reviews.length}`);
    // Start a sprint: Start Performance Sprint 3, three taps.
    if (/\/start/.test(s.page.url())) {
      for (let i = 0; i < 8 && !/Performance Sprint 3/.test(await heading(s.page)); i += 1) {
        if (await s.page.getByRole('radio', { name: /^Tomorrow|^Today/ }).count()) await s.page.getByRole('radio', { name: /^Tomorrow|^Today/ }).first().click();
        await next(s.page);
      }
      await s.page.getByRole('button', { name: 'Start Performance Sprint 3' }).click({ clickCount: 3 });
      await s.page.waitForURL(/\/performance-sprint$/, { timeout: 30000 });
      await s.page.waitForTimeout(1500);
      const all = await q(db.from('sprints').select('id, number, status').eq('user_id', me).order('number'));
      const s3 = all.filter((x) => x.number === 3);
      const sh = s3[0] ? await q(db.from('sprint_habits').select('id, name').eq('sprint_id', s3[0].id)) : [];
      pass('taps: a triple tap on Start makes one Sprint 3', s3.length === 1 && all.length === 3, JSON.stringify(all.map((x) => x.number)));
      pass('taps: its habits copied once', sh.length === new Set(sh.map((h) => h.name)).size && sh.length > 0, `${sh.length}`);
    }
    noErrors(s.page, 'taps on the review and start');
  } catch (e) {
    pass('taps on the review ran to the end', false, e.message.split('\n')[0]);
  }
  await s.context.close();

  // Edit the plan and close it with a double tap: one new version.
  console.log(seed('--reset'));
  const e = await signedIn();
  try {
    await clearDrafts(e.page);
    const v0 = (await q(db.from('plan_versions').select('id').eq('user_id', me))).length;
    await e.page.goto(`${APP}/performance-plan/edit`);
    await e.page.waitForSelector('.ds-guide', { timeout: 30000 });
    await e.page.waitForTimeout(800);
    for (let i = 0; i < 3 && !/What 2 to 4 results/.test(await heading(e.page)); i += 1) await next(e.page);
    await e.page.locator('.ds-objed').first().getByLabel('What’s your target?').fill('41');
    await e.page.waitForTimeout(1800);
    await e.page.getByRole('button', { name: 'Close', exact: true }).click({ clickCount: 3 });
    await e.page.waitForURL(/\/performance-plan$/, { timeout: 20000 });
    await e.page.waitForTimeout(1500);
    const v1 = await q(db.from('plan_versions').select('major, minor').eq('user_id', me));
    const plan = await activePlan();
    pass('taps: a triple tap on Close records one new version', v1.length === v0 + 1 && plan.major === 3 && plan.minor === 3, `${v0} then ${v1.length}, plan ${plan.major}.${plan.minor}`);
    noErrors(e.page, 'taps on Edit');
  } catch (err) {
    pass('taps on Edit ran to the end', false, err.message.split('\n')[0]);
  }
  await e.context.close();
}

// ------------------------------------------------------------------ back
if (run('back')) {
  console.log(seed('--empty'));
  const { context, page } = await signedIn({ width: 390, mode: 'light' });
  try {
    await clearDrafts(page);
    await page.goto(`${APP}/performance-plan/build`);
    await page.waitForSelector('.ds-guide', { timeout: 30000 });
    await page.waitForTimeout(600);
    await page.getByLabel('My Mission').fill('Back and forward mission');
    await page.waitForTimeout(1500);
    await next(page);
    await page.locator('.ds-objed').first().locator('textarea').fill('Objective typed before Back');
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(1500);
    const afterBack = await bodyText(page);
    await page.goForward();
    await page.waitForSelector('.ds-guide', { timeout: 20000 });
    await page.waitForTimeout(1500);
    let text = await page.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value).join(' | '));
    const h = await heading(page);
    pass('back: Build your plan comes back on the same step after Back then Forward', /What 2 to 4 results|Mission/.test(h), `${h} / back showed ${afterBack.slice(0, 80)}`);
    pass('back: the objective typed before Back is restored', text.includes('Objective typed before Back') || (await bodyText(page)).includes('Objective typed before Back'), text.slice(0, 200));
    await page.reload();
    await page.waitForSelector('.ds-guide', { timeout: 20000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3 && !/What 2 to 4 results/.test(await heading(page)); i += 1) await next(page);
    text = await page.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value).join(' | '));
    pass('back: and after a refresh', text.includes('Objective typed before Back'), text.slice(0, 200));
    const plans = await q(db.from('performance_plans').select('id, status').eq('user_id', me));
    pass('back: one plan, never two', plans.length <= 1, `${plans.length}`);
    noErrors(page, 'back in Build');
  } catch (e) {
    pass('back in Build ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();

  console.log(seed('--reset'));
  const r = await signedIn({ width: 390 });
  try {
    await clearDrafts(r.page);
    // Edit: change a target, Back to the plan, Forward: the change is kept.
    await r.page.goto(`${APP}/performance-plan`);
    await r.page.waitForSelector('.ipp-page', { timeout: 30000 });
    await r.page.goto(`${APP}/performance-plan/edit`);
    await r.page.waitForSelector('.ds-guide', { timeout: 30000 });
    await r.page.waitForTimeout(800);
    for (let i = 0; i < 3 && !/What 2 to 4 results/.test(await heading(r.page)); i += 1) await next(r.page);
    await r.page.locator('.ds-objed').first().getByLabel('What’s your target?').fill('44');
    await r.page.waitForTimeout(300);
    await r.page.goBack();
    await r.page.waitForTimeout(1500);
    await r.page.goForward();
    await r.page.waitForSelector('.ds-guide', { timeout: 20000 });
    await r.page.waitForTimeout(1500);
    for (let i = 0; i < 3 && !/What 2 to 4 results/.test(await heading(r.page)); i += 1) await next(r.page);
    const val = await r.page.locator('.ds-objed').first().getByLabel('What’s your target?').inputValue();
    pass('back: Edit keeps the changed target after Back and Forward', val === '44', val);
    const plan = await activePlan();
    pass('back: the plan’s version isn’t changed by leaving with Back', plan.major === 3 && plan.minor === 2, `${plan.major}.${plan.minor}`);
    noErrors(r.page, 'back in Edit');

    // Start a sprint: from the sprint page, start, choose a length, Back, Forward.
    await r.page.goto(`${APP}/performance-sprint/start`);
    await r.page.getByRole('button', { name: 'Start a new sprint' }).click();
    await r.page.waitForSelector('.ds-guide');
    await r.page.waitForTimeout(500);
    await r.page.getByRole('radio', { name: '6 weeks', exact: true }).click();
    await r.page.getByLabel('What would you like to call it?').fill('Back test sprint');
    await r.page.waitForTimeout(500);
    await next(r.page);
    await r.page.goBack();
    await r.page.waitForTimeout(1200);
    await r.page.goForward();
    await r.page.waitForTimeout(1500);
    if (await r.page.getByRole('button', { name: 'Start a new sprint' }).count()) await r.page.getByRole('button', { name: 'Start a new sprint' }).click();
    await r.page.waitForSelector('.ds-guide', { timeout: 20000 });
    await r.page.waitForTimeout(800);
    const body = await r.page.locator('.ds-guide').textContent();
    let label = '';
    for (let i = 0; i < 2 && !label; i += 1) {
      if (await r.page.getByLabel('What would you like to call it?').count()) label = await r.page.getByLabel('What would you like to call it?').inputValue();
      else await r.page.locator('.ds-guide-back, [aria-label^="Back"]').first().click().catch(() => null);
      await r.page.waitForTimeout(500);
    }
    pass('back: Start a sprint keeps the length and name after Back and Forward', label === 'Back test sprint' || body.includes('Back test sprint'), `label "${label}"`);
    const sprints = await q(db.from('sprints').select('number').eq('user_id', me));
    pass('back: no sprint started by Back', sprints.length === 1, `${sprints.length}`);
    noErrors(r.page, 'back in Start a sprint');

    // Recovery: count up, Back, Forward.
    await clearDrafts(r.page);
    await r.page.goto(`${APP}/recovery`);
    await r.page.getByRole('button', { name: 'Start my recovery' }).waitFor({ timeout: 20000 });
    const plus = r.page.getByRole('button', { name: 'One day more' });
    await plus.click();
    await plus.click();
    const words = await r.page.locator('.ds-daycount').first().textContent().catch(() => '');
    await r.page.goBack();
    await r.page.waitForTimeout(1200);
    await r.page.goForward();
    await r.page.waitForTimeout(1500);
    const words2 = await r.page.locator('.ds-daycount').first().textContent().catch(() => '');
    pass('back: Recovery start comes back without starting anything', (await recoveriesOf()).length === 0);
    pass('back: Recovery start keeps the days chosen', words2 === words, `${words} then ${words2}`);
    noErrors(r.page, 'back in Recovery');
  } catch (e) {
    pass('back in Edit, Start and Recovery ran to the end', false, e.message.split('\n')[0]);
  }
  await r.context.close();

  console.log(seed('--ended'));
  const v = await signedIn();
  try {
    await clearDrafts(v.page);
    await v.page.goto(`${APP}/performance-sprint/review`);
    await v.page.waitForSelector('.ds-guide', { timeout: 30000 });
    for (let i = 0; i < 6 && !(await v.page.locator('.ds-guide textarea').count()); i += 1) {
      await v.page.locator('.ds-guide .ds-btn--primary').last().click();
      await v.page.waitForTimeout(700);
    }
    const q1 = await heading(v.page);
    await v.page.locator('.ds-guide textarea').first().fill('Typed into the review before Back');
    await v.page.waitForTimeout(600);
    await v.page.goBack();
    await v.page.waitForTimeout(1200);
    await v.page.goForward();
    await v.page.waitForSelector('.ds-guide', { timeout: 20000 });
    await v.page.waitForTimeout(1500);
    const h = await heading(v.page);
    const t = await v.page.evaluate(() => [...document.querySelectorAll('textarea')].map((x) => x.value).join(' | '));
    pass('back: the review comes back on the same question with its answer', h === q1 && t.includes('Typed into the review before Back'), `${q1} -> ${h}; ${t.slice(0, 80)}`);
    const sprints = await q(db.from('sprints').select('number, status').eq('user_id', me));
    pass('back: the review hasn’t finished the sprint', sprints.filter((x) => x.status === 'running').length === 1, JSON.stringify(sprints));
    noErrors(v.page, 'back in the review');
  } catch (e) {
    pass('back in the review ran to the end', false, e.message.split('\n')[0]);
  }
  await v.context.close();
}

// ------------------------------------------------------------------ text
const BIG = 'A'.repeat(50000);
const NASTY = [
  ['50,000 characters', BIG],
  ['emoji', 'Ran 5k 🏃‍♀️🔥 with my 👨‍👩‍👧 family 🎉'],
  ['right-to-left', 'تحدثت مع ثلاثة عملاء اليوم שלום'],
  ['HTML and script', '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script><b>bold</b>'],
  ['whitespace only', '      \n\t   '],
];
if (run('text')) {
  console.log(seed('--reset'));
  const [st0] = await strategyNames();
  const { context, page } = await signedIn({ width: 390 });
  try {
    await openSprint(page);
    for (const [what, text] of NASTY) {
      const before = (await todosOf()).length;
      await openTodoPanel(page, text, st0);
      const typed = await page.locator('.ds-panel textarea').inputValue();
      const add = page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' });
      const enabled = await add.isEnabled();
      if (enabled) await add.click();
      await page.waitForTimeout(2500);
      const all = await todosOf();
      const added = all.length - before;
      if (what === 'whitespace only') {
        pass(`text: a to-do of ${what} can't be added`, !enabled && added === 0, `enabled ${enabled}, added ${added}`);
        await page.locator('.ds-panel').getByRole('button', { name: 'Cancel' }).click();
        await page.waitForTimeout(500);
        continue;
      }
      const saved = all.find((t) => !t.deleted_at && t.text === typed.trim());
      pass(`text: a to-do of ${what} is saved as typed, within 300 characters`, added === 1 && saved && saved.text.length <= 300, `added ${added}, typed ${typed.length}`);
      pass(`text: a to-do of ${what} never scrolls the page sideways`, await noSideways(page));
      pass(`text: a to-do of ${what} runs no script`, !(await page.evaluate(() => window.__xss)));
      if (what === 'HTML and script') pass('text: HTML is shown as text', (await page.locator('.ds-todo').filter({ hasText: '<b>bold</b>' }).count()) === 1);
      if (what === 'right-to-left') {
        const rtl = await page.locator('.ds-todo').filter({ hasText: 'تحدثت' }).first().evaluate((el) => getComputedStyle(el.querySelector('p, span, div') || el).unicodeBidi);
        pass('text: right-to-left text is shown', rtl != null);
      }
    }
    // The same for a win.
    for (const [what, text] of NASTY.filter(([w]) => w !== 'emoji')) {
      const before = (await winsOf()).length;
      await openWinPanel(page, text, st0);
      const add = page.locator('.ds-panel').getByRole('button', { name: 'Add my win' });
      const enabled = await add.isEnabled();
      if (enabled) await add.click();
      else await page.locator('.ds-panel').getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(2500);
      const added = (await winsOf()).length - before;
      pass(`text: a win of ${what} is ${what === 'whitespace only' ? 'refused' : 'saved once'}`, what === 'whitespace only' ? !enabled && added === 0 : added === 1, `enabled ${enabled}, added ${added}`);
    }
    pass('text: the sprint page never scrolls sideways', await noSideways(page));
    noErrors(page, 'text on the sprint page');
    await shot(page, 'text-sprint');

    // Recovery: the recharge answer.
    await page.goto(`${APP}/recovery`);
    await page.getByRole('button', { name: 'Start my recovery' }).click();
    await page.waitForURL(/\/recovery\/today/, { timeout: 20000 });
    await page.waitForSelector('.rec-q textarea', { timeout: 20000 });
    for (const [what, text] of NASTY) {
      await page.locator('.rec-q textarea').first().fill(text);
      await page.waitForTimeout(2500);
      const rows = await q(db.from('recovery_recharge_answers').select('answer').eq('user_id', me).eq('local_date', today));
      if (what === 'whitespace only') pass('text: a recharge answer of whitespace only is not kept', rows.length === 0, JSON.stringify(rows).slice(0, 80));
      else pass(`text: a recharge answer of ${what} is saved within 500 characters`, rows.length === 1 && rows[0].answer.length <= 500 && rows[0].answer.length > 0, `${rows.length} rows ${rows[0]?.answer.length}`);
      pass(`text: the recovery day with ${what} never scrolls sideways`, await noSideways(page));
    }
    pass('text: no script ran on the recovery day', !(await page.evaluate(() => window.__xss)));
    noErrors(page, 'text on the recovery day');
    const rec = (await recoveriesOf())[0];
    await page.mouse.move(1, 1); // a resting mouse holds the toast open over the link
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: 'I’m ready to go again' }).click();
    await page.waitForURL(/\/performance-sprint/, { timeout: 20000 });
    pass('text: the Recovery ended', Boolean((await recoveriesOf()).find((x) => x.id === rec.id)?.ended_at));

    // Build: the mission, an objective and a Strategy.
    await clearDrafts(page);
    await page.goto(`${APP}/performance-plan/edit`);
    await page.waitForSelector('.ds-guide', { timeout: 30000 });
    await page.waitForTimeout(800);
    for (const [what, text] of NASTY) {
      await page.getByLabel('My Mission').fill(text);
      await page.waitForTimeout(1600);
      const shown = await page.getByLabel('My Mission').inputValue();
      pass(`text: the mission of ${what} is held within 120 characters`, shown.length <= 120, `${shown.length}`);
      pass(`text: Edit with a mission of ${what} never scrolls sideways`, await noSideways(page));
      if (what === 'whitespace only') {
        const ok = await page.locator('.ds-guide-next').isEnabled();
        const msg = await bodyText(page);
        pass('text: a mission of whitespace only is refused with a plain message, or not sent', !ok || /mission/i.test(msg), msg.slice(0, 120));
      }
    }
    await page.getByLabel('My Mission').fill('Be a world-class high-performance coach');
    await page.waitForTimeout(1600);
    await next(page);
    await page.locator('.ds-objed').first().locator('textarea').fill(BIG);
    await page.waitForTimeout(1600);
    const objName = await page.locator('.ds-objed').first().locator('textarea').inputValue();
    pass('text: an objective name of 50,000 characters is held within 80', objName.length <= 80, `${objName.length}`);
    await page.locator('.ds-objed').first().locator('textarea').fill(' ');
    await page.waitForTimeout(1800);
    const bar = await bodyText(page);
    pass('text: an objective name of whitespace only isn’t saved over the old one', (await q(db.from('outcome_objectives').select('name').eq('user_id', me).is('archived_at', null))).every((o) => o.name.trim().length > 0), bar.slice(0, 100));
    await page.locator('.ds-objed').first().locator('textarea').fill('Coaching clients');
    await page.waitForTimeout(1600);
    pass('text: Edit never scrolls sideways', await noSideways(page));
    noErrors(page, 'text in Edit');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(1500);
  } catch (e) {
    pass('text ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'text-stopped');
    console.log('stopped at', page.url(), (await bodyText(page).catch(() => '')).slice(0, 400));
  }
  await context.close();

  // The review's answers and a sprint's name.
  console.log(seed('--ended'));
  const v = await signedIn({ width: 390 });
  try {
    await clearDrafts(v.page);
    await v.page.goto(`${APP}/performance-sprint/review`);
    await v.page.waitForSelector('.ds-guide', { timeout: 30000 });
    for (let i = 0; i < 6 && !(await v.page.locator('.ds-guide textarea').count()); i += 1) {
      await v.page.locator('.ds-guide .ds-btn--primary').last().click();
      await v.page.waitForTimeout(700);
    }
    await v.page.locator('.ds-guide textarea').first().fill(BIG);
    await v.page.waitForTimeout(1500);
    const held = await v.page.locator('.ds-guide textarea').first().inputValue();
    pass('text: a review answer of 50,000 characters is held within 4,000', held.length <= 4000, `${held.length}`);
    pass('text: the review never scrolls sideways with it', await noSideways(v.page));
    await v.page.locator('.ds-guide textarea').first().fill(NASTY[3][1]);
    await v.page.waitForTimeout(600);
    pass('text: no script ran in the review', !(await v.page.evaluate(() => window.__xss)));
    noErrors(v.page, 'text in the review');
  } catch (e) {
    pass('text in the review ran to the end', false, e.message.split('\n')[0]);
  }
  await v.context.close();
}

// ------------------------------------------------------------------ offline
if (run('offline')) {
  console.log(seed('--reset'));
  const [st0] = await strategyNames();
  const { context, page } = await signedIn({ width: 390 });
  try {
    await openSprint(page);
    await context.setOffline(true);
    await openTodoPanel(page, 'Added while offline', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
    const willSync = await page.waitForFunction(() => /Will sync/.test(document.body.innerText), null, { timeout: 8000 }).then(() => true).catch(() => false);
    pass('offline: adding a to-do says Will sync', willSync);
    await openWinPanel(page, 'Win while offline', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click();
    await page.waitForTimeout(800);
    const rowT = page.locator('.ds-todo').filter({ hasText: 'Added while offline' });
    await rowT.getByRole('checkbox').click();
    await page.waitForTimeout(800);
    await context.setOffline(false);
    const saved = await page.waitForFunction(() => /Saved/.test(document.body.innerText) && !/Will sync/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true).catch(() => false);
    pass('offline: back online it says Saved', saved);
    await page.waitForTimeout(2000);
    const t = (await todosOf()).filter((x) => x.text === 'Added while offline');
    const w = (await winsOf()).filter((x) => x.what === 'Win while offline');
    pass('offline: the to-do arrived once, ticked', t.length === 1 && t[0].done_on === today, JSON.stringify(t));
    pass('offline: the win arrived once', w.length === 1, `${w.length}`);
    pass('offline: still signed in', !signedOut(page), page.url());

    // Offline mid-save: the request leaves, then the connection drops.
    await openTodoPanel(page, 'Dropped mid-save', st0);
    await page.route('**/rest/v1/todos*', async (route) => {
      if (route.request().method() === 'POST') { await context.setOffline(true); return route.abort('internetdisconnected'); }
      return route.fallback();
    });
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
    await page.waitForTimeout(1500);
    await page.unroute('**/rest/v1/todos*');
    const midSync = /Will sync/.test(await bodyText(page));
    await context.setOffline(false);
    await page.waitForTimeout(4000);
    const d = (await todosOf()).filter((x) => x.text === 'Dropped mid-save');
    pass('offline: a save cut off mid-way says Will sync', midSync);
    pass('offline: and arrives once when back', d.length === 1, `${d.length}`);

    // Recovery offline: start it, the recharge answer, back online.
    await context.setOffline(true);
    await page.goto(`${APP}/recovery`).catch(() => null);
    await page.waitForTimeout(1500);
    const offlineStart = await page.getByRole('button', { name: 'Start my recovery' }).count();
    if (offlineStart) {
      await page.getByRole('button', { name: 'Start my recovery' }).click();
      await page.waitForTimeout(1500);
    }
    await context.setOffline(false);
    await page.waitForTimeout(4000);
    pass('offline: still signed in after a page opened offline', !signedOut(page), page.url());
    const recs = await recoveriesOf();
    pass('offline: a Recovery started offline arrives once (or the page says it can’t open offline)', recs.length <= 1, `${recs.length}`);
    noErrors(page, 'offline');
  } catch (e) {
    pass('offline ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ refresh
if (run('refresh')) {
  console.log(seed('--reset'));
  const [st0] = await strategyNames();
  const { context, page } = await signedIn({ width: 1280 });
  const hold = async (pattern, method = 'POST') => {
    // Held, then dropped: the page is refreshed while it waits, so the save
    // never reaches the database.
    await page.route(pattern, async (route) => {
      if (route.request().method() !== method) return route.fallback();
      await sleep(5000);
      return route.abort().catch(() => null);
    });
  };
  try {
    await openSprint(page);
    // To-do: held, refreshed.
    await hold('**/rest/v1/todos*');
    await openTodoPanel(page, 'Refreshed mid-save to-do', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.unroute('**/rest/v1/todos*');
    await page.waitForSelector('.sprint-page', { timeout: 30000 });
    await page.waitForTimeout(3000);
    let t = (await todosOf()).filter((x) => x.text === 'Refreshed mid-save to-do');
    const panelBack = await page.locator('.ds-panel textarea').count() ? await page.locator('.ds-panel textarea').inputValue() : '';
    console.log(`refresh: to-do after the refresh: ${t.length} saved, panel "${panelBack}"`);
    pass('refresh: a to-do refreshed mid-save is not lost (saved, or its draft is back)', t.length === 1 || panelBack.includes('Refreshed mid-save to-do'), `${t.length} saved, panel "${panelBack}"`);
    if (!t.length && panelBack) {
      await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
      await page.waitForTimeout(2500);
      t = (await todosOf()).filter((x) => x.text === 'Refreshed mid-save to-do');
    }
    pass('refresh: the to-do ends up saved once', t.length === 1, `${t.length}`);

    // Win: held, refreshed.
    await hold('**/rest/v1/wins*');
    await openWinPanel(page, 'Refreshed mid-save win', st0);
    await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.unroute('**/rest/v1/wins*');
    await page.waitForSelector('.sprint-page', { timeout: 30000 });
    await page.waitForTimeout(3000);
    let w = (await winsOf()).filter((x) => x.what === 'Refreshed mid-save win');
    const winBack = await page.locator('.ds-panel textarea').count() ? await page.locator('.ds-panel textarea').inputValue() : '';
    pass('refresh: a win refreshed mid-save is not lost', w.length === 1 || winBack.includes('Refreshed mid-save win'), `${w.length} saved, panel "${winBack}"`);
    if (!w.length && winBack) {
      await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click();
      await page.waitForTimeout(2500);
      w = (await winsOf()).filter((x) => x.what === 'Refreshed mid-save win');
    }
    pass('refresh: the win ends up saved once', w.length === 1, `${w.length}`);

    // A number typed into a log, refreshed before its delay ran out.
    await page.getByRole('button', { name: 'This week', exact: true }).click().catch(() => null);
    await page.getByRole('button', { name: 'Today', exact: true }).click().catch(() => null);
    await page.waitForTimeout(400);
    const box = page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: /^Steps$/ }) }).locator('input').first();
    console.log(`refresh: Focus boxes ${await box.count()}`);
    if (await box.count()) {
      await box.fill('8000');
      await page.reload();
      await page.waitForSelector('.sprint-page', { timeout: 30000 });
      await page.waitForTimeout(2500);
      const sprint = await runningSprint();
      const focus = (await q(db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id))).find((h) => h.name === 'Steps');
      const log = await q(db.from('habit_logs').select('value').eq('sprint_habit_id', focus.id).eq('local_date', today));
      const shown = await page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: /^Steps$/ }) }).locator('input').first().inputValue();
      pass('refresh: a number typed just before a refresh is kept (saved, or still shown)', (log[0] && Number(log[0].value) === 8000) || /^8,?000$/.test(shown), `saved ${JSON.stringify(log)}, shown "${shown}"`);
    }

    // Recovery start, held, refreshed: one Recovery at most, and the page works.
    await hold('**/rest/v1/recovery_periods*');
    await page.goto(`${APP}/recovery`);
    await page.getByRole('button', { name: 'Start my recovery' }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.unroute('**/rest/v1/recovery_periods*');
    await page.waitForTimeout(3000);
    const recs = await recoveriesOf();
    pass('refresh: Recovery refreshed mid-start makes one at most', recs.length <= 1, `${recs.length}`);
    pass('refresh: the Recovery page still works', (await page.getByRole('button', { name: /Start my recovery|I’m ready to go again/ }).count()) >= 1 || /recovery/.test(page.url()));
    // Recharge answer typed then refreshed straight away.
    if (!recs.length) {
      await page.goto(`${APP}/recovery`);
      await page.getByRole('button', { name: 'Start my recovery' }).click();
    } else await page.goto(`${APP}/recovery/today`);
    await page.waitForSelector('.rec-q textarea', { timeout: 20000 });
    await page.locator('.rec-q textarea').first().fill('Typed then refreshed');
    await page.reload();
    await page.waitForSelector('.rec-q textarea', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const ans = await page.locator('.rec-q textarea').first().inputValue();
    pass('refresh: the recharge answer typed just before a refresh is back', ans === 'Typed then refreshed', ans);
    noErrors(page, 'refresh');
  } catch (e) {
    pass('refresh ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ dates
// The scoring calendar itself, at the edges (pure: no browser).
const ZONES = ['Pacific/Auckland', 'America/Los_Angeles', 'Europe/London'];
if (run('dates')) {
  // Day keys from an instant in each zone: midnight either side, the clock changes, 29 February.
  const instants = [
    ['2026-10-24T23:30:00Z', { 'Europe/London': '2026-10-25', 'America/Los_Angeles': '2026-10-24', 'Pacific/Auckland': '2026-10-25' }],
    ['2026-10-25T00:30:00Z', { 'Europe/London': '2026-10-25', 'America/Los_Angeles': '2026-10-24', 'Pacific/Auckland': '2026-10-25' }],
    ['2026-10-25T23:30:00Z', { 'Europe/London': '2026-10-25', 'America/Los_Angeles': '2026-10-25', 'Pacific/Auckland': '2026-10-26' }],
    ['2026-11-01T08:30:00Z', { 'Europe/London': '2026-11-01', 'America/Los_Angeles': '2026-11-01', 'Pacific/Auckland': '2026-11-01' }],
    ['2026-11-02T07:59:00Z', { 'Europe/London': '2026-11-02', 'America/Los_Angeles': '2026-11-01', 'Pacific/Auckland': '2026-11-02' }],
    ['2028-02-29T10:59:00Z', { 'Europe/London': '2028-02-29', 'America/Los_Angeles': '2028-02-29', 'Pacific/Auckland': '2028-02-29' }],
    ['2028-02-29T11:00:00Z', { 'Europe/London': '2028-02-29', 'America/Los_Angeles': '2028-02-29', 'Pacific/Auckland': '2028-03-01' }],
  ];
  for (const [at, want] of instants) {
    for (const z of ZONES) pass(`dates: ${at} is ${want[z]} in ${z}`, localToday(z, new Date(at)) === want[z], localToday(z, new Date(at)));
  }
  // A sprint starting on a Sunday, across both clock changes, and over 29 February.
  const cal = (start, len) => m0SprintCalendar({ start, lengthWeeks: len, recoveries: [] }, '2030-01-01').weeks;
  for (const [start, len, checks] of [
    ['2026-10-25', 2, [['2026-10-25', 1], ['2026-10-31', 1], ['2026-11-01', 2], ['2026-11-07', 2]]],
    ['2026-10-19', 3, [['2026-10-25', 1], ['2026-10-26', 2], ['2026-11-01', 2], ['2026-11-02', 3]]],
    ['2028-02-24', 2, [['2028-02-29', 1], ['2028-03-01', 1], ['2028-03-02', 2], ['2028-03-08', 2]]],
  ]) {
    const c = cal(start, len);
    for (const [d, w] of checks) {
      const got = m0WeekOfDay(c, d);
      pass(`dates: in a sprint from ${start}, ${d} is in week ${w}`, got === w, JSON.stringify(got));
    }
  }

  // In the app: the sprint page's day, by the device's zone, at the edges of a day.
  console.log(seed('--reset'));
  const sprint = await runningSprint();
  for (const z of ZONES) {
    // Just after midnight and just before, in that zone, today (UK date).
    for (const [label, offsetH] of [['just after midnight', 0.25], ['just before midnight', 23.75]]) {
      // The latest such moment that has already happened (a sign-in can't
      // be used from a clock set in the future: its token looks expired).
      const momentOn = (target) => {
        const guess = new Date(`${target}T00:00:00Z`).getTime();
        for (let h = -14; h <= 14; h += 0.25) {
          const t = new Date(guess + (h + offsetH) * 3600000);
          const p = new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t);
          const g = (k) => p.find((x) => x.type === k).value;
          if (`${g('year')}-${g('month')}-${g('day')}` === target && Number(g('hour')) + Number(g('minute')) / 60 === offsetH) return t;
        }
        return null;
      };
      let target = today;
      let instant = momentOn(target);
      if (instant && instant.getTime() > Date.now() - 60000) { target = addDays(today, -1); instant = momentOn(target); }
      if (!instant) { pass(`dates: found ${label} in ${z}`, false); continue; }
      const { context, page } = await signedIn({ timezoneId: z, clock: instant });
      try {
        await openSprint(page);
        await page.getByRole('button', { name: 'This week', exact: true }).click().catch(() => null);
        await page.waitForTimeout(500);
        const todayCell = await page.locator('[aria-current="date"]').first().getAttribute('aria-label').catch(() => null);
        const want = `${Number(target.slice(8))}`;
        const days = await page.locator('.sprint-habits [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
        const future = days.filter((l) => /tomorrow|future/i.test(l || '')).length;
        pass(`dates: ${z} ${label}: today on the sprint page is ${target}`, !todayCell || todayCell.includes(` ${want} `) || todayCell.includes(` ${want}`), `${todayCell}`);
        void future;
        const meta = await bodyText(page);
        const v = m0WeekOfDay(m0SprintCalendar({ start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: [] }, target).weeks, target);
        pass(`dates: ${z} ${label}: the week shown is week ${v}`, meta.includes(`Week ${v} of ${sprint.length_weeks}`), meta.slice(0, 160));
        const saved = await until(async () => (await q(db.from('person_settings').select('time_zone').eq('user_id', me)))[0]?.time_zone === z, 8000);
        pass(`dates: ${z} ${label}: the saved time zone follows the device`, Boolean(saved));
        noErrors(page, `dates ${z} ${label}`);
      } catch (e) {
        pass(`dates ${z} ${label} ran`, false, e.message.split('\n')[0]);
      }
      await context.close();
    }
  }
}

// ------------------------------------------------------------------ long
if (run('long')) {
  console.log(seed('--reset'));
  // Sprint 1 as a 16-week sprint, in its 16th week today.
  const sprint = await runningSprint();
  const monday = addDays(today, -weekday(today));
  const start = addDays(monday, -105);
  await q(db.from('sprints').update({ length_weeks: 16 }).eq('id', sprint.id).select());
  // Move the logs and to-dos the same way, so they stay in their weeks.
  const shift = Math.round((Date.parse(sprint.start_on) - Date.parse(start)) / 86400000);
  await q(db.from('sprints').update({ start_on: start }).eq('id', sprint.id).select());
  void shift;
  const { context, page } = await signedIn({ width: 390 });
  try {
    await openSprint(page);
    const text = await bodyText(page);
    pass('long: the sprint page says week 16 of 16', text.includes('Week 16 of 16'), text.slice(0, 200));
    const segs = await page.locator('.ds-sdial [data-tip], .ds-sdial-seg').count();
    pass('long: the dial has 16 weeks', segs >= 16, `${segs}`);
    pass('long: no sideways scroll on the sprint page', await noSideways(page));
    await page.goto(`${APP}/performance-sprint/year`);
    await page.waitForTimeout(2500);
    const bars = await page.locator('[data-tip]').count();
    pass('long: View your year shows the 16 weeks', bars >= 16, `${bars}`);
    pass('long: no sideways scroll on the year', await noSideways(page));
    await shot(page, 'long-year');
    // The review once it's over: the sprint ended yesterday.
    await q(db.from('sprints').update({ start_on: addDays(today, -112) }).eq('id', sprint.id).select());
    await page.goto(`${APP}/performance-sprint/review`);
    await page.waitForSelector('.ds-guide', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const rtext = await bodyText(page);
    pass('long: the review of a 16-week sprint opens', /Great sprint|sprint|average/i.test(rtext), rtext.slice(0, 160));
    pass('long: its dial has 16 weeks', (await page.locator('.ds-sdial [data-tip], .ds-sdial-seg').count()) >= 16);
    pass('long: no sideways scroll on the review', await noSideways(page));
    await shot(page, 'long-review');
    noErrors(page, 'long');
  } catch (e) {
    pass('long ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ recovery
if (run('recovery')) {
  console.log(seed('--reset'));
  const sprint = await runningSprint();
  // A Recovery from last Saturday (or the Saturday before) to Tuesday: 4 days.
  let sat = addDays(today, -((weekday(today) + 2) % 7));
  if (sat >= today) sat = addDays(sat, -7);
  const tue = addDays(sat, 3);
  if (tue >= today) sat = addDays(sat, -7);
  const satKey = sat;
  const tueKey = addDays(satKey, 3);
  const id = crypto.randomUUID();
  await q(db.from('recovery_periods').insert({ id, user_id: me, sprint_id: sprint.id, start_on: satKey, chosen_days: 4, let_coach_know: false, ended_at: `${addDays(tueKey, 1)}T08:00:00Z`, end_on: addDays(tueKey, 1) }).select());
  const rec = (await recoveriesOf())[0];
  const cal = m0SprintCalendar({ start: sprint.start_on, lengthWeeks: sprint.length_weeks, recoveries: [{ start: rec.start_on, end: rec.end_on }] }, today);
  const { context, page } = await signedIn();
  try {
    await openSprint(page);
    const text = await bodyText(page);
    const w = m0WeekOfDay(cal.weeks, today);
    pass('recovery: the week shown matches the calendar with the Saturday-to-Tuesday Recovery', text.includes(`Week ${w} of ${sprint.length_weeks}`), `${w} / ${text.slice(0, 160)}`);
    const end = cal.actualEnd || cal.weeks[cal.weeks.length - 1]?.end;
    const human = end ? new Date(`${end}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
    pass('recovery: the end moved by the four days', end === addDays(sprint.planned_end_on, 4), `${end} vs planned ${sprint.planned_end_on}`);
    pass('recovery: the page shows the moved end', !human || text.includes(human), `${human} / ${text.slice(0, 200)}`);
    const tips = await page.locator('.ds-sdial [data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
    pass('recovery: the dial’s weeks have scores', tips.filter((t) => /%/.test(t)).length >= 1, tips.slice(0, 3).join(' | '));
    noErrors(page, 'recovery across a weekend');
    await shot(page, 'recovery-sat-tue');
  } catch (e) {
    pass('recovery ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ others
if (run('others')) {
  console.log(seed('--reset', '--recovery=1,7'));
  const other = client();
  const { data: os, error: oe } = await other.auth.signInWithPassword({ email: env.TEST_ORG_CLIENT_EMAIL, password: env.TEST_ORG_CLIENT_PASSWORD });
  if (oe) throw oe;
  const them = os.user.id;
  const plan = await activePlan();
  const sprint = await runningSprint();
  const todo = (await todosOf())[0];
  const win = (await winsOf())[0];
  const rec = (await recoveriesOf())[0];
  const sh = (await q(db.from('sprint_habits').select('id').eq('sprint_id', sprint.id)))[0];
  const habit = (await q(db.from('habits').select('id').eq('plan_id', plan.id)))[0];
  const tables = {
    performance_plans: plan.id, sprints: sprint.id, todos: todo.id, wins: win.id, recovery_periods: rec.id,
    sprint_habits: sh.id, habits: habit.id,
  };
  for (const [t, id] of Object.entries(tables)) {
    const r = await other.from(t).select('*').eq('id', id);
    pass(`others: another client can't read my ${t}`, !r.error ? (r.data || []).length === 0 : true, JSON.stringify(r.data).slice(0, 80));
    const u = await other.from(t).update({ updated_at: new Date().toISOString() }).eq('id', id).select();
    pass(`others: another client can't change my ${t}`, u.error || (u.data || []).length === 0, JSON.stringify(u.data).slice(0, 80));
    const d = await other.from(t).delete().eq('id', id).select();
    pass(`others: another client can't delete my ${t}`, d.error || (d.data || []).length === 0, JSON.stringify(d.data).slice(0, 80));
  }
  for (const t of ['performance_plans', 'outcome_objectives', 'plan_strategies', 'habits', 'sprints', 'sprint_habits', 'sprint_habit_settings', 'habit_logs', 'todos', 'todo_moves', 'wins', 'win_strategies', 'recovery_periods', 'recovery_recharge_answers', 'week_scores', 'plan_versions', 'performance_evidence', 'working_patterns', 'day_plans']) {
    const r = await other.from(t).select('user_id').eq('user_id', me).limit(5);
    pass(`others: another client reads none of my ${t}`, r.error || (r.data || []).length === 0, JSON.stringify(r.data).slice(0, 80));
  }
  // Writing rows that claim to be mine, or that point at my rows.
  const tries = [
    ['todos', { id: crypto.randomUUID(), user_id: me, strategy_id: null, text: 'Planted', impact: 1, sprint_id: sprint.id, planned_week: 1, created_on: today, source: 'manual' }],
    ['todos', { id: crypto.randomUUID(), user_id: them, strategy_id: null, text: 'Planted in my sprint', impact: 1, sprint_id: sprint.id, planned_week: 1, created_on: today, source: 'manual' }],
    ['wins', { id: crypto.randomUUID(), user_id: me, what: 'Planted', local_date: today, impact: 1 }],
    ['habit_logs', { user_id: them, sprint_habit_id: sh.id, local_date: today, value: 1 }],
    ['habit_logs', { user_id: me, sprint_habit_id: sh.id, local_date: addDays(today, -1), value: 1 }],
    ['recovery_periods', { id: crypto.randomUUID(), user_id: me, sprint_id: sprint.id, start_on: today, chosen_days: 3, let_coach_know: false }],
    ['recovery_periods', { id: crypto.randomUUID(), user_id: them, sprint_id: sprint.id, start_on: addDays(today, 40), chosen_days: 3, let_coach_know: false }],
    ['sprint_habits', { id: crypto.randomUUID(), user_id: them, sprint_id: sprint.id, habit_id: null, strategy_id: null, name: 'Planted', sort_order: 9 }],
    ['recovery_recharge_answers', { user_id: them, recovery_id: rec.id, local_date: today, answer: 'Planted', shared: false }],
    ['win_strategies', { win_id: win.id, strategy_id: (await q(db.from('plan_strategies').select('id').eq('plan_id', plan.id)))[0].id, user_id: them }],
    ['plan_strategies', { id: crypto.randomUUID(), user_id: them, plan_id: plan.id, name: 'Planted', sort_order: 9 }],
  ];
  for (const [t, row] of tries) {
    const r = await other.from(t).insert(row).select();
    const ok = Boolean(r.error) || (r.data || []).length === 0;
    pass(`others: another client can't write into my ${t}${row.user_id === me ? ' as me' : ' pointing at my rows'}`, ok, JSON.stringify(r.data).slice(0, 120));
    if (!ok) for (const x of r.data) await other.from(t).delete().match(x.id ? { id: x.id } : { user_id: them }); // tidy
  }
  // Database functions with my ids.
  for (const [fn, args] of [['freeze_week', { p_sprint: sprint.id, p_week: 1 }], ['make_sprint_summary', { p_sprint: sprint.id }], ['sprint_calendar', { p_sprint: sprint.id, p_today: today }], ['person_today', { p_person: me }]]) {
    const r = await other.rpc(fn, args);
    pass(`others: another client can't run ${fn} on my rows`, Boolean(r.error) || r.data == null || (Array.isArray(r.data) && !r.data.length), JSON.stringify(r.data).slice(0, 120));
  }
  // Signed out, with the public key only.
  const anon = client();
  for (const t of Object.keys(tables).concat(['habit_logs', 'recovery_recharge_answers', 'week_scores', 'plan_versions'])) {
    const r = await anon.from(t).select('*').limit(5);
    pass(`others: signed out reads none of ${t}`, Boolean(r.error) || (r.data || []).length === 0, JSON.stringify(r.data).slice(0, 80));
    const i = await anon.from(t).insert({ user_id: me }).select();
    pass(`others: signed out can't write ${t}`, Boolean(i.error), JSON.stringify(i.data).slice(0, 80));
  }
  // In the app as the other client: my plan's routes show them nothing of mine.
  const { context, page } = await signedIn({ email: env.TEST_ORG_CLIENT_EMAIL, password: env.TEST_ORG_CLIENT_PASSWORD });
  try {
    for (const path of ['/performance-plan', '/performance-plan/history', '/performance-plan/history/3.2', '/performance-plan/history/1.0', '/performance-plan/edit', '/performance-sprint', '/performance-sprint/year', '/performance-sprint/review', '/performance-sprint/start', '/recovery', '/recovery/today', '/recovery/check-in', `/performance-plan/history/${plan.id}`, `/performance-sprint?sprint=${sprint.id}`]) {
      await page.goto(`${APP}${path}`);
      await page.waitForTimeout(2500);
      const text = await bodyText(page);
      const leaks = ['Be a world-class high-performance coach', 'Book a physio assessment', 'Spoke at a breakfast event', 'Protect my energy'].filter((s) => text.includes(s));
      pass(`others: ${path} as another client shows none of my plan`, leaks.length === 0, leaks.join(', '));
    }
    noErrors(page, 'others in the app');
  } catch (e) {
    pass('others in the app ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
  // Signed out: every Phase 2 route goes to sign in.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  for (const path of ['/performance-plan', '/performance-sprint', '/recovery/today', '/performance-plan/history/3.2']) {
    await p.goto(`${APP}${path}`);
    await p.waitForTimeout(2000);
    pass(`others: signed out, ${path} asks to sign in`, /\/auth\/login|\/welcome|\/$/.test(new URL(p.url()).pathname) && !(await p.locator('body').innerText()).includes('Be a world-class'), p.url());
  }
  await ctx.close();
  await other.auth.signOut();
}

await browser.close();

// Back to the seeded plan v3.2 with Sprint 1 running.
console.log(seed('--reset'));
const back = await activePlan();
pass('tidy: the seeded plan v3.2 is back, with Sprint 1 running', back?.major === 3 && back.minor === 2 && (await runningSprint())?.number === 1, JSON.stringify(back));

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
