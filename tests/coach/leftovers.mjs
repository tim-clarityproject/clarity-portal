// What run 1 left, and the client's side (Phase 6a run 2, step 6): a card
// moved between the board's columns (dragged, with the keyboard, and from a
// phone's More menu), the table's heading row that stays at the top, an
// organisation's access code shown once, a workshop's Emails and Send the
// follow-up, Invite to the portal, the answer to View as client, and the
// client's own Coaching page with Home's one quiet line.
//
// Coach pages: the page's clock is pinned to a day at or before the real
// one (never ahead: sign-in rule 46). Everything stays on the device: the
// stand-in tells the page 049 and 050 aren't there, stops any write and
// counts it, and this test fails if one was tried. The access codes' table
// and every /api/ call are answered by stand-ins here: no code is ever kept
// and nothing is ever sent.
//
// The client's page: signed in as the test CLIENT, with every function and
// table it calls answered by a stand-in (050 isn't on the test project), and
// every other write stopped and counted. No real invite is made.
//
//   node --import ./tests/scores/register.mjs tests/coach/leftovers.mjs [folder for screenshots]
//   PARTS=board,table,org,workshop,invite,coaching  SIZES=1440,768,400  MODES=dark,light  narrow it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { buttonProblems, chevronOnlyFolds, doubledRules, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { accountId, APP, clearDevice, coachContext, makeReport, readEnv, seedDevice, settle, SIZES as SIZE_OF, standIn, ME } from './shared.mjs';
import { ID, PRESSURE, seedClock, seedWithDay } from './seed.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const report = makeReport('Coach portal, what run 1 left and the client’s side');
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };
const PARTS = (process.env.PARTS || 'board,table,org,workshop,invite,coaching').split(',');
const SIZES = (process.env.SIZES || '1440,768,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const TUE = new Date(2026, 10, 17, 9, 0);

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 700); };
const shot = async (page, name, { full = false } = {}) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 450); };

/** Runs in the page: tap sizes, sideways scroll, shortcut hints, add rows, the board's cards, the mode's colours (as ui.mjs). */
function measure(rootSelector) {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const app = document.querySelector(rootSelector) || document.body;
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
    if (el.matches('.ds-seg-btn') && b.height >= 33.5) continue;
    if (el.matches('.cc-fold-btn') && el.closest('.cc-fold-head').getBoundingClientRect().height >= 43.5) continue;
    if (el.matches('.cc-inline-link') && ra.h >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  const text = (app.innerText || '') + [...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n');
  const cs = getComputedStyle(app);
  return {
    small,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    shortcuts: [...document.querySelectorAll('kbd')].filter(vis).length + ((text.match(/[⌘⌥⇧]|\b(Cmd|Ctrl)\s?\+/g) || []).length),
    adds: [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t)),
    cards: [...new Set([...document.querySelectorAll('.cc-board .cc-card')].filter(vis).map((c) => Math.round(c.getBoundingClientRect().height)))],
    background: cs.backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    fail: /\bfail(ed|s|ure)?\b/i.test(text),
    change: /\bChange (my|your|the)\b/.test(text),
    text,
  };
}

async function check(page, tag, { size, theme, root = '.cc-app', background = true }) {
  const phone = size <= 600;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);
  const r = await page.evaluate(measure, root);
  if (background) report.pass(`${tag}: the page follows the chosen mode`, r.theme === theme && r.background === BACKGROUND[theme], `${r.theme} ${r.background}`);
  report.pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  report.pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  report.pass(`${tag}: no keyboard shortcut is shown`, r.shortcuts === 0, `${r.shortcuts}`);
  report.pass(`${tag}: Add rows drop “a” and “an”`, r.adds.length === 0, r.adds.join('; '));
  report.pass(`${tag}: every card on the board is one height`, r.cards.length <= 1, r.cards.join(', '));
  report.pass(`${tag}: no “fail” and no “Change” in what people read`, !r.fail && !r.change);
  const btns = await page.evaluate(buttonProblems, { phone, scale: 1 });
  report.pass(`${tag}: every button in the controls family, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 4).join('; '));
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
  const chevrons = chevronsOff(await measureChevrons(page));
  report.pass(`${tag}: chevrons are centred on their words`, chevrons.length === 0, chevrons.slice(0, 3).join('; '));
  return r.text;
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- the coach's pages
/**
 * Opens a coach page on the pinned day with the seed on the device. `api`
 * answers /api/coach-send (it is counted); `codes` is the stand-in for the
 * access codes' table.
 */
async function openCoach(path, { size = 1440, theme = 'dark', seed = (rows) => rows, viewport = null } = {}) {
  const ctx = await coachContext(browser, { size, theme });
  const page = await ctx.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.clock.setFixedTime(TUE);
  seedClock(TUE);
  const store = await standIn(page, { role: 'owner', db: 'none' });
  await page.route('**/rest/v1/rpc/**', (route) => json(route, null));
  await page.route('**/rest/v1/peak_moments*', (route) => json(route, []));
  // The access codes' table (026): a stand-in that keeps what it is given, so nothing reaches the test project.
  const codes = { rows: [], posts: [] };
  await page.route('**/rest/v1/organisation_access_codes*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const org = (url.searchParams.get('organisation_id') || '').replace('eq.', '');
    if (req.method() === 'GET') return json(route, codes.rows.filter((r) => r.organisation_id === org && !r.switched_off_at).map((r) => ({ id: r.id })));
    if (req.method() === 'POST') { const row = req.postDataJSON(); codes.posts.push(row); codes.rows.push({ switched_off_at: null, ...row }); return json(route, [], 201); }
    if (req.method() === 'PATCH') {
      const not = (url.searchParams.get('id') || '').replace('neq.', '');
      for (const r of codes.rows) if (r.organisation_id === org && !r.switched_off_at && r.id !== not) Object.assign(r, req.postDataJSON());
      return json(route, []);
    }
    return route.abort();
  });
  // The email server: answered here, and counted. Nothing is ever sent.
  const api = { answer: { sent: false, reason: 'preview' }, asked: [] };
  await page.route('**/api/coach-send', (route) => { api.asked.push(route.request().postDataJSON()); return json(route, api.answer); });
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  const me = await accountId(page);
  await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
  await clearDevice(page, me);
  await seedDevice(page, me, seed(seedWithDay({ accounts: true })));
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  await settle(page, 1200);
  return {
    page, store, codes, api, me,
    done: async (name) => {
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      report.pass(`${name}: nothing was written to the database`, blocked.length === 0, blocked.slice(0, 4).join('; '));
      report.pass(`${name}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
      await clearDevice(page, me);
      await ctx.close();
    },
  };
}

