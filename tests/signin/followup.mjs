// The sign-in follow-up of 13 Nov (Tim, 14:05), in a browser:
//   1. email links in the form that opens in any browser go through in a
//      browser that never asked for them: confirm, reset, invite and a
//      change of email;
//   2. My Account's Email page with two links to open;
//   3. the coach's invite: the tick before Google, a Google account with
//      another email never makes a second account, and a reset link on an
//      invited account that hasn't agreed gets Before you start first;
//   4. a device clock that's wrong says so on Sign in.
// No email is sent and Google's own page is never opened: every answer
// that would do either is given here (shared.mjs).
//
//   node --import ./tests/scores/register.mjs tests/signin/followup.mjs
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
const EMAIL_ID = { identity_id: '00000000-0000-4000-8000-0000000000e1', provider: 'email', identity_data: { email: SAM.email } };
const googleId = (email) => ({ identity_id: '00000000-0000-4000-8000-0000000000a1', provider: 'google', identity_data: { email, email_verified: true } });

const browser = await chromium.launch();

// One visit on a fresh device. `who` is the account a link brings back;
// `verify` is what Supabase answers when a link's own token is handed in
// (200, 'half' for the first of two change-of-email links, or a refusal);
// `picked` is the email of the Google account chosen at Google.
async function visit({ who = sam, verify = 200, picked = SAM.email, taken = false } = {}) {
  const calls = [];
  const state = { user: who(session.user), saved: [], verifies: [], joins: [], unlinked: 0, authorize: 0 };
  const answers = {
    'POST /auth/v1/verify': async ({ body }) => {
      state.verifies.push(body?.type);
      if (verify === 'half') return { status: 200, body: { msg: 'Confirmation link accepted. Please proceed to confirm link sent to the other email', code: '200' } };
      if (verify !== 200) return { status: verify, body: { code: verify, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' } };
      return { status: 200, body: { ...session, user: state.user } };
    },
    // Signing in with Google on its own: an invite must never ask for this.
    'GET /auth/v1/authorize': async ({ route }) => {
      state.authorize += 1;
      await route.fulfill({ status: 302, headers: { location: `${APP}/auth/google?code=a-mock-code` } });
      return 'handled';
    },
    // Google joined to the account that is signed in: answered as Google's return.
    'GET /identities/authorize': async ({ url }) => {
      state.joins.push(Object.fromEntries(url.searchParams));
      const to = new URL(`${APP}/auth/google`);
      if (taken) { to.searchParams.set('error', 'server_error'); to.searchParams.set('error_code', 'identity_already_exists'); to.searchParams.set('error_description', 'Identity is already linked to another user'); } else to.searchParams.set('code', 'a-mock-code');
      return { status: 200, body: { url: to.href } };
    },
    'POST /auth/v1/token': async ({ url }) => {
      if (url.searchParams.get('grant_type') !== 'pkce') return 'continue';
      state.user = { ...state.user, identities: [EMAIL_ID, googleId(picked)] };
      return { status: 200, body: { ...session, user: state.user } };
    },
    'DELETE /identities/00000000-0000-4000-8000-0000000000a1': async () => {
      state.unlinked += 1;
      state.user = { ...state.user, identities: [EMAIL_ID] };
      return { status: 200, body: {} };
    },
    'GET /auth/v1/user': async () => ({ status: 200, body: state.user }),
    'PUT /auth/v1/user': async ({ body }) => {
      state.saved.push(body);
      state.user = { ...state.user, user_metadata: { ...state.user.user_metadata, ...(body?.data || {}) } };
      return { status: 200, body: state.user };
    },
    'POST /auth/v1/logout': async () => ({ status: 200, body: {} }),
    'POST /rest/v1/rpc/my_coach': () => ({ status: 200, body: [{ coach_id: '00000000-0000-4000-8000-00000000000c', first_name: 'Tim', away_until: null, mobile: null, contact_ways: [] }] }),
  };
  // A new browser context each time: nothing in it ever asked for a link.
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
const words = (page, where = '.ui-root') => page.locator(where).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const message = (page) => page.locator('.si-err').allInnerTexts().then((t) => t.join(' | ').replace(/\s+/g, ' ').trim()).catch(() => '');
const noToken = (page) => !/token_hash|type=/.test(new URL(page.url()).search);

// ---------------------------------------------------------------- 1. links that open in any browser
{
  const v = await visit();
  await v.page.goto(`${APP}/auth/confirmed?token_hash=a-mock-token&type=email`);
  await heading(v.page, 'Email confirmed');
  pass('a confirmation link opened in a fresh browser: Email confirmed', (await title(v.page)) === 'email confirmed', await title(v.page));
  pass('its token was handed in once, as a confirmation, and taken out of the address', v.state.verifies.join() === 'email' && noToken(v.page), `${v.state.verifies} ${new URL(v.page.url()).search}`);
  pass('it welcomes them by name', (await words(v.page)).includes('Welcome to The Clarity Portal, Sam.'), (await words(v.page)).slice(0, 120));
  await press(v.page, 'Open my portal');
  await v.page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('“Open my portal” goes in to Home', path(v.page) === '/welcome', path(v.page));
  await v.ctx.close();
}
{
  const v = await visit();
  await v.page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(v.page, 'New password');
  pass('a reset link opened in a fresh browser: New password', (await title(v.page)) === 'new password', await title(v.page));
  await v.page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await press(v.page, 'Save my new password');
  await v.page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('and saving signs them straight in to Home', path(v.page) === '/welcome' && 'password' in (v.state.saved[0] || {}), path(v.page));
  await v.ctx.close();
}
{
  const v = await visit({ who: (u) => invited(sam(u)) });
  await v.page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(v.page, 'Welcome, Sam');
  pass('an invite link opened in a fresh browser: Welcome, Sam', (await title(v.page)) === 'welcome, sam' && v.state.verifies.join() === 'invite', `${await title(v.page)} ${v.state.verifies}`);
  await v.ctx.close();
}
{
  // The change of email is finished (the second link, or the only one).
  const v = await visit({ who: (u) => ({ ...sam(u), email: SAM.newEmail }) });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await v.page.getByText('Saved', { exact: true }).first().waitFor({ timeout: 30000 }).catch(() => null);
  pass('a change-of-email link opened in a fresh browser goes through to My Account’s Email page', path(v.page) === '/my-account/email' && (await title(v.page)) === 'email', `${path(v.page)} ${await title(v.page)}`);
  pass('the page says “Saved”, with the new email in the box', (await words(v.page)).includes('Saved') && (await v.page.locator('input[type=email]').inputValue()) === SAM.newEmail, (await words(v.page)).slice(0, 160));
  pass('its token was handed in once, as a change of email, and taken out of the address', v.state.verifies.join() === 'email_change' && noToken(v.page), `${v.state.verifies} ${new URL(v.page.url()).search}`);
  await v.page.reload();
  await heading(v.page, 'Email');
  pass('a refresh doesn’t spend the token twice', v.state.verifies.length === 1, String(v.state.verifies.length));
  pass('a change-of-email link: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}
{
  // The first of the two links, in a browser that isn't signed in.
  const v = await visit({ verify: 'half' });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await v.page.waitForURL(/\/auth\/login$/, { timeout: 20000 }).catch(() => null);
  await v.page.locator('.si-note').first().waitFor({ timeout: 15000 }).catch(() => null);
  const note = await words(v.page, '.si-note');
  pass('the first of two links, opened signed out: Sign in says one is opened and the other is still to open', path(v.page) === '/auth/login' && note === 'That’s one link opened. Open the one sent to your other email to finish.', `${path(v.page)} ${note}`);
  pass('said calmly: no message box', (await v.page.locator('.si-err').count()) === 0);
  await v.ctx.close();
}
{
  // The first of the two links, in the browser that is signed in.
  const v = await visit({ verify: 'half' });
  await signedIn(v.page, v.o, { change: (u) => ({ ...u, new_email: SAM.newEmail }) });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await heading(v.page, 'Check your email');
  await v.page.getByText('That’s one link opened.').waitFor({ timeout: 15000 }).catch(() => null);
  const text = await words(v.page, '.si-col--account');
  pass('the first of two links, opened signed in: the Email page says one is opened', text.includes('That’s one link opened. Open the one sent to your other email to finish.'), text.slice(0, 260));
  pass('and its token is out of the address', noToken(v.page), new URL(v.page.url()).search);
  await v.ctx.close();
}
{
  const v = await visit({ verify: 403 });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-used-token&type=email_change`);
  await v.page.waitForURL(/\/auth\/login$/, { timeout: 20000 }).catch(() => null);
  await v.page.locator('.si-err').first().waitFor({ timeout: 15000 }).catch(() => null);
  pass('a change-of-email link that has run out, opened signed out: Sign in says so, and what to do', (await message(v.page)) === '! This link has run out or has already been used. Sign in, then save your new email again in My Account.', await message(v.page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 2. My Account's Email page, two links
{
  const v = await visit();
  await signedIn(v.page, v.o);
  await v.page.goto(`${APP}/my-account/email`);
  await heading(v.page, 'Email');
  await v.page.locator('input[type=email]').fill(SAM.newEmail);
  await press(v.page, 'Save my new email');
  await heading(v.page, 'Check your email');
  const text = await words(v.page, '.si-col--account');
  pass('after Save my new email the title is “Check your email”, the page’s one h1', (await title(v.page)) === 'check your email', await title(v.page));
  pass('“We’ve sent a link to your current email and to …. Open both to finish.”', text.includes(`We’ve sent a link to your current email and to ${SAM.newEmail}. Open both to finish.`), text.slice(0, 260));
  pass('the old line is gone', !text.includes('Your email changes once you open it.'));
  pass('“Didn’t get it? Send it again” is still there', text.includes('Didn’t get it? Send it again'));
  pass('Back still reads “My Account”', text.startsWith('My Account'), text.slice(0, 40));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 3. the coach's invite
{
  // A Google account with the invite's own email.
  const v = await visit({ who: (u) => invited(sam(u)), picked: SAM.email });
  const { page, state } = v;
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  const g = await page.getByRole('button', { name: 'Continue with Google' }).boundingBox();
  const box = await page.getByRole('checkbox').boundingBox();
  pass('the invite shows the one tick box, as Create my account does', Boolean(box) && box.y > g.y);
  await press(page, 'Continue with Google');
  pass('Continue with Google without the tick: “Tick the box to carry on.”, and Google is not opened', (await message(page)) === '! Tick the box to carry on.' && state.joins.length === 0 && state.authorize === 0, `${await message(page)} ${state.joins.length}`);
  const err = await page.locator('.si-err').boundingBox();
  const row = await page.locator('.si-terms').boundingBox();
  pass('the words sit beside the box they are about', Boolean(err && row) && err.y >= row.y + row.height - 1 && err.y - (row.y + row.height) < 40, err && row ? `${err.y} after ${row.y + row.height}` : 'not found');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('with the tick, Google is joined to the invited account, never signed in on its own', state.joins.length === 1 && state.authorize === 0, `${state.joins.length} joined, ${state.authorize} on its own`);
  pass('Google opens on the invite’s own address, and comes back to this page’s origin', state.joins[0]?.login_hint === SAM.email && state.joins[0]?.redirect_to === `${new URL(APP).origin}/auth/google`, JSON.stringify({ hint: state.joins[0]?.login_hint === SAM.email, to: state.joins[0]?.redirect_to }));
  const rec = state.saved[0]?.data || {};
  pass('the same email: the agreement is saved and they go in to Home', path(page) === '/welcome' && rec.terms_accepted === true && state.unlinked === 0, `${path(page)} ${JSON.stringify(Object.keys(rec))}`);
  await v.ctx.close();
}
{
  // A Google account with a different email from the invite's.
  const v = await visit({ who: (u) => invited(sam(u)), picked: SAM.gmail });
  const { page, state } = v;
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.locator('.si-err').first().waitFor({ timeout: 30000 }).catch(() => null);
  pass('a Google account with another email: they stay on the invite’s page', path(page) === '/auth/invite' && (await title(page)) === 'welcome, sam', `${path(page)} ${await title(page)}`);
  pass('“This invite is for …. Continue with that Google account, or set a password.”', (await message(page)) === `! This invite is for ${SAM.email}. Continue with that Google account, or set a password.`, await message(page));
  const err = await page.locator('.si-err').boundingBox();
  const g = await page.getByRole('button', { name: 'Continue with Google' }).boundingBox();
  const or = await page.locator('.si-or').boundingBox();
  pass('the words sit under the Google button, above “or”', Boolean(err && g && or) && err.y >= g.y + g.height && err.y + err.height <= or.y + 1, err && g && or ? `${g.y + g.height} ${err.y} ${or.y}` : 'not found');
  pass('no second account: Google was only ever joined to the invited one, and the wrong one is taken off again', state.authorize === 0 && state.joins.length === 1 && state.unlinked === 1, `${state.authorize} ${state.joins.length} ${state.unlinked}`);
  pass('nothing was agreed for them, and the portal stays shut', state.saved.length === 0, JSON.stringify(state.saved.map((b) => Object.keys(b))));
  await page.goto(`${APP}/welcome`);
  await page.waitForURL(/\/auth\/before-you-start$/, { timeout: 20000 }).catch(() => null);
  pass('Home sends an invited account that hasn’t agreed to Before you start', path(page) === '/auth/before-you-start', path(page));
  // They can still set a password on the invite's page.
  await page.goto(`${APP}/auth/invite`);
  await heading(page, 'Welcome, Sam');
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await page.getByRole('checkbox').click();
  await press(page, 'Set my password');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('and setting a password instead still works', path(page) === '/welcome' && 'password' in (state.saved[0] || {}), path(page));
  pass('a different Google account: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}
{
  // A Google account that already belongs to someone else's portal account.
  const v = await visit({ who: (u) => invited(sam(u)), taken: true });
  const { page, state } = v;
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.locator('.si-err').first().waitFor({ timeout: 30000 }).catch(() => null);
  pass('a Google account that is someone else’s portal account: the same line, on the invite’s page', path(page) === '/auth/invite' && (await message(page)) === `! This invite is for ${SAM.email}. Continue with that Google account, or set a password.` && state.saved.length === 0, `${path(page)} ${await message(page)}`);
  await v.ctx.close();
}
{
  // A reset link on an invited account that hasn't agreed to the terms.
  const v = await visit({ who: (u) => invited(sam(u)) });
  const { page, state } = v;
  await page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(page, 'Before you start');
  pass('a reset link on an invited account that hasn’t agreed: Before you start first', (await title(page)) === 'before you start' && path(page) === '/auth/reset-password', `${await title(page)} ${path(page)}`);
  const text = await words(page, '.si-col');
  pass('it says who they are signing in as, with the one tick box', text.includes(`You’re signing in as ${SAM.email}.`) && (await page.getByRole('checkbox').count()) === 1, text.slice(0, 160));
  pass('no “Use a different Google account” (this isn’t a Google account)', !text.includes('Use a different Google account'));
  await press(page, 'Create my account');
  pass('without the tick: “Tick the box to carry on.”, and nothing saved', (await message(page)) === '! Tick the box to carry on.' && state.saved.length === 0, await message(page));
  await page.getByRole('checkbox').click();
  await press(page, 'Create my account');
  await heading(page, 'New password');
  const rec = state.saved[0]?.data || {};
  pass('ticked: the agreement is saved, then New password', (await title(page)) === 'new password' && rec.terms_accepted === true && (rec.terms_documents || []).length === 3 && !('password' in (state.saved[0] || {})), `${await title(page)} ${JSON.stringify(Object.keys(state.saved[0] || {}))}`);
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await press(page, 'Save my new password');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('then the new password saves and they go in to Home', path(page) === '/welcome' && 'password' in (state.saved[1] || {}), path(page));
  pass('an invited account’s reset link: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 4. a device clock that's wrong
const CLOCK = 'Your device’s clock looks wrong, which can sign you out. Set it to update automatically, then sign in again.';
for (const [name, minutes] of [['2 hours fast', 120], ['6 minutes fast', 6], ['6 minutes slow', -6]]) {
  const v = await visit();
  await v.page.clock.setFixedTime(new Date(Date.now() + minutes * 60 * 1000));
  await v.page.goto(`${APP}/auth/login`);
  await v.page.waitForSelector('.si-col .ds-google');
  await v.page.locator('.si-note').first().waitFor({ timeout: 15000 }).catch(() => null);
  pass(`a clock ${name}: Sign in says so, word for word`, (await words(v.page, '.si-note')) === CLOCK, await words(v.page, '.si-note'));
  if (minutes === 120) {
    const note = await v.page.locator('.si-note').boundingBox();
    const g = await v.page.getByRole('button', { name: 'Continue with Google' }).boundingBox();
    const core = await v.page.locator('.si-core').boundingBox();
    pass('it sits above Continue with Google, under the core line', Boolean(note && g && core) && note.y >= core.y + core.height && note.y + note.height <= g.y, note && g ? `${note.y + note.height} then ${g.y}` : 'not found');
    const look = await v.page.locator('.si-note').evaluate((el) => {
      const s = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.color = 'var(--text-2)';
      el.closest('.ui-root').appendChild(probe);
      const grey = getComputedStyle(probe).color;
      probe.style.color = 'var(--coral)';
      const coral = getComputedStyle(probe).color;
      probe.remove();
      return { colour: s.color, grey, coral, background: s.backgroundColor, icons: el.querySelectorAll('svg, img, b, [class*=crosshair], [class*=icon]').length, before: getComputedStyle(el, '::before').content, role: el.getAttribute('role') };
    });
    pass('calm: the page’s grey words, no coral, no box behind it', look.colour === look.grey && look.colour !== look.coral && /rgba\(0, 0, 0, 0\)|transparent/.test(look.background), JSON.stringify(look));
    pass('and no icon', look.icons === 0 && /none|normal/.test(look.before), JSON.stringify(look));
    pass('a screen reader is told (a status, not an alert)', look.role === 'status');
    pass('no message box, and the page still works', (await v.page.locator('.si-err').count()) === 0 && await v.page.getByRole('button', { name: 'Sign in', exact: true }).isEnabled());
    // The coach's page is the same page.
    await v.page.goto(`${APP}/coach/sign-in`);
    await v.page.locator('.si-note').first().waitFor({ timeout: 15000 }).catch(() => null);
    pass('Coach sign in says it too', (await words(v.page, '.si-note')) === CLOCK);
  }
  await v.ctx.close();
}
for (const [name, minutes] of [['right', 0], ['4 minutes fast', 4], ['4 minutes slow', -4]]) {
  const v = await visit();
  if (minutes) await v.page.clock.setFixedTime(new Date(Date.now() + minutes * 60 * 1000));
  await v.page.goto(`${APP}/auth/login`);
  await v.page.waitForSelector('.si-col .ds-google');
  await sleep(2500);
  pass(`a clock that is ${name}: nothing is said`, (await v.page.locator('.si-note').count()) === 0, await words(v.page, '.si-note'));
  await v.ctx.close();
}
{
  // The server's time can't be read (offline, or no Date on the answer): never a false alarm.
  const v = await visit();
  await v.page.route('**/version.json*', (route) => route.abort());
  await v.page.clock.setFixedTime(new Date(Date.now() + 120 * 60 * 1000));
  await v.page.goto(`${APP}/auth/login`);
  await v.page.waitForSelector('.si-col .ds-google');
  await sleep(2500);
  pass('when the server’s time can’t be read, nothing is said', (await v.page.locator('.si-note').count()) === 0);
  await v.ctx.close();
}

await browser.close();
done();
