// The coach's 6-digit code, on the server (Phase 6a run 6, migration 054).
//
// A server function that acts for a coach on the coach's own sign-in
// (coach-send, coach-invite, coach-calendar, coach-calendar-connect, the
// owner's side of coach-email-in, and coach-auth-reset's 'reset') answers
// only a sign-in that has given its 6-digit code: Supabase's own claim,
// aal = 'aal2', in the caller's access token. 054 makes the database ask
// the same, so this is the server's own line of defence for what it does
// with the service key or with Google and Zoom.
//
// What stays open at aal1: coach-auth-reset's 'recovered' (a recovery code
// is used before any code can be given), and the functions with no coach
// sign-in at all (the schedulers' CRON_SECRET, the inbound-email secret,
// a guest's booking key), which never pass a coach's token here.
//
// The token is read, never trusted on its own: only a refusal is decided
// from it before Supabase has checked the token (a forged "aal2" is refused
// by Supabase's own check of the signature, getUser or the database).
// Nothing here logs or returns the token.

/** The words a refusal carries: what happened, then what to do (as RESET_WORDS.needsCode). */
export const CODE_NEEDED = 'Enter the 6-digit code from your authenticator app first, then try again.';

/** The access token's claims, or null when it isn't a JWT. */
export function tokenClaims(token) {
  try {
    const part = String(token || '').replace(/^Bearer\s+/i, '').split('.')[1];
    if (!part) return null;
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

/** The sign-in's assurance level ('aal1', 'aal2'), or null. */
export const tokenAal = (token) => {
  const aal = tokenClaims(token)?.aal;
  return typeof aal === 'string' ? aal : null;
};

/** True only when the sign-in has given its 6-digit code. */
export const codeGiven = (token) => tokenAal(token) === 'aal2';

/**
 * null when the code was given; otherwise the refusal to send, as
 * { status: 403, body } with the function's own shape merged in
 * (`shape`, e.g. { sent: false } or { ok: false }).
 */
export function codeRefusal(token, shape = { ok: false }) {
  if (codeGiven(token)) return null;
  return { status: 403, body: { ...shape, reason: 'needs_code', needsCode: true, message: CODE_NEEDED } };
}
