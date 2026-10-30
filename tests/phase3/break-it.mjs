// Phase 3 step 5, the break-it tester: tries to break Plan my day, Review
// my day and the Weekly performance debrief in the running app on the TEST
// database only (every other host and every email call is blocked), signed
// in as the invented test clients.
//
//   node --import ./tests/scores/register.mjs tests/phase3/break-it.mjs [folder for screenshots]
//   ONLY=taps,offline node --import ... tests/phase3/break-it.mjs   (some attacks only)
//
// Attacks (each a section; ONLY picks some):
//   taps      double and triple taps on every Next, Add, tick, Finish and
//             Share: nothing saved twice (to-dos, wins, logs, debriefs).
//   back      Back and Forward in the middle of each tool: the draft comes
//             back, nothing half saved, no crash.
//   text      50,000 characters, emoji, right-to-left, HTML and script
//             tags, spaces only: saved safely or refused, shown as text.
//   offline   offline and back mid-save: "Will sync", then "Saved", one
//             row, still signed in.
//   refresh   a refresh while a save is in flight, on each tool.
//   midnight  a review at 00:30, 03:59 and 04:01, and one that runs across
//             midnight.
//   window    a debrief on the last day of its window and the day after.
//   zones     Pacific/Auckland, America/Los_Angeles and Europe/London, and
//             the UK clock-change day.
//   dayoff    a day off in the working pattern: Plan my day, Review my day,
//             the debrief and the score.
//   others    another test client reading or changing the day plans,
//             reviews and debriefs (routes, ids, direct calls with the
//             public key), and signed out.
//
// Every date is FIXED (tests/phase2/fixed-day.mjs): the seed is built
// around Wed 21 Oct 2026 (week 4; week 3's debrief window closes that day)
// and every browser's clock is set, so nothing depends on the day or time
// it runs. To keep the test database light it seeds once, removes what
// each attack adds as it goes, and puts the seeded plan v3.2 with Sprint 1
// running back on the real today at the end.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, fixedLabel, londonInstant } from '../phase2/fixed-day.mjs';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';
import { m0Round } from '../../src/lib/scores/index.js';

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

const today = FIXED_TODAY;
console.log(`Fixed day: ${fixedLabel()}`);
const dayKey = (n, from = today) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum
};
const yesterday = dayKey(-1);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return v;
}
const q = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
};

