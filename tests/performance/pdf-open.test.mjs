// Stage D item 14 (Tim, 27 Nov): opening a business PDF ("Open it" on a signed agreement, the client's signed agreement
// rows) never quietly saves it: a new tab on a laptop (its viewer has Download), Safari's own viewer on an iPhone or iPad,
// and on Android, whose browser shows no PDF in a tab, the file handed to the phone's own PDF viewer.
// src/lib/pdf/saveFile.js: pdfTab, openPdfFile, closePdfTab, showsPdfInTab.
import test from 'node:test';
import assert from 'node:assert/strict';

const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

/** A browser stand-in: window.open, object URLs and a link's click (a download), all counted. */
function browser(ua, { blocks = false } = {}) {
  const seen = { opened: [], downloads: [], revoked: [] };
  const tab = () => ({ closed: false, opener: {}, location: { href: 'about:blank' }, close() { this.closed = true; } });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true, writable: true });
  globalThis.window = { open: (url) => { if (blocks) return null; const t = tab(); if (url) t.location.href = url; seen.opened.push(t); return t; } };
  globalThis.URL.createObjectURL = (b) => `blob:local/${b.name || 'blob'}`;
  globalThis.URL.revokeObjectURL = (u) => seen.revoked.push(u);
  globalThis.document = {
    createElement: () => ({ click() { seen.downloads.push(this.download); }, remove() {} }),
    body: { appendChild() {} },
  };
  return seen;
}
const bytes = new Uint8Array([37, 80, 68, 70]);
const { closePdfTab, openPdfFile, pdfTab, showsPdfInTab } = await import('../../src/lib/pdf/saveFile.js');

test('which browsers show a PDF in a tab: every one but Android’s', () => {
  assert.equal(showsPdfInTab(LAPTOP), true);
  assert.equal(showsPdfInTab(IPHONE), true);
  assert.equal(showsPdfInTab(ANDROID), false);
});

test('a laptop: the tab opened inside the tap shows the PDF, and nothing is saved', () => {
  const seen = browser(LAPTOP);
  const tab = pdfTab();
  assert.equal(seen.opened.length, 1);
  assert.equal(tab.opener, null, 'the new tab can’t reach back into the portal');
  assert.equal(openPdfFile(bytes, 'Coaching agreement, version 2.pdf', tab), 'tab');
  assert.equal(tab.location.href, 'blob:local/Coaching agreement, version 2.pdf');
  assert.deepEqual(seen.downloads, []);
  assert.equal(seen.opened.length, 1, 'no second tab');
});

test('an iPhone: the same, so Safari’s own viewer shows it', () => {
  const seen = browser(IPHONE);
  assert.equal(openPdfFile(bytes, 'Agreement.pdf', pdfTab()), 'tab');
  assert.deepEqual(seen.downloads, []);
});

test('Android: no empty tab; the file goes to the phone, which opens it in its own viewer', () => {
  const seen = browser(ANDROID);
  const tab = pdfTab();
  assert.equal(tab, null);
  assert.equal(openPdfFile(bytes, 'Agreement.pdf', tab), 'file');
  assert.deepEqual(seen.downloads, ['Agreement.pdf']);
  assert.equal(seen.opened.length, 0);
});

test('no tab from the tap: a new tab now, else (blocked) saved rather than lost', () => {
  const seen = browser(LAPTOP);
  assert.equal(openPdfFile(bytes, 'Agreement.pdf', null), 'tab');
  assert.equal(seen.opened.length, 1);
  const blocked = browser(LAPTOP, { blocks: true });
  assert.equal(pdfTab(), null);
  assert.equal(openPdfFile(bytes, 'Agreement.pdf', null), 'file');
  assert.deepEqual(blocked.downloads, ['Agreement.pdf']);
  assert.equal(blocked.revoked.length, 1, 'the unused address is let go at once');
});

test('the PDF couldn’t be had: the tab opened for it closes', () => {
  browser(LAPTOP);
  const tab = pdfTab();
  closePdfTab(tab);
  assert.equal(tab.closed, true);
  closePdfTab(null);
});

test('the places that open a signed agreement use it, and none of them saves the file quietly', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  const client = src('src/pages/coach/ClientPage.jsx');
  const fn = client.slice(client.indexOf('async function openSignedAgreement'), client.indexOf('function AgreementPanel'));
  assert.match(fn, /const tab = pdfTab\(\);[\s\S]*await import/, 'the tab opens before anything is awaited');
  assert.match(fn, /openPdfFile\(bytes, fileName, tab\)/);
  assert.doesNotMatch(fn, /savePdfFile/);
  assert.match(src('src/pages/coaching/Coaching.jsx'), /await openPdf\(\(\) => agreementDocument/);
  assert.match(src('src/pages/coaching/Welcome.jsx'), /await openPdf\(\(\) => agreementDocument/);
});
