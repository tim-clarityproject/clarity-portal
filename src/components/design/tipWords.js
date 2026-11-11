// What a mark's pop-up says, read from the mark itself (its data-tip), so
// the pop-up never says something the mark no longer does.

/** The words on a mark, or null when it has none. */
export function readTip(el) {
  try {
    return JSON.parse(el.getAttribute('data-tip'));
  } catch {
    return null;
  }
}

/**
 * The words an open pop-up should show now: the mark's own, read again.
 * Null when the mark has gone from the page or has no words any more (the
 * pop-up closes); the same object back when nothing changed. A rated day
 * changed by keyboard while its pop-up stays open is why: the box turned
 * "Fair" and the pop-up still said "Not rated" (break-it tester, 11 Nov).
 */
export function tipNow(el, tip) {
  if (!el || el.isConnected === false) return null;
  const now = readTip(el);
  if (!now) return null;
  return JSON.stringify(now) === JSON.stringify(tip) ? tip : now;
}
