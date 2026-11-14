// Guest links: the copy of a guest's plan that is emailed to them
// (api/guest-copy.js, migration 042). Runs the real handler with the
// database and the email provider stood in for (fetch is replaced), so
// nothing is ever sent. It checks that only the live site sends, that a
// preview or a developer's machine asks nobody anything, and that the
// email goes to the address the database gives, never one in the request.
// Every address here is an invented placeholder.
// Run with npm run test:healthcheck.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/guest-copy.js';
import { copyContent, maySend } from '../../api/_guestEmails.js';

const GUEST = 'guest@example.invalid';
const OTHER = 'someone-else@example.invalid';
const VISIT = 'a'.repeat(64);
const FORM = {
  goal: 'Cut our time to hire to 30 days by March',
  version: 2,
  constraint_list: ['Hiring managers take a week to give feedback'],
  opportunity_list: [],
  options: ['Agree a 48-hour feedback rule', 'Run one-day loops'],
  next_steps: [{ id: 's1', option: 0, text: 'Agree a 48-hour feedback rule with the hiring managers' }, { id: 's2', option: 1, text: '  ' }],
};
const ISSUE = {
  ok: true, email: GUEST, tool: 'grow', tool_label: 'Get unstuck', coach_first_name: 'Tim',
  rows: [{ id: 'r2', title: 'Newest', form_data: FORM, status: 'complete', updated_at: '2026-11-14T09:00:00' },
    { id: 'r1', title: 'Older', form_data: { goal: 'An older plan', next_steps: [{ id: 'x', text: 'An older step' }] }, status: 'draft', updated_at: '2026-11-13T09:00:00' }],
};

const ENV = {
  VERCEL_ENV: 'production',
  SUPABASE_URL: 'https://database.example.invalid',
  SUPABASE_ANON_KEY: 'anon-key-placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key-placeholder',
  RESEND_API_KEY: 'resend-key-placeholder',
  GUEST_EMAIL_FROM: 'guest-sender@example.invalid',
  ALIGNMENT_EMAIL_FROM: 'sender@example.invalid',
};
const OTHERS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VERCEL', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'PORTAL_PREVIEW_HOSTS'];

let saved;
let realFetch;
let calls;
beforeEach(() => {
  saved = {};
  for (const k of [...Object.keys(ENV), ...OTHERS]) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, ENV);
  realFetch = globalThis.fetch;
  calls = [];
  // Until a test stands something in, any request at all is counted and refused.
  globalThis.fetch = async (url) => { calls.push({ url: String(url) }); throw new Error('the test reached outside the stand-ins'); };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// The database and Resend, stood in for. Anything else is refused.
function standIn({ issue = ISSUE, issueStatus = 200, sendFails = false } = {}) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = JSON.parse(init.body);
    calls.push({ url: u, key: init.headers.apikey || init.headers.Authorization, body });
    const ok = (json) => ({ ok: true, status: 200, json: async () => json });
    if (u === `${ENV.SUPABASE_URL}/rest/v1/rpc/guest_copy_issue`) return issueStatus === 200 ? ok(issue) : { ok: false, status: issueStatus, json: async () => ({}) };
    if (u === `${ENV.SUPABASE_URL}/rest/v1/rpc/guest_copy_failed`) return ok({ ok: true });
    if (u === 'https://api.resend.com/emails') return sendFails ? { ok: false, status: 500, json: async () => ({}) } : ok({ id: 'not-sent' });
    throw new Error('the test reached outside the stand-ins');
  };
}

async function ask(body = { visit: VISIT }, { method = 'POST', headers = { host: 'portal.theclarityproject.co.uk' } } = {}) {
  const res = { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ method, headers, body }, res);
  const sent = calls.filter((c) => c.url === 'https://api.resend.com/emails').map((c) => c.body);
  return { res, sent };
}
const called = (name) => calls.filter((c) => c.url.endsWith(`/${name}`));

test('may this deployment send? Only the live site', () => {
  assert.equal(maySend({ VERCEL_ENV: 'production' }), true);
  for (const env of [{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: undefined }, {}, { VERCEL_ENV: 'Production' }, { VERCEL_ENV: ' production' }, { VERCEL: '1' }, { NODE_ENV: 'production' }, null]) {
    assert.equal(maySend(env), false, JSON.stringify(env));
  }
});

