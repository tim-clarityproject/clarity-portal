// The coach portal's rules (Phase 6a run 1, step 10): the parsers, merge,
// saved views, filtering by custom fields, sessions left from an engagement
// record, time credit to the minute, the cover dates, and the next-call bar.
import { createHash } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH, accessCodeHash, codeGroups, makeAccessCode } from '../../src/lib/coach/accessCode.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePeople, parseTeam, teamPreview, sessionsLeft, minutesBetween, minutesClocked, timeCredit, minutesWords, clockWords,
  engagementLine, coverState, boardStage, fieldValue, fieldWords, fieldFromTyped, filterClients, filterCount, sortClients,
  sortOptions, viewFromList, listFromView, favouriteViews, canFavourite, mergePlan, mergeValues, mergedProfile,
  likelyDuplicates, nextCallBar, callForBar, searchResults, withRecent, quickContacts, birthdaysOn, birthdayNote,
  gettingStarted, exportRows, toCsv, workshopCounts, registrationStatus, workshopEmailRows, viewAskState, stageMove, stageBeside, boardStage as boardStageOf, parseHours, START_ZONES, dayWords, rangeWords,
  addDays, timeline, possessive, cut, suggestedDays,
} from '../../src/lib/coach/model.js';
import { parseQuickAdd } from '../../src/lib/coach/day.js';
import { xlsxBytes } from '../../src/lib/coach/xlsx.js';
import { isZone } from '../../src/lib/time/index.js';

// ---------------------------------------------------------------- the parsers
test('Who’s invited: commas, semicolons, tabs and new lines, Name <email>, duplicates removed', () => {
  const r = parsePeople('Dan Reid <dan@brightwater.co>, amy@example.com; Jo Mensah\tjo@example.com\nDAN@brightwater.co\n"Lee Hart" <lee@example.com>');
  assert.deepEqual(r.people, [
    { name: 'Dan Reid', email: 'dan@brightwater.co' }, { name: '', email: 'amy@example.com' },
    { name: 'Jo Mensah', email: 'jo@example.com' }, { name: 'Lee Hart', email: 'lee@example.com' },
  ]);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.unread, []);
});

test('Who’s invited: a name and its email split by a comma stay together; what can’t be read is said', () => {
  const r = parsePeople('Grace Liu, grace@example.com\nnot an email@\nJust A Name');
  assert.deepEqual(r.people, [{ name: 'Grace Liu', email: 'grace@example.com' }]);
  assert.deepEqual(r.unread, ['not an email@', 'Just A Name']);
});

test('Who’s invited: 500 names read, each once', () => {
  const text = Array.from({ length: 500 }, (_, i) => `Person ${i} <p${i}@example.com>`).join('\n');
  const r = parsePeople(`${text}\n${text}`);
  assert.equal(r.people.length, 500);
  assert.equal(r.duplicates, 500);
});

test('Who’s invited: unseen characters from a web page never make a second person', () => {
  const r = parsePeople('Dan​ Reid <dan@example.com>﻿');
  assert.deepEqual(r.people, [{ name: 'Dan Reid', email: 'dan@example.com' }]);
});

test('Add team: a spreadsheet with a heading row, tabs or commas, quoted cells', () => {
  const tabbed = parseTeam('First name\tLast name\tEmail\tRole\nDana\tWhitfield\tDana@Kestrel.co\tChief of staff\nFemi\tAdeyemi\tfemi@kestrel.co\t');
  assert.deepEqual(tabbed.map((r) => [r.name, r.email, r.job_title]), [['Dana Whitfield', 'dana@kestrel.co', 'Chief of staff'], ['Femi Adeyemi', 'femi@kestrel.co', '']]);
  const csv = parseTeam('Name,Email,Job title,Mobile\n"Liu, Grace",grace@kestrel.co,"Head of ""People""",+447700900111');
  assert.deepEqual(csv, [{ name: 'Liu, Grace', email: 'grace@kestrel.co', job_title: 'Head of "People"', mobile: '+447700900111', city: '' }]);
});

test('Add team: a pasted list with no heading row', () => {
  const rows = parseTeam('Tom Barker <t.barker@kestrel.co>\nRavi Patel, r.patel@kestrel.co, Finance lead\nNo Email Person');
  assert.deepEqual(rows.map((r) => [r.name, r.email, r.job_title]), [['Tom Barker', 't.barker@kestrel.co', ''], ['Ravi Patel', 'r.patel@kestrel.co', 'Finance lead'], ['No Email Person', '', '']]);
});

test('Add team: the preview finds duplicates, existing clients and seats left', () => {
  const rows = parseTeam('Name,Email\nA One,a@x.co\nA Again,A@x.co\nB Two,b@x.co\nC Three,c@x.co\n,d@x.co\nE Five,not-an-email');
  const p = teamPreview(rows, [{ email: 'b@x.co' }, { email: 'c@x.co', merged_into: 'gone' }], { seatsLeft: 1 });
  assert.deepEqual(p.rows.map((r) => r.state), ['new', 'duplicate', 'already', 'new', 'no_name', 'bad_email']);
  assert.deepEqual([p.add, p.already, p.duplicates, p.unreadable, p.overSeats], [2, 1, 1, 2, 1]);
  assert.equal(teamPreview(rows, []).overSeats, 0, 'no organisation, no seat limit');
});

