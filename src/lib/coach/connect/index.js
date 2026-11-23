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
import { copyInStandIn, gmailStandIn, googleStandIn, zoomStandIn } from './standIn.js';
import { copyInEmailAdapter, copyInOff } from './copyInEmail.js';
import { gmailAdapter, gmailOff } from './gmail.js';

export { copyInStandIn, gmailStandIn, googleStandIn, zoomStandIn, tabKeep, STAND_IN_CALENDARS, STAND_IN_DOMAIN } from './standIn.js';
export { addressesFor, copyInEmailAdapter, copyInOff, directionOf, keysOf, readInbound } from './copyInEmail.js';
export { gmailAdapter, gmailOff, gmailOnce, tidyEmail } from './gmail.js';
export { syncOnce, zoomOnce } from './sync.js';

// One stand-in of each for the device, so every page that asks shares the same calendar.
let deviceGoogle = null;
let deviceZoom = null;
let deviceCopyIn = null;
let deviceGmail = null;
/** The device's own stand-ins (made once). */
export function deviceStandIns(options = {}) {
  if (!deviceGoogle) deviceGoogle = googleStandIn(options.google);
  if (!deviceZoom) deviceZoom = zoomStandIn(options.zoom);
  return { google: deviceGoogle, zoom: deviceZoom };
}
/** For tests: start again with no stand-in. */
export function resetStandInsForTests() { deviceGoogle = null; deviceZoom = null; deviceCopyIn = null; deviceGmail = null; }

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

// ---------------------------------------------------------------- email (Phase 6a run 4): the copy-in address and Gmail

/** The device's own email stand-ins (made once). They start empty and hold only invented emails a test or a tester hands them. */
export function deviceEmailStandIns(options = {}) {
  if (!deviceCopyIn) deviceCopyIn = copyInStandIn(options.copyIn);
  if (!deviceGmail) deviceGmail = gmailStandIn(options.gmail);
  return { copyIn: deviceCopyIn, gmail: deviceGmail };
}

/**
 * What the server says about email: { copy_in, gmail, domain }. copy_in is
 * true only when the server has its secret, its key and its inbound
 * domain; gmail only when its keys are set and the owner is connected.
 * Anything that isn't that answer (no server, a preview, offline, an
 * error) reads as not set up.
 * @param {(body: object) => Promise<object>} ask
 */
export async function emailStatus(ask) {
  try {
    const answer = await ask({ kind: 'status' });
    const ok = answer?.ok === true;
    return { copy_in: ok && answer.copy_in === true, gmail: ok && answer.gmail === true, domain: ok && typeof answer.domain === 'string' && answer.domain ? answer.domain : null };
  } catch {
    return { copy_in: false, gmail: false, domain: null };
  }
}

/**
 * The email adapters to use. ONE rule, and a page never chooses:
 *  - the real adapter for each service the server says is set up;
 *  - on the LIVE site, anything not set up is OFF: no address is shown and
 *    nothing is ever handed over (a stand-in's invented emails must never
 *    reach a real timeline);
 *  - anywhere else (a preview, a developer's machine, a test) the
 *    stand-ins, so the screens can be walked.
 * @param {{ copy_in?: boolean, gmail?: boolean }} status emailStatus' answer
 * @param {{ ask: (body: object) => Promise<object>, live: boolean, standIns?: { copyIn, gmail } }} with `live`: this is the live site's build (__CLARITY_LIVE__)
 * @returns {{ copyIn: object, gmail: object }}
 */
export function chooseEmailAdapters(status, { ask, live, standIns } = {}) {
  const real = typeof ask === 'function';
  const fallback = () => standIns || deviceEmailStandIns();
  return {
    copyIn: status?.copy_in === true && real ? copyInEmailAdapter(ask) : live ? copyInOff : fallback().copyIn,
    gmail: status?.gmail === true && real ? gmailAdapter(ask) : live ? gmailOff : fallback().gmail,
  };
}

/** Asks the server, then chooses. */
export async function loadEmailAdapters({ ask, live, standIns } = {}) {
  return chooseEmailAdapters(typeof ask === 'function' ? await emailStatus(ask) : null, { ask, live, standIns });
}
