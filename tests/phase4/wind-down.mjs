// Phase 4 step 6: Sleep wind down, Work's done for today (mock-up M19) and
// the next morning's Carried over list, in the running app, signed in as
// the invented test client on the TEST database only (every other host and
// every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/wind-down.mjs [folder for screenshots]
//
// 1. Review my day ends with Close the day, then Work's done for today.
// 2. Sleep wind down from start to finish: the thoughts (rows, 300
//    characters at most), the breathing (the orb alone, 4 in and 6 out,
//    measured from the clock, no words), Sleep well (exactly three lines and
//    Back to Home, no list), and Home stops offering it that night.
// 3. The next morning's Carried over list: Review my day's things first,
//    then last night's thoughts, the source lines, duplicates merged;
//    picking three works and a fourth is refused; the to-dos made.
// 4. After midnight and before 04:00 the wind-down is for the night before;
//    from 04:00 it is the new day's.
// 5. Reduced motion: the orb stays still at half a breath, fading.
// 6. 360px, dark and light: no sideways scrolling, every tap area 44px.
// 7. Offline: thoughts are kept on the device with no connection, and a
//    thought chosen the next morning offline is sent once.
// 8. Measured against M19 (a scratchpad copy of the mock-up, with the real
//    fonts), desktop and phone, dark and light.
//
// The clock is fixed with Playwright's clock (Wed 21 Oct 2026 and the
// morning after); the seed is built around that day and put back on the
// real today at the end (plan v3.2, Sprint 1).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, londonInstant } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCK = process.env.M19 || join(homedir(), 'Downloads', 'clarity-phase-4', 'm19-sleep-wind-down.html');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(String(n));

if (FIXED_TODAY !== '2026-10-21') throw new Error('wind-down.mjs is written around the default fixed day, Wed 21 Oct 2026.');
const WED = '2026-10-21';
const THU = '2026-10-22';

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

// ---------------------------------------------------------------- the data
const REVIEW = ['Call Evan before 09:00 about the referral', 'Finish the Harbour case study', 'Reply to Max about the workshop'];
const THOUGHTS = ['call evan before 09:00 about the referral', 'Finish the Harbour case study!', 'Book a day off for the half term'];
const CARRIED = [
  ['Call Evan before 09:00 about the referral', 'From Review my day and last night’s sleep wind down'],
  ['Finish the Harbour case study', 'From Review my day and last night’s sleep wind down'],
  ['Reply to Max about the workshop', 'From Review my day'],
  ['Book a day off for the half term', 'From last night’s sleep wind down'],
];

process.on('uncaughtException', (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  console.log(results.join('\n'));
  try { seedForReal('--reset'); } catch { /* reported above */ }
  console.log(`\n${results.length - failures} of ${results.length} passed`);
  process.exit(1);
});

seedFixed('--reset');
async function cleanDays() {
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'other_tool']);
  await db.from('day_plans').delete().eq('user_id', me).in('local_date', [WED, THU]);
  await db.from('day_reviews').delete().eq('user_id', me).in('local_date', [WED, THU]);
}
await cleanDays();
const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
const weekNow = Math.floor((Date.UTC(2026, 9, 21) - Date.parse(`${sprint.start_on}T00:00:00Z`)) / (7 * 86400000)) + 1;
const openTodo = (await db.from('todos').select('id, text').eq('user_id', me).eq('sprint_id', sprint.id).eq('planned_week', weekNow).is('done_on', null).is('deleted_at', null).limit(1)).data?.[0];
// Wednesday: a plan with one to-do left open, and the review with three things for tomorrow.
const wedPlan = (await db.from('day_plans').insert({ user_id: me, local_date: WED, status: 'finished', finished_at: `${WED}T07:30:00Z` }).select('id').single()).data;
if (openTodo) await db.from('day_plan_todos').insert({ day_plan_id: wedPlan.id, todo_id: openTodo.id, user_id: me, is_top: true });
const reviewId = (await db.from('day_reviews').insert({
  user_id: me, local_date: WED, status: 'finished', finished_at: `${WED}T19:30:00Z`, tomorrow: REVIEW,
}).select('id').single()).data.id;

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch();

