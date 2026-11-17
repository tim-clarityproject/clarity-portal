// The Strategic Alignment Health Check inside the portal (mock-up M7 version
// 8.2), end to end in a browser, signed in as the test client: no teams; a
// first team to its results; a new version; a new team; Compare two
// versions; edits; deleting; an older page's Health Check; the older
// addresses; the PDF; a draft and a refresh; finishing offline; and one
// real save to the test database (cleaned up). On every screen it measures
// what the UI tester measures.
//
//   node tests/healthcheck/inside-flow.mjs <folder>
//   SIZES=1440,400  MODES=dark,light  ONLY=<regex on a part's name>
//
// The Health Check's own reads and writes of `decisions` are answered by a
// stand-in (tests/healthcheck/inside-shared.mjs), so nothing is written to
// the test database except by the part called "real", which deletes what it
// made. Every /api/ call is answered here and everything outside localhost
// and the test project is blocked: no email, no outside fonts.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { overlappingTaps } from '../phase5/taps.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { questionsBeforeCharts } from '../phase5/summary-order.mjs';
import { clientDb, readEnv } from '../phase8/shared.mjs';
import { APP, BASE, IDS, insidePage, m7Rows, oldRow, open, sleep } from './inside-shared.mjs';
import { backChevron, titleIcons } from './hc-measure.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-inside-flow');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};
const note = (text) => results.push(`NOTE  ${text}`);
const figures = new Map();
const figure = (key, text) => { if (!figures.has(key)) { figures.set(key, text); note(`${key}: ${text}`); } };

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(60);
  }
}
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const questionText = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('.ds-guide .ds-guide-question, .ds-guide .ds-guide-title')].pop();
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
});
const onQuestion = (page, has, ms = 8000) => until(async () => (await questionText(page)).toLowerCase().includes(has.toLowerCase()), ms);
const pressNext = async (page) => { await sleep(450); await page.locator('.ds-guide-next').click({ timeout: 10000 }); await sleep(200); };
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.ds-toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
const hasToast = (page, words, ms = 5000) => until(async () => (await toastText(page)).includes(words), ms);
const onPage = (page, re, ms = 10000) => until(async () => re.test(new URL(page.url()).pathname), ms);
const resultsShown = (page) => until(async () => (await page.locator('main.hc-in-page .ds-headline').count()) > 0, 15000);

// ---------------------------------------------------------------- measured on every screen (runs in the page)
function facts({ layer }) {
  const root = [...document.querySelectorAll(layer)].filter((e) => e.getBoundingClientRect().width > 0).pop();
  if (!root) return null;
  const o = { small: [], narrowPlay: [], coral: 0 };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert], [hidden], [aria-hidden=true]');
  };
  const scope = layer === 'page' ? document.body : root;
  for (const el of scope.querySelectorAll('button, a[href], [role=radio], [role=option], [role=button], [role=slider], [role=combobox], input, textarea')) {
    if (!visible(el)) continue;
    const box = el.matches('.hc-dot') ? el.querySelector('.hc-dot-tap').getBoundingClientRect() : el.getBoundingClientRect();
    const reach = (ps) => (ps.content !== 'none' && ps.position === 'absolute' ? { w: parseFloat(ps.width) || 0, h: parseFloat(ps.height) || 0 } : { w: 0, h: 0 });
    const a = reach(getComputedStyle(el, '::after'));
    const b = reach(getComputedStyle(el, '::before'));
    const w = Math.max(box.width, a.w, b.w);
    const h = Math.max(box.height, a.h, b.h);
    const name = `${(el.getAttribute('aria-label') || el.textContent || el.className.baseVal || el.className || el.tagName).toString().trim().slice(0, 40)} ${w.toFixed(1)}x${h.toFixed(1)}`;
    if (w >= 43.5 && h >= 43.5) continue;
    if (el.matches('.ds-title-icons > .ds-play') && h >= 43.5 && w >= 31.5) o.narrowPlay.push(name);
    else o.small.push(name);
  }
  const rgb = (c) => c.replace(/\s+/g, '');
  for (const el of scope.querySelectorAll('*')) {
    if (visible(el) && rgb(getComputedStyle(el).backgroundColor) === 'rgb(255,111,92)' && !(el.parentElement && rgb(getComputedStyle(el.parentElement).backgroundColor) === 'rgb(255,111,92)')) o.coral += 1;
  }
  const scroller = root.querySelector?.('.ds-guide-scroll, .ds-dialog-body') || root;
  o.sideways = Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, scroller.scrollWidth - scroller.clientWidth, 0);
  return o;
}

/** layer: '.ds-guide' on a guided screen, 'page' on a page in the portal frame. */
async function checkScreen(b, tag, { layer = 'page', coral = 1, back = null } = {}) {
  const { page } = b;
  await page.mouse.move(2, 2);
  await sleep(450);
  const f = await page.evaluate(facts, { layer: layer === 'page' ? 'main.hc-in-page' : layer });
  if (!f) { pass(`${tag}: the screen is there`, false, layer); return; }
  pass(`${tag}: no sideways scroll`, f.sideways <= 0, `${f.sideways}px`);
  pass(`${tag}: every tap area is 44px each way`, f.small.length === 0, f.small.join(' | '));
  pass(`${tag}: at most one coral button${coral === 0 ? ' (none here)' : ''}`, f.coral <= coral, `found ${f.coral}`);
  const all = await page.evaluate(overlappingTaps);
  const overlaps = all.filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
  if (all.length > overlaps.length) figure(`Chart dots whose tap circles share space (${tag})`, all.filter((o) => !overlaps.includes(o)).join(' | '));
  pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.join(' | '));
  const edges = await page.evaluate(outlinedEdges);
  pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.join(' | '));
  if (back) {
    const c = await backChevron(page, back);
    pass(`${tag}: Back’s chevron has its visible edge on the content’s left edge`, c && Math.abs(c.edge) <= 0.5, JSON.stringify(c));
    pass(`${tag}: Back’s tap area is 44px tall`, c && c.tapH >= 44, JSON.stringify(c));
    if (c) figure(`Back’s chevron (${tag.split(',')[0]}, ${back.button})`, `visible edge ${c.edge.toFixed(2)}px from the content’s edge, its label ${c.gap.toFixed(2)}px after it`);
  }
}
const PAGE_BACK = { button: '.hc-back', label: '.hc-back', content: '.ds-page-title' };
const GUIDE_BACK = { button: '.ds-guide-back', label: '.ds-guide-name', content: '.ds-guide-pct-track' };
const noProblems = (b, tag) => {
  pass(`${tag}: no console, page or HTTP errors`, b.problems.length === 0, [...new Set(b.problems)].join(' | '));
  pass(`${tag}: no email or /api/ call`, b.sent.length === 0, b.sent.join(' | '));
};

