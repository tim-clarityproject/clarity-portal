// Today in the coach portal (Phase 6a run 2, step 3): the page on a Tuesday
// morning (over-full, with each panel), on a Friday afternoon (Rate my
// energy, then the Weekly review), in the evening (Close the day), in a
// week over capacity and as an associate; at 1440, 768 and 400, dark and
// light. Each screen is held to the same calm rules as the UI tester
// (ui.mjs) and pictured.
//
// The page's clock is pinned to a day at or before the real one (never
// ahead: sign-in rule 46), and the seed counts its days from the same day.
// Everything stays on the device: the stand-in tells the page 049 and 050
// aren't there, stops any write and counts it, and this test fails if one
// was tried. The pressure forecast's moments are answered by a stand-in.
//
//   node --import ./tests/scores/register.mjs tests/coach/today.mjs [folder for screenshots]
//   STATES=tue,eve,fri,cap,associate,flow  SIZES=1440,768,400  MODES=dark,light  narrow it.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { backGaps, buttonProblems, chevronOnlyFolds, doubledRules, importantMarks, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, settle, standIn } from './shared.mjs';
import { PRESSURE, seedClock, seedWithDay } from './seed.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const report = makeReport('Coach portal, Today');
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };
const TUE = new Date(2026, 10, 17, 9, 0);
const EVE = new Date(2026, 10, 17, 18, 45);
const FRI = new Date(2026, 10, 13, 13, 30);

const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const press = async (page, name) => { await button(page, name).click(); await settle(page, 450); };
const take = async (page) => { await page.locator('.ds-offer-take').click(); await settle(page, 450); };
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 450); };

/** Each state: when it is, who looks, the seed's options, and its screens in order (each a name and what to do first). */
const STATES = {
  tue: {
    at: TUE, role: 'owner', finances: true,
    screens: [
      ['page', null, { full: true }],
      ['over', async (page) => { await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 450); }],
      ['move', async (page) => { await press(page, 'Choose what to move'); }],
      ['move-none', async (page) => {
        const ticked = page.locator('.ds-dialog [role=checkbox][aria-checked=true]');
        while (await ticked.count()) await ticked.first().click();
        await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300);
      }, { then: closePanel }],
      ['plan-1', async (page) => { await take(page); }],
      ['plan-2', async (page) => { await press(page, 'Next'); await page.locator('.ds-dialog [role=checkbox]').first().click(); await settle(page, 200); }],
      ['plan-3', async (page) => { await press(page, 'Next'); await page.locator('.ds-dialog .cc-today-still .ds-link').first().click(); await settle(page, 300); }, { then: closePanel }],
      ['add', async (page) => { await press(page, 'Add to-do'); }, { then: closePanel }],
      ['attention-all', async (page) => { await page.getByRole('button', { name: /^Show all \d+$/ }).click(); await settle(page, 300); await page.getByRole('button', { name: 'Show fewer' }).scrollIntoViewIfNeeded(); }],
    ],
  },
  eve: {
    at: EVE, role: 'owner',
    screens: [
      ['page', null, { full: true }],
      ['close-1', async (page) => { await take(page); }],
      ['close-2', async (page) => { await press(page, 'Next'); }],
      ['close-3', async (page) => { await press(page, 'Next'); }, { then: closePanel }],
    ],
  },
  fri: {
    at: FRI, role: 'owner',
    screens: [
      ['page', null, { full: true }],
      ['energy', async (page) => { await take(page); }],
      ['review-1', async (page) => { await page.getByRole('radio', { name: 'Good', exact: true }).click(); await settle(page, 900); await take(page); }],
      ['review-2', async (page) => { await press(page, 'Next'); }],
      ['review-3', async (page) => { await press(page, 'Next'); }],
      ['review-4', async (page) => { await press(page, 'Next'); }],
      ['review-5', async (page) => { await press(page, 'Next'); await page.locator('.ds-dialog textarea').fill('Leave Thursday afternoon clear for writing.'); await settle(page, 200); }, { then: closePanel }],
    ],
  },
  cap: { at: TUE, role: 'owner', seed: { over: true }, screens: [['page', async (page) => { await page.locator('.cc-today-figures').scrollIntoViewIfNeeded(); await settle(page, 200); }, { full: true }]] },
  associate: { at: TUE, role: 'associate', screens: [['page', null, { full: true }]] },
};

