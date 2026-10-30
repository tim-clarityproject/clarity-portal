// Phase 2 step 4 checks in the running app: the Performance Sprint page
// (M1), signed in as the invented test client on the TEST database only
// (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/sprint-page.mjs [folder for screenshots]
//
// It puts back the seeded plan and its running Sprint 1 first
// (scripts/seed-test-plan.mjs --reset) and again at the end.
//
//  1. Layout at 1280px, 700px, 390px and 360px, dark and light, in the
//     day and week views: no sideways scroll, one coral button, 44px tap
//     areas, mint weeks at the standard and grey below, no coral in the
//     dial or bars.
//  2. The figures: the score so far and every finished week match
//     src/lib/scores (sprintPageView on the same rows), and the weeks the
//     page froze (freeze_week) match too.
//  3. Logging every way to measure, in the day view and the week view;
//     changing a log updates the same row (same id).
//  4. To-dos: tick, add, move, roll-over; a win reaches Performance Evidence.
//  5. Offline: a log waits on the device ("Will sync") and arrives when
//     the connection is back ("Saved").
//  Every date is FIXED (tests/phase2/fixed-day.mjs): the seed is built
//  around one day and every browser's clock starts on it, so nothing
//  depends on the day or time the test runs. TEST_TODAY and TEST_TIME pick
//  another day and time (to prove any weekday and the small hours work).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { sprintPageView } from '../../src/lib/performance/sprintPage.js';
import { addDays } from '../../src/lib/scores/dates.js';
import { FIXED_TODAY, DAY_NAMES, weekdayOf, seedFixed, seedForReal, fixClock, fixedLabel } from './fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
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

const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)'];
const MINT = { dark: 'rgb(95, 239, 187)', light: 'rgb(11, 122, 82)' };

async function signedIn({ width, mode }) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await fixClock(context);
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
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page, phone };
}

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
const openSprint = async (page) => {
  await page.goto(`${APP}/performance-sprint`);
  await page.waitForSelector('.ds-sdial--running', { timeout: 30000 });
  await page.waitForTimeout(800);
};

