// A SMALL invented practice on the hosted test project, so Tim's walk of a preview has something to look at
// (Tim, Stage A walk, item 29, 25 Nov 2026). Never large data: about 95 rows, every one removable in one step.
// Large seeds stay on the local stand-in (tests/scale/seed, part 6 is the full-size version of this).
//
//   HOSTED=1 node tests/smoke/practice-small.mjs --check    reads only: every table and column it would write exists
//   HOSTED=1 node tests/smoke/practice-small.mjs --add      adds it (run twice: nothing is added twice)
//   HOSTED=1 node tests/smoke/practice-small.mjs --remove   takes out exactly what --add made, and nothing else
//
// LOCAL=1 runs the same three against the local stand-in instead (tests/target.mjs: LOCAL_SUPABASE_URL, the standing
// accounts and the stand-in's own service key), so --add, --check and --remove can be tried there first (Stage D,
// item 19). Claude never runs it with HOSTED=1: Tim runs the hosted --add himself.
//
// Stage D, item 19 (Tim, 27 Nov), so Claude's walks cover team agreements and hours: one invented organisation,
// Harbour Rowing, with three of its people and three team programme agreements for them (one signed by the sponsor,
// one sent, one draft), and one block-of-hours agreement for an invented client, signed, with two times logged.
// Their terms are made by the app's own builder (newDraft, versionFields), as the local seed's are. On a database
// without 065's agreement columns those rows are left out, and it says so.
//
// For the test owner coach: 5 invented clients (plus the test client, linked through the app's own
// client_accept_invite, signed in as the client), a week of coaching sessions around today with their calendar
// items, three things for Today's Who needs attention (a session to write up, an overdue invoice, a client with two
// sessions left), a month of invoices and payments, and Open for calls on weekdays 09:00 to 17:00 for the weeks the
// database allows (this one and the four after it; booking pages then show free times; the coach's existing call
// type is used, none is made). For the test client: a signed coaching agreement as 061 holds it (065's builder
// columns wait for Tim's run of 065), two coaching sessions to come, and three to-dos in the Backlog.
//
// Every row's id is worked out here (5eed0700-...), so --remove deletes by those ids and needs no saved list; the
// link (coach_clients, the profile's coach history and its "A client joined" notice) is removed by the profile's id
// and the two accounts. Invoices and payments are the server's alone (061), so writes use the service key:
// TEST_SUPABASE_SERVICE_KEY in the accounts file, read through tests/target.mjs and never printed. Accounts,
// emails, keys and codes are never printed. A 402 or a read-only answer stops it at once (the project is over its
// free quota; never retried).
import { createHash } from 'node:crypto';
import { accountsEnv, HOSTED } from '../target.mjs';
import { upgradeWithCode } from '../signin/aal2.mjs';
import { signJwt } from '../scale/local-keys.mjs';
import { newDraft, versionFields } from '../../src/lib/coach/agreementBuilder.js';

const LOCAL = !HOSTED && process.env.LOCAL === '1';
if (!HOSTED && !LOCAL) {
  console.log('The small practice runs only with HOSTED=1 (an explicit visit to the hosted test project, Tim\'s to run)');
  console.log('or LOCAL=1 (the local stand-in at LOCAL_SUPABASE_URL, tests/target.mjs).');
  process.exit(2);
}
const MODE = ['--add', '--remove', '--check'].find((m) => process.argv.includes(m));
if (!MODE) {
  console.log('Say what to do: --check (reads only), --add or --remove.');
  process.exit(2);
}
const env = accountsEnv();
const BASE = env.TEST_SUPABASE_URL.replace(/\/$/, '');
const ANON = env.TEST_SUPABASE_ANON_KEY;
// The local stand-in's own service key is made from its local-only secret (tests/scale/local-keys.mjs), never a real one.
const SERVICE = LOCAL ? signJwt({ role: 'service_role', iss: 'scale-local', iat: 1763000000, exp: 2079000000 }) : (env.TEST_SUPABASE_SERVICE_KEY || '');
if (MODE !== '--check' && !SERVICE) {
  console.log('TEST_SUPABASE_SERVICE_KEY is not in the accounts file, so nothing was written.');
  console.log('Invoices and payments are written only by the server (061), and an account is linked only by its invite,');
  console.log('so --add and --remove need the test project\'s service key there (one line, TEST_SUPABASE_SERVICE_KEY=...).');
  process.exit(2);
}
const MAX_ROWS = 110; // a few dozen; never large data (90 until Stage D, item 19 added the organisation, its agreements and the hours)
const WHERE = LOCAL ? 'the local stand-in' : 'the hosted test project';