// ---------------------------------------------------------------- engagements
const eng = { id: 'e1', sessions_total: 12, sessions_held: 5, time_credit_minutes: null };

test('sessions left from an engagement record, packs included', () => {
  assert.deepEqual(sessionsLeft(eng), { total: 12, held: 5, left: 7 });
  assert.deepEqual(sessionsLeft(eng, [{ engagement_id: 'e1', sessions: 4 }, { engagement_id: 'other', sessions: 9 }]), { total: 16, held: 5, left: 11 });
  assert.deepEqual(sessionsLeft({ id: 'e2', sessions_total: 6, sessions_held: 9 }), { total: 6, held: 9, left: 0 }, 'never below zero');
  assert.equal(sessionsLeft({ id: 'e3', sessions_total: null, sessions_held: 0 }), null, 'ongoing: not counted in sessions');
  assert.equal(sessionsLeft(null), null);
  assert.equal(engagementLine(eng, []), '7 of 12');
  assert.equal(engagementLine(eng, [], [], new Date(), { toGo: true }), '7 of 12 to go');
});

test('time credit, to the minute', () => {
  assert.equal(minutesBetween('2026-11-19T10:00:00Z', '2026-11-19T10:59:59Z'), 59, 'a second short of the hour is 59 minutes');
  assert.equal(minutesBetween('2026-11-19T10:00:00Z', '2026-11-19T11:00:00Z'), 60);
  assert.equal(minutesBetween('2026-11-19T10:00:00Z', '2026-11-19T09:00:00Z'), 0, 'never negative');
  const credit = { id: 'c1', sessions_total: null, time_credit_minutes: 600 };
  const entries = [
    { engagement_id: 'c1', project_id: 'p1', started_at: '2026-11-18T09:00:00Z', ended_at: '2026-11-18T15:40:00Z' },
    { engagement_id: 'c1', project_id: 'p2', started_at: '2026-11-19T09:00:00Z', ended_at: null },
    { engagement_id: 'zz', project_id: 'p9', started_at: '2026-11-19T09:00:00Z', ended_at: '2026-11-19T19:00:00Z' },
  ];
  const now = new Date('2026-11-19T10:30:30Z');
  assert.deepEqual(timeCredit(credit, [{ engagement_id: 'c1', minutes: 120 }], entries, now), { total: 720, used: 490, left: 230 });
  assert.equal(minutesClocked(entries, { engagementId: 'c1', projectId: 'p1' }, now), 400);
  assert.equal(minutesClocked(entries, { engagementId: 'c1', projectId: 'p2' }, now), 90, 'a running clock counts up to now');
  assert.equal(engagementLine(credit, [], entries, now), '1 hour 50 minutes credit');
  assert.equal(timeCredit(eng), null);
});

test('time in words', () => {
  assert.equal(minutesWords(130), '2 hours 10 minutes');
  assert.equal(minutesWords(60), '1 hour');
  assert.equal(minutesWords(1), '1 minute');
  assert.equal(minutesWords(0), '0 minutes');
  assert.equal(minutesWords(130), '2 hours 10 minutes'); // full words everywhere (tidy follow-up 4)
  assert.equal(clockWords('2026-11-19T10:00:00Z', new Date('2026-11-19T11:07:42Z')), '1:07:42');
});

// ---------------------------------------------------------------- cover
test('the cover dates: only between them, and only once the client has agreed', () => {
  const cover = { starts_on: '2026-12-21', ends_on: '2027-01-03', client_agreed_at: '2026-12-01T10:00:00Z' };
  assert.equal(coverState(cover, '2026-12-20'), 'before');
  assert.equal(coverState(cover, '2026-12-21'), 'on');
  assert.equal(coverState(cover, '2027-01-03'), 'on');
  assert.equal(coverState(cover, '2027-01-04'), 'over');
  assert.equal(coverState({ ...cover, client_agreed_at: null }, '2026-12-25'), 'waiting');
  assert.equal(coverState({ ...cover, client_agreed_at: null }, '2027-01-04'), 'over', 'over wins once the dates have passed');
  assert.equal(coverState(null, '2026-12-25'), 'over');
});

// ---------------------------------------------------------------- stage, filter, sort
test('the board’s column', () => {
  const p = { status: 'active', stage: null };
  assert.equal(boardStage(p, null, [], '2026-11-19'), 'starting');
  assert.equal(boardStage(p, { id: 'a', sessions_total: 12, sessions_held: 0 }, [], '2026-11-19'), 'starting');
  assert.equal(boardStage(p, { id: 'a', sessions_total: 12, sessions_held: 5 }, [], '2026-11-19'), 'active');
  assert.equal(boardStage(p, { id: 'a', sessions_total: 12, sessions_held: 10 }, [], '2026-11-19'), 'renewal_due');
  assert.equal(boardStage(p, { id: 'a', sessions_total: 6, sessions_held: 5 }, [], '2026-11-19'), 'closing');
  assert.equal(boardStage(p, { id: 'a', sessions_total: 12, sessions_held: 5, ends_on: '2026-12-10' }, [], '2026-11-19'), 'renewal_due', 'ends within 30 days');
  assert.equal(boardStage({ status: 'paused', stage: 'active' }, null, [], '2026-11-19'), 'paused');
  assert.equal(boardStage({ status: 'active', stage: 'closing' }, { id: 'a', sessions_total: 12, sessions_held: 5 }, [], '2026-11-19'), 'closing', 'the coach’s own choice wins');
});

