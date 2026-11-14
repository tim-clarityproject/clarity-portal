// Emotional wash (M10, version 5.6), the flows: signed in as the invented
// test client on the TEST database, at 1440 and 400 wide. Every other
// host, every server function and every email call is blocked. Migration
// 043 isn't on the test project until Tim runs it, so the saved washes are
// kept on the device, which is what this tests: the page must work with no
// error. The to-dos the test adds are deleted at the end, and what the
// tool keeps on the device is taken off.
//
// Every path: each check answered each way, Park and reflect with a
// starter, Trash with its Undo (and with reduced motion), Accept and act
// to This week, Backlog and Don’t add it, several thoughts, a box taken
// out and put back, Finish later and coming back, a refresh part-way, the
// summary's edits, the PDF, finishing, and opening the saved wash again.
//
// Also the measurements the UI tester takes on these screens: the eye
// centred on the capitals within 0.5px and 12px from the last letter,
// Back's chevron on the content's edge, 44px tap areas, no sideways
// scroll, no console errors, one coral button per screen, and DM Sans
// really loaded by the page itself.
//
//   node tests/phase8/emotional-wash.mjs [folder for screenshots]
//   SIZES=1440   to run one width
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, EW, WASH_PATH, block, clearWash, clientDb, onQuestion, panel, panelGone, pressNext, questionText, readEnv, signIn, sleep, title, until, withCoach,
} from './shared.mjs';
import { makeCheckScreen } from './measure-lib.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-emotional-wash');
mkdirSync(out, { recursive: true });
const SIZES = process.env.SIZES ? process.env.SIZES.split(',').map(Number) : [1440, 400];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};
const checkScreen = makeCheckScreen(pass);

const env = readEnv();
const { db, me } = await clientDb(env);
const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { data: todosBefore } = await db.from('todos').select('id').eq('user_id', me);
const keepTodos = new Set((todosBefore || []).map((t) => t.id));
const myTodos = async () => ((await db.from('todos').select('id, text, sprint_id, planned_week, source, source_id, deleted_at, strategy_id').eq('user_id', me).gte('created_on', todayKey)).data || []).filter((t) => !keepTodos.has(t.id));
async function cleanUp() {
  for (const t of await myTodos()) await db.from('todos').delete().eq('id', t.id).eq('user_id', me);
}

