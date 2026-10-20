import { useSyncExternalStore } from 'react';

// True at the portal's phone width (768px and under, as every .ui-root
// media query). Used where the one-pager's markup itself differs between
// phone and desktop (the wheel size preset, the Delta layout, the score
// bars' room); everything else is CSS.
const QUERY = '(max-width: 768px)';

function subscribe(onChange) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export default function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
