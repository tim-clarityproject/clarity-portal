import { useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import {
  DEVICE_HIDDEN_HELP_KEY, HIDDEN_HELP_PREFERENCE, HIDDEN_HELP_TOAST, SHOWN_AGAIN_TOAST,
  cleanHidden, hiddenHelpCount, isHelpHidden, withHelpHidden, withHelpShown,
} from '../../lib/hiddenHelp';
import { ToastContext } from './toastContext';

// The client portal's hidden help (src/lib/hiddenHelp.js has the rules):
//
//   const help = useHiddenHelp();
//   help.isHidden(key), help.hide(key) (with Undo), help.count, help.showAll() (with Undo)
//
// A signed-in person's choice is kept in the account
// (person_settings.page_preferences.hidden_help), this device's copy first,
// through the offline queue; with nobody signed in, on this device only.

const EVENT = 'clarity-hidden-help';
let deviceRaw;
let deviceSnapshot = {};
const thisVisitOnly = { value: null }; // what the device's storage refused to keep
function deviceHidden() {
  if (thisVisitOnly.value) return thisVisitOnly.value;
  let raw = null;
  try { raw = window.localStorage.getItem(DEVICE_HIDDEN_HELP_KEY); } catch { /* blocked */ }
  if (raw !== deviceRaw) {
    deviceRaw = raw;
    try { deviceSnapshot = cleanHidden(raw ? JSON.parse(raw) : {}); } catch { deviceSnapshot = {}; }
  }
  return deviceSnapshot;
}
function writeDevice(next) {
  try {
    window.localStorage.setItem(DEVICE_HIDDEN_HELP_KEY, JSON.stringify(cleanHidden(next)));
    thisVisitOnly.value = null;
  } catch {
    thisVisitOnly.value = cleanHidden(next);
  }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* old browser */ }
}
function watchDevice(onChange) {
  const other = (e) => { if (e.key === null || e.key === DEVICE_HIDDEN_HELP_KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', other); };
}
const noDevice = () => ({});

export default function useHiddenHelp() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const toast = useContext(ToastContext);
  const prefs = usePreferences(userId);
  const device = useSyncExternalStore(watchDevice, deviceHidden, noDevice);
  const hidden = userId ? cleanHidden(prefs?.[HIDDEN_HELP_PREFERENCE]) : device;
  // The account's copy, read quietly (at most every half a minute).
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]);

  // One change, made from the latest copy (another tab's or device's
  // change is never undone by this one).
  const change = useCallback((update) => {
    if (!userId) {
      writeDevice(update(deviceHidden()));
      return;
    }
    updatePreference(userId, HIDDEN_HELP_PREFERENCE, (old) => update(cleanHidden(old)))
      .catch(() => toast?.error('That didn’t save. Check your connection and try again.'));
  }, [userId, toast]);

  const hide = useCallback((key) => {
    if (!key) return;
    change((h) => withHelpHidden(h, key));
    toast?.saved({ message: userId ? HIDDEN_HELP_TOAST : 'Hidden', long: true, onUndo: () => change((h) => withHelpShown(h, key)) });
  }, [change, toast, userId]);

  const showAll = useCallback(() => {
    const before = hidden;
    // What this page showed as hidden is shown again: a hide made meanwhile on
    // another device stays (and a change made again after an offline clash,
    // menuPins.js, never wipes it).
    change((h) => Object.keys(before).reduce((next, key) => withHelpShown(next, key), h));
    toast?.saved({ message: SHOWN_AGAIN_TOAST, long: true, onUndo: () => change((h) => ({ ...h, ...before })) });
  }, [change, toast, hidden]);

  return {
    hidden,
    count: hiddenHelpCount(hidden),
    isHidden: (key) => isHelpHidden(hidden, key),
    hide,
    showAll,
  };
}
