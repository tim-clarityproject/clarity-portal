// Coach sign in and the authenticator code (M26; Tim, 11 Nov; Phase 6a run
// 5, M26 seq 7), in the running app on the TEST project only.
//
// Since run 5 no real authenticator is ever enrolled on a test account
// (this test used to give the second test coach a real one for its length):
// Supabase's MFA is stood in. The test coach signs in for real (read only);
// an authenticator is shown to the page as a stand-in factor
// (tests/signin/aal2.mjs, with the level left at aal1, so the code is asked
// for), enrolment, challenge and verify are answered here, and 053's
// functions answer as the test project does (it doesn't have them yet).
// The whole of set-up, the codes, a recovery code and the owner's reset are
// walked, stood in whole, by tests/signin/coach-auth.mjs.
//
//   node tests/signin/coach.mjs
import { TEST_HOSTNAME as TARGET_HOSTNAME } from '../target.mjs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { APP, TEST_REF, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { asAal2, STAND_IN_FACTOR } from './aal2.mjs';

const env = testEnv();
const { pass, done } = makeChecks();
const client = () => createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const browser = await chromium.launch();
// Enrolment, challenge and verify, stood in: nothing is ever enrolled on the test project.
const mfaStandIns = (asked) => ({
  'POST /auth/v1/factors': () => { asked.push('enrol'); return { status: 200, body: { id: '00000000-0000-4000-8000-0000000000f2', type: 'totp', friendly_name: 'stand-in', totp: { qr_code: '', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/The%20Clarity%20Portal:coach?secret=JBSWY3DPEHPK3PXP&issuer=The%20Clarity%20Portal' } } }; },
  'POST /challenge': () => { asked.push('challenge'); return { status: 200, body: { id: '00000000-0000-4000-8000-0000000000c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 } }; },
  'POST /verify': () => { asked.push('verify'); return { status: 422, body: { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' } }; },
  'DELETE /factors': () => { asked.push('unenrol'); return { status: 200, body: {} }; },
});
const open = async ({ phone = false, width = phone ? 390 : 1280, answers = {}, factor = false } = {}) => {
  const calls = [];
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', hasTouch: phone, isMobile: phone });
  await guard(ctx, calls, answers);
  // An authenticator shown to the page (a stand-in factor), the level left at aal1.
  if (factor) await asAal2(ctx, { host: TARGET_HOSTNAME, raise: false });
  const page = await ctx.newPage();
  return { ctx, page, calls };
};
const path = (page) => new URL(page.url()).pathname;
const message = (page) => page.locator('.si-err, .si-code-msg:not(:empty)').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const fill = async (page, who) => {
  await page.locator('input[type=email]').fill(env[`TEST_${who}_EMAIL`]);
  await page.locator('.si-pw input').fill(env[`TEST_${who}_PASSWORD`]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};
const codeBox = (page) => page.getByRole('textbox', { name: 'Code', exact: true });

try {
  // ---------------------------------------------------------------- the coaches' own page
  {
    const { ctx, page } = await open();
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .si-google');
    pass('Coach sign in has its own address, apart from the clients’ page', path(page) === '/coach/sign-in');
    pass('its one title is Coach sign in, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'coach sign in');
    const words = (await page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
    pass('it has no Create my account link', !/create my account|new here/i.test(words), words.slice(0, 200));
    pass('“Clarity drives performance.” is on Sign in only', !/clarity drives performance/i.test(words));
    const order = await page.evaluate(() => [...document.querySelectorAll('.si-col .si-google, .si-col .si-field label, .si-col .si-btn, .si-col .si-alt')].map((el) => el.innerText.trim()));
    // The 25 Nov example's order (polish 1, rule 22; rule 17's "Google above email" gives way on look).
    pass('Email and Password, then Sign in, Continue with Google and Forgotten your password?', JSON.stringify(order) === JSON.stringify(['Email', 'Password', 'Sign in', 'Continue with Google', 'Forgotten your password?']), order.join(' | '));
    await page.getByRole('link', { name: 'Forgotten your password?' }).click();
    await page.waitForURL(/\/forgot-password$/);
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await page.waitForURL(/\/coach\/sign-in$/);
    pass('Back from Forgotten your password returns to the coaches’ page', path(page) === '/coach/sign-in');
    await ctx.close();
  }

  // ---------------------------------------------------------------- no authenticator yet: set it up (run 5 retires "let in after the password")
  {
    const asked = [];
    const { ctx, page } = await open({ answers: mfaStandIns(asked) });
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .si-google');
    await fill(page, 'COACH_OWNER');
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 30000 }).catch(() => null);
    pass('a coach with no authenticator is taken to set it up after the password', path(page) === '/coach/sign-in/set-up', path(page));
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    pass('set-up enrols through Supabase’s own TOTP (stood in here: nothing is enrolled on the test project)', asked.includes('enrol'), asked.join(', '));
    await page.goto(`${APP}/coach`);
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 20000 }).catch(() => null);
    pass('the coach portal stays shut until it’s set up', path(page) === '/coach/sign-in/set-up', path(page));
    await page.goto(`${APP}/welcome`);
    await sleep(2500);
    pass('their own Home still opens (only the coach portal waits for the authenticator)', path(page) === '/welcome', path(page));
    await ctx.close();
  }

  // ---------------------------------------------------------------- with an authenticator: the code follows the password
  {
    const asked = [];
    const { ctx, page } = await open({ answers: mfaStandIns(asked), factor: true });
    await page.goto(`${APP}/coach/sign-in`);
    await page.waitForSelector('.si-col .si-google');
    await fill(page, 'COACH_OWNER');
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
    pass('after the password, a coach with an authenticator is asked for the code', path(page) === '/coach/sign-in/code', path(page));
    await page.getByRole('heading', { name: 'Enter your code' }).waitFor({ timeout: 15000 }).catch(() => null);
    pass('its one title is Enter your code, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'enter your code');
    const words = (await page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
    // The 25 Nov example's line (polish 1, rule 23) replaced M26's two.
    pass('“From your authenticator app. It goes in by itself.”', words.includes('From your authenticator app. It goes in by itself.'), words.slice(0, 200));
    const box = await codeBox(page).evaluate((el) => ({ mode: el.getAttribute('inputmode'), auto: el.getAttribute('autocomplete'), max: el.getAttribute('maxlength'), holder: el.getAttribute('placeholder'), value: el.value, size: parseFloat(getComputedStyle(el).fontSize) }));
    pass('the code box: numbers, one-time-code, 6 at most, tied to its label', box.mode === 'numeric' && box.auto === 'one-time-code' && box.max === '6', JSON.stringify(box));
    pass('the code box has no example code in it', !box.holder && box.value === '', JSON.stringify(box));
    pass('the code box’s text is 16px or more', box.size >= 16, `${box.size}`);
    await page.goto(`${APP}/coach`);
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 20000 }).catch(() => null);
    pass('the coach portal stays shut until the code is given', path(page) === '/coach/sign-in/code', path(page));
    await page.goto(`${APP}/welcome`);
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 20000 }).catch(() => null);
    pass('the portal stays shut until the code is given (Home sends them back)', path(page) === '/coach/sign-in/code', path(page));
    await page.getByRole('heading', { name: 'Enter your code' }).waitFor({ timeout: 15000 }).catch(() => null);
    await codeBox(page).fill('12a45');
    pass('the code box takes digits only', (await codeBox(page).inputValue()) === '1245');
    // No button since polish 1 (rule 23): Enter sends fewer than six; the sixth digit sends the code by itself.
    await codeBox(page).press('Enter');
    pass('fewer than 6 digits says what to enter', (await message(page)) === 'Enter the 6 digits from your authenticator app.', await message(page));
    await codeBox(page).fill('000000');
    await page.waitForSelector('.si-code-msg:not(:empty)');
    await sleep(300);
    pass('a wrong code: “That code didn’t work. Check the time on your phone and try again.”, and the squares empty', (await message(page)) === 'That code didn’t work. Check the time on your phone and try again.' && (await codeBox(page).inputValue()) === '', await message(page));
    pass('and stays on the page, signed in to nothing more', path(page) === '/coach/sign-in/code');
    pass('the code went to Supabase’s challenge and verify (stood in)', asked.includes('challenge') && asked.includes('verify'), asked.join(', '));
    pass('nothing was enrolled', !asked.includes('enrol'));
    await ctx.close();
  }

  // ---------------------------------------------------------------- the clients' page can't be used to skip it
  {
    const v = await open({ phone: true, answers: mfaStandIns([]), factor: true });
    await v.page.goto(`${APP}/auth/login`);
    await v.page.waitForSelector('.si-col .si-google');
    await fill(v.page, 'COACH_OWNER');
    await v.page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
    pass('signing in on the clients’ page asks the coach for the code too', path(v.page) === '/coach/sign-in/code', path(v.page));
    for (const width of [390, 360, 320]) {
      await v.page.setViewportSize({ width, height: 844 });
      await sleep(150);
      // Since polish 1 Enter your code's line no longer says "6-digit" (the example's line): the six squares must fit instead.
      const one = await v.page.evaluate(() => { const sq = [...document.querySelectorAll('.si-code-sq')]; const tops = new Set(sq.map((el) => Math.round(el.getBoundingClientRect().top))); return { squares: sq.length, rows: tops.size, wide: document.documentElement.scrollWidth - innerWidth }; });
      pass(`the six code squares stay on one row at ${width}px`, one.squares === 6 && one.rows === 1 && one.wide <= 0, JSON.stringify(one));
    }
    // Lost your authenticator app? (053 isn't on the test project: the line alone, the owner unnamed.)
    await v.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
    await v.page.waitForURL(/\/coach\/sign-in\/help$/);
    await v.page.getByRole('heading', { name: 'Lost your authenticator app?' }).waitFor({ timeout: 15000 }).catch(() => null);
    await sleep(1500);
    const words = (await v.page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
    pass('“Lost your authenticator app?” replaces the old placeholder', !words.includes('Ask Tim to reset your code.') && /Lost your codes too\?/.test(words), words.slice(-200));
    pass('it never offers a way round by email', !/email|send/i.test(words), words);
    await v.ctx.close();
  }

  // ---------------------------------------------------------------- Google never skips the code
  {
    const again = client();
    const { data: fresh, error } = await again.auth.signInWithPassword({ email: env.TEST_COACH_OWNER_EMAIL, password: env.TEST_COACH_OWNER_PASSWORD });
    if (error) throw new Error('The test coach could not sign in.');
    const user = { ...fresh.user, factors: [STAND_IN_FACTOR], app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { ...(fresh.user.user_metadata || {}), terms_accepted: true } };
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
    await v.page.waitForSelector('.si-col .si-google');
    await v.page.getByRole('button', { name: 'Continue with Google' }).click();
    await v.page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 30000 }).catch(() => null);
    pass('Continue with Google never skips the code', path(v.page) === '/coach/sign-in/code', path(v.page));
    await v.ctx.close();
    await again.auth.signOut({ scope: 'local' }).catch(() => null);
  }
} finally {
  await browser.close();
}
done();
