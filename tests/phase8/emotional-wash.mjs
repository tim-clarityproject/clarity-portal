// Emotional wash (Polish 1, Stage D, 27 Nov: Draft 6's nine screens with
// Draft 7's word list; docs/rules/emotional-wash.md), the flows: signed in
// as the invented test client on the local stand-in (tests/target.mjs), at
// 1440 and 400 wide. Every other host, every server function and every
// email call is blocked. The saved washes go to tool_answers; the test
// client's washes are cleared there before and after each width
// (clearToolRows). The to-dos the test adds are deleted at the end, and
// what the tool keeps on the device is taken off.
//
// The path: the tile, What happened (no eye: a wash is private), the eight
// families (one tap), the family's words with their meanings and Something
// else, How strong is it right now? with the chosen words under it, what
// you're telling yourself, the other thoughts (See an example shows three),
// one choice for each thought (act, park, let go), the commit screen (the
// one screen with no Skip, its calm lines, a day and a Strategy), Your wash,
// a refresh part-way, finishing, the saved row (version 2, never shared),
// opening it again, and a wash skipped from end to end.
//
// Also the UI tester's measurements on these screens (makeCheckScreen):
// 44px tap areas, no sideways scroll, one main button per screen (none on
// a one-tap screen). No eye to measure: a wash has none.
//
//   node tests/phase8/emotional-wash.mjs [folder for screenshots]
//   SIZES=1440   to run one width
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, WASH_PATH, block, clearWash, clearToolRows, clientDb, onQuestion, pressNext, readEnv, signIn, sleep, until,
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
  await clearToolRows(db, me, 'emotional_wash');
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
const label = async (page) => (await page.locator('.ds-guide-label').textContent().catch(() => '')).trim();
const planRows = async (page) => page.locator('.ds-guide-plan-row').evaluateAll((rows) => rows.map((r) => ({
  label: r.querySelector('.ds-guide-plan-label').textContent.trim(),
  lines: [...r.querySelectorAll('.ds-guide-plan-line')].map((l) => [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()),
  sub: [...r.querySelectorAll('.ds-guide-plan-line small')].map((s) => s.textContent.trim()),
  good: [...r.querySelectorAll('.ds-guide-plan-line small')].map((s) => s.classList.contains('ds-guide-plan-good')),
  // Polish 1: the row's "Edit" button carries the name now.
  aria: r.getAttribute('aria-label') || r.querySelector('.ds-guide-plan-edit')?.getAttribute('aria-label') || null,
})));
const row = (page, name) => page.getByRole('button', { name, exact: true });
// One tap on a check's answer, then the next screen by itself.
async function tap(page, n) {
  await sleep(450);
  await answers(page).nth(n).click();
}
// The three checks for the thought on screen, each answered as given.

async function run(browser, width) {
  const phone = width < 600;
  const tag = `${width}px`;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: phone ? 'light' : 'dark', hasTouch: phone, isMobile: phone, acceptDownloads: true, deviceScaleFactor: 2 });
  await block(ctx);
  // The test client has a coach who can be messaged: Your wash offers to talk it through with them (Draft 6).
  await ctx.route(/\/rest\/v1\/rpc\/my_coach/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ coach_id: '22222222-2222-4222-8222-222222222222', first_name: 'Tim', away_until: null, mobile: '+447700900123', contact_ways: ['whatsapp'] }]),
  }));
  const page = await ctx.newPage();
  const errors = [];
  const refused = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) refused.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  const shot = (name) => page.screenshot({ path: join(out, `${name}-${width}.png`) });
  const choose = async (words) => { await sleep(450); await page.locator('.ds-guide-body .ds-answer', { hasText: words }).first().click(); };
  await signIn(page, env);
  await clearWash(page); await clearToolRows(db, me, 'emotional_wash');
  refused.length = 0;

  // ---- the hub's tile opens the tool
  await page.goto(`${APP}/personal/reset`);
  const tile = page.getByRole('link', { name: /Emotional wash/ }).or(page.getByRole('button', { name: /Emotional wash/ })).first();
  await tile.waitFor({ timeout: 20000 });
  const tileWords = (await tile.innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: Reset has the tool’s tile, with its line and its one time`, /Emotional wash/.test(tileWords) && /~10 minutes/.test(tileWords) && /Identify emotions, the stories they’re rooted in, and how to move forward\./.test(tileWords), tileWords);
  await tile.click();
  await onQuestion(page, 'What happened?');
  pass(`${tag}: the tool opens at its own address`, new URL(page.url()).pathname === WASH_PATH, page.url());

  // ---- What happened: no eye, nothing under the question, Skip this step
  pass(`${tag}: a wash is private: no eye anywhere (Draft 6)`, (await page.locator('.ds-guide .ds-who').count()) === 0);
  pass(`${tag}: nothing sits under the question`, (await page.locator('.ds-guide-nudge').count()) === 0);
  pass(`${tag}: What happened can be skipped`, (await page.locator('.ds-guide-foot .ds-guide-skip').innerText()).trim() === 'Skip this step');
  await checkScreen(page, `${tag}, what happened`);
  await shot('what-happened');
  const whatText = `The chair backed the other plan in front of everyone (${width}).`;
  await page.locator('.ds-guide-body textarea').first().fill(whatText);
  await pressNext(page);

  // ---- the eight families, one tap
  await onQuestion(page, 'Which of these is it closest to?');
  pass(`${tag}: the eight families, in Draft 7’s order`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Angry', 'Overloaded', 'Afraid', 'Uncertain', 'Sad', 'Ashamed', 'Disconnected', 'On guard']), JSON.stringify(await answerWords(page)));
  pass(`${tag}: one tap moves on, so there is no Next`, (await page.locator('.ds-guide-next').count()) === 0);
  await checkScreen(page, `${tag}, the families`, { coral: 0 }); // one tap moves on: no main button
  await choose('Angry');

  // ---- the family's words with their meanings, and Something else
  await onQuestion(page, 'Which word fits best?');
  const words = await answers(page).allInnerTexts();
  pass(`${tag}: Angry’s seven words, each with its meaning`, words.length === 7 && words[0].includes('Irritated') && words[0].includes('Small things are getting to you.') && words[6].includes('Furious'), JSON.stringify(words));
  await choose('Resentful');
  await choose('Betrayed');
  await page.getByRole('button', { name: 'Something else' }).click();
  await page.getByRole('textbox', { name: 'Your own word' }).fill('Sidelined');
  await checkScreen(page, `${tag}, the words`);
  await shot('words');
  await pressNext(page);

  // ---- How strong is it right now?
  await onQuestion(page, 'How strong is it right now?');
  pass(`${tag}: Slight to Intense`, JSON.stringify(await answerWords(page)) === JSON.stringify(['Slight', 'Mild', 'Moderate', 'Strong', 'Intense']));
  pass(`${tag}: the chosen words in the line under it (Draft 7)`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Resentful, betrayed and sidelined');
  await choose('Strong');

  // ---- what you're telling yourself, then the other thoughts
  await onQuestion(page, 'What are you telling yourself about it?');
  await page.locator('.ds-guide-body textarea').first().fill('The chair has never rated me.');
  await pressNext(page);
  await onQuestion(page, 'What other thoughts come with it?');
  await page.locator('.ds-guide-example-link').click();
  pass(`${tag}: See an example opens three different examples`, (await page.locator('.ds-guide-examples li').count()) === 3);
  const boxes = () => page.locator('.ds-guide-body .ds-rowlist textarea, .ds-guide-body .ds-rowlist input');
  await boxes().first().fill('If I push back, I’ll look weak.');
  await page.getByRole('button', { name: 'Add another thought' }).click();
  await boxes().nth(1).fill(`I need to win the board back (${width}).`);
  await checkScreen(page, `${tag}, the other thoughts`);
  await shot('others');
  await pressNext(page);

  // ---- one choice for each thought
  await onQuestion(page, 'For “The chair has never rated me”, what will you do with it?');
  pass(`${tag}: the three choices, in their own voice`, JSON.stringify(await answerWords(page)) === JSON.stringify(['I’ll act on it.', 'I’ll park it for now.', 'I’ll let it go.']));
  pass(`${tag}: “Thought 1 of 3” above it`, (await label(page)) === 'Thought 1 of 3', await label(page));
  await choose('I’ll park it for now.');
  await onQuestion(page, 'For “If I push back, I’ll look weak”');
  await choose('I’ll let it go.');
  await onQuestion(page, 'For “I need to win the board back');
  await choose('I’ll act on it.');

  // ---- the commit screen: the one that can't be skipped
  await onQuestion(page, 'What will you do about “I need to win the board back');
  pass(`${tag}: the commit question has no Skip`, (await page.locator('.ds-guide-skip').count()) === 0);
  await pressNext(page);
  pass(`${tag}: Next with nothing typed says what it needs`, await problem(page, 'Type what you’ll do to carry on.'));
  const stepText = `Ask the chair for 20 minutes (${width})`;
  await page.locator('.ds-guide-body .ew-commit textarea, .ds-guide-body .ew-commit input').first().fill(stepText);
  await pressNext(page);
  pass(`${tag}: then asks when`, await problem(page, 'Choose when to carry on.'));
  await page.locator('.ew-commit .ds-date').click();
  await sleep(400);
  await page.locator('[role="dialog"] button[aria-label]').filter({ hasNotText: /^$/ }).last().click();
  const dd = page.locator('.ew-commit button', { hasText: 'Choose one' });
  if (await dd.count()) { await dd.first().click(); await sleep(300); await page.getByRole('option').first().click(); }
  await checkScreen(page, `${tag}, what you’ll do and when`);
  await shot('commit');

  // ---- a refresh part-way keeps everything
  await sleep(800);
  await page.reload();
  await onQuestion(page, 'What will you do about', 20000);
  pass(`${tag}: a refresh keeps the step typed`, (await page.locator('.ds-guide-body .ew-commit textarea, .ds-guide-body .ew-commit input').first().inputValue()) === stepText);
  await pressNext(page);

  // ---- Your wash
  await until(async () => (await page.locator('.ds-guide-plan-row').count()) > 0, 15000);
  const rows = await planRows(page);
  const labels = rows.map((r) => r.label.toLowerCase());
  pass(`${tag}: Your wash: what happened, the word, how strong, what you’re telling yourself, then act, park and let go`, JSON.stringify(labels) === JSON.stringify(['what happened', 'the feeling', 'how strong it is', 'what you’re telling yourself', 'to act on', 'parked for now', 'letting go']), JSON.stringify(labels));
  pass(`${tag}: the feeling reads as the words, its family under them`, rows[1]?.lines[0] === 'Resentful, betrayed and sidelined' && rows[1]?.sub[0] === 'Angry', JSON.stringify(rows[1]));
  pass(`${tag}: the step says its day and where its to-do is`, /^By \w{3} \d{1,2} \w{3}/.test(rows[4]?.sub[0] || '') && /to-dos|backlog/.test(rows[4]?.sub[0] || ''), JSON.stringify(rows[4]));
  pass(`${tag}: it offers a talk with the person’s own coach`, (await page.locator('.ew-talk').innerText().catch(() => '')).trim() === 'Want to talk this through with Tim?');
  pass(`${tag}: Download my PDF is in the foot`, (await page.getByRole('button', { name: 'Download my PDF' }).or(page.getByRole('link', { name: 'Download my PDF' })).count()) > 0);
  await checkScreen(page, `${tag}, your wash`);
  await shot('your-wash');
  await sleep(450);
  await page.locator('.ds-guide-next').click();
  await page.waitForURL(/\/personal\/reset$/, { timeout: 15000 });
  pass(`${tag}: Finish my wash says Saved`, await sawToast(page, 'Saved') || await sawToast(page, 'Will sync'));

  // ---- the saved row: version 2, never shared
  let saved = [];
  await until(async () => { saved = (await db.from('tool_answers').select('id, status, answers, shared_with_coach').eq('user_id', me).eq('tool', 'emotional_wash')).data || []; return saved.some((r) => r.status === 'completed'); }, 15000);
  const done = saved.find((r) => r.status === 'completed');
  pass(`${tag}: saved finished, version 2, never shared`, done && done.answers.version === 2 && done.shared_with_coach === false && done.answers.strength === 4 && done.answers.family === 'angry' && done.answers.own === 'Sidelined', JSON.stringify(done && { ...done.answers, thoughts: undefined }));
  let live = (await myTodos()).filter((t) => t.text === stepText && !t.deleted_at);
  pass(`${tag}: the step is a to-do`, live.length === 1, JSON.stringify(live.map((t) => t.text)));

  // ---- opening it again shows Your wash
  if (done) {
    await page.goto(`${APP}${WASH_PATH}?id=${done.id}`);
    await until(async () => (await page.locator('.ds-guide-plan-row').count()) > 0, 20000);
    pass(`${tag}: a finished wash opens on Your wash`, (await planRows(page)).length === 7);
    await page.goto(`${APP}/version.json`);
  }

  // ---- every screen but the commit question can be skipped
  await clearWash(page);
  await page.goto(`${APP}${WASH_PATH}`);
  await onQuestion(page, 'What happened?');
  for (const q of ['What happened?', 'Which of these is it closest to?', 'How strong is it right now?', 'What are you telling yourself about it?', 'What other thoughts come with it?']) {
    await onQuestion(page, q);
    await sleep(450);
    await page.locator('.ds-guide-skip').click();
  }
  await until(async () => (await page.locator('.ds-guide-plan-row').count()) > 0, 15000);
  pass(`${tag}: skipped from end to end, Your wash says what was skipped`, (await planRows(page)).every((r) => r.lines[0] === 'You skipped this.'), JSON.stringify(await planRows(page)));
  await sleep(600);
  await page.getByRole('button', { name: /^Close( and save my place)?$/ }).first().click();
  await page.waitForURL(/\/personal\/reset$/, { timeout: 15000 });

  // ---- nothing went wrong on the way
  live = (await myTodos()).filter((t) => t.text.includes(`(${width})`) && !t.deleted_at);
  pass(`${tag}: one to-do is left: the step`, live.length === 1, JSON.stringify(live.map((t) => t.text)));
  const probes = refused.filter((r) => /\/rest\/v1\/tool_answers/.test(r));
  const others = refused.filter((r) => !/\/rest\/v1\/(tool_answers|rpc\/(guest|alignment)_claim)/.test(r));
  pass(`${tag}: no console errors and no page errors`, errors.length === 0, errors.join(' | '));
  pass(`${tag}: no request was refused, but the one question about the table 043 adds`, others.length === 0 && probes.length <= 1, `${probes.length} for the table; others: ${others.join(' | ')}`);
  await page.goto(`${APP}/version.json`);
  await clearWash(page); await clearToolRows(db, me, 'emotional_wash');
  await ctx.close();
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
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
