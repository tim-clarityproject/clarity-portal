// Removes everything this app itself keeps in the browser for a
// signed-in person: legacy tool autosaves and saved progress, cached
// profile data, journal and plan drafts, and the sign-up flags. Used on
// log out and when an account is deleted, so the next person on the same
// device is never offered the previous person's unfinished writing.
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

function isAppOwnedKey(key) {
  if (EXACT_KEYS.includes(key)) return true;
  // Journal, plan-edit and other drafts: clarity-<thing>-draft-<id>.
  if (key.startsWith('clarity-') && key.includes('-draft-')) return true;
  // dataSyncManager's per-tool saves: <toolType>-autosave / -progress.
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
