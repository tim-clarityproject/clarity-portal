import { useCallback, useContext, useEffect } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { refreshPins, setPreference, usePreferences } from '../../lib/menuPins';

// "Show the Breathe button" (Tim, 26 Nov, decisions part 12; NEXT-BREATHE.md): on unless the person switches it off
// in My Account › Settings. Kept in the account, in person_settings.page_preferences.breathe_button (beside the
// menu's pins and the orb's style; no new column, no migration), so every device shows the same. The device's copy of
// those settings (menuPins.js) answers at once, offline too, and a change goes through the offline queue with the
// version check (setPreference). Off hides only the floating button on a phone; Breathe stays in the menu.
export const BREATHE_BUTTON_PREFERENCE = 'breathe_button';

/** Whether a person's settings show the floating Breathe button: on unless switched off. */
export const breatheButtonShown = (prefs) => prefs?.[BREATHE_BUTTON_PREFERENCE] !== false;

/** [shown, setShown]: setShown(on) resolves 'saved' or 'queued', and rejects when the server refuses it. */
export function useBreatheButton() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const prefs = usePreferences(userId);
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]); // at most every half a minute
  const set = useCallback((on) => (userId ? setPreference(userId, BREATHE_BUTTON_PREFERENCE, Boolean(on)) : Promise.resolve('saved')), [userId]);
  return [breatheButtonShown(prefs), set];
}
