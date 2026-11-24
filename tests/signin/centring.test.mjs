// The alignment check (tests/signin/centring.mjs; sign-in rule 49, one left
// edge, Tim, 23 Nov 2026, 17:40) on fixtures: a centred title above a
// left-aligned form fails, and so does every row off the column's left edge
// on a form or list page; on a short message page every row is centred as a
// group, and a message page that holds a form or a list fails. Tim's four
// faults of the morning (the recovery codes, the copy icons, the tick box,
// set-up's rows) are kept, each in its form under the new rule.
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
  .col[data-align="start"] { text-align: left; }
  .col .back { all: unset; display: flex; align-items: center; gap: 4.5px; width: max-content; min-height: 44px; margin-left: -5px; }
  .ds-chevron { display: inline-block; width: 16px; height: 16px; background: #000; transform: rotate(90deg); --chev-left-inset: 5px; --chev-right-inset: 5.5px; }
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

const check = async (body, align = 'centre') => {
  await page.setContent(page0(body).replace('<div class="col">', `<div class="col" data-align="${align}">`));
  return centringProblems(await page.evaluate(centredGroups, { root: '.col' }));
};
const start = (body) => check(body, 'start');
const CODES = ['k7q2-9fmd', 'x3pv-7hzc', 'mw4n-2rtb', 'd8sj-6yqe', 'h2fa-p9ku', 'r5ct-w3gn', 'v9eb-4mxs', 'q6zd-8kfa', 'n3hy-5tpw', 'b7gu-2cvr'];
const codes = (style) => `<ol class="rc" style="${style}">${CODES.map((c) => `<li>${c}</li>`).join('')}</ol>`;
const MARK = '<div class="mark"><svg viewBox="0 0 32 32" width="32" height="32"><path d="M0 16H32M16 0V32" stroke="#000" stroke-width="3"/></svg></div>';
const FIELD = '<div class="field"><label for="e">Email</label><input id="e"></div>';
const TITLE = '<h1 style="font-size:20px;letter-spacing:0.12em;text-transform:uppercase">Sign in</h1>';
const BACK = '<a class="back" href="#"><span class="ds-chevron ds-chevron--left"></span><span>Back to sign in</span></a>';

test('a centred title above a left-aligned form fails; the same page on one left edge passes', async () => {
  const mixed = await start(`<div style="text-align:center">${MARK}${TITLE}</div>${FIELD}<button class="btn">Sign in</button>`);
  assert.ok(mixed.some((p) => /Sign in/.test(p)) && mixed.length >= 1, mixed.join('\n'));
  assert.deepEqual(await start(`${MARK}${TITLE}${FIELD}<button class="btn">Sign in</button><p>New here? <a href="#">Create an account</a></p>`), []);
  // A link line left centred under the button is off the edge too.
  const link = await start(`${TITLE}${FIELD}<button class="btn">Sign in</button><p style="text-align:center">New here? <a href="#">Create an account</a></p>`);
  assert.ok(link.some((p) => /New here/.test(p)), link.join('\n'));
  // The same form centred is the mix the rule forbids, whatever its rows do.
  const centred = await check(`${MARK}${TITLE}${FIELD}<button class="btn">Sign in</button>`);
  assert.ok(centred.some((p) => /holds a box/.test(p)), centred.join('\n'));
});

test('Back sits on the same left edge: its chevron’s visible edge, not its square', async () => {
  assert.deepEqual(await start(`${BACK}${TITLE}${FIELD}`), []);
  // Its square on the edge puts the chevron's visible edge 5px in: that fails.
  const off = await start(`${BACK.replace('class="back"', 'class="back" style="margin-left:0"')}${TITLE}${FIELD}`);
  assert.ok(off.some((p) => /a\.back/.test(p)), off.join('\n'));
});

test('fault 1: the recovery codes stay two columns, starting on the left edge; a list held in the middle fails', async () => {
  const box = 'display:grid;grid-template-columns:1fr 1fr;padding:20px 22px;';
  assert.deepEqual(await start(codes(box)), []);
  const narrow = await start(codes(`${box}width:240px;margin:18px auto 0`));
  assert.ok(narrow.some((p) => /ol\.rc/.test(p)), narrow.join('\n'));
  // And a list is never on a centred message page.
  assert.ok((await check(codes(box))).some((p) => /holds a box, a tick box or a list/.test(p)));
});

test('fault 2: the key and Download keep their copy icon beside them, on the left edge; on a message page the group is centred with its icon', async () => {
  assert.deepEqual(await start(`<div class="keyrow" style="align-items:flex-start"><span>Can’t scan it? Type this key instead:</span><span class="kv"><strong>JBSW Y3DP EHPK 3PXP</strong>${CPY}</span></div>`), []);
  assert.deepEqual(await start(`<div class="row" style="justify-content:flex-start"><a href="#">Download</a>${CPY}</div>`), []);
  const bad = await start(`<div class="row"><a href="#">Download</a>${CPY}</div>`);
  assert.ok(bad.some((p) => /div\.row “Download”/.test(p)), bad.join('\n'));
  // The group measure itself, on a centred page: the icon's drawing, not its tap area.
  const badGroup = await check(`<div class="row"><a href="#">Download</a>${CPY}</div>`);
  assert.ok(badGroup.some((p) => /div\.row “Download”/.test(p)), badGroup.join('\n'));
  assert.deepEqual(await check(`<div class="row"><a href="#">Download</a>${CPY.replace('class="cpy"', `class="cpy" style="${TRIM}"`)}</div>`), []);
});

test('fault 3: the tick box lines up with the left edge, its box and not its tap area; centred as a group it fails', async () => {
  assert.deepEqual(await start(`<div class="terms">${TICK}<span>I’ve saved them somewhere safe.</span></div>`), []);
  const bad = await start(`<div class="terms centred">${TICK}<span>I’ve saved them somewhere safe.</span></div>`);
  assert.ok(bad.some((p) => /div\.terms/.test(p)), bad.join('\n'));
  // A tick box makes the page a form: never a centred message page.
  assert.ok((await check(`<div class="terms centred">${TICK}<span>I’ve saved them somewhere safe.</span></div>`)).some((p) => /holds a box, a tick box or a list/.test(p)));
});

test('fault 4: set-up on one left edge (steps, the QR code, the key, the Code box) passes; one centred row fails', async () => {
  const page4 = (extra = '') => `${MARK}${TITLE}<p>Use an authenticator app on your phone.</p>
    <ol class="steps"><li>Get an authenticator app</li><li>Scan this code</li></ol>
    <div style="display:flex"><svg width="168" height="168" viewBox="0 0 10 10"><rect width="10" height="10" fill="#eee"/></svg></div>
    <div class="keyrow" style="align-items:flex-start"><span>Can’t scan it? Type this key instead:</span><span class="kv"><strong>JBSW Y3DP</strong>${CPY}</span></div>
    ${FIELD}${extra}
    <button class="btn">Turn it on</button>`;
  assert.deepEqual(await start(page4()), []);
  const bad = await start(page4('<p style="text-align:center">Enter the 6-digit code it shows.</p>'));
  assert.ok(bad.some((p) => /Enter the 6-digit code/.test(p)), bad.join('\n'));
  // The number is the step's left edge: steps set in from it fail.
  const steps = await start('<ol class="steps" style="margin-left:24px"><li>Get an authenticator app</li><li>Scan this code</li></ol>');
  assert.ok(steps.length >= 1, steps.join('\n'));
});

test('a short message page is centred throughout: a left-aligned line on it fails', async () => {
  const msg = (extra = '') => `${MARK}<h1 style="letter-spacing:0.12em;padding-left:0.12em;text-transform:uppercase">Check your email</h1><p>We’ve sent a link to sam@example.invalid.</p>${extra}<p>Didn’t get it? <a href="#">Send it again</a></p>`;
  assert.deepEqual(await check(msg()), []);
  const bad = await check(msg('<p style="text-align:left">The link works for 1 hour.</p>'));
  assert.ok(bad.some((p) => /The link works/.test(p)), bad.join('\n'));
});

test('a message box whose words fill it beside an icon keeps equal padding; a filled box hugging the left fails', async () => {
  const msg = (attrs) => `<div style="display:flex;gap:10px;padding:12px 16px;background:#fde;text-align:left"><b>!</b><span ${attrs}>Tick the box to carry on.</span></div>`;
  assert.deepEqual(await check(msg('data-align="start" style="flex:1"')), []);
  assert.ok((await check(msg(''))).some((p) => /inside on the left/.test(p)));
  // On a form page the box sits on the edge and its words start at its own padding: nothing more is asked.
  assert.deepEqual(await start(msg('')), []);
});

test('a left-aligned page: every row starts on the column’s left edge, and a note under its button is centred on it', async () => {
  const left = (body) => `<div class="col" data-align="start" style="text-align:left">${body}</div>`;
  await page.setContent(page0(left(`<p>Your password is saved.</p><div style="display:flex;flex-direction:column;align-items:stretch"><button class="btn">Save my new password</button><span style="align-self:center">Saved</span></div>`)).replace('<div class="col">', '<div>'));
  assert.deepEqual(centringProblems(await page.evaluate(centredGroups, { root: '.col' })), []);
  await page.setContent(page0(left('<p style="text-align:center">Your password is saved.</p>')).replace('<div class="col">', '<div>'));
  assert.equal(centringProblems(await page.evaluate(centredGroups, { root: '.col' })).length, 1);
});

test('a part outside the column on its edge (the crosshair in the bar above) is held to the same edge', async () => {
  await page.setContent(page0('<p>Strategic Alignment Health Check</p>').replace('<div class="col">', `<div class="top" style="width:358px;margin:0 auto;display:flex;justify-content:center">${MARK}</div><div class="col" data-align="start">`));
  assert.equal(centringProblems(await page.evaluate(centredGroups, { root: '.col', also: '.top .mark' })).length, 1);
  await page.setContent(page0('<p>Strategic Alignment Health Check</p>').replace('<div class="col">', `<div class="top" style="width:358px;margin:0 auto;display:flex">${MARK}</div><div class="col" data-align="start">`));
  assert.deepEqual(centringProblems(await page.evaluate(centredGroups, { root: '.col', also: '.top .mark' })), []);
});
