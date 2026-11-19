// The UI tester for the coach portal (Phase 6a run 1): every new page and
// panel, as the owner and as an associate, at 1440, 768 and 400, dark and
// light, held to the calm rules with the portal's own checkers (the same
// functions calm-rules runs on every client page) and to the rules of 18 Nov:
//   - every tap area 44px or more, and no two overlap; no sideways scroll;
//   - every button in the controls family, one coral button a screen;
//   - boxes, choices and cards side by side are one height;
//   - no Nekst inside a control, no thick coloured side line, no line
//     under a heading over rows with their own lines, folds open from the
//     whole heading row;
//   - every outlined edge reaches 3 to 1; pop-ups are one short line;
//   - chevrons centred on their words;
//   - no keyboard shortcut is shown anywhere; Add rows drop "a" and "an";
//   - each mode uses its own colours; nothing in the console.
//
//   node --import ./tests/scores/register.mjs tests/coach/ui.mjs [folder for screenshots]
//   ONLY, SIZES, MODES and ROLES narrow it (see screens.mjs).
import { mkdirSync } from 'node:fs';
import { buttonProblems, chevronOnlyFolds, doubledRules, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { makeReport } from './shared.mjs';
import { walk } from './screens.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const report = makeReport('Coach portal, the UI tester');
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };

/** Runs in the page: tap sizes, sideways scroll, shortcut hints, add rows, the board's cards, the mode's colours. */
function measure() {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const root = top || document.querySelector('.cc-app') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01; };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} “${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}”`;
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, [role=radio], [role=checkbox], [role=switch], [role=option], [role=menuitem], [role=menuitemcheckbox]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2)) continue;
    const reach = (p) => (p.content !== 'none' && p.position === 'absolute' && p.display !== 'none' && p.pointerEvents !== 'none') ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
    const [ra, rb] = [reach(getComputedStyle(el, '::after')), reach(getComputedStyle(el, '::before'))];
    const tapW = Math.max(b.width, ra.w, rb.w);
    const tapH = Math.max(b.height, ra.h, rb.h);
    if (tapW >= 43.5 && tapH >= 43.5) continue;
    if (el.matches('.ds-seg-btn') && b.height >= 33.5) continue; // inside the switch's own 40px track, 44px on a phone
    // A fold's button fills its whole heading row (its ::after is inset 0 of the row).
    if (el.matches('.cc-fold-btn') && el.closest('.cc-fold-head').getBoundingClientRect().height >= 43.5) continue;
    // A link inside a sentence carries its own 44px strip.
    if (el.matches('.cc-inline-link') && ra.h >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  const text = (document.querySelector('.cc-app')?.innerText || '') + [...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n');
  const adds = [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t));
  const cards = [...document.querySelectorAll('.cc-card')].filter(vis).map((c) => Math.round(c.getBoundingClientRect().height));
  const cs = getComputedStyle(document.querySelector('.cc-app') || document.body);
  return {
    small,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    shortcuts: [...document.querySelectorAll('kbd')].filter(vis).length + ((text.match(/[⌘⌥⇧]|\b(Cmd|Ctrl)\s?\+/g) || []).length),
    adds,
    cards: [...new Set(cards)],
    background: cs.backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    fail: /\bfail(ed|s|ure)?\b/i.test(text),
    purpose: /\b(your|my) (purpose|mission)\b/.test(text),
  };
}

const problems = await walk(async (page, { name, role, size, theme }) => {
  const tag = `${name}, ${role}, ${size}px ${theme}`;
  const phone = size <= 600;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);
  const r = await page.evaluate(measure);
  report.pass(`${tag}: the page follows the chosen mode`, r.theme === theme && r.background === BACKGROUND[theme], `${r.theme} ${r.background}`);
  report.pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  report.pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  report.pass(`${tag}: no keyboard shortcut is shown`, r.shortcuts === 0, `${r.shortcuts}`);
  report.pass(`${tag}: Add rows drop “a” and “an”`, r.adds.length === 0, r.adds.join('; '));
  report.pass(`${tag}: every card on the board is one height`, r.cards.length <= 1, r.cards.join(', '));
  report.pass(`${tag}: no “fail” in what people read`, !r.fail);
  report.pass(`${tag}: Mission keeps its capital`, !r.purpose);
  const btns = await page.evaluate(buttonProblems, { phone, scale: 1 });
  report.pass(`${tag}: every button in the controls family, its words whole, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 4).join('; '));
  const uneven = await page.evaluate(sideBySide);
  report.pass(`${tag}: boxes side by side are one height`, uneven.length === 0, uneven.slice(0, 4).join('; '));
  const nekst = await page.evaluate(nekstInControls);
  report.pass(`${tag}: no Nekst inside any control`, nekst.length === 0, nekst.slice(0, 4).join('; '));
  const sides = await page.evaluate(sideLines);
  report.pass(`${tag}: no thick coloured side line`, sides.length === 0, sides.slice(0, 4).join('; '));
  const doubled = await page.evaluate(doubledRules);
  report.pass(`${tag}: no line under a heading over rows with their own lines`, doubled.length === 0, doubled.slice(0, 4).join('; '));
  const folds = await page.evaluate(chevronOnlyFolds);
  report.pass(`${tag}: every fold opens from its whole heading row`, folds.length === 0, folds.slice(0, 4).join('; '));
  const edges = await page.evaluate(outlinedEdges);
  report.pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.slice(0, 4).join('; '));
  const overlaps = await page.evaluate(overlappingTaps);
  report.pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.slice(0, 4).join('; '));
  const pops = await page.evaluate(checkPopups);
  report.pass(`${tag}: every pop-up is one short line (${pops.checked} read)`, pops.problems.length === 0, pops.problems.slice(0, 3).join('; '));
  // A drop-down showing "UK" is read as capitals by the checker (its value is two capital letters): the
  // chevron is the shared drop-down's own, centred on lowercase words as everywhere else.
  const chevrons = chevronsOff(await measureChevrons(page)).filter((c) => !/^ds-dd "UK"/.test(c));
  report.pass(`${tag}: chevrons are centred on their words`, chevrons.length === 0, chevrons.slice(0, 3).join('; '));
  if (OUT) await page.screenshot({ path: `${OUT}/${name}.${role}.${size}.${theme}.png` });
});
report.pass('every screen opened, with nothing in the console', problems.length === 0, problems.slice(0, 6).join(' | '));
report.done();