const fields = [
  { id: 'f1', name: 'Sector', kind: 'choice', options: ['Finance', 'Sport', 'Media'] },
  { id: 'f2', name: 'Value', kind: 'number' },
  { id: 'f3', name: 'Renewal date', kind: 'date' },
];
const values = [
  { field_id: 'f1', item_id: 'sam', value_text: 'Finance' }, { field_id: 'f2', item_id: 'sam', value_number: 24000 }, { field_id: 'f3', item_id: 'sam', value_date: '2027-03-08' },
  { field_id: 'f1', item_id: 'jordan', value_text: 'Sport' }, { field_id: 'f2', item_id: 'jordan', value_number: '30000' },
  { field_id: 'f1', item_id: 'mia', value_text: 'Media' }, { field_id: 'f2', item_id: 'mia', value_number: 16000 }, { field_id: 'f3', item_id: 'mia', value_date: '2026-12-07' },
];
const client = (id, name, extra = {}) => ({
  profile: { id, name, email: `${id}@example.com`, organisation_id: extra.org || null, coach_id: extra.coach || 'tim', last_contact_on: extra.last || null },
  engagement: extra.engagement || null, tags: extra.tags || [], stage: extra.stage || 'active', nextAt: extra.nextAt || null,
});
const clients = [
  client('sam', 'Sam Okafor', { org: 'kestrel', tags: ['exec'], nextAt: '2026-11-19T12:30:00Z', last: '2026-11-13', engagement: { id: 'e-sam', sessions_total: 12, sessions_held: 5 } }),
  client('jordan', 'Jordan Reyes', { tags: ['sport'], nextAt: '2026-11-19T15:45:00Z', last: '2026-11-14', engagement: { id: 'e-jor', sessions_total: 20, sessions_held: 11 } }),
  client('mia', 'Mia Torres', { tags: ['exec'], stage: 'starting', nextAt: '2026-11-23T10:00:00Z', last: '2026-11-12', engagement: { id: 'e-mia', sessions_total: 12, sessions_held: 1 } }),
  client('ella', 'Ella Fraser', { coach: 'maya', stage: 'paused', last: '2026-10-26' }),
];
const ctx = { fields, values, organisations: [{ id: 'kestrel', name: 'Kestrel Group' }], tags: [{ id: 'exec', name: 'Executive' }, { id: 'sport', name: 'Sport' }] };
const names = (rows) => rows.map((c) => c.profile.id);

test('a custom field’s value, in words, and from what was typed', () => {
  assert.equal(fieldValue(fields[1], values, 'jordan'), 30000);
  assert.equal(fieldValue(fields[2], values, 'jordan'), null);
  assert.equal(fieldWords(fields[1], 24000), '24,000');
  assert.equal(fieldWords(fields[2], '2027-03-08', '2026-11-19'), 'Mon 8 Mar 2027');
  assert.deepEqual(fieldFromTyped(fields[1], '£24,000'), { value_number: 24000 });
  assert.equal(fieldFromTyped(fields[1], 'lots'), undefined);
  assert.equal(fieldFromTyped(fields[1], '  '), null);
  assert.deepEqual(fieldFromTyped(fields[0], 'Sport'), { value_text: 'Sport' });
  assert.equal(fieldFromTyped(fields[0], 'Farming'), undefined, 'a choice must be on the list');
  assert.equal(fieldFromTyped(fields[2], '2026-02-30'), undefined, 'a day that doesn’t exist');
});

test('filtering by tag, status, organisation, coach, search and any custom field', () => {
  assert.deepEqual(names(filterClients(clients, { tag: ['exec'] }, ctx)), ['sam', 'mia']);
  assert.deepEqual(names(filterClients(clients, { status: ['paused', 'starting'] }, ctx)), ['mia', 'ella']);
  assert.deepEqual(names(filterClients(clients, { organisation: 'kestrel' }, ctx)), ['sam']);
  assert.deepEqual(names(filterClients(clients, { coach: 'maya' }, ctx)), ['ella']);
  assert.deepEqual(names(filterClients(clients, { q: 'kestrel sam' }, ctx)), ['sam'], 'the organisation’s name is searched too');
  assert.deepEqual(names(filterClients(clients, { fields: { f1: ['Finance', 'Media'] } }, ctx)), ['sam', 'mia']);
  assert.deepEqual(names(filterClients(clients, { fields: { f1: ['none'] } }, ctx)), ['ella'], 'Not set');
  assert.deepEqual(names(filterClients(clients, { fields: { f2: ['30000'] } }, ctx)), ['jordan']);
  assert.deepEqual(names(filterClients(clients, { tag: ['exec'], fields: { f1: ['Media'] } }, ctx)), ['mia'], 'filters add up');
  assert.deepEqual(names(filterClients(clients, {}, ctx)), ['sam', 'jordan', 'mia', 'ella']);
  assert.equal(filterCount({ tag: ['exec'], fields: { f1: ['Media'], f2: [] } }), 2);
});