// ------------------------------------------------------------------ the one way to the API
class Stop extends Error {}
async function api(path, { method = 'GET', token = SERVICE, body, prefer, auth = false } = {}) {
  const headers = { apikey: auth ? ANON : (token === SERVICE ? SERVICE : ANON), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (res.status === 402 || /read-only|read_only/i.test(text)) throw new Stop(`The test project answered ${res.status === 402 ? '402' : 'read-only'}: stopped at once, nothing retried.`);
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const what = `${method} ${path.split('?')[0]}`;
    throw new Error(`${what} answered ${res.status}: ${data?.code || ''} ${String(data?.message || data?.msg || '').slice(0, 200)}`);
  }
  return data;
}
const rest = (table, query = '') => `/rest/v1/${table}${query ? `?${query}` : ''}`;
const inList = (ids) => `in.(${ids.join(',')})`;

async function signIn(email, password) {
  const s = await api('/auth/v1/token?grant_type=password', { method: 'POST', token: ANON, auth: true, body: { email, password } });
  return s;
}

// ------------------------------------------------------------------ ids, days and times
const KIND = { profile: 1, eng: 2, sess: 3, cal: 4, inv: 5, pay: 6, ag: 7, ver: 8, open: 9, todo: 10, org: 11, sig: 12, ssig: 13, time: 14 };
const id = (kind, n) => `5eed0700-${KIND[kind].toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ZONE = 'Europe/London';
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d);
const TODAY = dayKey(new Date());
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();
/** The weekday `n` weekdays from today (0: today, or the next weekday when today is a weekend). */
function weekday(n) {
  let d = TODAY;
  while (dow(d) === 0 || dow(d) === 6) d = addDays(d, 1);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0;) { d = addDays(d, step); if (dow(d) !== 0 && dow(d) !== 6) left -= 1; }
  return d;
}
/** A London wall-clock time as an instant. */
function at(day, hm) {
  const guess = new Date(`${day}T${hm}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(guess).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() - (wall - guess.getTime())).toISOString();
}
const plusMinutes = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();

// ------------------------------------------------------------------ the practice (invented names only)
// held: sessions held in all (the engagement's count); total: sessions in the engagement.
const CLIENTS = [
  { n: 1, name: 'Harriet Lowe', job: 'Head of operations', city: 'London', total: 12, held: 10, start: -150 },
  { n: 2, name: 'Marcus Bell', job: 'Managing director', city: 'Bristol', total: 12, held: 4, start: -60 },
  { n: 3, name: 'Nadia Kerr', job: 'Chief people officer', city: 'Manchester', total: 6, held: 2, start: -35 },
  { n: 4, name: 'Owen Pryde', job: 'Finance director', city: 'London', total: 12, held: 6, start: -90 },
  { n: 5, name: 'Isla Brennan', job: 'Head of product', city: 'Leeds', total: 8, held: 3, start: -45 },
  { n: 6, name: null, job: null, city: null, total: 12, held: 1, start: -14, testClient: true },
];
for (const c of CLIENTS) { c.pid = id('profile', c.n); c.eid = id('eng', c.n); }
const byN = Object.fromEntries(CLIENTS.map((c) => [c.n, c]));
// [client, weekday offset, time, outcome, written up]
const SESSIONS = [
  [1, -3, '09:00', 'held', true],
  [1, 1, '10:00', null, false],
  [2, -1, '11:00', null, false], // yesterday's, still to write up: Who needs attention
  [2, 3, '09:00', null, false],
  [3, -2, '10:00', 'held', true],
  [3, 0, '16:00', null, false],
  [4, 0, '08:30', 'held', true],
  [4, 4, '14:00', null, false],
  [5, 0, '14:00', null, false],
  [5, 2, '11:00', null, false],
  [6, 1, '14:00', null, false], // the test client's two to come
  [6, 5, '10:00', null, false],
];
// [client, days from today issued, amount in pence, paid days after issue (null: not paid), terms]
const INVOICES = [
  [1, -24, 120000, 4, 14],
  [4, -24, 150000, 7, 14],
  [3, -23, 90000, null, 14], // overdue: Who needs attention
  [5, -17, 110000, 3, 14],
  [2, -10, 120000, 3, 14],
  [6, -6, 145000, null, 14], // the test client's first instalment, not due yet
];
const INVOICE_NUMBER_FROM = 9701; // far above the counter's 1201 on, so the app's own numbers never meet these
const TODO_TEXTS = ['Draft the agenda for the quarterly offsite', 'Book a walking one-to-one with each team lead', 'Read the chapter on delegation before my next session'];

