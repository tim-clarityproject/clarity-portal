// The guest's own Health Check email (follow-up 5, item 2): "Email my link" on a finished Health
// Check carries its results PDF, made on the server from what alignment_email_check handed back
// (never from the browser), and only then says it is attached; an unfinished one carries no PDF
// and says neither "attached" nor "30 days". Results never close (Tim, 25 Nov).
// Every fetch is caught here (the database and the email provider are stand-ins): nothing is sent.
// Run with npm run test:healthcheck (plain node: the server path loads as Vercel loads it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/_routes/alignment-email.js';
import { linkEmail } from '../../api/_alignmentEmails.js';

const DB = 'https://db.example.invalid';
const TOKEN = 'test-token-not-real-0001';
const DATA = {
  objective: 'Double recurring revenue by the end of 2027.',
  csfs: [{ id: 'f1', text: 'Win enterprise customers', level: 3 }],
  projects: [{ id: 'p1', text: 'Enterprise sales team' }],
  ratings: { owner: { p1: { contrib: { f1: 3 }, progress: 2, resource: 4 } } },
};

async function ask(check, body = {}, headers = {}) {
  const sent = [];
  const asked = [];
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  Object.assign(process.env, { VERCEL_ENV: 'production', SUPABASE_URL: DB, SUPABASE_ANON_KEY: 'anon-stand-in', RESEND_API_KEY: 're-stand-in', ALIGNMENT_EMAIL_FROM: 'The Clarity Portal <portal@example.invalid>' });
  globalThis.fetch = async (input, init = {}) => {
    const href = String(input?.url || input);
    if (href === 'https://api.resend.com/emails') { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    if (href.startsWith(`${DB}/rest/v1/rpc/`)) {
      asked.push({ name: href.slice(`${DB}/rest/v1/rpc/`.length), body: JSON.parse(init.body) });
      return new Response(JSON.stringify(check), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Nothing else is asked (${href})`);
  };
  try {
    const r = { code: 0, body: null, status(c) { r.code = c; return r; }, setHeader() { return r; }, json(b) { r.body = b; } };
    await handler({ method: 'POST', headers: { host: 'portal.theclarityproject.co.uk', ...headers }, body: { token: TOKEN, email: 'guest@example.invalid', code: 'K7MPQ2', kind: 'link', ...body } }, r);
    return { r, sent, asked };
  } finally {
    globalThis.fetch = saved.fetch;
    for (const k of Object.keys(process.env)) if (!(k in saved.env)) delete process.env[k];
    Object.assign(process.env, saved.env);
  }
}

const finished = { ok: true, client_label: 'Quillmark', respondent_email: 'guest@example.invalid', status: 'complete', completed_at: '2026-10-26 08:30:00', data: DATA, has_coach: true };

test('a finished Health Check\'s email carries its results PDF, and says so', async () => {
  const { r, sent, asked } = await ask(finished, { timeZone: 'Europe/London' }, { 'accept-language': 'en-GB' });
  assert.deepEqual([r.code, r.body], [200, { ok: true, sent: true }]);
  assert.deepEqual(asked.map((a) => a.name), ['alignment_email_check']);
  assert.equal(Object.keys(asked[0].body).sort().join(), 'p_code,p_email,p_kind,p_token', 'the browser sends no answers; only the check is asked');
  assert.equal(sent.length, 1);
  const pdf = sent[0].attachments.find((a) => a.content_type === 'application/pdf');
  assert.ok(pdf, 'the PDF is attached');
  assert.equal(pdf.filename, 'Health Check, Quillmark, 26 Oct 2026.pdf');
  assert.equal(Buffer.from(pdf.content, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.ok(!pdf.disposition && !pdf.content_id, 'an attachment, not an inline image');
  assert.match(sent[0].text, /Your results are attached as a PDF, and you can open them again at any time with your link and code\./);
  assert.deepEqual(sent[0].to, ['guest@example.invalid']);
});

test('the answers in the PDF are the database\'s, whatever the browser sends', async () => {
  const { sent } = await ask(finished, { data: { objective: 'Forged by the browser' }, completedAt: '1999-01-01' });
  const pdf = sent[0].attachments.find((a) => a.content_type === 'application/pdf');
  assert.equal(pdf.filename, 'Health Check, Quillmark, 26 Oct 2026.pdf');
});

test('an unfinished Health Check\'s email has no PDF, and claims neither a PDF nor 30 days', async () => {
  const { r, sent } = await ask({ ...finished, status: 'in_progress', completed_at: null });
  assert.deepEqual([r.code, r.body], [200, { ok: true, sent: true }]);
  assert.equal(sent[0].attachments.filter((a) => a.content_type === 'application/pdf').length, 0);
  assert.doesNotMatch(sent[0].text, /attached|30 days|Thanks for completing/);
  assert.match(sent[0].text, /carry on where you left off/);
  assert.equal(sent[0].subject, 'Your Health Check link for Quillmark');
});

test('if the PDF can\'t be made, the email still goes and says nothing of a PDF', () => {
  const made = linkEmail({ origin: 'https://example.invalid', token: TOKEN, dateText: 'Mon 26 Oct 2026', clientLabel: 'Quillmark', email: 'guest@example.invalid', code: 'K7MPQ2', finished: true, pdf: null });
  assert.equal(made.attachments.filter((a) => a.content_type === 'application/pdf').length, 0);
  assert.doesNotMatch(made.text, /attached/);
  assert.match(made.text, /You can open your results again at any time with your link and code\./);
});
