// The Health Check inside the portal against its mock-up, M7 version 8.2,
// part by part: the mock-up file itself and the built page on the same
// screen, Desktop (1440) and Phone (390, M7's phone frame), dark and light,
// every screen in M7's switcher that the inside build draws. Positions and
// sizes to half a pixel, fonts, sizes, letter-spacing and colours, and every
// visible sentence word for word.
//
//   node tests/healthcheck/compare-m7.mjs [folder for screenshots]
//   ONLY=teams,results WIDTHS=1440 MODES=dark   to run a part of it
//   M7_FILE=<path>   the mock-up (default: ~/Downloads/clarity-health-check-calm/m7-health-check-inside.html)
//
// The built page runs on the dev server signed in as the test client, with
// the Health Check's reads and writes answered by a stand-in holding M7's
// own teams (tests/healthcheck/inside-shared.mjs): nothing is saved and
// nothing is sent. The mock-up's one outside request, DM Sans from Google
// Fonts, is answered with the same @fontsource files the app uses.
//
// How the two are lined up: M7 draws its screens inside a review frame
// (1180px on a laptop, a 390px phone with a 47px status bar), so each part
// is measured from the title (a page in the portal frame), or from the %
// bar (a guided screen), or from a panel's own corner; a bottom bar from the
// bottom of the screen. The portal's own header (the real one: the real
// person's Mission) is left out of the words. Differences that are meant
// are listed in ALLOW with why; anything else fails.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareParts, compareWords, makeReport, measureParts, words } from '../phase8/compare-lib.mjs';
import { BASE, IDS, M7_FILE, insidePage, m7Rows, sleep } from './inside-shared.mjs';
import { backChevron, titleIcons } from './hc-measure.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-compare-m7');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1440, 390];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const report = makeReport();
const { pass, note, results } = report;
const LT = '7a000000-0000-4000-8000-00000000a001';

