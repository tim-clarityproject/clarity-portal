// The one tick box: "I’m 18 or over and I agree to the terms" (M26;
// Tim, 11 Nov). How the agreement is recorded, the same for an email
// sign-up, a Google sign-up and an account set up from a coach's invite:
//
//   1. on the account itself (Supabase user metadata): terms_accepted,
//      terms_accepted_at and terms_documents. Migration 021 reads this.
//   2. on the person's own profile row: profiles.terms_accepted.
//
// An email sign-up sends (1) with the sign-up itself. Google can't carry
// anything through its sign-in, so a Google sign-up writes (1) straight
// after coming back, and (2) is written for everyone on their next
// sign-in from (1) (AuthContext).

export const TERMS_DOCUMENTS = ['Terms of Service', 'Privacy Policy', 'Data Storage Notice'];

export const TICK_THE_BOX = 'Tick the box to carry on.';

/** What is saved on the account when the box is ticked. */
export function termsRecord(at = new Date()) {
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error('The terms record needs a real time.');
  return {
    terms_accepted: true,
    terms_accepted_at: when.toISOString(),
    terms_documents: [...TERMS_DOCUMENTS],
  };
}

/** True once the account carries the agreement. */
export function hasAgreed(user) {
  return user?.user_metadata?.terms_accepted === true;
}

/** True for an account that was first made by Continue with Google. */
export function startedWithGoogle(user) {
  return user?.app_metadata?.provider === 'google';
}

/**
 * An account a coach set up that hasn't been finished yet: invited, and
 * never agreed. Only such an account (or one whose invite link has just
 * been opened) is shown the invite's page, which sets a password without
 * asking for the old one.
 */
export function invitedNotSetUp(user) {
  return Boolean(user?.invited_at) && !hasAgreed(user);
}

/**
 * Who must agree before the portal opens: Before you start, then on.
 *   - A Google account the portal has never seen has agreed to nothing yet.
 *   - So has an account a coach set up whose owner came in another way
 *     than the invite's own page (a reset link, say): it never skips the
 *     tick box (Tim, 13 Nov).
 * An account made with an email and a password agreed when it was made,
 * and adding Google to it later never asks again.
 */
export function needsBeforeYouStart(user) {
  return Boolean(user) && !hasAgreed(user) && (startedWithGoogle(user) || Boolean(user.invited_at));
}

// The pages a ticked box can be carried from, through Google's round
// trip: the two that show the box beside Continue with Google.
const TICK_PAGES = ['/auth/sign-up', '/auth/invite'];

/**
 * Whether a tick kept for Google's round trip may be saved for the
 * account that came back. Only when Google was started from a page that
 * shows the box, and only for an account that hasn't agreed yet: a tick
 * left behind (ticked on Create my account, then Google closed with the
 * browser's own Back) never agrees for whoever signs in next from Sign in.
 */
export function tickAgreesFor(tickedAt, from, user) {
  return Boolean(tickedAt) && TICK_PAGES.includes(from) && Boolean(user) && !hasAgreed(user);
}

// The box ticked on Create my account before pressing Continue with
// Google: kept for this tab while Google does its round trip, and only
// for a short while, so an old tick never agrees for anyone.
const TICK_KEY = 'clarity-sign-in-tick';
export const TICK_LASTS_MS = 15 * 60 * 1000;
const store = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export function rememberTick(at = new Date()) {
  try {
    store()?.setItem(TICK_KEY, at.toISOString());
  } catch { /* they get Before you start instead */ }
}

export function forgetTick() {
  try {
    store()?.removeItem(TICK_KEY);
  } catch { /* nothing kept */ }
}

/** Whether a kept tick still counts at `now`. */
export function tickCounts(saved, now = new Date()) {
  const when = new Date(saved || '');
  if (Number.isNaN(when.getTime())) return false;
  const age = now.getTime() - when.getTime();
  return age >= 0 && age <= TICK_LASTS_MS;
}

/** The time the box was ticked, if it was ticked just now in this tab. Clears it. */
export function takeTick(now = new Date()) {
  let saved = null;
  try {
    saved = store()?.getItem(TICK_KEY) || null;
    store()?.removeItem(TICK_KEY);
  } catch { /* nothing kept */ }
  return tickCounts(saved, now) ? new Date(saved) : null;
}

/**
 * Saves the agreement on the account and the profile.
 * @returns {Promise<{ error: object|null, user: object|null }>} the account as it now stands
 */
export async function recordAgreement(supabase, userId, at = new Date()) {
  let answer;
  try {
    answer = await supabase.auth.updateUser({ data: termsRecord(at) });
  } catch (error) {
    answer = { error };
  }
  if (answer?.error) return { error: answer.error, user: null };
  // The profile's copy: tried now, and filled in on the next sign-in if this misses.
  try {
    await supabase.from('profiles').update({ terms_accepted: true }).eq('id', userId);
  } catch { /* AuthContext fills it in */ }
  return { error: null, user: answer?.data?.user || null };
}
