// Phase 3 step 5 journeys in the running app: a week as a real client
// lives it, signed in as the invented test client on the TEST database
// only (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/journeys.mjs [folder for screenshots]
//
// One phone (390px, light), kept for the whole week as a client's own
// device, so what Plan my day keeps on the device (the habits chosen for
// the day) is there in the evening. The seed is built around Monday 19
// Oct 2026, the first day of week 4 of the running sprint, and the
// browser's clock is moved on a day at a time (tests/phase2/fixed-day.mjs):
//
// 1. Monday morning: Plan my day (sleep, a to-do, a habit, a to-do added
//    in the panel, the Strategy of the day); the to-dos show on the sprint.
// 2. Monday evening: Review my day (ticks, the numbers, an unplanned win,
//    three things for tomorrow); the habit logs, the score (src/lib/scores)
//    and Performance Evidence update.
// 3. Tuesday morning: Plan my day lists last night's three things.
// 4. Tuesday to Friday: plan and review each day, one thing for tomorrow.
// 5. Monday 26 Oct: the Weekly performance debrief, from the sprint page;
//    the week's score final in week_scores and equal to src/lib/scores, the
//    objective figures on the plan page, next week's to-do in the sprint,
//    the streak.
// 6. Sharing: with no coach, the row stores shared_with_coach (off) and
//    no read the app makes shows stress to anyone but its owner.
// 7. The sprint page, View your year and the plan page show the new week.
// 8. A new Weekly momentum review opens the debrief; an old weekly
//    check-in still opens; /personal-operating-plan-review opens the
//    end-of-sprint review.
//
// Everything it adds is removed at the end, and the seed is put back on
// the real today.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { seedForReal, londonInstant } from '../phase2/fixed-day.mjs';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';
import { yearView } from '../../src/lib/performance/year.js';
import { m0Round } from '../../src/lib/scores/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
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

const MONDAY = '2026-10-19';
const dayKey = (n, from = MONDAY) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const WEEKDAYS = [0, 1, 2, 3, 4].map((n) => dayKey(n));
const NEXT_MONDAY = dayKey(7);
const SUNDAY = dayKey(6);
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
console.log(`Week of ${MONDAY} (week 4), debrief on ${NEXT_MONDAY}`);

// ---------------------------------------------------------------- the data
// Invented words, so a failed run's leftovers can be found and removed.
const TAG = 'Journey';
const PANEL_TODO = `${TAG}: ring the Harbour team about the workshop`;
const WIN = `${TAG}: ran a workshop that led to two referrals`;
const THINGS = [`${TAG}: call Evan about the referral`, `${TAG}: send the Harbour proposal`, `${TAG}: book the physio`];
const dayThing = (i) => `${TAG}: follow up from day ${i + 1}`;
const NEXT_TODO = `${TAG}: plan the referral breakfast`;
const OLD_WEEKLY = `${TAG}: an old weekly check-in`;
const DEBRIEF = { well: 'Five days planned and reviewed.', way: 'Late calls on Thursday.', adjust: 'Stop work by 18:30.' };

seedForReal('--reset', `--today=${MONDAY}`);
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const WEEK = 4;
if (dayKey(21, sprint.start_on) !== MONDAY) throw new Error(`Week 4 should start on ${MONDAY}; the sprint starts ${sprint.start_on}.`);

const objectives = (await db.from('outcome_objectives').select('id, name').eq('plan_id', sprint.plan_id).is('archived_at', null)).data;
const oid = (name) => objectives.find((o) => o.name === name).id;
const sprintHabits = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data;
const hid = (name) => sprintHabits.find((h) => h.name === name).id;

async function tidy() {
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('day_plans').delete().eq('user_id', me);
  await db.from('todos').delete().eq('user_id', me).like('text', `${TAG}:%`);
  await db.from('wins').delete().eq('user_id', me).like('what', `${TAG}:%`);
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  await db.from('objective_figures').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  await db.from('journal_entries').delete().eq('user_id', me).eq('title', OLD_WEEKLY);
}
await tidy();
// Weeks 1 to 3 debriefed in their windows, so the streak has something to count.
await db.from('weekly_debriefs').insert([1, 2, 3].map((w) => ({ user_id: me, sprint_id: sprint.id, sprint_week: w, status: 'finished', finished_at: `${dayKey(7 * w + 1, sprint.start_on)}T18:00:00Z` })));

