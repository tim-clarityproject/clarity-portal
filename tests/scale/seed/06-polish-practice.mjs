// Writes tests/scale/seed/06-polish-practice.sql: an invented practice for the owner test coach, Alex Morgan
// (05-standing-accounts.sql), so the coach portal can be judged with real-looking data (Polish 1, "Data to judge it
// by"). Local stand-in only. Run it again only to change the practice:
//
//   node tests/scale/seed/06-polish-practice.mjs
//
// Every row it adds has an id starting 5eed0600- (or hangs off one that does), so remove-06-polish.sql takes it all
// out in one step. Dates are written as of BASE and moved to the day the seed runs (polish_seed.d/ts/j), so "today"
// always has its three coaching sessions. Agreement terms and clauses come from the app's own builder
// (src/lib/coach/agreementBuilder.js), exactly as the coach portal writes them.
//
// Draft 10 ("Demo data plan", Tim, 25 and 27 Nov; Stage D item 9): its names where the practice already had a
// matching place, so suites that look people up keep working. The three organisations are Tessaline Partners (New
// York private equity, a PO and 30-day terms), Harbour Rowing (the team programme and its sponsor) and Calder Wolfe
// Racing (motorsport, a billing profile, no PO); Priya Shah, Ellis Grant (Tessaline, New York), Daniel Okafor, Hannah
// Brooks (Toronto) and Rhys Evans (a block of hours, GBP 2,000 at GBP 150 an hour, 80% used) take existing clients'
// places; Sam Carter is a portfolio manager; Jo Patel is Tessaline's sponsor. Every name was checked against the
// real client list and public records: Martin Kemp (a public figure) became Dev Malhotra, Robin Ellery
// (a surname a real client shares) Robin Ashcroft, and four companies that exist (or nearly) became Northvane Energy,
// Stonemere Capital, Brisane Capital and Wexley Ashby LLP. Every
// address ends @example.com. Alex Morgan stays the owner test coach (Draft 10's prospect of that name is Nathan Cole
// here), and Harbour Rowing's programme has three people, not six, so the practice keeps its 28 clients.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDraft, versionFields } from '../../../src/lib/coach/agreementBuilder.js';
import { splitEqual } from '../../../src/lib/agreements/settling.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = '2026-11-25'; // a Wednesday
const md5uuid = (s) => createHash('md5').update(s).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const ALEX = md5uuid('standing-coachrow-owner');
const ALEX_USER = md5uuid('standing-coach-owner');
const SAM_USER = md5uuid('standing-client');
const JORDAN_USER = md5uuid('standing-org-client');
const id = (kind, n) => `5eed0600-${kind.toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`;
const K = { user: 1, profile: 2, org: 3, eng: 4, sess: 5, cal: 6, inv: 7, pay: 8, ag: 9, ver: 10, sig: 11, lead: 12, lev: 13, stage: 14,
  net: 15, todo: 16, list: 17, obp: 18, po: 19, contact: 20, pkg: 21, out: 22, dead: 23, cn: 24, quote: 25, time: 26, note: 27, target: 28,
  disc: 29, cc: 30, give: 31, ssig: 32, ct: 33, away: 34, bank: 35, fin: 36, extra: 37, guest: 38, stagec: 39 };