// ---------------------------------------------------------------- the parts of each screen
const TITLE = [
  ['the title', '.ptl', '.ds-page-title', 0, ['pos', 'text']],
];
const META = [['the team under the title', '.meta span', '.ds-page-meta span', 0, ['pos', 'text']]];
const BACK = [['Back', '.bkl', '.hc-back', 0, ['pos', 'text']]];
const ICONS = [
  ['the play icon', '#h1 .ic1 svg', '.ds-page-title .ds-play svg', 0, ['box']],
  ['the eye', '#h1 .eye1 svg', '.ds-page-title .ds-who:not(.ds-play) svg', 0, ['box']],
];
const GBAR = [
  ['the % bar', '.qpct', '.ds-guide-pct-track', 0, ['box', 'fill']],
  ['the tool’s name', '.gl b', '.ds-guide-name', 0, ['pos', 'text']],
  ['the question', '.qh', '.ds-guide-question', 0, ['pos', 'text']],
  ['the nudge', '.nudge', '.ds-guide-nudge', 0, ['pos', 'text']],
  ['the button', '.gft .btn', '.ds-guide-next', 0, ['foot', 'text', 'fill']],
];
const SCREENS = {
  teams: [...TITLE, ...ICONS,
    ['the tip', '.tipb', '.ds-oneoff-tip', 0, ['box', 'edge']],
    ['the tip’s words', '.tipb p', '.ds-oneoff-tip p', 0, ['pos', 'text']],
    ['the tip’s close', '.tipb .iconbtn', '.ds-oneoff-tip button', 0, ['box']],
    ['the first team’s name', '.sech h2', '.ds-results-head', 0, ['pos', 'text']],
    ['the first version', '.vr', '.ds-version-row', 0, ['box']],
    ['its name', '.vr b', '.ds-version-row b', 0, ['pos', 'text']],
    ['its headline', '.vr small', '.ds-version-row small', 0, ['pos', 'text']],
    ['its date', '.vr .vd', '.ds-version-date', 0, ['pos', 'text']],
    ['the third version', '.vr', '.ds-version-row', 2, ['box']],
    ['Start a new version', '.tacts .text', '.hc-in-tacts button', 0, ['pos', 'text']],
    ['the second team’s name', '.sech h2', '.ds-results-head', 1, ['pos', 'text']],
    ['its version', '.vr', '.ds-version-row', 3, ['box']],
    ['Add another team', '.addrow .ghost', '.hc-in-add .ds-btn', 0, ['box', 'text', 'edge']]],
  results: [...BACK, ...TITLE, ...ICONS, ...META,
    ['the date under the title', '.meta span', '.ds-page-meta span', 1, ['pos', 'text']],
    ['the headline', '.headl', '.ds-headline', 0, ['pos', 'text']],
    ['the line under it', '.headl2', '.hc-headline-rest', 0, ['pos', 'text']],
    ['the chart’s heading', '.sech h2', '.ds-results-head', 0, ['pos', 'text']],
    ['the chart', '.dch svg', '.hc-chart svg', 0, ['box']],
    ['Projects', '.sech h2', '.ds-results-head', 1, ['pos', 'text']],
    ['Questions to start with', '.sech h2', '.ds-results-head', 4, ['pos', 'text']],
    ['Versions', '.sech h2', '.ds-results-head', 5, ['pos', 'text']],
    ['the Versions line', '.kp p', '.hc-in-versions .hc-keep p', 0, ['pos', 'text']],
    ['Start a new version', '.kp .ghost', '.hc-in-versions .ds-btn', 0, ['box', 'text', 'edge']],
    ['the Compare line', '.kp p', '.hc-in-versions .hc-keep p', 1, ['pos', 'text']],
    ['Compare two versions', '.kp .ghost', '.hc-in-versions .ds-btn', 1, ['box', 'text', 'edge']],
    ['Download my PDF', '.gft .btn', '.ds-bottombar .ds-btn', 0, ['foot', 'text', 'fill']]],
  compare: [...BACK, ...TITLE, ...META,
    ['Earlier version', '.dts .flab', '.hc-cmp-pick .ds-label-row-text, .hc-cmp-pick label', 0, ['pos', 'text']],
    ['its drop-down', '.dts .dd', '.hc-cmp-pick .ds-dd', 0, ['box', 'edge']],
    ['Later version', '.dts .flab', '.hc-cmp-pick .ds-label-row-text, .hc-cmp-pick label', 1, ['pos', 'text']],
    ['its drop-down', '.dts .dd', '.hc-cmp-pick .ds-dd', 1, ['box']],
    ['the sentence', '.headl', '.ds-headline', 0, ['pos', 'text']],
    ['the counts', '.headl2', '.hc-headline-rest', 0, ['pos', 'text']],
    ['How projects moved', '.sech h2', '.ds-results-head', 0, ['pos', 'text']],
    ['the chart', '.dch svg', '.hc-chart svg', 0, ['box']],
    ['How progress moved', '.sech h2', '.ds-results-head', 1, ['pos', 'text']],
    ['the first move', '.mvr', '.hc-cmp-move', 0, ['box']],
    ['its words', '.mvr span', '.hc-cmp-move span', 0, ['pos', 'text']],
    ['its change, in mint', '.mvr .up', '.hc-cmp-move .hc-cmp-up', 0, ['pos', 'text']],
    ['the same line', '.same', '.hc-cmp-same', 0, ['pos', 'text']],
    ['Projects added and removed', '.sech h2', '.ds-results-head', 2, ['pos', 'text']],
    ['Added since', '.two .flab', '.hc-cmp-label', 0, ['pos', 'text']],
    ['No longer listed', '.two .flab', '.hc-cmp-label', 1, ['pos', 'text']],
    ['an added project', '.kn', '.hc-cmp-name', 0, ['box', 'text']],
    ['Talk it through', '.endb .text', '.hc-end .ds-link', 0, ['pos', 'text']]],
  newv: [...GBAR,
    ['the eye', '.qh .eye1 svg', '.ds-guide-question .ds-who svg', 0, ['box']],
    ['the soft panel', '.exb', '.hc-in-copied', 0, ['box', 'fill']],
    ['the team in it', '.exb .k2', '.hc-in-k2', 0, ['pos', 'text']],
    ['the version copied', '.exb p', '.hc-in-copied p', 1, ['pos', 'text']],
    ['what is copied', '.lead', '.hc-lead', 0, ['pos', 'text']],
    ['the earlier ratings', '.lead', '.hc-lead', 1, ['pos', 'text']]],
  team: [...GBAR,
    ['the eye', '.qh .eye1 svg', '.ds-guide-question .ds-who svg', 0, ['box']],
    ['the Team label', '.field label', '.hc-in-team-field label, .hc-in-team-field .ds-label-row-text', 0, ['pos', 'text']],
    ['the Team box', '#tname', '.hc-in-team-field input', 0, ['box', 'edge', 'text']]],
  example: [...BACK, ...TITLE, ...META,
    ['the soft panel', '.exb', '.hc-example-intro', 0, ['box', 'fill']],
    ['the headline', '.headl', '.ds-headline', 0, ['pos', 'text']],
    ['Start my Health Check', '.endb .btn', '.hc-end .ds-btn', 0, ['box', 'text', 'fill']]],
};
const PANELS = {
  who: [
    ['the panel', '.sheet', '[role=dialog]:not(.ds-guide) .ds-dialog, [role=dialog]:not(.ds-guide)', 0, ['box']],
    ['the panel’s title', '.shh h2', '.ds-dialog-title', 0, ['pos', 'text']],
    ['Only you', '.who .opt', '.ds-sheet-options .ds-option', 0, ['box', 'text']],
    ['You and Tim (chosen)', '.who .opt', '.ds-sheet-options .ds-option', 1, ['box', 'text']]],
  pdf: [
    ['the panel', '.sheet', '[role=dialog]:not(.ds-guide)', 0, ['box']],
    ['the panel’s title', '.shh h2', '.ds-dialog-title', 0, ['pos', 'text']],
    ['Light, for printing', '.ddl button', '[role=dialog]:not(.ds-guide) .ds-option', 0, ['box', 'text']],
    ['Dark, for sharing', '.ddl button', '[role=dialog]:not(.ds-guide) .ds-option', 1, ['box', 'text']]],
};
const ANCHOR = { teams: ['#h1', '.ds-page-title'], results: ['#h1', '.ds-page-title'], compare: ['#h1', '.ds-page-title'], example: ['#h1', '.ds-page-title'], newv: ['.qpct', '.ds-guide-pct-track'], team: ['.qpct', '.ds-guide-pct-track'], who: ['.sheet', '[role=dialog]:not(.ds-guide)'], pdf: ['.sheet', '[role=dialog]:not(.ds-guide)'] };

