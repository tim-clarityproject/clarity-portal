// The outside Strategic Alignment Health Check, end to end in a browser
// (the page rebuilt to M7b version 51): every screen and every way through
// it, with what the UI tester measures on each screen.
//
//   node tests/healthcheck/flow.mjs <folder>
//   SIZES=1440,400  MODES=dark,light  ONLY=<regex on a part's name>
//
// Writes <folder>/report.txt, prints only the FAIL lines and the count, and
// exits 1 when anything fails.
//
// The page runs on the dev server. Its two database calls are answered by
// stand-ins, every /api/ call is answered here and everything outside
// localhost is blocked (tests/healthcheck/hc-shared.mjs): nothing is saved,
// no email is sent and no font is added by the test.
//
// The parts: welcome, signin, new (a new Health Check from the first
// question to the results), back, rows, edits, results, keep, return,
// example, guide, panels, old (an old Health Check in old words and shape),
// sizes (one project; 40 projects).
import { checkExplainOpener, explainWords } from '../explain-panel.mjs';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { overlappingTaps } from '../phase5/taps.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { questionsBeforeCharts } from '../phase5/summary-order.mjs';
import { CSF, PR, STEPS, appPage, kestrel, signIn } from './hc-shared.mjs';
import { backChevron, titleIcons } from './hc-measure.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-flow');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const DIALOG = '[role=dialog]:not(.ds-guide)';
const CORAL = 'rgb(255,111,92)';
const DONE = { complete: true, step: { screen: 'done' } };

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};
const note = (text) => results.push(`NOTE  ${text}`);
const figures = new Map(); // measured figures, said once each in the report
const figure = (key, text) => { if (!figures.has(key)) { figures.set(key, text); note(`${key}: ${text}`); } };

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(40);
  }
}
const questionText = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('.ds-guide .ds-guide-question, .ds-guide .ds-guide-title, .ds-guest h1')].pop();
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
});
// A title in capitals reads in capitals: the words are compared whatever their case.
const onQuestion = (page, has, ms = 8000) => until(async () => (await questionText(page)).toLowerCase().includes(has.toLowerCase()), ms);
// The pop-up showing now (each ⓘ keeps its own, hidden until it opens): its lines, a bullet marked "• ".
const popWords = (page) => page.evaluate(() => {
  const p = [...document.querySelectorAll('.ds-infopop')].filter((x) => getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility !== 'hidden' && x.getBoundingClientRect().width > 0).pop();
  if (!p) return null;
  const outp = [];
  const walk = (e) => { for (const c of e.children) { if (c.children.length && !c.matches('li')) walk(c); else if (c.innerText.trim()) outp.push(`${c.matches('li') ? '• ' : ''}${c.innerText.replace(/\s+/g, ' ').trim()}`); } };
  walk(p);
  return outp.length ? outp : [p.innerText.replace(/\s+/g, ' ').trim()];
});
const popIs = (page, want, ms = 4000) => until(async () => JSON.stringify(await popWords(page)) === JSON.stringify(want), ms);
// The guided tool ignores a second press within 400ms of a move.
const pressNext = async (page) => { await sleep(450); await page.locator('.ds-guide-next').click(); await sleep(150); };
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.ds-toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
const hasToast = (page, words, ms = 4000) => until(async () => (await toastText(page)).includes(words), ms);

// ---------------------------------------------------------------- what is measured on every screen (runs in the page)
function facts({ layer }) {
  const root = [...document.querySelectorAll(layer)].filter((e) => e.getBoundingClientRect().width > 0).pop();
  if (!root) return null;
  const o = { small: [], narrowPlay: [], coral: 0 };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert], [hidden], [aria-hidden=true]');
  };
  for (const el of root.querySelectorAll('button, a[href], [role=radio], [role=option], [role=button], [role=slider], [role=combobox], input, textarea')) {
    if (!visible(el)) continue;
    const box = el.matches('.hc-dot') ? el.querySelector('.hc-dot-tap').getBoundingClientRect() : el.getBoundingClientRect();
    // A shared part may reach 44px through its ::before or ::after (a pill in a segmented control).
    const reach = (ps) => (ps.content !== 'none' && ps.position === 'absolute' ? { w: parseFloat(ps.width) || 0, h: parseFloat(ps.height) || 0 } : { w: 0, h: 0 });
    const a = reach(getComputedStyle(el, '::after'));
    const b = reach(getComputedStyle(el, '::before'));
    const w = Math.max(box.width, a.w, b.w);
    const h = Math.max(box.height, a.h, b.h);
    const name = `${(el.getAttribute('aria-label') || el.textContent || el.className.baseVal || el.className || el.tagName).toString().trim().slice(0, 40)} ${w.toFixed(1)}x${h.toFixed(1)}`;
    if (w >= 43.5 && h >= 43.5) continue;
    // The play icon beside the eye: 44px tall, 32px wide, so the two icons are 16px apart and their tap areas never overlap.
    if (el.matches('.ds-title-icons > .ds-play') && h >= 43.5 && w >= 31.5) o.narrowPlay.push(name);
    else o.small.push(name);
  }
  // Coral: anything filled with the coral of the main button (a button, or the round mark inside Watch).
  const rgb = (c) => c.replace(/\s+/g, '');
  for (const el of root.querySelectorAll('*')) {
    if (visible(el) && rgb(getComputedStyle(el).backgroundColor) === 'rgb(255,111,92)' && !(el.parentElement && rgb(getComputedStyle(el.parentElement).backgroundColor) === 'rgb(255,111,92)')) o.coral += 1;
  }
  const scroller = root.querySelector('.ds-guide-scroll, .ds-dialog-body') || root;
  o.sideways = Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, scroller.scrollWidth - scroller.clientWidth, 0);
  return o;
}

async function checkScreen(b, tag, { layer = '.ds-guide', coral = 1, back = false } = {}) {
  const { page } = b;
  await page.mouse.move(2, 2);
  await sleep(500);
  const f = await page.evaluate(facts, { layer });
  if (!f) { pass(`${tag}: the screen is there`, false, layer); return; }
  pass(`${tag}: no sideways scroll`, f.sideways <= 0, `${f.sideways}px`);
  pass(`${tag}: every tap area is 44px each way`, f.small.length === 0, f.small.join(' | '));
  if (f.narrowPlay.length) figure('The play icon’s tap area beside the eye', `${f.narrowPlay[0].replace(/^Quick guide /, '')} (44px tall, 32px wide: the two icons are 16px apart, so two 44px areas would overlap by 12px)`);
  pass(`${tag}: at most one coral button${coral === 0 ? ' (none here)' : ''}`, f.coral <= coral, `found ${f.coral}`);
  // Two chart dots that sit close share part of their 44px tap circles: a chart's marks are where the answers put them.
  const all = await page.evaluate(overlappingTaps);
  const overlaps = all.filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
  if (all.length > overlaps.length) figure(`Chart dots whose tap circles share space (${tag})`, all.filter((o) => !overlaps.includes(o)).join(' | '));
  pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.join(' | '));
  const edges = await page.evaluate(outlinedEdges);
  pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.join(' | '));
  if (back) {
    const c = await backChevron(page, { button: '.ds-guide-back', label: '.ds-guide-name', content: '.ds-guide-pct-track' });
    pass(`${tag}: Back’s chevron has its visible edge on the content’s left edge`, c && Math.abs(c.edge) <= 0.5, JSON.stringify(c));
    pass(`${tag}: the tool’s name is 14px after it`, c && Math.abs(c.gap - 14) <= 0.5, JSON.stringify(c));
    pass(`${tag}: Back’s tap area is 44px`, c && c.tapW >= 44 && c.tapH >= 44, JSON.stringify(c));
    if (c) figure('Back’s chevron on a guided screen', `visible edge ${c.edge.toFixed(2)}px from the content’s left edge, the name ${c.gap.toFixed(2)}px after it (read at two screen pixels a point)`);
  }
}
const noProblems = (b, tag) => {
  pass(`${tag}: no console or page errors`, b.problems.length === 0, b.problems.join(' | '));
  pass(`${tag}: nothing asked of an outside address`, b.session.outside.length === 0, [...new Set(b.session.outside)].join(' | '));
};

// The play icon and the eye beside a title: 12px, then 16px, each on the middle of the capitals.
async function checkIcons(page, tag, head) {
  const m = await titleIcons(page, { heading: head, play: `${head} .ds-play svg`, eye: `${head} .ds-who:not(.ds-play) svg` });
  const said = JSON.stringify(m);
  pass(`${tag}: the play icon is 12px after the title’s last letter (ink to visible edge)`, m && Math.abs(m.gapTitle - 12) <= 0.5, said);
  pass(`${tag}: the eye is 16px after the play icon (visible edge to visible edge)`, m && Math.abs(m.gapPair - 16) <= 0.5, said);
  pass(`${tag}: both icons are centred on the middle of the capitals within 0.5px`, m && Math.abs(m.offPlay) <= 0.5 && Math.abs(m.offEye) <= 0.5, said);
  pass(`${tag}: both icons are 16px`, m && m.sizePlay === '16x16' && m.sizeEye === '16x16', said);
  pass(`${tag}: the eye’s tap area is 44px and the two tap areas don’t overlap`, m && m.tapEye.w >= 44 && m.tapEye.h >= 44 && m.tapPlay.h >= 44 && m.tapsOverlap <= 0, said);
  if (m) figure(`Icons beside the title (${m.font}, ${tag.split(':')[0]})`, `${m.gapTitle.toFixed(2)}px from the last letter’s ink to the play icon, ${m.gapPair.toFixed(2)}px on to the eye; middles ${m.offPlay.toFixed(2)}px and ${m.offEye.toFixed(2)}px from the middle of the capitals; play’s tap area ${m.tapPlay.w}x${m.tapPlay.h}, the eye’s ${m.tapEye.w}x${m.tapEye.h}`);
}

// DM Sans and Nekst, loaded by the page itself.
async function checkFonts(b, tag, parts) {
  const f = await b.page.evaluate(async (list) => {
    await document.fonts.ready;
    const fam = (sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); return el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null; };
    return {
      dm: document.fonts.check('17px "DM Sans"'), nekst: document.fonts.check('12px "Nekst"'),
      loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/["']/g, '')),
      parts: list.map(([name, sel, want]) => [name, fam(sel), want]),
    };
  }, parts);
  pass(`${tag}: DM Sans is loaded by the page`, f.dm && f.loaded.includes('DM Sans'), JSON.stringify(f.loaded));
  pass(`${tag}: Nekst is loaded by the page`, f.nekst && f.loaded.includes('Nekst'), JSON.stringify(f.loaded));
  for (const [name, got, want] of f.parts) pass(`${tag}: ${name} is set in ${want}`, got === want, `${got}`);
  const files = [...new Set(b.session.fonts)];
  const outside = files.filter((u) => !/^https?:\/\/localhost[:/]/.test(u));
  pass(`${tag}: every font file comes from the page’s own address`, outside.length === 0, outside.join(' | '));
  pass(`${tag}: the page asked for DM Sans and Nekst files itself`, files.some((u) => /dm-sans/i.test(u)) && files.some((u) => /nekst/i.test(u)), files.map((u) => u.split('/').pop()).join(', '));
  figure(`Fonts (${tag.split(',')[0]})`, `DM Sans ${f.dm ? 'loaded' : 'NOT loaded'}, Nekst ${f.nekst ? 'loaded' : 'NOT loaded'}; files asked for: ${files.map((u) => u.split('/').pop()).join(', ')}; ${f.parts.map(([n, g]) => `${n}: ${g}`).join('; ')}`);
}

const lum = (rgbText) => {
  const [r, g, bl] = rgbText.match(/[\d.]+/g).slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};
const contrast = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// ---------------------------------------------------------------- the parts
const PARTS = [];
const part = (name, fn) => PARTS.push([name, fn]);