async function signedIn({ width = 1280, mode = 'dark', day = WED, time = '22:30', reduced = false, onRequest } = {}) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.clock.install({ time: londonInstant(day, time) });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    onRequest?.(route.request());
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode} ${day} ${time})`, false, e.message));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  if (new URL(page.url()).pathname !== '/welcome') await page.goto(`${APP}/welcome`);
  await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
  await until(async () => (await page.locator('.home-page .ds-loading').count()) === 0, 20000);
  return { context, page };
}

const at = (page, day, time) => page.clock.setSystemTime(londonInstant(day, time));
async function shot(page, name) {
  if (out) await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
}
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-end-title').first().textContent().catch(() => '')) || '').trim();
const nightKeys = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.endsWith(':wind-down-nights'));
  return k ? JSON.parse(localStorage.getItem(k)) : {};
});
// The words a person can see on the tool's page (screen-reader-only words left out).
const seen = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.ds-sr').forEach((x) => x.remove());
  document.body.appendChild(copy);
  const t = copy.innerText;
  copy.remove();
  return t.replace(/\s+/g, ' ').trim();
}, sel);
const noSideways = async (page) => {
  await sleep(700); // the step's slide in has finished
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    scroll: [...document.querySelectorAll('.ds-guide-scroll')].map((s) => [s.scrollWidth, s.clientWidth]),
    wide: [...document.querySelectorAll('.ds-guide *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.className).slice(0, 5),
  }));
  const ok = r.doc <= r.win + 1 && r.scroll.every(([a, b]) => a <= b + 1);
  if (!ok) notes.push(`NOTE  sideways: ${JSON.stringify(r)}`);
  return ok;
};
const smallTaps = (page) => page.evaluate(() => [...document.querySelectorAll('.ds-guide button')]
  .filter((b) => b.offsetParent && !b.closest('.ds-sr'))
  .map((b) => ({ t: (b.innerText || b.getAttribute('aria-label') || '').trim(), r: b.getBoundingClientRect() }))
  .filter((x) => x.r.height < 43.5 || x.r.width < 43.5)
  .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));

async function openWindDown(page) {
  await page.goto(`${APP}/sleep-wind-down`);
  await page.getByRole('heading', { name: 'What’s on your mind for tomorrow?' }).waitFor({ timeout: 20000 });
}
async function typeThoughts(page, list) {
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) await page.getByRole('button', { name: 'Add a thought' }).click();
    await page.getByRole('textbox', { name: `Thought ${i + 1}` }).fill(list[i]);
  }
  return until(async () => (await page.locator('.ds-guide-bar').innerText()).includes('Saved'), 8000);
}
// The orb's main circle (Rings), its radius in the drawing's units: 9 empty, 24 full.
const orbR = (page) => page.evaluate(() => {
  const c = [...document.querySelectorAll('.ds-night-breathe .ds-borb-art svg circle')].at(-1);
  return c ? { r: Number(c.getAttribute('r')), o: Number(c.getAttribute('stroke-opacity') || 1) } : null;
});

async function toDoStep(page) {
  await page.goto(`${APP}/my-day/plan`);
  await page.locator('.ds-guide-question').waitFor({ timeout: 20000 });
  for (let i = 0; i < 6 && (await heading(page)) !== 'What will you do today?'; i += 1) {
    const before = await heading(page);
    await page.locator('.ds-guide-skip, .ds-guide-next').first().click();
    await until(async () => (await heading(page)) !== before, 5000);
    await sleep(450);
  }
  await page.locator('.ds-pick-groups').waitFor({ timeout: 15000 });
}
const groupRows = (page, n) => page.evaluate((i) => [...document.querySelectorAll('.ds-pick-group')][i]
  ? [...[...document.querySelectorAll('.ds-pick-group')][i].querySelectorAll('.ds-answer--pick')].map((b) => ({
    name: b.querySelector('.ds-pick-name')?.textContent.trim(),
    line: b.querySelector('.ds-todo-line')?.textContent.trim(),
    on: b.getAttribute('aria-pressed') === 'true',
    off: b.disabled,
  }))
  : [], n);

// ---------------------------------------------------------------- 1. Work's done for today
if (part(1)) {
  const { context, page } = await signedIn({ time: '20:00' });
  try {
    await page.goto(`${APP}/my-day/review`);
    // A finished review opens on its summary; Next goes on to closing the day.
    await until(async () => /^This was your day/.test(await heading(page)), 20000);
    pass('review: the summary has no Skip now it isn’t the last step', (await page.locator('.ds-guide-skip').count()) === 0);
    await sleep(600); // the tool ignores a tap in its first moment
    await page.locator('.ds-guide-next').click();
    await until(async () => (await heading(page)) === 'Ready to close the day?', 8000);
    pass('review: Close the day asks "Ready to close the day?"', (await heading(page)) === 'Ready to close the day?', await heading(page));
    pass('review: "Check what moves to tomorrow." with its ⓘ at the end', (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Check what moves to tomorrow.' && (await page.locator('.ds-guide-nudge .ds-guide-i--end').count()) === 1);
    await page.locator('.ds-guide-nudge .ds-guide-i--end').click();
    pass('review: the ⓘ says why', (await page.locator('.ds-infopop:visible').innerText()).includes('Anything still open moves to tomorrow, so you can stop thinking about it.'));
    await page.keyboard.press('Escape');
    const lists = await seen(page, '.ds-guide-body');
    pass('review: Moving to tomorrow lists the open to-do', openTodo ? lists.includes('Moving to tomorrow') && lists.includes(openTodo.text) : true, lists);
    pass('review: Tomorrow starts with the first thing for tomorrow', lists.includes('Tomorrow starts with') && lists.includes(REVIEW[0]), lists);
    pass('review: the lists hold nothing tappable', (await page.locator('.ds-guide-body button, .ds-guide-body a, .ds-guide-body input').count()) === 0);
    pass('review: the button says Close my day', (await page.locator('.ds-guide-next').innerText()).trim().toLowerCase() === 'close my day');
    await shot(page, 'review-close');
    await page.locator('.ds-guide-next').click();
    await until(async () => (await heading(page)) === 'Work’s done for today', 10000);
    pass('review: Work’s done for today', (await heading(page)) === 'Work’s done for today', await heading(page));
    const lines = await page.locator('.ds-end-line').allInnerTexts();
    const want = [openTodo ? 'Your open to-dos are on tomorrow’s list.' : null, `Tomorrow starts with “${REVIEW[0]}”.`].filter(Boolean);
    pass('review: its lines, tomorrow’s first thing quoted as written', JSON.stringify(lines) === JSON.stringify(want), JSON.stringify(lines));
    const back = page.locator('.ds-end-action button');
    pass('review: one coral Back to Home', (await back.count()) === 1 && /ds-btn--primary/.test(await back.getAttribute('class')) && (await back.innerText()).trim().toLowerCase() === 'back to home');
    pass('review: centred, with no progress bar or footer', (await page.locator('.ds-guide-pct, .ds-guide-foot').count()) === 0
      && (await page.locator('.ds-end').evaluate((e) => getComputedStyle(e).textAlign)) === 'center');
    const row = (await db.from('day_reviews').select('status, tomorrow').eq('id', reviewId).single()).data;
    pass('review: still saved as finished, with its things for tomorrow', row?.status === 'finished' && JSON.stringify(row.tomorrow) === JSON.stringify(REVIEW), JSON.stringify(row));
    await shot(page, 'review-done');
    await back.click();
    pass('review: Back to Home goes Home', Boolean(await until(async () => new URL(page.url()).pathname === '/welcome', 10000)));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- 2 and 3. The wind-down, then the morning
if (part(2)) {
  const { context, page } = await signedIn({ time: '22:30' });
  try {
    // Home offers it at 22:30.
    await page.locator('.ds-suggest-question').waitFor({ timeout: 20000 });
    pass('Home at 22:30 offers the wind-down', (await page.locator('.ds-suggest-question').innerText()).trim() === 'Ready to wind down?');
    await page.locator('.ds-suggest .ds-btn--primary').click();
    await page.getByRole('heading', { name: 'What’s on your mind for tomorrow?' }).waitFor({ timeout: 20000 });
    pass('wind-down: Home’s button opens /sleep-wind-down', new URL(page.url()).pathname === '/sleep-wind-down');
    pass('wind-down: the nudges', (await page.locator('.ds-guide-nudge').allInnerTexts()).join('|') === 'Write a few quick lines, then let them go.|They’ll wait for you in tomorrow’s Plan my day.');
    pass('wind-down: the % bar starts at 0%', (await page.locator('.ds-guide-pct-text').innerText()).trim() === '0%');
    // The eye alone, its words for screen readers (rules of 5 Nov).
    pass('wind-down: the eye says Only you', ((await page.locator('.ds-guide .ds-who').first().getAttribute('aria-label')) || '').includes('Only you'), await page.locator('.ds-guide .ds-who').first().getAttribute('aria-label').catch(() => 'no eye'));
    await page.getByRole('button', { name: 'Why write it down' }).click();
    pass('wind-down: Why write it down opens its reason', (await page.locator('.ds-infopop:visible').innerText()).includes('fell asleep faster'));
    await page.keyboard.press('Escape');
    pass('wind-down: Skip and Next', (await page.locator('.ds-guide-skip').count()) === 1 && (await page.locator('.ds-guide-next').innerText()).trim().toLowerCase() === 'next');
    pass('wind-down: thoughts typed save on the device (Saved)', Boolean(await typeThoughts(page, THOUGHTS)));
    pass('wind-down: one numbered row each, with a remove crosshair', (await page.locator('.ds-rowlist-n').allInnerTexts()).join() === '1,2,3' && (await page.locator('.ds-rowlist-remove').count()) === 3);
    // 300 characters at most.
    await page.getByRole('button', { name: 'Add a thought' }).click();
    await page.getByRole('textbox', { name: 'Thought 4' }).fill('x'.repeat(320));
    pass('wind-down: a thought is capped at 300 characters', (await page.getByRole('textbox', { name: 'Thought 4' }).inputValue()).length === 300);
    await page.getByRole('textbox', { name: 'Thought 4' }).pressSequentially('more');
    pass('wind-down: typing past 300 adds nothing', (await page.getByRole('textbox', { name: 'Thought 4' }).inputValue()).length === 300);
    await page.getByRole('button', { name: 'Remove thought 4' }).click();
    await until(async () => (await page.locator('.ds-guide-bar').innerText()).includes('Saved'), 8000);
    await sleep(800);
    const kept = (await nightKeys(page))[WED];
    pass('wind-down: kept for Wednesday night, as typed', JSON.stringify(kept?.thoughts) === JSON.stringify(THOUGHTS), JSON.stringify(kept));
    await shot(page, 'wind-1-tomorrow');

    // The breathing: the orb alone, 4 in and 6 out, measured from the clock.
    await page.locator('.ds-guide-next').click();
    await page.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 });
    pass('wind-down: the breathing uses the night colours', await page.locator('.ds-guide').evaluate((e) => e.classList.contains('ds-night')));
    pass('wind-down: the orb in the person’s style (Rings, the starting choice)', (await page.locator('.ds-night-breathe .ds-borb').getAttribute('data-orb-style')) === 'rings');
    pass('wind-down: no words on or beside the orb', (await page.locator('.ds-night-breathe .ds-borb').innerText()) === '' && (await page.locator('.ds-bwords').count()) === 0
      && (await seen(page, '.ds-guide-scroll')) === 'End early', await seen(page, '.ds-guide-scroll'));
    pass('wind-down: the orb says 4 in and 6 out to a screen reader', /4 seconds.*6 seconds.*5 minutes/.test(await page.locator('.ds-night-breathe .ds-borb').getAttribute('aria-label')));
    pass('wind-down: no % bar, no question and no footer while breathing', (await page.locator('.ds-guide-pct, .ds-guide-question, .ds-guide-foot').count()) === 0);
    pass('wind-down: no Saved in the top bar at night', !(await page.locator('.ds-guide-bar').innerText()).includes('Saved'));
    pass('wind-down: no sound plays by itself', (await page.locator('audio, video').count()) === 0 && !(await page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => !a.paused))));
    const t0 = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(t0 + 200);
    const samples = [];
    for (let i = 0; i < 100; i += 1) {
      await page.clock.runFor(250);
      samples.push({ t: i * 0.25, ...(await orbR(page)) });
    }
    const ext = [];
    for (let i = 1; i < samples.length - 1; i += 1) {
      const [a, b, c] = [samples[i - 1].r, samples[i].r, samples[i + 1].r];
      if (b >= a && b > c && b > 20) ext.push({ k: 'top', t: samples[i].t });
      if (b <= a && b < c && b < 13) ext.push({ k: 'bottom', t: samples[i].t });
    }
    const gaps = [];
    for (let i = 1; i < ext.length; i += 1) gaps.push(`${ext[i - 1].k}>${ext[i].k}:${(ext[i].t - ext[i - 1].t).toFixed(2)}`);
    const inOk = gaps.filter((g) => g.startsWith('bottom>top')).every((g) => Math.abs(Number(g.split(':')[1]) - 4) <= 0.3);
    const outOk = gaps.filter((g) => g.startsWith('top>bottom')).every((g) => Math.abs(Number(g.split(':')[1]) - 6) <= 0.3);
    pass('wind-down: 4 seconds in and 6 seconds out (measured)', gaps.length >= 3 && inOk && outOk, gaps.join(' '));
    const rs = samples.map((s) => s.r);
    pass('wind-down: the orb fills and empties', Math.max(...rs) > 23.5 && Math.min(...rs) < 9.5, `${Math.min(...rs)} to ${Math.max(...rs)}`);
    await shot(page, 'wind-2-breathe');
    // It ends by itself after 5 minutes.
    await page.clock.resume();
    await page.clock.fastForward(5 * 60 * 1000);
    pass('wind-down: the breathing ends by itself after 5 minutes', Boolean(await until(async () => (await heading(page)) === 'Sleep well', 10000)), await heading(page));
    pass('wind-down: Sleep well uses the night colours', await page.locator('.ds-guide').evaluate((e) => e.classList.contains('ds-night')));
    const end = await seen(page, '.ds-guide-scroll');
    pass('wind-down: Sleep well shows exactly its three lines and Back to Home', end === 'Sleep well Your thoughts are saved for the morning. Plan my day will have them ready. Back to Home', end);
    pass('wind-down: no list and nothing to act on', (await page.locator('.ds-guide-scroll :is(ul, ol, li, input, textarea, [role=checkbox], a)').count()) === 0
      && (await page.locator('.ds-guide-scroll button').count()) === 1);
    const back = page.locator('.ds-end-action button');
    pass('wind-down: Back to Home is outlined, not coral', /ds-btn--outline/.test(await back.getAttribute('class')) && !/255, 111, 92|194, 65, 46/.test(await back.evaluate((b) => getComputedStyle(b).backgroundColor)));
    pass('wind-down: Wednesday night is marked as used', Boolean((await nightKeys(page))[WED]?.finishedAt));
    await shot(page, 'wind-3-sleep-well');
    await back.click();
    await until(async () => new URL(page.url()).pathname === '/welcome', 10000);
    await page.locator('.home-page .ds-page-title').waitFor({ timeout: 20000 });
    await sleep(800);
    pass('Home stops offering the wind-down once used', !((await page.locator('.ds-suggest-question').allInnerTexts()).join() || '').includes('Ready to wind down?'));

    // 3. The next morning.
    if (part(3)) {
      await at(page, THU, '08:30');
      await toDoStep(page);
      pass('morning: "Choose up to 3."', (await page.locator('.ds-guide-nudge').allInnerTexts()).join('|') === 'Choose up to 3.');
      const titles = await page.locator('.ds-pick-group-title').allInnerTexts();
      pass('morning: one Carried over list, then This week', titles.join('|') === 'Carried over|This week', titles.join('|'));
      const carried = await groupRows(page, 0);
      pass('morning: Review my day’s things first, then last night’s thoughts, duplicates merged',
        JSON.stringify(carried.map((r) => r.name)) === JSON.stringify(CARRIED.map((c) => c[0])), carried.map((r) => r.name).join(' | '));
      // Tomorrow's priorities are numbered (Tim, 5 Nov): "Priority 1" comes before the source line.
      const source = (line) => String(line || '').replace(/^Priority \d+\s*/, '');
      pass('morning: the priorities from Review my day are numbered', carried.slice(0, 3).every((r, i) => String(r.line).startsWith(`Priority ${i + 1}`)), carried.map((r) => r.line).join(' | '));
      pass('morning: each says where it came from', JSON.stringify(carried.map((r) => source(r.line))) === JSON.stringify(CARRIED.map((c) => c[1])), carried.map((r) => r.line).join(' | '));
      pass('morning: "You’ve chosen 0 of 3."', (await page.locator('.ds-pick-count').innerText()).trim() === 'You’ve chosen 0 of 3.');
      await shot(page, 'morning-carried');
      // Pick three carried things; a fourth is refused.
      const row = (name) => page.locator('.ds-pick-group').first().locator('.ds-answer--pick', { hasText: name });
      for (const n of [0, 2, 3]) {
        await row(CARRIED[n][0]).click();
        await until(async () => (await row(CARRIED[n][0]).getAttribute('aria-pressed')) === 'true', 10000);
        await sleep(450);
      }
      pass('morning: three chosen', (await page.locator('.ds-pick-count').innerText()).trim() === 'You’ve chosen 3 of 3.', await page.locator('.ds-pick-count').innerText());
      pass('morning: the fourth is greyed out', await row(CARRIED[1][0]).isDisabled());
      await row(CARRIED[1][0]).click({ force: true, timeout: 2000 }).catch(() => null);
      await sleep(600);
      pass('morning: a fourth is refused', (await page.locator('.ds-pick-count').innerText()).trim() === 'You’ve chosen 3 of 3.' && (await row(CARRIED[1][0]).getAttribute('aria-pressed')) === 'false');
      const made = await until(async () => {
        const r = (await db.from('todos').select('text, source, source_id, created_on, planned_week, deleted_at').eq('user_id', me).eq('created_on', THU).is('deleted_at', null)).data || [];
        return r.length === 3 ? r : null;
      }, 15000) || [];
      const by = (t) => made.find((m) => m.text === t);
      pass('morning: a merged thing became a to-do from Review my day', by(CARRIED[0][0])?.source === 'review_my_day' && by(CARRIED[0][0])?.source_id === reviewId, JSON.stringify(made));
      pass('morning: a review thing became a to-do from Review my day', by(CARRIED[2][0])?.source === 'review_my_day', JSON.stringify(made));
      // sleep_wind_down once 039 has run (it has on the test project since 3 Nov), other_tool before.
      pass('morning: a wind-down thought became a to-do from Sleep wind down', ['sleep_wind_down', 'other_tool'].includes(by(CARRIED[3][0])?.source) && by(CARRIED[3][0])?.source_id === null, JSON.stringify(made));
      pass('morning: each made once', made.length === 3, String(made.length));
      const after = await groupRows(page, 0);
      pass('morning: chosen things stay carried over, with their source', JSON.stringify(after.map((r) => source(r.line))) === JSON.stringify(CARRIED.map((c) => c[1])), after.map((r) => `${r.name}: ${r.line}`).join(' | '));
      // Unchosen the same morning: the to-do goes again.
      await row(CARRIED[3][0]).click();
      const gone = await until(async () => {
        const r = (await db.from('todos').select('deleted_at').eq('user_id', me).eq('created_on', THU).eq('text', CARRIED[3][0]).single()).data;
        return r?.deleted_at ? r : null;
      }, 15000);
      pass('morning: a wind-down thought unchosen the same morning leaves the sprint again', Boolean(gone));
    }
  } catch (e) {
    await shot(page, 'fail-part-2');
    throw e;
  } finally {
    await context.close();
  }
  await db.from('todos').delete().eq('user_id', me).eq('created_on', THU).in('source', ['review_my_day', 'other_tool', 'sleep_wind_down']);
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
}

// ---------------------------------------------------------------- 4. After midnight
if (part(4)) {
  // A fresh night: since 039, the night finished in part 2 is on the
  // database too and a new device brings it back (as it should).
  await db.from('wind_down_nights').delete().eq('user_id', me).eq('night', WED);
  const { context, page } = await signedIn({ width: 390, mode: 'light', day: THU, time: '00:30' });
  try {
    await openWindDown(page);
    await typeThoughts(page, ['Ring the dentist']);
    await sleep(800);
    pass('00:30: the wind-down is for the night before', JSON.stringify((await nightKeys(page))[WED]?.thoughts) === '["Ring the dentist"]', JSON.stringify(await nightKeys(page)));
    await at(page, THU, '03:59');
    await openWindDown(page);
    pass('03:59: still the night before, its thoughts back', (await page.getByRole('textbox', { name: 'Thought 1' }).inputValue()) === 'Ring the dentist');
    await at(page, THU, '04:00');
    await openWindDown(page);
    pass('04:00: a new night starts, empty', (await page.getByRole('textbox', { name: 'Thought 1' }).inputValue()) === '');
    await typeThoughts(page, ['Thursday night thought']);
    await sleep(800);
    pass('04:00: kept for Thursday', JSON.stringify((await nightKeys(page))[THU]?.thoughts) === '["Thursday night thought"]', JSON.stringify(await nightKeys(page)));
    await at(page, THU, '08:30');
    await toDoStep(page);
    const carried = (await groupRows(page, 0)).map((r) => r.name);
    pass('the morning after 00:30 has it; the 04:00 one waits for Friday', carried.includes('Ring the dentist') && !carried.includes('Thursday night thought'), carried.join(' | '));
  } finally {
    await context.close();
  }
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
}

// ---------------------------------------------------------------- 5. Reduced motion, and Level
if (part(5)) {
  const { context, page } = await signedIn({ reduced: true, time: '22:40' });
  try {
    await openWindDown(page);
    await sleep(600); // the tool ignores a tap in its first moment
    await page.locator('.ds-guide-skip').click();
    await page.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 });
    const t0 = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(t0 + 200);
    const s = [];
    for (let i = 0; i < 24; i += 1) {
      await page.clock.runFor(500);
      s.push(await orbR(page));
    }
    pass('reduced motion: nothing grows or shrinks (half a breath)', s.every((x) => Math.abs(x.r - 16.5) < 0.01), s.map((x) => x.r).join(','));
    pass('reduced motion: it fades brighter and dimmer with the breath', Math.max(...s.map((x) => x.o)) - Math.min(...s.map((x) => x.o)) > 0.3);
    const anim = await page.locator('.ds-guide-page').evaluate((e) => getComputedStyle(e).animationName);
    pass('reduced motion: no slide between screens', !/from-right|from-left/.test(anim), anim);
    await page.clock.resume();
    // Level, the other style: the person's choice is used here too.
    await page.evaluate(() => { localStorage.setItem('clarity-orb-style', 'level'); });
    await openWindDown(page);
    await sleep(600); // the tool ignores a tap in its first moment
    await page.locator('.ds-guide-skip').click();
    await page.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 });
    pass('the person’s Level choice is used at night', (await page.locator('.ds-night-breathe .ds-borb').getAttribute('data-orb-style')) === 'level'
      && /level rises/.test(await page.locator('.ds-night-breathe .ds-borb').getAttribute('aria-label')));
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------- 6. 360px, dark and light
if (part(6)) {
  for (const mode of ['dark', 'light']) {
    const { context, page } = await signedIn({ width: 360, mode, time: '22:45' });
    try {
      await openWindDown(page);
      await typeThoughts(page, ['A long thought about the Harbour leadership workshop and who should be in the room for it']);
      pass(`360 ${mode}: Tomorrow has no sideways scrolling`, await noSideways(page));
      pass(`360 ${mode}: Tomorrow's tap areas are 44px`, (await smallTaps(page)).length === 0, (await smallTaps(page)).join(', '));
      const bg = await page.locator('.ds-guide').evaluate((e) => getComputedStyle(e).backgroundColor);
      await page.locator('.ds-guide-next').click();
      await page.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 });
      const night = await page.locator('.ds-guide').evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e).color }));
      const want = mode === 'dark' ? { bg: 'rgb(0, 0, 0)', fg: 'rgb(163, 163, 160)' } : { bg: 'rgb(239, 237, 232)', fg: 'rgb(74, 74, 73)' };
      pass(`360 ${mode}: the night colours are the mode's own, one step quieter`, night.bg === want.bg && night.fg === want.fg, `${JSON.stringify(night)} (day ${bg})`);
      pass(`360 ${mode}: the breathing has no sideways scrolling`, await noSideways(page));
      pass(`360 ${mode}: the orb is 190px on a phone`, Math.round((await page.locator('.ds-night-breathe .ds-borb').boundingBox()).width) === 190);
      await shot(page, `w360-${mode}-breathe`);
      await page.getByRole('button', { name: 'End early' }).click();
      await until(async () => (await heading(page)) === 'Sleep well', 8000);
      pass(`360 ${mode}: Sleep well has no sideways scrolling`, await noSideways(page));
      pass(`360 ${mode}: Sleep well's tap areas are 44px`, (await smallTaps(page)).length === 0, (await smallTaps(page)).join(', '));
      await shot(page, `w360-${mode}-sleep-well`);
      await at(page, THU, '08:30');
      await toDoStep(page);
      pass(`360 ${mode}: Carried over has no sideways scrolling`, await noSideways(page));
      pass(`360 ${mode}: Carried over's tap areas are 44px`, (await smallTaps(page)).length === 0, (await smallTaps(page)).join(', '));
      await shot(page, `w360-${mode}-carried`);
    } finally {
      await context.close();
    }
  }
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
}

