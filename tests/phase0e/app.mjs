// Phase 0e checks in the running app, signed in as the invented test client
// on the TEST database only (every other database is blocked).
//
//   node tests/phase0e/app.mjs [folder for screenshots]
//
// Needs the dev server running against the test database. The test account
// comes from ~/.clarity-test-accounts.env and is never printed.
//  1. Offline: the calm message within 2 seconds; a list opens from the
//     device's copy; typing, saving and the network going off and on
//     mid-way lose nothing ("Will sync", then "Saved").
//  2. Drafts: typing comes back after a refresh, with "Draft restored".
//  3. Staying signed in when the sign-in refresh can't reach the server.
//  4. No sideways scrolling at 390px on the pages touched in Phase 0e.
//  5. The largest text size (twice the standard): no page scrolls sideways.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
let wrongHost = false;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};
const stamp = `Phase 0e check ${new Date().toISOString().slice(11, 19)}`;

function testAccount() {
  const env = {};
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return { email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD };
}

const browser = await chromium.launch();

async function signedIn(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB', timezoneId: 'Europe/London', ...options });
  await context.route(/supabase\.co/, (route) => {
    if (!route.request().url().includes(TEST_HOST)) {
      wrongHost = true;
      return route.abort();
    }
    return route.fallback();
  });
  const page = await context.newPage();
  const { email, password } = testAccount();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page };
}

// Moves inside the app the way a tap on a link does (no page load).
async function goInside(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function within(ms, fn) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return Date.now() - start;
    await new Promise((r) => { setTimeout(r, 50); });
  }
  return null;
}