test('a preview, a developer’s machine and an unnamed deployment ask nobody anything', async () => {
  for (const where of ['preview', 'development', undefined, '']) {
    calls = [];
    if (where === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = where;
    const { res } = await ask();
    assert.equal(res.statusCode, 200, String(where));
    assert.deepEqual(res.body, { ok: true, sent: false });
    assert.equal(calls.length, 0, `no request at all on ${where}: not the database, not the email provider`);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});

test('the live site: the copy goes to the address the database gives, with the newest plan', async () => {
  standIn();
  const { res, sent } = await ask({ visit: VISIT, email: OTHER, to: OTHER, goal: 'Typed into the request', nextSteps: ['From the request'], coachName: 'Mallory', origin: 'https://other.example' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, sent: true }, 'the address is never sent back');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, [GUEST], 'only the database’s address');
  assert.equal(m.from, ENV.GUEST_EMAIL_FROM);
  assert.equal(m.subject, 'Your Get unstuck plan');
  for (const words of ['Here’s what you’ll do next.', 'Agree a 48-hour feedback rule with the hiring managers', 'Cut our time to hire to 30 days by March', 'Create my free account', 'https://portal.theclarityproject.co.uk/auth/sign-up', 'through a link from Tim.']) {
    assert.ok(m.text.includes(words) && m.html.includes(words.replace(/&/g, '&amp;')), words);
  }
  // nothing from the request, no older plan, no answers the email doesn't show, no address
  for (const words of [OTHER, GUEST, 'Typed into the request', 'From the request', 'Mallory', 'other.example', 'An older', 'Hiring managers take a week', 'Run one-day loops', VISIT]) {
    assert.ok(!m.text.includes(words) && !m.html.includes(words), `"${words.slice(0, 12)}" is not in the email`);
  }
  assert.ok(m.attachments.length === 1 && m.attachments.every((a) => a.content_type === 'image/png' && a.disposition === 'inline'), 'only the logo');
  // asked with the server's key, with the visit key and nothing else
  const asked = called('guest_copy_issue');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].key, ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(asked[0].body, { p_visit: VISIT });
  assert.equal(called('guest_copy_failed').length, 0);
});

test('a forged host never changes the link, and GUEST_EMAIL_FROM falls back to the Health Check’s sender', async () => {
  standIn();
  delete process.env.GUEST_EMAIL_FROM;
  const { sent } = await ask({ visit: VISIT }, { headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } });
  assert.equal(sent[0].from, ENV.ALIGNMENT_EMAIL_FROM);
  assert.ok(sent[0].text.includes('https://portal.theclarityproject.co.uk/auth/sign-up'));
  assert.ok(!sent[0].html.includes('evil.example') && !sent[0].text.includes('evil.example'));
});

