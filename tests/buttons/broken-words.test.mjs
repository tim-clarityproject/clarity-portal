// The lasting "never squash" check (CLAUDE.md rule 20; tests/buttons/buttons-check.mjs brokenWords), read on small
// pages of its own (Phase 6b run 3, UI finding 1): a label column crushed by a long value beside it, so its words
// break letter by letter, fails; the same row with the label kept at its longest word passes, and an email address,
// a web address or a file name wrapping where it must is left alone.
//
//   node --import ./tests/scores/register.mjs --test tests/buttons/broken-words.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { brokenWords } from './buttons-check.mjs';

const STYLE = `
  .ui-root { background: #000; color: #fff; font-family: sans-serif; font-size: 32px; padding: 16px; width: 358px; box-sizing: border-box; }
  .crushed { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; }
  .crushed > span:first-child { overflow-wrap: anywhere; }
  .kept { display: grid; grid-template-columns: minmax(min-content, 1fr) minmax(0, max-content); gap: 16px; }
  .kept > span:first-child { overflow-wrap: break-word; }
  .kept > span:last-child, .crushed > span:last-child { overflow-wrap: anywhere; }
`;
const page = (body) => `<!doctype html><html><head><style>${STYLE}</style></head><body><div class="ui-root">${body}</div></body></html>`;

let browser;
let tab;
before(async () => {
  browser = await chromium.launch({ args: ['--mute-audio'] });
  tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
});
after(async () => { await browser?.close(); });
const check = async (body) => { await tab.setContent(page(body)); return tab.evaluate(brokenWords); };

test('a label crushed by a long value beside it fails', async () => {
  const out = await check('<div class="crushed"><span>Their supplier portal</span><span>Upload it there too, reminder in Needs you</span></div>');
  assert.ok(out.some((l) => /supplier/.test(l)), JSON.stringify(out));
});

test('the label kept at its longest word passes', async () => {
  assert.deepEqual(await check('<div class="kept"><span>Their supplier portal</span><span>Upload it there too, reminder in Needs you</span></div>'), []);
});

test('an email address, a web address and a file name may wrap anywhere', async () => {
  assert.deepEqual(await check('<div class="kept"><span>Sent</span><span>invoices@northfield.example.invalid https://northfield.example.invalid/suppliers/portal evidence-november-2026-northfield.pdf</span></div>'), []);
});

test('hidden text is not read', async () => {
  assert.deepEqual(await check('<div class="crushed" hidden><span>Their supplier portal</span><span>Upload it there too, reminder in Needs you</span></div>'), []);
});