// ---------------------------------------------------------------- the data
// Invented words, so a failed run's leftovers can be found and removed.
const TAG = 'BreakIt';
console.log(seedFixed('--reset'));
const sprint = (await q(db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')))[0];
const WEEK = 4; // Mon 19 to Sun 25 Oct
const DEBRIEF_WEEK = 3; // its window closes on Wed 21 Oct
const strategies = await q(db.from('plan_strategies').select('id, name').eq('plan_id', sprint.plan_id).is('archived_at', null).order('sort_order'));
const S0 = strategies[0].name;
const sprintHabits = await q(db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id));
const hid = (name) => sprintHabits.find((h) => h.name === name).id;
const DRAFT = 'Draft the Harbour case study';
const todoId = async (text) => (await q(db.from('todos').select('id').eq('user_id', me).eq('text', text).eq('sprint_id', sprint.id)))[0].id;
const ids = { draft: await todoId(DRAFT) };

const myTodos = async (text) => q(db.from('todos').select('id, text, done_on, deleted_at, planned_week').eq('user_id', me).eq('text', text));
const liveTodos = async (text) => (await myTodos(text)).filter((t) => !t.deleted_at);
const myWins = async (what) => (await q(db.from('wins').select('id, what, deleted_at').eq('user_id', me).eq('what', what))).filter((w) => !w.deleted_at);
const dayPlans = async () => q(db.from('day_plans').select('*').eq('user_id', me).order('local_date'));
const dayReviews = async () => q(db.from('day_reviews').select('*').eq('user_id', me).order('local_date'));
const debriefs = async (week = DEBRIEF_WEEK) => q(db.from('weekly_debriefs').select('*').eq('sprint_id', sprint.id).eq('sprint_week', week));
const logOf = async (name, day = today) => (await q(db.from('habit_logs').select('value').eq('sprint_habit_id', hid(name)).eq('local_date', day)))[0]?.value ?? null;

async function tidyDays() {
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('day_plans').delete().eq('user_id', me);
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  await db.from('todos').delete().eq('user_id', me).like('text', `${TAG}%`);
  await db.from('wins').delete().eq('user_id', me).like('what', `${TAG}%`);
  await db.from('todos').update({ done_on: null }).eq('id', ids.draft);
}
await tidyDays();

// A finished day: a plan (and its review), as the tools save them.
async function planFor(day, { review = null } = {}) {
  const id = (await q(db.from('day_plans').insert({ user_id: me, local_date: day, way_of_being: 'Calm under pressure', status: 'finished', finished_at: `${day}T07:00:00Z` }).select('id')))[0].id;
  await db.from('day_plan_todos').insert({ day_plan_id: id, todo_id: ids.draft, user_id: me, is_top: true });
  if (review) await db.from('day_reviews').insert({ user_id: me, local_date: day, status: 'finished', finished_at: `${day}T20:00:00Z`, ...review });
  return id;
}

async function rowsNow() {
  const r = async (p) => (await p).data || [];
  const [objectives, strategyRows, links, shs, weekScores, recoveries, workingPatterns] = await Promise.all([
    r(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    r(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null).order('sort_order')),
    r(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    r(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    r(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    r(db.from('recovery_periods').select('*').eq('user_id', me)),
    r(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
  ]);
  const hids = shs.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    r(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', hids)),
    r(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', hids)),
    r(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    r(db.from('todo_moves').select('*').eq('user_id', me)),
    r(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
    r(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  return { plan: { id: sprint.plan_id }, sprint, objectives, strategies: strategyRows, links, sprintHabits: shs, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();
const COACH = 'Tim';
async function signedIn({ width = 1280, mode = 'dark', timezoneId = 'Europe/London', clock = londonInstant(today, '12:30'), coach = false, email = env.TEST_CLIENT_EMAIL, password = env.TEST_CLIENT_PASSWORD } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId,
    colorScheme: mode,
  });
  await context.clock.install({ time: clock });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
    // Every toast and every "another window" message, for the checks.
    window.__toasts = [];
    new MutationObserver(() => {
      document.querySelectorAll('.ds-toast-text').forEach((t) => {
        if (!t.__seen) { t.__seen = true; window.__toasts.push(t.textContent); }
      });
      if (document.body?.innerText.includes('This was changed in another window')) window.__superseded = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
  if (coach) {
    // The test client has no coach on the test database: my_coach answers
    // with an invented one, so the share switch shows. Nothing is written.
    await context.route('**/rest/v1/rpc/my_coach*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ coach_id: '00000000-0000-4000-8000-00000000c0ac', first_name: COACH, mobile: null, contact_ways: [], away_until: null }]),
    }));
  }
  const page = await context.newPage();
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
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: false }); };
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent().catch(() => '')) || '').trim();
const toolName = async (page) => ((await page.locator('.ds-guide-name').first().textContent().catch(() => '')) || '').trim();
const body = (page) => page.locator('.ds-guide-body');
const signedOut = (page) => /\/auth\/login/.test(page.url());
// No sideways scroll, on the page or inside the tool; what sticks out, if anything.
const sideways = (page) => page.evaluate(async () => {
  await Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))), new Promise((r) => { setTimeout(r, 3000); })]);
  const over = [document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll('.ds-guide-scroll')].map((s) => s.scrollWidth - s.clientWidth)];
  if (over.every((n) => n <= 1)) return '';
  const wide = [...document.querySelectorAll('.ds-guide *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(el.getBoundingClientRect().right)}`).slice(0, 4);
  return `${over.join(',')} ${wide.join(' | ')}`;
});
const noSideways = async (page) => !(await sideways(page));
const toasts = (page) => page.evaluate(() => window.__toasts || []);
const notSaved = async (page) => (await toasts(page)).filter((t) => /didn’t save|didn't save/.test(t));
// No page errors, no save refused as from another window, no "didn't save".
async function clean(page, what) {
  pass(`${what}: no page errors`, page.errors.length === 0, page.errors.join(' | '));
  page.errors.length = 0;
  pass(`${what}: no save is refused as from another window`, !(await page.evaluate(() => window.__superseded || false)));
  const bad = await notSaved(page);
  pass(`${what}: nothing says it didn't save`, bad.length === 0, bad.join(' | '));
  await page.evaluate(() => { window.__toasts = []; window.__superseded = false; });
}

async function open(page, path) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
}
// Next: tapped until the question changes (a tap in the first moment
// after a move is ignored on purpose, so it is tried again).
async function next(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    const moved = await until(async () => (await heading(page)) !== before, 1200);
    if (moved) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
// Back until the question (or the first step, with question null).
async function backUntil(page, question) {
  const there = async () => (question ? (await heading(page)) === question : !(await page.locator('.ds-guide-back').isVisible()));
  for (let i = 0; i < 10 && !(await there()); i += 1) {
    const before = await heading(page);
    for (let j = 0; j < 6; j += 1) {
      await page.locator('.ds-guide-back').click();
      if (await until(async () => (await heading(page)) !== before, 1200)) break;
    }
  }
  if (!(await there())) throw new Error(`Never got back to "${question || 'the first step'}"`);
}
async function nextUntil(page, question) {
  for (let i = 0; i < 10 && (await heading(page)) !== question; i += 1) await next(page);
  if ((await heading(page)) !== question) throw new Error(`Never reached "${question}"`);
}
// The page has sent everything (no Saving, no Will sync).
const settled = (page, ms = 20000) => page.waitForFunction(() => !/Saving|Will sync/.test(document.querySelector('.ds-guide-top, .ds-guide')?.innerText || document.body.innerText), null, { timeout: ms }).then(() => true).catch(() => false);
// The last button, pressed until the page leaves the tool.
async function finishWith(page, label) {
  const gone = await until(async () => {
    if (new URL(page.url()).pathname === '/performance-sprint') return true;
    await page.getByRole('button', { name: label }).click({ timeout: 2000 }).catch(() => null);
    return page.waitForURL((u) => u.pathname === '/performance-sprint', { timeout: 1500 }).then(() => true, () => false);
  }, 15000);
  if (!gone) throw new Error(`${label} did not go back`);
}
// The last button triple tapped (again if a tap lands in the first moment
// after a move, which the tool ignores on purpose) until the tool is left.
async function tripleFinish(page) {
  for (let i = 0; i < 8 && new URL(page.url()).pathname !== '/performance-sprint'; i += 1) {
    await page.locator('.ds-guide-next').click({ clickCount: 3 }).catch(() => null);
    await page.waitForURL((u) => u.pathname === '/performance-sprint', { timeout: 1500 }).catch(() => null);
  }
}
const PLAN_Q = {
  sleep: 'How did you sleep last night?',
  gratitude: 'What’s one thing you’re grateful for today?',
  be: 'How do you want to be today?',
  do: 'What will you do today?',
  priority: 'Which one is your highest priority?',
  strategy: 'Which Strategies does today serve most?',
  risk: 'What’s the biggest risk to today?',
};
const REVIEW_Q = {
  do: 'Which of today’s to‑dos did you do?',
  numbers: 'What are today’s numbers?',
  well: 'What went well today?',
  differently: 'What would you do differently next time?',
  tomorrow: 'What are the most important things to do tomorrow?',
};
const DEBRIEF_Q = {
  numbers: `How did week ${DEBRIEF_WEEK} go?`,
  well: 'What went well this week?',
  way: 'What got in the way?',
  adjust: 'What will you adjust next week?',
  next: 'What’s planned for next week?',
};

// ------------------------------------------------------------------ taps
if (run('taps')) {
  await tidyDays();
  const NIGHT = `${TAG}: call the printer`;
  await planFor(yesterday, { review: { tomorrow: [NIGHT] } });
  const { context, page } = await signedIn({ width: 1280, coach: true });
  try {
    // ---- Plan my day
    await open(page, '/my-day/plan');
    await page.waitForTimeout(900); // past the first moment's guard, so the first tap counts
    await page.locator('.ds-guide-next').click({ clickCount: 3 });
    await until(async () => (await heading(page)) !== PLAN_Q.sleep, 3000);
    pass('taps: a triple tap on Next moves one step only', (await heading(page)) === PLAN_Q.gratitude, await heading(page));
    await body(page).locator('textarea').first().fill(`${TAG} grateful`);
    await page.waitForTimeout(900);
    await page.locator('.ds-guide-next').dblclick();
    await until(async () => (await heading(page)) !== PLAN_Q.gratitude, 3000);
    pass('taps: a double tap on Next moves one step only', (await heading(page)) === PLAN_Q.be, await heading(page));
    await page.getByRole('radio', { name: 'Decisive' }).click();
    await next(page);
    pass('taps: on to Do', (await heading(page)) === PLAN_Q.do, await heading(page));
    // Last night's thing, triple tapped: one to-do at most, and the day's picks match the screen.
    await page.locator('.ds-answer--pick', { hasText: NIGHT }).first().click({ clickCount: 3 });
    await settled(page);
    await page.waitForTimeout(1500);
    await settled(page);
    const nightTodos = await liveTodos(NIGHT);
    const picked = await page.locator('.ds-answer--pick[aria-pressed=true]').allInnerTexts();
    const nightPicked = picked.some((t) => t.includes(NIGHT));
    pass('taps: last night\'s thing triple tapped makes one to-do at most', nightTodos.length <= 1, `${nightTodos.length} live`);
    pass('taps: ... and a to-do exactly when it shows as chosen', (nightTodos.length === 1) === nightPicked, `${nightTodos.length} live, chosen ${nightPicked}`);
    const planRow = (await dayPlans()).find((p) => p.local_date === today);
    const dpt = planRow ? await q(db.from('day_plan_todos').select('todo_id, is_top').eq('day_plan_id', planRow.id)) : [];
    const liveIds = new Set((await q(db.from('todos').select('id').eq('user_id', me).is('deleted_at', null))).map((t) => t.id));
    pass('taps: the day\'s chosen to-dos match the screen', dpt.length === picked.length, `${dpt.length} saved, ${picked.length} shown`);
    pass('taps: no chosen to-do points at a removed one', dpt.every((r) => liveIds.has(r.todo_id)), JSON.stringify(dpt));
    pass('taps: at most one highest priority', dpt.filter((r) => r.is_top).length <= 1);
    // Add a to-do, Add my to-do triple tapped.
    const PANEL = `${TAG}: ring the venue`;
    await page.getByRole('button', { name: 'Add a to-do' }).click();
    const tpanel = page.getByRole('dialog', { name: 'Add a to-do' });
    await tpanel.locator('textarea').first().fill(PANEL);
    await tpanel.getByRole('button', { name: 'Add my to-do' }).click({ clickCount: 3 });
    await until(async () => (await liveTodos(PANEL)).length >= 1, 10000);
    await settled(page);
    pass('taps: Add my to-do triple tapped adds one to-do', (await liveTodos(PANEL)).length === 1, `${(await liveTodos(PANEL)).length}`);
    await nextUntil(page, PLAN_Q.strategy);
    const opt = page.getByRole('checkbox', { name: S0 }).or(page.locator('.ds-answer', { hasText: S0 })).first();
    await opt.click({ clickCount: 3 });
    await settled(page);
    await page.waitForTimeout(800);
    const shownStrategies = await page.locator('[aria-pressed=true], [aria-checked=true]').filter({ hasText: S0 }).count();
    const savedStrategies = planRow ? await q(db.from('day_plan_strategies').select('strategy_id').eq('day_plan_id', planRow.id)) : [];
    pass('taps: a Strategy triple tapped is saved as shown', savedStrategies.length === shownStrategies, `${savedStrategies.length} saved, ${shownStrategies} shown`);
    await nextUntil(page, PLAN_Q.risk);
    await next(page);
    await tripleFinish(page);
    await page.waitForTimeout(1500);
    const plans = (await dayPlans()).filter((p) => p.local_date === today);
    pass('taps: Set my day triple tapped: one plan, set', plans.length === 1 && plans[0].status === 'finished', JSON.stringify(plans.map((p) => p.status)));
    pass('taps: Set my day says so once', (await toasts(page)).filter((t) => t.startsWith('Your day is set')).length === 1, JSON.stringify(await toasts(page)));
    await clean(page, 'taps, Plan my day');

    // ---- Review my day
    await open(page, '/my-day/review');
    pass('taps: Review opens on Do', (await heading(page)) === REVIEW_Q.do, await heading(page));
    const box = page.getByRole('checkbox', { name: PANEL, exact: true }).first();
    await box.click({ clickCount: 3 });
    await settled(page);
    await page.waitForTimeout(1000);
    const shownDone = (await box.getAttribute('aria-checked')) === 'true';
    const doneRow = (await liveTodos(PANEL))[0];
    pass('taps: a to-do triple ticked is saved as shown', Boolean(doneRow?.done_on) === shownDone && (!shownDone || doneRow.done_on === today), `shown ${shownDone}, saved ${doneRow?.done_on}`);
    await page.getByRole('button', { name: 'Show this week’s list' }).click();
    const train = page.getByRole('checkbox', { name: 'Training sessions', exact: true }).first();
    if (await train.count()) {
      const before = Number(await logOf('Training sessions')) || 0;
      await train.click({ clickCount: 3 });
      await settled(page);
      await page.waitForTimeout(1000);
      const ticked = (await train.getAttribute('aria-checked')) === 'true';
      const after = Number(await logOf('Training sessions')) || 0;
      pass('taps: a count habit triple ticked logs one more at most', after - before === (ticked ? 1 : 0), `before ${before}, after ${after}, ticked ${ticked}`);
    } else pass('taps: Training sessions is on this week\'s list', false);
    await nextUntil(page, REVIEW_Q.numbers);
    await next(page);
    pass('taps: on to Went well', (await heading(page)) === REVIEW_Q.well, await heading(page));
    const WIN = `${TAG}: unplanned workshop`;
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const wpanel = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await wpanel.locator('textarea').first().fill(WIN);
    await wpanel.getByRole('button', { name: S0 }).click();
    await wpanel.getByRole('button', { name: 'Add my win' }).click({ clickCount: 3 });
    await until(async () => (await myWins(WIN)).length >= 1, 10000);
    await settled(page);
    const wins = await myWins(WIN);
    pass('taps: Add my win triple tapped adds one win', wins.length === 1, `${wins.length}`);
    const ev = wins.length ? await q(db.from('performance_evidence').select('id').eq('win_id', wins[0].id)) : [];
    pass('taps: ... with one Performance Evidence row', ev.length === 1, `${ev.length}`);
    await nextUntil(page, REVIEW_Q.tomorrow);
    await page.getByRole('button', { name: 'Add another' }).click({ clickCount: 3 });
    const rowsShown = await body(page).getByRole('textbox', { name: /^Important thing \d for tomorrow$/ }).count();
    pass('taps: Add another triple tapped stops at three rows', rowsShown <= 3, `${rowsShown}`);
    await body(page).getByRole('textbox', { name: 'Important thing 1 for tomorrow' }).fill(`${TAG}: first thing`);
    await next(page);
    const finishReview = (await page.locator('.ds-guide-next').textContent()).trim();
    await tripleFinish(page);
    await page.waitForTimeout(1500);
    const reviews = (await dayReviews()).filter((r) => r.local_date === today);
    pass(`taps: ${finishReview} triple tapped: one review, finished`, reviews.length === 1 && reviews[0].status === 'finished' && reviews[0].tomorrow.length === 1, JSON.stringify(reviews.map((r) => [r.status, r.tomorrow])));
    pass('taps: the review says it is saved once', (await toasts(page)).filter((t) => t.startsWith('Your review is saved')).length === 1, JSON.stringify(await toasts(page)));
    await clean(page, 'taps, Review my day');

    // ---- The debrief (week 3, the last day of its window)
    await open(page, '/performance-sprint/debrief');
    pass('taps: the debrief opens on week 3', (await heading(page)) === DEBRIEF_Q.numbers, await heading(page));
    const block = page.locator('.ds-logweek', { hasText: 'Weekly strategic block' }).getByRole('checkbox').first();
    if (await block.count()) {
      await block.click({ clickCount: 3 });
      await settled(page);
      await page.waitForTimeout(1000);
      const on = (await block.getAttribute('aria-checked')) === 'true';
      const days = (await rowsNow()).logs.filter((l) => l.sprint_habit_id === hid('Weekly strategic block') && l.local_date >= dayKey(-9) && l.local_date <= dayKey(-3) && Number(l.value) > 0);
      pass('taps: the once-a-week tick triple tapped is saved as shown, once', on ? days.length === 1 : days.length === 0, `shown ${on}, ${days.length} days logged`);
    } else pass('taps: the once-a-week tick is on the debrief', false);
    const DWIN = `${TAG}: debrief win`;
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const dw = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await dw.locator('textarea').first().fill(DWIN);
    await dw.getByRole('button', { name: S0 }).click();
    await dw.getByRole('button', { name: 'Add my win' }).click({ clickCount: 3 });
    await until(async () => (await myWins(DWIN)).length >= 1, 10000);
    await settled(page);
    pass('taps: the debrief\'s Add my win triple tapped adds one win', (await myWins(DWIN)).length === 1, `${(await myWins(DWIN)).length}`);
    await nextUntil(page, DEBRIEF_Q.next);
    const DTODO = `${TAG}: next week's to-do`;
    await page.getByRole('button', { name: 'Add a to-do' }).click();
    const dt = page.getByRole('dialog', { name: 'Add a to-do' });
    await dt.locator('textarea').first().fill(DTODO);
    await dt.getByRole('radio', { name: S0 }).click();
    await dt.getByRole('button', { name: 'Add my to-do' }).click({ clickCount: 3 });
    await until(async () => (await liveTodos(DTODO)).length >= 1, 10000);
    await settled(page);
    pass('taps: the debrief\'s Add my to-do triple tapped adds one to-do', (await liveTodos(DTODO)).length === 1, `${(await liveTodos(DTODO)).length}`);
    await next(page);
    const sw = page.getByRole('switch', { name: `Share with ${COACH}` });
    await sw.click({ clickCount: 3 });
    await settled(page);
    await page.waitForTimeout(1000);
    const swOn = (await sw.getAttribute('aria-checked')) === 'true';
    await until(async () => (await debriefs())[0]?.shared_with_coach === swOn, 10000);
    pass('taps: Share triple tapped is saved as shown', (await debriefs())[0]?.shared_with_coach === swOn, `shown ${swOn}, saved ${(await debriefs())[0]?.shared_with_coach}`);
    await sw.dblclick();
    await settled(page);
    await page.waitForTimeout(1000);
    const swOn2 = (await sw.getAttribute('aria-checked')) === 'true';
    await until(async () => (await debriefs())[0]?.shared_with_coach === swOn2, 10000);
    pass('taps: Share double tapped is saved as shown', (await debriefs())[0]?.shared_with_coach === swOn2 && swOn2 === swOn, `shown ${swOn2}, saved ${(await debriefs())[0]?.shared_with_coach}`);
    await tripleFinish(page);
    await page.waitForTimeout(2000);
    const d = await debriefs();
    pass('taps: Finish my debrief triple tapped: one debrief, finished', d.length === 1 && d[0].status === 'finished', JSON.stringify(d.map((x) => x.status)));
    const ws = await q(db.from('week_scores').select('sprint_week, final').eq('sprint_id', sprint.id).eq('sprint_week', DEBRIEF_WEEK));
    pass('taps: one week score for week 3', ws.length === 1, `${ws.length}`);
    pass('taps: the debrief says so once', (await toasts(page)).filter((t) => /^Week 3 debriefed/.test(t)).length === 1, JSON.stringify(await toasts(page)));
    await shot(page, 'taps-end');
    await clean(page, 'taps, the debrief');
  } catch (e) {
    pass('taps ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'taps-error');
  }
  await context.close();
}

// ------------------------------------------------------------------ back
if (run('back')) {
  await tidyDays();
  const { context, page } = await signedIn({ width: 390, mode: 'light' });
  // Back to the page before, then Forward again: the step and the typing come back.
  const backAndForward = async () => {
    await page.goBack();
    await page.waitForTimeout(800);
    await page.goForward();
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  };
  try {
    // Plan my day: typed, then Back before the save's delay ran out.
    await open(page, '/my-day/plan');
    await next(page);
    const T = `${TAG} back and forward`;
    await body(page).locator('textarea').first().fill(T);
    await backAndForward();
    pass('back: Plan my day comes back on the same step', (await heading(page)) === PLAN_Q.gratitude, await heading(page));
    pass('back: ... with the typing', Boolean(await until(async () => (await body(page).locator('textarea').first().inputValue()) === T, 8000)), await body(page).locator('textarea').first().inputValue());
    await settled(page);
    const p = (await dayPlans()).filter((x) => x.local_date === today);
    pass('back: one plan, still a draft, the answer saved', p.length === 1 && p[0].status === 'draft' && p[0].grateful_for === T, JSON.stringify(p.map((x) => [x.status, x.grateful_for])));
    // The add panel, Back with the panel open.
    await nextUntil(page, PLAN_Q.do);
    const PT = `${TAG}: half-typed to-do`;
    await page.getByRole('button', { name: 'Add a to-do' }).click();
    await page.getByRole('dialog', { name: 'Add a to-do' }).locator('textarea').first().fill(PT);
    await page.waitForTimeout(600);
    await backAndForward();
    const panelBack = await until(async () => (await page.getByRole('dialog', { name: 'Add a to-do' }).locator('textarea').count()) && (await page.getByRole('dialog', { name: 'Add a to-do' }).locator('textarea').first().inputValue()) === PT, 8000);
    pass('back: the half-typed to-do comes back in its panel', Boolean(panelBack));
    pass('back: ... and nothing was saved from it', (await liveTodos(PT)).length === 0);
    if (panelBack) await page.getByRole('dialog', { name: 'Add a to-do' }).getByRole('button', { name: 'Cancel' }).click();
    await clean(page, 'back, Plan my day');

    // Review my day.
    await open(page, '/my-day/review');
    await nextUntil(page, REVIEW_Q.well);
    const R = `${TAG} went well, then Back`;
    await body(page).locator('textarea').first().fill(R);
    await backAndForward();
    pass('back: Review my day comes back on the same step', (await heading(page)) === REVIEW_Q.well, await heading(page));
    pass('back: ... with the typing', Boolean(await until(async () => (await body(page).locator('textarea').first().inputValue()) === R, 8000)));
    await settled(page);
    const r = (await dayReviews()).filter((x) => x.local_date === today);
    pass('back: one review, still a draft', r.length === 1 && r[0].status === 'draft' && r[0].went_well === R, JSON.stringify(r.map((x) => [x.status, x.went_well])));
    await clean(page, 'back, Review my day');

    // The debrief.
    await open(page, '/performance-sprint/debrief');
    await nextUntil(page, DEBRIEF_Q.way);
    const D = `${TAG} got in the way, then Back`;
    await body(page).locator('textarea').first().fill(D);
    await backAndForward();
    pass('back: the debrief comes back on the same step', (await heading(page)) === DEBRIEF_Q.way, await heading(page));
    pass('back: ... with the typing', Boolean(await until(async () => (await body(page).locator('textarea').first().inputValue()) === D, 8000)));
    await settled(page);
    const d = await debriefs();
    pass('back: one debrief, still a draft', d.length === 1 && d[0].status === 'draft' && d[0].got_in_way === D, JSON.stringify(d.map((x) => [x.status, x.got_in_way])));
    // Back from the first step of a finished tool, then Forward: still finished, no crash.
    await clean(page, 'back, the debrief');
  } catch (e) {
    pass('back ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'back-error');
  }
  await context.close();
}

// ------------------------------------------------------------------ text
if (run('text')) {
  await tidyDays();
  const HUGE = 'x'.repeat(50000);
  const MIXED = 'Grateful 😀👍🏽 مرحبا بالعالم <script>window.__pwned=1</script><img src=x onerror="window.__pwned=2"> &amp; <b>bold</b>';
  const UNBROKEN = 'W'.repeat(300);
  const { context, page } = await signedIn({ width: 360, mode: 'light' });
  // Anything typed that became a real element (the tool's own name is a <b>).
  const injected = () => page.evaluate(() => (window.__pwned ? `ran ${window.__pwned}` : '') + [...document.querySelectorAll('.ds-guide img, .ds-guide script, .ds-guide b:not(.ds-guide-name), .ds-panel img, .ds-panel script, .ds-panel b')].map((el) => el.outerHTML.slice(0, 60)).join(' | '));
  try {
    await open(page, '/my-day/plan');
    await next(page);
    const g = body(page).locator('textarea').first();
    await g.focus();
    await page.keyboard.insertText(HUGE);
    await page.waitForTimeout(400);
    const kept = (await g.inputValue()).length;
    pass('text: 50,000 characters pasted are cut to the box\'s 300', kept === 300, `${kept}`);
    pass('text: ... and it says so', (await body(page).innerText()).includes('300 of 300'));
    pass('text: ... with no sideways scroll', await noSideways(page), await sideways(page));
    await settled(page);
    pass('text: ... and 300 are saved', (await dayPlans())[0]?.grateful_for?.length === 300, `${(await dayPlans())[0]?.grateful_for?.length}`);
    await g.fill(MIXED);
    await next(page);
    await body(page).locator('textarea, input').first().fill('     ');
    await nextUntil(page, PLAN_Q.risk);
    await body(page).locator('textarea').first().fill(UNBROKEN);
    await body(page).locator('textarea').nth(1).fill('   ');
    await next(page);
    await settled(page);
    const words = await body(page).innerText();
    pass('text: emoji, right-to-left and tags show as typed, as text', words.includes(MIXED), words.slice(0, 200));
    pass('text: nothing typed runs as code or markup', !(await injected()), await injected());
    pass('text: spaces only count as skipped', (await page.locator('.ds-guide-summary-row, .ds-summary-row, dl > div').filter({ hasText: 'How you want to be' }).innerText().catch(() => '')).includes('Skipped'));
    pass('text: 300 letters with no spaces wrap at 360px', await noSideways(page), await sideways(page));
    const row = (await dayPlans())[0];
    pass('text: saved as typed, spaces only saved as nothing', row?.grateful_for === MIXED && row.way_of_being == null && row.risk_response == null && row.biggest_risk === UNBROKEN, JSON.stringify({ g: row?.grateful_for?.slice(0, 40), w: row?.way_of_being, r: row?.risk_response }));
    await shot(page, 'text-plan-summary');
    // The to-do panel: spaces only can't be added; tags are text.
    await backUntil(page, PLAN_Q.do);
    if ((await heading(page)) === PLAN_Q.do) {
      await page.getByRole('button', { name: 'Add a to-do' }).click();
      const tp = page.getByRole('dialog', { name: 'Add a to-do' });
      await tp.locator('textarea').first().fill('    ');
      pass('text: a to-do of spaces only can\'t be added', await tp.getByRole('button', { name: 'Add my to-do' }).isDisabled());
      const TT = `${TAG} <script>window.__pwned=3</script> عربى 🧪`;
      await tp.locator('textarea').first().fill(TT);
      await tp.getByRole('button', { name: 'Add my to-do' }).click();
      await until(async () => (await liveTodos(TT)).length === 1, 10000);
      pass('text: a to-do with tags is saved as typed', (await liveTodos(TT)).length === 1);
      pass('text: ... and listed as text', (await page.locator('.ds-answer--pick', { hasText: '<script>' }).count()) >= 1 && !(await injected()), await injected());
    } else pass('text: Back reaches Do from the summary', false, await heading(page));
    await clean(page, 'text, Plan my day');

    // Review my day: 50,000 characters in Went well (4,000 kept), spaces in tomorrow.
    await open(page, '/my-day/review');
    await nextUntil(page, REVIEW_Q.well);
    const w = body(page).locator('textarea').first();
    await w.focus();
    await page.keyboard.insertText(HUGE);
    await page.waitForTimeout(400);
    pass('text: Went well keeps 4,000 of 50,000', (await w.inputValue()).length === 4000, `${(await w.inputValue()).length}`);
    pass('text: ... with no sideways scroll', await noSideways(page), await sideways(page));
    const WT = `${TAG} 🎉 שלום <img src=x onerror="window.__pwned=4">`;
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const wp = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await wp.locator('textarea').first().fill('   ');
    await wp.getByRole('button', { name: S0 }).click();
    pass('text: a win of spaces only can\'t be added', await wp.getByRole('button', { name: 'Add my win' }).isDisabled());
    await wp.locator('textarea').first().fill(WT);
    await wp.getByRole('button', { name: 'Add my win' }).click();
    await until(async () => (await myWins(WT)).length === 1, 10000);
    pass('text: a win with tags is saved as typed', (await myWins(WT)).length === 1);
    pass('text: ... and shown as text', (await body(page).innerText()).includes('<img src=x') && !(await injected()), `${await injected()} ${(await body(page).innerText()).slice(0, 120)}`);
    await nextUntil(page, REVIEW_Q.tomorrow);
    const thing = (n) => page.getByRole('textbox', { name: `Important thing ${n} for tomorrow` });
    await thing(1).fill('    ');
    await page.getByRole('button', { name: 'Add another' }).click();
    await thing(2).fill(`${TAG} ‮reversed‬ thing`);
    await shot(page, 'text-review-tomorrow');
    await next(page);
    await settled(page);
    await until(async () => (await dayReviews()).find((x) => x.local_date === today)?.tomorrow?.length, 15000);
    const rv = (await dayReviews()).find((x) => x.local_date === today);
    pass('text: Went well saved at 4,000', rv?.went_well?.length === 4000, `${rv?.went_well?.length}`);
    const summaryTomorrow = (await body(page).innerText()).replace(/x{20,}/g, 'xx').replace(/\s+/g, ' ');
    pass('text: a row of spaces is left out of tomorrow', JSON.stringify(rv?.tomorrow) === JSON.stringify([`${TAG} ‮reversed‬ thing`]), `${JSON.stringify(rv?.tomorrow)} summary "${summaryTomorrow}"`);
    pass('text: the review summary has no sideways scroll', await noSideways(page), await sideways(page));
    await shot(page, 'text-review-summary');
    await clean(page, 'text, Review my day');

    // The debrief: 50,000 characters in Went well.
    await open(page, '/performance-sprint/debrief');
    await nextUntil(page, DEBRIEF_Q.well);
    const dw = body(page).locator('textarea').last();
    await dw.focus();
    await page.keyboard.insertText(HUGE);
    await page.waitForTimeout(400);
    pass('text: the debrief keeps 4,000 of 50,000', (await dw.inputValue()).length === 4000, `${(await dw.inputValue()).length}`);
    await next(page);
    await body(page).locator('textarea').first().fill(MIXED);
    await nextUntil(page, DEBRIEF_Q.next);
    await next(page);
    await settled(page);
    // The summary shows the score and streak only (M1); the answers stay on their steps.
    pass('text: nothing typed in the debrief runs as code or markup', !(await injected()), await injected());
    pass('text: the debrief summary has no sideways scroll', await noSideways(page), await sideways(page));
    const dr = (await debriefs())[0];
    pass('text: the debrief saved 4,000 and the mixed text', dr?.went_well?.length === 4000 && dr.got_in_way === MIXED, JSON.stringify({ w: dr?.went_well?.length, g: dr?.got_in_way?.slice(0, 30) }));
    await shot(page, 'text-debrief-summary');
    await clean(page, 'text, the debrief');

    // Over the limit with the public key, as the owner: the database refuses.
    const big = await db.from('day_plans').update({ grateful_for: HUGE }).eq('user_id', me).eq('local_date', today).select();
    pass('text: the database refuses 50,000 characters in a plan', Boolean(big.error));
    const bigR = await db.from('weekly_debriefs').update({ adjust: HUGE }).eq('sprint_id', sprint.id).select();
    pass('text: ... and in a debrief', Boolean(bigR.error));
    // An oversized thing for tomorrow (written past the app), then Plan my day the next day.
    const LONG_NIGHT = `${TAG} ${'y'.repeat(600)}`;
    await db.from('day_reviews').update({ tomorrow: [LONG_NIGHT], status: 'finished' }).eq('user_id', me).eq('local_date', today);
    await context.clock.setSystemTime(londonInstant(dayKey(1), '08:00'));
    await open(page, '/my-day/plan');
    await nextUntil(page, PLAN_Q.do);
    pass('text: an oversized thing from last night shows without sideways scroll', await noSideways(page), await sideways(page));
    const longPick = page.locator('.ds-answer--pick', { hasText: `${TAG} yyyy` }).first();
    if (await longPick.count()) {
      await longPick.click();
      await settled(page);
      await page.waitForTimeout(800);
      const made = (await q(db.from('todos').select('text').eq('user_id', me).like('text', `${TAG} yyyy%`).is('deleted_at', null)));
      pass('text: ... and choosing it makes a to-do within the limit, or says plainly why not', (made.length === 1 && made[0].text.length <= 300) || (await notSaved(page)).length > 0, `${made.length} made`);
    }
    await page.evaluate(() => { window.__toasts = []; });
    page.errors.length = 0;
  } catch (e) {
    pass('text ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'text-error');
  }
  await context.close();
}

// ------------------------------------------------------------------ offline
if (run('offline')) {
  await tidyDays();
  const { context, page } = await signedIn({ width: 390 });
  const willSync = () => page.waitForFunction(() => /Will sync/.test(document.body.innerText), null, { timeout: 10000 }).then(() => true).catch(() => false);
  const savedAgain = () => page.waitForFunction(() => /Saved/.test(document.body.innerText) && !/Will sync/.test(document.body.innerText), null, { timeout: 25000 }).then(() => true).catch(() => false);
  try {
    // Plan my day: the day's row is made offline, an answer and a pick.
    await open(page, '/my-day/plan');
    await next(page);
    await context.setOffline(true);
    const T = `${TAG} typed offline`;
    await body(page).locator('textarea').first().fill(T);
    pass('offline: Plan my day says Will sync', await willSync());
    await nextUntil(page, PLAN_Q.do);
    const pick = page.locator('.ds-answer--pick', { hasText: DRAFT }).first();
    await pick.click();
    await until(async () => (await pick.getAttribute('aria-pressed')) === 'true', 5000);
    await context.setOffline(false);
    pass('offline: back online it says Saved', await savedAgain());
    await until(async () => (await dayPlans()).some((x) => x.grateful_for === T), 20000);
    const p = (await dayPlans()).filter((x) => x.local_date === today);
    const dpt = p.length ? await q(db.from('day_plan_todos').select('todo_id').eq('day_plan_id', p[0].id)) : [];
    pass('offline: one plan, with the answer', p.length === 1 && p[0].grateful_for === T, `${p.length}`);
    pass('offline: the pick arrived once', dpt.filter((r) => r.todo_id === ids.draft).length === 1, JSON.stringify(dpt));
    pass('offline: still signed in', !signedOut(page), page.url());
    await clean(page, 'offline, Plan my day');

    // Review my day: a tick offline, then a win whose save is cut off mid-way.
    await open(page, '/my-day/review');
    await context.setOffline(true);
    const box = page.getByRole('checkbox', { name: DRAFT, exact: true }).first();
    await box.click();
    pass('offline: a tick says Will sync', await willSync());
    await context.setOffline(false);
    pass('offline: ... then Saved', await savedAgain());
    pass('offline: the tick arrived', Boolean(await until(async () => (await myTodos(DRAFT)).some((t) => t.done_on === today), 15000)));
    await nextUntil(page, REVIEW_Q.well);
    const WIN = `${TAG}: win cut off mid-save`;
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const wp = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await wp.locator('textarea').first().fill(WIN);
    await wp.getByRole('button', { name: S0 }).click();
    await page.route('**/rest/v1/wins*', async (route) => {
      if (route.request().method() === 'POST') { await context.setOffline(true); return route.abort('internetdisconnected'); }
      return route.fallback();
    });
    await wp.getByRole('button', { name: 'Add my win' }).click();
    pass('offline: a win cut off mid-save says Will sync', await willSync());
    await page.unroute('**/rest/v1/wins*');
    await context.setOffline(false);
    pass('offline: ... then Saved', await savedAgain());
    await until(async () => (await myWins(WIN)).length >= 1, 20000);
    const w = await myWins(WIN);
    pass('offline: the win arrived once', w.length === 1, `${w.length}`);
    const ev = w.length ? await q(db.from('performance_evidence').select('id').eq('win_id', w[0].id)) : [];
    pass('offline: ... with one Performance Evidence row', ev.length === 1, `${ev.length}`);
    // Finish offline.
    await nextUntil(page, REVIEW_Q.tomorrow);
    await next(page);
    await context.setOffline(true);
    await finishWith(page, (await page.locator('.ds-guide-next').textContent()).trim());
    await context.setOffline(false);
    await until(async () => (await dayReviews()).some((x) => x.local_date === today && x.status === 'finished'), 25000);
    const r = (await dayReviews()).filter((x) => x.local_date === today);
    pass('offline: a review finished offline arrives once, finished', r.length === 1 && r[0].status === 'finished', JSON.stringify(r.map((x) => x.status)));
    pass('offline: still signed in', !signedOut(page), page.url());
    await clean(page, 'offline, Review my day');

    // The debrief: typed and finished offline.
    await open(page, '/performance-sprint/debrief');
    await nextUntil(page, DEBRIEF_Q.adjust);
    await context.setOffline(true);
    const A = `${TAG} adjusted offline`;
    await body(page).locator('textarea').first().fill(A);
    pass('offline: the debrief says Will sync', await willSync());
    await nextUntil(page, DEBRIEF_Q.next);
    await next(page);
    await finishWith(page, 'Finish my debrief');
    await context.setOffline(false);
    await until(async () => (await debriefs())[0]?.status === 'finished', 25000);
    const d = await debriefs();
    pass('offline: a debrief finished offline arrives once, finished, with its answer', d.length === 1 && d[0].status === 'finished' && d[0].adjust === A, JSON.stringify(d.map((x) => [x.status, x.adjust])));
    // The sprint page freezes the week on its next visit.
    await page.goto(`${APP}/performance-sprint`);
    await page.waitForSelector('.sprint-page', { timeout: 30000 });
    const frozen = await until(async () => (await q(db.from('week_scores').select('final').eq('sprint_id', sprint.id).eq('sprint_week', DEBRIEF_WEEK))).length === 1, 15000);
    pass('offline: the week\'s score is kept once back online', Boolean(frozen));
    pass('offline: still signed in', !signedOut(page), page.url());
    await clean(page, 'offline, the debrief');
  } catch (e) {
    pass('offline ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'offline-error');
  }
  await context.setOffline(false).catch(() => null);
  await context.close();
}

// ------------------------------------------------------------------ refresh
if (run('refresh')) {
  await tidyDays();
  const { context, page } = await signedIn({ width: 1280 });
  const sent = (pattern, methods) => page.waitForRequest((r) => methods.includes(r.method()) && r.url().includes(pattern), { timeout: 10000 }).catch(() => null);
  // Held, then dropped: the page is refreshed while it waits.
  const hold = async (pattern, methods) => {
    await page.route(pattern, async (route) => {
      if (!methods.includes(route.request().method())) return route.fallback();
      await sleep(5000);
      return route.abort().catch(() => null);
    });
  };
  try {
    // Plan my day: an answer refreshed mid-save.
    await open(page, '/my-day/plan');
    await next(page);
    await body(page).locator('textarea').first().fill(`${TAG} first`);
    await settled(page);
    await hold('**/rest/v1/day_plans*', ['PATCH', 'POST']);
    const T = `${TAG} refreshed mid-save`;
    const s1 = sent('/rest/v1/day_plans', ['PATCH', 'POST']);
    await body(page).locator('textarea').first().fill(T);
    await s1;
    await page.reload();
    await page.unroute('**/rest/v1/day_plans*');
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    pass('refresh: Plan my day comes back on its step', (await heading(page)) === PLAN_Q.gratitude, await heading(page));
    pass('refresh: ... with the answer', Boolean(await until(async () => (await body(page).locator('textarea').first().inputValue()) === T, 8000)));
    await until(async () => (await dayPlans()).some((x) => x.grateful_for === T), 20000);
    const p = (await dayPlans()).filter((x) => x.local_date === today);
    pass('refresh: the answer is saved, on one plan', p.length === 1 && p[0].grateful_for === T, JSON.stringify(p.map((x) => x.grateful_for)));
    // Set my day, refreshed mid-save.
    await nextUntil(page, PLAN_Q.risk);
    await next(page);
    await hold('**/rest/v1/day_plans*', ['PATCH']);
    const s2 = sent('/rest/v1/day_plans', ['PATCH']);
    await page.locator('.ds-guide-next').click();
    await s2;
    await page.reload();
    await page.unroute('**/rest/v1/day_plans*');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    const p2 = (await dayPlans()).filter((x) => x.local_date === today);
    const onSummary = /Here’s your day/.test(await heading(page));
    pass('refresh: Set my day refreshed mid-save is set, or the summary is back to set it again', p2.length === 1 && (p2[0].status === 'finished' || onSummary), `${p2[0]?.status}, "${await heading(page)}"`);
    if (p2[0]?.status !== 'finished' && onSummary) {
      await finishWith(page, 'Set my day');
      pass('refresh: ... and it can be set again', Boolean(await until(async () => (await dayPlans()).find((x) => x.local_date === today)?.status === 'finished', 15000)));
    }
    await clean(page, 'refresh, Plan my day');

    // Review my day: a win refreshed mid-save.
    await open(page, '/my-day/review');
    await nextUntil(page, REVIEW_Q.well);
    const WIN = `${TAG}: win refreshed mid-save`;
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const wp = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await wp.locator('textarea').first().fill(WIN);
    await wp.getByRole('button', { name: S0 }).click();
    await hold('**/rest/v1/wins*', ['POST']);
    const s3 = sent('/rest/v1/wins', ['POST']);
    await wp.getByRole('button', { name: 'Add my win' }).click();
    await s3;
    await page.reload();
    await page.unroute('**/rest/v1/wins*');
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    await until(async () => (await myWins(WIN)).length >= 1 || ((await page.locator('.ds-panel textarea').count()) && (await page.locator('.ds-panel textarea').inputValue()) === WIN), 20000);
    let w = await myWins(WIN);
    const panelBack = (await page.locator('.ds-panel textarea').count()) ? await page.locator('.ds-panel textarea').inputValue() : '';
    pass('refresh: a win refreshed mid-save is not lost (saved, or its draft is back)', w.length === 1 || panelBack === WIN, `${w.length} saved, panel "${panelBack}"`);
    if (!w.length && panelBack === WIN) {
      await page.getByRole('dialog', { name: 'Add an unplanned win' }).getByRole('button', { name: 'Add my win' }).click();
      await until(async () => (await myWins(WIN)).length >= 1, 15000);
    }
    await page.waitForTimeout(1500);
    w = await myWins(WIN);
    pass('refresh: the win ends up saved once', w.length === 1, `${w.length}`);
    // A tick refreshed mid-save.
    await page.goto(`${APP}/my-day/review`);
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    await backUntil(page, null);
    const box = page.getByRole('checkbox', { name: DRAFT, exact: true }).first();
    await hold('**/rest/v1/todos*', ['PATCH']);
    const s4 = sent('/rest/v1/todos', ['PATCH']);
    await box.click();
    await s4;
    await page.reload();
    await page.unroute('**/rest/v1/todos*');
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    await page.waitForTimeout(2500);
    const shownTick = (await page.getByRole('checkbox', { name: DRAFT, exact: true }).first().getAttribute('aria-checked').catch(() => null)) === 'true';
    const savedTick = (await myTodos(DRAFT))[0]?.done_on === today;
    pass('refresh: a tick refreshed mid-save shows what is saved', shownTick === savedTick, `shown ${shownTick}, saved ${savedTick}`);
    await clean(page, 'refresh, Review my day');

    // Finish refused once by the server: it says so plainly, and a second tap finishes.
    await nextUntil(page, REVIEW_Q.tomorrow);
    await next(page);
    let refused = 0;
    await page.route('**/rest/v1/day_reviews*', async (route) => {
      if (route.request().method() !== 'PATCH' || refused) return route.fallback();
      refused += 1;
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '23514', message: 'refused for the test', details: null, hint: null }) });
    });
    await page.waitForTimeout(900);
    await page.locator('.ds-guide-next').click();
    const said = await until(async () => (await notSaved(page)).length > 0, 10000);
    pass('refresh: a refused Finish says plainly that it didn\'t save', Boolean(said), JSON.stringify(await toasts(page)));
    await page.unroute('**/rest/v1/day_reviews*');
    pass('refresh: ... and stays on the summary', new URL(page.url()).pathname !== '/performance-sprint');
    await page.waitForTimeout(900);
    await page.locator('.ds-guide-next').click();
    const left = await page.waitForURL((u) => u.pathname === '/performance-sprint', { timeout: 10000 }).then(() => true).catch(() => false);
    pass('refresh: ... and a second tap finishes it', left && Boolean(await until(async () => (await dayReviews()).find((x) => x.local_date === today)?.status === 'finished', 10000)));
    await page.evaluate(() => { window.__toasts = []; });
    page.errors.length = 0;

    // The debrief: an answer refreshed mid-save, then Finish refreshed mid-save.
    await open(page, '/performance-sprint/debrief');
    await nextUntil(page, DEBRIEF_Q.adjust);
    await body(page).locator('textarea').first().fill(`${TAG} adjust first`);
    await settled(page);
    await hold('**/rest/v1/weekly_debriefs*', ['PATCH', 'POST']);
    const A = `${TAG} adjust refreshed mid-save`;
    const s5 = sent('/rest/v1/weekly_debriefs', ['PATCH', 'POST']);
    await body(page).locator('textarea').first().fill(A);
    await s5;
    await page.reload();
    await page.unroute('**/rest/v1/weekly_debriefs*');
    await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
    pass('refresh: the debrief comes back with the answer', Boolean(await until(async () => (await body(page).locator('textarea').first().inputValue()) === A, 8000)));
    await until(async () => (await debriefs())[0]?.adjust === A, 20000);
    pass('refresh: ... saved, on one debrief', (await debriefs()).length === 1 && (await debriefs())[0].adjust === A);
    await nextUntil(page, DEBRIEF_Q.next);
    await next(page);
    await hold('**/rest/v1/weekly_debriefs*', ['PATCH']);
    const s6 = sent('/rest/v1/weekly_debriefs', ['PATCH']);
    await page.locator('.ds-guide-next').click();
    await s6;
    await page.reload();
    await page.unroute('**/rest/v1/weekly_debriefs*');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    const d = await debriefs();
    const h = await heading(page);
    pass('refresh: Finish refreshed mid-save is finished, or the summary is back to finish', d.length === 1 && (d[0].status === 'finished' || /week|Week/.test(h)), `${d[0]?.status}, "${h}"`);
    if (d[0]?.status !== 'finished') {
      await finishWith(page, 'Finish my debrief');
      pass('refresh: ... and it can be finished again', Boolean(await until(async () => (await debriefs())[0]?.status === 'finished', 15000)));
    }
    await clean(page, 'refresh, the debrief');
  } catch (e) {
    pass('refresh ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'refresh-error');
  }
  await context.close();
}

// ------------------------------------------------------------------ midnight
if (run('midnight')) {
  await tidyDays();
  await planFor(yesterday);
  const yName = `Review my day, ${new Date(`${yesterday}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')}`;
  for (const [time, wantDay] of [['00:30', yesterday], ['03:59', yesterday], ['04:01', today]]) {
    const { context, page } = await signedIn({ width: 390, clock: londonInstant(today, time) });
    try {
      await open(page, '/my-day/review');
      const name = await toolName(page);
      pass(`midnight: at ${time} the review is for ${wantDay}`, wantDay === yesterday ? name === yName : name === 'Review my day', name);
      await next(page);
      await page.getByRole('radio', { name: '6', exact: true }).click();
      await settled(page);
      await until(async () => (await dayReviews()).length > 0, 10000);
      const r = await dayReviews();
      pass(`midnight: at ${time} the answer is saved on ${wantDay} only`, r.length === 1 && r[0].local_date === wantDay && r[0].way_of_being_rating === 6, JSON.stringify(r.map((x) => [x.local_date, x.way_of_being_rating])));
      await clean(page, `midnight ${time}`);
    } catch (e) {
      pass(`midnight ${time} ran to the end`, false, e.message.split('\n')[0]);
    }
    await context.close();
    await db.from('day_reviews').delete().eq('user_id', me);
  }
  // A review started at 23:58 and carried on past midnight stays on its day.
  const { context, page } = await signedIn({ width: 390, clock: londonInstant(today, '23:58') });
  try {
    await planFor(today);
    await open(page, '/my-day/review');
    await next(page);
    await context.clock.setSystemTime(londonInstant(dayKey(1), '00:02'));
    // Anything that redraws the page (here, the connection dropping and coming back).
    await context.setOffline(true);
    await page.waitForTimeout(800);
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    pass('midnight: a review carried past midnight keeps its day in the top bar', (await toolName(page)) === 'Review my day' || /Wed 21 Oct/.test(await toolName(page)), await toolName(page));
    pass('midnight: ... and its step', /how calm under pressure were you today\?$/.test(await heading(page)), await heading(page));
    await page.getByRole('radio', { name: '8', exact: true }).click();
    await settled(page);
    await until(async () => (await dayReviews()).length > 0, 10000);
    const r = await dayReviews();
    pass('midnight: ... and saves on the day it began', r.length === 1 && r[0].local_date === today && r[0].way_of_being_rating === 8, JSON.stringify(r.map((x) => [x.local_date, x.way_of_being_rating])));
    // Plan my day, opened at 23:58 and carried past midnight, too.
    await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
    await context.clock.setSystemTime(londonInstant(today, '23:58'));
    await open(page, '/my-day/plan');
    await next(page);
    await context.clock.setSystemTime(londonInstant(dayKey(1), '00:02'));
    await context.setOffline(true);
    await page.waitForTimeout(800);
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    pass('midnight: Plan my day carried past midnight keeps its day and step', (await toolName(page)) === 'Plan my day' && (await heading(page)) === PLAN_Q.gratitude, `${await toolName(page)}: ${await heading(page)}`);
    await shot(page, 'midnight-plan');
    const T = `${TAG} planned at midnight`;
    await body(page).locator('textarea').first().fill(T, { timeout: 5000 });
    await settled(page);
    await until(async () => (await dayPlans()).some((x) => x.grateful_for === T), 10000);
    const p = (await dayPlans()).filter((x) => x.grateful_for === T);
    pass('midnight: Plan my day carried past midnight saves on the day it began', p.length === 1 && p[0].local_date === today, JSON.stringify(p.map((x) => x.local_date)));
    await clean(page, 'midnight, carried over');
  } catch (e) {
    pass('midnight carried over ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ window
if (run('window')) {
  await tidyDays();
  const closesOn = today; // week 3's window closes on Wed 21 Oct
  const cases = [
    { time: londonInstant(closesOn, '23:59'), tz: 'Europe/London', open: true, what: 'the last day of its window, 23:59' },
    { time: londonInstant(dayKey(1), '00:01'), tz: 'Europe/London', open: false, what: 'the day after, 00:01' },
    { time: londonInstant(closesOn, '12:30'), tz: 'Pacific/Auckland', open: false, what: 'the last day in London is the day after in Auckland' },
    { time: londonInstant(dayKey(1), '07:00'), tz: 'America/Los_Angeles', open: true, what: 'the day after in London is still the last day in Los Angeles' },
  ];
  for (const c of cases) {
    const { context, page } = await signedIn({ width: 390, timezoneId: c.tz, clock: c.time });
    try {
      await page.goto(`${APP}/performance-sprint/debrief`);
      await page.waitForSelector('.ds-guide-question, .plan-page', { timeout: 30000 });
      await page.waitForTimeout(800);
      const h = await heading(page);
      const words = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      if (c.open) pass(`window: ${c.what}: week 3's debrief is open`, h === DEBRIEF_Q.numbers, h);
      else pass(`window: ${c.what}: closed, and says so`, h !== DEBRIEF_Q.numbers && /No debrief is open today\.|closed on/.test(words), words.slice(0, 160));
      await page.goto(`${APP}/performance-sprint/debrief/${sprint.id}/${DEBRIEF_WEEK}`);
      await page.waitForSelector('.ds-guide-question, .plan-page', { timeout: 30000 });
      await page.waitForTimeout(800);
      const own = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      if (!c.open) pass(`window: ${c.what}: week 3's own page says it closed on Wed 21 Oct`, own.includes('The debrief for week 3 closed on Wed 21 Oct.'), own.slice(0, 200));
      await clean(page, `window, ${c.what}`);
    } catch (e) {
      pass(`window ${c.what} ran to the end`, false, e.message.split('\n')[0]);
    }
    await context.close();
  }
  // Started at 23:58 on the last day, finished after midnight: saved once, for week 3.
  const { context, page } = await signedIn({ width: 390, clock: londonInstant(closesOn, '23:58') });
  try {
    await open(page, '/performance-sprint/debrief');
    await nextUntil(page, DEBRIEF_Q.adjust);
    await body(page).locator('textarea').first().fill(`${TAG} started before midnight`);
    await context.clock.setSystemTime(londonInstant(dayKey(1), '00:03'));
    // Anything that redraws the page (the connection dropping and coming back).
    await context.setOffline(true);
    await page.waitForTimeout(800);
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    pass('window: a debrief carried past the window\'s last midnight stays open on its step', (await heading(page)) === DEBRIEF_Q.adjust, await heading(page));
    await nextUntil(page, DEBRIEF_Q.next);
    await next(page);
    await finishWith(page, 'Finish my debrief');
    await until(async () => (await debriefs())[0]?.status === 'finished', 15000);
    const d = await debriefs();
    const d4 = await debriefs(WEEK);
    pass('window: a debrief started on the last day and finished after midnight is kept for week 3', d.length === 1 && d[0].status === 'finished' && d4.length === 0, JSON.stringify({ w3: d.map((x) => x.status), w4: d4.length }));
    await clean(page, 'window, across midnight');
  } catch (e) {
    pass('window across midnight ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
}

// ------------------------------------------------------------------ zones
if (run('zones')) {
  await tidyDays();
  const localDay = (instant, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const cases = [
    ['Pacific/Auckland', londonInstant(today, '12:30')],
    ['America/Los_Angeles', londonInstant(today, '12:30')],
    ['Europe/London', londonInstant(today, '12:30')],
    // The UK clocks go back at 02:00 on Sun 25 Oct 2026: midday, and 01:30 (shown twice).
    ['Europe/London', londonInstant('2026-10-25', '12:30')],
    ['Europe/London', new Date('2026-10-25T01:30:00Z')], // the second 01:30 (GMT)
  ];
  for (const [tz, instant] of cases) {
    const day = localDay(instant, tz);
    const tag = `${tz} at ${instant.toISOString()}`;
    const { context, page } = await signedIn({ width: 390, timezoneId: tz, clock: instant });
    try {
      await open(page, '/my-day/plan');
      await next(page);
      const T = `${TAG} in ${tz}`;
      await body(page).locator('textarea').first().fill(T);
      await settled(page);
      await until(async () => (await dayPlans()).some((x) => x.grateful_for === T), 10000);
      const p = (await dayPlans()).filter((x) => x.grateful_for === T);
      pass(`zones: ${tag}: Plan my day saves on the device's day (${day})`, p.length === 1 && p[0].local_date === day, JSON.stringify(p.map((x) => x.local_date)));
      await nextUntil(page, PLAN_Q.do);
      pass(`zones: ${tag}: this week's to-dos are listed`, (await page.locator('.ds-answer--pick').count()) > 0);
      await open(page, '/my-day/review');
      const early = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(instant)) < 4;
      await next(page);
      await page.getByRole('radio', { name: '5', exact: true }).click();
      await settled(page);
      await until(async () => (await dayReviews()).length > 0, 10000);
      const r = await dayReviews();
      // Before 04:00, the day before when it was planned and not reviewed (it isn't here).
      pass(`zones: ${tag}: Review my day saves on the device's day${early ? ' (early, nothing planned the day before)' : ''}`, r.length === 1 && r[0].local_date === day, JSON.stringify(r.map((x) => x.local_date)));
      await clean(page, `zones, ${tag}`);
    } catch (e) {
      pass(`zones ${tag} ran to the end`, false, e.message.split('\n')[0]);
    }
    await context.close();
    await db.from('day_reviews').delete().eq('user_id', me);
    await db.from('day_plans').delete().eq('user_id', me);
  }
  // Clock-change night: Saturday planned, not reviewed; at the second 01:30 the review is Saturday's.
  await planFor('2026-10-24');
  const { context, page } = await signedIn({ width: 390, clock: new Date('2026-10-25T01:30:00Z') });
  try {
    await open(page, '/my-day/review');
    pass('zones: on the clock-change night at 01:30 the review is Saturday\'s', (await toolName(page)) === 'Review my day, Sat 24 Oct', await toolName(page));
    await clean(page, 'zones, clock change');
  } catch (e) {
    pass('zones clock change ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
  await tidyDays();
}

// ------------------------------------------------------------------ dayoff
if (run('dayoff')) {
  await tidyDays();
  // Wednesdays off (Monday 0): Wed 14 Oct (week 3) and Wed 21 Oct (today).
  await db.from('working_patterns').delete().eq('user_id', me);
  await q(db.from('working_patterns').insert({ user_id: me, starts_on: sprint.start_on, days: [0, 1, 3, 4] }).select());
  const { context, page } = await signedIn({ width: 390, coach: false });
  try {
    await open(page, '/my-day/plan');
    await nextUntil(page, PLAN_Q.do);
    const pick = page.locator('.ds-answer--pick', { hasText: DRAFT }).first();
    await pick.click();
    await until(async () => (await pick.getAttribute('aria-pressed')) === 'true', 5000);
    await nextUntil(page, PLAN_Q.risk);
    await next(page);
    const planScore = (await page.locator('.ds-stat', { hasText: 'Performance score' }).locator('.ds-stat-value').textContent().catch(() => '')).trim();
    await finishWith(page, 'Set my day');
    pass('dayoff: Plan my day on a day off is set', (await dayPlans())[0]?.status === 'finished');
    await open(page, '/my-day/review');
    await page.getByRole('checkbox', { name: DRAFT, exact: true }).first().click();
    await until(async () => (await myTodos(DRAFT))[0]?.done_on === today, 10000);
    await nextUntil(page, REVIEW_Q.numbers);
    const steps = page.getByRole('textbox', { name: 'Steps today' });
    pass('dayoff: Review my day still lets a day off\'s numbers be logged', (await steps.count()) === 1);
    if (await steps.count()) {
      await steps.fill('4000');
      await steps.blur();
    }
    await nextUntil(page, REVIEW_Q.tomorrow);
    await next(page);
    await settled(page);
    const v = sprintPageView(await rowsNow(), { today });
    const shown = (await page.locator('.ds-stat', { hasText: 'Performance score' }).locator('.ds-stat-value').textContent().catch(() => '')).trim();
    pass('dayoff: the review\'s score is src/lib/scores\' with the day off', v.soFar ? shown === `${v.soFar.value}%` : shown === '', `${shown} vs ${v.soFar?.value}`);
    pass('dayoff: the plan showed a score too', planScore === '' || /^\d+%$/.test(planScore), planScore);
    await finishWith(page, (await page.locator('.ds-guide-next').textContent()).trim());
    pass('dayoff: Review my day on a day off is saved', (await dayReviews())[0]?.status === 'finished');
    await page.goto(`${APP}/performance-sprint`);
    await page.waitForSelector('.ds-sdial-big--score', { timeout: 30000 });
    const sprintShown = await until(async () => {
      const t = (await page.locator('.ds-sdial-big--score').textContent()).trim();
      return t === `${v.soFar?.value}%` ? t : null;
    }, 10000);
    pass('dayoff: the sprint page agrees', Boolean(sprintShown), await page.locator('.ds-sdial-big--score').textContent());
    // The debrief of week 3, whose Wednesday was a day off.
    await open(page, '/performance-sprint/debrief');
    pass('dayoff: the debrief opens on week 3 with a day off in it', (await heading(page)) === DEBRIEF_Q.numbers, await heading(page));
    await nextUntil(page, DEBRIEF_Q.next);
    await next(page);
    const v3 = sprintPageView(await rowsNow(), { today });
    const raw = v3.weeks[DEBRIEF_WEEK - 1]?.raw;
    const dShown = (await page.locator('.ds-stat', { hasText: 'performance score' }).locator('.ds-stat-value').textContent().catch(() => '')).trim();
    pass('dayoff: the debrief\'s score is src/lib/scores\' with the day off', raw == null ? true : dShown === `${m0Round(raw)}%`, `${dShown} vs ${raw == null ? 'none' : m0Round(raw)}`);
    await shot(page, 'dayoff-debrief');
    await clean(page, 'dayoff');
  } catch (e) {
    pass('dayoff ran to the end', false, e.message.split('\n')[0]);
    await shot(page, 'dayoff-error');
  }
  await context.close();
  await db.from('working_patterns').delete().eq('user_id', me);
}

// ------------------------------------------------------------------ others
if (run('others')) {
  await tidyDays();
  const other = client();
  const { data: os, error: oe } = await other.auth.signInWithPassword({ email: env.TEST_ORG_CLIENT_EMAIL, password: env.TEST_ORG_CLIENT_PASSWORD });
  if (oe) throw oe;
  const them = os.user.id;
  // My rows: a plan with a to-do and a Strategy, a review with a Strategy, a debrief, a figure.
  const SECRET = `${TAG} secret`;
  const planId = await planFor(today, { review: { went_well: SECRET, tomorrow: [SECRET] } });
  await db.from('day_plans').update({ grateful_for: SECRET }).eq('id', planId);
  await db.from('day_plan_strategies').insert({ day_plan_id: planId, strategy_id: strategies[0].id, user_id: me });
  const review = (await q(db.from('day_reviews').select('id').eq('user_id', me).eq('local_date', today)))[0];
  await db.from('day_review_strategies').insert({ day_review_id: review.id, strategy_id: strategies[0].id, user_id: me, level: 2 });
  const debrief = (await q(db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: DEBRIEF_WEEK, went_well: SECRET, stress: 'a_little', shared_with_coach: true }).select('id')))[0];
  const objective = (await q(db.from('outcome_objectives').select('id').eq('plan_id', sprint.plan_id).is('archived_at', null)))[0];
  const figure = (await q(db.from('objective_figures').select('id').eq('user_id', me)))[0];
  const tables = {
    day_plans: { id: planId }, day_plan_todos: { day_plan_id: planId }, day_plan_strategies: { day_plan_id: planId },
    day_reviews: { id: review.id }, day_review_strategies: { day_review_id: review.id }, weekly_debriefs: { id: debrief.id },
    week_scores: { sprint_id: sprint.id }, ...(figure ? { objective_figures: { id: figure.id } } : {}), todos: { id: ids.draft },
  };
  for (const [t, match] of Object.entries(tables)) {
    const r = await other.from(t).select('*').match(match);
    pass(`others: another client can't read my ${t}`, Boolean(r.error) || (r.data || []).length === 0, JSON.stringify(r.data).slice(0, 80));
    const u = await other.from(t).update(t === 'week_scores' ? { score: 1 } : t.endsWith('_todos') ? { is_top: false } : t.endsWith('_strategies') && t.startsWith('day_review') ? { level: 1 } : { user_id: them }).match(match).select();
    pass(`others: another client can't change my ${t}`, Boolean(u.error) || (u.data || []).length === 0, JSON.stringify(u.data).slice(0, 80));
    const d = await other.from(t).delete().match(match).select();
    pass(`others: another client can't delete my ${t}`, Boolean(d.error) || (d.data || []).length === 0, JSON.stringify(d.data).slice(0, 80));
  }
  for (const t of ['day_plans', 'day_plan_todos', 'day_plan_strategies', 'day_reviews', 'day_review_strategies', 'weekly_debriefs', 'week_scores', 'objective_figures', 'habit_logs', 'wins', 'win_strategies', 'performance_evidence', 'todos']) {
    const r = await other.from(t).select('user_id').eq('user_id', me).limit(5);
    pass(`others: another client reads none of my ${t}`, Boolean(r.error) || (r.data || []).length === 0, JSON.stringify(r.data).slice(0, 80));
  }
  // Writing rows that claim to be mine, or that point at my rows.
  const theirPlan = crypto.randomUUID();
  await other.from('day_plans').insert({ id: theirPlan, user_id: them, local_date: '2026-01-01' });
  const tries = [
    ['day_plans', { user_id: me, local_date: '2026-01-02' }, 'as me'],
    ['day_plan_todos', { day_plan_id: planId, todo_id: ids.draft, user_id: them, is_top: false }, 'on my plan'],
    ['day_plan_todos', { day_plan_id: theirPlan, todo_id: ids.draft, user_id: them, is_top: false }, 'with my to-do'],
    ['day_plan_strategies', { day_plan_id: theirPlan, strategy_id: strategies[1].id, user_id: them }, 'with my Strategy'],
    ['day_reviews', { user_id: me, local_date: '2026-01-02' }, 'as me'],
    ['day_review_strategies', { day_review_id: review.id, strategy_id: strategies[1].id, user_id: them, level: 3 }, 'on my review'],
    ['weekly_debriefs', { user_id: them, sprint_id: sprint.id, sprint_week: 9 }, 'on my sprint'],
    ['weekly_debriefs', { user_id: me, sprint_id: sprint.id, sprint_week: 8 }, 'as me'],
    ['week_scores', { user_id: them, sprint_id: sprint.id, sprint_week: 9, week_end: '2026-11-29', score: 100 }, 'on my sprint'],
    ...(objective ? [['objective_figures', { user_id: them, objective_id: objective.id, value: 99, recorded_on: today }, 'on my objective']] : []),
    ['habit_logs', { user_id: them, sprint_habit_id: hid('Steps'), local_date: today, value: 1 }, 'on my habit'],
    ['todos', { user_id: them, strategy_id: strategies[0].id, text: `${TAG} planted`, impact: 1, source: 'plan_my_day' }, 'on my Strategy'],
  ];
  for (const [t, row, how] of tries) {
    const r = await other.from(t).insert(row).select();
    const ok = Boolean(r.error) || (r.data || []).length === 0;
    pass(`others: another client can't write into ${t} ${how}`, ok, JSON.stringify(r.data).slice(0, 120));
    if (!ok) for (const x of r.data) await other.from(t).delete().match(x.id ? { id: x.id } : row);
  }
  await other.from('day_plans').delete().eq('id', theirPlan);
  for (const [fn, args] of [['freeze_week', { p_sprint: sprint.id, p_week: DEBRIEF_WEEK }], ['person_today', { p_person: me }]]) {
    const r = await other.rpc(fn, args);
    pass(`others: another client can't run ${fn} on my rows`, Boolean(r.error) || r.data == null || (Array.isArray(r.data) && !r.data.length), JSON.stringify(r.data).slice(0, 120));
  }
  // Nothing of mine changed.
  const still = (await q(db.from('weekly_debriefs').select('went_well, stress, user_id').eq('id', debrief.id)))[0];
  pass('others: my debrief is untouched', still?.went_well === SECRET && still.stress === 'a_little' && still.user_id === me, JSON.stringify(still));
  const stillPlan = (await q(db.from('day_plan_todos').select('todo_id').eq('day_plan_id', planId))).length;
  pass('others: my plan\'s to-dos are untouched', stillPlan === 1, `${stillPlan}`);
  // Signed out, with the public key only.
  const anon = client();
  for (const t of ['day_plans', 'day_plan_todos', 'day_plan_strategies', 'day_reviews', 'day_review_strategies', 'weekly_debriefs', 'week_scores', 'objective_figures']) {
    const r = await anon.from(t).select('*').limit(5);
    pass(`others: signed out reads none of ${t}`, Boolean(r.error) || (r.data || []).length === 0, JSON.stringify(r.data).slice(0, 80));
    const i = await anon.from(t).insert({ user_id: me }).select();
    pass(`others: signed out can't write ${t}`, Boolean(i.error), JSON.stringify(i.data).slice(0, 80));
    const u = await anon.from(t).update({ user_id: me }).eq('user_id', me).select();
    pass(`others: signed out can't change ${t}`, Boolean(u.error) || (u.data || []).length === 0);
  }
  // In the app as the other client: my days and my debrief show nothing of mine.
  const { context, page } = await signedIn({ width: 1280, email: env.TEST_ORG_CLIENT_EMAIL, password: env.TEST_ORG_CLIENT_PASSWORD });
  const writes = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && /day_plans|day_reviews|weekly_debriefs/.test(r.url())) writes.push(r.url()); });
  try {
    for (const path of [`/my-day/plan/${today}`, `/my-day/review/${today}`, '/my-day/plan', '/my-day/review', `/performance-sprint/debrief/${sprint.id}/${DEBRIEF_WEEK}`, `/performance-sprint/debrief/${sprint.id}/${WEEK}`, '/performance-sprint/debrief', `/my-day/plan/${planId}`]) {
      await page.goto(`${APP}${path}`);
      await page.waitForSelector('.ds-guide-question, .plan-page, .ui-root', { timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(2000);
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const leaks = [SECRET, 'Calm under pressure', DRAFT, strategies[0].name].filter((s) => text.includes(s));
      pass(`others: ${path} as another client shows none of mine`, leaks.length === 0, leaks.join(', '));
    }
    const mine = await debriefs();
    pass('others: visiting my debrief\'s address made nothing on my sprint', mine.length === 1 && mine[0].user_id === me, JSON.stringify(mine.map((x) => x.user_id)));
    pass('others: no page errors as another client', page.errors.length === 0, page.errors.join(' | '));
  } catch (e) {
    pass('others in the app ran to the end', false, e.message.split('\n')[0]);
  }
  await context.close();
  // Signed out: every Phase 3 route asks to sign in.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  for (const path of ['/my-day/plan', '/my-day/review', `/my-day/review/${today}`, '/performance-sprint/debrief', `/performance-sprint/debrief/${sprint.id}/${DEBRIEF_WEEK}`]) {
    await p.goto(`${APP}${path}`);
    await p.waitForTimeout(2000);
    const text = await p.locator('body').innerText();
    pass(`others: signed out, ${path} asks to sign in`, /\/auth\/login|\/welcome|^\/$/.test(new URL(p.url()).pathname) && !text.includes(SECRET), p.url());
  }
  await ctx.close();
  await other.auth.signOut();
}

await browser.close();

// Tidy: everything this test added, then the seeded plan v3.2 with Sprint 1 running, on the real today.
await tidyDays();
await db.from('working_patterns').delete().eq('user_id', me);
console.log(seedForReal('--reset'));
const back = (await q(db.from('performance_plans').select('major, minor').eq('user_id', me).eq('status', 'active')))[0];
const running = (await q(db.from('sprints').select('number').eq('user_id', me).eq('status', 'running')))[0];
pass('tidy: the seeded plan v3.2 is back, with Sprint 1 running', back?.major === 3 && back.minor === 2 && running?.number === 1, JSON.stringify(back));
const left = (await q(db.from('todos').select('id').eq('user_id', me).like('text', `${TAG}%`))).length + (await q(db.from('wins').select('id').eq('user_id', me).like('what', `${TAG}%`))).length;
pass('tidy: nothing of this test is left', left === 0, `${left}`);

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
