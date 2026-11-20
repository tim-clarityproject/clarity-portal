// Migration 051 (the calendar and booking), as a stand-in for the coach
// portal's browser tests (Phase 6a run 3). `standIn(page, { db: 'there',
// day: true, cal: true })` in shared.mjs holds 051's tables and answers its
// rules, triggers and functions as the SQL does
// (supabase/migrations/051_coach_calendar.sql): who reads what, the shape
// checks, a moved item taking its session and booking with it, the free
// times worked out from the open blocks or the weekly hours less anything
// busy, and a booking that refuses a start someone else has just taken.
// Who may read what in the real database is proved by the SQL test
// (supabase/051_coach_calendar_test.sql), never by this.
import { randomUUID } from 'node:crypto';
import { addDays, daysBetween, instantAt, wallClock, weekdayOf } from '../../src/lib/time/instants.js';

export const CAL_TABLES = ['coach_call_types', 'coach_polls', 'coach_poll_people', 'coach_poll_options', 'coach_poll_votes', 'coach_booking_links',
  'coach_leads', 'coach_cal_items', 'coach_cal_guests', 'coach_open_blocks', 'coach_bookings', 'coach_cal_reminder_sends'];
export const CAL_KEYS = { coach_poll_votes: ['option_id', 'person_id'] };
/** 051's functions: answered by the stand-in with `cal`, and as "no such function" without it (the test project is never asked). */
export const CAL_FUNCTIONS = ['booking_page', 'booking_free_times', 'booking_make', 'booking_mine', 'booking_move_times', 'booking_move', 'booking_cancel',
  'poll_page', 'poll_vote', 'my_booking_times', 'my_sessions_coming', 'my_session_book', 'my_session_move', 'my_session_cancel',
  'coach_call_types_start', 'coach_connections_mine', 'cal_reminders_coming', 'cal_reminder_claim'];

