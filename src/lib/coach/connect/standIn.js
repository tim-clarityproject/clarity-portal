// Stand-ins for Google Calendar and Zoom (Phase 6a run 3). Until Tim adds
// the keys, the calendar syncs with these: they behave like the services
// (events kept, a tag that changes with every change, changes handed back
// since a sync token, deleted events handed back as cancelled, invites that
// "go" to an event's guests, a join link for every meeting) and never talk
// to anything outside the device. Nothing is ever sent: an invite is only
// noted, so a test can see who would have got it and with which link.
//
// A test (or a tester in the browser, on a build that isn't live) can
// change the calendar "in Google" through `inGoogle`: move an event there,
// delete one, add one, or answer for a guest. The next sync reads it back.

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const emailsOf = (event) => (event?.attendees || []).map((a) => String(a.email || '').toLowerCase()).filter(Boolean);
const linkOf = (event) => (/^https:\/\//.test(String(event?.location || '')) ? event.location : null);

/**
 * A Google calendar kept on the device.
 * @param {{ now?: () => Date, keep?: { read: () => object|null, write: (state: object) => void } }} [o]
 *   `keep`: where its state lives between page loads (left out: in memory only).
 */
export function googleStandIn({ now = () => new Date(), keep = null } = {}) {
  const kept = keep?.read?.();
  const state = kept && typeof kept === 'object' && kept.events ? kept : { rev: 0, next: 1, events: {}, sent: [] };
  const save = () => { try { keep?.write?.(state); } catch { /* the device is full: the stand-in carries on in memory */ } };
  const stamp = (event, by) => {
    state.rev += 1;
    Object.assign(event, { etag: `"s${state.rev}"`, updated: now().toISOString(), rev: state.rev, changedBy: by });
    return event;
  };
  const out = (event) => { const { rev: _rev, changedBy: _by, ...rest } = clone(event); return rest; };
  const note = (kind, event, invite) => { if (invite && emailsOf(event).length) state.sent.push({ kind, eventId: event.id, to: emailsOf(event), link: linkOf(event), at: now().toISOString() }); };
  const must = (id) => { const e = state.events[id]; if (!e || e.status === 'cancelled') { const err = new Error('That event isn’t in the calendar.'); err.code = 'not_found'; throw err; } return e; };

  const adapter = {
    service: 'google_calendar',
    real: false,
    /** The changes since a sync token (everything, the first time or when the token isn't one of ours), and the token for next time. */
    async listChanges({ syncToken = null } = {}) {
      const since = /^\d+$/.test(String(syncToken ?? '')) && Number(syncToken) <= state.rev ? Number(syncToken) : null;
      const events = Object.values(state.events).filter((e) => (since == null ? e.status !== 'cancelled' : e.rev > since)).sort((a, b) => a.rev - b.rev)
        .map((e) => (e.status === 'cancelled' ? { id: e.id, status: 'cancelled', updated: e.updated, etag: e.etag, extendedProperties: clone(e.extendedProperties) } : out(e)));
      return { events, syncToken: String(state.rev) };
    },
    /** Makes an event; its guests are invited (with the Zoom link when it has one) unless `invite` is false. */
    async createEvent(event, { invite = true } = {}) {
      const id = `standin${state.next}`;
      state.next += 1;
      const made = stamp({ status: 'confirmed', ...clone(event), id, attendees: (event.attendees || []).map((a) => ({ responseStatus: 'needsAction', ...a })) }, 'portal');
      state.events[id] = made;
      note('invite', made, invite);
      save();
      return out(made);
    },
    /** Changes an event; its guests get the update. A guest's reply is kept unless the time moved. */
    async updateEvent(id, event, { invite = true } = {}) {
      const was = must(id);
      const moved = JSON.stringify(was.start) !== JSON.stringify(event.start ?? was.start) || JSON.stringify(was.end) !== JSON.stringify(event.end ?? was.end);
      const replies = Object.fromEntries((was.attendees || []).map((a) => [String(a.email).toLowerCase(), a.responseStatus]));
      const next = { ...was, ...clone(event), id };
      next.attendees = (next.attendees || []).map((a) => ({ ...a, responseStatus: moved ? 'needsAction' : (a.responseStatus || replies[String(a.email).toLowerCase()] || 'needsAction') }));
      if (event.status === 'cancelled') { stamp(Object.assign(was, { status: 'cancelled' }), 'portal'); note('cancel', was, invite); save(); return { id, status: 'cancelled' }; }
      state.events[id] = stamp(next, 'portal');
      note('update', next, invite);
      save();
      return out(next);
    },
    /** Deletes an event; its guests are told. Deleting one that has already gone is no error. */
    async deleteEvent(id, { invite = true } = {}) {
      const was = state.events[id];
      if (!was || was.status === 'cancelled') return;
      stamp(Object.assign(was, { status: 'cancelled' }), 'portal');
      note('cancel', was, invite);
      save();
    },
    /** What would have been sent, for a test to read: [{ kind: 'invite'|'update'|'cancel', eventId, to, link }]. Nothing ever is. */
    sent: () => clone(state.sent),
    /** Every event the calendar holds now. */
    events: () => Object.values(state.events).filter((e) => e.status !== 'cancelled').map(out),
    /** The test hook: changes made "in Google", by hand. */
    inGoogle: {
      /** Moves an event to a new start and end ({ dateTime, timeZone? } or instants). */
      move(id, start, end) {
        const e = must(id);
        const side = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? clone(v) : { dateTime: new Date(v).toISOString() });
        stamp(Object.assign(e, { start: side(start), end: side(end) }), 'google');
        save();
        return out(e);
      },
      /** Changes anything else about an event (its title, its place). */
      edit(id, patch) { const e = must(id); stamp(Object.assign(e, clone(patch)), 'google'); save(); return out(e); },
      /** Deletes an event there. */
      remove(id) { const e = must(id); stamp(Object.assign(e, { status: 'cancelled' }), 'google'); save(); },
      /** Makes an event there that the portal has never seen. */
      add(event) {
        const id = `google${state.next}`;
        state.next += 1;
        state.events[id] = stamp({ status: 'confirmed', ...clone(event), id }, 'google');
        save();
        return out(state.events[id]);
      },
      /** A guest answers: 'accepted', 'declined' or 'tentative'. */
      reply(id, email, responseStatus) {
        const e = must(id);
        e.attendees = (e.attendees || []).map((a) => (String(a.email).toLowerCase() === String(email).toLowerCase() ? { ...a, responseStatus } : a));
        stamp(e, 'google');
        save();
        return out(e);
      },
    },
  };
  return adapter;
}