const columnOf = (page, name) => page.evaluate((n) => document.querySelector(`[data-card="${n}"]`)?.closest('[data-stage]')?.dataset.stage || null, name);
const chooseBoard = async (page, phone) => {
  if (phone) { await page.getByRole('button', { name: 'View', exact: true }).click(); await settle(page, 300); await page.getByRole('menuitemcheckbox', { name: 'Board' }).click(); } else await page.getByRole('button', { name: 'Board', exact: true }).click();
  await settle(page, 600);
};

async function board(size, theme) {
  const tag = `board, ${size}px ${theme}`;
  const t = await openCoach('/coach/clients', { size, theme });
  const { page } = t;
  const phone = size <= 600;
  await chooseBoard(page, phone);
  await check(page, tag, { size, theme });
  await shot(page, `board.${size}.${theme}`, { full: phone });
  const was = await columnOf(page, ID.sam);
  const stored = () => page.evaluate(([me, id]) => { const p = JSON.parse(localStorage.getItem(`clarity-coach-local:${me}`)).rows.client_profiles[id]; return [p.stage, p.status]; }, [t.me, ID.sam]);

  if (!phone) {
    // Dragged with a mouse to another column.
    const to = was === 'renewal_due' ? 'closing' : 'renewal_due';
    const label = to === 'closing' ? 'Closing' : 'Renewal due';
    const card = await page.locator(`[data-card="${ID.sam}"]`).boundingBox();
    const col = await page.locator(`[data-stage="${to}"]`).boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 20, card.y + card.height / 2 + 10, { steps: 3 });
    await page.mouse.move(col.x + col.width / 2, col.y + 120, { steps: 8 });
    await settle(page, 200);
    const mid = await page.evaluate(() => ({ ghost: Boolean(document.querySelector('.cc-card-ghost')), over: document.querySelector('.cc-board-col--over')?.dataset.stage || null, lifted: document.querySelectorAll('.cc-card--lifted').length }));
    report.pass(`${tag}: a dragged card follows the pointer, its place fades and the column under it shows`, mid.ghost && mid.over === to && mid.lifted === 1, JSON.stringify(mid));
    await shot(page, `board-drag.${size}.${theme}`);
    await page.mouse.up();
    await settle(page, 700);
    report.pass(`${tag}: dropped, the card is in ${label}`, (await columnOf(page, ID.sam)) === to, await columnOf(page, ID.sam));
    report.pass(`${tag}: the message reads “Moved to ${label}”`, (await toast(page)) === `Moved to ${label}`, await toast(page));
    report.pass(`${tag}: dropping opened nothing`, new URL(page.url()).pathname === '/coach/clients', page.url());
    report.pass(`${tag}: the stage is the coach’s own choice now`, (await stored())[0] === to, String(await stored()));
    const heights = await page.evaluate(() => [...new Set([...document.querySelectorAll('.cc-board .cc-card')].map((c) => Math.round(c.getBoundingClientRect().height)))]);
    report.pass(`${tag}: cards stay one height after a move`, heights.length === 1, heights.join(', '));
    await undo(page);
    report.pass(`${tag}: Undo puts back the column it had, worked out again`, (await columnOf(page, ID.sam)) === was && (await stored())[0] === null, `${await columnOf(page, ID.sam)} ${await stored()}`);

    // With the keyboard: the arrow keys move a focused card, and it keeps the focus.
    await page.locator(`[data-card="${ID.sam}"]`).focus();
    await page.keyboard.press('ArrowRight');
    await settle(page, 700);
    const after = await columnOf(page, ID.sam);
    const order = ['starting', 'active', 'renewal_due', 'closing', 'paused'];
    report.pass(`${tag}: the right arrow moves a focused card one column on`, order.indexOf(after) === order.indexOf(was) + 1, `${was} to ${after}`);
    report.pass(`${tag}: the card keeps the focus in its new column`, await page.evaluate((id) => document.activeElement?.dataset.card === id, ID.sam));
    const said = await page.locator('.cc-board [role=status]').textContent();
    report.pass(`${tag}: a screen reader hears where it moved`, /^Moved to .+\.$/.test(said || ''), said);
    report.pass(`${tag}: no key hint is shown on the board`, !/arrow/i.test(await page.locator('.cc-board').innerText()));
    // To Paused and back: the status follows.
    while ((await columnOf(page, ID.sam)) !== 'paused') { await page.keyboard.press('ArrowRight'); await settle(page, 500); }
    report.pass(`${tag}: moved to Paused, the client is paused`, (await stored())[1] === 'paused', String(await stored()));
    await page.keyboard.press('ArrowLeft');
    await settle(page, 600);
    report.pass(`${tag}: moved out of Paused, the client is active again`, (await stored())[1] === 'active' && (await columnOf(page, ID.sam)) === 'closing', `${await stored()} ${await columnOf(page, ID.sam)}`);
    // A click still opens the client.
    await page.locator(`[data-card="${ID.jordan}"]`).click();
    await settle(page, 600);
    report.pass(`${tag}: a click still opens the client’s page`, new URL(page.url()).pathname === `/coach/clients/${ID.jordan}`, page.url());
  } else {
    // On a phone: More, then Move to…
    await page.getByRole('button', { name: 'More for Sam Okafor' }).click();
    await settle(page, 500);
    const menu = await page.evaluate(() => [...document.querySelectorAll('.ds-portal [role=menu], [role=menu]')].map((m) => m.innerText).join('\n'));
    report.pass(`${tag}: More has “Move to…” with the five columns`, /Move to…/.test(menu) && ['Starting', 'Active', 'Renewal due', 'Closing', 'Paused'].every((s) => menu.includes(s)), menu.replace(/\n/g, ' | '));
    await check(page, `${tag}, More`, { size, theme });
    await shot(page, `board-more.${size}.${theme}`);
    const to = was === 'closing' ? 'Renewal due' : 'Closing';
    await page.getByRole('menuitemcheckbox', { name: to, exact: true }).click();
    await settle(page, 700);
    report.pass(`${tag}: chosen from the menu, the message reads “Moved to ${to}”`, (await toast(page)) === `Moved to ${to}`, await toast(page));
    await undo(page);
    report.pass(`${tag}: Undo puts it back`, (await columnOf(page, ID.sam)) === was, await columnOf(page, ID.sam));
  }
  await t.done(tag);
}