test('sorting, with empty values always last', () => {
  assert.deepEqual(names(sortClients(clients, 'next', ctx)), ['sam', 'jordan', 'mia', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'left', ctx)), ['sam', 'jordan', 'mia', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'leftz', ctx)), ['mia', 'jordan', 'sam', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'last', ctx)), ['ella', 'mia', 'sam', 'jordan']);
  assert.deepEqual(names(sortClients(clients, 'name', ctx)), ['ella', 'jordan', 'mia', 'sam']);
  assert.deepEqual(names(sortClients(clients, 'namez', ctx)), ['sam', 'mia', 'jordan', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'f:f2', ctx)), ['mia', 'sam', 'jordan', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'f:f2:z', ctx)), ['jordan', 'sam', 'mia', 'ella']);
  assert.deepEqual(names(sortClients(clients, 'f:f3', ctx)), ['mia', 'sam', 'ella', 'jordan'], 'soonest date first, the empty ones by name');
  assert.deepEqual(names(sortClients(clients, 'f:f1', ctx)), ['sam', 'mia', 'jordan', 'ella']);
  assert.deepEqual(sortOptions(fields).slice(-4).map((s) => s.label), ['Sector, A to Z', 'Lowest value first', 'Highest value first', 'Soonest renewal date first']);
});

// ---------------------------------------------------------------- saved views
test('a saved view keeps filters, sort, columns and layout, never the search', () => {
  const view = viewFromList('  Media clients ', { filters: { q: 'mia', tag: ['exec'], fields: { f1: ['Media'] } }, sort: 'f:f2:z', columns: ['f1'], layout: 'table' });
  assert.deepEqual(view, { name: 'Media clients', filters: { tag: ['exec'], fields: { f1: ['Media'] } }, sort: 'f:f2:z', columns: ['f1'], layout: 'table' });
  assert.deepEqual(listFromView(view), { filters: { tag: ['exec'], status: [], organisation: null, coach: null, fields: { f1: ['Media'] } }, sort: 'f:f2:z', columns: ['f1'], layout: 'table' });
  assert.deepEqual(listFromView({ filters: 'broken', layout: 'grid' }), { filters: { tag: [], status: [], organisation: null, coach: null, fields: {} }, sort: 'next', columns: [], layout: 'list' });
});

test('up to 5 favourite views show in the menu', () => {
  const views = Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, name: `View ${i}`, favourite: i !== 3, position: 7 - i }));
  assert.deepEqual(favouriteViews(views).map((v) => v.id), ['v6', 'v5', 'v4', 'v2', 'v1']);
  assert.equal(canFavourite(views), false);
  assert.equal(canFavourite(views.slice(0, 4)), true);
});

// ---------------------------------------------------------------- merge
test('merge into one: only what differs is chosen, and never a client with themselves', () => {
  const a = { id: 'a', name: 'Chris Doyle', email: 'chris@doyle.co', mobile: '+447700900542', organisation_id: 'o1', city: null };
  const b = { id: 'b', name: 'Christopher Doyle', email: 'Chris@doyle.co', mobile: null, organisation_id: 'o2', city: 'Leeds' };
  const plan = mergePlan(a, b, (k, v) => (k === 'organisation_id' ? { o1: 'Doyle Capital', o2: 'Doyle Capital Partners' }[v] : String(v)));
  assert.deepEqual(plan.map((r) => [r.key, r.choose]), [['name', true], ['email', false], ['mobile', false], ['organisation_id', true], ['city', false]]);
  assert.equal(plan[3].b, 'Doyle Capital Partners');
  assert.equal(plan[4].one, 'Leeds', 'what only one has is kept without asking');
  assert.equal(mergePlan(a, a), null);
  assert.deepEqual(mergeValues({ name: 'b', organisation_id: 'a' }), { name: true });
  const merged = mergedProfile(a, b, { name: true });
  assert.deepEqual([merged.name, merged.organisation_id, merged.city, merged.mobile], ['Christopher Doyle', 'o1', 'Leeds', '+447700900542']);
});

test('likely duplicates: the same email or the same name', () => {
  const pairs = likelyDuplicates([{ id: 1, name: 'Chris Doyle', email: 'c@d.co' }, { id: 2, name: 'Christopher Doyle', email: 'C@D.co' }, { id: 3, name: 'chris  doyle', email: null }, { id: 4, name: 'Chris Doyle', email: 'x@y.co', merged_into: 1 }]);
  assert.deepEqual(pairs.map(([x, y]) => [x.id, y.id]), [[1, 2], [1, 3]]);
});

