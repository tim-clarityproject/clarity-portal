// The app's own way of asking the portal's server about Google Calendar and
// Zoom (api/coach-calendar.js), with the coach's own sign-in. Kept apart
// from index.js so the choosing and the sync stay free of the database
// client and are unit-tested.
import { supabase } from '../../supabase';
import { loadAdapters } from './index.js';

/**
 * Posts to /api/coach-calendar. Anything that isn't an answer (offline, no
 * server on a developer's machine, not signed in) resolves
 * { ok: false, reason: 'no_answer' }: never an error a page has to catch.
 */
export async function askServer(body) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { ok: false, reason: 'no_answer' };
    const res = await fetch('/api/coach-calendar', {
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

/** The coach's adapters: the real ones where the server says they are connected, otherwise the stand-ins. */
export const coachAdapters = () => loadAdapters({ ask: askServer });
