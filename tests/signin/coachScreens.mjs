// How M26 seq 7's coach authenticator screens are reached in the app
// (Phase 6a run 5), for measure.mjs. Each is stood in whole
// (coachWorld.mjs): an invented associate, Maya, with M26's own key and
// codes; nothing reaches the test project. `key` is M26's own id for the
// screen and `name` is what its picker calls it.
import { APP } from './shared.mjs';
import { coachWorld } from './coachWorld.mjs';

const at = async (page, ctx, world, path, wait) => {
  const w = await coachWorld(ctx, world);
  await page.goto(`${APP}${path}`);
  await page.waitForSelector(wait, { timeout: 20000 });
  return w;
};
const codeBox = (page) => page.getByRole('textbox', { name: 'Code', exact: true });

export const COACH_SCREENS = [
  { key: 'auth-setup', name: 'Set up your authenticator', open: (page, { ctx }) => at(page, ctx, { factor: 'none', codesMade: false, codesSaved: false }, '/coach/sign-in/set-up', '.si-qr svg') },
  { key: 'auth-codes', name: 'Save your recovery codes', open: (page, { ctx }) => at(page, ctx, { factor: 'verified', aal: 'aal2', codesSaved: false }, '/coach/sign-in/recovery-codes', '.si-rc li') },
  { key: 'auth-lost', name: 'Lost your authenticator app', open: (page, { ctx }) => at(page, ctx, { factor: 'verified' }, '/coach/sign-in/help', '.si-field input') },
  {
    key: 'auth-in',
    name: 'Signed in with a recovery code',
    open: async (page, { ctx }) => {
      await at(page, ctx, { factor: 'verified' }, '/coach/sign-in/help', '.si-field input');
      await page.getByRole('textbox', { name: 'Recovery code' }).fill('k7q2-9fmd');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('That recovery code is now used.').waitFor({ timeout: 10000 });
    },
  },
  { key: 'acct-security', name: 'My Account, sign-in security', acct: true, open: (page, { ctx }) => at(page, ctx, { factor: 'verified', aal: 'aal2', codesLeft: 9 }, '/coach/settings/sign-in-security', '.si-srow') },
];

export { codeBox };
