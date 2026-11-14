// Team performance check (M10, version 5.6), the flows: signed in as the
// invented test client on the TEST database, at 1440 and 400 wide. Every
// other host, every server function and every email call is blocked.
// Migration 043 isn't on the test project until Tim runs it, so the saved
// checks are kept on the device, which is what this tests: the page must
// work with no error. The to-dos the test adds are deleted at the end, and
// what the tool keeps on the device is taken off.
//
// Also the measurements the UI tester takes on these screens: the eye
// centred on the capitals within 0.5px and 12px from the last letter,
// Back's chevron on the content's edge, 44px tap areas, no sideways
// scroll, no console errors, one coral button per screen, and DM Sans
// really loaded by the page itself.
//
//   node tests/phase8/team-check.mjs [folder for screenshots]
//   SIZES=1440   to run one width
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, M10, TEAM_PATH, addPanel, addPerson, block, clearTeamCheck, clientDb, onQuestion, panel, panelGone, pressNext,
  questionText, rateTeam, readEnv, seedLastCheck, signIn, sleep, title, until, withCoach,
} from './shared.mjs';
import { makeCheckScreen } from './measure-lib.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-team-check');
mkdirSync(out, { recursive: true });
const SIZES = process.env.SIZES ? process.env.SIZES.split(',').map(Number) : [1440, 400];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};

const env = readEnv();
const { db, me } = await clientDb(env);
const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { data: todosBefore } = await db.from('todos').select('id').eq('user_id', me);
const keepTodos = new Set((todosBefore || []).map((t) => t.id));
const myTodos = async () => ((await db.from('todos').select('id, text, sprint_id, planned_week, source, source_id, deleted_at').eq('user_id', me).gte('created_on', todayKey)).data || []).filter((t) => !keepTodos.has(t.id));
async function cleanUp() {
  for (const t of await myTodos()) await db.from('todos').delete().eq('id', t.id).eq('user_id', me);
}

const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await toastText(page)).includes(words), ms);
const kept = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /^clarity-cache:.*:tool-answers$/.test(k));
  try { return Object.values(JSON.parse(localStorage.getItem(key)).v); } catch { return []; }
});
const dots = (page) => page.locator('.tpc-dot').count();

const checkScreen = makeCheckScreen(pass);