// ---------------------------------------------------------------- the next-call bar
test('the next-call bar: from 10 minutes before until 10 minutes in, coral from 5 minutes before', () => {
  const call = { name: 'Sam Okafor', startsAt: '2026-11-19T12:30:00Z', zoom: 'https://zoom.example/j/1' };
  const at = (t) => nextCallBar(call, new Date(`2026-11-19T${t}Z`));
  assert.equal(at('12:19:59'), null);
  assert.deepEqual([at('12:20:00').words, at('12:20:00').coral], ['in 10 minutes', false]);
  assert.deepEqual([at('12:22:00').words, at('12:22:00').coral], ['in 8 minutes', false]);
  assert.deepEqual([at('12:25:00').words, at('12:25:00').coral], ['in 5 minutes', true]);
  assert.deepEqual([at('12:29:30').words, at('12:29:30').coral], ['in 1 minute', true]);
  assert.equal(at('12:30:00').words, 'is starting now');
  assert.equal(at('12:33:10').words, 'started 3 minutes ago');
  assert.equal(at('12:40:00').words, 'started 10 minutes ago');
  assert.equal(at('12:40:01'), null);
  assert.equal(nextCallBar(null), null);
  const later = { name: 'Jordan Reyes', startsAt: '2026-11-19T12:35:00Z' };
  assert.equal(callForBar([later, call], new Date('2026-11-19T12:28:00Z')).name, 'Sam Okafor', 'the earlier call first');
  assert.equal(callForBar([later, call], new Date('2026-11-19T12:41:00Z')).name, 'Jordan Reyes');
});

// ---------------------------------------------------------------- search
test('one box finds people, pages and actions; recent items before anything is typed', () => {
  const all = {
    people: [{ key: 'c:sam', title: 'Sam Okafor', kind: 'Client', also: 'Kestrel Group' }, { key: 'c:sami', title: 'Samira Khan', kind: 'Client' }, { key: 'c:owen', title: 'Owen Price', kind: 'Maya’s client' }],
    pages: [{ key: 'p:clients', title: 'Clients' }, { key: 'p:settings', title: 'Settings' }],
    actions: [{ key: 'a:add', title: 'Add client' }, { key: 'a:team', title: 'Add team' }],
    recent: [{ key: 'c:sam', title: 'Sam Okafor', kind: 'Client' }],
  };
  assert.deepEqual(searchResults('', all).map((g) => [g.label, g.items.length]), [['Recent', 1], ['Actions', 2]]);
  assert.deepEqual(searchResults('sam', all)[0].items.map((i) => i.key), ['c:sam', 'c:sami']);
  assert.deepEqual(searchResults('kestrel', all)[0].items.map((i) => i.key), ['c:sam'], 'found by organisation');
  assert.deepEqual(searchResults('add cl', all).map((g) => g.label), ['Actions']);
  assert.deepEqual(searchResults('zzz', all), []);
  assert.deepEqual(withRecent(all.recent, { key: 'c:owen', title: 'Owen Price', kind: 'Client', to: '/x' }).map((r) => r.key), ['c:owen', 'c:sam']);
  assert.equal(withRecent(Array.from({ length: 9 }, (_, i) => ({ key: `k${i}` })), { key: 'k4', title: 'x' }).length, 8);
});

// ---------------------------------------------------------------- reaching a client
test('quick buttons: WhatsApp and iMessage only with a mobile, iMessage only for +1', () => {
  assert.deepEqual(quickContacts({ email: 'sam@example.com', mobile: '+44 7700 900123' }).map((c) => c.key), ['email', 'whatsapp']);
  assert.deepEqual(quickContacts({ email: 'jo@example.com', mobile: '+13125550123' }).map((c) => c.key), ['email', 'whatsapp', 'imessage']);
  assert.deepEqual(quickContacts({ email: 'leo@example.com' }).map((c) => c.key), ['email']);
  assert.deepEqual(quickContacts({}), []);
  assert.equal(quickContacts({ email: 'sam@example.com' }, { subject: 'Happy birthday', body: 'Hi Sam,\nsee you' })[0].href, 'mailto:sam@example.com?subject=Happy%20birthday&body=Hi%20Sam%2C%0Asee%20you');
  assert.equal(quickContacts({ mobile: '+13125550123' })[1].href, 'sms:+13125550123');
});

test('birthdays today, and the drafted note', () => {
  const profiles = [{ id: 'priya', name: 'Priya Nair', status: 'active' }, { id: 'old', name: 'Old Client', status: 'past' }];
  const abouts = [{ profile_id: 'priya', birthday_month: 11, birthday_day: 19 }, { profile_id: 'old', birthday_month: 11, birthday_day: 19 }];
  assert.deepEqual(birthdaysOn(abouts, profiles, '2026-11-19').map((p) => p.id), ['priya']);
  assert.deepEqual(birthdaysOn(abouts, profiles, '2026-11-20'), []);
  assert.equal(birthdayNote(profiles[0], 'Tim'), 'Happy birthday, Priya!\n\nI hope you get some proper time off today.\n\nTim');
  assert.equal(possessive('Marcus'), 'Marcus’'); // a final s takes only the apostrophe (Stage D UI tester, polish 6)
});

test('Getting started ticks itself where the portal can tell', () => {
  const fresh = gettingStarted({ getting_started: {} });
  assert.equal(fresh.complete, false);
  assert.deepEqual(fresh.rows.map((r) => r.done), [false, false, false, false, false]);
  const some = gettingStarted({ invited_at: '2026-11-18T09:00:00Z', getting_started: { welcome_pack: true } }, { engagement: { id: 'e' }, sessionsHeld: 1 });
  assert.deepEqual(some.rows.map((r) => [r.key, r.done, r.auto]), [['engagement', true, true], ['invited', true, true], ['first_review', false, false], ['first_session', true, true], ['welcome_pack', true, false]]);
  assert.equal(gettingStarted({ user_id: 'u', getting_started: { first_review: true, welcome_pack: true } }, { engagement: { id: 'e' }, sessionsHeld: 2 }).complete, true);
});

