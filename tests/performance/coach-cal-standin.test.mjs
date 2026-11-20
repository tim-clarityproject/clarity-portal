// The browser tests' stand-in for migration 051 (tests/coach/cal-standin.mjs)
// must answer as the SQL does, because the calendar and booking pages are
// built and tested against it before Tim runs 051. Each check here has the
// same answer as its twin in supabase/051_coach_calendar_test.sql (named
// beside it), so the two can't drift apart unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAL_TABLES, calStandIn, occurrences, repeatOk, ruleDays, zoneIsReal } from '../coach/cal-standin.mjs';
import { instantAt, wallClock } from '../../src/lib/time/instants.js';

const ME = 'coach-me';
const OTHER = 'coach-other';
const NOW = new Date('2026-11-20T09:00:00Z'); // a Friday
const D0 = '2026-12-01'; // the Tuesday the SQL test would pick from this Friday
const D1 = '2026-12-02';
const lon = (day, time) => instantAt(day, time, 'Europe/London').toISOString();
const clockIn = (t, zone = 'Europe/London') => wallClock(new Date(t), zone).time;

class Refusal extends Error { constructor(code, message) { super(message); this.code = code; } }
const no = (code, message) => { throw new Refusal(code, message); };

function world() {
  const rows = Object.fromEntries([...CAL_TABLES, 'coach_settings', 'coach_away', 'coach_notifications', 'client_profiles', 'engagements', 'coach_sessions', 'coach_groups'].map((t) => [t, []]));
  const store = { rows, coaches: [{ id: ME, display_first_name: 'Maya', active: true }, { id: OTHER, display_first_name: 'Tess', active: true }] };
  rows.coach_settings.push({ coach_id: ME, time_zone: 'Europe/London', working_hours: { tue: { from: '09:00', to: '17:00' }, wed: { from: '09:00', to: '17:00' } }, booking: {} });
  rows.coach_call_types.push(
    { id: 'chem', coach_id: ME, key: 'chemistry', name: 'Chemistry Call', minutes: 30, gap_before: 15, gap_after: 15, notice_hours: 24, ahead_weeks: 4, day_limit: 5, questions: [{ id: 'q1', label: 'What would you like from the call?' }], place_kind: 'zoom', page_key: 'chem-key', active: true, makes_lead: true },
    { id: 'conn', coach_id: ME, key: 'connection', name: 'Connection Call', minutes: 30, gap_before: 15, gap_after: 15, notice_hours: 48, ahead_weeks: 3, day_limit: 5, questions: [], place_kind: 'zoom', page_key: 'conn-key', active: true, makes_lead: true },
  );
  rows.coach_open_blocks.push(
    { id: 'b0', coach_id: ME, starts_at: lon(D0, '10:00'), ends_at: lon(D0, '12:00'), time_zone: 'Europe/London', call_type_id: null },
    { id: 'b1', coach_id: ME, starts_at: lon(D1, '10:00'), ends_at: lon(D1, '16:00'), time_zone: 'Europe/London', call_type_id: null },
  );
  rows.coach_cal_items.push(
    { id: 'training', coach_id: ME, kind: 'own_time', calendar: 'work', title: 'Training', starts_at: lon('2026-11-17', '07:00'), ends_at: lon('2026-11-17', '08:30'), time_zone: 'Europe/London', repeat_rule: { every: 'week' }, busy: true },
    { id: 'pers', coach_id: ME, kind: 'other', calendar: 'family', title: 'Swimming with Esme', starts_at: lon(D0, '10:30'), ends_at: lon(D0, '11:00'), time_zone: 'Europe/London', busy: true, private: true },
    { id: 'free', coach_id: ME, kind: 'event', calendar: 'work', title: 'Leaders dinner, maybe', starts_at: lon(D0, '11:00'), ends_at: lon(D0, '12:00'), time_zone: 'Europe/London', busy: false },
    { id: 'dentist', coach_id: OTHER, kind: 'other', calendar: 'personal', title: 'Dentist', starts_at: lon(D0, '10:00'), ends_at: lon(D0, '11:00'), time_zone: 'Europe/London', busy: true, private: true },
  );
  const sim = calStandIn({ store, ME, me: { id: ME }, clock: () => NOW, no });
  const free = (key, day, next) => sim.fn.booking_free_times(null, key, lon(day, '00:00'), lon(next, '00:00')).map((r) => clockIn(r.starts_at)).join(',');
  return { rows, store, sim, free };
}

