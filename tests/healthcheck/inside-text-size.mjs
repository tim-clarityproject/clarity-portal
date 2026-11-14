// The Health Check inside the portal at twice the standard text size (the
// device's text-size setting; CLAUDE.md "Text size follows the device"):
// every screen at 1440 and 400, dark: nothing runs off the side, no words
// spill out of their button, no two tap areas overlap (chart dots that sit
// close excepted, as everywhere), and the title keeps its icons on a line
// with its last word.
//
//   node tests/healthcheck/inside-text-size.mjs [folder for screenshots]
//
// Signed in as the test client, with M7's teams answered by the stand-in
// (tests/healthcheck/inside-shared.mjs): nothing is saved or sent.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { overlappingTaps } from '../phase5/taps.mjs';
import { APP, BASE, IDS, insidePage, m7Rows, sleep } from './inside-shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-inside-text');
mkdirSync(out, { recursive: true });
const LT = '7a000000-0000-4000-8000-00000000a001';
const SCREENS = [
  ['teams', BASE, '.ds-page-title'],
  ['results', `${BASE}/version/${IDS.lt3}`, '.ds-headline'],
  ['compare', `${BASE}/compare?team=${LT}&a=${IDS.lt2}&b=${IDS.lt3}`, '.ds-headline'],
  ['example', `${BASE}/example`, '.ds-headline'],
  ['new version', `${BASE}/new?team=${LT}`, '.ds-guide-question'],
  ['new team', `${BASE}/new-team`, '.ds-guide-question'],
];
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => { if (!ok) failures += 1; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`); };

function facts() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const spill = [...document.querySelectorAll('.ds-btn')].filter(vis).filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.innerText.trim().slice(0, 30));
  const icons = [...document.querySelectorAll('.ds-title-icons')].filter(vis).map((t) => {
    const r = t.getBoundingClientRect();
    const h = t.closest('h1, h2, .ds-guide-question, .ds-page-title');
    const words = h ? [...h.childNodes].filter((n) => n.nodeType === 3 || !n.contains(t)) : [];
    return { top: r.top, h: r.height, inLine: words.length >= 0 };
  });
  return { sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, spill, icons: icons.length };
}

const browser = await chromium.launch();
try {
  for (const w of [1440, 400]) {
    for (const [name, path, wait] of SCREENS) {
      const tag = `${w} ${name}, twice the text size`;
      const b = await insidePage(browser, w, 'dark', { rows: m7Rows(null), textTwice: true, dir: out });
      try {
        await b.page.goto(`${APP}${path}`);
        await b.page.locator(wait).first().waitFor({ timeout: 30000 });
        await b.page.evaluate(() => document.fonts.ready);
        await sleep(800);
        const f = await b.page.evaluate(facts);
        pass(`${tag}: nothing runs off the side`, f.sideways <= 0, `${f.sideways}px`);
        pass(`${tag}: no words spill out of a button`, f.spill.length === 0, f.spill.join(' | '));
        const taps = (await b.page.evaluate(overlappingTaps)).filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
        pass(`${tag}: no two tap areas overlap`, taps.length === 0, taps.join(' | '));
        pass(`${tag}: no console or page errors`, b.problems.length === 0, b.problems.join(' | '));
        await b.page.screenshot({ path: join(out, `${name.replace(/ /g, '-')}-${w}-twice.png`), fullPage: true });
      } catch (error) {
        pass(`${tag}: opened`, false, error.message.split('\n')[0]);
      }
      await b.ctx.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
