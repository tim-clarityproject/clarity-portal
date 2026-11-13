// What an email link may open, and what is left behind at Sign out (the
// functionality tester, 13 Nov), in the running app on the TEST project
// only. No real email is sent and nothing is written to the test client's
// own account: the link's return is answered here, with the seeded test
// client's own session shown under an invented name.
//
// New password and the invite's page set a password without asking for
// the old one. So they open only for the account a link has really just
// brought: never for a session already on the device, and never for an
// address made to look like a link.
//
//   node tests/signin/links.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { APP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { invited, signedIn } from './screens.mjs';

const env = testEnv();
const { pass, done } = makeChecks();

// One real session for the test client, to stand behind a link's return.
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: real, error: realError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (realError) throw new Error('The test client could not sign in.');
const session = real.session;
const sam = (u) => ({ ...u, email: SAM.email, user_metadata: { ...(u.user_metadata || {}), first_name: SAM.first } });

const browser = await chromium.launch();

// One visit on a fresh device. `who` is the account a link brings back;
// `swap` is what Supabase answers when the link's code is handed in.
async function visit({ who = sam, swap = 200, verify = 200 } = {}) {
  const calls = [];
  const state = { user: who(session.user), saved: [], swaps: 0, verifies: 0 };
  const answers = {
    'POST /auth/v1/token': async ({ url }) => {
      if (url.searchParams.get('grant_type') !== 'pkce') return 'continue';
      state.swaps += 1;
      if (swap !== 200) return { status: swap, body: { code: swap, error_code: 'flow_state_not_found', msg: 'invalid flow state' } };
      return { status: 200, body: { ...session, user: state.user } };
    },
    'POST /auth/v1/verify': async () => {
      state.verifies += 1;
      if (verify !== 200) return { status: verify, body: { code: verify, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' } };
      return { status: 200, body: { ...session, user: state.user } };
    },
    'GET /auth/v1/user': async () => ({ status: 200, body: state.user }),
    'PUT /auth/v1/user': async ({ body }) => {
      state.saved.push(body);
      state.user = { ...state.user, user_metadata: { ...state.user.user_metadata, ...(body?.data || {}) } };
      return { status: 200, body: state.user };
    },
    // A sign-out here never ends the session the other checks stand on.
    'POST /auth/v1/logout': async () => ({ status: 200, body: {} }),
  };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await guard(ctx, calls, answers);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, calls, state, answers, errors, o: { env, answers, SAM } };
}
const path = (page) => new URL(page.url()).pathname;
const title = (page) => page.locator('h1').allInnerTexts().then((t) => t.join('|').toLowerCase());
const heading = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 20000 }).catch(() => null);
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
const kept = (page) => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('clarity-sign-in-')));

// Asks for a reset link from this browser, as someone really would, so the
// browser holds what ties the link to it. The email itself is never sent.
async function askForReset(page) {
  await page.goto(`${APP}/forgot-password`);
  await page.waitForSelector('.si-col');
  await page.locator('input[type=email]').fill(SAM.email);
  await press(page, 'Email my reset link');
  await page.waitForURL(/\/forgot-password\/check-email$/, { timeout: 15000 });
}

