import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { supabase } from '../lib/supabase';
import { ownProfileQuery } from '../lib/sharedReads';
import { MISSION_CHANGED } from '../lib/missionEvents';
import { onPlanChanged } from '../lib/performance/planChanged';
import { readCache } from '../lib/pageCache';

export const MissionContext = createContext();

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
  // Whether the Mission is known yet: from the device's copy, a read, or a
  // read that couldn't be made. Until then the pill and My Account show no
  // words, never "no Mission yet" for a moment (UI tester, scale check).
  const [known, setKnown] = useState(false);
  // One Mission (Tim, 5 Nov): with an Individual Performance Plan, its
  // Mission is the only one, read here and changed only on the plan (Edit
  // my mission), so the header, My Account and every other page show the
  // same words. The old missions table is read only for someone with no
  // plan yet; its older missions stay readable in the history.
  const [planId, setPlanId] = useState(null);
  // Only the newest read may change what shows, so a slow older read can
  // never overwrite a newer one or a change just made.
  const readSeq = useRef(0);
  const retryTimer = useRef(null);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const fetchMission = useCallback(async function read(attempt = 0) {
    clearTimeout(retryTimer.current);
    const forUser = userIdRef.current;
    const seq = ++readSeq.current;
    if (!forUser) {
      setMission('');
      setShowInHeader(true);
      setPlanId(null);
      // Nobody signed in yet: known once their own read answers.
      setKnown(false);
      return;
    }

    // The device's copy of the plan first (the header pill's own copy), so
    // an older mission never shows while the read is out, or offline.
    const head = readCache(forUser, 'performance-plan-head')?.v;
    if (head?.id) {
      setPlanId(head.id);
      setMission(head.mission || '');
      setKnown(true);
    }

    try {
      // Read as this person only: wait until the client holds their
      // session, otherwise the read goes out signed out and finds nothing.
      const { data: { session } } = await supabase.auth.getSession();
      if (seq !== readSeq.current) return;
      if (session?.user?.id !== forUser) throw new Error('Session not ready');

      const [planResult, missionResult, profileResult] = await Promise.all([
        supabase
          .from('performance_plans')
          // The same columns as the pages' own read of the active plan
          // (loadActivePlan in performance/api.js), so the two share one
          // request (readShare.js; the scale check).
          .select('id, mission, status, major, minor, created_at, updated_at')
          .eq('user_id', forUser)
          .eq('status', 'active')
          .limit(1),
        supabase
          .from('missions')
          .select('title')
          .eq('user_id', forUser)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1),
        // The shared read of the person's own row (sharedReads.js).
        ownProfileQuery(forUser),
      ]);
      if (seq !== readSeq.current || userIdRef.current !== forUser) return;
      if (missionResult.error) throw missionResult.error;

      const plan = planResult.error ? null : planResult.data?.[0] || null;
      setPlanId(plan?.id || null);
      setMission(plan ? plan.mission || '' : missionResult.data?.[0]?.title || '');
      const visible = profileResult.data?.[0]?.show_mission_in_header;
      if (visible !== null && visible !== undefined) setShowInHeader(visible);
      setKnown(true);
    } catch (error) {
      // Keep what is showing and try again shortly.
      console.error('Error fetching mission:', error);
      // Shown as no Mission only once it can't be read: offline, or after the last try.
      if (seq === readSeq.current && (attempt >= RETRY_MS.length || (typeof navigator !== 'undefined' && navigator.onLine === false))) setKnown(true);
      if (seq === readSeq.current && attempt < RETRY_MS.length) {
        retryTimer.current = setTimeout(() => read(attempt + 1), RETRY_MS[attempt]);
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
    const offPlan = onPlanChanged(onChanged);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MISSION_CHANGED, onChanged);
    return () => {
      subscription?.unsubscribe();
      offPlan();
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
        return false;
      }
    }
    return true;
  };

  return (
    <MissionContext.Provider value={{ mission, missionKnown: known, hasPlan: Boolean(planId), showInHeader, setShowInHeader, updateMission, updateShowInHeader, refetchMission: fetchMission }}>
      {children}
    </MissionContext.Provider>
  );
}
