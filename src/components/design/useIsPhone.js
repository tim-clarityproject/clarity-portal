import { useSyncExternalStore } from 'react';
import { PHONE_QUERY } from './pageLock';

// True at phone width (the same break as the panels and pop-ups), and
// kept up to date when the window is resized or the phone rotates.
function subscribe(onChange) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const get = () => window.matchMedia(PHONE_QUERY).matches;

export default function useIsPhone() {
  return useSyncExternalStore(subscribe, get, () => false);
}