// ---------------------------------------------------------------- 7. Offline
if (part(7)) {
  const writes = [];
  const { context, page } = await signedIn({
    width: 390,
    time: '22:50',
    onRequest: (r) => { if (r.url().includes(TEST_HOST) && r.method() !== 'GET' && r.method() !== 'HEAD') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); },
  });
  try {
    await openWindDown(page);
    await context.setOffline(true);
    pass('offline: the thoughts still save, on the device', Boolean(await typeThoughts(page, ['Offline thought one'])));
    await page.locator('.ds-guide-next').click();
    await page.getByRole('button', { name: 'End early' }).click();
    await until(async () => (await heading(page)) === 'Sleep well', 8000);
    pass('offline: Sleep well, with the thoughts kept', (await heading(page)) === 'Sleep well' && JSON.stringify((await nightKeys(page))[WED]?.thoughts) === '["Offline thought one"]');
    pass('offline: nothing about the wind-down was sent anywhere', !writes.some((w) => /wind/i.test(w)), writes.join(', '));
    await context.setOffline(false);
    await at(page, THU, '08:40');
    await toDoStep(page);
    const carried = await groupRows(page, 0);
    pass('offline: the next morning has the thought once', carried.filter((r) => r.name === 'Offline thought one').length === 1, carried.map((r) => r.name).join(' | '));
    await context.setOffline(true);
    await page.locator('.ds-pick-group').first().locator('.ds-answer--pick', { hasText: 'Offline thought one' }).click();
    pass('offline: chosen with no connection, it will sync', Boolean(await until(async () => (await page.locator('.ds-guide-bar').innerText()).includes('Will sync'), 10000)));
    await context.setOffline(false);
    const sent = await until(async () => {
      const r = (await db.from('todos').select('id, source').eq('user_id', me).eq('text', 'Offline thought one').is('deleted_at', null)).data || [];
      return r.length ? r : null;
    }, 30000) || [];
    await sleep(3000);
    const again = (await db.from('todos').select('id').eq('user_id', me).eq('text', 'Offline thought one')).data || [];
    pass('offline: back online, it is sent exactly once', sent.length === 1 && again.length === 1 && ['sleep_wind_down', 'other_tool'].includes(sent[0].source), JSON.stringify(again));
  } finally {
    await context.close();
  }
  await db.from('todos').delete().eq('user_id', me).eq('text', 'Offline thought one');
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
}