async function checkIcons(page, tag, head) {
  const m = await titleIcons(page, { heading: head, play: `${head} .ds-play svg`, eye: `${head} .ds-who:not(.ds-play) svg` });
  const said = JSON.stringify(m);
  pass(`${tag}: the play icon is 12px after the title’s last letter`, m && Math.abs(m.gapTitle - 12) <= 0.5, said);
  pass(`${tag}: the eye is 16px after the play icon`, m && Math.abs(m.gapPair - 16) <= 0.5, said);
  pass(`${tag}: both icons are centred on the capitals within 0.5px`, m && Math.abs(m.offPlay) <= 0.5 && Math.abs(m.offEye) <= 0.5, said);
  pass(`${tag}: the icons’ tap areas are 44px tall and don’t overlap`, m && m.tapEye.w >= 44 && m.tapEye.h >= 44 && m.tapPlay.h >= 44 && m.tapsOverlap <= 0, said);
  if (m) figure(`Icons beside the title (${tag.split(',')[0]}, ${head})`, `${m.gapTitle.toFixed(2)}px, then ${m.gapPair.toFixed(2)}px; middles ${m.offPlay.toFixed(2)} and ${m.offEye.toFixed(2)} from the capitals’ middle`);
}

async function checkFonts(b, tag) {
  const f = await b.page.evaluate(async () => {
    await document.fonts.ready;
    const fam = (sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); return el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null; };
    return {
      dm: document.fonts.check('17px "DM Sans"'), nekst: document.fonts.check('12px "Nekst"'),
      loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/["']/g, '')),
      title: fam('.ds-page-title'), body: fam('main.hc-in-page p'),
    };
  });
  pass(`${tag}: DM Sans is loaded by the page`, f.dm && f.loaded.includes('DM Sans'), JSON.stringify(f.loaded));
  pass(`${tag}: Nekst is loaded by the page`, f.nekst && f.loaded.includes('Nekst'), JSON.stringify(f.loaded));
  pass(`${tag}: the title is in Nekst`, f.title === 'Nekst', f.title);
  pass(`${tag}: the words are in DM Sans`, f.body === 'DM Sans', f.body);
  const outside = [...new Set(b.fonts)].filter((u) => !/^https?:\/\/localhost[:/]/.test(u));
  pass(`${tag}: every font file comes from the page’s own address`, outside.length === 0, outside.join(' | '));
}

/** Answers every question still to answer, choosing by the project's place, until the results show. */
async function answerAll(page, { pick = (i) => [3, 2, 4, 1][i % 4] } = {}) {
  for (let i = 0; i < 400; i += 1) {
    if (await page.locator('main.hc-in-page .ds-headline').count()) return true;
    const q = await questionText(page);
    if (!q) { await sleep(200); continue; }
    if (/start, and when/i.test(q)) { await pressNext(page); continue; }
    const opts = page.locator('.ds-guide [role=radio]');
    const n = await opts.count();
    if (n) {
      await sleep(420);
      await opts.nth(Math.min(n - 1, pick(i))).click({ timeout: 3000 }).catch(() => null);
      await until(async () => (await questionText(page)) !== q || (await page.locator('main.hc-in-page .ds-headline').count()) > 0, 4000);
      continue;
    }
    // Between screens (the tool closing for the results): look again.
    if (!(await page.locator('.ds-guide-next').count())) { await sleep(200); continue; }
    await pressNext(page);
  }
  return false;
}
async function typeRows(page, list) {
  for (let i = 0; i < list.length; i += 1) {
    const boxes = page.locator('.ds-guide-body textarea');
    if ((await boxes.count()) <= i) await page.locator('.ds-guide-body .ds-add-btn, .ds-guide-body button:has-text("Add a")').first().click();
    await page.locator('.ds-guide-body textarea').nth(i).fill(list[i]);
  }
}

// ---------------------------------------------------------------- the parts
const PARTS = [];
const part = (name, fn) => PARTS.push([name, fn]);

