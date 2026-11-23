// The centring check (tests/signin/centring.mjs; sign-in rule 49) on
// fixtures: Tim's four faults of 23 Nov fail it, and their fixed forms pass.
// Plain pages in a muted browser: nothing is opened but these fixtures.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { centredGroups, centringProblems } from './centring.mjs';

let browser;
let page;
before(async () => {
  browser = await chromium.launch();
  page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
});
after(async () => { await browser?.close(); });

const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#000"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5H6.5A2 2 0 0 0 4.5 6.5V13.5A2 2 0 0 0 6.5 15.5H8.5"/></svg>';
const CPY = `<button class="cpy" aria-label="Copy">${ICON}</button>`;
// The copy icon's drawing is 15 of its 24 units: (11.25 - 44) / 2 off its outer side.
const TRIM = 'margin-inline-end:-16.375px';
const TICK = '<button class="tick" role="checkbox" aria-checked="false"><span></span></button>';
const page0 = (body) => `<!doctype html><html><head><style>
  body { margin: 0; font: 16px/1.55 Arial, sans-serif; background: #fff; color: #000; }
  .col { width: 358px; margin: 0 auto; text-align: center; }
  .col > * { margin: 18px 0 0; }
  .cpy { all: unset; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .row { display: flex; align-items: center; justify-content: center; gap: 20px; }
  .kv { display: inline-flex; align-items: center; gap: 2px; }
  .keyrow { display: flex; flex-direction: column; align-items: center; }
  .rc { list-style: none; padding: 20px 22px; border: 1px solid #888; border-radius: 14px; display: grid; gap: 14px 24px; text-align: left; letter-spacing: 0.06em; }
  .tick { all: unset; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; }
  .tick > span { width: 18px; height: 18px; box-sizing: border-box; border: 1.5px solid #555; border-radius: 5px; }
  .terms { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 4px; margin-left: -13px; width: calc(100% + 13px); text-align: left; }
  .terms.centred { grid-template-columns: 44px minmax(0, max-content); justify-content: center; }
  .steps { list-style: none; padding: 0; counter-reset: s; text-align: left; }
  .steps > li { counter-increment: s; position: relative; padding: 14px 0 14px 32px; }
  .steps > li::before { content: counter(s); position: absolute; left: 0; }
  .field { text-align: left; }
  .field label { display: block; }
  .field input { display: block; width: 100%; box-sizing: border-box; height: 56px; border: 1px solid #777; font-size: 16px; }
  .btn { display: block; width: 100%; height: 44px; border: 0; background: #ff6f5c; font: inherit; }
</style></head><body><div class="col">${body}</div></body></html>`;

const check = async (body) => {
  await page.setContent(page0(body));
  return centringProblems(await page.evaluate(centredGroups, { root: '.col' }));
};
const CODES = ['k7q2-9fmd', 'x3pv-7hzc', 'mw4n-2rtb', 'd8sj-6yqe', 'h2fa-p9ku', 'r5ct-w3gn', 'v9eb-4mxs', 'q6zd-8kfa', 'n3hy-5tpw', 'b7gu-2cvr'];
const codes = (cols) => `<ol class="rc" style="grid-template-columns:${cols}">${CODES.map((c) => `<li>${c}</li>`).join('')}</ol>`;

test('fault 1: the recovery codes left of centre in their box fail; centred, they pass', async () => {
  const bad = await check(codes('1fr 1fr'));
  assert.ok(bad.some((p) => /ol\.rc.*inside on the left/.test(p)), bad.join('\n'));
  assert.deepEqual(await check(codes('repeat(2, minmax(0, max-content)); justify-content: center')), []);
});

