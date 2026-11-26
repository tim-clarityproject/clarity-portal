// The brief before a call, After a call, the guided close and the sessions
// on a client's and a group's page (Phase 6a run 2, steps 4 and 5): each
// screen at 1440, 768 and 400, dark and light, as the owner and as an
// associate, held to the same calm rules as the UI tester (ui.mjs) and
// pictured; then what each does (flows): the recap saved as it is typed,
// sent once however often it is pressed, the session locked once sent (on
// this device, before 050, and in a second tab that never heard of it),
// each outcome, Waive it, Moved, Add session, sessions left, the brief's
// Done and Not yet, and the guided close.
//
// The page's clock is pinned to a day at or before the real one (never
// ahead: sign-in rule 46), and the seed counts its days from the same day.
// Everything stays on the device: the stand-in tells the page 049 and 050
// aren't there, stops any write and counts it, and this test fails if one
// was tried. What a client shares (For next time, week scores, a peak
// review, monthly reviews) is answered by stand-ins, and so is /api/.
//
//   node --import ./tests/scores/register.mjs tests/coach/sessions.mjs [folder for screenshots]
//   STATES=brief,session,outcomes,sent,client,group,close,flow  ROLES=owner,associate  SIZES=1440,768,400  MODES=dark,light  narrow it.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { buttonProblems, chevronOnlyFolds, doubledRules, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, settle, standIn } from './shared.mjs';
import { ID, seedClock, seedWithDay, SES, SHARED } from './seed.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const report = makeReport('Coach portal, sessions');
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };
const TUE = new Date(2026, 10, 17, 9, 0);

