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
  // Only a date written as servers write it ("Fri, 13 Nov 2026 14:00:00
  // GMT"): anything else (a bare number, a word) is no time at all, and
  // must never be read as some other year (the break-it tester, 13 Nov).
  const written = String(headers?.get?.('date') || '').trim();
  const date = HTTP_DATE.test(written) ? Date.parse(written) : NaN;
  if (!Number.isFinite(date)) return null;
  const age = Number(headers.get('age') || 0);
  return { from: date, to: date + (Number.isFinite(age) && age > 0 ? age * 1000 : 0) };
}
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * True when the device's clock is more than 5 minutes from the server's.
 * @param {number|{from: number, to: number}|null} server the server's time, or the span it lies in
 * @param {number|{from: number, to: number}} device the device's time, or the span it lies in
 *   (from when the request was sent to when its answer came)
 */
export function clockIsOut(server, device) {
  const from = typeof server === 'number' ? server : server?.from;
  const to = typeof server === 'number' ? server : server?.to;
  const a = typeof device === 'number' ? device : device?.from;
  const b = typeof device === 'number' ? device : device?.to;
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  // Wrong only when no moment of the request, by the device's clock, was
  // within 5 minutes of the server's: a slow answer never looks like a
  // wrong clock.
  return Math.min(a, b) > to + CLOCK_ALLOWED_MS || Math.max(a, b) < from - CLOCK_ALLOWED_MS;
}

/** How long the check waits for its answer before it gives up, saying nothing. */
export const CLOCK_WAIT_MS = 15000;

/**
 * Asks the portal's own server for the time with a normal request (the
 * small version file the portal already reads) and compares. Offline, or
 * with no Date to read, it says nothing: never a false alarm. Nor when
 * the answer isn't the portal's own (a hotel's or a cafe's sign-in page
 * answering in its place: refused, or passed on to another address), or
 * when it takes longer than 15 seconds.
 */
export async function deviceClockLooksWrong(fetchFn = globalThis.fetch, now = Date.now, waitMs = CLOCK_WAIT_MS) {
  const stop = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
  const timer = stop ? setTimeout(() => stop.abort(), waitMs) : null;
  try {
    const before = now();
    // Asked for afresh each time (its own query, as the update check
    // does), so the answer is made now and not a copy kept on the way:
    // a kept copy's Age widens the span, and a wide span hides a fast clock.
    const answer = await fetchFn(`/version.json?t=${Math.round(before)}`, { method: 'HEAD', cache: 'no-store', signal: stop?.signal });
    const after = now();
    if (answer.ok === false || answer.redirected === true) return false;
    return clockIsOut(serverTimeFrom(answer.headers), { from: before, to: after });
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