async function table(theme) {
  const tag = `table, 1440px ${theme}`;
  const t = await openCoach('/coach/clients', { size: 1440, theme, viewport: { width: 1440, height: 520 } });
  const { page } = t;
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await settle(page, 600);
  await page.evaluate(() => window.scrollTo(0, 450));
  await settle(page, 300);
  const m = await page.evaluate(() => {
    const th = [...document.querySelectorAll('.cc-table thead th')].map((x) => x.getBoundingClientRect());
    const header = document.querySelector('.cc-header').getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('.cc-table thead th'));
    const firstRow = document.querySelector('.cc-table tbody tr').getBoundingClientRect();
    return { top: Math.round(th[0].top), header: Math.round(header.bottom), tops: [...new Set(th.map((b) => Math.round(b.top)))].length, background: cs.backgroundColor, scrolled: window.scrollY, firstRowTop: Math.round(firstRow.top), sideways: document.documentElement.scrollWidth - window.innerWidth };
  });
  report.pass(`${tag}: the page scrolled`, m.scrolled > 100, String(m.scrolled));
  report.pass(`${tag}: the heading row stays at the top, under the coach header`, m.top === m.header && m.tops === 1, `${m.top} against ${m.header}`);
  report.pass(`${tag}: rows pass behind it, on a solid background`, m.firstRowTop < m.top + 10 && m.background === BACKGROUND[theme], `${m.firstRowTop} ${m.background}`);
  report.pass(`${tag}: no sideways scroll`, m.sideways <= 0, String(m.sideways));
  await check(page, tag, { size: 1440, theme });
  await shot(page, `table-scrolled.1440.${theme}`);
  // A column's menu still opens from the heading that stayed.
  await page.locator('.cc-th').first().click();
  await settle(page, 400);
  report.pass(`${tag}: a heading’s menu still opens`, (await page.locator('[role=menu]').count()) > 0);
  await closePanel(page);
  await t.done(tag);
}

async function org(size, theme) {
  const tag = `access code, ${size}px ${theme}`;
  const t = await openCoach(`/coach/organisations/${ID.kestrel}`, { size, theme });
  const { page, codes } = t;
  const row = page.locator('.cc-line', { hasText: 'Access code' });
  await row.scrollIntoViewIfNeeded();
  report.pass(`${tag}: with none, the row says so and offers “Make an access code”`, /No access code is set\./.test(await row.innerText()) && /Make an access code/.test(await row.innerText()), await row.innerText());
  report.pass(`${tag}: no screen says Business where it means Finances`, !/Business/.test(await page.locator('.cc-app').innerText()) && /arrive with Finances\./.test(await page.locator('.cc-app').innerText()));
  await check(page, tag, { size, theme });
  await shot(page, `org-code-none.${size}.${theme}`);
  await row.getByRole('button', { name: 'Make an access code' }).click();
  await settle(page, 700);
  const dialog = page.locator('[role=dialog]').last();
  const shown = (await dialog.locator('.cc-code').textContent()) || '';
  report.pass(`${tag}: the code shows once, 16 clear characters`, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/.test(shown), `${shown.length} characters`);
  report.pass(`${tag}: the panel says this is the only time`, /This is the only time the code is shown\. Copy it now\./.test(await dialog.innerText()));
  const post = codes.posts[0] || {};
  report.pass(`${tag}: only the code’s SHA-256 is saved, never the code`, post.code_hash === createHash('sha256').update(shown).digest('hex') && !JSON.stringify(post).includes(shown) && post.code_hint == null, Object.keys(post).join(','));
  report.pass(`${tag}: the code carries the organisation’s seats`, post.seats === 20 && post.organisation_id === ID.kestrel, `${post.seats}`);
  await check(page, `${tag}, shown`, { size, theme });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await settle(page, 400);
  report.pass(`${tag}: Copy says “Copied.”`, ((await dialog.locator('.cc-code-copied').textContent()) || '') === 'Copied.', await dialog.locator('.cc-code-copied').textContent());
  const pasted = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  report.pass(`${tag}: what was copied is the code`, pasted === shown, pasted === null ? 'the clipboard could not be read' : 'different');
  await shot(page, `org-code-shown.${size}.${theme}`);
  await closePanel(page);
  report.pass(`${tag}: afterwards the row reads “An access code is set.” and offers only a reset`, /An access code is set\./.test(await row.innerText()) && /Reset the code/.test(await row.innerText()) && !/Make an access code/.test(await row.innerText()), await row.innerText());
  const kept = await page.evaluate((code) => document.documentElement.innerHTML.includes(code) || Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes(code)) || Object.keys(sessionStorage).some((k) => (sessionStorage.getItem(k) || '').includes(code)), shown);
  report.pass(`${tag}: once the panel is closed the code is nowhere on the page or the device`, kept === false);
  // Reset: said before it happens, then a new code, and the old one is switched off.
  await row.getByRole('button', { name: 'Reset the code' }).click();
  await settle(page, 600);
  const confirm = page.locator('[role=dialog]').last();
  report.pass(`${tag}: a reset says what happens first`, /The code you gave out stops working as soon as you reset it, and a new one is shown once\./.test(await confirm.innerText()), await confirm.innerText());
  await check(page, `${tag}, reset`, { size, theme });
  await shot(page, `org-code-reset.${size}.${theme}`);
  await confirm.getByRole('button', { name: 'Reset the code', exact: true }).click();
  await settle(page, 800);
  const next = (await page.locator('[role=dialog]').last().locator('.cc-code').textContent()) || '';
  report.pass(`${tag}: the reset shows a new code`, /^[A-Z2-9]{16}$/.test(next) && next !== shown);
  report.pass(`${tag}: the old code is switched off and one is left`, codes.rows.length === 2 && codes.rows.filter((r) => !r.switched_off_at).length === 1 && Boolean(codes.rows[0].switched_off_at), JSON.stringify(codes.rows.map((r) => Boolean(r.switched_off_at))));
  await closePanel(page);
  // With no seats set, the row says what is needed instead of making a code that lets nobody in.
  await page.goto(`${APP}/coach/organisations/${ID.northfield}`);
  await settle(page, 1200);
  await page.locator('.cc-line', { hasText: 'Access code' }).getByRole('button', { name: 'Make an access code' }).click();
  await settle(page, 400);
  report.pass(`${tag}: with no seats it says what is needed`, (await toast(page)) === 'Add the number of seats first, so the code knows how many people it lets in.' && codes.posts.length === 2, await toast(page));
  await t.done(tag);
}