// ------------------------------------------------------------------ small helpers
const q = (v) => (v == null ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (key, n) => { const d = new Date(`${key}T12:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
const dow = (key) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 Sunday
const D = (key) => (key == null ? 'null' : `polish_seed.d('${key}')`);
const TS = (key, hm = '12:00') => (key == null ? 'null' : `polish_seed.ts('${key} ${hm}')`);
const J = (obj) => `polish_seed.j($j$${JSON.stringify(obj)}$j$)`;
const plus = (hm, minutes) => { const [h, m] = hm.split(':').map(Number); const t = h * 60 + m + minutes; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const ins = (table, cols, rows, tail = '') => (rows.length ? `insert into public.${table} (${cols.join(', ')}) values\n  ${rows.map((r) => `(${r.map((v) => (v == null ? 'null' : v)).join(', ')})`).join(',\n  ')}${tail};\n` : '');
const out = [];
const counters = {};
const next = (k) => { counters[k] = (counters[k] || 0) + 1; return id(K[k], counters[k]); };

// ------------------------------------------------------------------ the practice
const ORGS = {
  halden: { n: 1, name: 'Tessaline Partners', city: 'New York', country: 'US', sector: 'Business', legal: 'Tessaline Partners LP' },
  bright: { n: 2, name: 'Harbour Rowing', city: 'London', sector: 'Sport', legal: 'Harbour Rowing Ltd' },
  tamsin: { n: 3, name: 'Calder Wolfe Racing', city: 'Oxford', sector: 'Sport', legal: 'Calder Wolfe Racing Ltd' },
};
for (const o of Object.values(ORGS)) o.id = id(K.org, o.n);

const PKGS = {
  sprint: { n: 1, name: 'Leadership Sprint, 3 months', sector: 'Business', kind: 'sessions', per: 'once', personal: 584000, org: 746000, hours: 10,
    defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 6, minutes: 60 }], rhythm: 'Every 2 weeks', place: 'either', priceMode: 'total', settle: 'equal', months: 3, fullTerm: true, offerUpfront: true, noticeHours: 24, dueDays: 14, expiryDays: 30, pausing: true, level: 'Executive' } },
  accel: { n: 2, name: 'Leadership Accelerator, 6 months', sector: 'Business', kind: 'sessions', per: 'once', personal: 1048000, org: 1346000, hours: 18,
    defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 11, minutes: 60 }], rhythm: 'Every 2 weeks', place: 'either', priceMode: 'total', settle: 'equal', months: 6, fullTerm: true, offerUpfront: true, noticeHours: 24, dueDays: 14, expiryDays: 30, pausing: true, level: 'Executive' } },
  partner: { n: 3, name: 'Leadership Partnership, 12 months', sector: 'Business', kind: 'sessions', per: 'once', personal: 1748000, org: 2246000, hours: 31,
    defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 17, minutes: 60 }], rhythm: 'Every 2 weeks', place: 'either', priceMode: 'total', settle: 'equal', months: 12, fullTerm: true, offerUpfront: true, noticeHours: 24, dueDays: 14, expiryDays: 30, pausing: true, level: 'Executive' } },
  sounding: { n: 4, name: 'Leadership Sounding Board', detail: 'Monthly', sector: 'Business', kind: 'retainer', per: 'month', personal: 194000, org: 246000,
    defaults: { retainer: { sessions: 'Up to 2 a month, 60 minutes each', invoice: 'monthly' }, place: 'either', offerUpfront: true } },
  workshop: { n: 5, name: 'Team Workshop, 90 minutes', sector: 'Business', kind: 'oneoff', per: 'once', personal: null, org: 94000, hours: 1.5,
    defaults: { oneoff: { place: 'inperson', settle: 'before' } } },
  season: { n: 6, name: 'Season Ready Sprint', sector: 'Sport', kind: 'sessions', per: 'once', personal: 124000, org: 128000, hours: 4,
    defaults: { blocks: [{ n: 4, minutes: 60 }], rhythm: 'Every 2 weeks', place: 'zoom', priceMode: 'total', settle: 'equal', months: 3, fullTerm: false, offerUpfront: true, noticeHours: 24, dueDays: 14, expiryDays: 30, pausing: true, level: 'Executive' } },
  fullseason: { n: 7, name: 'Full-Season Coaching', sector: 'Sport', kind: 'sessions', per: 'once', personal: 546000, org: 586000, hours: 20,
    defaults: { blocks: [{ n: 20, minutes: 60 }], rhythm: 'Every 2 weeks', place: 'either', priceMode: 'total', settle: 'equal', months: 12, fullTerm: true, offerUpfront: true, noticeHours: 24, dueDays: 14, expiryDays: 30, pausing: true, level: 'Executive' } },
  hours: { n: 8, name: 'Block of hours', sector: 'Business', kind: 'hours', per: 'once', personal: 200000, org: 240000,
    defaults: { hours: { rateMinor: 15000, owner: 'client', tellAt80: true } } },
  team: { n: 9, name: 'Team coaching programme', sector: 'Sport', kind: 'team', per: 'once', personal: null, org: 1800000, hours: 36,
    defaults: { blocks: [{ n: 12, minutes: 60 }], rhythm: 'Every 2 weeks', team: { sessions: '12 of 60 minutes each', settle: 'deposit', needsPO: false } } },
};
for (const p of Object.values(PKGS)) p.id = id(K.pkg, p.n);

// The clients. kind: what they have (sessions, retainer, hours, payg, team, none); start: first session's week; anchor:
// a day their sessions fall on (BASE = today); slot: the time; every: weeks between sessions.
const C = [
  { n: 1, name: 'Sam Carter', user: SAM_USER, standing: true, status: 'active', sector: 'Business', job: 'Portfolio manager', city: 'London', pkg: 'partner', kind: 'sessions', start: '2026-10-19', signed: '2026-10-12', anchor: '2026-11-30', slot: '09:00', every: 2, invited: '2026-09-22' },
  { n: 2, name: 'Jordan Lee', user: JORDAN_USER, standing: true, status: 'active', sector: 'Business', org: 'halden', job: 'Principal', city: 'London', pkg: 'accel', kind: 'sessions', start: '2026-09-07', signed: '2026-08-27', anchor: '2026-11-26', slot: '11:30', every: 2, invited: '2026-08-20' },
  { n: 3, name: 'Priya Shah', status: 'active', sector: 'Business', job: 'Chief operating officer', city: 'London', pkg: 'accel', kind: 'sessions', start: '2026-07-06', signed: '2026-06-24', anchor: BASE, slot: '08:30', every: 2 },
  { n: 4, name: 'Ellis Grant', status: 'active', sector: 'Business', org: 'halden', job: 'Partner', city: 'New York', zone: 'America/New_York', country: 'US', pkg: 'partner', kind: 'sessions', start: '2026-03-02', signed: '2026-02-18', anchor: '2026-11-27', slot: '10:00', every: 3 },
  { n: 5, name: 'Grace Adeyemi', status: 'active', sector: 'Business', org: 'halden', job: 'Finance director', city: 'London', pkg: 'partner', kind: 'sessions', start: '2026-06-01', signed: '2026-05-20', anchor: BASE, slot: '10:00', every: 2 },
  { n: 6, name: 'Elena Vasquez', status: 'active', sector: 'Sport', org: 'bright', job: 'Assistant coach', city: 'London', kind: 'team', start: '2026-09-16', anchor: BASE, slot: '14:30', every: 2, inPerson: true },
  { n: 7, name: 'Marcus Bell', status: 'active', sector: 'Sport', org: 'bright', job: 'Performance analyst', city: 'London', kind: 'team', start: '2026-09-17', anchor: '2026-12-03', slot: '15:30', every: 2 },
  { n: 8, name: 'Nina Price', status: 'active', sector: 'Sport', org: 'bright', job: 'Strength and conditioning lead', city: 'London', kind: 'team', start: '2026-09-18', anchor: '2026-11-27', slot: '14:00', every: 2 },
  { n: 9, name: 'Oliver Hartley', status: 'active', sector: 'Sport', org: 'tamsin', job: 'Team principal', city: 'Oxford', pkg: 'fullseason', kind: 'sessions', start: '2026-04-06', signed: '2026-03-25', anchor: '2026-12-02', slot: '17:00', every: 3 },
  { n: 10, name: 'Freya Lund', status: 'active', sector: 'Sport', org: 'tamsin', job: 'Race engineer', city: 'Oxford', pkg: 'season', kind: 'sessions', start: '2026-10-12', signed: '2026-10-01', anchor: '2026-12-07', slot: '18:00', every: 3, selfPays: true },
  { n: 11, name: 'Dana Whitfield', status: 'active', sector: 'Business', job: 'Managing partner', city: 'New York', zone: 'America/New_York', country: 'US', pkg: 'sounding', kind: 'retainer', start: '2026-02-02', signed: '2026-01-22', anchor: '2026-11-23', slot: '16:00', every: 2, usd: true },
  { n: 12, name: 'Daniel Okafor', status: 'active', stage: 'renewal_due', sector: 'Business', job: 'Chief executive', city: 'London', pkg: 'partner', kind: 'sessions', start: '2025-12-01', signed: '2025-11-19', anchor: '2026-12-01', slot: '12:00', every: 3 },
  { n: 13, name: 'Chloe Martin', status: 'active', stage: 'closing', sector: 'Business', job: 'Head of product', city: 'Manchester', pkg: 'accel', kind: 'sessions', start: '2026-07-07', signed: '2026-06-26', anchor: '2026-11-24', slot: '13:00', every: 2, overdue: true },
  { n: 14, name: 'Rory Fitzgerald', status: 'active', sector: 'Personal', job: 'Architect', city: 'Brighton', pkg: 'sprint', kind: 'sessions', start: '2026-09-21', signed: '2026-09-10', anchor: '2026-11-23', slot: '19:00', every: 2, refund: true },
  { n: 15, name: 'Leila Haddad', status: 'active', stage: 'starting', sector: 'Business', job: 'General counsel', city: 'London', pkg: 'accel', kind: 'sent', invited: null },
  { n: 16, name: 'Nathan Cole', status: 'active', stage: 'starting', sector: 'Business', job: 'Chief technology officer', city: 'Cambridge', pkg: 'partner', kind: 'quote', invited: null },
  { n: 17, name: 'Rhys Evans', status: 'active', sector: 'Business', job: 'Chief operating officer', city: 'London', pkg: 'hours', kind: 'hours', start: '2026-10-26', signed: '2026-10-20', anchor: '2026-12-04', slot: '11:00', every: 3 },
  { n: 18, name: 'Samir Patel', status: 'active', sector: 'Business', job: 'Sales director', city: 'Birmingham', kind: 'payg', start: '2026-01-14', anchor: '2026-12-09', slot: '08:00', every: 5 },
  { n: 19, name: 'Ruth Ellison', status: 'active', sector: 'Medicine', job: 'Consultant surgeon', city: 'Sheffield', kind: 'payg', start: '2026-05-13', anchor: '2026-11-18', slot: '07:30', every: 6 },
  { n: 20, name: 'Hannah Brooks', status: 'active', sector: 'Sport', job: 'Head coach, national rowing squad', city: 'Toronto', zone: 'America/Toronto', country: 'CA', kind: 'payg', start: '2026-08-05', anchor: '2026-12-02', slot: '08:30', every: 4 },
  { n: 21, name: 'Isla Brennan', status: 'paused', sector: 'Business', job: 'Marketing director', city: 'Edinburgh', pkg: 'partner', kind: 'sessions', start: '2026-01-05', signed: '2025-12-15', anchor: '2026-08-24', slot: '09:30', every: 3, stopped: '2026-09-01' },
  { n: 22, name: 'George Whitlock', status: 'paused', sector: 'Business', job: 'Partner', city: 'London', pkg: 'accel', kind: 'sessions', start: '2026-06-08', signed: '2026-05-27', anchor: '2026-10-12', slot: '16:30', every: 2, stopped: '2026-10-15' },
  { n: 23, name: 'Ava Lindqvist', status: 'paused', sector: 'Sport', job: 'Performance director', city: 'Nottingham', pkg: 'fullseason', kind: 'sessions', start: '2026-08-03', signed: '2026-07-22', anchor: '2026-09-14', slot: '15:00', every: 2, stopped: '2026-09-20' },
  { n: 24, name: 'Daniel Osei', status: 'past', sector: 'Business', job: 'Chief financial officer', city: 'London', pkg: 'accel', kind: 'sessions', start: '2025-12-01', signed: '2025-11-20', anchor: '2026-05-25', slot: '10:30', every: 2, stopped: '2026-06-01' },
  { n: 25, name: 'Megan Doyle', status: 'past', sector: 'Personal', job: 'Writer', city: 'Bath', pkg: 'sprint', kind: 'sessions', start: '2026-02-02', signed: '2026-01-21', anchor: '2026-04-27', slot: '18:30', every: 2, stopped: '2026-05-04' },
  { n: 26, name: 'Kieran Walsh', status: 'past', sector: 'Business', job: 'Managing director', city: 'Belfast', pkg: 'accel', kind: 'sessions', start: '2026-01-12', signed: '2025-12-30', anchor: '2026-07-06', slot: '12:30', every: 2, stopped: '2026-07-13' },
  { n: 27, name: 'Sophie Lam', status: 'past', sector: 'Sport', job: 'Head of performance', city: 'Loughborough', pkg: 'fullseason', kind: 'sessions', start: '2025-12-08', signed: '2025-11-26', anchor: '2026-08-24', slot: '14:00', every: 3, stopped: '2026-08-31' },
  { n: 28, name: 'Robin Ashcroft', status: 'active', stage: 'starting', sector: 'Business', job: 'Head of strategy', city: 'Leicester', kind: 'none', brandNew: true, invited: '2026-11-23' },
];
for (const c of C) {
  c.pid = id(K.profile, c.n);
  c.first = c.name.split(' ')[0];
  c.zone = c.zone || 'Europe/London';
  c.country = c.country || 'GB';
  c.mobile = `+447700900${String(100 + c.n).padStart(3, '0')}`;
  if (!c.standing) {
    c.email = c.brandNew ? 'local-new-client@example.com' : `polish-client-${String(c.n).padStart(2, '0')}@example.com`;
    // Everyone but the two still deciding has an account.
    if (c.kind !== 'sent' && c.kind !== 'quote') c.user = id(K.user, c.n);
  } else c.email = c.user === SAM_USER ? 'local-client@example.com' : 'local-org-client@example.com';
  c.org = c.org ? ORGS[c.org] : null;
  c.funded = Boolean(c.org) && !c.selfPays;
}
const byN = Object.fromEntries(C.map((c) => [c.n, c]));

// ------------------------------------------------------------------ header and helpers
out.push(`-- Local stand-in seed, part 6: an invented practice for the owner test coach, Alex Morgan (part 5's standing
-- accounts), to judge the coach portal by (Polish 1, "Data to judge it by"). WRITTEN BY 06-polish-practice.mjs: edit
-- that and run it again, never this file. Invented names only; every row has an id starting 5eed0600- (or hangs off a
-- row that does: session people, notes, ratings, profile history), and remove-06-polish.sql takes it all out.
-- Run after part 5 on a base WITHOUT the scale seed (parts 1 to 4 make another owner, and Alex must be the owner):
--   node seed.mjs --from <base.tar> --to <out.tar> --only 5,6
-- Triggers and guards stay on (inserted as the server, as the database allows). Dates are as of ${BASE} and move to the
-- day it runs. Local only: never run on a hosted database.
do $$ begin
  if not exists (select 1 from public.coaches where id = '${ALEX}' and role = 'owner') then
    raise exception 'Part 6 needs Alex Morgan (part 5) as the owner: run it on a base without the scale seed.';
  end if;
  if exists (select 1 from public.client_profiles where id::text like '5eed0600-%') then
    raise exception 'Part 6 is already here (remove it first with remove-06-polish.sql).';
  end if;
end $$;
create schema if not exists polish_seed;
create or replace function polish_seed.shift() returns integer language sql stable as $f$ select ((now() at time zone 'Europe/London')::date - date '${BASE}') $f$;
create or replace function polish_seed.d(k text) returns date language sql stable as $f$ select k::date + polish_seed.shift() $f$;
create or replace function polish_seed.ts(k text) returns timestamptz language sql stable as $f$
  select ((left(k, 10)::date + polish_seed.shift())::timestamp + substr(k, 12)::time) at time zone 'Europe/London' $f$;
-- Moves every YYYY-MM-DD inside a JSON document by the same days.
create or replace function polish_seed.j(doc text) returns jsonb language plpgsql stable as $f$
declare m text; s text := doc;
begin
  for m in select distinct x[1] from regexp_matches(doc, '"(\\d{4}-\\d{2}-\\d{2})"', 'g') x loop
    s := replace(s, '"' || m || '"', '"' || (m::date + polish_seed.shift())::text || '"');
  end loop;
  return s::jsonb;
end $f$;
select set_config('clarity.linking', 'on', false);
`);

// ------------------------------------------------------------------ people: accounts, organisations, clients
const users = C.filter((c) => c.user && !c.standing);
out.push('-- Sign-in accounts for the clients who have joined (the stand-in\'s one password; tests/scale/local-keys.mjs).');
out.push(ins('auth.users'.replace('public.', ''), ['id', 'email', 'aud', 'role', 'email_confirmed_at', 'created_at', 'updated_at', 'raw_app_meta_data', 'raw_user_meta_data'],
  users.map((c) => [q(c.user), q(c.email), q('authenticated'), q('authenticated'), TS(c.brandNew ? '2026-11-24' : addDays(c.start, -10), '10:00'), TS(c.brandNew ? '2026-11-24' : addDays(c.start, -10), '10:00'), 'now()', q('{"provider":"email"}'), q('{}')])).replace('public.auth.users', 'auth.users'));
out.push(ins('profiles', ['id', 'first_name', 'last_name', 'email', 'terms_accepted', 'created_at', 'updated_at'],
  users.map((c) => [q(c.user), q(c.first), q(c.name.split(' ').slice(1).join(' ')), q(c.email), 'true', TS(c.brandNew ? '2026-11-24' : addDays(c.start, -10), '10:00'), 'now()']),
  '\n  on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, terms_accepted = true, created_at = excluded.created_at'));
out.push(ins('person_settings', ['user_id', 'time_zone', 'country', 'units', 'terms_version', 'terms_accepted_at'],
  users.map((c) => [q(c.user), q(c.zone), q(c.country), q(c.country === 'US' ? 'imperial' : 'metric'), q('2026-10'), TS(c.brandNew ? '2026-11-24' : addDays(c.start, -10), '10:05')]),
  '\n  on conflict (user_id) do update set time_zone = excluded.time_zone, country = excluded.country, units = excluded.units, terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at'));
out.push(ins('coach_clients', ['id', 'client_id', 'coach_id', 'started_at'],
  C.filter((c) => c.user && c.user !== SAM_USER).map((c) => [q(next('cc')), q(c.user), q(ALEX), TS(c.brandNew ? '2026-11-24' : addDays(c.start, -10), '10:05')])));

out.push(ins('organisations', ['id', 'name', 'currency', 'city', 'sector', 'country', 'created_by', 'created_at'],
  Object.values(ORGS).map((o) => [q(o.id), q(o.name), q('GBP'), q(o.city), q(o.sector), q(o.country || 'GB'), q(ALEX_USER), TS('2026-01-10', '09:00')])));
const contacts = [
  ['halden', 'Jo Patel', 'Chief people officer', ['sponsor', 'buyer'], 'Signs off each cohort.'],
  ['halden', 'Dev Malhotra', 'Accounts payable', ['invoices'], 'Needs the PO number on every invoice.'],
  ['bright', 'Margaret Hale', 'Performance director', ['sponsor'], 'Sponsor for the squad leadership programme.'],
  ['bright', 'Owen Pryce', 'Programme manager', ['hr', 'buyer'], null],
  ['tamsin', 'Gemma Rowe', 'Finance manager', ['invoices', 'sponsor'], 'Pays on the 1st of the month.'],
];
out.push(ins('organisation_contacts', ['id', 'organisation_id', 'name', 'email', 'job_title', 'roles', 'note', 'last_contact_on', 'last_contact_how', 'created_by'],
  contacts.map(([o, name, job, roles, note], i) => [q(next('contact')), q(ORGS[o].id), q(name), q(`polish-contact-${i + 1}@example.com`), q(job), `array[${roles.map(q).join(', ')}]`, q(note), D(addDays(BASE, -(6 + i * 9))), q(i % 2 ? 'emailed' : 'spoke'), q(ALEX_USER)])));
// Tessaline needs a purchase order on every invoice (065's billing profile).
out.push(ins('org_billing_profiles', ['id', 'coach_id', 'organisation_id', 'legal_name', 'billing_address', 'invoices_email', 'supplier_number', 'needs_po', 'their_reference', 'hourly_rate_minor', 'terms_days', 'timesheet', 'evidence_required', 'supplier_portal', 'portal_url'], [
  [q(next('obp')), q(ALEX), q(ORGS.halden.id), q('Tessaline Partners LP'), q('Floor 12, 1 Example Plaza\nNew York, NY'), q('invoices-tessaline@example.com'), q('SUP-20418'), 'true', q('Leadership coaching, 2026 cohort'), '30000', '30', 'true', 'false', 'true', q('https://suppliers.tessaline.example.com')],
  [q(next('obp')), q(ALEX), q(ORGS.bright.id), q('Harbour Rowing Ltd'), q('The Boathouse, River Walk\nLondon'), q('finance-harbour-rowing@example.com'), null, 'false', q('Squad leadership programme'), null, '30', 'false', 'false', 'false', null],
  [q(next('obp')), q(ALEX), q(ORGS.tamsin.id), q('Calder Wolfe Racing Ltd'), q('Unit 7, Paddock Lane\nOxford'), q('accounts-calder-wolfe@example.com'), null, 'false', null, null, '14', 'false', 'false', 'false', null],
]));
const PO = next('po');
out.push(ins('purchase_orders', ['id', 'coach_id', 'organisation_id', 'number', 'value_minor', 'currency', 'starts_on', 'ends_on', 'finance_contact', 'invoice_email', 'supplier_ref', 'status'], [
  [q(PO), q(ALEX), q(ORGS.halden.id), q('PO-448120'), '4500000', q('GBP'), D('2026-03-01'), D('2027-02-28'), q('Dev Malhotra'), q('invoices-tessaline@example.com'), q('SUP-20418'), q('open')],
  [q(next('po')), q(ALEX), q(ORGS.halden.id), q('PO-431977'), '900000', q('GBP'), D('2025-09-01'), D('2026-02-28'), q('Dev Malhotra'), q('invoices-tessaline@example.com'), q('SUP-20418'), q('closed')],
]));

out.push('-- Clients (client_profiles, 049). Accounts are linked as the invite does (clarity.linking).');
const lastContact = (c) => (c.status === 'past' ? c.stopped : c.status === 'paused' ? c.stopped : c.kind === 'sent' ? addDays(BASE, -3) : c.kind === 'quote' ? addDays(BASE, -5) : addDays(BASE, -((c.n * 3) % 12)));
out.push(ins('client_profiles', ['id', 'coach_id', 'user_id', 'name', 'email', 'mobile', 'organisation_id', 'job_title', 'city', 'time_zone', 'country', 'status', 'stage', 'sector', 'getting_started', 'last_contact_on', 'invited_at', 'ended_on', 'referred_by', 'created_by', 'created_at'],
  C.map((c) => {
    const created = c.start ? addDays(c.signed || c.start, -14) : c.brandNew ? '2026-11-23' : addDays(BASE, -12);
    const gs = c.brandNew || c.kind === 'sent' || c.kind === 'quote' ? {} : { first_review: true, welcome_pack: true };
    return [q(c.pid), q(ALEX), q(c.user || null), q(c.name), q(c.email), q(c.mobile), q(c.org?.id || null), q(c.job), q(c.city), q(c.zone), q(c.country), q(c.status), q(c.stage || (c.status === 'past' ? null : c.status === 'paused' ? 'paused' : null)),
      q(c.sector), q(JSON.stringify(gs)), D(lastContact(c)), c.user || c.invited ? TS(c.invited || addDays(created, 1), '09:15') : 'null', c.status === 'past' ? D(c.stopped) : 'null',
      q(c.n % 5 === 0 ? 'Jo Patel' : c.n % 7 === 0 ? 'Daniel Okafor' : null), q(ALEX_USER), TS(created, '09:00')];
  })));
out.push(ins('client_notes', ['id', 'profile_id', 'coach_id', 'body', 'noted_on', 'pinned', 'created_at'], [
  [1, 'Wants to be braver in board meetings. Prefers early calls before the school run.', -40, true], [3, 'Restructure announced in January: keep space for it.', -20, true],
  [5, 'Finance team of 40. Most of her week is in back-to-back meetings.', -60, false], [6, 'Prefers to meet in person at the Leeds office.', -55, true],
  [12, 'Renewal conversation due before Christmas. He has asked about a quarterly retainer.', -10, true], [13, 'Last two sessions: focus on handing over the product roadmap.', -14, false],
  [21, 'Paused for parental leave. Back in the new year.', -85, true], [22, 'Paused while he moves house. Check in mid-December.', -41, true],
].map(([n, body, d, pin]) => [q(next('note')), q(byN[n].pid), q(ALEX), q(body), D(addDays(BASE, d)), String(pin), TS(addDays(BASE, d), '17:00')])));

// ------------------------------------------------------------------ packages, extras, discounts
out.push(ins('pricing_packages', ['id', 'coach_id', 'sector', 'name', 'detail', 'hours', 'per', 'org_price_minor', 'personal_price_minor', 'currency', 'position', 'agreement_kind', 'defaults'],
  Object.values(PKGS).map((p) => [q(p.id), q(ALEX), q(p.sector), q(p.name), q(p.detail || null), p.hours ?? 'null', q(p.per), p.org ?? 'null', p.personal ?? 'null', q('GBP'), String(p.n), q(p.kind), `${q(JSON.stringify(p.defaults))}::jsonb`])));
const EXTRAS = [['session', 'Extra coaching session', 75000, null], ['visit', 'Visit day', 250000, null], ['workshop', 'Team workshop day', 300000, null], ['hc', 'Health Check with a debrief', 150000, 'for teams and chief executives']];
out.push(ins('agreement_extras', ['id', 'coach_id', 'key', 'title', 'price_minor', 'hint', 'position'], EXTRAS.map(([key, title, price, hint], i) => [q(next('extra')), q(ALEX), q(key), q(title), String(price), q(hint), String(i + 1)])));
out.push(ins('discounts', ['id', 'coach_id', 'name', 'percent', 'amount_minor', 'all_packages'], [[q(next('disc')), q(ALEX), q('Returning client'), '15', 'null', 'true'], [q(next('disc')), q(ALEX), q('Early commitment'), 'null', '50000', 'false']]));

// ------------------------------------------------------------------ engagements, agreements, signatures
const COACH_SIG = next('sig');
out.push(ins('signatures', ['id', 'user_id', 'kind', 'typed_name', 'created_at'], [[q(COACH_SIG), q(ALEX_USER), q('typed'), q('Alex Morgan'), TS('2025-11-15', '09:00')]]));

const endOf = (c) => {
  if (c.kind === 'retainer' || c.kind === 'payg' || c.kind === 'hours') return null;
  if (c.kind === 'team') return '2027-03-12';
  const months = PKGS[c.pkg].defaults.months;
  return addMonths(c.start, months);
};
const engRows = [];
for (const c of C) {
  if (!c.start) continue;
  c.eid = next('eng');
  const p = c.pkg ? PKGS[c.pkg] : null;
  const total = c.kind === 'team' ? 12 : p?.defaults.blocks ? p.defaults.blocks.reduce((s, b) => s + b.n, 0) : 0;
  const kind = c.kind === 'payg' ? 'pay_as_you_go' : c.kind === 'retainer' ? 'ongoing' : c.kind === 'hours' ? 'pay_as_you_go' : 'sessions';
  const name = c.kind === 'team' ? 'Squad leadership programme' : c.kind === 'payg' ? 'Pay as you go' : c.kind === 'hours' ? 'Block of hours' : p.name;
  engRows.push([q(c.eid), q(ALEX), q(c.pid), q(kind), q(name), String(total), '0', String(c.kind === 'team' || p?.defaults.blocks?.[0].minutes !== 90 ? 60 : 60), String(c.every), D(c.start), D(endOf(c)),
    String(c.kind === 'hours' ? 800 : 0), q(c.funded ? c.org.name : null), q(c.status === 'past' ? 'ended' : 'active'), TS(addDays(c.start, -7), '09:00')]);
}
out.push(ins('engagements', ['id', 'coach_id', 'profile_id', 'kind', 'name', 'sessions_total', 'sessions_held', 'default_minutes', 'every_weeks', 'starts_on', 'ends_on', 'time_credit_minutes', 'funded_by', 'status', 'created_at'], engRows));

// Agreements, written by the app's own builder.
const coach = { id: ALEX, full_name: 'Alex Morgan', display_first_name: 'Alex' };
const agRows = []; const verRows = []; const signRows = []; const afterSign = []; const clientSigs = [];
function agreementFor(c, { status, sentOn, signedOn }) {
  const p = PKGS[c.pkg];
  const ids = { agreementId: next('ag'), versionId: next('ver') };
  const pkg = { id: p.id, name: p.name, agreement_kind: p.kind, personal_price_minor: p.personal, org_price_minor: p.org, currency: 'GBP', defaults: p.defaults, detail: p.detail || null };
  const draft = newDraft({ pkg, who: { profile: { id: c.pid, name: c.name, organisation_id: c.org?.id || null } }, coach, ids, todayKey: addDays(c.start || BASE, -7) });
  const t = draft.version.terms;
  if (c.start) { t.startsOn = c.start; if (t.endsOn) t.endsOn = endOf(c) || t.endsOn; }
  if (c.funded) { t.funder = 'org'; t.fundedBy = c.org.name; t.orgName = c.org.name; if (t.totalMinor) t.totalMinor = p.org; }
  if (c.kind === 'retainer' && c.usd) { t.currency = 'USD'; t.retainer = { ...t.retainer, feeMinor: 250000 }; }
  if (c.kind === 'hours') t.hours = { ...t.hours, work: 'Coaching and sounding board time for the people team’s restructure, used as needed.', rateMinor: 15000, blockMinor: 200000 };
  t.clientEmail = c.email;
  const f = versionFields(t, {});
  const usd = t.currency === 'USD';
  c.agId = ids.agreementId; c.verId = ids.versionId; c.total = f.total_minor; c.terms = t;
  agRows.push([q(ids.agreementId), q(ALEX), q('coaching'), q(c.pid), q(c.org?.id || null), q(c.eid || null), q(status === 'signed' ? 'sent' : status), '1', q(p.kind), q(p.id), TS(sentOn || BASE, '08:00')]);
  verRows.push([q(ids.versionId), q(ids.agreementId), q(ALEX), '1', q(status === 'draft' ? 'draft' : 'sent'), J(f.terms), `${q(JSON.stringify(f.clauses))}::jsonb`, q(usd ? 'USD' : 'GBP'), usd ? '1.265823' : 'null', usd ? TS(sentOn, '08:00') : 'null',
    String(f.total_minor), q(f.funded_by), status === 'draft' ? 'null' : TS(sentOn, '08:00'), status === 'draft' ? 'null' : q(COACH_SIG), status === 'draft' ? 'null' : TS(sentOn, '08:00'),
    q(c.kind === 'quote' ? 'quote' : 'agreement'), q(t.personalNote || null), status === 'sent' ? D(addDays(sentOn, 30)) : 'null', TS(sentOn || BASE, '08:00')]);
  if (status === 'signed') {
    const sig = next('sig');
    clientSigs.push([q(sig), q(c.user), q('typed'), q(c.name), TS(signedOn, '19:30')]);
    afterSign.push(`update public.agreement_versions v set status = 'signed', client_signed_at = ${TS(signedOn, '19:30')}, client_signature_id = '${sig}', signed_name = ${q(c.name)}, signed_email = ${q(c.email)}, signed_user_id = '${c.user}', start_now = true, start_now_at = ${TS(signedOn, '19:30')}, settle_choice = 'plan', fingerprint = public.agreement_fingerprint(v.id) where v.id = '${ids.versionId}';
update public.agreements set status = '${c.status === 'past' ? 'ended' : 'signed'}', paused_from = ${c.status === 'paused' ? D(c.stopped) : 'null'}, updated_at = ${TS(signedOn, '19:30')} where id = '${ids.agreementId}';`);
  }
}
for (const c of C) {
  if (['sessions', 'retainer', 'hours'].includes(c.kind)) agreementFor(c, { status: 'signed', sentOn: addDays(c.signed, -2), signedOn: c.signed });
  if (c.kind === 'sent') agreementFor(c, { status: 'sent', sentOn: addDays(BASE, -3) });
  if (c.kind === 'quote') agreementFor(c, { status: 'draft', sentOn: addDays(BASE, -5) });
}
// The sponsor agreement: Harbour Rowing's squad leadership programme, signed by their sponsor.
{
  const ids = { agreementId: next('ag'), versionId: next('ver') };
  const p = PKGS.team;
  const pkg = { id: p.id, name: p.name, agreement_kind: 'team', org_price_minor: p.org, personal_price_minor: null, currency: 'GBP', defaults: p.defaults };
  const draft = newDraft({ pkg, who: { organisation: { id: ORGS.bright.id, name: ORGS.bright.name } }, coach, ids, todayKey: '2026-09-01' });
  const t = draft.version.terms;
  t.startsOn = '2026-09-16'; t.endsOn = '2027-03-12';
  t.team = { ...t.team, people: [6, 7, 8].map((n) => ({ name: byN[n].name, email: byN[n].email, profileId: byN[n].pid })), totalMinor: p.org, settle: 'deposit', needsPO: false,
    invoicesEmail: 'finance-harbour-rowing@example.com', sponsor: { name: 'Margaret Hale', role: 'Chief nursing officer', email: 'polish-contact-3@example.com' } };
  const f = versionFields(t, {});
  ORGS.bright.agId = ids.agreementId; ORGS.bright.verId = ids.versionId; ORGS.bright.total = f.total_minor;
  agRows.push([q(ids.agreementId), q(ALEX), q('sponsor'), 'null', q(ORGS.bright.id), 'null', q('sent'), '1', q('team'), q(p.id), TS('2026-09-03', '08:00')]);
  verRows.push([q(ids.versionId), q(ids.agreementId), q(ALEX), '1', q('sent'), J(f.terms), `${q(JSON.stringify(f.clauses))}::jsonb`, q('GBP'), 'null', 'null', String(f.total_minor), q(f.funded_by),
    TS('2026-09-03', '08:00'), q(COACH_SIG), TS('2026-09-03', '08:00'), q('agreement'), 'null', 'null', TS('2026-09-03', '08:00')]);
  const ssig = next('ssig');
  afterSign.push(`update public.agreement_versions v set status = 'signed', sponsor_signed_at = ${TS('2026-09-08', '11:20')}, sponsor_name = 'Margaret Hale', sponsor_role = 'Chief nursing officer', sponsor_email = 'polish-contact-3@example.com', sponsor_po = null, fingerprint = public.agreement_fingerprint(v.id) where v.id = '${ids.versionId}';
insert into public.sponsor_signatures (id, coach_id, version_id, typed_name, created_at) values ('${ssig}', '${ALEX}', '${ids.versionId}', 'Margaret Hale', ${TS('2026-09-08', '11:20')});
update public.agreements set status = 'signed', updated_at = ${TS('2026-09-08', '11:20')} where id = '${ids.agreementId}';`);
}
out.push('-- Agreements of 065\'s kinds: signed set sessions, a retainer in dollars, a block of hours, a sent agreement, a sent quote and a sponsor\'s team programme.');
out.push(ins('signatures', ['id', 'user_id', 'kind', 'typed_name', 'created_at'], clientSigs));
out.push(ins('agreements', ['id', 'coach_id', 'kind', 'profile_id', 'organisation_id', 'engagement_id', 'status', 'current_version', 'agreement_kind', 'package_id', 'created_at'], agRows));
out.push(ins('agreement_versions', ['id', 'agreement_id', 'coach_id', 'version', 'status', 'terms', 'clauses', 'currency', 'fx_rate', 'fx_at', 'total_minor', 'funded_by', 'coach_signed_at', 'coach_signature_id', 'sent_at', 'send_as', 'personal_note', 'expires_on', 'created_at'], verRows));
out.push(afterSign.join('\n') + '\n');
// The quote to Nathan, sent five days ago (as the Send button does: a number, sent, 30 days).
{
  const c = byN[16]; const qid = next('quote');
  out.push(`insert into public.agreement_quotes (id, coach_id, agreement_id, version_id, valid_days, coach_signature_id) values ('${qid}', '${ALEX}', '${c.agId}', '${c.verId}', 30, '${COACH_SIG}');
select public.quote_take_number('${qid}');
update public.agreement_quotes set status = 'sent', sent_at = ${TS(addDays(BASE, -5), '08:00')}, valid_until = ${D(addDays(BASE, 25))} where id = '${qid}';
insert into public.agreement_link_opens (id, coach_id, version_id, who, opened_at) values ('${next('guest')}', '${ALEX}', '${c.verId}', 'quote', ${TS(addDays(BASE, -4), '21:10')});
insert into public.agreement_link_opens (id, coach_id, version_id, who, opened_at) values ('${next('guest')}', '${ALEX}', '${byN[15].verId}', 'client', ${TS(addDays(BASE, -2), '07:45')});
`);
}

// ------------------------------------------------------------------ sessions and the calendar
const LIMIT = addDays(BASE, 28);
const sessRows = []; const calRows = []; const noteRows = []; const peopleRows = [];
const zoom = (sid) => `https://zoom.example.com/j/8${parseInt(sid.slice(-6), 16).toString().padStart(9, '7')}`;
const RECAPS = ['We looked at the week ahead and agreed two small steps.', 'We worked on how to open the board conversation, and agreed one thing to try on Monday.',
  'We talked through the restructure and what to say first to the team.', 'We reviewed the last month and chose the habit to keep.'];
for (const c of C) {
  if (!c.start || !c.eid) continue;
  const step = c.every * 7;
  const end = c.stopped ? addDays(c.stopped, -1) : (endOf(c) && endOf(c) < LIMIT ? endOf(c) : LIMIT);
  const days = [];
  for (let d = c.anchor; d >= c.start; d = addDays(d, -step)) days.unshift(d);
  for (let d = addDays(c.anchor, step); d <= end; d = addDays(d, step)) days.push(d);
  const cap = c.kind === 'team' ? 12 : c.kind === 'sessions' ? PKGS[c.pkg].defaults.blocks.reduce((n, b) => n + b.n, 0) : Infinity;
  const kept = days.filter((d) => d >= c.start && d <= end && dow(d) !== 0 && dow(d) !== 6).slice(0, cap);
  kept.forEach((day, i) => {
    const sid = next('sess');
    const past = day < BASE;
    const minutes = i === 0 && c.pkg && PKGS[c.pkg].defaults.blocks?.[0].minutes === 90 ? 90 : 60;
    const inPerson = c.inPerson && Math.round((new Date(`${day}T12:00:00Z`) - new Date(`${c.anchor}T12:00:00Z`)) / 864e5 / step) % 2 === 0;
    const outcome = past ? ((c.n + i) % 23 === 0 ? 'late_cancel' : (c.n + i) % 31 === 0 ? 'no_show' : 'held') : null;
    // The two most recent held sessions of a few clients are still to write up (Needs you).
    const recent = past && day >= addDays(BASE, -6);
    const writtenUp = outcome === 'held' && !(recent && [3, 13, 14, 11].includes(c.n));
    sessRows.push([q(sid), q(ALEX), q(c.pid), q(c.eid), q(i === 0 && c.kind !== 'payg' ? 'coaching' : 'coaching'), TS(day, c.slot), String(minutes), q(inPerson ? (c.org?.name || c.city) : 'Zoom'),
      q(outcome), writtenUp ? TS(day, plus(c.slot, minutes + 30)) : 'null', writtenUp ? q(RECAPS[(c.n + i) % RECAPS.length]) : 'null', TS(addDays(day, -10), '09:00')]);
    if (writtenUp && day >= addDays(BASE, -70)) noteRows.push([q(sid), q(ALEX), q('standard'), q(['The board conversation.', 'Delegating the weekly review.', 'Energy across a long week.', 'The team restructure.'][(c.n + i) % 4]),
      q(['Wants to be asked, not told.', 'Clearer when she writes it down first.', 'Pressure shows up as over-preparing.', 'Already knows the answer; needs permission.'][(c.n + i) % 4]), q('Ask how the conversation went.')]);
    const calId = next('cal');
    if (day >= addDays(BASE, -120)) {
      calRows.push([q(calId), q(ALEX), q('client_call'), q('work'), q(c.name), TS(day, c.slot), TS(day, plus(c.slot, minutes)), q('Europe/London'), 'false', 'null', 'null',
        q(inPerson ? (c.n === 6 ? 'Harbour Rowing, the Boathouse, London' : c.city) : null), q(inPerson ? 'in_person' : 'zoom'), inPerson ? 'null' : q(zoom(sid)), 'null', q(c.pid), q(sid), 'null']);
      if (inPerson && day >= addDays(BASE, -14)) {
        calRows.push([q(next('cal')), q(ALEX), q('travel'), q('work'), q('Train to Leeds'), TS(day, plus(c.slot, -195)), TS(day, plus(c.slot, -60)), q('Europe/London'), 'false', 'null', 'null', q('London King’s Cross to Leeds'), q('in_person'), 'null', q('Coach C, seat 42. Tickets in the app.'), 'null', 'null', q(calId)]);
        calRows.push([q(next('cal')), q(ALEX), q('travel'), q('work'), q('Train home'), TS(day, plus(c.slot, 120)), TS(day, plus(c.slot, 255)), q('Europe/London'), 'false', 'null', 'null', q('Leeds to London King’s Cross'), q('in_person'), 'null', 'null', 'null', 'null', q(calId)]);
      }
    }
  });
}
out.push('-- Coaching sessions (every client\'s rhythm, three of them today) and the calendar around them.');
out.push(ins('coach_sessions', ['id', 'coach_id', 'profile_id', 'engagement_id', 'kind', 'starts_at', 'minutes', 'place', 'outcome', 'written_up_at', 'recap', 'created_at'], sessRows));
// Recaps written up more than three days ago went to the client (as Send the recap does, under clarity.sending).
out.push(`select set_config('clarity.sending', 'on', false);
update public.coach_sessions set recap_sent_at = written_up_at + interval '20 minutes', recap_sent_by = '${ALEX_USER}', recap_emailed_at = written_up_at + interval '20 minutes'
 where id::text like '5eed0600-%' and written_up_at < now() - interval '3 days';
select set_config('clarity.sending', '', false);
`);
out.push(ins('coach_session_notes', ['session_id', 'coach_id', 'layout', 'focus', 'insight', 'next_time'], noteRows));

// The rest of the month: admin, writing, calls with leads and the Network, an event with its travel, a hold, own time.
const other = [];
const calItem = (kind, title, day, from, to, extra = {}) => {
  const cid = next('cal');
  other.push([q(cid), q(ALEX), q(kind), q(extra.calendar || 'work'), q(title), TS(day, from), TS(day, to), q('Europe/London'), 'false', 'null', 'null', q(extra.location || null), q(extra.place || 'zoom'),
    extra.place === 'in_person' || extra.place === 'phone' || kind === 'admin' || kind === 'writing' || kind === 'own_time' || kind === 'hold' ? 'null' : q(`https://zoom.example.com/j/6${String(other.length + 100).padStart(9, '3')}`),
    q(extra.notes || null), 'null', 'null', q(extra.travelFor || null)]);
  return cid;
};
for (let off = -14; off <= 21; off += 1) {
  const day = addDays(BASE, off); const wd = dow(day);
  if (wd === 1) calItem('admin', 'Invoices and admin', day, '08:00', '08:45');
  if (wd === 4) calItem('writing', 'Write the newsletter', day, '07:30', '08:30', { notes: 'Draft in the shared folder.' });
  if (wd === 2) calItem('own_time', 'Run by the river', day, '07:00', '07:45', { calendar: 'personal', place: 'in_person' });
  if (wd === 5 && off % 14 !== 0) calItem('own_time', 'Supervision with Kate', day, '12:30', '13:30', { place: 'zoom' });
}
calItem('chemistry', 'Discovery call: Lucy Fairbairn', addDays(BASE, 1), '16:00', '16:30');
calItem('chemistry', 'Discovery call: Joel Mensah', addDays(BASE, 2), '15:00', '15:30');
calItem('chemistry', 'Discovery call: Ethan Brooks', addDays(BASE, -9), '15:00', '15:30');
calItem('chemistry', 'Discovery call: Martha Ingram', addDays(BASE, -6), '13:30', '14:00');
calItem('connection', 'Coffee with Harriet Moss', addDays(BASE, 6), '12:00', '13:00', { place: 'in_person', location: 'The Wren café, St Paul’s' });
calItem('connection', 'Catch-up with Owen Pryce', addDays(BASE, 8), '12:30', '13:00');
calItem('connection', 'Call with Isaac Bramwell', addDays(BASE, -4), '17:30', '18:00', { place: 'phone' });
calItem('hold', 'Hold: Harbour Rowing team workshop', addDays(BASE, 13), '09:00', '12:00', { place: 'in_person', location: 'London' });
calItem('event', 'Tessaline quarterly review', addDays(BASE, 9), '14:00', '15:00', { place: 'in_person', location: 'Tessaline Partners, London office' });
calItem('own_time', 'Dentist', addDays(BASE, 7), '08:30', '09:15', { calendar: 'personal', place: 'in_person' });
// A two-day forum in Manchester, all day, with the train there and back.
{
  const from = addDays(BASE, 14); const to = addDays(BASE, 15);
  const ev = next('cal');
  other.push([q(ev), q(ALEX), q('event'), q('work'), q('Northern Leaders Forum, Manchester'), TS(from, '00:00'), TS(addDays(to, 1), '00:00'), q('Europe/London'), 'true', D(from), D(to), q('Manchester Central'), q('in_person'), 'null', q('Speaking on day two, 10:30.'), 'null', 'null', 'null']);
  calItem('travel', 'Train to Manchester', from, '06:30', '08:40', { place: 'in_person', location: 'London Euston to Manchester Piccadilly', travelFor: ev });
  calItem('travel', 'Train home', to, '17:00', '19:10', { place: 'in_person', location: 'Manchester Piccadilly to London Euston', travelFor: ev });
}
const CAL_COLS = ['id', 'coach_id', 'kind', 'calendar', 'title', 'starts_at', 'ends_at', 'time_zone', 'all_day', 'starts_on', 'ends_on', 'location', 'place_kind', 'meeting_link', 'notes', 'profile_id', 'session_id', 'travel_for'];
out.push(ins('coach_cal_items', CAL_COLS, calRows.filter((r) => r[2] !== q('travel'))));
out.push(ins('coach_cal_items', CAL_COLS, calRows.filter((r) => r[2] === q('travel'))));
out.push(ins('coach_cal_items', CAL_COLS, other.filter((r) => r[2] !== q('travel'))));
out.push(ins('coach_cal_items', CAL_COLS, other.filter((r) => r[2] === q('travel'))));
out.push(ins('coach_away', ['id', 'coach_id', 'starts_on', 'ends_on'], [[q(next('away')), q(ALEX), D('2026-12-23'), D('2027-01-03')]]));
out.push(ins('coach_call_types', ['id', 'coach_id', 'key', 'name', 'description', 'minutes', 'notice_hours', 'ahead_weeks', 'place_kind', 'active', 'makes_lead', 'position'], [
  [q(next('ct')), q(ALEX), q('chemistry'), q('Discovery call'), q('Thirty minutes to see whether coaching together is right for you.'), '30', '24', '4', q('zoom'), 'true', 'true', '1'],
  [q(next('ct')), q(ALEX), q('coaching'), q('Coaching session'), null, '60', '24', '6', q('zoom'), 'true', 'false', '2'],
]));
// Rhys's block of hours: the time logged against it.
out.push(ins('time_entries', ['id', 'engagement_id', 'coach_id', 'started_at', 'ended_at', 'note'],
  [[-27, '09:00', 90, 'Restructure plan, first read'], [-20, '14:00', 120, 'Team conversations, scripts'], [-13, '10:00', 60, 'Call with Rhys'], [-6, '15:30', 150, 'Review of the new structure']]
    .map(([d, t, m, note]) => [q(next('time')), q(byN[17].eid), q(ALEX), TS(addDays(BASE, d), t), TS(addDays(BASE, d), plus(t, m)), q(note)])));

// ------------------------------------------------------------------ money: a year like the Master Revenue Sheet
const invRows = []; const payRows = []; let stripeN = 0;
const fee = (minor) => Math.round(minor * 0.015) + 20;
function invoice(c, { kind, issued, total, lines, status, paidOn, terms = 14, org = null, po = null, currency = 'GBP', landed = null, n = null, sector }) {
  const iid = next('inv'); stripeN += 1;
  const due = addDays(issued, terms);
  const payer = org ? org.name : c.name;
  invRows.push([q(iid), q(ALEX), q(c?.agId || (org === ORGS.bright ? ORGS.bright.agId : null)), q(c?.pid || null), q(org?.id || c?.org?.id || null), 'public.next_invoice_number()', q(`in_polish_${stripeN}`), q(kind), q(status), q(currency),
    `${q(JSON.stringify(lines))}::jsonb`, String(total), String(status === 'paid' ? total : 0), String(terms), D(issued), D(due), q(po?.number || null), q(po ? PO : null), q(org ? 'organisation' : 'client'),
    q(payer), q(org ? (org === ORGS.halden ? 'invoices-tessaline@example.com' : org === ORGS.bright ? 'finance-harbour-rowing@example.com' : 'accounts-calder-wolfe@example.com') : c.email), q(c?.zone || 'Europe/London'),
    q(`https://invoice.stripe.example/polish/${stripeN}`), n == null ? 'null' : String(n), status === 'draft' ? 'null' : TS(issued, '08:00'), status === 'paid' ? TS(paidOn, '10:12') : 'null', q(sector),
    q(org === ORGS.halden ? 'SUP-20418' : null), q(org === ORGS.halden ? 'Leadership coaching, 2026 cohort' : null), org === ORGS.halden ? 'true' : 'false', c?.verId ? q(c.verId) : 'null']);
  if (status === 'paid') {
    const bank = Boolean(org);
    payRows.push([q(next('pay')), q(iid), q(ALEX), bank ? 'null' : q(`pi_polish_${stripeN}`), String(total), q(currency), String(landed ?? total), String(bank ? 0 : fee(landed ?? total)), q(bank ? 'Bank transfer' : null), String(bank),
      TS(paidOn, '10:12'), q(c?.pid || null), q(org?.id || null), q(payer), q(sector)]);
  }
  return iid;
}
const lineFor = (name, desc, amount) => [{ description: desc, amount }];
let refundInvoice = null;
for (const c of C) {
  if (!c.agId || c.kind === 'sent' || c.kind === 'quote') continue;
  if (c.funded) continue; // the organisation is invoiced below
  if (c.kind === 'hours') {
    invoice(c, { kind: 'first_payment', issued: c.signed, total: 200000, lines: lineFor(c.name, 'Block of hours, 13 hours 20 minutes at £150 an hour', 200000), status: 'paid', paidOn: addDays(c.signed, 2), sector: c.sector, n: 1 });
    continue;
  }
  const months = c.kind === 'retainer' ? 24 : PKGS[c.pkg].defaults.months;
  // Equal instalments as the app splits them (settling.js): the first carries the pennies that don't divide.
  const parts = c.kind === 'retainer' ? null : splitEqual(c.total, months);
  const stop = c.stopped || '2099-01-01';
  for (let i = 0; i < months; i += 1) {
    const issued = addMonths(c.start, i) > c.start ? addMonths(c.start, i) : addDays(c.start, -7);
    if (issued > BASE || issued > stop) break;
    const age = (new Date(`${BASE}T12:00:00Z`) - new Date(`${issued}T12:00:00Z`)) / 864e5;
    let status = 'paid';
    if (age < 12) status = 'sent';
    if (c.overdue && age < 40 && age >= 12) status = 'sent';
    const paidOn = addDays(issued, 3 + ((c.n + i) % 6));
    const desc = c.kind === 'retainer' ? `${PKGS[c.pkg].name}, ${new Date(`${issued}T12:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}` : `${PKGS[c.pkg].name}, payment ${i + 1} of ${months}`;
    const monthly = parts ? parts[i] : (c.usd ? 250000 : 194000);
    const iid = invoice(c, { kind: 'instalment', issued, total: monthly, lines: lineFor(c.name, desc, monthly), status, paidOn: paidOn > BASE ? addDays(BASE, -1) : paidOn, sector: c.sector, n: i + 1,
      currency: c.usd ? 'USD' : 'GBP', landed: c.usd ? Math.round(monthly / 1.2658) : null });
    if (c.refund && i === 1) refundInvoice = iid;
  }
}
// Pay-as-you-go clients: an invoice after each session held.
for (const c of C.filter((x) => x.kind === 'payg')) {
  const held = sessRows.filter((r) => r[2] === q(c.pid) && r[8] === q('held'));
  held.forEach((r, i) => {
    const day = r[5].match(/'(\d{4}-\d{2}-\d{2})/)[1];
    const issued = addDays(day, 1);
    const age = (new Date(`${BASE}T12:00:00Z`) - new Date(`${issued}T12:00:00Z`)) / 864e5;
    invoice(c, { kind: 'one_off', issued, total: 45000, lines: lineFor(c.name, `Coaching session, ${new Date(`${day}T12:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`, 45000),
      status: age < 10 ? 'sent' : 'paid', paidOn: addDays(issued, 4), sector: c.sector });
  });
}
// Organisations: Tessaline quarterly against its purchase order with a timesheet; Harbour Rowing's deposit and second
// payment; the rowing club for Oliver's season.
const halden = { org: ORGS.halden, po: { number: 'PO-448120' } };
[['2026-03-31', 'January to March', 690000, 'paid'], ['2026-06-30', 'April to June', 1170000, 'paid'], ['2026-09-30', 'July to September', 1530000, 'paid']].forEach(([issued, period, total, status]) => {
  invoice(null, { kind: 'org_hours', issued, total, lines: [{ description: `Leadership coaching for Tessaline Partners, ${period}`, amount: total }], status, paidOn: addDays(issued, 28), terms: 30, org: ORGS.halden, po: halden.po, sector: 'Business' });
});
invoice(null, { kind: 'org_hours', issued: '2026-10-31', total: 1290000, lines: [{ description: 'Leadership coaching for Tessaline Partners, October', amount: 1290000 }], status: 'sent', terms: 30, org: ORGS.halden, po: halden.po, sector: 'Business' });
invoice(null, { kind: 'deposit', issued: '2026-09-08', total: 900000, lines: [{ description: 'Squad leadership programme, deposit (50%)', amount: 900000 }], status: 'paid', paidOn: '2026-10-02', terms: 30, org: ORGS.bright, sector: 'Medicine' });
invoice(null, { kind: 'one_off', issued: '2026-04-01', total: 293000, lines: [{ description: 'Full-Season Coaching for Oliver Hartley, first half', amount: 293000 }], status: 'paid', paidOn: '2026-04-09', org: ORGS.tamsin, sector: 'Sport' });
invoice(null, { kind: 'one_off', issued: '2026-10-01', total: 293000, lines: [{ description: 'Full-Season Coaching for Oliver Hartley, second half', amount: 293000 }], status: 'paid', paidOn: '2026-10-06', org: ORGS.tamsin, sector: 'Sport' });
// Next month's drafts.
invoice(byN[1], { kind: 'instalment', issued: '2026-12-19', total: splitEqual(byN[1].total, 12)[2], lines: lineFor('Sam Carter', 'Leadership Partnership, 12 months, payment 3 of 12', splitEqual(byN[1].total, 12)[2]), status: 'draft', sector: 'Business', n: 3 });
const INV_COLS = ['id', 'coach_id', 'agreement_id', 'profile_id', 'organisation_id', 'number', 'stripe_invoice_id', 'kind', 'status', 'currency', 'lines', 'total_minor', 'paid_minor', 'terms_days', 'issued_on', 'due_on', 'po_number', 'purchase_order_id',
  'settles_to', 'payer_name', 'payer_email', 'payer_zone', 'hosted_url', 'instalment_n', 'sent_at', 'paid_at', 'sector', 'supplier_number', 'their_reference', 'timesheet', 'version_id'];
