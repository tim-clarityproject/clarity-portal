// Phase 4 step 2: Home as Today (mock-up M2) in the running app, signed in
// as the invented test client on the TEST database only (every other host
// and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/home.mjs [folder for screenshots]
//
// 1. The moments of the day on a mid-sprint day: morning (Plan my day),
//    midday (how today is going), 16:30 (still the afternoon: the review is
//    suggested from 17:00, as M2 and the decisions say), 17:30 (Review my
//    day), from 21:00 (Sleep wind down, and Not tonight), after midnight
//    (still the evening before) and 03:30 (nothing). One coral button.
// 2. The 21:00 offer in London and Los Angeles, each on its own clock.
// 3. States: debrief ready, coming back after a gap, the last week of the
//    sprint, Recovery, someone new without a coach, and a coaching client
//    before the first session.
// 4. Logging from Home shows on the sprint page, and the reverse.
// 5. Adding a to-do from Home: saved, and on the sprint page.
// 6. Two taps from Home: Log today, Plan my day, Review my day and Add a
//    to-do, on desktop and phone.
// 7. A half-finished Plan my day appears under "Carry on where you left off".
// 8. 360px: no sideways scrolling, and every tap area 44px or more.
// 9. Measured against M2 at desktop and phone, dark and light (the mock-up
//    opened from a copy, with the real fonts; nothing in it is run but its
//    own drawing). Known, approved differences are listed as NOTE.
//
// The clock is fixed (tests/phase2/fixed-day.mjs). The seed is built
// around the fixed day, changed only where a case needs it, and the test
// client is put back on the real today at the end (plan v3.2, Sprint 1).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-4');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(String(n));

if (FIXED_TODAY !== '2026-10-21') throw new Error('home.mjs is written around the default fixed day, Wed 21 Oct 2026.');

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

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return v;
}

// The instant a wall clock in `zone` shows a day and time.
function zoneInstant(zone, dayKey, time) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const want = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let t = want;
  for (let i = 0; i < 3; i += 1) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    t += want - shown;
  }
  return new Date(t);
}
const LONDON = 'Europe/London';
const LA = 'America/Los_Angeles';
const THU = '2026-10-22';
const seedAround = (day, ...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags, `--today=${day}`], { stdio: 'pipe' }).toString().trim();

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