// ---------------------------------------------------------------- 1. a reset link, opened in the browser that asked for it
{
  const v = await visit();
  const { page, state } = v;
  await askForReset(page);
  await page.goto(`${APP}/auth/reset-password?code=a-mock-code`);
  await heading(page, 'New password');
  pass('a reset link opened in the browser that asked for it: New password', (await title(page)) === 'new password', await title(page));
  pass('the link’s code was handed in once, and taken out of the address', state.swaps === 1 && !page.url().includes('code='), `${state.swaps} ${new URL(page.url()).search}`);
  await page.reload();
  await heading(page, 'New password');
  pass('a refresh still shows New password (the link was opened in this tab)', (await title(page)) === 'new password', await title(page));
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await press(page, 'Save my new password');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('saving signs them straight in to Home', path(page) === '/welcome', path(page));
  pass('the new password was sent to be saved, once', state.saved.length === 1 && 'password' in (state.saved[0] || {}), JSON.stringify(state.saved.map((b) => Object.keys(b))));
  await page.goto(`${APP}/auth/reset-password`);
  await heading(page, 'Link not working');
  pass('and the link opens nothing a second time', (await title(page)) === 'link not working', await title(page));
  pass('a reset link: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 2. someone signed in, with an address made to look like a link
{
  const v = await visit({ verify: 403 });
  const { page, state } = v;
  await signedIn(page, v.o);
  for (const [name, made] of [
    ['a made-up code', '/auth/reset-password?code=made-up'],
    ['a made-up token', '/auth/reset-password?token_hash=made-up&type=recovery'],
    ['a made-up sign-in in the address', '/auth/reset-password#access_token=made-up&type=recovery'],
  ]) {
    await page.goto(`${APP}/welcome`);
    await page.goto(`${APP}${made}`);
    await heading(page, 'Link not working');
    pass(`signed in, ${name}: Link not working, never New password`, (await title(page)) === 'link not working' && (await page.locator('.si-pw').count()) === 0, await title(page));
  }
  pass('nothing was kept that would open New password later', !(await kept(page)).includes('clarity-sign-in-reset'), (await kept(page)).join(','));
  await page.goto(`${APP}/auth/reset-password`);
  await heading(page, 'Link not working');
  pass('and the plain address still says Link not working', (await title(page)) === 'link not working');
  pass('no password was ever sent to be saved', state.saved.length === 0);
  pass('they are still signed in', await page.evaluate(() => Boolean(localStorage.getItem('clarity-portal-auth'))));
  // The invite's page sets a password too: it is not theirs either.
  await page.goto(`${APP}/auth/invite`);
  await page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
  pass('signed in, the invite’s address: passed on to Home, never “Set my password”', path(page) === '/welcome', path(page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 3. a reset link opened in another browser (it has nothing to tie the link to)
{
  const v = await visit();
  const { page, state } = v;
  await page.goto(`${APP}/auth/reset-password?code=a-mock-code`);
  await page.waitForSelector('.si-wait', { timeout: 10000 }).catch(() => null);
  await heading(page, 'Link not working');
  pass('a reset link opened in another browser: Link not working, with Send a new link', (await title(page)) === 'link not working' && (await page.getByRole('button', { name: 'Send a new link' }).count()) === 1, await title(page));
  pass('nobody is signed in by it', !(await page.evaluate(() => Boolean(localStorage.getItem('clarity-portal-auth')))) && state.swaps === 0);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 4. a link that carries its own token (opens on any device)
{
  const v = await visit();
  const { page, state } = v;
  await page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(page, 'New password');
  pass('a reset link with its own token: New password, on a device that never asked for it', (await title(page)) === 'new password', await title(page));
  pass('the token was handed in once, and taken out of the address', state.verifies === 1 && !page.url().includes('token_hash'), `${state.verifies} ${new URL(page.url()).search}`);
  await page.reload();
  await heading(page, 'New password');
  pass('a refresh doesn’t spend the token twice, and still shows New password', state.verifies === 1 && (await title(page)) === 'new password', `${state.verifies} ${await title(page)}`);
  await v.ctx.close();
}
{
  const v = await visit({ verify: 403 });
  await v.page.goto(`${APP}/auth/reset-password?token_hash=a-used-token&type=recovery`);
  await heading(v.page, 'Link not working');
  pass('a token that has run out or was used: Link not working', (await title(v.page)) === 'link not working', await title(v.page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 5. the coach's invite
{
  const v = await visit({ who: (u) => invited(sam(u)) });
  const { page, state, answers, calls } = v;
  answers['POST /rest/v1/rpc/my_coach'] = () => ({ status: 200, body: [{ coach_id: '00000000-0000-4000-8000-00000000000c', first_name: 'Tim', away_until: null, mobile: null, contact_ways: [] }] });
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  const words = (await page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
  pass('an invite link signs the invited person in: “Welcome, Sam”, “Tim has set up your account.”', words.includes('WELCOME, SAM') && words.includes('Tim has set up your account.'), words.slice(0, 120));
  pass('no First name box (the coach already added it)', (await page.getByLabel('First name').count()) === 0);
  await page.reload();
  await heading(page, 'Welcome, Sam');
  pass('a refresh keeps the page, without spending the invite twice', state.verifies === 1 && (await title(page)) === 'welcome, sam', `${state.verifies} ${await title(page)}`);
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await press(page, 'Set my password');
  pass('Set my password without the tick: “Tick the box to carry on.”', (await page.locator('.si-err').innerText().catch(() => '')).replace(/\s+/g, ' ').trim() === '! Tick the box to carry on.' && state.saved.length === 0);
  await page.getByRole('checkbox').click();
  await press(page, 'Set my password');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  const rec = state.saved[0]?.data || {};
  pass('the password and the agreement are saved together, as an email sign-up stores it', 'password' in (state.saved[0] || {}) && rec.terms_accepted === true && /^\d{4}-\d{2}-\d{2}T/.test(rec.terms_accepted_at || '') && (rec.terms_documents || []).length === 3, JSON.stringify(Object.keys(state.saved[0] || {})));
  pass('the profile’s own record is set too', calls.some((c) => c.path?.endsWith('/rest/v1/profiles') && c.method !== 'GET' && c.body?.terms_accepted === true));
  pass('then straight in to Home', path(page) === '/welcome', path(page));
  await page.goto(`${APP}/auth/invite`);
  await page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
  pass('once set up, the invite’s page never shows again', path(page) === '/welcome', path(page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 6. a coach's reset link still needs the code
{
  const coach = (u) => ({ ...sam(u), factors: [{ id: '00000000-0000-4000-8000-0000000000f1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' }] });
  const v = await visit({ who: coach });
  const { page, state } = v;
  await askForReset(page);
  await page.goto(`${APP}/auth/reset-password?code=a-mock-code`);
  await heading(page, 'Enter your code');
  pass('an account with an authenticator app gives its code before a new password: Enter your code', (await title(page)) === 'enter your code' && (await page.locator('.si-pw').count()) === 0, await title(page));
  pass('it stays on the reset link’s own address', path(page) === '/auth/reset-password');
  pass('nothing is saved before the code', state.saved.length === 0);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 7. Sign out leaves nothing for the next person
{
  const v = await visit();
  const { page } = v;
  await page.goto(`${APP}/my-plans?area=personal`);
  await page.waitForURL(/\/auth\/login$/);
  await signedIn(page, v.o, { land: /\/my-plans/ });
  await page.evaluate(() => {
    sessionStorage.setItem('clarity-sign-in-tick', new Date().toISOString());
    sessionStorage.setItem('clarity-sign-in-email', 'someone@example.org');
    sessionStorage.setItem('clarity-sign-in-google-from', '/auth/sign-up');
  });
  await page.goto(`${APP}/my-account`);
  await page.getByRole('button', { name: 'Sign out' }).first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL(/\/auth\/login$/, { timeout: 30000 }).catch(() => null);
  await page.waitForSelector('.si-col');
  await sleep(800);
  pass('Sign out ends on Sign in', path(page) === '/auth/login', path(page));
  pass('nothing the sign-in pages kept is left in the tab (no page to land on, no tick, no email)', (await kept(page)).length === 0, (await kept(page)).join(','));
  // The next person to sign in on this tab starts at Home.
  await signedIn(page, v.o);
  pass('the next sign-in on this tab lands on Home, not on the page the last person left from', path(page) === '/welcome', path(page));
  pass('Sign out: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

await browser.close();
done();
