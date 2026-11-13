import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

// What the address held when the page first loaded. Supabase swaps an
// email link's or Google's one-time code for a session by itself and then
// tidies the address, so this is read once, straight away, before that.
function readLanding() {
  try {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const get = (name) => query.get(name) || hash.get(name) || '';
    return {
      path: window.location.pathname,
      hadCode: Boolean(get('code') || get('token_hash') || get('access_token')),
      error: get('error') || get('error_code') || '',
      errorCode: get('error_code') || '',
      errorDescription: get('error_description') || '',
    };
  } catch {
    return { path: '', hadCode: false, error: '', errorCode: '', errorDescription: '' };
  }
}

const LANDING = readLanding();

/** What this visit's own address held, if this page is the one it landed on. */
export function landingFor(pathname) {
  return LANDING.path === pathname ? LANDING : { path: pathname, hadCode: false, error: '', errorCode: '', errorDescription: '' };
}

/** True when the person closed or cancelled Google's own page. */
export function cancelledAtGoogle(landing) {
  return landing.error === 'access_denied' || /denied|cancel/i.test(landing.errorDescription || '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for the session an email link or Google brings.
 *   'checking'  still waiting
 *   'ready'     signed in
 *   'expired'   the address says the link has run out or was used
 *   'used'      there was a one-time code, but it gave no session
 *   'none'      no code and no session: someone opened the page directly
 */
export function useLinkSession(pathname, { waitMs = 8000 } = {}) {
  const landing = landingFor(pathname);
  const [status, setStatus] = useState(landing.error ? 'expired' : 'checking');
  const [user, setUser] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (landing.error) return;
    const run = async () => {
      const done = (session) => {
        setUser(session.user);
        setStatus('ready');
      };
      const first = await supabase.auth.getSession().catch(() => null);
      if (first?.data?.session?.user) return done(first.data.session);
      if (!landing.hadCode) return setStatus('none');
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
      return found ? done(found) : setStatus('used');
    };
    run();
  }, []);

  return { status, user, landing };
}