part('empty', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: [], dir: out });
  const { page } = b;
  await open(page);
  pass(`${tag}: the title reads STRATEGIC ALIGNMENT HEALTH CHECK, in capitals`, (await text(page, '.ds-page-title')).toUpperCase().startsWith('STRATEGIC ALIGNMENT HEALTH CHECK'));
  pass(`${tag}: the calm card asks which team`, (await text(page, '.ds-calm-card p')) === 'Which team’s work would you like to check against its strategy?');
  pass(`${tag}: Start a Health Check is the one coral button`, await page.locator('.ds-calm-card .ds-btn--primary').count() === 1);
  pass(`${tag}: See an example report is under it`, await page.getByRole('button', { name: 'See an example report' }).count() === 1);
  pass(`${tag}: no Add another team with no teams`, await page.getByRole('button', { name: 'Add another team' }).count() === 0);
  pass(`${tag}: no tip and no offer with no teams`, await page.locator('.ds-oneoff-tip').count() === 0);
  await checkScreen(b, `${tag}, Your teams`);
  await checkIcons(page, `${tag}, Your teams`, '.ds-page-title');
  await checkFonts(b, `${tag}, Your teams`);
  await page.screenshot({ path: join(out, `empty-${w}-${mode}.png`) });
  // The example report, and back.
  await page.getByRole('button', { name: 'See an example report' }).click();
  await until(async () => (await text(page, '.ds-page-title')).toUpperCase() === 'EXAMPLE REPORT');
  pass(`${tag}: the example report opens`, (await text(page, '.ds-page-title')).toUpperCase() === 'EXAMPLE REPORT');
  pass(`${tag}: the example says what Quillmark is`, (await text(page, '.hc-example-intro')).includes('Quillmark is an invented software company'));
  const order = await page.evaluate(questionsBeforeCharts);
  pass(`${tag}: the example’s questions come after its chart`, order.length === 0, order.join(' | '));
  await checkScreen(b, `${tag}, example`, { back: PAGE_BACK });
  await page.screenshot({ path: join(out, `example-${w}-${mode}.png`) });
  await page.locator('.hc-back').click();
  pass(`${tag}: Back goes to Your teams`, await onPage(page, /^\/strategic-alignment$/));
  noProblems(b, `${tag}, empty`);
  await b.ctx.close();
});

// The Quick guide's offer row (M7 version 8.2; Tim, 14 Nov, 10:14 to 10:19): one first-visit message at a
// time (the offer first, the one-off tip once it has gone), the title's play icon hidden while it shows, Not now
// offering it on the next 2 visits, Don’t show this again from the second, and Watch opening the guide.
part('offer', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out, offers: {} });
  const { page, store } = b;
  const row = () => page.locator('.ds-offer');
  const play = () => page.locator('.ds-page-title .ds-play');
  const tipCount = () => page.locator('.ds-oneoff-tip').count();
  const kept = () => JSON.stringify(store.prefs?.offers?.['health-check-guide'] || {});
  await open(page);
  pass(`${tag}: the first visit offers the Quick guide`, await row().count() === 1 && (await text(page, '.ds-offer-words')).replace(/\s+/g, ' ') === 'Watch the Quick guide ~1 minute');
  pass(`${tag}: first visit: the offer, and no tip with it`, await tipCount() === 0);
  pass(`${tag}: first visit: the title’s play icon hides while it shows`, await play().count() === 0);
  pass(`${tag}: first visit: Not now only`, JSON.stringify(await page.locator('.ds-offer-ways button').allInnerTexts()) === '["Not now"]');
  await checkScreen(b, `${tag}, Your teams with the offer`, { coral: 0 });
  await page.screenshot({ path: join(out, `offer-${w}-${mode}.png`) });
  // Not now: gone for this visit, the play icon back, and then the tip.
  await page.getByRole('button', { name: 'Not now' }).click();
  pass(`${tag}: Not now hides it`, await until(async () => (await row().count()) === 0));
  pass(`${tag}: after Not now the play icon is back`, await play().count() === 1);
  pass(`${tag}: after Not now the one-off tip shows (one message at a time)`, await until(async () => (await tipCount()) === 1));
  pass(`${tag}: Not now is kept (once)`, await until(async () => kept() === '{"not_now":1}'), kept());
  // Moving round the portal is the same visit: it stays away.
  await page.locator('.ds-version-row').first().click();
  await onPage(page, /\/version\//);
  await page.locator('.hc-back').click();
  await onPage(page, /^\/strategic-alignment$/);
  await sleep(500);
  pass(`${tag}: the same visit: it stays away`, await row().count() === 0);
  // The next 2 visits offer it again, with Don’t show this again; then it stops.
  for (const n of [2, 3]) {
    await open(page);
    pass(`${tag}: visit ${n} offers it again, with Don’t show this again`, await row().count() === 1 && JSON.stringify(await page.locator('.ds-offer-ways button').allInnerTexts()) === '["Don’t show this again","Not now"]' && await tipCount() === 0 && await play().count() === 0);
    if (n === 2) await page.screenshot({ path: join(out, `offer-later-${w}-${mode}.png`) });
    await page.getByRole('button', { name: 'Not now' }).click();
    await until(async () => kept() === `{"not_now":${n}}`);
  }
  await open(page);
  pass(`${tag}: visit 4: it has stopped, and the play icon shows`, await row().count() === 0 && await play().count() === 1, kept());
  // Don’t show this again (from a second offer) stops it.
  store.prefs = { offers: { 'health-check-guide': { not_now: 1 } } };
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.endsWith(':menu-pins')) localStorage.removeItem(k); });
  await open(page);
  await page.getByRole('button', { name: 'Don’t show this again' }).click();
  pass(`${tag}: Don’t show this again is kept`, await until(async () => kept() === '{"not_now":1,"never":true}'), kept());
  await open(page);
  pass(`${tag}: after Don’t show this again it never comes back`, await row().count() === 0 && await play().count() === 1);
  // Watch: the guide opens in its panel (it never plays by itself before that), and the offer has done its job.
  store.prefs = { offers: {} };
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.endsWith(':menu-pins')) localStorage.removeItem(k); });
  await open(page);
  const playing0 = await page.evaluate(() => [...document.querySelectorAll('video')].some((v) => !v.paused));
  pass(`${tag}: nothing plays by itself`, !playing0);
  await page.locator('.ds-offer-take').click();
  pass(`${tag}: Watch the Quick guide opens the guide`, await until(async () => (await page.locator('.hc-guide-panel video, [role=dialog] .hc-vcard').count()) > 0));
  // The inside guide is its own: M7's animation from Your teams (follow-up 1, step 5).
  const src = await until(async () => /quick-guide-inside-(desktop|phone)/.test(await page.evaluate(() => document.querySelector('video')?.currentSrc || document.querySelector('video')?.getAttribute('src') || '')), 5000);
  pass(`${tag}: … and plays the inside guide (M7's own animation)`, src, await page.evaluate(() => document.querySelector('video')?.getAttribute('src') || ''));
  pass(`${tag}: taking it is kept, and it isn’t offered again`, await until(async () => kept() === '{"taken":true}'), kept());
  noProblems(b, `${tag}, offer`);
  await b.ctx.close();
});

