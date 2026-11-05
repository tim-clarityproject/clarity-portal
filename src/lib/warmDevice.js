import { readCache, writeCache } from './pageCache';
import { isOnline, subscribeOnline } from './connection';
import { changesMade, readQuietly, waitingToSend, whenSent } from './syncQueue';
import { loadSavedPlans, loadSavedReviews, SAVED_PLANS_CACHE, SAVED_REVIEWS_CACHE } from './savedItemsApi';
import { loadActivePlan, loadCheckinPage, loadCheckins, loadDashboard, loadDayPlan, loadDayReview, loadDebrief, loadHomeDay, loadPatternRows, loadPlanPage, loadSprintPage } from './performance/api';
import { DASHBOARD_CACHE } from './performance/dashboard';
import { PATTERNS_CACHE } from './performance/patterns';
import { PLAN_CACHE, SPRINT_CACHE } from './performance/hooks';
import { localToday } from './performance/rows';
import { addDayKey } from './performance/dayPlan';
import { moveAnswerExtras } from './performance/answerExtras';
import { REVIEW_EARLY_HOURS } from './performance/dayReview';

// The key pages are on the device before they are needed (Phase 4 step 8,
// "Works on a flight"): Today, the plan, the sprint, Plan my day, Review
// my day, this week's debrief, My Plans, My Reviews, the check-in and the
// dashboard (Phase 5) show everything
// as last seen even if they weren't opened recently. Once per visit, a
// few seconds after the app opens signed in (or after signing in), each
// page's data is read with the page's own loader and kept as the page's
// own copy (pageCache.js), exactly as if the page had been opened.
//
// Gently: one read at a time, nothing whose copy is under 10 minutes old
// (a page just opened has its own fresh copy), and never while saves wait
// to be sent or when one is made during the read, so an older answer is
// never put over someone's own change (the same rule as useCachedLoad).
// Its reads never move on the version a window's open page is based on
// (readQuietly in syncQueue.js), so another window's newer change is still
// guarded against.
// Offline it waits for the connection and then runs once.

const START_AFTER_MS = 4000;
const FRESH_MS = 10 * 60 * 1000;

function pages(userId) {
  const now = new Date();
  const today = localToday(undefined, now);
  const list = [
    [PLAN_CACHE, () => loadPlanPage(userId)],
    ['performance-plan-head', () => loadActivePlan(userId)],
    [SPRINT_CACHE, () => loadSprintPage(userId)],
    [`home-day:${today}`, () => loadHomeDay(userId, today)],
    [`day-plan:${today}`, () => loadDayPlan(userId, today)],
    [`day-review:${today}`, () => loadDayReview(userId, today)],
    ['debrief:now', () => loadDebrief(userId, { today })],
    [SAVED_PLANS_CACHE, () => loadSavedPlans(userId)],
    [SAVED_REVIEWS_CACHE, () => loadSavedReviews(userId)],
    // The Hardware and Software check-in (Phase 5): Home's line, and the
    // check-in itself, so it can be done on a flight (CheckIn.jsx CHECKIN_CACHE).
    ['checkins', () => loadCheckins(userId)],
    ['checkin-page', () => loadCheckinPage(userId)],
    // The dashboard (Phase 5) and its pattern cards, with the dashboard's own
    // loaders (Dashboard.jsx, usePatterns.js).
    [DASHBOARD_CACHE, () => loadDashboard(userId, today)],
    [PATTERNS_CACHE, () => loadPatternRows(userId, today)],
  ];
  // Just after midnight, Review my day may be for the day before.
  if (now.getHours() < REVIEW_EARLY_HOURS) {
    const yesterday = addDayKey(today, -1);
    list.push([`day-review:${yesterday}`, () => loadDayReview(userId, yesterday)]);
  }
  return list;
}

let warmed = null; // whose device was warmed this visit
let running = null;

async function warm(userId) {
  for (const [name, load] of pages(userId)) {
    if (warmed !== userId || !isOnline()) return;
    const had = readCache(userId, name);
    if (had?.at && Date.now() - had.at < FRESH_MS) continue;
    try {
      await whenSent();
      if (waitingToSend(userId)) return; // the device has changes the server doesn't yet
      const saves = changesMade();
      const fresh = await readQuietly(load);
      if (warmed !== userId || changesMade() !== saves || waitingToSend(userId)) return;
      // A page that wrote its own copy while this read was under way wins.
      const now = readCache(userId, name);
      if (now?.at && had?.at !== now.at) continue;
      writeCache(userId, name, fresh);
    } catch {
      // Offline or refused: the page loads it itself when it's opened.
      if (!isOnline()) return;
    }
  }
}

let stopOnline = null;

/** Who is signed in now (null when nobody is): warms their device once per visit. */
export function startWarming(userId) {
  stopOnline?.();
  stopOnline = null;
  if (!userId || typeof window === 'undefined') {
    warmed = null;
    return;
  }
  if (warmed === userId) return;
  warmed = userId;
  const go = () => {
    if (warmed !== userId || running) return;
    if (!isOnline()) {
      // Opened offline: once, when the connection comes back.
      stopOnline = subscribeOnline((on) => {
        if (!on) return;
        stopOnline?.();
        stopOnline = null;
        go();
      });
      return;
    }
    // First, anything still kept on this device that migration 040 now
    // holds with its row (answerExtras.js), then the pages' copies.
    running = moveAnswerExtras(userId).catch(() => 0).then(() => warm(userId)).finally(() => { running = null; });
  };
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 4000 });
    else go();
  }, START_AFTER_MS);
}
