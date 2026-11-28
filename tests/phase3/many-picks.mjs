// No limit on the Daily plan (Tim, 16 Nov, 19:03; overnight Part C, step 4),
// signed in as the invented test client on the TEST database only, on the
// fixed day (tests/phase2/fixed-day.mjs).
//
//   node --import ./tests/scores/register.mjs tests/phase3/many-picks.mjs [folder for screenshots]
//
// Six to-dos and two habits are chosen in the Daily plan, with the 4th
// to-do as the highest priority. Then:
//   - nothing greys out, and there is no "Choose up to 3." or count;
//   - the priority screen lists all eight;
//   - the summary, Home and the Daily review show every one, the highest
//     priority first, then the rest in the order chosen;
//   - on a phone (390 and 360) every row keeps the same layout as the
//     first, eight rows and more, with no sideways scroll;
//   - before 047 the database holds three of the day's to-dos and the rest
//     wait on the device, quietly (no error); after 047 it holds all six.
// The seed is put back on the real today at the end.
import { TEST_HOST as TARGET_HOST } from '../target.mjs';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock } from '../phase2/fixed-day.mjs';
import { clientDb, readEnv } from '../phase8/shared.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = TARGET_HOST;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};
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

const env = readEnv();
const { db, me } = await clientDb(env);
const today = FIXED_TODAY;
const TODOS = ['Many one: send the Harbour proposal', 'Many two: book the venue', 'Many three: draft the newsletter',
  'Many four: call the Harbour sponsor', 'Many five: update the case study', 'Many six: plan the workshop agenda'];
const HABITS = ['Training sessions', 'Reflective notes'];
const TOP = TODOS[3];

seedFixed('--reset');
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const strategy = (await db.from('plan_strategies').select('id').eq('user_id', me).is('archived_at', null).order('sort_order').limit(1)).data[0];
const week = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${sprint.start_on}T12:00:00Z`)) / (7 * 86400000)) + 1;

async function clean() {
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
  await db.from('day_plan_habits').delete().eq('user_id', me).eq('local_date', today);
  await db.from('todos').delete().eq('user_id', me).like('text', 'Many %');
  await db.from('todos').delete().eq('user_id', me).eq('source', 'plan_my_day').eq('created_on', today);
}
async function makeTodos() {
  await clean();
  const rows = TODOS.map((text, i) => ({
    id: randomUUID(), user_id: me, strategy_id: strategy.id, text, impact: 2, sprint_id: sprint.id, planned_week: week,
    created_on: today, source: 'manual', created_at: new Date(Date.UTC(2026, 0, 1, 9, i)).toISOString(),
  }));
  const { error } = await db.from('todos').insert(rows);
  if (error) throw new Error(`could not make the to-dos: ${error.code}`);
  return rows;
}

const browser = await chromium.launch();
async function signedIn(width, mode) {
  const phone = width < 769;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
  await fixClock(context);
  await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${APP}/login`);
  await page.locator('input[type=email]').fill(env.TEST_CLIENT_EMAIL);
  await page.locator('input[type=password]').fill(env.TEST_CLIENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page, errors };
}

// Stage D: the Daily plan runs on ToolFrame (StepFrame) and the Daily review on GuidedTool: both questions are .ds-q.
const heading = (page) => page.locator('.ds-q').first().innerText().then((t) => t.trim()).catch(() => '');
async function next(page) {
  const before = await heading(page);
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-tool-foot .ds-btn--primary').first().click();
    if (await until(async () => (await heading(page)) !== before, 1200)) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const names = (page, sel) => page.locator(`${sel} .ds-todo-text`).allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').trim().replace(/\s*, highest priority$/, '')) /* the first row's screen-reader words */);
const ORDER = [TOP, ...TODOS.filter((t) => t !== TOP), ...HABITS];
const SIZES = (process.env.SIZES || '1280,390,360').split(',').map(Number);