part('teams', async ({ browser, w, mode, tag, phone }) => {
  const rows = (u) => m7Rows(u);
  const b = await insidePage(browser, w, mode, { rows: rows(null), dir: out });
  const { page } = b;
  await open(page);
  const heads = await page.locator('main .ds-results-head').allInnerTexts();
  pass(`${tag}: each team is a section, newest first`, JSON.stringify(heads.map((h) => h.trim().toLowerCase())) === JSON.stringify(['leadership team', 'product team']), JSON.stringify(heads));
  const names = await page.locator('.ds-version-row b').allInnerTexts();
  pass(`${tag}: the versions, newest first, named in words`, JSON.stringify(names) === JSON.stringify(['October Health Check', 'July Health Check', 'April Health Check', 'September Health Check']), JSON.stringify(names));
  const dates = await page.locator('.ds-version-date').allInnerTexts();
  pass(`${tag}: the dates on the right`, JSON.stringify(dates) === JSON.stringify(['Tue 27 Oct', 'Tue 14 Jul', 'Fri 3 Apr', 'Wed 2 Sep']), JSON.stringify(dates));
  const lines = await page.locator('.ds-version-row small').allInnerTexts();
  pass(`${tag}: the headline under each`, lines.every((l) => /^(\d+ of \d+ important projects (is|are) moving well\.|None of the important projects is under way yet\.)$/.test(l)), JSON.stringify(lines));
  pass(`${tag}: one quiet Start a new version per team`, await page.locator('.hc-in-tacts button').count() === 2 && (await page.locator('.hc-in-tacts button').allInnerTexts()).every((t) => t.trim() === 'Start a new version'));
  pass(`${tag}: Add another team is the one add button`, await page.getByRole('button', { name: 'Add another team' }).count() === 1);
  pass(`${tag}: no coral start card or example once there are teams`, await page.locator('.ds-calm-card').count() === 0 && await page.getByRole('button', { name: 'See an example report' }).count() === 0);
  pass(`${tag}: no Compare on the team list (it lives on the results)`, await page.getByRole('button', { name: 'Compare two versions' }).count() === 0);
  pass(`${tag}: the one-off tip about the outside Health Check`, (await text(page, '.ds-oneoff-tip p')) === 'Your April Health Check, done outside the portal, is now with the Leadership team.');
  await checkScreen(b, `${tag}, Your teams`, { coral: 0 });
  await checkIcons(page, `${tag}, Your teams`, '.ds-page-title');
  await page.screenshot({ path: join(out, `teams-${w}-${mode}.png`) });
  await page.screenshot({ path: join(out, `teams-${w}-${mode}-full.png`), fullPage: true });
  // Closing the tip: gone, and gone on the next visit.
  await page.locator('.ds-oneoff-tip button').click();
  pass(`${tag}: the tip closes`, await until(async () => (await page.locator('.ds-oneoff-tip').count()) === 0));
  await open(page);
  pass(`${tag}: the tip stays closed on the next visit`, await page.locator('.ds-oneoff-tip').count() === 0);
  // The phone bar shows here (no bottom button).
  if (phone) pass(`${tag}: the phone bar shows on Your teams`, await page.locator('.ds-bar-btn').first().isVisible());
  // A version opens.
  await page.locator('.ds-version-row').first().click();
  pass(`${tag}: a version opens at its own address`, await onPage(page, new RegExp(`/version/${IDS.lt3}$`)));
  noProblems(b, `${tag}, teams`);
  await b.ctx.close();
});

part('results', async ({ browser, w, mode, tag, phone }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page, `${BASE}/version/${IDS.lt3}`);
  await resultsShown(page);
  pass(`${tag}: the title`, (await text(page, '.ds-page-title')).toUpperCase().startsWith('STRATEGIC ALIGNMENT HEALTH CHECK'));
  pass(`${tag}: the team and the date under it`, JSON.stringify(await page.locator('.ds-page-meta span').allInnerTexts()) === JSON.stringify(['Leadership team', 'Tue 27 Oct']));
  const heads = (await page.locator('main .ds-results-head').allInnerTexts()).map((h) => h.trim().toUpperCase());
  const want = ['STRATEGIC IMPORTANCE AGAINST PROGRESS', 'PROJECTS', 'OBJECTIVE', 'SUCCESS FACTORS', 'QUESTIONS TO START WITH', 'VERSIONS'];
  pass(`${tag}: the order: chart, Projects, Objective, Success Factors, Questions to start with, then Versions`, JSON.stringify(heads) === JSON.stringify(want), JSON.stringify(heads));
  const order = await page.evaluate(questionsBeforeCharts);
  pass(`${tag}: the questions come after the chart`, order.length === 0, order.join(' | '));
  pass(`${tag}: Versions offers a new version and Compare (three versions)`, await page.getByRole('button', { name: 'Start a new version' }).count() === 1 && await page.getByRole('button', { name: 'Compare two versions' }).count() === 1);
  pass(`${tag}: Download my PDF in the bottom bar`, (await text(page, '.ds-bottombar .ds-btn')).toUpperCase() === 'DOWNLOAD MY PDF');
  if (phone) {
    pass(`${tag}: the phone bar steps back while the bottom bar shows`, !(await page.locator('.ds-bar-btn').first().isVisible().catch(() => false)));
  }
  pass(`${tag}: no ⓘ beside Sort by`, await page.locator('.hc-projects .hc-ctl .ds-guide-i').count() === 0);
  pass(`${tag}: the list is named Projects`, await page.locator('.hc-projects .ds-results-head').innerText().then((t) => t.trim().toUpperCase() === 'PROJECTS'));
  pass(`${tag}: chart dots have 44px tap areas`, await page.evaluate(() => [...document.querySelectorAll('.hc-dot-tap')].every((c) => c.getBoundingClientRect().width >= 43.5)));
  await checkScreen(b, `${tag}, results`, { back: PAGE_BACK });
  await checkIcons(page, `${tag}, results`, '.ds-page-title');
  await checkFonts(b, `${tag}, results`);
  await page.screenshot({ path: join(out, `results-${w}-${mode}.png`) });
  await page.screenshot({ path: join(out, `results-${w}-${mode}-full.png`), fullPage: true });
  // The eye: Only you, saved there and then.
  await page.locator('.ds-page-title .ds-who:not(.ds-play)').click();
  await page.getByRole('option', { name: 'Only you' }).click();
  pass(`${tag}: the eye's choice saves at once with "Saved"`, await hasToast(page, 'Saved'));
  pass(`${tag}: … kept on the version as shared_with_coach`, await until(async () => b.store.writes.some((r) => r.id === IDS.lt3 && r.form_data.shared_with_coach === false)));
  // The line for important: saved.
  await page.locator('.hc-chart-section .ds-dropdown-btn, .hc-chart-section button[aria-haspopup=listbox]').first().click();
  await page.getByRole('option', { name: '60%' }).click();
  pass(`${tag}: a new line is saved`, await until(async () => b.store.writes.some((r) => r.id === IDS.lt3 && r.form_data.data.importantLine === 60)));
  // The PDF, light, from the panel.
  await page.locator('.ds-bottombar .ds-btn').click();
  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.getByRole('button', { name: 'Light, for printing' }).click();
  const file = await dl;
  pass(`${tag}: the PDF downloads, named for the team`, Boolean(file) && /Health Check, Leadership team/.test(file.suggestedFilename()), file ? file.suggestedFilename() : 'no download');
  // The Product team has one version: no Compare.
  await open(page, `${BASE}/version/${IDS.pt1}`);
  await resultsShown(page);
  pass(`${tag}: a team with one version has no Compare`, await page.getByRole('button', { name: 'Compare two versions' }).count() === 0);
  await page.locator('.hc-back').click();
  pass(`${tag}: Back goes to Your teams`, await onPage(page, /^\/strategic-alignment$/));
  noProblems(b, `${tag}, results`);
  await b.ctx.close();
});

