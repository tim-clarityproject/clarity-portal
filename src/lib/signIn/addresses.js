// Where the sign-in pages send people, and where email links and Google
// bring them back (M26, Tim's decisions of 11 Nov).
//
// A return address is always worked out from the page's own origin, never
// written out in full, so the live site, each preview deployment and a
// developer's localhost each come back to themselves. Supabase only
// returns to addresses on its allowed list, so a new deployment address
// has to be on that list (Tim adds it; nothing here works around it).

export const SIGN_IN_PATHS = {
  signIn: '/auth/login',
  create: '/auth/sign-up',
  checkEmail: '/auth/check-email',
  confirmed: '/auth/confirmed',
  google: '/auth/google',
  beforeYouStart: '/auth/before-you-start',
  invite: '/auth/invite',
  forgot: '/forgot-password',
  forgotSent: '/forgot-password/check-email',
  newPassword: '/auth/reset-password',
  coach: '/coach/sign-in',
  coachCode: '/coach/sign-in/code',
  coachHelp: '/coach/sign-in/help',
  accountPassword: '/my-account/password',
  accountEmail: '/my-account/email',
  home: '/welcome',
};

// The pages an email link or Google comes back to.
const RETURN_PATHS = {
  google: SIGN_IN_PATHS.google,
  confirmed: SIGN_IN_PATHS.confirmed,
  newPassword: SIGN_IN_PATHS.newPassword,
  emailChange: SIGN_IN_PATHS.accountEmail,
};

/**
 * The full address Supabase returns to, built from this page's origin.
 * @param {'google'|'confirmed'|'newPassword'|'emailChange'} kind
 * @param {string} origin the page's own origin (window.location.origin)
 */
export function returnAddress(kind, origin) {
  const path = RETURN_PATHS[kind];
  if (!path) throw new Error(`No return address for "${kind}".`);
  let url;
  try {
    url = new URL(String(origin));
  } catch {
    throw new Error('A return address needs the page’s own origin.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('A return address needs the page’s own origin.');
  return `${url.origin}${path}`;
}

// Pages nobody should land on after signing in: the sign-in pages themselves.
const NOT_A_DESTINATION = /^\/($|login(\/|$)|auth(\/|$)|forgot-password(\/|$)|coach\/sign-in(\/|$)|email-confirmation(\/|$)|check-email-confirmation(\/|$))/;

/**
 * A place inside the portal to land on after signing in, or null. Only a
 * path on this site is ever accepted: never another site's address, so a
 * crafted link can't send someone elsewhere after they sign in.
 * @param {*} value a path with any query and hash ("/dashboard?x=1#top")
 */
export function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\u0000-\u001f]/.test(value)) return null;
  let url;
  try {
    url = new URL(value, 'https://portal.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://portal.invalid') return null;
  if (NOT_A_DESTINATION.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// The place someone was heading when they were asked to sign in. Kept for
// this tab only, so it survives Google's round trip and nothing else.
const NEXT_KEY = 'clarity-sign-in-next';
const store = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

// A deliberate Sign out (AuthContext.logout): the page they signed out on
// is not somewhere to come back to, least of all for whoever signs in on
// this device next. The portal's guard asks this before it passes the
// page on to Sign in.
let leftAt = 0;
export function noteSignedOut(now = Date.now()) {
  leftAt = now;
  try {
    store()?.removeItem(NEXT_KEY);
  } catch { /* nothing kept */ }
}
export function justSignedOut(now = Date.now()) {
  return leftAt > 0 && now - leftAt >= 0 && now - leftAt < 10000;
}

export function rememberNext(value) {
  const next = safeNext(value);
  try {
    if (next) store()?.setItem(NEXT_KEY, next);
  } catch { /* a full or blocked store: they land on Home */ }
  return next;
}

export function peekNext() {
  try {
    return safeNext(store()?.getItem(NEXT_KEY));
  } catch {
    return null;
  }
}

/** Where to go now they're in: where their link pointed, otherwise Home. Clears it. */
export function takeNext() {
  const next = peekNext();
  try {
    store()?.removeItem(NEXT_KEY);
  } catch { /* nothing to clear */ }
  return next || SIGN_IN_PATHS.home;
}
