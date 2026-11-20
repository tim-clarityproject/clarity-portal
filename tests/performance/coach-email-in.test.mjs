// Emails logged by themselves (Phase 6a run 4): the copy-in address and the
// optional Gmail connection behind their adapters, with stand-ins that hand
// over invented emails; the inbound webhook's shape; the one chooser (the
// live site never gets a stand-in); and the server function, which only
// the live site ever runs. No key, no network, nothing sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseEmailAdapters, copyInStandIn, deviceEmailStandIns, emailStatus, gmailOnce, gmailStandIn, loadEmailAdapters, resetStandInsForTests, STAND_IN_DOMAIN } from '../../src/lib/coach/connect/index.js';
import { addressesFor, copyInEmailAdapter, copyInOff, directionOf, keysOf, readInbound } from '../../src/lib/coach/connect/copyInEmail.js';
import { gmailAdapter, gmailOff, tidyEmail } from '../../src/lib/coach/connect/gmail.js';
import { emailBelongs } from '../../src/lib/coach/crm.js';
import handler, { askedFor, hasSecret, inboundDomain, keysSet } from '../../api/coach-email-in.js';

const DOMAIN = 'in.example.invalid';
const LOG = 'log.alex.7kx2m4qa';
const TODO = 'todo.alex.9bd3w6tz';
const SECRET = 'an-invented-secret-of-32-chars!!';
const ALEX = { name: 'Alex Morgan', email: 'alex@example.invalid' };
const AMY = { name: 'Amy Cole', email: 'amy@example.invalid' };

// ---------------------------------------------------------------- the webhook's shape

test('an inbound email is read: which address it was copied to, who it names, and its words', () => {
  const read = readInbound({
    from: 'Alex Morgan <Alex@Example.invalid>', to: 'Amy Cole <amy@example.invalid>, ruth@example.invalid', cc: [{ email: 'dana@example.invalid', name: 'Dana Whitfield' }], bcc: [`${LOG}@${DOMAIN}`],
    subject: '  Leadership Accelerator   proposal ', text: 'The proposal is attached.\r\nIt covers the six months we talked about.', date: 'Thu, 12 Nov 2026 09:40:00 +0000', message_id: '<abc123@mail.example.invalid>',
  }, { domain: DOMAIN });
  assert.deepEqual([read.key, read.kind], [LOG, 'log']);
  assert.deepEqual(read.email, {
    external_id: 'abc123@mail.example.invalid', source: 'copy_in', direction: 'out', from: ALEX, to: [AMY, { name: '', email: 'ruth@example.invalid' }], cc: [{ name: 'Dana Whitfield', email: 'dana@example.invalid' }],
    subject: 'Leadership Accelerator proposal', snippet: 'The proposal is attached. It covers the six months we talked about.', body: 'The proposal is attached.\nIt covers the six months we talked about.',
    sent_at: '2026-11-12T09:40:00.000Z', thread_key: 'abc123@mail.example.invalid', link: null,
  });
});

test('the usual spellings of the common services are read, and the copy-in address is never one of the people', () => {
  const read = readInbound({
    FromFull: { Email: 'ruth@example.invalid', Name: 'Ruth Adeyemi' }, ToFull: [{ Email: 'alex@example.invalid', Name: 'Alex Morgan' }, { Email: `${LOG}@${DOMAIN}`, Name: '' }], CcFull: [],
    OriginalRecipient: `${LOG}@${DOMAIN}`, Subject: 'Re: Chemistry Call', HtmlBody: '<p>Thanks, Alex.</p><p>Can we start in <b>January</b>?</p><style>p{color:red}</style>', MessageID: 'm-2',
    Headers: [{ Name: 'In-Reply-To', Value: '<m-1@mail.example.invalid>' }, { Name: 'Date', Value: '2026-11-17T08:40:00Z' }],
  }, { domain: DOMAIN });
  assert.deepEqual([read.key, read.email.from.name, read.email.to.map((p) => p.email), read.email.snippet, read.email.thread_key, read.email.sent_at, read.email.external_id],
    [LOG, 'Ruth Adeyemi', ['alex@example.invalid'], 'Thanks, Alex. Can we start in January?', 'm-1@mail.example.invalid', '2026-11-17T08:40:00.000Z', 'm-2']);
  // Forwarded to the to-do address.
  const todo = readInbound({ from: ALEX, to: [`${TODO}@${DOMAIN}`], subject: 'Fwd: Insurance renewal', text: 'Due on the 30th.' }, { domain: DOMAIN });
  assert.deepEqual([todo.key, todo.kind, todo.email.to, todo.email.thread_key], [TODO, 'todo', [], 'insurance renewal']);
  // The envelope alone is enough (a bcc isn't in the headers).
  assert.equal(readInbound({ from: ALEX, to: [AMY], envelope: { to: [`${LOG}@${DOMAIN}`] }, subject: 'Hello' }, { domain: DOMAIN }).key, LOG);
});