// Stage D, item 19: Harbour Rowing (invented) and three of its people, with three team programme agreements, and one
// invented client on a block of hours. Every name and address is made up (example.com).
const ORG = { id: id('org', 1), name: 'Harbour Rowing', city: 'Bristol', sector: 'Sport' };
const TEAM = [
  { n: 7, name: 'Fern Adeyemi', job: 'Head coach' },
  { n: 8, name: 'Calum Strachan', job: 'Club captain' },
  { n: 9, name: 'Priti Lalwani', job: 'Performance lead' },
];
const SPONSOR = { name: 'Gareth Lowther', role: 'Club chair', email: 'practice-small-sponsor@example.com' };
// [agreement n, the programme's name, its state, days ago it was sent (null: a draft), days ago the sponsor signed]
const PROGRAMMES = [
  [2, 'Crew leaders programme', 'signed', 40, 35],
  [3, 'Coaching staff programme', 'sent', 4, null],
  [4, 'Spring season programme', 'draft', null, null],
];
const HOURS = { n: 10, name: 'Elspeth Moray', job: 'Operations director', city: 'Glasgow', agreement: 5, signedDaysAgo: 30, rateMinor: 15000, blockMinor: 200000 };
// [days ago, start, minutes, note]
const HOURS_LOGGED = [[-12, '10:00', 180, 'Restructure planning with the operations team'], [-5, '14:00', 120, 'Sounding board before the board meeting']];