const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const press = async (page, name) => { await button(page, name).click(); await settle(page, 450); };
const closePanel = async (page) => { await page.keyboard.press('Escape'); await settle(page, 450); };
const pick = async (page, label, option) => {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const openFold = async (page, name) => { const b = page.locator('.cc-fold-btn', { hasText: name }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await settle(page, 300); } };

/** Each state: where it opens and its screens in order (each a name, what to do first, and options). */
const STATES = {
  brief: {
    to: '/coach',
    screens: [
      ['open', async (page) => { await page.locator('.cc-today-call--open').first().click(); await settle(page, 900); }],
      ['foot', async (page) => { await page.locator('.ds-dialog-body').evaluate((b) => { b.scrollTop = b.scrollHeight; }); await settle(page, 300); }, { then: closePanel }],
    ],
  },
  session: {
    to: `/coach/sessions/${SES.write}`,
    screens: [
      ['page', null, { full: true }],
      ['needs-recap', async (page) => { await page.getByLabel('Recap for Hannah').fill(''); await press(page, 'Send the recap'); }],
    ],
  },
  outcomes: {
    to: `/coach/sessions/${SES.blank}`,
    screens: [
      ['unwritten', null, { full: true }],
      ['late', async (page) => { await pick(page, 'What happened', 'Cancelled with under 24 hours’ notice'); }],
      ['no-show', async (page) => { await pick(page, 'What happened', 'No-show'); }],
      ['moved', async (page) => { await pick(page, 'What happened', 'Moved'); await press(page, 'Save'); }],
    ],
  },
  sent: { to: `/coach/sessions/${SES.sent}`, screens: [['page', null, { full: true }]] },
  future: { to: `/coach/sessions/${SES.future}`, screens: [['page', null, { full: true }]] },
  client: {
    to: `/coach/clients/${SES.hannah}`,
    screens: [
      ['page', async (page) => { await openFold(page, 'Sessions and recaps'); await openFold(page, 'To-dos'); await openFold(page, 'More'); }, { full: true }],
      ['add-session', async (page) => { await page.locator('.ds-addrow', { hasText: 'Add session' }).first().click(); await settle(page, 500); }],
      ['add-session-empty', async (page) => { await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300); }, { then: closePanel }],
    ],
  },
  group: { to: `/coach/groups/${ID.group}`, screens: [['page', null, { full: true }]] },
  close: { to: `/coach/clients/${ID.priya}/close`, screens: [['page', null, { full: true }]] },
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
  // Boxes side by side sit level: their tops and their bottoms.
  const level = [...root.querySelectorAll('.cc-ses-top, .cc-ses-two')].filter(vis).flatMap((g) => {
    const boxes = [...g.querySelectorAll('.ds-dd, .ds-field, .ds-seg')].filter(vis).map((c) => c.getBoundingClientRect());
    if (boxes.length !== 2 || Math.abs(boxes[0].left - boxes[1].left) < 2) return [];
    return Math.abs(boxes[0].top - boxes[1].top) > 0.5 || Math.abs(boxes[0].bottom - boxes[1].bottom) > 0.5 ? [`tops ${Math.round(boxes[0].top)} and ${Math.round(boxes[1].top)}, bottoms ${Math.round(boxes[0].bottom)} and ${Math.round(boxes[1].bottom)}`] : [];
  });
  // A page's own bottom bar: its button ends on the column's right edge, and the phone bar steps back.
  const barButton = [...document.querySelectorAll('.cc-ses-bar .ds-btn')].filter(vis)[0];
  const col = document.querySelector('.cc-col');
  const colRight = col ? col.getBoundingClientRect().right - parseFloat(getComputedStyle(col).paddingRight) : 0;
  const phoneBar = document.querySelector('.cc-phonebar');
  const last = [...(col?.querySelectorAll('button, a, textarea, p') || [])].filter(vis).pop();
  const cs = getComputedStyle(document.querySelector('.cc-app') || document.body);
  return {
    small, level,
    bar: barButton ? { off: Math.round(barButton.getBoundingClientRect().right - colRight), phoneBar: Boolean(phoneBar && vis(phoneBar)), top: document.querySelector('.cc-ses-bar').getBoundingClientRect().top, pageEnd: last ? last.getBoundingClientRect().bottom + window.scrollY : 0, pageHeight: document.documentElement.scrollHeight, barHeight: document.querySelector('.cc-ses-bar').getBoundingClientRect().height } : null,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    shortcuts: [...document.querySelectorAll('kbd')].filter(vis).length + ((text.match(/[⌘⌥⇧]|\b(Cmd|Ctrl)\s?\+/g) || []).length),
    adds: [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t)),
    background: cs.backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    fail: /\bfail(ed|s|ure)?\b/i.test(text),
    change: /\bChange\b/.test(text),
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
  report.pass(`${tag}: “Edit”, never “Change”, on a link or button`, !r.change);
  report.pass(`${tag}: boxes side by side sit level`, r.level.length === 0, r.level.join('; '));
  if (r.bar) {
    report.pass(`${tag}: the bottom bar’s button ${phone ? 'runs the column’s width' : 'ends on the column’s right edge'}`, Math.abs(r.bar.off) <= 1, `${r.bar.off}px off`);
    report.pass(`${tag}: the phone bar steps back while the page’s own bar shows`, !r.bar.phoneBar);
    report.pass(`${tag}: the page’s last line clears its bottom bar`, r.bar.pageEnd <= r.bar.pageHeight - r.bar.barHeight + 1, `ends ${Math.round(r.bar.pageEnd)}, page ${r.bar.pageHeight}, bar ${Math.round(r.bar.barHeight)}`);
  }
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

const fulfil = (body) => (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : route.fallback());

/** What a client shares, answered as the database would answer their coach (Sam and Priya have accounts here). */
async function shareStandIns(page) {
  const user = (route) => (new URL(route.request().url()).searchParams.get('user_id') || '').replace(/^(eq\.|in\.\(|\))/g, '').replace(/\)$/, '');
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  await page.route('**/rest/v1/peak_moments*', (route) => fulfil(user(route).includes(SES.samUser) ? SHARED.moments(SES.samUser) : [])(route));
  await page.route('**/rest/v1/session_prep*', (route) => fulfil(user(route) === SES.samUser ? SHARED.prep() : null)(route));
  await page.route('**/rest/v1/week_scores*', (route) => fulfil(user(route) === SES.samUser ? SHARED.weekScores() : [])(route));
  await page.route('**/rest/v1/peak_reviews*', (route) => fulfil(user(route) === SES.samUser ? SHARED.reviews() : [])(route));
  await page.route('**/rest/v1/checkins*', (route) => fulfil(user(route) === SES.priyaUser ? SHARED.checkins() : [])(route));
}

