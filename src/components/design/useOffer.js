import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import {
  DEVICE_OFFERS_KEY, OFFERS_PREFERENCE, afterNever, afterNotNow, afterTaken, cleanOffer, offerView, offersFrom, storedOffer,
} from '../../lib/offers';

// One optional offer's state and its three choices (src/lib/offers.js has
// the rules; OfferRow draws it):
//
//   const guide = useOffer(HEALTH_CHECK_GUIDE_OFFER, { blocked });
//   guide.show       the row shows now
//   guide.never      "Don’t show this again" shows beside Not now
//   guide.titleIcon  the same thing's icon beside the title shows
//   guide.notNow(), guide.stop(), guide.take()
//
// A signed-in person's choices are kept in the account
// (person_settings.page_preferences.offers), this device's copy first,
// through the offline queue; with nobody signed in, on this device only.

const hiddenThisVisit = new Set(); // "<person or device>:<offer>": chosen on this visit
const EVENT = 'clarity-offers';

function readDevice() {
  try {
    const raw = window.localStorage.getItem(DEVICE_OFFERS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
let deviceSnapshot = null;
let deviceRaw = null;
function deviceOffers() {
  let raw = null;
  try { raw = window.localStorage.getItem(DEVICE_OFFERS_KEY); } catch { /* blocked */ }
  if (deviceSnapshot === null || raw !== deviceRaw) { deviceRaw = raw; deviceSnapshot = readDevice(); }
  return deviceSnapshot;
}
const thisVisitOnly = {}; // what the device's storage refused to keep
function writeDevice(key, state) {
  const all = { ...deviceOffers(), [key]: storedOffer(state) };
  try { window.localStorage.setItem(DEVICE_OFFERS_KEY, JSON.stringify(all)); } catch { thisVisitOnly[key] = storedOffer(state); }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* old browser */ }
}
function watchDevice(onChange) {
  const other = (e) => { if (e.key === null || e.key === DEVICE_OFFERS_KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', other); };
}

export default function useOffer(key, { blocked = false } = {}) {
  const userId = useContext(AuthContext)?.user?.id || null;
  const prefs = usePreferences(userId);
  const device = useSyncExternalStore(watchDevice, deviceOffers, () => ({}));
  const raw = userId ? offersFrom(prefs)[key] : (thisVisitOnly[key] || device[key]);
  const state = cleanOffer(raw);
  const visitKey = `${userId || 'device'}:${key}`;
  const [, chosen] = useState(0); // redraws once a choice is made this visit
  const hiddenNow = hiddenThisVisit.has(visitKey);
  // The account's copy, read quietly (at most every half a minute).
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]);

  const choose = useCallback((next) => {
    hiddenThisVisit.add(visitKey);
    chosen((n) => n + 1);
    if (!userId) {
      writeDevice(key, next(cleanOffer(thisVisitOnly[key] || deviceOffers()[key])));
      return;
    }
    updatePreference(userId, OFFERS_PREFERENCE, (all) => {
      const list = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
      return { ...list, [key]: storedOffer(next(cleanOffer(list[key]))) };
    }).catch(() => null); // kept on this device either way
  }, [key, userId, visitKey]);

  const view = offerView(state, { hiddenNow, blocked });
  return {
    ...view,
    notNow: useCallback(() => choose(afterNotNow), [choose]),
    stop: useCallback(() => choose(afterNever), [choose]),
    take: useCallback(() => choose(afterTaken), [choose]),
  };
}