async function layoutChecks(page, tag, mode) {
  await page.mouse.move(0, 0);
  const r = await page.evaluate(({ coral, mint }) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const root = document.querySelector('.sprint-page');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [];
    for (const el of root.querySelectorAll('button, a, input, [role=radio], [role=checkbox]')) {
      if (!vis(el) || el.disabled) continue;
      const b = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const stretched = after.content !== 'none' && after.position === 'absolute' && (parseFloat(after.height) || 0) >= 44;
      if ((b.height >= 43.5 && b.width >= 43.5) || stretched) continue;
      // Day boxes in the week view may be 40px wide on a 360px phone with 7 days; 5 here.
      small.push(`${String(el.className || el.tagName).slice(0, 40)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const fills = (sel) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).fill);
    const coralMarks = [...document.querySelectorAll('.ds-sdial path, .ds-sdial circle, .ds-bar > span')]
      .filter((el) => coral.includes(getComputedStyle(el).fill) || coral.includes(getComputedStyle(el).backgroundColor)).length;
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      primaries: primaries.length,
      primaryCoral: primaries.every((b) => coral.includes(getComputedStyle(b).backgroundColor)),
      small,
      good: fills('.ds-sdial-seg--good'),
      below: fills('.ds-sdial-seg--below'),
      bars: [...document.querySelectorAll('.ds-log .ds-bar > span')].map((s) => getComputedStyle(s).backgroundColor),
      coralMarks,
      mint,
    };
  }, { coral: CORAL, mint: MINT[mode] });
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: one coral button`, r.primaries === 1 && r.primaryCoral, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: weeks at the standard are mint`, r.good.length > 0 && r.good.every((f) => f === MINT[mode]), r.good.join(','));
  pass(`${tag}: weeks below are grey, not coral or mint`, r.below.every((f) => !CORAL.includes(f) && f !== MINT[mode]), r.below.join(','));
  pass(`${tag}: logging bars are mint`, r.bars.length > 0 && r.bars.every((c) => c === MINT[mode]));
  pass(`${tag}: no coral in the dial or bars`, r.coralMarks === 0, `${r.coralMarks}`);
}

// ---------------------------------------------------------------- start
seedFixed('--reset');
const sprint = (await db.from('sprints').select('id, start_on, length_weeks, standard').eq('user_id', me).eq('status', 'running')).data[0];
const sh = (await db.from('sprint_habits').select('id, name').eq('sprint_id', sprint.id)).data;
const habitId = (name) => sh.find((h) => h.name === name).id;
const logOf = async (name, day = today) => (await db.from('habit_logs').select('id, value').eq('sprint_habit_id', habitId(name)).eq('local_date', day)).data[0] || null;

// 1. Layout, every width and mode, both views.
for (const width of [1280, 700, 390, 360]) {
  for (const mode of ['dark', 'light']) {
    const { context, page } = await signedIn({ width, mode });
    await openSprint(page);
    await layoutChecks(page, `${width}px ${mode} day view`, mode);
    await shot(page, `day-${width}-${mode}`);
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    await page.waitForTimeout(300);
    await layoutChecks(page, `${width}px ${mode} week view`, mode);
    await shot(page, `week-${width}-${mode}`);
    await context.close();
  }
}

// 2 to 5 on a laptop, dark.
const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
await openSprint(page);

// 2. Figures against the scoring library, from the same rows.
async function rowsNow() {
  const q = async (p) => (await p).data || [];
  const [objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns] = await Promise.all([
    q(db.from('outcome_objectives').select('id').eq('user_id', me).is('archived_at', null)),
    q(db.from('plan_strategies').select('id, name').eq('user_id', me).is('archived_at', null)),
    q(db.from('strategy_objectives').select('strategy_id, objective_id').eq('user_id', me)),
    q(db.from('sprint_habits').select('id, sprint_id, habit_id, strategy_id, name, sort_order').eq('sprint_id', sprint.id).order('sort_order')),
    q(db.from('week_scores').select('sprint_id, sprint_week, week_end, score, eligible, final').eq('user_id', me)),
    q(db.from('recovery_periods').select('*').eq('user_id', me)),
    q(db.from('working_patterns').select('starts_on, days').eq('user_id', me)),
  ]);
  const ids = sprintHabits.map((h) => h.id);
  const [sprintSettings, logs, todos, todoMoves, wins, winLinks] = await Promise.all([
    q(db.from('sprint_habit_settings').select('*').in('sprint_habit_id', ids)),
    q(db.from('habit_logs').select('id, sprint_habit_id, local_date, value, to_confirm').in('sprint_habit_id', ids)),
    q(db.from('todos').select('*').eq('user_id', me).eq('sprint_id', sprint.id).is('deleted_at', null)),
    q(db.from('todo_moves').select('*').eq('user_id', me)),
    q(db.from('wins').select('*').eq('user_id', me).is('deleted_at', null)),
    q(db.from('win_strategies').select('win_id, strategy_id').eq('user_id', me)),
  ]);
  const full = (await db.from('sprints').select('*').eq('id', sprint.id)).data[0];
  return { plan: { id: full.plan_id }, sprint: full, objectives, strategies, links, sprintHabits, weekScores, recoveries, workingPatterns, sprintSettings, logs, todos, todoMoves, wins, winLinks, debriefs: [], personSettings: { units: 'metric' } };
}
const centreScore = async () => (await page.locator('.ds-sdial-big--score').textContent()).trim();
{
  const v = sprintPageView(await rowsNow(), { today });
  pass('score so far matches src/lib/scores', (await centreScore()) === `${v.soFar.value}%`, `${await centreScore()} vs ${v.soFar.value}%`);
  const tips = await page.locator('.ds-sdial [data-tip]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  for (const w of v.weeks.filter((x) => x.finished)) {
    pass(`week ${w.number}'s pop-up says ${w.score}%`, tips.some((t) => t.startsWith(`Performance score ${w.score}%, Week ${w.number},`)), tips[w.number - 1]);
  }
  const frozen = await until(async () => {
    const ws = (await db.from('week_scores').select('sprint_week, score').eq('sprint_id', sprint.id)).data;
    return ws.length >= v.weeks.filter((x) => x.finished).length ? ws : null;
  });
  pass('the finished weeks were frozen for the coach', Boolean(frozen), JSON.stringify(frozen));
  for (const w of v.weeks.filter((x) => x.finished)) {
    const row = (frozen || []).find((f) => f.sprint_week === w.number);
    pass(`week ${w.number}: the database's frozen score matches the page`, row && Math.round(Number(row.score)) === w.score, `${row?.score} vs ${w.score}`);
  }
  const usual = await page.locator('.sprint-usual').textContent();
  pass('the usual range is a full sentence', /Your usual range appears after 6 weeks\.|Your usual range is \d+ to \d+%\./.test(usual), usual);
}

// 3. Logging every way to measure, today.
const row = (name) => page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: new RegExp(`^${name}$`) }) });
await row('Steps').locator('input').fill('9000');
await row('Water').locator('input').fill('1.5');
await row('Water').locator('input').blur();
await row('Training sessions').getByRole('button', { name: /One more/ }).click();
await row('Late finishes').getByRole('button', { name: 'Yes' }).click();
await row('Focus').getByRole('button', { name: '4', exact: true }).click();
await row('Weekly strategic block').getByRole('checkbox').click();
await row('No screens after 21:00').getByRole('button', { name: 'Yes' }).click();
await row('Coffees').getByRole('button', { name: /One more/ }).click();
await row('Coffees').getByRole('button', { name: /One more/ }).click();
await row('Reflective notes').getByRole('button', { name: /One more/ }).click();
await page.waitForTimeout(2500);
const expect = { Steps: 9000, Water: 1.5, 'Training sessions': 1, 'Late finishes': 1, Focus: 4, 'Weekly strategic block': 1, 'No screens after 21:00': 1, Coffees: 2, 'Reflective notes': 1 };
for (const [name, value] of Object.entries(expect)) {
  const got = await until(async () => { const l = await logOf(name); return l && Number(l.value) === value ? l : null; });
  pass(`day view: ${name} logged as ${value}`, Boolean(got), JSON.stringify(await logOf(name)));
}
pass('day view: Saved shows', await page.locator('.ds-status--saved').isVisible());
const before = await logOf('Steps');
await row('Steps').locator('input').fill('9500');
await row('Steps').locator('input').blur();
const after = await until(async () => { const l = await logOf('Steps'); return l && Number(l.value) === 9500 ? l : null; });
pass('changing a log updates the same row (same id)', after && after.id === before.id, `${before?.id} → ${after?.id}`);
await row('Late finishes').getByRole('button', { name: 'Yes' }).click();
pass('tapping Yes again clears the day', Boolean(await until(async () => !(await logOf('Late finishes')))));
await shot(page, 'logged-day');