const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await toastText(page)).includes(words), ms);
const kept = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /^clarity-cache:.*:tool-answers$/.test(k));
  try { return Object.values(JSON.parse(localStorage.getItem(key)).v).filter((r) => r.tool === 'emotional_wash'); } catch { return []; }
});
const answers = (page) => page.locator('.ds-guide-body .ds-answer');
const answerWords = async (page) => (await answers(page).allInnerTexts()).map((t) => t.split('\n')[0].trim());
const problem = (page, words) => until(async () => (await page.locator('.ds-guide-problem').innerText().catch(() => '')).includes(words), 5000);
const label = async (page) => (await page.locator('.ds-guide-label').innerText().catch(() => '')).trim();
const percent = (page) => page.locator('.ds-guide-pct').getAttribute('aria-valuenow').then(Number);
const card = (page, name) => page.locator('.ds-follow-card').filter({ has: page.getByRole('button', { name: new RegExp(`^${name}`) }) });
const planRows = async (page) => page.locator('.ds-guide-plan-row').evaluateAll((rows) => rows.map((r) => ({
  label: r.querySelector('.ds-guide-plan-label').textContent.trim(),
  lines: [...r.querySelectorAll('.ds-guide-plan-line')].map((l) => [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()),
  sub: [...r.querySelectorAll('.ds-guide-plan-line small')].map((s) => s.textContent.trim()),
  good: [...r.querySelectorAll('.ds-guide-plan-line small')].map((s) => s.classList.contains('ds-guide-plan-good')),
  aria: r.getAttribute('aria-label'),
})));
const row = (page, name) => page.getByRole('button', { name, exact: true });
// One tap on a check's answer, then the next screen by itself.
async function tap(page, n) {
  await sleep(450);
  await answers(page).nth(n).click();
}
const CHECK = { Yes: 0, 'Not sure': 1, No: 2 };
// The three checks for the thought on screen, each answered as given.
async function checks(page, thought, [t, l, h]) {
  for (const [word, answer] of [['true', t], ['logical', l], ['helpful', h]]) {
    await until(async () => { const q = await questionText(page); return q.includes(thought) && q.endsWith(`${word}?`); }, 15000);
    await tap(page, CHECK[answer]);
  }
  await onQuestion(page, 'How will you wash', 8000);
}
const short = (thought) => thought.replace(/[.!?]$/, '');

async function run(browser, width) {
  const phone = width < 600;
  const tag = `${width}px`;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: phone ? 'light' : 'dark', hasTouch: phone, isMobile: phone, acceptDownloads: true, deviceScaleFactor: 2 });
  await block(ctx);
  // The test client has a coach: a wash still offers no way to share it.
  await withCoach(ctx, 'Tim');
  const page = await ctx.newPage();
  const errors = [];
  const refused = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) refused.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  const shot = (name) => page.screenshot({ path: join(out, `${name}-${width}.png`) });
  await signIn(page, env);
  await clearWash(page);
  refused.length = 0;

  // ---- the hub's tile opens the tool
  await page.goto(`${APP}/personal/reset`);
  const tile = page.getByRole('link', { name: /Emotional wash/ }).or(page.getByRole('button', { name: /Emotional wash/ })).first();
  await tile.waitFor({ timeout: 20000 });
  const tileWords = (await tile.innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: Reset has the tool’s tile, with its line and its one time`, /Emotional wash/.test(tileWords) && /~10 minutes/.test(tileWords) && /Work through a strong emotion so it doesn’t run you\./.test(tileWords), tileWords);
  await shot('hub-reset');
  await tile.click();
  await onQuestion(page, 'What happened?');
  pass(`${tag}: the tool opens at its own address`, new URL(page.url()).pathname === WASH_PATH, page.url());

  // ---- what happened
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      dm: document.fonts.check('16px "DM Sans"'), nekst: document.fonts.check('16px Nekst'),
      body: getComputedStyle(document.querySelector('.ds-guide-nudge')).fontFamily.split(',')[0],
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')),
      from: performance.getEntriesByType('resource').filter((r) => /dm-sans/i.test(r.name)).map((r) => new URL(r.name).host),
    };
  });
  pass(`${tag}: DM Sans and Nekst are really loaded, from the page’s own files`, fonts.dm && fonts.nekst && /DM Sans/.test(fonts.body) && fonts.loaded.includes('DM Sans') && fonts.loaded.includes('Nekst') && fonts.from.length > 0 && fonts.from.every((h) => /^localhost/.test(h)), JSON.stringify(fonts));
  pass(`${tag}: the line under the question`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Write it as it happened, in a sentence or two.');
  pass(`${tag}: the eye is on the first screen`, (await page.locator('.ds-guide-question .ds-who').count()) === 1);
  pass(`${tag}: the % bar starts at 0`, (await percent(page)) === 0);
  pass(`${tag}: Finish later is a quiet link at the left of a typing step`, (await page.locator('.ds-guide-foot .ds-guide-skip').innerText()).trim() === 'Finish later' && await page.evaluate(() => document.querySelector('.ds-guide-foot .ds-guide-skip').getBoundingClientRect().left < document.querySelector('.ds-guide-next').getBoundingClientRect().left));
  await checkScreen(page, `${tag}, what happened`, { heading: '.ds-guide-question' });
  await shot('what-happened-empty');
  pass(`${tag}: Next is never greyed out`, !(await page.locator('.ds-guide-next').isDisabled()));
  await pressNext(page);
  pass(`${tag}: Next with nothing typed says “Type what happened to carry on.”`, await problem(page, 'Type what happened to carry on.'));
  pass(`${tag}: … and stays put`, (await questionText(page)).startsWith('What happened?'));

  // The eye has no choice: a wash is private, like the Journal.
  const eye = page.locator('.ds-guide-question .ds-who');
  pass(`${tag}: the eye says “Only you can see this. Edit who can see this.”`, (await eye.getAttribute('aria-label')) === 'Only you can see this. Edit who can see this.');
  await eye.click();
  await panel(page).waitFor({ timeout: 10000 });
  await sleep(600);
  const who = (await panel(page).innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: the eye opens “Who can see this?”: “Only you can see this.” and why`, who.includes('Who can see this?') && who.includes('Only you can see this.') && who.includes('Your Emotional wash can’t be shared, like your Journal.'), who.slice(0, 200));
  pass(`${tag}: … with nothing to choose, though the person has a coach`, (await panel(page).locator('[role=option], [role=radio], [role=switch], input').count()) === 0 && !/You and Tim/.test(who));
  await checkScreen(page, `${tag}, who can see this`, { layer: '[role=dialog]:not(.ds-guide)', coral: 0 });
  await shot('who-can-see-this');
  await page.keyboard.press('Escape');
  await panelGone(page);

  await page.locator('.ds-guide-body textarea').first().fill(EW.what);
  await sleep(400);
  await shot('what-happened');
  await pressNext(page);

  // ---- the kind of feeling: one answer, straight on
  await onQuestion(page, 'What kind of feeling are you left with?');
  pass(`${tag}: three kinds of feeling, each with its line`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Future concern', 'Present angst', 'Past regret']) && (await page.locator('.ds-answer-hint').count()) === 3);
  pass(`${tag}: the % bar reads 9`, (await percent(page)) === 9);
  pass(`${tag}: a one-answer question has no bottom bar, no Finish later and no eye`, (await page.locator('.ds-guide-foot').count()) === 0 && (await page.locator('.ds-guide-skip').count()) === 0 && (await page.locator('.ds-guide-question .ds-who').count()) === 0);
  await checkScreen(page, `${tag}, the kind of feeling`, { coral: 0 });
  await shot('kind');
  await tap(page, 1);
  pass(`${tag}: the answer shows as chosen the moment it’s tapped`, (await answers(page).nth(1).getAttribute('aria-checked').catch(() => 'true')) === 'true');

  // ---- the words: the ten of the Geneva Emotion Wheel, as many as fit
  pass(`${tag}: … and the next question follows by itself`, await onQuestion(page, 'Which words fit the feeling?', 5000));
  pass(`${tag}: the ten Geneva Emotion Wheel words, exactly as M10 has them`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Anger', 'Contempt', 'Disappointment', 'Disgust', 'Fear', 'Guilt', 'Hate', 'Regret', 'Sadness', 'Shame']), JSON.stringify(await answerWords(page)));
  const tops = await answers(page).evaluateAll((els) => els.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().top)));
  pass(`${tag}: the words sit ${phone ? 'in one column' : 'side by side, in two columns'}`, phone ? tops[1] > tops[0] : tops[0] === tops[1], JSON.stringify(tops));
  await pressNext(page);
  pass(`${tag}: Next with no word says “Choose at least one word to carry on.”`, await problem(page, 'Choose at least one word to carry on.'));
  for (const w of EW.words) await page.getByRole('button', { name: w, exact: true }).click();
  pass(`${tag}: as many as fit can be chosen`, (await page.locator('.ds-guide-body .ds-answer[aria-pressed=true]').count()) === 3);
  pass(`${tag}: Finish later is on this typing step too`, (await page.locator('.ds-guide-foot .ds-guide-skip').innerText()).trim() === 'Finish later');
  await checkScreen(page, `${tag}, the words`);
  await shot('words');
  await pressNext(page);

  // ---- what it could be related to: optional
  await onQuestion(page, 'What could the feeling be related to?');
  pass(`${tag}: eleven things it could be related to`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Trust', 'Respect', 'Fairness', 'Loyalty', 'Recognition', 'Status', 'Control', 'Belonging', 'Security', 'Identity', 'Competence']));
  await pressNext(page);
  pass(`${tag}: it’s optional: Next works with none chosen`, await onQuestion(page, 'What story are you telling yourself', 5000));
  await sleep(450);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await onQuestion(page, 'What could the feeling be related to?');
  for (const w of EW.rel) await page.getByRole('button', { name: w, exact: true }).click();
  await checkScreen(page, `${tag}, related to`);
  await shot('related-to');
  await pressNext(page);

  // ---- the story: one thought a box, with See an example
  await onQuestion(page, 'What story are you telling yourself about what’s happened?');
  pass(`${tag}: “Type one thought in each box.”`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Type one thought in each box.');
  pass(`${tag}: the % bar reads 36`, (await percent(page)) === 36);
  const example = page.locator('.ds-guide-example-link');
  pass(`${tag}: “See an example” says it opens something in place`, (await example.innerText()).trim() === 'See an example' && (await example.getAttribute('aria-expanded')) === 'false');
  const before = await page.locator('.ds-guide-scroll').evaluate((el) => el.scrollTop);
  await example.click();
  await sleep(700);
  const shown = await page.locator('.ds-guide-scroll').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const l = el.querySelector('.ds-guide-example-link').getBoundingClientRect();
    const e = el.querySelector('.ds-guide-example')?.getBoundingClientRect();
    return { top: el.scrollTop, linkIn: l.top >= box.top - 1 && l.bottom <= box.bottom + 1, exampleIn: Boolean(e) && e.top >= box.top - 1 && e.bottom <= box.bottom + 1, words: el.querySelector('.ds-guide-example')?.textContent.trim() };
  });
  pass(`${tag}: the example opens in place: “For example: The chair has never rated me.”`, shown.words === 'For example: The chair has never rated me.', shown.words);
  pass(`${tag}: … and keeps your place, with its link still in view (rule 29aq)`, shown.top >= before && shown.linkIn && shown.exampleIn, JSON.stringify({ before, ...shown }));
  pass(`${tag}: the link then reads “Hide the example”`, (await example.innerText()).trim() === 'Hide the example' && (await example.getAttribute('aria-expanded')) === 'true');
  await shot('story-example');
  await example.click();
  await pressNext(page);
  pass(`${tag}: Next with no thought says “Type at least one thought to carry on.”`, await problem(page, 'Type at least one thought to carry on.'));
  const boxes = page.locator('.ds-rowlist .ds-text');
  for (let i = 0; i < EW.thoughts.length; i += 1) {
    if (i > 0) await page.getByRole('button', { name: 'Add another thought' }).click();
    await boxes.nth(i).fill(EW.thoughts[i]);
  }
  const typed = () => boxes.evaluateAll((els) => els.map((el) => el.value));
  pass(`${tag}: one thought in each box, three boxes`, JSON.stringify(await typed()) === JSON.stringify(EW.thoughts));
  await sleep(400);
  await page.locator('.ds-guide-question').click();
  await checkScreen(page, `${tag}, the story`);
  await shot('story');
  // Delete with Undo: back where it was.
  await page.getByRole('button', { name: 'Remove thought 2' }).click();
  pass(`${tag}: taking a thought out says “Deleted” with Undo`, await sawToast(page, 'Deleted') && (await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).count()) === 1);
  pass(`${tag}: … and its box has gone`, JSON.stringify(await typed()) === JSON.stringify([EW.thoughts[0], EW.thoughts[2]]));
  await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo puts it back in the same place`, await until(async () => JSON.stringify(await typed()) === JSON.stringify(EW.thoughts), 5000), JSON.stringify(await typed()));

  // ---- Finish later: a draft, kept on the device (043 isn't on the test project), and listed
  await sleep(600);
  await page.locator('.ds-guide-foot .ds-guide-skip').click();
  pass(`${tag}: Finish later says “Saved”`, await sawToast(page, 'Saved'));
  await page.waitForURL(/\/personal\/reset$/, { timeout: 15000 });
  let records = await kept(page);
  pass(`${tag}: the unfinished wash is kept as a draft, by a name that is never what was typed, and never shared`, records.length === 1 && records[0].status === 'draft' && records[0].title === 'Your wash' && records[0].shared === false && records[0].answers.thoughts.length === 3, JSON.stringify(records.map((r) => [r.status, r.title, r.shared])));
  const washId = records[0]?.id;
  await page.goto(`${APP}/my-plans?area=personal`);
  const draftRow = page.locator('li, .hl-row, [class*=row]').filter({ hasText: 'Your wash' }).first();
  pass(`${tag}: My Plans lists it as a draft of the tool`, await until(async () => { const t = (await draftRow.innerText().catch(() => '')).replace(/\s+/g, ' '); return /Your wash/.test(t) && /Emotional wash/i.test(t) && /Draft/i.test(t); }, 15000), (await draftRow.innerText().catch(() => 'not found')).slice(0, 200));
  pass(`${tag}: … and the list never shows what was typed`, !(await page.locator('.ui-root').first().innerText()).includes('chair'));
  await page.goto(`${APP}/welcome`);
  pass(`${tag}: Home offers to carry on, by the tool’s name`, await until(async () => (await page.locator('.ds-carryon').getByText('Emotional wash').count()) > 0, 15000));

  // ---- coming back: the same screen, with the same three thoughts
  await page.goto(`${APP}${WASH_PATH}`);
  pass(`${tag}: the tool carries on where it was left`, await onQuestion(page, 'What story are you telling yourself', 20000));
  pass(`${tag}: … with the same three thoughts`, await until(async () => JSON.stringify(await typed()) === JSON.stringify(EW.thoughts), 8000), JSON.stringify(await typed()));
  await sleep(4200);
  await pressNext(page);

  // ---- the first thought: true, logical and helpful are three screens, each one tap
  await onQuestion(page, `Is “${short(EW.thoughts[0])}” true?`);
  pass(`${tag}: “Thought 1 of 3” above the question`, (await label(page)) === 'Thought 1 of 3');
  pass(`${tag}: “Think about what you know for certain.”`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Think about what you know for certain.');
  pass(`${tag}: the answers are Yes, Not sure and No`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Yes', 'Not sure', 'No']));
  pass(`${tag}: a check has no bottom bar, no Finish later and no eye`, (await page.locator('.ds-guide-foot').count()) === 0 && (await page.locator('.ds-guide-skip').count()) === 0 && (await page.locator('.ds-guide-question .ds-who').count()) === 0);
  const at1 = await percent(page);
  pass(`${tag}: the % bar has moved on from 36`, at1 > 36, `${at1}`);
  await checkScreen(page, `${tag}, is it true`, { coral: 0 });
  await shot('true');
  await tap(page, CHECK.No);
  pass(`${tag}: then, by itself, “Is “…” logical?” on its own screen`, await onQuestion(page, `Is “${short(EW.thoughts[0])}” logical?`, 5000) && (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Ask whether it follows from what happened, or jumps to a conclusion.');
  await shot('logical');
  // Back keeps the answer.
  await sleep(450);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await onQuestion(page, `Is “${short(EW.thoughts[0])}” true?`);
  pass(`${tag}: Back keeps the answer`, (await page.locator('.ds-guide-body .ds-answer[aria-checked=true]').innerText()).trim() === 'No');
  await tap(page, CHECK.No);
  await onQuestion(page, `Is “${short(EW.thoughts[0])}” logical?`);
  // A refresh part-way: the same question, with the answers so far ("Draft restored").
  await page.reload();
  pass(`${tag}: after a refresh the tool is on the same question`, await onQuestion(page, `Is “${short(EW.thoughts[0])}” logical?`, 20000));
  await tap(page, CHECK['Not sure']);
  pass(`${tag}: then “Is “…” helpful?” on its own screen`, await onQuestion(page, `Is “${short(EW.thoughts[0])}” helpful?`, 5000) && (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Ask whether thinking it helps you act well.');
  await shot('helpful');
  await tap(page, CHECK.No);

  // ---- how to wash it: Park and reflect, the follow-up inside the chosen card
  await onQuestion(page, `How will you wash “${short(EW.thoughts[0])}”?`);
  pass(`${tag}: three ways to wash it, each with its line, nothing chosen yet`, JSON.stringify((await page.locator('.ds-follow-answer').allInnerTexts()).map((t) => t.replace(/\s*\n\s*/g, ' | '))) === JSON.stringify(['Accept and act | Simplify it and move to action.', 'Park and reflect | Turn it into a question to come back to.', 'Trash | It’s an unhelpful story, so let it go.']) && (await page.locator('.ds-follow-answer[aria-pressed=true]').count()) === 0);
  pass(`${tag}: nothing asks how strong the feeling is`, !/how strong|strength|out of 10|\/10/i.test(await page.locator('.ds-guide').innerText()));
  await checkScreen(page, `${tag}, how will you wash it`);
  await shot('wash-empty');
  await pressNext(page);
  pass(`${tag}: Next with nothing chosen says “Choose one to carry on.”`, await problem(page, 'Choose one to carry on.'));
  await page.getByRole('button', { name: /^Park and reflect/ }).click();
  const park = card(page, 'Park and reflect');
  pass(`${tag}: Park and reflect opens its follow-up inside the chosen card`, await until(async () => (await park.locator('.ds-follow-body').count()) === 1, 5000) && (await page.locator('.ds-follow-body').count()) === 1);
  pass(`${tag}: … “What’s the question that will be helpful to reflect on?” and its line`, (await park.locator('.ds-follow-label').innerText()).trim() === 'What’s the question that will be helpful to reflect on?' && (await park.locator('.ds-follow-hint').innerText()).trim() === 'Keep it open, starting with “What” or “How”. Tap one to start, then make it yours.');
  const starters = park.locator('.ds-chip');
  pass(`${tag}: three starters`, JSON.stringify((await starters.allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['What do I know for certain here?', 'What would I say to a friend in my place?', 'What matters most to me in this?']));
  const parkBox = park.locator('textarea');
  pass(`${tag}: the box is named by its question, with an example in it`, (await parkBox.getAttribute('placeholder')) === 'e.g. What would show me where I stand with the chair?' && Boolean(await parkBox.getAttribute('aria-labelledby')));
  await sleep(500);
  await page.locator('.ds-guide-question').click();
  await checkScreen(page, `${tag}, park and reflect`);
  await shot('park-and-reflect');
  await pressNext(page);
  pass(`${tag}: Next with no question says “Type your question to carry on.”`, await problem(page, 'Type your question to carry on.'));
  await starters.nth(1).click();
  pass(`${tag}: tapping a starter fills the box`, await until(async () => (await parkBox.inputValue()) === 'What would I say to a friend in my place?', 5000), await parkBox.inputValue());
  pass(`${tag}: … shows as chosen, and the box is ready to type in`, (await starters.nth(1).getAttribute('aria-pressed')) === 'true' && await parkBox.evaluate((el) => el === document.activeElement));
  await starters.nth(0).click();
  pass(`${tag}: another starter takes its place`, await until(async () => (await parkBox.inputValue()) === 'What do I know for certain here?', 5000));
  // The starter puts the caret at the end of its words a frame after the tap: typing starts once it has.
  await until(() => parkBox.evaluate((el) => el === document.activeElement && el.selectionStart === el.value.length), 4000);
  await sleep(300);
  await parkBox.fill(EW.question);
  pass(`${tag}: … and it can be made your own (no starter then shows as chosen)`, (await park.locator('.ds-chip[aria-pressed=true]').count()) === 0);
  await shot('park-and-reflect-typed');
  await pressNext(page);

  // ---- the second thought: Trash, with its Undo
  await checks(page, short(EW.thoughts[1]), ['Yes', 'Yes', 'Yes']);
  pass(`${tag}: then the second thought, “Thought 2 of 3”`, (await questionText(page)) === `How will you wash “${short(EW.thoughts[1])}”?` && (await label(page)) === 'Thought 2 of 3');
  await sleep(450);
  await page.getByRole('button', { name: /^Trash/ }).click();
  const lifting = await until(async () => (await page.locator('.ds-guide-question .ds-dissolve').count()) === 1, 3000);
  const motion = lifting ? await page.locator('.ds-dissolve-word > span').first().evaluate((el) => { const cs = getComputedStyle(el); return { name: cs.animationName, time: cs.animationDuration, ease: cs.animationTimingFunction }; }) : null;
  pass(`${tag}: Trash lifts the thought away letter by letter, on the tokens’ timing`, Boolean(lifting) && motion.name === 'ds-dissolve' && motion.time === '0.4s' && motion.ease === 'cubic-bezier(0.22, 1, 0.36, 1)', JSON.stringify(motion));
  await shot('trash-lifting');
  pass(`${tag}: then “That thought has gone.” and “It won’t appear in your summary.”`, await onQuestion(page, 'That thought has gone.', 6000) && (await page.locator('.ds-guide-nudge').innerText()).trim() === 'It won’t appear in your summary.');
  pass(`${tag}: … with “Deleted” and Undo`, await sawToast(page, 'Deleted') && (await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).count()) === 1);
  await checkScreen(page, `${tag}, that thought has gone`);
  await shot('trash-gone');
  await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo brings the thought back, with nothing chosen`, await onQuestion(page, `How will you wash “${short(EW.thoughts[1])}”?`, 5000) && (await page.locator('.ds-follow-answer[aria-pressed=true]').count()) === 0);
  pass(`${tag}: … and says “The thought is back”`, await sawToast(page, 'The thought is back'));
  // Again, with reduced motion: the words simply fade.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(600);
  await page.getByRole('button', { name: /^Trash/ }).click();
  const still = await page.locator('.ds-dissolve-word > span').first().evaluate((el) => { const cs = getComputedStyle(el); return { name: cs.animationName, time: cs.animationDuration, delay: cs.animationDelay }; }).catch(() => null);
  pass(`${tag}: with reduced motion the words simply fade, together`, Boolean(still) && still.name === 'ds-dissolve-still' && still.time === '0.25s' && still.delay === '0s', JSON.stringify(still));
  pass(`${tag}: … and the thought has gone`, await onQuestion(page, 'That thought has gone.', 4000));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await sleep(5600); // the toast goes
  await pressNext(page);

  // ---- the third thought: Accept and act, with "Where should it go?" in the step
  await checks(page, short(EW.thoughts[2]), ['Not sure', 'No', 'Yes']);
  pass(`${tag}: then the third thought, “Thought 3 of 3”`, (await label(page)) === 'Thought 3 of 3');
  await sleep(450);
  await page.getByRole('button', { name: /^Accept and act/ }).click();
  const act = card(page, 'Accept and act');
  await act.locator('.ds-follow-body').waitFor({ timeout: 5000 });
  pass(`${tag}: Accept and act asks “What’s one small step you’ll take?”, with “Keep it small and clear.”`, (await act.locator('.ds-follow-label').innerText()).trim() === 'What’s one small step you’ll take?' && (await act.locator('.ds-follow-hint').innerText()).trim() === 'Keep it small and clear.');
  const where = act.locator('.ds-todo-where');
  pass(`${tag}: “Where should it go?” is in the step: This week, Backlog, Don’t add it`, (await where.locator('.ds-label-row-text').innerText()).trim() === 'Where should it go?' && JSON.stringify((await where.getByRole('radio').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['This week', 'Backlog', 'Don’t add it']));
  pass(`${tag}: This week is chosen to start with (a sprint is running)`, (await where.getByRole('radio', { name: 'This week' }).getAttribute('aria-checked')) === 'true');
  await pressNext(page);
  pass(`${tag}: Next with no step says “Type one small step to carry on.”`, await problem(page, 'Type one small step to carry on.'));
  const stepText = `${EW.step.replace(/\.$/, '')} (${width}).`;
  await act.locator('textarea').fill(stepText);
  const strategy = act.locator('.ds-follow-also');
  const asksStrategy = (await strategy.count()) === 1;
  pass(`${tag}: with several Strategies in the plan, the step asks which one it serves`, asksStrategy && (await strategy.innerText()).includes('Which Strategy does it serve?'));
  if (asksStrategy) {
    await pressNext(page);
    pass(`${tag}: Next with no Strategy says “Choose a Strategy to carry on.”`, await problem(page, 'Choose a Strategy to carry on.'));
    await strategy.locator('.ds-dd, [aria-haspopup=listbox]').first().click();
    await page.locator('[role=option]').first().click();
    await sleep(400);
  }
  await where.getByRole('radio', { name: 'Backlog' }).click();
  pass(`${tag}: Backlog says “It waits there until you plan it into a week.”`, await until(async () => (await where.innerText()).includes('It waits there until you plan it into a week.'), 4000));
  await where.getByRole('radio', { name: 'This week' }).click();
  await sleep(400);
  await page.locator('.ds-guide-question').click();
  await checkScreen(page, `${tag}, accept and act`);
  await shot('accept-and-act');
  await pressNext(page);
  pass(`${tag}: This week says “Added to this week”`, await sawToast(page, 'Added to this week'));

  // ---- Your wash
  await title(page).waitFor({ timeout: 15000 });
  pass(`${tag}: the summary’s title is “Your wash”, with the eye`, (await title(page).innerText()).replace(/\s+/g, ' ').trim().toUpperCase() === 'YOUR WASH' && (await page.locator('.ds-guide-title .ds-who').count()) === 1);
  pass(`${tag}: no % bar and no Finish later on the summary`, (await page.locator('.ds-guide-pct').count()) === 0 && (await page.locator('.ds-guide-skip').count()) === 0);
  let rows = await planRows(page);
  pass(`${tag}: a mirror of what was named and chosen, in M10’s order`, JSON.stringify(rows.map((r) => [r.label, r.lines[0]])) === JSON.stringify([
    ['What happened', EW.what], ['The feeling', 'Present angst'], ['Related to', 'Respect and loyalty'], ['To act on', stepText], ['To reflect on', EW.question],
  ]), JSON.stringify(rows.map((r) => [r.label, r.lines[0]])));
  pass(`${tag}: the feeling’s words are said back as a sentence`, rows[1].sub[0] === 'Disappointment, anger and contempt.', rows[1].sub[0]);
  pass(`${tag}: the step says “It’s in this week’s to-dos.”, in green`, rows[3].sub[0] === 'It’s in this week’s to-dos.' && rows[3].good[0] === true, JSON.stringify(rows[3]));
  const summaryText = await page.locator('.ds-guide').innerText();
  pass(`${tag}: the trashed thought never appears`, !summaryText.includes('look weak'));
  pass(`${tag}: no strength rating anywhere`, !/how strong|strength|out of 10|\/10|\b1 to (5|10)\b/i.test(summaryText));
  pass(`${tag}: each row opens its question: a screen reader hears “Edit what happened”`, JSON.stringify(rows.map((r) => r.aria)) === JSON.stringify(['Edit what happened', 'Edit the feeling', 'Edit what it’s related to', 'Edit what to act on', 'Edit what to reflect on']), JSON.stringify(rows.map((r) => r.aria)));
  pass(`${tag}: “Finish my wash” is the coral button`, (await page.locator('.ds-guide-next').innerText()).trim().toUpperCase() === 'FINISH MY WASH');
  await sleep(5200);
  await checkScreen(page, `${tag}, your wash`, { heading: '.ds-guide-title' });
  await shot('your-wash');
  let todos = (await myTodos()).filter((t) => t.text.includes(`(${width})`));
  let live = todos.filter((t) => !t.deleted_at);
  pass(`${tag}: the to-do is in this week’s sprint, from this wash`, live.length === 1 && Boolean(live[0].sprint_id && live[0].planned_week) && live[0].source === 'other_tool' && live[0].source_id === washId && Boolean(live[0].strategy_id), JSON.stringify(live));

  // The eye on the summary is the same: private, nothing to choose.
  await page.locator('.ds-guide-title .ds-who').click();
  await panel(page).waitFor({ timeout: 10000 });
  await sleep(500);
  pass(`${tag}: the summary’s eye says the same, with nothing to choose`, (await panel(page).innerText()).includes('Your Emotional wash can’t be shared, like your Journal.') && (await panel(page).locator('[role=option], [role=radio]').count()) === 0);
  await page.keyboard.press('Escape');
  await panelGone(page);

  // ---- Edit: only that question opens, and "Save my edit" goes straight back
  const editStep = async (place) => {
    await sleep(600);
    await row(page, 'Edit what to act on').click();
    await onQuestion(page, `How will you wash “${short(EW.thoughts[2])}”?`);
    await sleep(500);
    await card(page, 'Accept and act').getByRole('radio', { name: place }).click();
    await sleep(450);
    await page.locator('.ds-guide-next').click();
    await title(page).waitFor({ timeout: 10000 });
  };
  await row(page, 'Edit what to act on').click();
  await onQuestion(page, `How will you wash “${short(EW.thoughts[2])}”?`);
  pass(`${tag}: Edit opens only that question, with “Save my edit”`, (await page.locator('.ds-guide-next').innerText()).trim().toUpperCase() === 'SAVE MY EDIT' && (await card(page, 'Accept and act').locator('textarea').inputValue()) === stepText);
  pass(`${tag}: … and the bar shows full`, (await percent(page)) === 100);
  await sleep(450);
  await card(page, 'Accept and act').getByRole('radio', { name: 'Backlog' }).click();
  await sleep(450);
  await page.locator('.ds-guide-next').click();
  pass(`${tag}: Backlog says “Added to your backlog”`, await sawToast(page, 'Added to your backlog'));
  await title(page).waitFor({ timeout: 10000 });
  rows = await planRows(page);
  pass(`${tag}: … and the step then says “It’s in your backlog.”`, rows[3].sub[0] === 'It’s in your backlog.', JSON.stringify(rows[3]));
  await sleep(1200);
  todos = (await myTodos()).filter((t) => t.text.includes(`(${width})`));
  live = todos.filter((t) => !t.deleted_at);
  pass(`${tag}: the Backlog to-do has no sprint and no week, and the one for this week has gone`, todos.length === 2 && live.length === 1 && !live[0].sprint_id && !live[0].planned_week, JSON.stringify(todos.map((t) => [Boolean(t.sprint_id), Boolean(t.deleted_at)])));
  await sleep(5200);
  await editStep('Don’t add it');
  rows = await planRows(page);
  pass(`${tag}: “Don’t add it” leaves the step with nothing under it`, rows[3].lines[0] === stepText && rows[3].sub.length === 0, JSON.stringify(rows[3]));
  await sleep(1200);
  todos = (await myTodos()).filter((t) => t.text.includes(`(${width})`));
  pass(`${tag}: … and no to-do is left for it`, todos.length === 2 && todos.every((t) => t.deleted_at), JSON.stringify(todos.map((t) => Boolean(t.deleted_at))));
  await editStep('This week');
  await sawToast(page, 'Added to this week');
  rows = await planRows(page);
  pass(`${tag}: back to This week: one to-do again`, rows[3].sub[0] === 'It’s in this week’s to-dos.');

  // The feeling is the kind, then its words.
  await sleep(5200);
  await row(page, 'Edit the feeling').click();
  await onQuestion(page, 'What kind of feeling are you left with?');
  await tap(page, 2);
  pass(`${tag}: Edit beside the feeling opens the kind, then its words`, await onQuestion(page, 'Which words fit the feeling?', 5000) && (await page.locator('.ds-guide-next').innerText()).trim().toUpperCase() === 'SAVE MY EDIT');
  await page.getByRole('button', { name: 'Regret', exact: true }).click();
  await sleep(450);
  await page.locator('.ds-guide-next').click();
  await title(page).waitFor({ timeout: 10000 });
  rows = await planRows(page);
  pass(`${tag}: … and both show on the summary`, rows[1].lines[0] === 'Past regret' && rows[1].sub[0] === 'Disappointment, anger, contempt and regret.', JSON.stringify(rows[1]));

  // A parked thought changed to a step: two steps, a row each.
  await sleep(600);
  await row(page, 'Edit what to reflect on').click();
  await onQuestion(page, `How will you wash “${short(EW.thoughts[0])}”?`);
  pass(`${tag}: the parked thought opens with its question`, (await card(page, 'Park and reflect').locator('textarea').inputValue()) === EW.question);
  await page.getByRole('button', { name: /^Accept and act/ }).click();
  const second = card(page, 'Accept and act');
  await second.locator('textarea').fill(`Ask Priya what she saw (${width}).`);
  await second.getByRole('radio', { name: 'Don’t add it' }).click();
  await sleep(450);
  await page.locator('.ds-guide-next').click();
  await title(page).waitFor({ timeout: 10000 });
  rows = await planRows(page);
  pass(`${tag}: two steps to act on get a row each, and nothing is left to reflect on`, JSON.stringify(rows.map((r) => r.label)) === JSON.stringify(['What happened', 'The feeling', 'Related to', 'To act on', 'To act on']) && JSON.stringify(rows.slice(3).map((r) => r.aria)) === JSON.stringify(['Edit what to act on, 1 of 2', 'Edit what to act on, 2 of 2']), JSON.stringify(rows.map((r) => [r.label, r.aria])));
  await shot('your-wash-edited');

  // ---- the PDF: a quiet text link beside the one coral button
  const pdfLink = page.locator('.ds-guide-foot-aside button').first();
  pass(`${tag}: “Download my PDF” is a quiet text link`, (await pdfLink.innerText()).trim() === 'Download my PDF' && (await pdfLink.evaluate((el) => getComputedStyle(el).backgroundColor.replace(/\s+/g, ''))) === 'rgba(0,0,0,0)' && /underline/.test(await pdfLink.evaluate((el) => getComputedStyle(el).textDecorationLine)));
  await pdfLink.click();
  const choice = page.getByRole('button', { name: /Light/ }).first();
  pass(`${tag}: the PDF offers Light, for printing and Dark, for sharing`, await until(async () => (await choice.count()) > 0 && (await page.getByRole('button', { name: /Dark/ }).count()) > 0, 8000));
  const download = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await choice.click();
  const file = await download;
  pass(`${tag}: the PDF is made and named in words`, Boolean(file) && /^Emotional wash, .*\d{4}\.pdf$/.test(file?.suggestedFilename() || ''), file?.suggestedFilename() || 'no download');
  await sleep(800);

  // ---- Finish my wash: saved as finished, the trashed thought let go for good
  await sleep(600);
  await page.locator('.ds-guide-next').click();
  pass(`${tag}: “Finish my wash” says “Saved”`, await sawToast(page, 'Saved'));
  await page.waitForURL(/\/personal\/reset$/, { timeout: 15000 });
  records = await kept(page);
  const saved = records[0];
  pass(`${tag}: one finished wash is kept, over its own draft, never shared`, records.length === 1 && saved.id === washId && saved.status === 'completed' && Boolean(saved.finishedAt) && saved.shared === false, JSON.stringify(records.map((r) => [r.id === washId, r.status, r.shared])));
  pass(`${tag}: its trashed thought is gone for good, and no rating is saved`, saved.answers.thoughts.length === 2 && !JSON.stringify(saved).includes('look weak') && !/strength|strong/i.test(JSON.stringify(saved)), JSON.stringify(saved?.answers?.thoughts?.map((t) => t.wash)));
  pass(`${tag}: each check’s answer is kept with its thought`, JSON.stringify(saved.answers.thoughts.map((t) => [t.true, t.logical, t.helpful])) === JSON.stringify([['no', 'unsure', 'no'], ['unsure', 'no', 'yes']]), JSON.stringify(saved?.answers?.thoughts?.map((t) => [t.true, t.logical, t.helpful])));
  pass(`${tag}: Reset shows no recent list (a wash never shows on a shared screen)`, (await page.locator('.ds-hub-recent').count()) === 0);
  await page.goto(`${APP}/personal/plan`);
  await sleep(2500);
  pass(`${tag}: … and Plan’s recent list never shows it`, !(await page.locator('.ui-root').first().innerText()).includes('Your wash'));
  await page.goto(`${APP}/welcome`);
  await sleep(2500);
  pass(`${tag}: Home no longer offers to carry it on`, (await page.locator('.ds-carryon').getByText('Emotional wash').count()) === 0);

  // ---- the saved wash opens on its summary
  await page.goto(`${APP}/my-plans?area=personal`);
  const item = page.getByText('Your wash').first();
  await item.waitFor({ timeout: 15000 });
  await item.click();
  pass(`${tag}: a saved wash opens on “Your wash”`, await until(async () => (await title(page).count()) > 0 && (await page.locator('.ds-guide-plan-row').count()) === 5, 15000));
  pass(`${tag}: … at the tool’s own address`, new URL(page.url()).pathname === WASH_PATH);
  rows = await planRows(page);
  pass(`${tag}: … with what was saved, and where its step is`, rows[1].lines[0] === 'Past regret' && rows[4].lines[0] === stepText && rows[4].sub[0] === 'It’s in this week’s to-dos.', JSON.stringify(rows.map((r) => [r.lines[0], r.sub[0]])));
  await sleep(600);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForURL(/\/my-plans/, { timeout: 15000 });
  records = await kept(page);
  pass(`${tag}: closing it leaves it finished`, records.length === 1 && records[0].status === 'completed');

  // ---- a new wash starts empty; an untouched one saves nothing
  await page.goto(`${APP}${WASH_PATH}`);
  await onQuestion(page, 'What happened?');
  pass(`${tag}: the next wash starts empty`, (await page.locator('.ds-guide-body textarea').first().inputValue()) === '');
  await sleep(600);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForURL(/\/personal\/reset$/, { timeout: 15000 });
  pass(`${tag}: closing an untouched wash saves nothing`, (await kept(page)).length === 1);

  // ---- nothing went wrong on the way
  live = (await myTodos()).filter((t) => t.text.includes(`(${width})`) && !t.deleted_at);
  pass(`${tag}: one to-do is left: the step for this week`, live.length === 1 && Boolean(live[0].sprint_id) && live[0].text === stepText, JSON.stringify(live.map((t) => t.text)));
  const probes = refused.filter((r) => /\/rest\/v1\/tool_answers/.test(r));
  // Step 2's guest_claim is asked after each sign-in and isn't on the test project until 035 is run: not this tool's.
  const others = refused.filter((r) => !/\/rest\/v1\/(tool_answers|rpc\/guest_claim)/.test(r));
  pass(`${tag}: no console errors and no page errors`, errors.length === 0, errors.join(' | '));
  pass(`${tag}: no request was refused, but the one question about the table 043 adds`, others.length === 0 && probes.length <= 1, `${probes.length} for the table; others: ${others.join(' | ')}`);
  await page.goto(`${APP}/version.json`);
  await clearWash(page);
  await ctx.close();
}

const browser = await chromium.launch();
try {
  for (const width of SIZES) {
    try {
      await run(browser, width);
    } catch (error) {
      pass(`${width}px: the flow ran to its end`, false, `${error.message}`.split('\n')[0]);
    }
  }
} finally {
  await browser.close();
  await cleanUp().catch((e) => results.push(`NOTE  clean-up: ${e.message}`));
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${passed} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
