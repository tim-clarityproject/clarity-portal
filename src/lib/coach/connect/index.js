// Choosing the calendar's connections (Phase 6a run 3). ONE function
// decides: the real Google Calendar or Zoom adapter only when the portal's
// server says that service's key is set and the coach is connected,
// otherwise the stand-in. A page never chooses for itself and never needs
// to know which it was given: both have the same interface.
//
// Nothing here imports the database client, so it is all unit-tested
// (tests/performance/coach-connect.test.mjs). The app's own way of asking
// the server, with the coach's sign-in, is server.js.
import { googleCalendarAdapter } from './googleCalendar.js';
import { zoomAdapter } from './zoom.js';
import { googleStandIn, zoomStandIn } from './standIn.js';

export { googleStandIn, zoomStandIn, tabKeep } from './standIn.js';
export { syncOnce, zoomOnce } from './sync.js';

// One stand-in of each for the device, so every page that asks shares the same calendar.
let deviceGoogle = null;
let deviceZoom = null;
/** The device's own stand-ins (made once). */
export function deviceStandIns(options = {}) {
  if (!deviceGoogle) deviceGoogle = googleStandIn(options.google);
  if (!deviceZoom) deviceZoom = zoomStandIn(options.zoom);
  return { google: deviceGoogle, zoom: deviceZoom };
}
/** For tests: start again with no stand-in. */
export function resetStandInsForTests() { deviceGoogle = null; deviceZoom = null; }

/**
 * What the server says about the connections: { google_calendar, zoom },
 * each true only when its key is set on the server and the coach is
 * connected. Anything that isn't that answer (no server on a developer's
 * machine, a preview, offline, an error) reads as not connected.
 * @param {(body: object) => Promise<object>} ask
 */
export async function serverStatus(ask) {
  try {
    const answer = await ask({ kind: 'status' });
    return { google_calendar: answer?.ok === true && answer.google_calendar === true, zoom: answer?.ok === true && answer.zoom === true };
  } catch {
    return { google_calendar: false, zoom: false };
  }
}

/**
 * The adapters to use: the real one for each service the server says is
 * connected, otherwise that service's stand-in.
 * @param {{ google_calendar?: boolean, zoom?: boolean }} status the server's own answer (serverStatus)
 * @param {{ ask: (body: object) => Promise<object>, standIns?: { google, zoom } }} with
 * @returns {{ google: object, zoom: object, invites: boolean }} `invites`: guests really get invites (Google is the real one)
 */
export function chooseAdapters(status, { ask, standIns = deviceStandIns() } = {}) {
  const google = status?.google_calendar === true && typeof ask === 'function' ? googleCalendarAdapter(ask) : standIns.google;
  const zoom = status?.zoom === true && typeof ask === 'function' ? zoomAdapter(ask) : standIns.zoom;
  return { google, zoom, invites: google.real === true };
}

/** Asks the server, then chooses. */
export async function loadAdapters({ ask, standIns } = {}) {
  return chooseAdapters(typeof ask === 'function' ? await serverStatus(ask) : null, { ask, standIns });
}
