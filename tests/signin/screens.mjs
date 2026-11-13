// How each of M26's 21 screens is reached in the app, with invented
// people only. `key` is M26's own id for the screen and `name` is what
// its picker calls it (screenshots are named after it).
import { APP, sleep } from './shared.mjs';

const go = (page, path) => page.goto(`${APP}${path}`);
const fillEmail = (page, value) => page.locator('input[type=email]').fill(value);
const fillPassword = (page, value, nth = 0) => page.locator('.si-pw input').nth(nth).fill(value);
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();

// Signs the seeded test client in, shown under the mock-up's invented
// name and address: the sign-in answer is passed through with only the
// first name and email swapped, so the pages read as M26 draws them.
export async function signedIn(page, { env, answers, SAM }, { email = SAM.email, firstName = SAM.first, change, land = /\/welcome$/ } = {}) {
  const patch = (user) => {
    if (!user) return user;
    const next = { ...user, email, user_metadata: { ...(user.user_metadata || {}), first_name: firstName } };
    return change ? change(next) : next;
  };
  // The account as the page last saw it, so a save can be answered here
  // (never sent) with the account as it would then stand.
  let current = null;
  answers['PUT /auth/v1/user'] = async ({ body }) => {
    current = { ...(current || {}), user_metadata: { ...(current?.user_metadata || {}), ...(body?.data || {}) } };
    if (body?.email) current.new_email = body.email;
    return { status: 200, body: current };
  };
  answers['POST /auth/v1/token'] = async ({ route }) => {
    const res = await route.fetch();
    let body = await res.json();
    if (body?.user) body = { ...body, user: patch(body.user) };
    if (body?.user) current = body.user;
    await route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify(body) });
    return 'handled';
  };
  answers['GET /auth/v1/user'] = async ({ route }) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify(res.ok() ? patch(body) : body) });
    return 'handled';
  };
  await go(page, '/auth/login');
  await fillEmail(page, env.TEST_CLIENT_EMAIL);
  await fillPassword(page, env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(land, { timeout: 30000 });
}

// As if a reset link had just been opened in this tab by the account that
// is signed in: the note New password keeps is for that account alone.
export const openedResetLink = (page) => page.evaluate(() => {
  const id = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id;
  sessionStorage.setItem('clarity-sign-in-reset', JSON.stringify({ at: Date.now(), id }));
});

// An account a coach has set up that hasn't been finished: invited, and
// not yet agreed. The invite's page is shown to no other account.
export const invited = (u) => ({ ...u, invited_at: '2026-11-10T09:00:00.000Z', user_metadata: { first_name: u.user_metadata?.first_name || '' } });

const fillCreate = async (page, SAM, password) => {
  await page.getByLabel('First name').fill(SAM.first);
  await fillEmail(page, SAM.email);
  await fillPassword(page, password);
};