/** Opens a coach page on the pinned day with the seed on the device; resolves the page, its stand-in and how to finish. */
async function open(to, { size = 1440, theme = 'dark', role = 'owner', ctx = null, stale = false } = {}) {
  const own = ctx || await coachContext(browser, { size, theme });
  const page = await own.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  await page.clock.setFixedTime(TUE);
  seedClock(TUE);
  const store = await standIn(page, { role, db: 'none' });
  await shareStandIns(page);
  // A tab that never hears of another tab's change (for the lock's own check).
  if (stale) await page.addInitScript(() => window.addEventListener('storage', (e) => e.stopImmediatePropagation(), true));
  let me = null;
  if (!ctx) {
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app', { timeout: 20000 });
    me = await accountId(page);
    await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
    await clearDevice(page, me);
    await seedDevice(page, me, seedWithDay({ accounts: true, sessions: true }));
  }
  await page.goto(`${APP}${to}`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  await settle(page, 1200);
  if (!me) me = await accountId(page);
  return {
    page, store, errors, ctx: own, me,
    done: async (name, { keep = false } = {}) => {
      const blocked = store.calls.filter((c) => c.startsWith('blocked'));
      report.pass(`${name}: nothing was written to the database`, blocked.length === 0, blocked.slice(0, 4).join('; '));
      report.pass(`${name}: nothing in the console`, errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
      if (keep) { await page.close(); return; }
      await clearDevice(page, me);
      await own.close();
    },
  };
}

const toast = async (page) => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
const undo = async (page) => { await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 600); };
const words = (page) => page.evaluate(() => document.querySelector('.cc-app').innerText);
const kept = (page, me, table) => page.evaluate(([id, t]) => { const s = JSON.parse(localStorage.getItem(`clarity-coach-local:${id}`) || '{}'); return Object.values(s.rows?.[t] || {}); }, [me, table]);

async function flows() {
  // ---- After a call: typed, saved, sent once, locked.
  let t = await open(`/coach/sessions/${SES.write}`);
  let { page, me } = t;
  let text = await words(page);
  report.pass('flow: After a call names the kind, the client and when', /COACHING SESSION/i.test(text) && /Hannah Wells/.test(text) && /Yesterday|Mon 16 Nov, 15:30/.test(text), text.slice(0, 120));
  report.pass('flow: Back goes to the client', (await page.locator('.cc-backrow').innerText()).trim() === 'Hannah Wells');
  report.pass('flow: no note sits beside Send the recap', (await page.locator('.cc-ses-bar').innerText()).trim() === 'Send the recap');
  const recapBox = page.getByLabel('Recap for Hannah');
  await recapBox.fill('Thanks for today, Hannah.\n\nYou’re handing the launch plan to Femi.');
  await settle(page, 1500);
  report.pass('flow: the recap saves as it is typed, on the device', (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.write)?.recap?.includes('handing the launch plan to Femi'));
  // Where an action goes, and whether it is sent, switch with a tap.
  const where = page.locator('.cc-ses-where').first();
  await where.click(); await settle(page, 300);
  report.pass('flow: where an action goes switches to the Backlog', (await where.innerText()) === 'Goes to the Backlog');
  await where.click(); await settle(page, 300);
  report.pass('flow: and back to this week', (await where.innerText()) === 'Goes to this week' && (await kept(page, me, 'coach_session_actions')).find((a) => a.id === SES.a1)?.goes_to === 'week');
  const tick3 = page.getByRole('checkbox', { name: 'Send “Write the pricing story on one page” to Hannah' });
  report.pass('flow: an action not ticked isn’t sent', (await tick3.getAttribute('aria-checked')) === 'false');
  // Add action, type it, remove it with Undo.
  await page.locator('.ds-addrow', { hasText: 'Add action' }).click(); await settle(page, 300);
  report.pass('flow: Add action opens a new box with the cursor in it', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Action 4'));
  await page.keyboard.type('Send Femi the launch checklist');
  await settle(page, 1500);
  report.pass('flow: a new action saves once typing pauses', (await kept(page, me, 'coach_session_actions')).some((a) => a.title === 'Send Femi the launch checklist' && a.send === true));
  await page.getByRole('button', { name: 'Remove Send Femi the launch checklist' }).click(); await settle(page, 500);
  report.pass('flow: removing an action says Deleted, with Undo', (await toast(page)) === 'Deleted');
  await undo(page);
  report.pass('flow: Undo puts the action back', (await page.locator('.cc-ses-act').count()) === 4 && (await kept(page, me, 'coach_session_actions')).some((a) => a.title === 'Send Femi the launch checklist'));
  // Private notes save too.
  await page.getByLabel('Next time').fill('Ask how the handover went.');
  await settle(page, 1500);
  report.pass('flow: private notes save as they are typed', (await kept(page, me, 'coach_session_notes')).find((n) => n.session_id === SES.write)?.next_time === 'Ask how the handover went.');

  // A second tab that never hears of the first one's changes.
  const b = await open(`/coach/sessions/${SES.write}`, { ctx: t.ctx, stale: true });
  report.pass('flow: a second tab shows the recap as the first one saved it', (await b.page.getByLabel('Recap for Hannah').inputValue()).includes('handing the launch plan to Femi'));

  // Send, pressed twice: it goes once.
  await button(page, 'Send the recap').dblclick();
  await settle(page, 900);
  report.pass('flow: Send the recap says exactly what happens (no email before 050)', (await toast(page)) === 'Sent. Hannah sees it in the portal, with the actions you ticked.', await toast(page));
  report.pass('flow: nothing asked the email server on the device', !t.store.calls.some((c) => c.startsWith('api ')), t.store.calls.filter((c) => c.startsWith('api ')).join('; '));
  text = await words(page);
  report.pass('flow: once sent, the page says the session stays as it is', text.includes('The recap has been sent, so this session stays as it is.'));
  report.pass('flow: and when it was sent', /Sent Tue 17 Nov, 09:00/.test(text), (text.match(/Sent [^\n]+/) || [''])[0]);
  report.pass('flow: What happened, How long, the recap and the actions are read-only', (await page.getByRole('combobox').count()) === 0 && (await page.locator('.ds-seg-btn').count()) === 0 && (await page.getByLabel('Recap for Hannah').locator('xpath=self::textarea').count()) === 0 && (await page.locator('.cc-ses-act').count()) === 0);
  report.pass('flow: the sent actions say where they went, and the unticked one that it wasn’t sent', /Goes to this week[\s\S]*Goes to the Backlog[\s\S]*Not sent/.test(text));
  report.pass('flow: private notes and For supervision stay editable', (await page.getByLabel('Focus').isEditable()) && (await page.getByLabel('Notes for supervision').isEditable()));
  report.pass('flow: there is no Send button, and no way to delete a sent session', (await page.locator('.cc-ses-bar').count()) === 0 && !/Delete this session/.test(text));
  await page.getByLabel('Insight').fill('Hannah lets go once the plan is on paper.');
  await settle(page, 1500);
  report.pass('flow: a note typed after sending still saves', (await kept(page, me, 'coach_session_notes')).find((n) => n.session_id === SES.write)?.insight === 'Hannah lets go once the plan is on paper.');
  const sentAt = (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.write)?.recap_sent_at;

  // The second tab still shows the session as unsent. The lock holds there too, before 050.
  await b.page.getByLabel('Recap for Hannah').fill('Rewritten after it was sent.');
  await settle(b.page, 1600);
  let row = (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.write);
  report.pass('flow: a recap can’t be rewritten after it was sent (refused on the device)', row.recap.includes('handing the launch plan to Femi') && row.recap_sent_at === sentAt, row.recap.slice(0, 60));
  report.pass('flow: the tab that tried shows the session as it was sent', (await words(b.page)).includes('The recap has been sent, so this session stays as it is.'));
  await b.done('flow, the second tab', { keep: true });
  const c = await open(`/coach/sessions/${SES.write}`, { ctx: t.ctx, stale: true });
  // (Opened after sending, it is already locked: so this tab is made stale by hand, then asked to send.)
  report.pass('flow: a tab opened afterwards is locked from the start', (await words(c.page)).includes('The recap has been sent'));
  await c.done('flow, a later tab', { keep: true });
  await page.reload(); await page.waitForSelector('.cc-app'); await settle(page, 1000);
  report.pass('flow: after a reload the sent recap is still there, read-only', (await words(page)).includes('You’re handing the launch plan to Femi.') && (await page.locator('.cc-ses-bar').count()) === 0);

  // Sessions left follows the session: Hannah had 3 held before, plus this one and the earlier sent one, and the late cancellation counts.
  await page.goto(`${APP}/coach/clients/${SES.hannah}`); await page.waitForSelector('.cc-fold-btn'); await settle(page, 800);
  text = await words(page);
  report.pass('flow: sessions to go counts every recorded session that counts', /6 of 12/.test(text), (text.match(/\d+ of 12/) || [''])[0]);
  await openFold(page, 'Sessions and recaps');
  text = await words(page);
  report.pass('flow: the client’s sessions list newest first, each with its state', /Recap sent[\s\S]*No recap yet|Coaching session[\s\S]*Late cancellation[\s\S]*Counts as used/.test(text) && /Recap sent/.test(text));
  report.pass('flow: the next session shows with Open the brief', /NEXT COACHING SESSION\s+Mon 23 Nov, 10:00\s+60 minutes, Zoom\s+Open the brief/i.test(text), (text.match(/NEXT COACHING SESSION[\s\S]{0,80}/i) || [''])[0]);
  await button(page, 'One more session held').click(); await settle(page, 600);
  report.pass('flow: a count the coach types stands', /5 of 12/.test(await words(page)) && (await toast(page)) === 'Saved');
  await undo(page);
  report.pass('flow: and Undo puts it back', /6 of 12/.test(await words(page)));
  // Add session, with Undo.
  await page.locator('.ds-addrow', { hasText: 'Add session' }).first().click(); await settle(page, 500);
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300);
  report.pass('flow: Add session is never greyed out', (await page.locator('.ds-dialog .cc-problem').innerText()) === 'Choose the day and the time to carry on.');
  await page.locator('.ds-dialog .ds-date').click(); await settle(page, 400);
  await page.locator('.ds-cal-day:not([disabled])', { hasText: /^25$/ }).first().click(); await settle(page, 400);
  await page.locator('.ds-dialog input[type=time]').fill('14:00');
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 700);
  report.pass('flow: Add session says so, with Undo', (await toast(page)) === 'Session added', await toast(page));
  report.pass('flow: the new session is in the list', (await kept(page, me, 'coach_sessions')).some((s) => s.profile_id === SES.hannah && new Date(s.starts_at).getDate() === 25 && s.engagement_id === SES.eHannah));
  await undo(page);
  report.pass('flow: Undo takes it out', !(await kept(page, me, 'coach_sessions')).some((s) => s.profile_id === SES.hannah && new Date(s.starts_at).getDate() === 25));
  // The client's To-dos fold: the coach's own, with the client already set.
  await openFold(page, 'To-dos');
  await page.locator('.cc-fold-body .ds-addrow', { hasText: 'Add to-do' }).click(); await settle(page, 500);
  await page.locator('.ds-dialog textarea, .ds-dialog input[type=text]').first().fill('Send Hannah the pricing article tomorrow');
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 700);
  const made = (await kept(page, me, 'coach_todos')).find((x) => x.title === 'Send Hannah the pricing article');
  report.pass('flow: a to-do added on a client’s page is the coach’s own, for that client', made?.profile_id === SES.hannah, JSON.stringify(made || null).slice(0, 80));
  report.pass('flow: and it shows in the fold', /Send Hannah the pricing article/.test(await words(page)));
  await openFold(page, 'More');
  await button(page, 'Start the guided close').click(); await settle(page, 700);
  report.pass('flow: Start the guided close opens the close', /\/coach\/clients\/[^/]+\/close$/.test(page.url()));
  await t.done('flow, after a call');

  // ---- Each outcome.
  t = await open(`/coach/sessions/${SES.blank}`); page = t.page; me = t.me;
  report.pass('flow: a session that has ended opens ready to write up, as “It went ahead”', (await page.getByRole('combobox', { name: /^What happened/ }).innerText()).includes('It went ahead') && (await page.locator('.cc-ses-bar').innerText()).trim() === 'Send the recap');
  await pick(page, 'What happened', 'Cancelled with under 24 hours’ notice');
  text = await words(page);
  report.pass('flow: a late cancellation says it counts, with Waive it', text.includes('It counts as one of Hannah’s sessions.') && /Waive it/.test(text));
  report.pass('flow: the recap, actions and notes are hidden, and the one button is Save', !/RECAP|PRIVATE NOTES/i.test(text) && (await page.locator('.cc-ses-bar').innerText()).trim() === 'Save');
  await press(page, 'Save');
  report.pass('flow: Save says Saved', (await toast(page)) === 'Saved');
  row = (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.blank);
  report.pass('flow: the late cancellation is kept, and counts', row.outcome === 'late_cancel' && row.waived === false);
  await press(page, 'Waive it');
  report.pass('flow: Waive it says so, with Undo', (await toast(page)) === 'Waived. It no longer counts as used.', await toast(page));
  report.pass('flow: a waived one reads as waived', (await words(page)).includes('Waived. It no longer counts as used.') && (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.blank).waived === true);
  await undo(page);
  report.pass('flow: Undo counts it again', (await kept(page, me, 'coach_sessions')).find((s) => s.id === SES.blank).waived === false);
  await pick(page, 'What happened', 'No-show');
  report.pass('flow: a no-show says it counts and only the coach sees it', (await words(page)).includes('It counts as used, and only you see it.'));
  await pick(page, 'What happened', 'Moved');
  await press(page, 'Save');
  report.pass('flow: Moved asks for the new day and time', (await page.locator('.cc-problem').innerText()) === 'Choose the new day and time to carry on.');
  await page.locator('.cc-ses-two .ds-date').click(); await settle(page, 400);
  await page.locator('.ds-cal-day:not([disabled])', { hasText: /^26$/ }).first().click(); await settle(page, 400);
  await page.locator('.cc-ses-two input[type=time]').fill('16:00');
  await press(page, 'Save');
  let all = await kept(page, me, 'coach_sessions');
  row = all.find((s) => s.id === SES.blank);
  const madeSession = all.find((s) => s.profile_id === SES.hannah && !s.outcome && new Date(s.starts_at).getDate() === 26);
  report.pass('flow: Moved marks this session moved and makes a new one at the new time', row.outcome === 'moved' && Boolean(row.moved_to) && Boolean(madeSession) && madeSession.minutes === 60 && madeSession.engagement_id === SES.eHannah);
  report.pass('flow: the page says where it moved to', (await words(page)).includes('It moved to Thu 26 Nov, 16:00.'));
  await undo(page);
  all = await kept(page, me, 'coach_sessions');
  report.pass('flow: Undo takes the new session away and puts this one back', !all.some((s) => s.profile_id === SES.hannah && new Date(s.starts_at).getDate() === 26) && all.find((s) => s.id === SES.blank).outcome === 'late_cancel');
  // Delete, with Undo.
  await button(page, 'Delete this session').click(); await settle(page, 700);
  report.pass('flow: Delete this session says Deleted and goes back to the client', (await toast(page)) === 'Deleted' && /\/coach\/clients\//.test(page.url()));
  await undo(page);
  report.pass('flow: Undo brings the session back', (await kept(page, me, 'coach_sessions')).some((s) => s.id === SES.blank));
  // A session still to come: only what can have happened.
  await page.goto(`${APP}/coach/sessions/${SES.future}`); await page.waitForSelector('.cc-col'); await settle(page, 800);
  text = await words(page);
  report.pass('flow: a session still to come says so, and offers no recap', text.includes('This session hasn’t happened yet.') && !/RECAP/i.test(text) && (await page.locator('.cc-ses-bar').count()) === 0);
  await page.getByRole('combobox', { name: /^What happened/ }).click(); await settle(page, 300);
  report.pass('flow: before its last 24 hours only Moved can have happened', (await page.getByRole('option').allInnerTexts()).join('|') === 'Moved');
  await page.keyboard.press('Escape');
  await t.done('flow, outcomes');

  // ---- The brief: Done and Not yet switch with a tap; the group's recap goes to everyone.
  t = await open('/coach'); page = t.page; me = t.me;
  await page.locator('.cc-today-call--open').first().click(); await settle(page, 900);
  text = await page.locator('.ds-dialog').innerText();
  report.pass('flow: the brief is in the order asked for', /Sam Okafor[\s\S]*Today, 12:30[\s\S]*60 minutes, Zoom[\s\S]*Prefers early calls[\s\S]*FOR THIS CALL[\s\S]*FROM LAST TIME[\s\S]*SINCE LAST TIME[\s\S]*COMING UP[\s\S]*YOUR NOTE FROM LAST TIME/i.test(text), text.replace(/\s+/g, ' ').slice(0, 200));
  report.pass('flow: Join on Zoom isn’t shown until the session has a link', !/Join on Zoom/.test(text));
  report.pass('flow: no email line (email logging is run 4)', !/emailed/.test(text));
  const notYet = page.getByRole('button', { name: /^Draft the restructure announcement, not yet/ });
  await notYet.click(); await settle(page, 500);
  report.pass('flow: tapping an action marks it done, and saves at once', (await toast(page)) === 'Saved' && Boolean((await kept(page, me, 'coach_session_actions')).find((a) => a.id === SES.b3)?.done_at));
  await undo(page);
  report.pass('flow: Undo marks it not yet again', !(await kept(page, me, 'coach_session_actions')).find((a) => a.id === SES.b3)?.done_at);
  await closePanel(page);
  await page.goto(`${APP}/coach/sessions/${SES.group1}`); await page.waitForSelector('.cc-col'); await settle(page, 800);
  report.pass('flow: a group’s session is a Group session, back to the group', /GROUP SESSION/i.test(await words(page)) && (await page.locator('.cc-backrow').innerText()).trim() === 'Kestrel leadership team');
  await t.done('flow, the brief');

  // ---- A group's recap, to everyone; and the guided close.
  t = await open(`/coach/groups/${ID.group}`); page = t.page; me = t.me;
  text = await words(page);
  report.pass('flow: a group’s written-up sessions say one recap goes to everyone', /Group session\s+90 minutes\s+One recap to all 3\s+Recap sent/.test(text), (text.match(/SESSIONS AND RECAPS[\s\S]{0,120}/i) || [''])[0]);
  report.pass('flow: the group’s sessions left follow its sessions', /2 of 6/.test(text), (text.match(/\d+ of 6/) || [''])[0]);
  await page.locator('.ds-addrow', { hasText: 'Add session' }).click(); await settle(page, 500);
  await page.locator('.ds-dialog .ds-date').click(); await settle(page, 400);
  await page.locator('.ds-cal-day:not([disabled])', { hasText: /^10$/ }).first().click(); await settle(page, 400);
  await page.locator('.ds-dialog input[type=time]').fill('14:00');
  await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 700);
  const groupSession = (await kept(page, me, 'coach_sessions')).find((s) => s.group_id === ID.group && new Date(s.starts_at).getDate() === 10 && !s.outcome);
  const people = (await kept(page, me, 'coach_session_people')).filter((p) => p.session_id === groupSession?.id);
  report.pass('flow: a group’s new session is a Group session, naming each member who counts against their own engagement', groupSession?.kind === 'group' && people.length === 1 && people[0].profile_id === ID.sam && people[0].engagement_id === ID.eSam, JSON.stringify(people).slice(0, 120));
  await page.goto(`${APP}/coach/sessions/${groupSession.id}`); await page.waitForSelector('.cc-col'); await settle(page, 800);
  await page.getByLabel('Recap for everyone').fill('Thank you all. We agreed the three decisions for January.');
  await settle(page, 1300);
  await press(page, 'Send the recap');
  report.pass('flow: a group’s recap is one send, to everyone', (await toast(page)) === 'Sent. All 3 see it in the portal.', await toast(page));
  await page.goto(`${APP}/coach/clients/${ID.sam}`); await page.waitForSelector('.cc-fold-btn'); await settle(page, 800);
  // Sam: 5 held before, 2 group sessions seeded and this one against his own engagement, and his own held sessions this week.
  const samLeft = ((await words(page)).match(/(\d+) of 12/) || [])[1];
  const samHeld = (await kept(page, me, 'coach_sessions')).filter((s) => s.engagement_id === ID.eSam && s.outcome === 'held').length;
  report.pass('flow: a group session counts against a member’s own engagement when theirs is the one it counts against', Number(samLeft) === 12 - (5 + 3 + samHeld), `${samLeft} of 12 with ${samHeld} of his own held`);

  await page.goto(`${APP}/coach/clients/${ID.priya}/close`); await page.waitForSelector('.cc-col'); await settle(page, 1000);
  text = await words(page);
  report.pass('flow: the close names the client and the engagement', /CLOSE THE ENGAGEMENT/i.test(text) && /Priya Nair/.test(text) && /6-month coaching, /.test(text));
  report.pass('flow: outcomes show the shared scores at the start and now', /Hardware score\s+52 at the start\s+(Now\s+)?71/.test(text) && /Software score\s+58 at the start\s+(Now\s+)?76/.test(text), (text.match(/OUTCOMES[\s\S]{0,120}/i) || [''])[0].replace(/\s+/g, ' '));
  report.pass('flow: the goals are the First check-in’s, by the portal’s own name', /FIRST CHECK-IN GOALS/i.test(text) && /Sleep 7 hours on work nights/.test(text) && !/first review/i.test(text));
  report.pass('flow: nothing offers to send a request', !/Send the request/.test(text));
  await page.getByRole('checkbox', { name: 'Testimonial: I’ve asked Priya' }).click(); await settle(page, 500);
  report.pass('flow: a request is ticked by the coach, with its date and Undo', (await toast(page)) === 'Ticked as asked' && /Asked Tue 17 Nov/.test(await words(page)));
  await undo(page);
  report.pass('flow: Undo unticks it', /Not asked yet[\s\S]*Not asked yet/.test(await words(page)));
  await pick(page, 'Which portal level does Priya keep', 'Free');
  report.pass('flow: the portal level is kept on the profile', (await kept(page, me, 'client_profiles')).find((p) => p.id === ID.priya)?.getting_started?.close?.keeps === 'free');
  await press(page, 'Move to Past clients');
  report.pass('flow: Move to Past clients says exactly what happened', (await toast(page)) === 'Priya is in Past clients, still searchable, and you can start a new engagement from Priya’s page.', await toast(page));
  report.pass('flow: and goes back to Clients', /\/coach\/clients$/.test(page.url()));
  let priya = (await kept(page, me, 'client_profiles')).find((p) => p.id === ID.priya);
  let ePriya = (await kept(page, me, 'engagements')).find((e) => e.id === ID.ePriya);
  report.pass('flow: the profile is past from today and the engagement ended', priya.status === 'past' && priya.ended_on === '2026-11-17' && ePriya.status === 'ended');
  await undo(page);
  priya = (await kept(page, me, 'client_profiles')).find((p) => p.id === ID.priya);
  ePriya = (await kept(page, me, 'engagements')).find((e) => e.id === ID.ePriya);
  report.pass('flow: Undo puts both back', priya.status === 'active' && ePriya.status === 'active');
  await t.done('flow, a group and the close');

  // ---- Twice the text size on a phone: After a call and the close wrap, with no sideways scroll.
  t = await open(`/coach/sessions/${SES.write}`, { size: 400, theme: 'light' }); page = t.page;
  await page.addStyleTag({ content: 'html{font-size:32px !important}' });
  await settle(page, 600);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  report.pass('flow: at twice the text size After a call has no sideways scroll', (await wide()) <= 0, `${await wide()}px`);
  if (OUT) await page.screenshot({ path: `${OUT}/twice-session.owner.400.light.png`, fullPage: true });
  await t.done('flow, twice the text size');
}

