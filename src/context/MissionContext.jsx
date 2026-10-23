import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '../lib/supabase';

export const MissionContext = createContext();

// Anything that changes the mission outside this context (the operating
// plan editor, restoring a version or an archived plan, archiving) calls
// announceMissionChange() so the pill, Welcome and My Account update at
// once, with no sign-out.
const MISSION_CHANGED = 'clarity:mission-changed';
export function announceMissionChange() {
  window.dispatchEvent(new Event(MISSION_CHANGED));
}

// How long to wait before trying a failed load again.
const RETRY_MS = [1000, 3000, 8000];

// The mission is read from the missions table every time it may have
// changed: on sign-in, on a page load, when a token is refreshed after an
// idle tab, when the tab comes back into view, and after any change. It
// used to be read once per signed-in person, so a first read that went
// out before the sign-in had settled (and came back empty or failed)
// left the pill and Welcome blank until the next sign-in.
export function MissionProvider({ children }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id || null;
  const [mission, setMission] = useState('');
  const [showInHeader, setShowInHeader] = useState(true);
  // Only the newest read may change what shows, so a slow older read can
  // never overwrite a newer one or a change just made.
  const readSeq = useRef(0);
  const retryTimer = useRef(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchMission = useCallback(async (attempt = 0) => {
    clearTimeout(retryTimer.current);
    const forUser = userIdRef.current;
    const seq = ++readSeq.current;
    if (!forUser) {
      setMission('');
      setShowInHeader(true);
      return;
    }

    try {
      // Read as this person only: wait until the client holds their
      // session, otherwise the read goes out signed out and finds nothing.
      const { data: { session } } = await supabase.auth.getSession();
      if (seq !== readSeq.current) return;
      if (session?.user?.id !== forUser) throw new Error('Session not ready');

      const [missionResult, profileResult] = await Promise.all([
        supabase
          .from('missions')
          .select('title')
          .eq('user_id', forUser)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('profiles')
          .select('show_mission_in_header')
          .eq('id', forUser)
          .limit(1),
      ]);
      if (seq !== readSeq.current || userIdRef.current !== forUser) return;
      if (missionResult.error) throw missionResult.error;

      setMission(missionResult.data?.[0]?.title || '');
      const visible = profileResult.data?.[0]?.show_mission_in_header;
      if (visible !== null && visible !== undefined) setShowInHeader(visible);
    } catch (error) {
      // Keep what is showing and try again shortly.
      console.error('Error fetching mission:', error);
      if (seq === readSeq.current && attempt < RETRY_MS.length) {
        retryTimer.current = setTimeout(() => fetchMission(attempt + 1), RETRY_MS[attempt]);
      }
    }
  }, []);

  // A new person, or signed out.
  useEffect(() => {
    fetchMission();
    return () => clearTimeout(retryTimer.current);
  }, [userId, fetchMission]);

  // Sign-in settling, a refreshed token after an idle tab, the tab coming
  // back into view, and changes made elsewhere in the app.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Let the auth change finish before reading.
        setTimeout(() => fetchMission(), 0);
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchMission();
    };
    const onChanged = () => fetchMission();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MISSION_CHANGED, onChanged);
    return () => {
      subscription?.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(MISSION_CHANGED, onChanged);
    };
  }, [fetchMission]);

  const updateMission = async (newMission, visible) => {
    const previous = { mission, showInHeader };
    const nextVisible = visible !== undefined ? visible : showInHeader;
    // Show the change everywhere at once, and stop any read in flight
    // from putting the old mission back.
    readSeq.current += 1;
    setMission(newMission);
    setShowInHeader(nextVisible);

    if (!user) return;
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          personal_goal: newMission,
          show_mission_in_header: nextVisible,
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      // Don't use .single() - handle the case where no mission exists yet
      const { data: existingMissionArray, error: readError } = await supabase
        .from('missions')
        .select('id')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (readError) throw readError;

      const existingMission = existingMissionArray?.[0] || null;
      const { error: writeError } = existingMission
        ? await supabase.from('missions').update({ title: newMission }).eq('id', existingMission.id)
        : await supabase.from('missions').insert([{ user_id: user.id, title: newMission }]);
      if (writeError) throw writeError;
    } catch (error) {
      console.error('Error updating mission:', error);
      setMission(previous.mission);
      setShowInHeader(previous.showInHeader);
      fetchMission();
      throw error;
    }
  };

  // Single source of truth for "show mission in header": updates context
  // state immediately (so every consumer - the header pill, the phone
  // panel, the scrim, and the My Account switch - reflects the change
  // with no reload), then persists it. On failure, reverts the context
  // state back to what it was before the toggle.
  const updateShowInHeader = async (visible) => {
    const previousValue = showInHeader;
    readSeq.current += 1;
    setShowInHeader(visible);

    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ show_mission_in_header: visible })
          .eq('id', user.id);

        if (error) throw error;
      } catch (error) {
        console.error('Error updating visibility preference:', error);
        setShowInHeader(previousValue);
      }
    }
  };

  return (
    <MissionContext.Provider value={{ mission, showInHeader, setShowInHeader, updateMission, updateShowInHeader, refetchMission: fetchMission }}>
      {children}
    </MissionContext.Provider>
  );
}