// ---------------------------------------------------------------- export
test('export: every field comes with it, and nothing runs as a formula', () => {
  const rows = exportRows([clients[0], { ...clients[3], profile: { ...clients[3].profile, name: '=HYPERLINK("x")' } }], { ...ctx, packs: [] }, '2026-11-19');
  assert.deepEqual(rows[0].slice(-3), ['Sector', 'Value', 'Renewal date']);
  assert.deepEqual([rows[1][0], rows[1][3], rows[1][8], rows[1][11], ...rows[1].slice(-3)], ['Sam Okafor', 'Kestrel Group', '7 of 12', 'Executive', 'Finance', 24000, 'Mon 8 Mar 2027']);
  const csv = toCsv(rows);
  assert.ok(csv.includes('\r\n"\'=HYPERLINK(""x"")",'), 'a formula is kept as text');
  assert.ok(csv.includes(',24000,'), 'a number stays a number');
  const bytes = xlsxBytes(rows, 'Clients');
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'a real zip, as Excel expects');
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('xl/worksheets/sheet1.xml') && text.includes('Sam Okafor') && text.includes('<v>24000</v>'));
  assert.ok(!text.includes('<f>'), 'no formulas in the file');
});

// ---------------------------------------------------------------- workshops
test('a workshop: places, the waiting list and attendance', () => {
  const at = [{ email: 'a@x.co', status: 'registered', attended: true }, { email: 'b@x.co', status: 'registered' }, { email: 'c@x.co', status: 'waiting' }, { email: 'd@x.co', status: 'cancelled' }];
  assert.deepEqual(workshopCounts(at, 3), { registered: 2, waiting: 1, came: 1, left: 1 });
  assert.equal(registrationStatus(at, 3, 'new@x.co'), 'registered');
  assert.equal(registrationStatus(at, 2, 'new@x.co'), 'waiting');
  assert.equal(registrationStatus(at, 3, 'A@x.co'), 'already_registered');
  assert.equal(registrationStatus(at, 3, 'd@x.co'), 'registered', 'someone who cancelled can register again');
});

test('a workshop’s emails: when each goes or went, and the follow-up the coach sends', () => {
  // Thu 19 Nov 2026, 09:30 to 12:30 in Leeds (UK time is UTC in November).
  const w = { id: 'w1', starts_at: '2026-11-19T09:30:00+00:00', ends_at: '2026-11-19T12:30:00+00:00', time_zone: 'Europe/London', remind_day_before: true, remind_hour_before: true, survey_on: true };
  const words = (rows) => rows.map((r) => `${r.label}: ${r.words}`);
  // Two days before: both reminders are still to go, the day-before one at 07:00 the day before.
  let rows = workshopEmailRows(w, [], new Date('2026-11-17T10:00:00Z'));
  assert.deepEqual(words(rows), [
    'Reminder the day before: It goes on Wed 18 Nov at 07:00.',
    'Reminder 1 hour before: It goes on Thu 19 Nov at 08:30.',
    'Follow-up: You send this after the day.',
    'Survey: It goes with the follow-up.',
  ]);
  assert.deepEqual(rows.map((r) => [r.kind, r.sent, r.button]), [['day_before', false, false], ['hour_before', false, false], ['follow_up', false, true], ['survey', false, false]]);
  assert.equal(rows[2].early, true, 'the follow-up is too soon before the workshop has started');
  // Only the emails whose switches are on have a row; the follow-up always does.
  assert.deepEqual(workshopEmailRows({ ...w, remind_day_before: false, remind_hour_before: false, survey_on: false }, [], new Date('2026-11-17T10:00:00Z')).map((r) => r.kind), ['follow_up']);
  // Once sent, the row says when and to how many (a timestamp with no zone ending is UTC).
  const sends = [{ workshop_id: 'w1', kind: 'day_before', sent_at: '2026-11-18T07:00:04', people: 18 }, { workshop_id: 'other', kind: 'hour_before', sent_at: '2026-11-19T08:30:00Z', people: 3 }];
  rows = workshopEmailRows(w, sends, new Date('2026-11-18T12:00:00Z'));
  assert.equal(rows[0].words, 'It was sent on Wed 18 Nov at 07:00, to 18 people.');
  assert.equal(rows[0].sent, true);
  assert.equal(rows[1].words, 'It goes on Thu 19 Nov at 08:30.', 'another workshop’s send never counts');
  // Due, and the scheduled job hasn't run yet.
  assert.equal(workshopEmailRows(w, [], new Date('2026-11-18T07:05:00Z'))[0].words, 'It goes in the next few minutes.');
  assert.equal(workshopEmailRows(w, [], new Date('2026-11-19T08:20:00Z'))[1].words, 'It goes in the next few minutes.');
  // Too late to go: under 2 hours (the day before's) and under 45 minutes (the 1-hour one's), as the database has it.
  assert.equal(workshopEmailRows(w, [], new Date('2026-11-19T08:00:00Z'))[0].words, 'It wasn’t sent, because it was switched on under 2 hours before the start.');
  assert.equal(workshopEmailRows(w, [], new Date('2026-11-19T09:00:00Z'))[1].words, 'It wasn’t sent, because it was switched on under 1 hour before the start.');
  // After it has started the follow-up can go; once it has, the survey went with it.
  rows = workshopEmailRows(w, [], new Date('2026-11-20T09:00:00Z'));
  assert.deepEqual([rows[2].button, rows[2].early], [true, false]);
  rows = workshopEmailRows(w, [{ workshop_id: 'w1', kind: 'follow_up', sent_at: '2026-11-20T09:12:00Z', people: 1 }, { workshop_id: 'w1', kind: 'survey', sent_at: '2026-11-20T09:12:00Z', people: 1 }], new Date('2026-11-20T10:00:00Z'));
  assert.equal(rows[2].words, 'It was sent on Fri 20 Nov at 09:12, to 1 person.');
  assert.deepEqual([rows[2].button, rows[3].sent], [false, true]);
  assert.equal(workshopEmailRows({ ...w }, [{ workshop_id: 'w1', kind: 'follow_up', sent_at: '2026-11-20T09:12:00Z', people: 4 }], new Date('2026-11-20T10:00:00Z'))[3].words, 'It didn’t go with the follow-up, because it was switched on afterwards.');
  // 07:00 is the workshop's own morning: New York's day before, said with the place for a reader elsewhere, and the year when it isn't this one.
  const ny = { ...w, time_zone: 'America/New_York', starts_at: '2027-01-12T14:30:00Z', remind_hour_before: false, survey_on: false };
  assert.equal(workshopEmailRows(ny, [], new Date('2026-12-20T10:00:00Z'), 'Europe/London')[0].words, 'It goes on Mon 11 Jan 2027 at 07:00 New York time.');
  // No date yet, and no zone (read as UK time, as the database does).
  assert.equal(workshopEmailRows({ ...w, starts_at: null }, [], new Date('2026-11-17T10:00:00Z'))[0].words, 'It goes once the workshop has a date.');
  assert.equal(workshopEmailRows({ ...w, time_zone: null }, [], new Date('2026-11-17T10:00:00Z'))[0].words, 'It goes on Wed 18 Nov at 07:00.');
  assert.deepEqual(workshopEmailRows(null), []);
});

