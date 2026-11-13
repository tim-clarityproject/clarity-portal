// Continue with Google (M26; Tim's decisions of 11 Nov), in the running
// app on the TEST project only. Google's own page is never opened and no
// Google password is ever typed: the step where Supabase would hand over
// to Google is answered here, as Google's return, for
//   - a Google account the portal has never seen,
//   - a Google account the portal already knows, and
//   - an email account whose owner now uses Google with the same email.
// The session behind each is the seeded test client's own, shown under an
// invented name and address, and nothing is written to its real account.
//
//   node tests/signin/google.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { APP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';

const env = testEnv();
const { pass, done } = makeChecks();

// One real session for the test client, to stand behind Google's return.
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: real, error: realError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (realError) throw new Error('The test client could not sign in.');
const session = real.session;

// The three people Google can bring back.
const people = {
  fresh: (u) => ({ ...u, email: SAM.gmail, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: 'Sam Carter', full_name: 'Sam Carter', email: SAM.gmail, email_verified: true } }),
  known: (u) => ({ ...u, email: SAM.gmail, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: 'Sam Carter', full_name: 'Sam Carter', terms_accepted: true, terms_accepted_at: '2026-11-01T09:00:00.000Z', terms_documents: ['Terms of Service', 'Privacy Policy', 'Data Storage Notice'] } }),
  emailAccount: (u) => ({ ...u, email: SAM.email, app_metadata: { provider: 'email', providers: ['email', 'google'] }, user_metadata: { first_name: 'Sam', name: 'Sam Carter' } }),
};

const browser = await chromium.launch();

// One visit: a fresh device, with Google's return answered as `who`, or
// as a cancel or a miss (`back`).
async function visit({ who = 'fresh', back = 'code', phone = false, tokenStatus = 200 } = {}) {
  const calls = [];
  const state = { user: people[who](session.user), authorize: [], saved: [] };
  const answers = {
    'GET /auth/v1/authorize': async ({ url, route }) => {
      state.authorize.push(Object.fromEntries(url.searchParams));
      const to = new URL(url.searchParams.get('redirect_to') || `${APP}/auth/google`);
      if (back === 'code') to.searchParams.set('code', 'a-mock-code');
      if (back === 'cancel') { to.searchParams.set('error', 'access_denied'); to.searchParams.set('error_description', 'The user denied the request'); }
      if (back === 'miss') { to.searchParams.set('error', 'server_error'); to.searchParams.set('error_description', 'Unable to exchange external code'); }
      await route.fulfill({ status: 302, headers: { location: to.href } });
      return 'handled';
    },
    'POST /auth/v1/token': async ({ url }) => {
      if (url.searchParams.get('grant_type') !== 'pkce') return 'continue';
      if (tokenStatus !== 200) return { status: tokenStatus, body: { code: tokenStatus, error_code: 'flow_state_not_found', msg: 'invalid flow state' } };
      return { status: 200, body: { ...session, user: state.user } };
    },
    'GET /auth/v1/user': async () => ({ status: 200, body: state.user }),
    'PUT /auth/v1/user': async ({ body }) => {
      state.saved.push(body);
      state.user = { ...state.user, user_metadata: { ...state.user.user_metadata, ...(body?.data || {}) } };
      return { status: 200, body: state.user };
    },
  };
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', hasTouch: phone, isMobile: phone });
  await guard(ctx, calls, answers);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, calls, state, errors };
}
const path = (page) => new URL(page.url()).pathname;
const google = (page) => page.getByRole('button', { name: 'Continue with Google' });
const message = (page) => page.locator('.si-err').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const profileWrites = (calls) => calls.filter((c) => c.path?.endsWith('/rest/v1/profiles') && c.method !== 'GET');

