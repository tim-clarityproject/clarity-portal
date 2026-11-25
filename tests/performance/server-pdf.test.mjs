// PDFs made on the server (follow-up 5, items 2 and 4): the guest's Health Check results PDF and a
// signed agreement's PDF, made by the same template the browser uses (src/lib/pdf), with the fonts
// read from disk (api/_pdfAssets.js), loaded EXACTLY AS VERCEL LOADS THEM: a plain `node` with no
// Vite and no resolve hook (this file's own runner may have one, so the work runs in a child process
// started with nothing but `node`). Nothing here touches a database or sends anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The child: imports both routers whole (as Vercel does), then makes the PDFs through the server's
// own paths and writes them to a folder, and prints what it made.
const CHILD = `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out = process.argv[1];
const root = process.argv[2];
const at = (p) => new URL(p, 'file://' + root + '/').href;
await import(at('api/guest.js'));
await import(at('api/coach.js'));
const { resultsPdf } = await import(at('api/_alignmentEmails.js'));
const { signedDocument } = await import(at('api/_agreementPdf.js'));
const { makeServerPdf, serverPaper } = await import(at('api/_pdfAssets.js'));
const data = {
  objective: 'Double recurring revenue by the end of 2027 🚀 北京',
  csfs: [{ id: 'f1', text: 'Win enterprise customers', level: 3 }, { id: 'f2', text: 'Cash to reach break-even' }],
  projects: [{ id: 'p1', text: 'Enterprise sales team' }, { id: 'p2', text: 'Pricing review' }],
  ratings: { owner: { p1: { contrib: { f1: 3, f2: 2 }, progress: 2, resource: 4 }, p2: { contrib: { f1: 1, f2: 3 }, progress: 4, resource: 2 } } },
};
const made = {};
const hc = await resultsPdf({ data, completedAt: '2026-10-26 23:30:00', clientLabel: 'Quillmark', acceptLanguage: 'en-GB,en;q=0.9' });
writeFileSync(join(out, 'hc.pdf'), hc.bytes); made.hc = hc.fileName;
const hcUs = await resultsPdf({ data, completedAt: '2026-10-26 23:30:00', clientLabel: 'Quillmark', acceptLanguage: 'fr,en-US;q=0.8' });
writeFileSync(join(out, 'hc-us.pdf'), hcUs.bytes);
made.paper = [serverPaper({}).name, serverPaper({ acceptLanguage: 'en-CA' }).name, serverPaper({ timeZone: 'America/Chicago' }).name, serverPaper({ acceptLanguage: 'en-GB', timeZone: 'America/Chicago' }).name];
const sig = JSON.parse(process.argv[3]);
const source = (coach) => ({
  ok: true, client_name: 'Sam Carter', time_zone: 'America/Chicago',
  version: { id: '00000000-0000-4000-8000-000000000001', agreement_id: '00000000-0000-4000-8000-000000000002', reference: 'CLARITY-AG-0001', version: 1,
    status: 'signed', current: true, sent_at: '2026-12-01T09:00:00Z', coach_signed_at: '2026-12-01T08:58:00Z', client_signed_at: '2026-12-02T18:40:00Z',
    funded_by: null, currency: 'GBP', total_minor: 1800000, clauses: [{ key: '4', title: 'Rearranging and cancelling', text: 'You can rearrange with 24 hours’ notice.' }],
    terms: { coaching: '6-month coaching', sessions: 16, minutes: 60, clientName: 'Sam Carter', clientEmail: 'sam@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim', coachEmail: 'tim@example.invalid' },
    signed_name: 'Sam Carter', signed_email: 'sam@example.invalid', fingerprint: 'a3f1c09e7b2d4e5f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f' },
  client_signature: { kind: 'drawn', image: sig.client },
  coach_signature: coach ? { kind: 'drawn', image: sig.coach } : null,
});
for (const [name, coach] of [['both', true], ['client-only', false]]) {
  const doc = await signedDocument(source(coach));
  const pdf = await makeServerPdf(doc.spec, { paper: doc.paper });
  writeFileSync(join(out, 'ag-' + name + '.pdf'), pdf.bytes);
  made['ag-' + name] = { fileName: pdf.fileName, paper: doc.paper.name };
}
console.log(JSON.stringify(made));
`;