// coach: undefined leaves my_coach as the database answers; null or a name replaces its answer.
async function newContext({ width = 1280, mode = 'dark', height, zone = LONDON, day = FIXED_TODAY, time = '08:30', coach }) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: height || (phone ? 844 : 900) },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: zone,
    colorScheme: mode,
  });
  await context.clock.install({ time: zoneInstant(zone, day, time) });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (coach !== undefined && /\/rest\/v1\/rpc\/my_coach/.test(url)) {
      const body = coach ? [{ coach_id: '00000000-0000-4000-8000-000000000001', first_name: coach, mobile: '+447700900123', contact_ways: ['whatsapp'], away_until: null }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode} ${day} ${time})`, false, e.message));
  return { context, page };
}

async function signedIn(opts) {
  const c = await newContext(opts);
  await c.page.goto(`${APP}/auth/login`);
  await c.page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await c.page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await c.page.keyboard.press('Enter');
  await c.page.waitForURL(/welcome/, { timeout: 30000 });
  await home(c.page);
  return c;
}

const path = (page) => new URL(page.url()).pathname;
const landsOn = (page, want, ms = 20000) => until(async () => path(page) === want, ms);
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}
// Home, loaded: its title, and the data settled (the sprint's copy and the day's).
async function home(page) {
  if (path(page) !== '/welcome') await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
  await until(async () => (await page.locator('.home-page .ds-loading').count()) === 0, 20000);
  await sleep(600);
}
const text = async (page, sel) => ((await page.locator(sel).count()) ? (await page.locator(sel).first().innerText()).trim() : '');
const cardQuestion = (page) => text(page, '.ds-suggest-question');
const title = async (page) => (await text(page, '.home-page .ds-page-title')).toLowerCase();
const at = (page, day, time, zone = LONDON) => page.clock.setSystemTime(zoneInstant(zone, day, time));
async function homeAt(page, day, time, zone = LONDON) {
  await at(page, day, time, zone);
  await page.goto(`${APP}/welcome`);
  await home(page);
}

// Anything that stops the run still reports what ran, and puts the seed back.
process.on('uncaughtException', (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  console.log(results.join('\n'));
  try { seedForReal('--reset'); } catch { /* reported above */ }
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

seedFixed('--reset');

// ---------------------------------------------------------------- 1: the moments of the day
if (part(1)) {
  const { context, page } = await signedIn({ day: THU, time: '08:30' });
  try {
    pass('morning: "Ready to plan your day?"', (await cardQuestion(page)) === 'Ready to plan your day?', await cardQuestion(page));
    pass('morning: ~4 minutes', (await text(page, '.ds-suggest-time')) === '~4 minutes');
    pass('morning: the greeting', (await title(page)).startsWith('good morning'), await title(page));
    pass('morning: one coral button on Home', (await page.locator('.home-page .ds-btn--primary').count()) === 1);
    pass('morning: Plan my day is the coral button', /plan my day/i.test(await text(page, '.ds-suggest .ds-btn--primary')));
    pass('morning: before planning, the to-dos line', (await page.locator('.home-today', { hasText: 'Your to-dos for today show here once you’ve planned your day.' }).count()) === 1);
    await shot(page, 'moment-morning');

    await homeAt(page, THU, '13:00');
    pass('midday: "How is today going?"', (await cardQuestion(page)) === 'How is today going?', await cardQuestion(page));
    pass('midday: the review is suggested from 17:00', (await text(page, '.ds-suggest')).includes('Your review is suggested from 17:00.'));
    pass('midday: no to-do count (UNDEFINED)', !/to-dos done so far/.test(await text(page, '.ds-suggest')));
    pass('midday: the greeting', (await title(page)).startsWith('good afternoon'), await title(page));
    await page.locator('.ds-suggest .ds-btn--primary').click();
    pass('midday: Log today brings Log today into view', Boolean(await until(async () => {
      const box = await page.locator('#log-today').boundingBox();
      return box && box.y < 300 && box.y > -50;
    }, 5000)));
    await shot(page, 'moment-midday');

    await homeAt(page, THU, '16:30');
    pass('16:30: still the afternoon card (review from 17:00, M2)', (await cardQuestion(page)) === 'How is today going?', await cardQuestion(page));
    await homeAt(page, THU, '17:30');
    pass('17:30: "Ready to review your day?"', (await cardQuestion(page)) === 'Ready to review your day?', await cardQuestion(page));
    pass('17:30: ~5 minutes', (await text(page, '.ds-suggest-time')) === '~5 minutes');
    pass('17:30: the greeting', (await title(page)).startsWith('good evening'), await title(page));
    await shot(page, 'moment-evening');

    await homeAt(page, THU, '20:59');
    pass('20:59: no wind down yet', (await text(page, '.ds-suggest-label')) !== 'Sleep wind down');
    await homeAt(page, THU, '21:00');
    pass('21:00: "Ready to wind down?"', (await cardQuestion(page)) === 'Ready to wind down?', await cardQuestion(page));
    pass('21:00: the card says Sleep wind down', (await text(page, '.ds-suggest-label')) === 'Sleep wind down');
    pass('21:00: ~6 minutes', (await text(page, '.ds-suggest-time')) === '~6 minutes');
    pass('21:00: Start my wind down and Not tonight', /start my wind down/i.test(await text(page, '.ds-suggest .ds-btn--primary')) && (await page.locator('.ds-suggest .ds-link', { hasText: 'Not tonight' }).count()) === 1);
    await shot(page, 'moment-2100');
    await page.locator('.ds-suggest .ds-link', { hasText: 'Not tonight' }).click();
    pass('Not tonight: says so', Boolean(await until(async () => (await page.locator('text=You can wind down tomorrow evening.').count()) > 0, 5000)));
    pass('Not tonight: the review takes the card', Boolean(await until(async () => (await cardQuestion(page)) === 'Ready to review your day?', 5000)), await cardQuestion(page));
    await homeAt(page, '2026-10-23', '00:30');
    pass('after midnight: still dismissed for the evening before', (await cardQuestion(page)) !== 'Ready to wind down?', await cardQuestion(page));
  } finally {
    await context.close();
  }

  // After midnight on a new device: the evening before's wind down.
  const late = await signedIn({ day: '2026-10-23', time: '00:30' });
  try {
    pass('after midnight: "Ready to wind down?"', (await cardQuestion(late.page)) === 'Ready to wind down?', await cardQuestion(late.page));
    pass('after midnight: the greeting stays the evening', (await title(late.page)).startsWith('good evening'), await title(late.page));
    await homeAt(late.page, '2026-10-23', '03:30');
    pass('03:30: no wind down, nothing to suggest', (await late.page.locator('.ds-suggest').count()) === 0, await cardQuestion(late.page));
  } finally {
    await late.context.close();
  }
}

// ---------------------------------------------------------------- 2: 21:00 in two time zones
if (part(2)) {
  const la = await signedIn({ zone: LA, day: THU, time: '21:15' });
  try {
    pass('Los Angeles 21:15: Sleep wind down', (await cardQuestion(la.page)) === 'Ready to wind down?', await cardQuestion(la.page));
    await homeAt(la.page, THU, '20:45', LA);
    pass('Los Angeles 20:45: not yet', (await cardQuestion(la.page)) !== 'Ready to wind down?', await cardQuestion(la.page));
  } finally {
    await la.context.close();
  }
  // The same instant as Los Angeles' 21:15 is 05:15 the next morning in London.
  const lon = await signedIn({ zone: LONDON, day: '2026-10-23', time: '05:15' });
  try {
    pass('London at the same instant (05:15): no wind down', (await cardQuestion(lon.page)) !== 'Ready to wind down?', await cardQuestion(lon.page));
    await homeAt(lon.page, THU, '21:15');
    pass('London 21:15: Sleep wind down', (await cardQuestion(lon.page)) === 'Ready to wind down?', await cardQuestion(lon.page));
  } finally {
    await lon.context.close();
  }
}

// ---------------------------------------------------------------- 3: states with the usual seed
if (part(3)) {
  const c = await signedIn({ day: FIXED_TODAY, time: '13:00' });
  try {
    // Wed 21 Oct: week 3's debrief is open until today.
    pass('debrief ready: "How did this week go?"', (await cardQuestion(c.page)) === 'How did this week go?', await cardQuestion(c.page));
    pass('debrief ready: open until today', (await text(c.page, '.ds-suggest')).includes('Your debrief is open until Wed 21 Oct.'));
    pass('debrief ready: Start my debrief', /start my debrief/i.test(await text(c.page, '.ds-suggest .ds-btn--primary')));
    await homeAt(c.page, FIXED_TODAY, '08:30');
    pass('debrief day mornings stay Plan my day', (await cardQuestion(c.page)) === 'Ready to plan your day?', await cardQuestion(c.page));
    await shot(c.page, 'state-debrief');

    // The line is a quiet link into the sprint (Tim, 3 Nov): "Sprint 1, week 4 of 8".
    pass('mid-sprint: the mini dial says the week', /Sprint \d+, week 4 of 8/.test(await text(c.page, '.ds-mdial')), await text(c.page, '.ds-mdial'));
    pass('mid-sprint: the week line', (await text(c.page, '.ds-weekline')).startsWith('Performance score this week'));
    const good = await c.page.locator('.ds-weekline-figure--good').count();
    const fig = await c.page.locator('.ds-weekline-figure').evaluate((el) => getComputedStyle(el).color).catch(() => '');
    const coral = await c.page.evaluate(() => getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--coral').trim());
    pass('mid-sprint: the week figure is never coral', !fig.includes('255, 111, 92') && coral !== '', `${fig} ${good}`);
    await c.page.locator('.ds-mdial').click();
    pass('the mini dial opens the sprint', Boolean(await landsOn(c.page, '/performance-sprint')));
    await home(c.page);
    await c.page.locator('.ds-weekline').click();
    pass('the week line opens the sprint', Boolean(await landsOn(c.page, '/performance-sprint')));

    await homeAt(c.page, '2026-10-30', '10:00');
    pass('coming back after a gap: "Good to see you"', (await title(c.page)).startsWith('good to see you'), await title(c.page));
    pass('coming back after a gap: "Let’s start with this week."', (await text(c.page, '.home-welcome')) === 'Let’s start with this week.');
    await homeAt(c.page, '2026-10-23', '10:00');
    pass('no gap two days on: the usual greeting', (await title(c.page)).startsWith('good morning'), await title(c.page));

    // Help behind one button.
    await c.page.locator('.home-help .ds-btn').click();
    await c.page.waitForSelector('.ds-helplist-row', { timeout: 5000 });
    const rows = await c.page.locator('.ds-helplist-situation').allInnerTexts();
    pass('help: the five situations in M2’s order', ['I’m under pressure', 'I’ve got a hard conversation coming up', 'I’m stuck on a decision', 'I want a meeting to go well', 'I need a moment to reset'].every((s, i) => rows[i] === s), rows.join(' | '));
    const tools = await c.page.locator('.ds-helplist-tool').allInnerTexts();
    pass('help: decisions open Get unstuck', tools[2] === 'Get unstuck', tools.join(' | '));
    await c.page.locator('.ds-helplist-row', { hasText: 'I need a moment to reset' }).click();
    pass('help: Breathe opens', Boolean(await landsOn(c.page, '/breathe')));
  } finally {
    await c.context.close();
  }
}

// ---------------------------------------------------------------- 4 and 5: logging and to-dos, Home and the sprint
async function waterLog(day) {
  const { data: sh } = await db.from('sprint_habits').select('id, name').eq('user_id', me).eq('name', 'Water');
  const ids = (sh || []).map((x) => x.id);
  if (!ids.length) return null;
  const { data } = await db.from('habit_logs').select('value').in('sprint_habit_id', ids).eq('local_date', day);
  return data?.[0] ? Number(data[0].value) : null;
}
async function lateLog(day) {
  const { data: sh } = await db.from('sprint_habits').select('id').eq('user_id', me).eq('name', 'Late finishes');
  const ids = (sh || []).map((x) => x.id);
  const { data } = await db.from('habit_logs').select('value').in('sprint_habit_id', ids).eq('local_date', day);
  return data?.[0] ? Number(data[0].value) : null;
}
const TODO_TEXT = 'Invented to-do added from Home for the test';

if (part(4) || part(5)) {
  const c = await signedIn({ day: THU, time: '13:00' });
  const { page } = c;
  try {
    if (part(4)) {
      const box = page.getByLabel('Water today').first();
      await box.fill('1.5');
      await box.blur();
      pass('Home: logging Water shows Saved', Boolean(await until(async () => /Saved/.test(await text(page, '.home-log-head')), 10000)), await text(page, '.home-log-head'));
      pass('Home: the log is in the database', Boolean(await until(async () => (await waterLog(THU)) === 1.5, 15000)), String(await waterLog(THU)));
      await page.goto(`${APP}/performance-sprint`);
      await page.waitForSelector('#log-today', { timeout: 30000 });
      pass('the sprint page shows Home’s log', Boolean(await until(async () => (await page.getByLabel('Water today').first().inputValue()) === '1.5', 10000)));
      // The reverse: Late finishes Yes on the sprint page.
      await page.getByRole('group', { name: 'Late finishes today' }).getByRole('button', { name: 'Yes', exact: true }).click();
      pass('the sprint page: the log is in the database', Boolean(await until(async () => (await lateLog(THU)) === 1, 15000)));
      await home(page);
      pass('Home shows the sprint page’s log', Boolean(await until(async () => (await page.getByRole('group', { name: 'Late finishes today' }).getByRole('button', { name: 'Yes', exact: true }).getAttribute('aria-pressed')) === 'true', 10000)));
    }
    if (part(5)) {
      await home(page);
      await page.locator('.home-add').click();
      await page.waitForSelector('.ds-panel textarea, .ds-panel input', { timeout: 5000 });
      await page.getByLabel('What needs doing?').fill(TODO_TEXT);
      await page.locator('.ds-panel').getByText('Grow through referrals', { exact: true }).click();
      await page.locator('.ds-panel').getByRole('button', { name: 'Add my to-do' }).click();
      pass('Home: Add a to-do says it was added', Boolean(await until(async () => (await page.locator('text=Added to this week.').count()) > 0, 10000)));
      const saved = await until(async () => {
        const { data } = await db.from('todos').select('id, planned_week, deleted_at').eq('user_id', me).eq('text', TODO_TEXT);
        return data?.length ? data[0] : null;
      }, 15000);
      pass('Home: the to-do is in the database, this week', Boolean(saved) && saved.planned_week === 4 && !saved.deleted_at, JSON.stringify(saved));
      await page.goto(`${APP}/performance-sprint`);
      pass('the sprint page lists Home’s to-do', Boolean(await until(async () => (await page.locator('.ds-todo-text', { hasText: TODO_TEXT }).count()) > 0, 15000)));
      await db.from('todos').delete().eq('user_id', me).eq('text', TODO_TEXT);
    }
  } finally {
    await c.context.close();
  }
}

// ---------------------------------------------------------------- 6 and 7: two taps, and Carry on
if (part(6) || part(7)) {
  for (const width of [1280, 390]) {
    const tag = width < 769 ? 'phone' : 'desktop';
    const c = await signedIn({ width, day: THU, time: '13:00' });
    const { page } = c;
    try {
      if (part(6)) {
        // Log today: on Home itself (no tap), and through the menu in two.
        pass(`${tag}: Log today is on Home`, (await page.locator('#log-today .home-log-title').count()) === 1);
        if (width < 769) await page.locator('.ds-bar-menu').click();
        else await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.locator(width < 769 ? '#site-tile-menu' : '#site-menu').getByRole('button', { name: 'Log today', exact: true }).click();
        pass(`${tag}: the menu’s Log today (2 taps) lands on Home’s Log today`, Boolean(await until(async () => {
          const box = await page.locator('#log-today').boundingBox();
          return path(page) === '/welcome' && box && box.y < 400 && box.y > -50;
        }, 8000)), path(page));
        for (const [label, to] of [['Plan my day', '/my-day/plan'], ['Review my day', '/my-day/review']]) {
          await home(page);
          await page.locator('.home-links .ds-link', { hasText: label }).click();
          pass(`${tag}: ${label} in one tap`, Boolean(await landsOn(page, to)), path(page));
        }
        await home(page);
        await page.locator('.home-add').click();
        pass(`${tag}: Add a to-do opens in one tap`, Boolean(await until(async () => (await page.getByLabel('What needs doing?').count()) > 0, 5000)));
        await page.keyboard.press('Escape');
      }
      if (part(7) && width === 1280) {
        await page.goto(`${APP}/my-day/plan`);
        const next = page.getByRole('button', { name: /^(Next|Skip)$/ }).first();
        await next.waitFor({ timeout: 30000 });
        // GuidedTool ignores a tap in the first moment after it appears (a double tap's second half).
        await sleep(1500);
        await next.click();
        await until(async () => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ds-guide:day-plan') && JSON.parse(localStorage.getItem(k)).index > 0)), 5000);
        await home(page);
        const rows = await page.locator('.ds-carryon .ds-row-title').allInnerTexts();
        const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ds-guide:')).map((k) => `${k.replace(/[0-9a-f-]{36}/, 'me')}=${localStorage.getItem(k)}`).join(', '));
        pass('Carry on: the half-finished Plan my day appears', rows.includes('Plan my day'), `${rows.join(' | ')} [${kept}]`);
        if (rows.includes('Plan my day')) {
          await page.locator('.ds-carryon .ds-row', { hasText: 'Plan my day' }).click();
          pass('Carry on: its row opens Plan my day', Boolean(await landsOn(page, '/my-day/plan')));
        }
        await homeAt(page, THU, '09:00');
        pass('Carry on: not repeated while the card suggests it', !(await page.locator('.ds-carryon .ds-row-title').allInnerTexts()).includes('Plan my day'));
      }
    } finally {
      await c.context.close();
    }
  }
}

// ---------------------------------------------------------------- 8: 360px
async function phoneChecks(page, tag) {
  const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  pass(`${tag}: no sideways scrolling at 360px`, wide <= 0, `${wide}px`);
  const small = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.home-page button, .home-page a, .home-page input')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[inert]')) continue;
      if (r.height < 43.5) bad.push(`${(el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30)} ${Math.round(r.height)}px`);
    }
    return bad;
  });
  pass(`${tag}: every tap area is 44px or more`, small.length === 0, small.join('; '));
}
if (part(8)) {
  const c = await signedIn({ width: 360, height: 780, mode: 'light', day: THU, time: '13:00' });
  try {
    await phoneChecks(c.page, 'mid-sprint');
    await shot(c.page, 'phone-360-mid');
    await homeAt(c.page, THU, '21:30');
    await phoneChecks(c.page, 'wind down');
  } finally {
    await c.context.close();
  }
}

// ---------------------------------------------------------------- 9: measured against M2
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;
const MEASURE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    w: r.width, h: r.height, fs: parseFloat(s.fontSize), ff: s.fontFamily.split(',')[0].replace(/["']/g, ''),
    pt: parseFloat(s.paddingTop), pl: parseFloat(s.paddingLeft), radius: parseFloat(s.borderTopLeftRadius),
    bg: s.backgroundColor, color: s.color, tt: s.textTransform,
  };
};
const PARTS = {
  desktop: [
    ['greeting', '#dk .page h2.hg', '.home-page .ds-page-title', ['fs', 'ff', 'tt'], 'The shared PageHeader title is 24px on every page (rule 7); M2 drew 28px.'],
    ['card', '#dk .page .hs', '.ds-suggest', ['pt', 'pl', 'radius', 'bg']],
    ['card label', '#dk .page .hs > small', '.ds-suggest-label', ['fs', 'color']],
    ['card question', '#dk .page .hs h3', '.ds-suggest-question', ['fs', 'color']],
    ['card time', '#dk .page .hs .hsl', '.ds-suggest-time', ['fs', 'color']],
    ['card button', '#dk .page .hs .btn', '.ds-suggest .ds-btn--primary', ['h', 'bg'], 'The shared coral Button is 48px tall everywhere (design reference: Buttons); M2 drew 50px.'],
    ['mini dial', '#dk .page .hd2 svg', '.ds-mdial svg', ['w']],
    ['mini dial date', '#dk .page .hd2 b', '.ds-mdial-date', ['fs', 'color']],
    ['mini dial week', '#dk .page .hd2 span span', '.ds-mdial-line', ['fs', 'color']],
    ['week figure', '#dk .page .hwk b', '.ds-weekline-figure', ['fs', 'ff', 'color'], 'Coral is never a data colour (26 Oct rule 1): the figure is mint at or above the standard and the text colour below; M2 drew it coral.'],
    ['week line', '#dk .page .hwk .hwu', '.ds-weekline-line', ['fs', 'color']],
    ['help button', '#dk .page .hhelp .ghost', '.home-help .ds-btn', ['h']],
  ],
  phone: [
    ['greeting (phone)', '#ph .page h2.hg', '.home-page .ds-page-title', ['fs'], 'The shared PageHeader title on phones; M2 drew 22px.'],
    ['card (phone)', '#ph .page .hs', '.ds-suggest', ['pt', 'pl', 'radius']],
    ['card question (phone)', '#ph .page .hs h3', '.ds-suggest-question', ['fs']],
    // Widths follow each frame's page width, so only heights are compared; both buttons are full width.
    ['card button (phone)', '#ph .page .hs .btn', '.ds-suggest .ds-btn--primary', ['h'], 'The shared coral Button is 48px tall everywhere (design reference: Buttons); M2 drew 50px.'],
    ['help button (phone)', '#ph .page .hhelp .ghost', '.home-help .ds-btn', ['h']],
  ],
};
function compare(view, mode, what, mock, app, fields, known) {
  if (!mock || !app) {
    pass(`M2 ${view} ${mode}: ${what} found on both sides`, false, `mock ${Boolean(mock)}, app ${Boolean(app)}`);
    return;
  }
  const diffs = fields.filter((f) => (typeof mock[f] === 'number' ? Math.abs(mock[f] - app[f]) > 0.6 : mock[f] !== app[f]))
    .map((f) => `${f} mock ${mock[f]} app ${app[f]}`);
  if (known && diffs.length) {
    notes.push(`NOTE  M2 ${view} ${mode}: ${what}: ${diffs.join('; ')}. ${known}`);
    pass(`M2 ${view} ${mode}: ${what} (known difference noted)`, true);
    return;
  }
  pass(`M2 ${view} ${mode}: ${what} matches (${fields.join(', ')})`, diffs.length === 0, diffs.join('; '));
}
if (part(9)) {
  const file = join(MOCKS, 'm2-home.html');
  if (!existsSync(file)) {
    pass('M2 found', false, file);
  } else {
    for (const mode of ['dark', 'light']) {
      const mp = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
      await mp.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
      await mp.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
        const w = /500/.test(r.request().url()) ? 500 : 400;
        r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
      });
      await mp.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
      await mp.goto(`file://${file}`);
      await mp.evaluate(() => document.fonts.ready);
      await mp.click(`#sw2 button[data-m="${mode === 'dark' ? 1 : 0}"]`);
      await mp.click('#sw button[data-p="mid"]');
      await mp.click('#sw button[data-mo="am"]');
      await sleep(600);
      const mock = {};
      for (const [what, ms] of [...PARTS.desktop, ...PARTS.phone]) mock[what] = await mp.evaluate(MEASURE, ms);
      await mp.close();

      // The app on Wed 21 Oct at 08:30: Plan my day, as M2's Morning.
      const dk = await signedIn({ width: 1280, mode, day: FIXED_TODAY, time: '08:30' });
      const appDesk = {};
      for (const [what, , as] of PARTS.desktop) appDesk[what] = await dk.page.evaluate(MEASURE, as);
      for (const [what, , , fields, known] of PARTS.desktop) compare('desktop', mode, what, mock[what], appDesk[what], fields, known);
      await shot(dk.page, `m2-desktop-${mode}`);
      await dk.context.close();

      const ph = await signedIn({ width: 390, mode, day: FIXED_TODAY, time: '08:30' });
      const appPhone = {};
      for (const [what, , as] of PARTS.phone) appPhone[what] = await ph.page.evaluate(MEASURE, as);
      for (const [what, , , fields, known] of PARTS.phone) compare('phone', mode, what, mock[what], appPhone[what], fields, known);
      const full = await ph.page.evaluate(() => {
        const card = document.querySelector('.ds-suggest').getBoundingClientRect();
        const btn = document.querySelector('.ds-suggest .ds-btn--primary').getBoundingClientRect();
        return Math.abs(card.width - 40 - btn.width) < 1;
      });
      pass(`M2 phone ${mode}: the card's button is full width, as M2`, full);
      await shot(ph.page, `m2-phone-${mode}`);
      await ph.context.close();
    }
  }
}