part('newversion', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page);
  await page.locator('.hc-in-tacts button').first().click();
  pass(`${tag}: New version opens`, await onQuestion(page, 'Let’s start from your last answers.'));
  const body = await text(page, '.ds-guide-body');
  pass(`${tag}: it says what is copied`, body.includes('Your objective, 4 Success Factors with their weights, and 7 projects with their dates are copied in.') && body.includes('Your earlier ratings stay with your earlier version.') && body.includes('October Health Check, Tue 27 Oct'), body);
  pass(`${tag}: its button reads Start my new version`, (await text(page, '.ds-guide-next')).toUpperCase() === 'START MY NEW VERSION');
  pass(`${tag}: the eye is on this first step`, await page.locator('.ds-guide-question .ds-who').count() >= 1);
  await checkScreen(b, `${tag}, New version`, { layer: '.ds-guide', back: GUIDE_BACK });
  await page.screenshot({ path: join(out, `newv-${w}-${mode}.png`) });
  await pressNext(page);
  pass(`${tag}: then the objective, copied in`, await onQuestion(page, 'What is your team trying to achieve?') && (await page.locator('.ds-guide-body textarea').inputValue()).startsWith('Double recurring revenue'));
  await checkScreen(b, `${tag}, objective`, { layer: '.ds-guide', back: GUIDE_BACK });
  await pressNext(page); await pressNext(page); await pressNext(page); await pressNext(page);
  pass(`${tag}: every rating starts blank`, await onQuestion(page, 'contribute to') && await page.locator('.ds-guide [role=radio][aria-checked=true]').count() === 0);
  pass(`${tag}: one-answer questions have no bottom bar`, await page.locator('.ds-guide-next').count() === 0);
  const done = await answerAll(page);
  pass(`${tag}: the last answer opens the results`, done && await onPage(page, /\/version\//));
  pass(`${tag}: "Saved"`, await hasToast(page, 'Saved'));
  const made = b.store.rows.filter((r) => !Object.values(IDS).includes(r.id));
  pass(`${tag}: saved as a finished version of the Leadership team, copied from October`, made.length === 1 && made[0].status === 'completed' && made[0].form_data.team.name === 'Leadership team' && made[0].form_data.from === IDS.lt3, JSON.stringify(made.map((r) => [r.status, r.form_data.from])));
  pass(`${tag}: October keeps its own ratings`, b.store.rows.find((r) => r.id === IDS.lt3).form_data.data.ratings.owner && b.store.writes.every((r) => r.id !== IDS.lt3));
  await open(page);
  pass(`${tag}: the Leadership team now has four versions`, (await page.locator('.ds-version-list').first().locator('.ds-version-row').count()) === 4);
  noProblems(b, `${tag}, new version`);
  await b.ctx.close();
});

