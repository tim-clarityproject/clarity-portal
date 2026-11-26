// Polish 1, Stage B, B5: routing and the coach pages Tim walked (25 Nov). LOCAL STAND-IN ONLY (tests/scale/stack.mjs),
// muted, nothing leaves this machine, nothing is written.
//
//   node --import ./tests/scores/register.mjs tests/polish/b5-routing.mjs --app http://localhost:5350 --api http://localhost:54650
//
// 1. /account goes to My Account, with its query and hash.
// 2. A client opening /coach goes Home: at once on a device that knows them, and on a first visit never through a blank
//    page (the turning crosshair until the role's answer), even with a slow database; a coach's first visit still opens
//    the coach portal.
// 3. Coach Today on a phone keeps the example's order (This month, This week, then Needs you and Coaching sessions), one
//    20px gap between every card, 32px from the opening's last line to the first card; never a bare £0 or 0.
// 4. Calendar on a phone: the one drop-down is 44px at the example's width (200px); the main action is Add a session.
// 5. The booking page with no free times keeps its month grid, no day open, and the line under it; it says Discovery call.
import { chromium } from 'playwright';
import { refuseHostedLoad } from '../hosted-guard.mjs';

refuseHostedLoad('The B5 routing check');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://localhost:5173').replace(/\/$/, '');
const API = opt('api', 'http://localhost:54400').replace(/\/$/, '');
for (const u of [APP, API]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname)) { console.error('Local stand-in only.'); process.exit(2); }
const CLIENT = 'local-client@example.com';
const OWNER = 'local-coach-owner@example.com';

const results = [];
const check = (ok, what, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`); };
const sessionOf = async (email) => (await fetch(`${API}/__session?email=${encodeURIComponent(email)}`)).json();
const browser = await chromium.launch({ args: ['--mute-audio'] });

async function open(email, { width = 1280, delay = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, isMobile: width < 600, hasTouch: width < 600 });
  await context.route('**/*', (r) => { const u = new URL(r.request().url()); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || /^(data|blob):/.test(u.protocol) ? r.continue() : r.abort('blockedbyclient'); });
  if (email) {
    const s = await sessionOf(email);
    await context.addInitScript(({ v }) => { try { if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', v); } catch { /* none */ } }, { v: JSON.stringify(s) });
  }
  if (delay) await context.route('**/rest/v1/**', async (r) => { await new Promise((res) => setTimeout(res, delay)); return r.continue(); });
  const page = await context.newPage();
  return { context, page };
}

/** Samples the page every 40ms until `until` or `ms`: whether anything blank showed once the app had drawn. */
async function watch(page, until, ms) {
  const t0 = Date.now();
  let drawn = false;
  let blank = 0;
  let reached = null;
  const where = [];
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(() => ({
      path: location.pathname,
      words: (document.body?.innerText || '').trim().length,
      busy: Boolean(document.querySelector('.ds-loading, .opening, .ds-opening, [role=status][aria-busy=true]')),
      app: Boolean(document.querySelector('#root > *')),
    })).catch(() => null);
    if (st) {
      if (st.app) drawn = true;
      if (drawn && !st.words && !st.busy) { blank += 1; where.push(`${Date.now() - t0}ms ${st.path}`); }
      if (reached === null && until(st.path)) reached = Date.now() - t0;
      if (reached !== null && st.words) break;
    }
    await page.waitForTimeout(40);
  }
  return { blank, reached, where };
}

// 1. /account
{
  const { context, page } = await open(CLIENT);
  await page.goto(`${APP}/account?tab=look#appearance`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  const u = new URL(page.url());
  check(u.pathname === '/my-account' && u.search === '?tab=look' && u.hash === '#appearance', '/account goes to My Account with its query and hash', `${u.pathname}${u.search}${u.hash}`);
  await context.close();
}

// 2. A client opening /coach.
{
  const { context, page } = await open(CLIENT, { delay: 1500 });
  page.goto(`${APP}/coach`).catch(() => {});
  const r = await watch(page, (p) => p === '/welcome', 9000);
  check(r.reached !== null, 'a first visit with a slow database goes Home', `${r.reached} ms`);
  check(r.blank === 0, 'a first visit never shows a blank page on its way Home', `${r.blank} blank samples ${r.where.join(' ')}`);
  await context.unroute('**/rest/v1/**');
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  await page.goto(`${APP}/coach`, { waitUntil: 'commit' }).catch(() => {});
  const back = await watch(page, (p) => p === '/welcome', 5000);
  check(back.reached !== null && back.reached < 1500, 'the next visit on that device goes Home at once', `${back.reached} ms`);
  check(back.blank === 0, 'and shows nothing blank', `${back.blank} blank samples ${back.where.join(' ')}, ${Date.now() - t0} ms`);
  await context.close();
}
{
  const { context, page } = await open(OWNER, { delay: 800 });
  page.goto(`${APP}/coach`).catch(() => {});
  const r = await watch(page, () => false, 6000);
  const frame = await page.locator('.ds-frame-root .ds-menu, .cc-app').count();
  check(new URL(page.url()).pathname === '/coach' && frame > 0, 'a coach’s first visit still opens the coach portal', new URL(page.url()).pathname);
  check(r.blank <= 3, 'with at most a moment between the crosshair and the portal', `${r.blank} blank samples ${r.where.join(' ')}`);
  await context.close();
}

