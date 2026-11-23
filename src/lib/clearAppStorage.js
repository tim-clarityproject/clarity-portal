import { DEVICE_PREFIXES } from './deviceStore';
import { clearDeviceCopies } from './coach/deviceCopy';

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

// The person's own copies kept beside the page copies (tidy follow-up 3,
// the scale check's 5: Sign out clears every saved copy on the device):
// clarity-<kind>:<person>[:<name>], made by deviceKey. Sign out first sends
// across whatever of them still waits (signOutCopies.js), so nothing is
// lost unless the person chooses "Sign out anyway".
export const PERSONAL_KINDS = [
  'own-questions-local', // your own questions' wording and answers (ownQuestions/store.js)
  'peak-moments-local', // peak moments and their reviews (peakMoments/store.js)
  'travel-plans-local', // travel plans and their ticks (travel/store.js)
  'day-plan-local', // the day's plan: habits chosen and the order (dayPlanHabits.js)
  'day-review-local', // the Daily review's way of being (answerExtras.js, ReviewMyDay.jsx)
  'checkin-extras', // a monthly review's drinks and trip (answerExtras.js)
  'checkin-added', // what a monthly review added to the plan (CheckIn.jsx)
  'checkin-doing', // a monthly review's "what I'm doing" (CheckIn.jsx)
  'checkin-nothing', // a monthly review's "nothing to add" (CheckIn.jsx)
  'home', // Home's own small copies (Home.jsx)
];
const PERSONAL_PREFIXES = PERSONAL_KINDS.map((kind) => `clarity-${kind}:`);

export function isAppOwnedKey(key) {
  if (EXACT_KEYS.includes(key)) return true;
  // Page copies, drafts and saves waiting to be sent (deviceStore.js).
  if (DEVICE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  // The person's own copies (PERSONAL_KINDS above).
  if (PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  // Typing kept until the server has it (useAutosave.js: ds-draft:<key>).
  if (key.startsWith('ds-draft:')) return true;
  // A coach's weekly review typed on Today (coach/todayParts.jsx, this tab).
  if (key.startsWith('clarity-coach-review-draft:')) return true;
  // Where a guided tool was left, and a change from its summary still
  // open (GuidedTool.jsx; the key holds the person's id and the day).
  if (key.startsWith('ds-guide:')) return true;
  // What the sign-in pages keep for a tab (src/lib/signIn): where a link
  // pointed, a tick carried to Google, the email just typed, a reset link
  // just opened. None of it is for the next person to sign in here.
  if (key.startsWith('clarity-sign-in-')) return true;
  // The mark that this tab has asked for a guest's or an outside Health
  // Check's work (claimRules.js): the next sign-in here asks again.
  if (key.startsWith('clarity-guest-claim:')) return true;
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

// The Team performance check and the Emotional wash (toolAnswers.js) keep
// their saved work in a page copy, clarity-cache:<person>:tool-answers.
// Until migration 043 has run that copy is the only one there is, so a
// Sign out that cleared it would lose every check and wash for good (the
// functionality tester, 14 Nov). Like the other answers that wait for
// their migration, whatever has not reached the account yet (`sent` not
// true) is set aside under its own key, which carries the person's id and
// is never cleared here; toolAnswers.js takes it back the next time that
// person signs in on this device. Everything the account already holds is
// cleared with the rest.
const TOOL_ANSWERS_COPY = /^clarity-cache:([^:]+):tool-answers$/;
export const TOOL_ANSWERS_WAITING = 'clarity-tool-answers-local:';

/** Sets aside the tool answers that live only on this device. Returns how many. */
export function keepWaitingToolAnswers(storage) {
  let count = 0;
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    const person = key && TOOL_ANSWERS_COPY.exec(key)?.[1];
    if (!person) continue;
    try {
      const map = JSON.parse(storage.getItem(key))?.v;
      if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
      const waiting = Object.entries(map).filter(([, r]) => r && typeof r === 'object' && r.sent !== true);
      if (!waiting.length) continue;
      let before = {};
      try { before = JSON.parse(storage.getItem(TOOL_ANSWERS_WAITING + person)) || {}; } catch { before = {}; }
      storage.setItem(TOOL_ANSWERS_WAITING + person, JSON.stringify({ ...before, ...Object.fromEntries(waiting) }));
      count += waiting.length;
    } catch {
      // A copy that can't be read holds nothing to keep.
    }
  }
  return count;
}

/**
 * @param {{ deletedAccount?: string, toolAnswersThere?: boolean }} [opts]
 *   deletedAccount: the person's id when the account itself has just been
 *   deleted: then nothing of theirs waits anywhere, on this device included.
 *   toolAnswersThere: migration 043's table is there, so the checks and
 *   washes are in the account and none is set aside on the device.
 */
export function clearAppStorage({ deletedAccount = null, toolAnswersThere = false } = {}) {
  try {
    // Once 043 is there (Phase 8a follow-up, step 5) Sign out has sent
    // what waited first, and nothing of these tools stays on the device.
    if (toolAnswersThere) {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(TOOL_ANSWERS_WAITING)) window.localStorage.removeItem(key);
      }
    } else {
      keepWaitingToolAnswers(window.localStorage);
    }
    if (deletedAccount) window.localStorage.removeItem(TOOL_ANSWERS_WAITING + deletedAccount);
  } catch { /* storage blocked */ }
  try { clearFrom(window.localStorage); } catch { /* storage blocked */ }
  try { clearFrom(window.sessionStorage); } catch { /* storage blocked */ }
  // The coach portal's large copy (IndexedDB, coach/deviceCopy.js): last data only, cleared like the rest. What
  // hasn't reached the database is kept in localStorage (clarity-coach-local:), which this never clears.
  clearDeviceCopies();
}

/**
 * Another tab has signed out (or this one heard it late): what the app keeps
 * is cleared here too, so a page this tab closed afterwards leaves nothing.
 * Only the app's own keys: whatever Sign out set aside on purpose stays.
 */
export function clearAfterSignOutElsewhere() {
  try { clearFrom(window.localStorage); } catch { /* storage blocked */ }
  try { clearFrom(window.sessionStorage); } catch { /* storage blocked */ }
  // The coach portal's large copy (IndexedDB, coach/deviceCopy.js): last data only, cleared like the rest. What
  // hasn't reached the database is kept in localStorage (clarity-coach-local:), which this never clears.
  clearDeviceCopies();
}
