// The sign-in pages at work (M26; Tim's decisions of 11 Nov), in the
// running app on the TEST project only: signing in, creating an account,
// passwords, and My Account's Password and Email pages. No real email is
// sent: every call that would send one is answered here and checked.
//
//   node tests/signin/flows.mjs
import { chromium } from 'playwright';
import { APP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { openedResetLink, signedIn } from './screens.mjs';

const env = testEnv();
const { pass, done } = makeChecks();
const ORIGIN = new URL(APP).origin;
const browser = await chromium.launch();

async function open({ phone = false, answers = {}, mode = 'dark' } = {}) {
  const calls = [];
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, hasTouch: phone, isMobile: phone });
  await guard(ctx, calls, answers);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, calls, answers, errors, o: { env, answers, SAM } };
}
const path = (page) => new URL(page.url()).pathname;
const text = (page, sel = '.si-col') => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const message = (page) => text(page, '.si-err');
const lines = (page) => page.locator('.si-err span > span').allInnerTexts();
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
const ready = (page) => page.waitForSelector('.si-col');
const at = (page, name) => page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 15000 }).catch(() => null);
const sent = (calls, end, method = 'POST') => calls.filter((c) => c.method === method && c.path?.endsWith(end));
const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('.si-col input')].map((el) => ({
  label: el.labels?.[0]?.innerText.trim() || '', tied: Boolean(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)), auto: el.getAttribute('autocomplete'), type: el.type, size: parseFloat(getComputedStyle(el).fontSize),
})));
const want = (list, expected) => JSON.stringify(list.map((b) => [b.label, b.auto, b.tied])) === JSON.stringify(expected.map(([l, a]) => [l, a, true]));