part('welcome', async ({ browser, w, mode, phone, tag }) => {
  let b = await appPage(browser, w, mode, { watched: false });
  const { page } = b;
  await checkScreen(b, `${tag}, welcome`, { layer: '.ds-guest' });
  // Buttons are DM Sans since 18 Nov (Tim's Quiet precision); titles and section names stay Nekst.
  await checkFonts(b, `${tag}, welcome`, [['the title', '.ds-guest-title', 'Nekst'], ['the line under it', '.hc-lead', 'DM Sans'], ['Begin', '.hc-begin .ds-btn', 'DM Sans'], ['the time beside it', '.ds-btn-note-text', 'DM Sans']]);
  const place = () => page.evaluate(() => {
    const btn = document.querySelector('.hc-begin .ds-btn').getBoundingClientRect();
    const n = document.querySelector('.ds-btn-note-text');
    const r = document.createRange(); r.selectNodeContents(n);
    const words = r.getBoundingClientRect();
    const box = n.getBoundingClientRect();
    const begin = document.querySelector('.hc-begin');
    const cs = getComputedStyle(document.querySelector('.hc-begin .ds-btn'));
    return {
      btn: { l: btn.left, r: btn.right, t: btn.top, b: btn.bottom, mid: btn.top + btn.height / 2, cx: btn.left + btn.width / 2, w: btn.width },
      words: { l: words.left, mid: words.top + words.height / 2, cx: words.left + words.width / 2, t: box.top },
      vh: window.innerHeight, vw: window.innerWidth, scrollY: window.scrollY, scrollable: document.documentElement.scrollHeight - window.innerHeight,
      before: begin.previousElementSibling?.className || '', between: [...begin.querySelectorAll('p')].filter((p) => !p.matches('.ds-btn-note-text')).length,
      fill: cs.backgroundColor.replace(/\s+/g, ''), disabled: document.querySelector('.hc-begin .ds-btn').disabled,
      preHidden: ['.hc-vcard--inline .hc-capbar', '.hc-vcard--inline .hc-vcontrols'].every((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; }),
      watch: document.querySelector('.hc-bigplay b')?.innerText,
      stage: (() => { const s = document.querySelector('.hc-vcard--inline .hc-stage').getBoundingClientRect(); return { w: s.width, h: s.height }; })(),
    };
  });
  const checkPlace = (p, when) => {
    if (phone) {
      pass(`${tag}, welcome ${when}: Begin is wholly in view without scrolling`, p.scrollY === 0 && p.btn.t >= 0 && p.btn.b <= p.vh, JSON.stringify(p.btn));
      pass(`${tag}, welcome ${when}: “~15 minutes” is centred under Begin`, Math.abs(p.words.cx - p.btn.cx) <= 0.5, `${p.words.cx} against ${p.btn.cx}`);
      pass(`${tag}, welcome ${when}: “~15 minutes” is 10px below Begin`, Math.abs(p.words.t - p.btn.b - 10) <= 0.5, `${(p.words.t - p.btn.b).toFixed(2)}px`);
      pass(`${tag}, welcome ${when}: Begin runs the full width`, Math.abs(p.btn.w - (p.vw - 32)) <= 0.5, `${p.btn.w}`);
      figure(`Begin on a 400 by 844 phone, ${when}`, `from ${p.btn.t.toFixed(1)}px to ${p.btn.b.toFixed(1)}px of ${p.vh}px, the page scrolled ${p.scrollY}px (${p.scrollable > 0 ? `${p.scrollable}px more below` : 'nothing below the screen'}); “~15 minutes” centred ${(p.words.t - p.btn.b).toFixed(1)}px under it`);
    } else {
      pass(`${tag}, welcome ${when}: “~15 minutes” is 16px to the right of Begin`, Math.abs(p.words.l - p.btn.r - 16) <= 0.5, `${(p.words.l - p.btn.r).toFixed(2)}px`);
      pass(`${tag}, welcome ${when}: “~15 minutes” is level with Begin’s middle`, Math.abs(p.words.mid - p.btn.mid) <= 1, `${(p.words.mid - p.btn.mid).toFixed(2)}px`);
      figure(`“~15 minutes” on a laptop, ${when}`, `${(p.words.l - p.btn.r).toFixed(2)}px to the right of Begin, its middle ${(p.words.mid - p.btn.mid).toFixed(2)}px from the button’s`);
    }
    pass(`${tag}, welcome ${when}: no sentence between the Quick guide and Begin`, /hc-vcard/.test(p.before) && p.between === 0, `${p.before}, ${p.between}`);
  };
  let p = await place();
  checkPlace(p, 'before the guide is watched');
  pass(`${tag}, welcome: the card shows only Watch before it plays`, p.preHidden && /watch this first/i.test(p.watch || ''), JSON.stringify([p.preHidden, p.watch]));
  pass(`${tag}, welcome: Begin is quiet (outlined) until the guide is watched, and never switched off`, p.fill !== CORAL && !p.disabled, p.fill);
  if (phone) pass(`${tag}, welcome: the card is square on a phone`, Math.abs(p.stage.w - p.stage.h) <= 0.5, JSON.stringify(p.stage));
  // Watch: on a phone it opens the panel full screen; on a laptop it plays in the card.
  await page.locator('.hc-bigplay').click();
  if (phone) {
    const open = await until(async () => (await page.locator(`${DIALOG} .hc-vcard`).count()) > 0, 5000);
    pass(`${tag}, welcome: on a phone Watch opens the Quick guide’s panel`, open);
    await sleep(600);
    const d = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, title: document.querySelector(`${sel} h2`)?.innerText }; }, DIALOG);
    pass(`${tag}, welcome: the panel is full screen on a phone`, d.l <= 0.5 && d.t <= 0.5 && d.w >= d.vw - 0.5 && d.h >= d.vh - 0.5 && /quick guide/i.test(d.title || ''), JSON.stringify(d));
    await checkScreen(b, `${tag}, the Quick guide’s panel from Watch`, { layer: DIALOG, coral: 0 });
    await page.locator(`${DIALOG} [aria-label=Close]`).click();
    pass(`${tag}, welcome: Close shuts the panel`, await until(async () => (await page.locator(DIALOG).count()) === 0, 5000));
    p = await place();
    pass(`${tag}, welcome: the page hasn’t grown, and Begin is still in view`, p.scrollY === 0 && p.btn.b <= p.vh, JSON.stringify(p.btn));
  } else {
    const playing = await until(async () => page.evaluate(() => getComputedStyle(document.querySelector('.hc-vcard--inline .hc-capbar')).display !== 'none' && !document.querySelector('.hc-vcard--inline .hc-bigplay')), 5000);
    pass(`${tag}, welcome: on a laptop Watch plays in the card, with its captions and controls`, playing);
    pass(`${tag}, welcome: the card’s slider is “Position in the Quick guide”`, (await page.locator('.hc-vcard--inline [role=slider][aria-label="Position in the Quick guide"]').count()) === 1);
  }
  noProblems(b, `${tag}, welcome`);
  await b.ctx.close();
  // Once the guide has been watched, Begin is the one coral button.
  b = await appPage(browser, w, mode, { watched: true });
  p = await b.page.evaluate(() => ({ fill: getComputedStyle(document.querySelector('.hc-begin .ds-btn')).backgroundColor.replace(/\s+/g, '') }));
  pass(`${tag}, welcome: Begin is coral once the guide has been watched`, p.fill === CORAL, p.fill);
  await checkScreen(b, `${tag}, welcome once watched`, { layer: '.ds-guest' });
  const again = await b.page.evaluate(() => {
    const btn = document.querySelector('.hc-begin .ds-btn').getBoundingClientRect();
    return { t: btn.top, b: btn.bottom, vh: window.innerHeight, scrollY: window.scrollY, w: btn.width };
  });
  if (phone) {
    pass(`${tag}, welcome once watched: Begin is wholly in view without scrolling`, again.scrollY === 0 && again.t >= 0 && again.b <= again.vh, JSON.stringify(again));
    figure('Begin on a 400 by 844 phone, after the guide is watched', `from ${again.t.toFixed(1)}px to ${again.b.toFixed(1)}px of ${again.vh}px, the page scrolled ${again.scrollY}px`);
  }
  await b.page.getByRole('button', { name: 'Begin the Health Check' }).click();
  pass(`${tag}, welcome: Begin opens the email and code screen`, await onQuestion(b.page, 'What’s your email and access code?'));
  await b.page.locator('.hc-back').click();
  pass(`${tag}, email and code: Back returns to the welcome`, await onQuestion(b.page, 'Strategic Alignment Health Check'));
  noProblems(b, `${tag}, welcome once watched`);
  await b.ctx.close();
});

part('signin', async ({ browser, w, mode, tag }) => {
  const b = await appPage(browser, w, mode, { data: {} });
  const { page, session } = b;
  await page.getByRole('button', { name: 'Begin the Health Check' }).click();
  await onQuestion(page, 'What’s your email and access code?');
  await checkScreen(b, `${tag}, email and code`, { layer: '.ds-guest' });
  const m = await page.evaluate(() => {
    const r = (s, n = 0) => { const e = [...document.querySelectorAll(s)][n]; return e ? e.getBoundingClientRect() : null; };
    const sub = r('.ds-guest-sub'); const l1 = r('.ds-guest-field label', 0); const i1 = r('.ds-guest-field input', 0);
    const f2 = r('.ds-guest-field', 1); const i2 = r('.ds-guest-field input', 1); const sent = r('.ds-guest-sentence'); const btn = r('.hc-wide-btn');
    const col = r('form'); const links = [...document.querySelectorAll('.ds-guest-legal .ds-link')].map((e) => { const x = document.createRange(); x.selectNodeContents(e); const q = x.getBoundingClientRect(); const bx = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: bx.top, h: bx.height, w: bx.width, words: e.innerText }; });
    const submit = document.querySelector('.hc-wide-btn');
    return {
      under: l1.top - sub.bottom, between: f2.top - i1.bottom, above: sent.top - i2.bottom, below: btn.top - sent.bottom, wide: btn.width - col.width, links,
      auto: [...document.querySelectorAll('.ds-guest-field input')].map((i) => i.autocomplete), disabled: submit.disabled || submit.getAttribute('aria-disabled') === 'true', opacity: getComputedStyle(submit).opacity,
      eye: document.querySelectorAll('.ds-guest .ds-who').length,
    };
  });
  pass(`${tag}, email and code: 24px under the line to Email`, Math.abs(m.under - 24) <= 0.5, `${m.under.toFixed(2)}`);
  pass(`${tag}, email and code: 12px between the boxes`, Math.abs(m.between - 12) <= 0.5, `${m.between.toFixed(2)}`);
  pass(`${tag}, email and code: the sentence has 28px above it and 18px below`, Math.abs(m.above - 28) <= 0.5 && Math.abs(m.below - 18) <= 0.5, `${m.above.toFixed(2)} and ${m.below.toFixed(2)}`);
  pass(`${tag}, email and code: the button runs the full width`, Math.abs(m.wide) <= 0.5, `${m.wide.toFixed(2)}`);
  const sameRow = m.links.every((l) => Math.abs(l.t - m.links[0].t) < 1);
  const gaps = m.links.slice(1).map((l, i) => (Math.abs(l.t - m.links[i].t) < 1 ? l.l - m.links[i].r : 24));
  pass(`${tag}, email and code: the three links are 24px apart`, m.links.length === 3 && gaps.every((g) => Math.abs(g - 24) <= 0.5), `${JSON.stringify(gaps)}${sameRow ? '' : ' (they wrap onto more than one row)'}`);
  pass(`${tag}, email and code: no eye here (the sentence says who sees the answers)`, m.eye === 0, `${m.eye}`);
  pass(`${tag}, email and code: the boxes have the right autocomplete`, m.auto[0] === 'email' && m.auto[1] === 'one-time-code', JSON.stringify(m.auto));
  pass(`${tag}, email and code: the button is never switched off or greyed`, !m.disabled && m.opacity === '1', JSON.stringify([m.disabled, m.opacity]));
  // Nothing typed: a calm line, the button as it was.
  await page.locator('.hc-wide-btn').click();
  pass(`${tag}, email and code: pressed with nothing typed, a calm line says what to enter`, await until(async () => /Enter your email and the 6-character access code/.test(await page.locator('.ds-error').innerText()), 4000));
  // A wrong code.
  await page.getByLabel('Email').fill(session.email);
  await page.getByLabel('Access code').fill('zzz999');
  pass(`${tag}, email and code: the code is read in capitals`, (await page.getByLabel('Access code').inputValue()) === 'ZZZ999');
  await page.locator('.hc-wide-btn').click();
  await page.mouse.move(2, 2);
  const calm = await until(async () => (await page.locator('.ds-error').count()) > 0 && !/Enter your email/.test(await page.locator('.ds-error').innerText()), 6000);
  const line = calm ? (await page.locator('.ds-error').innerText()).replace(/\s+/g, ' ').trim() : '';
  pass(`${tag}, email and code: a wrong code shows a calm line`, calm && line.length > 10 && !/fail|error|invalid|undefined|\{/i.test(line), line);
  const after = await page.evaluate(() => { const s = document.querySelector('.hc-wide-btn'); return { d: s.disabled || s.getAttribute('aria-disabled') === 'true', o: getComputedStyle(s).opacity, fill: getComputedStyle(s).backgroundColor.replace(/\s+/g, '') }; });
  pass(`${tag}, email and code: the button is still coral and can be pressed`, !after.d && after.o === '1' && after.fill === CORAL, JSON.stringify(after));
  await checkScreen(b, `${tag}, email and code with the calm line`, { layer: '.ds-guest' });
  // The ⓘ: how the answers are kept, two terms, so the side panel (Tim, 16 Nov, 23:31).
  await checkExplainOpener(page, page.locator('.ds-guest-sentence .ds-guide-i'), {
    tag: `${tag}, email and code: the ⓘ on how the answers are kept`, pass, touch: w <= 600,
    words: ['How your answers are kept', 'Saved as you go', 'You can stop and come back with the same email and access code.', 'Kept securely', 'Your answers are kept for 2 years after your last visit.'],
  });
  // A legal link opens the shared reading pop-up.
  await page.locator('.ds-guest-legal a.ds-link').first().click();
  pass(`${tag}, email and code: Privacy Policy opens its pop-up on the page`, await until(async () => (await page.locator(DIALOG).count()) > 0, 5000));
  await page.keyboard.press('Escape');
  await until(async () => (await page.locator(DIALOG).count()) === 0, 4000);
  // The right code opens the first question.
  await page.getByLabel('Access code').fill(session.code);
  await page.locator('.hc-wide-btn').click();
  pass(`${tag}, email and code: the right code opens the first question`, await onQuestion(page, 'What is your team trying to achieve?'));
  noProblems(b, `${tag}, email and code`);
  await b.ctx.close();
});