// ---------------------------------------------------------------- 3 continued: states that need their own seed
if (part(3)) {
  // The last week of the sprint: a sprint built around Wed 23 Sep is in its
  // eighth week on Thu 22 Oct (no debrief window open that day).
  seedAround('2026-09-23', '--reset');
  const lw = await signedIn({ day: THU, time: '13:00' });
  try {
    pass('last week: "Ready for what comes next?"', (await cardQuestion(lw.page)) === 'Ready for what comes next?', await cardQuestion(lw.page));
    pass('last week: Go straight into the next sprint, or take a Recovery week first.', (await text(lw.page, '.ds-suggest')).includes('Go straight into the next sprint, or take a Recovery week first.'));
    pass('last week: Plan what’s next', /plan what’s next/i.test(await text(lw.page, '.ds-suggest .ds-btn--primary')));
    pass('last week: the mini dial says week 8 of 8', /Sprint \d+, week 8 of 8/.test(await text(lw.page, '.ds-mdial')), await text(lw.page, '.ds-mdial'));
    await shot(lw.page, 'state-last-week');
  } finally {
    await lw.context.close();
  }

  // Recovery: Home shrinks to the basics (M15).
  seedFixed('--reset', '--recovery');
  const rc = await signedIn({ day: FIXED_TODAY, time: '13:00' });
  try {
    pass('Recovery: the banner', Boolean(await until(async () => /You’re in recovery until/.test(await text(rc.page, '.home-recovery')), 15000)), await text(rc.page, '.home-recovery'));
    pass('Recovery: What would help you recharge today?', (await text(rc.page, '.home-recovery')).includes('What would help you recharge today?'));
    pass('Recovery: no Today and no week line', (await rc.page.locator('.home-today').count()) === 0 && (await rc.page.locator('.ds-weekline').count()) === 0);
    pass('Recovery: Plan my day isn’t suggested', !/plan your day|review your day/.test(await cardQuestion(rc.page)), await cardQuestion(rc.page));
    await shot(rc.page, 'state-recovery');
    await homeAt(rc.page, FIXED_TODAY, '21:30');
    pass('Recovery: Sleep wind down is still offered', (await cardQuestion(rc.page)) === 'Ready to wind down?', await cardQuestion(rc.page));
  } finally {
    await rc.context.close();
  }

  // Someone new, without a coach, and a coaching client before the first session.
  seedFixed('--empty');
  const nn = await signedIn({ day: FIXED_TODAY, time: '10:00', coach: null });
  try {
    pass('new, no coach: "Ready to build your plan?"', (await cardQuestion(nn.page)) === 'Ready to build your plan?', await cardQuestion(nn.page));
    pass('new, no coach: the plan’s four steps', (await nn.page.locator('.ds-planstep').count()) === 4);
    pass('new, no coach: My Mission is next', (await text(nn.page, '.ds-planstep--next .ds-planstep-name')) === 'My Mission');
    pass('new, no coach: the date, no dial', (await nn.page.locator('.ds-mdial').count()) === 0 && (await text(nn.page, '.ds-page-meta')) === 'Wed 21 Oct');
    pass('new, no coach: no Log today', (await nn.page.locator('#log-today').count()) === 0);
    // The quiet lines: the mission's, and (Phase 5) the monthly check-in's while this month's is due.
    const quiets = await nn.page.locator('.ds-quiet').allInnerTexts();
    const q = quiets.find((t) => t.includes('mission')) || '';
    // M2: it appears once two weeks after joining, so it depends on when the test account was made.
    const joinedDays = Math.floor((zoneInstant(LONDON, FIXED_TODAY, '10:00') - new Date(signIn.user.created_at)) / 86400000);
    pass(`new, no coach: "Ready to add your mission?" ${joinedDays >= 14 ? 'shows' : 'waits'} (${joinedDays} days after joining)`, joinedDays >= 14 ? q.includes('Ready to add your mission?') : !q, q);
    pass('new, no coach: any other quiet line is the monthly check-in’s (Phase 5)', quiets.filter((t) => !t.includes('mission')).every((t) => t.includes('Ready for your monthly check-in?')), quiets.join(' | '));
    if (q) {
      await nn.page.locator('.ds-quiet', { hasText: 'mission' }).getByRole('button', { name: 'Not now' }).click();
      pass('new, no coach: Not now hides it', Boolean(await until(async () => (await nn.page.locator('.ds-quiet', { hasText: 'mission' }).count()) === 0, 5000)));
    }
    await nn.page.locator('.home-help .ds-btn').click();
    await nn.page.waitForSelector('.ds-helplist-row', { timeout: 5000 });
    pass('new, no coach: no Chat line in help', (await nn.page.locator('.ds-helplist-row', { hasText: 'Something else?' }).count()) === 0);
    await nn.page.keyboard.press('Escape');
    await shot(nn.page, 'state-new-no-coach');
    await nn.page.locator('.ds-suggest .ds-btn--primary').click();
    pass('new, no coach: Build my plan opens the builder', Boolean(await landsOn(nn.page, '/performance-plan/build')));
  } finally {
    await nn.context.close();
  }
  const nc = await signedIn({ day: FIXED_TODAY, time: '10:00', coach: 'Tim' });
  try {
    // Phase 5 built the First check-in: a new coaching client's card is it (M2 sugCard newc).
    pass('coaching client: the card is the First check-in (Phase 5)', (await cardQuestion(nc.page)) === 'Ready for your first check-in?', await cardQuestion(nc.page));
    pass('coaching client: "You’ll build your plan with your coach in your first session."', (await text(nc.page, '.home-section')).includes('You’ll build your plan with your coach in your first session.'));
    pass('coaching client: Start on my own', (await nc.page.locator('.home-links .ds-link', { hasText: 'Start on my own' }).count()) === 1);
    pass('coaching client: no mission quiet line', (await nc.page.locator('.ds-quiet', { hasText: 'mission' }).count()) === 0);
    await nc.page.locator('.home-help .ds-btn').click();
    await nc.page.waitForSelector('.ds-helplist-row', { timeout: 5000 });
    pass('coaching client: "Something else? Chat to Tim"', (await nc.page.locator('.ds-helplist-row', { hasText: 'Something else?' }).innerText()).includes('Chat to Tim'));
    await nc.page.keyboard.press('Escape');
    await shot(nc.page, 'state-new-coach');
  } finally {
    await nc.context.close();
  }
}

// ---------------------------------------------------------------- the end
await browser.close();
await db.from('todos').delete().eq('user_id', me).eq('text', TODO_TEXT);
seedForReal('--reset');
console.log(results.join('\n'));
if (notes.length) console.log(`\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
