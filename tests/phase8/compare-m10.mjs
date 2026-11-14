// The Visual tools against their mock-up, M10 (version 5.6), part by part:
// the mock-up file itself and the built page on the same screen, Desktop
// (1440) and Phone (390, M10's own phone frame: a 410px box with a 10px
// bezel), dark and light. Positions and sizes to half a pixel, fonts,
// sizes, letter-spacing and colours, and every visible sentence word for
// word. This file holds the Team performance check's screens; the
// Emotional wash's are added to TOOLS below in the same shape.
//
//   node tests/phase8/compare-m10.mjs [folder for screenshots]
//   ONLY=people,results WIDTHS=1440 MODES=dark   to run a part of it
//   WIDTHS=400   takes the built page's screenshots only (M10's phone is 390 wide)
//
// The built page runs on the TEST database as the invented test client
// (every other host, every server function and every email call is
// blocked). Each screen is opened from a check put on the device, as the
// tool itself keeps one while it is open, so nothing is saved to the
// database; what the tool keeps on the device is taken off at the end.
//
// How the two are lined up: M10 draws its screens inside a review frame,
// so each part is measured from the content's own corner (the left end
// and top of the % bar; the title on the results; a panel's title) and the
// bottom bar from the bottom of the screen. Differences that are meant
// are listed in ALLOW with why; anything else fails.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, M10, M10_FILE, TEAM_PATH, block, clearTeamCheck, m10Answers, panel, panelGone, readEnv, signIn, sleep, until, withCoach } from './shared.mjs';
import { compareParts, compareWords, makeReport, measureParts, words } from './compare-lib.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-compare-m10');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1440, 390];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];

const report = makeReport();
const { results, pass } = report;

