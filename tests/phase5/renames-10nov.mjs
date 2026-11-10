// The renames of 10 Nov (Tim, 08:55 to 08:57): Plan my day is the Daily
// plan, Review my day the Daily review, the Hardware and Software check-in
// the Monthly Hardware and Software review ("Monthly review" where space is
// tight), and the First check-in the First review.
//
// 1. Every old address opens its new one, with whatever follows it (a day,
//    a month, a month's answers), its query and its hash.
// 2. The new names show on Home, the hubs, the menu's pins, the sprint
//    page, My Plans and My Reviews, the dashboard and the tools themselves,
//    and none of those pages shows an old name.
// 3. The browser tab carries each page's full name.
// 4. A tile and Home's card give the same time for a tool, and the tools'
//    first screens show no time.
//
// Signed in as the invented test client on the TEST database only, on the
// fixed day; every other host and every email call is blocked.
//
//   node --import ./tests/scores/register.mjs tests/phase5/renames-10nov.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
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

console.log(`Fixed day: ${fixedLabel()}`);
seedFixed('--reset');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light' });
await fixClock(context);
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\//.test(url)) return route.abort();
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', (e) => pass('no page errors', false, e.message));
await page.goto(`${APP}/auth/login`);
await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForURL(/welcome/, { timeout: 30000 });

const where = () => { const u = new URL(page.url()); return `${u.pathname}${u.search}${u.hash}`; };
const lands = (want, ms = 15000) => until(() => where() === want, ms);
const OLD = /plan my day|review my day|hardware and software check-in|monthly check-in|first check-in/i;
const settle = async () => { await page.waitForLoadState('networkidle').catch(() => null); await sleep(700); };
const words = async () => page.evaluate(() => document.body.innerText);

