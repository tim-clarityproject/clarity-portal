import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useCachedLoad } from '../../lib/pageCache';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import { loadPatternRows } from '../../lib/performance/api';
import {
  PATTERNS_CACHE,
  PATTERNS_KEY,
  buildPatternPerson,
  hidePattern,
  markDebriefPattern,
  nextPatternState,
  patternCheckDue,
  patternSeed,
  readPatternState,
  storedPatternState,
} from '../../lib/performance/patterns';

// Patterns in your numbers on the device (methods M14; patterns.js): the
// person's own rows, kept on the device like every page's data and
// refreshed quietly, and the pattern state kept with their other page
// settings (person_settings.page_preferences.patterns, menuPins.js),
// through the offline queue, with the device's copy shown at once.
//
// The check runs once a fresh load has arrived (or straight away from the
// device's copy when there's no connection, so it works on a flight), and
// only when one is due: a new sprint week has finished, or the person's
// data changed and the last check was on an earlier day (rule 23). It is
// worked out again on top of the account's latest state, so two tabs or
// devices never undo each other (the check is deterministic, so both get
// the same cards).

const read = (saved) => readPatternState({ [PATTERNS_KEY]: saved });

export function usePatterns(today) {
  const userId = useContext(AuthContext)?.user?.id || null;
  const [fresh, setFresh] = useState(false);
  const loaded = useCachedLoad({
    userId,
    name: PATTERNS_CACHE,
    load: async () => {
      const r = await loadPatternRows(userId, today);
      setFresh(true);
      return r;
    },
  });
  const prefs = usePreferences(userId);
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]);
  const saved = prefs?.[PATTERNS_KEY];
  const state = useMemo(() => read(saved), [saved]);
  const built = useMemo(() => (loaded.data ? buildPatternPerson(loaded.data, today) : null), [loaded.data, today]);

  const due = patternCheckDue(state, built, today);
  const ready = fresh || loaded.offline;
  useEffect(() => {
    if (!userId || !built || !due || !ready) return undefined;
    // After the page has drawn: the check takes a moment on a slow phone.
    const t = setTimeout(() => {
      const seed = patternSeed(userId, built.check.key);
      updatePreference(userId, PATTERNS_KEY, (old) => storedPatternState(nextPatternState(read(old), built, { today, seed }).state)).catch(() => {});
    }, 60);
    return () => clearTimeout(t);
  }, [userId, built, due, ready, today]);

  const hide = useCallback((key) => {
    if (!userId) return Promise.resolve('saved');
    return updatePreference(userId, PATTERNS_KEY, (old) => storedPatternState(hidePattern(read(old), key)));
  }, [userId]);

  const markDebrief = useCallback((debriefKey, shown) => {
    if (!userId || !shown) return Promise.resolve('saved');
    return updatePreference(userId, PATTERNS_KEY, (old) => storedPatternState(markDebriefPattern(read(old), debriefKey, shown, today)));
  }, [userId, today]);

  return { state, built, checking: due, hide, markDebrief };
}