test('a repeat is a rule: the same answers as the SQL (5b to 5f, 2a, 2b, 2f)', () => {
  assert.equal(ruleDays({ every: 'week', interval: 2, weekdays: [1, 3] }, '2027-03-01', '2027-03-01', '2027-03-31').join(','), '2027-03-01,2027-03-03,2027-03-15,2027-03-17,2027-03-29,2027-03-31');
  assert.equal(ruleDays({ every: 'month', by: 'weekday' }, '2027-03-16', '2027-03-01', '2027-06-30').join(','), '2027-03-16,2027-04-20,2027-05-18,2027-06-15');
  assert.equal(ruleDays({ every: 'month' }, '2027-01-31', '2027-01-01', '2027-05-31').join(','), '2027-01-31,2027-02-28,2027-03-31,2027-04-30,2027-05-31');
  assert.equal(ruleDays({ every: 'day', count: 3 }, '2027-03-01', '2027-03-03', '2027-04-01').join(','), '2027-03-01,2027-03-02,2027-03-03');
  assert.equal(ruleDays({ every: 'weekday', until: '2027-03-09' }, '2027-03-04', '2027-03-01', '2027-04-01').join(','), '2027-03-04,2027-03-05,2027-03-08,2027-03-09');
  assert.deepEqual([null, { every: 'month', by: 'weekday' }, { every: 'day', count: 730 }].map(repeatOk), [true, true, true]);
  assert.deepEqual([{ every: 'fortnight' }, { every: 'week', by: 'weekday' }, { every: 'day', count: 0 }, { every: 'day', count: 1.5 }].map(repeatOk), [false, false, false, false]);
  assert.deepEqual(['America/New_York', 'America/St_Johns', 'EST', '-05:00', 'Mars/Phobos', null].map(zoneIsReal), [true, true, false, false, false, false]);
});

test('a New York Monday 07:30 series stays 07:30 there through 25 Oct and 1 Nov 2026, while UK time goes 12:30, 11:30, 12:30 (4b, 4c)', () => {
  const series = [{ id: 'ny', coach_id: ME, kind: 'client_call', starts_at: instantAt('2026-10-19', '07:30', 'America/New_York').toISOString(), ends_at: instantAt('2026-10-19', '08:30', 'America/New_York').toISOString(), time_zone: 'America/New_York', repeat_rule: { every: 'week' } }];
  const times = occurrences(series, ME, '2026-10-18T00:00:00Z', '2026-11-08T00:00:00Z');
  assert.deepEqual(times.map((o) => clockIn(o.starts, 'America/New_York')), ['07:30', '07:30', '07:30']);
  assert.deepEqual(times.map((o) => clockIn(o.starts)), ['12:30', '11:30', '12:30']);
});

test('"this one": a time that a row stands in for, or that was removed, is left out of its series (5j)', () => {
  const at = (day, time) => instantAt(day, time, 'Europe/London').toISOString();
  const items = [
    { id: 's', coach_id: ME, kind: 'other', starts_at: at('2027-03-01', '09:00'), ends_at: at('2027-03-01', '10:00'), time_zone: 'Europe/London', repeat_rule: { every: 'week', interval: 2, weekdays: [1, 3] } },
    { id: 'moved', coach_id: ME, kind: 'other', starts_at: at('2027-03-03', '15:00'), ends_at: at('2027-03-03', '16:00'), time_zone: 'Europe/London', series_id: 's', occurrence_on: '2027-03-03' },
    { id: 'gone', coach_id: ME, kind: 'other', starts_at: at('2027-03-15', '09:00'), ends_at: at('2027-03-15', '10:00'), time_zone: 'Europe/London', series_id: 's', occurrence_on: '2027-03-15', removed: true },
  ];
  const got = occurrences(items, ME, '2027-03-01T00:00:00Z', '2027-03-20T00:00:00Z');
  assert.deepEqual(got.filter((o) => o.item.id === 's').map((o) => o.on), ['2027-03-01', '2027-03-17']);
  assert.equal(clockIn(got.find((o) => o.item.id === 'moved').starts), '15:00');
  assert.equal(got.some((o) => o.item.id === 'gone'), false);
});

