// The sign-in follow-up of 13 Nov (Tim, 14:05), in a browser:
//   1. email links in the form that opens in any browser go through in a
//      browser that never asked for them: confirm, reset, invite and a
//      change of email;
//   2. My Account's Email page with two links to open;
//   3. the coach's invite: the tick before Google, a Google account with
//      another email never makes a second account, and a reset link on an
//      invited account that hasn't agreed gets Before you start first;
//   4. a device clock that's wrong says so on Sign in;
//   5. the break-it tester's holes (13 Nov): addresses made to look like
//      links, a link opened while the database gives no answer, pages left
//      open while someone else signs in, a wrong Google account left on an
//      unfinished invite, the clock check asked many times at once, and
//      what opens inside a panel.
// No email is sent and Google's own page is never opened: every answer
// that would do either is given here (shared.mjs).
//
//   node --import ./tests/scores/register.mjs tests/signin/followup.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { APP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { invited, signedIn } from './screens.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';

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
// `google` is how Google's own page ended ('cancel': closed by the person;
// 'error': it didn't work); `unlink` is Supabase's answer when a Google
// account is taken off again.
async function visit({ who = sam, verify = 200, picked = SAM.email, taken = false, google = 'code', unlink = 200 } = {}) {
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
      if (taken) { to.searchParams.set('error', 'server_error'); to.searchParams.set('error_code', 'identity_already_exists'); to.searchParams.set('error_description', 'Identity is already linked to another user'); }
      else if (google === 'cancel') { to.searchParams.set('error', 'access_denied'); to.searchParams.set('error_description', 'User denied access'); }
      else if (google === 'error') { to.searchParams.set('error', 'server_error'); to.searchParams.set('error_description', 'Unable to exchange external code'); }
      else to.searchParams.set('code', 'a-mock-code');
      return { status: 200, body: { url: to.href } };
    },
    'POST /auth/v1/token': async ({ url }) => {
      if (url.searchParams.get('grant_type') !== 'pkce') return 'continue';
      state.user = { ...state.user, identities: [EMAIL_ID, googleId(picked)] };
      return { status: 200, body: { ...session, user: state.user } };
    },
    'DELETE /identities/00000000-0000-4000-8000-0000000000a1': async () => {
      state.unlinked += 1;
      if (unlink !== 200) return { status: unlink, body: { code: unlink, msg: 'That could not be done' } };
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

{
  // A link that lands off its own page still opens (the functionality
  // tester, 13 Nov): on the site's root, where Supabase sends a link when
  // the page that asked isn't on its allowed list, and with a doubled
  // slash, from a Site URL saved with a slash on its end.
  const v = await visit();
  await v.page.goto(`${APP}/?token_hash=a-mock-token&type=recovery`);
  await heading(v.page, 'New password');
  pass('a reset link that lands on the site’s root still opens New password, its token handed in once', (await title(v.page)) === 'new password' && path(v.page) === '/auth/reset-password' && v.state.verifies.join() === 'recovery' && noToken(v.page), `${path(v.page)} ${await title(v.page)} ${v.state.verifies}`);
  await v.ctx.close();
  const w = await visit({ who: (u) => invited(sam(u)) });
  await w.page.goto(`${APP}//auth/invite?token_hash=a-mock-token&type=invite`).catch(() => null);
  await heading(w.page, 'Welcome, Sam');
  pass('an invite link with a doubled slash still opens the invite', (await title(w.page)) === 'welcome, sam' && path(w.page) === '/auth/invite' && w.state.verifies.join() === 'invite', `${path(w.page)} ${await title(w.page)} ${w.state.verifies}`);
  await w.ctx.close();
  const x = await visit();
  await x.page.goto(`${APP}/?token_hash=a-mock-token&type=magiclink`);
  await x.page.waitForURL(/\/auth\/login/, { timeout: 20000 }).catch(() => null);
  pass('a kind of link no page finishes is handed in nowhere', x.state.verifies.length === 0 && path(x.page) === '/auth/login', `${path(x.page)} ${x.state.verifies}`);
  await x.ctx.close();
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
{
  // The functionality tester, 13 Nov. Signed in as the owner with a change
  // waiting: "Send it again" pressed twice asks once; then the second link
  // opened in this same browser, and My Account straight after.
  const v = await visit();
  await signedIn(v.page, v.o, { change: (u) => ({ ...u, new_email: SAM.newEmail }) });
  await v.page.goto(`${APP}/my-account/email`);
  await heading(v.page, 'Check your email');
  const puts = () => v.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/auth/v1/user'));
  const before = puts().length;
  await v.page.getByRole('button', { name: 'Send it again' }).dblclick();
  await v.page.getByText('Sent', { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => null);
  await sleep(800);
  const sent = puts().slice(before);
  pass('“Send it again” pressed twice asks once, for the same new email, to come back to this page', sent.length === 1 && sent[0].body?.email === SAM.newEmail && sent[0].query?.redirect_to === `${new URL(APP).origin}/my-account/email`, `${sent.length} asked`);
  pass('and says “Sent”', (await words(v.page, '.si-col--account')).includes('Sent'));
  v.state.user = { ...sam(session.user), email: SAM.newEmail };
  v.answers['GET /auth/v1/user'] = async () => ({ status: 200, body: v.state.user });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await v.page.getByText('Saved', { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => null);
  pass('the second link, opened where its owner is signed in: “Saved”, with the new email in the box', (await title(v.page)) === 'email' && (await words(v.page, '.si-col--account')).includes('Saved') && (await v.page.locator('input[type=email]').inputValue().catch(() => '')) === SAM.newEmail, await title(v.page));
  await v.page.getByRole('link', { name: 'My Account' }).first().click().catch(() => null);
  await v.page.waitForURL(/\/my-account$/, { timeout: 15000 }).catch(() => null);
  await v.page.locator('.account-page').getByText(SAM.newEmail).first().waitFor({ timeout: 10000 }).catch(() => null);
  const account = await words(v.page, '.account-page');
  pass('My Account then shows the new email, and the old one nowhere', account.includes(SAM.newEmail) && !account.includes(SAM.email), path(v.page));
  await v.ctx.close();
}
{
  // The first of two links, opened where someone else is signed in (with
  // no change of their own waiting): the page still says how it went.
  const v = await visit({ verify: 'half' });
  await signedIn(v.page, v.o);
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await heading(v.page, 'Email');
  await v.page.locator('.si-note').first().waitFor({ timeout: 15000 }).catch(() => null);
  pass('the first of two links, opened where someone else is signed in: the Email page says one is opened', (await words(v.page, '.si-note')) === 'That’s one link opened. Open the one sent to your other email to finish.' && noToken(v.page), await words(v.page, '.si-note'));
  pass('and nobody was signed in or out by it', (await v.page.locator('input[type=email]').inputValue()) === SAM.email);
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
  // A long email address in that message, on a narrow phone and at twice
  // the text size (the UI tester, 13 Nov): its words wrap inside the box,
  // nothing runs off the side, and "terms" on a wrapped line keeps its own
  // tap area, clear of the button under it.
  const long = 'alexandria.featherstonehaugh@harbourlaneconsultingpartners.co';
  const v = await visit({ who: (u) => invited({ ...sam(u), email: long }), picked: SAM.gmail });
  const { page } = v;
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.locator('.si-err').first().waitFor({ timeout: 30000 }).catch(() => null);
  const inside = () => page.evaluate(() => {
    const box = document.querySelector('.si-err').getBoundingClientRect();
    const out = [...document.querySelectorAll('.si-err, .si-err *')].filter((el) => { const b = el.getBoundingClientRect(); return b.right > box.right + 0.5 || b.right > innerWidth + 0.5; }).length;
    return { out, sideways: document.documentElement.scrollWidth - innerWidth };
  });
  let seen = await inside();
  pass('a long email in the invite’s message wraps inside its box at 320 wide, with no sideways scroll', (await message(page)).includes(long) && seen.out === 0 && seen.sideways <= 0, JSON.stringify(seen));
  let taps = await page.evaluate(overlappingTaps);
  pass('and no two tap areas overlap there (“terms” on a wrapped line, above the button)', taps.length === 0, taps.join('; '));
  await page.addStyleTag({ content: 'html{font-size:32px !important}' });
  await sleep(300);
  seen = await inside();
  taps = await page.evaluate(overlappingTaps);
  pass('the same at twice the text size', seen.out === 0 && seen.sideways <= 0 && taps.length === 0, `${JSON.stringify(seen)} ${taps.join('; ')}`);
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
for (const how of ['cancel', 'error']) {
  // Google closed by the person, or not working, from the invite's page
  // (the functionality tester, 13 Nov): the invited account is still
  // signed in on its own page, and a refresh keeps it.
  const v = await visit({ who: (u) => invited(sam(u)), google: how });
  const { page, state } = v;
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.waitForURL(/\/auth\/google/, { timeout: 15000 }).catch(() => null);
  await page.waitForURL(/\/auth\/invite$/, { timeout: 20000 }).catch(() => null);
  await heading(page, 'Welcome, Sam');
  if (how === 'error') await page.locator('.si-err').first().waitFor({ timeout: 10000 }).catch(() => null);
  else await sleep(800);
  const said = await message(page);
  pass(how === 'cancel' ? 'Google closed by the person on an invite: back on the invite’s page, with no message' : 'Google not working on an invite: back on the invite’s page, with “That didn’t work.”', path(page) === '/auth/invite' && (await title(page)) === 'welcome, sam' && (how === 'cancel' ? said === '' : said === '! That didn’t work. Try again, or use your email and password.') && state.saved.length === 0 && state.unlinked === 0, `${path(page)} ${await title(page)} ${said}`);
  await page.reload();
  await heading(page, 'Welcome, Sam');
  pass('and a refresh keeps the invite’s page', (await title(page)) === 'welcome, sam', await title(page));
  await v.ctx.close();
}
{
  // The wrong Google account, and Supabase can't take it off again.
  const v = await visit({ who: (u) => invited(sam(u)), picked: SAM.gmail, unlink: 500 });
  const { page, state } = v;
  await page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(page, 'Welcome, Sam');
  await page.getByRole('checkbox').click();
  await press(page, 'Continue with Google');
  await page.locator('.si-err').first().waitFor({ timeout: 30000 }).catch(() => null);
  pass('a wrong Google account that can’t be taken off: still the invite’s page and its line, nothing agreed', path(page) === '/auth/invite' && (await message(page)) === `! This invite is for ${SAM.email}. Continue with that Google account, or set a password.` && state.saved.length === 0 && state.unlinked >= 1, `${path(page)} ${state.unlinked}`);
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

{
  // As Vercel answers (the functionality tester, 13 Nov): Date is the time
  // now, and Age is how long its edge has held the file. A right clock
  // must never be told it looks wrong.
  const edge = (page) => page.route('**/version.json*', (route) => route.fulfill({ status: 200, headers: { date: new Date().toUTCString(), age: '667', 'content-type': 'application/json' }, body: '{}' }));
  const v = await visit();
  await edge(v.page);
  await v.page.goto(`${APP}/auth/login`);
  await v.page.waitForSelector('.si-col .ds-google');
  await sleep(2500);
  pass('a right clock and a version file the edge has held for 11 minutes: nothing is said', (await v.page.locator('.si-note').count()) === 0, await words(v.page, '.si-note'));
  await v.ctx.close();
  const w = await visit();
  await edge(w.page);
  await w.page.clock.setFixedTime(new Date(Date.now() - 120 * 60 * 1000));
  await w.page.goto(`${APP}/auth/login`);
  await w.page.locator('.si-note').first().waitFor({ timeout: 15000 }).catch(() => null);
  pass('a clock 2 hours slow is still said then', (await words(w.page, '.si-note')) === CLOCK, await words(w.page, '.si-note'));
  // The clock is put right and they come back to the page: the line goes.
  await w.page.clock.setFixedTime(new Date());
  await w.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await w.page.locator('.si-note').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
  pass('once the clock is right and they come back to the page, the line goes', (await w.page.locator('.si-note').count()) === 0, await words(w.page, '.si-note'));
  await w.ctx.close();
}

// ---------------------------------------------------------------- 5. the break-it tester, 13 Nov
{
  // Addresses made to look like links: only a whole, known kind is ever handed in.
  for (const [name, address] of [
    ['a kind written in capitals', '/auth/reset-password?token_hash=a-mock-token&type=RECOVERY'],
    ['a token after the # instead of the ?', '/auth/reset-password#token_hash=a-mock-token&type=recovery'],
    ['a kind with something stuck on its end', '/auth/reset-password?token_hash=a-mock-token&type=recovery%26x'],
    ['a made-up sign-in after the #', '/auth/reset-password#access_token=made-up&refresh_token=made-up&expires_in=3600&token_type=bearer&type=recovery'],
  ]) {
    const v = await visit();
    await v.page.goto(`${APP}${address}`);
    await heading(v.page, 'Link not working');
    pass(`${name}: nothing is handed in, and nobody is signed in`, v.state.verifies.length === 0 && (await title(v.page)) === 'link not working' && !(await v.page.evaluate(() => localStorage.getItem('clarity-portal-auth'))), `${v.state.verifies} ${await title(v.page)}`);
    await v.ctx.close();
  }
  // A link that names two kinds, on a page that looks like another site's:
  // its first kind's own page, handed in once.
  const v = await visit();
  await v.page.goto(`${APP}//other.example/welcome?token_hash=${'a'.repeat(6000)}&type=recovery&type=invite&next=//other.example&returnTo=https://other.example`);
  await heading(v.page, 'New password');
  pass('a very long token with two kinds, on an address that reads like another site: its first kind’s own page on this site, handed in once', v.state.verifies.join() === 'recovery' && path(v.page) === '/auth/reset-password' && new URL(v.page.url()).origin === new URL(APP).origin && noToken(v.page), `${path(v.page)} ${v.state.verifies}`);
  await v.page.locator('input[type=password]').fill('a long new password 2026');
  await press(v.page, 'Save my new password');
  await v.page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('and after it they land on Home, never where the address pointed', v.page.url() === `${APP}/welcome`, v.page.url().slice(0, 80));
  await v.ctx.close();
}
{
  // The database gives no answer for a moment: the link has not run out.
  const v = await visit();
  let asked = 0;
  const answer = v.answers['POST /auth/v1/verify'];
  v.answers['POST /auth/v1/verify'] = async (o) => {
    asked += 1;
    if (asked === 1) return { status: 504, body: { message: 'Gateway timeout' } };
    return answer(o);
  };
  await v.page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(v.page, 'New password');
  pass('a reset link opened while the database gives no answer is handed in once more, and opens', asked === 2 && (await title(v.page)) === 'new password', `${asked} asked, ${await title(v.page)}`);
  await v.ctx.close();
  const w = await visit({ verify: 403 });
  await w.page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(w.page, 'Link not working');
  pass('a link Supabase refuses is handed in once only', w.state.verifies.length === 1 && (await title(w.page)) === 'link not working', `${w.state.verifies.length}`);
  await w.ctx.close();
}
{
  // "Saved" is said once, for the link, and never again on a later visit to the page.
  const v = await visit();
  await signedIn(v.page, v.o);
  v.state.user = { ...sam(session.user), email: SAM.newEmail };
  v.answers['GET /auth/v1/user'] = async () => ({ status: 200, body: v.state.user });
  await v.page.goto(`${APP}/my-account/email?token_hash=a-mock-token&type=email_change`);
  await v.page.getByText('Saved', { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => null);
  const first = (await words(v.page, '.si-col--account')).includes('Saved');
  await v.page.getByRole('link', { name: 'My Account' }).first().click().catch(() => null);
  await v.page.waitForURL(/\/my-account$/, { timeout: 15000 }).catch(() => null);
  // My Account itself, drawn: the Email page has really been left.
  await v.page.locator('.account-page').getByText(SAM.newEmail).first().waitFor({ timeout: 10000 }).catch(() => null);
  await v.page.locator('.si-col--account').waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
  await v.page.goBack();
  await heading(v.page, 'Email');
  await sleep(2500);
  pass('“Saved” is said once for the link: coming back to the Email page doesn’t say it again', first && path(v.page) === '/my-account/email' && !(await words(v.page, '.si-col--account')).includes('Saved'), await words(v.page, '.si-col--account'));
  await v.ctx.close();
}
{
  // The Email page left open, with a change waiting, while someone else
  // signs in on this device (another tab): nothing of the first account's
  // is shown to them, and nothing is sent for them.
  const v = await visit();
  await signedIn(v.page, v.o, { change: (u) => ({ ...u, new_email: SAM.newEmail }) });
  await v.page.goto(`${APP}/my-account/email`);
  await heading(v.page, 'Check your email');
  const other = { ...session.user, id: '00000000-0000-4000-8000-0000000000b2', email: 'jo.other@harbourlane.co', new_email: undefined, user_metadata: { first_name: 'Jo', terms_accepted: true } };
  v.answers['GET /auth/v1/user'] = async () => ({ status: 200, body: other });
  const before = v.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/auth/v1/user')).length;
  await v.page.evaluate((user) => {
    const kept = JSON.parse(localStorage.getItem('clarity-portal-auth'));
    localStorage.setItem('clarity-portal-auth', JSON.stringify({ ...kept, user }));
    // As Supabase tells a person's other tabs of a sign-in.
    new BroadcastChannel('clarity-portal-auth').postMessage({ event: 'SIGNED_IN', session: { ...kept, user } });
  }, other);
  await heading(v.page, 'Email');
  await sleep(1500);
  const text = await words(v.page, '.si-col--account');
  const box = await v.page.locator('input[type=email]').inputValue().catch(() => '');
  pass('someone else signs in under an open Email page: the first account’s new email is shown nowhere', (await title(v.page)) === 'email' && !text.includes(SAM.newEmail) && !text.includes('Send it again') && box === other.email, `${await title(v.page)}: ${text.slice(0, 80).replace(/[\w.]+@[\w.]+/g, '(email)')}`);
  pass('and nothing was sent for them', v.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/auth/v1/user')).length === before);
  await v.ctx.close();
}
{
  // A Google account left joined to an unfinished invite (the tab was
  // closed on the way back from Google, so it was never taken off), used
  // later from Sign in: it is not let in as the person invited.
  const v = await visit({ who: (u) => invited(sam(u)), picked: SAM.gmail });
  const { page, state } = v;
  let out = 0;
  v.answers['POST /auth/v1/logout'] = async () => { out += 1; return { status: 200, body: {} }; };
  await page.goto(`${APP}/auth/login`);
  await page.waitForSelector('.si-col .ds-google');
  await press(page, 'Continue with Google');
  await page.locator('.si-err').first().waitFor({ timeout: 30000 }).catch(() => null);
  pass('a wrong Google account left on an unfinished invite, used from Sign in: back on Sign in with “That didn’t work.”', path(page) === '/auth/login' && (await message(page)) === '! That didn’t work. Try again, or use your email and password.', `${path(page)} ${await message(page)}`);
  pass('it is taken off the account, nothing is agreed, and nobody is left signed in', state.unlinked === 1 && state.saved.length === 0 && !(await page.evaluate(() => localStorage.getItem('clarity-portal-auth'))), `${state.unlinked} taken off, ${state.saved.length} saved, ${out} signed out`);
  await page.goto(`${APP}/welcome`);
  await page.waitForURL(/\/auth\/login/, { timeout: 20000 }).catch(() => null);
  pass('and the portal stays shut', path(page) === '/auth/login', path(page));
  await v.ctx.close();
}
{
  // Coming back to Sign in tells the page twice over (shown, then in
  // front), and people flick between windows: one question at a time.
  const v = await visit();
  let asked = 0;
  await v.page.route('**/version.json*', async (route) => {
    asked += 1;
    await sleep(1500);
    await route.fulfill({ status: 200, headers: { date: new Date().toUTCString(), 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
  });
  await v.page.goto(`${APP}/auth/login`);
  await v.page.waitForSelector('.si-col .ds-google');
  // The page's own first question is answered first (a development build asks it twice).
  await sleep(2500);
  const first = asked;
  await v.page.evaluate(() => {
    for (let i = 0; i < 6; i += 1) {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    }
  });
  await sleep(1000);
  pass('coming back to Sign in six times at once asks for the time once, not twelve times', asked - first === 1, `${asked - first} asked`);
  await sleep(1200);
  await v.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(500);
  pass('and asks again once that answer is in', asked - first === 2, `${asked - first} asked`);
  await v.ctx.close();
}
{
  // The invite's page and Before you start left open while someone else
  // signs in on this device (another tab): Google is joined to nobody
  // else, and nothing is agreed for anybody else.
  const swap = (page) => page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('clarity-portal-auth'));
    localStorage.setItem('clarity-portal-auth', JSON.stringify({ ...kept, user: { ...kept.user, id: '00000000-0000-4000-8000-0000000000b2', email: 'jo.other@harbourlane.co' } }));
  });
  const v = await visit({ who: (u) => invited(sam(u)) });
  await v.page.goto(`${APP}/auth/invite?token_hash=a-mock-token&type=invite`);
  await heading(v.page, 'Welcome, Sam');
  await v.page.getByRole('checkbox').click();
  await swap(v.page);
  await press(v.page, 'Continue with Google');
  await sleep(2500);
  pass('the invite’s page left open while someone else signs in: Continue with Google joins Google to nobody', v.state.joins.length === 0 && v.state.authorize === 0 && v.state.saved.length === 0, `${v.state.joins.length} joined, ${v.state.authorize} on its own`);
  await v.ctx.close();
  const w = await visit({ who: (u) => invited(sam(u)) });
  await w.page.goto(`${APP}/auth/reset-password?token_hash=a-mock-token&type=recovery`);
  await heading(w.page, 'Before you start');
  await w.page.getByRole('checkbox').click();
  await swap(w.page);
  await press(w.page, 'Create my account');
  await heading(w.page, 'Link not working');
  pass('Before you start left open on a reset link while someone else signs in: nothing is agreed for them, and the link’s page is over', w.state.saved.length === 0 && (await title(w.page)) === 'link not working', `${w.state.saved.length} saved, ${await title(w.page)}`);
  await w.ctx.close();
}
{
  // What opens inside a panel fixed to the screen, beside its own link
  // ("See an example" in a guided tool), is kept in view by the panel's
  // own scrolling; the page behind never moves (rule 29aq).
  const v = await visit();
  await v.page.setViewportSize({ width: 390, height: 700 });
  await v.page.goto(`${APP}/design-reference`);
  await v.page.waitForSelector('.ui-root');
  await sleep(1500);
  const got = await v.page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = document.querySelector('.ui-root');
    window.scrollTo({ top: 600, behavior: 'instant' });
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:300px;overflow-y:auto;z-index:9999';
    panel.innerHTML = '<div style="height:260px"></div><button type="button" aria-expanded="false" style="min-height:44px">See an example</button><div hidden style="height:200px">For example</div>';
    root.appendChild(panel);
    const link = panel.querySelector('button');
    const opened = panel.lastElementChild;
    link.addEventListener('click', () => { link.setAttribute('aria-expanded', 'true'); opened.hidden = false; });
    const page = window.scrollY;
    link.click();
    await wait(1200);
    const box = link.getBoundingClientRect();
    const frame = panel.getBoundingClientRect();
    const out = { page: Math.round(window.scrollY - page), seen: opened.getBoundingClientRect().bottom <= window.innerHeight + 1, link: box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1 };
    // A link on a layer that has no scrolling of its own: the page behind stays where it is.
    panel.style.overflowY = 'visible';
    panel.style.height = 'auto';
    panel.scrollTop = 0;
    opened.hidden = true;
    link.setAttribute('aria-expanded', 'false');
    await wait(50);
    link.click();
    await wait(1200);
    out.behind = Math.round(window.scrollY - page);
    panel.remove();
    return out;
  });
  pass('what opens inside a panel, beside its own link, is brought into view by the panel’s own scrolling, with its link still in view', got.seen && got.link, JSON.stringify(got));
  pass('and the page behind a panel never moves', got.page === 0 && got.behind === 0, JSON.stringify(got));
  pass('no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

await browser.close();
done();