async function workshop(size, theme) {
  const tag = `workshop emails, ${size}px ${theme}`;
  // The workshop to come: both reminders on. The past one: its day-before reminder went, the follow-up hasn't.
  const sentAt = new Date(TUE); sentAt.setDate(sentAt.getDate() - 17); sentAt.setHours(7, 0, 4, 0);
  const seed = (rows) => ({
    ...rows,
    workshops: rows.workshops.map((w) => (w.id === ID.wsNext ? { ...w, remind_hour_before: true } : w)),
    workshop_sends: [{ id: '00000000-0000-4000-8000-00000000a001', workshop_id: ID.wsPast, kind: 'day_before', sent_at: sentAt.toISOString(), people: 22, sent_by: null }],
  });
  let t = await openCoach(`/coach/workshops/${ID.wsNext}`, { size, theme, seed });
  let { page } = t;
  const emails = () => page.locator('section, .cc-part').filter({ has: page.getByRole('heading', { name: 'Emails' }) }).last();
  await emails().scrollIntoViewIfNeeded();
  let words = (await emails().innerText()).replace(/\s+/g, ' ');
  report.pass(`${tag}: before the day, each email whose switch is on says when it goes`, /Reminder the day before It goes on Mon 23 Nov at 07:00\./.test(words) && /Reminder 1 hour before It goes on Tue 24 Nov at 08:30\./.test(words) && /Follow-up You send this after the day\./.test(words) && /Survey It goes with the follow-up\./.test(words), words);
  report.pass(`${tag}: the old notes about nothing being sent are gone`, !/Nothing is sent from here yet|Reminders start to send/.test(await page.locator('.cc-app').innerText()));
  await check(page, tag, { size, theme });
  await shot(page, `workshop-emails-before.${size}.${theme}`, { full: true });
  await emails().getByRole('button', { name: 'Send the follow-up' }).click();
  await settle(page, 400);
  report.pass(`${tag}: before the workshop the follow-up says it is too soon, and asks nobody`, (await toast(page)) === 'The follow-up goes after the workshop has started.' && t.api.asked.length === 0, await toast(page));
  // A switch turned off takes its row away.
  await page.getByRole('switch', { name: 'Email 1 hour before' }).click();
  await settle(page, 600);
  report.pass(`${tag}: a reminder switched off has no row`, !/Reminder 1 hour before/.test(await emails().innerText()));
  await t.done(`${tag}, before`);

  t = await openCoach(`/coach/workshops/${ID.wsPast}`, { size, theme, seed });
  page = t.page;
  await emails().scrollIntoViewIfNeeded();
  words = (await emails().innerText()).replace(/\s+/g, ' ');
  report.pass(`${tag}: after the day, what went says when and to how many`, /Reminder the day before It was sent on Sat 31 Oct at 07:00, to 22 people\./.test(words) && /Follow-up You send this after the day\./.test(words), words);
  await check(page, `${tag}, after`, { size, theme });
  await shot(page, `workshop-emails-after.${size}.${theme}`, { full: true });
  await emails().getByRole('button', { name: 'Send the follow-up' }).click();
  await settle(page, 600);
  const panel = page.locator('[role=dialog]').last();
  report.pass(`${tag}: Send the follow-up says who gets it, once, and what they get`, /It goes to 22 people, once\. The survey goes with it\./.test(await panel.innerText()) && /What each person gets/.test(await panel.innerText()), (await panel.innerText()).slice(0, 200));
  await check(page, `${tag}, the panel`, { size, theme });
  await shot(page, `workshop-follow-up.${size}.${theme}`);
  await panel.getByRole('button', { name: 'Send the follow-up', exact: true }).click();
  await settle(page, 600);
  report.pass(`${tag}: on a preview it says “Nothing is sent from a preview.”`, (await toast(page)) === 'Nothing is sent from a preview.', await toast(page));
  report.pass(`${tag}: the server was asked once, for this workshop only`, t.api.asked.length === 1 && t.api.asked[0].kind === 'workshop_follow_up' && t.api.asked[0].workshopId === ID.wsPast && Object.keys(t.api.asked[0]).length === 2, JSON.stringify(t.api.asked));
  // The live site's answer.
  t.api.answer = { sent: true, people: 22 };
  await emails().getByRole('button', { name: 'Send the follow-up' }).click();
  await settle(page, 500);
  await page.locator('[role=dialog]').last().getByRole('button', { name: 'Send the follow-up', exact: true }).click();
  await settle(page, 700);
  report.pass(`${tag}: once it has gone it says to how many`, (await toast(page)) === 'Follow-up sent to 22 people.', await toast(page));
  await t.done(`${tag}, after`);
}

