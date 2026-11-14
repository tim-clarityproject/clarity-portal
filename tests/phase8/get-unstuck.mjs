// Get unstuck (M9, version 12), the flows: signed in as the invented test
// client on the TEST database, at 1440 and 400 wide, and as a guest on
// stand-in answers shaped as migration 035's (it isn't on the test
// project until Tim runs it). Every other host, every server function and
// every email call is blocked. Everything the test saves is deleted at
// the end, and the person's page settings are put back.
//
//   node tests/phase8/get-unstuck.mjs [folder for screenshots]
//   PARTS=signed,guest,breakit SIZES=1440,400   to run a part of it (breakit: the
//   break-it tester's faults of 14 Nov, once, at 1280 wide)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, GUEST_TOKEN, M9, addPanel, block, clientDb, fillTo, guestApi, guestOpenTool, guestStandIn, guestStart, next, onQuestion, pressNext,
  questionText, readEnv, signIn, sleep, typeRows, until, withCoach,
} from './shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-flows');
mkdirSync(out, { recursive: true });
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['signed', 'guest', 'breakit'];
const SIZES = process.env.SIZES ? process.env.SIZES.split(',').map(Number) : [1440, 400];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`);
};

const env = readEnv();
const { db, me } = await clientDb(env);
const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { data: prefsRow } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = prefsRow?.[0]?.page_preferences ?? null;
const { data: before } = await db.from('decisions').select('id').eq('user_id', me).eq('tool_type', 'grow');
const keep = new Set((before || []).map((d) => d.id));
const mine = async () => (await db.from('decisions').select('id, title, status, draft, form_data').eq('user_id', me).eq('tool_type', 'grow')).data?.filter((d) => !keep.has(d.id)) || [];
const myTodos = async () => (await db.from('todos').select('id, text, sprint_id, planned_week, source, source_id, deleted_at').eq('user_id', me).eq('source', 'get_unstuck').gte('created_on', todayKey)).data || [];
async function cleanUp() {
  await db.from('todos').delete().eq('user_id', me).eq('source', 'get_unstuck').gte('created_on', todayKey);
  for (const d of await mine()) await db.from('decisions').delete().eq('id', d.id).eq('user_id', me);
  if (prefsBefore) await db.from('person_settings').update({ page_preferences: prefsBefore }).eq('user_id', me);
}
const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await toastText(page)).includes(words), ms);
const eyes = (page) => page.locator('.ds-guide-question .ds-who').count();
const clearDevice = (page) => page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/get-unstuck|timer-minutes/.test(k)) localStorage.removeItem(k); });

async function signedIn(browser, width) {
  const phone = width < 600;
  const tag = `${width}px`;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', hasTouch: phone, isMobile: phone });
  await block(ctx);
  await withCoach(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await signIn(page, env);
  await clearDevice(page);
  // The timer's remembered length starts from nothing.
  await db.from('person_settings').update({ page_preferences: { ...(prefsBefore || {}), timer_minutes: undefined } }).eq('user_id', me);
  await page.goto(`${APP}/get-unstuck`);
  await page.waitForSelector('.ds-guide-question', { timeout: 20000 });

  // ---- Goal: the frame, the eye, the required message, the example
  pass(`${tag}: opens on the goal`, (await questionText(page)).startsWith('What do you want to achieve?'));
  pass(`${tag}: the stage name is above the question`, (await page.locator('.ds-guide-label').innerText()).trim() === 'Goal');
  pass(`${tag}: Back and the tool’s name at the top left, close at the top right`, (await page.locator('.ds-guide-back').count()) === 1 && /get unstuck/i.test(await page.locator('.ds-guide-name').innerText()) && (await page.locator('.ds-guide-close').count()) === 1);
  pass(`${tag}: the % bar starts at 0`, (await page.locator('.ds-guide-pct').getAttribute('aria-valuenow')) === '0');
  const eyeLabel = await page.locator('.ds-guide-question .ds-who').getAttribute('aria-label');
  pass(`${tag}: the eye is on the first step, and its label ends “Edit who can see this.”`, (await eyes(page)) === 1 && /Edit who can see this\.$/.test(eyeLabel || ''), eyeLabel);
  pass(`${tag}: the goal has no Skip`, (await page.locator('.ds-guide-foot .ds-guide-skip').count()) === 0);
  await pressNext(page);
  pass(`${tag}: an empty goal says “Type your goal to carry on.”`, await until(async () => (await page.locator('.ds-guide-problem').innerText()).includes('Type your goal to carry on.')));
  pass(`${tag}: the button is never greyed out`, !(await page.locator('.ds-guide-next').isDisabled()));
  await page.getByRole('button', { name: 'See an example' }).click();
  pass(`${tag}: See an example shows one example`, (await page.locator('.ds-guide-example').innerText()).trim() === 'For example: Win the Northfield contract renewal by the end of January.');
  await page.locator('.ds-guide-body .ds-text').first().fill(M9.goal);
  pass(`${tag}: the message goes once the goal is typed`, (await page.locator('.ds-guide-problem').count()) === 0);
  await pressNext(page);

  // ---- What's in the way: rows, Deleted and Undo
  pass(`${tag}: the next question carries the goal`, await onQuestion(page, `What’s in the way of “${M9.goal}”?`));
  pass(`${tag}: no eye on a middle step`, (await eyes(page)) === 0);
  await typeRows(page, M9.cons, 'constraint');
  await page.getByRole('button', { name: 'Remove constraint 2' }).click();
  pass(`${tag}: removing a row says Deleted with Undo`, Boolean(await sawToast(page, 'Deleted')) && (await page.locator('.ds-rowlist .ds-text').count()) === 2);
  await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click();
  const back = await until(async () => ((await page.locator('.ds-rowlist .ds-text').count()) === 3 ? page.locator('.ds-rowlist .ds-text').nth(1).inputValue() : null));
  pass(`${tag}: Undo puts the row back where it was`, back === M9.cons[1], back);
  await pressNext(page);
  await onQuestion(page, 'What’s already working');
  await typeRows(page, M9.opps, 'opportunity');
  await pressNext(page);

  // ---- Options and the timer
  await onQuestion(page, 'What could you do to reach');
  const ring = page.locator('.ds-timer-ring');
  const time = () => page.locator('.ds-timer-time').innerText().then((t) => t.trim());
  pass(`${tag}: the timer starts at 6 minutes`, (await time()) === '6:00' && /^Timer, 6 minutes\./.test(await ring.getAttribute('aria-label')), await ring.getAttribute('aria-label'));
  await ring.click();
  const panel = page.locator('[role=dialog]:not(.ds-guide)').last();
  await panel.waitFor();
  const lengths = (await panel.locator('.ds-answer').allInnerTexts()).map((t) => t.trim());
  pass(`${tag}: “How long?” offers 4, 6, 8 or 10 minutes, or Custom`, /How long\?/.test(await panel.innerText()) && JSON.stringify(lengths) === JSON.stringify(['4 minutes', '6 minutes', '8 minutes', '10 minutes', 'Custom']), lengths.join('|'));
  await panel.locator('.ds-answer', { hasText: '8 minutes' }).click();
  pass(`${tag}: one tap sets it, closes the panel and says so`, Boolean(await sawToast(page, 'The timer is set to 8 minutes.')) && (await time()) === '8:00' && await until(async () => (await page.locator('[role=dialog]:not(.ds-guide)').count()) === 0));
  await sleep(400);
  await ring.click();
  await panel.waitFor();
  await panel.locator('.ds-answer', { hasText: 'Custom' }).click();
  const box = panel.getByLabel('Minutes');
  await box.fill('0');
  await panel.getByRole('button', { name: 'Set the timer' }).click();
  pass(`${tag}: anything else says “Type a number from 1 to 60.”`, await until(async () => (await panel.innerText()).includes('Type a number from 1 to 60.')));
  await box.fill('61');
  await box.press('Enter');
  pass(`${tag}: 61 is refused too`, (await panel.innerText()).includes('Type a number from 1 to 60.') && (await page.locator('[role=dialog]:not(.ds-guide)').count()) === 1);
  await box.fill('1');
  await panel.getByRole('button', { name: 'Set the timer' }).click();
  pass(`${tag}: a custom length says “The timer is set to 1 minute.”`, Boolean(await sawToast(page, 'The timer is set to 1 minute.')) && (await time()) === '1:00');
  await page.getByRole('button', { name: 'Start the timer' }).click();
  await sleep(2300);
  const running = await time();
  pass(`${tag}: it counts down, and the ring can’t be tapped while running`, /^0:5[5-9]$/.test(running) && await ring.isDisabled(), running);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await time();
  await sleep(1500);
  pass(`${tag}: Pause holds it, with Carry on and Reset`, (await time()) === paused && (await page.getByRole('button', { name: 'Carry on' }).count()) === 1 && (await page.getByRole('button', { name: 'Reset' }).count()) === 1 && !(await ring.isDisabled()));
  await page.getByRole('button', { name: 'Carry on' }).click();
  await sleep(1300);
  pass(`${tag}: Carry on counts again`, (await time()) !== paused);
  await page.getByRole('button', { name: 'Reset' }).click();
  pass(`${tag}: Reset goes back to the full length`, (await time()) === '1:00' && (await page.getByRole('button', { name: 'Start the timer' }).count()) === 1 && (await page.getByRole('button', { name: 'Reset' }).count()) === 0);
  await typeRows(page, M9.opts, 'option');
  const savedLength = await until(async () => (await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1)).data?.[0]?.page_preferences?.timer_minutes === 1, 10000);
  pass(`${tag}: the length is saved for the person`, Boolean(savedLength));
  await sleep(900);
  await page.reload();
  await page.waitForSelector('.ds-timer-ring', { timeout: 20000 });
  pass(`${tag}: after a reload the place and the typing are kept`, (await questionText(page)).startsWith('What could you do to reach') && (await page.locator('.ds-rowlist .ds-text').nth(4).inputValue()) === M9.opts[4]);
  pass(`${tag}: the timer remembers 1 minute`, (await time()) === '1:00' && /^Timer, 1 minute\./.test(await ring.getAttribute('aria-label')));
  await page.screenshot({ path: join(out, `options-${width}.png`) });
  await pressNext(page);

  // ---- Will: choose, then word each step
  await onQuestion(page, 'Which options will you act on?');
  await pressNext(page);
  pass(`${tag}: no choice says “Choose at least one option to carry on.”`, await until(async () => (await page.locator('.ds-guide-problem').innerText()).includes('Choose at least one option to carry on.')));
  for (const k of [0, 1, 2]) await page.locator('.ds-guide-body .ds-answer').nth(k).click();
  pass(`${tag}: three options are chosen`, (await page.locator('.ds-guide-body .ds-answer[aria-pressed=true]').count()) === 3);
  await pressNext(page);
  await onQuestion(page, 'What exactly will you do?');
  pass(`${tag}: each chosen option is a next step in its own box`, (await page.locator('.ds-nextstep .ds-text').count()) === 3 && (await page.locator('.ds-nextstep .ds-text').nth(2).inputValue()) === M9.opts[2]);
  await page.locator('.ds-nextstep .ds-text').nth(0).fill(M9.acts[0]);
  await page.locator('.ds-nextstep .ds-text').nth(1).fill(M9.acts[1]);
  const lines = async () => (await page.locator('.ds-nextstep-meta > span').allInnerTexts()).map((t) => t.trim());
  pass(`${tag}: every step starts “It isn’t in this week’s sprint yet.”`, (await lines()).every((l) => l === 'It isn’t in this week’s sprint yet.'));
  await page.getByRole('button', { name: 'Add next step 1 to this week' }).click();
  pass(`${tag}: the panel asks “Where should it go?”`, await until(async () => (await page.locator('[role=dialog]:not(.ds-guide)').last().innerText()).includes('Where should it go?')));
  await addPanel(page, 'This week');
  pass(`${tag}: “Added to this week”`, Boolean(await sawToast(page, 'Added to this week')));
  await sleep(5600);
  await page.getByRole('button', { name: 'Add next step 2 to this week' }).click();
  await addPanel(page, 'Backlog');
  pass(`${tag}: “Added to your backlog”`, Boolean(await sawToast(page, 'Added to your backlog')));
  await sleep(5600);
  await page.getByRole('button', { name: 'Add next step 3 to this week' }).click();
  await addPanel(page, 'Don’t add it');
  await sleep(600);
  const now = await lines();
  pass(`${tag}: each row says where it is`, JSON.stringify(now) === JSON.stringify(['It’s in this week’s sprint.', 'It’s in your backlog.', 'It isn’t in this week’s sprint yet.']), now.join('|'));
  const todos = await until(async () => { const t = (await myTodos()).filter((x) => !x.deleted_at); return t.length === 2 ? t : null; }, 12000);
  pass(`${tag}: one to-do is in this week and one in the backlog`, Boolean(todos) && todos.filter((t) => t.planned_week != null && t.sprint_id).length === 1 && todos.filter((t) => t.planned_week == null && !t.sprint_id).length === 1, JSON.stringify((todos || []).map((t) => [t.planned_week, Boolean(t.sprint_id)])));
  await page.screenshot({ path: join(out, `steps-${width}.png`) });

  // ---- Close part-way and come back
  await page.locator('.ds-guide-close').click();
  pass(`${tag}: closing says Saved and goes back`, Boolean(await sawToast(page, 'Saved')) && Boolean(await until(() => /\/personal\/plan$/.test(new URL(page.url()).pathname))));
  const draft = await until(async () => (await mine()).find((d) => d.title === M9.goal), 12000);
  pass(`${tag}: it is kept as a draft, in the old pages’ shape too`, Boolean(draft) && draft.draft === true && draft.form_data?.version === 2 && typeof draft.form_data?.constraints === 'string' && draft.form_data.next_steps?.length === 3, JSON.stringify(draft && [draft.draft, draft.status]));
  await page.goto(`${APP}/get-unstuck`);
  pass(`${tag}: coming back opens where it was left`, Boolean(await onQuestion(page, 'What exactly will you do?')) && (await page.locator('.ds-nextstep .ds-text').nth(0).inputValue()) === M9.acts[0] && (await lines())[1] === 'It’s in your backlog.');
  await pressNext(page);

  // ---- Your plan, and an edit from it
  await onQuestion(page, 'Here’s your plan');
  pass(`${tag}: Your plan has the eye again`, (await eyes(page)) === 1 && /Edit who can see this\.$/.test(await page.locator('.ds-guide-question .ds-who').getAttribute('aria-label')));
  const labels = (await page.locator('.ds-guide-plan-label').allInnerTexts()).map((t) => t.trim());
  pass(`${tag}: every answer is on one page`, JSON.stringify(labels) === JSON.stringify(['Your goal', 'What’s in the way', 'What’s already working', 'Your options', 'Your next steps']), labels.join('|'));
  pass(`${tag}: the next steps say where they are`, (await page.locator('.ds-guide-plan-row').nth(4).innerText()).includes('It’s in this week’s sprint.') && (await page.locator('.ds-guide-plan-row').nth(4).innerText()).includes('It’s in your backlog.'));
  await page.getByRole('button', { name: 'Edit your goal' }).click();
  await onQuestion(page, 'What do you want to achieve?');
  pass(`${tag}: one question opens, with “Save my edit” and the bar full`, /save my edit/i.test(await page.locator('.ds-guide-next').innerText()) && (await page.locator('.ds-guide-pct').getAttribute('aria-valuenow')) === '100');
  await page.locator('.ds-guide-body .ds-text').first().fill(`${M9.goal}, for good`);
  await pressNext(page);
  pass(`${tag}: Save my edit goes straight back to the plan, with the edit`, Boolean(await onQuestion(page, 'Here’s your plan')) && (await page.locator('.ds-guide-plan-row').first().innerText()).includes('for good'));
  await page.getByRole('button', { name: 'Edit your options' }).click();
  await onQuestion(page, 'What could you do');
  await page.locator('.ds-guide-back').click();
  pass(`${tag}: Back from an edit returns to the plan`, Boolean(await onQuestion(page, 'Here’s your plan')));
  // The eye's panel: Only you, or You and Tim; it saves at once.
  await page.locator('.ds-guide-question .ds-who').click();
  const who = page.locator('[role=dialog]:not(.ds-guide)').last();
  await who.waitFor();
  const whoWords = (await who.innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: “Who can see this?” offers Only you and You and Tim`, whoWords.includes('Who can see this?') && whoWords.includes('Only you') && whoWords.includes(`You and ${M9.coach}`), whoWords);
  await who.getByRole('option', { name: `You and ${M9.coach}` }).click();
  pass(`${tag}: the choice saves at once`, Boolean(await sawToast(page, 'Saved')) && Boolean(await until(async () => (await mine()).find((d) => d.form_data?.shared_with_coach === true), 12000)));
  pass(`${tag}: the eye now says You and Tim`, await until(async () => (await page.locator('.ds-guide-question .ds-who').getAttribute('aria-label')).startsWith(`You and ${M9.coach} can see this.`)));
  await page.screenshot({ path: join(out, `plan-${width}.png`) });

  // ---- Finish offline: it waits on the device, then goes
  await sleep(5600);
  await ctx.setOffline(true);
  await pressNext(page);
  pass(`${tag}: finishing lands on This week with the counted message`, Boolean(await until(() => /\/performance-sprint$/.test(new URL(page.url()).pathname), 15000)) && Boolean(await sawToast(page, '1 next step is in this week')));
  await sleep(1500);
  // Nothing of a finished plan stays on the device as a draft (it once came back as one to carry on; 14 Nov).
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^clarity-draft:.*:get-unstuck:|^ds-guide:get-unstuck-/.test(k)).length);
  pass(`${tag}: a finished plan leaves no draft on the device, so the next visit starts a new plan`, left === 0, `${left} kept`);
  const waiting = (await mine()).find((d) => d.status === 'completed');
  pass(`${tag}: offline, the finished plan hasn’t reached the account yet`, !waiting);
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const done = await until(async () => (await mine()).find((d) => d.status === 'completed' && d.draft === false), 40000);
  pass(`${tag}: back online, it is sent`, Boolean(done) && done.title === `${M9.goal}, for good`, done?.title);
  pass(`${tag}: the new to-do is on This week`, await until(async () => (await page.locator('body').innerText()).includes(M9.acts[0].replace(/\.$/, '')), 15000));

  // ---- My Plans opens it on Your plan
  await page.goto(`${APP}/my-plans`);
  const row = page.locator('.ui-root').getByText(`${M9.goal}, for good`).first();
  await row.waitFor({ timeout: 20000 });
  pass(`${tag}: My Plans lists it under Get unstuck`, /get unstuck/i.test(await page.locator('.ui-root').first().innerText()));
  await row.click();
  pass(`${tag}: a saved plan opens on Your plan`, Boolean(await until(() => /\/get-unstuck$/.test(new URL(page.url()).pathname))) && Boolean(await onQuestion(page, 'Here’s your plan')));
  await page.locator('.ds-guide-close').click();
  await sleep(1200);

  // ---- An old saved plan (the five old pages' shape) opens on the new screens
  if (!phone) {
    const { data: old } = await db.from('decisions').insert({ user_id: me, tool_type: 'grow', title: 'Phase 8 test: old plan', status: 'completed', draft: false, form_data: { goal: 'Hire faster', constraints: 'One recruiter\nTwo sign-offs', opportunities: 'Referrals', options: ['Agree a rule', 'Pilot loops'], will_do: 'Agree a rule\nTalk to Priya on Monday' } }).select('id');
    await page.goto(`${APP}/get-unstuck?id=${old?.[0]?.id}`);
    await onQuestion(page, 'Here’s your plan');
    const text = (await page.locator('.ds-guide-plan').innerText()).replace(/\s+/g, ' ');
    pass(`${tag}: an old saved plan opens, one row a line`, ['Hire faster', 'One recruiter', 'Two sign-offs', 'Referrals', 'Pilot loops', 'Talk to Priya on Monday'].every((w) => text.includes(w)), text.slice(0, 200));
    await page.locator('.ds-guide-close').click();
    await sleep(1200);
    // The old step addresses come to the one tool.
    await clearDevice(page);
    await page.goto(`${APP}/get-unstuck/will-do?from=test#x`);
    pass(`${tag}: an old step address comes to /get-unstuck with its query and hash`, Boolean(await until(() => { const u = new URL(page.url()); return u.pathname === '/get-unstuck' && u.search === '?from=test' && u.hash === '#x'; })) && Boolean(await onQuestion(page, 'What do you want to achieve?')));
  }
  pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await clearDevice(page);
  await ctx.close();
}

