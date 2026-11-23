// Slide-in panels keep their draft (tidy pass item 3; experience rule 2:
// closing never loses anything). The shared panel's `draftKey`
// (src/components/design/Dialogs.jsx, usePanelDraft.js, src/lib/panelDraft.js),
// in the running app:
//   1. The sprint page's Add to-do: typed, closed with the cross, the page
//      left and opened again: the words are back, with "Draft restored".
//   2. Escape, Cancel and (on a phone) the phone's Back keep it too, and so
//      does a refresh with the panel closed.
//   3. Adding the to-do lets the draft go: the panel opens empty next time.
//   4. The coach portal's Add client (tests/coach stand-ins): typed, closed,
//      the page refreshed, opened again: the name is back.
// Signed in as the invented test client and the test coach on the TEST
// database only, reading: every write is answered here, so nothing is saved
// (every other host, /functions/v1/, /api/ and every email call blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase0e/panel-drafts.mjs
//   APP_URL=http://localhost:5207 to use another server; PARTS=client,coach.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const PARTS = (process.env.PARTS || 'client,coach').split(',');
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `: ${String(detail).slice(0, 200)}` : ''}`); };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');

const browser = await chromium.launch({ args: ['--mute-audio'] });
const writes = [];

/** Reads go to the test project; every write is answered here and listed. */
async function guard(context) {
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url) || (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) || /\/functions\/v1\//.test(url)) return route.abort();
    if (/^https?:\/\/localhost[^/]*\/api\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (url.includes(TEST_HOST) && /\/rest\/v1\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !/\/rpc\//.test(url)) {
      writes.push(`${req.method()} ${new URL(url).pathname}`);
      let body = req.postDataJSON?.() ?? null;
      if (Array.isArray(body)) body = body.map((r) => ({ id: r.id || crypto.randomUUID(), ...r, created_at: '2026-11-22 09:00:00', updated_at: '2026-11-22 09:00:00' }));
      else if (body && typeof body === 'object') body = [{ id: body.id || crypto.randomUUID(), ...body, created_at: '2026-11-22 09:00:00', updated_at: '2026-11-22 09:00:00' }];
      return route.fulfill({ status: req.method() === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body || []) });
    }
    return route.fallback();
  });
}

const restoredToast = async (page) => {
  for (let i = 0; i < 20; i += 1) {
    if ((await page.locator('.ds-toast').allInnerTexts()).some((t) => /Draft restored/.test(t))) return true;
    await sleep(200);
  }
  return false;
};
const panel = (page) => page.locator('[role=dialog]').last();
const panelBox = (page) => panel(page).locator('textarea, input[type=text], input:not([type])').first();
const closed = async (page) => { await panel(page).waitFor({ state: 'detached', timeout: 5000 }).catch(() => null); await sleep(300); };

if (PARTS.includes('client')) for (const phone of [false, true]) {
  const tag = phone ? 'phone' : 'laptop';
  const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: phone ? 'light' : 'dark' });
  await guard(context);
  const page = await context.newPage();
  try {
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(/welcome/, { timeout: 30000 });
    const openAdd = async () => {
      await page.getByRole('button', { name: 'Add to-do', exact: true }).first().click();
      await panelBox(page).waitFor({ timeout: 8000 });
      await sleep(500);
    };
    const toSprint = async () => {
      await page.goto(`${APP}/performance-sprint`);
      await page.getByRole('button', { name: 'Add to-do', exact: true }).first().waitFor({ timeout: 20000 });
      await sleep(800);
    };
    await toSprint();
    const words = `Book the physio ${tag} ${Date.now() % 100000}`;

    // 1. The cross, then away and back.
    await openAdd();
    await panelBox(page).fill(words);
    await panel(page).getByRole('button', { name: 'Close' }).first().click();
    await closed(page);
    await page.goto(`${APP}/welcome`);
    await sleep(1200);
    await toSprint();
    await openAdd();
    pass(`${tag}: closed with the cross, left and opened again, the words are back`, (await panelBox(page).inputValue()) === words, await panelBox(page).inputValue());
    pass(`${tag}: "Draft restored" shows`, await restoredToast(page));

    // 2a. Escape, then a refresh with the panel closed.
    await panelBox(page).fill(`${words} (2)`);
    await page.keyboard.press('Escape');
    await closed(page);
    await page.reload();
    await page.getByRole('button', { name: 'Add to-do', exact: true }).first().waitFor({ timeout: 20000 });
    await sleep(800);
    await openAdd();
    pass(`${tag}: closed with Escape and refreshed, the words are back`, (await panelBox(page).inputValue()) === `${words} (2)`, await panelBox(page).inputValue());

    // 2b. Cancel.
    await panelBox(page).fill(`${words} (3)`);
    await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await closed(page);
    await page.goto(`${APP}/welcome`);
    await sleep(1000);
    await toSprint();
    await openAdd();
    pass(`${tag}: closed with Cancel, the words are back`, (await panelBox(page).inputValue()) === `${words} (3)`, await panelBox(page).inputValue());

    // 2c. The phone's Back closes the panel, not the page, and keeps the words.
    if (phone) {
      await panelBox(page).fill(`${words} (4)`);
      await sleep(400);
      await page.goBack();
      await closed(page);
      pass(`${tag}: the phone's Back closes the panel and stays on the page`, /performance-sprint/.test(page.url()), page.url());
      await page.goto(`${APP}/welcome`);
      await sleep(1000);
      await toSprint();
      await openAdd();
      pass(`${tag}: closed with the phone's Back, the words are back`, (await panelBox(page).inputValue()) === `${words} (4)`, await panelBox(page).inputValue());
    }

    // 3. Adding lets the draft go.
    const strategy = panel(page).locator('[role=radio], .ds-option').first();
    if (await strategy.count()) await strategy.click().catch(() => null);
    const impact = panel(page).getByRole('radio', { name: /Low|Medium|High/ }).first();
    if (await impact.count()) await impact.click().catch(() => null);
    await panel(page).getByRole('button', { name: 'Add to-do', exact: true }).click();
    await closed(page);
    const stillOpen = (await page.locator('[role=dialog]').count()) > 0;
    if (stillOpen) {
      pass(`${tag}: Add to-do closes the panel`, false, (await panel(page).innerText()).replace(/\s+/g, ' ').slice(0, 160));
      await page.keyboard.press('Escape');
    } else {
      await page.goto(`${APP}/welcome`);
      await sleep(1000);
      await toSprint();
      await openAdd();
      pass(`${tag}: once added, the panel opens empty next time`, (await panelBox(page).inputValue()) === '', await panelBox(page).inputValue());
      pass(`${tag}: …with no "Draft restored"`, !(await restoredToast(page)));
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    pass(`${tag}: ran to the end`, false, e.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

if (PARTS.includes('coach')) {
  const { standIn } = await import('../coach/shared.mjs');
  const { asAal2 } = await import('../signin/aal2.mjs');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light', storageState: undefined });
  await guard(context); // under the stand-in: anything it doesn't answer is still kept from the test project
  const page = await context.newPage();
  try {
    // Signed in here, not from the coach suites' saved sign-in (that one is for their own server).
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
    // 053 is real on the test project now: its state is answered as the coach suites' own sign-in answers it (coachContext), so
    // the sign-in isn't sent on to save recovery codes the test coach never made, and nothing of 053 is written.
    await page.route(/\/rest\/v1\/rpc\/coach_(auth_state|authenticator_on|recovery_codes_make|recovery_codes_saved|recovery_code_use|authenticator_reset)(\?|$)/, (route) => route.fulfill({
      status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function in the schema cache' }),
    }));
    await page.route(/\/rest\/v1\/rpc\/(guest_claim|alignment_claim)(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '0' }));
    await asAal2(page, { host: TEST_HOST, totpKey: env.TEST_COACH_OWNER_TOTP_KEY || null });
    await page.goto(`${APP}/coach/sign-in`);
    await page.getByLabel('Email').fill(env.TEST_COACH_OWNER_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(env.TEST_COACH_OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((u) => !/sign-in/.test(u.pathname), { timeout: 30000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await standIn(page, {});
    const toClients = async () => {
      await page.goto(`${APP}/coach/clients`);
      await page.getByRole('button', { name: 'Add client', exact: true }).first().waitFor({ timeout: 20000 });
      await sleep(800);
    };
    await toClients();
    await page.getByRole('button', { name: 'Add client', exact: true }).first().click();
    await panelBox(page).waitFor({ timeout: 8000 });
    await sleep(500);
    await panelBox(page).fill('Priya Raman');
    await sleep(500);
    await panel(page).getByRole('button', { name: 'Close' }).first().click();
    await closed(page);
    await page.reload();
    await toClients();
    await page.getByRole('button', { name: 'Add client', exact: true }).first().click();
    await panelBox(page).waitFor({ timeout: 8000 });
    await sleep(700);
    pass('coach: Add client, closed and refreshed, opens with the name typed', (await panelBox(page).inputValue()) === 'Priya Raman', await panelBox(page).inputValue());
    pass('coach: "Draft restored" shows', await restoredToast(page));
    // Emptied again, nothing is kept.
    await panelBox(page).fill('');
    await sleep(500);
    await page.keyboard.press('Escape');
    await closed(page);
    await page.getByRole('button', { name: 'Add client', exact: true }).first().click();
    await panelBox(page).waitFor({ timeout: 8000 });
    await sleep(700);
    pass('coach: emptied and closed, it opens empty', (await panelBox(page).inputValue()) === '', await panelBox(page).inputValue());
  } catch (e) {
    pass('coach: ran to the end', false, e.message.split('\n')[0]);
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(results.join('\n'));
console.log(`(${writes.length} writes answered here, none sent to the test project.)`);
console.log(`\nPanel drafts: ${results.length - failures} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);
