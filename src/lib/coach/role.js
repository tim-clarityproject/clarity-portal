import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../supabase';
import { deviceKey, readJson, writeJson } from '../deviceStore';
import { openingRole } from './earlyScreen';

// Who is signed in, as a coach (public.coaches, migration 026): the owner
// (Tim), an associate, or not a coach at all. The coach area opens only for
// a coach who is switched on; the database's own rules decide what each
// one may read, whatever a page shows.
//
// The last answer is kept on the device, so the coach portal opens with no
// signal; a fresh answer replaces it whenever the database gives one.

const keyFor = (userId) => deviceKey('cache', userId, 'coach-role');
/** How long before a role read that got no answer is asked once more. */
export const ROLE_RETRY_MS = 1000;
/** How long a first visit waits for the role with no answer before saying it didn't load (Try again stays). */
export const ROLE_GIVE_UP_MS = 6000;

/** The signed-in person's coach row, or null when they aren't an active coach. */
export async function loadCoachRole(userId) {
  const { data, error } = await supabase.from('coaches').select('*').eq('user_id', userId).limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row && row.active ? row : null;
}

/**
 * @returns {{ loading: boolean, coach: object|null, failed: boolean, isOwner: boolean, userId: string|null, reload: () => void, retry: () => void }}
 * `failed`: no answer twice and none kept on this device, so it isn't known whether this is a coach.
 */
export function useCoachRole() {
  const { user } = useContext(AuthContext);
  const userId = user?.id || null;
  const [state, setState] = useState(() => {
    const kept = userId ? readJson(keyFor(userId)) : null;
    // A kept coach row is used at once; a kept "not a coach" waits for the fresh read, so a coach switched back on is
    // never sent to the clients' Home by an old answer (break-it tester, tidy follow-up 4).
    if (kept?.coach) return { loading: false, coach: kept.coach };
    // A first visit on this device: the answer the app's opening read already has (earlyScreen.js), if it is in.
    const early = userId ? openingRole(userId) : undefined;
    return early !== undefined ? { loading: false, coach: early } : { loading: true, coach: null };
  });
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    let timer = null;
    // A read that gets no answer is asked once more a moment later (tidy follow-up 4, part 2, item 6).
    const again = () => new Promise((resolve, reject) => {
      timer = setTimeout(() => { if (live) loadCoachRole(userId).then(resolve, reject); else reject(new Error('gone')); }, ROLE_RETRY_MS);
    });
    // The connection layer already retries a busy database, so two reads could take ~15 s: after ROLE_GIVE_UP_MS with
    // no answer the calm error shows, and an answer that comes later still opens the portal (functionality tester).
    const giveUp = setTimeout(() => { if (live) setState((s) => (s.loading ? { loading: false, coach: null, failed: true } : s)); }, ROLE_GIVE_UP_MS);
    loadCoachRole(userId).catch(again).then((coach) => {
      if (!live) return;
      writeJson(keyFor(userId), { coach });
      setState({ loading: false, coach });
    }).catch(() => {
      // Still no answer (offline, or the database didn't answer): the device's last answer stands. With none, the coach
      // portal says it didn't load, with Try again (`failed`): never "not a coach", which sent a coach to the clients'
      // Home on a first visit (tidy follow-up 4, part 2, item 6).
      if (live) setState((s) => (s.loading ? { loading: false, coach: null, failed: true } : s));
    });
    return () => { live = false; clearTimeout(timer); clearTimeout(giveUp); };
  }, [userId, turn]);
  // Another tab's fresh answer (capacity edited there, say) shows here too, with nothing asked of the database.
  useEffect(() => {
    if (!userId) return undefined;
    const heard = (e) => {
      if (e.key !== keyFor(userId) || !e.newValue) return;
      const kept = readJson(keyFor(userId));
      if (kept && 'coach' in kept) setState({ loading: false, coach: kept.coach });
    };
    window.addEventListener('storage', heard);
    return () => window.removeEventListener('storage', heard);
  }, [userId]);
  return {
    ...state, failed: state.failed === true, isOwner: state.coach?.role === 'owner', userId,
    reload: () => setTurn((n) => n + 1),
    // Try again, from the coach portal's calm error: the turning crosshair while it asks again.
    retry: () => { setState((s) => (s.failed ? { loading: true, coach: null } : s)); setTurn((n) => n + 1); },
  };
}