part('new', async ({ browser, w, mode, tag }) => {
  // A new Health Check: nothing answered yet. Two screen pixels a point, so Back's chevron and the icons read to half a pixel.
  const b = await appPage(browser, w, mode, { data: {}, scale: 2 });
  const { page, session } = b;
  await signIn(page, session);
  pass(`${tag}, new: it opens on the first question`, await onQuestion(page, 'What is your team trying to achieve?'));
  await checkScreen(b, `${tag}, objective`, { back: true });
  await checkIcons(page, `${tag}, the first question`, '.ds-guide-question');
  await checkFonts(b, `${tag}, the first question`, [['the question', '.ds-guide-question', 'DM Sans'], ['the line under it', '.ds-guide-nudge', 'DM Sans'], ['the tool’s name', '.ds-guide-name', 'Nekst'], ['Next', '.ds-guide-next', 'DM Sans'], ['the box', '.ds-guide-body textarea', 'DM Sans']]);
  const notOff = async (what) => {
    await page.mouse.move(2, 2); // the button's own colour, not its hover
    await sleep(350);
    const s = await page.evaluate(() => { const n = document.querySelector('.ds-guide-next'); return { d: n.disabled || n.getAttribute('aria-disabled') === 'true', o: getComputedStyle(n).opacity, fill: getComputedStyle(n).backgroundColor.replace(/\s+/g, '') }; });
    pass(`${tag}, ${what}: Next is never switched off or greyed`, !s.d && s.o === '1' && s.fill === CORAL, JSON.stringify(s));
  };
  const calm = async (what, words) => {
    await notOff(what);
    await pressNext(page);
    pass(`${tag}, ${what}: Next with nothing typed says “${words}”`, await until(async () => (await page.locator('.ds-guide .ds-error').innerText()).replace(/\s+/g, ' ').includes(words), 4000), await page.locator('.ds-guide .ds-error').innerText().catch(() => 'no line'));
    await notOff(`${what}, with the calm line`);
  };
  await calm('objective', 'Type your objective to carry on.');
  await page.locator('.ds-guide-body textarea').fill('Double recurring revenue by 2028');
  pass(`${tag}, objective: the calm line goes once something is typed`, await until(async () => (await page.locator('.ds-guide .ds-error').count()) === 0, 3000));
  await pressNext(page);
  pass(`${tag}, new: Next goes to the Success Factors`, await onQuestion(page, 'How will you achieve your objective?'));
  await checkScreen(b, `${tag}, Success Factors (empty)`, { back: true });
  await calm('Success Factors', 'Add at least one Success Factor to carry on.');
  const typeRows = async (texts) => {
    for (let i = 0; i < texts.length; i += 1) {
      if ((await page.locator('.ds-rowlist .ds-text').count()) <= i) { await page.locator('.ds-rowlist-add').click(); await sleep(150); }
      await page.locator('.ds-rowlist .ds-text').nth(i).fill(texts[i]);
    }
  };
  await typeRows(CSF.slice(0, 2));
  pass(`${tag}, Success Factors: the add button says what it adds, in words only`, (await page.locator('.ds-rowlist-add').innerText()).trim().toLowerCase() === 'add a success factor' && (await page.locator('.ds-rowlist-add svg, .ds-rowlist-add .ds-cross').count()) === 0);
  await checkScreen(b, `${tag}, Success Factors`, { back: true });
  await pressNext(page);
  pass(`${tag}, new: then how much each matters`, await onQuestion(page, 'How much does each Success Factor matter to your objective?'));
  const levels = await page.evaluate(() => [...document.querySelectorAll('.hc-weight')].map((r) => [...r.querySelectorAll('[role=radio]')].map((x) => `${x.innerText.trim()}${x.getAttribute('aria-checked') === 'true' ? '*' : ''}`)));
  pass(`${tag}, weights: each Success Factor starts at Very important, with Critical first`, levels.length === 2 && levels.every((l) => l.join(',') === 'Critical,Very important*,Important'), JSON.stringify(levels));
  await page.locator('.hc-weight').first().getByRole('radio', { name: 'Critical' }).click();
  pass(`${tag}, weights: a level is set with one press`, await until(async () => (await page.locator('.hc-weight').first().getByRole('radio', { name: 'Critical' }).getAttribute('aria-checked')) === 'true', 3000));
  pass(`${tag}, weights: on a ${w <= 600 ? 'phone' : 'laptop'} the three levels are one control`, (await page.locator('.hc-weight .ds-seg-btn').count()) === 6);
  await checkScreen(b, `${tag}, weights`, { back: true });
  await pressNext(page);
  pass(`${tag}, new: then the projects`, await onQuestion(page, 'What is your team working on?'));
  await calm('projects', 'Add at least one project to carry on.');
  await typeRows([PR[0].t, PR[1].t]);
  await checkScreen(b, `${tag}, projects`, { back: true });
  // The ⓘ at the end of the line of help.
  await page.locator('.ds-guide-nudge .ds-guide-i').click();
  pass(`${tag}, projects: the ⓘ says what counts as a project, in one short line`, await popIs(page, ['It’s anything that takes your team’s time, money or people.']), JSON.stringify(await popWords(page)));
  await page.keyboard.press('Escape');
  await pressNext(page);
  // Each project: one Success Factor a screen, the dates, progress, resource.
  const choose = async (index, expectNext, what) => {
    const before = await questionText(page);
    const bar = await page.locator('.ds-guide-foot').count();
    pass(`${tag}, ${what}: no bottom bar on a one-answer question`, bar === 0, `${bar}`);
    await sleep(450);
    const t0 = Date.now();
    await page.locator('.ds-answer').nth(index).click();
    const chosen = await page.locator('.ds-answer').nth(index).getAttribute('aria-checked').catch(() => null);
    const moved = await until(async () => (await questionText(page)) !== before, 4000);
    const took = Date.now() - t0;
    pass(`${tag}, ${what}: the answer shows as chosen, then the next screen follows by itself`, moved && (chosen === 'true' || chosen === null), `chosen ${chosen}, moved ${moved}`);
    pass(`${tag}, ${what}: it moves on ~150ms after the choice`, moved && took >= 120 && took <= 900, `${took}ms`);
    if (moved) figure(`One-answer questions (${what.split(' ')[0]})`, `the next screen was showing ${took}ms after the press (the 150ms wait, then the change)`);
    pass(`${tag}, ${what}: then “${expectNext}”`, await onQuestion(page, expectNext), await questionText(page));
  };
  for (let pi = 0; pi < 2; pi += 1) {
    const name = `“${PR[pi].t}”`;
    for (let fi = 0; fi < 2; fi += 1) {
      pass(`${tag}, new: contribution names the project and the Success Factor`, await onQuestion(page, `How much does ${name} contribute to “${CSF[fi]}”?`), await questionText(page));
      const counter = (await page.locator('.hc-count').innerText()).replace(/\s+/g, ' ');
      pass(`${tag}, contribution: the counters read “Project ${pi + 1} of 2” and “Success Factor ${fi + 1} of 2”`, counter.includes(`Project ${pi + 1} of 2`) && counter.includes(`Success Factor ${fi + 1} of 2`), counter);
      if (pi === 0 && fi === 0) {
        const words = await page.evaluate(() => [...document.querySelectorAll('.ds-answer')].map((a) => a.innerText.replace(/\s+/g, ' ').trim()));
        pass(`${tag}, contribution: four answers, each with its meaning`, words.length === 4 && words[0].startsWith('None It doesn’t move this Success Factor.') && words[3].startsWith('High This Success Factor would be hard to achieve without it.'), JSON.stringify(words));
        await checkScreen(b, `${tag}, contribution`, { back: true, coral: 0 });
      }
      await choose(PR[pi].c[fi], fi === 0 ? `contribute to “${CSF[1]}”` : `When did ${name} start`, `contribution ${pi + 1}.${fi + 1}`);
    }
    if (pi === 0) {
      await checkScreen(b, `${tag}, dates`, { back: true });
      pass(`${tag}, dates: no “Back to results” before the results have been seen`, (await page.getByRole('button', { name: 'Back to results' }).count()) === 0);
      // Started: the shared drop-down; the month list follows today's year.
      await page.locator('.hc-dates .ds-dd').first().click();
      const year = new Date().getFullYear();
      pass(`${tag}, dates: the Started list opens with Not sure, then this year’s and next year’s months`, await until(async () => (await page.getByRole('option', { name: 'Not sure' }).count()) > 0 && (await page.getByRole('option', { name: `Dec ${year + 1}`, exact: true }).count()) > 0, 4000));
      await page.getByRole('option', { name: `Jan ${year}`, exact: true }).click();
      pass(`${tag}, dates: a month is chosen with one press`, await until(async () => (await page.locator('.hc-dates .ds-dd').first().innerText()).includes(`Jan ${year}`), 3000));
      await page.locator('.hc-dates .ds-dd').nth(1).click();
      pass(`${tag}, dates: Due to finish offers “Open-ended, with no agreed finish date”`, await until(async () => (await page.getByRole('option', { name: 'Open-ended, with no agreed finish date' }).count()) > 0, 4000));
      await page.getByRole('option', { name: `Dec ${year + 1}`, exact: true }).click();
      pass(`${tag}, dates: “Add an exact date” shows once Due to finish is a month`, await until(async () => (await page.getByRole('button', { name: 'Add an exact date' }).count()) === 1, 3000));
    }
    await pressNext(page);
    pass(`${tag}, new: then progress`, await onQuestion(page, `How far along is ${name}?`), await questionText(page));
    if (pi === 0) await checkScreen(b, `${tag}, progress`, { back: true, coral: 0 });
    await choose(PR[pi].p - 1, `How much resource does ${name} need?`, `progress ${pi + 1}`);
    if (pi === 0) await checkScreen(b, `${tag}, resource required`, { back: true, coral: 0 });
    await choose(PR[pi].r - 1, pi === 0 ? `How much does “${PR[1].t}” contribute` : 'Strategic Alignment Health Check', pi === 0 ? 'resource 1' : 'resource 2 (the last one goes straight to the results)');
  }
  pass(`${tag}, new: the results show both projects`, await until(async () => (await page.locator('button.hc-prow').count()) === 2, 6000));
  await until(async () => session.emails.includes('complete'), 5000);
  await sleep(1200);
  pass(`${tag}, new: the completion email is asked for once, when the results are first reached`, session.emails.filter((k) => k === 'complete').length === 1, JSON.stringify(session.emails));
  pass(`${tag}, new: the answers were saved as complete`, session.status === 'complete' && session.data?.objective === 'Double recurring revenue by 2028' && session.data?.csfs?.length === 2 && session.data?.projects?.length === 2 && typeof session.data?.completedAt === 'string', JSON.stringify({ status: session.status, saves: session.saves }));
  const saved = session.data?.ratings?.owner?.[session.data?.projects?.[0]?.id];
  pass(`${tag}, new: the first project’s ratings are in the saved answers`, saved && saved.progress === PR[0].p && saved.resource === PR[0].r && Object.values(saved.contrib || {}).join(',') === PR[0].c.slice(0, 2).join(','), JSON.stringify(saved));
  pass(`${tag}, new: the first Success Factor was saved as Critical`, session.data?.csfs?.[0]?.level === 3, JSON.stringify(session.data?.csfs));
  // Going away and back to the results doesn't ask for the email again.
  await sleep(450);
  await page.getByRole('button', { name: 'Edit the objective' }).click();
  await onQuestion(page, 'What is your team trying to achieve?');
  await sleep(450);
  await page.locator('.ds-guide-back').click();
  await onQuestion(page, 'Strategic Alignment Health Check');
  await sleep(1200);
  pass(`${tag}, new: coming back to the results never asks for it again`, session.emails.filter((k) => k === 'complete').length === 1, JSON.stringify(session.emails));
  noProblems(b, `${tag}, new`);
  await b.ctx.close();
});

