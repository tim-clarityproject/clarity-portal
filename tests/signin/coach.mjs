// Coach sign in and the authenticator code (M26; Tim, 11 Nov), in the
// running app on the TEST project only.
//
// The second invented test coach is given a real authenticator factor
// (Supabase's own TOTP) for the length of the test, and it is taken off
// again at the end, whatever happens. Its secret is kept only in a file
// in the system's temporary folder while the test runs, so a run that is
// cut short can be tidied by the next one; it is never printed.
// No setting of the project is changed.
//
//   node tests/signin/coach.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { nextStep, totp } from './totp.mjs';

const env = testEnv();
const { pass, done } = makeChecks();
const KEPT = join(tmpdir(), 'clarity-signin-test-factor.json');
const client = () => createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const signIn = async (db, who) => {
  const { data, error } = await db.auth.signInWithPassword({ email: env[`TEST_${who}_EMAIL`], password: env[`TEST_${who}_PASSWORD`] });
  if (error) throw new Error(`The test ${who.toLowerCase()} could not sign in.`);
  return data;
};

// ---------------------------------------------------------------- set-up: one real factor
const admin = client();
await signIn(admin, 'COACH_TWO');
let secret = null;
let factorId = null;
let usable = true;

async function removeFactor(db, id) {
  const { error } = await db.auth.mfa.unenroll({ factorId: id });
  return !error;
}

// A factor left by a run that was cut short: finish it off first.
{
  const { data } = await admin.auth.mfa.listFactors();
  const all = data?.all || [];
  for (const f of all.filter((x) => x.status !== 'verified')) await removeFactor(admin, f.id);
  const left = all.filter((x) => x.status === 'verified');
  if (left.length) {
    const kept = existsSync(KEPT) ? JSON.parse(readFileSync(KEPT, 'utf8')) : null;
    const mine = kept && left.find((f) => f.id === kept.id);
    if (mine) {
      await nextStep();
      await admin.auth.mfa.challengeAndVerify({ factorId: mine.id, code: totp(kept.secret) });
      await removeFactor(admin, mine.id);
      rmSync(KEPT, { force: true });
      await admin.auth.signOut({ scope: 'local' }).catch(() => null);
      await signIn(admin, 'COACH_TWO');
    } else {
      usable = false;
      pass('the test coach starts with no authenticator', false, 'it already has one that this test did not make: it has been left alone, and Tim can remove it in Supabase');
    }
  }
}

