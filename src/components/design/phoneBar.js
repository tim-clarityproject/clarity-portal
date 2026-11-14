import { useEffect, useSyncExternalStore } from 'react';

// The phone bar steps back while a page shows its own bottom button (M7:
// "the phone bar hides when a screen has its own bottom button"), as the
// guided tools' screens do. A page asks with useHidePhoneBar(true); the bar
// (SitePhoneNav) reads usePhoneBarHidden(). Several askers share one count.
let hidden = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hides the phone bar while `on` is true and the caller is on screen. */
export function useHidePhoneBar(on = true) {
  useEffect(() => {
    if (!on) return undefined;
    hidden += 1;
    emit();
    return () => {
      hidden = Math.max(0, hidden - 1);
      emit();
    };
  }, [on]);
}

/** Is a page asking for the phone bar to step back? */
export function usePhoneBarHidden() {
  return useSyncExternalStore(subscribe, () => hidden > 0, () => false);
}
