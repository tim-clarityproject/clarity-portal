// Invented people for the coach portal's browser tests: M11's own (Sam,
// Jordan, Priya, Leo, Marcus, Mia), with their organisations, engagements,
// tags, fields, a group and two workshops. Nobody here is real.
import { ME, OTHER } from './shared.mjs';

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
