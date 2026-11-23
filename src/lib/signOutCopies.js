import { deviceKey, readJson } from './deviceStore';

// Before a deliberate Sign out (tidy follow-up 3, the scale check's 5):
// Sign out clears every copy the portal keeps on the device for the person,
// their own questions' wording, the day's plan order, peak moments and
// travel plans included (clearAppStorage.js, PERSONAL_KINDS). So nothing is
// lost, what of those still waits to reach the account is sent across
// first, as the checks and washes are (toolAnswers.js). Whatever still
// waits afterwards is counted, and Sign out then says "Some changes
// haven't synced yet." with "Wait" and "Sign out anyway", as it does for
// the offline queue.
//
// The stores are loaded only here, when Sign out is pressed, so the first
// load of every page stays as it was.

const kept = (kind, userId) => {
  const v = readJson(deviceKey(kind, userId));
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};
const values = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.values(o) : []);
// Still to reach the account: not sent, and not refused (a refused one is
// never sent again, so waiting can't help it).
const waits = (x) => x && typeof x === 'object' && x.sent !== true && !x.refused;

/** How many of the person's own copies on this device haven't reached the account. Pure reads. */
export function copiesWaiting(userId) {
  if (!userId) return 0;
  const own = kept('own-questions-local', userId);
  const peak = kept('peak-moments-local', userId);
  const travel = kept('travel-plans-local', userId);
  const ownQuestions = values(own.questions).filter((q) => waits(q) && !q.deletedAt && typeof q.wording === 'string' && q.wording.trim());
  const ownAnswers = values(own.answers).filter(waits);
  const choices = values(own.suggestions).filter((x) => x?.unsent === true);
  const moments = values(peak.moments).filter(waits);
  const reviews = values(peak.reviews).filter(waits);
  const plans = values(travel.plans).filter(waits);
  return ownQuestions.length + ownAnswers.length + choices.length + moments.length + reviews.length + plans.length;
}

/**
 * Sends across what of the person's own copies still waits, then says how
 * many still wait. Never throws. Resolves { waiting }.
 */
export async function sendCopiesBeforeSignOut(userId) {
  if (!userId) return { waiting: 0 };
  const quietly = async (load) => { try { await load(); } catch { /* tried again by the stores on the next visit */ } };
  await quietly(async () => (await import('./ownQuestions/store')).moveOwnQuestions(userId));
  let moments = [];
  await quietly(async () => {
    const peak = await import('./peakMoments/store');
    await peak.movePeak(userId);
    moments = peak.visibleMoments(peak.peakState(userId));
  });
  await quietly(async () => (await import('./travel/store')).moveTravel(userId, moments));
  // The Daily review's way of being and a monthly review's extras: moved
  // to their rows where the rows are there (cleared with the rest).
  await quietly(async () => (await import('./performance/answerExtras')).moveAnswerExtras(userId));
  return { waiting: copiesWaiting(userId) };
}