// ---------------------------------------------------------------- 8. Measured against M19
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;
const MEASURE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(s.fontSize), ls: parseFloat(s.letterSpacing) || 0, ff: s.fontFamily.split(',')[0].replace(/["']/g, ''), color: s.color, bg: s.backgroundColor, tt: s.textTransform, ta: s.textAlign };
};
// [what, screen, mock selector in the frame, app selector, fields, known difference]
const PARTS = [
  ['Sleep well title', 'night', '.gn h2', '.ds-end-title', ['fs', 'ls', 'ff', 'tt', 'ta', 'color']],
  ['Sleep well line', 'night', '.gn p', '.ds-end-line', ['fs', 'ff', 'color']],
  ['Sleep well button', 'night', '.gn .ghost', '.ds-end-action button', ['h', 'tt'], 'The shared outlined button is 48px, as M19 .ghost.'],
  ['night background', 'night', '.frame', '.ds-guide', ['bg', 'color']],
  ['night orb', 'breathe', '.orbs', '.ds-night-breathe .ds-borb', ['w']],
  ['Work’s done title', 'wdone', '.wd h2', '.ds-end-title', ['fs', 'ls', 'ff', 'tt', 'ta', 'color']],
  ['Work’s done line', 'wdone', '.wd p', '.ds-end-line', ['fs', 'ff', 'color']],
  ['Work’s done button', 'wdone', '.wd .btn', '.ds-end-action button', ['h', 'bg']],
  ['Carried over heading', 'morning', '.grp h5', '.ds-pick-group-title', ['fs', 'ff', 'color']],
  ['source line', 'morning', '.pkrow small', '.ds-pick-group .ds-todo-tag', ['fs', 'color']],
  ['chosen count', 'morning', '.cnt', '.ds-pick-count', ['fs', 'color']],
  ['thought number', 'think', '.trow .n', '.ds-rowlist-n', ['fs', 'color']],
];
function compare(view, mode, what, mock, app, fields, known) {
  if (!mock || !app) {
    pass(`M19 ${view} ${mode}: ${what} found`, false, `mock ${Boolean(mock)}, app ${Boolean(app)}`);
    return;
  }
  const diffs = fields.filter((f) => (typeof mock[f] === 'number' ? Math.abs(mock[f] - app[f]) > 0.6 : mock[f] !== app[f])).map((f) => `${f} ${mock[f]} vs ${app[f]}`);
  if (known && diffs.length) {
    notes.push(`NOTE  M19 ${view} ${mode}: ${what}: ${diffs.join('; ')}. ${known}`);
    pass(`M19 ${view} ${mode}: ${what} (known difference noted)`, true);
    return;
  }
  pass(`M19 ${view} ${mode}: ${what} matches (${fields.join(', ')})`, diffs.length === 0, diffs.join('; '));
}

if (part(8)) {
  if (!existsSync(MOCK)) {
    pass('M19 found (scratchpad copy)', false, MOCK);
  } else {
    for (const mode of ['dark', 'light']) {
      const mp = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
      await mp.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
      await mp.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
        const w = /500/.test(r.request().url()) ? 500 : 400;
        r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
      });
      await mp.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
      await mp.goto(`file://${MOCK}`);
      await mp.evaluate(() => document.fonts.ready);
      await mp.click(`#sw button[data-m="${mode === 'dark' ? 1 : 0}"]`);
      const mock = { desktop: {}, phone: {} };
      for (const screen of ['night', 'breathe', 'wdone', 'morning', 'think']) {
        await mp.click(`#sw button[data-k="${screen}"]`);
        await sleep(300);
        for (const [what, sc, ms] of PARTS) {
          if (sc !== screen) continue;
          mock.desktop[what] = await mp.evaluate(MEASURE, `#dk .frame ${ms === '.frame' ? '' : ms}`.trim());
          mock.phone[what] = await mp.evaluate(MEASURE, `#ph .frame ${ms === '.frame' ? '' : ms}`.trim());
        }
      }
      await mp.close();

      for (const [view, width] of [['desktop', 1280], ['phone', 390]]) {
        const { context, page } = await signedIn({ width, mode, time: '22:55' });
        const app = {};
        try {
          // Tomorrow, the breathing and Sleep well.
          await openWindDown(page);
          await typeThoughts(page, ['Call Evan before 09:00 about the referral']);
          for (const [what, sc, , as] of PARTS) if (sc === 'think') app[what] = await page.evaluate(MEASURE, as);
          await page.locator('.ds-guide-next').click();
          await page.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 });
          for (const [what, sc, , as] of PARTS) if (sc === 'breathe') app[what] = await page.evaluate(MEASURE, as);
          await page.getByRole('button', { name: 'End early' }).click();
          await until(async () => (await heading(page)) === 'Sleep well', 8000);
          for (const [what, sc, , as] of PARTS) if (sc === 'night') app[what] = await page.evaluate(MEASURE, as);
          await shot(page, `m19-${view}-${mode}-sleep-well`);
          // Work's done: the review, closed again.
          await at(page, WED, '21:00');
          await page.goto(`${APP}/my-day/review`);
          await until(async () => /^This was your day/.test(await heading(page)), 20000);
          await sleep(600);
          await page.locator('.ds-guide-next').click();
          await until(async () => (await heading(page)) === 'Ready to close the day?', 8000);
          await sleep(500);
          await page.locator('.ds-guide-next').click();
          await until(async () => (await heading(page)) === 'Work’s done for today', 10000);
          for (const [what, sc, , as] of PARTS) if (sc === 'wdone') app[what] = await page.evaluate(MEASURE, as);
          await shot(page, `m19-${view}-${mode}-work-done`);
          // The morning.
          await at(page, THU, '08:30');
          await toDoStep(page);
          for (const [what, sc, , as] of PARTS) if (sc === 'morning') app[what] = await page.evaluate(MEASURE, as);
          await page.locator('.ds-pick-group').first().locator('.ds-answer--pick').first().click();
          await sleep(1200);
          await shot(page, `m19-${view}-${mode}-morning`);
        } finally {
          await context.close();
        }
        for (const [what, , , , fields, known] of PARTS) compare(view, mode, what, mock[view][what], app[what], fields, known);
      }
      await db.from('todos').delete().eq('user_id', me).eq('created_on', THU).in('source', ['review_my_day', 'other_tool', 'sleep_wind_down']);
      await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
    }
  }
}

await browser.close();
await cleanDays();
seedForReal('--reset');
console.log(results.join('\n'));
if (notes.length) console.log(`\n${notes.join('\n')}`);
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