// ---------------------------------------------------------------- Sign in
{
  const v = await open();
  const { page, calls } = v;
  await page.goto(`${APP}/my-plans?area=personal`);
  await page.waitForURL(/\/auth\/login$/);
  await ready(page);
  const words = await text(page);
  pass('Sign in: “Clarity drives performance.” under the name', words.includes('THE CLARITY PORTAL Clarity drives performance.'), words.slice(0, 80));
  pass('Sign in: no “Remember me”, no emailed sign-in link, no footer', !/remember me|sign-in link|magic|terms of service|privacy/i.test(words) && (await page.locator('footer, .legal-footer-links').count()) === 0, words);
  const b = await boxes(page);
  pass('Sign in: Email is username, Password is current-password, each tied to its label', want(b, [['Email', 'username'], ['Password', 'current-password']]), JSON.stringify(b));
  pass('Sign in: boxes are 16px or more', b.every((x) => x.size >= 16), JSON.stringify(b.map((x) => x.size)));
  // Show
  const show = page.locator('.si-show');
  await page.locator('.si-pw input').fill('harbourlane');
  pass('Show: starts hidden, says Show', (await page.locator('.si-pw input').getAttribute('type')) === 'password' && (await show.innerText()) === 'Show' && (await show.getAttribute('aria-pressed')) === 'false');
  await show.click();
  pass('Show: shows the password and says Hide', (await page.locator('.si-pw input').getAttribute('type')) === 'text' && (await show.innerText()) === 'Hide' && (await show.getAttribute('aria-pressed')) === 'true');
  await show.click();
  // Nothing filled in, then details that don't match.
  await page.locator('.si-pw input').fill('');
  await press(page, 'Sign in');
  pass('Sign in with nothing typed: the button works and says what happened', (await message(page)).startsWith('! That email or password doesn’t match.'), await message(page));
  await page.locator('input[type=email]').fill(env.TEST_CLIENT_EMAIL);
  await page.locator('.si-pw input').fill('not-the-password-7391');
  await press(page, 'Sign in');
  await sleep(1500);
  pass('details that don’t match: “That email or password doesn’t match.” then “Try again, or reset your password.”', JSON.stringify(await lines(page)) === JSON.stringify(['That email or password doesn’t match.', 'Try again, or reset your password.']), (await lines(page)).join(' / '));
  const place = await page.evaluate(() => { const e = document.querySelector('.si-err').getBoundingClientRect(); const p = document.querySelector('.si-pw').getBoundingClientRect(); const bt = document.querySelector('.si-btn').getBoundingClientRect(); return e.top > p.bottom && e.bottom < bt.top; });
  pass('the message sits between the Password box and the button', place);
  pass('the message is announced (role alert)', (await page.locator('.si-err').getAttribute('role')) === 'alert');
  // The right details, by pressing Enter: straight to where the link pointed.
  await page.locator('.si-pw input').fill(env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/my-plans/, { timeout: 30000 }).catch(() => null);
  const u = new URL(page.url());
  pass('after signing in they land where their link pointed', u.pathname === '/my-plans' && u.search === '?area=personal', `${u.pathname}${u.search}`);
  pass('no welcome-back stop on the way', !calls.some((c) => c.path === '/auth/welcome-back'));
  // Already signed in: the sign-in pages pass them on.
  await page.goto(`${APP}/auth/login`);
  await page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
  pass('someone already signed in who opens Sign in goes to Home', path(page) === '/welcome', path(page));
  for (const old of ['/auth/welcome-back', '/auth/finished', '/login']) {
    await page.goto(`${APP}${old}`);
    await page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
    pass(`the old address ${old} goes to Home`, path(page) === '/welcome', path(page));
  }
  pass('Sign in: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

// A deep link that isn't the portal's is never followed.
{
  const v = await open();
  await v.page.goto(`${APP}/auth/login`);
  await ready(v.page);
  await v.page.evaluate(() => sessionStorage.setItem('clarity-sign-in-next', 'https://example.org/elsewhere'));
  await v.page.locator('input[type=email]').fill(env.TEST_CLIENT_EMAIL);
  await v.page.locator('.si-pw input').fill(env.TEST_CLIENT_PASSWORD);
  await v.page.keyboard.press('Enter');
  await v.page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('an address outside the portal is never a destination: Home instead', v.page.url() === `${APP}/welcome`, v.page.url().replace(APP, ''));
  await v.ctx.close();
}

// An account whose email isn't confirmed yet.
{
  const v = await open({ answers: { 'POST /auth/v1/token': () => ({ status: 400, body: { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' } }) } });
  await v.page.goto(`${APP}/auth/login`);
  await ready(v.page);
  await v.page.locator('input[type=email]').fill(SAM.email);
  await v.page.locator('.si-pw input').fill('harbourlane42');
  await press(v.page, 'Sign in');
  await v.page.waitForURL(/\/auth\/check-email$/, { timeout: 15000 }).catch(() => null);
  await at(v.page, 'Check your email');
  pass('an email sign-up can’t get in before confirming: Sign in sends them to Check your email', path(v.page) === '/auth/check-email' && (await text(v.page)).includes(`We’ve sent a link to ${SAM.email}.`), `${path(v.page)} ${await text(v.page)}`);
  await v.ctx.close();
}

// ---------------------------------------------------------------- Create my account
{
  const pwned = (p) => (p.endsWith('/5BAA6') ? '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\n' : '0000000000000000000000000000000000A:0\n');
  const v = await open({ answers: { pwned, 'POST /auth/v1/signup': () => ({ status: 200, body: { id: '00000000-0000-4000-8000-000000000001', email: SAM.email, identities: [{ provider: 'email' }], user_metadata: {} } }) } });
  const { page, calls } = v;
  await page.goto(`${APP}/auth/sign-up`);
  await ready(page);
  const b = await boxes(page);
  pass('Create my account: First name (given-name) above Email (username), then Password (new-password), each tied to its label', want(b, [['First name', 'given-name'], ['Email', 'username'], ['Password', 'new-password']]), JSON.stringify(b));
  const first = await text(page);
  pass('“Please use at least 8 characters.” is not shown before a password is tried', !first.includes('at least 8 characters'));
  pass('one tick box, not ticked to begin with', (await page.getByRole('checkbox').count()) === 1 && (await page.getByRole('checkbox').getAttribute('aria-checked')) === 'false');
  pass('its words: “I’m 18 or over and I agree to the terms.”', first.includes('I’m 18 or over and I agree to the terms.'), first);
  const button = page.getByRole('button', { name: 'Create my account' });
  pass('Create my account is never greyed out', !(await button.isDisabled()));
  // One message at a time, top to bottom.
  await button.click();
  pass('nothing typed: asks for the first name', (await message(page)) === '! Add your first name to carry on.', await message(page));
  await page.getByLabel('First name').fill(SAM.first);
  await page.locator('input[type=email]').fill('sam.carter');
  await button.click();
  pass('an email that isn’t one: says so, then what to do', (await message(page)) === '! That email address doesn’t look right. Check it and try again.', await message(page));
  await page.locator('input[type=email]').fill(SAM.email);
  await page.locator('.si-pw input').fill('harbour');
  await button.click();
  pass('a 7-character password: “Please use at least 8 characters.”', (await message(page)) === '! Please use at least 8 characters.', await message(page));
  const under = await page.evaluate(() => { const e = document.querySelector('.si-err').getBoundingClientRect(); const p = document.querySelector('.si-pw').getBoundingClientRect(); const t = document.querySelector('.si-terms').getBoundingClientRect(); return e.top > p.bottom && e.bottom <= t.top + 1; });
  pass('it sits under the Password box, above the tick box', under);
  await page.locator('.si-pw input').fill('harbourlane42');
  await button.click();
  pass('not ticked: “Tick the box to carry on.”', (await message(page)) === '! Tick the box to carry on.', await message(page));
  pass('nothing was sent while anything was missing', sent(calls, '/auth/v1/signup').length === 0);
  // The words tick the box too; "terms" opens the one panel with all three documents.
  await page.locator('.si-terms-words').click({ position: { x: 4, y: 8 } });
  pass('tapping the words ticks the box, and the message goes', (await page.getByRole('checkbox').getAttribute('aria-checked')) === 'true' && (await page.locator('.si-err').count()) === 0);
  await page.locator('.si-terms .si-link').click();
  await page.getByRole('dialog').waitFor();
  const tabs = await page.getByRole('tab').allInnerTexts();
  pass('“terms” opens the one terms panel with all three legal documents', tabs.length === 3 && /terms/i.test(tabs.join(' ')) && /privacy/i.test(tabs.join(' ')) && /data/i.test(tabs.join(' ')), tabs.join(' | '));
  pass('opening the terms doesn’t untick the box', (await page.getByRole('checkbox').getAttribute('aria-checked')) === 'true');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => null);
  // A known leaked password is refused in the page.
  await page.locator('.si-pw input').fill('password');
  await button.click();
  await page.waitForSelector('.si-err');
  pass('a known leaked password is refused in the page: what happened, then what to do', JSON.stringify(await lines(page)) === JSON.stringify(['That password has appeared in a data leak.', 'Please choose a different one.']), (await lines(page)).join(' / '));
  pass('only 5 characters of its fingerprint left the device', calls.some((c) => c.blocked === 'https://api.pwnedpasswords.com/range/5BAA6'), JSON.stringify(calls.filter((c) => c.blocked).map((c) => c.blocked)));
  pass('and no account was asked for', sent(calls, '/auth/v1/signup').length === 0);
  // A good one: the account is asked for, and Check your email follows.
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await button.click();
  await page.waitForURL(/\/auth\/check-email$/, { timeout: 15000 }).catch(() => null);
  await at(page, 'Check your email');
  const call = sent(calls, '/auth/v1/signup')[0] || {};
  const data = call.body?.data || {};
  pass('the first name goes with the account', data.first_name === SAM.first, JSON.stringify(data.first_name));
  pass('the agreement goes with it: accepted, when, and the three documents', data.terms_accepted === true && /^\d{4}-\d{2}-\d{2}T/.test(data.terms_accepted_at || '') && (data.terms_documents || []).length === 3, JSON.stringify(data));
  pass('the confirmation link comes back to this origin’s Email confirmed page', call.query?.redirect_to === `${ORIGIN}/auth/confirmed`, call.query?.redirect_to);
  const words = await text(page);
  pass('Check your email names the address and says what to do', words.includes(`We’ve sent a link to ${SAM.email}.`) && words.includes('Open it to finish creating your account.') && words.includes('Didn’t get it? Send it again'), words);
  pass('they are not let in before confirming', path(page) === '/auth/check-email');
  await page.getByRole('button', { name: 'Send it again' }).click();
  await page.getByText('Sent', { exact: true }).waitFor({ timeout: 8000 }).catch(() => null);
  const again = sent(calls, '/auth/v1/resend')[0] || {};
  pass('Send it again asks for the same link again, and says Sent', again.body?.type === 'signup' && again.body?.email === SAM.email && again.query?.redirect_to === `${ORIGIN}/auth/confirmed` && (await text(page)).includes('Sent'), JSON.stringify({ type: again.body?.type, to: again.query?.redirect_to }));
  await page.reload();
  await at(page, 'Check your email');
  pass('a refresh still names the address', (await text(page)).includes(SAM.email));
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.waitForURL(/\/auth\/login$/);
  pass('Back to sign in goes to Sign in', path(page) === '/auth/login');
  pass('Create my account: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}

// An email that already has an account.
{
  const v = await open({ answers: { 'POST /auth/v1/signup': () => ({ status: 200, body: { id: '00000000-0000-4000-8000-000000000000', email: SAM.email, identities: [], user_metadata: {} } }) } });
  await v.page.goto(`${APP}/auth/sign-up?email=${encodeURIComponent(SAM.email)}`);
  await ready(v.page);
  pass('an email brought in by a link is filled in', (await v.page.locator('input[type=email]').inputValue()) === SAM.email);
  await v.page.getByLabel('First name').fill(SAM.first);
  await v.page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await v.page.getByRole('checkbox').click();
  await press(v.page, 'Create my account');
  await v.page.waitForSelector('.si-err');
  pass('an email already used: “There’s already an account with this email.” then “Sign in, or reset your password.”', JSON.stringify(await lines(v.page)) === JSON.stringify(['There’s already an account with this email.', 'Sign in, or reset your password.']), (await lines(v.page)).join(' / '));
  const under = await v.page.evaluate(() => { const e = document.querySelector('.si-err').getBoundingClientRect(); const em = document.querySelector('input[type=email]').getBoundingClientRect(); const p = document.querySelector('.si-pw').getBoundingClientRect(); return e.top > em.bottom && e.bottom < p.top; });
  pass('it sits under the Email box', under);
  await v.ctx.close();
}

// ---------------------------------------------------------------- Email confirmed, and the older addresses
for (const address of ['/auth/confirmed', '/auth/mission', '/email-confirmation']) {
  const v = await open();
  await signedIn(v.page, v.o);
  await v.page.goto(`${APP}${address}`);
  await v.page.getByRole('heading', { name: 'Email confirmed' }).waitFor({ timeout: 15000 }).catch(() => null);
  const words = await text(v.page);
  pass(`${address}: Email confirmed, with the welcome by name`, words.includes('EMAIL CONFIRMED') && words.includes('Welcome to The Clarity Portal, Sam.'), words);
  if (address === '/auth/confirmed') {
    await press(v.page, 'Open my portal');
    await v.page.waitForURL(/\/welcome$/, { timeout: 20000 }).catch(() => null);
    pass('Open my portal opens Home', path(v.page) === '/welcome', path(v.page));
  }
  await v.ctx.close();
}
{
  const v = await open();
  await v.page.goto(`${APP}/auth/confirmed?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await ready(v.page);
  const words = await text(v.page);
  pass('a confirmation link that has run out: Link not working', words.includes('LINK NOT WORKING') && words.includes('This link has run out or has already been used.') && words.includes('SEND A NEW LINK'), words);
  await v.ctx.close();
}

// ---------------------------------------------------------------- Passwords
{
  const v = await open({ phone: true });
  const { page, calls } = v;
  await page.goto(`${APP}/auth/login`);
  await ready(page);
  await page.locator('input[type=email]').fill(SAM.email);
  await page.getByRole('link', { name: 'Forgotten your password?' }).click();
  await page.waitForURL(/\/forgot-password$/);
  await at(page, 'Reset your password');
  pass('Forgotten your password: the email typed on Sign in is already there', (await page.locator('input[type=email]').inputValue()) === SAM.email);
  pass('its title is Reset your password, as the h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'reset your password');
  const b = await boxes(page);
  pass('its Email box is username, tied to its label', want(b, [['Email', 'username']]), JSON.stringify(b));
  await page.locator('input[type=email]').fill('');
  await press(page, 'Email my reset link');
  pass('no email: says what to add', (await message(page)) === '! Add your email to carry on.', await message(page));
  await page.locator('input[type=email]').fill(SAM.email);
  await press(page, 'Email my reset link');
  await page.waitForURL(/\/forgot-password\/check-email$/, { timeout: 15000 }).catch(() => null);
  await at(page, 'Check your email');
  const call = sent(calls, '/auth/v1/recover')[0] || {};
  pass('the reset link comes back to this origin’s New password page', call.body?.email === SAM.email && call.query?.redirect_to === `${ORIGIN}/auth/reset-password`, call.query?.redirect_to);
  const words = await text(page);
  pass('Check your email (reset): the address, and “The link works for 1 hour.”', words.includes(`We’ve sent a reset link to ${SAM.email}.`) && words.includes('The link works for 1 hour.') && words.includes('Didn’t get it? Send it again'), words);
  await page.getByRole('button', { name: 'Send it again' }).click();
  await page.getByText('Sent', { exact: true }).waitFor({ timeout: 8000 }).catch(() => null);
  pass('Send it again sends the reset link again', sent(calls, '/auth/v1/recover').length === 2 && (await text(page)).includes('Sent'));
  await v.ctx.close();
}
{
  // A reset link opened in this tab: New password, then straight in to Home with "Saved".
  const v = await open();
  const { page, calls } = v;
  await signedIn(page, v.o);
  await page.goto(`${APP}/auth/reset-password`);
  await ready(page);
  await page.getByRole('heading', { name: 'Link not working' }).waitFor({ timeout: 15000 }).catch(() => null);
  pass('New password without a reset link, even signed in: Link not working', (await text(page)).includes('LINK NOT WORKING'), await text(page));
  await press(page, 'Send a new link');
  await page.waitForURL(/\/forgot-password$/);
  pass('Send a new link goes to Reset your password', path(page) === '/forgot-password');
  // The older note was a bare time, which anyone signed in could write in
  // the address bar's own tools: it opens nothing now (the functionality
  // tester, 13 Nov). The note is for the account whose link was opened.
  await page.evaluate(() => sessionStorage.setItem('clarity-sign-in-reset', String(Date.now())));
  await page.goto(`${APP}/auth/reset-password`);
  await page.getByRole('heading', { name: 'Link not working' }).waitFor({ timeout: 15000 }).catch(() => null);
  pass('a bare time left in the tab is not a reset link: Link not working', (await text(page)).includes('LINK NOT WORKING'), await text(page));
  await openedResetLink(page);
  await page.goto(`${APP}/auth/reset-password`);
  await page.getByRole('heading', { name: 'New password' }).waitFor({ timeout: 15000 }).catch(() => null);
  const b = await boxes(page);
  pass('New password: one Password box, new-password, tied to its label', want(b, [['Password', 'new-password']]), JSON.stringify(b));
  pass('no hint before a password is tried', !(await text(page)).includes('at least 8 characters'));
  await page.locator('.si-pw input').fill('harbour');
  await press(page, 'Save my new password');
  pass('too short: “Please use at least 8 characters.”', (await message(page)) === '! Please use at least 8 characters.', await message(page));
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await press(page, 'Save my new password');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 }).catch(() => null);
  pass('a new password signs them straight in to Home', path(page) === '/welcome', path(page));
  pass('with “Saved”', await page.getByText('Saved', { exact: true }).first().isVisible().catch(() => false));
  const save = sent(calls, '/auth/v1/user', 'PUT')[0] || {};
  pass('the new password was sent to be saved (answered here, so the test client keeps its own)', save.body?.password === '(hidden)', JSON.stringify(Object.keys(save.body || {})));
  await page.goto(`${APP}/auth/reset-password`);
  await page.getByRole('heading', { name: 'Link not working' }).waitFor({ timeout: 15000 }).catch(() => null);
  pass('the link can’t be used twice from this tab', (await text(page)).includes('LINK NOT WORKING'));
  await v.ctx.close();
}

// ---------------------------------------------------------------- Inside My Account
{
  const v = await open();
  const { page, calls, answers } = v;
  await signedIn(page, v.o);
  await page.goto(`${APP}/my-account`);
  await page.getByRole('button', { name: 'Edit my password' }).waitFor({ timeout: 20000 });
  const acct = (await page.locator('.account-page').innerText()).replace(/\s+/g, ' ');
  pass('My Account: Email and Password, each with Edit (never Change)', acct.includes('Edit my email') && acct.includes('Edit my password') && !/\bchange\b/i.test(acct.split('Appearance')[0]), acct.slice(0, 260));
  await page.getByRole('button', { name: 'Edit my password' }).click();
  await page.waitForURL(/\/my-account\/password$/);
  await page.waitForSelector('.si-col--account');
  pass('Password: one h1', (await page.locator('h1').allInnerTexts()).join('|').toLowerCase() === 'password');
  const b = await boxes(page);
  pass('Password: Current password (current-password) and New password (new-password), each tied to its label', want(b, [['Current password', 'current-password'], ['New password', 'new-password']]), JSON.stringify(b));
  // The current password is checked without touching this device's session.
  answers['POST /auth/v1/token'] = ({ url }) => (url.searchParams.get('grant_type') === 'password' ? { status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } } : 'continue');
  await page.locator('.si-pw input').nth(0).fill('not-my-password');
  await page.locator('.si-pw input').nth(1).fill('lighthouse-keeper-77');
  await press(page, 'Save my new password');
  await page.waitForSelector('.si-err');
  pass('a wrong current password: what happened, then what to do', JSON.stringify(await lines(page)) === JSON.stringify(['That isn’t your current password.', 'Try again, or reset your password.']), (await lines(page)).join(' / '));
  pass('nothing was saved', sent(calls, '/auth/v1/user', 'PUT').length === 0);
  answers['POST /auth/v1/token'] = ({ url }) => (url.searchParams.get('grant_type') === 'password' ? { status: 200, body: {} } : 'continue');
  await page.locator('.si-pw input').nth(1).fill('harbour');
  await press(page, 'Save my new password');
  await sleep(400);
  pass('a new password that’s too short: “Please use at least 8 characters.”', (await message(page)) === '! Please use at least 8 characters.', await message(page));
  await page.locator('.si-pw input').nth(1).fill('lighthouse-keeper-77');
  await press(page, 'Save my new password');
  await page.waitForSelector('.ds-status--saved');
  pass('saved: “Saved” beside the button, and the boxes clear', (await page.locator('.si-pw input').nth(0).inputValue()) === '' && (await page.locator('.si-pw input').nth(1).inputValue()) === '');
  pass('still signed in, on the same page', path(page) === '/my-account/password');
  await page.getByRole('link', { name: 'My Account' }).click();
  await page.waitForURL(/\/my-account$/);
  // Email
  await page.getByRole('button', { name: 'Edit my email' }).click();
  await page.waitForURL(/\/my-account\/email$/);
  await page.waitForSelector('.si-col--account');
  pass('Email: the box starts with their email', (await page.locator('input[type=email]').inputValue()) === SAM.email);
  await press(page, 'Save my new email');
  pass('the same email: says so', (await message(page)) === '! That’s already your email. Enter a different one to carry on.', await message(page));
  const before = sent(calls, '/auth/v1/user', 'PUT').length;
  await page.locator('input[type=email]').fill(SAM.newEmail);
  await press(page, 'Save my new email');
  await page.getByText('Your email changes once you open it.').waitFor({ timeout: 10000 }).catch(() => null);
  const change = sent(calls, '/auth/v1/user', 'PUT')[before] || {};
  pass('the new email is sent its link, back to this origin’s Email page', change.body?.email === SAM.newEmail && change.query?.redirect_to === `${ORIGIN}/my-account/email`, JSON.stringify({ to: change.query?.redirect_to }));
  const words = (await page.locator('.si-col--account').innerText()).replace(/\s+/g, ' ');
  pass('“We’ve sent a link to …” and “Your email changes once you open it.”', words.includes(`We’ve sent a link to ${SAM.newEmail}.`) && words.includes('Your email changes once you open it.') && words.includes('Didn’t get it? Send it again'), words);
  await page.getByRole('button', { name: 'Send it again' }).click();
  await page.getByText('Sent', { exact: true }).waitFor({ timeout: 8000 }).catch(() => null);
  pass('Send it again sends the link again', sent(calls, '/auth/v1/user', 'PUT').length === before + 2);
  pass('My Account pages: no page error', v.errors.length === 0, v.errors[0]);
  await v.ctx.close();
}
{
  // Someone who signs in with Google.
  const v = await open({ phone: true });
  await signedIn(v.page, v.o, { email: SAM.gmail, change: (u) => ({ ...u, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { ...u.user_metadata, terms_accepted: true } }) });
  await v.page.goto(`${APP}/my-account`);
  await v.page.getByText('You sign in with Google.').waitFor({ timeout: 20000 }).catch(() => null);
  const acct = (await v.page.locator('.account-page').innerText()).replace(/\s+/g, ' ');
  pass('someone who signs in with Google: My Account says “You sign in with Google.”', acct.includes('You sign in with Google.'), acct.slice(0, 200));
  pass('and offers no Password page', !acct.includes('Edit my password'));
  await v.page.goto(`${APP}/my-account/password`);
  await v.page.waitForURL(/\/my-account$/, { timeout: 15000 }).catch(() => null);
  pass('the Password address sends them back to My Account', path(v.page) === '/my-account', path(v.page));
  await v.ctx.close();
}

// ---------------------------------------------------------------- hover and keyboard focus
{
  const v = await open();
  const { page } = v;
  await page.goto(`${APP}/auth/sign-up`);
  await ready(page);
  await page.locator('.si-pw input').fill('harbourlane42');
  const colour = (sel, prop = 'color') => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
  for (const [name, sel, prop, hoverSel] of [
    ['the Google button', '.si-col .ds-google', 'borderTopColor', '.si-col .ds-google'],
    ['the tick box', '.ds-check-box > span', 'borderTopColor', '.ds-check-box'],
    ['Show', '.si-show', 'color', '.si-show'],
    ['a text link', '.si-alt .si-link', 'color', '.si-alt .si-link'],
    ['the terms link', '.si-terms .si-link', 'color', '.si-terms .si-link'],
  ]) {
    await page.mouse.move(2, 2);
    await sleep(350);
    const rest = await colour(sel, prop);
    await page.locator(hoverSel).first().hover();
    await sleep(350);
    const over = await colour(sel, prop);
    pass(`hover shows on ${name}`, rest !== over, `${rest} then ${over}`);
  }
  await page.mouse.move(2, 2);
  // Keyboard: Tab through the page; each control shows a focus ring.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const rings = {};
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    await sleep(320);
    const f = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const st = getComputedStyle(el); return { what: el.className.toString().split(' ')[0] + (el.closest('.si-terms') && el.classList.contains('si-link') ? ' terms' : ''), ring: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 2, edge: st.borderTopColor }; });
    if (f) rings[f.what] = f;
  }
  for (const [name, key] of [['the Google button', 'ds-google'], ['the tick box', 'ds-check-box'], ['Show', 'si-show'], ['a text link', 'si-link'], ['the terms link', 'si-link terms'], ['the coral button', 'si-btn']]) {
    pass(`keyboard focus shows on ${name}`, Boolean(rings[key]?.ring), JSON.stringify(rings[key] || Object.keys(rings)));
  }
  pass('keyboard focus shows on a box (its edge turns coral)', Boolean(rings['si-inp']) && rings['si-inp'].edge === 'rgb(255, 111, 92)', JSON.stringify(rings['si-inp']));
  // Space ticks the box from the keyboard.
  await page.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  pass('Space ticks the box from the keyboard', (await page.getByRole('checkbox').getAttribute('aria-checked')) === 'true');
  await v.ctx.close();
}

await browser.close();
done();