/**
 * A Zoom kept on the device: every meeting gets a made-up join link
 * (https://zoom.example/j/…), keeps the time zone it was made in, and can
 * be moved or deleted. No meeting is ever really made.
 */
export function zoomStandIn({ keep = null } = {}) {
  const kept = keep?.read?.();
  const state = kept && typeof kept === 'object' && kept.meetings ? kept : { next: 4100000001, meetings: {} };
  const save = () => { try { keep?.write?.(state); } catch { /* carries on in memory */ } };
  const tidy = ({ topic = 'Call', startsAt, minutes = 60, timeZone }) => {
    const at = new Date(startsAt);
    if (Number.isNaN(at.getTime())) throw new Error('A meeting has a start.');
    if (typeof timeZone !== 'string' || !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(timeZone)) throw new Error('A meeting is made in a time zone, by its place name.');
    return { topic: String(topic).slice(0, 200), startsAt: at.toISOString(), minutes: Math.max(15, Number(minutes) || 60), timeZone };
  };
  return {
    service: 'zoom',
    real: false,
    /** Makes a meeting in a time zone (the client's own) and returns its join link. */
    async createMeeting(meeting) {
      const id = String(state.next);
      state.next += 1;
      state.meetings[id] = { id, joinUrl: `https://zoom.example/j/${id}`, ...tidy(meeting) };
      save();
      return clone(state.meetings[id]);
    },
    /** Moves or renames a meeting; its link stays the same. */
    async updateMeeting(id, meeting) {
      const was = state.meetings[id];
      if (!was) { const err = new Error('That meeting isn’t there.'); err.code = 'not_found'; throw err; }
      state.meetings[id] = { ...was, ...tidy({ ...was, ...meeting }) };
      save();
      return clone(state.meetings[id]);
    },
    /** Deletes a meeting; one that has already gone is no error. */
    async deleteMeeting(id) { delete state.meetings[id]; save(); },
    meetings: () => Object.values(state.meetings).map(clone),
  };
}

/** Somewhere in this tab to keep a stand-in between page loads (never the live site's concern: stand-ins hold nothing real). */
export function tabKeep(key) {
  return {
    read() { try { return JSON.parse(window.sessionStorage.getItem(key) || 'null'); } catch { return null; } },
    write(state) { try { window.sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* full or blocked */ } },
  };
}