const states = (process.env.STATES || [...Object.keys(STATES), 'flow'].join(',')).split(',');
const roles = (process.env.ROLES || 'owner,associate').split(',');
const sizes = (process.env.SIZES || '1440,768,400').split(',').map(Number);
const modes = (process.env.MODES || 'dark,light').split(',');
const browser = await chromium.launch();
const said = {};

for (const name of states) {
  if (name === 'flow') { try { await flows(); } catch (e) { report.pass('flow: every step ran', false, String(e).split('\n').slice(0, 3).join(' ').slice(0, 300)); } continue; }
  const state = STATES[name];
  if (!state) throw new Error(`No state called ${name}`);
  for (const role of roles) {
    for (const size of sizes) {
      for (const theme of modes) {
        const t = await open(state.to, { size, theme, role });
        for (const [screen, act, { full = false, then = null } = {}] of state.screens) {
          const tag = `${name} ${screen}, ${role}, ${size}px ${theme}`;
          try { if (act) await act(t.page, size); } catch (e) { t.errors.push(`${screen}: ${String(e).split('\n')[0].slice(0, 200)}`); }
          const text = await check(t.page, tag, { size, theme });
          if (size === 1440 && theme === 'dark' && role === 'owner') said[`${name} ${screen}`] = text;
          if (OUT) await t.page.screenshot({ path: `${OUT}/${name}-${screen}.${role}.${size}.${theme}.png`, fullPage: full });
          if (then) await then(t.page);
        }
        await t.done(`${name}, ${role}, ${size}px ${theme}`);
      }
    }
  }
}
await browser.close();
seedClock(null);

