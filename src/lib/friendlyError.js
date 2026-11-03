import { isNetworkError, isOnline } from './connection';

// What people read when something goes wrong (writing rule 15, Tim's rule
// of 26 Oct): what happened, then what to do, in plain words. Raw
// technical text from the server or the browser ("Failed to fetch",
// "JWT expired") never reaches people; it goes to the console instead.
// A few answers the server gives on purpose are put into plain words;
// everything else gets the page's own message.
// A save refused because the row had moved on in another window (the
// save-version guard in syncQueue.js): the page reloads the newest version.
export const SUPERSEDED_MESSAGE = 'This was changed in another window. Showing the latest.';

// Things that truly need a connection say so calmly (Works on a flight,
// writing rule 15), all in one shape: "Signing in needs a connection, so
// try again when you’re back online." Everything else works offline.
export function needsConnection(what) {
  return `${what} needs a connection, so try again when you’re back online.`;
}

// A page opened for the first time on this device with no connection:
// there is no copy of it yet (pageCache.js).
export const FIRST_OPEN_OFFLINE = 'This page needs a connection the first time it opens on this device, so try again when you’re back online.';

/** True when there's no connection, or the error says the request never got through. */
export function isOffline(error) {
  return !isOnline() || isNetworkError(error);
}

/**
 * @param {*} error
 * @param {string} fallback the page's own message
 * @param {string} [needs] what needs a connection ("Signing in"): offline,
 *   the calm needsConnection line is shown instead of the fallback
 */
export function friendlyError(error, fallback, needs) {
  const code = error?.code || '';
  if (code === 'SUPERSEDED') return SUPERSEDED_MESSAGE;
  if (error) console.error(error);
  if (needs && isOffline(error)) return needsConnection(needs);
  const text = `${error?.message || ''}`;
  if (code === 'weak_password' || /password should (be|contain)/i.test(text)) {
    return 'That password is too easy to guess. Choose a longer one and try again.';
  }
  if (code === 'same_password' || /different from the old password/i.test(text)) {
    return 'That’s your current password. Choose a new one and try again.';
  }
  if (error?.status === 429 || /rate limit|too many/i.test(text)) {
    return 'That was tried too many times. Wait a minute and try again.';
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(text)) {
    return 'That email address doesn’t look right. Check it and try again.';
  }
  return fallback;
}
