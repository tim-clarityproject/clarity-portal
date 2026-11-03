import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { ORB_STYLES, readOrbStyle, saveOrbStyle, watchOrbStyle } from '../../lib/breathOrb';
import { refreshPins, setPreference, usePreferences } from '../../lib/menuPins';

// The person's orb choice: Rings (the starting choice) or Level. Kept in
// the account, in person_settings.page_preferences.orb_style (Phase 4 step
// 7: an own-rows-only object, beside the menu's pins; no new column), so
// every device shows the same orb. This device's copy (src/lib/breathOrb.js)
// shows at once, offline too; the account's choice, once read, wins over
// it. A choice is saved through the offline queue with the version check
// (menuPins.js setPreference).
export function useOrbStyle() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const [style, setStyle] = useState(readOrbStyle);
  useEffect(() => watchOrbStyle(setStyle), []);

  const prefs = usePreferences(userId);
  const account = ORB_STYLES.includes(prefs?.orb_style) ? prefs.orb_style : null;
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]); // at most every half a minute
  useEffect(() => { if (account && account !== readOrbStyle()) saveOrbStyle(account); }, [account]);

  const choose = useCallback((next) => {
    if (!ORB_STYLES.includes(next)) return;
    saveOrbStyle(next);
    if (userId) setPreference(userId, 'orb_style', next).catch(() => null); // kept on this device either way
  }, [userId]);
  return [style, choose];
}