test('free times: quarter hours in the open block, a personal item only as busy, the gap between calls, the notice, a day away, the weekly hours (6a to 6h)', () => {
  const { rows, sim, free } = world();
  const ask = (extra = {}) => sim.freeTimes({ coach: ME, source: 'open', minutes: 30, from: lon(D0, '00:00'), to: lon(D1, '00:00'), type: 'chem', ...extra }).map((s) => clockIn(s)).join(',');
  assert.equal(ask(), '10:00,11:00,11:15,11:30');
  assert.equal(ask({ minutes: 60 }), '11:00');
  Object.assign(rows.coach_cal_items.find((i) => i.id === 'pers'), { kind: 'chemistry', calendar: 'work' });
  assert.equal(ask(), '11:15,11:30');
  assert.equal(ask({ skip: 'pers' }), '10:00,10:15,10:30,10:45,11:00,11:15,11:30');
  Object.assign(rows.coach_cal_items.find((i) => i.id === 'pers'), { kind: 'other', calendar: 'family' });
  assert.equal(ask({ notice: 24 * 11 + 1.5 }), '11:00,11:15,11:30'); // the notice ends at 10:30 on the Tuesday
  assert.equal(ask({ ahead: 1 }), '');
  rows.coach_away.push({ coach_id: ME, starts_on: D0, ends_on: D0 });
  assert.equal(ask(), '');
  rows.coach_away.length = 0;
  const hours = sim.freeTimes({ coach: ME, source: 'hours', minutes: 60, from: lon(D0, '00:00'), to: lon(D1, '00:00') });
  assert.equal(`${hours.length} from ${clockIn(hours[0])} to ${clockIn(hours.at(-1))}`, '24 from 09:00 to 16:00');
  rows.coach_settings[0].booking = { gap: '30 minutes', per_day: '1' };
  Object.assign(rows.coach_cal_items.find((i) => i.id === 'pers'), { kind: 'chemistry', calendar: 'work' });
  assert.equal(ask(), '');
  assert.equal(free('chem-key', D0, D1), '');
});

