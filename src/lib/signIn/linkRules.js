// The rules for what an email link's landing page may trust (M26; the
// functionality tester, 13 Nov). Kept apart from the page code so each
// is tested on its own.

/**
 * Whether the one-time code the address arrived with was really swapped
 * for a session on this visit. Supabase takes the code out of the address
 * only when the swap worked; a code it could not use (made up, opened in
 * another browser, used before) is left where it was. So a session that
 * was already on the device is never mistaken for one the link brought.
 */
export function codeWasSwapped(landing, search = globalThis.window?.location?.search || '') {
  if (!landing.code) return false;
  try {
    return !new URLSearchParams(search).has('code');
  } catch {
    return false;
  }
}

// A link that was opened in this tab a little while ago, for this very
// account: kept so a refresh still shows its page (New password), and
// never good for anyone else who signs in on this tab afterwards.
const HOUR_MS = 60 * 60 * 1000;

/** Whether a kept note still stands for `userId` at `now`. */
export function noteStands(raw, userId, now = Date.now()) {
  try {
    const note = JSON.parse(raw || 'null');
    if (!note || !userId || note.id !== userId) return false;
    const age = now - Number(note.at);
    return Number(note.at) > 0 && age >= 0 && age < HOUR_MS;
  } catch {
    return false;
  }
}

