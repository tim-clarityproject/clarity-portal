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

/** The stand-in account's calendars to start with: the main one (Work), then Personal and Family (run 8). */
export const STAND_IN_CALENDARS = Object.freeze([
  Object.freeze({ id: 'primary', summary: 'Work', primary: true }),
  Object.freeze({ id: 'personal.standin@group.calendar.example', summary: 'Personal' }),
  Object.freeze({ id: 'family.standin@group.calendar.example', summary: 'Family' }),
]);

/**
 * A Google calendar kept on the device.
 * @param {{ now?: () => Date, keep?: { read: () => object|null, write: (state: object) => void } }} [o]
 *   `keep`: where its state lives between page loads (left out: in memory only).
 */
export function googleStandIn({ now = () => new Date(), keep = null } = {}) {
  const kept = keep?.read?.();
  const state = kept && typeof kept === 'object' && kept.events ? kept : { rev: 0, next: 1, events: {}, sent: [] };
  // Run 8: the account's other calendars, as Google lists them, and their events. The portal only ever READS these:
  // the adapter has no way to write to them, and every call it is asked is noted (`asked`), so a test can see that.
  if (!Array.isArray(state.calendars)) state.calendars = STAND_IN_CALENDARS.map((c) => ({ ...c }));
  if (!state.other || typeof state.other !== 'object') state.other = {};
  if (!Array.isArray(state.asked)) state.asked = [];
  // Kept with the rest (between page loads too), so a test reading the calendar afresh sees every call made.
  const ask = (what, calendarId = 'primary') => { state.asked.push({ what, calendarId }); if (state.asked.length > 500) state.asked.splice(0, state.asked.length - 500); save(); };
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
      ask('list');
      const since = /^\d+$/.test(String(syncToken ?? '')) && Number(syncToken) <= state.rev ? Number(syncToken) : null;
      const events = Object.values(state.events).filter((e) => (since == null ? e.status !== 'cancelled' : e.rev > since)).sort((a, b) => a.rev - b.rev)
        .map((e) => (e.status === 'cancelled' ? { id: e.id, status: 'cancelled', updated: e.updated, etag: e.etag, extendedProperties: clone(e.extendedProperties) } : out(e)));
      return { events, syncToken: String(state.rev) };
    },
    /** Makes an event; its guests are invited (with the Zoom link when it has one) unless `invite` is false. */
    async createEvent(event, { invite = true } = {}) {
      ask('create');
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
      ask('update');
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
      ask('delete');
      const was = state.events[id];
      if (!was || was.status === 'cancelled') return;
      stamp(Object.assign(was, { status: 'cancelled' }), 'portal');
      note('cancel', was, invite);
      save();
    },
    /** Run 8: every calendar on the account, as Google's calendar list gives it: { id, summary, primary }. Read only. */
    async listCalendars() {
      ask('calendars');
      return state.calendars.map((c) => ({ id: c.id, summary: c.summary, ...(c.primary ? { primary: true } : {}) }));
    },
    /**
     * Run 8: one other calendar's events between two instants, each repeat one time at a time (as Google's
     * singleEvents=true). Read only: nothing here changes a calendar.
     */
    async listBusy({ calendarId, timeMin, timeMax } = {}) {
      ask('busy', calendarId);
      const cal = state.calendars.find((c) => c.id === calendarId);
      if (!cal) { const err = new Error('That calendar isn’t there.'); err.code = 'not_found'; throw err; }
      const a = new Date(timeMin).getTime();
      const z = new Date(timeMax).getTime();
      const at = (side) => new Date(side?.dateTime || `${side?.date}T00:00:00Z`).getTime();
      return Object.values(state.other[calendarId] || {}).filter((e) => (!Number.isFinite(a) || at(e.end) > a) && (!Number.isFinite(z) || at(e.start) < z)).map(clone);
    },
    /** Every call the portal made, for a test to read: [{ what: 'list'|'create'|'update'|'delete'|'calendars'|'busy', calendarId }]. */
    asked: () => clone(state.asked),
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
      /** Run 8: an event made in one of the account's other calendars (Personal, Family, or one added below). */
      addTo(calendarId, event) {
        if (!state.calendars.some((c) => c.id === calendarId)) throw new Error('That calendar isn’t there.');
        const id = `${String(calendarId).split('@')[0]}-${state.next}`;
        state.next += 1;
        state.other[calendarId] = { ...(state.other[calendarId] || {}), [id]: { status: 'confirmed', ...clone(event), id } };
        save();
        return clone(state.other[calendarId][id]);
      },
      /** Run 8: changes or deletes (patch null) an event in one of the other calendars. */
      editIn(calendarId, id, patch) {
        const events = state.other[calendarId] || {};
        if (!events[id]) throw new Error('That event isn’t there.');
        if (patch === null) delete events[id]; else events[id] = { ...events[id], ...clone(patch), id };
        save();
      },
      /** Run 8: a calendar added to the account, or (remove) taken off it. */
      addCalendar(summary) {
        const id = `${String(summary).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.standin${state.next}@group.calendar.example`;
        state.next += 1;
        state.calendars.push({ id, summary: String(summary) });
        save();
        return id;
      },
      removeCalendar(id) {
        state.calendars = state.calendars.filter((c) => c.id !== id || c.primary);
        delete state.other[id];
        save();
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

// ---------------------------------------------------------------- email (Phase 6a run 4)
//
// Stand-ins for the copy-in address and for Gmail. Until Tim adds the keys
// (and never on the live site), emails "arrive" through these: they start
// EMPTY, hold only what a test or a tester hands them, and never talk to
// anything outside the device. Nothing is ever sent, and neither has any
// way to send. An email they hand over is invented.

/** The inbound domain the stand-in's addresses use (a name that can never receive real email). */
export const STAND_IN_DOMAIN = 'in.example.invalid';

/**
 * The copy-in address, stood in. `arrive` makes an email turn up as the
 * inbound-email service would post it (the same webhook shape the server
 * reads), and `handOver` gives the waiting ones to whoever logs them.
 * @param {{ now?: () => Date, keep?: { read: () => object|null, write: (state: object) => void }, domain?: string }} [o]
 */
export function copyInStandIn({ now = () => new Date(), keep = null, domain = STAND_IN_DOMAIN } = {}) {
  const kept = keep?.read?.();
  const state = kept && typeof kept === 'object' && Array.isArray(kept.waiting) ? kept : { next: 1, waiting: [] };
  const save = () => { try { keep?.write?.(state); } catch { /* carries on in memory */ } };
  return {
    service: 'copy_in_email',
    real: false,
    async status() { return { ready: true, domain }; },
    async addresses(keys) {
      const k = Array.isArray(keys) ? { log: keys.find((x) => x.kind === 'log')?.key || '', todo: keys.find((x) => x.kind === 'todo')?.key || '' } : { log: keys?.log || '', todo: keys?.todo || '' };
      return { log: k.log ? `${k.log}@${domain}` : '', todo: k.todo ? `${k.todo}@${domain}` : '' };
    },
    /**
     * An invented email arrives at one of the owner's addresses: copied in
     * (bcc) to the log address, or forwarded to the to-do address.
     * @param {string} key the address's key ("log.alex.7kx2m4qa")
     * @param {{ from: { name?: string, email: string }, to?: object[], cc?: object[], subject?: string, text?: string, date?: string, message_id?: string, in_reply_to?: string }} email
     * @returns {object} the webhook's payload, as the inbound-email service would post it
     */
    arrive(key, email) {
      const id = email.message_id || `standin-${state.next}@${domain}`;
      state.next += 1;
      const payload = clone({ from: email.from, to: email.to || [], cc: email.cc || [], bcc: [{ email: `${key}@${domain}` }], recipient: `${key}@${domain}`, subject: email.subject || '', text: email.text || '',
        date: email.date || now().toISOString(), message_id: id, in_reply_to: email.in_reply_to || null });
      state.waiting.push(payload);
      save();
      return payload;
    },
    /** The payloads waiting, handed over once (the stand-in then holds none). */
    handOver() { const out = clone(state.waiting); state.waiting = []; save(); return out; },
    waiting: () => clone(state.waiting),
  };
}

/**
 * A Gmail kept on the device: READ ONLY for the portal, exactly as the real
 * adapter is. `inGmail` is the test hook: an email received or sent "in
 * Gmail", by hand. listMessages hands back what is new since the cursor.
 * @param {{ now?: () => Date, keep?: object, me?: { name?: string, email: string } }} [o] `me`: the owner's own invented address
 */
export function gmailStandIn({ now = () => new Date(), keep = null, me = { name: 'Alex Morgan', email: 'alex@example.invalid' } } = {}) {
  const kept = keep?.read?.();
  const state = kept && typeof kept === 'object' && Array.isArray(kept.emails) ? kept : { next: 1, emails: [] };
  const save = () => { try { keep?.write?.(state); } catch { /* carries on in memory */ } };
  const add = (direction, email) => {
    const n = state.next;
    state.next += 1;
    const other = direction === 'in' ? email.from : (email.to || [])[0];
    const thread = email.thread_key || `thread-${String(email.subject || '').replace(/^((re|fwd?)\s*:\s*)+/i, '').toLowerCase()}-${String(other?.email || '').toLowerCase()}`;
    const made = { n, external_id: `gmail-standin-${n}`, source: 'gmail', direction, from: direction === 'in' ? clone(email.from) : clone(me), to: direction === 'in' ? [clone(me)] : clone(email.to || []), cc: clone(email.cc || []),
      subject: email.subject || '', snippet: String(email.text || '').replace(/\s+/g, ' ').trim().slice(0, 300), body: email.text || '', sent_at: email.sent_at || now().toISOString(), thread_key: thread,
      link: `https://mail.example/mail/u/0/#all/standin${n}` };
    state.emails.push(made);
    save();
    return clone(made);
  };
  return {
    service: 'gmail',
    real: false,
    /** What arrived or was sent since the cursor (everything, the first time or when the cursor isn't one of ours), and the cursor for next time. */
    async listMessages({ cursor = null } = {}) {
      const since = /^\d+$/.test(String(cursor ?? '')) && Number(cursor) < state.next ? Number(cursor) : 0;
      const emails = state.emails.filter((e) => e.n > since).sort((a, b) => a.n - b.n).map(({ n: _n, ...rest }) => clone(rest));
      return { emails, cursor: String(state.next - 1) };
    },
    /** The test hook: emails that come and go "in Gmail". The portal itself can never do either. */
    inGmail: {
      /** Someone emails the owner. */
      receive(email) { return add('in', email); },
      /** The owner emails someone, from Gmail itself. */
      send(email) { return add('out', email); },
    },
    emails: () => state.emails.map(({ n: _n, ...rest }) => clone(rest)),
  };
}
