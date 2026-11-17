// The outside Health Check at the largest text size, twice the standard
// (as tests/phase8/text-size.mjs checks the Visual tools): every screen,
// on a phone (400 by 844) and a laptop (1440), must wrap rather than
// break. Nothing scrolls sideways, on the page or inside the tool; nothing
// that can be read or tapped runs off the side or is cut off; a button's
// words stay inside its pill; no tap area shrinks below 44px, and none
// overlap.
//
//   node tests/healthcheck/text-size.mjs [folder for screenshots]
//   SIZES=400,1440  MODES=light,dark  ONLY=<regex on a screen's name>
//
// The page's two database calls are answered by stand-ins and everything
// else outside localhost is blocked (tests/healthcheck/hc-shared.mjs).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { overlappingTaps } from '../phase5/taps.mjs';
import { STEPS, appPage, signIn } from './hc-shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-text-size');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '400,1440').split(',').map(Number);
const MODES = (process.env.MODES || 'light,dark').split(',');
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const DIALOG = '[role=dialog]:not(.ds-guide)';
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 500)}` : ''}`);
};

const DONE = { complete: true, step: { screen: 'done' } };
const rows = (p) => p.locator('button.hc-prow').first().waitFor();
const begin = (p) => p.getByRole('button', { name: 'Begin the Health Check' }).click();
// [name, the page's options, how to reach the screen, the layer to measure]
const SCREENS = [
  ['welcome', { watched: false }, async () => {}, '.ds-guest'],
  ['welcome once watched', { watched: true }, async () => {}, '.ds-guest'],
  ['email and code', {}, begin, '.ds-guest'],
  ['email and code with its calm line', {}, async (p) => { await begin(p); await p.locator('.hc-wide-btn').click(); await p.locator('.ds-error').waitFor(); }, '.ds-guest'],
  ['return visit', { step: STEPS.objective }, async (p, s) => { await signIn(p, s); await p.locator('.ds-guide-close').click(); await p.getByRole('button', { name: 'Pick up where you left off' }).waitFor(); await sleep(5500); }, '.ds-guest'],
  ...Object.entries(STEPS).map(([k, step]) => [`question: ${k}`, { step }, signIn, '.ds-guide']),
  ['objective with its calm line', { data: {}, step: STEPS.objective }, async (p, s) => { await signIn(p, s); await p.locator('.ds-guide-next').click(); await p.locator('.ds-guide .ds-error').waitFor(); }, '.ds-guide'],
  ['results', DONE, async (p, s) => { await signIn(p, s); await rows(p); }, '.ds-guide'],
  ['example report', {}, async (p) => { await begin(p); await p.getByRole('button', { name: 'See an example report' }).click(); await rows(p); }, '.ds-guest'],
  ['Quick guide panel', DONE, async (p, s) => { await signIn(p, s); await rows(p); await p.locator('.ds-guide-title .ds-play').click(); await p.locator(`${DIALOG} .hc-vcard`).waitFor(); await sleep(600); await p.evaluate(() => document.querySelector('[role=dialog] video')?.pause()); }, DIALOG],
  ['who can see this', { step: STEPS.objective }, async (p, s) => { await signIn(p, s); await p.locator('.ds-guide-question .ds-who:not(.ds-play)').click(); await p.locator(DIALOG).waitFor(); }, DIALOG],
  ['Download PDF panel', DONE, async (p, s) => { await signIn(p, s); await rows(p); await p.locator('.ds-guide-next').click(); await p.locator(DIALOG).waitFor(); }, DIALOG],
  ['a drop-down’s list', { step: STEPS.when }, async (p, s) => { await signIn(p, s); await p.locator('.hc-dates .ds-dd').first().click(); await p.getByRole('option').first().waitFor(); }, '[role=listbox]'],
  ['an explanation in the side panel', { step: STEPS.csf }, async (p, s) => { await signIn(p, s); await p.locator('.hc-flab .ds-guide-i').click(); await p.locator(DIALOG).waitFor(); await sleep(500); }, DIALOG],
];