test('an email for no address of ours, at another domain, or that can’t be read is refused calmly', () => {
  assert.deepEqual(readInbound({ from: ALEX, to: [AMY], subject: 'Hi' }, { domain: DOMAIN }), { problem: 'no_address' });
  assert.deepEqual(readInbound({ from: ALEX, to: [`${LOG}@elsewhere.invalid`], subject: 'Hi' }, { domain: DOMAIN }), { problem: 'no_address' });
  assert.deepEqual(readInbound({ to: [`${LOG}@${DOMAIN}`] }, { domain: DOMAIN }), { problem: 'unreadable' });
  for (const bad of [null, 'text', [], 7]) assert.deepEqual(readInbound(bad, { domain: DOMAIN }), { problem: 'unreadable' });
  // A date that isn't one is left out (the database then uses now); words are cut, never refused.
  const long = readInbound({ from: ALEX, to: [`${LOG}@${DOMAIN}`], subject: 'S', text: 'x'.repeat(150000), date: 'the other day' }, { domain: DOMAIN });
  assert.deepEqual([long.email.sent_at, long.email.body.length, long.email.snippet.length], [null, 100000, 300]);
});

test('which way an email went is known once the owner’s own address is: from them it was sent, from anyone else it came in', () => {
  assert.equal(directionOf({ from: ALEX }, ['alex@example.invalid']), 'out');
  assert.equal(directionOf({ from: AMY }, ['Alex@Example.invalid']), 'in');
  assert.equal(directionOf({ from: AMY }, []), 'out');
  assert.equal(directionOf({ from: null }, ['alex@example.invalid']), 'out');
});

// ---------------------------------------------------------------- the stand-ins

test('the copy-in stand-in starts empty, shows the two addresses, and hands over an invented email in the webhook’s own shape', async () => {
  const copyIn = copyInStandIn({ now: () => new Date('2026-11-17T09:00:00Z') });
  assert.deepEqual([copyIn.service, copyIn.real, copyIn.waiting()], ['copy_in_email', false, []]);
  assert.deepEqual(await copyIn.status(), { ready: true, domain: STAND_IN_DOMAIN });
  assert.deepEqual(await copyIn.addresses([{ kind: 'todo', key: TODO }, { kind: 'log', key: LOG }]), { log: `${LOG}@${STAND_IN_DOMAIN}`, todo: `${TODO}@${STAND_IN_DOMAIN}` });
  assert.deepEqual(await copyIn.addresses({}), { log: '', todo: '' });
  copyIn.arrive(LOG, { from: ALEX, to: [{ name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }], subject: 'Good to meet you at the summit', text: 'Here is the article I mentioned.' });
  copyIn.arrive(TODO, { from: ALEX, subject: 'Fwd: Insurance renewal', text: 'Due on the 30th.' });
  const handed = copyIn.handOver();
  assert.equal(handed.length, 2);
  assert.deepEqual(copyIn.handOver(), []);
  const [logged, todo] = handed.map((p) => readInbound(p, { domain: STAND_IN_DOMAIN }));
  assert.deepEqual([logged.key, logged.kind, logged.email.subject, logged.email.sent_at, todo.kind], [LOG, 'log', 'Good to meet you at the summit', '2026-11-17T09:00:00.000Z', 'todo']);
  // And the rules decide whose it is: Sarah isn't in the portal, so she waits on Leads.
  assert.deepEqual(emailBelongs(logged.email, { leads: [], own: [ALEX.email], keys: [LOG, TODO] }), { links: [], waiting: [{ name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }] });
  // Its state can live between page loads.
  let kept = null;
  const keep = { read: () => kept, write: (s) => { kept = JSON.parse(JSON.stringify(s)); } };
  copyInStandIn({ keep }).arrive(LOG, { from: ALEX, to: [AMY], subject: 'Kept' });
  assert.equal(copyInStandIn({ keep }).waiting().length, 1);
  // It has no way to send anything.
  assert.deepEqual(Object.keys(copyIn).filter((k) => /send|reply|deliver/i.test(k)), []);
});

