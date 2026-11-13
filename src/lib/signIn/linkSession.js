import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { SIGN_IN_PATHS } from './addresses';
import { codeWasSwapped, linkPage, noteStands } from './linkRules';

// The kinds of email link a page may finish by itself (see verifyLanding).
const LINK_TYPES = ['signup', 'invite', 'recovery', 'email_change', 'email'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A link that carries its own token, landed somewhere other than the page
// that finishes its kind: the site's root (Supabase sends a link there
// when the page that asked isn't on its allowed list) or an address with
// a doubled slash (a Site URL saved with a slash on its end). It is put
// on its own page before the app reads the address, so it still opens.
function toItsOwnPage() {
  try {
    const query = new URLSearchParams(window.location.search);
    if (!query.get('token_hash')) return;
    const page = linkPage(query.get('type'), SIGN_IN_PATHS);
    if (!page || page === window.location.pathname) return;
    window.history.replaceState(window.history.state, '', `${page}${window.location.search}${window.location.hash}`);
  } catch { /* the address stays as it came */ }
}
toItsOwnPage();

// What the address held when the page first loaded. Supabase swaps an
// email link's or Google's one-time code for a session by itself and then
// tidies the address, so this is read once, straight away, before that.
function readLanding() {
  try {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const get = (name) => query.get(name) || hash.get(name) || '';
    const tokenHash = query.get('token_hash') || '';
    const type = query.get('type') || '';
    return {
      path: window.location.pathname,
      hadCode: Boolean(get('code') || tokenHash || get('access_token')),
      code: Boolean(query.get('code')),
      tokenHash: LINK_TYPES.includes(type) ? tokenHash : '',
      type: LINK_TYPES.includes(type) ? type : '',
      error: get('error') || get('error_code') || '',
      errorCode: get('error_code') || '',
      errorDescription: get('error_description') || '',
    };
  } catch {
    return { path: '', hadCode: false, code: false, tokenHash: '', type: '', error: '', errorCode: '', errorDescription: '' };
  }
}

const LANDING = readLanding();
const NOTHING = { hadCode: false, code: false, tokenHash: '', type: '', error: '', errorCode: '', errorDescription: '' };

/** What this visit's own address held, if this page is the one it landed on. */
export function landingFor(pathname) {
  return LANDING.path === pathname ? LANDING : { ...NOTHING, path: pathname };
}

/** True when the person closed or cancelled Google's own page. */
export function cancelledAtGoogle(landing) {
  return landing.error === 'access_denied' || /denied|cancel/i.test(landing.errorDescription || '');
}

// Supabase says "a reset link was opened" with its own event, and only
// for the link's own one-time code: heard from the moment the app loads,
// so it is never missed while a page is still starting.
let heardRecovery = false;
try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') heardRecovery = true;
  });
} catch { /* no reset link is ever taken as opened */ }

// A link that carries its own one-time token ("token_hash" with its
// "type": the form Supabase gives for links that must open on any device,
// and the only form an invite can take, since nobody's browser asked for
// it). The page finishes it itself, once, then tidies the address so a
// refresh never spends the token twice.
let verifying = null;
const noAnswer = (error) => error?.name === 'AuthRetryableFetchError' || [0, 502, 503, 504, 520, 521, 522, 523, 524].includes(error?.status);
function verifyLanding() {
  if (!LANDING.tokenHash || !LANDING.type) return null;
  if (!verifying) {
    verifying = (async () => {
      try {
        const hand = () => supabase.auth.verifyOtp({ token_hash: LANDING.tokenHash, type: LANDING.type }).catch((error) => ({ data: null, error }));
        let { data, error } = await hand();
        // No answer (a dropped connection, or the database not answering
        // for a moment) is not a link that has run out: the token is still
        // good, so it is handed in once more before anything is said (the
        // break-it tester, 13 Nov).
        if (error && noAnswer(error)) {
          await sleep(1500);
          ({ data, error } = await hand());
        }
        if (error) return { session: null };
        // A change of email with two links (Supabase's "Secure email
        // change"): the first one opened is taken, and gives no sign-in
        // until the other is opened too.
        const half = !data?.session?.user && LANDING.type === 'email_change';
        if (!data?.session?.user && !half) return { session: null };
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('token_hash');
          url.searchParams.delete('type');
          window.history.replaceState(window.history.state, '', url.toString());
        } catch { /* the address keeps it; the token is spent either way */ }
        return half ? { session: null, half: true } : { session: data.session };
      } catch {
        return { session: null };
      }
    })();
  }
  return verifying;
}

