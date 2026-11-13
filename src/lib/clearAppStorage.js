import { DEVICE_PREFIXES } from './deviceStore';

// Removes everything this app itself keeps in the browser for a
// signed-in person: legacy tool autosaves and saved progress, cached
// profile data, page copies, drafts, saves waiting to be sent, and the
// sign-up flags. Used ONLY on a deliberate Sign out and when an account is
// deleted, so the next person on the same device is never offered the
// previous person's unfinished writing. Being offline, or a failed
// sign-in refresh, never clears anything (Tim, 26 Oct); the device's
// copies carry the person's id, so nobody else is shown them meanwhile.
//
// Deliberately NOT localStorage.clear(): it only touches keys the app
// owns (exact names and the app's own patterns below). Supabase's own
// session key is removed by supabase.auth.signOut(), and the saved
// header height is a harmless layout cache, so neither is listed.
const EXACT_KEYS = [
  'strategic-alignment-progress',
  'strategic-alignment-autosave',
  'clarity-user-data',
  'clarity_form_data',
  'clarity-portal-session-meta',
  'clarity-diag-log',
  'justConfirmedEmail',
  'pendingSignupName',
];

export function isAppOwnedKey(key) {
  if (EXACT_KEYS.includes(key)) return true;
  // Page copies, drafts and saves waiting to be sent (deviceStore.js).
  if (DEVICE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  // Where a guided tool was left, and a change from its summary still
  // open (GuidedTool.jsx; the key holds the person's id and the day).
  if (key.startsWith('ds-guide:')) return true;
  // What the sign-in pages keep for a tab (src/lib/signIn): where a link
  // pointed, a tick carried to Google, the email just typed, a reset link
  // just opened. None of it is for the next person to sign in here.
  if (key.startsWith('clarity-sign-in-')) return true;
  // Not cleared: answers that wait on the device until their migration has
  // run (clarity-day-plan-local:, clarity-day-review-local:,
  // clarity-checkin-extras:; dayStore.js, answerExtras.js). They carry the
  // person's id, so nobody else is shown them, and clearing them could lose
  // an answer that has nowhere else to live yet.
  // Journal, plan-edit and other drafts: clarity-<thing>-draft-<id>.
  if (key.startsWith('clarity-') && key.includes('-draft-')) return true;
  // Older per-tool saves, <toolType>-autosave / -progress, still on some devices.
  if (key.endsWith('-autosave') || key.endsWith('-progress')) return true;
  // Wheel of Life in-progress check-in: clarity.wol.inprogress.<userId>
  // (IN_PROGRESS_PREFIX in wheelOfLifeApi.js).
  if (key.startsWith('clarity.wol.')) return true;
  return false;
}

function clearFrom(storage) {
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key && isAppOwnedKey(key)) storage.removeItem(key);
  }
}

export function clearAppStorage() {
  try { clearFrom(window.localStorage); } catch { /* storage blocked */ }
  try { clearFrom(window.sessionStorage); } catch { /* storage blocked */ }
}