async function guest(browser, width) {
  const phone = width < 600;
  const tag = `guest ${width}px`;
  const make = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light', hasTouch: phone, isMobile: phone });
    const state = await guestStandIn(ctx, opts);
    await block(ctx, { api: guestApi(state) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    return { ctx, state, page, errors };
  };

  // The functions aren't there (035 not run): one calm line, nothing breaks.
  const none = await make({ missing: true });
  await guestStart(none.page);
  await none.page.getByLabel('Access code').fill(M9.guestCode);
  await none.page.getByRole('button', { name: 'Start my plan' }).click();
  const calm = await until(async () => (await none.page.locator('.ds-guest-problem').innerText()).replace(/\s+/g, ' ').trim());
  pass(`${tag}: before 035 has run, the page says one calm line`, /This link isn’t ready to use yet\. Ask your coach to send it again\.$/.test(calm || '') && none.errors.length === 0, calm);
  pass(`${tag}: before 035 has run, the start page says “your coach”`, (await none.page.locator('.ds-guest-sentence').innerText()).trim() === 'Only you and your coach will see your answers.');
  await none.ctx.close();

  const { ctx, state, page, errors } = await make();
  await guestStart(page);
  pass(`${tag}: the bold crosshair alone at the top, no menu`, (await page.locator('.ds-guest-top .ds-bold-cross').count()) === 1 && (await page.locator('.ds-guest-top > *').count()) === 1 && (await page.locator('.hdr-menu, .ds-bar, .ds-orb-float').count()) === 0);
  pass(`${tag}: the title is the tool’s name`, /^get unstuck$/i.test((await page.locator('.ds-guest-title').innerText()).trim()));
  pass(`${tag}: the email is already filled in`, (await page.getByLabel('Email').inputValue()) === M9.guestEmail);
  pass(`${tag}: the code is one plain box`, (await page.locator('.ds-guest-field input').count()) === 2 && (await page.getByLabel('Access code').getAttribute('autocomplete')) === 'one-time-code');
  pass(`${tag}: who sees the answers, with the coach’s name`, (await page.locator('.ds-guest-sentence').innerText()).trim() === `Only you and ${M9.coach} will see your answers.`);
  pass(`${tag}: “~15 minutes” with the button`, (await page.locator('.ds-btn-note-text').innerText()).trim() === '~15 minutes');
  pass(`${tag}: the two legal links`, (await page.locator('.ds-guest-legal .ds-link').allInnerTexts()).join('|') === 'Privacy Policy|Data Storage Notice');
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return { dm: document.fonts.check('16px "DM Sans"'), nekst: document.fonts.check('16px Nekst'), body: getComputedStyle(document.querySelector('.ds-guest-sentence')).fontFamily.split(',')[0], loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')) }; });
  pass(`${tag}: DM Sans and Nekst are really loaded, from the page’s own fonts`, fonts.dm && fonts.nekst && /DM Sans/.test(fonts.body) && fonts.loaded.includes('DM Sans') && fonts.loaded.includes('Nekst'), JSON.stringify(fonts));
  pass(`${tag}: the page follows the device (light)`, (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
  await page.screenshot({ path: join(out, `guest-start-${width}.png`) });
  await page.getByRole('button', { name: 'Start my plan' }).click();
  pass(`${tag}: no code says what to do`, await until(async () => (await page.locator('.ds-guest-problem').innerText()).includes('Type the 6-character code')));
  await page.getByLabel('Access code').fill('zz9 9zz');
  pass(`${tag}: the code box reads a code however it is typed`, (await page.getByLabel('Access code').inputValue()) === 'ZZ99ZZ');
  await page.getByRole('button', { name: 'Start my plan' }).click();
  pass(`${tag}: a wrong code says so, in 035’s words`, await until(async () => (await page.locator('.ds-guest-problem').innerText()).includes('That link, email or code isn’t right. Check them and try again.')));
  await page.getByLabel('Access code').fill(M9.guestCode);
  await page.getByRole('button', { name: 'Start my plan' }).click();
  pass(`${tag}: the right code opens the tool`, Boolean(await onQuestion(page, 'What do you want to achieve?')));
  const opened = state.calls.filter((c) => c.name === 'guest_open').pop();
  pass(`${tag}: guest_open is asked as 035 writes it`, JSON.stringify(Object.keys(opened.args).sort()) === JSON.stringify(['p_code', 'p_email', 'p_token']) && opened.args.p_token === GUEST_TOKEN && opened.args.p_code === M9.guestCode);
  const guestEye = await page.locator('.ds-guide-question .ds-who').getAttribute('aria-label');
  pass(`${tag}: the eye says You and Tim, and ends “Edit who can see this.”`, guestEye === `You and ${M9.coach} can see this. Edit who can see this.`, guestEye);
  await page.locator('.ds-guide-question .ds-who').click();
  const sheet = page.locator('[role=dialog]:not(.ds-guide)').last();
  await sheet.waitFor();
  pass(`${tag}: a guest sees one line instead of the choice`, (await sheet.innerText()).includes(`Your answers go to ${M9.coach}, who sent you the link.`) && (await sheet.locator('[role=option]').count()) === 0);
  await page.keyboard.press('Escape');
  await sleep(500);
  await fillTo(page, 'steps');
  pass(`${tag}: a guest’s steps say “start soon”, with no sprint lines`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Make each one something you can start soon.' && (await page.locator('.ds-nextstep-meta').count()) === 0);
  const saved = await until(() => state.rows.length === 1 && state.rows[0].form_data?.goal === M9.goal, 8000);
  const save = state.calls.filter((c) => c.name === 'guest_save').pop();
  pass(`${tag}: the answers are saved through guest_save, only the columns a guest may write`, Boolean(saved) && save.args.p_table === 'decisions' && Object.keys(save.args.p_row).every((k) => ['id', 'title', 'form_data', 'status', 'draft'].includes(k)), JSON.stringify(save && Object.keys(save.args.p_row)));
  await pressNext(page);
  await onQuestion(page, 'Here’s your plan.');
  pass(`${tag}: a guest’s plan has no name and no sprint lines`, (await questionText(page)) === 'Here’s your plan.' && (await page.locator('.ds-guide-plan-line small').count()) === 0 && (await page.locator('.ds-guide-foot-aside').count()) === 0);
  await pressNext(page);
  await page.waitForSelector('.ds-guest-question', { timeout: 15000 });
  const end = async () => (await page.locator('.ds-guest').innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: the end page`, (await end()).includes('Here’s what you’ll do next.') && (await page.locator('.ds-guest-list li').allInnerTexts()).join('|') === M9.acts.join('|'));
  pass(`${tag}: “A copy is on its way” once the server has sent it`, await until(async () => (await end()).includes(`A copy is on its way to ${M9.guestEmail}.`), 8000) && state.copies === 1);
  pass(`${tag}: the free account offer, word for word`, (await end()).includes('Plan this into your week with The Clarity Portal, your personal performance tool.') && (await end()).includes('It’s free, and this plan moves into it.') && /create my free account/i.test(await end()));
  pass(`${tag}: finished is recorded for the coach`, state.finished === true && state.rows[0].status === 'completed');
  await page.screenshot({ path: join(out, `guest-end-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Download my PDF' }).click();
  // The one shared choice (PdfChoice): Light, for printing, or Dark, for sharing.
  const choice = await until(async () => { const t = (await page.locator('.ds-pdfpop, .ds-pdfsheet').innerText()).replace(/\s+/g, ' '); return /Light For printing/i.test(t) && /Dark For sharing/i.test(t); });
  pass(`${tag}: Download my PDF offers Light, for printing and Dark, for sharing`, Boolean(choice));
  if (!phone) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.locator('.ds-pdfpop, .ds-pdfsheet').getByRole('button', { name: /Light/ }).click()]);
    pass(`${tag}: the PDF is made`, Boolean(download) && /^Get unstuck.*\.pdf$/.test(download.suggestedFilename()), download?.suggestedFilename());
  } else {
    await page.keyboard.press('Escape');
  }
  await sleep(800);
  await page.getByRole('button', { name: 'Delete my answers' }).click();
  pass(`${tag}: Delete my answers says Deleted with Undo`, Boolean(await sawToast(page, 'Deleted')) && state.rows.length === 0 && state.calls.some((c) => c.name === 'guest_delete_link_answers') && (await end()).includes('Your answers have been deleted.'));
  await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo saves them again and shows the end page`, Boolean(await until(() => state.rows.length === 1 && state.rows[0].form_data?.goal === M9.goal, 8000)) && Boolean(await until(async () => (await end()).includes('Here’s what you’ll do next.'))));
  await page.getByRole('button', { name: 'Create my free account' }).click();
  pass(`${tag}: Create my free account opens Create my account with the email carried`, Boolean(await until(() => new URL(page.url()).pathname === '/auth/sign-up')) && (await page.locator('input[type=email]').inputValue()) === M9.guestEmail);
  pass(`${tag}: no email was sent by the page itself, and no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();

  // A link that isn't one says so.
  const bad = await make();
  await bad.page.goto(`${APP}/guest/not-a-link`);
  pass(`${tag}: an address that isn’t a link says so calmly`, await until(async () => (await bad.page.locator('.ds-guest-problem').innerText()).includes('This link doesn’t look right.')));
  await bad.ctx.close();
}

// The break-it tester's faults (14 Nov), each as someone clumsy or unlucky
// would meet it: a damaged copy on the device, a visit that ends while the
// tab is open, two presses, two tabs, a to-do deleted elsewhere, the timer.
async function breakIt(browser) {
  const tag = 'break-it';
  // ---- a guest
  const make = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London' });
    const state = await guestStandIn(ctx);
    await block(ctx, { api: guestApi(state) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    return { ctx, state, page, errors };
  };
  const bodyOf = async (page) => (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const visit = 'b2'.repeat(32);
  for (const [name, item] of Object.entries({
    'a plan that isn’t one': { id: 'x', plan: 'words', status: 'draft' },
    'lists that aren’t lists': { id: 'x', plan: { goal: 5, acts: 'x', cons: null, opts: {}, opps: 7 }, status: 'draft' },
    'next steps that aren’t next steps': { id: 'x', plan: { goal: 'A goal', acts: [null, 5, { id: 1, option: 'x', text: null }], cons: ['a'], opts: [null, 4], opps: [{}] }, status: 'completed' },
  })) {
    for (const phase of ['tool', 'end']) {
      const g = await make();
      await g.page.addInitScript(([k, v]) => { try { sessionStorage.setItem(k, v); } catch { /* blocked */ } }, [`clarity-guest:${GUEST_TOKEN}`, JSON.stringify({ visit, email: M9.guestEmail, tool: 'grow', coachName: 7, phase, item })]);
      await g.page.goto(`${APP}/guest/${GUEST_TOKEN}`);
      await sleep(1200);
      if (await next(g.page).count()) { await pressNext(g.page); await sleep(500); }
      const text = await bodyOf(g.page);
      pass(`${tag}: a guest’s tab copy with ${name} (${phase}) never stops the page`, text.length > 20 && !/this page hit a problem/i.test(text) && g.errors.length === 0, `${g.errors.join(' | ')} ${text.slice(0, 80)}`);
      await g.ctx.close();
    }
  }
  {
    // The visit ends while the tab still holds the answers; the code is typed again.
    const g = await make();
    await guestOpenTool(g.page);
    await fillTo(g.page, 'opts');
    await until(() => g.state.rows.length === 1, 6000);
    const firstId = g.state.rows[0]?.id;
    const later = 'c3'.repeat(32);
    const saves = [];
    await g.ctx.route(/\/rest\/v1\/rpc\/guest_[a-z_]+/, async (route) => {
      const name = /rpc\/(guest_[a-z_]+)/.exec(route.request().url())[1];
      const args = JSON.parse(route.request().postData() || '{}');
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (name === 'guest_link_info') return json({ ok: true, tool: 'grow', tool_label: 'Get unstuck', coach_name: M9.coach, open: true });
      if (name === 'guest_open') return json({ ok: true, visit: later, tool: 'grow', tool_label: 'Get unstuck', coach_name: M9.coach, confirmed: false });
      if (args.p_visit !== later) return json({ code: '42501', details: null, hint: null, message: 'That visit has ended. Open your link again.' }, 403);
      // a new visit sees none of the earlier visit's rows, and can't change them (035)
      if (name === 'guest_rows') return json([]);
      if (name === 'guest_save') {
        if (args.p_row.id === firstId) return json({ code: '42501', details: null, hint: null, message: 'That isn\'t yours, so it wasn\'t changed. Open your own link to carry on.' }, 403);
        saves.push(args.p_row);
        return json(args.p_row);
      }
      return json(true);
    });
    await g.page.locator('.ds-rowlist .ds-text').last().fill('One more option, typed after the visit ended');
    pass(`${tag}: a visit that ends mid-tool says so on the start page`, Boolean(await until(async () => (await bodyOf(g.page)).includes('That visit has ended. Open your link again.'), 8000)));
    await g.page.getByLabel('Access code').fill(M9.guestCode);
    await g.page.getByRole('button', { name: 'Start my plan' }).click();
    await until(async () => (await next(g.page).count()) === 1, 8000);
    await until(() => saves.length > 0, 8000);
    const kept = saves[saves.length - 1]?.form_data || {};
    pass(`${tag}: … and typing the code again keeps every answer on the screen, saved as a new row`, kept.goal === M9.goal && (kept.options || []).includes('One more option, typed after the visit ended') && saves.every((r) => r.id !== firstId) && g.errors.length === 0, JSON.stringify(kept).slice(0, 200));
    await g.ctx.close();
  }
  {
    const g = await make();
    await guestOpenTool(g.page);
    await fillTo(g.page, 'sum');
    await sleep(450);
    await next(g.page).dblclick();
    await until(async () => (await bodyOf(g.page)).includes('Here’s what you’ll do next.'), 8000);
    pass(`${tag}: two presses on Finish my plan finish once and ask for one copy`, g.state.calls.filter((c) => c.name === 'guest_finish').length === 1 && g.state.copies === 1 && g.state.rows.length === 1);
    await g.page.getByRole('button', { name: 'Delete my answers' }).dblclick();
    await until(async () => (await bodyOf(g.page)).includes('Your answers have been deleted.'), 8000);
    pass(`${tag}: two presses on Delete my answers ask once`, g.state.calls.filter((c) => c.name === 'guest_delete_link_answers').length === 1);
    pass(`${tag}: the visit key is never in an address`, !g.page.url().includes(visit));
    await g.ctx.close();
  }
  {
    // A save that didn't go is sent when the connection is back.
    const g = await make();
    await guestOpenTool(g.page);
    await g.ctx.setOffline(true);
    await g.page.locator('.ds-guide-body .ds-text').first().fill('Typed with no connection');
    await sleep(2200);
    await g.page.locator('.ds-guide-close').click();
    pass(`${tag}: closing with no connection says so and keeps the tool open`, Boolean(await sawToast(g.page, 'needs a connection')) && (await next(g.page).count()) === 1);
    await g.ctx.setOffline(false);
    pass(`${tag}: … and the answers are saved once the connection is back`, Boolean(await until(() => g.state.rows.some((r) => r.form_data?.goal === 'Typed with no connection'), 9000)));
    await g.ctx.close();
  }

  // ---- signed in
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
  await block(ctx);
  await withCoach(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await signIn(page, env);
  const fresh = async () => { await page.goto(`${APP}/personal/plan`); await sleep(700); await clearDevice(page); };
  const U = '11111111-1111-4111-8111-111111111111';
  const seed = (sets) => page.evaluate(([all, uid]) => { for (const [k, v] of Object.entries(all)) localStorage.setItem(k.replace(/<uid>/g, uid), JSON.stringify(v)); }, [sets, me]);

  // A damaged draft never stops the page.
  for (const [name, plan] of Object.entries({ 'words for a plan': 'x', 'lists that aren’t lists': { goal: 5, acts: 'x', cons: null, opts: {}, opps: 7 }, 'odd next steps': { goal: 'g', acts: [null, { option: 99, text: null }, { id: 'a', text: 'T', where: 'mars' }, { id: 'a', text: 'again' }], opts: [null, 'O'], cons: 'x', opps: [{}] } })) {
    await fresh();
    await seed({ 'clarity-draft:<uid>:get-unstuck:new': { v: { id: U, status: 'completed', saved: 'yes', title: { a: 1 }, plan }, at: Date.now() }, 'ds-guide:get-unstuck-<uid>-new': { index: 5, skipped: 7, changing: { step: 5 } } });
    await page.goto(`${APP}/get-unstuck`);
    await sleep(1800);
    const text = await bodyOf(page);
    pass(`${tag}: a draft on the device with ${name} never stops the page`, text.length > 20 && !/this page hit a problem/i.test(text) && errors.length === 0, `${errors.join(' | ')} ${text.slice(0, 80)}`);
  }
  // The place kept on the device says "Your plan" for a plan with nothing in it.
  await fresh();
  await seed({ 'ds-guide:get-unstuck-<uid>-new': { index: 6, skipped: [] } });
  await page.goto(`${APP}/get-unstuck`);
  await onQuestion(page, 'Here’s your plan');
  await pressNext(page);
  pass(`${tag}: a plan with no goal is never finished`, Boolean(await until(async () => (await bodyOf(page)).includes('Type your goal to carry on.'), 6000)) && new URL(page.url()).pathname === '/get-unstuck' && (await mine()).length === 0);

  // The timer.
  await fresh();
  await page.goto(`${APP}/get-unstuck`);
  await fillTo(page, 'opts');
  const time = () => page.locator('.ds-timer-time').innerText();
  const start = page.locator('.ds-timer-buttons button').first();
  await start.dblclick();
  await sleep(1300);
  pass(`${tag}: two presses on Start the timer start it, and never pause it in the same moment`, /pause/i.test(await start.innerText()) && (await time()) !== '6:00', `${await start.innerText()} ${await time()}`);
  // another tab chooses 10 minutes while this one runs
  await page.evaluate((uid) => { localStorage.setItem(`clarity-cache:${uid}:timer-minutes`, JSON.stringify({ v: 10, at: Date.now() })); window.dispatchEvent(new StorageEvent('storage', { key: `clarity-cache:${uid}:timer-minutes` })); }, me);
  await sleep(1200);
  const [m1, s1] = (await time()).split(':').map(Number);
  pass(`${tag}: a running timer keeps its length when another one is chosen elsewhere`, m1 === 5 && s1 < 59, await time());
  // the device's clock is put back an hour
  await page.evaluate(() => { const real = Date.now.bind(Date); window.__back = 0; Date.now = () => real() - window.__back; window.__back = 3600000; });
  await sleep(2600);
  const t1 = await time();
  await sleep(2100);
  const t2 = await time();
  const secs = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  pass(`${tag}: … and carries on counting when the device’s clock is put back`, secs(t1) < 360 && secs(t2) < secs(t1) && secs(t1) - secs(t2) <= 4, `${t1} then ${t2}`);
  pass(`${tag}: the time is a timer, never read out every second`, (await page.locator('.ds-timer-time').evaluate((el) => `${el.getAttribute('role')} ${el.getAttribute('aria-live') || el.closest('[aria-live]')?.getAttribute('aria-live') || 'quiet'}`)) === 'timer quiet');
  await page.evaluate(() => { window.__back = 0; });

  // A to-do deleted, or moved to the Backlog, somewhere else.
  await fresh();
  await page.goto(`${APP}/get-unstuck`);
  await fillTo(page, 'steps');
  const lines = async () => (await page.locator('.ds-nextstep-meta > span').allInnerTexts()).map((t) => t.trim());
  await page.getByRole('button', { name: 'Add next step 1 to this week' }).click();
  await addPanel(page, 'This week');
  await sleep(1500);
  await page.getByRole('button', { name: 'Add next step 2 to this week' }).click();
  await addPanel(page, 'This week');
  await until(async () => (await myTodos()).length === 2, 8000);
  const made = await myTodos();
  const first = made.find((t) => t.text === M9.acts[0]);
  const second = made.find((t) => t.text === M9.acts[1]);
  await db.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', first.id).eq('user_id', me);
  await db.from('todos').update({ sprint_id: null, planned_week: null }).eq('id', second.id).eq('user_id', me);
  await page.reload();
  const now = await until(async () => { const l = await lines(); return l[0] === 'It isn’t in this week’s sprint yet.' && l[1] === 'It’s in your backlog.' ? l : null; }, 15000);
  pass(`${tag}: a next step says where its to-do is now (deleted elsewhere; moved to the Backlog)`, Boolean(now), (await lines()).join(' | '));
  await page.getByRole('button', { name: 'Add next step 1 to this week' }).click();
  await addPanel(page, 'This week');
  await until(async () => (await myTodos()).filter((t) => !t.deleted_at).length === 2, 8000);
  const after = await myTodos();
  pass(`${tag}: … and adding it again makes a new to-do and leaves the old one as it was`, after.length === 3 && Boolean(after.find((t) => t.id === first.id)?.deleted_at) && (await lines())[0] === 'It’s in this week’s sprint.', JSON.stringify(after.map((t) => Boolean(t.deleted_at))));
  await cleanUp();

  // Two tabs on the same plan: one finishes, the other is closed.
  for (const typed of [false, true]) {
    await fresh();
    await page.goto(`${APP}/get-unstuck`);
    await fillTo(page, 'cons');
    await sleep(900);
    const other = await ctx.newPage();
    other.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await other.goto(`${APP}/get-unstuck`);
    await onQuestion(other, 'What’s in the way of');
    await page.bringToFront();
    await pressNext(page);
    await onQuestion(page, 'What’s already working');
    await pressNext(page);
    await onQuestion(page, 'What could you do to reach');
    await page.locator('.ds-rowlist .ds-text').first().fill('An option typed in the first tab');
    await pressNext(page);
    await onQuestion(page, 'Which options will you act on?');
    await page.locator('.ds-answer').first().click();
    await pressNext(page);
    await onQuestion(page, 'What exactly will you do?');
    await pressNext(page);
    await onQuestion(page, 'Here’s your plan');
    await pressNext(page);
    await page.waitForURL(/performance-sprint/, { timeout: 15000 });
    await until(async () => (await mine()).some((d) => d.status === 'completed'), 8000);
    await other.bringToFront();
    if (typed) { await other.locator('.ds-rowlist .ds-text').first().fill('A constraint typed in the second tab'); await sleep(500); }
    await other.locator('.ds-guide-close').click();
    await other.waitForURL(/personal\/plan/, { timeout: 15000 });
    await sleep(1500);
    const rows = await mine();
    const done = rows.filter((d) => d.status === 'completed' && !d.draft);
    const whole = done.length === 1 && (done[0].form_data.options || []).includes('An option typed in the first tab') && (done[0].form_data.next_steps || []).length === 1;
    if (typed) pass(`${tag}: two tabs: what was typed in the second after the first finished is kept as a plan of its own`, whole && rows.length === 2 && rows.some((d) => d.draft && (d.form_data.constraint_list || []).includes('A constraint typed in the second tab')), JSON.stringify(rows.map((d) => [d.status, d.draft])));
    else pass(`${tag}: two tabs: closing the second, unchanged, leaves the finished plan as the first left it`, whole && rows.length === 1, JSON.stringify(rows.map((d) => [d.status, d.draft, (d.form_data.options || []).length])));
    await other.close();
    await cleanUp();
  }
  pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const browser = await chromium.launch();
try {
  for (const width of SIZES) {
    if (PARTS.includes('signed')) { await signedIn(browser, width); await cleanUp(); await sleep(2000); }
    if (PARTS.includes('guest')) await guest(browser, width);
  }
  if (PARTS.includes('breakit')) { await breakIt(browser); await cleanUp(); }
} catch (e) {
  pass('the run finished', false, e.message);
} finally {
  await browser.close();
  await cleanUp().catch((e) => results.push(`NOTE  clean-up: ${e.message}`));
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.filter((r) => !r.startsWith('PASS')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