test('the board: a card moved to another column sets the stage, and Paused follows the status', () => {
  const p = { id: 'p1', status: 'active', stage: null };
  assert.deepEqual(stageMove(p, 'renewal_due'), { stage: 'renewal_due' });
  assert.equal(boardStageOf({ ...p, ...stageMove(p, 'renewal_due') }, null, [], '2026-11-19'), 'renewal_due', 'the coach’s own choice wins over the worked-out column');
  // To Paused: the status, and the stage it had is kept for when they come back.
  assert.deepEqual(stageMove({ ...p, stage: 'closing' }, 'paused'), { status: 'paused' });
  assert.equal(boardStageOf({ ...p, stage: 'closing', status: 'paused' }, null, [], '2026-11-19'), 'paused');
  // Out of Paused: active again, in the column chosen.
  assert.deepEqual(stageMove({ ...p, status: 'paused' }, 'active'), { stage: 'active', status: 'active' });
  assert.equal(stageMove(p, 'nowhere'), null);
  assert.deepEqual([stageBeside('starting', -1), stageBeside('starting', 1), stageBeside('closing', 1), stageBeside('paused', 1), stageBeside('x', 1)], [null, 'active', 'paused', null, null]);
});

test('an organisation’s access code: made evenly from clear characters, and kept only as its SHA-256', async () => {
  const code = makeAccessCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)));
  assert.ok(!/[0O1IL]/.test(CODE_ALPHABET), 'nothing that reads as something else');
  assert.notEqual(makeAccessCode(), makeAccessCode());
  // A byte that would favour the first letters is thrown away (248 and up), never folded in.
  let call = 0;
  const fixed = makeAccessCode((bytes) => { call += 1; return bytes.fill(call === 1 ? 255 : 30); });
  assert.equal(fixed, CODE_ALPHABET[30].repeat(CODE_LENGTH));
  // The hash is what the database would compute from the typed code: sha256(upper(btrim(code))), in hex.
  const expected = createHash('sha256').update('ABCD2345EFGH6789').digest('hex');
  assert.equal(await accessCodeHash('ABCD2345EFGH6789'), expected);
  assert.equal(await accessCodeHash(' abcd-2345 efgh-6789 '), expected, 'as a person might type it back');
  assert.match(expected, /^[0-9a-f]{64}$/);
  assert.deepEqual(codeGroups('ABCD2345EFGH6789'), ['ABCD', '2345', 'EFGH', '6789']);
});

