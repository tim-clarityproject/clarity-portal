// A device clock that's wrong (Tim, 13 Nov). Supabase judges a sign-in by
// the device's own clock, so one set more than about an hour fast asks
// for a fresh sign-in on every request until Supabase signs it out. The
// Sign in page checks the clock against the server's and says so calmly,
// before anyone is caught by it.

/** How far out the device's clock may be before the page says anything. */
export const CLOCK_ALLOWED_MS = 5 * 60 * 1000;

/**
 * The server's time when it answered, from an answer's own headers: its
 * Date, plus its Age when a copy kept on the way was served (Date is then
 * when the copy was made). NaN when the answer carries no usable Date.
 */
export function serverTimeFrom(headers) {
  const date = Date.parse(headers?.get?.('date') || '');
  if (!Number.isFinite(date)) return NaN;
  const age = Number(headers.get('age') || 0);
  return date + (Number.isFinite(age) && age > 0 ? age * 1000 : 0);
}

/** True when the device's clock is more than 5 minutes from the server's. */
export function clockIsOut(serverMs, deviceMs) {
  return Number.isFinite(serverMs) && Number.isFinite(deviceMs) && Math.abs(deviceMs - serverMs) > CLOCK_ALLOWED_MS;
}

/**
 * Asks the portal's own server for the time with a normal request (the
 * small version file the portal already reads) and compares. Offline, or
 * with no Date to read, it says nothing: never a false alarm.
 */
export async function deviceClockLooksWrong(fetchFn = globalThis.fetch, now = Date.now) {
  try {
    const before = now();
    const answer = await fetchFn('/version.json', { method: 'HEAD', cache: 'no-store' });
    const after = now();
    return clockIsOut(serverTimeFrom(answer.headers), (before + after) / 2);
  } catch {
    return false;
  }
}
