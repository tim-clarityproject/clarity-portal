// Signed agreements (follow-up 5, item 4): /api/agreement-sign and /api/agreement-pdf, with the
// database answered by a stand-in (every fetch is caught here: nothing leaves this machine). Checks
// that who may sign or read is always asked AS THE CALLER, with their own sign-in, and that the
// server's key is used only after that, only to read the source and keep the PDF; that the PDF kept
// is a real PDF with both signatures drawn; that a refusal passes back the database's own words;
// and that a kept PDF is handed back as kept, never made again.
import test from 'node:test';
import assert from 'node:assert/strict';
import sign from '../../api/_routes/agreement-sign.js';
import pdfRoute from '../../api/_routes/agreement-pdf.js';

const URL_ = 'https://db.example.invalid';
const ANON = 'anon-key-stand-in';
const SERVICE = 'service-key-stand-in';
const CALLER = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjYWxsZXIifQ.stand-in';
const V = '00000000-0000-4000-8000-0000000000a1';
const SIG = '00000000-0000-4000-8000-0000000000b2';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SOURCE = {
  ok: true, stored: false, client_name: 'Sam Carter', time_zone: 'Europe/London',
  version: { id: V, agreement_id: '00000000-0000-4000-8000-0000000000c3', reference: 'CLARITY-AG-0007', version: 1, status: 'signed', current: true,
    sent_at: '2026-12-01T09:00:00Z', coach_signed_at: '2026-12-01T08:58:00Z', client_signed_at: '2026-12-02T18:40:00Z', funded_by: null,
    currency: 'GBP', total_minor: 1800000, terms: { coaching: '6-month coaching', clientName: 'Sam Carter', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim' },
    clauses: [{ key: '4', title: 'Rearranging and cancelling', text: 'You can rearrange.' }], signed_name: 'Sam Carter', signed_email: 'sam@example.invalid',
    fingerprint: 'a'.repeat(64) },
  client_signature: { kind: 'drawn', image: PNG },
  coach_signature: { kind: 'typed', typed_name: 'Tim Dutton' },
};

/** A stand-in database: answers each rpc by name, and remembers who asked with which key. */
function standIn(answers) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const href = String(input?.url || input);
    if (!href.startsWith(`${URL_}/rest/v1/rpc/`)) throw new Error(`Nothing but the stand-in database is asked (${href})`);
    const name = href.slice(`${URL_}/rest/v1/rpc/`.length).split('?')[0];
    const headers = new Headers(init.headers || input?.headers);
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ name, auth: headers.get('authorization'), apikey: headers.get('apikey'), body });
    const [status, json] = answers[name] ? answers[name](body) : [404, { code: 'PGRST202', message: 'not here' }];
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

function res() {
  const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k] = v; return r; }, json(b) { r.body = b; } };
  return r;
}

async function run(handler, body, db, { token = CALLER, service = SERVICE } = {}) {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  Object.assign(process.env, { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON });
  if (service) process.env.SUPABASE_SERVICE_ROLE_KEY = service; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY;
  globalThis.fetch = db.fetch;
  try {
    const r = res();
    await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body, query: {} }, r);
    return r;
  } finally {
    globalThis.fetch = saved.fetch;
    for (const k of Object.keys(process.env)) if (!(k in saved.env)) delete process.env[k];
    Object.assign(process.env, saved.env);
  }
}

const asCaller = (c) => c.auth === `Bearer ${CALLER}` && c.apikey === ANON;
const asServer = (c) => c.apikey === SERVICE;