test('View as client: asked, a yes for its 30 minutes, a no for a day', () => {
  const now = new Date('2026-11-19T14:10:00Z');
  assert.equal(viewAskState([], now), null);
  assert.deepEqual(viewAskState([{ asked_at: '2026-11-19T14:00:00Z', answered_at: null }], now), { state: 'asked' });
  assert.equal(viewAskState([{ asked_at: '2026-11-10T14:00:00Z', answered_at: null }], now), null, 'an ask nobody answered goes after 7 days');
  const yes = { asked_at: '2026-11-19T14:00:00Z', answered_at: '2026-11-19T14:02:00Z', allowed: true, expires_at: '2026-11-19T14:32:00Z' };
  assert.deepEqual(viewAskState([{ asked_at: '2026-11-01T09:00:00Z', answered_at: '2026-11-01T09:01:00Z', allowed: false }, yes], now), { state: 'yes', until: '2026-11-19T14:32:00Z' }, 'the newest ask decides');
  assert.equal(viewAskState([yes], new Date('2026-11-19T14:32:00Z')), null, 'the yes has run out');
  const no = { asked_at: '2026-11-19T14:00:00Z', answered_at: '2026-11-19T14:02:00Z', allowed: false, expires_at: null };
  assert.deepEqual(viewAskState([no], now), { state: 'no' });
  assert.equal(viewAskState([no], new Date('2026-11-21T14:10:00Z')), null);
});

// ---------------------------------------------------------------- Settings and days
test('working hours as typed', () => {
  assert.deepEqual(parseHours('09:00 to 18:30'), { from: '09:00', to: '18:30' });
  assert.deepEqual(parseHours('9.00-17.00'), { from: '09:00', to: '17:00' });
  assert.equal(parseHours('18:00 to 09:00'), null, 'the end comes after the start');
  assert.equal(parseHours('25:00 to 26:00'), null);
  assert.equal(parseHours('all day'), null);
});

test('the time zone list starts with 21 cities, each a real place name', () => {
  assert.equal(START_ZONES.length, 21);
  assert.equal(new Set(START_ZONES).size, 21);
  for (const z of START_ZONES) assert.ok(isZone(z), z);
});

test('days in words', () => {
  assert.equal(dayWords('2026-11-19', '2026-11-19'), 'Thu 19 Nov');
  assert.equal(dayWords('2027-01-03', '2026-11-19'), 'Sun 3 Jan 2027');
  assert.equal(dayWords('2026-02-30'), '');
  assert.equal(rangeWords('2026-12-21', '2026-12-27', '2026-11-19'), 'Mon 21 Dec to Sun 27 Dec');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('Everything: one timeline in date order, filtered by kind and searched', () => {
  const data = {
    notes: [{ id: 'n1', body: 'Focus: the restructure.', noted_on: '2026-11-05', created_at: '2026-11-05T15:00:00Z' }],
    files: [{ id: 'f1', name: 'Hogan report', added_by: 'client', created_at: '2026-09-14T09:00:00Z' }],
    entries: [{ id: 't1', project_id: 'p1', started_at: '2026-11-10T09:00:00Z', ended_at: '2026-11-10T10:30:00Z' }, { id: 't2', started_at: '2026-11-19T09:00:00Z', ended_at: null }],
    projects: [{ id: 'p1', name: 'Offsite design' }],
    engagements: [{ id: 'e1', kind: 'sessions', created_at: '2026-09-07T09:00:00Z' }],
  };
  assert.deepEqual(timeline(data).map((i) => i.id), ['t:t1', 'n:n1', 'f:f1', 'e:e1'], 'newest first; a running clock isn’t history yet');
  assert.deepEqual(timeline(data, { kind: 'file' }).map((i) => i.id), ['f:f1']);
  assert.deepEqual(timeline(data, { q: 'restructure' }).map((i) => i.id), ['n:n1']);
  assert.equal(timeline(data)[0].line, 'Time, 1 hour 30 minutes');
});

test('typed text is cut to its limit without ever ending on half of an emoji (the break-it tester, 20 Nov)', () => {
  const whole = (text) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
  assert.equal(cut('abc', 5), 'abc');
  assert.equal(cut('abcdef', 3), 'abc');
  assert.equal(cut('ab🎉', 3), 'ab', 'half of the pair would fit, so it is left out whole');
  assert.equal(cut('ab🎉', 4), 'ab🎉');
  assert.equal(cut('🎉🎉', 2), '🎉');
  assert.equal(cut(null, 3), '');
  const parsed = parseQuickAdd(`E${'f'.repeat(298)}🎉 tomorrow`, { todayKey: '2026-11-17' });
  assert.ok(whole(parsed.title) && parsed.title.length === 299, 'the quick add’s 300-character title drops the emoji that would be cut');
  assert.equal(parseQuickAdd(`#${'x'.repeat(79)}🎉 call`, { todayKey: '2026-11-17' }).new_list?.length <= 80, true);
  assert.equal(parseQuickAdd('\u200B\u200B\u200E\u2060', { todayKey: '2026-11-17' }).title, '', 'only unseen characters is no title');
});

test('a to-do’s When menu suggests M11 seq 77’s days (tidy follow-up 3, run 6’s 8)', () => {
  assert.deepEqual(suggestedDays('2026-11-17').map((k) => dayWords(k, '2026-11-17')), ['Thu 19 Nov', 'Mon 23 Nov'], 'M11’s Tuesday: Thu 19 Nov and Mon 23 Nov');
  assert.deepEqual(suggestedDays('2026-11-20'), ['2026-11-23'], 'a Friday: the Monday once');
  assert.deepEqual(suggestedDays('2026-11-22'), ['2026-11-24'], 'a Sunday: never Tomorrow again');
  assert.deepEqual(suggestedDays('not a day'), []);
});