async function invite(size, theme) {
  const tag = `invite, ${size}px ${theme}`;
  // Leo has an email and no account, and hasn't been invited; Sam (who has an account) said yes to View as client.
  const until = new Date(TUE.getTime() + 22 * 60000);
  const seed = (rows) => ({
    ...rows,
    client_profiles: rows.client_profiles.map((p) => (p.id === ID.leo ? { ...p, email: 'leo@example.invalid' } : p)),
    client_view_requests: [{ id: '00000000-0000-4000-8000-00000000b001', profile_id: ID.sam, coach_id: ME, asked_at: new Date(TUE.getTime() - 10 * 60000).toISOString(), answered_at: new Date(TUE.getTime() - 8 * 60000).toISOString(), allowed: true, expires_at: until.toISOString() }],
  });
  let t = await openCoach(`/coach/clients/${ID.leo}`, { size, theme, seed });
  let { page } = t;
  await page.getByRole('button', { name: 'Invite to the portal' }).first().click();
  await settle(page, 600);
  const panel = page.locator('[role=dialog]').last();
  report.pass(`${tag}: the panel says an email goes, and what accepting does`, /Leo gets an email at leo@example\.invalid, with a link to create their account\./.test(await panel.innerText()) && /When Leo accepts in The Clarity Portal/.test(await panel.innerText()), (await panel.innerText()).slice(0, 240));
  await check(page, tag, { size, theme });
  await shot(page, `invite-panel.${size}.${theme}`);
  await panel.getByRole('button', { name: 'Invite Leo', exact: true }).click();
  await settle(page, 700);
  report.pass(`${tag}: on a preview the message reads “Invited. No email goes from a preview.”`, (await toast(page)) === 'Invited. No email goes from a preview.', await toast(page));
  report.pass(`${tag}: the server was asked once, for this client only, and nothing else`, t.api.asked.length === 1 && t.api.asked[0].kind === 'invite' && t.api.asked[0].profileId === ID.leo && Object.keys(t.api.asked[0]).length === 2, JSON.stringify(t.api.asked.map((a) => Object.keys(a))));
  const invited = await page.evaluate(([me, id]) => Boolean(JSON.parse(localStorage.getItem(`clarity-coach-local:${me}`)).rows.client_profiles[id].invited_at), [t.me, ID.leo]);
  report.pass(`${tag}: the invite is recorded on the client`, invited);
  await t.done(tag);

  // The live site's answer, and the answer to View as client on Sam's page.
  t = await openCoach(`/coach/clients/${ID.leo}`, { size, theme, seed });
  page = t.page;
  t.api.answer = { sent: true, people: 1 };
  await page.getByRole('button', { name: 'Invite to the portal' }).first().click();
  await settle(page, 600);
  await page.locator('[role=dialog]').last().getByRole('button', { name: 'Invite Leo', exact: true }).click();
  await settle(page, 700);
  report.pass(`${tag}: from the live site the message reads “Invite sent to Leo.”`, (await toast(page)) === 'Invite sent to Leo.', await toast(page));
  const sam = Object.entries(PRESSURE.users).find(([id]) => id === ID.sam);
  if (sam) {
    await page.goto(`${APP}/coach/clients/${ID.sam}`);
    await settle(page, 1200);
    const more = page.getByRole('button', { name: /^More/ }).first();
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    await settle(page, 500);
    const time = `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
    const text = await page.locator('.cc-app').innerText();
    report.pass(`${tag}: once the client says yes, the page says until when`, text.includes(`Sam said yes. You can view what Sam shares until ${time}.`), time);
    report.pass(`${tag}: while the yes runs, nothing asks again`, !/Ask to view Sam’s portal/.test(text));
    await page.getByText('Sam said yes.').scrollIntoViewIfNeeded();
    await check(page, `${tag}, Sam said yes`, { size, theme });
    await shot(page, `view-yes.${size}.${theme}`);
  } else report.pass(`${tag}: the seed gives Sam an account`, false);
  await t.done(`${tag}, sent`);
}

// ---------------------------------------------------------------- the client's Coaching page
const CLIENT_STATE = join(tmpdir(), 'clarity-coach-tests', 'client.json');
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A signed-in context for the test client (the session is kept in the system's temporary folder, never printed). */
async function clientContext({ size, theme }) {
  mkdirSync(join(tmpdir(), 'clarity-coach-tests'), { recursive: true });
  const opts = { viewport: SIZE_OF[size], colorScheme: theme, serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: size === 400 };
  if (existsSync(CLIENT_STATE)) return browser.newContext({ ...opts, storageState: CLIENT_STATE });
  const env = readEnv();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => json(r, { ok: true, sent: false }));
  // Signing in only reads: every write the portal would make after it is stopped here.
  await page.route('**/rest/v1/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : json(route, null)));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await ctx.storageState({ path: CLIENT_STATE });
  await page.close();
  return ctx;
}

/** What a coach has sent, as the database's functions return it (049 and 050). `nothing`: someone with no coach at all. */
function fromCoach({ nothing = false } = {}) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const dayKey = (offset) => { const d = new Date(now + offset * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  if (nothing) return { coach: null, invites: [], views: [], covers: [], recaps: [], prep: null };
  return {
    coach: { coach_id: uid(900), first_name: 'Tim', away_until: null, mobile: null, contact_ways: ['email'] },
    invites: [{ profile_id: uid(901), coach_first_name: 'Tim', invited_at: iso(now - 3600000) }],
    views: [{ request_id: uid(902), coach_first_name: 'Tim', asked_at: iso(now - 600000), answered_at: null, allowed: null, expires_at: null }],
    covers: [{ cover_id: uid(903), coach_first_name: 'Tim', cover_first_name: 'Maya', starts_on: dayKey(30), ends_on: dayKey(43), agreed_at: null }],
    recaps: [
      { session_id: uid(910), starts_at: iso(now - 3 * 86400000), minutes: 60, kind: 'session', coach_first_name: 'Tim', group_name: null, sent_at: iso(now - 3 * 86400000 + 7200000),
        recap: 'Thanks for today.\n\nWe looked at the pricing launch and where your time goes in the week before it. You named two things only you can do: the investor call and the pricing story for the sales team.\n\nYou’re handing the rest of the launch plan to Femi.',
        actions: [
          { id: uid(920), title: 'Hand the launch plan to Femi by Wednesday', goes_to: 'week', done: false, placed: false },
          { id: uid(921), title: 'Book a 15-minute check-in each morning of launch week, so nothing waits for the weekly meeting', goes_to: 'backlog', done: false, placed: false },
          { id: uid(922), title: 'Send the investor call notes', goes_to: 'week', done: true, placed: true },
        ] },
      { session_id: uid(911), starts_at: iso(now - 17 * 86400000), minutes: 60, kind: 'session', coach_first_name: 'Tim', group_name: 'Leadership team', sent_at: iso(now - 17 * 86400000 + 7200000), recap: 'A short one this time: the team agreed who decides on pricing, and when.', actions: [] },
    ],
    prep: null,
  };
}

/** Opens a client page with every function and table the Coaching page calls stood in, and every other write stopped. */
async function openClient(path, { size, theme, data }) {
  const ctx = await clientContext({ size, theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  const calls = [];
  const blocked = [];
  await page.route('**/api/**', (r) => { blocked.push(`api ${new URL(r.request().url()).pathname}`); return json(r, { ok: true, sent: false }); });
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const name = url.pathname.split('/rest/v1/')[1] || '';
    const args = (() => { try { return req.postDataJSON() || {}; } catch { return {}; } })();
    if (name.startsWith('rpc/')) {
      const fn = name.slice(4);
      const now = Date.now();
      switch (fn) {
        case 'my_coach': return json(route, data.coach ? [data.coach] : []);
        case 'my_coach_invites': calls.push(fn); return json(route, data.invites);
        case 'client_accept_invite': {
          calls.push(`${fn} ${args.p_profile}`);
          if (!data.invites.some((i) => i.profile_id === args.p_profile)) return json(route, { code: '42501', message: 'That invite isn’t open.' }, 403);
          const answer = data.acceptAnswer || 'linked';
          if (answer === 'linked') data.invites = data.invites.filter((i) => i.profile_id !== args.p_profile);
          return json(route, answer);
        }
        case 'my_view_asks': calls.push(fn); return json(route, data.views);
        case 'client_view_answer': {
          calls.push(`${fn} ${args.p_allowed}`);
          const v = data.views.find((x) => x.request_id === args.p_request && !x.answered_at);
          if (!v) return json(route, { code: '42501', message: 'That request isn’t open.' }, 403);
          Object.assign(v, { answered_at: new Date(now).toISOString(), allowed: args.p_allowed, expires_at: args.p_allowed ? new Date(now + 30 * 60000).toISOString() : null });
          return route.fulfill({ status: 204 });
        }
        case 'my_cover_asks': calls.push(fn); return json(route, data.covers);
        case 'cover_agree': {
          calls.push(fn);
          const c = data.covers.find((x) => x.cover_id === args.p_cover && !x.agreed_at);
          if (!c) return json(route, { code: '42501', message: 'That isn’t yours to agree.' }, 403);
          c.agreed_at = new Date(now).toISOString();
          return route.fulfill({ status: 204 });
        }
        case 'my_session_recaps': calls.push(fn); return json(route, data.recaps);
        case 'my_session_action': {
          calls.push(`${fn} done:${args.p_done} placed:${args.p_placed}`);
          const a = data.recaps.flatMap((r) => r.actions).find((x) => x.id === args.p_action);
          if (!a) return json(route, { code: '42501', message: 'That action isn’t yours.' }, 403);
          if (args.p_done != null) a.done = args.p_done;
          if (args.p_placed != null) a.placed = args.p_placed;
          return route.fulfill({ status: 204 });
        }
        // Any other checked function is answered with nothing: it never runs.
        default: return json(route, null);
      }
    }
    if (name.startsWith('session_prep')) {
      calls.push(`${req.method()} session_prep`);
      if (req.method() === 'GET') return json(route, data.prep ? [data.prep] : []);
      if (req.method() === 'POST') { const row = Array.isArray(args) ? args[0] : args; data.prep = { body: row.body, noted_at: row.noted_at }; data.prepUser = row.user_id; return json(route, [], 201); }
      if (req.method() === 'DELETE') { data.prep = null; return route.fulfill({ status: 204 }); }
      return route.abort();
    }
    if (['GET', 'HEAD'].includes(req.method())) return route.fallback();
    // A to-do added from a recap's action is taken here and never reaches the test project.
    if (name.startsWith('todos') && req.method() === 'POST') { calls.push('POST todos'); data.todos = [...(data.todos || []), ...(Array.isArray(args) ? args : [args])]; return json(route, Array.isArray(args) ? args : [args], 201); }
    blocked.push(`${req.method()} ${name.split('?')[0]}`);
    return route.abort('blockedbyclient');
  });
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ui-root', { timeout: 20000 });
  await page.evaluate((t) => {
    localStorage.setItem('clarity-colour-mode', t);
    localStorage.removeItem('clarity-coaching-not-yet');
    for (const k of Object.keys(localStorage)) if (/:coaching(-|$)/.test(k) || /draft:.*coaching-prep/.test(k)) localStorage.removeItem(k);
  }, theme);
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.ui-root', { timeout: 20000 });
  await settle(page, 1500);
  return {
    page, calls, blocked,
    done: async (name, { allow = [] } = {}) => {
      const stray = blocked.filter((b) => !allow.some((a) => b.includes(a)));
      report.pass(`${name}: nothing reached the test project or the email server`, stray.length === 0, [...new Set(stray)].slice(0, 5).join('; '));
      report.pass(`${name}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/:coaching(-|$)/.test(k) || /coaching-prep/.test(k) || k === 'clarity-coaching-not-yet' || k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:')) localStorage.removeItem(k); });
      await ctx.close();
    },
  };
}