part('draft', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page, `${BASE}/new?team=7a000000-0000-4000-8000-00000000a002`);
  await onQuestion(page, 'Let’s start from your last answers.');
  await pressNext(page);
  await onQuestion(page, 'What is your team trying to achieve?');
  await page.locator('.ds-guide-body textarea').fill('Make Kestrel the product customers recommend first, and keep it so');
  await sleep(1200);
  // A refresh: the typing comes back ("Draft restored").
  await page.reload();
  await onQuestion(page, 'What is your team trying to achieve?', 15000);
  pass(`${tag}: after a refresh the typing is back`, await until(async () => (await page.locator('.ds-guide-body textarea').inputValue()).endsWith('and keep it so'), 8000));
  pass(`${tag}: … with "Draft restored"`, await hasToast(page, 'Draft restored'));
  // Close: kept as a draft, "Saved", and the team list offers to carry on.
  await page.locator('.ds-guide-close').click();
  pass(`${tag}: closing says "Saved"`, await hasToast(page, 'Saved'));
  pass(`${tag}: … and goes to Your teams`, await onPage(page, /^\/strategic-alignment$/));
  pass(`${tag}: … kept as a draft`, b.store.rows.some((r) => r.status === 'draft' && r.draft === true && r.form_data.team.name === 'Product team' && r.form_data.step?.screen === 'objective'));
  // The list can draw before the Close's save has landed, then follows it.
  pass(`${tag}: the team offers Carry on with my new version`, await until(async () => (await page.getByRole('button', { name: 'Carry on with my new version' }).count()) === 1), `${await page.getByRole('button', { name: 'Carry on with my new version' }).count()} offers`);
  // Home's Carry on where you left off.
  await page.goto(`${APP}/welcome`);
  pass(`${tag}: Home offers to carry it on`, await until(async () => (await page.locator('body').innerText()).includes('Strategic Alignment Health Check'), 15000));
  await open(page);
  await page.getByRole('button', { name: 'Carry on with my new version' }).click();
  pass(`${tag}: it carries on where it was left`, await onQuestion(page, 'What is your team trying to achieve?') && (await page.locator('.ds-guide-body textarea').inputValue()).endsWith('and keep it so'));
  noProblems(b, `${tag}, draft`);
  await b.ctx.close();
});

part('newteam', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page);
  await page.getByRole('button', { name: 'Add another team' }).click();
  pass(`${tag}: New team asks which team`, await onQuestion(page, 'Which team is this Health Check for?'));
  pass(`${tag}: … with its nudge`, (await text(page, '.ds-guide-nudge, .ds-guide-nudges')).includes('Use the name your organisation knows it by.'));
  await checkScreen(b, `${tag}, New team`, { layer: '.ds-guide', back: GUIDE_BACK });
  await page.screenshot({ path: join(out, `team-${w}-${mode}.png`) });
  await pressNext(page);
  pass(`${tag}: Next with no name says so, never greyed`, (await text(page, '.ds-guide-problem')).includes('Type the team’s name to carry on.'));
  await page.getByLabel('Team').fill('leadership team');
  await pressNext(page);
  pass(`${tag}: a name already used says so`, (await text(page, '.ds-guide-problem')).includes('You already have a team with that name.'));
  await page.getByLabel('Team').fill('Sales team');
  await pressNext(page);
  await onQuestion(page, 'What is your team trying to achieve?');
  await page.locator('.ds-guide-body textarea').fill('Win the north of England by 2028');
  await pressNext(page);
  await typeRows(page, ['Trusted by regional buyers', 'A team that sells value']);
  await pressNext(page); await pressNext(page);
  await typeRows(page, ['Regional office', 'Value selling course']);
  await pressNext(page);
  const done = await answerAll(page);
  pass(`${tag}: the new team’s results`, done && (await text(page, '.ds-page-meta')).includes('Sales team'));
  pass(`${tag}: no Compare with one version`, await page.getByRole('button', { name: 'Compare two versions' }).count() === 0);
  await page.locator('.hc-back').click();
  await onPage(page, /^\/strategic-alignment$/);
  pass(`${tag}: Sales team is on the team list`, await until(async () => (await page.locator('main .ds-results-head').allInnerTexts()).map((t) => t.trim().toLowerCase()).includes('sales team')), JSON.stringify(await page.locator('main .ds-results-head').allInnerTexts()));
  // A new team closed with only its name is let go (M7).
  await page.getByRole('button', { name: 'Add another team' }).click();
  await onQuestion(page, 'Which team is this Health Check for?');
  const before = b.store.rows.length;
  await page.locator('.ds-guide-close').click();
  await onPage(page, /^\/strategic-alignment$/);
  pass(`${tag}: a new team closed with nothing typed is let go`, b.store.rows.length === before);
  noProblems(b, `${tag}, new team`);
  await b.ctx.close();
});

part('compare', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page, `${BASE}/version/${IDS.lt3}`);
  await resultsShown(page);
  await page.getByRole('button', { name: 'Compare two versions' }).click();
  pass(`${tag}: Compare opens`, await until(async () => (await text(page, '.ds-page-title')).toUpperCase() === 'COMPARE TWO VERSIONS'));
  const dds = await page.locator('main .ds-dropdown-btn, main button[aria-haspopup=listbox]').allInnerTexts();
  pass(`${tag}: the drop-downs show the versions’ names only`, JSON.stringify(dds.map((t) => t.trim())) === JSON.stringify(['July Health Check', 'October Health Check']), JSON.stringify(dds));
  const head = await text(page, 'main .ds-headline');
  pass(`${tag}: it leads with one sentence, never a figure`, /^(\d+ (more|fewer) important projects? (is|are) moving well than on Tue 14 Jul\.|The same number of important projects is moving well as on Tue 14 Jul\.)$/.test(head), head);
  pass(`${tag}: then the counts`, /moving well on Tue 27 Oct, and \d+ of \d+ (was|were) on Tue 14 Jul\.$/.test(await text(page, 'main .hc-headline-rest')));
  const heads = (await page.locator('main .ds-results-head').allInnerTexts()).map((h) => h.trim().toUpperCase());
  pass(`${tag}: the chart before How progress moved`, JSON.stringify(heads) === JSON.stringify(['HOW PROJECTS MOVED', 'HOW PROGRESS MOVED', 'PROJECTS ADDED AND REMOVED']), JSON.stringify(heads));
  pass(`${tag}: dashed rings where projects were`, await page.locator('.hc-chart-was').count() > 0);
  const moves = await page.locator('.hc-cmp-move').allInnerTexts();
  pass(`${tag}: rises first, in mint`, moves.length > 0 && await page.locator('.hc-cmp-move').first().locator('.hc-cmp-up').count() === 1, JSON.stringify(moves));
  pass(`${tag}: added and no longer listed`, (await text(page, '.hc-cmp-two')).includes('Hiring plan for 2027') && (await text(page, '.hc-cmp-two')).includes('Rebrand'));
  pass(`${tag}: no coral button`, await page.locator('main .ds-btn--primary').count() === 0);
  pass(`${tag}: Talk it through with Tim, the coach’s chat`, await page.getByRole('button', { name: 'Talk it through with Tim' }).count() <= 1);
  const order = await page.evaluate(questionsBeforeCharts);
  pass(`${tag}: nothing asks before the chart`, order.length === 0, order.join(' | '));
  await checkScreen(b, `${tag}, Compare`, { coral: 0, back: PAGE_BACK });
  await page.screenshot({ path: join(out, `compare-${w}-${mode}.png`) });
  await page.screenshot({ path: join(out, `compare-${w}-${mode}-full.png`), fullPage: true });
  // Choosing a later version older than the earlier one swaps the two.
  await page.locator('main .ds-dropdown-btn, main button[aria-haspopup=listbox]').nth(1).click();
  await page.getByRole('option', { name: 'April Health Check' }).click();
  await sleep(600);
  const after = (await page.locator('main .ds-dropdown-btn, main button[aria-haspopup=listbox]').allInnerTexts()).map((t) => t.trim());
  pass(`${tag}: a later version older than the earlier swaps the two`, JSON.stringify(after) === JSON.stringify(['April Health Check', 'July Health Check']), JSON.stringify(after));
  pass(`${tag}: … and the sentence names the earlier one`, (await text(page, 'main .ds-headline')).includes('Fri 3 Apr'));
  noProblems(b, `${tag}, compare`);
  await b.ctx.close();
});