// Drafts are issued only when sent: keep their dates empty.
for (const r of invRows) if (r[8] === q('draft')) { r[14] = 'null'; r[15] = 'null'; r[22] = 'null'; }
out.push('-- A year of money shaped like the Master Revenue Sheet: monthly coaching fees, organisation invoices, a refund, a dollar retainer, a speaking fee.');
out.push(ins('invoices', INV_COLS, invRows));
// Tessaline's invoices were emailed and, once paid, put on their supplier portal too; October's still waits for the portal.
out.push(`update public.invoices set emailed_at = sent_at, portal_uploaded_at = case when status = 'paid' then sent_at + interval '1 day' end
 where id::text like '5eed0600-%' and organisation_id = '${ORGS.halden.id}' and sent_at is not null;
update public.invoices set emailed_at = sent_at where id::text like '5eed0600-%' and emailed_at is null and sent_at is not null;
`);
out.push(ins('payments', ['id', 'invoice_id', 'coach_id', 'stripe_id', 'amount_minor', 'currency', 'landed_gbp_minor', 'fee_minor', 'method', 'added_by_coach', 'paid_at', 'profile_id', 'organisation_id', 'payer_name', 'sector'], payRows));
out.push(ins('payments', ['id', 'coach_id', 'amount_minor', 'currency', 'landed_gbp_minor', 'fee_minor', 'method', 'added_by_coach', 'paid_at', 'payer_name', 'sector', 'what_for'], [
  [q(next('pay')), q(ALEX), '150000', q('GBP'), '150000', '0', q('Bank transfer'), 'true', TS('2026-06-19', '09:00'), q('Northern Leaders Forum'), q('Business'), q('Speaking fee, June forum')],
  [q(next('pay')), q(ALEX), '94000', q('GBP'), '94000', '0', q('Bank transfer'), 'true', TS('2026-03-13', '09:00'), q('Larkspur Studio'), q('Business'), q('Team Workshop, 90 minutes')],
]));
out.push(`insert into public.credit_notes (id, invoice_id, coach_id, kind, amount_minor, currency, stripe_id, reason, created_at)
  values ('${next('cn')}', '${refundInvoice}', '${ALEX}', 'refund', 43700, 'GBP', 're_polish_1', 'One coaching session not used before the sprint ended', ${TS('2026-11-12', '15:00')});
`);
// Finance settings, targets, outgoings, deadlines.
out.push(ins('finance_settings', ['id', 'coach_id', 'year_start_month', 'minimum_minor', 'bank_balance_minor', 'bank_checked_at', 'cash_months'], [[q(next('fin')), q(ALEX), '4', '800000', '2384000', TS(addDays(BASE, -5), '08:30'), '6']]));
out.push(ins('bank_balance_checks', ['id', 'coach_id', 'balance_minor', 'checked_on'], [[-5, 2384000], [-35, 2196000], [-66, 2041000]].map(([d, b]) => [q(next('bank')), q(ALEX), String(b), D(addDays(BASE, d))])));
const tgt = [1400000, 1400000, 1200000, 1500000, 1500000, 1600000, 1600000, 1500000, 1500000, 1700000, 1700000, 1800000, 1400000, 1800000, 1800000, 1800000];
out.push(ins('finance_targets', ['id', 'coach_id', 'month', 'target_minor'], tgt.map((t, i) => [q(next('target')), q(ALEX), `date_trunc('month', ${D(addMonths('2025-12-01', i))})::date`, String(t)])));
out.push(ins('finance_outgoings', ['id', 'coach_id', 'name', 'group_name', 'amount_minor', 'every', 'starts_on'], [
  ['Your salary', 'Your pay', 105000, 'month', '2025-12-01'], ['Accountant', 'Insurance and professional fees', 9000, 'month', '2025-12-01'], ['Insurance', 'Insurance and professional fees', 42000, 'year', '2026-07-01'],
  ['Supervision', 'Training and supervision', 8000, 'month', '2025-12-01'], ['Marketing', 'Marketing', 6000, 'month', '2025-12-01'], ['Zoom', 'Software', 1300, 'month', '2025-12-01'],
  ['Google Workspace', 'Software', 1400, 'month', '2025-12-01'], ['Hosting for the portal', 'Software', 2000, 'month', '2025-12-01'], ['Leadership conference ticket', 'Training and supervision', 45000, 'once', '2027-01-14'],
].map(([n, g, a, e, s]) => [q(next('out')), q(ALEX), q(n), q(g), String(a), q(e), D(s)])));
out.push(ins('company_deadlines', ['id', 'coach_id', 'name', 'kind', 'due_on', 'every', 'amount_minor'], [
  [q(next('dead')), q(ALEX), q('Confirmation statement'), q('confirmation_statement'), D('2026-12-14'), q('year'), '3400'],
  [q(next('dead')), q(ALEX), q('Corporation tax'), q('corporation_tax'), D('2027-01-01'), q('year'), '1840000'],
  [q(next('dead')), q(ALEX), q('Company accounts'), q('accounts'), D('2026-12-31'), q('year'), 'null'],
]));

