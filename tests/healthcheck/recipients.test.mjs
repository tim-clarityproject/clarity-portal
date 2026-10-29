// Health Check 4, part 2: only the coach who sent the link sees the answers.
// Runs the real email handler with the database and the email provider
// stood in for (fetch is replaced), so nothing is ever sent, and checks who
// each email would go to. Every address here is an invented placeholder, and
// a failure names people by role, never by address.
// Run with npm run test:healthcheck.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/alignment-email.js';
import { completionRecipients, finishedEmail, ownerList } from '../../api/_alignmentEmails.js';

const OWNER = 'owner@example.invalid';
const PARTNER = 'partner@example.invalid';
const COACH = 'second-coach@example.invalid';
const GUEST = 'guest@example.invalid';
const WHO = { [OWNER]: 'the owner', [PARTNER]: 'the owner list\'s second address', [COACH]: 'the second coach', [GUEST]: 'the guest' };
const who = (to) => to.map((a) => WHO[a] || 'someone else');

const ANSWERS = {
  objective: 'Double recurring revenue by the end of 2027.',
  csfs: [{ id: 'f1', text: 'Win enterprise customers', level: 3 }],
  projects: [{ id: 'p1', text: 'Enterprise sales team', started: '2026-02', due: '2026-12' }],
  ratings: { owner: { p1: { contrib: { f1: 3 }, progress: 2, resource: 4 } } },
};

const ENV = {
  SUPABASE_URL: 'https://database.example.invalid',
  SUPABASE_ANON_KEY: 'anon-key-placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-placeholder',
  RESEND_API_KEY: 'resend-key-placeholder',
  ALIGNMENT_EMAIL_FROM: 'sender@example.invalid',
  ALIGNMENT_NOTIFY_TO: `${OWNER}, ${PARTNER}`,
};

