// A device clock that's wrong (Tim, 13 Nov). Supabase judges a sign-in by
// the device's own clock, so one set more than about an hour fast asks
// for a fresh sign-in on every request until Supabase signs it out. The
// Sign in page checks the clock against the server's and says so calmly,
// before anyone is caught by it.

/** How far out the device's clock may be before the page says anything. */
export const CLOCK_ALLOWED_MS = 5 * 60 * 1000;

/**
 * The server's time when it answered, from an answer's own headers, as
 * the earliest and the latest it can have been: { from, to }, or null
 * when the answer carries no usable Date.
 *
 * An answer served from a copy kept on the way carries an Age (seconds),
 * and servers differ on what Date then means (the functionality tester,
 * 13 Nov): by the standard it is when the copy was made, so the time now
 * is Date plus Age; Vercel, which serves the portal, writes the time now
 * as Date and still sends an Age of minutes or hours. Adding the two
 * there would call every right clock slow. So the time is taken to lie
 * anywhere from Date to Date plus Age, and only a clock outside that
 * says anything.
 */
export function serverTimeFrom(headers) {
  const date = Date.parse(headers?.get?.('date') || '');
  if (!Number.isFinite(date)) return null;
  const age = Number(headers.get('age') || 0);
  return { from: date, to: date + (Number.isFinite(age) && age > 0 ? age * 1000 : 0) };
}

/**
 * True when the device's clock is more than 5 minutes from the server's.
 * @param {number|{from: number, to: number}|null} server the server's time, or the span it lies in
 */
export function clockIsOut(server, deviceMs) {
  const from = typeof server === 'number' ? server : server?.from;
  const to = typeof server === 'number' ? server : server?.to;
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(deviceMs)) return false;
  return deviceMs < from - CLOCK_ALLOWED_MS || deviceMs > to + CLOCK_ALLOWED_MS;
}

/**
 * Asks the portal's own server for the time with a normal request (the
 * small version file the portal already reads) and compares. Offline, or
 * with no Date to read, it says nothing: never a false alarm.
 */
export async function deviceClockLooksWrong(fetchFn = globalThis.fetch, now = Date.now) {
  try {
    const before = now();
    // Asked for afresh each time (its own query, as the update check
    // does), so the answer is made now and not a copy kept on the way:
    // a kept copy's Age widens the span, and a wide span hides a fast clock.
    const answer = await fetchFn(`/version.json?t=${Math.round(before)}`, { method: 'HEAD', cache: 'no-store' });
    const after = now();
    return clockIsOut(serverTimeFrom(answer.headers), (before + after) / 2);
  } catch {
    return false;
  }
}