// ------------------------------------------------------------------ leads
const STAGES = [['New', 10, 0], ['Call booked', 25, 1], ['Proposal sent', 50, 2], ['Deciding', 70, 3], ['Won', 100, 1000000]];
const stageId = {};
out.push(ins('coach_lead_stages', ['id', 'coach_id', 'name', 'likelihood', 'position', 'is_won'], STAGES.map(([name, like, pos]) => { stageId[name] = next('stage'); return [q(stageId[name]), q(ALEX), q(name), String(like), String(pos), String(name === 'Won')]; })));
const LEADS = [
  ['Amelia Hart', 'New', 'referral', 'Wexley Ashby LLP', 'Partner', 1048000, 'Reply to her email', 0, -2, 'Referred by Daniel Okafor. Wants help stepping into the managing partner role.'],
  ['Callum Reid', 'New', 'chemistry_page', 'Reid Quant', 'Managing director', 584000, 'Book a first call', 2, -1, null],
  ['Zara Quinlan', 'New', 'network', 'Orchard Lane Ventures', 'Managing partner', 1048000, 'Send the overview', 5, -8, 'Met at the Leeds breakfast.'],
  ['Joel Mensah', 'Call booked', 'booking_page', 'Kitebridge', 'Chief product officer', 1346000, 'Discovery call', 2, -4, null],
  ['Lucy Fairbairn', 'Call booked', 'chemistry_page', 'Fairbairn Bio', 'Founder', 584000, 'Discovery call', 1, -6, null],
  ['Ethan Brooks', 'Proposal sent', 'referral', 'Stonemere Capital', 'Investment director', 1048000, 'Follow up on the proposal', 3, -9, 'Asked for a 6-month option.'],
  ['Nathan Cole', 'Proposal sent', 'network', 'Cambridge Fluidics', 'Chief technology officer', 1748000, 'Check he has read the quote', 4, -5, 'Quote sent; opened the next evening.'],
  ['Martha Ingram', 'Deciding', 'referral', 'Northvane Energy', 'Chief people officer', 2246000, 'Call her back about the cohort', 1, -6, 'A cohort of 4 directors from April.'],
  ['Victor Salazar', 'Deciding', 'manual', 'Brisane Capital', 'Founding partner', 584000, 'Send the start dates', 6, -11, null],
  ['Leila Haddad', 'Won', 'referral', 'Larch Legal', 'General counsel', 1048000, null, null, -3, 'Agreement sent.'],
  ['Freya Lund', 'Won', 'referral', 'Calder Wolfe Racing', 'Race engineer', 124000, null, null, -55, null],
  ['Peter Langley', 'New', 'chemistry_page', 'Langley Motorsport', 'Managing director', 584000, null, null, -40, 'Budget moved to next year.'],
];
const leadRows = []; const levRows = [];
LEADS.forEach(([name, stage, source, org, job, value, nextStep, nextIn, lastDays, notes], i) => {
  const lid = next('lead');
  const cold = name === 'Peter Langley';
  const won = stage === 'Won';
  const created = addDays(BASE, lastDays - 10 - i * 3);
  const wonProfile = name === 'Leila Haddad' ? byN[15].pid : name === 'Freya Lund' ? byN[10].pid : null;
  leadRows.push([q(lid), q(ALEX), q(name), q(`polish-lead-${String(i + 1).padStart(2, '0')}@example.com`), q(source), q('chemistry'), q('Europe/London'), q(cold ? 'cold' : won ? 'won' : 'open'), q(notes), q(stageId[stage]),
    q(org), q(job), q(`+447700900${String(300 + i).padStart(3, '0')}`), String(value / 100), q('GBP'), q(nextStep), nextIn == null ? 'null' : D(addDays(BASE, nextIn)), D(addDays(BASE, lastDays)),
    won ? TS(addDays(BASE, lastDays), '16:00') : 'null', q(wonProfile), cold ? TS(addDays(BASE, -20), '10:00') : 'null', q(cold ? 'Budget moved to next year.' : null), cold ? D(addDays(BASE, 60)) : 'null',
    q(source === 'referral' ? (name === 'Amelia Hart' ? 'Daniel Okafor' : 'Jo Patel') : null), TS(created, '09:00')]);
  levRows.push([q(next('lev')), q(ALEX), q(lid), q('first_contact'), TS(created, '09:00'), D(created), q('First contact'), q(source === 'referral' ? 'Introduced by email.' : 'Came in through the website.')]);
  if (['Call booked', 'Proposal sent', 'Deciding', 'Won'].includes(stage) || cold) levRows.push([q(next('lev')), q(ALEX), q(lid), q('call'), TS(addDays(created, 5), '15:00'), D(addDays(created, 5)), q('Discovery call'), q('Good fit. Agreed to send a proposal.')]);
  if (['Proposal sent', 'Deciding', 'Won'].includes(stage)) levRows.push([q(next('lev')), q(ALEX), q(lid), q('proposal'), TS(addDays(created, 7), '10:00'), D(addDays(created, 7)), q('Proposal sent'), null]);
  if (won) levRows.push([q(next('lev')), q(ALEX), q(lid), q('won'), TS(addDays(BASE, lastDays), '16:00'), D(addDays(BASE, lastDays)), q('Won'), null]);
  if (cold) levRows.push([q(next('lev')), q(ALEX), q(lid), q('cold'), TS(addDays(BASE, -20), '10:00'), D(addDays(BASE, -20)), q('Gone cold'), q('Budget moved to next year.')]);
});
out.push('-- Twelve leads across the stages.');
out.push(ins('coach_leads', ['id', 'coach_id', 'name', 'email', 'source', 'call_type_key', 'time_zone', 'status', 'notes', 'stage_id', 'organisation', 'job_title', 'phone', 'value', 'currency', 'next_step', 'next_step_on', 'last_contact_on',
  'won_at', 'won_profile_id', 'cold_at', 'cold_reason', 'cold_check_on', 'referred_by', 'created_at'], leadRows));
