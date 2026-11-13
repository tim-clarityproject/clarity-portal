// Passwords (Tim, 11 Nov): at least 8 characters, and never one that is
// known from a data leak. Both are checked in the page, as well as by
// Supabase.

export const MIN_PASSWORD = 8;
export const TOO_SHORT = 'Please use at least 8 characters.';
export const LEAKED = ['That password has appeared in a data leak.', 'Please choose a different one.'];

export function tooShort(password) {
  return String(password ?? '').length < MIN_PASSWORD;
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * Whether a password is in the public list of leaked passwords (Have I
 * Been Pwned's range check). Only the first 5 characters of the
 * password's fingerprint ever leave the device: never the password, and
 * never enough to work it out. If the list can't be reached the answer
 * is "not known", and Supabase's own check still applies.
 * @returns {Promise<boolean>}
 */
export async function isLeaked(password, { fetchFn = globalThis.fetch, subtle = globalThis.crypto?.subtle, timeoutMs = 4000 } = {}) {
  try {
    if (!password || !fetchFn || !subtle) return false;
    const print = hex(await subtle.digest('SHA-1', new globalThis.TextEncoder().encode(password)));
    const start = print.slice(0, 5);
    const rest = print.slice(5);
    const stop = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
    const timer = stop ? setTimeout(() => stop.abort(), timeoutMs) : null;
    let text = '';
    try {
      const answer = await fetchFn(`https://api.pwnedpasswords.com/range/${start}`, { headers: { 'Add-Padding': 'true' }, signal: stop?.signal });
      if (!answer?.ok) return false;
      text = await answer.text();
    } finally {
      if (timer) clearTimeout(timer);
    }
    return text.split('\n').some((line) => {
      const [tail, count] = line.trim().split(':');
      return tail === rest && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

/** True when Supabase refused a password because it is a leaked one. */
export function refusedAsLeaked(error) {
  const reasons = error?.weak_password?.reasons || error?.reasons || [];
  return (error?.code === 'weak_password' && reasons.includes('pwned')) || /pwned|leaked|data breach/i.test(error?.message || '');
}

/** True when Supabase refused a password as too short. */
export function refusedAsShort(error) {
  const reasons = error?.weak_password?.reasons || error?.reasons || [];
  return (error?.code === 'weak_password' && reasons.includes('length')) || /at least \d+ characters/i.test(error?.message || '');
}