// 3. Today on a phone.
{
  const { context, page } = await open(OWNER, { width: 390 });
  await page.goto(`${APP}/coach`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  const order = await page.evaluate(() => [...document.querySelectorAll('.cc-today-cols .ds-card')].map((c) => ({ label: c.querySelector('.ds-label')?.textContent.trim(), top: c.getBoundingClientRect().top, bottom: c.getBoundingClientRect().bottom })));
  const at = (l) => order.findIndex((c) => (c.label || '').toLowerCase() === l);
  const needs = at('needs you'); const month = at('this month'); const week = at('this week');
  check(needs >= 0 && week >= 0 && order[week].top < order[needs].top && (month < 0 || order[month].top < order[week].top), 'Today on a phone keeps the example\u2019s order: This month, This week, then Needs you', order.map((c) => c.label).join(', '));
  const sorted = [...order].sort((a, b) => a.top - b.top);
  const gaps = sorted.slice(1).map((c, i) => Math.round(c.top - sorted[i].bottom));
  check(gaps.length > 0 && gaps.every((g) => g === 20), 'one 20px gap between every card', gaps.join(', '));
  const lead = await page.evaluate(() => { const q = document.querySelector('.cc-today-quiet') || document.querySelector('#cc-main .ds-open'); const first = Math.min(...[...document.querySelectorAll('#cc-main .ds-card')].map((c) => c.getBoundingClientRect().top)); return Math.round(first - q.getBoundingClientRect().bottom); });
  check(lead === 32, '32px from the opening to the first card', `${lead}px`);
  const figures = await page.evaluate(() => [...document.querySelectorAll('.cc-today-month .ds-fig, .cc-today-week .ds-li-value')].map((e) => e.textContent.trim()));
  check(!figures.some((f) => /^(£0|0)$/.test(f)), 'never a bare £0 or 0 on This month or This week', figures.join(' | '));
  await context.close();
}

// 4. Calendar on a phone.
{
  const { context, page } = await open(OWNER, { width: 390 });
  await page.goto(`${APP}/coach/calendar`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  const dd = await page.evaluate(() => { const r = document.querySelector('.cc-cal-filter .ds-dd')?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; });
  check(dd && dd.h === 44 && dd.w === 200, 'the All types drop-down is 44px high at the example\u2019s 200px', JSON.stringify(dd));
  check((await page.locator('#cc-main .ds-open-act .ds-btn--primary').textContent().catch(() => '')) === 'Add a session', 'the Calendar\u2019s main action is Add a session');
  const before = await page.locator('.cc-cal-settings a, .cc-cal-settings button').count();
  await page.locator('.cc-cal-settings-link').click();
  await page.waitForTimeout(300);
  const after = await page.locator('.cc-cal-settings button').allInnerTexts();
  check(before === 0 && after.join(', ') === 'Add to calendar, Working hours, Set my open times, Offer times by email, My calendars', 'its settings sit behind one Calendar settings link', after.join(', '));
  await context.close();
}

// 5. The booking page with no free times.
{
  const owner = await sessionOf(OWNER);
  const anon = (await (await fetch(`${API}/__session?email=${encodeURIComponent(OWNER)}`)).json()).access_token;
  const types = await (await fetch(`${API}/rest/v1/coach_call_types?select=key,name,page_key`, { headers: { apikey: anon, Authorization: `Bearer ${owner.access_token}` } })).json().catch(() => []);
  const disco = Array.isArray(types) ? types.find((t) => t.key === 'chemistry') : null;
  check(Boolean(disco) && disco.name === 'Discovery call', 'the first call type is the Discovery call', disco?.name || 'none');
  if (disco?.page_key) {
    const { context, page } = await open(null, { width: 390 });
    await page.route('**/rest/v1/rpc/booking_free_times', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(`${APP}/book/${disco.page_key}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);
    const grid = await page.locator('.ds-cal').count();
    const openDays = await page.locator('.ds-cal-day:not([disabled]):not([aria-disabled=true])').count();
    const words = await page.locator('.cc-book-none').textContent().catch(() => '');
    check(grid === 1, 'with no free times the month grid stays');
    check(openDays === 0, 'with no day open', `${openDays} open`);
    check(/no free times/i.test(words || ''), 'and the line under it says so', words);
    check(/Discovery call/.test(await page.locator('h1').first().textContent().catch(() => '')), 'the page says Discovery call');
    const label = (await page.locator('.ds-open-label').first().textContent().catch(() => '')) || '';
    check(/^Alex Morgan$/.test(label.trim()) && !/^With /.test(label), 'the small line above the title is the coach\u2019s full name from Settings, never "With …"', label);
    await context.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} of ${results.length} FAILED` : `ALL ${results.length} PASSED`);
process.exit(failed ? 1 : 0);