test('a visit key of the wrong shape is refused before anything is asked', async () => {
  standIn();
  for (const visit of [undefined, null, '', 'x', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}\n`, 12345, { $ne: null }, [VISIT]]) {
    const { res } = await ask({ visit, email: OTHER });
    assert.equal(res.statusCode, 400, String(visit).slice(0, 10));
    assert.deepEqual(res.body, { ok: false, sent: false, error: 'invalid' });
  }
  assert.equal((await ask('not an object')).res.statusCode, 400);
  assert.equal((await ask({ visit: VISIT }, { method: 'GET' })).res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('not set up yet: no server key, no sender, or 042 not run, answers calmly and sends nothing', async () => {
  for (const missing of ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'SUPABASE_URL']) {
    calls = [];
    standIn();
    const kept = process.env[missing];
    delete process.env[missing];
    const { res } = await ask();
    process.env[missing] = kept;
    assert.equal(res.statusCode, 200, missing);
    assert.deepEqual(res.body, { ok: false, sent: false });
    assert.equal(calls.length, 0, `nothing asked without ${missing}`);
  }
  calls = [];
  standIn();
  delete process.env.GUEST_EMAIL_FROM;
  delete process.env.ALIGNMENT_EMAIL_FROM;
  assert.deepEqual((await ask()).res.body, { ok: false, sent: false });
  assert.equal(calls.length, 0);
  Object.assign(process.env, ENV);
  // the function isn't in the database yet (035 and 042 not run)
  calls = [];
  standIn({ issueStatus: 404 });
  const { res, sent } = await ask();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: false, sent: false });
  assert.equal(sent.length, 0);
  // the server's key is never swapped for the public one
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  calls = [];
  await ask();
  assert.equal(calls.length, 0);
});

test('an ended visit, the limit, and a database that doesn’t answer', async () => {
  standIn({ issueStatus: 403 });
  let r = await ask();
  assert.equal(r.res.statusCode, 400);
  assert.deepEqual(r.res.body, { ok: false, sent: false, error: 'invalid' });
  standIn({ issue: { ok: false, error: 'limit' } });
  r = await ask();
  assert.equal(r.res.statusCode, 429);
  assert.deepEqual(r.res.body, { ok: false, sent: false, error: 'limit' });
  for (const issue of [{ ok: false }, { ok: false, error: 'nothing' }, null, { ok: 'true', email: GUEST }]) {
    standIn({ issue });
    r = await ask();
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(r.res.body, { ok: false, sent: false });
  }
  standIn({ issueStatus: 503 });
  r = await ask();
  assert.equal(r.res.statusCode, 502);
  assert.deepEqual(r.res.body, { ok: false, sent: false });
  assert.equal(calls.filter((c) => c.url === 'https://api.resend.com/emails').length, 0, 'none of these sends anything');
});

test('an email that didn’t go: the count is taken back, and the answer names nobody', async () => {
  standIn({ sendFails: true });
  const { res } = await ask();
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { ok: false, sent: false });
  const back = called('guest_copy_failed');
  assert.equal(back.length, 1);
  assert.deepEqual(back[0].body, { p_visit: VISIT });
  assert.equal(back[0].key, ENV.SUPABASE_SERVICE_ROLE_KEY);
});

test('nothing to send, another tool’s link or no real address: nothing goes and the count is taken back', async () => {
  const cases = [
    { ...ISSUE, rows: [{ id: 'r', form_data: { goal: '  ', next_steps: [] } }] },
    { ...ISSUE, rows: [] },
    { ...ISSUE, rows: null },
    { ...ISSUE, tool: 'give-feedback', tool_label: 'Give difficult feedback' },
    { ...ISSUE, email: null },
    { ...ISSUE, email: 'not an address' },
    { ...ISSUE, email: `${GUEST}\nBcc: ${OTHER}` },
  ];
  for (const issue of cases) {
    calls = [];
    standIn({ issue });
    const { res, sent } = await ask();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: false, sent: false });
    assert.equal(sent.length, 0);
    assert.equal(called('guest_copy_failed').length, 1);
  }
});

test('what the email shows from a saved row: the goal and the next steps, blanks left out; an old row too', () => {
  assert.deepEqual(copyContent({ form_data: FORM }), { goal: 'Cut our time to hire to 30 days by March', nextSteps: ['Agree a 48-hour feedback rule with the hiring managers'] });
  assert.deepEqual(copyContent({ form_data: { goal: 'Delegate the report', options: ['Show Jordan'], will_do: 'Show Jordan\nBlock an hour' } }), { goal: 'Delegate the report', nextSteps: ['Show Jordan', 'Block an hour'] });
  assert.deepEqual(copyContent({ form_data: { goal: 'Only a goal' } }), { goal: 'Only a goal', nextSteps: [] });
  for (const row of [null, undefined, {}, { form_data: null }, { form_data: 'x' }, { form_data: { goal: ' ' } }]) assert.equal(copyContent(row), null);
});

test('what was typed into a plan is only ever text in the email', async () => {
  const typed = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
  standIn({ issue: { ...ISSUE, coach_first_name: typed, tool_label: typed, rows: [{ form_data: { goal: typed, next_steps: [{ id: 'a', text: typed }] } }] } });
  const { sent } = await ask();
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].html.includes('<script>alert') && !sent[0].html.includes('<img src=x'));
  assert.ok(sent[0].html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
