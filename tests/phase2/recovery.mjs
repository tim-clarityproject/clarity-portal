// Phase 2 step 7 checks in the running app: Recovery, started any time
// (M15), signed in as the invented test client on the TEST database only
// (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/recovery.mjs [folder for screenshots]
//
//  1. From the sprint page: "Take a recovery week", the day counter (1 to
//     30, 1 week suggested, the end date following it), no "Let [coach]
//     know" for someone without a coach, Start my recovery (one open row).
//  2. The recovery day: the banner, the daily question saved and kept
//     after a refresh, Sleep saved to today's day plan, Breathe.
//  3. The sprint paused: the paused dial (no mint, no grey), where it
//     paused, when it picks up and the end moved later, all equal to
//     src/lib/performance on the database rows; "Show my results" for that
//     visit only, on the sprint, the plan and the year.
//  4. Across a week boundary: a Recovery from the last day of week 2
//     ended early with "I'm ready to go again": Welcome back, week 2
//     carries on today, and the end moves later by the days taken.
//  5. The chosen end passed: the end check-in shows; a few more days are
//     counted from today; Add a few more days; Pick up my sprint.
//  6. From a finished review ("Recovery first"), with no sprint running;
//     then Start a sprint ends the Recovery first.
//  Every date is FIXED (Tim, 29 Oct): the seed builds the plan around one
//  day (--today) and every browser's clock is set to noon on that day
//  (Playwright's clock), so nothing depends on the day the test runs.
//  RECOVERY_TODAY=YYYY-MM-DD picks another day (to prove any weekday works).
//  Every screen at 1280px, 700px, 390px and 360px, dark and light: no
//  sideways scroll, at most one coral button, 44px tap areas, no coral in
//  the dial. Ends with the usual seeded plan and running sprint, and no
//  open Recovery (--reset).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { dayName, recoveryEndOn, sprintPause, sprintStanding } from '../../src/lib/performance/index.js';
import { addDays } from '../../src/lib/scores/dates.js';

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

// The fixed day: a Wednesday unless RECOVERY_TODAY says otherwise.
const today = process.env.RECOVERY_TODAY || '2026-10-21';
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('RECOVERY_TODAY needs YYYY-MM-DD.');
const weekday = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
// Noon in London on that day (11:00 or 12:00 UTC), far from midnight.
const CLOCK = new Date(`${today}T11:30:00Z`);
const seed = (...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags, `--today=${today}`], { stdio: 'pipe' }).toString().trim();
// The last seed puts the test client back on the real today.
const seedForReal = (...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags], { stdio: 'pipe' }).toString().trim();
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
const WIDTHS = [1280, 700, 390, 360];

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
  // Every page in the context sees the fixed day; time still moves on
  // from there, so timers and save delays behave as usual.
  await context.clock.install({ time: CLOCK });
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
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || '').replace(/\s+/g, ' ').trim();
async function go(page, path, sel) {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.waitForTimeout(900);
}

