import { deviceKey, readJson, removeKey, writeJson } from '../deviceStore';

// The first sprint chosen in Build your plan (length, start, standard,
// and the first 90 days label), handed to Start a sprint, which creates
// the sprint (Phase 2 step 3). Kept on the device as a draft (signing out
// clears it), so it carries over even if the page is closed in between;
// the route's state carries it too.
//
// { lengthWeeks, startOn: 'YYYY-MM-DD', standard, label, template, at }

const NAME = 'first-sprint';

export function keepSprintSetup(userId, setup) {
  if (!userId) return;
  writeJson(deviceKey('draft', userId, NAME), { ...setup, at: Date.now() });
}

export function readSprintSetup(userId) {
  return userId ? readJson(deviceKey('draft', userId, NAME)) : null;
}

/** Once the sprint is created (or the setup is discarded). */
export function clearSprintSetup(userId) {
  if (userId) removeKey(deviceKey('draft', userId, NAME));
}

// A sprint start under way (sprintStart.js pendingStart): kept before
// anything is sent, so a refresh or a second tap sends the same rows
// again instead of making a second sprint, and cleared once it is all
// saved (or waiting in the offline queue).
const PENDING = 'sprint-start-pending';

export function keepPendingStart(userId, pending) {
  if (userId) writeJson(deviceKey('draft', userId, PENDING), pending);
}

export function readPendingStart(userId) {
  return userId ? readJson(deviceKey('draft', userId, PENDING)) : null;
}

export function clearPendingStart(userId) {
  if (userId) removeKey(deviceKey('draft', userId, PENDING));
}