async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const sprints = await q(db.from('sprints').select('*').eq('user_id', me).order('number'));
  const [weekScores, recoveries, workingPatterns, allDebriefs, objs, strategyRows, links] = await Promise.all([
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
    q(db.from('weekly_debriefs').select('sprint_id, sprint_week, status').eq('user_id', me)),
    q(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null).order('sort_order')),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
  ]);
  const shs = await q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order'));
  const ids = shs.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)),
    q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', ids)),
    q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    q(db.from('todo_moves').select('*').eq('user_id', me)),
    q(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
    q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  return { plan: { id: sprint.plan_id }, sprint, sprints, weekScores, recoveries, workingPatterns, allDebriefs, objectives: objs, strategies: strategyRows, links, sprintHabits: shs, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}
const logOf = async (name, day) => (await db.from('habit_logs').select('value').eq('sprint_habit_id', hid(name)).eq('local_date', day)).data?.[0]?.value ?? null;

// ---------------------------------------------------------------- the device
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  colorScheme: 'light',
});
await context.clock.install({ time: londonInstant(MONDAY, '07:30') });
await context.addInitScript(() => {
  try { localStorage.setItem('clarity-colour-mode', 'light'); } catch { /* blocked */ }
});
// Every read of weekly_debriefs the app makes, and whether it asks for stress.
const debriefReads = [];
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\//.test(url)) return route.abort();
  if (url.includes('/rest/v1/weekly_debriefs') && route.request().method() === 'GET') debriefReads.push(decodeURIComponent(url.split('/rest/v1/')[1]));
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', (e) => pass('no page errors', false, e.message));
await page.exposeFunction('reportSuperseded', () => pass('no save is refused as from another window', false));
await context.addInitScript(() => {
  new MutationObserver(() => {
    if (document.body?.innerText.includes('This was changed in another window')) window.reportSuperseded?.();
  }).observe(document, { childList: true, subtree: true });
});
const shot = async (name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const at = async (day, time) => { await context.clock.setSystemTime(londonInstant(day, time)); };

await page.goto(`${APP}/auth/login`);
await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL(/welcome/, { timeout: 30000 });

const heading = async () => (await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim();
const body = () => page.locator('.ds-guide-body');
async function next() {
  const before = await heading();
  for (let i = 0; i < 6; i += 1) {
    await page.locator('.ds-guide-next').click();
    const moved = await until(async () => (await heading()) !== before, 1200);
    if (moved) return;
  }
  throw new Error(`Next didn't move on from "${before}"`);
}
async function open(path) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
}
// The last button, tapped until the page goes back to the sprint.
async function finishWith(label) {
  const gone = await until(async () => {
    if (new URL(page.url()).pathname === '/performance-sprint') return true;
    await page.getByRole('button', { name: label }).click({ timeout: 2000 }).catch(() => null);
    return page.waitForURL((u) => u.pathname === '/performance-sprint', { timeout: 1500 }).then(() => true, () => false);
  }, 15000);
  if (!gone) throw new Error(`${label} did not go back`);
}
const checkbox = (name) => page.getByRole('checkbox', { name, exact: true }).first();
async function tick(name) {
  if ((await checkbox(name).getAttribute('aria-checked')) !== 'true') await checkbox(name).click();
  return until(async () => (await checkbox(name).getAttribute('aria-checked')) === 'true', 5000);
}
async function sprintScoreMatches(day, tag) {
  await page.waitForSelector('.ds-sdial-big--score', { timeout: 30000 });
  const v = sprintPageView(await rowsNow(), { today: day });
  const shown = await until(async () => {
    const t = (await page.locator('.ds-sdial-big--score').textContent()).trim();
    return t === `${v.soFar.value}%` ? t : null;
  }, 10000);
  pass(`${tag}: the sprint's score is src/lib/scores' (${v.soFar.value}%)`, Boolean(shown), `${await page.locator('.ds-sdial-big--score').textContent()} vs ${v.soFar.value}%`);
  return v;
}

// ---------------------------------------------------------------- Plan my day
// picks: the names to choose on "What will you do today?"; lastNight: the
// names that must be first, tagged "On last night's list".
async function planDay(day, i, { picks, lastNight = [], panel = false }) {
  const tag = `${day} plan`;
  await at(day, '07:30');
  await open('/my-day/plan');
  pass(`${tag}: opens on Sleep`, (await heading()) === 'How did you sleep last night?', await heading());
  await page.getByRole('button', { name: 'Half an hour more' }).click();
  await page.getByRole('radio', { name: 'Good', exact: true }).click();
  await next();
  await body().locator('textarea').first().fill(`Grateful for day ${i + 1}.`);
  await next();
  await page.getByRole('radio', { name: 'Decisive' }).click();
  await next();
  pass(`${tag}: Do`, (await heading()) === 'What will you do today?', await heading());
  const shown = await page.locator('.ds-answer--pick').allInnerTexts();
  lastNight.forEach((name, n) => {
    pass(`${tag}: last night's "${name}" is on the list, in order, tagged`, (shown[n] || '').includes(name) && shown[n].includes('On last night’s list'), shown.slice(0, 4).join(' | '));
  });
  for (const name of picks) {
    const pick = page.locator('.ds-answer--pick', { hasText: name }).first();
    await pick.click();
    await until(async () => (await pick.getAttribute('aria-pressed')) === 'true', 8000);
  }
  if (panel) {
    await page.getByRole('button', { name: 'Add a to-do' }).click();
    const p = page.locator('[role=dialog]').last();
    await p.locator('textarea').first().fill(PANEL_TODO);
    await p.getByRole('button', { name: 'Add my to-do' }).click();
    await until(async () => (await page.getByText(/Added to (today and )?this week’s sprint/).count()) > 0, 10000);
  }
  await next();
  if ((await heading()) === 'Which one is your highest priority?') {
    await body().getByRole('radio').first().click();
    await next();
  }
  pass(`${tag}: Strategy`, (await heading()) === 'Which Strategies does today serve most?', await heading());
  await page.getByRole('button', { name: 'Grow through referrals' }).click();
  await next();
  await body().locator('textarea').nth(0).fill('Calls run over.');
  await body().locator('textarea').nth(1).fill('Block an hour for the proposal.');
  await next();
  pass(`${tag}: the summary`, /^Here’s your day, \S+\.$/.test(await heading()), await heading());
  await shot(`${day}-plan-summary`);
  await finishWith('Set my day');
  const row = await until(async () => {
    const r = (await db.from('day_plans').select('id, status, sleep_hours, sleep_quality').eq('user_id', me).eq('local_date', day)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass(`${tag}: saved as set, with its sleep`, Boolean(row) && Number(row.sleep_hours) === 7.5 && row.sleep_quality === 'good', JSON.stringify(row));
  return row;
}

// ---------------------------------------------------------------- Review my day
async function reviewDay(day, i, { ticks, win = false, tomorrow = [] }) {
  const tag = `${day} review`;
  await at(day, '19:30');
  await open('/my-day/review');
  pass(`${tag}: opens on today's to-dos`, (await heading()) === 'Which of today’s to‑dos did you do?', await heading());
  for (const name of ticks) pass(`${tag}: ticked "${name}"`, Boolean(await tick(name)));
  await next();
  pass(`${tag}: Be`, (await heading()) === 'On a scale of 1 to 10, how decisive were you today?', await heading());
  await page.getByRole('radio', { name: '7', exact: true }).click();
  await next();
  pass(`${tag}: Numbers`, (await heading()) === 'What are today’s numbers?', await heading());
  const typed = {};
  for (const [name, value] of [['Steps', String(9000 + i * 100)], ['Water', '1.5']]) {
    const box = page.getByRole('textbox', { name: `${name} today` });
    if (await box.count()) {
      await box.fill(value);
      await box.blur();
      typed[name] = Number(value);
    }
  }
  const focus = page.getByRole('group', { name: 'Focus today' });
  if (await focus.count()) {
    await focus.getByRole('button', { name: '4', exact: true }).click();
    typed.Focus = 4;
  }
  const late = page.getByRole('group', { name: 'Late finishes today' });
  if (await late.count()) {
    await late.getByRole('button', { name: 'No', exact: true }).click();
    typed['Late finishes'] = 0;
  }
  await next();
  pass(`${tag}: Went well`, (await heading()) === 'What went well today?', await heading());
  await body().locator('textarea').first().fill(`Day ${i + 1} went to plan.`);
  if (win) {
    await page.getByRole('button', { name: 'Add an unplanned win' }).click();
    const p = page.getByRole('dialog', { name: 'Add an unplanned win' });
    await p.locator('textarea').first().waitFor();
    await p.locator('textarea').first().fill(WIN);
    await p.getByRole('button', { name: 'Grow through referrals' }).click();
    await p.getByRole('button', { name: 'Add my win' }).click();
    pass(`${tag}: the win's toast names Performance Evidence`, Boolean(await until(async () => (await page.getByText('Win added to Grow through referrals and your Performance Evidence.').count()) > 0, 10000)));
  }
  await next();
  await body().locator('textarea').first().fill('Leave time between calls.');
  await next();
  pass(`${tag}: Strategies`, (await heading()) === 'Which Strategies moved today?', await heading());
  await page.getByRole('button', { name: 'Grow through referrals' }).click();
  await page.getByRole('radiogroup', { name: 'How much did “Grow through referrals” move?' }).getByRole('radio', { name: 'High' }).click();
  await next();
  pass(`${tag}: Tomorrow`, (await heading()) === 'What are the most important things to do tomorrow?', await heading());
  for (let n = 0; n < tomorrow.length; n += 1) {
    if (n) await page.getByRole('button', { name: 'Add another' }).click();
    await page.getByRole('textbox', { name: `Important thing ${n + 1} for tomorrow` }).fill(tomorrow[n]);
  }
  await next();
  pass(`${tag}: the summary`, /^Here’s your day, \S+\.$/.test(await heading()), await heading());
  const summary = await page.locator('.ds-guide-summary').innerText();
  pass(`${tag}: the summary counts the ticks`, summary.includes(`${ticks.length} of ${ticks.length} done`), summary.slice(0, 200));
  await shot(`${day}-review-summary`);
  await finishWith('Finish my review');
  const row = await until(async () => {
    const r = (await db.from('day_reviews').select('*').eq('user_id', me).eq('local_date', day)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass(`${tag}: saved as finished, with tomorrow's list`, Boolean(row) && JSON.stringify(row.tomorrow || []) === JSON.stringify(tomorrow) && row.way_of_being_rating === 7, JSON.stringify(row?.tomorrow));
  for (const [name, value] of Object.entries(typed)) {
    pass(`${tag}: ${name} logged in the sprint`, Number(await logOf(name, day)) === value, `${await logOf(name, day)} vs ${value}`);
  }
  return row;
}

try {
  // ---------------------------------------------------------- 1 and 2: Monday
  const trainBefore = Number(await logOf('Training sessions', MONDAY) || 0);
  const scoreMorning = sprintPageView(await rowsNow(), { today: MONDAY }).soFar;
  const plan1 = await planDay(MONDAY, 0, { picks: ['Draft the Harbour case study', 'Training sessions'], panel: true });
  const planTodos = (await db.from('day_plan_todos').select('todo_id, is_top').eq('day_plan_id', plan1.id)).data;
  pass('Monday plan: its to-dos are saved on the day', planTodos.length >= 1, JSON.stringify(planTodos));
  const added = (await db.from('todos').select('sprint_id, planned_week, source, source_id').eq('user_id', me).eq('text', PANEL_TODO)).data?.[0];
  pass('Monday plan: the to-do added in the panel is in week 4 of the sprint', added?.sprint_id === sprint.id && added.planned_week === WEEK && added.source === 'plan_my_day' && added.source_id === plan1.id, JSON.stringify(added));
  await page.waitForSelector('.ds-todos', { timeout: 30000 });
  const listed = await until(async () => {
    const t = await page.locator('.ds-todos').first().innerText();
    return t.includes(PANEL_TODO) && t.includes('Draft the Harbour case study') ? t : null;
  }, 15000);
  pass('Monday plan: the to-dos show on /performance-sprint', Boolean(listed));
  await sprintScoreMatches(MONDAY, 'Monday plan');
  await shot('monday-sprint-after-plan');

  await reviewDay(MONDAY, 0, { ticks: ['Draft the Harbour case study', 'Training sessions', PANEL_TODO], win: true, tomorrow: THINGS });
  pass('Monday review: a ticked count habit logs one more', Number(await logOf('Training sessions', MONDAY)) === trainBefore + 1, `${trainBefore} then ${await logOf('Training sessions', MONDAY)}`);
  const done = (await db.from('todos').select('text, done_on').eq('user_id', me).in('text', ['Draft the Harbour case study', PANEL_TODO])).data;
  pass('Monday review: the ticked to-dos are done on Monday', done.length === 2 && done.every((t) => t.done_on === MONDAY), JSON.stringify(done));
  const win = (await db.from('wins').select('id, local_date').eq('user_id', me).eq('what', WIN)).data?.[0];
  const ev = win ? (await db.from('performance_evidence').select('kind, text, local_date, deleted_at').eq('win_id', win.id)).data : [];
  pass('Monday review: the unplanned win is in Performance Evidence', ev.length === 1 && ev[0].kind === 'win' && ev[0].local_date === MONDAY && !ev[0].deleted_at, JSON.stringify(ev));
  const evening = await sprintScoreMatches(MONDAY, 'Monday review');
  pass('Monday review: the score moved from the morning\'s', evening.soFar.value !== scoreMorning.value, `${scoreMorning.value} then ${evening.soFar.value}`);
  pass('Monday review: the sprint shows the win', (await page.locator('main, .ui-root').first().innerText()).includes(WIN));

  // ---------------------------------------------------------- 3 and 4: Tuesday to Friday
  let lastNight = THINGS;
  for (let i = 1; i < 5; i += 1) {
    const day = WEEKDAYS[i];
    const plan = await planDay(day, i, { picks: lastNight, lastNight });
    const made = (await db.from('todos').select('text, sprint_id, planned_week, source').eq('user_id', me).in('text', lastNight)).data;
    pass(`${day}: last night's things became this week's to-dos`, made.length === lastNight.length && made.every((t) => t.sprint_id === sprint.id && t.planned_week === WEEK && t.source === 'review_my_day'), JSON.stringify(made));
    const dpt = (await db.from('day_plan_todos').select('todo_id').eq('day_plan_id', plan.id)).data;
    pass(`${day}: the plan holds them`, dpt.length === lastNight.length, JSON.stringify(dpt));
    if (i === 1) {
      await page.waitForSelector('.ds-todos', { timeout: 30000 });
      const t = await until(async () => {
        const s = await page.locator('.ds-todos').first().innerText();
        return THINGS.every((x) => s.includes(x)) ? s : null;
      }, 15000);
      pass('Tuesday: last night\'s things show on /performance-sprint', Boolean(t));
    }
    const tomorrow = i < 4 ? [dayThing(i)] : [];
    await reviewDay(day, i, { ticks: lastNight, tomorrow });
    lastNight = tomorrow;
  }
  await sprintScoreMatches(WEEKDAYS[4], 'Friday review');
  await shot('friday-sprint');

  // ---------------------------------------------------------- 5: the debrief, Monday 26 Oct
  await at(NEXT_MONDAY, '08:30');
  await page.goto(`${APP}/performance-sprint`);
  pass('Monday 26: the sprint page says the debrief is ready', Boolean(await until(async () => (await page.getByText('Your weekly debrief is ready.').count()) === 1, 20000)));
  await page.getByRole('button', { name: 'Start my debrief' }).click();
  await page.waitForSelector('.ds-guide-question', { timeout: 30000 });
  pass('debrief: opens on week 4', (await heading()) === `How did week ${WEEK} go?`, await heading());
  const steps = page.getByRole('textbox', { name: `Steps, Monday ${Number(MONDAY.slice(8))} Oct` });
  pass('debrief: Monday\'s steps from the review are there', (await steps.count()) === 1 && (await steps.inputValue()) === '9000', (await steps.count()) ? await steps.inputValue() : 'no box');
  await next();
  await page.getByRole('radio', { name: 'A little', exact: true }).click();
  await next();
  pass('debrief: Objectives', (await heading()) === 'Where are your Outcome Objectives now?', await heading());
  const clients = page.getByRole('textbox', { name: 'Coaching clients now' });
  pass('debrief: the box starts on last week\'s figure', (await clients.inputValue()) === '31', await clients.inputValue());
  await clients.fill('33');
  await until(async () => (await page.locator('.ds-objfig', { hasText: 'Coaching clients' }).locator('.ds-objfig-change').count()) === 1, 4000);
  await next();
  pass('debrief: Your days counts the five reviews', (await page.getByText('5 Review my day entries this week').count()) === 1);
  await body().locator('textarea').last().fill(DEBRIEF.well);
  await next();
  await body().locator('textarea').first().fill(DEBRIEF.way);
  await next();
  await body().locator('textarea').first().fill(DEBRIEF.adjust);
  await next();
  pass('debrief: Next week', (await heading()) === 'What’s planned for next week?', await heading());
  await page.getByRole('button', { name: 'Add a to-do' }).click();
  const panel = page.getByRole('dialog', { name: 'Add a to-do' });
  await panel.locator('textarea').first().waitFor();
  await panel.locator('textarea').first().fill(NEXT_TODO);
  await panel.getByRole('radio', { name: 'Grow through referrals' }).click();
  await panel.getByRole('button', { name: 'Add my to-do' }).click();
  pass('debrief: the to-do goes to week 5', Boolean(await until(async () => (await page.getByText('Added to week 5.').count()) > 0, 8000)));
  await next();
  pass('debrief: the summary', /^(Here’s your week, \S+\.|Great week, \S+! You smashed your standard\.)$/.test(await heading()), await heading());
  const streakLine = await page.locator('.ds-stat', { hasText: 'Debrief streak' }).innerText();
  pass('debrief: the streak counts four weeks', streakLine.includes('You’ve debriefed 4 weeks in a row, including this one.'), streakLine);
  const summaryScore = (await page.locator('.ds-stat', { hasText: 'performance score' }).locator('.ds-stat-value').textContent()).trim();
  pass('debrief: no coach, so no share switch', (await page.getByRole('switch').count()) === 0);
  await shot('debrief-summary');
  await finishWith('Finish my debrief');
  pass('debrief: Finish says so', Boolean(await until(async () => (await page.getByText(/^Week 4 debriefed at \d+%\.$/).count()) > 0, 8000)));

  const deb = await until(async () => {
    const r = (await db.from('weekly_debriefs').select('*').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data?.[0];
    return r?.status === 'finished' ? r : null;
  });
  pass('debrief: saved, finished, with its answers', deb?.went_well === DEBRIEF.well && deb.got_in_way === DEBRIEF.way && deb.adjust === DEBRIEF.adjust && deb.stress === 'a_little', JSON.stringify(deb));
  const ws = await until(async () => {
    const r = (await db.from('week_scores').select('score, final').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data?.[0];
    return r?.final ? r : null;
  }, 10000);
  const rows = await rowsNow();
  const raw = sprintPageView(rows, { today: NEXT_MONDAY }).weeks[WEEK - 1].raw;
  pass('debrief: week 4 is final in week_scores', ws?.final === true, JSON.stringify(ws));
  pass('debrief: week_scores equals src/lib/scores', ws && Math.abs(Number(ws.score) - raw) < 0.01, `${ws?.score} vs ${raw}`);
  pass('debrief: the summary showed the same score', summaryScore === `${m0Round(raw)}%`, `${summaryScore} vs ${m0Round(raw)}%`);
  const fig = (await db.from('objective_figures').select('value, recorded_on, sprint_week').eq('objective_id', oid('Coaching clients')).eq('sprint_id', sprint.id)).data;
  pass('debrief: the figure is saved for week 4, on its last day', fig.length === 1 && Number(fig[0].value) === 33 && fig[0].recorded_on === SUNDAY && fig[0].sprint_week === WEEK, JSON.stringify(fig));
  const nt = (await db.from('todos').select('sprint_id, planned_week, source').eq('user_id', me).eq('text', NEXT_TODO)).data;
  pass('debrief: next week\'s to-do is in the sprint, week 5', nt.length === 1 && nt[0].sprint_id === sprint.id && nt[0].planned_week === 5 && nt[0].source === 'debrief', JSON.stringify(nt));

  // ---------------------------------------------------------- 6: sharing, with no coach
  pass('sharing: the row stores shared_with_coach, off', deb?.shared_with_coach === false);
  const ownOnly = debriefReads.filter((u) => /stress|select=\*/.test(u));
  pass('sharing: every read that asks for stress is the person\'s own', ownOnly.length > 0 && ownOnly.every((u) => u.includes(`user_id=eq.${me}`) || u.includes(`sprint_id=eq.${sprint.id}`)), ownOnly.join(' | '));
  pass('sharing: week_scores holds no stress', !JSON.stringify((await db.from('week_scores').select('*').eq('sprint_id', sprint.id).eq('sprint_week', WEEK)).data).includes('stress'));

  // ---------------------------------------------------------- 7: the pages show the new week
  const v5 = await sprintScoreMatches(NEXT_MONDAY, 'Monday 26 sprint page');
  pass('sprint page: week 5 now', v5.week?.number === 5, JSON.stringify(v5.week));
  const list5 = await until(async () => (await page.locator('.ds-todos').first().innerText()).includes(NEXT_TODO), 10000);
  pass('sprint page: the debrief\'s to-do is on week 5\'s list', Boolean(list5));
  pass('sprint page: the debrief line has gone', (await page.getByText('Your weekly debrief is ready.').count()) === 0);
  await shot('next-monday-sprint');

  await page.goto(`${APP}/performance-sprint/year`);
  await page.waitForSelector('.ds-ychart-col', { timeout: 30000 });
  const yv = yearView(await rowsNow(), { today: NEXT_MONDAY });
  const slot = yv.slots.find((s) => s.kind === 'sprint' && s.sprintWeek === WEEK && s.sprintName && s.score != null && s.state !== 'now');
  const label = slot ? await page.locator(`.ds-ychart-col[data-week="${slot.week}"]`).getAttribute('aria-label') : null;
  pass('View your year: week 4 shows its final score', Boolean(slot) && label?.startsWith(`Performance score ${m0Round(raw)}%`), `${label} vs ${m0Round(raw)}%`);
  const nowSlot = yv.slots.find((s) => s.state === 'now');
  pass('View your year: week 5 is this week', nowSlot?.sprintWeek === 5, JSON.stringify(nowSlot?.tip));
  await shot('next-monday-year');

  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.plan-page, main', { timeout: 30000 });
  const planText = await until(async () => {
    const t = await page.locator('.ui-root').first().innerText();
    return t.includes('Coaching clients') ? t : null;
  }, 20000);
  const near = planText ? planText.slice(planText.indexOf('Coaching clients'), planText.indexOf('Coaching clients') + 160) : '';
  pass('plan page: Coaching clients shows the debrief\'s 33', /\b33 ?of 40\b/.test(near), near.replace(/\n/g, ' | '));
  await shot('next-monday-plan');

  // ---------------------------------------------------------- 8: the redirects
  await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-tiles', { timeout: 30000 });
  await page.evaluate(() => {
    window.history.pushState({ usr: { reviewType: 'weekly-momentum' }, key: `t${Date.now()}`, idx: (window.history.state?.idx ?? 0) + 1 }, '', '/my-journal');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  pass('a new Weekly momentum review opens the debrief', Boolean(await until(async () => new URL(page.url()).pathname === '/performance-sprint/debrief', 10000)), page.url());
  await page.goto(`${APP}/personal-operating-plan-review`);
  pass('/personal-operating-plan-review opens the end-of-sprint review', Boolean(await until(async () => new URL(page.url()).pathname === '/performance-sprint/review', 10000)), page.url());
  const old = await db.from('journal_entries').insert({
    user_id: me, review_type: 'weekly-momentum', entry_date: '2026-09-25', title: OLD_WEEKLY, status: 'final',
    content: JSON.stringify({ q1: 'An old answer that still opens.', q2: '', q3: '', momentum: 4, reviewType: 'weekly-momentum' }),
    created_at: '2026-09-25T17:00:00Z', updated_at: '2026-09-25T17:00:00Z',
  }).select('id').single();
  if (old.error) throw old.error;
  await page.goto(`${APP}/my-reviews`);
  const oldRow = page.locator('.hlist-row', { has: page.locator('.hlist-row-title', { hasText: OLD_WEEKLY }) });
  await oldRow.waitFor({ timeout: 30000 });
  await oldRow.locator('.hlist-row-main').click();
  pass('an old weekly check-in still opens', Boolean(await until(async () => new URL(page.url()).pathname === '/review-summary' && (await page.locator('.ui-root').first().innerText()).includes('An old answer that still opens.'), 15000)), page.url());
} catch (e) {
  pass('the journeys finished', false, e.message);
  await shot('error');
}

pass('the app read weekly_debriefs', debriefReads.length > 0);
await context.close();
await browser.close();
await tidy();
seedForReal('--reset');

console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