const MIN = 60000;
const HOUR = 3600000;
const DAY_MS = 86400000;
const CALL_KINDS = ['client_call', 'chemistry', 'connection'];
const ITEM_KINDS = [...CALL_KINDS, 'own_time', 'admin', 'writing', 'event', 'travel', 'other', 'hold'];
const PLACES = ['zoom', 'in_person', 'phone'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_HOURS = Object.fromEntries(DAY_KEYS.slice(0, 5).map((d) => [d, { from: '09:00', to: '17:00' }]));
const ms = (v) => new Date(v).getTime();
const iso = (t) => new Date(t).toISOString();
const lengthOf = (v) => [...String(v ?? '')].length;
const named = (v, min, max) => { const n = lengthOf(String(v ?? '').trim()); return n >= min && n <= max; };
const quarter = (v) => { const d = new Date(v); return d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0; };
/** zone_is_real(): a place name this computer knows; never an offset or letters. */
export function zoneIsReal(zone) {
  if (typeof zone !== 'string' || !(zone === 'UTC' || /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2}$/.test(zone))) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); return true; } catch { return false; }
}
const emailOk = (e) => typeof e === 'string' && e.length >= 3 && e.length <= 254 && e === e.toLowerCase() && /^[^@\s,;<>()[\]\\":]+@[^@\s,;<>()[\]\\":]+\.[^@\s,;<>()[\]\\":]+$/.test(e);

// ---------------------------------------------------------------- a repeat's rule, worked out (the SQL's _cal_occurrences)
const dow = (day) => weekdayOf(day) % 7; // 0 Sunday to 6 Saturday, as the rule's weekdays
const mondayOf = (day) => addDays(day, 1 - weekdayOf(day));
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** coach_cal_repeat_ok(): 050's rule plus "by" (monthly) and "count". */
export function repeatOk(rule) {
  if (rule == null) return true;
  if (typeof rule !== 'object' || Array.isArray(rule) || !['day', 'weekday', 'week', 'month', 'year'].includes(rule.every)) return false;
  if ('interval' in rule && !(Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 52)) return false;
  if ('weekdays' in rule && !(Array.isArray(rule.weekdays) && rule.weekdays.length <= 7 && rule.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return false;
  if ('until' in rule && !(typeof rule.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rule.until))) return false;
  if ('by' in rule && !(['date', 'weekday'].includes(rule.by) && rule.every === 'month')) return false;
  if ('count' in rule && !(Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 730)) return false;
  return true;
}

/** The days a rule falls on from its first day `d0`, between two day keys. */
export function ruleDays(rule, d0, fromDay, toDay) {
  const n = Math.max(1, Number(rule.interval) || 1);
  const [y0, m0, dd0] = d0.split('-').map(Number);
  const start = rule.count ? d0 : (fromDay > d0 ? fromDay : d0);
  const end = rule.until && rule.until < toDay ? rule.until : toDay;
  const out = [];
  let nth = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const [y, m, dd] = d.split('-').map(Number);
    let ok = false;
    if (rule.every === 'day') ok = daysBetween(d0, d) % n === 0;
    else if (rule.every === 'weekday') ok = weekdayOf(d) < 6;
    else if (rule.every === 'week') ok = (daysBetween(mondayOf(d0), mondayOf(d)) / 7) % n === 0 && (rule.weekdays?.length ? rule.weekdays.includes(dow(d)) : dow(d) === dow(d0));
    else if (rule.every === 'month') {
      ok = ((y * 12 + m) - (y0 * 12 + m0)) % n === 0 && (rule.by === 'weekday'
        ? dow(d) === dow(d0) && (dd0 > 28 ? addDays(d, 7).slice(5, 7) !== d.slice(5, 7) : Math.ceil(dd / 7) === Math.ceil(dd0 / 7))
        : dd === Math.min(dd0, lastDayOf(y, m)));
    } else if (rule.every === 'year') ok = (y - y0) % n === 0 && m === m0 && dd === Math.min(dd0, lastDayOf(y, m));
    if (!ok) continue;
    nth += 1;
    if (rule.count && nth > rule.count) break;
    out.push(d);
  }
  return out;
}

/** Every time a coach's items fall between two instants: [{ item, starts, ends (ms), busy, isCall, on }]. */
export function occurrences(items, coachId, from, to) {
  const a = ms(from);
  const z = ms(to);
  const out = [];
  for (const i of items) {
    if (i.coach_id !== coachId) continue;
    const s = ms(i.starts_at);
    const e = ms(i.ends_at);
    const isCall = CALL_KINDS.includes(i.kind);
    const busy = i.busy !== false;
    if (!i.repeat_rule) {
      if (!i.removed && s < z && e > a) out.push({ item: i, starts: s, ends: e, busy, isCall, on: i.occurrence_on ?? null });
      continue;
    }
    if (s >= z) continue;
    const first = wallClock(new Date(s), i.time_zone);
    const fromDay = addDays(wallClock(new Date(a), i.time_zone).date, -33);
    const toDay = wallClock(new Date(z), i.time_zone).date;
    for (const d of ruleDays(i.repeat_rule, first.date, fromDay, toDay)) {
      const at = instantAt(d, first.time, i.time_zone).getTime();
      if (!(at < z && at + (e - s) > a)) continue;
      if (items.some((x) => x.series_id === i.id && x.occurrence_on === d)) continue;
      out.push({ item: i, starts: at, ends: at + (e - s), busy, isCall, on: d });
    }
  }
  return out.sort((x, y) => x.starts - y.starts);
}

// ---------------------------------------------------------------- the stand-in
/**
 * @param {{ store: object, ME: string, me: object, clock: () => Date, no: (code: string, message: string, status?: number) => never }} with
 * @returns {{ readable, before, after, remove, fn }}
 */
export function calStandIn({ store, ME, me, clock, no }) {
  const rows = store.rows;
  const now = () => clock().getTime();
  const stamp = () => clock().toISOString();
  const bad = (table, what) => no('23514', `new row for relation "${table}" violates check constraint "${what}"`);
  const denied = (table) => no('42501', `new row violates row-level security policy for table "${table}"`, 403);
  const firstNameOf = (coachId) => store.coaches.find((c) => c.id === coachId)?.display_first_name ?? null;
  const notify = (coachId, title, detail, itemKind, itemId) => rows.coach_notifications.push({ id: randomUUID(), coach_id: coachId, kind: 'booking', title: title.slice(0, 160), detail, item_kind: itemKind, item_id: itemId, created_at: stamp(), read_at: null });
  const settingsOf = (coachId) => rows.coach_settings.find((s) => s.coach_id === coachId) || {};
  const zoneOf = (coachId) => (zoneIsReal(settingsOf(coachId).time_zone) ? settingsOf(coachId).time_zone : 'Europe/London');
  /** _cal_setting(): a Booking limit read as its leading whole number, kept inside its bounds. */
  const setting = (coachId, key, start, low, high) => {
    const m = /^\s*(\d{1,4})/.exec(String(settingsOf(coachId).booking?.[key] ?? ''));
    return Math.min(high, Math.max(low, m ? Number(m[1]) : start));
  };

  /** _cal_free_times(): the starts a coach can be booked at, as instants (ms). */
  function freeTimes({ coach, source, minutes, gapBefore = 15, gapAfter = 15, notice = 24, ahead = 4, dayLimit = 5, from, to, skip = null, type = null }) {
    if (!minutes || minutes < 15) return [];
    const zone = zoneOf(coach);
    const gap = setting(coach, 'gap', 15, 0, 120);
    const before = Math.max(gapBefore ?? 0, gap) * MIN;
    const after = Math.max(gapAfter ?? 0, gap) * MIN;
    const limit = Math.min(dayLimit ?? 5, setting(coach, 'per_day', 5, 1, 20));
    const len = minutes * MIN;
    const lo = Math.ceil(Math.max(ms(from), now() + notice * HOUR) / (15 * MIN)) * 15 * MIN;
    const hi = Math.min(ms(to), now() + ahead * 7 * DAY_MS, lo + 45 * DAY_MS);
    if (hi < lo + len) return [];
    const windows = [];
    if (source === 'open') {
      for (const b of rows.coach_open_blocks) if (b.coach_id === coach && ms(b.starts_at) < hi && ms(b.ends_at) > lo && (b.call_type_id == null || b.call_type_id === type)) windows.push([ms(b.starts_at), ms(b.ends_at)]);
    } else {
      const s = settingsOf(coach);
      const filled = (h) => h && typeof h === 'object' && Object.keys(h).length > 0;
      const hours = filled(s.booking_hours) ? s.booking_hours : filled(s.working_hours) ? s.working_hours : DEFAULT_HOURS;
      const clockOk = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      for (let d = wallClock(new Date(lo), zone).date; d <= wallClock(new Date(hi), zone).date; d = addDays(d, 1)) {
        const h = hours[DAY_KEYS[weekdayOf(d) - 1]];
        if (h && clockOk(h.from) && clockOk(h.to)) windows.push([instantAt(d, h.from, zone).getTime(), instantAt(d, h.to, zone).getTime()]);
      }
    }
    const busy = occurrences(rows.coach_cal_items, coach, lo - DAY_MS, hi + DAY_MS).filter((o) => o.busy && o.item.id !== skip);
    const calls = {};
    for (const o of busy) if (o.isCall) { const d = wallClock(new Date(o.starts), zone).date; calls[d] = (calls[d] || 0) + 1; }
    const away = rows.coach_away.filter((x) => x.coach_id === coach);
    const out = [];
    for (let s = lo; s <= hi - len; s += 15 * MIN) {
      if (!windows.some(([a, z]) => s >= a && s + len <= z)) continue;
      if (busy.some((o) => (o.isCall ? o.starts < s + len + after && o.ends > s - before : o.starts < s + len && o.ends > s))) continue;
      const d = wallClock(new Date(s), zone).date;
      if ((calls[d] || 0) >= limit) continue;
      if (away.some((x) => d >= x.starts_on && d <= x.ends_on)) continue;
      out.push(s);
    }
    return out;
  }

  /** _booking_target(): what a key opens, a call type's page or a single-use link. */
  function target(key) {
    if (!key) return null;
    const active = (coachId) => store.coaches.find((c) => c.id === coachId)?.active !== false;
    const t = rows.coach_call_types.find((x) => x.page_key === key);
    if (t) {
      return { target: 'page', coach: t.coach_id, type: t.id, typeKey: t.key, name: t.name, description: t.description ?? null, minutes: t.minutes ?? 30, gapBefore: t.gap_before ?? 15, gapAfter: t.gap_after ?? 15,
        notice: t.notice_hours ?? 24, ahead: t.ahead_weeks ?? 4, dayLimit: t.day_limit ?? 5, questions: t.questions ?? [], place: t.place_kind ?? 'zoom', source: 'open', makesLead: t.makes_lead !== false,
        state: t.active !== false && active(t.coach_id) ? 'open' : 'closed' };
    }
    const l = rows.coach_booking_links.find((x) => x.key === key);
    if (l) {
      const today = wallClock(clock(), zoneOf(l.coach_id)).date;
      return { target: 'link', coach: l.coach_id, link: l.id, profile: l.profile_id ?? null, name: String(l.call_name ?? '').trim() || l.purpose, forName: l.for_name ?? null, minutes: l.minutes ?? 30, gapBefore: 15, gapAfter: 15,
        notice: l.notice_hours ?? 24, ahead: l.ahead_weeks ?? 4, dayLimit: 5, questions: [], place: l.place_kind ?? 'zoom', source: l.profile_id ? 'hours' : 'open', makesLead: !l.profile_id,
        state: l.revoked_at || !active(l.coach_id) ? 'closed' : l.used_at ? 'used' : l.expires_on && l.expires_on < today ? 'expired' : 'open' };
    }
    return null;
  }
  const timesFor = (t, from, to, skip = null) => freeTimes({ coach: t.coach, source: t.source, minutes: t.minutes, gapBefore: t.gapBefore, gapAfter: t.gapAfter, notice: t.notice, ahead: t.ahead, dayLimit: t.dayLimit, from, to, skip, type: t.type ?? null });
  /** _cal_sociable(): the whole call inside 07:00 to 20:00 in a zone. */
  const sociable = (start, minutes, zone) => {
    const a = wallClock(new Date(start), zone);
    const z = wallClock(new Date(ms(start) + minutes * MIN), zone);
    return a.time >= '07:00' && a.date === z.date && z.time <= '20:00';
  };
  const onQuarter = (start, zone) => start != null && !Number.isNaN(ms(start)) && wallClock(new Date(start), zone).minute % 15 === 0 && new Date(start).getUTCSeconds() === 0;
  const item = (extra) => ({ id: randomUUID(), coach_id: ME, kind: 'other', calendar: 'work', all_day: false, starts_on: null, ends_on: null, repeat_rule: null, series_id: null, occurrence_on: null, removed: false, split_from: null,
    location: null, place_kind: null, meeting_link: null, meeting_id: null, notes: null, attachments: [], reminders: [], busy: true, private: false, profile_id: null, group_id: null, session_id: null, poll_option_id: null,
    travel_for: null, google_event_id: null, google_calendar_id: null, google_etag: null, google_synced_at: null, moved_in_google_at: null, created_at: stamp(), updated_at: stamp(), ...extra });
  const session = (extra) => ({ id: randomUUID(), group_id: null, kind: 'coaching', place: null, outcome: null, waived: false, moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null, recap_emailed_at: null, created_at: stamp(), updated_at: stamp(), ...extra });
  const booking = (extra) => ({ id: randomUUID(), call_type_id: null, link_id: null, item_id: null, session_id: null, profile_id: null, lead_id: null, email: null, answers: {}, status: 'booked', source: 'page', guest_key: randomUUID(),
    moved_from: null, moved_at: null, cancelled_at: null, late_cancel: false, moved_in_google_at: null, created_at: stamp(), updated_at: stamp(), ...extra });
  const bookingByKey = (key) => rows.coach_bookings.find((b) => b.guest_key === key && ['page', 'link'].includes(b.source)) || null;
  const minutesOf = (b) => Math.round((ms(b.ends_at) - ms(b.starts_at)) / MIN);
  /** The session's engagement count follows, when the day's stand-in keeps one (050's trigger). */
  const recount = (engagementId) => { if (typeof store.recount === 'function') store.recount(engagementId); };
  /** _my_coaching(): the signed-in client's own profile with their coach. */
  const myCoaching = (uid) => {
    const p = rows.client_profiles.find((x) => uid && x.user_id === uid && !x.merged_into && x.status !== 'past');
    if (!p || store.coaches.find((c) => c.id === p.coach_id)?.active === false) return null;
    const e = rows.engagements.filter((x) => x.profile_id === p.id && x.coach_id === p.coach_id && x.status === 'active').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    return { profile: p.id, coach: p.coach_id, name: p.name, zone: zoneIsReal(p.time_zone) ? p.time_zone : zoneOf(p.coach_id), engagement: e?.id ?? null,
      minutes: [30, 60, 90].includes(e?.default_minutes) ? e.default_minutes : 60, total: e?.sessions_total ?? null, held: e?.sessions_held ?? 0 };
  };
  const clientTimes = (m, minutes, from, to, skip = null) => freeTimes({ coach: m.coach, source: 'hours', minutes, notice: setting(m.coach, 'notice', 24, 0, 720), ahead: setting(m.coach, 'ahead', 4, 1, 12), from, to, skip });

  const fn = {
    /** booking_page(p_key): its own call only; nothing for a key nobody has. */
    booking_page(uid, key) {
      const t = target(key);
      if (!t) return null;
      return { state: t.state, kind: t.target, name: t.name, description: t.description ?? null, coach_first_name: firstNameOf(t.coach), coach_time_zone: zoneOf(t.coach), minutes: t.minutes, place_kind: t.place,
        questions: t.questions, notice_hours: t.notice, ahead_weeks: t.ahead, for_name: t.forName ?? null };
    },
    /** booking_free_times(p_key, p_from, p_to): the free starts, one row each. */
    booking_free_times(uid, key, from, to) {
      const t = target(key);
      if (!t || t.state !== 'open') return [];
      return timesFor(t, from, to).map((s) => ({ starts_at: iso(s) }));
    },
    /** booking_make(...): everything checked again at the moment of booking; a start someone else has just taken is 'taken'. */
    booking_make(uid, key, start, name, email, zone, answers = {}, earlyLate = false) {
      const t = target(key);
      if (!t) return { status: 'not_found' };
      if (t.state !== 'open') return { status: t.state };
      const who = String(name ?? '').trim();
      const mail = String(email ?? '').trim().toLowerCase();
      if (!named(who, 1, 120)) return { status: 'name' };
      if (!emailOk(mail)) return { status: 'email' };
      if (!zoneIsReal(zone)) return { status: 'zone' };
      if (!(answers && typeof answers === 'object' && !Array.isArray(answers)) || JSON.stringify(answers).length > 20000) return { status: 'too_long' };
      if (!onQuarter(start, zone)) return { status: 'quarter' };
      if (!earlyLate && !sociable(start, t.minutes, zone)) return { status: 'hours' };
      const s = ms(start);
      const e = s + t.minutes * MIN;
      if (rows.coach_bookings.filter((b) => b.coach_id === t.coach && b.status === 'booked' && String(b.email ?? '').toLowerCase() === mail && ms(b.starts_at) > now()).length >= 3) return { status: 'too_many' };
      if (rows.coach_bookings.filter((b) => b.coach_id === t.coach && ['page', 'link'].includes(b.source) && ms(b.created_at) > now() - DAY_MS).length >= 30) return { status: 'full' };
      if (!timesFor(t, s, e).includes(s)) return { status: 'taken' };
      // The table's own lock: two bookings never hold the same start for one coach.
      if (rows.coach_bookings.some((b) => b.coach_id === t.coach && b.status === 'booked' && ms(b.starts_at) === s)) return { status: 'taken' };
      const kind = t.profile ? 'client_call' : t.typeKey === 'chemistry' ? 'chemistry' : t.typeKey === 'connection' ? 'connection' : 'other';
      let sessionId = null;
      if (t.profile && [30, 60, 90].includes(t.minutes) && rows.coach_sessions) {
        const eng = rows.engagements.filter((x) => x.profile_id === t.profile && x.coach_id === t.coach && x.status === 'active').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        const row = session({ coach_id: t.coach, profile_id: t.profile, engagement_id: eng?.id ?? null, starts_at: iso(s), minutes: t.minutes });
        rows.coach_sessions.push(row);
        sessionId = row.id;
      }
      const it = item({ coach_id: t.coach, kind, title: who, starts_at: iso(s), ends_at: iso(e), time_zone: zone, place_kind: t.place, profile_id: t.profile ?? null, session_id: sessionId });
      rows.coach_cal_items.push(it);
      const b = booking({ coach_id: t.coach, call_type_id: t.type ?? null, link_id: t.link ?? null, item_id: it.id, session_id: sessionId, profile_id: t.profile ?? null, name: who, email: mail, time_zone: zone,
        starts_at: iso(s), ends_at: iso(e), answers, source: t.target === 'link' ? 'link' : 'page' });
      if (t.makesLead) {
        let lead = rows.coach_leads.filter((l) => l.coach_id === t.coach && String(l.email ?? '').toLowerCase() === mail).sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))[0];
        if (lead) lead.booking_id = b.id;
        else {
          lead = { id: randomUUID(), coach_id: t.coach, name: who, email: mail, source: t.target === 'link' ? 'single_use_link' : t.typeKey === 'chemistry' ? 'chemistry_page' : t.typeKey === 'connection' ? 'connection_page' : 'booking_page',
            call_type_key: t.typeKey ?? null, booking_id: b.id, time_zone: zone, answers, status: 'new', notes: null, created_at: stamp(), updated_at: stamp() };
          rows.coach_leads.push(lead);
        }
        b.lead_id = lead.id;
      }
      rows.coach_bookings.push(b);
      if (t.target === 'link') Object.assign(rows.coach_booking_links.find((l) => l.id === t.link), { used_at: stamp(), booking_id: b.id });
      notify(t.coach, `${who} booked ${t.name}`, null, 'booking', b.id);
      return { status: 'booked', guest_key: b.guest_key, starts_at: iso(s), ends_at: iso(e), time_zone: zone };
    },
    /** booking_mine(p_guest_key): the guest's own booking. */
    booking_mine(uid, key) {
      const b = bookingByKey(key);
      if (!b) return null;
      const ct = rows.coach_call_types.find((x) => x.id === b.call_type_id);
      const l = rows.coach_booking_links.find((x) => x.id === b.link_id);
      const it = rows.coach_cal_items.find((x) => x.id === b.item_id);
      return { status: b.status, name: b.name, starts_at: b.starts_at, ends_at: b.ends_at, time_zone: b.time_zone, call_name: ct?.name ?? (String(l?.call_name ?? '').trim() || l?.purpose) ?? 'Call', coach_first_name: firstNameOf(b.coach_id),
        place_kind: it?.place_kind ?? null, meeting_link: it?.meeting_link ?? null, location: it?.location ?? null, minutes: minutesOf(b), notice_hours: ct?.notice_hours ?? l?.notice_hours ?? 24,
        ahead_weeks: ct?.ahead_weeks ?? l?.ahead_weeks ?? 4, late: ms(b.starts_at) - now() < 24 * HOUR, past: ms(b.starts_at) <= now() };
    },
    /** booking_move_times(p_guest_key, p_from, p_to): where a guest can move to (their own time doesn't block them). */
    booking_move_times(uid, key, from, to) {
      const b = bookingByKey(key);
      if (!b || b.status !== 'booked' || ms(b.starts_at) <= now()) return [];
      const ct = rows.coach_call_types.find((x) => x.id === b.call_type_id);
      const l = rows.coach_booking_links.find((x) => x.id === b.link_id);
      return freeTimes({ coach: b.coach_id, source: b.profile_id ? 'hours' : 'open', minutes: minutesOf(b), gapBefore: ct?.gap_before ?? 15, gapAfter: ct?.gap_after ?? 15, notice: ct?.notice_hours ?? l?.notice_hours ?? 24,
        ahead: ct?.ahead_weeks ?? l?.ahead_weeks ?? 4, dayLimit: ct?.day_limit ?? 5, from, to, skip: b.item_id, type: b.call_type_id }).map((s) => ({ starts_at: iso(s) }));
    },
    /** booking_move(p_guest_key, p_start, p_early_late). */
    booking_move(uid, key, start, earlyLate = false) {
      const b = bookingByKey(key);
      if (!b || b.status !== 'booked' || ms(b.starts_at) <= now()) return { status: 'not_found' };
      const minutes = minutesOf(b);
      if (!onQuarter(start, b.time_zone)) return { status: 'quarter' };
      if (!earlyLate && !sociable(start, minutes, b.time_zone)) return { status: 'hours' };
      const s = ms(start);
      const e = s + minutes * MIN;
      if (!fn.booking_move_times(uid, key, s, e).some((x) => ms(x.starts_at) === s)) return { status: 'taken' };
      Object.assign(b, { moved_from: b.starts_at, moved_at: stamp(), starts_at: iso(s), ends_at: iso(e), updated_at: stamp() });
      const it = rows.coach_cal_items.find((x) => x.id === b.item_id);
      if (it) Object.assign(it, { starts_at: iso(s), ends_at: iso(e), updated_at: stamp() });
      const se = rows.coach_sessions?.find((x) => x.id === b.session_id && !x.recap_sent_at);
      if (se) se.starts_at = iso(s);
      notify(b.coach_id, `${b.name} moved their call`, null, 'booking', b.id);
      return { status: 'moved', starts_at: iso(s), ends_at: iso(e), time_zone: b.time_zone };
    },
    /** booking_cancel(p_guest_key): its time is free again at once. */
    booking_cancel(uid, key) {
      const b = bookingByKey(key);
      if (!b || b.status !== 'booked' || ms(b.starts_at) <= now()) return { status: 'not_found' };
      const late = ms(b.starts_at) - now() < 24 * HOUR;
      Object.assign(b, { status: 'cancelled', cancelled_at: stamp(), late_cancel: late, updated_at: stamp() });
      dropItems(rows.coach_cal_items.filter((x) => x.id === b.item_id), { quiet: true });
      if (rows.coach_sessions) rows.coach_sessions = rows.coach_sessions.filter((x) => !(x.id === b.session_id && !x.outcome && !x.recap_sent_at));
      b.item_id = null;
      notify(b.coach_id, `${b.name} cancelled their call`, null, 'booking', b.id);
      return { status: 'cancelled', late };
    },
    /** poll_page(p_key): the poll, its times and this person's own answers; never anyone else's. */
    poll_page(uid, key) {
      const pp = rows.coach_poll_people.find((x) => x.vote_key === key);
      const p = pp && rows.coach_polls.find((x) => x.id === pp.poll_id);
      if (!p) return null;
      const options = rows.coach_poll_options.filter((o) => o.poll_id === p.id).sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
      const done = options.find((o) => o.id === p.confirmed_option_id);
      return { title: p.title, status: p.status ?? 'open', minutes: p.minutes ?? 60, place_kind: p.place_kind ?? 'zoom', coach_first_name: firstNameOf(p.coach_id), name: pp.name, time_zone: pp.time_zone ?? p.time_zone,
        voted: pp.voted_at != null, confirmed: done ? { starts_at: done.starts_at, ends_at: done.ends_at } : null,
        options: options.map((o) => ({ id: o.id, starts_at: o.starts_at, ends_at: o.ends_at, can: rows.coach_poll_votes.find((v) => v.option_id === o.id && v.person_id === pp.id)?.can ?? null })) };
    },
    /** poll_vote(p_key, p_votes): saved | closed | not_found | too_long. */
    poll_vote(uid, key, votes) {
      const pp = rows.coach_poll_people.find((x) => x.vote_key === key);
      const p = pp && rows.coach_polls.find((x) => x.id === pp.poll_id);
      if (!p) return 'not_found';
      if ((p.status ?? 'open') !== 'open') return 'closed';
      if (!(votes && typeof votes === 'object' && !Array.isArray(votes)) || JSON.stringify(votes).length > 2000) return 'too_long';
      let n = 0;
      for (const [optionId, can] of Object.entries(votes)) {
        if (typeof can !== 'boolean' || !rows.coach_poll_options.some((o) => o.id === optionId && o.poll_id === p.id)) continue;
        const old = rows.coach_poll_votes.find((v) => v.option_id === optionId && v.person_id === pp.id);
        if (old) Object.assign(old, { can, voted_at: stamp() }); else rows.coach_poll_votes.push({ option_id: optionId, person_id: pp.id, can, voted_at: stamp() });
        n += 1;
      }
      if (n > 0) {
        if (pp.voted_at == null) notify(p.coach_id, `${pp.name} answered your poll`, p.title, 'poll', p.id);
        pp.voted_at = stamp();
      }
      return 'saved';
    },
    /** my_booking_times(p_from, p_to, p_minutes): the client's coach's free times, from the weekly hours. */
    my_booking_times(uid, from, to, minutes = null) {
      const m = myCoaching(uid);
      if (!m || (minutes != null && ![30, 60, 90].includes(minutes))) return [];
      return clientTimes(m, minutes ?? m.minutes, from, to).map((s) => ({ starts_at: iso(s) }));
    },
    /** my_sessions_coming(): the client's own sessions still to come. */
    my_sessions_coming(uid) {
      const m = myCoaching(uid);
      if (!m || !rows.coach_sessions) return [];
      return rows.coach_sessions.filter((s) => s.profile_id === m.profile && s.coach_id === m.coach && !s.outcome && ms(s.starts_at) > now()).sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).slice(0, 100).map((s) => {
        const it = rows.coach_cal_items.find((x) => x.session_id === s.id);
        return { session_id: s.id, starts_at: s.starts_at, minutes: s.minutes, time_zone: it?.time_zone ?? m.zone, place_kind: it?.place_kind ?? null, meeting_link: it?.meeting_link ?? null, location: it?.location ?? null,
          coach_first_name: firstNameOf(s.coach_id), late: ms(s.starts_at) - now() < 24 * HOUR, moved_in_google: it?.moved_in_google_at != null };
      });
    },
    /** my_session_book(p_start, p_minutes): booked | taken | quarter | no_coach | none_left. */
    my_session_book(uid, start, minutes = null) {
      const m = myCoaching(uid);
      if (!m || !rows.coach_sessions) return { status: 'no_coach' };
      const len = minutes ?? m.minutes;
      if (![30, 60, 90].includes(len)) return { status: 'taken' };
      if (!onQuarter(start, m.zone)) return { status: 'quarter' };
      const s = ms(start);
      const e = s + len * MIN;
      if (m.engagement && m.total != null && m.held + rows.coach_sessions.filter((x) => x.engagement_id === m.engagement && !x.outcome).length >= m.total) return { status: 'none_left' };
      if (!clientTimes(m, len, s, e).includes(s)) return { status: 'taken' };
      const se = session({ coach_id: m.coach, profile_id: m.profile, engagement_id: m.engagement, starts_at: iso(s), minutes: len });
      rows.coach_sessions.push(se);
      const it = item({ coach_id: m.coach, kind: 'client_call', title: m.name, starts_at: iso(s), ends_at: iso(e), time_zone: m.zone, place_kind: 'zoom', profile_id: m.profile, session_id: se.id });
      rows.coach_cal_items.push(it);
      rows.coach_bookings.push(booking({ coach_id: m.coach, item_id: it.id, session_id: se.id, profile_id: m.profile, name: m.name, time_zone: m.zone, starts_at: iso(s), ends_at: iso(e), source: 'client' }));
      notify(m.coach, `${m.name} booked a session`, null, 'session', se.id);
      return { status: 'booked', session_id: se.id, starts_at: iso(s), ends_at: iso(e), time_zone: m.zone };
    },
    /** my_session_move(p_session, p_start, p_late_ok): under 24 hours it answers 'late' first; going on keeps the old one as a late cancellation. */
    my_session_move(uid, sessionId, start, lateOk = false) {
      const m = myCoaching(uid);
      const s = m && rows.coach_sessions?.find((x) => x.id === sessionId && x.profile_id === m.profile && x.coach_id === m.coach && !x.outcome && ms(x.starts_at) > now());
      if (!s) return { status: 'not_found' };
      const late = ms(s.starts_at) - now() < 24 * HOUR;
      if (late && !lateOk) return { status: 'late', late: true };
      if (!onQuarter(start, m.zone)) return { status: 'quarter' };
      const a = ms(start);
      const e = a + s.minutes * MIN;
      const it = rows.coach_cal_items.find((x) => x.session_id === s.id);
      if (!clientTimes(m, s.minutes, a, e, it?.id ?? null).includes(a)) return { status: 'taken' };
      const was = s.starts_at;
      let id = s.id;
      if (late) {
        Object.assign(s, { outcome: 'late_cancel', written_up_at: stamp() });
        for (const b of rows.coach_bookings) if (b.session_id === s.id && b.status === 'booked') Object.assign(b, { status: 'cancelled', cancelled_at: stamp(), late_cancel: true, item_id: null });
        if (it) dropItems([it], { quiet: true });
        const se = session({ coach_id: s.coach_id, profile_id: s.profile_id, engagement_id: s.engagement_id, kind: s.kind, starts_at: iso(a), minutes: s.minutes });
        rows.coach_sessions.push(se);
        const next = item({ coach_id: s.coach_id, kind: 'client_call', title: m.name, starts_at: iso(a), ends_at: iso(e), time_zone: m.zone, place_kind: 'zoom', profile_id: s.profile_id, session_id: se.id });
        rows.coach_cal_items.push(next);
        rows.coach_bookings.push(booking({ coach_id: s.coach_id, item_id: next.id, session_id: se.id, profile_id: s.profile_id, name: m.name, time_zone: m.zone, starts_at: iso(a), ends_at: iso(e), source: 'client', moved_from: was, moved_at: stamp() }));
        recount(s.engagement_id);
        id = se.id;
      } else {
        s.starts_at = iso(a);
        if (it) Object.assign(it, { starts_at: iso(a), ends_at: iso(e), updated_at: stamp() });
        for (const b of rows.coach_bookings) if (b.session_id === s.id && b.status === 'booked') Object.assign(b, { moved_from: b.starts_at, moved_at: stamp(), starts_at: iso(a), ends_at: iso(e) });
      }
      notify(m.coach, `${m.name} moved a session`, late ? 'With under 24 hours’ notice.' : null, 'session', id);
      return { status: 'moved', late, session_id: id, starts_at: iso(a), ends_at: iso(e) };
    },
    /** my_session_cancel(p_session, p_late_ok): cancelled | late | not_found. */
    my_session_cancel(uid, sessionId, lateOk = false) {
      const m = myCoaching(uid);
      const s = m && rows.coach_sessions?.find((x) => x.id === sessionId && x.profile_id === m.profile && x.coach_id === m.coach && !x.outcome && ms(x.starts_at) > now());
      if (!s) return { status: 'not_found' };
      const late = ms(s.starts_at) - now() < 24 * HOUR;
      if (late && !lateOk) return { status: 'late', late: true };
      for (const b of rows.coach_bookings) if (b.session_id === s.id && b.status === 'booked') Object.assign(b, { status: 'cancelled', cancelled_at: stamp(), late_cancel: late, item_id: null });
      dropItems(rows.coach_cal_items.filter((x) => x.session_id === s.id), { quiet: true });
      if (late) Object.assign(s, { outcome: 'late_cancel', written_up_at: stamp() });
      else rows.coach_sessions = rows.coach_sessions.filter((x) => x.id !== s.id);
      recount(s.engagement_id);
      notify(m.coach, `${m.name} cancelled a session`, late ? 'With under 24 hours’ notice.' : null, 'session', s.id);
      return { status: 'cancelled', late };
    },
    /** coach_call_types_start(): the two every coach starts with, made once; returns the coach's call types. */
    coach_call_types_start() {
      const type = (key, name, notice, ahead, position) => ({ id: randomUUID(), coach_id: ME, key, name, description: null, minutes: 30, gap_before: 15, gap_after: 15, notice_hours: notice, ahead_weeks: ahead, day_limit: 5,
        questions: [], place_kind: 'zoom', page_key: randomUUID(), active: true, makes_lead: true, position, created_at: stamp(), updated_at: stamp() });
      for (const t of [type('chemistry', 'Chemistry Call', 24, 4, 0), type('connection', 'Connection Call', 48, 2, 1)]) if (!rows.coach_call_types.some((x) => x.coach_id === ME && x.key === t.key)) rows.coach_call_types.push(t);
      return rows.coach_call_types.filter((x) => x.coach_id === ME).sort((a, b) => (a.position - b.position) || String(a.created_at).localeCompare(String(b.created_at)));
    },
    /** coach_connections_mine(): the status of the coach's own connections, never a token (store.connections: a test sets it). */
    coach_connections_mine() {
      return (store.connections || []).filter((c) => c.coach_id === ME).map((c) => ({ service: c.service, status: c.status, account_label: c.account_label ?? null, calendars: c.calendars ?? {}, last_synced_at: c.last_synced_at ?? null, last_error: c.last_error ?? null }));
    },
  };

  /** A calendar item's delete, with everything that hangs from it; its booking is cancelled unless a function is doing it. */
  function dropItems(list, { quiet = false } = {}) {
    for (const it of list) {
      if (!quiet) for (const b of rows.coach_bookings) if (b.item_id === it.id && b.status === 'booked') Object.assign(b, { status: 'cancelled', cancelled_at: stamp() });
      for (const b of rows.coach_bookings) if (b.item_id === it.id) b.item_id = null;
      rows.coach_cal_items = rows.coach_cal_items.filter((x) => x !== it);
      rows.coach_cal_guests = rows.coach_cal_guests.filter((g) => g.item_id !== it.id);
      rows.coach_cal_reminder_sends = rows.coach_cal_reminder_sends.filter((r) => r.item_id !== it.id);
      dropItems(rows.coach_cal_items.filter((x) => x.series_id === it.id || x.travel_for === it.id), { quiet });
    }
  }

  const FKS = {
    coach_poll_people: [['poll_id', 'coach_polls'], ['profile_id', 'client_profiles']],
    coach_poll_options: [['poll_id', 'coach_polls']],
    coach_booking_links: [['profile_id', 'client_profiles']],
    coach_cal_items: [['series_id', 'coach_cal_items'], ['travel_for', 'coach_cal_items'], ['profile_id', 'client_profiles'], ['group_id', 'coach_groups'], ['session_id', 'coach_sessions'], ['poll_option_id', 'coach_poll_options']],
    coach_cal_guests: [['item_id', 'coach_cal_items'], ['profile_id', 'client_profiles']],
    coach_open_blocks: [['call_type_id', 'coach_call_types']],
  };
  const WRITE_BY_FUNCTION = ['coach_bookings', 'coach_poll_votes', 'coach_cal_reminder_sends'];

  return {
    fn,
    freeTimes,
    /** Row security's read rule: every table is its coach's alone, the owner included. */
    readable(table, r) {
      if (table === 'coach_poll_votes') return rows.coach_poll_options.find((o) => o.id === r.option_id)?.coach_id === ME;
      return r.coach_id === ME;
    },
    /** What a row becomes as it is added (old is null) or changed: row security, the guards, the checks and the foreign keys. */
    before(table, old, next) {
      if (WRITE_BY_FUNCTION.includes(table)) no('42501', `permission denied for table ${table}`, 403);
      let r = next;
      if (r.coach_id !== ME) denied(table);
      for (const [column, parent] of FKS[table] || []) {
        if (r[column] == null || !rows[parent]) continue;
        const hit = rows[parent].find((x) => x.id === r[column]);
        if (!hit) no('23503', `insert or update on table "${table}" violates foreign key constraint "${table}_${column}_fkey"`, 409);
        if ('coach_id' in hit && hit.coach_id !== ME) denied(table);
      }
      if (table === 'coach_cal_items') {
        if (old) r = { ...r, coach_id: old.coach_id };
        if (!zoneIsReal(r.time_zone)) no('22023', 'A calendar item’s time zone is a place name, like Europe/London.');
        if (!named(r.title, 1, 200)) bad(table, 'title');
        if (!ITEM_KINDS.includes(r.kind ?? 'other') || !['work', 'personal', 'family'].includes(r.calendar ?? 'work')) bad(table, 'kind');
        if (!(ms(r.ends_at) > ms(r.starts_at)) || ms(r.ends_at) > ms(r.starts_at) + 32 * DAY_MS) bad(table, 'ends after it starts');
        if (r.all_day ? !(r.starts_on && r.ends_on && r.ends_on >= r.starts_on) : (r.starts_on != null || r.ends_on != null)) bad(table, 'all-day days');
        if (!repeatOk(r.repeat_rule ?? null)) bad(table, 'repeat_rule');
        if ((r.series_id == null) !== (r.occurrence_on == null) || (r.series_id != null && r.repeat_rule != null) || (r.removed && r.series_id == null)) bad(table, 'series');
        if (r.meeting_link != null && !/^https:\/\/[^\s<>"]+$/.test(r.meeting_link)) bad(table, 'meeting_link');
        if (r.place_kind != null && !PLACES.includes(r.place_kind)) bad(table, 'place_kind');
        if (lengthOf(r.notes) > 6000 || lengthOf(r.location) > 200) bad(table, 'length');
        if (!Array.isArray(r.reminders ?? []) || (r.reminders ?? []).length > 5 || !(r.reminders ?? []).every((x) => x && Number.isInteger(x.minutes) && x.minutes >= 0 && x.minutes <= 40320 && ['email', 'phone'].includes(x.by))) bad(table, 'reminders');
        if (r.series_id != null && rows.coach_cal_items.some((x) => x.id !== r.id && x.series_id === r.series_id && x.occurrence_on === r.occurrence_on)) no('23505', 'duplicate key value violates unique constraint "coach_cal_items_one_time_idx"', 409);
        if (r.session_id != null && rows.coach_cal_items.some((x) => x.id !== r.id && x.session_id === r.session_id)) no('23505', 'duplicate key value violates unique constraint "coach_cal_items_session_idx"', 409);
      }
      if (table === 'coach_cal_guests') {
        if (r.name == null && r.email == null) bad(table, 'a name or an email');
        if (r.email != null && !emailOk(r.email)) bad(table, 'email');
        if (!['none', 'yes', 'no', 'maybe'].includes(r.reply ?? 'none')) bad(table, 'reply');
        if (r.email != null && rows.coach_cal_guests.some((g) => g.id !== r.id && g.item_id === r.item_id && String(g.email ?? '').toLowerCase() === r.email.toLowerCase())) no('23505', 'duplicate key value violates unique constraint "coach_cal_guests_email_idx"', 409);
      }
      if (table === 'coach_call_types') {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(r.key ?? '') || !named(r.name, 1, 80)) bad(table, 'key or name');
        const m = r.minutes ?? 30;
        if (!(Number.isInteger(m) && m >= 15 && m <= 240 && m % 15 === 0)) bad(table, 'minutes');
        if (!((r.notice_hours ?? 24) >= 0 && (r.notice_hours ?? 24) <= 720 && (r.ahead_weeks ?? 4) >= 1 && (r.ahead_weeks ?? 4) <= 12 && (r.day_limit ?? 5) >= 1 && (r.day_limit ?? 5) <= 20)) bad(table, 'limits');
        if (!Array.isArray(r.questions ?? []) || (r.questions ?? []).length > 10) bad(table, 'questions');
        if (rows.coach_call_types.some((x) => x.id !== r.id && x.coach_id === r.coach_id && x.key === r.key)) no('23505', 'duplicate key value violates unique constraint "coach_call_types_key_idx"', 409);
      }
      if (table === 'coach_open_blocks') {
        if (old) r = { ...r, coach_id: old.coach_id };
        if (!zoneIsReal(r.time_zone)) no('22023', 'An open time’s time zone is a place name, like Europe/London.');
        const monday = instantAt(mondayOf(wallClock(clock(), r.time_zone).date), '00:00', r.time_zone).getTime();
        if (ms(r.starts_at) >= monday + 35 * DAY_MS) no('22023', 'Open for calls reaches 4 weeks ahead.');
        if (!(ms(r.ends_at) > ms(r.starts_at)) || ms(r.ends_at) > ms(r.starts_at) + DAY_MS || !quarter(r.starts_at) || !quarter(r.ends_at)) bad(table, 'quarter hours');
      }
      if (table === 'coach_booking_links') {
        // coach_booking_links_guard: used only by a booking, and it keeps its key.
        r = old ? { ...r, coach_id: old.coach_id, key: old.key, used_at: old.used_at ?? null, booking_id: old.booking_id ?? null } : { ...r, used_at: null, booking_id: null };
        if (!named(r.purpose, 1, 80)) bad(table, 'purpose');
        const m = r.minutes ?? 30;
        if (!(Number.isInteger(m) && m >= 15 && m <= 240 && m % 15 === 0)) bad(table, 'minutes');
      }
      if (table === 'coach_polls') {
        if (!named(r.title, 1, 200) || !zoneIsReal(r.time_zone) || !['open', 'confirmed', 'cancelled'].includes(r.status ?? 'open')) bad(table, 'title, zone or status');
      }
      if (table === 'coach_poll_people' && !named(r.name, 1, 120)) bad(table, 'name');
      if (table === 'coach_poll_options') {
        if (!(ms(r.ends_at) > ms(r.starts_at))) bad(table, 'ends after it starts');
        if (!old && rows.coach_poll_options.filter((o) => o.poll_id === r.poll_id && o.id !== r.id).length >= 5) no('22023', 'A poll offers up to 5 times.');
      }
      if (table === 'coach_leads' && !named(r.name, 1, 120)) bad(table, 'name');
      return r;
    },
    /** The "after" triggers: a moved item takes its session and its booking with it. */
    after(table, old, next) {
      if (table !== 'coach_cal_items' || !old || !next) return;
      if (old.starts_at === next.starts_at && old.ends_at === next.ends_at) return;
      const minutes = Math.round((ms(next.ends_at) - ms(next.starts_at)) / MIN);
      const s = next.session_id && rows.coach_sessions?.find((x) => x.id === next.session_id);
      if (s && !s.recap_sent_at) Object.assign(s, { starts_at: next.starts_at, minutes: [30, 60, 90].includes(minutes) ? minutes : s.minutes });
      for (const b of rows.coach_bookings) {
        if (b.item_id !== next.id || b.status !== 'booked') continue;
        if (b.starts_at !== next.starts_at) Object.assign(b, { moved_from: b.starts_at, moved_at: stamp() });
        Object.assign(b, { starts_at: next.starts_at, ends_at: next.ends_at, moved_in_google_at: next.moved_in_google_at ?? b.moved_in_google_at ?? null });
      }
    },
    /** A delete, as row security and the foreign keys leave it: resolves the rows that went. */
    remove(table, hit) {
      if (WRITE_BY_FUNCTION.includes(table)) no('42501', `permission denied for table ${table}`, 403);
      const gone = hit.filter((r) => r.coach_id === ME);
      if (table === 'coach_cal_items') { dropItems(gone); return gone; }
      rows[table] = rows[table].filter((r) => !gone.includes(r));
      for (const r of gone) {
        if (table === 'coach_polls') {
          const options = rows.coach_poll_options.filter((o) => o.poll_id === r.id).map((o) => o.id);
          const people = rows.coach_poll_people.filter((p) => p.poll_id === r.id).map((p) => p.id);
          rows.coach_poll_options = rows.coach_poll_options.filter((o) => o.poll_id !== r.id);
          rows.coach_poll_people = rows.coach_poll_people.filter((p) => p.poll_id !== r.id);
          rows.coach_poll_votes = rows.coach_poll_votes.filter((v) => !options.includes(v.option_id) && !people.includes(v.person_id));
          dropItems(rows.coach_cal_items.filter((i) => options.includes(i.poll_option_id)));
        }
        if (table === 'coach_poll_options') {
          rows.coach_poll_votes = rows.coach_poll_votes.filter((v) => v.option_id !== r.id);
          dropItems(rows.coach_cal_items.filter((i) => i.poll_option_id === r.id));
        }
        if (table === 'coach_poll_people') rows.coach_poll_votes = rows.coach_poll_votes.filter((v) => v.person_id !== r.id);
        if (table === 'coach_call_types') {
          rows.coach_open_blocks = rows.coach_open_blocks.filter((b) => b.call_type_id !== r.id);
          for (const b of rows.coach_bookings) if (b.call_type_id === r.id) b.call_type_id = null;
        }
        if (table === 'coach_booking_links') for (const b of rows.coach_bookings) if (b.link_id === r.id) b.link_id = null;
        if (table === 'coach_leads') for (const b of rows.coach_bookings) if (b.lead_id === r.id) b.lead_id = null;
      }
      return gone;
    },
  };
}