/** A small drawn signature: a PNG of dark ink on nothing, made with zlib (as the PDF pack does). */
async function signaturePng(seed) {
  const { deflateSync, crc32 } = await import('node:zlib');
  const w = 200; const h = 60;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let x = 4; x < w - 4; x += 0.5) {
    const y = Math.round(h / 2 + Math.sin(x / (7 + seed)) * (h / 3.5));
    const o = y * (w * 4 + 1) + 1 + Math.round(x) * 4;
    raw[o] = 17; raw[o + 1] = 17; raw[o + 2] = 16; raw[o + 3] = 255;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** The PDF's own structure, read without any viewer: header, end, pages, embedded fonts, images. */
function shape(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  return {
    header: s.slice(0, 8),
    ends: /%%EOF\s*$/.test(s),
    pages: (s.match(/\/Type \/Page\b/g) || []).length,
    fonts: (s.match(/\/FontFile2?\b/g) || []).length,
    images: (s.match(/\/Subtype \/Image\b/g) || []).length,
    lang: /\/Lang \(en-GB\)/.test(s),
  };
}

test('the server makes the Health Check and signed agreement PDFs with plain node (no Vite, no resolve hook)', async () => {
  const out = mkdtempSync(join(tmpdir(), 'server-pdf-'));
  try {
    const sig = JSON.stringify({ client: await signaturePng(0), coach: await signaturePng(5) });
    // Exactly `node`: no --import, no loader, nothing inherited.
    const env = { ...process.env, NODE_OPTIONS: '' };
    const printed = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD, out, ROOT.replace(/\/$/, ''), sig], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 120000 });
    const made = JSON.parse(printed.trim().split('\n').pop());

    const hc = shape(readFileSync(join(out, 'hc.pdf')));
    assert.equal(hc.header, '%PDF-1.7');
    assert.ok(hc.ends, 'the Health Check PDF is whole');
    assert.ok(hc.pages >= 1 && hc.fonts >= 2 && hc.lang, 'pages, embedded fonts (Nekst and DM Sans, the emoji and Chinese parts) and the language');
    // The completion at 23:30 UTC on 26 Oct 2026 is 26 Oct in the UK (GMT from 25 Oct): read in the UK's zone.
    assert.equal(made.hc, 'Health Check, Quillmark, 26 Oct 2026.pdf');
    // Paper: A4 unless what the server knows says the US or Canada (PDF rule 3, paperFor's order).
    const page = (f) => /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(readFileSync(join(out, f), 'latin1'))?.slice(1).map(Number);
    assert.deepEqual(page('hc.pdf').map(Math.round), [595, 842], 'A4 for en-GB');
    assert.deepEqual(page('hc-us.pdf').map(Math.round), [612, 792], 'US Letter when the browser names the US');
    assert.deepEqual(made.paper, ['A4', 'US Letter', 'US Letter', 'A4'], 'nothing known is A4; the region wins over the zone');

    const both = shape(readFileSync(join(out, 'ag-both.pdf')));
    const one = shape(readFileSync(join(out, 'ag-client-only.pdf')));
    assert.equal(both.header, '%PDF-1.7');
    assert.ok(both.ends && both.pages >= 1 && both.fonts >= 2);
    assert.ok(both.images > one.images && one.images >= 1, `both signatures are drawn (${both.images} images, ${one.images} with the client's alone)`);
    assert.equal(made['ag-both'].paper, 'US Letter', 'the client\'s saved zone (Chicago) gives US Letter');
    assert.match(made['ag-both'].fileName, /^Coaching agreement, Sam Carter, 2 Dec 2026\.pdf$/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('vercel.json ships the PDF fonts with both routers that make PDFs', async () => {
  const { PDF_INCLUDE_FILES, FONT_FILES } = await import('../../api/_pdfAssets.js');
  const v = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  for (const fn of ['api/guest.js', 'api/coach.js']) assert.equal(v.functions?.[fn]?.includeFiles, PDF_INCLUDE_FILES, fn);
  for (const path of Object.values(FONT_FILES)) assert.ok(PDF_INCLUDE_FILES.includes(path), path);
  for (const part of ['noto-emoji/unicode.json', 'noto-emoji/files/noto-emoji-*-400-normal.woff', 'noto-sans-sc/unicode.json', 'noto-sans-sc/files/noto-sans-sc-*-400-normal.woff']) {
    assert.ok(PDF_INCLUDE_FILES.includes(part), part);
  }
  assert.ok(!/woff2/.test(PDF_INCLUDE_FILES), 'never WOFF2 (pdfkit draws its text blank)');
});