/** Runs in the page: tap sizes, sideways scroll, shortcut hints, add rows, the mode's colours (as ui.mjs). */
function measure() {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const root = top || document.querySelector('.cc-app') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01; };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} “${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}”`;
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, [role=radio], [role=checkbox], [role=switch], [role=option], [role=menuitem], [role=menuitemcheckbox], [data-tip]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2)) continue;
    const reach = (p) => (p.content !== 'none' && p.position === 'absolute' && p.display !== 'none' && p.pointerEvents !== 'none') ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
    const [ra, rb] = [reach(getComputedStyle(el, '::after')), reach(getComputedStyle(el, '::before'))];
    const tapW = Math.max(b.width, ra.w, rb.w);
    const tapH = Math.max(b.height, ra.h, rb.h);
    if (tapW >= 43.5 && tapH >= 43.5) continue;
    if (el.matches('.ds-seg-btn') && b.height >= 33.5) continue;
    if (el.matches('.cc-inline-link') && ra.h >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  const text = (document.querySelector('.cc-app')?.innerText || '') + [...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n');
  const figures = [...root.querySelectorAll('.cc-today-figures')].filter(vis).flatMap((g) => {
    const kids = [...g.children].map((c) => c.getBoundingClientRect());
    return kids.length === 2 && (Math.abs(kids[0].width - kids[1].width) > 0.5 || Math.abs(kids[0].top - kids[1].top) > 0.5) ? [`${Math.round(kids[0].width)} and ${Math.round(kids[1].width)} wide, tops ${Math.round(kids[0].top)} and ${Math.round(kids[1].top)}`] : [];
  });
  const cs = getComputedStyle(document.querySelector('.cc-app') || document.body);
  return {
    small, figures,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    shortcuts: [...document.querySelectorAll('kbd')].filter(vis).length + ((text.match(/[⌘⌥⇧]|\b(Cmd|Ctrl)\s?\+/g) || []).length),
    adds: [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t)),
    background: cs.backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    fail: /\bfail(ed|s|ure)?\b/i.test(text),
    text,
  };
}

async function check(page, tag, { size, theme }) {
  const phone = size <= 600;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);
  const r = await page.evaluate(measure);
  report.pass(`${tag}: the page follows the chosen mode`, r.theme === theme && r.background === BACKGROUND[theme], `${r.theme} ${r.background}`);
  report.pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  report.pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  report.pass(`${tag}: no keyboard shortcut is shown`, r.shortcuts === 0, `${r.shortcuts}`);
  report.pass(`${tag}: Add rows drop “a” and “an”`, r.adds.length === 0, r.adds.join('; '));
  report.pass(`${tag}: no “fail” in what people read`, !r.fail);
  report.pass(`${tag}: figures in a row sit on an equal grid`, r.figures.length === 0, r.figures.join('; '));
  const btns = await page.evaluate(buttonProblems, { phone, scale: 1 });
  report.pass(`${tag}: every button in the controls family, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 4).join('; '));
  const uneven = await page.evaluate(sideBySide);
  report.pass(`${tag}: boxes side by side are one height`, uneven.length === 0, uneven.slice(0, 4).join('; '));
  const nekst = await page.evaluate(nekstInControls);
  report.pass(`${tag}: no Nekst inside any control`, nekst.length === 0, nekst.slice(0, 4).join('; '));
  const sides = await page.evaluate(sideLines);
  report.pass(`${tag}: no thick coloured side line`, sides.length === 0, sides.slice(0, 4).join('; '));
  // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the thin line (tidy pass follow-up 1; Tim, 18 Nov, and 12:30).
  const backs = await page.evaluate(backGaps);
  report.pass(`${tag}: Back's chevron is 10px from its words (${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
  const imp = await page.evaluate(importantMarks);
  report.pass(`${tag}: Important is the soft coral tick box edge or the thin line, and nothing else (${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
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
  const chevrons = chevronsOff(await measureChevrons(page));
  report.pass(`${tag}: chevrons are centred on their words`, chevrons.length === 0, chevrons.slice(0, 3).join('; '));
  return r.text;
}

/** Opens Today on a pinned day with the seed on the device; resolves the page, its stand-in and how to finish. */
async function openToday(at, { size = 1440, theme = 'dark', role = 'owner', seed = {} } = {}) {
  const ctx = await coachContext(browser, { size, theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.clock.setFixedTime(at);
  seedClock(at);
  const store = await standIn(page, { role, db: 'none' });
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/rest/v1/peak_moments*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRESSURE.moments()) }));
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  const me = await accountId(page);
  await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
  await clearDevice(page, me);
  await seedDevice(page, me, seedWithDay({ accounts: true, ...seed }));
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  await settle(page, 1200);
  return {
    page, store, errors,
    done: async (name) => {
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      report.pass(`${name}: nothing was written to the database`, blocked.length === 0, blocked.slice(0, 4).join('; '));
      report.pass(`${name}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
      await clearDevice(page, me);
      await ctx.close();
    },
  };
}

const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 600); };
const words = (page) => page.evaluate(() => document.querySelector('.cc-app').innerText);
const focusWords = (page) => page.evaluate(() => (document.activeElement?.textContent || '').trim().slice(0, 60));

/** What each panel does: moving, planning, closing and reviewing, each with its message and Undo; focus; twice the text size. */
async function flows() {
  // Tuesday morning: the over-full day, Choose what to move, Plan my day.
  let t = await openToday(TUE);
  let { page } = t;
  await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 450);
  await press(page, 'Choose what to move');
  report.pass('flow: Choose what to move opens in place of the over-full panel', await page.locator('.ds-dialog').count() === 1 && /Move to tomorrow/i.test(await page.locator('.ds-dialog-title').innerText()));
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 600);
  report.pass('flow: moving says how many, with Undo', (await toast(page)) === '2 moved to tomorrow', await toast(page));
  report.pass('flow: once enough is moved the over-full line goes', !/minutes over/.test(await words(page)));
  report.pass('flow: focus goes back to the To-dos heading when the line that opened it has gone', (await focusWords(page)) === 'To-dos', await focusWords(page));
  await undo(page);
  report.pass('flow: Undo puts the to-dos back', /Today is 45 minutes over\./.test(await words(page)));
  await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 450);
  await closePanel(page);
  report.pass('flow: Escape closes the over-full panel and focus returns to its link', (await focusWords(page)) === '45 minutes over', await focusWords(page));

  await take(page);
  await page.locator('.ds-dialog [role=checkbox]').nth(1).click(); // Draft the Northfield workshop outline: to tomorrow
  await press(page, 'Next');
  report.pass('flow: a new step takes focus to its question', (await focusWords(page)) === 'Pick today’s to-dos', await focusWords(page));
  await page.locator('.ds-dialog [role=checkbox]').first().click(); // Call Priya about the keynote: today
  await press(page, 'Next');
  await page.locator('.ds-dialog .cc-today-still .ds-link').first().click(); await settle(page, 300);
  await page.locator('.ds-dialog .ds-dd, .ds-dialog [role=combobox]').first().click(); await settle(page, 300);
  const options = await page.getByRole('option').allInnerTexts();
  report.pass('flow: a to-do’s times are the free quarter hours between calls', options[0] === 'No time' && options.includes('09:30') && !options.includes('12:30') && !options.includes('09:00'), options.slice(0, 6).join(', '));
  await page.getByRole('option', { name: '10:00', exact: true }).click(); await settle(page, 300);
  report.pass('flow: the to-do shows its time, and joins the day in time order', /10:00/.test(await page.locator('.ds-dialog .cc-today-still').first().innerText()) && /10:00[\s\S]*12:30/.test(await page.locator('.ds-dialog .cc-today-calls').innerText()));
  await press(page, 'Start my day');
  report.pass('flow: Start my day says so, with Undo', (await toast(page)) === 'Your day is planned', await toast(page));
  let text = await words(page);
  report.pass('flow: the plan moved the to-dos and the offer has gone', !/Plan my day/.test(text) && /Call Priya about the keynote/.test(text) && !/Draft the Northfield workshop outline/.test(text));
  await undo(page);
  text = await words(page);
  report.pass('flow: Undo puts every to-do and the day back', /Plan my day/.test(text) && !/Call Priya about the keynote/.test(text) && /Draft the Northfield workshop outline/.test(text));
  await press(page, 'Not now');
  report.pass('flow: Not now hides the offer', !/Plan my day/.test(await words(page)));
  await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 1000);
  report.pass('flow: and it stays hidden for the visit', !/Plan my day/.test(await words(page)));
  // A call's row opens the brief; a group's row its page.
  await page.locator('.cc-today-call--open').first().click(); await settle(page, 700);
  report.pass('flow: a client’s call opens the brief', await page.locator('.ds-dialog').count() === 1);
  await closePanel(page);
  await page.locator('.cc-today-call--open').nth(1).click(); await settle(page, 700);
  report.pass('flow: a group’s call opens the group', /\/coach\/groups\//.test(page.url()), page.url().replace(/^.*\/coach/, '/coach'));
  await t.done('flow, Tuesday');

  // The evening: Close the day.
  t = await openToday(EVE); page = t.page;
  await take(page);
  await press(page, 'Next');
  await press(page, 'Move them to tomorrow');
  report.pass('flow: Move them to tomorrow says how many', (await toast(page)) === '6 moved to tomorrow', await toast(page));
  await press(page, 'Next');
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 600);
  report.pass('flow: Close the day says so, with Undo', (await toast(page)) === 'Day closed', await toast(page));
  report.pass('flow: a closed day offers nothing more', await page.locator('.ds-offer').count() === 0);
  await undo(page);
  report.pass('flow: Undo opens the day again', await page.locator('.ds-offer').count() === 1);
  await t.done('flow, the evening');

  // Friday afternoon: Rate my energy, then the Weekly review, whose typing is kept for the visit.
  t = await openToday(FRI); page = t.page;
  await take(page);
  await page.getByRole('radio', { name: 'Very good', exact: true }).click(); await settle(page, 700);
  report.pass('flow: one tap rates the week, with Undo, and closes', (await toast(page)) === 'Saved' && await page.locator('.ds-dialog').count() === 0, await toast(page));
  await take(page);
  report.pass('flow: the review opens with the week’s rating chosen', await page.getByRole('radio', { name: 'Very good', exact: true }).getAttribute('aria-checked') === 'true');
  for (let i = 0; i < 4; i += 1) await press(page, 'Next');
  await page.locator('.ds-dialog textarea').fill('Leave Thursday afternoon clear.');
  await closePanel(page);
  await take(page);
  for (let i = 0; i < 4; i += 1) await press(page, 'Next');
  report.pass('flow: what was typed in the review is kept for the visit', (await page.locator('.ds-dialog textarea').inputValue()) === 'Leave Thursday afternoon clear.');
  await press(page, 'Finish the review');
  report.pass('flow: Finish the review says so, with Undo', (await toast(page)) === 'Review saved', await toast(page));
  report.pass('flow: a reviewed week isn’t offered its review again', !/Weekly review|Rate my energy/.test(await words(page)));
  await t.done('flow, Friday');

  // Twice the text size on a phone: the page and a panel wrap, with no sideways scroll.
  t = await openToday(TUE, { size: 400, theme: 'light', seed: { over: true } }); page = t.page;
  await page.addStyleTag({ content: 'html{font-size:32px !important}' });
  await settle(page, 500);
  const wide = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll('.ds-dialog-body')].map((b) => b.scrollWidth - b.clientWidth)));
  report.pass('flow: at twice the text size Today has no sideways scroll', (await wide()) <= 0, `${await wide()}px`);
  if (OUT) await page.screenshot({ path: `${OUT}/twice-page.owner.400.light.png`, fullPage: true });
  await take(page);
  await press(page, 'Next'); await press(page, 'Next');
  report.pass('flow: at twice the text size Plan my day has no sideways scroll', (await wide()) <= 0, `${await wide()}px`);
  if (OUT) await page.screenshot({ path: `${OUT}/twice-plan-3.owner.400.light.png` });
  await closePanel(page);
  await t.done('flow, twice the text size');
}

const states = (process.env.STATES || [...Object.keys(STATES), 'flow'].join(',')).split(',');
const sizes = (process.env.SIZES || '1440,768,400').split(',').map(Number);
const modes = (process.env.MODES || 'dark,light').split(',');
const browser = await chromium.launch();
const said = {};

for (const name of states) {
  if (name === 'flow') { await flows(); continue; }
  const state = STATES[name];
  if (!state) throw new Error(`No state called ${name}`);
  for (const size of sizes) {
    for (const theme of modes) {
      const ctx = await coachContext(browser, { size, theme });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
      const lost = [];
      page.on('requestfailed', (r) => lost.push(`${r.method()} ${new URL(r.url()).pathname.split('/').slice(-2).join('/')}`));
      // The page's clock, before anything loads: a day at or before the real one.
      await page.clock.setFixedTime(state.at);
      seedClock(state.at);
      const store = await standIn(page, { role: state.role, db: 'none' });
      // The portal's own questions on sign-in are answered here with nothing, so none is stopped mid-way
      // (a stopped request reads as "offline") and none reaches the database.
      await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
      await page.route('**/rest/v1/peak_moments*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRESSURE.moments()) }));
      if (state.finances) await page.addInitScript(() => { try { sessionStorage.setItem('clarity-coach-test-finances', '1'); } catch { /* blocked */ } });
      await page.goto(`${APP}/coach`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      const me = await accountId(page);
      await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
      await clearDevice(page, me);
      await seedDevice(page, me, seedWithDay({ accounts: true, ...(state.seed || {}) }));
      await page.goto(`${APP}/coach`);
      await page.waitForSelector('.cc-app', { timeout: 20000 });
      await settle(page, 1200);
      for (const [screen, act, { full = false, then = null } = {}] of state.screens) {
        const tag = `${name} ${screen}, ${state.role}, ${size}px ${theme}`;
        try { if (act) await act(page, size); } catch (e) { errors.push(`${screen}: ${String(e).split('\n')[0].slice(0, 200)}`); }
        const text = await check(page, tag, { size, theme });
        if (size === 1440 && theme === 'dark') said[`${name} ${screen}`] = text;
        if (OUT) await page.screenshot({ path: `${OUT}/${name}-${screen}.${state.role}.${size}.${theme}.png`, fullPage: full });
        if (then) await then(page);
      }
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      report.pass(`${name}, ${size}px ${theme}: nothing was written to the database`, blocked.length === 0, blocked.slice(0, 4).join('; '));
      report.pass(`${name}, ${size}px ${theme}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
      await clearDevice(page, me);
      await ctx.close();
    }
  }
}
await browser.close();
seedClock(null);

// The words, read once (1440, dark).
const has = (key, words, what) => { if (said[key] != null) report.pass(what, said[key].toLowerCase().includes(words.toLowerCase()), `“${words}” not found`); };
has('tue page', 'Today is 45 minutes over.', 'Tuesday: the over-full line reads as M11');
has('tue page', '9:45 am Chicago', 'Tuesday: a client in another time zone shows their own time and city');
has('tue page', 'Group of 3', 'Tuesday: a group’s row says how many are in it');
has('tue page', 'Self-funded', 'Tuesday: a client with no organisation is Self-funded');
has('tue page', 'hasn’t been sent yet.', 'Tuesday: the recap nudge shows');
has('tue page', 'November £2,300 of £5,000', 'Tuesday: the Finances line shows through the test’s switch');
has('tue page', 'Plan my day', 'Tuesday morning offers Plan my day');
has('tue page', '11 of 15', 'Tuesday: capacity reads 11 of 15');
has('tue page', 'Board meeting', 'Tuesday: the pressure forecast shows a shared work moment');
has('tue over', '4 hours 30 minutes', 'the over-full panel gives the calls’ time');
has('tue move', 'That fits your day.', 'Choose what to move starts with enough ticked');
has('tue move-none', 'Tick what to move to carry on.', 'Choose what to move is never greyed out');
has('tue plan-1', 'Step 1 of 3', 'Plan my day counts its steps');
has('tue plan-3', 'To-dos to place', 'Plan my day’s last step lists what to place');
has('eve page', 'Close the day', 'the evening offers Close the day');
has('eve close-3', 'Tomorrow at a glance', 'Close the day ends with tomorrow');
has('fri page', 'Rate my energy', 'Friday afternoon offers Rate my energy');
has('fri review-1', 'Step 1 of 5', 'the Weekly review counts its steps');
has('fri review-4', '15 calls, the busiest on Tuesday and Thursday.', 'the Weekly review gives next week’s shape');
has('cap page', '17 of 15', 'a week over capacity reads 17 of 15');
has('cap page', '2 over', 'a week over capacity says how far');
if (said['associate page'] != null) report.pass('an associate never sees the Finances line', !/£2,300/.test(said['associate page']));
report.done();