// ---------------------------------------------------------------- 1. a new Google account, from Sign in
{
  const v = await visit({ who: 'fresh' });
  const { page, state, calls } = v;
  await page.goto(`${APP}/auth/login`);
  await page.waitForSelector('.si-col .ds-google');
  const box = await google(page).boundingBox();
  const emailBox = await page.locator('input[type=email]').boundingBox();
  pass('Sign in: Continue with Google sits above Email', box.y + box.height < emailBox.y, `${box.y} then ${emailBox.y}`);
  await google(page).click();
  await page.waitForURL(/\/auth\/before-you-start$/, { timeout: 20000 });
  const a = state.authorize[0] || {};
  pass('Google is asked for by name', a.provider === 'google', a.provider);
  pass('the return address is this page’s own origin, never a fixed one', a.redirect_to === `${new URL(APP).origin}/auth/google`, a.redirect_to);
  pass('the sign-in is tied to this device (a code challenge goes with it)', Boolean(a.code_challenge));
  pass('a new Google account from Sign in gets Before you start', path(page) === '/auth/before-you-start');
  const words = (await page.locator('.si-col').innerText()).replace(/\s+/g, ' ');
  pass('it says who they are signing in as', words.includes(`You’re signing in as ${SAM.gmail}.`), words.slice(0, 160));
  pass('one title, Before you start, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'before you start');
  // The portal stays shut until the box is ticked.
  await page.goto(`${APP}/welcome`);
  await page.waitForURL(/\/auth\/before-you-start$/, { timeout: 20000 });
  pass('the portal stays shut until the box is ticked (Home sends them back)', path(page) === '/auth/before-you-start');
  await page.goto(`${APP}/dashboard`);
  await page.waitForURL(/\/auth\/before-you-start$/, { timeout: 20000 });
  pass('any other page sends them back too', path(page) === '/auth/before-you-start');
  // Not ticked: the words beside the box, never a greyed-out button.
  const button = page.getByRole('button', { name: 'Create my account' });
  pass('Create my account is never greyed out', !(await button.isDisabled()) && (await button.evaluate((el) => getComputedStyle(el).opacity)) === '1');
  await button.click();
  pass('pressing it without the tick says “Tick the box to carry on.”', (await message(page)) === '! Tick the box to carry on.', await message(page));
  pass('nothing was saved without the tick', state.saved.length === 0);
  await page.getByRole('checkbox').click();
  pass('ticking clears the message', (await page.locator('.si-err').count()) === 0);
  await button.click();
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
  const rec = state.saved[0]?.data || {};
  pass('the agreement is stored as an email sign-up’s is: accepted, when, and the three documents',
    rec.terms_accepted === true && /^\d{4}-\d{2}-\d{2}T/.test(rec.terms_accepted_at || '') && JSON.stringify(rec.terms_documents) === JSON.stringify(['Terms of Service', 'Privacy Policy', 'Data Storage Notice']), JSON.stringify(rec));
  pass('the profile’s own record is set too', profileWrites(calls).some((c) => c.body?.terms_accepted === true), JSON.stringify(profileWrites(calls).map((c) => c.body)));
  pass('then Home', path(page) === '/welcome');
  await page.goto(`${APP}/auth/before-you-start`);
  await page.waitForURL(/\/welcome$/, { timeout: 20000 });
  pass('Before you start never shows again once agreed', path(page) === '/welcome');
  pass('no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 2. a new Google account, from Create my account
{
  const v = await visit({ who: 'fresh' });
  const { page, state } = v;
  await page.goto(`${APP}/auth/sign-up`);
  await page.waitForSelector('.si-col .ds-google');
  const order = await page.evaluate(() => [...document.querySelectorAll('.si-col .ds-google, .si-col .si-field label')].map((el) => el.innerText.trim()));
  pass('Create my account: Google above First name, Email, Password', JSON.stringify(order) === JSON.stringify(['Continue with Google', 'First name', 'Email', 'Password']), order.join(' | '));
  await google(page).click();
  await sleep(500);
  pass('Continue with Google without the tick says “Tick the box to carry on.”', (await message(page)) === '! Tick the box to carry on.', await message(page));
  pass('and never leaves for Google', state.authorize.length === 0 && path(page) === '/auth/sign-up');
  const besideBox = await page.evaluate(() => {
    const err = document.querySelector('.si-err').getBoundingClientRect(); const row = document.querySelector('.si-terms').getBoundingClientRect();
    return err.top - row.bottom;
  });
  pass('the message sits straight under the tick box row', besideBox >= 0 && besideBox <= 16, `${besideBox}px`);
  await page.getByRole('checkbox').click();
  await google(page).click();
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
  pass('with the tick, a new Google account goes straight on to Home', path(page) === '/welcome');
  pass('its agreement was saved on the way, with no First name asked for', state.saved.length === 1 && state.saved[0]?.data?.terms_accepted === true, JSON.stringify(state.saved));
  pass('Before you start was not needed', !v.calls.some((c) => c.path === '/auth/before-you-start'));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 3. a Google account the portal already knows, with a deep link
{
  const v = await visit({ who: 'known' });
  const { page, state } = v;
  await page.goto(`${APP}/my-plans?area=personal#top`);
  await page.waitForURL(/\/auth\/login$/, { timeout: 20000 });
  await google(page).click();
  await page.waitForURL(/\/my-plans/, { timeout: 30000 }).catch(() => null);
  const u = new URL(page.url());
  pass('an account the portal knows lands where its link pointed, query and hash kept', u.pathname === '/my-plans' && u.search === '?area=personal' && u.hash === '#top', `${u.pathname}${u.search}${u.hash}`);
  pass('it is not asked to agree again', state.saved.length === 0);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 4. an email account, now using Google with the same email
{
  const v = await visit({ who: 'emailAccount' });
  const { page, state, calls } = v;
  await page.goto(`${APP}/auth/login`);
  await google(page).click();
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
  pass('the same email with Google signs in to the account it already has: straight to Home', path(page) === '/welcome');
  pass('no Before you start, and nothing new is saved on the account', state.saved.length === 0);
  pass('the app asks for no second account (no sign-up call)', !calls.some((c) => c.path?.endsWith('/auth/v1/signup')));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 5. cancelled by the person
for (const from of ['/auth/login', '/auth/sign-up']) {
  const v = await visit({ who: 'fresh', back: 'cancel' });
  const { page } = v;
  await page.goto(`${APP}${from}`);
  if (from === '/auth/sign-up') await page.getByRole('checkbox').click();
  await google(page).click();
  await page.waitForURL(new RegExp(`${from}$`), { timeout: 20000 });
  await page.waitForSelector('.si-col .ds-google');
  await sleep(400);
  pass(`cancelled at Google from ${from}: back on that page`, path(page) === from);
  pass(`cancelled at Google from ${from}: no message`, (await page.locator('.si-err').count()) === 0, await message(page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 6. Google not working
for (const [name, opts] of [['Google answers with an error', { back: 'miss' }], ['the sign-in can’t be finished', { tokenStatus: 400 }]]) {
  const v = await visit({ who: 'fresh', ...opts });
  const { page } = v;
  await page.goto(`${APP}/auth/login`);
  await google(page).click();
  await page.waitForSelector('.si-err', { timeout: 25000 });
  pass(`${name}: back on Sign in`, path(page) === '/auth/login');
  pass(`${name}: “That didn’t work.” then what to do`, (await message(page)) === '! That didn’t work. Try again, or use your email and password.', await message(page));
  const lines = await page.locator('.si-err span > span').allInnerTexts();
  pass(`${name}: what happened, then what to do, on two lines`, lines.length === 2, lines.join(' / '));
  await v.ctx.close();
}

// ---------------------------------------------------------------- 7. no connection
{
  const v = await visit({ who: 'fresh', phone: true });
  const { page, state } = v;
  await page.goto(`${APP}/auth/login`);
  await page.waitForSelector('.si-col .ds-google');
  await sleep(300);
  await v.ctx.setOffline(true);
  await sleep(300);
  await google(page).click();
  await sleep(400);
  pass('offline, Continue with Google: one calm line that signing in needs a connection', (await message(page)) === '! Signing in needs a connection, so try again when you’re back online.', await message(page));
  pass('offline: Google is not asked', state.authorize.length === 0);
  await page.locator('input[type=email]').fill(SAM.email);
  await page.locator('.si-pw input').fill('harbourlane42');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await sleep(400);
  pass('offline, Sign in: the same calm line', (await message(page)) === '! Signing in needs a connection, so try again when you’re back online.', await message(page));
  await v.ctx.setOffline(false);
  await v.ctx.close();
}

// ---------------------------------------------------------------- 8. Use a different Google account
{
  const v = await visit({ who: 'fresh' });
  const { page, state } = v;
  await page.goto(`${APP}/auth/login`);
  await google(page).click();
  await page.waitForURL(/\/auth\/before-you-start$/, { timeout: 20000 });
  state.user = people.known(session.user);
  await page.getByRole('button', { name: 'Use a different Google account' }).click();
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
  const second = state.authorize[1] || {};
  pass('“Use a different Google account” asks Google to let them choose', second.prompt === 'select_account', JSON.stringify(second.prompt));
  pass('and comes back to this origin again', second.redirect_to === `${new URL(APP).origin}/auth/google`, second.redirect_to);
  pass('the account chosen goes on in', path(page) === '/welcome');
  await v.ctx.close();
}

// ---------------------------------------------------------------- Google's own button
for (const mode of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: mode });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's */ } }, mode);
  await guard(ctx, [], {});
  const page = await ctx.newPage();
  await page.goto(`${APP}/auth/login`);
  const g = await google(page).evaluate((el) => {
    const st = getComputedStyle(el);
    return { bg: st.backgroundColor, edge: st.borderTopColor, text: st.color, font: st.fontFamily.split(',')[0].replace(/"/g, ''), weight: st.fontWeight, height: el.getBoundingClientRect().height, fills: [...el.querySelectorAll('svg path')].map((p) => p.getAttribute('fill')) };
  });
  const want = mode === 'dark' ? { bg: 'rgb(19, 19, 20)', edge: 'rgb(142, 145, 143)', text: 'rgb(227, 227, 227)' } : { bg: 'rgb(255, 255, 255)', edge: 'rgb(116, 119, 117)', text: 'rgb(31, 31, 31)' };
  pass(`Google’s button, ${mode}: Google’s own ${mode} version`, g.bg === want.bg && g.edge === want.edge && g.text === want.text, JSON.stringify(g));
  pass(`Google’s button, ${mode}: their four-colour G, never recoloured`, JSON.stringify(g.fills) === JSON.stringify(['#EA4335', '#4285F4', '#FBBC05', '#34A853']), g.fills.join(','));
  pass(`Google’s button, ${mode}: Roboto Medium, 44px high`, g.font === 'Roboto' && g.weight === '500' && Math.abs(g.height - 44) < 0.6, `${g.font} ${g.weight} ${g.height}`);
  await ctx.close();
}

await browser.close();
done();
