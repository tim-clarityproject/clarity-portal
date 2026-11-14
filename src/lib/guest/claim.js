import { supabase } from '../supabase';

// A guest's answers move into their account once they sign up with the
// same email (migration 035, guest_claim: only for an account whose email
// is confirmed; safe to call again, a claimed guest moves nothing). Asked
// once per sign-in per tab. Until Tim has run 035 the function isn't
// there: nothing happens and nothing is said.
const KEY = 'clarity-guest-claim:';

/** Resolves how many rows moved in (0 when none, or when it couldn't be asked). */
export async function claimGuestWork(userId) {
  if (!userId) return 0;
  try {
    if (window.sessionStorage.getItem(KEY + userId)) return 0;
  } catch {
    // Storage blocked: ask once per page load instead.
  }
  try {
    const { data, error } = await supabase.rpc('guest_claim');
    if (error) return 0;
    try {
      window.sessionStorage.setItem(KEY + userId, '1');
    } catch {
      // Nothing to remember.
    }
    return Number.isInteger(data) ? data : 0;
  } catch {
    return 0;
  }
}