// The words, read once (1440, dark, the owner).
const has = (key, words, what) => { if (said[key] != null) report.pass(what, said[key].includes(words), `“${words}” not found`); };
has('brief open', 'Sam added this on Sun 15 Nov.', 'the brief: For this call says when the client added it');
has('brief open', 'I want to talk about the restructure, and how to bring the CFO with me.', 'the brief: the client’s own For next time shows');
has('brief open', 'Agree decision rights with the COO', 'the brief: From last time lists the sent actions');
has('brief open', 'Average performance score since', 'the brief: Since last time gives the average and since when');
has('brief foot', 'After “Investor update” on Thu 12 Nov, Sam wrote this.', 'the brief: the debrief after a big moment shows when shared');
has('brief foot', 'Board meeting, Wed 18 Nov', 'the brief: Coming up lists shared work peak moments');
has('brief foot', 'Ask how the CFO conversation went.', 'the brief: the coach’s own note from last time shows');
has('brief foot', 'Open Sam’s page', 'the brief: its foot opens the client’s page');
has('session page', 'Recap for Hannah', 'after a call: the recap is for the client by name');
has('session page', 'Goes to the Backlog', 'after a call: an action says where it goes');
has('session page', 'Write about your own practice. Anything about the client can be included if they ask for their data.', 'after a call: For supervision has its one line');
has('session needs-recap', 'Type the recap to carry on.', 'after a call: Send the recap is never greyed out');
has('outcomes late', 'It counts as one of Hannah’s sessions.', 'a late cancellation says it counts');
has('outcomes no-show', 'It counts as used, and only you see it.', 'a no-show says it counts');
has('outcomes moved', 'It doesn’t count as used.', 'a moved session says it doesn’t count');
has('sent page', 'The recap has been sent, so this session stays as it is.', 'a sent session says it stays as it is');
has('client page', 'Start the guided close', 'the client page’s More starts the guided close');
has('close page', 'Which portal level does Priya keep?', 'the close asks which portal level the client keeps');
report.done();