// Week view.
await page.getByRole('button', { name: 'This week', exact: true }).click();
await page.waitForTimeout(400);
const monday = addDays(sprint.start_on, 21); // this week's Monday (week 4)
// An amount on a day already past or today: Tuesday, or Monday on a Monday.
const amountDay = weekdayOf(today) >= 1 ? addDays(monday, 1) : monday;
const monLog = await logOf('Steps', monday);
const wrow = (name) => page.locator('.sprint-habits > .ds-log').filter({ has: page.locator('.ds-log-name', { hasText: new RegExp(`^${name}$`) }) });
await wrow('Steps').getByRole('textbox', { name: /Monday/ }).fill('12000');
await wrow('Steps').getByRole('textbox', { name: /Monday/ }).blur();
const monAfter = await until(async () => { const l = await logOf('Steps', monday); return l && Number(l.value) === 12000 ? l : null; });
pass('week view: Monday changed in place (same id)', monAfter && monLog && monAfter.id === monLog.id, `${monLog?.id} → ${monAfter?.id}`);
const amountName = new RegExp(DAY_NAMES[weekdayOf(amountDay)]);
await wrow('Reading').getByRole('textbox', { name: amountName }).fill('1.5');
await wrow('Reading').getByRole('textbox', { name: amountName }).blur();
pass(`week view: an amount on ${DAY_NAMES[weekdayOf(amountDay)]}`, Boolean(await until(async () => Number((await logOf('Reading', amountDay))?.value) === 1.5)));
const screensMon = await logOf('No screens after 21:00', monday);
await wrow('No screens after 21:00').getByRole('button', { name: /Monday/ }).click();
pass('week view: a day Yes becomes No', Boolean(await until(async () => {
  const l = await logOf('No screens after 21:00', monday);
  return screensMon && Number(screensMon.value) === 1 ? l && Number(l.value) === 0 : l && Number(l.value) === 1;
})));
// Every day after today is greyed out and every day up to today open,
// whichever weekday the fixed day is (on a Friday or a weekend no later
// working day is shown, and the check says so).
{
  const boxes = await wrow('Steps').getByRole('textbox').evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label'), disabled: e.disabled })));
  const at = (label) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].findIndex((d) => label.includes(d));
  const later = boxes.filter((b) => at(b.label) > weekdayOf(today));
  const upToToday = boxes.filter((b) => at(b.label) <= weekdayOf(today));
  const expectLater = Math.max(0, 4 - weekdayOf(today)); // working days Monday to Friday
  pass(`week view: later days are greyed out (${later.length} later on a ${DAY_NAMES[weekdayOf(today)]})`,
    later.length === expectLater && later.every((b) => b.disabled) && upToToday.length > 0 && upToToday.every((b) => !b.disabled),
    JSON.stringify(boxes));
}
await wrow('Weekly strategic block').getByRole('checkbox').click();
pass('week view: the weekly tick comes off', Boolean(await until(async () => !(await logOf('Weekly strategic block')))));
await wrow('Weekly strategic block').getByRole('checkbox').click();
pass('week view: and back on', Boolean(await until(async () => Boolean(await logOf('Weekly strategic block')))));
await shot(page, 'logged-week');