// ---------------------------------------------------------------- the parts
const BAR = [
  ['the tool’s name', '.gl b', '.ds-guide-name', 0, ['pos', 'text']],
  // Its size only: the chevron is a mask turned 45 degrees, so its box says little about where it is
  // drawn. Its visible edge on the content's edge is read from the pixels in team-check.mjs, and its
  // middle on the capitals' middle in tests/phase5/chevrons.mjs.
  ['Back’s chevron', '.bk .chev', '.ds-guide-back .ds-chevron', 0, ['size']],
  ['close', '.gbar .iconbtn .x', '.ds-guide-close .ds-cross', 0, ['box']],
  ['the % bar', '.qpct', '.ds-guide-pct-track', 0, ['box']],
  ['how far the % bar is filled', '.qpct i', '.ds-guide-pct-track span', 0, ['size']],
];
const HEAD = [
  ['the question', '#h1', '.ds-guide-question', 0, ['pos', 'text']],
  ['the line under it', '.nudge', '.ds-guide-nudge', 0, ['pos', 'text']],
];
const COUNT = [['Person 1 of 5', '.qn', '.ds-guide-label', 0, ['pos', 'text']]];
const ANSWERS = [
  ['the first answer', '.opt', '.ds-guide-body .ds-answer', 0, ['box', 'text', 'edge']],
  ['the second answer', '.opt', '.ds-guide-body .ds-answer', 1, ['box']],
  ['the last answer', '.opt', '.ds-guide-body .ds-answer', 4, ['box']],
];
const SCREENS = {
  people: [...BAR, ...HEAD,
    ['the eye', '.eye1 svg', '.ds-guide-question .ds-who svg', 0, ['box']],
    ['the first person’s row', '.pr', '.ds-namerow', 0, ['box']],
    ['the first person’s name', '.pr b', '.ds-namerow-words b', 0, ['pos', 'text']],
    ['the first person’s role', '.pr small', '.ds-namerow-words small', 0, ['pos', 'text']],
    ['the first remove crosshair', '.pr .x', '.ds-namerow .ds-cross', 0, ['box']],
    ['the last person’s row', '.pr', '.ds-namerow', 4, ['box']],
    ['Add a person', '.addrow .ghost', '.tpc-add .ds-btn', 0, ['box', 'text', 'edge']],
    ['the coral button', '.gft .btn', '.ds-guide-next', 0, ['foot', 'text']],
    ['Finish later', '.gft .text', '.ds-guide-foot .ds-guide-skip', 0, ['foot', 'text']]],
  trust: [...BAR, ...COUNT, ...HEAD, ...ANSWERS,
    ['the first level’s line', '.opt small', '.ds-answer-hint', 0, ['pos', 'text']],
    ['the last level’s line', '.opt small', '.ds-answer-hint', 4, ['pos']]],
  align: [...BAR, ...COUNT, ...HEAD, ...ANSWERS],
  auto: [...BAR, ...COUNT, ...HEAD, ...ANSWERS],
  results: [BAR[0], BAR[2],
    ['the title', '#h1', '.ds-guide-title', 0, ['pos', 'text']],
    ['the eye', '.eye1 svg', '.ds-guide-title .ds-who svg', 0, ['box']],
    ['the opening sentence', '.headl', '.ds-headline', 0, ['pos', 'text']],
    ['Alignment and autonomy', '.sech', '.ds-results-head', 0, ['box', 'text']],
    ['the chart', '.dch svg', '.tpc-chart svg', 0, ['box']],
    ['Priya’s dot', '.dot .v', '.tpc-dot-mark', 0, ['box', 'colour', 'edge']],
    ['Tom’s dot', '.dot .v', '.tpc-dot-mark', 1, ['box', 'colour', 'edge']],
    ['Leila’s dot', '.dot .v', '.tpc-dot-mark', 4, ['box']],
    ['a dot’s tap area', '.dot circle:first-child', '.tpc-dot-tap', 0, ['size']],
    ['Priya’s name on the chart', '.dot text', '.tpc-dot-name', 0, ['box', 'text']],
    ['October’s dashed ring', '.dch svg > circle', '.tpc-chart-was', 0, ['box', 'edge']],
    ['Show as a table', '.change .text', '.ds-ctable-fold .ds-link', 0, ['pos', 'text']],
    ['Trust', '.sech', '.ds-results-head', 1, ['box', 'text']],
    ['the first trust row', '.trow', '.ds-steprow', 0, ['box']],
    ['its name', '.trow b', '.ds-steprow-name b', 0, ['pos', 'text']],
    ['its role', '.trow small', '.ds-steprow-name small', 0, ['pos', 'text']],
    ['its five steps', '.trow .lv', '.ds-steprow-bars', 0, ['box']],
    ['one step', '.trow .lv i', '.ds-steprow-bars i', 0, ['size', 'fill']],
    ['its level in words', '.trow .lw', '.ds-steprow-word', 0, ['pos', 'text']],
    ['Tom’s steps', '.trow .lv i', '.ds-steprow-bars i', 5, ['fill']],
    ['Tom’s level in words', '.trow .lw', '.ds-steprow-word', 1, ['text']],
    ['Daniel’s steps', '.trow .lv i', '.ds-steprow-bars i', 15, ['fill']],
    ['an empty step', '.trow .lv i', '.ds-steprow-bars i', 9, ['fill']],
    ['the last trust row', '.trow', '.ds-steprow', 4, ['box']],
    ['Edit who’s on the list', '.sec:nth-of-type(3) .change .text', '.ds-results-link .ds-link', 0, ['pos', 'text']],
    ['Questions to start with:', '.sech', '.ds-results-head', 2, ['box', 'text']],
    ['the first question', '.qi p', '.ds-startq', 0, ['pos', 'text']],
    ['the last question', '.qi p', '.ds-startq', 2, ['pos']],
    ['Add a to-do', '.gft .btn', '.ds-guide-next', 0, ['foot', 'text']],
    ['Download my PDF', '.gft .text', '.ds-guide-foot-aside .ds-link', 0, ['foot', 'text']]],
  table: [
    ['the table', '.tt', '.ds-ctable', 0, ['size']],
    ['the Person heading', '.tt thead th', '.ds-ctable thead th', 0, ['size', 'text']],
    ['the Alignment heading', '.tt thead th', '.ds-ctable thead th', 1, ['size', 'text']],
    ['the first row’s name', '.tt tbody th b', '.ds-ctable tbody th b', 0, ['text']],
    ['the first row’s role', '.tt tbody th small', '.ds-ctable tbody th small', 0, ['text']],
    ['the first row', '.tt tbody tr', '.ds-ctable tbody tr', 0, ['size']],
    ['the first alignment steps', '.tt .lv', '.ds-ctable .ds-stepbars', 0, ['size']],
    ['Priya’s alignment', '.tt .lv i', '.ds-ctable .ds-stepbars i', 0, ['fill']],
    ['Priya’s autonomy', '.tt .lv i', '.ds-ctable .ds-stepbars i', 5, ['fill']],
    ['Daniel’s alignment', '.tt .lv i', '.ds-ctable .ds-stepbars i', 30, ['fill']],
    ['Daniel’s autonomy', '.tt .lv i', '.ds-ctable .ds-stepbars i', 35, ['fill']],
    ['Leila’s alignment', '.tt .lv i', '.ds-ctable .ds-stepbars i', 40, ['fill']],
    ['the last row', '.tt tbody tr', '.ds-ctable tbody tr', 4, ['size']]],
};
const DIALOG = '[role=dialog]:not(.ds-guide)';
// Screens that are a panel over the page: their words, and the panel's own parts.
const PANELS = {
  addp: [
    ['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['text']],
    ['the name’s label', '.sheet .field label', `${DIALOG} .ds-field-label, ${DIALOG} label`, 0, ['text']],
    ['the name’s box', '.sheet .inp', `${DIALOG} input`, 0, ['size', 'text', 'edge']],
    ['the role’s box', '.sheet .inp', `${DIALOG} input`, 1, ['size']],
    ['Add this person', '.shf .btn', `${DIALOG} .ds-btn--primary`, 0, ['size', 'text']]],
  whoT: [['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['text']]],
  todo: [['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['text']]],
};

// ---------------------------------------------------------------- meant differences
// `${screen}|${part}|${what}` (a * matches any screen), each with why: Tim's
// own later rules, or the portal's one shared part where M10 copied an
// earlier design reference.
const EDGE = 'every outlined edge takes the edges colour, 3 to 1 (rule 8a; Tim, 12 Nov): M10’s parts were drawn with the fainter line';
const PANEL = 'the portal’s one shared slide-across panel and its fields (480px wide, 58px boxes, 15px questions, its own button size), as every other panel in the portal; M10’s panel is 460px';
const FONT = 'the portal ships DM Sans as two fixed files (regular and medium), M10 loads Google’s copy with its optical-size axis: at 22px this one question comes out 2px wider, just over the 704px column, so it takes a second line and what follows sits one line lower';
const EYE = 'the shared heading-with-eye part puts the eye 12px after the last letter’s box (rule 29d); M10 measures 2px less';
const WHO_PANEL = 'the eye’s panel is the portal’s shared small panel (22px title), as on the dashboard and in Get unstuck';
const NAME = 'M10 draws the name in its top bar about 1.4px higher than M9 does (its lines are set closer, 1.35); the calm frame is one part, so the built bar keeps M9’s place in every tool, with Back’s chevron centred on the name’s capitals (rule 29ao, measured by tests/phase5/chevrons.mjs)';
export const ALLOW = [
  ['*|the tool’s name|top', NAME],
  ['*|Add a person|edge', EDGE],
  ['*|the first answer|edge', EDGE],
  ['addp|the name’s box|edge', EDGE],
  ['addp|the name’s label|text size', PANEL],
  ['addp|the name’s box|width', PANEL],
  ['addp|the name’s box|height', PANEL],
  ['addp|the role’s box|width', PANEL],
  ['addp|the role’s box|height', PANEL],
  ['addp|Add this person|width', PANEL],
  ['addp|Add this person|text size', PANEL],
  ['addp|Add this person|letter-spacing', PANEL],
  ['align|the line under it|top', FONT],
  ['align|the first answer|top', FONT],
  ['align|the second answer|top', FONT],
  ['align|the last answer|top', FONT],
  ['*|the eye|left', EYE],
  ['whoT|the panel’s title|text size', WHO_PANEL],
];
const ALLOWED = new Map(Object.entries(JSON.parse(process.env.ALLOWED_JSON || '{}')));
for (const [key, why] of ALLOW) ALLOWED.set(key, why);
const allowed = (screen, part, what) => ALLOWED.get(`${screen}|${part}|${what}`) || ALLOWED.get(`*|${part}|${what}`) || ALLOWED.get(`*|*|${what}`);

// Sentences that differ on purpose, or are only on one side.
const SHARED_ADD = 'the add panel is the one shared panel (rule 31): what needs doing, which Strategy it serves, how much it will move it, then “Where should it go?”; M10 draws only the text box';
const OWN_PLAN = 'the test client’s own Strategies';
const MOCK_ONLY = new Map([
  ['todo', [['e.g. Ask Tom what would help him bring decisions to me early', 'the shared add panel has its own example']]],
]);
const BUILT_ONLY = new Map([
  ['todo', [
    ['e.g. Book a physio assessment', 'the shared add panel’s own example'],
    ['Which Strategy does it serve?', SHARED_ADD],
    ['Maintain my availability to do good work', OWN_PLAN],
    ['Deepen my coaching craft', OWN_PLAN],
    ['Grow through referrals', OWN_PLAN],
    ['Build The Clarity Portal', OWN_PLAN],
    ['How much will it move its Strategy?', SHARED_ADD],
    ['Low', SHARED_ADD], ['Medium', SHARED_ADD], ['High', SHARED_ADD],
    ['Where should it go?', SHARED_ADD],
    ['This week', SHARED_ADD], ['Backlog', SHARED_ADD], ['Don’t add it', SHARED_ADD],
    ['CANCEL', 'the shared panel keeps Cancel (step 4)'],
  ]],
]);

// ---------------------------------------------------------------- M10 itself
async function m10Open(browser, width, mode) {
  const phone = width < 600;
  // M10's review bar sits above the frame, so the window is taller than the frame.
  const ctx = await browser.newContext({ viewport: { width: phone ? 600 : width, height: 1300 }, colorScheme: mode, locale: 'en-GB' });
  // Only the fonts the mock-up asks for itself.
  await ctx.route(/^https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`file://${M10_FILE}`);
  await page.locator(`.rp[data-t="${mode}"]`).click();
  await page.locator(`.rp[data-w="${phone ? 'p' : 'd'}"]`).click();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
const M10_SCREEN = { table: 'results', todo: 'results' };
async function m10Show(page, tool, screen) {
  await page.locator(`.rp[data-tool="${tool}"]`).click();
  await page.locator(`.rp[data-s="${M10_SCREEN[screen] || screen}"]`).click();
  await sleep(300);
  if (screen === 'table') await page.locator('#fr [data-a="tbl"]').click();
  if (screen === 'todo') await page.locator('#fr .gft .btn').click();
  await page.evaluate(() => { document.querySelectorAll('.qbody, .qbody > *, .sheet, .scrim').forEach((el) => { el.style.animation = 'none'; }); });
  await sleep(300);
}

// ---------------------------------------------------------------- the built page
const env = readEnv();
const LAST = { at: '2026-10-14T09:00:00.000Z', people: Object.fromEntries(M10.people.map((p, i) => [`m10-person-${i + 1}`, { t: p.t[1], a: p.a[1], u: p.u[1] }])) };
const check = (rated) => ({
  people: M10.people.map((p, i) => ({ id: `m10-person-${i + 1}`, name: p.name, role: p.role, t: rated ? p.t[0] : null, a: rated ? p.a[0] : null, u: rated ? p.u[0] : null })),
  shared: false,
  last: LAST,
});
// Opens the tool on one screen: the check as the tool keeps it on the
// device while it is open, and the step it was left on.
async function openAt(page, { rated, index }) {
  // Away from the tool first (a plain file of the portal's own), so the
  // screen before can't keep its own check again as it closes.
  await page.goto(`${APP}/version.json`);
  await clearTeamCheck(page);
  await page.evaluate(({ c, at }) => {
    let uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
    if (!uid) { try { uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id; } catch { /* none */ } }
    localStorage.setItem(`clarity-draft:${uid}:team-check:new`, JSON.stringify({ v: { id: '66666666-6666-4666-8666-666666666666', check: c, status: 'new', saved: false, createdAt: null, finishedAt: null }, at: Date.now() }));
    localStorage.setItem(`ds-guide:team-check-${uid}-new`, JSON.stringify({ index: at, skipped: [] }));
    // The table isn't on the test project yet (migration 043): not asked about on every screen.
    localStorage.setItem('clarity-tool-answers-not-yet', String(Date.now()));
  }, { c: check(rated), at: index });
  await page.goto(`${APP}${TEAM_PATH}`);
  await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
  await until(async () => (await page.locator('.ds-namerow, .ds-answer, .ds-steprow').count()) > 0, 15000);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { document.querySelectorAll('.ds-guide-page, .ds-guide-rv').forEach((el) => { el.style.animation = 'none'; }); });
  await sleep(400);
}

const want = (screen) => !ONLY || ONLY.includes(screen);
const HIDE = '.ds-sr, .tipx, .ds-toast, .toast, #tw, .rev, .notes, .srt, .ctip, .ds-tip';
const ANCHOR = {
  results: { mock: '#h1', built: '.ds-guide-title' },
  table: { mock: '.tt', built: '.ds-ctable' },
  panel: { mock: '.shh h2', built: `${DIALOG} h2` },
  step: { mock: '.qpct', built: '.ds-guide-pct-track' },
};
const ctxOf = { report, allowed, mockName: 'M10' };
const wordsOf = { report, mockOnly: MOCK_ONLY, builtOnly: BUILT_ONLY, mockName: 'M10' };

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const phone = width < 600;
      const tagBase = `${phone ? 'Phone' : 'Desktop'} ${mode}`;
      const shotsOnly = width === 400;
      const m10 = shotsOnly ? null : await m10Open(browser, width, mode);
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 860 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
      await block(ctx);
      await withCoach(ctx, M10.coach);
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
      await signIn(page, env);

      const one = async (tool, screen, { isPanel = false } = {}) => {
        const tag = `${tagBase}, ${screen}`;
        await sleep(400);
        if (shotsOnly) { await page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) }); return; }
        await m10Show(m10.page, tool, screen);
        const parts = isPanel ? PANELS[screen] : SCREENS[screen];
        const anchors = isPanel ? ANCHOR.panel : (ANCHOR[screen] || ANCHOR.step);
        const m = await m10.page.evaluate(measureParts, { parts, mock: true, anchor: anchors.mock, bottom: '#fr' });
        const b = await page.evaluate(measureParts, { parts, mock: false, anchor: anchors.built, bottom: null });
        compareParts(ctxOf, tag, screen, parts, m, b, phone);
        const mw = await m10.page.evaluate(words, { root: isPanel ? '.sheet' : (screen === 'table' ? '.tblw' : '#fr'), hide: HIDE });
        const bw = await page.evaluate(words, { root: isPanel ? DIALOG : (screen === 'table' ? '.ds-ctable' : '.ds-guide'), hide: HIDE });
        compareWords(wordsOf, tag, screen, mw, bw);
        await page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) });
        await m10.page.locator('#fr').screenshot({ path: join(out, `${screen}-${width}-${mode}-m10.png`) });
      };

      // ---- Team performance check
      if (want('people') || want('addp') || want('whoT')) {
        await openAt(page, { rated: false, index: 0 });
        await sleep(4200); // "Draft restored" goes
        if (want('people')) await one('tpc', 'people');
        if (want('addp')) {
          await page.getByRole('button', { name: 'Add a person', exact: true }).click();
          await panel(page).waitFor({ timeout: 10000 });
          await sleep(700);
          // M10 shows the panel with nothing focused: the box's coral focus edge isn't part of the comparison.
          await page.evaluate(() => document.activeElement?.blur());
          await sleep(300);
          await one('tpc', 'addp', { isPanel: true });
          await page.keyboard.press('Escape');
          await panelGone(page);
        }
        if (want('whoT')) {
          await page.locator('.ds-guide-question .ds-who').click();
          await panel(page).waitFor({ timeout: 10000 });
          await sleep(700);
          await one('tpc', 'whoT', { isPanel: true });
          await page.keyboard.press('Escape');
          await panelGone(page);
        }
      }
      for (const [screen, index] of [['trust', 1], ['align', 2], ['auto', 3]]) {
        if (!want(screen)) continue;
        await openAt(page, { rated: false, index });
        await sleep(4200);
        await one('tpc', screen);
      }
      if (want('results') || want('table') || want('todo')) {
        await openAt(page, { rated: true, index: 16 });
        await sleep(4200);
        if (want('results')) await one('tpc', 'results');
        if (want('table')) {
          await page.locator('.ds-ctable-fold .ds-link').click();
          await sleep(900);
          await one('tpc', 'table');
          await page.locator('.ds-ctable-fold .ds-link').click();
          await sleep(500);
        }
        if (want('todo')) {
          await sleep(450);
          await page.locator('.ds-guide-next').click();
          await panel(page).waitFor({ timeout: 10000 });
          await sleep(900);
          await one('tpc', 'todo', { isPanel: true });
          await page.keyboard.press('Escape');
          await panelGone(page);
        }
      }
      // ---- Emotional wash: its screens go here, in the same shape (one('ew', screen)).

      pass(`${tagBase}: no page errors in the tool`, errors.length === 0, errors.join(' | '));
      await clearTeamCheck(page);
      await ctx.close();
      if (m10) await m10.ctx.close();
      await sleep(1000);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${passed} passed, ${report.failures()} failed, ${results.filter((r) => r.startsWith('NOTE')).length} notes. Report: ${join(out, 'report.txt')}`);
process.exit(report.failures() ? 1 : 0);