part('edit', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page, `${BASE}/version/${IDS.pt1}`);
  await resultsShown(page);
  await page.getByRole('button', { name: 'Edit the objective' }).click();
  pass(`${tag}: Edit opens the objective`, await onQuestion(page, 'What is your team trying to achieve?'));
  pass(`${tag}: … with Save my edit`, (await text(page, '.ds-guide-next')).toUpperCase() === 'SAVE MY EDIT');
  await page.locator('.ds-guide-body textarea').fill('Make Kestrel the product customers recommend first in Europe.');
  await pressNext(page);
  pass(`${tag}: Save my edit goes straight back to the results`, await resultsShown(page) && (await text(page, '.hc-objective')).includes('first in Europe'));
  pass(`${tag}: … with "Saved"`, await hasToast(page, 'Saved'));
  pass(`${tag}: … and saves the version, still finished`, await until(async () => b.store.writes.some((r) => r.id === IDS.pt1 && r.status === 'completed' && r.form_data.data.objective.includes('first in Europe'))));
  // A project's row opens its own questions, then the results again.
  await page.locator('.hc-prow:not(.hc-prow--head)').first().click();
  pass(`${tag}: a project’s row opens its questions`, await onQuestion(page, 'contribute to'));
  const done = await answerAll(page);
  pass(`${tag}: … and comes back to the results`, done);
  noProblems(b, `${tag}, edit`);
  await b.ctx.close();
});

part('delete', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  await open(page, `${BASE}/version/${IDS.pt1}`);
  await resultsShown(page);
  await page.getByRole('button', { name: 'Delete this version' }).click();
  await page.locator('[role=dialog] .ds-btn, [role=alertdialog] .ds-btn').filter({ hasText: /delete/i }).first().click();
  pass(`${tag}: "Deleted" with Undo`, await hasToast(page, 'Deleted') && (await toastText(page)).includes('Undo'));
  pass(`${tag}: … back on Your teams, without the Product team`, await onPage(page, /^\/strategic-alignment$/) && !(await page.locator('main .ds-results-head').allInnerTexts()).map((t) => t.toLowerCase()).includes('product team'));
  pass(`${tag}: … deleted`, b.store.deletes.includes(IDS.pt1));
  await page.locator('.ds-toast button').filter({ hasText: 'Undo' }).click();
  pass(`${tag}: Undo puts it back`, await until(async () => (await page.locator('main .ds-results-head').allInnerTexts()).map((t) => t.trim().toLowerCase()).includes('product team')) && b.store.rows.some((r) => r.id === IDS.pt1));
  // Deleting a team takes every version.
  await open(page, `${BASE}/version/${IDS.lt2}`);
  await resultsShown(page);
  await page.getByRole('button', { name: 'Delete this team' }).click();
  pass(`${tag}: deleting a team says how many versions go`, (await text(page, '[role=dialog], [role=alertdialog]')).includes('3 versions'));
  await page.locator('[role=dialog] .ds-btn, [role=alertdialog] .ds-btn').filter({ hasText: /delete/i }).first().click();
  pass(`${tag}: the team goes`, await until(async () => [IDS.lt1, IDS.lt2, IDS.lt3].every((id) => b.store.deletes.includes(id))));
  noProblems(b, `${tag}, delete`);
  await b.ctx.close();
});

part('old', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: [oldRow(null)], dir: out });
  const { page } = b;
  await open(page);
  pass(`${tag}: an older page’s Health Check is a team with one version`, (await text(page, 'main .ds-results-head')).toLowerCase() === 'board of directors' && await page.locator('.ds-version-row').count() === 1);
  await page.locator('.ds-version-row').click();
  await resultsShown(page);
  pass(`${tag}: it opens on its results`, (await text(page, '.hc-objective')) === 'Grow the business to £20m by 2027');
  pass(`${tag}: resource it never had reads Not rated`, (await text(page, '.hc-ptab')).includes('Not rated'));
  pass(`${tag}: nothing is written by opening it`, b.store.writes.length === 0);
  await page.screenshot({ path: join(out, `old-${w}-${mode}.png`) });
  // From My Plans: its row opens the same version.
  await page.goto(`${APP}/my-plans?area=strategic`);
  await page.getByText('Board of directors').first().click();
  pass(`${tag}: My Plans opens it in the Health Check`, await onPage(page, new RegExp(`/strategic-alignment/version/${IDS.old}$`), 15000));
  noProblems(b, `${tag}, old`);
  await b.ctx.close();
});