part('back', async ({ browser, w, mode, tag }) => {
  const p2 = `“${PR[1].t}”`;
  const cases = [
    ['csf', 'What is your team trying to achieve?'],
    ['weight', 'How will you achieve your objective?'],
    ['projects', 'How much does each Success Factor matter'],
    ['contrib', `How much resource does “${PR[0].t}” need?`],
    ['when', `How much does ${p2} contribute to “${CSF[3]}”?`],
    ['progress', `When did ${p2} start`],
    ['resource', `How far along is ${p2}?`],
    ['objective', 'What’s your email and access code?'],
  ];
  for (const [screen, want] of cases) {
    const b = await appPage(browser, w, mode, { step: STEPS[screen] });
    await signIn(b.page, b.session);
    await b.page.locator('.ds-guide-back').click();
    pass(`${tag}, Back on ${screen}: it goes to “${want.slice(0, 50)}”`, await onQuestion(b.page, want), await questionText(b.page));
    if (screen === 'objective') pass(`${tag}, Back on the first question: the email and code screen, not “Welcome back”`, (await b.page.locator('.hc-back').count()) === 1);
    if (screen === 'contrib') {
      // Back keeps the answer.
      pass(`${tag}, Back keeps the answer chosen`, (await b.page.locator('.ds-answer[aria-checked=true]').count()) === 1);
    }
    noProblems(b, `${tag}, Back on ${screen}`);
    await b.ctx.close();
  }
});

part('rows', async ({ browser, w, mode, tag }) => {
  for (const [screen, noun, list] of [['csf', 'Success Factor', CSF], ['projects', 'project', PR.map((p) => p.t)]]) {
    const b = await appPage(browser, w, mode, { step: STEPS[screen] });
    const { page, session } = b;
    await signIn(page, session);
    const values = () => page.evaluate(() => [...document.querySelectorAll('.ds-rowlist .ds-text')].map((t) => t.value));
    const before = await values();
    pass(`${tag}, ${noun}s: each has its own box`, JSON.stringify(before) === JSON.stringify(list), JSON.stringify(before));
    const labels = await page.evaluate(() => [...document.querySelectorAll('.ds-rowlist-remove')].map((x) => x.getAttribute('aria-label')));
    pass(`${tag}, ${noun}s: each row’s remove says which one it removes`, labels.length === list.length && labels.every((l, i) => l === `Remove ${noun} ${i + 1}`), JSON.stringify(labels.slice(0, 2)));
    const saves = session.saves;
    await page.locator('.ds-rowlist-remove').nth(1).click();
    pass(`${tag}, ${noun}s: removing a row says “Deleted” with Undo`, await hasToast(page, 'Deleted') && (await page.locator('.ds-toast-undo').count()) === 1, await toastText(page));
    const gone = await values();
    pass(`${tag}, ${noun}s: the row is gone at once`, gone.length === list.length - 1 && !gone.includes(list[1]), JSON.stringify(gone));
    await until(async () => session.saves > saves, 4000);
    const savedList = (session.data?.[screen === 'csf' ? 'csfs' : 'projects'] || []).map((x) => x.text);
    pass(`${tag}, ${noun}s: and saved without it`, !savedList.includes(list[1]) && savedList.length === list.length - 1, JSON.stringify(savedList));
    await page.locator('.ds-toast-undo').click();
    pass(`${tag}, ${noun}s: Undo puts it back where it was`, await until(async () => JSON.stringify(await values()) === JSON.stringify(list), 4000), JSON.stringify(await values()));
    await sleep(1500);
    const back = session.data;
    const key = screen === 'csf' ? 'csfs' : 'projects';
    const same = JSON.stringify((back?.[key] || []).map((x) => x.text)) === JSON.stringify(list);
    const k = kestrel({ complete: false });
    const ratingsKept = screen === 'csf'
      ? Object.values(back?.ratings?.owner || {}).every((r) => Object.keys(r.contrib || {}).length === CSF.length)
      : JSON.stringify(back?.ratings?.owner?.p1) === JSON.stringify(k.ratings.owner.p1);
    pass(`${tag}, ${noun}s: Undo saves it again with its ratings`, same && ratingsKept, JSON.stringify(back?.ratings?.owner?.p1));
    noProblems(b, `${tag}, ${noun}s`);
    await b.ctx.close();
  }
});

part('edits', async ({ browser, w, mode, tag }) => {
  const b = await appPage(browser, w, mode, DONE);
  const { page, session } = b;
  await signIn(page, session);
  await page.locator('button.hc-prow').first().waitFor();
  const onResults = () => onQuestion(page, 'Strategic Alignment Health Check');
  const nextWords = async () => (await page.locator('.ds-guide-next').innerText()).trim().toLowerCase();
  // The objective.
  await page.getByRole('button', { name: 'Edit the objective' }).click();
  pass(`${tag}, edits: the objective’s Edit opens its question`, await onQuestion(page, 'What is your team trying to achieve?'));
  pass(`${tag}, edits: the button reads “Save my edit”`, (await nextWords()) === 'save my edit', await nextWords());
  await page.locator('.ds-guide-body textarea').fill('Treble recurring revenue by 2029');
  await pressNext(page);
  pass(`${tag}, edits: “Save my edit” goes straight back to the results`, await onResults());
  pass(`${tag}, edits: with “Saved”`, await hasToast(page, 'Saved'), await toastText(page));
  pass(`${tag}, edits: the results show the new objective`, await until(async () => (await page.locator('.hc-objective').innerText()).trim() === 'Treble recurring revenue by 2029', 3000));
  await until(async () => session.data?.objective === 'Treble recurring revenue by 2029', 4000);
  pass(`${tag}, edits: and it is saved`, session.data?.objective === 'Treble recurring revenue by 2029');
  // A blank objective can't be saved: the calm line.
  await sleep(450);
  await page.getByRole('button', { name: 'Edit the objective' }).click();
  await onQuestion(page, 'What is your team trying to achieve?');
  await page.locator('.ds-guide-body textarea').fill('');
  await pressNext(page);
  pass(`${tag}, edits: a blank objective gets the calm line, not a save`, await until(async () => (await page.locator('.ds-guide .ds-error').innerText()).includes('Type your objective to carry on.'), 3000));
  await page.locator('.ds-guide-body textarea').fill('Treble recurring revenue by 2029');
  await pressNext(page);
  await onResults();
  // The Success Factors: Next, then how much each matters, then Save my edit.
  await sleep(450);
  await page.getByRole('button', { name: 'Edit the Success Factors' }).click();
  pass(`${tag}, edits: the Success Factors’ Edit opens their list`, await onQuestion(page, 'How will you achieve your objective?'));
  pass(`${tag}, edits: its button reads “Next”`, (await nextWords()) === 'next', await nextWords());
  await pressNext(page);
  pass(`${tag}, edits: Next goes to how much each matters`, await onQuestion(page, 'How much does each Success Factor matter'));
  pass(`${tag}, edits: where the button reads “Save my edit”`, (await nextWords()) === 'save my edit', await nextWords());
  await page.locator('.hc-weight').nth(3).getByRole('radio', { name: 'Critical' }).click();
  await pressNext(page);
  pass(`${tag}, edits: “Save my edit” goes straight back to the results`, await onResults());
  pass(`${tag}, edits: with “Saved”`, await hasToast(page, 'Saved'), await toastText(page));
  pass(`${tag}, edits: the fourth Success Factor now reads Critical`, await until(async () => (await page.locator('.hc-factor').nth(3).innerText()).includes('Critical'), 3000));
  // The projects: add one, and only its questions are asked.
  await sleep(450);
  await page.getByRole('button', { name: 'Edit the list of projects' }).click();
  pass(`${tag}, edits: the projects’ Edit opens their list`, await onQuestion(page, 'What is your team working on?'));
  await page.locator('.ds-rowlist-add').click();
  await page.locator('.ds-rowlist .ds-text').last().fill('Brand refresh');
  const asked = [];
  await pressNext(page);
  for (let i = 0; i < 12; i += 1) {
    await until(async () => { const t = await questionText(page); return t && t !== asked[asked.length - 1]; }, 4000);
    const t = await questionText(page);
    if (/strategic alignment health check/i.test(t)) break;
    asked.push(t);
    if ((await page.locator('.ds-answer').count()) > 0) { await sleep(450); await page.locator('.ds-answer').nth(2).click(); } else await pressNext(page);
  }
  pass(`${tag}, edits: a project added from the results is asked only its own questions`, asked.length === CSF.length + 3 && asked.every((t) => t.includes('“Brand refresh”')), JSON.stringify(asked.map((t) => t.slice(0, 40))));
  pass(`${tag}, edits: then straight back to the results, with eight projects`, await onResults() && await until(async () => (await page.locator('button.hc-prow').count()) === 8, 4000));
  await until(async () => (session.data?.projects || []).some((p) => p.text === 'Brand refresh'), 4000);
  pass(`${tag}, edits: the new project and its ratings are saved`, (() => { const p = (session.data?.projects || []).find((x) => x.text === 'Brand refresh'); const r = p && session.data.ratings.owner[p.id]; return Boolean(r && r.progress === 3 && r.resource === 3 && Object.keys(r.contrib).length === CSF.length); })());
  await sleep(1200);
  pass(`${tag}, edits: no completion email for a Health Check that was already complete`, !session.emails.includes('complete'), JSON.stringify(session.emails));
  // A project's row opens that project's own questions.
  await sleep(450);
  const first = (await page.locator('button.hc-prow .hc-pt b').first().innerText()).trim();
  await page.locator('button.hc-prow').first().click();
  pass(`${tag}, edits: a project’s row opens that project’s first question`, await onQuestion(page, `How much does “${first}” contribute to “${CSF[0]}”?`), await questionText(page));
  await sleep(450);
  await page.locator('.ds-guide-back').click();
  pass(`${tag}, edits: Back from its first question goes to the results`, await onResults(), await questionText(page));
  await sleep(450);
  await page.locator('button.hc-prow').first().click();
  await onQuestion(page, `“${first}” contribute to “${CSF[0]}”`);
  for (let i = 0; i < CSF.length; i += 1) { await sleep(450); await page.locator('.ds-answer[aria-checked=true]').click(); await until(async () => !(await questionText(page)).includes(`“${CSF[i]}”`), 3000); }
  pass(`${tag}, edits: on through its Success Factors to its dates`, await onQuestion(page, `When did “${first}” start`), await questionText(page));
  pass(`${tag}, edits: the dates screen shows “Back to results”`, (await page.getByRole('button', { name: 'Back to results' }).count()) === 1);
  await checkScreen(b, `${tag}, dates opened from the results`, { back: false });
  await sleep(450);
  await page.getByRole('button', { name: 'Back to results' }).click();
  pass(`${tag}, edits: “Back to results” goes there`, await onResults(), await questionText(page));
  // Through to the end of one project's questions: back to the results, not on to the next project.
  await sleep(450);
  await page.locator('button.hc-prow').first().click();
  for (let i = 0; i < CSF.length; i += 1) { await sleep(450); await page.locator('.ds-answer[aria-checked=true]').click(); await until(async () => !(await questionText(page)).includes(`“${CSF[i]}”`), 3000); }
  await pressNext(page);
  await onQuestion(page, 'How far along');
  await sleep(450); await page.locator('.ds-answer[aria-checked=true]').click();
  await onQuestion(page, 'How much resource');
  await sleep(450); await page.locator('.ds-answer[aria-checked=true]').click();
  pass(`${tag}, edits: its last question goes straight back to the results`, await onResults(), await questionText(page));
  noProblems(b, `${tag}, edits`);
  await b.ctx.close();
});