function plan({ coachId, coachUser, client, coachName = 'Your coach', with065 = true }) {
  const rows = {};
  const add = (t, r) => { (rows[t] ||= []).push(r); };
  for (const c of CLIENTS) {
    const name = c.testClient ? client.name : c.name;
    add('client_profiles', {
      id: c.pid, coach_id: coachId, name, email: c.testClient ? client.email : `practice-small-${c.n}@example.com`, job_title: c.job, city: c.city,
      time_zone: ZONE, status: 'active', getting_started: { first_review: true, welcome_pack: true }, last_contact_on: addDays(TODAY, -2),
      invited_at: c.testClient ? at(addDays(TODAY, c.start - 1), '09:00') : null, created_by: coachUser, created_at: at(addDays(TODAY, c.start - 7), '09:00'),
    });
    const recorded = SESSIONS.filter(([n, , , outcome]) => n === c.n && outcome === 'held').length;
    add('engagements', {
      id: c.eid, coach_id: coachId, profile_id: c.pid, kind: 'sessions', name: 'Leadership coaching', sessions_total: c.total, sessions_held: c.held - recorded,
      default_minutes: 60, every_weeks: 2, starts_on: addDays(TODAY, c.start), status: 'active', created_at: at(addDays(TODAY, c.start - 3), '09:00'),
    });
  }
  SESSIONS.forEach(([n, off, hm, outcome, written], i) => {
    const c = byN[n]; const day = weekday(off); const starts = at(day, hm);
    const sid = id('sess', i + 1);
    add('coach_sessions', { id: sid, coach_id: coachId, profile_id: c.pid, engagement_id: c.eid, kind: 'coaching', starts_at: starts, minutes: 60, place: 'Zoom',
      outcome, written_up_at: written ? plusMinutes(starts, 90) : null, created_at: at(addDays(day, -10), '09:00') });
    add('coach_cal_items', { id: id('cal', i + 1), coach_id: coachId, kind: 'client_call', calendar: 'work', title: n === 6 ? client.name : c.name, starts_at: starts,
      ends_at: plusMinutes(starts, 60), time_zone: ZONE, all_day: false, place_kind: 'zoom', profile_id: c.pid, session_id: sid });
  });
  INVOICES.forEach(([n, off, amount, paidAfter, terms], i) => {
    const c = byN[n]; const issued = addDays(TODAY, off); const iid = id('inv', i + 1);
    const paid = paidAfter != null;
    add('invoices', {
      id: iid, coach_id: coachId, agreement_id: c.testClient ? id('ag', 1) : null, profile_id: c.pid, number: INVOICE_NUMBER_FROM + i,
      stripe_invoice_id: `in_practice_small_${i + 1}`, kind: 'instalment', status: paid ? 'paid' : 'sent', currency: 'GBP',
      lines: [{ description: c.testClient ? 'Leadership coaching, payment 1 of 12' : 'Leadership coaching, November', amount }],
      total_minor: amount, paid_minor: paid ? amount : 0, terms_days: terms, issued_on: issued, due_on: addDays(issued, terms), settles_to: 'client',
      payer_name: c.testClient ? client.name : c.name, payer_email: c.testClient ? null : `practice-small-${c.n}@example.com`, payer_zone: ZONE,
      hosted_url: `https://invoice.stripe.example/practice-small/${i + 1}`, instalment_n: 1, sent_at: at(issued, '08:00'), paid_at: paid ? at(addDays(issued, paidAfter), '10:12') : null,
    });
    if (paid) {
      add('payments', { id: id('pay', i + 1), invoice_id: iid, coach_id: coachId, stripe_id: `pi_practice_small_${i + 1}`, amount_minor: amount, currency: 'GBP',
        landed_gbp_minor: amount, fee_minor: Math.round(amount * 0.015) + 20, added_by_coach: false, paid_at: at(addDays(issued, paidAfter), '10:12') });
    }
  });
  // The test client's agreement, signed, as 061 holds it.
  const terms = { coaching: '6-month leadership coaching, 12 sessions of 60 minutes', investment: '£17,400, in 12 monthly instalments of £1,450', rate: { minor: 145000, per: 'month' } };
  const clauses = [
    { key: '3', title: 'Your investment', money: true, text: 'Your investment is £17,400 in pounds, paid in 12 monthly instalments of £1,450.' },
    { key: '4', title: 'Rearranging and cancelling', text: 'You can rearrange a session up to 24 hours before it starts.' },
  ];
  const signedAt = at(addDays(TODAY, -8), '19:40');
  add('agreements', { id: id('ag', 1), coach_id: coachId, kind: 'coaching', profile_id: byN[6].pid, engagement_id: byN[6].eid, status: 'signed', current_version: 1, created_at: at(addDays(TODAY, -12), '09:00') });
  add('agreement_versions', {
    id: id('ver', 1), agreement_id: id('ag', 1), coach_id: coachId, version: 1, status: 'signed', terms, clauses, currency: 'GBP', total_minor: 1740000,
    coach_signed_at: at(addDays(TODAY, -10), '09:30'), sent_at: at(addDays(TODAY, -10), '09:31'), client_signed_at: signedAt, signed_name: client.name,
    signed_email: client.email, signed_user_id: client.id, fingerprint: createHash('sha256').update(JSON.stringify({ terms, clauses, signedAt })).digest('hex'),
  });
  // Open for calls: weekdays 09:00 to 17:00 from tomorrow, inside what the database allows (this week and the four after it).
  const monday = addDays(TODAY, -((dow(TODAY) + 6) % 7));
  const limit = addDays(monday, 35);
  let k = 0;
  for (let d = addDays(TODAY, 1); d < limit; d = addDays(d, 1)) {
    if (dow(d) === 0 || dow(d) === 6) continue;
    k += 1;
    add('coach_open_blocks', { id: id('open', k), coach_id: coachId, starts_at: at(d, '09:00'), ends_at: at(d, '17:00'), time_zone: ZONE, call_type_id: null });
  }
  if (client.strategyId) {
    TODO_TEXTS.forEach((text, i) => add('todos', { id: id('todo', i + 1), user_id: client.id, strategy_id: client.strategyId, text, impact: 2, sprint_id: null, planned_week: null, source: 'manual' }));
  }
  if (with065) teamAndHours({ add, coachId, coachUser, coachName });
  return rows;
}

