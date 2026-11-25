import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { askWith } from './asks';

// The page side of asks.js: the caller's own sign-in from Supabase, sent through the app's apiFetch. A build that isn't
// the live site (__CLARITY_LIVE__, vite.config.js) answers with the stand-ins while a route isn't built yet (501)
// or isn't there at all (a plain 404: the dev server and a local build serve no api/; asks.js).

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__ === true;

/** One ask of the agreement server: route 'agreements' | 'billing' | 'settle' | 'link', kind, body. Never throws. */
export async function ask(route, kind, body = {}) {
  let token = null;
  if (route !== 'link') {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || null;
    } catch {
      token = null;
    }
  }
  return askWith({ route, kind, body, token, send: apiFetch, live: LIVE });
}