// The habit panel: impact from next week.
await wrow('Steps').getByRole('button', { name: 'Steps: week, target and impact' }).click();
await page.waitForSelector('.ds-panel .sprint-habit-panel');
await page.locator('.ds-panel').getByRole('radio', { name: 'High' }).click();
const setting = await until(async () => (await db.from('sprint_habit_settings').select('from_week, impact').eq('sprint_habit_id', habitId('Steps')).eq('from_week', 5)).data[0]);
pass('habit panel: impact saved from next week', setting?.impact === 3, JSON.stringify(setting));
await shot(page, 'habit-panel');
await page.locator('.ds-panel').getByRole('button', { name: 'Done' }).click();
await page.waitForTimeout(500);

// 4. To-dos.
await page.getByRole('button', { name: 'Today', exact: true }).click();
const todoRow = (text) => page.locator('.ds-todo').filter({ hasText: text });
pass('roll-over: tagged with the week it came from', (await todoRow('Book a physio assessment').textContent()).includes('rolled over from week 3'));
await todoRow('Draft the Harbour case study').getByRole('checkbox').click();
const toastText = await page.locator('.ds-toast, [role=status]').filter({ hasText: /Done\./ }).first().textContent({ timeout: 5000 }).catch(() => '');
pass('tick: "Done. 2 of 4 this week."', toastText.includes('Done. 2 of 4 this week.'), toastText);
pass('tick: saved with today', Boolean(await until(async () => (await db.from('todos').select('done_on').eq('user_id', me).eq('text', 'Draft the Harbour case study')).data[0]?.done_on === today)));

await todoRow('Shortlist breathing sound loops').getByRole('button', { name: /Move/ }).click();
await page.waitForSelector('.ds-panel');
pass('move: says it won’t count this week', (await page.locator('.ds-panel').textContent()).includes('This week has started, so it won’t count as done in week 4.'));
await page.locator('.ds-panel').getByRole('radio', { name: /Week 6/ }).click();
const moved = await until(async () => (await db.from('todos').select('id, planned_week').eq('user_id', me).eq('text', 'Shortlist breathing sound loops')).data.find((t) => t.planned_week === 6));
const moves = moved ? (await db.from('todo_moves').select('to_week, moved_on').eq('todo_id', moved.id)).data : [];
pass('move: planned for week 6, with the move recorded', Boolean(moved) && moves.some((m) => m.to_week === 6 && m.moved_on === today), JSON.stringify(moves));
await page.waitForTimeout(500);
const movedRow = todoRow('Shortlist breathing sound loops').first();
pass('move: stays this week, tagged, its tick off', (await movedRow.textContent()).includes('moved to week 6') && await movedRow.getByRole('checkbox').isDisabled());