// Stage D, item 19: Harbour Rowing's three team programme agreements and Elspeth's block of hours (065's columns).
function teamAndHours({ add, coachId, coachUser, coachName }) {
  const coach = { id: coachId, full_name: coachName, display_first_name: String(coachName).split(' ')[0] };
  const sig = id('sig', 1);
  add('signatures', { id: sig, user_id: coachUser, kind: 'typed', typed_name: coachName, created_at: at(addDays(TODAY, -60), '09:00') });
  add('organisations', { id: ORG.id, name: ORG.name, currency: 'GBP', city: ORG.city, sector: ORG.sector, country: 'GB', created_by: coachUser, created_at: at(addDays(TODAY, -70), '09:00') });
  for (const m of [...TEAM, HOURS]) {
    const team = m !== HOURS;
    add('client_profiles', {
      id: id('profile', m.n), coach_id: coachId, name: m.name, email: `practice-small-${m.n}@example.com`, job_title: m.job, city: team ? ORG.city : m.city,
      organisation_id: team ? ORG.id : null, time_zone: ZONE, status: 'active', getting_started: { first_review: true, welcome_pack: true },
      last_contact_on: addDays(TODAY, -3), invited_at: null, created_by: coachUser, created_at: at(addDays(TODAY, -65), '09:00'),
    });
  }
  const people = TEAM.map((m) => ({ name: m.name, email: `practice-small-${m.n}@example.com`, profileId: id('profile', m.n) }));
  for (const [n, name, state, sentAgo, signedAgo] of PROGRAMMES) {
    const ids = { agreementId: id('ag', n), versionId: id('ver', n) };
    const draft = newDraft({ kind: 'team', who: { organisation: { id: ORG.id, name: ORG.name } }, coach, ids, todayKey: addDays(TODAY, -(sentAgo ?? 2) - 3) });
    const t = draft.version.terms;
    t.coaching = name;
    t.startsOn = addDays(TODAY, state === 'signed' ? -28 : 14);
    t.endsOn = addDays(t.startsOn, 7 * 24);
    t.team = { ...t.team, people, totalMinor: 960000, settle: 'deposit', needsPO: false, invoicesEmail: 'practice-small-treasurer@example.com', sponsor: { ...SPONSOR } };
    const f = versionFields(t, {});
    const sentAt = sentAgo == null ? null : at(addDays(TODAY, -sentAgo), '09:30');
    add('agreements', { id: ids.agreementId, coach_id: coachId, kind: 'sponsor', profile_id: null, organisation_id: ORG.id, status: state, current_version: 1, agreement_kind: 'team',
      approval: 'not_needed', created_at: at(addDays(TODAY, -(sentAgo ?? 2) - 3), '09:00') });
    const signedAt = signedAgo == null ? null : at(addDays(TODAY, -signedAgo), '11:20');
    add('agreement_versions', {
      id: ids.versionId, agreement_id: ids.agreementId, coach_id: coachId, version: 1, status: state, terms: f.terms, clauses: f.clauses, overrides: f.overrides,
      currency: 'GBP', total_minor: f.total_minor, funded_by: f.funded_by, send_as: 'agreement',
      coach_signed_at: sentAt, coach_signature_id: sentAt ? sig : null, sent_at: sentAt, expires_on: state === 'sent' ? addDays(TODAY, 26) : null,
      ...(signedAt ? { sponsor_signed_at: signedAt, sponsor_name: SPONSOR.name, sponsor_role: SPONSOR.role, sponsor_email: SPONSOR.email,
        fingerprint: createHash('sha256').update(JSON.stringify({ terms: f.terms, clauses: f.clauses, signedAt })).digest('hex') } : {}),
    });
    if (signedAt) add('sponsor_signatures', { id: id('ssig', 1), coach_id: coachId, version_id: ids.versionId, typed_name: SPONSOR.name, created_at: signedAt });
  }
  // Elspeth's block of hours: signed a month ago, 13 hours 20 minutes at £150 an hour, 5 hours logged.
  const h = HOURS;
  const eid = id('eng', h.n);
  add('engagements', { id: eid, coach_id: coachId, profile_id: id('profile', h.n), kind: 'pay_as_you_go', name: 'Block of hours', sessions_total: 0, sessions_held: 0,
    default_minutes: 60, every_weeks: 2, starts_on: addDays(TODAY, -h.signedDaysAgo + 1), status: 'active', time_credit_minutes: Math.floor((h.blockMinor * 60) / h.rateMinor),
    created_at: at(addDays(TODAY, -h.signedDaysAgo - 3), '09:00') });
  const ids = { agreementId: id('ag', h.agreement), versionId: id('ver', h.agreement) };
  const draft = newDraft({ kind: 'hours', who: { profile: { id: id('profile', h.n), name: h.name, organisation_id: null } }, coach, ids, todayKey: addDays(TODAY, -h.signedDaysAgo - 3) });
  const t = draft.version.terms;
  t.coaching = 'Block of hours';
  t.startsOn = addDays(TODAY, -h.signedDaysAgo + 1);
  t.hours = { ...t.hours, work: 'Coaching and sounding board time for the operations restructure, used as needed.', rateMinor: h.rateMinor, blockMinor: h.blockMinor };
  t.clientEmail = `practice-small-${h.n}@example.com`;
  const f = versionFields(t, {});
  const sentAt = at(addDays(TODAY, -h.signedDaysAgo - 2), '09:30');
  const signedAt = at(addDays(TODAY, -h.signedDaysAgo), '19:30');
  add('agreements', { id: ids.agreementId, coach_id: coachId, kind: 'coaching', profile_id: id('profile', h.n), organisation_id: null, engagement_id: eid, status: 'signed',
    current_version: 1, agreement_kind: 'hours', approval: 'not_needed', created_at: at(addDays(TODAY, -h.signedDaysAgo - 3), '09:00') });
  add('agreement_versions', {
    id: ids.versionId, agreement_id: ids.agreementId, coach_id: coachId, version: 1, status: 'signed', terms: f.terms, clauses: f.clauses, overrides: f.overrides,
    currency: 'GBP', total_minor: f.total_minor, funded_by: null, send_as: 'agreement', coach_signed_at: sentAt, coach_signature_id: sig, sent_at: sentAt,
    client_signed_at: signedAt, signed_name: h.name, signed_email: t.clientEmail, start_now: true, start_now_at: signedAt,
    fingerprint: createHash('sha256').update(JSON.stringify({ terms: f.terms, clauses: f.clauses, signedAt })).digest('hex'),
  });
  HOURS_LOGGED.forEach(([off, hm, minutes, note], i) => {
    const start = at(addDays(TODAY, off), hm);
    add('time_entries', { id: id('time', i + 1), engagement_id: eid, coach_id: coachId, started_at: start, ended_at: plusMinutes(start, minutes), note });
  });
}
// Written in this order, removed in the reverse.
const ORDER = ['organisations', 'client_profiles', 'engagements', 'coach_sessions', 'coach_cal_items', 'signatures', 'agreements', 'agreement_versions', 'sponsor_signatures',
  'invoices', 'payments', 'coach_open_blocks', 'time_entries', 'todos'];