part('results', async ({ browser, w, mode, phone, tag }) => {
  const b = await appPage(browser, w, mode, { ...DONE, scale: 2 });
  const { page, session } = b;
  await signIn(page, session);
  await page.locator('button.hc-prow').first().waitFor();
  await checkScreen(b, `${tag}, results`, { back: false });
  await checkIcons(page, `${tag}, the results’ title`, '.ds-guide-title');
  await checkFonts(b, `${tag}, results`, [['the title', '.ds-guide-title', 'Nekst'], ['the headline', '.ds-headline', 'DM Sans'], ['a section’s name', '.ds-results-head', 'Nekst'], ['a project’s name', '.hc-pt b', 'DM Sans'], ['Download my PDF', '.ds-guide-next', 'DM Sans'], ['Email my link', '.hc-keep .ds-btn', 'DM Sans']]);
  pass(`${tag}, results: the bold crosshair alone at the top, no Back or Close`, (await page.locator('.ds-guide-top .ds-guest-mark').count()) === 1 && (await page.locator('.ds-guide-back, .ds-guide-close').count()) === 0);
  // The order (rule 29ar).
  const order = await page.evaluate(() => {
    const y = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top : null; };
    return {
      heads: [...document.querySelectorAll('.ds-guide .ds-results-head')].map((h) => h.innerText.replace(/\s+/g, ' ').trim().toLowerCase()),
      headline: y('.ds-headline'), chart: y('.hc-chart'), list: y('.hc-ptab'), objective: y('.hc-objective'), factors: y('.hc-factors'), questions: y('.ds-startqs'), keep: y('.hc-keep'),
    };
  });
  pass(`${tag}, results: the sections are in order`, JSON.stringify(order.heads) === JSON.stringify(['strategic importance against progress', 'projects', 'objective', 'success factors', 'questions to start with', 'keep your results']), JSON.stringify(order.heads));
  pass(`${tag}, results: the headline, the chart, Projects, Objective, Success Factors, Questions to start with, then Keep your results`, order.headline < order.chart && order.chart < order.list && order.list < order.objective && order.objective < order.factors && order.factors < order.questions && order.questions < order.keep, JSON.stringify(order));
  const breaks = await page.evaluate(questionsBeforeCharts);
  pass(`${tag}, results: “Questions to start with” come after every chart`, breaks.length === 0, breaks.join(' | '));
  // The headline: plain text in the text colour, never a figure larger than its sentence.
  const head = await page.evaluate(() => {
    const h = document.querySelector('.ds-headline');
    const cs = getComputedStyle(h);
    const text = getComputedStyle(document.querySelector('.ds-guide')).color;
    return { words: h.innerText.trim(), rest: document.querySelector('.hc-headline-rest')?.innerText.trim(), colour: cs.color, text, kids: h.children.length, size: cs.fontSize, title: getComputedStyle(document.querySelector('.ds-guide-title')).fontSize, font: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
  });
  pass(`${tag}, results: the headline is one sentence`, head.words === '2 of your 5 important projects are moving well.' && head.rest === '1 needs managing, 1 needs attention and 1 is too early to tell.', JSON.stringify([head.words, head.rest]));
  pass(`${tag}, results: the headline is plain text in the text colour, with no figure set larger than its sentence`, head.colour === head.text && head.kids === 0 && parseFloat(head.size) <= 22.01, JSON.stringify(head));
  // The project list.
  const list = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const rgb = (c) => c.replace(/\s+/g, '');
    const rows = [...document.querySelectorAll('button.hc-prow')].map((row) => {
      const cells = [...row.querySelectorAll('.hc-pcell')];
      return {
        name: row.querySelector('.hc-pt b').innerText.trim(), state: row.querySelector('.hc-q').innerText.trim(),
        labels: cells.map((c) => { const l = c.querySelector('.hc-ml'); return vis(l) ? l.innerText.trim() : null; }),
        dates: [...row.querySelectorAll('.hc-pdate')].filter(vis).length,
        bars: cells.slice(1).map((c) => {
          const sb = c.querySelector('.ds-stepbars'); const word = c.querySelector('.ds-stepbars-word');
          const on = [...sb.querySelectorAll('i.ds-stepbars-on')]; const off = [...sb.querySelectorAll('i:not(.ds-stepbars-on)')];
          const br = sb.getBoundingClientRect(); const wr = word.getBoundingClientRect();
          return { on: on.length, onColour: on[0] ? rgb(getComputedStyle(on[0]).backgroundColor) : null, offColour: off[0] ? rgb(getComputedStyle(off[0]).backgroundColor) : null, good: sb.classList.contains('ds-stepbars--good'), word: word.innerText.trim(), wordVisible: vis(word), under: wr.top - br.bottom, beside: wr.left - br.right, h: br.height };
        }),
        imp: (() => { const t = cells[0].querySelector('.hc-imb-track'); const f = cells[0].querySelector('.hc-imb-track i'); return { track: rgb(getComputedStyle(t).backgroundColor), fill: rgb(getComputedStyle(f).backgroundColor), figure: cells[0].querySelector('.hc-imb-figure').innerText.trim(), w: f.getBoundingClientRect().width / t.getBoundingClientRect().width }; })(),
        hidden: [...row.children].every((c) => c.getAttribute('aria-hidden') === 'true'), label: row.getAttribute('aria-label'),
      };
    });
    const headRow = document.querySelector('.hc-prow--head');
    const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--good);color:var(--coral-text)';
    document.querySelector('.ds-guide').appendChild(probe);
    const good = rgb(getComputedStyle(probe).backgroundColor); const coralText = rgb(getComputedStyle(probe).color); probe.remove();
    return { rows, head: headRow ? vis(headRow) : false, headWords: headRow && vis(headRow) ? [...headRow.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : [], good, coralText, page: rgb(getComputedStyle(document.querySelector('.ds-guide')).backgroundColor) };
  });
  pass(`${tag}, results: seven projects, the one most in need of attention first`, list.rows.length === 7 && list.rows[0].name === 'Enterprise sales team' && list.rows[0].state === 'Needs attention', JSON.stringify(list.rows.map((r) => r.name)));
  if (phone) {
    pass(`${tag}, results: on a phone the list has no column headings`, !list.head);
    pass(`${tag}, results: each project shows three labelled lines`, list.rows.every((r) => JSON.stringify(r.labels) === JSON.stringify(['Strategic importance', 'Progress', 'Resource required'])), JSON.stringify(list.rows[0].labels));
    pass(`${tag}, results: each line has its bar and its word beside it`, list.rows.every((r) => r.bars.every((x) => x.wordVisible && x.word && x.beside >= 0 && x.h >= 3) && r.imp.figure.endsWith('%')), JSON.stringify(list.rows[0].bars));
    pass(`${tag}, results: project rows show no dates on a phone`, list.rows.every((r) => r.dates === 0));
  } else {
    pass(`${tag}, results: on a laptop the list has its column headings`, list.head && JSON.stringify(list.headWords) === JSON.stringify(['Project', 'Strategic importance', 'Progress', 'Resource required']), JSON.stringify(list.headWords));
    pass(`${tag}, results: the word shows under each five-step bar`, list.rows.every((r) => r.bars.every((x) => x.wordVisible && x.word && x.under >= 0 && x.under <= 12)), JSON.stringify(list.rows[0].bars));
    pass(`${tag}, results: each project shows its dates`, list.rows[0].dates === 2, `${list.rows[0].dates}`);
  }
  const words = list.rows.map((r) => r.bars.map((x) => x.word).join('/'));
  const want = ['Bad/Very high', 'Embryonic/High', 'Fair/Low', 'Fair/Moderate', 'Good/Moderate', 'Good/High', 'Excellent/Moderate'];
  pass(`${tag}, results: each bar’s word is the answer given`, JSON.stringify([...words].sort()) === JSON.stringify([...want].sort()), JSON.stringify(words));
  const bars = list.rows.flatMap((r) => r.bars);
  const grey = bars.find((x) => !x.good && x.onColour && x.offColour);
  const mint = bars.find((x) => x.good && x.onColour && x.offColour);
  const cGrey = grey ? contrast(grey.onColour, grey.offColour) : 0;
  const cMint = mint ? contrast(mint.onColour, mint.offColour) : 0;
  pass(`${tag}, results: filled steps stand out from empty ones, 3 to 1 or more`, cGrey >= 3 && cMint >= 3, `grey ${cGrey.toFixed(2)}, mint ${cMint.toFixed(2)}`);
  figure(`Step bars, ${mode}${phone ? '' : ''}`, `filled ${grey?.onColour} against empty ${grey?.offColour}: ${cGrey.toFixed(2)} to 1; mint ${mint?.onColour} against empty: ${cMint.toFixed(2)} to 1; empty against the page ${list.page}: ${grey ? contrast(grey.offColour, list.page).toFixed(2) : '?'} to 1`);
  pass(`${tag}, results: Progress is mint at Good or Excellent, and only there`, list.rows.every((r) => { const pr = r.bars[0]; const good = ['Good', 'Excellent'].includes(pr.word); return pr.good === good && (!good || pr.onColour === list.good) && !r.bars[1].good; }), JSON.stringify(list.rows.map((r) => [r.bars[0].word, r.bars[0].good, r.bars[0].onColour])));
  pass(`${tag}, results: no bar in the list is coral`, list.rows.every((r) => [r.imp.fill, ...r.bars.map((x) => x.onColour)].every((c) => c !== CORAL && c !== list.coralText)), JSON.stringify(list.rows[0].imp));
  pass(`${tag}, results: a row is one button a screen reader hears whole`, list.rows.every((r) => r.hidden && /^Edit Project \d, .+\. .+\. Strategic importance \d+%\. Progress “.+”\. Resource required “.+”\.$/.test(r.label)), list.rows[0].label);
  // The chart: every dot's tap circle.
  const dots = await page.evaluate(() => [...document.querySelectorAll('.hc-dot')].map((d) => { const t = d.querySelector('.hc-dot-tap').getBoundingClientRect(); return { n: d.getAttribute('data-n'), w: t.width, h: t.height, drawn: Number(d.querySelector('.hc-dot-tap').getAttribute('r')) * 2 }; }));
  pass(`${tag}, results: seven dots, each with a tap circle of 44px or more on screen`, dots.length === 7 && dots.every((d) => d.w >= 43.5 && d.h >= 43.5), JSON.stringify(dots.slice(0, 2)));
  figure(`Chart dots’ tap circles, ${phone ? 'phone' : 'laptop'}`, `${dots[0]?.w.toFixed(1)}px on screen (${dots[0]?.drawn}px in the drawing)`);
  // The dots' pop-ups: hover (a laptop), tap, keyboard.
  const tipText = () => page.evaluate(() => { const t = [...document.querySelectorAll('.ds-tip')].find((x) => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0); return t ? t.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null; });
  // The number and name, strategic importance, then one more fact (Tim, 16 Nov, 23:31): the rest is in the list.
  const wantTip = ['Project 1', 'Enterprise sales team', '83% strategic importance', 'It’s important and needs attention.'];
  await page.locator('.hc-chart').scrollIntoViewIfNeeded();
  const dot1 = page.locator('.hc-dot[data-n="1"] .hc-dot-mark');
  if (!phone) {
    await dot1.hover();
    pass(`${tag}, results: pointing at a dot shows its pop-up`, await until(async () => JSON.stringify(await tipText()) === JSON.stringify(wantTip), 3000), JSON.stringify(await tipText()));
    await page.mouse.move(2, 2);
    pass(`${tag}, results: and it goes when the pointer leaves`, await until(async () => (await tipText()) === null, 3000));
  }
  if (phone) await dot1.tap(); else await dot1.click();
  pass(`${tag}, results: ${phone ? 'tapping' : 'clicking'} a dot shows its pop-up: the kind first, then the name, then its figures`, await until(async () => JSON.stringify(await tipText()) === JSON.stringify(wantTip), 3000), JSON.stringify(await tipText()));
  const tipBox = await page.evaluate(() => { const t = [...document.querySelectorAll('.ds-tip')].find((x) => getComputedStyle(x).display !== 'none'); const r = t.getBoundingClientRect(); return { l: r.left, r: window.innerWidth - r.right }; });
  pass(`${tag}, results: the pop-up stays 12px inside both screen edges`, tipBox.l >= 11.5 && tipBox.r >= 11.5, JSON.stringify(tipBox));
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  if (phone) await page.locator('.ds-headline').tap({ force: true }).catch(() => {});
  await page.locator('.hc-dot[data-n="5"]').focus();
  pass(`${tag}, results: keyboard focus on a dot shows its pop-up`, await until(async () => ((await tipText()) || [])[0] === 'Project 5', 3000), JSON.stringify(await tipText()));
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur());
  // Every ⓘ's words.
  const info = async (button) => {
    await page.mouse.move(2, 2);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await until(async () => (await popWords(page)) !== null, 3000);
    const lines = await popWords(page);
    await page.keyboard.press('Escape');
    await sleep(200);
    return lines;
  };
  // What the chart's marks mean opens in the side panel from "How to read the chart" under it (Tim, 16 Nov, 23:31).
  const chartInfo = (line) => ['How to read the chart', 'Each dot', 'It’s a project, numbered as in the list below.', 'Bigger dots', 'They show projects that require more resource.', 'Important', `It’s a project above the line you set, which is now ${line}%.`, 'Too early to tell', 'It’s a project at the Embryonic stage.'];
  pass(`${tag}, results: no ⓘ on the chart’s heading`, (await page.locator('.hc-chart-section .ds-results-head .ds-guide-i').count()) === 0);
  await checkExplainOpener(page, page.locator('.hc-chart-section .ds-explain-link'), { tag: `${tag}, results: How to read the chart`, pass, touch: phone, words: chartInfo(50) });
  let got;
  if (!phone) {
    got = await info(page.locator('.hc-prow--head .ds-guide-i'));
    pass(`${tag}, results: the Strategic importance ⓘ is one short line`, JSON.stringify(got) === JSON.stringify(['It’s how much a project helps the Success Factors.']), JSON.stringify(got));
  }
  // The line for important: the chart and the headline follow it.
  const lineY = () => page.evaluate(() => Number(document.querySelector('.hc-chart-lines line').getAttribute('y1')));
  const y50 = await lineY();
  const saves = session.saves;
  const choose = async (dd, option) => {
    await dd.scrollIntoViewIfNeeded();
    await dd.click();
    await page.getByRole('option', { name: option, exact: true }).first().waitFor({ timeout: 4000 });
    await sleep(300);
    await page.getByRole('option', { name: option, exact: true }).first().click();
    await sleep(500);
  };
  const lineOptions = async () => { await page.locator('.hc-ctl .ds-dd').first().click(); await page.getByRole('option').first().waitFor(); const o = await page.evaluate(() => [...document.querySelectorAll('[role=option]')].map((x) => x.innerText.trim())); await page.keyboard.press('Escape'); await sleep(400); return o; };
  const opts = await lineOptions();
  pass(`${tag}, results: “Important means above” offers 30% to 80%, with 50% suggested`, JSON.stringify(opts) === JSON.stringify(['30%', '40%', '50%, suggested', '60%', '70%', '80%']), JSON.stringify(opts));
  await choose(page.locator('.hc-ctl .ds-dd').first(), '70%');
  const y70 = await lineY();
  pass(`${tag}, results: the line drop-down moves the chart’s line`, y70 < y50 - 10, `${y50} to ${y70}`);
  pass(`${tag}, results: and the headline follows it`, await until(async () => (await page.locator('.ds-headline').innerText()).trim() === '1 of your 2 important projects is moving well.', 3000), await page.locator('.ds-headline').innerText());
  await page.locator('.hc-chart-section .ds-explain-link').click();
  await until(async () => (await explainWords(page)) !== null, 3000);
  got = await explainWords(page);
  await page.keyboard.press('Escape');
  await until(async () => (await explainWords(page)) === null, 3000);
  pass(`${tag}, results: How to read the chart gives the line as it is now, 70%`, JSON.stringify(got) === JSON.stringify(chartInfo(70)), JSON.stringify(got));
  await until(async () => session.saves > saves && session.data?.importantLine === 70, 4000);
  pass(`${tag}, results: the line is saved with the answers`, session.data?.importantLine === 70, `${session.data?.importantLine}`);
  pass(`${tag}, results: the place stays on the page when the line is set`, await page.evaluate(() => document.querySelector('.ds-guide-scroll').scrollTop > 0 || document.querySelector('.hc-ctl .ds-dd').getBoundingClientRect().top >= 0));
  await choose(page.locator('.hc-ctl .ds-dd').first(), '50%, suggested');
  pass(`${tag}, results: back at 50% the headline reads as before`, await until(async () => (await page.locator('.ds-headline').innerText()).trim() === '2 of your 5 important projects are moving well.', 3000));
  // Sort by.
  const names = () => page.evaluate(() => [...document.querySelectorAll('button.hc-prow .hc-pt b')].map((x) => x.innerText.trim()));
  const sortDd = page.locator('.hc-projects .hc-ctl .ds-dd');
  await sortDd.click(); await page.getByRole('option').first().waitFor();
  const sorts = await page.evaluate(() => [...document.querySelectorAll('[role=option]')].map((x) => x.innerText.trim()));
  await page.keyboard.press('Escape'); await sleep(400);
  pass(`${tag}, results: Sort by offers its four orders`, JSON.stringify(sorts) === JSON.stringify(['Most in need of attention', 'Strategic importance', 'Progress', 'Resource required']), JSON.stringify(sorts));
  await choose(sortDd, 'Progress');
  let order2 = await names();
  pass(`${tag}, results: Sort by Progress puts the least progress first`, order2[0] === 'Hiring plan for 2027' && order2[6] === 'Data platform', JSON.stringify(order2));
  await choose(sortDd, 'Resource required');
  order2 = await names();
  pass(`${tag}, results: Sort by Resource required puts the most resource first`, order2[0] === 'Enterprise sales team' && order2[6] === 'Pricing review', JSON.stringify(order2));
  const numbers = await page.evaluate(() => [...document.querySelectorAll('button.hc-prow .hc-pn')].map((x) => x.innerText.trim()).join(''));
  pass(`${tag}, results: each project keeps its own number when the list is sorted`, numbers !== '1234567' && numbers.split('').sort().join('') === '1234567', numbers);
  noProblems(b, `${tag}, results`);
  await b.ctx.close();
});