export const SCREENS = [
  // ------------------------------------------------------------ Signing in
  { key: 'signin', name: 'Sign in', open: (page) => go(page, '/auth/login') },
  {
    key: 'signin-error',
    name: 'Sign in, details don’t match',
    open: async (page, { answers, SAM }) => {
      answers['POST /auth/v1/token'] = () => ({ status: 400, body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      await go(page, '/auth/login');
      await fillEmail(page, SAM.email);
      await fillPassword(page, 'harbourlane');
      await press(page, 'Sign in');
      await page.waitForSelector('.si-err');
    },
  },
  {
    key: 'signing',
    name: 'Signing in after Google',
    // Google's return, held while the sign-in is finished.
    open: async (page, { answers }) => {
      answers['POST /auth/v1/token'] = () => new Promise(() => {});
      await go(page, '/auth/google?code=a-mock-code');
      await page.waitForSelector('.si-wait');
    },
  },
  // ------------------------------------------------------------ Creating an account
  { key: 'create', name: 'Create my account', open: async (page) => { await go(page, '/auth/sign-up'); await page.locator('.ds-check-box').click(); } },
  {
    key: 'create-untick',
    name: 'Create my account, box not ticked',
    open: async (page, { SAM }) => {
      await go(page, '/auth/sign-up');
      await fillCreate(page, SAM, 'harbourlane42');
      await press(page, 'Create my account');
      await page.waitForSelector('.si-err');
    },
  },
  {
    key: 'create-short',
    name: 'Create my account, password too short',
    open: async (page, { SAM }) => {
      await go(page, '/auth/sign-up');
      await fillCreate(page, SAM, 'harbour');
      await page.locator('.ds-check-box').click();
      await press(page, 'Create my account');
      await page.waitForSelector('.si-err');
    },
  },
  {
    key: 'exists',
    name: 'Create my account, email already used',
    open: async (page, { answers, SAM }) => {
      // What Supabase answers for an email that already has an account.
      answers['POST /auth/v1/signup'] = () => ({ status: 200, body: { id: '00000000-0000-4000-8000-000000000000', email: SAM.email, identities: [], user_metadata: {} } });
      await go(page, '/auth/sign-up');
      await fillCreate(page, SAM, 'harbourlane42');
      await page.locator('.ds-check-box').click();
      await press(page, 'Create my account');
      await page.waitForSelector('.si-err');
    },
  },
  {
    key: 'sent-confirm',
    name: 'Check your email, new account',
    open: async (page, { answers, SAM }) => {
      answers['POST /auth/v1/signup'] = () => ({ status: 200, body: { id: '00000000-0000-4000-8000-000000000001', email: SAM.email, identities: [{ provider: 'email' }], user_metadata: {} } });
      await go(page, '/auth/sign-up');
      await fillCreate(page, SAM, 'harbourlane42');
      await page.locator('.ds-check-box').click();
      await press(page, 'Create my account');
      await page.waitForURL(/\/auth\/check-email$/);
    },
  },
  {
    key: 'confirmed',
    name: 'Email confirmed',
    open: async (page, o) => { await signedIn(page, o); await go(page, '/auth/confirmed'); await page.waitForSelector('.si-ttl'); },
  },
  {
    key: 'google-new',
    name: 'New Google account, before Home',
    // A Google account the portal has never seen: it is held at Before you start.
    open: async (page, o) => {
      await signedIn(page, o, {
        email: o.SAM.gmail,
        land: /\/auth\/before-you-start$/,
        change: (u) => ({ ...u, app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: 'Sam Carter' } }),
      });
      await page.waitForSelector('.si-ttl');
      await page.locator('.ds-check-box').click();
    },
  },
  {
    key: 'invite',
    name: 'Set up from your coach’s invite',
    open: async (page, o) => {
      o.answers['POST /rest/v1/rpc/my_coach'] = () => ({ status: 200, body: [{ coach_id: '00000000-0000-4000-8000-00000000000c', first_name: 'Tim', away_until: null, mobile: null, contact_ways: [] }] });
      // An invited account that hasn't agreed is held at Before you start
      // whichever way it signs in (Tim, 13 Nov); its invite page still opens.
      await signedIn(page, o, { change: invited, land: /\/auth\/before-you-start$/ });
      await go(page, '/auth/invite');
      await page.waitForSelector('.si-ttl');
      await page.getByText('Tim has set up your account.').waitFor();
      await page.locator('.ds-check-box').click();
    },
  },
  // ------------------------------------------------------------ Passwords
  {
    key: 'forgot',
    name: 'Forgotten your password',
    open: async (page, { SAM }) => {
      await go(page, '/auth/login');
      await fillEmail(page, SAM.email);
      await page.getByRole('link', { name: 'Forgotten your password?' }).click();
      await page.waitForURL(/\/forgot-password$/);
    },
  },
  {
    key: 'sent-reset',
    name: 'Check your email, reset',
    open: async (page, { SAM }) => {
      await go(page, '/forgot-password');
      await fillEmail(page, SAM.email);
      await press(page, 'Email my reset link');
      await page.waitForURL(/\/forgot-password\/check-email$/);
    },
  },
  {
    key: 'new-password',
    name: 'Set a new password',
    open: async (page, o) => {
      await signedIn(page, o);
      // As if a reset link had just been opened in this tab.
      await openedResetLink(page);
      await go(page, '/auth/reset-password');
      await page.waitForSelector('.si-ttl');
      await sleep(100);
    },
  },
  { key: 'expired', name: 'Link expired or used', open: (page) => go(page, '/auth/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired') },
  // ------------------------------------------------------------ Coaches
  { key: 'coach', name: 'Coach sign in', open: (page) => go(page, '/coach/sign-in') },
  {
    key: 'coach-code',
    name: 'Coach sign in, authenticator code',
    // An account with an authenticator app set up, signed in but with its
    // code still to give: it is held at Enter your code.
    open: async (page, o) => {
      await signedIn(page, o, {
        land: /\/coach\/sign-in\/code$/,
        change: (u) => ({ ...u, factors: [{ id: '00000000-0000-4000-8000-0000000000f1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator' }] }),
      });
      await page.waitForSelector('.si-ttl');
    },
  },
  // ------------------------------------------------------------ Inside My Account
  {
    key: 'acct-password',
    name: 'My Account, password',
    acct: true,
    open: async (page, o) => { await signedIn(page, o); await go(page, '/my-account/password'); },
  },
  {
    key: 'acct-password-saved',
    name: 'My Account, password saved',
    acct: true,
    open: async (page, o) => {
      await signedIn(page, o);
      await go(page, '/my-account/password');
      await page.waitForSelector('.si-col--account');
      // The current password is checked and the new one saved, both answered here.
      o.answers['POST /auth/v1/token'] = ({ url }) => (url.searchParams.get('grant_type') === 'password' ? { status: 200, body: {} } : 'continue');
      await fillPassword(page, 'harbourlane42', 0);
      await fillPassword(page, 'lighthouse-keeper-77', 1);
      await press(page, 'Save my new password');
      await page.waitForSelector('.ds-status--saved');
    },
  },
  {
    key: 'acct-email',
    name: 'My Account, email',
    acct: true,
    // M26 gives this one box no autocomplete; the build gives every box one.
    looseBox: true,
    open: async (page, o) => { await signedIn(page, o); await go(page, '/my-account/email'); },
  },
  {
    key: 'acct-email-sent',
    name: 'My Account, email, check your email',
    acct: true,
    open: async (page, o) => {
      await signedIn(page, o);
      await go(page, '/my-account/email');
      await page.waitForSelector('.si-col--account');
      await fillEmail(page, o.SAM.newEmail);
      await press(page, 'Save my new email');
      await page.getByText('Open both to finish.').waitFor();
    },
    // Newer than M26 (Tim, 13 Nov, 14:05): with two links to open, the
    // title reads "Check your email" and one line says where they went.
    // M26's own screen is given the newer words before it is measured, so
    // every part is still compared with how M26 draws them.
    newer: (newEmail) => {
      for (const root of document.querySelectorAll('#dk, #ph')) {
        const lines = root.querySelectorAll('.p');
        if (lines.length !== 2) continue;
        root.querySelector('.ph3 h1').textContent = 'Check your email';
        lines[0].innerHTML = 'We’ve sent a link to your current email and to <strong></strong>. Open both to finish.';
        lines[0].querySelector('strong').textContent = newEmail;
        lines[1].remove();
      }
    },
  },
];
