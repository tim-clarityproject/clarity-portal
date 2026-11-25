import { useSyncExternalStore } from 'react';

// "Your portal is still being prepared" (polish 1, "A brand-new client"):
// while it is true the frame's menu shows Home and My Account only. The page
// that knows a client's portal isn't set up yet says so with
// setPortalPreparing(true) (and false once it is); everything else reads it.
// Kept for the visit only: nothing is stored.
let preparing = false;
const listeners = new Set();

export function setPortalPreparing(on) {
  const next = Boolean(on);
  if (next === preparing) return;
  preparing = next;
  listeners.forEach((fn) => fn());
}

export function usePortalPreparing() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => preparing, () => false);
}
