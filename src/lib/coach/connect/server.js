// The app's own way of asking the portal's server about Google Calendar and
// Zoom (api/coach-calendar.js), with the coach's own sign-in. Kept apart
// from index.js so the choosing and the sync stay free of the database
// client and are unit-tested.
import { supabase } from '../../supabase';
import { loadAdapters, loadEmailAdapters } from './index.js';

/**
 * Posts to one of the portal's own server functions with the coach's
 * sign-in. Anything that isn't an answer (offline, no server on a
 * developer's machine, not signed in) resolves
 * { ok: false, reason: 'no_answer' }: never an error a page has to catch.
 */
async function post(path, body) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { ok: false, reason: 'no_answer' };
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const answer = await res.json().catch(() => null);
    return answer && typeof answer === 'object' && typeof answer.ok === 'boolean' ? answer : { ok: false, reason: 'no_answer' };
  } catch {
    return { ok: false, reason: 'no_answer' };
  }
}

/** Asks /api/coach-calendar (Google Calendar and Zoom). */
export const askServer = (body) => post('/api/coach-calendar', body);
/** Asks /api/coach-email-in (the copy-in address and Gmail), as the owner. */
export const askEmailServer = (body) => post('/api/coach-email-in', body);

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;

/** The coach's adapters: the real ones where the server says they are connected, otherwise the stand-ins. */
export const coachAdapters = () => loadAdapters({ ask: askServer });
/** The owner's email adapters: the real ones where the server says they are set up; otherwise off on the live site, and the stand-ins anywhere else. */
export const coachEmailAdapters = () => loadEmailAdapters({ ask: askEmailServer, live: LIVE });