test('the Gmail stand-in is read-only: it hands back what is new since the cursor, in the database’s shape', async () => {
  const gmail = gmailStandIn({ now: () => new Date('2026-11-17T08:40:00Z'), me: ALEX });
  assert.deepEqual([gmail.service, gmail.real], ['gmail', false]);
  assert.deepEqual(await gmail.listMessages(), { emails: [], cursor: '0' });
  gmail.inGmail.send({ to: [AMY], subject: 'Leadership Accelerator proposal', text: 'The proposal is attached.' });
  gmail.inGmail.receive({ from: AMY, subject: 'Re: Leadership Accelerator proposal', text: 'Our CEO is in on Thursday.' });
  const first = await gmail.listMessages();
  assert.deepEqual(first.emails.map((e) => [e.direction, e.from.email, e.to.map((p) => p.email), e.subject, e.source, e.external_id]), [
    ['out', ALEX.email, [AMY.email], 'Leadership Accelerator proposal', 'gmail', 'gmail-standin-1'], ['in', AMY.email, [ALEX.email], 'Re: Leadership Accelerator proposal', 'gmail', 'gmail-standin-2']]);
  // A reply sits in its email's own thread, and every link is https.
  assert.equal(first.emails[0].thread_key, first.emails[1].thread_key);
  assert.ok(first.emails.every((e) => /^https:\/\//.test(e.link) && tidyEmail(e).link === e.link));
  assert.deepEqual((await gmail.listMessages({ cursor: first.cursor })).emails, []);
  gmail.inGmail.receive({ from: { name: 'Ruth Adeyemi', email: 'ruth@example.invalid' }, subject: 'January', text: 'Can we start in January?' });
  assert.deepEqual((await gmail.listMessages({ cursor: first.cursor })).emails.map((e) => e.subject), ['January']);
  // A cursor that isn't one of ours starts again with everything.
  assert.equal((await gmail.listMessages({ cursor: 'not-a-cursor' })).emails.length, 3);
  // Read only: the adapter itself has one question and no way to send, reply, label or delete.
  for (const adapter of [gmail, gmailAdapter(async () => ({ ok: true, emails: [] })), gmailOff]) assert.deepEqual(Object.keys(adapter).filter((k) => typeof adapter[k] === 'function' && k !== 'emails'), ['listMessages']);
});

// ---------------------------------------------------------------- the adapters and the one chooser

test('the real adapters ask the portal’s own server, hold no key, and tidy whatever comes back', async () => {
  const asked = [];
  const ask = async (body) => { asked.push(body); return body.kind === 'status' ? { ok: true, copy_in: true, gmail: true, domain: DOMAIN } : { ok: true, cursor: 'c2', emails: [{ external_id: 'g1', direction: 'in', from: { name: ' Amy Cole ', email: 'AMY@example.invalid' }, to: [ALEX], subject: 'Hello', sent_at: '2026-11-17T08:00:00Z', link: 'javascript:alert(1)', secret: 'never kept' }, null] } };
  const copyIn = copyInEmailAdapter(ask);
  assert.deepEqual([copyIn.service, copyIn.real], ['copy_in_email', true]);
  assert.deepEqual(await copyIn.addresses([{ kind: 'log', key: LOG }, { kind: 'todo', key: TODO }]), { log: `${LOG}@${DOMAIN}`, todo: `${TODO}@${DOMAIN}` });
  const gmail = gmailAdapter(ask);
  const got = await gmail.listMessages({ cursor: 'c1' });
  assert.deepEqual(asked, [{ kind: 'status' }, { service: 'gmail', kind: 'list', cursor: 'c1' }]);
  assert.deepEqual(got, { cursor: 'c2', emails: [{ external_id: 'g1', source: 'gmail', direction: 'in', from: AMY, to: [ALEX], cc: [], subject: 'Hello', snippet: null, body: null, sent_at: '2026-11-17T08:00:00.000Z', thread_key: null, link: null }] });
  await assert.rejects(gmailAdapter(async () => ({ ok: false, reason: 'not_connected' })).listMessages(), (err) => err.code === 'not_connected');
  // Not set up: no address is shown.
  assert.deepEqual(await copyInEmailAdapter(async () => ({ ok: true, copy_in: false, domain: null })).addresses({ log: LOG }), { log: '', todo: '' });
  assert.deepEqual(await copyInEmailAdapter(async () => { throw new Error('offline'); }).status(), { ready: false, domain: null });
  assert.deepEqual([keysOf([{ kind: 'log', key: LOG }]), addressesFor({ log: LOG, todo: TODO }, '')], [{ log: LOG, todo: '' }, { log: '', todo: '' }]);
});

test('ONE chooser: the real adapter where the server says it is set up; on the live site anything else is off; elsewhere the stand-ins', async () => {
  resetStandInsForTests();
  const ask = async () => ({ ok: true, copy_in: true, gmail: false, domain: DOMAIN });
  assert.deepEqual(await emailStatus(ask), { copy_in: true, gmail: false, domain: DOMAIN });
  assert.deepEqual(await emailStatus(async () => ({ ok: false, reason: 'preview' })), { copy_in: false, gmail: false, domain: null });
  assert.deepEqual(await emailStatus(async () => { throw new Error('offline'); }), { copy_in: false, gmail: false, domain: null });
  // The live site, copy-in set up and Gmail not: the real copy-in address, and Gmail OFF (never a stand-in).
  const live = await loadEmailAdapters({ ask, live: true });
  assert.deepEqual([live.copyIn.real, live.gmail.real, live.gmail.off], [true, false, true]);
  assert.deepEqual(await live.gmail.listMessages({ cursor: 'c' }), { emails: [], cursor: 'c' });
  // The live site with nothing set up: both off. Nothing to copy, nothing handed over.
  const bare = chooseEmailAdapters({ copy_in: false, gmail: false }, { ask, live: true });
  assert.deepEqual([bare.copyIn, bare.gmail], [copyInOff, gmailOff]);
  assert.deepEqual([await copyInOff.status(), await copyInOff.addresses({ log: LOG })], [{ ready: false, domain: null }, { log: '', todo: '' }]);
  assert.equal(typeof bare.copyIn.handOver, 'undefined');
  // A preview, a developer's machine or a test: the device's own stand-ins, the same ones for every page.
  const preview = chooseEmailAdapters(null, { live: false });
  assert.deepEqual([preview.copyIn.real, preview.gmail.real, preview.copyIn === deviceEmailStandIns().copyIn, preview.gmail === deviceEmailStandIns().gmail], [false, false, true, true]);
  // A status that says yes with no way to ask is still the stand-in.
  assert.equal(chooseEmailAdapters({ copy_in: true, gmail: true }, { live: false }).gmail.real, false);
});

// ---------------------------------------------------------------- one round of logging Gmail

test('a round of Gmail logs each email once, moves the cursor on, and does nothing while the switch is off', async () => {
  const gmail = gmailStandIn({ me: ALEX });
  gmail.inGmail.send({ to: [AMY], subject: 'Proposal', text: 'Attached.' });
  gmail.inGmail.receive({ from: { name: 'Sarah Kent', email: 'sarah.kent@example.invalid' }, subject: 'Hello', text: 'Good to meet you.' });
  // The database keeps an email once, by its external id (coach_email_add answers new: false the second time).
  const kept = new Set();
  const log = async (email) => { const fresh = !kept.has(email.external_id); kept.add(email.external_id); return fresh ? { new: true, links: email.direction === 'out' ? 1 : 0, waiting: email.direction === 'in' ? 1 : 0 } : { new: false, links: 0, waiting: 0 }; };
  assert.deepEqual(await gmailOnce({ gmail, cursor: null, on: false, log }), { cursor: null, read: 0, logged: 0, links: 0, waiting: 0, problem: null });
  const first = await gmailOnce({ gmail, cursor: null, on: true, log });
  assert.deepEqual(first, { cursor: '2', read: 2, logged: 2, links: 1, waiting: 1, problem: null });
  assert.deepEqual(await gmailOnce({ gmail, cursor: first.cursor, on: true, log }), { cursor: '2', read: 0, logged: 0, links: 0, waiting: 0, problem: null });
  // The same round again from the old cursor (a reload, a second tab): read again, logged nowhere twice.
  assert.deepEqual(await gmailOnce({ gmail, cursor: null, on: true, log }), { cursor: '2', read: 2, logged: 0, links: 0, waiting: 0, problem: null });
  // A round that stops part-way keeps its cursor, so the next starts from the same place.
  gmail.inGmail.receive({ from: AMY, subject: 'Third', text: 'x' });
  const stopped = await gmailOnce({ gmail, cursor: '2', on: true, log: async () => { throw new Error('no connection'); } });
  assert.deepEqual([stopped.cursor, stopped.problem], ['2', 'not_logged']);
  assert.deepEqual((await gmailOnce({ gmail: gmailAdapter(async () => ({ ok: false, reason: 'not_connected' })), cursor: 'c', on: true, log })).problem, 'not_connected');
  assert.deepEqual(await gmailOnce({ gmail: gmailOff, cursor: 'c', on: true, log }), { cursor: 'c', read: 0, logged: 0, links: 0, waiting: 0, problem: null });
});

// ---------------------------------------------------------------- the server function

const KEYS = ['VERCEL_ENV', 'COACH_EMAIL_IN_SECRET', 'COACH_EMAIL_IN_DOMAIN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const call = async (body, { env = {}, headers = {}, method = 'POST' } = {}) => {
  const saved = { ...process.env };
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(b) { this.body = b; } };
  try { await handler({ method, body, headers }, res); } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
  return res;
};
const WEBHOOK = { from: ALEX, to: [AMY], bcc: [`${LOG}@${DOMAIN}`], subject: 'Proposal', text: 'Attached.' };

test('the server function: only the live site ever runs, and with no keys it says "not set up" calmly', async () => {
  // A preview or a developer's machine: nothing is read and the database is asked nothing, whatever is sent.
  let res = await call(WEBHOOK, { env: { COACH_EMAIL_IN_SECRET: SECRET, COACH_EMAIL_IN_DOMAIN: DOMAIN, SUPABASE_SERVICE_ROLE_KEY: 'x' }, headers: { authorization: `Bearer ${SECRET}` } });
  assert.deepEqual([res.code, res.body, res.headers['Cache-Control']], [200, { ok: false, reason: 'preview' }, 'no-store']);
  res = await call({ kind: 'status' });
  assert.deepEqual(res.body, { ok: true, copy_in: false, gmail: false, domain: null, reason: 'preview' });
  // The live site with no keys: calm, and nothing runs.
  res = await call(WEBHOOK, { env: { VERCEL_ENV: 'production' }, headers: { authorization: `Bearer ${SECRET}` } });
  assert.deepEqual([res.code, res.body], [200, { ok: false, reason: 'setup' }]);
  // The live site with keys and the wrong secret, or none.
  const live = { VERCEL_ENV: 'production', COACH_EMAIL_IN_SECRET: SECRET, COACH_EMAIL_IN_DOMAIN: DOMAIN, SUPABASE_SERVICE_ROLE_KEY: 'x' };
  assert.equal((await call(WEBHOOK, { env: live, headers: { authorization: 'Bearer something-else-entirely-wrong!!' } })).code, 401);
  assert.equal((await call(WEBHOOK, { env: live })).code, 401);
  // The right secret, an email for no address of ours: answered so the service doesn't keep trying, and the database is never asked.
  res = await call({ from: ALEX, to: [AMY], subject: 'Not for us' }, { env: live, headers: { authorization: `Bearer ${SECRET}` } });
  assert.deepEqual([res.code, res.body], [200, { ok: true, status: 'unknown' }]);
  res = await call({ ...WEBHOOK, text: 'x'.repeat(300000) }, { env: live, headers: { 'x-webhook-secret': SECRET } });
  assert.deepEqual(res.body, { ok: true, status: 'unreadable' });
  // The owner's status with no sign-in is refused; so is anything that isn't a POST.
  assert.equal((await call({ kind: 'status' }, { env: { ...live, SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'anon' } })).code, 401);
  assert.equal((await call(WEBHOOK, { env: live, method: 'GET' })).code, 405);
  // No answer ever carries an address, a name, a subject or a key.
  for (const r of [res]) assert.doesNotMatch(JSON.stringify(r.body), /@|alex|amy|log\.|proposal/i);
});

test('the server’s own checks: the secret in any of its three places, the inbound domain, and what the portal may ask', () => {
  assert.equal(hasSecret({ authorization: `Bearer ${SECRET}` }, SECRET), true);
  assert.equal(hasSecret({ authorization: `Basic ${Buffer.from(`clarity:${SECRET}`).toString('base64')}` }, SECRET), true);
  assert.equal(hasSecret({ 'x-webhook-secret': SECRET }, SECRET), true);
  assert.equal(hasSecret({ authorization: `Bearer ${SECRET}x` }, SECRET), false);
  assert.equal(hasSecret({ authorization: `Basic ${Buffer.from('clarity:wrong').toString('base64')}` }, SECRET), false);
  assert.equal(hasSecret({}, SECRET), false);
  // A secret too short to be one is never accepted, even when it matches.
  assert.equal(hasSecret({ authorization: 'Bearer short' }, 'short'), false);
  assert.equal(hasSecret({ authorization: 'Bearer undefined' }, undefined), false);
  assert.deepEqual([inboundDomain({ COACH_EMAIL_IN_DOMAIN: ' @In.Example.Invalid ' }), inboundDomain({ COACH_EMAIL_IN_DOMAIN: 'not a domain' }), inboundDomain({})], ['in.example.invalid', '', '']);
  assert.deepEqual(keysSet({ COACH_EMAIL_IN_SECRET: SECRET, COACH_EMAIL_IN_DOMAIN: DOMAIN, SUPABASE_SERVICE_ROLE_KEY: 'x' }), { copy_in: true, gmail: false });
  assert.deepEqual(keysSet({ COACH_EMAIL_IN_SECRET: 'short', COACH_EMAIL_IN_DOMAIN: DOMAIN, SUPABASE_SERVICE_ROLE_KEY: 'x' }), { copy_in: false, gmail: false });
  assert.deepEqual(keysSet({ COACH_EMAIL_IN_SECRET: SECRET, COACH_EMAIL_IN_DOMAIN: DOMAIN }), { copy_in: false, gmail: false });
  assert.deepEqual([askedFor({ kind: 'status' }), askedFor({ service: 'gmail', kind: 'list' }), askedFor({ service: 'gmail', kind: 'send' }), askedFor(WEBHOOK), askedFor({ kind: 'status', from: 'x' }), askedFor(null)],
    [{ kind: 'status' }, { service: 'gmail', kind: 'list', cursor: null }, null, null, null, null]);
});