out.push(ins('coach_lead_events', ['id', 'coach_id', 'lead_id', 'kind', 'happened_at', 'happened_on', 'title', 'detail'], levRows));

// ------------------------------------------------------------------ the Network
const FIRST = ['Harriet', 'Isaac', 'Owen', 'Maya', 'Rupert', 'Nadia', 'Felicity', 'Arjun', 'Bethan', 'Conor', 'Delphine', 'Edwin', 'Fiona', 'Gareth', 'Hollie', 'Imran', 'Jasmine', 'Kofi', 'Lorna', 'Magnus',
  'Niamh', 'Oscar', 'Pippa', 'Quentin', 'Rosa', 'Stefan', 'Tilly', 'Usman', 'Verity', 'Wilf', 'Xenia', 'Yusuf', 'Zoe', 'Alistair', 'Bea', 'Cormac', 'Daisy', 'Elliot', 'Flora', 'Gus'];
const LAST = ['Moss', 'Bramwell', 'Pryce-Jones', 'Okonjo', 'Hales', 'Karim', 'Ashworth', 'Mehta', 'Rhys', 'Doherty', 'Marchand', 'Fairclough', 'Lennox', 'Price', 'Bairstow', 'Qureshi', 'Wilde', 'Asante', 'McBride', 'Strand',
  'Gallagher', 'Thornton', 'Ellwood', 'Barnaby', 'Delgado', 'Novak', 'Ferris', 'Malik', 'Hamblin', 'Turnbull', 'Petrova', 'Haddon', 'Clarke', 'Munro', 'Sorensen', 'Byrne', 'Kettering', 'Vance', 'Whitcombe', 'Lowry'];