// ------------------------------------------------------------------ the people
async function people() {
  const coach = await signIn(env.TEST_COACH_OWNER_EMAIL, env.TEST_COACH_OWNER_PASSWORD);
  const client = await signIn(env.TEST_CLIENT_EMAIL, env.TEST_CLIENT_PASSWORD);
  const coachRow = (await api(rest('coaches', `select=id,full_name,display_first_name&user_id=eq.${coach.user.id}`), { token: SERVICE || await coachToken(coach) }))?.[0];
  if (!coachRow) throw new Error('The test owner coach has no coach row.');
  return { coach, client, coachId: coachRow.id, coachName: coachRow.full_name || coachRow.display_first_name || 'Your coach' };
}
// Whether 065's agreement columns and tables are there (Stage D, item 19's rows need them): read only.
async function has065(token) {
  try {
    await api(rest('agreement_versions', 'select=sponsor_signed_at,overrides,send_as&limit=0'), { token });
    await api(rest('agreements', 'select=agreement_kind,approval&limit=0'), { token });
    await api(rest('sponsor_signatures', 'select=id&limit=0'), { token });
    return true;
  } catch (e) {
    if (e instanceof Stop) throw e;
    return false;
  }
}
let aal2 = null;
async function coachToken(coach) {
  if (aal2) return aal2;
  const up = await upgradeWithCode({ base: BASE, apikey: ANON, session: coach, totpKey: env.TEST_COACH_OWNER_TOTP_KEY });
  if (!up) throw new Error('The coach\'s code was not accepted.');
  aal2 = up.access_token;
  return aal2;
}
async function clientFacts(client, token) {
  const prof = (await api(rest('profiles', `select=first_name,last_name&id=eq.${client.user.id}`), { token }))?.[0] || {};
  const name = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim() || 'Test Client';
  const strategy = (await api(rest('plan_strategies', `select=id&user_id=eq.${client.user.id}&limit=1`), { token }).catch(() => []))?.[0];
  return { id: client.user.id, email: String(client.user.email || '').toLowerCase(), name, strategyId: strategy?.id || null };
}

