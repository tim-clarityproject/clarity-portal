// Invite to the portal, once sent (follow-up 5, item 1): the welcome email's set-up link works for 7 days from the
// newest send (migration 064), and the coach can send it again at any time.
import { parseDbTimestamp } from '../dateFormatter.js';
import { dayWords } from '../time/words.js';

export const INVITE_LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The line under Getting started's "Invite to the portal" once it has gone, before the person has joined:
 * "Sent Mon 16 Nov. The link works until Mon 23 Nov." or "Sent Mon 16 Nov. The link has ended."
 * @returns {string|null} null when nothing has been sent or they have joined
 */
export function inviteLinkWords(profile, { now = new Date(), zone }) {
  if (!profile?.invited_at || profile.user_id) return null;
  const sent = parseDbTimestamp(profile.invited_at);
  if (!(sent instanceof Date) || Number.isNaN(sent.getTime())) return null;
  const ends = new Date(sent.getTime() + INVITE_LINK_DAYS * DAY_MS);
  const open = ends.getTime() > now.getTime();
  return `Sent ${dayWords(sent, zone)}. ${open ? `The link works until ${dayWords(ends, zone)}.` : 'The link has ended.'}`;
}