const NORGS = ['Wexley Ashby LLP', 'Kitebridge', 'Northvane Energy', 'Larch Legal', 'Orchard Lane Ventures', 'Stonemere Capital', 'The Leeds Breakfast Club', 'Harbourside Health', 'Copperleaf Media', 'Redwater Partners'];
const NROLES = ['Chief executive', 'Investor', 'Partner', 'Head of people', 'Founder', 'Coach', 'Editor', 'Chair'];
const netRows = []; const giveRows = [];
for (let i = 0; i < 40; i += 1) {
  const nid = next('net');
  const rated = i % 7 !== 6;
  netRows.push([q(nid), q(ALEX), q(`${FIRST[i]} ${LAST[i]}`), q(NORGS[i % NORGS.length]), q(NROLES[i % NROLES.length]), q(`polish-net-${String(i + 1).padStart(2, '0')}@example.com`), q(`+447700900${String(500 + i).padStart(3, '0')}`),
    rated ? String(4 + (i * 3) % 7) : 'null', rated ? String(5 + (i * 5) % 6) : 'null', rated ? String(3 + (i * 7) % 8) : 'null', rated ? String(4 + (i * 2) % 7) : 'null',
    String([1, 2, 3, 6][i % 4]), D(addDays(BASE, -(i % 6 === 0 ? [1, 2, 3, 6][i % 4] * 30 + 4 + (i % 13) : Math.round([1, 2, 3, 6][i % 4] * 30 * (0.15 + ((i * 7) % 10) / 14))))), D(addDays(BASE, -(400 - i * 6))), String(i % 4), String(i % 3), i === 38 || i === 39 ? TS(addDays(BASE, -30), '09:00') : 'null',
    q(i % 5 === 0 ? 'Met at the Leeds breakfast. Ask about the board role.' : i % 6 === 1 ? 'Introduced Amelia Hart.' : null), TS(addDays(BASE, -(400 - i * 6)), '09:00')]);
  if (i % 3 === 0) giveRows.push([q(next('give')), q(nid), q(ALEX), q('gave'), q(['idea', 'resource', 'introduction', 'favour'][i % 4]), q(['Sent the article on first-time chief executives.', 'Shared the Health Check.', 'Introduced them to Ellis Grant.', 'Read their draft talk.'][i % 4]), D(addDays(BASE, -((i * 13) % 150 + 2)))]);
}
out.push('-- Forty Network people, rated, with a few things given.');
out.push(ins('network_people', ['id', 'coach_id', 'name', 'organisation', 'role', 'email', 'phone', 'influence', 'trust', 'value_delivery', 'what_you_get', 'rhythm_months', 'last_spoke_on', 'added_on', 'given_count', 'asked_count', 'archived_at', 'notes', 'created_at'], netRows));
out.push(ins('network_gives', ['id', 'person_id', 'coach_id', 'direction', 'kind', 'note', 'happened_on'], giveRows));

