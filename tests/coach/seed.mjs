// Invented people for the coach portal's browser tests: M11's own (Sam,
// Jordan, Priya, Leo, Marcus, Mia), with their organisations, engagements,
// tags, fields, a group and two workshops. Nobody here is real.
import { ME, OTHER } from './shared.mjs';
import { addDays, instantAt, weekdayOf } from '../../src/lib/time/instants.js';

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ID = {
  kestrel: u(1), northfield: u(2), harbour: u(3), brightline: u(4),
  sam: u(11), jordan: u(12), priya: u(13), leo: u(14), marcus: u(15), mia: u(16), past: u(17),
  owen: u(21), ella: u(22),
  tagExec: u(31), tagSport: u(32), tagFinance: u(33), tagKestrel: u(34),
  fSector: u(41), fValue: u(42), fRenew: u(43),
  eSam: u(51), eJordan: u(52), ePriya: u(53), eMarcus: u(54), eMia: u(55), eGroup: u(56),
  p1: u(61), p2: u(62), p3: u(63),
  group: u(71), wsNext: u(81), wsPast: u(82), wsNextKey: u(83), wsPastKey: u(84),
  view1: u(91), view2: u(92),
};

// "Today" for the seed: the real day, or the day a test has pinned the page's clock to (seedClock), so
// "From yesterday", today's calls and this week's capacity stay true on a pinned day too.
let BASE = null;
/** Pins the seed's "today" (a Date or anything Date reads); nothing, or null, goes back to the real day. */
export function seedClock(date = null) { BASE = date ? new Date(date) : null; }
const base = () => (BASE ? new Date(BASE) : new Date());
const day = (offset) => { const d = base(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const at = (offset, hour = 9, minute = 0) => { const d = base(); d.setDate(d.getDate() + offset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };

/** The rows, by table. `today` decides whose birthday it is (Priya's). */
export function seedRows() {
  const now = base();
  const profile = (id, name, extra = {}) => ({ id, coach_id: ME, user_id: null, name, email: `${name.split(' ')[0].toLowerCase()}@example.invalid`, mobile: null, organisation_id: null, job_title: null, city: null, time_zone: 'Europe/London', frequent_traveller: false, referred_by: null, status: 'active', stage: null, getting_started: {}, last_contact_on: null, invited_at: null, ended_on: null, merged_into: null, created_by: null, ...extra });
  const link = (tag, item) => ({ tag_id: tag, item_kind: 'client', item_id: item, coach_id: ME });
  const value = (field, item, v) => ({ field_id: field, item_id: item, coach_id: ME, value_text: null, value_number: null, value_date: null, ...v });
  const engagement = (id, profileId, extra = {}) => ({ id, coach_id: ME, profile_id: profileId, group_id: null, kind: 'sessions', name: '6-month coaching', sessions_total: 12, sessions_held: 0, default_minutes: 60, every_weeks: 2, starts_on: day(-70), ends_on: day(110), time_credit_minutes: null, funded_by: null, status: 'active', created_at: at(-70), ...extra });
  const attendee = (n, ws, extra = {}) => ({ id: u(1000 + n), workshop_id: ws, name: `Person ${n}`, email: `person${n}@example.invalid`, status: 'registered', answers: {}, attended: false, source: 'pasted', survey_key: u(2000 + n), registered_at: at(-3), ...extra });
  return {
    organisations: [
      { id: ID.kestrel, name: 'Kestrel Group', city: 'London', currency: 'GBP', area_enabled: true, seat_count: 20, mission: null, seat_level: null },
      { id: ID.northfield, name: 'Northfield Logistics', city: 'Leeds', currency: 'GBP', area_enabled: false, seat_count: 0, mission: null, seat_level: null },
      { id: ID.harbour, name: 'Harbour City FC', city: 'Chicago', currency: 'USD', area_enabled: false, seat_count: 0, mission: null, seat_level: null },
      { id: ID.brightline, name: 'Brightline Media', city: 'New York', currency: 'USD', area_enabled: false, seat_count: 0, mission: null, seat_level: null },
    ],
    client_profiles: [
      profile(ID.sam, 'Sam Okafor', { organisation_id: ID.kestrel, job_title: 'Chief executive', city: 'London', mobile: '+447700900123', referred_by: 'Dana Whitfield', last_contact_on: day(-6), invited_at: at(-60), getting_started: { first_review: true, welcome_pack: true } }),
      profile(ID.jordan, 'Jordan Reyes', { organisation_id: ID.harbour, job_title: 'Head coach', city: 'Chicago', time_zone: 'America/Chicago', mobile: '+13125550123', frequent_traveller: true, last_contact_on: day(-5), invited_at: at(-90), getting_started: { first_review: true, welcome_pack: true } }),
      profile(ID.priya, 'Priya Nair', { job_title: 'Consultant surgeon', city: 'Manchester', last_contact_on: day(-7), invited_at: at(-150), getting_started: { first_review: true, welcome_pack: true } }),
      profile(ID.leo, 'Leo Grant', { organisation_id: ID.northfield, job_title: 'Operations director', city: 'Leeds', email: null }),
      profile(ID.marcus, 'Marcus Bell', { organisation_id: ID.northfield, job_title: 'Head of people', city: 'Leeds', last_contact_on: day(-8), invited_at: at(-100), getting_started: { first_review: true, welcome_pack: true } }),
      profile(ID.mia, 'Mia Torres', { organisation_id: ID.brightline, job_title: 'Editor in chief', city: 'New York', time_zone: 'America/New_York', last_contact_on: day(-7), invited_at: at(-10) }),
      profile(ID.past, 'Grace Liu', { status: 'past', ended_on: day(-160), last_contact_on: day(-160) }),
    ],
    client_about: [
      { profile_id: ID.priya, coach_id: ME, birthday_month: now.getMonth() + 1, birthday_day: now.getDate(), partner: null, children: null, other: null },
      { profile_id: ID.sam, coach_id: ME, birthday_month: 3, birthday_day: 12, partner: 'Ama', children: 'Kofi and Esi', other: 'Runs marathons, and prefers early calls when travelling.' },
    ],
    client_notes: [
      { id: u(101), profile_id: ID.sam, coach_id: ME, body: 'Prefers early calls when travelling.', noted_on: day(-40), pinned: true, created_at: at(-40) },
      { id: u(102), profile_id: ID.sam, coach_id: ME, body: 'Let Sam raise the CFO first.', noted_on: day(-30), pinned: true, created_at: at(-30) },
      { id: u(103), profile_id: ID.sam, coach_id: ME, body: 'Focus: the restructure. Next time, ask how the CFO conversation went.', noted_on: day(-14), pinned: false, created_at: at(-14) },
    ],
    coach_tags: [
      { id: ID.tagExec, coach_id: ME, name: 'Executive', position: 0 }, { id: ID.tagSport, coach_id: ME, name: 'Sport', position: 1 },
      { id: ID.tagFinance, coach_id: ME, name: 'Finance sector', position: 2 }, { id: ID.tagKestrel, coach_id: ME, name: 'Kestrel', position: 3 },
    ],
    coach_tag_links: [link(ID.tagExec, ID.sam), link(ID.tagFinance, ID.sam), link(ID.tagKestrel, ID.sam), link(ID.tagSport, ID.jordan), link(ID.tagExec, ID.leo), link(ID.tagExec, ID.marcus), link(ID.tagExec, ID.mia)],
    coach_fields: [
      { id: ID.fSector, coach_id: ME, applies_to: 'client', name: 'Sector', kind: 'choice', options: ['Finance', 'Sport', 'Logistics', 'Media', 'Health', 'Food'], position: 0 },
      { id: ID.fValue, coach_id: ME, applies_to: 'client', name: 'Value', kind: 'number', options: [], position: 1 },
      { id: ID.fRenew, coach_id: ME, applies_to: 'client', name: 'Renewal date', kind: 'date', options: [], position: 2 },
    ],
    coach_field_values: [
      value(ID.fSector, ID.sam, { value_text: 'Finance' }), value(ID.fValue, ID.sam, { value_number: 24000 }), value(ID.fRenew, ID.sam, { value_date: day(110) }),
      value(ID.fSector, ID.jordan, { value_text: 'Sport' }), value(ID.fValue, ID.jordan, { value_number: 30000 }),
      value(ID.fSector, ID.priya, { value_text: 'Health' }), value(ID.fValue, ID.priya, { value_number: 6000 }),
      value(ID.fSector, ID.leo, { value_text: 'Logistics' }), value(ID.fValue, ID.leo, { value_number: 13500 }),
      value(ID.fSector, ID.marcus, { value_text: 'Logistics' }), value(ID.fValue, ID.marcus, { value_number: 2000 }),
      value(ID.fSector, ID.mia, { value_text: 'Media' }), value(ID.fValue, ID.mia, { value_number: 16000 }), value(ID.fRenew, ID.mia, { value_date: day(180) }),
    ],
    coach_views: [
      { id: ID.view1, coach_id: ME, list: 'clients', name: 'Executives', filters: { tag: [ID.tagExec] }, sort: 'name', columns: [], layout: 'list', favourite: true, position: 0 },
      { id: ID.view2, coach_id: ME, list: 'clients', name: 'Media sector', filters: { fields: { [ID.fSector]: ['Media'] } }, sort: 'next', columns: [], layout: 'table', favourite: false, position: 1 },
    ],
    engagements: [
      engagement(ID.eSam, ID.sam, { sessions_held: 5, funded_by: 'Kestrel Group' }),
      engagement(ID.eJordan, ID.jordan, { name: 'Full-season coaching', sessions_total: 20, sessions_held: 11 }),
      engagement(ID.ePriya, ID.priya, { sessions_total: 6, sessions_held: 5, ends_on: day(20) }),
      engagement(ID.eMarcus, ID.marcus, { kind: 'pay_as_you_go', name: 'Time credit', sessions_total: null, every_weeks: null, time_credit_minutes: 840, ends_on: null }),
      engagement(ID.eMia, ID.mia, { sessions_held: 1, starts_on: day(-10), ends_on: day(170), created_at: at(-10) }),
      { ...engagement(ID.eGroup, null, { name: 'Leadership team', sessions_total: 6, sessions_held: 2 }), group_id: ID.group },
    ],
    engagement_packs: [],
    engagement_projects: [
      { id: ID.p1, engagement_id: ID.eMarcus, name: 'Leadership offsite design', position: 0 },
      { id: ID.p2, engagement_id: ID.eMarcus, name: 'Team performance check', position: 1 },
      { id: ID.p3, engagement_id: ID.eMarcus, name: 'One-to-one coaching', position: 2 },
    ],
    time_entries: [
      { id: u(201), engagement_id: ID.eMarcus, project_id: ID.p1, coach_id: ME, started_at: at(-20, 9), ended_at: at(-20, 15, 40) },
      { id: u(202), engagement_id: ID.eMarcus, project_id: ID.p2, coach_id: ME, started_at: at(-12, 9), ended_at: at(-12, 12, 30) },
      { id: u(203), engagement_id: ID.eMarcus, project_id: ID.p3, coach_id: ME, started_at: at(-8, 10), ended_at: at(-8, 11, 40) },
    ],
    coach_groups: [{ id: ID.group, coach_id: ME, organisation_id: ID.kestrel, name: 'Kestrel leadership team' }],
    coach_group_members: [
      { id: u(301), group_id: ID.group, profile_id: ID.sam, name: 'Sam Okafor', email: 'sam@example.invalid', counts_against: 'own' },
      { id: u(302), group_id: ID.group, profile_id: null, name: 'Dana Whitfield', email: 'dana@example.invalid', counts_against: 'group' },
      { id: u(303), group_id: ID.group, profile_id: null, name: 'Femi Adeyemi', email: 'femi@example.invalid', counts_against: 'group' },
    ],
    workshops: [
      { id: ID.wsNext, coach_id: ME, organisation_id: ID.northfield, title: 'Leading under pressure', starts_at: at(7, 9, 30), ends_at: at(7, 12, 30), time_zone: 'Europe/London', place: 'In person, Leeds', capacity: 20, page_key: ID.wsNextKey, registration_open: true, registration_closes_on: null, questions: [{ id: 'want', q: 'What do you want from the morning?', kind: 'long', needed: true }, { id: 'role', q: 'Your role', kind: 'short', needed: true }, { id: 'know', q: 'Anything we should know?', kind: 'short', needed: false }], remind_day_before: true, remind_hour_before: false, survey_on: true, survey_questions: [{ id: 'useful', q: 'How useful was it?', kind: 'rating' }, { id: 'recommend', q: 'Would you recommend it?', kind: 'yesno' }, { id: 'differently', q: 'What will you do differently?', kind: 'long' }], survey_sent_on: null, follow_up: null },
      { id: ID.wsPast, coach_id: ME, organisation_id: ID.kestrel, title: 'Decide who decides', starts_at: at(-16, 9), ends_at: at(-16, 12, 30), time_zone: 'Europe/London', place: 'In person, London', capacity: 22, page_key: ID.wsPastKey, registration_open: false, registration_closes_on: null, questions: [], remind_day_before: true, remind_hour_before: false, survey_on: true, survey_questions: [{ id: 'useful', q: 'How useful was it?', kind: 'rating' }, { id: 'recommend', q: 'Would you recommend it?', kind: 'yesno' }, { id: 'differently', q: 'What will you do differently?', kind: 'long' }], survey_sent_on: day(-15), follow_up: 'Thank you for the morning. Here are the slides and the decision rights canvas.' },
    ],
    workshop_attendees: [
      ...Array.from({ length: 18 }, (_, i) => attendee(i + 1, ID.wsNext)),
      ...Array.from({ length: 3 }, (_, i) => attendee(i + 19, ID.wsNext, { status: 'waiting' })),
      ...Array.from({ length: 22 }, (_, i) => attendee(i + 40, ID.wsPast, { attended: i < 19 })),
    ],
    workshop_survey_answers: Array.from({ length: 15 }, (_, i) => ({ id: u(3000 + i), workshop_id: ID.wsPast, attendee_id: u(1040 + i), answers: { useful: i % 3 === 0 ? '4' : '5', recommend: i === 7 ? 'no' : 'yes', differently: i === 0 ? 'Write down who decides before the meeting, not after.' : i === 1 ? 'Stop taking back decisions I have handed over.' : '' }, submitted_at: at(-15) })),
    organisation_contacts: [
      { id: u(401), organisation_id: ID.kestrel, name: 'Dana Whitfield', email: 'dana@example.invalid', mobile: null, job_title: 'Chief of staff', roles: ['sponsor'], note: 'Decides on renewals', last_contact_on: null, last_contact_how: null, created_by: null },
      { id: u(402), organisation_id: ID.kestrel, name: 'Lee Hart', email: 'lee@example.invalid', mobile: null, job_title: 'Finance', roles: ['invoices'], note: 'Invoices go to Lee', last_contact_on: null, last_contact_how: null, created_by: null },
    ],
    organisation_documents: [
      { id: u(501), organisation_id: ID.kestrel, name: 'Master services agreement', storage_path: null, expires_on: null, created_by: null },
      { id: u(502), organisation_id: ID.kestrel, name: 'Non-disclosure agreement', storage_path: null, expires_on: day(11), created_by: null },
    ],
    coach_notifications: [
      { id: u(601), coach_id: ME, kind: 'workshop', title: 'Person 18 registered for Leading under pressure', detail: null, item_kind: 'workshop', item_id: ID.wsNext, created_at: new Date(Date.now() - 10 * 60000).toISOString(), read_at: null },
      { id: u(602), coach_id: ME, kind: 'other', title: 'A client joined the portal', detail: 'Mia Torres', item_kind: 'client', item_id: ID.mia, created_at: new Date(Date.now() - 65 * 60000).toISOString(), read_at: null },
      { id: u(603), coach_id: ME, kind: 'profile', title: 'Your profile is approved', detail: null, item_kind: 'profile', item_id: ME, created_at: at(-2, 8, 15), read_at: at(-2, 9) },
    ],
    activity_log: [
      { id: u(701), actor_id: null, actor_name: 'Alex Morgan', kind: 'export', summary: 'exported 6 clients to a spreadsheet.', item: {}, created_at: at(-1, 9, 12) },
      { id: u(702), actor_id: null, actor_name: 'Alex Morgan', kind: 'move', summary: 'moved Owen Price to Maya Collins.', item: {}, created_at: at(-3, 11) },
    ],
    coach_settings: [{ coach_id: ME, time_zone: 'Europe/London', time_zones: null, second_time_zone: 'America/Chicago', quiet_from: null, quiet_to: null, notifications: {}, phone_notifications: false, working_hours: {}, booking_hours: {}, booking: {}, calendars: {}, email: {}, note_layouts: {} }],
    coach_profiles: [{ coach_id: OTHER, photo_path: null, bio: 'Maya coaches leaders through growth and change.', specialisms: ['Leading through change'], submitted_at: at(-1), approved_at: null, approved_by: null, edit_asked_at: null }],
  };
}

/** Maya's clients, as the owner's admin facts give them (name, coach, engagement and sessions only). */
export const ADMIN_ROWS = () => [
  { profile_id: ID.owen, name: 'Owen Price', coach_id: OTHER, coach_first_name: 'Maya', organisation_id: ID.kestrel, organisation_name: 'Kestrel Group', status: 'active', engagement_kind: 'sessions', sessions_total: 6, sessions_held: 1, time_credit_minutes: null, ends_on: day(70) },
  { profile_id: ID.ella, name: 'Ella Fraser', coach_id: OTHER, coach_first_name: 'Maya', organisation_id: null, organisation_name: null, status: 'paused', engagement_kind: 'sessions', sessions_total: 6, sessions_held: 3, time_credit_minutes: null, ends_on: null },
];

// ---------------------------------------------------------------- the coaching day (Phase 6a run 2)
export const DAY = {
  tagPhone: u(35), tagEmail: u(36), tagWriting: u(37), tagHome: u(38),
  listKestrel: u(4001), listNorthfield: u(4002), listBook: u(4003), listAdmin: u(4004), listBusiness: u(4005),
  headReview: u(4101), headProposal: u(4102),
  t1: u(5001), t2: u(5002), t3: u(5003), t4: u(5004), t5: u(5005), t6: u(5006), t9: u(5009), t10: u(5010), t11: u(5011),
  t12: u(5012), t13: u(5013), t14: u(5014), t15: u(5015), aw1: u(5021), aw2: u(5022),
};

/**
 * M11's own invented to-dos, as the coach's own (coach_todos, never a
 * client's): Today with the Important one, two carried over, the one with
 * a checklist and the one from a forwarded email; two After work;
 * Upcoming and Someday; a dozen done; and the "Kestrel renewal" list with
 * its two headings. Days are counted from today, so the words on screen
 * ("From yesterday", "Tomorrow") stay true whenever a test runs.
 * Returns rows by table; `seedWithDay()` adds them to `seedRows()`.
 */
export function daySeed({ over = false } = {}) {
  let n = 0;
  const todo = (id, title, extra = {}) => {
    n += 1;
    const planned = extra.planned_on ?? null;
    return {
      id, coach_id: ME, title, notes: null, important: false, planned_on: planned, planned_time: null, first_planned_on: null, due_on: null, minutes: null,
      list_id: null, heading_id: null, profile_id: null, lead_id: null, repeat_rule: null, repeat_of: null, remind: false, someday: !planned, after_work: false,
      checklist: [], position: n * 1000, done_at: null, from_email_sender: null, from_email_subject: null, from_email_at: null, created_at: at(-9, 9, n), ...extra,
    };
  };
  const tag = (tagId, todoId) => ({ tag_id: tagId, item_kind: 'todo', item_id: todoId, coach_id: ME });
  const done = ['Send Hannah the recap', 'Book the Leeds room', 'Reply to Jack Moran', 'Write issue 148 of Leading Ideas', 'Pay the Zoom invoice', 'Confirm the Kestrel room',
    'Send Mia the welcome pack', 'Update the workshop slides', 'Reply to Dana about the review', 'Order the printed workbooks', 'File the October expenses', 'Thank Dan for the referral'];
  return {
    coach_tags: [
      { id: DAY.tagPhone, coach_id: ME, name: 'Phone', position: 4 }, { id: DAY.tagEmail, coach_id: ME, name: 'Email', position: 5 },
      { id: DAY.tagWriting, coach_id: ME, name: 'Writing', position: 6 }, { id: DAY.tagHome, coach_id: ME, name: 'Home', position: 7 },
    ],
    coach_todo_lists: [
      { id: DAY.listKestrel, coach_id: ME, name: 'Kestrel renewal', profile_id: null, organisation_id: ID.kestrel, position: 1, finished_at: null },
      { id: DAY.listNorthfield, coach_id: ME, name: 'Northfield workshop', profile_id: null, organisation_id: ID.northfield, position: 2, finished_at: null },
      { id: DAY.listBook, coach_id: ME, name: 'The book', profile_id: null, organisation_id: null, position: 3, finished_at: null },
      { id: DAY.listAdmin, coach_id: ME, name: 'Admin', profile_id: null, organisation_id: null, position: 4, finished_at: null },
      { id: DAY.listBusiness, coach_id: ME, name: 'Business', profile_id: null, organisation_id: null, position: 5, finished_at: null },
    ],
    coach_todo_headings: [
      { id: DAY.headReview, list_id: DAY.listKestrel, coach_id: ME, name: 'Before the review', position: 1 },
      { id: DAY.headProposal, list_id: DAY.listKestrel, coach_id: ME, name: 'The proposal', position: 2 },
    ],
    coach_todos: [
      // Today
      todo(DAY.t1, 'Renew professional indemnity insurance', { planned_on: day(0), important: true, due_on: day(3), list_id: DAY.listAdmin, minutes: 30 }),
      todo(DAY.t9, 'Reply to Elena Ruiz', { planned_on: day(0), minutes: 15 }),
      todo(DAY.t10, 'Check in with Tom Hale on his decision', { planned_on: day(-4), minutes: 15 }),
      todo(DAY.t2, 'Send Sam the decision rights article', { planned_on: day(0), profile_id: ID.sam, minutes: 15 }),
      todo(DAY.t3, 'Draft the Northfield workshop outline', { planned_on: day(-1), list_id: DAY.listNorthfield, minutes: 120, checklist: [{ text: 'Opening exercise', done: true }, { text: 'Decision rights canvas', done: true }, { text: 'Close and survey', done: false }] }),
      todo(DAY.t11, 'Reply to Ruth about the January start', { planned_on: day(0), minutes: 15, from_email_sender: 'Ruth Adams', from_email_subject: 'The January start', from_email_at: at(-1, 16, 20) }),
      // After work
      todo(DAY.aw1, 'Book the boiler service', { planned_on: day(0), after_work: true }),
      todo(DAY.aw2, 'Collect the dry cleaning', { planned_on: day(0), after_work: true }),
      // Upcoming
      todo(DAY.t4, 'Call Priya about the keynote', { planned_on: day(1), planned_time: '10:00', profile_id: ID.priya, minutes: 15 }),
      todo(DAY.t13, 'Pull Sam’s progress for the review', { planned_on: day(1), list_id: DAY.listKestrel, heading_id: DAY.headReview, minutes: 30 }),
      todo(DAY.t5, 'Write issue 149 of Leading Ideas', { planned_on: day(2), list_id: DAY.listBusiness, repeat_rule: { every: 'week' } }),
      todo(DAY.t12, 'Send the Kestrel proposal', { planned_on: day(3), planned_time: '09:15', due_on: day(3), important: true, list_id: DAY.listKestrel, heading_id: DAY.headProposal }),
      todo(DAY.t14, 'Check in with Marcus on the offsite', { planned_on: day(4), profile_id: ID.marcus }),
      todo(DAY.t15, 'Agree the review date with Dana', { planned_on: day(4), list_id: DAY.listKestrel, heading_id: DAY.headReview }),
      todo(DAY.t6, 'Send the invoice summary to the accountant', { planned_on: day(12), list_id: DAY.listAdmin, repeat_rule: { every: 'month' } }),
      // Someday
      todo(u(5031), 'Read the new ICF ethics guidance', { list_id: DAY.listAdmin }),
      todo(u(5032), 'Sketch a workshop on decision rights', { list_id: DAY.listBusiness }),
      todo(u(5033), 'Outline chapter 3, pressure and sleep', { list_id: DAY.listBook }),
      todo(u(5034), 'Ask Ana for the agent’s email', { list_id: DAY.listBook }),
      // Done
      ...done.map((title, i) => todo(u(5101 + i), title, { planned_on: day(i < 7 ? 0 : -1), done_at: at(i < 7 ? 0 : -1, 8, 50 - i) })),
    ],
    coach_tag_links: [
      tag(DAY.tagEmail, DAY.t9), tag(DAY.tagPhone, DAY.t10), tag(DAY.tagEmail, DAY.t2), tag(DAY.tagWriting, DAY.t3),
      tag(DAY.tagHome, DAY.aw1), tag(DAY.tagPhone, DAY.aw1), tag(DAY.tagHome, DAY.aw2), tag(DAY.tagPhone, DAY.t4), tag(DAY.tagWriting, DAY.t5),
      tag(ID.tagKestrel, DAY.t15), tag(DAY.tagEmail, DAY.t15), tag(DAY.tagWriting, u(5032)), tag(DAY.tagWriting, u(5033)),
    ],
    coach_sessions: sessionSeed({ over }),
  };
}

/**
 * Today's sessions (M11's): on a Friday Marcus, Mia and the Kestrel group;
 * on any other day Sam at 12:30, the Kestrel group at 14:00, Jordan at
 * 15:45 (09:45 in Chicago) and Priya at 17:00. With them: yesterday's
 * session with Marcus, not written up; a session with Leo 2 days ago that
 * went ahead, its recap typed and not sent; enough others this week (the
 * past ones held and sent) that capacity reads 11 of 15 over 12 calls, or
 * 17 of 15 over 18 with `over`; and next week's 15 calls, the busiest on
 * Tuesday and Thursday.
 */
function sessionSeed({ over = false } = {}) {
  let n = 0;
  const session = (offset, hour, minute, minutes, who, extra = {}) => {
    n += 1;
    return {
      id: u(6000 + n), coach_id: ME, profile_id: null, group_id: null, engagement_id: null, kind: who.group_id ? 'group' : 'coaching', starts_at: at(offset, hour, minute), minutes,
      place: null, outcome: null, waived: false, moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null, created_at: at(-20), ...who, ...extra,
    };
  };
  const client = (id) => ({ profile_id: id });
  const sent = (offset) => ({ outcome: 'held', written_up_at: at(offset, 18), recap: 'We agreed the next two steps.', recap_sent_at: at(offset, 18, 5) });
  const dow = (base().getDay() + 6) % 7; // Monday 0
  const today = dow === 4
    ? [session(0, 11, 30, 60, client(ID.marcus)), session(0, 14, 0, 60, client(ID.mia)), session(0, 16, 15, 90, { group_id: ID.group })]
    : [session(0, 12, 30, 60, client(ID.sam)), session(0, 14, 0, 90, { group_id: ID.group }), session(0, 15, 45, 60, client(ID.jordan)), session(0, 17, 0, 60, client(ID.priya))];
  const special = [
    session(-1, 13, 0, 60, client(ID.marcus)),
    session(-2, 14, 0, 60, client(ID.leo), { outcome: 'held', written_up_at: at(-2, 16), recap: 'Leo will bring the rota to the next call.' }),
  ];
  // This week (Monday to Saturday) apart from today: filled to 12 calls and 11 hours with today's and the two above.
  const inWeek = (offset) => dow + offset >= 0 && dow + offset <= 6;
  const k = special.filter((_, i) => inWeek(-1 - i)).length;
  const todayMinutes = today.reduce((sum, x) => sum + x.minutes, 0);
  const lengths = [...Array(3).fill(30), ...Array(Math.max(0, (660 - todayMinutes - 60 * k - 90) / 60)).fill(60), ...(over ? Array(6).fill(60) : [])];
  const offsets = [-dow, 1 - dow, 2 - dow, 3 - dow, 4 - dow, 5 - dow].filter((o) => o !== 0);
  const people = [ID.sam, ID.priya, ID.jordan, ID.mia, ID.marcus];
  const rest = lengths.map((minutes, i) => {
    const offset = offsets[i % offsets.length];
    const slot = Math.floor(i / offsets.length);
    return session(offset, 8 + slot * 2, 30, minutes, client(people[i % people.length]), offset < 0 ? sent(offset) : {});
  });
  // Next week: Mon 3, Tue 4, Wed 2, Thu 4, Fri 2.
  const next = [3, 4, 2, 4, 2].flatMap((count, d) => Array.from({ length: count }, (_, i) => session(7 - dow + d, 9 + i * 2, 0, 60, client(people[(d + i) % people.length]))));
  return [...today, ...special, ...rest, ...next];
}

/** Invented shared work peak moments for the pressure forecast, as the database would answer a coach: `clientUsers` gives each client an account's id. */
export const PRESSURE = {
  users: { [ID.sam]: u(7001), [ID.priya]: u(7002), [ID.jordan]: u(7003) },
  moments: () => [
    { id: u(7101), user_id: u(7001), name: 'Board meeting', area: 'work', kind: 'perform', starts_on: day(1), ends_on: day(1), place_city: null, place_zone: null, repeat_rule: null, shared: true },
    { id: u(7102), user_id: u(7002), name: 'Keynote at the Leeds Leaders Forum', area: 'work', kind: 'perform', starts_on: day(2), ends_on: day(2), place_city: null, place_zone: null, repeat_rule: null, shared: true },
    { id: u(7103), user_id: u(7003), name: 'v Rangers, away', area: 'work', kind: 'perform', starts_on: day(4), ends_on: day(4), place_city: 'New York', place_zone: 'America/New_York', repeat_rule: null, shared: true },
  ],
};

/**
 * `seedRows()` with the coaching day's rows added (tags and tag links are joined, not replaced).
 * The working day is 09:30 to 16:45 on weekdays, so M11's Tuesday (4 hours 30 minutes of calls and
 * 3 hours 30 minutes of to-dos) is 45 minutes over; Priya has 2 sessions left and Jordan 1.
 * @param {{ over?: boolean, accounts?: boolean, sessions?: boolean }} options `over`: a week over capacity (17 of 15); `accounts`: three clients have accounts (PRESSURE.users);
 *   `sessions`: Hannah Wells and her sessions, a group's past sessions, and the actions and note behind Sam's brief (sessionExtras)
 */
export function seedWithDay({ over = false, accounts = false, sessions = false } = {}) {
  const rows = seedRows();
  for (const [table, list] of Object.entries(daySeed({ over }))) rows[table] = [...(rows[table] || []), ...list];
  if (sessions) {
    // Sam's last session was on Thu 5 Nov on M11's Tuesday (12 days back): his earlier calls this week go to Mia, so the week's count stays as it was.
    const start = at(0, 0, 0);
    rows.coach_sessions = rows.coach_sessions.map((x) => (x.profile_id === ID.sam && x.starts_at < start ? { ...x, profile_id: ID.mia } : x));
    for (const [table, list] of Object.entries(sessionExtras(rows))) rows[table] = [...(rows[table] || []), ...list];
  }
  const hours = { from: '09:30', to: '16:45' };
  rows.coach_settings = rows.coach_settings.map((s) => ({ ...s, working_hours: { mon: hours, tue: hours, wed: hours, thu: hours, fri: hours } }));
  rows.engagements = rows.engagements.map((e) => (e.id === ID.ePriya ? { ...e, sessions_held: 4 } : e.id === ID.eJordan ? { ...e, sessions_held: 19 } : e));
  if (accounts) rows.client_profiles = rows.client_profiles.map((p) => (PRESSURE.users[p.id] ? { ...p, user_id: PRESSURE.users[p.id] } : p));
  return rows;
}

// ---------------------------------------------------------------- the brief, after a call and the guided close (Phase 6a run 2, steps 4 and 5)
export const SES = {
  hannah: u(18), eHannah: u(57),
  write: u(6901), late: u(6902), sent: u(6903), future: u(6904), blank: u(6905), group1: u(6906), group2: u(6907), samLast: u(6908),
  a1: u(6911), a2: u(6912), a3: u(6913), s1: u(6921), s2: u(6922), b1: u(6931), b2: u(6932), b3: u(6933),
  samUser: u(7001), priyaUser: u(7002),
};

/**
 * M11's own "After a call": Hannah Wells, whose session yesterday at 15:30
 * went ahead and is written up (the recap typed, three actions, not sent);
 * her late cancellation, an earlier session whose recap was sent (locked),
 * one next week and one that has ended and isn't written up. The Kestrel
 * group's two past sessions, each with one recap sent. And behind Sam's
 * brief: three actions sent with his last session (two done) and the
 * coach's note for next time. None is in this week's count of calls except
 * Hannah's two (kept out of the default seed, so Today's own walk stays as it was).
 * @param {object} rows the seed so far (its coach_sessions decide which of Sam's sessions was the last)
 */
export function sessionExtras(rows) {
  const session = (id, offset, hour, minute, minutes, who, extra = {}) => ({
    id, coach_id: ME, profile_id: null, group_id: null, engagement_id: null, kind: who.group_id ? 'group' : 'coaching', starts_at: at(offset, hour, minute), minutes,
    place: null, outcome: null, waived: false, moved_to: null, written_up_at: null, recap: null, recap_sent_at: null, recap_sent_by: null, created_at: at(-40), ...who, ...extra,
  });
  const hannah = { profile_id: SES.hannah, engagement_id: SES.eHannah };
  const action = (id, sessionId, title, position, extra = {}) => ({ id, session_id: sessionId, coach_id: ME, title, send: true, goes_to: 'week', position, done_at: null, placed_at: null, ...extra });
  const recap = 'Thanks for today, Hannah.\n\nWe looked at the pricing launch and where your time goes in the week before it. You named two things only you can do: the investor call and the pricing story for the sales team.\n\nYou’re handing the rest of the launch plan to Femi, with a 15-minute check-in each morning.';
  // Sam's last session that went ahead before today's call: 12 days back, its recap sent.
  const samLast = session(SES.samLast, -12, 12, 30, 60, { profile_id: ID.sam, engagement_id: ID.eSam }, { outcome: 'held', written_up_at: at(-12, 14), recap: 'Thanks for today, Sam.\n\nYou set out who decides what with the COO.', recap_sent_at: at(-12, 14, 10) });
  return {
    client_profiles: [{ ...rows.client_profiles[0], id: SES.hannah, name: 'Hannah Wells', email: 'hannah@example.invalid', organisation_id: null, job_title: 'Founder', city: 'Bristol', mobile: null, referred_by: null, last_contact_on: day(-1), invited_at: at(-80), getting_started: { first_review: true, welcome_pack: true } }],
    engagements: [{ ...rows.engagements[0], id: SES.eHannah, profile_id: SES.hannah, name: '6-month coaching', sessions_total: 12, sessions_held: 3, funded_by: null }],
    coach_sessions: [
      samLast,
      session(SES.write, -1, 15, 30, 60, hannah, { outcome: 'held', written_up_at: at(-1, 17), recap }),
      session(SES.late, -15, 15, 30, 60, hannah, { outcome: 'late_cancel', written_up_at: at(-15, 16) }),
      session(SES.sent, -29, 15, 30, 60, hannah, { outcome: 'held', written_up_at: at(-29, 17), recap: 'Thanks for today, Hannah.\n\nYou chose the two launch markets, and the three calls that will tell you whether they are right.', recap_sent_at: at(-29, 17, 5) }),
      session(SES.future, 6, 10, 0, 60, hannah),
      session(SES.blank, -3, 11, 0, 60, hannah),
      session(SES.group1, -14, 14, 0, 90, { group_id: ID.group, engagement_id: ID.eGroup }, { outcome: 'held', written_up_at: at(-14, 16), recap: 'Thank you all. We agreed who decides on pricing.', recap_sent_at: at(-14, 16, 30) }),
      session(SES.group2, -28, 14, 0, 90, { group_id: ID.group, engagement_id: ID.eGroup }, { outcome: 'held', written_up_at: at(-28, 16), recap: 'Thank you all. We mapped the decisions that are stuck.', recap_sent_at: at(-28, 16, 30) }),
    ],
    coach_session_people: [
      { session_id: SES.group1, profile_id: ID.sam, engagement_id: ID.eSam },
      { session_id: SES.group2, profile_id: ID.sam, engagement_id: ID.eSam },
    ],
    coach_session_actions: [
      action(SES.a1, SES.write, 'Hand the launch plan to Femi by Wednesday', 1),
      action(SES.a2, SES.write, 'Book a 15-minute check-in each morning', 2, { goes_to: 'backlog' }),
      action(SES.a3, SES.write, 'Write the pricing story on one page', 3, { send: false }),
      action(SES.s1, SES.sent, 'Call the three launch customers', 1, { done_at: at(-20) }),
      action(SES.s2, SES.sent, 'Draft the pricing page', 2, { goes_to: 'backlog' }),
      ...(samLast ? [
        action(SES.b1, samLast.id, 'Agree decision rights with the COO', 1, { done_at: at(-1, 8) }),
        action(SES.b2, samLast.id, 'Block two strategy mornings a week', 2, { done_at: at(-1, 8, 5) }),
        action(SES.b3, samLast.id, 'Draft the restructure announcement', 3),
      ] : []),
    ],
    coach_session_notes: [
      { session_id: SES.sent, coach_id: ME, layout: 'regular', focus: 'Choosing the launch markets.', insight: 'Hannah decides fastest when she talks it through.', next_time: 'Ask what the three calls showed.', supervision: null },
      ...(samLast ? [{ session_id: samLast.id, coach_id: ME, layout: 'regular', focus: 'The restructure.', insight: null, next_time: 'Ask how the CFO conversation went.', supervision: null }] : []),
    ],
  };
}

/** What a client shares, as the database would answer their coach: For next time, week scores, a peak review and the monthly reviews. */
export const SHARED = {
  prep: () => ({ body: 'I want to talk about the restructure, and how to bring the CFO with me.', noted_at: at(-2, 19) }),
  weekScores: () => [{ week_end: day(-2), score: 84 }, { week_end: day(-9), score: 78 }, { week_end: day(-30), score: 60 }],
  moments: (userId) => [
    { id: u(7201), user_id: userId, name: 'Investor update', area: 'work', kind: 'perform', starts_on: day(-5), ends_on: day(-5), place_city: null, place_zone: null, repeat_rule: null, shared: true },
    { id: u(7101), user_id: userId, name: 'Board meeting', area: 'work', kind: 'perform', starts_on: day(1), ends_on: day(1), place_city: null, place_zone: null, repeat_rule: null, shared: true },
  ],
  reviews: () => [{ moment_id: u(7201), occurs_on: day(-5), answer: 'well', kept: 'I kept to three messages.', lesson: 'Bring the CFO in earlier on the numbers.' }],
  checkins: () => [
    { kind: 'first', month: `${day(-180).slice(0, 7)}-01`, status: 'finished', hardware_score: 52, software_score: 58, goals: { G1: 'I’d lead the theatre list without taking it home.', G3: ['Sleep 7 hours on work nights', 'Stay calm in the quarterly review', 'Delegate the weekly report'] } },
    { kind: 'monthly', month: `${day(-10).slice(0, 7)}-01`, status: 'finished', hardware_score: 71, software_score: 76, goals: null },
  ],
};

// ---------------------------------------------------------------- the calendar and booking (Phase 6a run 3; migration 051)
export const CAL = {
  // call types and their pages
  chem: u(8001), conn: u(8002), chemKey: u(8003), connKey: u(8004),
  // single-use links
  linkDana: u(8011), linkPaul: u(8012), linkDanaKey: u(8013), linkPaulKey: u(8014),
  // the poll, its people, their own keys, its three times and their held times
  poll: u(8021), pollMia: u(8022), pollPaul: u(8023), pollMiaKey: u(8024), pollPaulKey: u(8025), opt1: u(8026), opt2: u(8027), opt3: u(8028),
  hold1: u(8031), hold2: u(8032), hold3: u(8033),
  // this week's items, as M11's Calendar draws them (Mon 16 to Fri 20 Nov 2026 in M11)
  training: u(8101), hannahMon: u(8102), miaMon: u(8103), swimming: u(8104),
  samTue: u(8111), kestrelTue: u(8112), jordanTue: u(8113), priyaTue: u(8114), parents: u(8115),
  writing: u(8121), coffeeDan: u(8122), ruth: u(8123), admin: u(8124), noraWed: u(8125),
  travelOut: u(8131), leoThu: u(8132), travelBack: u(8133), supervision: u(8134), dinner: u(8135), calebThu: u(8136), dentist: u(8137),
  nadia: u(8141), marcusFri: u(8142), hannahFri: u(8143), kestrelFri: u(8144), sarah: u(8145),
  // next week
  conference: u(8151), open1: u(8161), open2: u(8162), open3: u(8163),
  // what the two bookings made
  bookRuth: u(8171), bookNadia: u(8172), bookRuthKey: u(8173), bookNadiaKey: u(8174), leadRuth: u(8181), leadNadia: u(8182),
  guestDana: u(8191), guestMaya: u(8192),
  todoProposal: u(8201),
};

/**
 * M11's own invented week on the calendar (its "Calendar" screen: Mon 16 to
 * Fri 20 Nov 2026), placed on the week the seed's "today" is in, so it is
 * this week whenever a test runs (pin the day with seedClock for M11's own
 * Tuesday). As migration 051 keeps it:
 *   - coach_cal_items: Training (a repeat, every Monday and Tuesday), the
 *     client calls (each anchored to the client's own zone: Mia at 09:00 New
 *     York time, Jordan at 09:45 and Caleb at 08:30 Chicago time, Nora at
 *     09:00 Los Angeles time), the group's calls, Writing, Admin, a
 *     Connection Call and two booked through the pages (Ruth, a Chemistry
 *     Call; Nadia, a Connection Call), Leo in person with travel time either
 *     side, Supervision with Maya, the Leaders' dinner, the family and
 *     personal items (Swimming with Esme, Parents' evening, Dentist, Dinner
 *     with Sarah), three times held for a poll, and next week an all-day
 *     conference over two days (not in M11: an example of one);
 *   - the Chemistry Call and Connection Call types with their pages, two
 *     open single-use links (for Dana Whitfield and Paul Garner), next week's
 *     Open for calls blocks (M11's "Open for calls"), the poll "Three-way
 *     meeting" with Mia's and Paul's answers, the two bookings and the leads
 *     they made, and the guests of two items.
 * "Send the Kestrel proposal" on Friday at 09:15 is a to-do placed on the
 * calendar: it stays a coach_todos row (the day seed's DAY.t12 when the day
 * seed is used; CAL.todoProposal here), never a calendar item.
 * Returns rows by table; `seedWithCal()` adds them to `seedWithDay()`.
 */
export function calSeed() {
  const b = base();
  const p2 = (n) => String(n).padStart(2, '0');
  const todayKey = `${b.getFullYear()}-${p2(b.getMonth() + 1)}-${p2(b.getDate())}`;
  const monday = addDays(todayKey, 1 - weekdayOf(todayKey));
  const LON = 'Europe/London';
  /** A day of this week (0 Monday) and a clock time in a zone, as an instant. */
  const when = (d, time, zone = LON) => instantAt(addDays(monday, d), time, zone).toISOString();
  const made = when(-21, '09:00');
  const item = (id, title, kind, d, from, to, extra = {}) => {
    const zone = extra.time_zone || LON;
    return {
      id, coach_id: ME, kind, calendar: 'work', title, starts_at: when(d, from, zone), ends_at: when(d, to, zone), time_zone: zone, all_day: false, starts_on: null, ends_on: null,
      repeat_rule: null, series_id: null, occurrence_on: null, removed: false, split_from: null, location: null, place_kind: null, meeting_link: null, meeting_id: null, notes: null, attachments: [],
      reminders: [], busy: true, private: false, profile_id: null, group_id: null, session_id: null, poll_option_id: null, travel_for: null, google_event_id: null, google_calendar_id: null,
      google_etag: null, google_synced_at: null, moved_in_google_at: null, created_at: made, ...extra,
    };
  };
  let z = 0;
  const zoom = () => { z += 1; return { place_kind: 'zoom', meeting_link: `https://zoom.example.invalid/j/${9000 + z}` }; };
  const call = (id, title, d, from, to, extra = {}) => item(id, title, 'client_call', d, from, to, { ...zoom(), reminders: [{ minutes: 60, by: 'email' }], ...extra });
  const life = (id, title, calendar, d, from, to) => item(id, title, 'other', d, from, to, { calendar, private: true });
  const option = (id, d, from, to, position) => ({ id, poll_id: CAL.poll, coach_id: ME, starts_at: when(d, from), ends_at: when(d, to), position, created_at: made });
  const hold = (id, optionId, d, from, to) => item(id, 'Mia and Paul', 'hold', d, from, to, { poll_option_id: optionId });
  const type = (id, key, name, pageKey, notice, ahead, position, questions) => ({
    id, coach_id: ME, key, name, description: null, minutes: 30, gap_before: 15, gap_after: 15, notice_hours: notice, ahead_weeks: ahead, day_limit: 5, questions, place_kind: 'zoom',
    page_key: pageKey, active: true, makes_lead: true, position, created_at: made,
  });
  const link = (id, key, purpose, forName) => ({
    id, coach_id: ME, key, purpose, for_name: forName, for_email: null, call_name: null, profile_id: null, minutes: 30, place_kind: 'zoom', notice_hours: 24, ahead_weeks: 4, expires_on: null,
    used_at: null, booking_id: null, revoked_at: null, created_at: when(-2, '10:00'),
  });
  const booked = (id, key, typeId, itemId, leadId, name, d, from, to) => ({
    id, coach_id: ME, call_type_id: typeId, link_id: null, item_id: itemId, session_id: null, profile_id: null, lead_id: leadId, name, email: `${name.split(' ')[0].toLowerCase()}@example.invalid`, time_zone: LON,
    starts_at: when(d, from), ends_at: when(d, to), answers: { q1: 'To think out loud about what comes next.' }, status: 'booked', source: 'page', guest_key: key, moved_from: null, moved_at: null,
    cancelled_at: null, late_cancel: false, moved_in_google_at: null, created_at: when(-4, '18:20'),
  });
  const lead = (id, name, source, key, bookingId) => ({
    id, coach_id: ME, name, email: `${name.split(' ')[0].toLowerCase()}@example.invalid`, source, call_type_key: key, booking_id: bookingId, time_zone: LON, answers: { q1: 'To think out loud about what comes next.' },
    status: 'new', notes: null, created_at: when(-4, '18:20'),
  });
  const block = (id, d, from, to) => ({ id, coach_id: ME, starts_at: when(d, from), ends_at: when(d, to), time_zone: LON, call_type_id: null, created_at: made });
  return {
    coach_call_types: [
      type(CAL.chem, 'chemistry', 'Chemistry Call', CAL.chemKey, 24, 4, 0, [{ id: 'q1', label: 'What would you like from the call?', kind: 'long', required: true }]),
      type(CAL.conn, 'connection', 'Connection Call', CAL.connKey, 48, 2, 1, [{ id: 'q1', label: 'What would you like to talk about?', kind: 'long', required: false }]),
    ],
    coach_polls: [{ id: CAL.poll, coach_id: ME, title: 'Three-way meeting', minutes: 60, place_kind: 'zoom', time_zone: LON, status: 'open', confirmed_option_id: null, confirmed_item_id: null, notes: null, created_at: when(-3, '11:00') }],
    coach_poll_people: [
      { id: CAL.pollMia, poll_id: CAL.poll, coach_id: ME, name: 'Mia Torres', email: 'mia@example.invalid', profile_id: ID.mia, time_zone: 'America/New_York', vote_key: CAL.pollMiaKey, voted_at: when(-2, '15:00'), position: 0, created_at: when(-3, '11:00') },
      { id: CAL.pollPaul, poll_id: CAL.poll, coach_id: ME, name: 'Paul Garner', email: 'paul@example.invalid', profile_id: null, time_zone: LON, vote_key: CAL.pollPaulKey, voted_at: when(-2, '16:30'), position: 1, created_at: when(-3, '11:00') },
    ],
    coach_poll_options: [option(CAL.opt1, 0, '17:00', '18:00', 0), option(CAL.opt2, 3, '17:00', '18:00', 1), option(CAL.opt3, 4, '15:00', '16:00', 2)],
    // M11's poll: Mon, Mia can and Paul can't; Thu, everyone can; Fri, Mia can't and Paul can.
    coach_poll_votes: [
      { option_id: CAL.opt1, person_id: CAL.pollMia, can: true, voted_at: when(-2, '15:00') }, { option_id: CAL.opt1, person_id: CAL.pollPaul, can: false, voted_at: when(-2, '16:30') },
      { option_id: CAL.opt2, person_id: CAL.pollMia, can: true, voted_at: when(-2, '15:00') }, { option_id: CAL.opt2, person_id: CAL.pollPaul, can: true, voted_at: when(-2, '16:30') },
      { option_id: CAL.opt3, person_id: CAL.pollMia, can: false, voted_at: when(-2, '15:00') }, { option_id: CAL.opt3, person_id: CAL.pollPaul, can: true, voted_at: when(-2, '16:30') },
    ],
    coach_booking_links: [link(CAL.linkDana, CAL.linkDanaKey, 'Sponsor call', 'Dana Whitfield'), link(CAL.linkPaul, CAL.linkPaulKey, 'Three-way meeting', 'Paul Garner')],
    coach_leads: [lead(CAL.leadRuth, 'Ruth Adeyemi', 'chemistry_page', 'chemistry', CAL.bookRuth), lead(CAL.leadNadia, 'Nadia Osei', 'connection_page', 'connection', CAL.bookNadia)],
    coach_cal_items: [
      // Monday
      item(CAL.training, 'Training', 'own_time', -28, '09:45', '12:00', { repeat_rule: { every: 'week', weekdays: [1, 2] } }),
      call(CAL.hannahMon, 'Hannah Wells', 0, '15:30', '16:30'),
      call(CAL.miaMon, 'Mia Torres', 0, '09:00', '10:00', { time_zone: 'America/New_York', profile_id: ID.mia }),
      life(CAL.swimming, 'Swimming with Esme', 'family', 0, '18:00', '19:00'),
      hold(CAL.hold1, CAL.opt1, 0, '17:00', '18:00'),
      // Tuesday
      call(CAL.samTue, 'Sam Okafor', 1, '12:30', '13:30', { profile_id: ID.sam }),
      call(CAL.kestrelTue, 'Kestrel leadership team', 1, '14:00', '15:30', { group_id: ID.group }),
      call(CAL.jordanTue, 'Jordan Reyes', 1, '09:45', '10:45', { time_zone: 'America/Chicago', profile_id: ID.jordan }),
      call(CAL.priyaTue, 'Priya Nair', 1, '17:00', '18:00', { profile_id: ID.priya }),
      life(CAL.parents, 'Parents’ evening', 'family', 1, '19:00', '20:30'),
      // Wednesday
      item(CAL.writing, 'Writing', 'writing', 2, '09:00', '12:00'),
      item(CAL.coffeeDan, 'Coffee with Dan Reid', 'connection', 2, '12:30', '13:00', { place_kind: 'in_person', location: 'The Lighthouse café' }),
      item(CAL.ruth, 'Ruth Adeyemi', 'chemistry', 2, '13:00', '13:30', zoom()),
      item(CAL.admin, 'Admin', 'admin', 2, '14:00', '16:00'),
      call(CAL.noraWed, 'Nora Ellis', 2, '09:00', '10:00', { time_zone: 'America/Los_Angeles' }),
      // Thursday
      life(CAL.dentist, 'Dentist', 'personal', 3, '08:00', '09:00'),
      item(CAL.travelOut, 'Travel', 'travel', 3, '11:30', '12:00', { travel_for: CAL.leoThu }),
      call(CAL.leoThu, 'Leo Grant', 3, '12:00', '13:00', { profile_id: ID.leo, place_kind: 'in_person', meeting_link: null, location: 'Northfield Logistics, Leeds' }),
      item(CAL.travelBack, 'Travel', 'travel', 3, '13:00', '13:30', { travel_for: CAL.leoThu }),
      call(CAL.calebThu, 'Caleb Hunt', 3, '08:30', '09:30', { time_zone: 'America/Chicago' }),
      item(CAL.supervision, 'Supervision with Maya', 'other', 3, '16:00', '17:00', zoom()),
      item(CAL.dinner, 'Leaders’ dinner, Birmingham', 'event', 3, '18:30', '20:30', { place_kind: 'in_person', location: 'Birmingham' }),
      hold(CAL.hold2, CAL.opt2, 3, '17:00', '18:00'),
      // Friday
      call(CAL.marcusFri, 'Marcus Bell', 4, '11:30', '12:30', { profile_id: ID.marcus }),
      item(CAL.nadia, 'Nadia Osei', 'connection', 4, '12:30', '13:00', zoom()),
      call(CAL.hannahFri, 'Hannah Wells', 4, '14:00', '15:00'),
      call(CAL.kestrelFri, 'Kestrel leadership team', 4, '16:15', '17:45', { group_id: ID.group }),
      life(CAL.sarah, 'Dinner with Sarah', 'personal', 4, '18:00', '20:00'),
      hold(CAL.hold3, CAL.opt3, 4, '15:00', '16:00'),
      // Next week: all day, over two days.
      { ...item(CAL.conference, 'Leading Teams conference', 'event', 9, '00:00', '00:00', { location: 'Manchester' }), ends_at: when(11, '00:00'), all_day: true, starts_on: addDays(monday, 9), ends_on: addDays(monday, 10) },
    ],
    coach_cal_guests: [
      { id: CAL.guestMaya, item_id: CAL.supervision, coach_id: ME, name: 'Maya Collins', email: null, profile_id: null, guest_coach_id: OTHER, contact_id: null, reply: 'yes', replied_at: when(-1, '09:10'), invited_at: when(-3, '12:00'), position: 0, created_at: made },
      { id: CAL.guestDana, item_id: CAL.dinner, coach_id: ME, name: 'Dana Whitfield', email: 'dana@example.invalid', profile_id: null, guest_coach_id: null, contact_id: null, reply: 'maybe', replied_at: when(-1, '14:00'), invited_at: when(-3, '12:00'), position: 0, created_at: made },
    ],
    // M11's "Open for calls": next week, Mon 14:00 to 16:00, Thu 13:30 to 15:00, Fri 14:00 to 16:00.
    coach_open_blocks: [block(CAL.open1, 7, '14:00', '16:00'), block(CAL.open2, 10, '13:30', '15:00'), block(CAL.open3, 11, '14:00', '16:00')],
    coach_bookings: [
      booked(CAL.bookRuth, CAL.bookRuthKey, CAL.chem, CAL.ruth, CAL.leadRuth, 'Ruth Adeyemi', 2, '13:00', '13:30'),
      booked(CAL.bookNadia, CAL.bookNadiaKey, CAL.conn, CAL.nadia, CAL.leadNadia, 'Nadia Osei', 4, '12:30', '13:00'),
    ],
    coach_cal_reminder_sends: [],
    // The placed to-do, for a seed without the day's own (seedWithCal leaves it out: DAY.t12 is the same to-do).
    coach_todos: [{
      id: CAL.todoProposal, coach_id: ME, title: 'Send the Kestrel proposal', notes: null, important: true, planned_on: addDays(monday, 4), planned_time: '09:15', first_planned_on: null, due_on: addDays(monday, 4), minutes: 30,
      list_id: null, heading_id: null, profile_id: null, lead_id: null, repeat_rule: null, repeat_of: null, remind: false, someday: false, after_work: false, checklist: [], position: 1, done_at: null,
      from_email_sender: null, from_email_subject: null, from_email_at: null, created_at: made,
    }],
  };
}

/**
 * Everything: seedWithDay() and the calendar's week. A client call's item is tied to the day seed's session for the same client
 * or group at the same moment (session_id), so the calendar, Today and the next-call bar agree; a seeded session with no item of
 * its own is still a session (the calendar's rules decide how it shows). M11's placed to-do is the day seed's own.
 * Settings gain M11's Booking limits as numbers, My calendars' switches and the working hours M11's "Working hours" screen draws.
 */
export function seedWithCal(options = {}) {
  const rows = seedWithDay(options);
  const cal = calSeed();
  const sessionFor = (i) => rows.coach_sessions.find((x) => x.starts_at === i.starts_at && ((i.profile_id && x.profile_id === i.profile_id) || (i.group_id && x.group_id === i.group_id)));
  const taken = new Set();
  cal.coach_cal_items = cal.coach_cal_items.map((i) => {
    const s = i.kind === 'client_call' ? sessionFor(i) : null;
    if (!s || taken.has(s.id)) return i;
    taken.add(s.id);
    return { ...i, session_id: s.id };
  });
  delete cal.coach_todos;
  for (const [table, list] of Object.entries(cal)) rows[table] = [...(rows[table] || []), ...list];
  rows.coach_settings = rows.coach_settings.map((s) => ({
    ...s,
    working_hours: { mon: { from: '09:00', to: '18:30' }, tue: { from: '09:00', to: '18:30' }, wed: { from: '09:00', to: '17:00' }, thu: { from: '09:00', to: '20:45' }, fri: { from: '09:00', to: '15:00' } },
    booking: { remind_24: true, remind_1: false, gap: '15 minutes', per_day: '5', notice: '24 hours', ahead: '4 weeks' },
    calendars: { work: true, personal: true, family: true, weekends: false },
  }));
  return rows;
}

// ---------------------------------------------------------------- Leads, the CRM and Network (Phase 6a run 4; migration 052)
export const CRM = {
  // the pipeline's stages, as coach_lead_stages_start() makes them
  stNew: u(9001), stCall: u(9002), stProp: u(9003), stDeciding: u(9004), stWon: u(9005),
  // M11's leads (Ruth and Nadia are the calendar seed's own booking-made leads, CAL.leadRuth and CAL.leadNadia)
  elena: u(9011), jack: u(9012), amy: u(9013), chrisLowe: u(9014), tom: u(9015), leoWon: u(9016), chrisDoyle: u(9017), christopherDoyle: u(9018), coldLead: u(9019),
  // the leads' own fields
  lfSector: u(9021), lfBudget: u(9022), lfRenew: u(9023),
  // automations
  a1: u(9031), a2: u(9032), a3: u(9033), a4: u(9034), a6: u(9036),
  // boards
  speaking: u(9041), partners: u(9042), spIdeas: u(9043), spPitched: u(9044), spConfirmed: u(9045), spDone: u(9046), ptTalking: u(9047), ptAgreed: u(9048), ptActive: u(9049),
  // emails and the person waiting
  e1: u(9061), e2: u(9062), e3: u(9063), e4: u(9064), eSarah: u(9065), waitSarah: u(9066), addrLog: u(9067), addrTodo: u(9068),
  // past clients (Grace Liu is ID.past)
  ben: u(9071), leah: u(9072), omar: u(9073), ciGrace: u(9074), ciBen: u(9075), ciLeah: u(9076),
  // Network, as M11 draws it
  sofia: u(9101), dana: u(9102), hannah: u(9103), jamal: u(9104), vera: u(9105), umar: u(9106), rosa: u(9107), erin: u(9108), dan: u(9109), david: u(9110),
  zaraF: u(9111), finn: u(9112), kate: u(9113), yusuf: u(9114), mayaK: u(9115), zaraN: u(9116), beaR: u(9117), danielV: u(9118), adamF: u(9119), priyeshY: u(9120),
  colSector: u(9131),
};

/** A day some whole months before (or after) one of the seed's days, as the database counts months. */
const monthsFrom = (dayKey, months) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const yy = Math.floor(total / 12);
  const mm = total - yy * 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
/** The day someone last spoke so that, on their rhythm, the catch-up fell due `offset` days from the seed's today. */
const spokeFor = (rhythm, offset) => monthsFrom(day(offset), -rhythm);

/** A Network person, as a row of network_people (the worked-out columns are the database's, or the stand-in's). */
const person = (id, name, organisation, role, ratings, rhythm, lastSpoke, extra = {}) => ({
  id, coach_id: ME, name, organisation, organisation_id: null, role, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.invalid`, phone: null,
  influence: ratings?.[0] ?? null, trust: ratings?.[1] ?? null, value_delivery: ratings?.[2] ?? null, what_you_get: ratings?.[3] ?? null,
  rhythm_months: rhythm, last_spoke_on: lastSpoke, snoozed_until: null, added_on: day(-700), own: {}, archived_at: null, keep: false, profile_id: null, notes: null,
  merged_into: null, created_at: at(-700), updated_at: at(-700), ...extra,
});

/**
 * Network as M11 draws it: who is due (Sofia 9 days overdue, Dana 7, Hannah 5, then 3), Dan Reid (given once and asked once),
 * David Stark (one person's page: spoken to 2 days ago, an idea given today), three people ready to archive and two archived.
 * @returns {{ network_people: object[], network_gives: object[], network_ratings: object[], network_columns: object[] }}
 */
export function networkSeed() {
  const people = [
    person(CRM.sofia, 'Sofia Marsh', 'Citadel', 'Key contact', [7, 4, 5, 6], 3, spokeFor(3, -9), { phone: '+1 617 555 0122' }),
    person(CRM.dana, 'Dana Whitfield', 'Kestrel Group', 'Sponsor', [9, 8, 6, 7], 1, spokeFor(1, -7), { phone: '07700 900383', organisation_id: ID.kestrel }),
    person(CRM.hannah, 'Hannah Wells', 'Quillmark', 'Client', [5, 8, 8, 9], 2, spokeFor(2, -5), { phone: '07700 900262' }),
    person(CRM.jamal, 'Jamal Irwin', 'Linden Partners', 'Client', [1, 4, 8, 7], 12, spokeFor(12, -3)),
    person(CRM.vera, 'Vera Ellis', 'Ashby Rugby', 'Network', [9, 1, 8, 0], 12, spokeFor(12, -3)),
    person(CRM.umar, 'Umar Young', 'Westgate Schools', 'Key contact', [3, 6, 2, 6], 1, spokeFor(1, -3)),
    person(CRM.rosa, 'Rosa Price', 'Ridgeway Trust', 'Key contact', [4, 6, 0, 2], 1, spokeFor(1, -3)),
    person(CRM.erin, 'Erin Banks', 'Northfield Logistics', 'Past client', [10, 8, 6, 0], 1, spokeFor(1, -3), { organisation_id: ID.northfield }),
    person(CRM.dan, 'Dan Reid', 'Harbour Lane', 'Referrer', [6, 9, 7, 8], 3, spokeFor(3, -2), { phone: '07700 900141' }),
    person(CRM.david, 'David Stark', 'Citadel', 'Chief medical officer', [9, 6, 7, 7], 2, day(-2), { phone: '+1 212 555 0147' }),
    person(CRM.zaraF, 'Zara Fraser', 'Westgate Schools', 'Referrer', [7, 9, 8, 4], 6, spokeFor(6, 12)),
    person(CRM.finn, 'Finn Carver', 'Northfield Logistics', 'Referrer', [7, 8, 7, 3], 6, spokeFor(6, 25)),
    person(CRM.kate, 'Kate Banks', 'Northfield Logistics', 'Sponsor', [4, 7, 2, 9], 12, spokeFor(12, 40)),
    person(CRM.yusuf, 'Yusuf Lyle', 'Ashby Rugby', 'Sponsor', [4, 7, 2, 3], 6, spokeFor(6, 58)),
    person(CRM.mayaK, 'Maya Kerr', 'Kestrel Group', 'Sponsor', [0, 9, 8, 8], 1, spokeFor(1, 20)),
    // Ready to archive: no contact for 18 months, and on no focus list.
    person(CRM.zaraN, 'Zara Nash', 'Orbital Health', 'Network', null, null, day(-555)),
    person(CRM.beaR, 'Bea Reeves', 'Harbour City FC', 'Network', [5, 5, 5, 5], null, day(-620)),
    person(CRM.danielV, 'Daniel Vance', 'Arden Vale', 'Past client', null, null, day(-560)),
    // Archived already.
    person(CRM.adamF, 'Adam Ford', 'Fenwick Rowing', 'Key contact', [1, 5, 1, 8], 2, day(-650), { archived_at: at(-30) }),
    person(CRM.priyeshY, 'Priyesh Young', 'Northfield Logistics', 'Referrer', [2, 6, 2, 8], 2, day(-650), { archived_at: at(-30) }),
  ];
  const give = (n, personId, direction, kind, note, offset) => ({ id: u(9200 + n), person_id: personId, coach_id: ME, direction, kind, note, happened_on: day(offset), created_at: at(offset), updated_at: at(offset) });
  return {
    network_people: people,
    network_gives: [
      give(1, CRM.dan, 'gave', 'introduction', 'Introduced Dan to the Kestrel leadership team.', -60),
      give(2, CRM.dan, 'asked', 'referral', 'Asked who else at Harbour Lane is building a team.', -45),
      give(3, CRM.dana, 'gave', 'resource', 'Sent the article on decision rights.', -20),
      give(4, CRM.dana, 'asked', 'advice', 'Asked how the board reads the renewal.', -12),
      give(5, CRM.david, 'gave', 'idea', 'Suggested a different approach to his team’s human performance challenge.', 0),
    ],
    network_ratings: [],
    network_columns: [{ id: CRM.colSector, coach_id: ME, name: 'Sector', kind: 'text', options: [], note: 'The sector they work in.', position: 0, hidden: false }],
  };
}

/**
 * Leads and the CRM as M11 draws them: five stages, eight leads on the board (two of them the calendar seed's booking-made
 * leads), Amy's and Ruth's timelines with their emails, the two Chris Doyles who may be one person, Sarah Kent waiting, five
 * automations (M11's sixth, "keep in touch every 3 months", isn't one of the two actions an automation can take), two boards,
 * past clients with their check-ins, and Kestrel's account map.
 */
export function crmSeed() {
  const stage = (id, name, likelihood, position, isWon = false) => ({ id, coach_id: ME, name, likelihood, position, is_won: isWon, created_at: at(-200), updated_at: at(-200) });
  const lead = (id, name, stageId, extra = {}) => ({
    id, coach_id: ME, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.invalid`, source: 'manual', call_type_key: null, booking_id: null, time_zone: 'Europe/London',
    answers: {}, status: 'new', notes: null, stage_id: stageId, organisation: null, organisation_id: null, job_title: null, phone: null, value: null, currency: 'GBP', next_step: null,
    next_step_on: null, next_step_time: null, referred_by: null, referred_by_person: null, network_person_id: null, last_contact_on: null, want_outcome: null, want_pain: null,
    who_decides: null, who_funds: null, decide_when: null, won_at: null, won_profile_id: null, cold_at: null, cold_reason: null, cold_check_on: null, merged_into: null,
    created_at: at(-20), updated_at: at(-1), ...extra,
  });
  const event = (n, leadId, kind, offset, title, detail = null, data = {}, hour = 9, minute = 0) => ({ id: u(9300 + n), coach_id: ME, lead_id: leadId, kind, happened_at: at(offset, hour, minute),
    happened_on: day(offset), title, detail, data, created_at: at(offset, hour, minute), updated_at: at(offset, hour, minute) });
  const email = (id, direction, who, subject, snippet, offset, hour, extra = {}) => ({ id, coach_id: ME, direction, from_name: direction === 'in' ? who.name : 'Alex Morgan', from_email: direction === 'in' ? who.email : 'alex@example.invalid',
    to_people: direction === 'in' ? [{ name: 'Alex Morgan', email: 'alex@example.invalid' }] : [who], cc_people: [], subject, snippet, sent_at: at(offset, hour, 40), thread_key: `thread-${subject.replace(/^re: /i, '').toLowerCase()}`,
    source: 'copy_in', external_id: `seed-${id}`, link: null, hidden: false, created_at: at(offset, hour, 40), updated_at: at(offset, hour, 40), ...extra });
  const amy = { name: 'Amy Cole', email: 'amy.cole@example.invalid' };
  const ruth = { name: 'Ruth Adeyemi', email: 'ruth@example.invalid' };
  // Three of the runs carry the key of what really set them off in this seed (Amy's proposal opened three times, Tom quiet for
  // 19 days, Ruth's Chemistry Call booked), so the watch that asks about those when the portal opens finds each already ran.
  const RAN = { 5: `opened:${CRM.amy}:leadership accelerator`, 7: `quiet:${CRM.tom}:${day(-19)}`, 10: `booking:${CAL.bookRuth}` };
  const run = (n, automationId, leadId, offset) => ({ id: u(9500 + n), automation_id: automationId, coach_id: ME, event_key: RAN[n] || `seed:${n}`, lead_id: leadId, profile_id: null, todo_id: null, ran_at: at(offset), created_at: at(offset), updated_at: at(offset) });
  const card = (n, boardId, stageId, title, values, position) => ({ id: u(9600 + n), board_id: boardId, coach_id: ME, stage_id: stageId, title, field_values: values, notes: null, position, created_at: at(-30), updated_at: at(-30) });
  const past = (id, name, endedOffset, extra = {}) => ({ id, coach_id: ME, user_id: null, name, email: `${name.split(' ')[0].toLowerCase()}@example.invalid`, mobile: null, organisation_id: null, job_title: null, city: null,
    time_zone: 'Europe/London', frequent_traveller: false, referred_by: null, status: 'past', stage: null, getting_started: {}, last_contact_on: day(endedOffset), invited_at: null, ended_on: day(endedOffset), merged_into: null,
    created_at: at(endedOffset - 200), updated_at: at(endedOffset), ...extra });
  return {
    coach_lead_stages: [stage(CRM.stNew, 'New', 10, 0), stage(CRM.stCall, 'Call booked', 25, 1), stage(CRM.stProp, 'Proposal sent', 50, 2), stage(CRM.stDeciding, 'Deciding', 70, 3), stage(CRM.stWon, 'Won', 100, 1000000, true)],
    coach_leads: [
      lead(CRM.elena, 'Elena Ruiz', CRM.stNew, { job_title: 'Founder', next_step: 'Reply to her email', next_step_on: day(0), last_contact_on: day(-1), source: 'email' }),
      lead(CRM.jack, 'Jack Moran', CRM.stNew, { job_title: 'Head coach, rugby', next_step: 'Book a Chemistry Call', next_step_on: day(1), last_contact_on: day(-3), source: 'referral' }),
      // The calendar seed's two booking-made leads, now in the pipeline (the same ids: these rows take their place).
      lead(CAL.leadRuth, 'Ruth Adeyemi', CRM.stCall, { email: ruth.email, source: 'chemistry_page', call_type_key: 'chemistry', booking_id: CAL.bookRuth, organisation: 'Harbour City FC', organisation_id: ID.harbour,
        job_title: 'Head of performance', phone: '07700 900213', next_step: 'Chemistry Call', next_step_on: day(2), next_step_time: '13:00', last_contact_on: day(-2) }),
      lead(CAL.leadNadia, 'Nadia Osei', CRM.stCall, { email: 'nadia@example.invalid', source: 'connection_page', call_type_key: 'connection', booking_id: CAL.bookNadia, organisation: 'Vale Health',
        next_step: 'Connection Call', next_step_on: day(4), next_step_time: '12:30', last_contact_on: day(-5) }),
      lead(CRM.amy, 'Amy Cole', CRM.stProp, { email: amy.email, organisation: 'Northfield Logistics', organisation_id: ID.northfield, job_title: 'Chief operating officer', phone: '07700 900461', value: 13500,
        next_step: 'Follow up on the proposal', next_step_on: day(2), last_contact_on: day(0), referred_by: 'Hannah Wells', referred_by_person: CRM.hannah, source: 'referral',
        want_outcome: 'A leadership team that owns its decisions.', want_pain: 'Every decision still comes back to her.', who_decides: 'Amy, with her CEO.', who_funds: 'Northfield, from the L&D budget.' }),
      lead(CRM.chrisLowe, 'Chris Lowe', CRM.stProp, { organisation: 'Kestrel Group', organisation_id: ID.kestrel, value: 18000, next_step: 'Send workshop dates', next_step_on: day(6), last_contact_on: day(-6) }),
      lead(CRM.tom, 'Tom Hale', CRM.stDeciding, { organisation: 'Brightwater Capital', value: 7500, next_step: 'Check in on his decision', next_step_on: day(-4), last_contact_on: day(-19),
        want_outcome: 'A calmer first year as managing partner.', want_pain: 'He is carrying every client relationship himself.', who_decides: 'Tom.', who_funds: 'Brightwater.', decide_when: 'Before the end of the month.' }),
      lead(CRM.leoWon, 'Leo Grant', CRM.stWon, { email: null, organisation: 'Northfield Logistics', organisation_id: ID.northfield, value: 13500, last_contact_on: day(-4), won_at: at(-4), won_profile_id: ID.leo }),
      // May be the same person twice ("Chris Doyle may be in here twice.").
      lead(CRM.chrisDoyle, 'Chris Doyle', CRM.stNew, { email: 'chris@example.invalid', organisation: 'Doyle Capital', notes: 'Referrer, 3 people sent', last_contact_on: day(-12) }),
      lead(CRM.christopherDoyle, 'Christopher Doyle', CRM.stNew, { email: null, phone: '07700 900542', organisation: 'Doyle Capital Partners', notes: 'Added from the Chemistry Call page', source: 'chemistry_page', last_contact_on: day(-8) }),
      // A cold lead, with what happened and when to check in again.
      lead(CRM.coldLead, 'Priya Menon', CRM.stProp, { organisation: 'Marlow Analytics', value: 9000, last_contact_on: day(-50), cold_at: at(-30), cold_reason: 'Budget frozen until the new financial year.', cold_check_on: day(60) }),
    ],
    coach_lead_events: [
      // Amy's timeline, as M11 draws it (newest first on the page).
      event(1, CRM.amy, 'referred', -11, 'Referred by Hannah Wells', 'Hannah introduced you by email.', { by: 'Hannah Wells' }),
      event(2, CRM.amy, 'booking', -8, 'Booked a Chemistry Call', 'From your Chemistry Call page.', { call_type_key: 'chemistry' }),
      event(3, CRM.amy, 'call', -7, 'Chemistry Call, 30 minutes', 'Wants her senior team pulling the same way before the Q1 restructure.\nDecides with her CEO by the end of November.', { minutes: 30 }),
      event(4, CRM.amy, 'proposal', -5, 'Proposal sent', 'Leadership Accelerator, £13,500 + VAT.', { name: 'Leadership Accelerator', amount: 13500 }),
      event(5, CRM.amy, 'email', -5, 'You sent the proposal', null, { email_id: CRM.e3, direction: 'out' }, 9, 40),
      event(6, CRM.amy, 'proposal_opened', -4, 'Opened your proposal', 'Leadership Accelerator.', { name: 'Leadership Accelerator' }),
      event(7, CRM.amy, 'proposal_opened', -2, 'Opened your proposal', 'Leadership Accelerator.', { name: 'Leadership Accelerator' }),
      event(8, CRM.amy, 'email', 0, 'Amy replied: Our CEO is in on Thursday', null, { email_id: CRM.e4, direction: 'in' }, 7, 55),
      event(9, CRM.amy, 'proposal_opened', 0, 'Opened your proposal', 'Leadership Accelerator.', { name: 'Leadership Accelerator' }, 9, 12),
      // Ruth's.
      event(11, CAL.leadRuth, 'first_contact', -5, 'First contact', 'From the Chemistry Call page.', { source: 'chemistry_page' }),
      event(12, CAL.leadRuth, 'booking', -4, 'Booked a Chemistry Call', 'From your Chemistry Call page.', { booking_id: CAL.bookRuth, call_type_key: 'chemistry' }),
      event(13, CAL.leadRuth, 'email', -3, 'You sent the Chemistry Call details', null, { email_id: CRM.e2, direction: 'out' }),
      event(14, CAL.leadRuth, 'email', 0, 'Ruth replied: Can we start in January?', null, { email_id: CRM.e1, direction: 'in' }, 8, 40),
      // Tom's: a proposal opened once, then quiet.
      event(21, CRM.tom, 'call', -30, 'Chemistry Call, 30 minutes', 'Ready to decide once the partners have met.', { minutes: 30 }),
      event(22, CRM.tom, 'proposal', -21, 'Proposal sent', 'Executive coaching, £7,500 + VAT.', { name: 'Executive coaching', amount: 7500 }),
      event(23, CRM.tom, 'proposal_opened', -19, 'Opened your proposal', 'Executive coaching.', { name: 'Executive coaching' }),
      event(31, CRM.leoWon, 'won', -4, 'Won', 'Leadership Accelerator, £13,500 + VAT.', { profile_id: ID.leo }),
      event(41, CRM.coldLead, 'cold', -30, 'Marked as cold', 'Budget frozen until the new financial year.', {}),
    ],
    coach_fields: [
      { id: CRM.lfSector, coach_id: ME, applies_to: 'lead', name: 'Sector', kind: 'choice', options: ['Finance', 'Sport', 'Logistics', 'Media', 'Health', 'Food'], position: 0 },
      { id: CRM.lfBudget, coach_id: ME, applies_to: 'lead', name: 'Value', kind: 'number', options: [], position: 1 },
      { id: CRM.lfRenew, coach_id: ME, applies_to: 'lead', name: 'Renewal date', kind: 'date', options: [], position: 2 },
    ],
    coach_field_values: [[CRM.amy, 'Logistics'], [CAL.leadRuth, 'Sport'], [CRM.tom, 'Finance'], [CRM.elena, 'Media'], [CRM.chrisLowe, 'Finance'], [CAL.leadNadia, 'Health'], [CRM.jack, 'Sport'], [CRM.leoWon, 'Logistics']]
      .map(([item, v]) => ({ field_id: CRM.lfSector, item_id: item, coach_id: ME, value_text: v, value_number: null, value_date: null })),
    coach_tag_links: [{ tag_id: ID.tagExec, item_kind: 'lead', item_id: CRM.amy, coach_id: ME }, { tag_id: ID.tagSport, item_kind: 'lead', item_id: CAL.leadRuth, coach_id: ME }],
    coach_automations: [
      { id: CRM.a1, coach_id: ME, trigger: 'lead_stage', trigger_stage_id: CRM.stProp, trigger_count: null, call_type_key: null, action: 'todo', todo_title: 'Follow up on the proposal', todo_days: 3, to_stage_id: null, active: true, position: 0 },
      { id: CRM.a2, coach_id: ME, trigger: 'proposal_opened', trigger_stage_id: null, trigger_count: 3, call_type_key: null, action: 'todo', todo_title: 'Call while the proposal is fresh', todo_days: 0, to_stage_id: null, active: true, position: 1 },
      { id: CRM.a3, coach_id: ME, trigger: 'lead_quiet', trigger_stage_id: null, trigger_count: 14, call_type_key: null, action: 'todo', todo_title: 'Check in', todo_days: 0, to_stage_id: null, active: true, position: 2 },
      { id: CRM.a4, coach_id: ME, trigger: 'call_booked', trigger_stage_id: null, trigger_count: null, call_type_key: 'chemistry', action: 'todo', todo_title: 'Read their booking answers', todo_days: -1, to_stage_id: null, active: true, position: 3 },
      { id: CRM.a6, coach_id: ME, trigger: 'coaching_ended', trigger_stage_id: null, trigger_count: null, call_type_key: null, action: 'todo', todo_title: 'Ask for a testimonial', todo_days: 14, to_stage_id: null, active: false, position: 5 },
    ].map((a) => ({ ...a, created_at: at(-120), updated_at: at(-120) })),
    // "Ran 4 times in November", 2, 3 and 5 (each run this month, whatever the day).
    coach_automation_runs: [...[1, 2, 3, 4].map((n) => run(n, CRM.a1, CRM.amy, 0)), ...[5, 6].map((n) => run(n, CRM.a2, CRM.amy, 0)), ...[7, 8, 9].map((n) => run(n, CRM.a3, CRM.tom, 0)),
      ...[10, 11, 12, 13, 14].map((n) => run(n, CRM.a4, CAL.leadRuth, 0))],
    coach_boards: [
      { id: CRM.speaking, coach_id: ME, name: 'Speaking', columns: [{ id: 'date', name: 'Date', kind: 'date' }, { id: 'fee', name: 'Fee', kind: 'money' }, { id: 'audience', name: 'Audience', kind: 'text' }], shared: false, position: 0, archived_at: null },
      { id: CRM.partners, coach_id: ME, name: 'Partners', columns: [{ id: 'contact', name: 'Contact', kind: 'text' }], shared: false, position: 1, archived_at: null },
    ].map((b) => ({ ...b, created_at: at(-90), updated_at: at(-90) })),
    coach_board_stages: [[CRM.spIdeas, CRM.speaking, 'Ideas'], [CRM.spPitched, CRM.speaking, 'Pitched'], [CRM.spConfirmed, CRM.speaking, 'Confirmed'], [CRM.spDone, CRM.speaking, 'Done'],
      [CRM.ptTalking, CRM.partners, 'Talking'], [CRM.ptAgreed, CRM.partners, 'Agreed'], [CRM.ptActive, CRM.partners, 'Active']]
      .map(([id, boardId, name], i) => ({ id, board_id: boardId, coach_id: ME, name, position: i, created_at: at(-90), updated_at: at(-90) })),
    coach_board_items: [
      card(1, CRM.speaking, CRM.spIdeas, 'League Managers Association', { audience: 'Head coaches' }, 0),
      card(2, CRM.speaking, CRM.spPitched, 'CIPD Festival of Work', { date: day(203), fee: 4500, audience: '800 HR leaders' }, 0),
      card(3, CRM.speaking, CRM.spPitched, 'Henley Business School alumni', { date: day(117), fee: 3000, audience: '120 alumni' }, 1),
      card(4, CRM.speaking, CRM.spConfirmed, 'Northfield leadership offsite', { date: day(63), fee: 6000, audience: '40 senior leaders' }, 0),
      card(5, CRM.speaking, CRM.spDone, 'Leaders in Sport podcast', { date: day(-16), audience: 'Sport leaders' }, 0),
      card(6, CRM.partners, CRM.ptTalking, 'Quillmark Publishing', { contact: 'Hannah Wells' }, 0),
      card(7, CRM.partners, CRM.ptActive, 'Fenwick Rowing', { contact: 'Isla Hale' }, 0),
    ],
    coach_emails: [
      email(CRM.e1, 'in', ruth, 'Re: Chemistry Call', 'Thanks for the details. Before Wednesday, can we start in January? Our season review lands in December and I want the staff free for it.', 0, 8),
      email(CRM.e2, 'out', ruth, 'Chemistry Call', 'Here are the details for Wednesday, and the three questions I’ll ask.', -3, 9),
      email(CRM.e3, 'out', amy, 'Leadership Accelerator proposal', 'The proposal is attached. It covers the six months we talked about.', -5, 9),
      email(CRM.e4, 'in', amy, 'Re: Leadership Accelerator proposal', 'Our CEO is in on Thursday, so I’ll take him through it then.', 0, 7),
      email(CRM.eSarah, 'out', { name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }, 'Good to meet you at the summit', 'It was good to meet you on Tuesday. Here is the article I mentioned.', -1, 16),
    ],
    coach_email_links: [[CRM.e1, CAL.leadRuth], [CRM.e2, CAL.leadRuth], [CRM.e3, CRM.amy], [CRM.e4, CRM.amy]].map(([emailId, leadId]) => ({ email_id: emailId, coach_id: ME, person_kind: 'lead', person_id: leadId, created_at: at(-1) })),
    coach_email_waiting: [{ id: CRM.waitSarah, coach_id: ME, email_id: CRM.eSarah, name: 'Sarah Kent', email: 'sarah.kent@example.invalid', status: 'waiting', lead_id: null, decided_at: null, created_at: at(-1), updated_at: at(-1) }],
    coach_email_addresses: [{ id: CRM.addrLog, coach_id: ME, kind: 'log', key: 'log.alex.7kx2m4qa', created_at: at(-100) }, { id: CRM.addrTodo, coach_id: ME, kind: 'todo', key: 'todo.alex.9bd3w6tz', created_at: at(-100) }],
    // Past clients (with ID.past, Grace Liu, in the first seed) and the check-ins that are due.
    client_profiles: [past(CRM.ben, 'Ben Ortiz', -91), past(CRM.leah, 'Leah Moran', -359, { organisation_id: ID.harbour }), past(CRM.omar, 'Omar Haddad', -20, { organisation_id: ID.brightline })],
    client_check_ins: [
      { id: CRM.ciGrace, coach_id: ME, profile_id: ID.past, months: 6, due_on: day(23), done_at: null, skipped_at: null, note: null, ask: null },
      { id: CRM.ciBen, coach_id: ME, profile_id: CRM.ben, months: 3, due_on: day(1), done_at: null, skipped_at: null, note: null, ask: null },
      { id: CRM.ciLeah, coach_id: ME, profile_id: CRM.leah, months: 12, due_on: day(6), done_at: null, skipped_at: null, note: null, ask: null },
    ].map((c) => ({ ...c, created_at: at(-30), updated_at: at(-30) })),
    // Kestrel's account map: one more person in Who's who (the first seed has Dana and Lee), its deals and its room to grow.
    organisation_contacts: [{ id: u(403), organisation_id: ID.kestrel, name: 'Jo Mensah', email: 'jo@example.invalid', mobile: null, job_title: 'HR director', roles: ['hr'], note: 'Asked about team workshops', last_contact_on: day(-16), last_contact_how: 'spoke', created_by: null }],
    organisation_deals: [
      { id: u(9701), organisation_id: ID.kestrel, name: 'Leadership Accelerator for Sam', kind: 'agreement', status: 'active', value: 13460, currency: 'GBP', per: 'once', detail: null, starts_on: day(-70), renews_on: day(109), opens: 0, lead_id: null },
      { id: u(9702), organisation_id: ID.kestrel, name: 'Portal seats', kind: 'agreement', status: 'active', value: 640, currency: 'GBP', per: 'month', detail: '20 seats', starts_on: day(-70), renews_on: day(109), opens: 0, lead_id: null },
      { id: u(9703), organisation_id: ID.kestrel, name: 'Team workshops for the leadership team', kind: 'proposal', status: 'sent', value: 5640, currency: 'GBP', per: 'once', detail: null, starts_on: null, renews_on: null, opens: 2, lead_id: CRM.chrisLowe },
    ].map((d) => ({ ...d, created_by: null, created_at: at(-70), updated_at: at(-5) })),
    organisation_growth: [
      { id: u(9711), organisation_id: ID.kestrel, kind: 'seats', title: '6 of 20 seats are free.', note: 'The leadership team could use them for their own sprints.', status: 'open', lead_id: null },
      { id: u(9712), organisation_id: ID.kestrel, kind: 'renewal', title: 'Owen’s coaching ends soon.', note: 'Maya is his coach.', status: 'open', lead_id: null },
      { id: u(9713), organisation_id: ID.kestrel, kind: 'workshop', title: 'No workshop is booked for next quarter.', note: null, status: 'open', lead_id: null },
    ].map((g) => ({ ...g, created_by: null, created_at: at(-10), updated_at: at(-10) })),
  };
}

/**
 * Everything: seedWithCal() and the CRM (for `standIn(page, { db: 'there', day: true, cal: true, crm: true, rows: seedWithCrm() })`).
 * The calendar seed's two booking-made leads are replaced by their fuller rows; Network's people come too (with `network: false`
 * they are left out, for a walk that brings its own, such as manyNetwork(1200)).
 */
export function seedWithCrm({ network = true, ...options } = {}) {
  const rows = seedWithCal(options);
  const crm = crmSeed();
  const fuller = new Set(crm.coach_leads.map((l) => l.id));
  rows.coach_leads = (rows.coach_leads || []).filter((l) => !fuller.has(l.id));
  for (const [table, list] of Object.entries(crm)) rows[table] = [...(rows[table] || []), ...list];
  if (network) for (const [table, list] of Object.entries(networkSeed())) rows[table] = [...(rows[table] || []), ...list];
  rows.coach_settings = rows.coach_settings.map((s) => ({ ...s, crm: { suggest_check_ins: true } }));
  return rows;
}

// A small steady generator (the same people every run; nobody real).
const FIRST = ['Adam', 'Amara', 'Bea', 'Ben', 'Cal', 'Chloe', 'Daniel', 'Dev', 'Ella', 'Erin', 'Farid', 'Finn', 'Grace', 'Gwen', 'Hugo', 'Isla', 'Jamal', 'Kate', 'Leon', 'Maya',
  'Noah', 'Olivia', 'Priyesh', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Umar', 'Vera', 'Will', 'Yusuf', 'Zara'];
const LAST = ['Abbott', 'Banks', 'Bryant', 'Carver', 'Dawson', 'Doyle', 'Egan', 'Ellis', 'Ford', 'Fraser', 'Gill', 'Grant', 'Hale', 'Hart', 'Iqbal', 'Irwin', 'Jensen', 'Joyce', 'Kerr', 'Khan',
  'Lowe', 'Lyle', 'Mason', 'Moss', 'Nash', 'Okoro', 'Price', 'Quinlan', 'Reeves', 'Shah', 'Turner', 'Usman', 'Vance', 'Walsh', 'Young', 'Zhou'];
const ORGS = ['Arden Vale', 'Ashby Rugby', 'Brightwater Capital', 'Citadel', 'Corran Energy', 'Fenwick Rowing', 'Harbour City FC', 'Harbour Lane', 'Kestrel Group', 'Linden Partners',
  'Marlow Analytics', 'Northfield Logistics', 'Orbital Health', 'Quillmark', 'Ridgeway Trust', 'Tessaly Foods', 'Vale Health', 'Westgate Schools'];
const ROLES = ['Key contact', 'Sponsor', 'Client', 'Past client', 'Network', 'Referrer'];
const RHYTHMS = [1, 2, 3, 6, 12];
/** A steady stream of whole numbers from a seed (the same every run). */
function stream(seed) {
  let x = seed >>> 0;
  return (max) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return Math.floor((x / 4294967296) * max); };
}

/**
 * Invented Network people, the same every run: `n` in all (1,200 for the browser suites, 5,000 for the break-it tester).
 * About 3% are archived and about 3% are ready to archive (no contact for 18 months, unrated); about 1 in 40 is due a
 * catch-up now; the rest are rated 0 to 10 and spread over the next year. Names repeat with a number once they run out.
 * @param {number} n
 * @param {{ archived?: number, ready?: number, due?: number }} [counts] how many of each, when a walk needs exact numbers
 * @returns {object[]} rows of network_people
 */
export function manyNetwork(n = 1200, { archived = Math.round(n * 0.03), ready = Math.round(n * 0.03), due = Math.round(n / 40) } = {}) {
  const next = stream(20261119);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
    const round = Math.floor(i / (FIRST.length * LAST.length));
    const name = round ? `${first} ${last} ${round + 1}` : `${first} ${last}`;
    const isArchived = i < archived;
    const isReady = !isArchived && i < archived + ready;
    const isDue = !isArchived && !isReady && i < archived + ready + due;
    const rhythm = RHYTHMS[next(RHYTHMS.length)];
    const ratings = isReady ? null : [next(11), next(11), next(11), next(11)];
    const lastSpoke = isArchived ? day(-650 - next(60)) : isReady ? day(-560 - next(200)) : isDue ? spokeFor(rhythm, -1 - next(9)) : spokeFor(rhythm, 1 + next(360));
    out.push(person(u(600000 + i), name, ORGS[next(ORGS.length)], ROLES[next(ROLES.length)], ratings, isReady ? null : rhythm, lastSpoke, {
      email: `${first}.${last}${round ? round + 1 : ''}.${i}@example.invalid`.toLowerCase(), phone: `07700 9${String(10000 + i).slice(-5)}`,
      archived_at: isArchived ? at(-20) : null,
    }));
  }
  return out;
}

/**
 * Invented leads, the same every run (300 for the browser suites), spread over the seed's stages (pass the stages' ids to use others).
 * Every tenth is cold; about a third have a value; some are quiet (no contact for more than 14 days).
 * @param {number} n
 * @param {string[]} [stageIds] the stages to spread them over, in order (not Won)
 * @returns {object[]} rows of coach_leads
 */
export function manyLeads(n = 300, stageIds = [CRM.stNew, CRM.stCall, CRM.stProp, CRM.stDeciding]) {
  const next = stream(20261120);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const first = FIRST[(i * 7) % FIRST.length];
    const last = LAST[(i * 11 + Math.floor(i / 5)) % LAST.length];
    const cold = i % 10 === 9;
    const quiet = next(4) === 0;
    out.push({
      id: u(700000 + i), coach_id: ME, name: `${first} ${last}`, email: `${first}.${last}.${i}@example.invalid`.toLowerCase(), source: ['manual', 'import', 'chemistry_page', 'referral'][next(4)],
      call_type_key: null, booking_id: null, time_zone: 'Europe/London', answers: {}, status: 'new', notes: null, stage_id: stageIds[next(stageIds.length)], organisation: ORGS[next(ORGS.length)],
      organisation_id: null, job_title: null, phone: `07700 9${String(20000 + i).slice(-5)}`, value: next(3) === 0 ? 2500 * (1 + next(12)) : null, currency: 'GBP',
      next_step: cold ? null : ['Send the proposal', 'Book a Chemistry Call', 'Follow up', 'Check in on the decision'][next(4)], next_step_on: cold ? null : day(next(21) - 5), next_step_time: null,
      referred_by: null, referred_by_person: null, network_person_id: null, last_contact_on: day(quiet ? -15 - next(40) : -next(14)), want_outcome: null, want_pain: null, who_decides: null, who_funds: null,
      decide_when: null, won_at: null, won_profile_id: null, cold_at: cold ? at(-10 - next(60)) : null, cold_reason: cold ? 'No budget this year.' : null, cold_check_on: cold ? day(30 + next(120)) : null,
      merged_into: null, created_at: at(-60 - next(200)), updated_at: at(-next(14)),
    });
  }
  return out;
}

/**
 * Network for a page that is device first (before 052): hand this to seedNetworkDevice(page, userId, ...) in shared.mjs.
 * @param {object[]} [people] defaults to M11's own (networkSeed)
 */
export function networkDeviceSeed(people = null) {
  const seed = networkSeed();
  return { people: people || seed.network_people, gives: people ? [] : seed.network_gives, ratings: [] };
}