test('fault 2: Download and the key centred without their copy icon fail; as one group, they pass', async () => {
  const bad = await check(`<div class="row"><a href="#">Download</a>${CPY}</div>`);
  assert.ok(bad.some((p) => /div\.row “Download”/.test(p)), bad.join('\n'));
  assert.deepEqual(await check(`<div class="row"><a href="#">Download</a>${CPY.replace('class="cpy"', `class="cpy" style="${TRIM}"`)}</div>`), []);
  const badKey = await check(`<div class="keyrow"><span>Can’t scan it? Type this key instead:</span><span class="kv"><strong>JBSW Y3DP EHPK 3PXP</strong>${CPY}</span></div>`);
  assert.ok(badKey.some((p) => /span\.kv/.test(p)), badKey.join('\n'));
  assert.deepEqual(await check(`<div class="keyrow"><span>Can’t scan it? Type this key instead:</span><span class="kv"><strong>JBSW Y3DP EHPK 3PXP</strong>${CPY.replace('class="cpy"', `class="cpy" style="${TRIM}"`)}</span></div>`), []);
});

test('fault 3: the tick box and its words on the left fail; centred as one group, they pass', async () => {
  const bad = await check(`<div class="terms">${TICK}<span>I’ve saved them somewhere safe.</span></div>`);
  assert.ok(bad.some((p) => /div\.terms/.test(p)), bad.join('\n'));
  assert.deepEqual(await check(`<div class="terms centred">${TICK}<span>I’ve saved them somewhere safe.</span></div>`), []);
  // A form's tick row, marked as the page's left alignment, is passed by.
  assert.deepEqual(await check(`<div class="terms" data-align="start">${TICK}<span>I’m 18 or over and I agree to the terms.</span></div>`), []);
});

test('fault 4: on set-up the numbered steps and the Code box stay left; every other row is centred', async () => {
  const page4 = (extra = '') => `<p>Use an authenticator app on your phone.</p>
    <ol class="steps"><li>Get an authenticator app</li><li>Scan this code</li></ol>
    <div class="keyrow"><span>Can’t scan it? Type this key instead:</span><span class="kv"><strong>JBSW Y3DP</strong>${CPY.replace('class="cpy"', `class="cpy" style="${TRIM}"`)}</span></div>
    <div class="field"><label for="c">Code</label><input id="c"></div>${extra}
    <button class="btn">Turn it on</button>`;
  assert.deepEqual(await check(page4()), []);
  const bad = await check(page4('<p style="text-align:left">Enter the 6-digit code it shows.</p>'));
  assert.ok(bad.some((p) => /Enter the 6-digit code/.test(p)), bad.join('\n'));
  // A plain list (not numbered) is a row like any other.
  const plain = await check('<ul style="list-style:none;padding:0;text-align:left"><li>Google Authenticator</li></ul>');
  assert.ok(plain.length === 1, plain.join('\n'));
});

test('a box whose words fill it beside an icon keeps equal padding; a filled box hugging the left fails', async () => {
  const msg = (attrs) => `<div style="display:flex;gap:10px;padding:12px 16px;background:#fde;text-align:left"><b>!</b><span ${attrs}>Tick the box to carry on.</span></div>`;
  assert.deepEqual(await check(msg('data-align="start" style="flex:1"')), []);
  assert.ok((await check(msg(''))).some((p) => /inside on the left/.test(p)));
});

test('a left-aligned page: every row starts on the column’s left edge, and a note under its button is centred on it', async () => {
  const left = (body) => `<div class="col" data-align="start" style="text-align:left">${body}</div>`;
  await page.setContent(page0(left(`<p>Your password is saved.</p><div style="display:flex;flex-direction:column;align-items:stretch"><button class="btn">Save my new password</button><span style="align-self:center">Saved</span></div>`)).replace('<div class="col">', '<div>'));
  assert.deepEqual(centringProblems(await page.evaluate(centredGroups, { root: '.col' })), []);
  await page.setContent(page0(left('<p style="text-align:center">Your password is saved.</p>')).replace('<div class="col">', '<div>'));
  assert.equal(centringProblems(await page.evaluate(centredGroups, { root: '.col' })).length, 1);
});
