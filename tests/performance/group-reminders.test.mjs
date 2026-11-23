// A group call's reminders (Phase 6a run 8, item 1; migration 059's group
// claim): the same two reminders as a single call, at 18:00 the day before
// and 1 hour before in EACH guest's own time, one email to each guest with
// only their own address, claimed per guest before sending so two runs that
// overlap send once, nothing to a guest who has left or for a call that was
// cancelled or moved, nothing from a preview, and nothing at all for groups
// before 059 is on the database. Every call goes to a stand-in here
// (globalThis.fetch), never to a database or an email provider. The
// switches and the database's own checks are tested in SQL
// (059's group-reminder test).
import test from 'node:test';
import assert from 'node:assert/strict';
import reminders, { dueGroupReminders, groupReminderEmail } from '../../api/coach-reminders.js';
import { instantAt } from '../../src/lib/time/index.js';

const SECRET = 'a-long-enough-secret-for-the-test';
const LIVE = {
  VERCEL_ENV: 'production', CRON_SECRET: SECRET, SUPABASE_URL: 'https://standin.example', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'resend', COACH_EMAIL_FROM: 'The Clarity Portal <hello@example.com>',
};
const ITEM = '11111111-1111-4111-8111-111111111111';
const SINGLE = '33333333-3333-4333-8333-333333333333';
const M = (n) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const LON = 'Europe/London';
const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

const guest = (n, name, email, zone, extra = {}) => ({
  item_id: ITEM, coach_id: 'c', kind: 'hour_before', occurrence_at: null, time_zone: LON, title: 'Kestrel team', place_kind: 'zoom',
  meeting_link: 'https://zoom.example/j/1', coach_first_name: 'Tim', group_name: 'Kestrel team',
  member_id: M(n), person_name: name, person_email: email, person_zone: zone, frequent_traveller: false, has_account: false, ...extra,
});

/**
 * A stand-in for the database and the email provider. The group claim is one
 * set keyed as 059's unique key is (call, kind, time, address); `members` is
 * who is in the group when the claim is made, `callOn` whether the call is
 * still on at that time.
 */
function standIn({ coming = [], group = [], members = null, callOn = true, groupMissing = false } = {}) {
  const claimed = new Set();
  const emails = [];
  const asked = [];
  const inGroup = new Map((members || group).map((g) => [g.member_id, g.person_email]));
  const pause = () => new Promise((r) => { setTimeout(r, 5); });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    asked.push(url);
    if (url.startsWith('https://api.resend.com/')) { emails.push(JSON.parse(init.body)); return json({ id: 'x' }); }
    const body = init.body ? JSON.parse(init.body) : {};
    await pause(); // both runs read before either claims
    if (url.includes('/rpc/cal_reminders_coming')) return json(coming);
    if (url.includes('/rpc/cal_group_reminders_coming')) {
      return groupMissing ? json({ code: 'PGRST202', message: 'Could not find the function public.cal_group_reminders_coming' }, 404) : json(group);
    }
    if (url.includes('/rpc/cal_group_reminder_claim')) {
      if (groupMissing) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      const address = inGroup.get(body.p_member);
      if (!address || !callOn) return json(null);
      const key = `${body.p_item}|${body.p_kind}|${body.p_occurrence}|${address.toLowerCase()}`;
      await pause();
      if (claimed.has(key)) return json(null);
      claimed.add(key);
      return json(address);
    }
    if (url.includes('/rpc/cal_reminder_claim')) {
      const key = JSON.stringify(body);
      if (claimed.has(key)) return json(false);
      claimed.add(key);
      return json(true);
    }
    return json([]);
  };
  return { fetch, emails, asked };
}

const res = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, json(b) { this.body = b; } });