// ------------------------------------------------------------------ to-dos: Today, Upcoming, Someday, done
const L_ADMIN = next('list'); const L_MKT = next('list'); const L_WS = next('list');
out.push(ins('coach_todo_lists', ['id', 'coach_id', 'name', 'organisation_id', 'position'], [[q(L_ADMIN), q(ALEX), q('Business admin'), 'null', '1'], [q(L_MKT), q(ALEX), q('Marketing'), 'null', '2'], [q(L_WS), q(ALEX), q('Harbour Rowing workshop'), q(ORGS.bright.id), '3']]));
const leadIdOf = (name) => leadRows.find((r) => r[2] === q(name))[0];
// [title, planned (days from today, or 'someday', or null), due, minutes, list, client n, lead, important, done (days), notes]
const TODOS = [
  ['Write up Priya’s session', 0, null, 15, null, 3, null, false, null, null],
  ['Send Tessaline the October timesheet', 0, 2, 20, L_ADMIN, null, null, true, null, 'Dev needs it on the supplier portal with the PO number.'],
  ['Reply to Amelia Hart', 0, null, 10, null, null, 'Amelia Hart', false, null, null],
  ['Print the exercises for Elena', 0, null, 10, null, 6, null, false, null, null],
  ['Book trains to Manchester', 0, 3, 10, L_ADMIN, null, null, false, null, null],
  ['Chase Chloe’s overdue invoice', -1, null, 10, L_ADMIN, 13, null, true, null, null],
  ['Call Ben about his renewal', 0, null, 20, null, 12, null, false, 0, null],
  ['Call Martha Ingram back', 1, null, 20, null, null, 'Martha Ingram', true, null, 'She wants the cohort dates first.'],
  ['Send Leila a note about her agreement', 2, null, 10, null, 15, null, false, null, null],
  ['Draft the December newsletter', 3, 8, 60, L_MKT, null, null, false, null, 'Three habits for a calmer December.'],
  ['Order books for the Harbour Rowing team', 5, null, 15, L_WS, null, null, false, null, null],
  ['Prepare the workshop slides', 6, 13, 120, L_WS, null, null, false, null, null],
  ['Ask Oliver for a few words for the website', 7, null, 10, L_MKT, 9, null, false, null, null],
  ['Send the quarter’s receipts to the accountant', 9, 14, 30, L_ADMIN, null, null, false, null, null],
  ['Plan the 2027 targets', 14, null, 60, L_ADMIN, null, null, false, null, null],
  ['Update the coaching page on the website', 12, null, 45, L_MKT, null, null, false, null, null],
  ['Check in with George before Christmas', 19, null, 15, null, 22, null, false, null, null],
  ['Write a short guide to the Health Check', 'someday', null, null, L_MKT, null, null, false, null, null],
  ['Record a podcast episode on first-time chief executives', 'someday', null, null, L_MKT, null, null, false, null, null],
  ['Plan a day for past clients', 'someday', null, null, null, null, null, false, null, null],
  ['Look at a second venue in Leeds', 'someday', null, null, L_WS, null, null, false, null, null],
  ['Refresh the LinkedIn profile', 'someday', null, 30, L_MKT, null, null, false, null, null],
  ['Send Grace the reading on delegation', -2, null, 5, null, 5, null, false, -2, null],
  ['Invoice the Tessaline October hours', -25, null, 20, L_ADMIN, null, null, false, -25, null],
  ['Book the room for the Harbour Rowing workshop', -6, null, 10, L_WS, null, null, false, -5, null],
  ['Follow up with Ethan on the proposal', -3, null, 10, null, null, 'Ethan Brooks', false, -3, null],
  ['Renew the insurance', -12, null, 30, L_ADMIN, null, null, false, -12, null],
  ['Send Rory his refund note', -13, null, 10, null, 14, null, false, -13, null],
];
out.push('-- To-dos across Today, Upcoming and Someday, and a few done.');
out.push(ins('coach_todos', ['id', 'coach_id', 'title', 'notes', 'important', 'planned_on', 'first_planned_on', 'due_on', 'minutes', 'list_id', 'profile_id', 'lead_id', 'someday', 'position', 'done_at', 'created_at'],
  TODOS.map(([title, planned, due, minutes, list, client, lead, important, done, notes], i) => {
    const day = planned === 'someday' || planned == null ? null : addDays(BASE, planned);
    return [q(next('todo')), q(ALEX), q(title), q(notes), String(important), D(day), D(day), due == null ? 'null' : D(addDays(BASE, due)), minutes == null ? 'null' : String(Math.max(15, Math.round(minutes / 15) * 15)), q(list), q(client ? byN[client].pid : null),
      lead ? leadIdOf(lead) : 'null', String(planned === 'someday'), String(i + 1), done == null ? 'null' : TS(addDays(BASE, done), '08:40'), TS(addDays(BASE, (typeof planned === 'number' ? Math.min(planned, 0) : 0) - 6), '18:00')];
  })));