try {
  // 1. Old addresses.
  const month = FIXED_TODAY.slice(0, 7);
  const MOVES = [
    ['/my-day/plan', '/daily-plan'],
    [`/my-day/plan/${FIXED_TODAY}`, `/daily-plan/${FIXED_TODAY}`],
    ['/my-day/plan?from=email#top', '/daily-plan?from=email#top'],
    ['/my-day/review', '/daily-review'],
    [`/my-day/review/${FIXED_TODAY}?x=1`, `/daily-review/${FIXED_TODAY}?x=1`],
    ['/check-in', '/monthly-review'],
    [`/check-in/${month}`, `/monthly-review/${month}`],
    [`/check-in/${month}/answers`, `/monthly-review/${month}/answers`],
    ['/plan-my-day', '/daily-plan'],
    ['/review-plan', '/daily-review'],
  ];
  for (const [from, to] of MOVES) {
    await page.goto(`${APP}${from}`);
    pass(`${from} opens ${to}`, Boolean(await lands(to)), where());
  }
  // The life balance review's and Recovery's own check-ins keep their addresses.
  await page.goto(`${APP}/life-balance-review/check-in`);
  await settle();
  pass('/life-balance-review/check-in stays where it is', new URL(page.url()).pathname.startsWith('/life-balance-review'), where());

  // 2 and 3. The names, and the tab.
  const PAGES = [
    ['/welcome', 'Home, The Clarity Portal', null],
    ['/personal/plan', 'Plan, The Clarity Portal', /Daily plan/],
    ['/personal/review', 'Review, The Clarity Portal', /Daily review[\s\S]*Monthly Hardware and Software review/],
    ['/performance-sprint', 'Performance Sprint, The Clarity Portal', null],
    ['/dashboard', 'Individual Performance Dashboard, The Clarity Portal', null],
    ['/my-plans', 'My Plans, The Clarity Portal', null],
    ['/my-reviews', 'My Reviews, The Clarity Portal', null],
    ['/performance-plan', 'Individual Performance Plan, The Clarity Portal', null],
    ['/my-account', 'My Account, The Clarity Portal', null],
    ['/daily-plan', 'Daily plan, The Clarity Portal', /Daily plan/i],
    ['/daily-review', 'Daily review, The Clarity Portal', /Daily review/i],
    ['/monthly-review', 'Monthly Hardware and Software review, The Clarity Portal', /Monthly review/i],
  ];
  for (const [path, tab, has] of PAGES) {
    await page.goto(`${APP}${path}`);
    await settle();
    const text = await words();
    const old = OLD.exec(text);
    pass(`${path}: no old name on the page`, !old, old ? `"${old[0]}"` : '');
    if (has) pass(`${path}: the new name shows`, has.test(text), text.slice(0, 200).replace(/\n/g, ' | '));
    pass(`${path}: the tab reads "${tab}"`, (await page.title()) === tab, await page.title());
  }
  // The desktop menu and the phone's tile menu.
  await page.goto(`${APP}/welcome`);
  await settle();
  await page.locator('.hdr-menu').click();
  await page.waitForSelector('#site-menu .ds-dmenu-area');
  pass('the menu: no old name', !OLD.test(await page.locator('#site-menu').innerText()));
  await page.keyboard.press('Escape');

  // 4. One time per tool: the tile, Home's card and nothing on the first screen.
  await page.goto(`${APP}/personal/plan`);
  await settle();
  const tileTime = async (name) => page.evaluate((n) => {
    const tile = [...document.querySelectorAll('.ds-hub-tile')].find((t) => t.querySelector('.ds-hub-tile-name')?.textContent.trim() === n);
    return tile?.querySelector('.ds-hub-tile-foot')?.textContent.trim() || null;
  }, name);
  const planTile = await tileTime('Daily plan');
  await page.goto(`${APP}/personal/review`);
  await settle();
  const reviewTile = await tileTime('Daily review');
  const monthTile = await tileTime('Monthly Hardware and Software review');
  pass('the tiles give a time for each', /^~\d+ minutes$/.test(planTile || '') && /^~\d+ minutes$/.test(reviewTile || '') && /^~\d+ minutes$/.test(monthTile || ''), `${planTile} / ${reviewTile} / ${monthTile}`);
  const cardAt = async (time) => {
    await page.clock.setSystemTime(new Date(`${FIXED_TODAY}T${time}:00+01:00`));
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
    await settle();
    return page.evaluate(() => ({
      question: document.querySelector('.ds-suggest-question')?.textContent.trim() || '',
      time: document.querySelector('.ds-suggest-time')?.textContent.trim() || '',
      button: document.querySelector('.ds-suggest .ds-btn--primary')?.textContent.trim() || '',
    }));
  };
  const morning = await cardAt('08:30');
  if (/plan your day/i.test(morning.question)) {
    pass('Home 08:30: the card’s button is Start my daily plan', /^start my daily plan$/i.test(morning.button), morning.button);
    pass('Home 08:30: the card gives the tile’s time', morning.time === planTile, `${morning.time} vs ${planTile}`);
  } else pass('Home 08:30: the card is the monthly review’s turn or the plan’s', /monthly review|first review/i.test(morning.question), morning.question);
  const evening = await cardAt('17:30');
  if (/review your day/i.test(evening.question)) {
    pass('Home 17:30: the card’s button is Start my daily review', /^start my daily review$/i.test(evening.button), evening.button);
    pass('Home 17:30: the card gives the tile’s time', evening.time === reviewTile, `${evening.time} vs ${reviewTile}`);
  } else pass('Home 17:30: the card is another tool’s turn (the monthly review or the debrief)', /monthly review|first review|this week/i.test(evening.question), evening.question);
  for (const [path, name] of [['/daily-plan', 'Daily plan'], ['/daily-review', 'Daily review'], ['/monthly-review', 'Monthly review'], ['/performance-sprint/debrief', 'Weekly performance debrief']]) {
    await page.goto(`${APP}${path}`);
    await settle();
    const text = await words();
    pass(`${name}: no time on its first screen`, !/~\s?\d+ minutes?/.test(text), (/[^\n]*~\s?\d+ minutes?[^\n]*/.exec(text) || [''])[0]);
  }
} catch (e) {
  pass('ran to the end', false, e.message.split('\n')[0]);
}

await browser.close();
seedForReal('--reset');
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