// ---------------------------------------------------------------- meant differences, each with why
const SHARED_PANEL = 'the portal’s shared side panel and the eye’s shared panel (WhoSees, SlidePanel), as M9’s and M7b’s comparisons accept';
const DATES = 'M7’s team list puts its newest version first by the date in its script (27 Oct, 14 Jul, 3 Apr): the same here; only the drop-downs and words follow';
const ALLOW = new Map([
  ...['left', 'top', 'width', 'height'].map((w) => [`who|*|${w}`, SHARED_PANEL]),
  ...['left', 'top', 'width', 'height'].map((w) => [`pdf|*|${w}`, SHARED_PANEL]),
  ['who|the panel’s title|text size', SHARED_PANEL],
  ['*|its drop-down|edge', 'every outlined edge reaches 3 to 1 (rule 8a): the shared drop-down takes --field-line'],
  ['*|Add another team|edge', 'every outlined edge reaches 3 to 1 (rule 8a): outlined buttons take --field-line'],
  ['*|Start a new version|edge', 'every outlined edge reaches 3 to 1 (rule 8a)'],
  ['*|Compare two versions|edge', 'every outlined edge reaches 3 to 1 (rule 8a)'],
  ['*|the Team box|edge', 'every outlined edge reaches 3 to 1 (rule 8a)'],
]);
const allowed = (screen, part, what) => ALLOW.get(`${screen}|${part}|${what}`) || ALLOW.get(`*|${part}|${what}`) || ALLOW.get(`${screen}|*|${what}`) || null;
void DATES;
// Sentences on one side only, as meant.
const OFFER = 'the first-visit Quick guide offer row is the Quick guide builder’s (a shared offer row with its Not now counting; Tim, 14 Nov, 10:14 to 10:19); the page leaves its one slot for it, so the title’s play icon shows meanwhile. Compared here as M7 draws Your teams once the offer has gone (its one-off tip showing)';
const WORDS_M7_ONLY = new Map([
  ['teams', [['Watch the Quick guide', OFFER], ['~1 minute', OFFER], ['Not now', OFFER]]],
  ['compare', [['Talk it through with Tim', 'shown only where the portal’s Chat to Tim leads somewhere real: the coach’s chat (useStartChat) opens only for a client with a coach and their chat set up; the test client’s chat isn’t, so the link stays out here']]],
]);
const WORDS_BUILT_ONLY = new Map([
  ['results', [['Delete this version', 'M7 draws no delete: the portal’s quiet Delete inside the opened item (Tim, 5 Nov), as the prompt asks'], ['Delete this team', 'as above, for the whole team']]],
]);
const ctx0 = { report, allowed, mockName: 'M7' };
const ctxWords = { report, mockOnly: WORDS_M7_ONLY, builtOnly: WORDS_BUILT_ONLY, mockName: 'M7' };