// ---- 1 and 2: offline, saves and drafts ------------------------------------------
// On a laptop: on a phone the long boxes open focus mode, which has its own test.
{
  const { context, page } = await signedIn({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  // A list seen once opens from the device, even offline.
  await page.goto(`${APP}/my-plans`);
  await page.locator('.hlist-wrap, .ds-empty').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const rowsOnline = await page.locator('.hlist-row, [class*="hlist-row"]').count();
  await goInside(page, '/welcome');
  await page.waitForTimeout(500);
  await context.setOffline(true);
  const notice = await within(2000, () => page.locator('.ds-connection').isVisible());
  pass('Offline: the calm message shows within 2 seconds', notice != null, notice != null ? `${notice}ms` : 'not shown');
  const words = notice != null ? await page.locator('.ds-connection').innerText() : '';
  pass('Offline: the message reads in plain words', /You’re offline\. What you do is kept on this device and sent when you’re back online\./.test(words), words);
  await goInside(page, '/my-plans');
  const listed = await within(2000, async () => (await page.locator('.hlist-wrap').count()) > 0 && (await page.locator('.ds-loading').count()) === 0);
  const rowsOffline = await page.locator('.hlist-row, [class*="hlist-row"]').count();
  pass('Offline: My Plans opens at once from the device', listed != null && rowsOffline === rowsOnline && (await page.locator('.hlist-error').count()) === 0,
    `${listed}ms, ${rowsOffline} of ${rowsOnline} rows`);
  if (out) await page.screenshot({ path: join(out, 'offline-my-plans.png') });
  await context.setOffline(false);
  const gone = await within(8000, async () => !(await page.locator('.ds-connection').isVisible()));
  pass('Back online: the message goes', gone != null, gone != null ? `${gone}ms` : 'still showing');

  // Journal: typing survives a refresh, with "Draft restored".
  await page.goto(`${APP}/daily-journal`);
  const box = page.locator('textarea').last();
  await box.waitFor({ timeout: 20000 });
  const before = await box.inputValue();
  await box.click();
  await box.press('End');
  await box.type(` ${stamp}, typed then refreshed.`);
  await page.waitForTimeout(150); // less than the old one-second wait
  await page.reload();
  await page.locator('textarea').last().waitFor({ timeout: 20000 });
  const restoredToast = await within(4000, async () => (await page.locator('.ds-toast').allInnerTexts()).some((t) => /Draft restored/.test(t)));
  const after = await page.locator('textarea').last().inputValue();
  pass('Drafts: Journal typing comes back after a refresh', after.includes(`${stamp}, typed then refreshed.`), '');
  pass('Drafts: "Draft restored" shows', restoredToast != null);

  // Mid-typing and mid-save offline: nothing lost, Will sync then Saved.
  await context.setOffline(true);
  const jbox = page.locator('textarea').last();
  await jbox.click();
  await jbox.press('End');
  await jbox.type(' Typed while offline.');
  await page.getByRole('button', { name: /^save journal$/i }).first().click();
  const willSync = await within(2000, async () => (await page.locator('.ds-status--sync').count()) > 0);
  pass('Offline save, Journal: "Will sync" shows within 2 seconds', willSync != null, willSync != null ? `${willSync}ms` : 'not shown');
  await context.setOffline(false);
  const saved = await within(15000, async () => (await page.locator('.ds-status--saved').count()) > 0);
  pass('Back online, Journal: "Saved" once it has gone', saved != null, saved != null ? `${saved}ms` : 'not shown');
  await page.goto(`${APP}/daily-journal`);
  await page.locator('textarea').last().waitFor({ timeout: 20000 });
  const stored = (await page.locator('textarea').evaluateAll((els) => els.map((e) => e.value))).join(' ');
  pass('Back online, Journal: what was typed offline is on the server', stored.includes('Typed while offline.'));
  // Put today's journal back as it was before the check.
  if (before !== undefined) {
    const last = page.locator('textarea').last();
    await last.fill(before);
    await page.getByRole('button', { name: /^save as draft$/i }).first().click();
    await page.waitForTimeout(1500);
  }

  // Meeting planner: the network drops mid-save.
  await page.goto(`${APP}/plan-meeting`);
  const title = page.getByLabel(/title/i).first();
  await title.waitFor({ timeout: 20000 });
  await title.fill(`${stamp} meeting`);
  await context.setOffline(true);
  await page.getByRole('button', { name: /^save as draft$/i }).first().click();
  const mSync = await within(2000, async () => (await page.locator('.ds-status--sync').count()) > 0);
  pass('Offline save, Meeting planner: "Will sync" shows', mSync != null);
  await context.setOffline(false);
  const mSaved = await within(15000, async () => (await page.locator('.ds-status--saved').count()) > 0);
  pass('Back online, Meeting planner: "Saved" once it has gone', mSaved != null);
  await page.goto(`${APP}/my-plans`);
  const listedMeeting = await within(15000, () => page.getByText(`${stamp} meeting`).first().isVisible().catch(() => false));
  pass('Back online, Meeting planner: the plan is in My Plans', listedMeeting != null);
  // Tidy up: delete the check's own meeting.
  if (listedMeeting != null) {
    const row = page.locator('.hlist-row, [class*="hlist-row"]').filter({ hasText: `${stamp} meeting` }).first();
    await row.getByRole('button', { name: /delete/i }).first().click().catch(() => {});
    await page.getByRole('button', { name: /^delete$/i }).last().click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await context.close();
}

// ---- 3: staying signed in when the refresh can't reach the server --------------------
{
  const { context, page } = await signedIn();
  // A page seen once, so the device holds a copy of it.
  await page.goto(`${APP}/my-plans`);
  await page.locator('.hlist-wrap, .ds-empty').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  // Make the stored session look expired, and stop the refresh reaching the server.
  await page.evaluate(() => {
    const raw = localStorage.getItem('clarity-portal-auth');
    const s = JSON.parse(raw);
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem('clarity-portal-auth', JSON.stringify(s));
  });
  await context.route(/\/auth\/v1\/token/, (route) => route.abort('internetdisconnected'));
  await page.goto(`${APP}/my-plans`);
  await page.waitForTimeout(6000);
  const url = page.url();
  pass('Signed in: a refresh that can’t reach the server keeps the person signed in', !/\/auth\/login/.test(url), url.replace(APP, ''));
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('clarity-cache:') || k.startsWith('clarity-draft:')).length);
  pass('Signed in: nothing on the device was cleared', kept > 0, `${kept} copies kept`);
  await context.close();
}

// ---- 4 and 5: sideways scrolling, at the standard and the largest text size ----------
const PAGES = ['/welcome', '/my-plans', '/my-reviews', '/daily-journals', '/decision-history', '/personal-operating-plan',
  '/daily-journal', '/plan-meeting', '/if-then-planning', '/my-journal', '/review-plan', '/plan-my-day',
  '/stop-doing-audit', '/grow-step-1', '/inversion-step-1', '/tough-conversation-step-1', '/edit-profile',
  '/my-account', '/about', '/wheel-of-life/results', '/wheel-of-life/areas'];
for (const [label, scale] of [['standard text size', 1], ['largest text size (twice the standard)', 2]]) {
  const { context, page } = await signedIn();
  const wide = [];
  for (const path of PAGES) {
    await page.goto(`${APP}${path}`);
    // The device's text-size setting, as a root size (16px is standard).
    if (scale !== 1) await page.addStyleTag({ content: `html{font-size:${16 * scale}px !important}` });
    await page.waitForTimeout(1800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) wide.push(`${path} ${over}px`);
    if (out && scale !== 1) await page.screenshot({ path: join(out, `large-text${path.replace(/\//g, '-')}.png`), fullPage: false });
  }
  const u = await page.evaluate(() => getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('font-size'));
  pass(`No sideways scrolling at 390px, ${label}, ${PAGES.length} pages`, wide.length === 0, wide.join('; ') || `body text ${u}`);
  await context.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} passed`);
if (wrongHost) {
  console.log('STOP: a request went to a database that is not the test project. It was blocked.');
  process.exit(2);
}
process.exit(failures ? 1 : 0);
