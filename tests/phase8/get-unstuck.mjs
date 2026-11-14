// Get unstuck (M9, version 12), the flows: signed in as the invented test
// client on the TEST database, at 1440 and 400 wide, and as a guest on
// stand-in answers shaped as migration 035's (it isn't on the test
// project until Tim runs it). Every other host, every server function and
// every email call is blocked. Everything the test saves is deleted at
// the end, and the person's page settings are put back.
//
//   node tests/phase8/get-unstuck.mjs [folder for screenshots]
//   PARTS=signed,guest SIZES=1440,400   to run a part of it
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, GUEST_TOKEN, M9, addPanel, block, clientDb, fillTo, guestApi, guestOpenTool, guestStandIn, guestStart, onQuestion, pressNext,
  questionText, readEnv, signIn, sleep, typeRows, until, withCoach,
} from './shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-flows');
mkdirSync(out, { recursive: true });
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['signed', 'guest'];
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

const browser = await chromium.launch();
try {
  for (const width of SIZES) {
    if (PARTS.includes('signed')) { await signedIn(browser, width); await cleanUp(); await sleep(2000); }
    if (PARTS.includes('guest')) await guest(browser, width);
  }
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