// ---------------------------------------------------------------- M7 itself
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;
async function mockOpen(browser, width, mode) {
  const phone = width < 600;
  const ctx = await browser.newContext({ viewport: { width: phone ? 600 : width, height: 1300 }, colorScheme: mode, locale: 'en-GB', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
    const w = /\/(400|500)/.exec(r.request().url())[1];
    r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
  });
  await ctx.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(`file://${M7_FILE}`);
  await page.locator(`.rp[data-t="${mode}"]`).click();
  await page.locator(`.rp[data-w="${phone ? 'p' : 'd'}"]`).click();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
async function mockShow(page, screen) {
  await page.evaluate((k) => {
    const st = window.__st;
    if (k === 'teams') { window.__jump('teams'); st.gcard = false; st.tip = true; window.__render(); }
    else if (k === 'pdf') { window.__jump('results'); window.__act('pdf'); }
    else if (k === 'example') { window.__jump('example'); }
    else window.__jump(k);
  }, screen);
  await sleep(500);
  await page.mouse.move(2, 2);
}

// ---------------------------------------------------------------- the built page
const pressNext = async (page) => { await sleep(450); await page.locator('.ds-guide-next').click(); await sleep(300); };
const BUILT = {
  teams: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}`); await page.locator('.ds-oneoff-tip').waitFor(); },
  results: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}/version/${IDS.lt3}`); await page.locator('.ds-headline').waitFor(); },
  compare: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}/compare?team=${LT}&a=${IDS.lt2}&b=${IDS.lt3}`); await page.locator('.ds-headline').waitFor(); },
  newv: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}/new?team=${LT}`); await page.locator('.ds-guide-question').waitFor(); },
  team: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}/new-team`); await page.locator('.ds-guide-question').waitFor(); },
  example: async (page) => { await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}${BASE}/example`); await page.locator('.ds-headline').waitFor(); },
  who: async (page) => { await BUILT.results(page); await page.locator('.ds-page-title .ds-who:not(.ds-play)').click(); await page.locator('[role=dialog]:not(.ds-guide)').waitFor(); },
  pdf: async (page) => { await BUILT.results(page); await page.locator('.ds-bottombar .ds-btn').click(); await page.locator('[role=dialog]:not(.ds-guide)').waitFor(); },
};
void pressNext;
const HIDE = '.tipx, .ds-sr, .hdr, header, .ds-header, [class*=hdr-], .fabp, .pbar, .ds-orb, .ctip, #tip, .ds-infopop, .ds-tip';

