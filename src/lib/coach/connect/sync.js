// One round of keeping the portal's calendar and Google Calendar in step
// (Phase 6a run 3, step 3): read what changed in Google, merge it into the
// device's items (calendar.js's mergeFromGoogle: its comment holds the
// conflict rule), then push what changed here, making or moving each
// call's Zoom meeting on the way, in the call's own time zone. It talks
// only to the adapters it is given (real or stand-in) and saves nothing
// itself: it returns the rows for the page to hand to the store.
import { CALL_KINDS, SYNC_WORDS, T, afterPush, googleEventFrom, mergeFromGoogle, toPush, zoomWork } from '../calendar.js';

const MIN = 60000;
const minutesOf = (item) => Math.max(15, Math.round((new Date(item.ends_at) - new Date(item.starts_at)) / MIN));

/**
 * @param {object} a
 * @param {{ google: object, zoom?: object }} a.adapters from connect/index.js's chooseAdapters
 * @param {object[]} a.items the coach's calendar items   @param {object[]} [a.guests]   @param {object[]} [a.sessions]
 * @param {string|null} a.syncToken the token the last round ended with
 * @param {{ google_event_id?: string, meeting_id?: string }[]} [a.removed] items deleted here since the last round
 * @param {string|null} [a.editingId] the item open in the edit panel: nothing changes under it, and it isn't pushed
 * @param {Date|string} a.now   @param {string} a.coachZone   @param {string} [a.coachId]   @param {() => string} a.newId
 * @param {(event: object) => string} [a.calendarOf] which of My calendars an event read from Google belongs to
 * @returns {Promise<{ save: [string, object][], remove: [string, string][], syncToken: string|null, conflicts: object[], moved: object[], pushed: number, problem: string|null }>}
 */
export async function syncOnce({ adapters, items = [], guests = [], sessions = [], syncToken = null, removed = [], editingId = null, now, coachZone, coachId = null, newId, calendarOf }) {
  const { google, zoom = null } = adapters;
  const out = { save: [], remove: [], syncToken, conflicts: [], moved: [], pushed: 0, problem: null };
  // Rows are gathered by key, so a later change to the same row replaces the earlier one.
  const saved = new Map();
  const put = (table, row) => saved.set(`${table}|${row.id}`, [table, row]);
  let current = items;
  try {
    // 1. Read back what changed in Google.
    const pulled = await google.listChanges({ syncToken });
    const merged = mergeFromGoogle({ items, guests, sessions, events: pulled.events, editingId, now, coachZone, coachId, newId, calendarOf });
    for (const [table, row] of merged.save) put(table, row);
    out.remove = merged.remove;
    out.conflicts = merged.conflicts;
    out.moved = merged.moved;
    // A change held back for an item being edited must be read again next time, so the token stays where it was
    // (everything else read twice is the same tag the second time, and is skipped).
    out.syncToken = merged.conflicts.length ? syncToken : (pulled.syncToken ?? syncToken);
    const gone = new Set(merged.remove.filter(([t]) => t === T.items).map(([, id]) => id));
    const changed = new Map(merged.save.filter(([t]) => t === T.items).map(([, r]) => [r.id, r]));
    current = [...items.filter((i) => !gone.has(i.id)).map((i) => changed.get(i.id) || i), ...[...changed.values()].filter((r) => !items.some((i) => i.id === r.id))];
    const waiting = new Set(merged.conflicts.map((c) => c.id));
    // A call deleted in Google has no use for its Zoom meeting.
    for (const i of items) if (gone.has(i.id) && i.meeting_id && zoom) await zoom.deleteMeeting(i.meeting_id);

    // 2. What was deleted here goes from Google and from Zoom.
    for (const r of removed) {
      if (r.google_event_id) await google.deleteEvent(r.google_event_id);
      if (r.meeting_id && zoom) await zoom.deleteMeeting(r.meeting_id);
    }

    // 3. Push what changed here: each call's Zoom meeting first, so the invite carries its link.
    for (const push of toPush({ items: current, guests, editingId })) {
      if (waiting.has(push.item.id)) continue;
      let item = push.item;
      const wantsZoom = zoom && CALL_KINDS.includes(item.kind) && (item.place_kind || 'zoom') === 'zoom' && !item.all_day && !item.removed;
      if (wantsZoom && !item.meeting_link) {
        const meeting = await zoom.createMeeting({ topic: item.title, startsAt: item.starts_at, minutes: minutesOf(item), timeZone: item.time_zone });
        if (meeting?.joinUrl) item = { ...item, meeting_link: meeting.joinUrl, meeting_id: meeting.id };
      } else if (wantsZoom && item.meeting_id) {
        await zoom.updateMeeting(item.meeting_id, { topic: item.title, startsAt: item.starts_at, minutes: minutesOf(item), timeZone: item.time_zone });
      }
      const event = item === push.item ? push.event : { ...googleEventFrom(item, { guests }), ...(push.event.status === 'cancelled' ? { status: 'cancelled' } : {}) };
      const answer = push.op === 'create' ? await google.createEvent(event) : await google.updateEvent(item.google_event_id, event);
      put(T.items, afterPush(item, answer?.id ? answer : { id: item.google_event_id, etag: answer?.etag }, now, guests));
      out.pushed += 1;
    }
  } catch {
    // Whatever was done before the service stopped answering is kept; the rest goes on the next round.
    out.problem = SYNC_WORDS.problem;
  }
  out.save = [...saved.values()];
  return out;
}

/**
 * One round with Zoom alone, for a coach whose Zoom is connected and whose
 * Google Calendar isn't: every call on Zoom without a link gets a meeting,
 * made in the call's own time zone (the client's), and a call that moved
 * takes its meeting with it. It saves nothing itself.
 * @param {object} a
 * @param {object} a.zoom the Zoom adapter (real or stand-in)   @param {object[]} a.items
 * @param {{ meeting_id?: string }[]} [a.removed] items deleted here since the last round
 * @param {object} [a.sent] what each meeting was last told ({ meeting id: mark }), from the last round
 * @returns {Promise<{ save: [string, object][], remove: [], sent: object, pushed: number, problem: string|null }>}
 */
export async function zoomOnce({ zoom, items = [], removed = [], sent = {} }) {
  const out = { save: [], remove: [], sent: { ...sent }, pushed: 0, problem: null };
  try {
    for (const r of removed) if (r.meeting_id) { await zoom.deleteMeeting(r.meeting_id); delete out.sent[r.meeting_id]; }
    const work = zoomWork(items, sent);
    for (const item of work.make) {
      const meeting = await zoom.createMeeting({ topic: item.title, startsAt: item.starts_at, minutes: minutesOf(item), timeZone: item.time_zone });
      if (!meeting?.joinUrl) continue;
      out.save.push([T.items, { ...item, meeting_link: meeting.joinUrl, meeting_id: meeting.id }]);
      out.sent[meeting.id] = work.mark(item);
      out.pushed += 1;
    }
    for (const item of work.move) {
      await zoom.updateMeeting(item.meeting_id, { topic: item.title, startsAt: item.starts_at, minutes: minutesOf(item), timeZone: item.time_zone });
      out.sent[item.meeting_id] = work.mark(item);
      out.pushed += 1;
    }
    // A meeting this device has never been told about is noted as it stands, so its next move is seen.
    for (const item of items) if (item.meeting_id && out.sent[item.meeting_id] === undefined) out.sent[item.meeting_id] = work.mark(item);
  } catch {
    out.problem = SYNC_WORDS.zoomProblem;
  }
  return out;
}
