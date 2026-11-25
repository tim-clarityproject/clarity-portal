// A coach's set-up link (follow-up 5, item 1): the welcome email's "Set my password" opens Create your account with
// the link's own token, which works for 7 days (migration 064's client_invite_link_state says whether it still does).

/** The token in the address (64 lower-case hex characters), or null. */
export function inviteTokenOf(params) {
  const t = params?.get?.('invite');
  return typeof t === 'string' && /^[0-9a-f]{64}$/.test(t) ? t : null;
}
