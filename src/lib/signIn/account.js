// My Account's Password and Email pages (M26; Tim, 11 Nov).

/** True when the account has a password to sign in with (not Google alone). */
export function hasPassword(user) {
  const providers = user?.app_metadata?.providers || (user?.app_metadata?.provider ? [user.app_metadata.provider] : []);
  return providers.includes('email');
}

/** Someone who only ever signs in with Google: no Password page, and My Account says so. */
export function signsInWithGoogle(user) {
  const providers = user?.app_metadata?.providers || (user?.app_metadata?.provider ? [user.app_metadata.provider] : []);
  return providers.includes('google') && !providers.includes('email');
}

export const YOU_SIGN_IN_WITH_GOOGLE = 'You sign in with Google.';

/**
 * Checks the current password without touching the session this device
 * is signed in with (so a coach who has given their code keeps it). It
 * asks Supabase the same question signing in does, then lets that extra
 * sign-in go at once.
 * @returns {Promise<'ok'|'no'|'busy'|'error'>} 'busy' when it was tried too many times
 */
export async function checkCurrentPassword(supabase, email, password, fetchFn = globalThis.fetch, timeoutMs = 15000) {
  const base = supabase?.supabaseUrl;
  const key = supabase?.supabaseKey;
  if (!base || !key || !email || !password) return 'no';
  // An answer that never comes is given up on (as every other request to
  // Supabase is, connection.js), so the page says so and works again.
  const stop = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
  const timer = stop ? setTimeout(() => stop.abort(), timeoutMs) : null;
  try {
    const answer = await fetchFn(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: stop?.signal,
    });
    if (answer.status === 429) return 'busy';
    if (answer.status === 400 || answer.status === 401 || answer.status === 422) return 'no';
    if (!answer.ok) return 'error';
    const extra = await answer.json().catch(() => null);
    if (extra?.access_token) {
      fetchFn(`${base}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${extra.access_token}` } }).catch(() => null);
    }
    return 'ok';
  } catch {
    return 'error';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
