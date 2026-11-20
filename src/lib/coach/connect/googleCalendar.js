// Google Calendar, through the portal's own server (Phase 6a run 3).
//
// THE INTERFACE (the stand-in in standIn.js has exactly the same one):
//   service: 'google_calendar', real: boolean
//   listChanges({ syncToken }) → { events, syncToken }
//       the events changed since the token (all of them without one); a
//       deleted event comes back as { id, status: 'cancelled' }
//   createEvent(event, { invite })       → the event, with its id and etag
//   updateEvent(id, event, { invite })   → the event, with its new etag
//   deleteEvent(id, { invite })          → nothing
// An event is Google's own shape (calendar.js's googleEventFrom makes it):
// summary, description, location, start and end ({ dateTime, timeZone } in
// the item's anchor zone, or { date } for an all-day one), recurrence,
// attendees, extendedProperties.private.clarityId. With `invite` (the
// default) Google sends the guests a normal calendar invite, so it reaches
// Outlook, Apple and Gmail alike, with the Zoom link in it.
//
// The real adapter never holds a key: every call goes to
// /api/coach-calendar with the coach's own sign-in, and the server uses the
// keys in its environment. No key is ever in the browser or in this code.

/**
 * @param {(body: object) => Promise<object>} ask posts to /api/coach-calendar and resolves its answer (index.js's askServer)
 */
export function googleCalendarAdapter(ask) {
  const call = async (body) => {
    const answer = await ask({ service: 'google_calendar', ...body });
    if (!answer || answer.ok !== true) { const err = new Error('Google Calendar didn’t answer.'); err.code = answer?.reason || 'no_answer'; throw err; }
    return answer;
  };
  return {
    service: 'google_calendar',
    real: true,
    async listChanges({ syncToken = null } = {}) { const a = await call({ kind: 'list', syncToken }); return { events: Array.isArray(a.events) ? a.events : [], syncToken: a.syncToken ?? null }; },
    async createEvent(event, { invite = true } = {}) { return (await call({ kind: 'create', event, invite })).event; },
    async updateEvent(id, event, { invite = true } = {}) { return (await call({ kind: 'update', id, event, invite })).event; },
    async deleteEvent(id, { invite = true } = {}) { await call({ kind: 'delete', id, invite }); },
  };
}
