import { useCallback, useContext, useEffect, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import { SLEEP_TARGET_KEY, readSleepTarget, stepSleepTarget } from '../../lib/performance/sleepChart';

// The person's sleep target range (SleepTarget.jsx): kept in the account
// with their other page settings (person_settings.page_preferences
// .sleep_target), the device's copy shown at once, offline too.
/** The person's target range, kept in step on every screen: [target, change]. */
export default function useSleepTarget() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const prefs = usePreferences(userId);
  useEffect(() => {
    if (!userId) return undefined;
    refreshPins(userId); // at most every half a minute
    // Back on this tab or window: read again, so a change made elsewhere shows.
    const back = () => { if (document.visibilityState === 'visible') refreshPins(userId); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [userId]);
  const saved = prefs?.sleep_target;
  const target = useMemo(() => readSleepTarget({ sleep_target: saved }), [saved]);
  // `sides`: only the ends the person changed ({ from } and/or { to }),
  // put on top of the latest saved range, the start always below the end.
  const change = useCallback((sides) => {
    if (!userId) return Promise.resolve('saved');
    return updatePreference(userId, SLEEP_TARGET_KEY, (old) => {
      let next = readSleepTarget({ sleep_target: old });
      if (sides.from != null) next = stepSleepTarget(next, 'from', sides.from);
      if (sides.to != null) next = stepSleepTarget(next, 'to', sides.to);
      return { from: next.from, to: next.to };
    });
  }, [userId]);
  return [target, change];
}

