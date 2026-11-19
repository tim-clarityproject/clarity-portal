import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../supabase';
import { deviceKey, readJson, writeJson } from '../deviceStore';

// Who is signed in, as a coach (public.coaches, migration 026): the owner
// (Tim), an associate, or not a coach at all. The coach area opens only for
// a coach who is switched on; the database's own rules decide what each
// one may read, whatever a page shows.
//
// The last answer is kept on the device, so the coach portal opens with no
// signal; a fresh answer replaces it whenever the database gives one.

const keyFor = (userId) => deviceKey('cache', userId, 'coach-role');

/** The signed-in person's coach row, or null when they aren't an active coach. */
export async function loadCoachRole(userId) {
  const { data, error } = await supabase.from('coaches').select('*').eq('user_id', userId).limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row && row.active ? row : null;
}

/**
 * @returns {{ loading: boolean, coach: object|null, isOwner: boolean, userId: string|null, reload: () => void }}
 */
export function useCoachRole() {
  const { user } = useContext(AuthContext);
  const userId = user?.id || null;
  const [state, setState] = useState(() => {
    const kept = userId ? readJson(keyFor(userId)) : null;
    return kept ? { loading: false, coach: kept.coach } : { loading: true, coach: null };
  });
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadCoachRole(userId).then((coach) => {
      if (!live) return;
      writeJson(keyFor(userId), { coach });
      setState({ loading: false, coach });
    }).catch(() => {
      // No answer (offline): the device's last answer stands; with none, not a coach.
      if (live) setState((s) => (s.loading ? { loading: false, coach: null } : s));
    });
    return () => { live = false; };
  }, [userId, turn]);
  return { ...state, isOwner: state.coach?.role === 'owner', userId, reload: () => setTurn((n) => n + 1) };
}