part('addresses', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page } = b;
  for (const old of ['/goal-setting', '/risks-assessment', '/strategies', '/critical-success-factors', '/project-list', '/project-matrix', '/project-progress', '/project-scatter']) {
    await page.goto(`${APP}${old}?from=old#here`);
    const ok = await until(async () => { const u = new URL(page.url()); return u.pathname === BASE && u.search === '?from=old' && u.hash === '#here'; });
    pass(`${tag}: ${old} goes to the Health Check with its query and hash`, ok, page.url().replace(APP, ''));
  }
  // An old saved item handed over in the state opens that version.
  for (const old of ['/goal-setting', '/decision-summary']) {
    await open(page);
    await page.evaluate(([path, id]) => {
      window.history.pushState({ usr: { decisionId: id }, key: 'old', idx: 1 }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    }, [old, IDS.lt2]);
    pass(`${tag}: ${old} with a saved Health Check opens that version`, await onPage(page, new RegExp(`/version/${IDS.lt2}$`), 15000));
  }
  // The Strategic hub: its tile and its teams.
  await page.goto(`${APP}/strategic`);
  await page.locator('.ds-hub-team').first().waitFor({ timeout: 15000 });
  const href = await page.locator('a[href="/strategic-alignment"]').count();
  pass(`${tag}: the hub’s tile points at the Health Check`, href >= 1);
  await page.locator('.ds-hub-team').first().click();
  pass(`${tag}: a hub team opens its newest version`, await onPage(page, new RegExp(`/version/${IDS.lt3}$`)));
  noProblems(b, `${tag}, addresses`);
  await b.ctx.close();
});

part('offline', async ({ browser, w, mode, tag }) => {
  const b = await insidePage(browser, w, mode, { rows: m7Rows(null), dir: out });
  const { page, ctx } = b;
  await open(page, `${BASE}/new-team`);
  await onQuestion(page, 'Which team is this Health Check for?');
  await page.getByLabel('Team').fill('Offline team');
  await pressNext(page);
  await page.locator('.ds-guide-body textarea').fill('Keep going on a flight');
  await pressNext(page);
  await typeRows(page, ['Keep working']);
  await pressNext(page); await pressNext(page);
  await typeRows(page, ['Write on the plane']);
  await pressNext(page);
  await ctx.setOffline(true);
  const done = await answerAll(page);
  pass(`${tag}: finishing offline shows the results`, done);
  pass(`${tag}: … and says "Will sync"`, await hasToast(page, 'Will sync'));
  pass(`${tag}: nothing reached the database while offline`, !b.store.rows.some((r) => r.form_data?.team?.name === 'Offline team'));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  pass(`${tag}: back online, it is sent`, await until(async () => b.store.rows.some((r) => r.form_data?.team?.name === 'Offline team' && r.status === 'completed'), 30000));
  b.problems.splice(0, b.problems.length, ...b.problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/.test(p)));
  noProblems(b, `${tag}, offline`);
  await b.ctx.close();
});

// One real save, on the test database: made through the page, read back, then deleted.
part('real', async ({ browser, w, mode, tag }) => {
  const env = readEnv();
  const { db, me } = await clientDb(env);
  const b = await insidePage(browser, w, mode, { rows: null, dir: out });
  const { page } = b;
  let id = null;
  try {
    await open(page, `${BASE}/new-team`);
    await onQuestion(page, 'Which team is this Health Check for?');
    await page.getByLabel('Team').fill('Inside flow test team');
    await pressNext(page);
    await page.locator('.ds-guide-body textarea').fill('A real save through the page');
    await pressNext(page);
    await typeRows(page, ['One factor']);
    await pressNext(page); await pressNext(page);
    await typeRows(page, ['One project']);
    await pressNext(page);
    const done = await answerAll(page);
    pass(`${tag}: a real Health Check reaches its results`, done);
    id = new URL(page.url()).pathname.split('/').pop();
    let row = null;
    await until(async () => { const { data } = await db.from('decisions').select('id, tool_type, title, status, form_data').eq('id', id).limit(1); row = data?.[0] || null; return row?.status === 'completed'; }, 15000);
    pass(`${tag}: saved in decisions as strategic-alignment, in the inside shape`, row && row.tool_type === 'strategic-alignment' && row.title === 'Inside flow test team' && row.form_data.shape === 2 && row.form_data.team.name === 'Inside flow test team', JSON.stringify(row && { s: row.status, shape: row.form_data?.shape }));
    noProblems(b, `${tag}, real`);
  } finally {
    await page.screenshot({ path: join(out, `real-${w}-${mode}.png`) }).catch(() => {});
    await db.from('decisions').delete().eq('user_id', me).eq('tool_type', 'strategic-alignment').eq('title', 'Inside flow test team');
    const { data } = await db.from('decisions').select('id').eq('user_id', me).eq('title', 'Inside flow test team');
    pass(`${tag}: what the test made is deleted`, (data || []).length === 0);
    await b.ctx.close();
  }
});

// ---------------------------------------------------------------- the run
const browser = await chromium.launch();
try {
  for (const w of SIZES) {
    for (const mode of MODES) {
      const phone = w <= 600;
      for (const [name, fn] of PARTS) {
        if (ONLY && !ONLY.test(name)) continue;
        // The slow walks and the real save run once a size (dark); the screens run in both modes.
        if (['newversion', 'draft', 'newteam', 'edit', 'delete', 'old', 'addresses', 'offline'].includes(name) && mode !== MODES[0]) continue;
        if (name === 'real' && (w !== SIZES[0] || mode !== MODES[0])) continue;
        const tag = `${phone ? 'Phone' : 'Desktop'} ${w} ${mode}, ${name}`;
        try {
          await fn({ browser, w, mode, phone, tag });
        } catch (error) {
          pass(`${tag}: ran`, false, `${error.message}`.split('\n')[0]);
        }
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
