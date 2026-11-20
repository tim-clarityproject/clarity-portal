// The UI tester for the coach portal (Phase 6a runs 1 and 2): every page
// and panel, as the owner and as an associate (and the client's own
// Coaching page as the test client), at 1440, 768 and 400, dark and light,
// held to the calm rules with the portal's own checkers (the same functions
// calm-rules runs on every client page) and to the rules of 18 Nov:
//   - every tap area 44px or more, and no two overlap; no sideways scroll;
//   - every button in the controls family, one coral button a screen;
//   - boxes, choices and cards side by side are one height;
//   - no Nekst inside a control, no thick coloured side line, no line
//     under a heading over rows with their own lines, folds open from the
//     whole heading row;
//   - every outlined edge reaches 3 to 1; pop-ups are one short line;
//   - chevrons centred on their words;
//   - no keyboard shortcut is shown anywhere; Add rows drop "a" and "an";
//   - each mode uses its own colours; nothing in the console;
// and to run 2's design rules (Tim, 18 and 19 Nov; rules.mjs), each a named
// check on every screen: underlined tabs that scroll in their own strip;
// boxes side by side level; one line of help at most, and help that can be
// hidden and shown again; alerts as one short line; money rates; chart
// pop-ups; table headings that stay; figures on an equal grid; the
// Important tick box; a week over capacity; no key hints; and on a phone
// nothing under the phone bar and one coral button in view.
//
//   node --import ./tests/scores/register.mjs tests/coach/ui.mjs [folder for screenshots]
//   ONLY, GROUPS, SIZES, MODES and ROLES narrow it (see screens.mjs).
//   TWICE=1: run 2's screens at twice the standard text size instead (no
//   sideways scroll, nothing cut off, boxes still level).
// It ends with one COUNT line for each role, size and mode.
import { mkdirSync } from 'node:fs';
import { buttonProblems, chevronOnlyFolds, doubledRules, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { APP, makeReport } from './shared.mjs';
import { GROUPS, picture as takePicture, walk } from './screens.mjs';
import { chartPopups, hiddenHelp, readRules, readTwice, SOFT_CORAL, tableHeadings } from './rules.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const TWICE = process.env.TWICE === '1';
const made = makeReport(`Coach portal, the UI tester${TWICE ? ', twice the text size' : ''}`);
// The same report, counted for each role, size and mode as well.
const counts = {};
let counting = 'the walk';
const report = {
  pass(what, ok, detail = '') { const c = counts[counting] || (counts[counting] = [0, 0]); c[ok ? 0 : 1] += 1; return made.pass(what, ok, detail); },
  done() { for (const [key, [p, f]] of Object.entries(counts)) console.log(`COUNT ${key}: ${p} passed, ${f} failed`); return made.done(); },
};
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };

/** Runs in the page: tap sizes, sideways scroll, shortcut hints, add rows, the board's cards, the mode's colours. */
function measure(appSelector) {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const app = document.querySelector(appSelector) || document.body;
  const root = top || app;
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
    // The shared date picker's own days, opened from the calendar's date outside any panel (41 by 44 on a laptop, as the design reference draws them).
    if (el.matches('.ds-cal-day') && b.height >= 43.5 && b.width >= 40) continue;
    // A placed to-do's tick sits inside its calendar tile, which is as tall as its minutes (run 3; M11).
    if (el.matches('.cc-cal-tick') && el.closest('.cc-cal-tile')) continue;
    // A link inside a sentence carries its own 44px strip.
    if (el.matches('.cc-inline-link') && ra.h >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  const text = (app.innerText || '') + [...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n');
  const adds = [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t));
  const cards = [...document.querySelectorAll('.cc-card')].filter(vis).map((c) => Math.round(c.getBoundingClientRect().height));
  const cs = getComputedStyle(app);
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
    text,
  };
}

/** A picture of the screen as it stands, taken as shots.mjs takes them (when a folder was given). */
const picture = (page, file, full) => (OUT ? takePicture(page, `${OUT}/${file}.png`, full) : null);

/** What a screen must show, by the name it gives in `expects` (screens.mjs). */
const MUST = {
  finances: (r) => r.text.includes('November £2,300 of £5,000'),
  'capacity-row': (r) => /Capacity/i.test(r.text) && r.text.includes('Coaching hours each week'),
  'hidden-help': (r) => r.text.includes('Hidden help') && r.text.includes('Nothing is hidden.'),
};
// Underlined tabs are the same on a laptop and a phone: the same words, size, line and space at every width.
const TABS_LOOK = { size: '16px', line: 2, gap: '22px' };