// Runs in the page: what scrolls sideways, what runs off the side, what is cut off, what is too small to tap.
function measure({ layer }) {
  const root = [...document.querySelectorAll(layer)].filter((e) => e.getBoundingClientRect().width > 0).pop();
  if (!root) return null;
  const scroller = root.querySelector('.ds-guide-scroll, .ds-dialog-body') || root;
  const wide = window.innerWidth;
  const sample = root.querySelector('.ds-guide-question, .ds-guest-question, .hc-lead, .ds-headline, .ds-guest-sub, .ds-option-text, .ds-who-options .ds-answer, .ds-sheet-note, .hc-capbar, .ds-guide-nudge, .ds-explain-line, .ds-explain-meaning');
  const outp = { sideways: Math.max(document.documentElement.scrollWidth - wide, scroller.scrollWidth - scroller.clientWidth, 0), off: [], small: [], size: sample ? getComputedStyle(sample).fontSize : '0', pops: [] };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert], [hidden], .ds-sr, .ds-seg-measure');
  };
  for (const el of root.querySelectorAll('h1, h2, h3, p, b, small, button, a, textarea, input, label, li, [role=option], [role=radio], [role=slider], [role=combobox], .ds-guide-label, .ds-guide-name, .ds-answer, .ds-seg-btn, .hc-ml, .hc-imb-figure, .ds-stepbars-word, .hc-meta span, .ds-startq-label, .hc-factor-level, .hc-vtime, .hc-capbar, .hc-q, .hc-pdate, .hc-pn, .ds-dd-value')) {
    if (!visible(el)) continue;
    // Back's 44px tap area is invisible and may reach past the edge; what shows is its chevron (rule 29t).
    const r = (el.matches('.ds-guide-back') ? el.querySelector('.ds-chevron') : el).getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.textContent || el.className).toString().trim().slice(0, 40);
    // A button's words stay inside its pill.
    if (el.matches('.ds-btn, .ds-seg-btn, .ds-dd')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect();
      if (w.left < r.left - 0.5 || w.right > r.right + 0.5 || w.top < r.top - 0.5 || w.bottom > r.bottom + 0.5) outp.off.push(`${name}: its words run outside it`);
    }
    if (r.left < -0.5 || r.right > wide + 0.5) outp.off.push(`${name} ${r.left.toFixed(0)} to ${r.right.toFixed(0)}`);
    // Words cut off inside their own box.
    const cs = getComputedStyle(el);
    if (el.scrollWidth - el.clientWidth > 1 && cs.overflowX !== 'visible' && !el.matches('textarea, input')) outp.off.push(`${name} is cut off by ${el.scrollWidth - el.clientWidth}px`);
    if (el.scrollHeight - el.clientHeight > 1 && cs.overflowY === 'hidden' && !el.matches('textarea, input')) outp.off.push(`${name} is cut off below by ${el.scrollHeight - el.clientHeight}px`);
    if (el.matches('textarea') && el.scrollHeight - el.clientHeight > 1) outp.off.push(`${name}: the box doesn’t show all of its text`);
    const reach = (ps) => (ps.content !== 'none' && ps.position === 'absolute' ? { w: parseFloat(ps.width) || 0, h: parseFloat(ps.height) || 0 } : { w: 0, h: 0 });
    const a = reach(getComputedStyle(el, '::after'));
    const b = reach(getComputedStyle(el, '::before'));
    const tap = el.getBoundingClientRect();
    const w = Math.max(tap.width, a.w, b.w);
    const h = Math.max(tap.height, a.h, b.h);
    const narrowPlay = el.matches('.ds-title-icons > .ds-play') && h >= 43.5 && w >= 31.5; // 32px wide beside the eye, by design
    if (el.matches('button, a[href], textarea, input, [role=option], [role=radio], [role=slider], [role=combobox]') && !narrowPlay && (w < 43.5 || h < 43.5)) outp.small.push(`${name} ${w.toFixed(1)}x${h.toFixed(1)}`);
  }
  for (const d of root.querySelectorAll('.hc-dot-tap')) { const r = d.getBoundingClientRect(); if (r.width < 43.5 || r.height < 43.5) outp.small.push(`a chart dot ${r.width.toFixed(1)}`); }
  // An open pop-up stays on the screen.
  for (const p of document.querySelectorAll('.ds-infopop, .ds-tip')) {
    const r = p.getBoundingClientRect();
    if (getComputedStyle(p).display === 'none' || r.width === 0) continue;
    if (r.left < -0.5 || r.right > wide + 0.5 || r.top < -0.5) outp.off.push(`a pop-up ${r.left.toFixed(0)} to ${r.right.toFixed(0)}`);
    outp.pops.push(r.width);
  }
  return outp;
}

const browser = await chromium.launch();
try {
  for (const w of SIZES) {
    for (const mode of MODES) {
      for (const [name, opts, reach, layer] of SCREENS) {
        if (ONLY && !ONLY.test(name)) continue;
        const tag = `${name}, twice the text size, ${w} ${mode}`;
        let b = null;
        try {
          b = await appPage(browser, w, mode, { ...opts, textTwice: true });
          await reach(b.page, b.session);
          await b.page.evaluate(() => document.fonts.ready);
          await b.page.mouse.move(2, 2);
          await sleep(700);
          const m = await b.page.evaluate(measure, { layer });
          if (!m) { pass(`${tag}: the screen is there`, false, layer); continue; }
          // Big display text (20px and up) grows by a quarter at most; the rest doubles.
          pass(`${tag}: the text is larger than standard`, parseFloat(m.size) >= 24, m.size);
          pass(`${tag}: no sideways scroll`, m.sideways <= 0, `${m.sideways}px`);
          pass(`${tag}: nothing runs off the side or is cut off`, m.off.length === 0, m.off.slice(0, 6).join(' | '));
          pass(`${tag}: every tap area is still 44px`, m.small.length === 0, m.small.slice(0, 6).join(' | '));
          const overlaps = (await b.page.evaluate(overlappingTaps)).filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
          pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.slice(0, 4).join(' | '));
          pass(`${tag}: no console or page errors`, b.problems.length === 0, b.problems.join(' | '));
          if (mode === MODES[0]) await b.page.screenshot({ path: join(out, `large-text-${w}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: false });
        } catch (error) {
          pass(`${tag}: opened`, false, `${error.message}`.split('\n')[0]);
        }
        if (b) await b.ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