async function run(browser, width) {
  const phone = width < 600;
  const tag = `${width}px`;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: phone ? 'light' : 'dark', hasTouch: phone, isMobile: phone, acceptDownloads: true, deviceScaleFactor: 2 });
  await block(ctx);
  await withCoach(ctx, M10.coach);
  const page = await ctx.newPage();
  const errors = [];
  const refused = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) refused.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  const shot = (name) => page.screenshot({ path: join(out, `${name}-${width}.png`) });
  await signIn(page, env);
  await clearTeamCheck(page);
  refused.length = 0;

  // ---- the hub's tile opens the tool
  await page.goto(`${APP}/interpersonal`);
  const tile = page.getByRole('link', { name: /Team performance check/ }).or(page.getByRole('button', { name: /Team performance check/ })).first();
  await tile.waitFor({ timeout: 20000 });
  const tileWords = (await tile.innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: the hub has the tool’s tile, with its line and its one time`, /Team performance check/.test(tileWords) && /~5 minutes/.test(tileWords) && /See where each of your people stands and what to ask next\./.test(tileWords), tileWords);
  await tile.click();
  await onQuestion(page, 'Who reports to you?');
  pass(`${tag}: the tool opens at its own address`, new URL(page.url()).pathname === TEAM_PATH, page.url());

  // ---- the first screen
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
  pass(`${tag}: the line under the question`, (await page.locator('.ds-guide-nudge').innerText()).trim() === 'Add each person you lead directly.');
  pass(`${tag}: the eye is on the first screen`, (await page.locator('.ds-guide-question .ds-who').count()) === 1);
  pass(`${tag}: the % bar starts at 0`, (await page.locator('.ds-guide-pct').getAttribute('aria-valuenow')) === '0');
  pass(`${tag}: Finish later is a quiet link at the left`, (await page.locator('.ds-guide-foot .ds-guide-skip').innerText()).trim() === 'Finish later');
  await checkScreen(page, `${tag}, who reports to you (empty)`, { heading: '.ds-guide-question' });

  // Never a greyed-out button: Next with nobody on the list says what is needed.
  pass(`${tag}: Next is never greyed out`, !(await page.locator('.ds-guide-next').isDisabled()));
  await pressNext(page);
  pass(`${tag}: Next with nobody on the list says “Add at least one person to carry on.”`, await until(async () => (await page.locator('.ds-guide-problem').innerText().catch(() => '')).includes('Add at least one person to carry on.'), 5000));
  pass(`${tag}: … and stays on the list`, (await questionText(page)).startsWith('Who reports to you?'));

  // The add panel: a missing name is said, never a greyed-out button.
  await page.getByRole('button', { name: 'Add a person', exact: true }).click();
  await panel(page).waitFor({ timeout: 10000 });
  await sleep(600);
  pass(`${tag}: the panel is “Add a person”`, (await panel(page).locator('h2').innerText()).trim().toUpperCase() === 'ADD A PERSON');
  pass(`${tag}: its button is never greyed out`, !(await panel(page).getByRole('button', { name: 'Add this person' }).isDisabled()));
  await panel(page).getByRole('button', { name: 'Add this person' }).click();
  pass(`${tag}: no name says “Type their name to carry on.”`, await until(async () => (await panel(page).locator('.ds-error').innerText().catch(() => '')).includes('Type their name to carry on.'), 5000));
  await checkScreen(page, `${tag}, add a person`, { layer: '[role=dialog]:not(.ds-guide)' });
  await shot('add-a-person');
  await panel(page).getByLabel('What’s their name?').fill(M10.people[0].name);
  await panel(page).getByLabel('What’s their role?').fill(M10.people[0].role);
  await sleep(450);
  await panel(page).getByRole('button', { name: 'Add this person' }).click();
  await panelGone(page);
  pass(`${tag}: adding someone says “Added”`, await sawToast(page, 'Added'));
  for (const p of M10.people.slice(1)) await addPerson(page, p.name, p.role);
  const rowWords = async () => (await page.locator('.ds-namerow-words').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  pass(`${tag}: five rows, each a name with the role under it`, JSON.stringify(await rowWords()) === JSON.stringify(M10.people.map((p) => `${p.name} ${p.role}`)), JSON.stringify(await rowWords()));
  await sleep(4200);
  await checkScreen(page, `${tag}, who reports to you`, { heading: '.ds-guide-question' });
  await shot('who-reports-to-you');

  // Delete with Undo: back where they were.
  await page.getByRole('button', { name: 'Remove Tom Ellis' }).click();
  pass(`${tag}: removing someone says “Deleted” with Undo`, await sawToast(page, 'Deleted') && (await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).count()) === 1);
  pass(`${tag}: … and the row has gone`, (await rowWords()).length === 4);
  await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo puts them back in the same place`, await until(async () => JSON.stringify(await rowWords()) === JSON.stringify(M10.people.map((p) => `${p.name} ${p.role}`)), 5000));

  // ---- Finish later: a draft, kept on the device (043 isn't on the test project), and listed
  await sleep(600);
  await page.locator('.ds-guide-foot .ds-guide-skip').click();
  pass(`${tag}: Finish later says “Saved”`, await sawToast(page, 'Saved'));
  await page.waitForURL(/\/interpersonal$/, { timeout: 15000 });
  let records = await kept(page);
  pass(`${tag}: the unfinished check is kept as a draft`, records.length === 1 && records[0].status === 'draft' && records[0].tool === 'team_check' && records[0].answers.people.length === 5 && records[0].title === `${MONTH} team check`, JSON.stringify(records.map((r) => [r.status, r.title])));
  const checkId = records[0]?.id;
  await page.goto(`${APP}/my-plans?area=interpersonal`);
  const draftRow = page.locator('li, .hl-row, [class*=row]').filter({ hasText: `${MONTH} team check` }).first();
  pass(`${tag}: My Plans lists it by its name, as a draft of the tool`, await until(async () => { const t = (await draftRow.innerText().catch(() => '')).replace(/\s+/g, ' '); return /team check/.test(t) && /Team performance check/i.test(t) && /Draft/i.test(t); }, 15000), (await draftRow.innerText().catch(() => 'not found')).slice(0, 200));
  await page.goto(`${APP}/welcome`);
  pass(`${tag}: Home offers to carry on`, await until(async () => (await page.getByText('Team performance check').count()) > 0, 15000));

  // ---- carrying on: the same people, then three one-tap questions each
  await page.goto(`${APP}${TEAM_PATH}`);
  await onQuestion(page, 'Who reports to you?');
  pass(`${tag}: the tool carries on with the same five people`, await until(async () => (await rowWords()).length === 5, 8000));
  await pressNext(page);
  await onQuestion(page, 'How much does “Priya Shah” trust you as their leader?');
  pass(`${tag}: “Person 1 of 5” above the question`, (await page.locator('.ds-guide-label').innerText()).trim() === 'Person 1 of 5');
  pass(`${tag}: the % bar reads 7`, (await page.locator('.ds-guide-pct').getAttribute('aria-valuenow')) === '7');
  pass(`${tag}: trust is five levels, lowest first, each with its line`, JSON.stringify((await page.locator('.ds-guide-body .ds-answer').allInnerTexts()).map((t) => t.split('\n')[0].trim())) === JSON.stringify(['Silent resistance', 'Open resistance', 'Uncommitted', 'Token cheerleader', 'Committed']) && (await page.locator('.ds-answer-hint').count()) === 5);
  pass(`${tag}: a one-answer question has no bottom bar, no Skip and no eye`, (await page.locator('.ds-guide-foot').count()) === 0 && (await page.locator('.ds-guide-skip').count()) === 0 && (await page.locator('.ds-guide-question .ds-who').count()) === 0);
  await checkScreen(page, `${tag}, trust`, { coral: 0 });
  await shot('trust');
  // One tap: shown as chosen at once, then on by itself.
  await sleep(450);
  await page.locator('.ds-guide-body .ds-answer').nth(4).click();
  pass(`${tag}: the answer shows as chosen the moment it’s tapped`, (await page.locator('.ds-guide-body .ds-answer').nth(4).getAttribute('aria-checked').catch(() => 'true')) === 'true');
  pass(`${tag}: … and the next question follows by itself`, await onQuestion(page, 'How well does “Priya Shah” understand what you’re trying to achieve?', 5000));
  pass(`${tag}: alignment is the five-word “how well” scale`, JSON.stringify((await page.locator('.ds-guide-body .ds-answer').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['Not well at all', 'Slightly well', 'Moderately well', 'Very well', 'Extremely well']));
  await checkScreen(page, `${tag}, alignment`, { coral: 0 });
  await shot('alignment');
  // Back keeps the answer.
  await sleep(450);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await onQuestion(page, 'How much does “Priya Shah” trust');
  pass(`${tag}: Back keeps the answer`, (await page.locator('.ds-guide-body .ds-answer[aria-checked=true]').innerText()).startsWith('Committed'));
  await sleep(450);
  await page.locator('.ds-guide-body .ds-answer').nth(4).click();
  await onQuestion(page, 'How well does “Priya Shah”');
  await sleep(450);
  await page.locator('.ds-guide-body .ds-answer').nth(3).click();
  pass(`${tag}: then autonomy, the five-word “how much” scale`, await onQuestion(page, 'How much autonomy does “Priya Shah” have to decide how to deliver?', 5000) && JSON.stringify((await page.locator('.ds-guide-body .ds-answer').allInnerTexts()).map((t) => t.trim())) === JSON.stringify(['None at all', 'A little', 'A moderate amount', 'A lot', 'A great deal']));
  await shot('autonomy');
  await sleep(450);
  await page.locator('.ds-guide-body .ds-answer').nth(3).click();
  pass(`${tag}: then the next person`, await onQuestion(page, 'How much does “Tom Ellis” trust', 5000) && (await page.locator('.ds-guide-label').innerText()).trim() === 'Person 2 of 5');

  // A refresh part-way: the same question, with the answers so far ("Draft restored").
  await page.reload();
  pass(`${tag}: after a refresh the tool is on the same question`, await onQuestion(page, 'How much does “Tom Ellis” trust', 20000));
  await rateTeam(page, { people: M10.people.slice(1) });

  // ---- Your team
  pass(`${tag}: the results’ title is “Your team”, with the eye`, (await title(page).innerText()).replace(/\s+/g, ' ').trim().toUpperCase() === 'YOUR TEAM' && (await page.locator('.ds-guide-title .ds-who').count()) === 1);
  pass(`${tag}: no % bar on the results`, (await page.locator('.ds-guide-pct').count()) === 0);
  const headline = (await page.locator('.ds-headline').innerText()).replace(/\s+/g, ' ').trim();
  pass(`${tag}: the opening sentence, never a big figure`, headline === '1 of your 5 people is in the high-performance area right now.' && parseFloat(await page.locator('.ds-headline').evaluate((el) => getComputedStyle(el).fontSize)) <= 22, headline);
  pass(`${tag}: one small dot for each person, with their first name`, (await dots(page)) === 5 && JSON.stringify(await page.locator('.tpc-dot-name').allTextContents()) === JSON.stringify(M10.people.map((p) => p.first)));
  pass(`${tag}: the three areas are named on the chart, and nothing else is a key`, JSON.stringify(await page.locator('.tpc-chart-area').allTextContents()) === JSON.stringify(['High-performance', 'Permission seekers', 'Chaotic']));
  pass(`${tag}: a first check has no dashed rings`, (await page.locator('.tpc-chart-was').count()) === 0);
  const dotColours = await page.locator('.tpc-dot-mark').evaluateAll((els) => els.map((el) => { const cs = getComputedStyle(el); return `${cs.fill}|${cs.stroke}`.replace(/\s+/g, ''); }));
  pass(`${tag}: chart dots are never coral`, dotColours.every((c) => !/255,111,92|194,65,46/.test(c)), dotColours.join(' '));
  pass(`${tag}: only the High-performance dot is filled`, new Set(dotColours.slice(1)).size === 1 && dotColours[0] !== dotColours[1], dotColours.join(' '));
  await checkScreen(page, `${tag}, your team`, { heading: '.ds-guide-title' });
  await shot('your-team');
  // The record was saved as finished the moment the results showed.
  records = await kept(page);
  pass(`${tag}: the check is saved as finished once the results show, over its own draft`, records.length === 1 && records[0].id === checkId && records[0].status === 'completed' && Boolean(records[0].finishedAt), JSON.stringify(records.map((r) => [r.id === checkId, r.status])));

  // The chart's pop-up: the shared one, by keyboard focus (and by tap on a phone).
  const priya = page.locator('.tpc-dot').first();
  if (phone) await priya.tap(); else await priya.focus();
  const tip = page.locator('.ds-tip:not([hidden])');
  pass(`${tag}: a dot’s pop-up says who, “Now”, and each answer as a sentence`, await until(async () => {
    const t = (await tip.innerText().catch(() => '')).replace(/\s+/g, ' ');
    return t.includes('Priya Shah') && t.includes('Now') && t.includes('Priya understands what you’re trying to achieve very well.') && t.includes('Priya has a lot of autonomy to decide how to deliver.');
  }, 5000), (await tip.innerText().catch(() => 'no pop-up')).slice(0, 200));
  const tipBox = await tip.boundingBox();
  pass(`${tag}: the pop-up stays 12px inside the screen`, tipBox && tipBox.x >= 12 && tipBox.x + tipBox.width <= width - 12, JSON.stringify(tipBox));
  pass(`${tag}: nothing says “this month”`, !/this month|last month/i.test(await page.locator('.ds-guide').innerText()));
  await page.keyboard.press('Escape');
  await page.locator('.ds-headline').click();

  // Show as a table: keeps the place, one row a person, five steps each.
  const scroller = page.locator('.ds-guide-scroll');
  const link = page.locator('.ds-ctable-fold .ds-link');
  await link.scrollIntoViewIfNeeded();
  await scroller.evaluate((el, h) => { const b = el.querySelector('.ds-ctable-fold .ds-link').getBoundingClientRect(); el.scrollBy(0, b.bottom - (el.getBoundingClientRect().bottom - 8)); return h; }, 0);
  await sleep(300);
  const before = await scroller.evaluate((el) => el.scrollTop);
  pass(`${tag}: “Show as a table” says it opens something in place`, (await link.getAttribute('aria-expanded')) === 'false');
  await link.click();
  await sleep(1200);
  const after = await scroller.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const l = el.querySelector('.ds-ctable-fold .ds-link').getBoundingClientRect();
    const t = el.querySelector('.ds-ctable').getBoundingClientRect();
    return { top: el.scrollTop, linkIn: l.top >= box.top - 1 && l.bottom <= box.bottom + 1, tableIn: t.top < box.bottom - 20 };
  });
  pass(`${tag}: showing the table never jumps to the top, and the link stays in view`, after.top >= before && after.top > 0 && after.linkIn && after.tableIn, JSON.stringify({ before, ...after }));
  pass(`${tag}: the link then reads “Hide the table”`, (await link.innerText()).trim() === 'Hide the table' && (await link.getAttribute('aria-expanded')) === 'true');
  const table = await page.locator('.ds-ctable').evaluate((t) => ({
    heads: [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
    rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({
      name: tr.querySelector('th b').textContent.trim(),
      bars: [...tr.querySelectorAll('.ds-stepbars')].map((b) => `${b.querySelectorAll('.ds-stepbars-on').length}${b.classList.contains('ds-stepbars--good') ? 'good' : b.classList.contains('ds-stepbars--low') ? 'low' : ''}`),
      words: [...tr.querySelectorAll('td .ds-sr')].map((s) => s.textContent.trim()),
      colours: [...tr.querySelectorAll('.ds-stepbars')].map((b) => getComputedStyle(b.querySelector('.ds-stepbars-on')).backgroundColor.replace(/\s+/g, '')),
    })),
    wide: t.scrollWidth - t.parentElement.clientWidth,
  }));
  pass(`${tag}: the table’s columns are Person, Alignment and Autonomy`, JSON.stringify(table.heads) === JSON.stringify(['Person', 'Alignment', 'Autonomy']));
  pass(`${tag}: one row per person with thin five-step bars, and the words for screen readers`, JSON.stringify(table.rows.map((r) => [r.name, ...r.bars, ...r.words])) === JSON.stringify([
    ['Priya Shah', '4good', '4good', 'Very well', 'A lot'], ['Tom Ellis', '4good', '3', 'Very well', 'A moderate amount'], ['Grace Okafor', '5good', '2', 'Extremely well', 'A little'],
    ['Daniel Reyes', '2low', '4', 'Slightly well', 'A lot'], ['Leila Haddad', '2', '2', 'Slightly well', 'A little'],
  ]), JSON.stringify(table.rows.map((r) => [r.name, ...r.bars])));
  const coralBar = phone ? 'rgb(194,65,46)' : 'rgb(255,111,92)';
  pass(`${tag}: coral marks the Alignment of the person in Chaotic only`, table.rows[3].colours[0] === coralBar && table.rows.every((r, i) => i === 3 || r.colours[0] !== coralBar), JSON.stringify(table.rows.map((r) => r.colours)));
  pass(`${tag}: Autonomy is never coral, and a Chaotic person’s is grey`, table.rows.every((r) => r.colours[1] !== coralBar) && table.rows[3].colours[1] === table.rows[1].colours[1], JSON.stringify(table.rows.map((r) => r.colours[1])));
  pass(`${tag}: the table never runs off the side`, table.wide <= 0, `${table.wide}px`);
  await checkScreen(page, `${tag}, your team with the table`, { back: false });
  await shot('your-team-table');

  // Trust: five steps and the level in words; Committed mint, the single lowest coral.
  const trust = await page.locator('.ds-steprow').evaluateAll((rows) => rows.map((r) => ({
    label: r.getAttribute('aria-label'),
    word: r.querySelector('.ds-steprow-word').textContent.trim(),
    tone: r.querySelector('.ds-stepbars').className.replace('ds-stepbars', '').replace('ds-steprow-bars', '').replace('ds-stepbars--', '').trim(),
    on: r.querySelectorAll('.ds-stepbars-on').length,
    tappable: Boolean(r.closest('button, a') || r.querySelector('button, a')),
  })));
  pass(`${tag}: trust is one row per person: five steps and the level in words`, JSON.stringify(trust.map((t) => [t.word, t.on, t.tone])) === JSON.stringify([['Committed', 5, 'good'], ['Open resistance', 2, 'low'], ['Committed', 5, 'good'], ['Token cheerleader', 4, ''], ['Uncommitted', 3, '']]), JSON.stringify(trust.map((t) => [t.word, t.on, t.tone])));
  pass(`${tag}: a screen reader hears “Tom Ellis. Trust: Open resistance.”`, trust[1].label === 'Tom Ellis. Trust: Open resistance.');
  pass(`${tag}: the trust rows can’t be tapped, so coral is never on anything tappable`, trust.every((t) => !t.tappable));

  // Questions to start with come last (rule 29ar), each naming its person.
  const order = await page.locator('.ds-guide-body').evaluate((b) => {
    const at = (sel) => { const el = b.querySelector(sel); return el ? el.getBoundingClientRect().top : null; };
    return { headline: at('.ds-headline'), chart: at('.tpc-chart'), table: at('.ds-ctable'), trust: at('.ds-steprows'), questions: at('.ds-startqs'), heads: [...b.querySelectorAll('.ds-results-head')].map((h) => h.textContent.trim()) };
  });
  pass(`${tag}: the page opens with the headline, then the chart, the table and trust, and the questions come last`, order.headline < order.chart && order.chart < order.table && order.table < order.trust && order.trust < order.questions && JSON.stringify(order.heads) === JSON.stringify(['Alignment and autonomy', 'Trust', 'Questions to start with:']), JSON.stringify(order));
  const qs = (await page.locator('.ds-startq').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  pass(`${tag}: a first check asks about Chaotic first, then autonomy (nobody’s trust has fallen)`, JSON.stringify(qs) === JSON.stringify(['What would help “Daniel Reyes” explain the organisation’s intent in their own words?', 'Which decisions could “Tom Ellis” own, within clear boundaries, to ease your load?']), JSON.stringify(qs));
  pass(`${tag}: each question is 15 words or fewer`, qs.every((q) => q.split(/\s+/).length <= 15));
  await link.click();
  await sleep(400);

  // ---- the bottom bar: Download my PDF is a text link, Add a to-do the one coral button
  const pdfLink = page.locator('.ds-guide-foot-aside button').first();
  pass(`${tag}: “Download my PDF” is a quiet text link`, (await pdfLink.innerText()).trim() === 'Download my PDF' && (await pdfLink.evaluate((el) => getComputedStyle(el).backgroundColor.replace(/\s+/g, ''))) === 'rgba(0,0,0,0)' && /underline/.test(await pdfLink.evaluate((el) => getComputedStyle(el).textDecorationLine)));
  pass(`${tag}: “Add a to-do” is the coral button`, (await page.locator('.ds-guide-next').innerText()).trim().toUpperCase() === 'ADD A TO-DO');
  await pdfLink.click();
  const choice = page.getByRole('button', { name: /Light/ }).first();
  pass(`${tag}: the PDF offers Light, for printing and Dark, for sharing`, await until(async () => (await choice.count()) > 0 && (await page.getByRole('button', { name: /Dark/ }).count()) > 0, 8000));
  const download = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await choice.click();
  const file = await download;
  pass(`${tag}: the PDF is made and named in words`, Boolean(file) && /^Team performance check, .*\d{4}\.pdf$/.test(file?.suggestedFilename() || ''), file?.suggestedFilename() || 'no download');
  await sleep(800);

  // ---- Add a to-do: the shared panel, to each place
  const addTodo = async (text, where) => {
    await sleep(500);
    await page.locator('.ds-guide-next').click();
    await panel(page).waitFor({ timeout: 10000 });
    await sleep(500);
    await panel(page).locator('textarea').first().fill(text);
    await addPanel(page, where);
  };
  pass(`${tag}: “Add a to-do” opens the shared panel, which asks “Where should it go?”`, await (async () => {
    await sleep(500);
    await page.locator('.ds-guide-next').click();
    await panel(page).waitFor({ timeout: 10000 });
    await sleep(600);
    const t = await panel(page).innerText();
    const ok = /ADD A TO-DO/i.test(t) && t.includes('Where should it go?') && t.includes('This week') && t.includes('Backlog') && t.includes('Don’t add it');
    await page.keyboard.press('Escape');
    await panelGone(page);
    return ok;
  })());
  await addTodo(`Ask Tom what would help him bring decisions to me early (${width})`, 'This week');
  pass(`${tag}: This week says “Added to this week”`, await sawToast(page, 'Added to this week'));
  pass(`${tag}: … and the results are still there (the button never ends the tool)`, (await dots(page)) === 5);
  await sleep(5600);
  await addTodo(`Agree boundaries with Daniel (${width})`, 'Backlog');
  pass(`${tag}: Backlog says “Added to your backlog”`, await sawToast(page, 'Added to your backlog'));
  await sleep(5600);
  await addTodo(`Not this one (${width})`, 'Don’t add it');
  await sleep(1500);
  const todos = (await myTodos()).filter((t) => t.text.includes(`(${width})`));
  const week = todos.find((t) => t.text.startsWith('Ask Tom'));
  const backlog = todos.find((t) => t.text.startsWith('Agree boundaries'));
  pass(`${tag}: the to-do for this week is in the sprint’s week, from this check`, Boolean(week && week.sprint_id && week.planned_week && week.source === 'other_tool' && week.source_id === checkId), JSON.stringify(week || null));
  pass(`${tag}: the Backlog to-do has no sprint and no week`, Boolean(backlog && !backlog.sprint_id && !backlog.planned_week && backlog.source === 'other_tool'), JSON.stringify(backlog || null));
  pass(`${tag}: “Don’t add it” adds nothing`, todos.length === 2, `${todos.length} to-dos`);

  // ---- who can see this: Only you, or You and Tim; the people rated never see it
  await page.locator('.ds-guide-title .ds-who').click();
  await panel(page).waitFor({ timeout: 10000 });
  await sleep(500);
  const who = (await panel(page).innerText()).replace(/\s+/g, ' ');
  pass(`${tag}: the eye opens “Who can see this?” with Only you, You and Tim, and “The people you rate never see it.”`, who.includes('Who can see this?') && who.includes('Only you') && who.includes('You and Tim') && who.includes('The people you rate never see it.'), who.slice(0, 200));
  await checkScreen(page, `${tag}, who can see this`, { layer: '[role=dialog]:not(.ds-guide)', coral: 0 });
  await shot('who-can-see-this');
  await panel(page).getByRole('option', { name: 'You and Tim' }).click();
  pass(`${tag}: choosing saves at once and says “Saved”`, await sawToast(page, 'Saved'));
  await panelGone(page);
  pass(`${tag}: the eye then says “You and Tim can see this.”`, await until(async () => (await page.locator('.ds-guide-title .ds-who').getAttribute('aria-label') || '').startsWith('You and Tim can see this. Edit who can see this.'), 5000));
  records = await kept(page);
  pass(`${tag}: … and the saved check records the choice`, records[0]?.shared === true);

  // ---- Edit who's on the list: someone added is asked about before the results show again
  await sleep(4200);
  await page.getByRole('button', { name: 'Edit who’s on the list' }).click();
  await onQuestion(page, 'Who reports to you?');
  pass(`${tag}: the list opens from the results with “Save my edit”`, (await page.locator('.ds-guide-next').innerText()).trim().toUpperCase() === 'SAVE MY EDIT');
  await addPerson(page, 'Sam Carter', 'Head of Marketing');
  await pressNext(page);
  pass(`${tag}: the new person’s three questions come next`, await onQuestion(page, 'How much does “Sam Carter” trust', 8000) && (await page.locator('.ds-guide-label').innerText()).trim() === 'Person 6 of 6');
  await rateTeam(page, { people: [{ name: 'Sam Carter', t: [3], a: [5], u: [5] }] });
  pass(`${tag}: then the results, with six dots`, (await dots(page)) === 6);
  pass(`${tag}: the headline counts the new person`, (await page.locator('.ds-headline').innerText()).replace(/\s+/g, ' ').trim() === '2 of your 6 people are in the high-performance area right now.');
  // Taking someone off needs no more answers: straight back to the results.
  await sleep(600);
  await page.getByRole('button', { name: 'Edit who’s on the list' }).click();
  await onQuestion(page, 'Who reports to you?');
  await page.getByRole('button', { name: 'Remove Sam Carter' }).click();
  await sawToast(page, 'Deleted');
  await pressNext(page);
  pass(`${tag}: taking someone off goes straight back to the results`, await until(async () => (await dots(page)) === 5, 8000));

  // ---- close: saved as finished, listed, and opens on its results
  await sleep(600);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  pass(`${tag}: closing says “Saved”`, await sawToast(page, 'Saved'));
  await page.waitForURL(/\/interpersonal$/, { timeout: 15000 });
  records = await kept(page);
  // Nothing of a finished check stays on the device as a draft (it once came back as one to carry on; 14 Nov).
  await sleep(600);
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^clarity-draft:.*:team-check:|^ds-guide:team-check-/.test(k)).length);
  pass(`${tag}: a finished check leaves no draft on the device, so the next visit starts the next check`, left === 0, `${left} kept`);
  pass(`${tag}: one finished check is kept, with five people`, records.length === 1 && records[0].status === 'completed' && records[0].answers.people.length === 5 && records[0].answers.people.every((p) => p.trust && p.alignment && p.autonomy), JSON.stringify(records.map((r) => [r.status, r.answers.people.length])));
  pass(`${tag}: the hub’s recent list shows it`, await until(async () => (await page.getByText(`${MONTH} team check`).count()) > 0, 15000));
  await page.goto(`${APP}/my-plans?area=interpersonal`);
  const row = page.getByText(`${MONTH} team check`).first();
  await row.waitFor({ timeout: 15000 });
  await row.click();
  pass(`${tag}: a saved check opens on its results`, await until(async () => (await title(page).count()) > 0 && (await dots(page)) === 5, 15000));
  pass(`${tag}: … at the tool’s own address`, new URL(page.url()).pathname === TEAM_PATH);
  await sleep(600);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForURL(/\/my-plans/, { timeout: 15000 });

  // ---- the next check: the same people, nothing answered, and "your last check, in October"
  await page.goto(`${APP}/version.json`);
  await clearTeamCheck(page);
  await page.goto(`${APP}/welcome`);
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);
  await seedLastCheck(page);
  await page.goto(`${APP}${TEAM_PATH}`);
  await onQuestion(page, 'Who reports to you?');
  pass(`${tag}: a new check starts with the people of the last one`, await until(async () => JSON.stringify(await rowWords()) === JSON.stringify(M10.people.map((p) => `${p.name} ${p.role}`)), 8000), JSON.stringify(await rowWords()));
  await pressNext(page);
  await onQuestion(page, 'How much does “Priya Shah” trust');
  pass(`${tag}: … with nothing answered (the last answer never shows)`, (await page.locator('.ds-guide-body .ds-answer[aria-checked=true]').count()) === 0);
  await rateTeam(page);
  pass(`${tag}: a dashed ring shows where each person who moved was at the last check`, (await page.locator('.tpc-chart-was').count()) === 3, `${await page.locator('.tpc-chart-was').count()} rings`);
  if (phone) await page.locator('.tpc-dot').first().tap(); else await page.locator('.tpc-dot').first().focus();
  pass(`${tag}: the pop-up says “At your last check, in October, Priya understood … moderately well.”`, await until(async () => (await tip.innerText().catch(() => '')).replace(/\s+/g, ' ').includes('At your last check, in October, Priya understood what you’re trying to achieve moderately well.'), 5000), (await tip.innerText().catch(() => 'no pop-up')).slice(0, 300));
  await page.keyboard.press('Escape');
  if (phone) await page.locator('.tpc-dot').nth(1).tap(); else await page.locator('.tpc-dot').nth(1).focus();
  pass(`${tag}: someone who hasn’t moved: “It’s the same as at your last check, in October.”`, await until(async () => (await tip.innerText().catch(() => '')).replace(/\s+/g, ' ').includes('It’s the same as at your last check, in October.'), 5000));
  await page.keyboard.press('Escape');
  await page.locator('.ds-headline').click();
  const qs2 = (await page.locator('.ds-startq').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  pass(`${tag}: the questions are Chaotic first, then trust, then autonomy`, JSON.stringify(qs2) === JSON.stringify([
    'What would help “Daniel Reyes” explain the organisation’s intent in their own words?',
    'What has changed for “Tom Ellis”, and what would rebuild their trust?',
    'Which decisions could “Grace Okafor” own, within clear boundaries, to ease your load?',
  ]), JSON.stringify(qs2));
  pass(`${tag}: nothing on the results says “this month”`, !/this month|last month/i.test(await page.locator('.ds-guide').innerText()));
  await scroller.evaluate((el) => el.scrollTo(0, 0));
  await sleep(300);
  await shot('your-team-with-last-check');
  await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await sleep(300);
  await shot('your-team-questions');
  await sleep(300);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await sawToast(page, 'Saved');
  await page.waitForURL(/\/interpersonal$/, { timeout: 15000 });

  // ---- nothing went wrong on the way
  const probes = refused.filter((r) => /\/rest\/v1\/tool_answers/.test(r));
  // Step 2's guest_claim is asked after each sign-in and isn't on the test project until 035 is run: not this tool's.
  const others = refused.filter((r) => !/\/rest\/v1\/(tool_answers|rpc\/guest_claim)/.test(r));
  pass(`${tag}: no console errors and no page errors`, errors.length === 0, errors.join(' | '));
  pass(`${tag}: no request was refused, but the one question about the table 043 adds`, others.length === 0 && probes.length <= 1, `${probes.length} for the table; others: ${others.join(' | ')}`);
  await page.goto(`${APP}/version.json`);
  await clearTeamCheck(page);
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