let saved;
let realFetch;
let calls;
beforeEach(() => {
  saved = {};
  for (const k of [...Object.keys(ENV), 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) saved[k] = process.env[k];
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  Object.assign(process.env, ENV);
  realFetch = globalThis.fetch;
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// The database and Resend, stood in for. Anything else is refused.
function standIn({ hasCoach, coachEmail, sendFails = () => false }) {
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const u = String(url);
    calls.push({ url: u, key: init.headers.apikey || init.headers.Authorization, body });
    const ok = (json) => ({ ok: true, json: async () => json });
    if (u === `${ENV.SUPABASE_URL}/rest/v1/rpc/alignment_email_check`) {
      const check = {
        ok: true, client_label: 'Northfield Logistics', respondent_email: GUEST, status: 'complete',
        completed_at: '2026-10-29T09:30:00', data: ANSWERS,
      };
      if (hasCoach !== undefined) check.has_coach = hasCoach; // undefined: 036 not run yet
      return ok(check);
    }
    if (u === `${ENV.SUPABASE_URL}/rest/v1/rpc/alignment_recipients`) return ok({ ok: true, coach_email: coachEmail ?? null });
    if (u === `${ENV.SUPABASE_URL}/rest/v1/rpc/alignment_email_failed`) return ok({ ok: true });
    if (u === 'https://api.resend.com/emails') return sendFails(body) ? { ok: false, json: async () => ({}) } : ok({ id: 'not-sent' });
    throw new Error('the test reached outside the stand-ins');
  };
}

async function finish() {
  const res = { statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({
    method: 'POST',
    headers: { host: 'preview.example.invalid' },
    body: { token: 'test-token-not-real', email: GUEST, code: 'ABCDEF', kind: 'complete' },
  }, res);
  const sent = calls.filter((c) => c.url === 'https://api.resend.com/emails').map((c) => c.body);
  return { res, sent, answers: sent.find((m) => m.subject.includes('completed')), notice: sent.find((m) => m.subject.includes('finished')) };
}

const holdsAnswers = (m) => [ANSWERS.objective, 'Enterprise sales team', 'Win enterprise customers', 'Questions to start with', 'At a glance', GUEST, 'test-token-not-real']
  .some((words) => m.html.includes(words) || m.text.includes(words));

test('a second coach\'s link: the answers go only to that coach, the owner list gets the notice', async () => {
  standIn({ hasCoach: true, coachEmail: COACH });
  const { res, sent, answers, notice } = await finish();
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 2, 'two emails would be sent');
  assert.deepEqual(who(answers.to), ['the second coach']);
  assert.ok(holdsAnswers(answers), 'the coach\'s email holds the answers');
  assert.deepEqual(who(notice.to), ['the owner', 'the owner list\'s second address']);
  assert.equal(holdsAnswers(notice), false, 'the owner\'s notice holds no answers, no respondent and no link');
  assert.equal(notice.subject, 'Strategic Alignment Health Check finished: Northfield Logistics');
  assert.ok(notice.text.includes('Northfield Logistics has finished a Strategic Alignment Health Check.'));
  assert.ok(notice.text.includes('Finished: 29 October 2026'));
  assert.ok(notice.attachments.every((a) => a.content_type === 'image/png' && a.disposition === 'inline'), 'no PDF, only the logo');
  // the coach's address was asked for with the server's key, never the public one
  const asked = calls.find((c) => c.url.endsWith('/alignment_recipients'));
  assert.equal(asked.key, ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(asked.body, { p_token: 'test-token-not-real' });
  assert.equal(calls.find((c) => c.url.endsWith('/alignment_email_check')).key, ENV.SUPABASE_ANON_KEY);
});

test('the owner\'s own link: the answers go to the owner only, the rest of the owner list gets the notice', async () => {
  standIn({ hasCoach: true, coachEmail: 'Owner@Example.invalid' });
  const { answers, notice } = await finish();
  assert.deepEqual(answers.to, ['Owner@Example.invalid']);
  assert.deepEqual(who(notice.to), ['the owner list\'s second address']);
  assert.equal(holdsAnswers(notice), false);
});

test('an older link with no coach recorded: the answers go to the owner list, as before', async () => {
  for (const hasCoach of [false, undefined]) { // undefined: before 036 is run
    calls = [];
    standIn({ hasCoach });
    const { res, sent, answers } = await finish();
    assert.equal(res.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.deepEqual(who(answers.to), ['the owner', 'the owner list\'s second address']);
    assert.ok(holdsAnswers(answers));
    assert.equal(calls.some((c) => c.url.endsWith('/alignment_recipients')), false, 'no need to ask who made it');
  }
});

test('a coach\'s link whose coach can\'t be found sends nothing, and can be tried again', async () => {
  standIn({ hasCoach: true, coachEmail: null });
  const { res, sent } = await finish();
  assert.equal(res.statusCode, 502);
  assert.equal(sent.length, 0, 'the answers never go to anyone else');
  assert.ok(calls.some((c) => c.url.endsWith('/alignment_email_failed')), 'the send is undone so it can be tried again');

  calls = [];
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  standIn({ hasCoach: true, coachEmail: COACH });
  const second = await finish();
  assert.equal(second.res.statusCode, 502, 'without the server\'s key, nothing is sent');
  assert.equal(second.sent.length, 0);
});

test('if the coach\'s email doesn\'t go, the owner gets no notice and it can be tried again', async () => {
  standIn({ hasCoach: true, coachEmail: COACH, sendFails: (m) => m.subject.includes('completed') });
  const { res, sent } = await finish();
  assert.equal(res.statusCode, 502);
  assert.equal(sent.filter((m) => m.subject.includes('finished')).length, 0);
  assert.ok(calls.some((c) => c.url.endsWith('/alignment_email_failed')));
});

test('if only the owner\'s notice doesn\'t go, the coach\'s email still counts as sent', async () => {
  standIn({ hasCoach: true, coachEmail: COACH, sendFails: (m) => m.subject.includes('finished') });
  const { res } = await finish();
  assert.equal(res.statusCode, 200);
  assert.equal(calls.some((c) => c.url.endsWith('/alignment_email_failed')), false);
});

test('the recipient rules on their own', () => {
  assert.deepEqual(ownerList(' a@example.invalid, ,b@example.invalid '), ['a@example.invalid', 'b@example.invalid']);
  assert.deepEqual(completionRecipients({ coachEmail: null, owners: [OWNER] }), { answersTo: [OWNER], noticeTo: [] });
  assert.deepEqual(completionRecipients({ coachEmail: ' ', owners: [OWNER] }), { answersTo: [OWNER], noticeTo: [] });
  assert.deepEqual(completionRecipients({ coachEmail: COACH, owners: [] }), { answersTo: [COACH], noticeTo: [] });
  const m = finishedEmail({ clientLabel: 'A & B\nLtd', dateText: '29 October 2026' });
  assert.equal(m.subject, 'Strategic Alignment Health Check finished: A & B Ltd');
  assert.ok(m.html.includes('A &amp; B Ltd'));
});
