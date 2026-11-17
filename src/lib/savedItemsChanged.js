import { useEffect, useRef } from 'react';

// A saved item was deleted, or put back by Undo: My Plans and My Reviews
// read their lists again, so a list never shows what has gone, or misses
// what came back (Phase 8a follow-up, step 2).
const EVENT = 'clarity-saved-items-changed';

export function savedItemsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new window.Event(EVENT));
}

/** Calls `reload` each time a saved item is deleted or put back. */
export function useSavedItemsChanged(reload) {
  const ref = useRef(reload);
  useEffect(() => { ref.current = reload; });
  useEffect(() => {
    const on = () => ref.current?.();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