test('signing: signed as the caller, then the PDF is made with both signatures and kept with the server key', async () => {
  let kept = null;
  const db = standIn({
    sign_agreement_v2: () => [200, { signed_at: '2026-12-02T18:40:00Z', fingerprint: 'a'.repeat(64), version: 1, start_now: true, settle_choice: 'plan', self_funded: true }],
    agreement_pdf_source: () => [200, SOURCE],
    agreement_signed_pdf_keep: (b) => { kept = b; return [200, { ok: true, pdf: b.p_pdf, file_name: b.p_file_name, sha256: 'f'.repeat(64) }]; },
  });
  const r = await run(sign, { versionId: V, signatureId: SIG, name: 'Sam Carter', fingerprint: 'a'.repeat(64), startNow: true, choice: 'plan' }, db);
  assert.equal(r.code, 200);
  // Phase 6b run 3: sign_agreement_v2 records the start-now tick and the way of settling (065), and says whether it was
  // an amendment (agreements rule 12).
  assert.deepEqual(r.body, { ok: true, signed_at: '2026-12-02T18:40:00Z', fingerprint: 'a'.repeat(64), version: 1, pdf: true, start_now: true, settle_choice: 'plan', self_funded: true, amends: false });
  assert.deepEqual(db.calls.map((c) => c.name), ['sign_agreement_v2', 'agreement_pdf_source', 'agreement_signed_pdf_keep']);
  assert.ok(asCaller(db.calls[0]), 'sign_agreement is asked as the caller, never with the server key');
  assert.deepEqual(db.calls[0].body, { p_version: V, p_name: 'Sam Carter', p_signature: SIG, p_fingerprint: 'a'.repeat(64), p_start_now: true, p_choice: 'plan' });
  assert.ok(asServer(db.calls[1]) && asServer(db.calls[2]), 'the source and the keeping use the server key');
  const bytes = Buffer.from(kept.p_pdf, 'base64');
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', 'a real PDF is kept');
  assert.ok((bytes.toString('latin1').match(/\/Subtype \/Image\b/g) || []).length >= 1, 'the client\'s drawn signature is on it');
  assert.equal(kept.p_file_name, 'Coaching agreement, Sam Carter, 2 Dec 2026.pdf');
  assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('signing: a refusal comes back in the database\'s own words, and nothing else is asked', async () => {
  for (const [code, status] of [['CC409', 409], ['42501', 403], ['22023', 400]]) {
    const db = standIn({ sign_agreement_v2: () => [400, { code, message: 'This agreement is already signed.' }] });
    const r = await run(sign, { versionId: V, signatureId: SIG, name: 'Sam Carter', fingerprint: 'a'.repeat(64) }, db);
    assert.equal(r.code, status, code);
    assert.deepEqual(r.body, { ok: false, code, message: 'This agreement is already signed.' });
    assert.deepEqual(db.calls.map((c) => c.name), ['sign_agreement_v2'], 'no PDF for a refused signing');
  }
});

test('signing: the PDF failing (or no server key) never undoes the signing; the first download makes it', async () => {
  const db = standIn({
    sign_agreement_v2: () => [200, { signed_at: '2026-12-02T18:40:00Z', fingerprint: 'a'.repeat(64), version: 1 }],
    agreement_pdf_source: () => [500, { code: 'XX000', message: 'stand-in failure' }],
  });
  const r = await run(sign, { versionId: V, signatureId: SIG, name: 'Sam Carter', fingerprint: 'a'.repeat(64) }, db);
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.pdf, false);
  const db2 = standIn({ sign_agreement_v2: () => [200, { signed_at: '2026-12-02T18:40:00Z', fingerprint: 'a'.repeat(64), version: 1 }] });
  const r2 = await run(sign, { versionId: V, signatureId: SIG, name: 'Sam Carter', fingerprint: 'a'.repeat(64) }, db2, { service: null });
  assert.deepEqual([r2.code, r2.body.ok, r2.body.pdf], [200, true, false]);
  assert.deepEqual(db2.calls.map((c) => c.name), ['sign_agreement_v2']);
});

test('signing: the wrong shape, or no sign-in, asks nothing', async () => {
  const db = standIn({});
  for (const body of [{}, { versionId: 'x', signatureId: SIG, name: 'A' }, { versionId: V, signatureId: SIG, name: 5 }]) {
    assert.equal((await run(sign, body, db)).code, 400);
  }
  assert.equal((await run(sign, { versionId: V, signatureId: SIG, name: 'Sam Carter' }, db, { token: '' })).code, 401);
  assert.equal(db.calls.length, 0);
});

test('download: the kept PDF comes back as kept, asked as the caller, with no server key used', async () => {
  const pdf = Buffer.from('%PDF-1.7 kept').toString('base64');
  const db = standIn({ agreement_signed_pdf: () => [200, { ok: true, made: true, pdf, file_name: 'Coaching agreement, Sam Carter, 2 Dec 2026.pdf', sha256: 'f'.repeat(64) }] });
  const r = await run(pdfRoute, { versionId: V }, db);
  assert.deepEqual([r.code, r.body], [200, { ok: true, pdf, fileName: 'Coaching agreement, Sam Carter, 2 Dec 2026.pdf' }]);
  assert.deepEqual(db.calls.map((c) => c.name), ['agreement_signed_pdf']);
  assert.ok(asCaller(db.calls[0]));
});

test('download: not kept yet: made and kept once, and the one kept first is handed back', async () => {
  const first = Buffer.from('%PDF-1.7 made in another tab').toString('base64');
  const db = standIn({
    agreement_signed_pdf: () => [200, { ok: true, made: false }],
    agreement_pdf_source: () => [200, SOURCE],
    agreement_signed_pdf_keep: () => [200, { ok: true, pdf: first, file_name: 'First.pdf', sha256: 'e'.repeat(64) }],
  });
  const r = await run(pdfRoute, { versionId: V }, db);
  assert.deepEqual([r.code, r.body], [200, { ok: true, pdf: first, fileName: 'First.pdf' }]);
  assert.ok(asCaller(db.calls[0]) && asServer(db.calls[1]) && asServer(db.calls[2]));
});

test('download: not theirs (or a coach without the code) gets the refusal and nothing is made', async () => {
  const db = standIn({ agreement_signed_pdf: () => [403, { code: '42501', message: 'That agreement isn’t yours.' }] });
  const r = await run(pdfRoute, { versionId: V }, db);
  assert.deepEqual([r.code, r.body], [403, { ok: false, code: '42501', message: 'That agreement isn’t yours.' }]);
  assert.deepEqual(db.calls.map((c) => c.name), ['agreement_signed_pdf']);
  const db2 = standIn({ agreement_signed_pdf: () => [200, { ok: false, error: 'not_signed' }] });
  const r2 = await run(pdfRoute, { versionId: V }, db2);
  assert.deepEqual([r2.code, r2.body], [409, { ok: false, error: 'not_signed' }]);
});

test('both addresses join the coach router, with no new function in api/', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../api/coach.js', import.meta.url), 'utf8');
  assert.match(src, /'agreement-sign': agreementSign/);
  assert.match(src, /'agreement-pdf': agreementPdf/);
});

test('break-it tester, follow-up 5: a huge drawn signature is written as the name, never drawn (the server\'s memory)', async () => {
  const { pngSize, safeSignature } = await import('../../api/_agreementPdf.js');
  const png = (w, h) => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
    b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return `data:image/png;base64,${b.toString('base64')}`;
  };
  assert.deepEqual(pngSize(png(600, 200)), { width: 600, height: 200 });
  assert.equal(pngSize('not a png'), null);
  const ok = { kind: 'drawn', image: png(600, 200) };
  assert.equal(safeSignature(ok, 'Ben Carter'), ok);
  assert.deepEqual(safeSignature({ kind: 'drawn', image: png(7000, 7000) }, 'Ben Carter'), { kind: 'typed', typed_name: 'Ben Carter' });
  assert.deepEqual(safeSignature({ kind: 'drawn', image: 'garbage' }, 'Ben Carter'), { kind: 'typed', typed_name: 'Ben Carter' });
  const typed = { kind: 'typed', typed_name: 'Ben Carter' };
  assert.equal(safeSignature(typed, 'x'), typed);
});