// ------------------------------------------------------------------ --check: every table and column, read only
async function check() {
  const { coach, client, coachId, coachName } = await people();
  const coachTok = await coachToken(coach);
  const facts = await clientFacts(client, client.access_token);
  const rows = plan({ coachId, coachUser: coach.user.id, client: facts, coachName });
  let bad = 0;
  for (const t of ORDER) {
    if (!rows[t]) continue;
    const cols = [...new Set(rows[t].flatMap((r) => Object.keys(r)))];
    // Signatures and the sponsor's are the server's (or the person's own) to read: with the service key where there is one.
    const token = t === 'todos' ? client.access_token : ['signatures', 'sponsor_signatures'].includes(t) && SERVICE ? SERVICE : coachTok;
    try {
      await api(rest(t, `select=${cols.join(',')}&limit=0`), { token });
      console.log(`  ok   ${t}: ${rows[t].length} rows, ${cols.length} columns all on ${WHERE}`);
    } catch (e) {
      if (e instanceof Stop) throw e;
      bad += 1;
      console.log(`  FAIL ${t}: ${e.message}`);
    }
  }
  if (!rows.todos) console.log('  note the test client has no Strategy in their plan, so no to-dos would be added');
  const total = Object.values(rows).reduce((n, r) => n + r.length, 0);
  console.log(`\n${total} rows planned (limit ${MAX_ROWS}). ${bad ? `${bad} tables don't fit the schema on ${WHERE}.` : 'Every table and column fits.'}`);
  const has = await api(rest('coach_clients', `select=coach_id&client_id=eq.${facts.id}&ended_at=is.null`), { token: client.access_token });
  console.log(has.length ? '  note the test client already has a coach, so --add would leave their link as it is' : '  ok   the test client has no coach yet, so --add can link them through their invite');
  if (bad) process.exitCode = 1;
}

// ------------------------------------------------------------------ --add
async function addAll() {
  const { coach, client, coachId, coachName } = await people();
  const facts = await clientFacts(client, SERVICE);
  const with065 = await has065(SERVICE);
  if (!with065) console.log('  note 065\'s agreement columns aren\'t on this database, so Harbour Rowing\'s agreements and the block of hours are left out');
  const rows = plan({ coachId, coachUser: coach.user.id, client: facts, coachName, with065 });
  const total = Object.values(rows).reduce((n, r) => n + r.length, 0);
  if (total > MAX_ROWS) throw new Error(`${total} rows is more than this small practice allows (${MAX_ROWS}).`);
  const counts = {};
  for (const t of ORDER) {
    if (!rows[t]) continue;
    const ids = rows[t].map((r) => r.id);
    const before = (await api(rest(t, `select=id&id=${inList(ids)}`))).length;
    // Inserted once; a second --add leaves what is there as it is (a signed version never changes).
    // PostgREST takes rows with the same keys in one request: one request for each shape (the organisation's people
    // carry organisation_id, the block of hours its time credit).
    const shapes = new Map();
    for (const r of rows[t]) { const k = Object.keys(r).sort().join(','); shapes.set(k, [...(shapes.get(k) || []), r]); }
    for (const group of shapes.values()) await api(rest(t, 'on_conflict=id'), { method: 'POST', body: group, prefer: 'resolution=ignore-duplicates,return=minimal' });
    counts[t] = { added: rows[t].length - before, there: rows[t].length };
    if (t === 'client_profiles') await link(client, facts, coachId);
  }
  for (const [t, c] of Object.entries(counts)) console.log(`  ${t}: ${c.added} added (${c.there} in all)`);
  console.log(`\nThe small practice is on ${WHERE}. Take it out with: ${LOCAL ? 'LOCAL=1' : 'HOSTED=1'} node tests/smoke/practice-small.mjs --remove`);
}
// The test client accepts the invite the profile carries, as the app does (client_accept_invite, signed in as the client).
async function link(client, facts, coachId) {
  const mine = await api(rest('client_profiles', `select=id,user_id&id=eq.${byN[6].pid}`));
  if (mine[0]?.user_id === facts.id) { console.log('  the test client is already linked to the practice'); return; }
  const other = await api(rest('coach_clients', `select=coach_id&client_id=eq.${facts.id}&ended_at=is.null`));
  if (other.length) { console.log('  the test client already has a coach, so their link was left as it is (their sessions and agreement won\'t show to them)'); return; }
  const said = await api('/rest/v1/rpc/client_accept_invite', { method: 'POST', token: client.access_token, body: { p_profile: byN[6].pid } });
  console.log(`  the test client accepted the practice's invite: ${said}`);
  if (said !== 'linked' && said !== 'already_linked') throw new Error('The test client could not be linked.');
  void coachId;
}

// ------------------------------------------------------------------ --remove
async function removeAll() {
  const { client, coachId } = await people();
  const clientId = client.user.id;
  const ids = (kind, n) => Array.from({ length: n }, (_, i) => id(kind, i + 1));
  const sets = {
    todos: ids('todo', TODO_TEXTS.length), coach_open_blocks: ids('open', 30), payments: ids('pay', INVOICES.length), invoices: ids('inv', INVOICES.length),
    agreement_versions: ids('ver', HOURS.agreement), agreements: ids('ag', HOURS.agreement), coach_cal_items: ids('cal', SESSIONS.length), coach_sessions: ids('sess', SESSIONS.length),
    engagements: ids('eng', HOURS.n), client_profiles: ids('profile', HOURS.n),
    // Stage D, item 19.
    organisations: ids('org', 1), signatures: ids('sig', 1), sponsor_signatures: ids('ssig', 1), time_entries: ids('time', HOURS_LOGGED.length),
  };
  const removed = {};
  const del = async (t, query) => (await api(rest(t, query), { method: 'DELETE', prefer: 'return=representation' }))?.length || 0;
  for (const t of [...ORDER].reverse()) {
    if (t === 'client_profiles') {
      // The link the invite made: its coach history, the coach's "A client joined" notice and the coaching itself.
      const linked = (await api(rest('client_profiles', `select=id&id=eq.${byN[6].pid}&user_id=eq.${clientId}`))).length > 0;
      removed.client_profile_coaches = await del('client_profile_coaches', `profile_id=${inList(sets.client_profiles)}`).catch(() => 0);
      removed.coach_notifications = await del('coach_notifications', `item_id=${inList(sets.client_profiles)}`).catch(() => 0);
      removed.coach_clients = linked ? await del('coach_clients', `client_id=eq.${clientId}&coach_id=eq.${coachId}`) : 0;
    }
    // A database without 065's tables has none of these rows to take out.
    removed[t] = await del(t, `id=${inList(sets[t])}`).catch((e) => { if (e instanceof Stop) throw e; if (t === 'sponsor_signatures') return 0; throw e; });
  }
  for (const [t, n] of Object.entries(removed)) console.log(`  ${t}: ${n} removed`);
  console.log(`\nThe small practice is gone from ${WHERE}.`);
}

try {
  if (MODE === '--check') await check();
  if (MODE === '--add') await addAll();
  if (MODE === '--remove') await removeAll();
} catch (e) {
  console.log(e instanceof Stop ? e.message : `Stopped: ${e.message}`);
  process.exitCode = e instanceof Stop ? 9 : 1;
}