// Every row on a phone laid out as the first: the same left edge, the same
// height for one line of words, the tick box in the same place.
async function sameRows(page, sel) {
  return page.evaluate((s) => {
    const rows = [...document.querySelectorAll(`${s} .ds-todo`)].map((r) => {
      const box = r.getBoundingClientRect();
      const mark = r.querySelector('.ds-todo-mark, .ds-check-box')?.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), markLeft: mark ? Math.round(mark.left - box.left) : null, overflow: r.scrollWidth - r.clientWidth };
    });
    const first = rows[0];
    const odd = rows.filter((r) => r.left !== first.left || r.right !== first.right || r.markLeft !== first.markLeft || r.overflow > 0);
    return { count: rows.length, odd, sideways: document.documentElement.scrollWidth - window.innerWidth };
  }, sel);
}

async function run(width, mode) {
  const tag = `${width}px ${mode}`;
  const made = await makeTodos();
  const { context, page, errors } = await signedIn(width, mode);
  try {
    await page.goto(`${APP}/daily-plan`);
    await page.waitForSelector('.ds-q', { timeout: 30000 });
    // Sleep, gratitude and Be, quickly.
    await page.getByRole('button', { name: 'Half an hour more' }).click();
    await page.getByRole('radio', { name: 'Very good', exact: true }).click();
    await next(page);
    await page.locator('.ds-tool-step-body textarea').first().fill('A quiet start.');
    await next(page);
    await page.locator('.ds-tool-step-body input, .ds-tool-step-body textarea').first().fill('Decisive'); // Stage D, Q1: suggestions behind See an example
    await next(page);

    pass(`${tag}: Do`, (await heading(page)) === 'What will you do today?', await heading(page));
    pass(`${tag}: no nudge and no count`, (await page.locator('.ds-guide-nudge, .ds-tool-hint, .ds-pick-count').count()) === 0);
    const pick = (name) => page.locator('.ds-answer--pick', { hasText: name }).first();
    for (const name of [...TODOS, ...HABITS]) {
      await pick(name).click();
      await until(async () => (await pick(name).getAttribute('aria-pressed')) === 'true', 8000);
      await sleep(350);
    }
    pass(`${tag}: all eight chosen`, (await page.locator('.ds-answer--pick[aria-pressed="true"]').count()) === 8);
    pass(`${tag}: nothing greys out`, (await page.locator('.ds-answer--pick:disabled').count()) === 0);
    await shot(page, `${width}-${mode}-do`);
    await next(page);

    // Stage D, Draft 11 (Tim's answer 5): no priority screen; the top is chosen on the list with Move to top.
    pass(`${tag}: no priority screen`, (await heading(page)) === 'Which of your Strategies does today move forward?', await heading(page));
    await page.getByRole('button', { name: 'Back', exact: true }).click().catch(() => null);
    await until(async () => (await heading(page)) === 'What will you do today?', 4000);
    pass(`${tag}: Move to top on all but the first of the eight`, (await page.getByRole('button', { name: /^Move “.*” to the top$/ }).count()) === 7);
    await page.getByRole('button', { name: `Move “${TOP}” to the top` }).click();
    await until(async () => (await page.locator('.ds-answer--pick', { hasText: TOP }).first().innerText()).includes('Most important'), 4000);
    await next(page);
    // Strategy, then Risk.
    await page.locator('.ds-tool-step-body button[aria-pressed]').first().click();
    await next(page);
    await page.locator('.ds-tool-step-body textarea').nth(0).fill('Calls run over.');
    await page.locator('.ds-tool-step-body textarea').nth(1).fill('Leave ten minutes between calls.');
    await next(page);

    const summary = (await page.locator('.ds-guide-summary').innerText()).replace(/\s+/g, ' ');
    const at = ORDER.map((n) => summary.indexOf(n));
    pass(`${tag}: the summary shows all eight, the highest priority first, then in order`, at.every((i) => i >= 0) && at.every((i, k) => !k || i > at[k - 1]), at.join(','));
    pass(`${tag}: the summary numbers them 1 to 8`, summary.includes(`1. ${TOP}`) && summary.includes('8. '), summary.slice(0, 200));
    await shot(page, `${width}-${mode}-summary`);
    await until(async () => {
      if (/performance-sprint/.test(page.url())) return true;
      await page.getByRole('button', { name: 'Finish', exact: true }).click({ timeout: 2000 }).catch(() => null);
      return page.waitForURL(/performance-sprint/, { timeout: 1500 }).then(() => true, () => false);
    }, 15000);

    // The database: all six once 047 has run, three before it (the rest on the device), with no error.
    const plan = (await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', today)).data?.[0];
    const held = await until(async () => {
      const r = (await db.from('day_plan_todos').select('todo_id, is_top').eq('day_plan_id', plan?.id)).data || [];
      return r.length >= 3 ? r : null;
    }, 15000) || [];
    const topId = made.find((t) => t.text === TOP).id;
    pass(`${tag}: the database holds the day’s to-dos (all six after 047, three before), the 4th on top`, (held.length === 6 || held.length === 3) && held.find((t) => t.is_top)?.todo_id === topId, JSON.stringify(held.length));
    pass(`${tag}: no error was shown`, (await page.locator('.ds-toast--error, [role=alert]').count()) === 0);

    // Home: every item, the 4th first.
    await page.goto(`${APP}/welcome`);
    await page.locator('.home-todos').waitFor({ timeout: 20000 });
    // The device's copy shows first and the page refreshes quietly (Smoothness, Phase 0e): wait for it to settle.
    let home = [];
    await until(async () => { home = await names(page, '.home-todos'); return JSON.stringify(home) === JSON.stringify(ORDER); }, 10000);
    pass(`${tag}: Home lists all eight, the highest priority first, then in order`, JSON.stringify(home) === JSON.stringify(ORDER), home.join(' | '));
    if (width < 769) {
      const r = await sameRows(page, '.home-todos');
      pass(`${tag}: Home’s eight rows keep one layout on a phone`, r.count === 8 && r.odd.length === 0 && r.sideways <= 0, JSON.stringify(r));
    }
    await shot(page, `${width}-${mode}-home`);

    // Daily review: the same, in the same order.
    await page.goto(`${APP}/daily-review`);
    await page.waitForSelector('.ds-q', { timeout: 30000 });
    const reached = await until(async () => (await page.locator('.rev-list').count()) > 0 || (await heading(page)).startsWith('Which of today'), 8000);
    if (reached && !(await page.locator('.rev-list').count())) await next(page);
    await page.locator('.rev-list').first().waitFor({ timeout: 15000 });
    let review = [];
    await until(async () => { review = await names(page, '.rev-list'); return JSON.stringify(review.slice(0, 8)) === JSON.stringify(ORDER); }, 10000);
    pass(`${tag}: the Daily review lists all eight, in the same order`, JSON.stringify(review.slice(0, 8)) === JSON.stringify(ORDER), review.join(' | '));
    if (width < 769) {
      const r = await sameRows(page, '.rev-list');
      pass(`${tag}: the review’s rows keep one layout on a phone`, r.count >= 8 && r.odd.length === 0 && r.sideways <= 0, JSON.stringify(r));
    }
    await shot(page, `${width}-${mode}-review`);
    pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    if (width === SIZES[0]) await freshDevice(width, mode);
  } catch (e) {
    pass(`${tag}: the run finished`, false, `${e.message}`.split('\n')[0]);
    await shot(page, `${width}-${mode}-error`);
  }
  await context.close();
}

// The functionality tester's F1 (Stage D): the finished plan opened on another device (a fresh browser context, so
// nothing of the day is on it) reads day_plan_habits for its summary, its Edit ticks and its order, so nothing is
// dropped and the most important stays first; editing the to-dos there and saving keeps every habit.
async function freshDevice(width, mode) {
  const tag = `${width}px ${mode}, another device`;
  const { context, page, errors } = await signedIn(width, mode);
  try {
    await page.goto(`${APP}/daily-plan`);
    await page.waitForSelector('.ds-q', { timeout: 30000 });
    const summaryNames = async () => (await page.locator('.ds-guide-summary').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const inOrder = (text) => { const at = ORDER.map((n) => text.indexOf(n)); return at.every((i) => i >= 0) && at.every((i, k) => !k || i > at[k - 1]); };
    let summary = '';
    await until(async () => inOrder(summary = await summaryNames()), 12000);
    pass(`${tag}: the summary shows all eight, habits included, the most important first`, inOrder(summary) && summary.includes(`1. ${TOP}`), summary.slice(0, 300));
    pass(`${tag}: no "Skipped" on the to-dos`, !/To-dos Skipped/.test(summary));
    // Edit the to-dos: every pick ticked, the habits too, then one more change saved.
    await page.locator('.ds-guide-summary-row', { hasText: 'To-dos' }).getByRole('button', { name: /^Edit/ }).first().click();
    await until(async () => (await heading(page)) === 'What will you do today?', 8000);
    const ticked = async (name) => (await page.locator('.ds-answer--pick', { hasText: name }).first().getAttribute('aria-pressed')) === 'true';
    const all = await until(async () => (await Promise.all(ORDER.map(ticked))).every(Boolean), 8000);
    pass(`${tag}: Edit shows every pick ticked, the habits included`, Boolean(all), JSON.stringify(await Promise.all(ORDER.map(ticked))));
    pass(`${tag}: Edit keeps the most important first`, (await page.locator('.ds-answer--pick', { hasText: TOP }).first().innerText()).includes('Most important'));
    await page.locator('.ds-answer--pick', { hasText: TODOS[5] }).first().click();
    await until(async () => !(await ticked(TODOS[5])), 5000);
    await page.locator('.ds-tool-foot .ds-btn--primary').first().click();
    await until(async () => (await heading(page)) === 'This was your plan', 8000);
    const want = ORDER.filter((n) => n !== TODOS[5]);
    summary = await summaryNames();
    pass(`${tag}: after Save my edit the summary keeps the habits and the order`, (() => { const at = want.map((n) => summary.indexOf(n)); return at.every((i) => i >= 0) && at.every((i, k) => !k || i > at[k - 1]); })() && !summary.includes(TODOS[5]), summary.slice(0, 300));
    const ids = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id).in('name', HABITS)).data.map((h) => h.id);
    const row = await until(async () => {
      const r = (await db.from('day_plan_habits').select('habit_ids, top_pick').eq('user_id', me).eq('local_date', today)).data?.[0];
      return r && ids.every((id) => (r.habit_ids || []).includes(id)) ? r : null;
    }, 10000);
    pass(`${tag}: day_plan_habits still holds both habits after the edit`, Boolean(row), JSON.stringify(row));
    pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    pass(`${tag}: the run finished`, false, `${e.message}`.split('\n')[0]);
    await shot(page, `${width}-${mode}-fresh-error`);
  }
  await context.close();
}

