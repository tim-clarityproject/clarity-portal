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
export async function signedIn(page, { env, answers, SAM }, { email = SAM.email, firstName = SAM.first, change } = {}) {
  const patch = (user) => {
    if (!user) return user;
    const next = { ...user, email, user_metadata: { ...(user.user_metadata || {}), first_name: firstName } };
    return change ? change(next) : next;
  };
  answers['POST /auth/v1/token'] = async ({ route }) => {
    const res = await route.fetch();
    let body = await res.json();
    if (body?.user) body = { ...body, user: patch(body.user) };
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
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
}

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
    key: 'invite',
    name: 'Set up from your coach’s invite',
    open: async (page, o) => {
      o.answers['POST /rest/v1/rpc/my_coach'] = () => ({ status: 200, body: [{ coach_id: '00000000-0000-4000-8000-00000000000c', first_name: 'Tim', away_until: null, mobile: null, contact_ways: [] }] });
      await signedIn(page, o);
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
      await page.evaluate(() => sessionStorage.setItem('clarity-sign-in-reset', String(Date.now())));
      await go(page, '/auth/reset-password');
      await page.waitForSelector('.si-ttl');
      await sleep(100);
    },
  },
  { key: 'expired', name: 'Link expired or used', open: (page) => go(page, '/auth/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired') },
];