const problems = await walk(async (page, { name, role, size, theme, run, root, expects, full }) => {
  const tag = `${name}, ${role}, ${size}px ${theme}`;
  counting = `${role} ${size} ${theme}`;
  const phone = size <= 600;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);

  if (TWICE) {
    const t = await page.evaluate(readTwice, root);
    report.pass(`${tag}: the text is twice the standard size`, parseFloat(t.size) >= 28, t.size);
    report.pass(`${tag}: at twice the text size, no sideways scroll`, t.sideways <= 0, `${t.sideways}px`);
    report.pass(`${tag}: at twice the text size, nothing runs off the side or is cut off`, t.off.length === 0, t.off.slice(0, 5).join(' | '));
    const rules = await page.evaluate(readRules, { app: root, phone, wide: false, theme, softCoral: SOFT_CORAL[theme], mint: [] });
    report.pass(`${tag}: at twice the text size, boxes side by side still line up`, rules.level.length === 0, rules.level.slice(0, 4).join('; '));
    report.pass(`${tag}: at twice the text size, the tabs keep to their own strip`, rules.tabs.length === 0, rules.tabs.slice(0, 4).join('; '));
    report.pass(`${tag}: at twice the text size, figures stay on an equal grid`, rules.figures.length === 0, rules.figures.slice(0, 4).join('; '));
    await picture(page, `twice-${name}.${role}.${size}.${theme}`, false);
    return;
  }

  if (expects.includes('help-flow')) {
    // (No picture: this screen is To-dos again, walked for its help link.)
    for (const [what, ok, detail] of await hiddenHelp(page, { app: APP, phone })) report.pass(`${tag}: ${what}`, ok, detail);
    return;
  }

  if (role === 'signed-out') {
    // The sign-in pages: only that the coach header's rule for the body changed nothing on them.
    const s = await page.evaluate(readRules, { app: root, phone, wide: false, theme, softCoral: SOFT_CORAL[theme], mint: [] });
    report.pass(`${tag}: the coach header’s rule for the body doesn’t reach the sign-in page`, s.header.length === 0, s.header.join('; '));
    report.pass(`${tag}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
    report.pass(`${tag}: the body keeps the portal’s own sideways overflow (hidden)`, await page.evaluate(() => getComputedStyle(document.body).overflowX) === 'hidden', await page.evaluate(() => getComputedStyle(document.body).overflowX));
    await picture(page, `${name}.${role}.${size}.${theme}`, false);
    return;
  }

  // The picture is taken before anything is opened, hovered or scrolled by a check.
  await picture(page, `${name}.${role}.${size}.${theme}`, full);
  const r = await page.evaluate(measure, root);
  if (root === '.cc-app') report.pass(`${tag}: the page follows the chosen mode`, r.theme === theme && r.background === BACKGROUND[theme], `${r.theme} ${r.background}`);
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
  const chevrons = chevronsOff(await measureChevrons(page)).filter((c) => !/^ds-dd "UK"/.test(c) && !/^ds-cal-nav /.test(c)); // and the shared date picker's own month arrows
  report.pass(`${tag}: chevrons are centred on their words`, chevrons.length === 0, chevrons.slice(0, 3).join('; '));

  // ---- Run 2's design rules (Tim, 18 and 19 Nov), on every screen.
  const rules = await page.evaluate(readRules, { app: root, phone, wide: size >= 1440, theme, softCoral: SOFT_CORAL[theme], mint: ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'] });
  const rule = (what, list) => report.pass(`${tag}: ${what}`, list.length === 0, list.slice(0, 4).join('; '));
  rule('tabs are underlined tabs that scroll in their own strip', rules.tabs);
  if (rules.tabsLook) report.pass(`${tag}: the tabs are the same on a laptop and a phone`, Object.entries(TABS_LOOK).every(([k, v]) => rules.tabsLook[k] === v), JSON.stringify(rules.tabsLook));
  rule('boxes side by side line up (tops level, one height)', rules.level);
  rule('one line of help at most, and never two in a row', rules.help);
  rule('an explanation panel ends with “Don’t show me this again”', rules.explain);
  rule('an alert is one short line with its link inside and no button', rules.over);
  rule('money rates read “£750/hr”, with “per hour” for a screen reader', rules.money);
  rule('figures in a row sit on an equal grid', rules.figures);
  rule('Important is the soft coral tick box, sorted first and named', rules.important);
  rule('a week over capacity is a full soft coral bar with no warning words', rules.capacity);
  rule('no key hint is shown', rules.keys);
  rule(root === '.cc-app' ? 'the coach header stays at the top as the page scrolls' : 'the coach header’s rule for the body doesn’t reach the client portal', rules.header);
  if (root !== '.cc-app') report.pass(`${tag}: the body keeps the portal’s own sideways overflow (hidden)`, await page.evaluate(() => getComputedStyle(document.body).overflowX) === 'hidden', await page.evaluate(() => getComputedStyle(document.body).overflowX));
  rule('a chart writes its 0 once', rules.zero);
  if (phone) rule('on a phone nothing sits under the phone bar and one coral button at most is in view', rules.phone);
  if (size <= 768) rule('the older phone rule for plain buttons changes no button here', rules.oldPhone);
  if (role === 'associate') report.pass(`${tag}: an associate never sees the Finances line`, !/£2,300/.test(r.text));
  if (rules.found.chart) {
    const tips = await chartPopups(page, { phone });
    report.pass(`${tag}: chart pop-ups (${tips.read} opened) are ${phone ? 'one line, inside the screen' : 'a title with rows when they hold more than one fact'}`, tips.read > 0 && tips.problems.length === 0, tips.problems.slice(0, 3).join('; '));
  }
  if (expects.includes('table')) rule('the table’s heading row stays at the top as the page and the table scroll', await tableHeadings(page));
  // What this screen is there to show must be on it.
  for (const need of expects) {
    if (need === 'table' || need === 'help-flow') continue;
    if (need === 'level' && size < 1440) continue; // on a phone, and for some rows on a tablet, the boxes stack
    const there = MUST[need] ? MUST[need](r) : rules.found[need];
    report.pass(`${tag}: the screen shows what it is for (${need})`, Boolean(there));
  }
  if (run === 2 && expects.includes('panel') && phone) report.pass(`${tag}: on a phone a side panel is the whole screen`, await page.evaluate(() => { const d = [...document.querySelectorAll('.ds-dialog')].filter((x) => x.getBoundingClientRect().width > 0).pop(); if (!d) return true; const b = d.getBoundingClientRect(); return d.matches('.ds-sheet, [class*=sheet]') || b.width >= window.innerWidth - 1; }));
}, { twice: TWICE, groups: TWICE ? GROUPS.map((g) => g.name).filter((g) => g !== 'run1' && g !== 'help') : null });
counting = 'the walk';
report.pass('every screen opened, with nothing in the console and nothing written to the database', problems.length === 0, problems.slice(0, 8).join(' | '));
report.done();