async function layoutChecks(page, tag, mode) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const r = await page.evaluate(({ coral }) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const root = document.querySelector('.plan-page');
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis);
    const small = [];
    for (const el of root.querySelectorAll('button, a, input, textarea, [role=radio], [role=checkbox]')) {
      if (!vis(el) || el.disabled) continue;
      const b = el.getBoundingClientRect();
      // A tap area stretched by ::after (tiles, links in shared parts) counts.
      const after = getComputedStyle(el, '::after');
      const stretched = after.content !== 'none' && after.position === 'absolute' && (parseFloat(after.height) || 0) >= 44;
      if ((b.height >= 43.5 && b.width >= 43.5) || stretched) continue;
      small.push(`${String(el.className || el.tagName).slice(0, 40)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      primaries: primaries.length,
      primaryCoral: primaries.every((b) => coral.includes(getComputedStyle(b).backgroundColor)),
      small,
      coral: [...document.querySelectorAll('.ds-sdial path')].filter((el) => coral.includes(getComputedStyle(el).fill) || coral.includes(getComputedStyle(el).stroke)).length,
      bg: getComputedStyle(document.querySelector('.ui-root')).backgroundColor,
    };
  }, { coral: CORAL });
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: at most one coral button`, r.primaries <= 1 && r.primaryCoral, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in the dial`, r.coral === 0);
  pass(`${tag}: the ${mode} colours`, mode === 'dark' ? r.bg === 'rgb(0, 0, 0)' : r.bg !== 'rgb(0, 0, 0)', r.bg);
}

/** Every width and mode for one screen, opened by `open(page)`. */
async function everyLayout(name, open) {
  for (const mode of ['dark', 'light']) {
    for (const width of WIDTHS) {
      const { context, page } = await signedIn({ width, mode });
      await open(page);
      await layoutChecks(page, `${width}px ${mode} ${name}`, mode);
      if (width === 1280 || width === 390) await shot(page, `${name}-${width}-${mode}`);
      await context.close();
    }
  }
}

const rowsNow = async () => {
  const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')).data[0] || null;
  const recoveries = (await db.from('recovery_periods').select('*').eq('user_id', me).order('start_on')).data || [];
  return { sprint, recoveries, open: recoveries.find((r) => !r.ended_at) || null };
};
const plain = (s) => s.replace(/’/g, "'");

// ---------------------------------------------------------------- 1. from the sprint page
seed('--reset');
await everyLayout('start', async (page) => go(page, '/recovery', '.rec-question'));
await everyLayout('running-with-link', async (page) => go(page, '/performance-sprint', '.sprint-recovery'));
{
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await go(page, '/performance-sprint', '.sprint-hero');
  const link = page.getByRole('button', { name: 'Take a recovery week' });
  pass('the sprint page has Take a recovery week beside the dial', await link.count() === 1);
  await link.click();
  await page.waitForSelector('.rec-question', { timeout: 15000 });
  pass('it opens /recovery', page.url().endsWith('/recovery'));
  pass('the question', (await text(page, '.rec-question')) === 'How long would you like to recover for?');
  pass('1 week, suggested', (await text(page, '.ds-daycount-value')) === '1 weeksuggested', await text(page, '.ds-daycount-value'));
  pass('the end date follows', plain(await text(page, '.rec-note')) === `Your recovery ends on ${dayName(addDays(today, 7), today)}.`);
  const plus = page.getByRole('button', { name: 'One day more' });
  const minus = page.getByRole('button', { name: 'One day fewer' });
  const before = await page.locator('.rec-note').boundingBox();
  await plus.click();
  await plus.click();
  pass('two more: 9 days', (await text(page, '.ds-daycount-value span')) === '9 days');
  pass('... ending 9 days on', plain(await text(page, '.rec-note')) === `Your recovery ends on ${dayName(addDays(today, 9), today)}.`);
  const after = await page.locator('.rec-note').boundingBox();
  pass('nothing moves when the days change', Math.abs(before.y - after.y) < 0.5 && Math.abs(before.x - after.x) < 0.5);
  for (let i = 0; i < 40; i += 1) await plus.click({ force: true });
  pass('the top is 30 days', (await text(page, '.ds-daycount-value span')) === '30 days');
  pass('... plus stops there', (await plus.getAttribute('aria-disabled')) === 'true');
  for (let i = 0; i < 40; i += 1) await minus.click({ force: true });
  pass('the bottom is 1 day', (await text(page, '.ds-daycount-value span')) === '1 day');
  for (let i = 0; i < 6; i += 1) await plus.click();
  pass('the panel says what changes', (await text(page, '.rec-box')).includes('Your sprint pauses, and picks up where it left off when you’re back.'));
  pass('no coach: no Let [coach] know line', await page.locator('.rec-tick').count() === 0);
  await shot(page, 'start-1280-dark');
  await page.getByRole('button', { name: 'Start my recovery' }).dblclick();
  pass('Start my recovery opens the recovery day', Boolean(await until(async () => page.url().endsWith('/recovery/today'), 15000)), page.url());
  const r = await rowsNow();
  const opened = r.recoveries.filter((x) => !x.ended_at);
  pass('one open Recovery, even after a double tap', opened.length === 1, `${opened.length}`);
  pass('... from today for 1 week, for the running sprint', opened[0]?.start_on === today && opened[0]?.chosen_days === 7 && opened[0]?.sprint_id === r.sprint?.id);
  pass('... not told to a coach (there is none)', opened[0]?.let_coach_know === false);
  await context.close();
}

// ---------------------------------------------------------------- 2. the recovery day
{
  const { context, page } = await signedIn({ width: 390, mode: 'light' });
  await go(page, '/recovery/today', '.rec-banner');
  const r = await rowsNow();
  pass('Good morning-style greeting with the first name', /^Good (morning|afternoon|evening)/i.test(await text(page, 'h1')), await text(page, 'h1'));
  pass('the banner says until when', plain(await text(page, '.ds-rec-banner-lead')) === `You're in recovery until ${dayName(recoveryEndOn(r.open), today)}.`);
  pass('... and the days left', (await text(page, '.ds-rec-banner-left')) === '7 days left.');
  pass('the daily question', (await text(page, '.rec-qh')) === 'What would help you recharge today?');
  pass('it is Only you', (await text(page, '.rec-qfoot .ds-who')).includes('Only you'));
  pass('... and optional', (await text(page, '.rec-hint')) === 'This is optional, like everything here.');
  await page.locator('.rec-q textarea').first().fill('A long walk by the river, no phone');
  const saved = await until(async () => (await db.from('recovery_recharge_answers').select('*').eq('user_id', me)).data?.[0], 15000);
  pass('the answer is saved', saved?.answer === 'A long walk by the river, no phone' && saved?.local_date === today && saved?.shared === false);
  await page.reload();
  await page.waitForSelector('.rec-banner');
  await page.waitForTimeout(1200);
  pass('... and kept after a refresh', (await page.locator('.rec-q textarea').first().inputValue()) === 'A long walk by the river, no phone');
  await page.getByRole('button', { name: /^Sleep/ }).click();
  await page.waitForSelector('.rec-sleep');
  await page.getByLabel('Total hours').fill('7.5');
  await page.getByRole('radio', { name: 'Good', exact: true }).click();
  await layoutChecks(page, '390px light sleep panel', 'light');
  await page.getByRole('button', { name: 'Save my sleep' }).click();
  const plan = await until(async () => (await db.from('day_plans').select('*').eq('user_id', me).eq('local_date', today)).data?.[0], 10000);
  pass('Sleep is saved to today\'s day plan', Number(plan?.sleep_hours) === 7.5 && plan?.sleep_quality === 'good');
  await page.getByRole('button', { name: /^Breathe/ }).first().click();
  pass('Breathe opens Breathe', Boolean(await until(async () => page.url().endsWith('/breathe'), 10000)));
  await context.close();
}
await everyLayout('today', async (page) => go(page, '/recovery/today', '.rec-banner'));

// ---------------------------------------------------------------- 3. the sprint paused, and results for this visit
{
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await go(page, '/performance-sprint', '.ds-sdial--paused');
  const r = await rowsNow();
  const p = sprintPause(r.sprint, r.recoveries, today);
  const lines = plain(await text(page, '.rec-sprint-lines'));
  pass('paused at its week', lines.includes(`Sprint ${r.sprint.number} is paused at week ${p.week} of ${r.sprint.length_weeks}.`), lines);
  pass('... picks up when the Recovery ends', lines.includes(`It picks up on ${dayName(p.picksUpOn, today)}.`));
  pass('... and ends later by the days taken', lines.includes(`It now ends on ${dayName(p.endOn, today)} instead of ${dayName(p.endBefore, today)}.`) && p.endOn === addDays(p.endBefore, 7));
  pass('the dial says Week n of 8 and Paused', (await text(page, '.ds-sdial-centre')).toLowerCase().includes('paused'));
  pass('scores hidden: no mint and no grey weeks', await page.locator('.ds-sdial-seg--good, .ds-sdial-seg--below').count() === 0);
  pass('the paused week is drawn in dashes', await page.locator('.ds-sdial-paused').count() === 1);
  await page.getByRole('button', { name: 'Show my results' }).click();
  const goods = await page.locator('.ds-sdial-seg--good').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
  pass('Show my results: weeks at the standard are mint', goods.length > 0 && goods.every((f) => f === MINT.dark), goods.join(','));
  pass('... with the average and the standard', /Your average performance score so far is \d+%\./.test(await text(page, '.rec-results')) && (await text(page, '.rec-results')).includes(`Your standard is ${r.sprint.standard}%.`));
  await shot(page, 'paused-results-1280-dark');
  await page.reload();
  await page.waitForSelector('.ds-sdial--paused');
  await page.waitForTimeout(900);
  pass('... for this visit only: hidden again on the next', await page.locator('.ds-sdial-seg--good, .ds-sdial-seg--below').count() === 0);

  await go(page, '/performance-plan', '.ds-rec-notice');
  pass('the plan says you’re in recovery', plain(await text(page, '.ds-rec-notice')).includes(`You're in recovery until ${dayName(recoveryEndOn(r.open), today)}.`));
  const hidden = await page.locator('.ds-stile-figure').count();
  await page.getByRole('button', { name: 'Show my results' }).click();
  await page.waitForTimeout(400);
  pass('the plan hides tile scores until Show my results', hidden === 0 && await page.locator('.ds-stile-figure').count() > 0, `${hidden}`);

  await go(page, '/performance-sprint/year', '.ds-rec-notice');
  const barsBefore = await page.locator('.ds-ychart-bar--good, .ds-ychart-bar--below').count();
  await page.getByRole('button', { name: 'Show my results' }).click();
  await page.waitForTimeout(400);
  pass('the year hides scores until Show my results', barsBefore === 0 && await page.locator('.ds-ychart-bar--good, .ds-ychart-bar--below').count() > 0, `${barsBefore}`);
  await context.close();
}
await everyLayout('paused', async (page) => go(page, '/performance-sprint', '.ds-sdial--paused'));
await everyLayout('plan-in-recovery', async (page) => go(page, '/performance-plan', '.ds-rec-notice'));

// ---------------------------------------------------------------- 4. across a week boundary, ended early
// The seeded sprint started on the Monday 3 weeks before this week's; a
// Recovery from the last day of week 2 (the Sunday 8 days before this
// Monday, so 10 days ago on a Wednesday) for 4 days past today crosses
// one or two Mondays, whatever the weekday.
const taken = weekday(today) + 8;
seed('--reset', `--recovery=${taken},${taken + 4}`);
{
  const { context, page } = await signedIn({ width: 390, mode: 'dark' });
  await go(page, '/performance-sprint', '.ds-sdial--paused');
  let r = await rowsNow();
  const p = sprintPause(r.sprint, r.recoveries, today);
  pass('a Recovery from the last day of week 2 pauses at week 2', p.week === 2 && plain(await text(page, '.rec-sprint-lines')).includes(`paused at week 2 of ${r.sprint.length_weeks}`));
  pass('... not due yet: no check-in', page.url().endsWith('/performance-sprint'));
  await page.getByRole('button', { name: 'I’m ready to go again' }).click();
  await page.waitForSelector('.rec-welcome', { timeout: 15000 });
  r = await rowsNow();
  const ended = r.recoveries[r.recoveries.length - 1];
  pass('I’m ready to go again ends it today', Boolean(ended.ended_at) && ended.end_on === today);
  const s = sprintStanding(r.sprint, r.recoveries, today);
  pass('Welcome back, with the first name', /^Welcome back/i.test(await text(page, 'h1')), await text(page, 'h1'));
  pass('Let’s start with this week.', (await text(page, '.rec-welcome')) === 'Let’s start with this week.');
  const w = plain(await text(page, '.rec-sprint-lines'));
  pass('week 2 carries on today', w.includes(`Sprint ${r.sprint.number} picks up today, at week 2 of ${r.sprint.length_weeks}.`), w);
  const planned = addDays(r.sprint.start_on, r.sprint.length_weeks * 7 - 1);
  pass(`... and the end has moved later by the ${taken} days taken`, s.endOn === addDays(planned, taken) && w.includes(`It ends on ${dayName(s.endOn, today)}.`), `${s.endOn}`);
  pass('Log today is the one coral button, with Plan my day', (await text(page, '.sprint-welcome-actions')).toLowerCase().includes('plan my day'));
  await shot(page, 'welcome-390-dark');
  await context.close();
}
await everyLayout('welcome', async (page) => go(page, '/performance-sprint', '.rec-welcome'));

// ---------------------------------------------------------------- 5. the chosen end passed
seed('--reset', '--recovery=10,7');
await everyLayout('check-in', async (page) => {
  await go(page, '/recovery/check-in', '.rec-question');
  await page.getByRole('radio', { name: 'A few more days' }).click();
  await page.waitForTimeout(300);
});
{
  const { context, page } = await signedIn({ width: 700, mode: 'light' });
  await page.goto(`${APP}/performance-sprint`);
  pass('the chosen end has passed: the sprint page shows the end check-in', Boolean(await until(async () => page.url().endsWith('/recovery/check-in'), 20000)), page.url());
  await page.waitForSelector('.rec-question');
  pass('How are you feeling?', (await text(page, '.rec-question')) === 'How are you feeling?');
  await layoutChecks(page, '700px light check-in', 'light');
  await page.getByRole('radio', { name: 'A few more days' }).click();
  pass('3 more days to start, counted from today', plain(await text(page, '.rec-note')) === `Your recovery would now end on ${dayName(addDays(today, 3), today)}.`);
  await page.getByRole('button', { name: 'Add the days' }).click();
  await page.waitForSelector('.rec-banner', { timeout: 15000 });
  let r = await rowsNow();
  pass('... it now ends 3 days from today', recoveryEndOn(r.open) === addDays(today, 3), `${recoveryEndOn(r.open)}`);
  pass('... and the day says 3 days left', (await text(page, '.ds-rec-banner-left')) === '3 days left.');
  await page.getByRole('button', { name: 'Add a few more days' }).click();
  await page.waitForSelector('.rec-question');
  pass('Add a few more days asks How many more days?', (await text(page, '.rec-question')) === 'How many more days?');
  await layoutChecks(page, '700px light add days', 'light');
  await page.getByRole('button', { name: 'One day fewer' }).click();
  await page.getByRole('button', { name: 'One day fewer' }).click();
  await page.getByRole('button', { name: 'Add the days' }).click();
  await page.waitForSelector('.rec-banner', { timeout: 15000 });
  r = await rowsNow();
  pass('... 1 more day', recoveryEndOn(r.open) === addDays(today, 4), `${recoveryEndOn(r.open)}`);
  await go(page, '/recovery/check-in', '.rec-question');
  await page.getByRole('radio', { name: 'I’m ready to go again' }).click();
  await page.getByRole('button', { name: 'Pick up my sprint' }).click();
  await page.waitForSelector('.rec-welcome', { timeout: 15000 });
  r = await rowsNow();
  pass('Pick up my sprint ends it today and welcomes them back', !r.open && r.recoveries.some((x) => x.end_on === today));
  await context.close();
}

// ---------------------------------------------------------------- 6. from a finished review, then Start a sprint
seed('--ended');
{
  const { context, page } = await signedIn({ width: 390, mode: 'dark' });
  await go(page, '/performance-sprint/review', '.ds-guide');
  for (let i = 0; i < 5; i += 1) {
    await page.locator('.ds-guide .ds-btn--primary').last().click();
    await page.waitForTimeout(700);
  }
  await page.getByRole('radio', { name: 'Recovery first' }).click();
  await page.locator('.ds-guide .ds-btn--primary').last().click();
  await page.waitForSelector('.rec-question', { timeout: 20000 });
  pass('Recovery first opens Take a recovery week', page.url().endsWith('/recovery'));
  pass('... with no sprint running, it says the next one waits', (await text(page, '.rec-box')).includes('No sprint is running, so your next one waits until you’re back.'));
  await layoutChecks(page, '390px dark start after a review', 'dark');
  await page.getByRole('button', { name: 'Start my recovery' }).click();
  await page.waitForSelector('.rec-banner', { timeout: 15000 });
  let r = await rowsNow();
  pass('... a Recovery with no sprint', r.open && r.open.sprint_id === null && !r.sprint);
  await go(page, '/performance-sprint', '.rec-nosprint');
  pass('the sprint page says you’re in recovery with no sprint running', (await text(page, '.rec-nosprint')).includes('No sprint is running, so nothing is tracked.'));
  await layoutChecks(page, '390px dark no sprint in recovery', 'dark');
  // Start a sprint while it is open: it ends the Recovery first.
  await go(page, '/performance-sprint/start', '.ds-guide');
  const heading = () => page.locator('.ds-guide-question, .ds-guide-title').first().textContent();
  for (let i = 0; i < 6 && !/Performance Sprint 3/.test(await heading()); i += 1) {
    await page.locator('.ds-guide .ds-btn--primary').last().click();
    await page.waitForTimeout(700);
  }
  pass('Ready says starting ends the recovery', (await text(page, '.ds-guide')).includes('Starting it ends your recovery today.'));
  await page.getByRole('button', { name: 'Start Performance Sprint 3' }).click();
  await until(async () => page.url().endsWith('/performance-sprint'), 20000);
  r = await rowsNow();
  pass('Start a sprint ended the Recovery today', !r.open && r.recoveries.some((x) => x.end_on === today && x.sprint_id === null));
  pass('... and Performance Sprint 3 is running', r.sprint?.number === 3);
  await context.close();
}

// ---------------------------------------------------------------- gallery
{
  const { context, page } = await signedIn({ width: 1280, mode: 'light' });
  await page.goto(`${APP}/design-reference#c44`);
  await page.waitForSelector('#c44 .ds-daycount', { timeout: 20000 });
  pass('gallery: the day counter, the calm panels and the paused dial', await page.locator('#c44 .ds-rec-notice').count() >= 1 && await page.locator('#c40 .ds-sdial--paused').count() >= 1);
  await context.close();
}

await browser.close();
seedForReal('--reset');
const left = (await db.from('recovery_periods').select('id').eq('user_id', me).is('ended_at', null)).data || [];
pass('ends with the seeded plan and running sprint, and no open Recovery', left.length === 0);
console.log(`Fixed day: ${today} (${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday(today)]}).`);
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
