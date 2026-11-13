import { returnAddress, SIGN_IN_PATHS } from './addresses';
import { needsBeforeYouStart } from './terms';

// What happens between proving who you are and getting in (M26; Tim's
// decisions of 11 Nov). One place decides it, and the sign-in pages,
// Google's return and the portal's own guard all ask it, so no way in
// skips a step.

/** True when the account has an authenticator app set up (a verified TOTP factor). */
export function hasAuthenticator(user) {
  return (user?.factors || []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

/**
 * The stop someone must make before the portal opens, or null.
 *   'code'    an account with an authenticator app that hasn't given its
 *             6-digit code this sign-in. Google never skips it.
 *   'before'  a Google account the portal has never seen: Before you start.
 * An account with no authenticator set up is let in after its password
 * (Tim: don't lock a coach out before the set-up screens exist).
 */
export async function signInStop(supabase, user) {
  if (!user) return null;
  if (hasAuthenticator(user)) {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') return 'code';
    } catch {
      return 'code';
    }
  }
  if (needsBeforeYouStart(user)) return 'before';
  return null;
}

export function stopPath(stop) {
  if (stop === 'code') return SIGN_IN_PATHS.coachCode;
  if (stop === 'before') return SIGN_IN_PATHS.beforeYouStart;
  return null;
}

// Where Continue with Google was pressed, kept for this tab while Google
// does its round trip: a cancel or a miss goes back to that page.
const FROM_KEY = 'clarity-sign-in-google-from';
const FROM_PAGES = [SIGN_IN_PATHS.signIn, SIGN_IN_PATHS.create, SIGN_IN_PATHS.invite, SIGN_IN_PATHS.coach, SIGN_IN_PATHS.beforeYouStart];

export function rememberGoogleFrom(path) {
  try {
    window.sessionStorage.setItem(FROM_KEY, path);
  } catch { /* falls back to Sign in */ }
}

export function takeGoogleFrom() {
  let from = null;
  try {
    from = window.sessionStorage.getItem(FROM_KEY);
    window.sessionStorage.removeItem(FROM_KEY);
  } catch { /* nothing kept */ }
  if (from === SIGN_IN_PATHS.beforeYouStart) return SIGN_IN_PATHS.signIn;
  return FROM_PAGES.includes(from) ? from : SIGN_IN_PATHS.signIn;
}

/**
 * Starts Continue with Google. The return address is this page's own
 * origin, never a fixed one.
 * @param {object} supabase
 * @param {{ from: string, chooseAccount?: boolean, origin?: string }} opts
 */
export async function continueWithGoogle(supabase, { from, chooseAccount = false, origin = window.location.origin }) {
  rememberGoogleFrom(from);
  const options = { redirectTo: returnAddress('google', origin) };
  if (chooseAccount) options.queryParams = { prompt: 'select_account' };
  return supabase.auth.signInWithOAuth({ provider: 'google', options });
}