async function withStandIn(stand, env, run) {
  const savedFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  for (const k of ['VERCEL_ENV', 'CRON_SECRET', 'RESEND_API_KEY', 'COACH_EMAIL_FROM', 'GUEST_EMAIL_FROM', 'ALIGNMENT_EMAIL_FROM', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  globalThis.fetch = stand.fetch;
  try { return await run(); } finally {
    globalThis.fetch = savedFetch;
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

const ask = (handler = reminders) => { const r = res(); return handler({ method: 'GET', headers: { authorization: `Bearer ${SECRET}`, host: 'portal.theclarityproject.co.uk' }, query: {} }, r).then(() => r); };
const inFifty = () => new Date(Date.now() + 50 * 60000).toISOString(); // inside the 1-hour reminder's window
const three = (at) => [
  guest(1, 'Ann Ito', 'ann@example.com', NY, { occurrence_at: at }),
  guest(2, 'Ben Hale', 'ben@example.com', LON, { occurrence_at: at }),
  guest(3, 'Cat Ross', 'cat@example.com', TOKYO, { occurrence_at: at }),
];

// ---------------------------------------------------------------- each guest's own moment

test('the day before goes at 18:00 in each guest\'s own time, across the US clock change', () => {
  // Mon 2 Nov 2026, 15:00 in London; the US clocks went back on Sun 1 Nov, the UK's on 25 Oct.
  const at = instantAt('2026-11-02', '15:00', LON).toISOString();
  const rows = [
    guest(1, 'Ann Ito', 'ann@example.com', NY, { kind: 'day_before', occurrence_at: at }),
    guest(2, 'Ben Hale', 'ben@example.com', LON, { kind: 'day_before', occurrence_at: at }),
    guest(3, 'Cat Ross', 'cat@example.com', TOKYO, { kind: 'day_before', occurrence_at: at }), // 00:00 Tue in Tokyo: the day before is Mon there
    guest(4, 'Dee Park', 'dee@example.com', null, { kind: 'day_before', occurrence_at: at }), // no zone of their own: the call's
  ];
  const sixPm = { [M(1)]: instantAt('2026-11-01', '18:00', NY), [M(2)]: instantAt('2026-11-01', '18:00', LON), [M(3)]: instantAt('2026-11-02', '18:00', TOKYO), [M(4)]: instantAt('2026-11-01', '18:00', LON) };
  assert.equal(sixPm[M(1)].toISOString(), '2026-11-01T23:00:00.000Z', 'New York is 5 hours behind once its clocks have gone back');
  for (const [member, when] of Object.entries(sixPm)) {
    const due = (t) => dueGroupReminders(rows, new Date(t)).map((r) => r.member_id);
    assert.ok(!due(when.getTime() - 60000).includes(member), `not before 18:00 for ${member}`);
    assert.ok(due(when.getTime()).includes(member), `at 18:00 for ${member}`);
    assert.ok(!due(when.getTime() + 3 * 3600000).includes(member), `not after 21:00 for ${member}`);
  }
  const ann = dueGroupReminders(rows, sixPm[M(1)])[0];
  assert.equal(ann.readerZone, NY);
  const email = groupReminderEmail(ann, { origin: 'https://portal.theclarityproject.co.uk', now: sixPm[M(1)] });
  assert.match(email.subject, /tomorrow at 10:00 am New York time/);
  const dee = dueGroupReminders(rows, sixPm[M(4)]).find((r) => r.member_id === M(4));
  assert.equal(dee.readerZone, LON);
});

test('the 1-hour reminder goes 60 to 30 minutes before for everyone, with no clock time', () => {
  const at = instantAt('2026-11-02', '15:00', LON);
  const rows = three(at.toISOString());
  assert.equal(dueGroupReminders(rows, new Date(at - 61 * 60000)).length, 0);
  assert.equal(dueGroupReminders(rows, new Date(at - 60 * 60000)).length, 3);
  assert.equal(dueGroupReminders(rows, new Date(at - 30 * 60000)).length, 0);
  const email = groupReminderEmail(dueGroupReminders(rows, new Date(at - 50 * 60000))[0], { origin: 'https://portal.theclarityproject.co.uk' });
  assert.equal(email.subject, 'Your group coaching session with Tim starts in 1 hour');
  assert.doesNotMatch(`${email.subject}\n${email.text}`, /\d{1,2}:\d{2}/, 'no clock time anywhere');
});

test('one row a call, kind, time and address; a row with no usable address or ids is left out', () => {
  const at = inFifty();
  const rows = [
    ...three(at),
    guest(5, 'Ann again', 'ANN@example.com', NY, { occurrence_at: at }),
    guest(6, 'Two', 'a@example.com, b@example.com', LON, { occurrence_at: at }),
    guest(7, 'None', '', LON, { occurrence_at: at }),
    { ...guest(8, 'Bad id', 'bad@example.com', LON, { occurrence_at: at }), member_id: 'not-a-uuid' },
  ];
  assert.deepEqual(dueGroupReminders(rows, new Date()).map((r) => r.to), ['ann@example.com', 'ben@example.com', 'cat@example.com']);
  assert.equal(dueGroupReminders(rows, new Date(), 2).length, 2, 'never more than the run\'s room');
  assert.equal(dueGroupReminders(rows, new Date(), 0).length, 0);
});

// ---------------------------------------------------------------- the server

test('each guest gets their own email, with only their own address and nobody else\'s anywhere', async () => {
  const stand = standIn({ group: three(inFifty()) });
  const r = await withStandIn(stand, LIVE, () => ask());
  assert.deepEqual([r.code, r.body], [200, { sent: 3 }]);
  assert.deepEqual(stand.emails.map((e) => e.to).sort(), [['ann@example.com'], ['ben@example.com'], ['cat@example.com']]);
  const everyone = ['ann@example.com', 'ben@example.com', 'cat@example.com', 'Ann Ito', 'Ben Hale', 'Cat Ross'];
  for (const e of stand.emails) {
    assert.deepEqual(Object.keys(e).filter((k) => /^(cc|bcc|reply_to|headers)$/i.test(k)), [], 'no CC, BCC or extra headers');
    const all = JSON.stringify({ subject: e.subject, html: e.html, text: e.text });
    for (const other of everyone) {
      if (e.to[0] === other) continue;
      assert.ok(!all.includes(other), `${e.to[0]}'s email never shows ${other}`);
    }
  }
});

test('two runs that overlap send each guest\'s reminder once, and a third sends nothing', async () => {
  const stand = standIn({ group: three(inFifty()) });
  const [a, b] = await withStandIn(stand, LIVE, () => Promise.all([ask(), ask()]));
  assert.equal(a.body.sent + b.body.sent, 3);
  assert.equal(stand.emails.length, 3, 'one email to each of the three, never two each');
  const c = await withStandIn(stand, LIVE, () => ask());
  assert.equal(c.body.sent, 0);
  assert.equal(stand.emails.length, 3);
});

test('a guest who has left the group by the time of the claim gets nothing; the others still do', async () => {
  const group = three(inFifty());
  const stand = standIn({ group, members: group.filter((g) => g.member_id !== M(2)) });
  const r = await withStandIn(stand, LIVE, () => ask());
  assert.equal(r.body.sent, 2);
  assert.deepEqual(stand.emails.map((e) => e.to[0]).sort(), ['ann@example.com', 'cat@example.com']);
});

test('a call cancelled or moved by the time of the claim: nobody gets anything', async () => {
  const stand = standIn({ group: three(inFifty()), callOn: false });
  const r = await withStandIn(stand, LIVE, () => ask());
  assert.deepEqual([r.body.sent, stand.emails.length], [0, 0]);
});

test('before 059 no group reminder goes at all, and a single call\'s still does', async () => {
  const single = [{ item_id: SINGLE, kind: 'hour_before', occurrence_at: inFifty(), person_email: 'client@example.com', person_zone: LON, time_zone: LON, coach_first_name: 'Tim', place_kind: 'zoom' }];
  const stand = standIn({ coming: single, group: three(inFifty()), groupMissing: true });
  const r = await withStandIn(stand, LIVE, () => ask());
  assert.deepEqual([r.code, r.body], [200, { sent: 1 }]);
  assert.deepEqual(stand.emails.map((e) => e.to[0]), ['client@example.com']);
  assert.ok(!stand.asked.some((u) => u.includes('/rpc/cal_group_reminder_claim')), 'no group claim is even tried');
});

test('the claim\'s own address is the one emailed, and a claim that answers nothing usable sends nothing', async () => {
  const at = inFifty();
  const group = [guest(1, 'Ann Ito', 'ann@example.com', NY, { occurrence_at: at })];
  const stand = standIn({ group, members: [{ member_id: M(1), person_email: 'ann.new@example.com' }] });
  await withStandIn(stand, LIVE, () => ask());
  assert.deepEqual(stand.emails.map((e) => e.to[0]), ['ann.new@example.com'], 'the address the claim was made for');
  const odd = standIn({ group, members: [{ member_id: M(1), person_email: 'a@example.com, b@example.com' }] });
  const r = await withStandIn(odd, LIVE, () => ask());
  assert.deepEqual([r.body.sent, odd.emails.length], [0, 0]);
});

test('a preview asks nothing and sends nothing, even with group reminders due', async () => {
  for (const env of [{ ...LIVE, VERCEL_ENV: 'preview' }, { ...LIVE, VERCEL_ENV: 'development' }, { ...LIVE, VERCEL_ENV: '' }]) {
    const stand = standIn({ group: three(inFifty()) });
    const r = await withStandIn(stand, env, () => ask());
    assert.deepEqual([r.code, r.body], [200, { sent: 0, reason: 'preview' }]);
    assert.deepEqual([stand.asked, stand.emails], [[], []]);
  }
});

test('the day-before email: Start my prep only for a guest with an account, the travel line only when ticked, Join on Zoom only for Zoom', () => {
  const at = instantAt('2026-11-02', '15:00', LON);
  const now = instantAt('2026-11-01', '18:00', LON);
  const row = { ...guest(2, 'Ben Hale', 'ben@example.com', LON, { kind: 'day_before', occurrence_at: at.toISOString() }), readerZone: LON };
  const origin = 'https://portal.theclarityproject.co.uk';
  const plain = groupReminderEmail(row, { origin, now });
  assert.match(plain.subject, /^Your group coaching session with Tim is tomorrow at 15:00 UK time$/);
  assert.doesNotMatch(plain.text, /Start my prep|Travelling\?/);
  assert.match(plain.text, /Join on Zoom/);
  assert.match(plain.text, /Group: Kestrel team/);
  const full = groupReminderEmail({ ...row, has_account: true, frequent_traveller: true }, { origin, now });
  assert.match(full.text, /Start my prep/);
  assert.match(full.text, /https:\/\/portal\.theclarityproject\.co\.uk\/coaching/);
  assert.match(full.text, /Travelling\? Your calendar invite moves with you\./);
  const inPerson = groupReminderEmail({ ...row, place_kind: 'in_person' }, { origin, now });
  assert.doesNotMatch(inPerson.text, /Join on Zoom|zoom\.example/);
});