// ---------------------------------------------------------------- the run
const want = (screen) => !ONLY || ONLY.includes(screen);
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const phone = width < 600;
      const tagBase = `${phone ? 'Phone' : 'Desktop'} ${mode}`;
      const mock = await mockOpen(browser, width, mode);
      for (const screen of [...Object.keys(SCREENS), ...Object.keys(PANELS)]) {
        if (!want(screen)) continue;
        const tag = `${tagBase}, ${screen}`;
        const panel = Boolean(PANELS[screen]);
        const parts = panel ? PANELS[screen] : SCREENS[screen];
        let b = null;
        try {
          await mockShow(mock.page, screen);
          b = await insidePage(browser, width, mode, { rows: m7Rows(null), height: phone ? 844 : 860, scale: 2, dir: out });
          await BUILT[screen](b.page);
          await b.page.evaluate(() => document.fonts.ready);
          await b.page.mouse.move(2, 2);
          await sleep(800);
          const [ma, ba] = ANCHOR[screen];
          const m = await mock.page.evaluate(measureParts, { parts, mock: true, anchor: ma, bottom: '#fr' });
          const bm = await b.page.evaluate(measureParts, { parts, mock: false, anchor: ba, bottom: null });
          compareParts(ctx0, tag, screen, parts, m, bm, phone);
          const guided = ['newv', 'team'].includes(screen);
          const mw = await mock.page.evaluate(words, { root: panel ? '.sheet' : guided ? '#fr' : '#main', hide: HIDE });
          const bw = await b.page.evaluate(words, { root: panel ? '[role=dialog]:not(.ds-guide)' : guided ? '.ds-guide' : 'main.hc-in-page', hide: HIDE });
          // The bottom bar is outside the page's main on both: compared as a part above.
          compareWords(ctxWords, tag, screen, mw.filter((x) => x !== 'Download my PDF'), bw);
          if (['results', 'compare', 'example'].includes(screen)) {
            const mb = await backChevron(mock.page, { button: '.bkl', label: '.bkl', content: '#h1' });
            const bb = await backChevron(b.page, { button: '.hc-back', label: '.hc-back', content: '.ds-page-title' });
            const say = (x) => (x ? `edge ${x.edge.toFixed(2)}, label ${x.gap.toFixed(2)} after` : 'not found');
            pass(`${tag}: Back’s chevron has its visible edge where M7’s is`, Boolean(mb && bb) && Math.abs(mb.edge - bb.edge) <= 0.5, `M7 ${say(mb)}; built ${say(bb)}`);
            if (mb && bb && Math.abs(mb.gap - bb.gap) > 0.5) note(`${tag}: Back’s label is ${bb.gap.toFixed(2)}px after the chevron (M7 ${mb.gap.toFixed(2)}): the portal’s Back puts its label 14px after the chevron (rule 29t), as M7b’s comparison accepts`);
          }
          if (['teams', 'results'].includes(screen)) {
            const mi = await titleIcons(mock.page, { heading: '#h1', play: '#h1 .ic1 svg', eye: '#h1 .eye1 svg' });
            const bi = await titleIcons(b.page, { heading: '.ds-page-title', play: '.ds-page-title .ds-play svg', eye: '.ds-page-title .ds-who:not(.ds-play) svg' });
            const say = (x) => (x ? `${x.gapTitle.toFixed(2)} after the title, ${x.gapPair.toFixed(2)} between; middles ${x.offPlay.toFixed(2)} and ${x.offEye.toFixed(2)}` : 'not found');
            for (const [label, key] of [['the play icon is as far from the title as M7’s', 'gapTitle'], ['the eye is as far from the play icon as M7’s', 'gapPair'], ['the play icon is as high as M7’s', 'offPlay'], ['the eye is as high as M7’s', 'offEye']]) {
              pass(`${tag}: ${label}`, Boolean(mi && bi) && Math.abs(mi[key] - bi[key]) <= 0.5, `M7 ${say(mi)}; built ${say(bi)}`);
            }
          }
          pass(`${tag}: no console, page or HTTP errors`, b.problems.length === 0, [...new Set(b.problems)].join(' | '));
          await b.page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) });
          await mock.page.locator('#fr').screenshot({ path: join(out, `${screen}-${width}-${mode}-m7.png`) });
        } catch (error) {
          pass(`${tag}: compared`, false, `${error.message}`.split('\n')[0]);
        }
        if (b) await b.ctx.close();
      }
      await mock.ctx.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
const failures = report.failures();
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed, ${results.filter((r) => r.startsWith('NOTE')).length} notes. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