async function coaching(size, theme) {
  const tag = `coaching, ${size}px ${theme}`;
  const two = (n) => String(n).padStart(2, '0');

  // ---- Home, then the page, for someone their coach has sent things to
  let data = fromCoach();
  let t = await openClient('/welcome', { size, theme, data });
  let { page } = t;
  const quiet = await page.locator('.ds-quiet-row').filter({ hasText: 'has sent something for you' }).first();
  report.pass(`${tag}: Home has one quiet line, “Tim has sent something for you.”, with Open`, (await quiet.count()) === 1 && /Tim has sent something for you\./.test(await quiet.innerText()) && /Open/.test(await quiet.innerText()), (await page.locator('.ds-quiet').innerText().catch(() => 'no quiet lines')).slice(0, 200));
  report.pass(`${tag}: Home never has more than two quiet lines`, (await page.locator('.ds-quiet-row').count()) <= 2, String(await page.locator('.ds-quiet-row').count()));
  if (await quiet.count()) { await quiet.scrollIntoViewIfNeeded(); await shot(page, `home-line.${size}.${theme}`); await quiet.getByRole('button', { name: 'Open' }).click(); await settle(page, 1500); }
  report.pass(`${tag}: Open goes to the Coaching page`, new URL(page.url()).pathname === '/coaching', page.url());
  report.pass(`${tag}: the tab reads “Coaching, The Clarity Portal”`, (await page.title()) === 'Coaching, The Clarity Portal', await page.title());
  const root = { size, theme, root: '.ui-root' };
  let text = await check(page, tag, root);
  await shot(page, `coaching.${size}.${theme}`, { full: true });
  const until = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  report.pass(`${tag}: one title, “Coaching”, and the three sections in order`, (await page.locator('h1').count()) === 1 && /^coaching$/i.test((await page.locator('h1').innerText()).trim()) && (await page.locator('.coaching-section .ds-section-title').allInnerTexts()).map((s) => s.trim().toLowerCase()).join(' | ') === 'from your coach | for next time | session recaps', (await page.locator('.coaching-section .ds-section-title').allInnerTexts()).join(' | '));
  report.pass(`${tag}: the invite, in its own words`, text.includes('Tim has invited you to work together in The Clarity Portal.') && text.includes('Accept') && text.includes('Not now'));
  report.pass(`${tag}: the View as client request, in its own words`, text.includes('Tim would like to view your portal for 30 minutes.') && text.includes('They’ll see it as you do, and nothing can be changed.') && text.includes('Yes, for 30 minutes'));
  report.pass(`${tag}: cover, with its dates in words`, /While Tim is away from (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}( \d{4})? to (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}( \d{4})?, Maya will cover\./.test(text) && text.includes('Maya sees only what you share.') && text.includes('I agree'), text.match(/While Tim[^\n]*/)?.[0]);
  report.pass(`${tag}: For next time, with the line under it`, text.includes('What do you want to talk about next time?') && text.includes('Tim sees this before your next session.'));
  report.pass(`${tag}: recaps newest first, as sent, with their actions`, text.indexOf('We looked at the pricing launch') > 0 && text.indexOf('We looked at the pricing launch') < text.indexOf('A short one this time') && text.includes('Leadership team, with Tim') && text.includes('Hand the launch plan to Femi by Wednesday'));
  report.pass(`${tag}: each action offers the place its coach chose, or says where it is`, (await page.getByRole('button', { name: /^Add to this week: Hand the launch plan/ }).count()) === 1 && (await page.getByRole('button', { name: /^Add to my backlog: Book a 15-minute/ }).count()) === 1 && text.includes('It’s in your to-dos.'));

  // Accept the invite.
  await page.getByRole('button', { name: 'Accept the invite from Tim' }).click();
  await settle(page, 900);
  report.pass(`${tag}: Accept says “You’re now working with Tim.” and the invite goes`, (await page.locator('.ds-toast-text').last().textContent().catch(() => '')) === 'You’re now working with Tim.' && !(await page.locator('.ui-root').first().innerText()).includes('has invited you'), await toast(page));
  // Yes to View as client, for 30 minutes.
  const before = Date.now();
  await page.getByRole('button', { name: 'Yes, for 30 minutes' }).click();
  await settle(page, 900);
  text = await page.locator('.ui-root').first().innerText();
  report.pass(`${tag}: after yes it says until when, on a 24-hour clock`, [until(before + 30 * 60000), until(before + 31 * 60000)].some((time) => text.includes(`Tim can view your portal until ${time}.`)) && !text.includes('Yes, for 30 minutes'), text.match(/Tim can view[^\n]*/)?.[0]);
  // Agree to cover.
  await page.getByRole('button', { name: 'I agree to Maya covering' }).click();
  await settle(page, 700);
  report.pass(`${tag}: after I agree it reads “Agreed”, with nothing to un-agree`, (await page.locator('.coaching-agreed').innerText()) === 'Agreed' && (await page.getByRole('button', { name: /I agree/ }).count()) === 0);
  report.pass(`${tag}: each answer went through its own checked function`, ['client_accept_invite', 'client_view_answer true', 'cover_agree'].every((c) => t.calls.some((x) => x.startsWith(c))), t.calls.filter((c) => /accept|answer|agree/.test(c)).join(', '));
  await check(page, `${tag}, answered`, root);
  await shot(page, `coaching-answered.${size}.${theme}`, { full: true });

  // For next time: save, then clear it (which deletes the note, with Undo).
  const box = page.getByLabel('What do you want to talk about next time?');
  await box.click();
  if (size <= 600) await settle(page, 400);
  await page.keyboard.type('How to hand over the launch without checking in every hour.');
  if (size <= 600 && await page.getByRole('button', { name: 'Done', exact: true }).count()) { await page.getByRole('button', { name: 'Done', exact: true }).click(); await settle(page, 400); }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await settle(page, 700);
  report.pass(`${tag}: Save says “Saved”, and the note is the person’s own row`, (await toast(page)) === 'Saved' && data.prep?.body === 'How to hand over the launch without checking in every hour.' && Boolean(data.prepUser), `${await toast(page)} ${JSON.stringify(data.prep)}`);
  await shot(page, `coaching-prep.${size}.${theme}`);
  await box.click();
  if (size <= 600) await settle(page, 400);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  if (size <= 600 && await page.getByRole('button', { name: 'Done', exact: true }).count()) { await page.getByRole('button', { name: 'Done', exact: true }).click(); await settle(page, 400); }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await settle(page, 700);
  report.pass(`${tag}: clearing it deletes the note, with “Deleted” and Undo`, (await toast(page)) === 'Deleted' && data.prep === null, `${await toast(page)} ${JSON.stringify(data.prep)}`);
  await undo(page);
  report.pass(`${tag}: Undo brings the note back`, data.prep?.body === 'How to hand over the launch without checking in every hour.', JSON.stringify(data.prep));

  // A recap's action: the tick, then the shared add panel set to the place its coach chose.
  const first = page.locator('.coaching-action').filter({ hasText: 'Hand the launch plan to Femi' });
  await first.getByRole('checkbox').click();
  await settle(page, 500);
  report.pass(`${tag}: a tick marks the action done for the coach’s next brief`, t.calls.includes('my_session_action done:true placed:null') && (await first.getByRole('checkbox').getAttribute('aria-checked')) === 'true', t.calls.filter((c) => c.startsWith('my_session_action')).join(', '));
  await first.getByRole('checkbox').click();
  await settle(page, 500);
  await page.getByRole('button', { name: /^Add to my backlog: Book a 15-minute/ }).click();
  await settle(page, 900);
  const panel = page.locator('[role=dialog]').last();
  const panelText = await panel.innerText();
  report.pass(`${tag}: the add panel opens with the action’s words`, (await panel.locator('textarea, input[type=text]').first().inputValue().catch(() => '')).startsWith('Book a 15-minute check-in') || panelText.includes('Book a 15-minute check-in'), panelText.slice(0, 160));
  await check(page, `${tag}, the add panel`, root);
  await shot(page, `coaching-add.${size}.${theme}`);
  if (/Every to-do serves one of your Strategies/.test(panelText) || !/Where should it go\?/.test(panelText)) {
    console.log(`  note (${tag}): the test client’s plan has no Strategy, so the add panel says so and nothing can be added here.`);
    await closePanel(page);
  } else {
    const backlog = panel.getByRole('radio', { name: 'Backlog' });
    report.pass(`${tag}: it is already set to the place the coach chose`, (await backlog.getAttribute('aria-checked')) === 'true', await backlog.getAttribute('aria-checked'));
    const medium = panel.getByRole('radio', { name: 'Medium' });
    if (await medium.count()) await medium.click();
    await settle(page, 200);
    await panel.getByRole('button', { name: /^Add (my )?to-do$/ }).click();
    await settle(page, 1200);
    const said = await toast(page);
    const todo = (data.todos || [])[0] || null;
    report.pass(`${tag}: the to-do is added to the backlog, from this action`, /Added to your backlog/.test(said) && todo?.source === 'other_tool' && todo?.source_id === uid(921), `${said} ${todo ? `${todo.source} ${todo.source_id}` : 'no to-do'}`);
    const row = page.locator('.coaching-action').filter({ hasText: 'Book a 15-minute' });
    report.pass(`${tag}: the row says where it is, and the coach is told it was added`, /It’s in your backlog\./.test(await row.innerText()) && t.calls.includes('my_session_action done:null placed:true'), `${await row.innerText()} | ${t.calls.filter((c) => c.startsWith('my_session_action')).join(', ')}`);
    await shot(page, `coaching-added.${size}.${theme}`);
  }
  await t.done(tag, { allow: ['todos', 'day_plan', 'person_settings'] });

  // ---- the other two answers to Accept, and Not now
  data = fromCoach();
  data.views = []; data.covers = []; data.recaps = [];
  data.acceptAnswer = 'has_another_coach';
  t = await openClient('/coaching', { size, theme, data });
  page = t.page;
  await page.getByRole('button', { name: 'Accept the invite from Tim' }).click();
  await settle(page, 800);
  report.pass(`${tag}: an account that already has a coach is told calmly, and nothing changed`, (await toast(page)) === 'You already have a coach in The Clarity Portal, so nothing changed. Ask Tim if that isn’t right.', await toast(page));
  await t.done(`${tag}, another coach`);
  data = fromCoach();
  data.views = []; data.covers = []; data.recaps = [];
  t = await openClient('/coaching', { size, theme, data });
  page = t.page;
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await settle(page, 1500);
  report.pass(`${tag}: Not now says “We’ll ask again tomorrow.” and goes Home, where the line has gone for today`, new URL(page.url()).pathname === '/welcome' && (await page.locator('.ds-quiet-row').filter({ hasText: 'has sent something' }).count()) === 0, page.url());
  await t.done(`${tag}, not now`);

  // ---- a recap alone: Home's line until the page has been opened
  data = fromCoach();
  data.invites = []; data.views = []; data.covers = [];
  t = await openClient('/welcome', { size, theme, data });
  page = t.page;
  const recapLine = page.locator('.ds-quiet-row').filter({ hasText: 'Tim sent a recap of your session.' });
  report.pass(`${tag}: a recap sent since the page was last opened is Home’s line`, (await recapLine.count()) === 1, (await page.locator('.ds-quiet').innerText().catch(() => 'no quiet lines')).slice(0, 160));
  if (await recapLine.count()) { await recapLine.getByRole('button', { name: 'Open' }).click(); await settle(page, 1500); }
  await page.goto(`${APP}/welcome`);
  await settle(page, 1800);
  report.pass(`${tag}: once the page has been opened the line has gone`, (await page.locator('.ds-quiet-row').filter({ hasText: 'recap of your session' }).count()) === 0);
  await t.done(`${tag}, a recap`);

  // ---- nothing from a coach at all: Home as it was, and one calm line on the page
  data = fromCoach({ nothing: true });
  t = await openClient('/welcome', { size, theme, data });
  page = t.page;
  const home = await page.locator('.ui-root').first().innerText();
  report.pass(`${tag}: with nothing from a coach Home says nothing about it, and nothing links to the page`, !/has sent something|sent a recap/.test(home) && (await page.locator('a[href="/coaching"]').count()) === 0);
  await shot(page, `home-nothing.${size}.${theme}`);
  await page.goto(`${APP}/coaching`);
  await settle(page, 1500);
  text = await check(page, `${tag}, nothing`, root);
  report.pass(`${tag}: opened directly it shows one calm line`, text.includes('Nothing from your coach yet.') && (await page.locator('.coaching-section').count()) === 0, text.slice(0, 200));
  await shot(page, `coaching-nothing.${size}.${theme}`);
  await t.done(`${tag}, nothing`);

  // ---- before the migrations: quiet, and asked for at most once an hour
  data = fromCoach({ nothing: true });
  t = await openClient('/coaching', { size, theme, data });
  page = t.page;
  let asked = 0;
  await page.route('**/rest/v1/rpc/my_coach_invites', (route) => { asked += 1; return json(route, { code: 'PGRST202', message: 'Could not find the function public.my_coach_invites without parameters in the schema cache', details: null, hint: null }, 404); });
  await page.reload();
  await settle(page, 1500);
  await page.reload();
  await settle(page, 1500);
  await page.goto(`${APP}/welcome`);
  await settle(page, 1500);
  report.pass(`${tag}: before 049 and 050 the page is quiet and asks once, not on every visit`, asked === 1 && !/has sent something|didn’t load/.test(await page.locator('.ui-root').first().innerText()), `asked ${asked} times`);
  await t.done(`${tag}, not there yet`);
}

try {
  for (const theme of MODES) {
    for (const size of SIZES) {
      if (PARTS.includes('board')) await board(size, theme);
      if (PARTS.includes('org') && size !== 768) await org(size, theme);
      if (PARTS.includes('workshop') && size !== 768) await workshop(size, theme);
      if (PARTS.includes('invite') && size !== 768) await invite(size, theme);
      if (PARTS.includes('coaching') && size !== 768) await coaching(size, theme);
    }
    if (PARTS.includes('table') && SIZES.includes(1440)) await table(theme);
  }
} finally {
  await browser.close();
}
report.done();