await page.getByRole('button', { name: 'Add a to-do' }).click();
await page.waitForSelector('.ds-panel textarea');
await page.locator('.ds-panel textarea').fill('Send the referral thank-you notes');
await page.locator('.ds-panel').getByRole('radio', { name: 'Grow through referrals' }).click();
await shot(page, 'add-todo');
await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
const added = await until(async () => (await db.from('todos').select('planned_week, sprint_id, impact').eq('user_id', me).eq('text', 'Send the referral thank-you notes')).data[0]);
pass('add a to-do: saved for this week', added?.planned_week === 4 && added?.sprint_id === sprint.id, JSON.stringify(added));

await page.getByRole('button', { name: 'Add an unplanned win' }).click();
await page.waitForSelector('.ds-panel textarea');
await page.locator('.ds-panel textarea').fill('A past client sent two introductions');
await page.locator('.ds-panel').getByRole('button', { name: 'Grow through referrals' }).click();
await shot(page, 'add-win');
await page.locator('.ds-panel').getByRole('button', { name: 'Add my win' }).click();
const win = await until(async () => (await db.from('wins').select('id, local_date').eq('user_id', me).eq('what', 'A past client sent two introductions')).data[0]);
const evidence = win ? (await db.from('performance_evidence').select('kind, text').eq('win_id', win.id)).data[0] : null;
pass('add a win: saved for today', win?.local_date === today, JSON.stringify(win));
pass('add a win: also in Performance Evidence', evidence?.kind === 'win' && evidence.text === 'A past client sent two introductions', JSON.stringify(evidence));
await page.waitForTimeout(600);
pass('add a win: listed with its tag', (await todoRow('A past client sent two introductions').textContent()).includes('Unplanned win'));

// 5. Offline and back.
await page.locator('.ds-toast').waitFor({ state: 'detached', timeout: 15000 }).catch(() => null); // let the toasts go
// Today's Steps as they stand (on a Monday the week view's Monday is today).
const stepsBefore = Number((await logOf('Steps'))?.value);
await context.setOffline(true);
await row('Steps').locator('input').fill('7777');
await row('Steps').locator('input').blur();
pass('offline: Will sync shows', await page.locator('.ds-status--sync').waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
pass('offline: nothing reached the database', Number((await logOf('Steps'))?.value) === stepsBefore, `${stepsBefore}`);
await context.setOffline(false);
pass('back online: the log arrives', Boolean(await until(async () => Number((await logOf('Steps'))?.value) === 7777, 20000)));
pass('back online: Saved shows', Boolean(await until(async () => page.locator('.ds-status--saved').isVisible(), 10000)));
await shot(page, 'after-sync');
{
  const v = sprintPageView(await rowsNow(), { today });
  pass('after everything: score so far still matches src/lib/scores', (await centreScore()) === `${v.soFar.value}%`, `${await centreScore()} vs ${v.soFar.value}%`);
}
await context.close();

// Gallery sections for the new parts.
{
  const { context: c2, page: p2 } = await signedIn({ width: 1280, mode: 'light' });
  await p2.goto(`${APP}/design-reference#c40`);
  await p2.waitForSelector('#c40 .ds-sdial--running', { timeout: 20000 });
  pass('gallery: the sprint dial, logging kinds and to-dos are shown', await p2.locator('#c41 .ds-log-press').count() > 0 && await p2.locator('#c42 .ds-todo').count() >= 4);
  if (out) await p2.locator('#c40').screenshot({ path: `${out}/gallery-c40.png` });
  await c2.close();
}

await browser.close();
seedForReal('--reset');
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
