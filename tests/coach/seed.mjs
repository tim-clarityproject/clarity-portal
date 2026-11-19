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

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const at = (offset, hour = 9, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };

/** The rows, by table. `today` decides whose birthday it is (Priya's). */
export function seedRows() {
  const now = new Date();
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