// ------------------------------------------------------------------ Polish 1, Stage C: one of each agreements screen
// So every Stage C screen can be reached from data (INTEGRATE-C step 4; removed with the rest, every id 5eed0600-):
// an agreement inside its 14 days, a retainer's yearly price review due, a change asked for on the sent agreement,
// Rhys's block of hours past 80% (its top-up invoice drafted), and a sponsor's signing link waiting.
{
  const sent = C.find((c) => c.kind === 'sent');
  const [crId, spAg, spVer] = [next('stagec'), next('stagec'), next('stagec')];
  out.push('-- Polish 1, Stage C: one of each agreements screen (inside 14 days, a price review, a change asked for, hours past 80%, a sponsor link).');
  out.push(ins('time_entries', ['id', 'engagement_id', 'coach_id', 'started_at', 'ended_at', 'note'],
    [[q(next('time')), q(byN[17].eid), q(ALEX), TS(addDays(BASE, -2), '10:00'), TS(addDays(BASE, -2), '13:40'), q('Workshop with the people team')]]));
  out.push(`set session_replication_role = replica;
update public.agreement_versions set client_signed_at = now() - interval '3 days', start_now = true, start_now_at = now() - interval '3 days' where agreement_id = '${byN[3].agId}' and status = 'signed';
update public.agreement_versions set terms = terms || jsonb_build_object('priceSince', to_char((now() at time zone 'Europe/London')::date - 365 + 21, 'YYYY-MM-DD')) where id = '${byN[11].verId}';
set session_replication_role = origin;
insert into public.agreement_change_requests (id, version_id, coach_id, clause_key, words, created_at)
select '${crId}', v.id, '${ALEX}', coalesce((select c->>'key' from jsonb_array_elements(v.clauses) with ordinality x(c, i) order by i offset 2 limit 1), 'investment'),
       'Could the notice to rearrange be 48 hours rather than 24?', now() - interval '1 day'
  from public.agreement_versions v where v.id = '${sent.verId}';
insert into public.agreements (id, coach_id, kind, profile_id, organisation_id, status, current_version, agreement_kind, package_id, created_at)
select '${spAg}', a.coach_id, 'sponsor', null, a.organisation_id, 'sent', 1, a.agreement_kind, a.package_id, now() - interval '2 days'
  from public.agreements a where a.id = '${ORGS.bright.agId}';
insert into public.agreement_versions (id, agreement_id, coach_id, version, status, terms, clauses, currency, fx_rate, fx_at, total_minor, funded_by, coach_signed_at, coach_signature_id, sent_at, send_as, personal_note, expires_on, created_at)
select '${spVer}', '${spAg}', v.coach_id, 1, 'sent', v.terms || '{"needsPO": true}'::jsonb, v.clauses, v.currency, v.fx_rate, v.fx_at, v.total_minor, v.funded_by, now() - interval '2 days', v.coach_signature_id, now() - interval '2 days', 'agreement', null, null, now() - interval '2 days'
  from public.agreement_versions v where v.id = '${ORGS.bright.verId}';
-- The sponsor's link (a local token: 64 c's, invented).
insert into public.sponsor_sign_links (id, coach_id, agreement_id, version_id, token_hash, sponsor_name, sponsor_email, sponsor_role, expires_at)
values ('${next('stagec')}', '${ALEX}', '${spAg}', '${spVer}', encode(sha256(convert_to(repeat('c', 64), 'UTF8')), 'hex'), 'Margaret Hale', 'polish-contact-3@example.com', 'Chief nursing officer', now() + interval '60 days');`);
}

// ------------------------------------------------------------------ the end
out.push(`select set_config('clarity.linking', '', false);
drop schema polish_seed cascade;
do $$ begin raise notice 'SEED part 6 (Alex Morgan''s practice): % clients, % organisations, % agreements, % sessions, % calendar items, % invoices, % payments, % leads, % Network people, % to-dos',
  (select count(*) from public.client_profiles where id::text like '5eed0600-%'), (select count(*) from public.organisations where id::text like '5eed0600-%'),
  (select count(*) from public.agreements where id::text like '5eed0600-%'), (select count(*) from public.coach_sessions where id::text like '5eed0600-%'),
  (select count(*) from public.coach_cal_items where id::text like '5eed0600-%'), (select count(*) from public.invoices where id::text like '5eed0600-%'),
  (select count(*) from public.payments where id::text like '5eed0600-%'), (select count(*) from public.coach_leads where id::text like '5eed0600-%'),
  (select count(*) from public.network_people where id::text like '5eed0600-%'), (select count(*) from public.coach_todos where id::text like '5eed0600-%'); end $$;
`);
writeFileSync(join(HERE, '06-polish-practice.sql'), out.join('\n'));
console.log(`wrote 06-polish-practice.sql (${out.join('\n').length} characters)`);