/**
 * A change-of-email link opened on this visit, and how it went: null when
 * this visit had no such link, otherwise a promise of
 *   'done'    the email has changed (and this device is signed in);
 *   'half'    this link is taken, and the other address's link is still to open;
 *   'failed'  the link has run out or was used.
 * The Email page sits inside the portal, so someone who opens the link in
 * a browser that isn't signed in is sent to Sign in before that page ever
 * shows. The link is therefore finished here, as soon as the app loads,
 * whoever is or isn't signed in (Tim, 13 Nov: links work on any device).
 */
let changedFor = '';
export const emailChangeLink = (LANDING.path === '/my-account/email' && LANDING.type === 'email_change' && LANDING.tokenHash)
  ? verifyLanding().then((v) => {
    if (v?.session) {
      changedFor = v.session.user?.id || '';
      return 'done';
    }
    return v?.half ? 'half' : 'failed';
  })
  : null;

// How the link went is said once on the Email page, and "Saved" only to
// the account whose email it changed: never again on a later visit to the
// page, and never to someone else who signs in on this tab afterwards
// (the break-it tester, 13 Nov).
let emailChangeSaid = false;
/**
 * The outcome to say on the Email page for `userId`, or '' when it has
 * been said already or isn't theirs. `emailChangeWasSaid()` once it is on the page.
 */
export function emailChangeToSay(outcome, userId) {
  if (emailChangeSaid || !outcome) return '';
  if (outcome === 'done' && changedFor !== userId) return '';
  return outcome;
}
export function emailChangeWasSaid() {
  emailChangeSaid = true;
}

/**
 * Waits for the session an email link or Google brings.
 *   'checking'  still waiting
 *   'ready'     signed in
 *   'expired'   the address says the link has run out or was used
 *   'used'      there was a one-time code, but it gave no session
 *   'none'      no code and no session: someone opened the page directly
 *
 * `fromLink` is true only when this visit's own link gave the session
 * (never for a session that was already on the device), and `kind` says
 * what the link was: 'recovery' for a reset link, 'invite', 'signup',
 * 'email_change', otherwise 'signIn'. A page that lets someone do
 * something only a link allows (New password, the invite) asks these,
 * never `status` alone.
 */
export function useLinkSession(pathname, { waitMs = 8000 } = {}) {
  const landing = landingFor(pathname);
  const [result, setResult] = useState({ status: landing.error ? 'expired' : 'checking', user: null, fromLink: false, kind: '' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (landing.error) return;
    const run = async () => {
      const done = (session, fromLink, kind = '') => setResult({ status: 'ready', user: session.user, fromLink, kind: fromLink ? kind : '' });
      const stop = (status) => setResult({ status, user: null, fromLink: false, kind: '' });
      if (landing.tokenHash) {
        const verified = await verifyLanding();
        return verified?.session ? done(verified.session, true, landing.type) : stop('expired');
      }
      const swapped = () => codeWasSwapped(landing);
      const kind = () => (heardRecovery ? 'recovery' : 'signIn');
      const first = await supabase.auth.getSession().catch(() => null);
      if (first?.data?.session?.user) return done(first.data.session, swapped(), kind());
      if (!landing.hadCode) return stop('none');
      let found = null;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) found = session;
      });
      let waited = 0;
      while (!found && waited < waitMs) {
        await sleep(150);
        waited += 150;
        if (!found && waited % 600 === 0) {
          const late = await supabase.auth.getSession().catch(() => null);
          if (late?.data?.session?.user) found = late.data.session;
        }
      }
      data?.subscription?.unsubscribe();
      if (!found) {
        const last = await supabase.auth.getSession().catch(() => null);
        if (last?.data?.session?.user) found = last.data.session;
      }
      return found ? done(found, swapped(), kind()) : stop('used');
    };
    run();
  }, []);

  return { ...result, landing };
}

// A link opened in this tab a little while ago, for this very account
// (linkRules.js): kept so a refresh still shows its page.
export function noteLinkOpened(key, userId) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), id: userId }));
  } catch { /* a refresh then shows Link not working */ }
}

export function linkOpenedJustNow(key, userId) {
  try {
    return noteStands(window.sessionStorage.getItem(key), userId);
  } catch {
    return false;
  }
}

export function forgetLinkOpened(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch { /* nothing kept */ }
}