if (usable) {
  const { data, error } = await admin.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Sign-in test ${Date.now()}` });
  if (error) {
    usable = false;
    pass('the test project lets an account set up an authenticator (TOTP)', false, `${error.code || error.status || ''} ${String(error.message || '').slice(0, 120)}`);
  } else {
    factorId = data.id;
    secret = data.totp.secret;
    writeFileSync(KEPT, JSON.stringify({ id: factorId, secret }), { mode: 0o600 });
    const { error: verifyError } = await admin.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    pass('the test project lets an account set up an authenticator (TOTP)', !verifyError, verifyError?.message);
    if (verifyError) usable = false;
  }
}

const browser = await chromium.launch();
const open = async ({ phone = false, width = phone ? 390 : 1280, answers = {} } = {}) => {
  const calls = [];
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', hasTouch: phone, isMobile: phone });
  await guard(ctx, calls, answers);
  const page = await ctx.newPage();
  return { ctx, page, calls };
};
const path = (page) => new URL(page.url()).pathname;
const message = (page) => page.locator('.si-err').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const fill = async (page, who) => {
  await page.locator('input[type=email]').fill(env[`TEST_${who}_EMAIL`]);
  await page.locator('.si-pw input').fill(env[`TEST_${who}_PASSWORD`]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

try {
  // ---------------------------------------------------------------- the coaches' own page
  {
    const { ctx, page } = await open();
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .ds-google');
    pass('Coach sign in has its own address, apart from the clients’ page', path(page) === '/coach/sign-in');
    pass('its one title is Coach sign in, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'coach sign in');
    const words = (await page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
    pass('it has no Create my account link', !/create my account|new here/i.test(words), words.slice(0, 200));
    pass('“Clarity drives performance.” is on Sign in only', !/clarity drives performance/i.test(words));
    const order = await page.evaluate(() => [...document.querySelectorAll('.si-col .ds-google, .si-col .si-field label, .si-col .si-btn, .si-col .si-alt')].map((el) => el.innerText.trim()));
    pass('Continue with Google sits above email, then Sign in and Forgotten your password?', JSON.stringify(order) === JSON.stringify(['Continue with Google', 'Email', 'Password', 'SIGN IN', 'Forgotten your password?']), order.join(' | '));
    await page.getByRole('link', { name: 'Forgotten your password?' }).click();
    await page.waitForURL(/\/forgot-password$/);
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await page.waitForURL(/\/coach\/sign-in$/);
    pass('Back from Forgotten your password returns to the coaches’ page', path(page) === '/coach/sign-in');
    await ctx.close();
  }

  // ---------------------------------------------------------------- a coach with no authenticator yet is not locked out
  {
    const { ctx, page } = await open();
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .ds-google');
    await fill(page, 'COACH_OWNER');
    await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
    pass('a coach with no authenticator set up is let in after the password', path(page) === '/welcome', path(page));
    await ctx.close();
  }

  if (usable) {
    // ---------------------------------------------------------------- the code follows the password
    const { ctx, page } = await open();
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .ds-google');
    await fill(page, 'COACH_TWO');
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
    pass('after the password, a coach with an authenticator is asked for the code', path(page) === '/coach/sign-in/code', path(page));
    await page.getByRole('heading', { name: 'Enter your code' }).waitFor({ timeout: 15000 }).catch(() => null);
    pass('its one title is Enter your code, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'enter your code');
    const box = await page.getByLabel('Code').evaluate((el) => ({ mode: el.getAttribute('inputmode'), auto: el.getAttribute('autocomplete'), max: el.getAttribute('maxlength'), holder: el.getAttribute('placeholder'), value: el.value, size: parseFloat(getComputedStyle(el).fontSize) }));
    pass('the code box: numbers, one-time-code, 6 at most, tied to its label', box.mode === 'numeric' && box.auto === 'one-time-code' && box.max === '6', JSON.stringify(box));
    pass('the code box has no example code in it', !box.holder && box.value === '', JSON.stringify(box));
    pass('the code box’s text is 16px or more', box.size >= 16, `${box.size}`);
    // The portal stays shut until the code is given.
    await page.goto(`${APP}/welcome`);
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 20000 }).catch(() => null);
    pass('the portal stays shut until the code is given (Home sends them back)', path(page) === '/coach/sign-in/code', path(page));
    await page.getByRole('heading', { name: 'Enter your code' }).waitFor({ timeout: 15000 }).catch(() => null);
    // Letters are never taken, and 5 digits isn't a code.
    await page.getByLabel('Code').fill('12a45');
    pass('the code box takes digits only', (await page.getByLabel('Code').inputValue()) === '1245');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    pass('fewer than 6 digits says what to enter', (await message(page)) === '! Enter the 6 digits from your authenticator app.', await message(page));
    // A wrong code.
    await nextStep();
    const right = totp(secret);
    const wrong = right === '000000' ? '111111' : '000000';
    await page.getByLabel('Code').fill(wrong);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForSelector('.si-err');
    pass('a wrong code says what happened, then what to do', (await message(page)) === '! That code doesn’t match. Check your authenticator app and try again.', await message(page));
    pass('and stays on the page, signed in to nothing more', path(page) === '/coach/sign-in/code');
    // The right code.
    await page.getByLabel('Code').fill(totp(secret));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
    pass('the right code signs the coach in to Home', path(page) === '/welcome', `${path(page)} ${await message(page)}`);
    await page.goto(`${APP}/dashboard`);
    await sleep(2500);
    pass('and the portal is open to them', path(page) === '/dashboard', path(page));
    await ctx.close();

    // ---------------------------------------------------------------- the clients' page can't be used to skip it
    {
      const v = await open({ phone: true });
      await v.page.goto(`${APP}/auth/login`);
      await v.page.waitForSelector('.si-col .ds-google');
      await fill(v.page, 'COACH_TWO');
      await v.page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
      pass('signing in on the clients’ page asks the coach for the code too', path(v.page) === '/coach/sign-in/code', path(v.page));
      // "6-digit" never splits across lines, at a phone's width and narrower.
      for (const width of [390, 360, 320]) {
        await v.page.setViewportSize({ width, height: 844 });
        await sleep(150);
        const one = await v.page.locator('.si-nowrap').evaluate((el) => ({ lines: el.getClientRects().length, text: el.textContent, wide: document.documentElement.scrollWidth - innerWidth }));
        pass(`“6-digit” stays on one line at ${width}px`, one.lines === 1 && one.text === '6-digit' && one.wide <= 0, JSON.stringify(one));
      }
      // Lost your authenticator app?
      await v.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
      await v.page.waitForURL(/\/coach\/sign-in\/help$/);
      await v.page.getByText('Ask Tim to reset your code.').waitFor({ timeout: 15000 }).catch(() => null);
      const words = (await v.page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
      pass('“Lost your authenticator app?” opens a calm page: “Ask Tim to reset your code.”', words.includes('Ask Tim to reset your code.'), words);
      pass('it never offers a way round by email', !/email|link|send/i.test(words.replace(/back to sign in/i, '')), words);
      await v.ctx.close();
    }

    // ---------------------------------------------------------------- Google never skips the code
    {
      const again = client();
      const fresh = await signIn(again, 'COACH_TWO');
      const user = { ...fresh.user, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { ...(fresh.user.user_metadata || {}), terms_accepted: true } };
      const answers = {
        'GET /auth/v1/authorize': async ({ url, route }) => {
          const to = new URL(url.searchParams.get('redirect_to'));
          to.searchParams.set('code', 'a-mock-code');
          await route.fulfill({ status: 302, headers: { location: to.href } });
          return 'handled';
        },
        'POST /auth/v1/token': async ({ url }) => (url.searchParams.get('grant_type') === 'pkce' ? { status: 200, body: { ...fresh.session, user } } : 'continue'),
        'GET /auth/v1/user': async () => ({ status: 200, body: user }),
      };
      const v = await open({ answers });
      await v.page.goto(`${APP}/coach/sign-in`);
      await v.page.waitForSelector('.si-col .ds-google');
      await v.page.getByRole('button', { name: 'Continue with Google' }).click();
      await v.page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
      pass('Continue with Google never skips the code', path(v.page) === '/coach/sign-in/code', path(v.page));
      await v.ctx.close();
      await again.auth.signOut({ scope: 'local' }).catch(() => null);
    }
  }
} finally {
  await browser.close();
  // ---------------------------------------------------------------- tidy up: the factor comes off again
  if (factorId) {
    let gone = await removeFactor(admin, factorId);
    if (!gone) {
      // The session that set it up has to have given a code to take it off.
      await nextStep();
      await admin.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) }).catch(() => null);
      gone = await removeFactor(admin, factorId);
    }
    const check = client();
    const after = await signIn(check, 'COACH_TWO');
    const left = (after.user.factors || []).length;
    pass('the test coach is left with no authenticator', gone && left === 0, `removed ${gone}, factors left ${left}`);
    if (gone && left === 0) rmSync(KEPT, { force: true });
    await check.auth.signOut({ scope: 'local' }).catch(() => null);
  }
  await admin.auth.signOut({ scope: 'local' }).catch(() => null);
}
done();
