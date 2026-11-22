import { useEffect, useRef } from 'react';

// Back closes a full-screen panel on a phone (run 6, item 4). A panel or
// pop-up that opens full screen adds one entry to the browser's history,
// at the same address, so the phone's Back (or a swipe back) closes the
// panel instead of leaving the page. Closing it any other way (the
// crosshair, Escape, its own button, a swipe down) takes that entry away
// again, so Back afterwards goes where it always did.
//
// The router never sees these entries come and go: the browser's
// "popstate" for one of them is answered here first (a listener in the
// capture phase on window runs before the router's own) and stopped.
// A Back that lands on another address (a long press on Back, or an
// entry left behind when something inside the panel moved to another
// page) is left to the router, as before; open panels close with it.
// An entry a closed panel left behind is stepped over.

const KEY = 'dsPanelDepth';
const stack = []; // { depth, href, close, gone }
const ownBacks = []; // our own history.back() calls: { href, focus } (where they land, what had focus)
let listening = false;

function onPopState(e) {
  const href = window.location.href;
  if (ownBacks.length) {
    const own = ownBacks.shift();
    // Our own step back off a closed panel's entry: nothing for the router.
    if (href === own.href) {
      e.stopImmediatePropagation();
      keepFocus(own.focus);
      return;
    }
  }
  const depth = Number(e.state?.[KEY]) || 0;
  // An entry left behind by a panel that closed when something inside it
  // moved to another page: step over it, so Back reaches the page under it.
  if (depth && !stack.some((entry) => entry.depth >= depth)) {
    e.stopImmediatePropagation();
    window.history.back();
    return;
  }
  if (!stack.length) return;
  const same = href === stack[stack.length - 1].href;
  // Every panel opened above the entry Back landed on closes, top first.
  while (stack.length && stack[stack.length - 1].depth > depth) {
    const entry = stack.pop();
    entry.gone = true;
    entry.close();
  }
  if (same) e.stopImmediatePropagation();
}

// A step back to an address with a #part in it can take focus off what the
// panel gave it back to (the browser's own handling of the #part): put it back.
function keepFocus(el) {
  if (!el || typeof document === 'undefined') return;
  const again = () => {
    const now = document.activeElement;
    if (el && el.isConnected && now !== el && (!now || now === document.body || now === document.documentElement)) el.focus({ preventScroll: true });
  };
  again();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(again);
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', onPopState, true);
  listening = true;
}

/**
 * Adds a history entry for an open full-screen panel. `close` is called
 * when Back takes the entry away. Returns a function to call when the
 * panel closes any other way: it takes the entry away again, when it is
 * still the browser's current entry (a panel left by moving to another
 * page leaves it, and Back from there is the router's, as always).
 */
export function pushPanelEntry(close) {
  if (typeof window === 'undefined' || !window.history?.pushState) return () => {};
  listen();
  const depth = stack.length + 1;
  const href = window.location.href;
  const entry = { depth, href, close, gone: false };
  try {
    window.history.pushState({ ...(window.history.state || {}), [KEY]: depth }, '', href);
  } catch {
    return () => {};
  }
  stack.push(entry);
  return () => {
    if (entry.gone) return;
    entry.gone = true;
    const at = stack.indexOf(entry);
    if (at !== -1) stack.splice(at, 1);
    // A moment later, once the panel has given focus back, and only if its
    // entry is still the current one (nothing has moved to another page since).
    const stillHere = () => Number(window.history.state?.[KEY]) === depth && window.location.href === href;
    if (!stillHere()) return;
    setTimeout(() => {
      if (!stillHere()) return;
      ownBacks.push({ href, focus: typeof document !== 'undefined' ? document.activeElement : null });
      window.history.back();
    }, 0);
  };
}

/** For tests: how many panel entries are open. */
export function panelEntries() {
  return stack.length;
}

/**
 * While `open` (and `enabled`, for a part that is full screen only on a
 * phone), Back calls `onClose` instead of leaving the page.
 */
export function useBackCloses(open, onClose, enabled = true) {
  const latest = useRef(onClose);
  useEffect(() => { latest.current = onClose; });
  useEffect(() => {
    if (!open || !enabled) return undefined;
    return pushPanelEntry(() => latest.current?.());
  }, [open, enabled]);
}
