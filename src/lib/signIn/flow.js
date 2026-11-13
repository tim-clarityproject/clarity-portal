import { returnAddress, SIGN_IN_PATHS } from './addresses';
import { forgetTick, needsBeforeYouStart, rememberTick } from './terms';

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

/** The page to go back to after a cancel or a miss at Google. Clears it. */
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
 * @param {{ from: string, ticked?: boolean, chooseAccount?: boolean, origin?: string, joinTo?: string }} opts
 *   `ticked`: the box beside the button is ticked (Create my account, the
 *   invite). The tick is kept for the round trip; from any other page an
 *   older tick is cleared, so it can never agree for someone else.
 *   `joinTo`: the email of the account already signed in here that Google
 *   is being added to (the invite's page). Google is then joined to that
 *   account, never signed in on its own, so whichever Google account they
 *   pick, no second portal account is made (Tim, 13 Nov).
 */
export async function continueWithGoogle(supabase, { from, ticked = false, chooseAccount = false, origin = window.location.origin, joinTo = '' }) {
  rememberGoogleFrom(from);
  if (ticked) rememberTick();
  else forgetTick();
  const options = { redirectTo: returnAddress('google', origin) };
  if (chooseAccount) options.queryParams = { prompt: 'select_account' };
  if (joinTo) {
    // Google opens on the invited address when the device knows it.
    options.queryParams = { login_hint: joinTo };
    return supabase.auth.linkIdentity({ provider: 'google', options });
  }
  return supabase.auth.signInWithOAuth({ provider: 'google', options });
}

/** The Google sign-in joined to an account, if it has one. */
export function googleIdentity(user) {
  return (user?.identities || []).find((identity) => identity.provider === 'google') || null;
}

// The same address, letter for letter once trimmed and lower-cased (never
// by leaving out dots or a "+tag", and never a look-alike letter), and
// one Google hasn't said is unconfirmed.
const sameEmail = (identity, user) => {
  const data = identity?.identity_data || {};
  // Only A to Z is lower-cased: the Kelvin sign, say, lower-cases to a
  // plain "k", and is not the same letter.
  const plain = (value) => String(value || '').trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const email = plain(data.email);
  if (data.email_verified === false || data.email_verified === 'false') return false;
  return Boolean(email) && email === plain(user?.email);
};
const googleIdentities = (user) => (user?.identities || []).filter((identity) => identity.provider === 'google');

/**
 * Whether the Google account that came back is the invited one: the same
 * email as the account's own. An account with no Google sign-in joined
 * is not a match either (nothing came back). Any one of them counts: a
 * wrong one from an earlier try that couldn't be taken off never hides
 * the right one (the functionality tester, 13 Nov).
 */
export function googleMatches(user) {
  return googleIdentities(user).some((identity) => sameEmail(identity, user));
}

/** Every Google sign-in joined to the account that isn't its own email's: these are taken off again. */
export function googleStrangers(user) {
  return googleIdentities(user).filter((identity) => !sameEmail(identity, user));
}

/**
 * Takes every Google sign-in with another email off the account signed in
 * on this device. A miss is left: the next visit tries again.
 */
export async function takeOffStrangers(supabase, user) {
  for (const stranger of googleStrangers(user)) {
    try {
      await supabase.auth.unlinkIdentity(stranger);
    } catch { /* tried again next time */ }
  }
}

/**
 * Google has just signed someone in to an account a coach set up that
 * isn't finished, and none of its Google sign-ins has the account's own
 * email: the Google account used is one left joined by a try on the
 * invite's page that was never undone (the tab was closed on the way
 * back, or taking it off missed). Whoever holds that Google account is
 * not the person invited (the break-it tester, 13 Nov).
 */
export function cameInByStranger(user) {
  return Boolean(user?.invited_at) && user?.user_metadata?.terms_accepted !== true && googleStrangers(user).length > 0 && !googleMatches(user);
}