// The break-it tester's cases (17 Nov): a pick made while "Add to-do" is
// still saving stays chosen; a cap key from before 047, with a time in the
// future, never holds the day at three; to-dos waiting on the device from
// before 047 are sent once the day opens.
async function tester() {
  const tag = 'break-it cases';
  const made = await makeTodos();
  const { context, page, errors } = await signedIn(1280, 'dark');
  try {
    await page.evaluate((id) => localStorage.setItem(`clarity-cache:${id}:day-plan-cap`, JSON.stringify({ cap: 3, at: Date.now() + 3600000 })), me);
    await page.goto(`${APP}/daily-plan`);
    await page.waitForSelector('.ds-q', { timeout: 30000 });
    await page.getByRole('button', { name: 'Half an hour more' }).click();
    await page.getByRole('radio', { name: 'Very good', exact: true }).click();
    await next(page);
    await page.locator('.ds-tool-step-body textarea').first().fill('A quiet start.');
    await next(page);
    await page.locator('.ds-tool-step-body input, .ds-tool-step-body textarea').first().fill('Decisive'); // Stage D, Q1: suggestions behind See an example
    await next(page);
    const pick = (name) => page.locator('.ds-answer--pick', { hasText: name }).first();
    for (const name of TODOS.slice(0, 5)) {
      await pick(name).click();
      await until(async () => (await pick(name).getAttribute('aria-pressed')) === 'true', 8000);
      await sleep(350);
    }
    const plan = await until(async () => (await db.from('day_plans').select('id').eq('user_id', me).eq('local_date', today)).data?.[0], 10000);
    const held = await until(async () => {
      const r = (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan?.id)).data || [];
      return r.length === 5 ? r : null;
    }, 15000);
    pass(`${tag}: a cap kept with a time in the future never holds the day at three`, Boolean(held), JSON.stringify((await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan?.id)).data?.length));

    // A pick made while a new to-do is still saving stays chosen.
    await page.route(/\/rest\/v1\/todos/, async (route) => {
      if (route.request().method() === 'GET') return route.fallback();
      await sleep(2500);
      return route.fallback();
    });
    await page.getByRole('button', { name: 'Add a to-do' }).click(); // Polish 1: the + square
    const panel = page.locator('[role=dialog]').last();
    await panel.locator('textarea').first().fill('Many seven: added in the panel');
    await panel.getByRole('button', { name: 'Add to-do' }).click();
    await sleep(300);
    await pick(TODOS[5]).click();
    await sleep(4500);
    await page.unroute(/\/rest\/v1\/todos/);
    pass(`${tag}: a pick made while a new to-do saves stays chosen`, (await pick(TODOS[5]).getAttribute('aria-pressed')) === 'true' && (await pick('Many seven').getAttribute('aria-pressed')) === 'true');
    const seven = await until(async () => {
      const r = (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data || [];
      return r.length === 7 ? r : null;
    }, 15000);
    pass(`${tag}: … and both are saved with the day`, Boolean(seven) && seven.some((t) => t.todo_id === made[5].id));

    // To-dos waiting on the device from before 047 are sent when the day opens.
    const waiting = [made[0].id, made[1].id];
    await db.from('day_plan_todos').delete().eq('day_plan_id', plan.id).in('todo_id', waiting);
    await page.evaluate(({ id, day, extra }) => {
      const key = `clarity-day-plan-local:${id}:${day}`;
      const v = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...v, extra, sent: false }));
      localStorage.removeItem(`clarity-cache:${id}:day-plan-cap`);
    }, { id: me, day: today, extra: waiting });
    await page.goto(`${APP}/daily-plan`);
    await page.waitForSelector('.ds-q', { timeout: 30000 });
    const back = await until(async () => {
      const r = (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data || [];
      return waiting.every((w) => r.some((t) => t.todo_id === w)) ? r : null;
    }, 15000);
    pass(`${tag}: to-dos waiting on the device are sent when the day opens`, Boolean(back));
    pass(`${tag}: no error was shown`, (await page.locator('.ds-toast--error, [role=alert]').count()) === 0);
    pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    pass(`${tag}: the run finished`, false, `${e.message}`.split('\n')[0]);
    await shot(page, 'tester-error');
  }
  await context.close();
  await db.from('todos').delete().eq('user_id', me).eq('text', 'Many seven: added in the panel');
}

for (const width of SIZES) await run(width, width === 390 ? 'light' : 'dark');
if (!process.env.SIZES) await tester();
await browser.close();
await clean();
seedForReal('--reset');
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
