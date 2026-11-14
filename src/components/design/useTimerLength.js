import { useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { refreshPins, setPreference, usePreferences } from '../../lib/menuPins';
import { DEFAULT_MINUTES, cleanMinutes } from '../../lib/timer';
import { TIMER_PREFERENCE, accountMinutes, readTimerMinutes, saveTimerMinutes, watchTimerMinutes } from '../../lib/timerLength';

// The timer's length, remembered for next time (Tim, 13 Nov, 09:29):
// [minutes, setMinutes], the same for every timer on screen and in every
// tab. Kept in the account, in
// person_settings.page_preferences.timer_minutes (beside the menu's pins
// and the orb's style), so every device shows the same length. This
// device's copy shows at once, offline too; the account's choice, once
// read, wins over it. A choice is saved through the offline queue with the
// version check (menuPins.js setPreference).
//
// With nobody signed in, or outside AuthContext (a guest's page, the
// design gallery), it is remembered on this device only
// (src/lib/timerLength.js).

// A person's own choice still on its way to the account: the account's
// older copy never takes its place meanwhile.
const sending = new Map();

export function useTimerLength() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const minutes = useSyncExternalStore(watchTimerMinutes, () => readTimerMinutes(userId), () => DEFAULT_MINUTES);

  const prefs = usePreferences(userId);
  const account = accountMinutes(prefs);
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]); // at most every half a minute
  useEffect(() => {
    if (!userId || account == null || sending.get(userId)) return;
    if (account !== readTimerMinutes(userId)) saveTimerMinutes(userId, account);
  }, [account, userId]);

  const choose = useCallback((next) => {
    const value = cleanMinutes(next);
    if (value == null) return;
    saveTimerMinutes(userId, value);
    if (!userId) return;
    sending.set(userId, (sending.get(userId) || 0) + 1);
    setPreference(userId, TIMER_PREFERENCE, value)
      .catch(() => null) // kept on this device either way
      .finally(() => sending.set(userId, Math.max(0, (sending.get(userId) || 1) - 1)));
  }, [userId]);
  return [minutes, choose];
}