part('keep', async ({ browser, w, mode, tag }) => {
  const b = await appPage(browser, w, mode, DONE);
  const { page, session, ctx } = b;
  // "Create my free account" opens the sign-up page in a new tab: answered here, never loaded.
  const asked = [];
  await ctx.route(/localhost:\d+\/auth\/sign-up/, (route) => { asked.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stand-in</title>' }); });
  await signIn(page, session);
  await page.locator('button.hc-prow').first().waitFor();
  // Download my PDF: Light or Dark, then a download.
  await sleep(300);
  await page.locator('.ds-guide-next').click();
  pass(`${tag}, keep: “Download my PDF” opens “Download PDF”`, await until(async () => /download pdf/i.test(await page.locator(`${DIALOG} h2`).innerText()), 5000));
  const versions = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} .ds-option`)].map((x) => x.innerText.trim()), DIALOG);
  pass(`${tag}, keep: with “Light, for printing” and “Dark, for sharing”`, JSON.stringify(versions) === JSON.stringify(['Light, for printing', 'Dark, for sharing']), JSON.stringify(versions));
  await checkScreen(b, `${tag}, the PDF panel`, { layer: DIALOG, coral: 0 });
  const download = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await page.getByRole('button', { name: 'Light, for printing' }).click();
  const file = await download;
  const fileName = file ? file.suggestedFilename() : '';
  pass(`${tag}, keep: choosing a version starts a download named in words`, /^Health Check, Kestrel Group, .+\.pdf$/.test(fileName), fileName || 'no download');
  if (file) await file.cancel().catch(() => {});
  pass(`${tag}, keep: the panel closes once the PDF is made`, await until(async () => (await page.locator(DIALOG).count()) === 0, 8000));
  await sleep(500);
  await page.locator('.ds-guide-next').click();
  await until(async () => (await page.locator(DIALOG).count()) > 0, 5000);
  const dark = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await page.getByRole('button', { name: 'Dark, for sharing' }).click();
  const darkFile = await dark;
  pass(`${tag}, keep: the dark one ends “(dark).pdf”`, Boolean(darkFile) && /\(dark\)\.pdf$/.test(darkFile.suggestedFilename()), darkFile ? darkFile.suggestedFilename() : 'no download');
  if (darkFile) await darkFile.cancel().catch(() => {});
  await until(async () => (await page.locator(DIALOG).count()) === 0, 8000);
  // Email my link: asked once, and it says so.
  const link = page.getByRole('button', { name: 'Email my link' });
  await link.scrollIntoViewIfNeeded();
  await link.dblclick();
  pass(`${tag}, keep: “Email my link” says it was sent`, await until(async () => /We’ve sent your link to /.test(await page.locator('.hc-keep-note').innerText()), 5000), await page.locator('.hc-keep').innerText().catch(() => ''));
  await sleep(600);
  pass(`${tag}, keep: the server is asked once, for the link`, session.emails.filter((k) => k === 'link').length === 1 && session.emails.every((k) => k === 'link'), JSON.stringify(session.emails));
  // Create my free account.
  const popup = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: 'Create my free account' }).click();
  const tab = await popup;
  await until(async () => asked.length > 0, 5000);
  const url = asked[0] ? new URL(asked[0]) : null;
  pass(`${tag}, keep: “Create my free account” opens the sign-up page in a new tab, with the email filled in`, Boolean(tab) && Boolean(url) && url.pathname === '/auth/sign-up' && url.searchParams.get('email') === session.email, url ? `${url.pathname}?email=${url.searchParams.get('email') === session.email ? 'the same email' : 'another'}` : 'not opened');
  const card = (await page.locator('.ds-calm-card').innerText()).replace(/\s+/g, ' ');
  pass(`${tag}, keep: the offer names The Clarity Portal and says it’s free`, card.includes('Keep all your work in The Clarity Portal, your personal performance tool.') && card.includes('It’s free, and this Health Check moves into it.'), card);
  if (tab) await tab.close().catch(() => {});
  noProblems(b, `${tag}, keep`);
  await b.ctx.close();
});

part('return', async ({ browser, w, mode, tag }) => {
  const b = await appPage(browser, w, mode, { step: STEPS.progress });
  const { page, session, ctx } = b;
  await signIn(page, session);
  const here = `How far along is “${PR[1].t}”?`;
  pass(`${tag}, return: it opens on the step it was left on`, await onQuestion(page, here), await questionText(page));
  // A reload in the same tab opens straight where it was left.
  await page.reload();
  pass(`${tag}, return: a reload in the same tab opens straight there, with no email and code`, await onQuestion(page, here), await questionText(page));
  // Drafts: type, reload, the answers are there.
  await sleep(450);
  for (let i = 0; i < 40; i += 1) { await page.locator('.ds-guide-back').click(); await sleep(450); if ((await questionText(page)).includes('What is your team trying to achieve?')) break; }
  await onQuestion(page, 'What is your team trying to achieve?');
  const saves = session.saves;
  const box = page.locator('.ds-guide-body textarea');
  await box.fill('');
  await box.pressSequentially('Treble revenue by 2030, and keep every client', { delay: 5 });
  await page.reload();
  pass(`${tag}, return: what was typed is still there after a reload at once`, await until(async () => (await page.locator('.ds-guide-body textarea').inputValue().catch(() => '')) === 'Treble revenue by 2030, and keep every client', 8000), await page.locator('.ds-guide-body textarea').inputValue().catch(() => 'no box'));
  await until(async () => session.data?.objective === 'Treble revenue by 2030, and keep every client', 6000);
  pass(`${tag}, return: and it was saved (the saves grow, and the saved answers hold it)`, session.saves > saves && session.data?.objective === 'Treble revenue by 2030, and keep every client', `${saves} to ${session.saves}`);
  // A new tab: Welcome back, and the same email and code carry on.
  const tab = await ctx.newPage();
  const tabProblems = [];
  tab.on('pageerror', (e) => tabProblems.push(e.message));
  await tab.goto(page.url());
  pass(`${tag}, return: a new tab shows “Welcome back”`, await onQuestion(tab, 'Welcome back'), await questionText(tab));
  const sub = (await tab.locator('.ds-guest-sub').innerText()).trim();
  pass(`${tag}, return: with its line and “Pick up where you left off”`, sub === 'Enter the same email and access code to pick up where you left off.' && (await tab.getByRole('button', { name: 'Pick up where you left off' }).count()) === 1 && (await tab.getByRole('button', { name: 'See an example report' }).count()) === 0 && (await tab.locator('.hc-back').count()) === 0, sub);
  pass(`${tag}, return: it names the coach who sent the link`, (await tab.locator('.ds-guest-sentence').innerText()).includes('Only you and Tim will see your answers.'), await tab.locator('.ds-guest-sentence').innerText());
  await tab.getByLabel('Email').fill(session.email);
  await tab.getByLabel('Access code').fill(session.code.toLowerCase());
  await tab.locator('form button[type=submit]').click();
  pass(`${tag}, return: the same email and code carry on at the step it was left on`, await onQuestion(tab, 'What is your team trying to achieve?') && (await tab.locator('.ds-guide-body textarea').inputValue()) === 'Treble revenue by 2030, and keep every client', await questionText(tab));
  pass(`${tag}, return: no page errors in the new tab`, tabProblems.length === 0, tabProblems.join(' | '));
  await tab.close();
  // Close: saves, the return visit's screen, "Saved".
  await page.bringToFront();
  await page.locator('.ds-guide-body textarea').evaluate((t) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
  await page.locator('.ds-guide-body textarea').pressSequentially('.', { delay: 5 });
  const before = session.saves;
  await page.locator('.ds-guide-close').click();
  pass(`${tag}, return: Close goes to “Welcome back”`, await onQuestion(page, 'Welcome back'), await questionText(page));
  pass(`${tag}, return: with “Saved”`, await hasToast(page, 'Saved'), await toastText(page));
  await until(async () => session.saves > before, 4000);
  pass(`${tag}, return: and what was typed just before is saved`, session.saves > before && session.data?.objective === 'Treble revenue by 2030, and keep every client.', session.data?.objective);
  await checkScreen(b, `${tag}, the return visit`, { layer: '.ds-guest' });
  await page.locator('form button[type=submit]').click();
  pass(`${tag}, return: “Pick up where you left off” opens where it was`, await onQuestion(page, 'What is your team trying to achieve?'), await questionText(page));
  noProblems(b, `${tag}, return`);
  await b.ctx.close();
});

part('example', async ({ browser, w, mode, phone, tag }) => {
  const b = await appPage(browser, w, mode, {});
  const { page, session } = b;
  await page.getByRole('button', { name: 'Begin the Health Check' }).click();
  await page.getByRole('button', { name: 'See an example report' }).click();
  pass(`${tag}, example: “See an example report” opens it`, await onQuestion(page, 'Example report') && await until(async () => (await page.locator('button.hc-prow').count()) === 8, 5000));
  await checkScreen(b, `${tag}, example report`, { layer: '.ds-guest' });
  const e = await page.evaluate(() => ({
    edits: [...document.querySelectorAll('.ds-guest .ds-link, .ds-guest button')].filter((x) => /^edit/i.test(x.innerText.trim())).length,
    line: document.querySelectorAll('.ds-guest .hc-chart-section .hc-ctl').length,
    meta: [...document.querySelectorAll('.hc-meta span')].map((x) => x.innerText.trim()),
    intro: [...document.querySelectorAll('.hc-example-intro p')].map((x) => x.innerText.trim()),
    headline: document.querySelector('.ds-headline').innerText.trim(),
    heads: [...document.querySelectorAll('.ds-guest .ds-results-head')].map((h) => h.innerText.replace(/\s+/g, ' ').trim().toLowerCase()),
    label: document.querySelector('button.hc-prow').getAttribute('aria-label'),
    eye: document.querySelectorAll('.ds-guest .ds-who').length,
    reasons: [...document.querySelectorAll('.ds-startq-reason')].map((x) => x.innerText.trim()),
  }));
  pass(`${tag}, example: read only, with no Edit links and no line to set`, e.edits === 0 && e.line === 0 && !/^Edit/.test(e.label), JSON.stringify([e.edits, e.line, e.label.slice(0, 20)]));
  pass(`${tag}, example: Quillmark, its date and its three lines of introduction`, JSON.stringify(e.meta) === JSON.stringify(['Quillmark, leadership team', 'Mon 12 Oct']) && e.intro.length === 3 && e.intro[0] === 'Quillmark is an invented software company, to show what you’ll get.', JSON.stringify([e.meta, e.intro[0]]));
  pass(`${tag}, example: the headline says “their”`, /^\d of their \d important projects (is|are) moving well\.$/.test(e.headline), e.headline);
  pass(`${tag}, example: its questions say “They”`, e.reasons.length > 0 && e.reasons.every((r) => /^They /.test(r) || /^None of them/.test(r)), JSON.stringify(e.reasons));
  pass(`${tag}, example: the same order, ending with Questions to start with`, JSON.stringify(e.heads) === JSON.stringify(['strategic importance against progress', 'projects', 'objective', 'success factors', 'questions to start with']), JSON.stringify(e.heads));
  const breaks = await page.evaluate(questionsBeforeCharts);
  pass(`${tag}, example: “Questions to start with” come after every chart`, breaks.length === 0, breaks.join(' | '));
  if (phone) await page.locator('button.hc-prow').first().tap(); else await page.locator('button.hc-prow').first().click();
  pass(`${tag}, example: pressing a row says “The example can’t be edited.”`, await hasToast(page, 'The example can’t be edited.'), await toastText(page));
  pass(`${tag}, example: and stays on the example`, /example report/i.test(await questionText(page)));
  await page.locator('.hc-back').click();
  pass(`${tag}, example: Back returns to the email and code screen`, await onQuestion(page, 'What’s your email and access code?'), await questionText(page));
  await page.getByRole('button', { name: 'See an example report' }).click();
  await onQuestion(page, 'Example report');
  await page.getByRole('button', { name: 'Start my Health Check' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Start my Health Check' }).click();
  pass(`${tag}, example: “Start my Health Check” goes to the email and code screen`, await onQuestion(page, 'What’s your email and access code?'), await questionText(page));
  pass(`${tag}, example: nothing was saved or sent`, session.saves === 0 && session.emails.length === 0, JSON.stringify([session.saves, session.emails]));
  noProblems(b, `${tag}, example`);
  await b.ctx.close();
});

part('guide', async ({ browser, w, mode, phone, tag }) => {
  const b = await appPage(browser, w, mode, { step: STEPS.objective });
  const { page, session } = b;
  await signIn(page, session);
  pass(`${tag}, guide: no video is asked for before the guide is opened`, (await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\.(mp4|jpg|vtt)$/.test(r.name) || ['video', 'track'].includes(r.initiatorType)).length)) === 0 && (await page.locator('video').count()) === 0);
  if (!phone) {
    await page.locator('.ds-guide-question .ds-play').hover();
    pass(`${tag}, guide: pointing at the play icon shows “Quick guide”`, await popIs(page, ['Quick guide']), JSON.stringify(await popWords(page)));
    await page.mouse.move(2, 2);
  }
  pass(`${tag}, guide: the play icon and the eye show on the first question`, (await page.locator('.ds-guide-question .ds-play').count()) === 1 && (await page.locator('.ds-guide-question .ds-who:not(.ds-play)').count()) === 1);
  await page.locator('.ds-guide-question .ds-play').click();
  pass(`${tag}, guide: the play icon opens the Quick guide’s panel`, await until(async () => (await page.locator(`${DIALOG} .hc-vcard`).count()) === 1, 5000));
  await sleep(700);
  const d = await page.evaluate((sel) => {
    const p = document.querySelector(sel); const r = p.getBoundingClientRect(); const v = p.querySelector('video');
    const cap = p.querySelector('.hc-capbar').getBoundingClientRect(); const stage = p.querySelector('.hc-stage').getBoundingClientRect();
    return {
      w: r.width, h: r.height, l: r.left, vw: window.innerWidth, vh: window.innerHeight, title: p.querySelector('h2').innerText.trim(), src: v.getAttribute('src') || '', track: v.querySelector('track')?.getAttribute('srclang'),
      controls: [...p.querySelectorAll('.hc-vcontrols button')].map((x) => x.getAttribute('aria-label')), slider: p.querySelector('[role=slider]')?.getAttribute('aria-label'), cap: cap.height, ratio: stage.width / stage.height, time: p.querySelector('.hc-vtime').innerText.trim(), big: p.querySelectorAll('.hc-bigplay').length,
    };
  }, DIALOG);
  pass(`${tag}, guide: the panel is ${phone ? 'full screen on a phone' : '780px wide on a laptop'}`, phone ? (d.l <= 0.5 && d.w >= d.vw - 0.5 && d.h >= d.vh - 0.5) : Math.abs(d.w - 780) <= 0.5, JSON.stringify({ w: d.w, h: d.h }));
  pass(`${tag}, guide: it is named “Quick guide” and holds the video for this screen`, /quick guide/i.test(d.title) && new RegExp(`quick-guide-${phone ? 'phone' : 'desktop'}`).test(d.src), d.src.split('/').pop());
  pass(`${tag}, guide: its controls are Play or Pause, Replay, the voice, and the slider “Position in the Quick guide”`, /^(Pause|Play)$/.test(d.controls[0]) && d.controls[1] === 'Replay' && /voice/.test(d.controls[2]) && d.slider === 'Position in the Quick guide', JSON.stringify([d.controls, d.slider]));
  pass(`${tag}, guide: the caption bar is ${phone ? 78 : 56}px or taller, under the picture`, d.cap >= (phone ? 78 : 56) - 0.5, `${d.cap}`);
  pass(`${tag}, guide: the picture is ${phone ? '3 by 5' : '16 by 10'}`, Math.abs(d.ratio - (phone ? 3 / 5 : 16 / 10)) < 0.01, `${d.ratio.toFixed(3)}`);
  pass(`${tag}, guide: captions are in English (UK), and the time reads from 0:00`, d.track === 'en-GB' && /^0:0\d \/ 1:0\d$/.test(d.time), JSON.stringify([d.track, d.time]));
  await checkScreen(b, `${tag}, the Quick guide’s panel`, { layer: DIALOG, coral: 0 });
  // The slider moves with the arrow keys.
  await page.locator(`${DIALOG} [role=slider]`).focus();
  await page.keyboard.press('ArrowRight');
  pass(`${tag}, guide: the slider can be focused and takes the arrow keys`, await page.evaluate((sel) => document.activeElement === document.querySelector(`${sel} [role=slider]`), DIALOG));
  await page.locator(`${DIALOG} [aria-label=Close]`).click();
  pass(`${tag}, guide: Close shuts the panel and stops the video`, await until(async () => (await page.locator(DIALOG).count()) === 0 && (await page.locator('video').count()) === 0, 5000));
  pass(`${tag}, guide: the first question is still there`, (await questionText(page)).includes('What is your team trying to achieve?'));
  // Escape closes it too.
  await sleep(300);
  await page.locator('.ds-guide-question .ds-play').click();
  await until(async () => (await page.locator(`${DIALOG} .hc-vcard`).count()) === 1, 5000);
  await sleep(400);
  await page.keyboard.press('Escape');
  pass(`${tag}, guide: Escape closes it too`, await until(async () => (await page.locator(DIALOG).count()) === 0, 5000));
  noProblems(b, `${tag}, guide`);
  await b.ctx.close();
});

part('panels', async ({ browser, w, mode, tag }) => {
  const b = await appPage(browser, w, mode, { step: STEPS.objective });
  const { page, session } = b;
  await signIn(page, session);
  await page.locator('.ds-guide-question .ds-who:not(.ds-play)').click();
  pass(`${tag}, who: the eye opens “Who can see this?”`, await until(async () => /who can see this\?/i.test(await page.locator(`${DIALOG} h2`).innerText()), 5000));
  // The choices are the side panel's answer rows (Phase 8a follow-up), with the line under them.
  const words = (await page.locator(`${DIALOG} .ds-who-options [role=radio]`).allInnerTexts()).map((t) => t.trim()).join(' ');
  // The guest's choice (Tim, 14 Nov, 09:52): Only you, or You and Tim (chosen), with the line under it.
  const whole = (await page.locator(DIALOG).last().innerText()).replace(/\s+/g, ' ');
  pass(`${tag}, who: it offers Only you or You and Tim, with the line under the choice`, words === 'Only you You and Tim' && whole.includes('Tim sent you the link and will see your results.'), whole);
  const label = await page.locator('.ds-guide-question .ds-who:not(.ds-play)').getAttribute('aria-label');
  pass(`${tag}, who: a screen reader hears who can see it`, /You and Tim/.test(label || ''), label);
  await checkScreen(b, `${tag}, who can see this`, { layer: DIALOG, coral: 0 });
  await page.keyboard.press('Escape');
  pass(`${tag}, who: Escape closes it`, await until(async () => (await page.locator(DIALOG).count()) === 0, 4000));
  // The eye and the play icon show on the first question and the results only.
  await pressNext(page);
  await onQuestion(page, 'How will you achieve your objective?');
  pass(`${tag}, who: no eye or play icon on the later questions`, (await page.locator('.ds-guide-question .ds-who').count()) === 0);
  // The Success Factor ⓘ, word for word, in the side panel (no bullets there).
  await checkExplainOpener(page, page.locator('.hc-flab .ds-guide-i'), {
    tag: `${tag}, the Success Factor ⓘ`, pass, touch: w <= 600,
    words: ['What is a Success Factor?', 'It’s one of the few things that must go right for you to reach your objective.', 'For example, “Win and keep enterprise clients”.', 'It’s not a project or a task', 'For example, “Launch the new CRM”.', 'It’s not a target or a measure', 'For example, “£40m in revenue”.'],
  });
  noProblems(b, `${tag}, panels`);
  await b.ctx.close();
});

part('old', async ({ browser, w, mode, tag }) => {
  // A Health Check saved by the older page: no levels on its factors, the old step names, and the person's own words from then.
  const old = kestrel({ complete: false });
  old.csfs = old.csfs.map(({ id, text }, i) => ({ id, text: i === 0 ? 'Our first Critical Success Factor (CSF): enterprise clients' : text }));
  old.projects = old.projects.map(({ id, text }) => ({ id, text }));
  let b = await appPage(browser, w, mode, { data: old, step: { screen: 'factors' } });
  await signIn(b.page, b.session);
  pass(`${tag}, old: a Health Check left on the old “factors” step opens on the Success Factors`, await onQuestion(b.page, 'How will you achieve your objective?'), await questionText(b.page));
  const first = await b.page.locator('.ds-rowlist .ds-text').first().inputValue();
  pass(`${tag}, old: what the person typed is kept as typed`, first === 'Our first Critical Success Factor (CSF): enterprise clients', first);
  const ui = await b.page.evaluate(() => { const g = document.querySelector('.ds-guide'); return g.innerText.replace(/\s+/g, ' ') + [...g.querySelectorAll('[aria-label]')].map((x) => x.getAttribute('aria-label')).join(' '); });
  pass(`${tag}, old: the page’s own words say Success Factor, never CSF or Critical Success Factor`, /Success Factors/.test(ui) && !/CSF|Critical Success Factor/.test(ui), ui.slice(0, 200));
  await pressNext(b.page);
  await onQuestion(b.page, 'How much does each Success Factor matter');
  const levels = await b.page.evaluate(() => [...document.querySelectorAll('.hc-weight [role=radio][aria-checked=true]')].map((x) => x.innerText.trim()));
  pass(`${tag}, old: factors saved with no level read Very important`, levels.length === 4 && levels.every((l) => l === 'Very important'), JSON.stringify(levels));
  noProblems(b, `${tag}, old (in progress)`);
  await b.ctx.close();
  // Complete, saved with the old "done" step and no completed date in the answers.
  const done = { ...old };
  b = await appPage(browser, w, mode, { data: done, complete: true, step: { screen: 'done', mode: 'review' } });
  b.session.status = 'complete';
  await signIn(b.page, b.session);
  pass(`${tag}, old: a complete one opens on its results`, await onQuestion(b.page, 'Strategic Alignment Health Check') && await until(async () => (await b.page.locator('button.hc-prow').count()) === 7, 6000), await questionText(b.page));
  const r = await b.page.evaluate(() => ({
    heads: [...document.querySelectorAll('.ds-guide .ds-results-head')].map((h) => h.innerText.replace(/\s+/g, ' ').trim().toLowerCase()),
    levels: [...document.querySelectorAll('.hc-factor-level')].map((x) => x.innerText.trim()),
    factor: document.querySelector('.hc-factor p').innerText.trim(),
    all: document.querySelector('.ds-guide').innerText.replace(/\s+/g, ' '),
    dates: [...document.querySelectorAll('.hc-pdate')].filter((x) => x.getBoundingClientRect().width > 0).length,
  }));
  pass(`${tag}, old: its results read in the new words`, r.heads.includes('success factors') && r.heads.includes('projects') && r.levels.every((l) => l === 'Very important') && r.factor === 'Our first Critical Success Factor (CSF): enterprise clients', JSON.stringify([r.heads, r.levels]));
  pass(`${tag}, old: nothing but the person’s own words says CSF`, !/CSF|Critical Success Factor/.test(r.all.split('Our first Critical Success Factor (CSF): enterprise clients').join('')), r.all.slice(0, 120));
  pass(`${tag}, old: projects saved with no dates show none`, r.dates === 0, `${r.dates}`);
  await sleep(1200);
  pass(`${tag}, old: no completion email for one that was complete already`, !b.session.emails.includes('complete'), JSON.stringify(b.session.emails));
  await checkScreen(b, `${tag}, old results`, { back: false });
  noProblems(b, `${tag}, old (complete)`);
  await b.ctx.close();
});

part('sizes', async ({ browser, w, mode, phone, tag }) => {
  // One project.
  const one = kestrel({ projects: ['The only project'] });
  let b = await appPage(browser, w, mode, { data: one, complete: true, step: { screen: 'done' } });
  await signIn(b.page, b.session);
  pass(`${tag}, one project: the results open with its one row and one dot`, await until(async () => (await b.page.locator('button.hc-prow').count()) === 1 && (await b.page.locator('.hc-dot').count()) === 1, 6000));
  const head = (await b.page.locator('.ds-headline').innerText()).trim();
  pass(`${tag}, one project: the headline is a full sentence`, /^(\d of your \d important projects (is|are) moving well\.|None of your important projects is under way yet\.)$/.test(head), head);
  await checkScreen(b, `${tag}, one project`, { back: false });
  noProblems(b, `${tag}, one project`);
  await b.ctx.close();
  // Forty projects, long names among them.
  const many = kestrel({ projects: Array.from({ length: 40 }, (_, i) => (i % 7 === 3 ? `Project ${i + 1}: a long name that has to wrap onto another line rather than squash the columns beside it` : `Project ${i + 1}`)) });
  b = await appPage(browser, w, mode, { data: many, complete: true, step: { screen: 'done' } });
  await signIn(b.page, b.session);
  pass(`${tag}, 40 projects: the results list all forty, with forty dots`, await until(async () => (await b.page.locator('button.hc-prow').count()) === 40 && (await b.page.locator('.hc-dot').count()) === 40, 8000), `${await b.page.locator('button.hc-prow').count()} rows`);
  await sleep(500);
  const m = await b.page.evaluate(() => {
    const sc = document.querySelector('.ds-guide-scroll');
    const svg = document.querySelector('.hc-chart svg').getBoundingClientRect();
    const outside = [...document.querySelectorAll('.hc-dot-mark')].filter((d) => { const r = d.getBoundingClientRect(); return r.left < svg.left - 0.5 || r.right > svg.right + 0.5 || r.top < svg.top - 0.5 || r.bottom > svg.bottom + 0.5; }).length;
    const off = [...document.querySelectorAll('button.hc-prow, button.hc-prow *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5); }).length;
    const squashed = [...document.querySelectorAll('.ds-stepbars')].filter((s) => s.getBoundingClientRect().width < 40).length;
    return { sideways: Math.max(document.documentElement.scrollWidth - window.innerWidth, sc.scrollWidth - sc.clientWidth, 0), outside, off, squashed, taps: [...document.querySelectorAll('.hc-dot-tap')].filter((t) => t.getBoundingClientRect().width < 43.5).length };
  });
  pass(`${tag}, 40 projects: no sideways scroll${phone ? ' on a phone' : ''}`, m.sideways === 0 && m.off === 0, JSON.stringify(m));
  pass(`${tag}, 40 projects: every dot is inside the drawing, each with its 44px tap circle`, m.outside === 0 && m.taps === 0, JSON.stringify(m));
  pass(`${tag}, 40 projects: no bar is squashed by a long name`, m.squashed === 0, `${m.squashed}`);
  noProblems(b, `${tag}, 40 projects`);
  await b.ctx.close();
});

// ---------------------------------------------------------------- the run
const browser = await chromium.launch();
try {
  for (const w of SIZES) {
    for (const mode of MODES) {
      const phone = w <= 600;
      const tag = `${w} ${mode}`;
      for (const [name, fn] of PARTS) {
        if (ONLY && !ONLY.test(name)) continue;
        const before = browser.contexts().length;
        try {
          await fn({ browser, w, mode, phone, tag });
        } catch (error) {
          pass(`${tag}, ${name}: ran to its end`, false, `${error.message}`.split('\n')[0]);
        }
        // A part that stopped early leaves nothing open behind it.
        for (const c of browser.contexts().slice(before)) await c.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed, ${results.filter((r) => r.startsWith('NOTE')).length} notes. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