test('a booking page shows its own call only, and nothing of the calendar (7a to 7c)', () => {
  const { sim } = world();
  const page = sim.fn.booking_page(null, 'chem-key');
  assert.deepEqual([page.state, page.kind, page.name, page.coach_first_name, page.minutes, page.notice_hours, page.ahead_weeks, page.questions.length], ['open', 'page', 'Chemistry Call', 'Maya', 30, 24, 4, 1]);
  const text = JSON.stringify(page);
  assert.equal(/Connection|Swimming|conn-key|coach-me/.test(text), false);
  assert.equal(sim.fn.booking_page(null, 'nobody'), null);
  assert.equal(sim.fn.booking_make(null, 'nobody', lon(D0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London').status, 'not_found');
});

test('a guest books: what a booking needs, the guest\'s own night, and two guests for one start never both win (7d to 7k, 7o)', () => {
  const { rows, sim, free } = world();
  const make = (key, time, name, email, zone = 'Europe/London', early = false, day = D0) => sim.fn.booking_make(null, key, lon(day, time), name, email, zone, {}, early);
  assert.equal(free('chem-key', D0, D1), '10:00,11:00,11:15,11:30');
  assert.deepEqual([
    make('chem-key', '10:00', '  ', 'nadia@example.invalid').status, make('chem-key', '10:00', 'Nadia Osei', 'nadia at example').status,
    make('chem-key', '10:00', 'Nadia Osei', 'nadia@example.invalid', 'EST').status, make('chem-key', '10:00', 'Nadia Osei', 'nadia@example.invalid', '+01:00').status,
    make('chem-key', '10:10', 'Nadia Osei', 'nadia@example.invalid').status, make('chem-key', '10:15', 'Nadia Osei', 'nadia@example.invalid').status,
    make('chem-key', '09:00', 'Nadia Osei', 'nadia@example.invalid').status,
  ], ['name', 'email', 'zone', 'zone', 'quarter', 'taken', 'taken']);
  // 11:30 in London is half past midnight in Auckland.
  assert.equal(make('chem-key', '11:30', 'Aroha Ngata', 'aroha@example.invalid', 'Pacific/Auckland').status, 'hours');
  const aroha = make('chem-key', '11:30', 'Aroha Ngata', 'Aroha@Example.invalid ', 'Pacific/Auckland', true);
  assert.deepEqual([aroha.status, aroha.time_zone, typeof aroha.guest_key], ['booked', 'Pacific/Auckland', 'string']);
  assert.equal(make('chem-key', '10:00', 'Nadia Osei', 'nadia@example.invalid').status, 'booked');
  assert.equal(make('chem-key', '10:00', 'Dan Reid', 'dan@example.invalid').status, 'taken');
  assert.equal(make('conn-key', '10:00', 'Dan Reid', 'dan@example.invalid').status, 'taken');
  assert.equal(free('chem-key', D0, D1), '');
  assert.deepEqual(rows.coach_cal_items.filter((i) => i.kind === 'chemistry').map((i) => `${i.title} ${i.time_zone}`), ['Aroha Ngata Pacific/Auckland', 'Nadia Osei Europe/London']);
  assert.deepEqual(rows.coach_leads.map((l) => `${l.name} ${l.source} ${l.email}`).sort(), ['Aroha Ngata chemistry_page aroha@example.invalid', 'Nadia Osei chemistry_page nadia@example.invalid']);
  assert.equal(rows.coach_notifications.filter((n) => / booked Chemistry Call$/.test(n.title)).length, 2);
});

test('the guest moves and cancels by their own key; the coach\'s own move and delete follow through (7l to 7y)', () => {
  const { rows, sim, free } = world();
  const nadia = sim.fn.booking_make(null, 'chem-key', lon(D0, '10:00'), 'Nadia Osei', 'nadia@example.invalid', 'Europe/London');
  const mine = sim.fn.booking_mine(null, nadia.guest_key);
  assert.deepEqual([mine.status, mine.call_name, mine.coach_first_name, mine.minutes, mine.late], ['booked', 'Chemistry Call', 'Maya', 30, false]);
  assert.equal(sim.fn.booking_mine(null, 'nobody'), null);
  assert.equal(sim.fn.booking_move_times(null, nadia.guest_key, lon(D1, '00:00'), lon('2026-12-03', '00:00')).length, 23);
  assert.equal(sim.fn.booking_move(null, nadia.guest_key, lon(D1, '10:05')).status, 'quarter');
  assert.equal(sim.fn.booking_move(null, nadia.guest_key, lon(D1, '10:00')).status, 'moved');
  assert.equal(free('chem-key', D0, D1), '10:00,11:00,11:15,11:30');
  // The coach drags the call: the "after" trigger moves the booking.
  const item = rows.coach_cal_items.find((i) => i.title === 'Nadia Osei');
  const was = { ...item };
  Object.assign(item, sim.before('coach_cal_items', was, { ...item, starts_at: lon(D1, '12:00'), ends_at: lon(D1, '12:30') }));
  sim.after('coach_cal_items', was, item);
  const booking = rows.coach_bookings[0];
  assert.deepEqual([clockIn(booking.starts_at), clockIn(booking.moved_from)], ['12:00', '10:00']);
  // The coach deletes it: the booking is cancelled.
  sim.remove('coach_cal_items', [item]);
  assert.deepEqual([booking.status, rows.coach_cal_items.some((i) => i.title === 'Nadia Osei')], ['cancelled', false]);
  const aroha = sim.fn.booking_make(null, 'chem-key', lon(D0, '11:30'), 'Aroha Ngata', 'aroha@example.invalid', 'Europe/London');
  assert.deepEqual([sim.fn.booking_cancel(null, aroha.guest_key).status, sim.fn.booking_cancel(null, aroha.guest_key).status, sim.fn.booking_mine(null, aroha.guest_key).status], ['cancelled', 'not_found', 'cancelled']);
  assert.equal(rows.coach_leads.some((l) => l.name === 'Aroha Ngata'), true);
});

test('3 bookings an email, and 5 calls a day (7z to 7zc)', () => {
  const { rows, sim, free } = world();
  const make = (key, time, name, email) => sim.fn.booking_make(null, key, lon(D1, time), name, email, 'Europe/London').status;
  assert.deepEqual([make('chem-key', '10:00', 'Kit Lowe', 'kit@example.invalid'), make('chem-key', '11:00', 'Kit Lowe', 'kit@example.invalid'), make('chem-key', '12:00', 'Kit Lowe', 'kit@example.invalid'),
    make('chem-key', '13:00', 'Kit Lowe', 'KIT@example.invalid')], ['booked', 'booked', 'booked', 'too_many']);
  assert.deepEqual([make('chem-key', '13:00', 'Ruth Adeyemi', 'ruth@example.invalid'), make('conn-key', '14:00', 'Dan Reid', 'dan@example.invalid')], ['booked', 'booked']);
  assert.deepEqual([free('chem-key', D1, '2026-12-03'), free('conn-key', D1, '2026-12-03'), make('chem-key', '15:00', 'Priya Nair', 'priya@example.invalid')], ['', '', 'taken']);
  assert.equal(rows.coach_leads.filter((l) => l.email === 'kit@example.invalid').length, 1);
  assert.equal(rows.coach_cal_items.find((i) => i.title === 'Dan Reid').kind, 'connection');
});

test('a single-use link books once and ends when it says (8c to 8e)', () => {
  const { rows, sim } = world();
  rows.coach_booking_links.push(
    { id: 'l1', coach_id: ME, key: 'link-key', purpose: 'Sponsor call', for_name: 'Dana Whitfield', minutes: 60, notice_hours: 24, ahead_weeks: 4, expires_on: null, used_at: null, profile_id: null },
    { id: 'l2', coach_id: ME, key: 'old-key', purpose: 'Old call', minutes: 30, notice_hours: 24, ahead_weeks: 4, expires_on: '2026-11-19', used_at: null, profile_id: null },
  );
  const page = sim.fn.booking_page(null, 'link-key');
  assert.deepEqual([page.state, page.kind, page.name, page.minutes, sim.fn.booking_page(null, 'old-key').state], ['open', 'link', 'Sponsor call', 60, 'expired']);
  const make = (key, day, time) => sim.fn.booking_make(null, key, lon(day, time), 'Dana Whitfield', 'dana@example.invalid', 'Europe/London').status;
  assert.deepEqual([make('old-key', D0, '11:00'), make('link-key', D0, '11:00'), make('link-key', D1, '15:00'), sim.fn.booking_page(null, 'link-key').state], ['expired', 'booked', 'used', 'used']);
  // A plain save never makes it new again, or gives it another key.
  const link = rows.coach_booking_links[0];
  const saved = sim.before('coach_booking_links', link, { ...link, used_at: null, booking_id: null, key: 'another' });
  assert.deepEqual([saved.used_at != null, saved.booking_id != null, saved.key], [true, true, 'link-key']);
  assert.equal(rows.coach_leads[0].source, 'single_use_link');
});

test('a poll: each person sees only their own answers, and it offers up to 5 times (9b to 9h)', () => {
  const { rows, sim } = world();
  rows.coach_polls.push({ id: 'p', coach_id: ME, title: 'Three-way meeting', minutes: 60, time_zone: 'Europe/London', status: 'open' });
  rows.coach_poll_people.push({ id: 'mia', poll_id: 'p', coach_id: ME, name: 'Mia Torres', email: 'mia@example.invalid', time_zone: 'America/New_York', vote_key: 'mia-key' }, { id: 'paul', poll_id: 'p', coach_id: ME, name: 'Paul Garner', email: 'paul@example.invalid', time_zone: 'Europe/London', vote_key: 'paul-key' });
  for (const [i, day] of ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11'].entries()) rows.coach_poll_options.push({ id: `o${i + 1}`, poll_id: 'p', coach_id: ME, starts_at: lon(day, '17:00'), ends_at: lon(day, '18:00') });
  assert.throws(() => sim.before('coach_poll_options', null, { id: 'o6', poll_id: 'p', coach_id: ME, starts_at: lon('2026-12-14', '17:00'), ends_at: lon('2026-12-14', '18:00') }), (e) => e.code === '22023');
  const page = sim.fn.poll_page(null, 'mia-key');
  assert.deepEqual([page.title, page.name, page.time_zone, page.coach_first_name, page.options.length, page.voted], ['Three-way meeting', 'Mia Torres', 'America/New_York', 'Maya', 5, false]);
  assert.equal(/Paul|example\.invalid/.test(JSON.stringify(page)), false);
  assert.deepEqual([sim.fn.poll_vote(null, 'mia-key', { o1: true, o2: true, o3: false }), sim.fn.poll_vote(null, 'mia-key', { o3: true, nobody: true, o1: 'yes' }), sim.fn.poll_vote(null, 'nobody', {}), sim.fn.poll_vote(null, 'mia-key', [])], ['saved', 'saved', 'not_found', 'too_long']);
  assert.deepEqual(sim.fn.poll_page(null, 'mia-key').options.map((o) => o.can), [true, true, true, null, null]);
  assert.deepEqual(sim.fn.poll_page(null, 'paul-key').options.map((o) => o.can), [null, null, null, null, null]);
  assert.equal(rows.coach_notifications.filter((n) => n.title === 'Mia Torres answered your poll').length, 1);
  Object.assign(rows.coach_polls[0], { status: 'confirmed', confirmed_option_id: 'o2' });
  assert.deepEqual([sim.fn.poll_vote(null, 'paul-key', { o1: true }), sim.fn.poll_page(null, 'paul-key').status, sim.fn.poll_page(null, 'paul-key').confirmed != null], ['closed', 'confirmed', true]);
});

test('a client books, moves and cancels their own sessions, and is told the late rule first (10a to 10p)', () => {
  const { rows, sim } = world();
  rows.client_profiles.push({ id: 'ella', coach_id: ME, user_id: 'ella-u', name: 'Ella Fraser', time_zone: 'America/New_York', status: 'active' }, { id: 'sam', coach_id: OTHER, user_id: 'sam-u', name: 'Sam Okafor', status: 'active' });
  rows.engagements.push({ id: 'eng', coach_id: ME, profile_id: 'ella', status: 'active', sessions_total: 3, sessions_held: 0, default_minutes: 60, created_at: '2026-01-01T00:00:00Z' });
  const next = '2026-12-08';
  assert.equal(sim.fn.my_booking_times('ella-u', lon(next, '00:00'), lon('2026-12-09', '00:00')).length > 0, true);
  const first = sim.fn.my_session_book('ella-u', lon(next, '14:00'));
  assert.deepEqual([first.status, first.time_zone], ['booked', 'America/New_York']);
  assert.deepEqual([sim.fn.my_session_book('ella-u', lon(next, '14:00')).status, sim.fn.my_session_book('ella-u', lon(next, '16:05')).status, sim.fn.my_session_book('ella-u', lon(next, '10:00'), 45).status], ['taken', 'quarter', 'taken']);
  const second = sim.fn.my_session_book('ella-u', lon(next, '16:00'));
  const third = sim.fn.my_session_book('ella-u', lon(next, '11:45'));
  assert.deepEqual([second.status, third.status, sim.fn.my_session_book('ella-u', lon(next, '09:00')).status], ['booked', 'booked', 'none_left']);
  const moved = sim.fn.my_session_move('ella-u', first.session_id, lon(next, '09:15'));
  assert.deepEqual([moved.status, moved.late, moved.session_id === first.session_id], ['moved', false, true]);
  assert.deepEqual([sim.fn.my_sessions_coming('sam-u').length, sim.fn.my_session_move('sam-u', first.session_id, lon(next, '13:00')).status, sim.fn.my_session_cancel('sam-u', first.session_id).status], [0, 'not_found', 'not_found']);
  // Sam's coach is the other one: only the Dentist is busy there.
  assert.equal(sim.fn.my_booking_times('sam-u', lon(D0, '09:00'), lon(D0, '13:00')).map((r) => clockIn(r.starts_at)).join(','), '09:00,11:00,11:15,11:30,11:45,12:00');
  // The late rule: the session is now 2 hours away.
  const session = rows.coach_sessions.find((s) => s.id === first.session_id);
  const item = rows.coach_cal_items.find((i) => i.session_id === session.id);
  session.starts_at = new Date(NOW.getTime() + 2 * 3600000).toISOString();
  Object.assign(item, { starts_at: session.starts_at, ends_at: new Date(NOW.getTime() + 3 * 3600000).toISOString() });
  assert.deepEqual([sim.fn.my_sessions_coming('ella-u').some((s) => s.late), sim.fn.my_session_move('ella-u', session.id, lon(next, '13:15')).status, sim.fn.my_session_cancel('ella-u', session.id).status, sim.fn.my_sessions_coming('ella-u').length], [true, 'late', 'late', 3]);
  const late = sim.fn.my_session_move('ella-u', session.id, lon(next, '13:15'), true);
  assert.deepEqual([late.status, late.late, late.session_id !== session.id, session.outcome, rows.coach_cal_items.some((i) => i.session_id === session.id)], ['moved', true, true, 'late_cancel', false]);
  const off = sim.fn.my_session_cancel('ella-u', second.session_id);
  assert.deepEqual([off.status, off.late, sim.fn.my_sessions_coming('ella-u').length, rows.coach_sessions.some((s) => s.id === second.session_id)], ['cancelled', false, 2, false]);
});

test('every table is its coach\'s alone, and what only a function may write is refused to a plain save (3p, 7p)', () => {
  const { rows, sim } = world();
  assert.equal(sim.readable('coach_cal_items', rows.coach_cal_items.find((i) => i.id === 'dentist')), false);
  assert.equal(sim.readable('coach_cal_items', rows.coach_cal_items.find((i) => i.id === 'pers')), true);
  const item = { id: 'x', coach_id: ME, kind: 'other', calendar: 'work', title: 'x', starts_at: lon(D0, '13:00'), ends_at: lon(D0, '14:00'), time_zone: 'Europe/London' };
  assert.throws(() => sim.before('coach_cal_items', null, { ...item, coach_id: OTHER }), (e) => e.code === '42501');
  assert.throws(() => sim.before('coach_cal_items', null, { ...item, time_zone: '-05:00' }), (e) => e.code === '22023');
  assert.throws(() => sim.before('coach_cal_items', null, { ...item, ends_at: item.starts_at }), (e) => e.code === '23514');
  assert.throws(() => sim.before('coach_cal_items', null, { ...item, series_id: 'nowhere', occurrence_on: D0 }), (e) => e.code === '23503');
  assert.throws(() => sim.before('coach_bookings', null, { coach_id: ME }), (e) => e.code === '42501');
  assert.throws(() => sim.before('coach_open_blocks', null, { id: 'b', coach_id: ME, starts_at: lon(D0, '13:10'), ends_at: lon(D0, '14:00'), time_zone: 'Europe/London' }), (e) => e.code === '23514');
  assert.throws(() => sim.before('coach_open_blocks', null, { id: 'b', coach_id: ME, starts_at: lon('2027-01-04', '10:00'), ends_at: lon('2027-01-04', '11:00'), time_zone: 'Europe/London' }), (e) => e.code === '22023');
  assert.throws(() => sim.before('coach_call_types', null, { id: 'again', coach_id: ME, key: 'chemistry', name: 'Another' }), (e) => e.code === '23505');
});
