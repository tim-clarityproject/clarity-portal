// Peak moments (M18, version 28; Phase 8b part A), the flows: signed in as
// the invented test client on the TEST database, on the fixed day
// (tests/phase2/fixed-day.mjs: the seed's running sprint is built round it
// and the browser's clock starts on it), at 1440 and 400 wide. Every other
// host and every email call is blocked.
//
// Migration 048 isn't on the test project yet, so peak moments live on the
// device, as the app keeps them until it is (src/lib/peakMoments/store.js):
// the test reads and clears that copy. The lead-up to-do is a real todos row
// ('other_tool' until 048, its source_id the moment), deleted at the end.
// That a coach can't read a personal moment that isn't shared is proved at
// the database by supabase/048_peak_moments_and_travel_test.sql.
//
//   node --import ./tests/scores/register.mjs tests/phase8/peak-moments.mjs [folder for screenshots]
//   SIZES=1440,400   to run one width
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP, block, clientDb, pressNext, readEnv, signIn, sleep, until } from './shared.mjs';
import { FIXED_TODAY, fixClock, fixedLabel, seedFixed, seedForReal } from '../phase2/fixed-day.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-peak');
mkdirSync(out, { recursive: true });
const SIZES = process.env.SIZES ? process.env.SIZES.split(',').map(Number) : [1440, 400];

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`);
};

const env = readEnv();
const { db, me } = await clientDb(env);
const today = FIXED_TODAY;
const dayKey = (n) => {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const DEVICE = `clarity-peak-moments-local:${me}`;
console.log(`Fixed day: ${fixedLabel()}`);

seedFixed('--reset');
const sprint = (await db.from('sprints').select('id, start_on, length_weeks').eq('user_id', me).eq('status', 'running').single()).data;

// Five moments in the sprint: two on the same day, one repeating monthly,
// one in New York, and one yesterday, to review the day after.
const MOMENTS = [
  { name: 'Cup final', area: 'It’s for work', kind: 'I need to perform at my best', on: dayKey(2) },
  { name: 'Board away-day', area: 'It’s for work', kind: 'I need to perform at my best', on: dayKey(2) },
  { name: 'Monthly board meeting', area: 'It’s for work', kind: 'I need to perform at my best', on: dayKey(6), repeat: 'A set day each month' },
  { name: 'Mum’s 70th', area: 'It’s for my personal life', kind: 'I want to be fully present', on: dayKey(10), city: 'New York' },
  { name: 'Investor call', area: 'It’s for work', kind: 'I need to perform at my best', on: dayKey(-1) },
];

const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await page.locator('.ds-toast', { hasText: words }).count()) > 0 || (await toastText(page)).includes(words), ms);
const qText = (page) => page.locator('.ds-guide-question, .ds-guide-title').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const onQ = (page, starts, ms = 10000) => until(async () => (await qText(page)).startsWith(starts), ms);
const answer = (page, words) => page.locator('.ds-guide-body .ds-answer', { hasText: words }).first().click();
const device = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DEVICE);
const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
const overlaps = (boxes) => {
  const out2 = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1) out2.push(`${i}+${j}`);
    }
  }
  return out2;
};

async function pickDay(page, label, key) {
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await page.locator('.ds-cal-grid').waitFor({ timeout: 8000 });
  for (let i = 0; i < 3 && !(await page.locator(`.ds-cal-day[data-key="${key}"]`).count()); i += 1) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page.locator(`.ds-cal-day[data-key="${key}"]`).click();
  await until(async () => (await page.locator('.ds-cal-grid').count()) === 0, 4000);
}

async function addMoment(page, tag, x, { checks = false } = {}) {
  await page.goto(`${APP}/peak-moments/add`);
  await onQ(page, 'What is it called?', 20000);
  if (checks) {
    pass(`${tag}: Add opens on the name, with the eye`, (await page.locator('.ds-guide-question .ds-who').count()) === 1);
    await pressNext(page);
    pass(`${tag}: an empty name says “Type its name to carry on.”, never a greyed-out button`, await until(async () => (await page.locator('.ds-guide-problem').innerText().catch(() => '')).includes('Type its name to carry on.')) && !(await page.locator('.ds-guide-next').isDisabled()));
  }
  await page.locator('.ds-guide-body .ds-text').first().fill(x.name);
  await pressNext(page);
  await onQ(page, 'Is it for work or your personal life?');
  if (checks) pass(`${tag}: a one-tap screen has no Next`, (await page.locator('.ds-guide-next').count()) === 0);
  await sleep(450);
  await answer(page, x.area);
  await onQ(page, 'What do you need from it?');
  await sleep(450);
  await answer(page, x.kind);
  await onQ(page, 'When is it?');
  if (checks) {
    await pressNext(page);
    pass(`${tag}: no day yet says “Choose its day to carry on.”`, await until(async () => (await page.locator('.ds-guide-problem').innerText().catch(() => '')).includes('Choose its day to carry on.')));
  }
  await pickDay(page, 'Which day', x.on);
  await pressNext(page);
  await onQ(page, 'Where is it?');
  if (checks) pass(`${tag}: “It’s at home” is already chosen`, (await page.locator('.ds-guide-body .ds-answer', { hasText: 'It’s at home' }).getAttribute('aria-checked').catch(() => null)) === 'true' || (await page.locator('.ds-guide-body [aria-checked=true]', { hasText: 'It’s at home' }).count()) === 1);
  await sleep(450);
  if (x.city) {
    await page.getByRole('searchbox', { name: 'Search for its city' }).fill(x.city.slice(0, 5));
    await until(async () => (await page.locator('.ds-guide-body .ds-answer', { hasText: x.city }).count()) > 0, 5000);
    const t0 = Date.now();
    await answer(page, x.city);
    await onQ(page, 'Does it repeat?');
    if (checks) pass(`${tag}: choosing a city moves on by itself`, Date.now() - t0 < 3000);
  } else {
    await answer(page, 'It’s at home');
    await onQ(page, 'Does it repeat?');
  }
  if (x.repeat) await answer(page, x.repeat);
  await pressNext(page);
  await onQ(page, 'Your peak moment');
}

async function signedIn(browser, width) {
  const phone = width < 600;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark', hasTouch: phone, isMobile: phone });
  await fixClock(ctx);
  await block(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await signIn(page, env);
  await page.evaluate((k) => localStorage.removeItem(k), DEVICE);
  await cleanMoments();
  return { ctx, page, errors };
}

// Since 048 ran on the test project (18 Nov) the moments this test adds reach
// the database: only those (by their names), their reviews first.
async function cleanMoments() {
  const names = MOMENTS.map((x) => x.name);
  const { data, error } = await db.from('peak_moments').select('id').eq('user_id', me).in('name', names);
  if (error) { if (/402|read.?only/i.test(`${error.code} ${error.message}`)) throw new Error('The test project answered 402 or read-only: stopped.'); return; }
  const ids = (data || []).map((r) => r.id);
  if (!ids.length) return;
  await db.from('peak_reviews').delete().eq('user_id', me).in('moment_id', ids);
  await db.from('peak_moments').delete().eq('user_id', me).in('id', ids);
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
const madeTodos = new Set();
// Only what this test made on the fixed day: the lead-up to-dos and the day's plan and review rows.
async function cleanDay() {
  for (const id of madeTodos) await db.from('todos').delete().eq('id', id).eq('user_id', me);
  await db.from('todos').delete().eq('user_id', me).in('source', ['other_tool', 'peak_moment']).eq('text', 'I’ll be in bed by 22:30');
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
  await db.from('day_reviews').delete().eq('user_id', me).eq('local_date', today);
}
try {
  for (const width of SIZES) {
    const tag = `${width}px`;
    const { ctx, page, errors } = await signedIn(browser, width);
    try {

    // ---- The empty page: the calm card, the quiet link and its side panel
    await page.goto(`${APP}/peak-moments`);
    await page.waitForSelector('.peak-page h1', { timeout: 20000 });
    pass(`${tag}: the title is Peak moments, with the eye and no ⓘ`, /peak moments/i.test(await page.locator('h1').innerText()) && (await page.locator('h1 .ds-who').count()) === 1 && (await page.locator('h1 .ds-help-toggle, h1 .ds-term-info').count()) === 0);
    pass(`${tag}: with none, the calm card asks one question`, (await page.locator('.peak-calm .ds-empty-title').innerText()).trim() === 'When do you next need to be at your best?');
    pass(`${tag}: “Add my first peak moment” with ~1 minute`, (await page.getByRole('button', { name: 'Add my first peak moment' }).count()) === 1 && (await page.locator('.peak-calm').innerText()).includes('~1 minute'));
    await page.getByRole('button', { name: 'What’s a peak moment?' }).click();
    const panel = page.locator('[role=dialog]').last();
    await panel.waitFor();
    const words = (await panel.innerText()).replace(/\s+/g, ' ');
    pass(`${tag}: “What’s a peak moment?” opens the side panel with the term and its meaning`, words.includes('Peak moment') && words.includes('A moment that needs more of your energy, attention and focus, because of its cognitive, physical or social demands.'), words);
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator('[role=dialog]').count()) === 0, 4000);

    // ---- Adding them (all five through the tool at the first width; one at the others)
    const toAdd = width === SIZES[0] ? MOMENTS : [MOMENTS[3]];
    if (width !== SIZES[0]) {
      // The other four go straight onto the device, as the tool keeps them.
      await page.evaluate(({ k, list }) => {
        const moments = {};
        list.forEach((x, i) => {
          const id = `0000000${i}-0000-4000-8000-00000000000${i}`;
          moments[id] = { id, name: x.name, area: x.area.includes('work') ? 'work' : 'personal', kind: x.kind.includes('present') ? 'present' : 'perform', startsOn: x.on, endsOn: x.on, placeCity: null, placeZone: null, repeat: x.repeat ? { every: 'month_weekday' } : null, lesson: '', shared: false, sent: false };
        });
        localStorage.setItem(k, JSON.stringify({ moments, reviews: {}, leadUps: {}, shareWork: false }));
      }, { k: DEVICE, list: MOMENTS.filter((_, i) => i !== 3) });
    }
    for (const [i, x] of toAdd.entries()) {
      await addMoment(page, tag, x, { checks: i === 0 || x.city });
      if (x.city) {
        const rows = (await page.locator('.ds-guide-plan-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        pass(`${tag}: the summary has one line per answer`, rows.length === 6 && rows.some((r) => r.includes('Where') && r.includes('New York')) && rows.some((r) => r.includes('It’s for my personal life')), rows.join(' | '));
        // Edit one answer from the summary: just that question, then back.
        await page.locator('.ds-guide-plan-row', { hasText: 'When' }).click();
        await onQ(page, 'When is it?');
        pass(`${tag}: Edit opens just that question, with “Save my edit”`, /^save my edit$/i.test((await page.locator('.ds-guide-next').innerText()).trim()));
        await pickDay(page, 'Which day', dayKey(11));
        await pressNext(page);
        await onQ(page, 'Your peak moment');
        pass(`${tag}: “Save my edit” goes straight back to the summary with the new day`, (await page.locator('.ds-guide-plan-row', { hasText: 'When' }).innerText()).includes(String(Number(dayKey(11).slice(8)))));
        x.on = dayKey(11);
      }
      await pressNext(page);
      pass(`${tag}: “${x.name}” saves with “It’s in your peak moments”`, Boolean(await sawToast(page, 'It’s in your peak moments')));
      await page.waitForURL(/\/peak-moments$/, { timeout: 10000 });
    }
    const kept = await device(page);
    const saved = Object.values(kept?.moments || {});
    pass(`${tag}: all five are kept (on the device until 048 runs)`, saved.length === 5, saved.length);
    pass(`${tag}: the personal one is never shared`, saved.filter((m) => m.area === 'personal').every((m) => m.shared === false));
    pass(`${tag}: the monthly one is kept as a rule`, saved.some((m) => m.repeat?.every === 'month_weekday'));
    pass(`${tag}: New York is kept with its time zone`, saved.some((m) => m.placeCity === 'New York' && m.placeZone === 'America/New_York'));

    // ---- The list: Coming up in date order, then Past
    await page.goto(`${APP}/peak-moments`);
    await page.waitForSelector('.ds-peak-list');
    const coming = (await page.locator('.peak-section').first().locator('.ds-peak-name').allInnerTexts()).map((t) => t.trim());
    pass(`${tag}: Coming up lists them in date order`, JSON.stringify(coming) === JSON.stringify(['Board away-day', 'Cup final', 'Monthly board meeting', 'Mum’s 70th']), coming.join(' | '));
    const pastNames = (await page.locator('.peak-section').nth(1).locator('.ds-peak-name').allInnerTexts().catch(() => [])).map((t) => t.trim());
    pass(`${tag}: yesterday’s is under Past`, pastNames.includes('Investor call'), pastNames.join(' | '));
    pass(`${tag}: one add button`, (await page.getByRole('button', { name: 'Add a peak moment' }).count()) === 1);
    pass(`${tag}: no sideways scroll on the list`, await noSideScroll(page));
    await page.screenshot({ path: join(out, `list-${width}.png`), fullPage: true });

    // ---- The sprint page: rings on the week bars
    await page.goto(`${APP}/performance-sprint`);
    await page.waitForSelector('.ds-peakbars-svg', { timeout: 20000 });
    const rings = page.locator('.ds-peakbars-pk');
    await page.locator('.ds-peakbars-svg').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    const ringBoxes = [];
    for (let i = 0; i < await rings.count(); i += 1) ringBoxes.push(await rings.nth(i).boundingBox());
    const labels = await rings.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    pass(`${tag}: one ring for each week with a peak moment`, ringBoxes.length >= 2 && labels.some((l) => /^\d+ peak moments in week \d+$/.test(l)), labels.join(' | '));
    pass(`${tag}: the rings never overlap`, overlaps(ringBoxes).length === 0, overlaps(ringBoxes).join(', '));
    const counts = await page.locator('.ds-peakbars-count').allTextContents();
    pass(`${tag}: two or more in a week show as one ring with the number`, counts.length > 0 && counts.every((c) => Number(c) >= 2), counts.join(','));
    const svgBox = await page.locator('.ds-peakbars-svg').boundingBox();
    pass(`${tag}: every ring’s tap area reaches 44px`, (25 * 2 * svgBox.width) / 300 >= 44, svgBox.width);
    // Tap the first ring: it fills and its moments list under the chart.
    const first = ringBoxes[0];
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    const detail = await until(async () => (await page.locator('.ds-peakbars-detail').innerText().catch(() => '')).trim(), 4000);
    pass(`${tag}: tapping a ring lists that week’s moments under the chart`, Boolean(detail) && (await rings.first().getAttribute('aria-pressed')) === 'true', detail);
    pass(`${tag}: no pop-up and no focus box on a tap`, (await page.locator('.ds-chart-tip:visible, [role=tooltip]:visible').count()) === 0 && await page.evaluate(() => !document.activeElement?.matches?.(':focus-visible') || !document.activeElement.classList.contains('ds-peakbars-pk')));
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    pass(`${tag}: tapping again closes it`, await until(async () => (await page.locator('.ds-peakbars-detail').count()) === 0, 3000));
    // The nearer ring wins where tap areas overlap: 8 drawing units to the right of the first ring.
    if (ringBoxes.length >= 2) {
      const unit = svgBox.width / 300;
      const cx = first.x + first.width / 2;
      const nextCx = ringBoxes[1].x + ringBoxes[1].width / 2;
      const towards = nextCx > cx ? 1 : -1;
      const gap = Math.abs(nextCx - cx);
      // Halfway minus a little: inside both tap areas when they overlap, nearer the first.
      const at = Math.min(8 * unit, gap / 2 - 2);
      await page.mouse.click(cx + towards * at, first.y + first.height / 2);
      const opened = await until(async () => rings.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-pressed') === 'true')), 3000);
      pass(`${tag}: where tap areas overlap, the nearer ring wins`, opened === 0, opened);
      await page.mouse.click(cx + towards * at, first.y + first.height / 2);
    }
    // Keyboard: focus shows the coral ring, Enter opens it.
    await rings.first().focus();
    await page.keyboard.press('Enter');
    pass(`${tag}: Enter opens a ring from the keyboard`, (await rings.first().getAttribute('aria-pressed')) === 'true');
    await page.keyboard.press('Enter');
    pass(`${tag}: Peak moments in this sprint lists them`, (await page.locator('.peak-sprint .ds-peak-name').count()) >= 5);
    pass(`${tag}: no sideways scroll on the sprint page`, await noSideScroll(page));
    await page.screenshot({ path: join(out, `sprint-${width}.png`), fullPage: true });

    // ---- View your year: by month, nothing overlapping
    await page.goto(`${APP}/performance-sprint/year`);
    await page.waitForSelector('.ds-peak-year', { timeout: 20000 });
    const yearText = (await page.locator('.ds-peak-year').innerText()).replace(/\s+/g, ' ');
    pass(`${tag}: View your year lists every moment under its month`, ['Cup final', 'Board away-day', 'Monthly board meeting', 'Mum’s 70th', 'Investor call'].every((n) => yearText.includes(n)), yearText.slice(0, 300));
    pass(`${tag}: each month says the sprint it falls in`, /Sprint \d+/.test(yearText));
    const lineBoxes = await page.locator('.ds-peak-mon p, .ds-peak-mon h3').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
    pass(`${tag}: nothing in View your year overlaps`, overlaps(lineBoxes).length === 0, overlaps(lineBoxes).join(', '));
    pass(`${tag}: no sideways scroll on View your year`, await noSideScroll(page));
    await page.screenshot({ path: join(out, `year-${width}.png`), fullPage: true });

    // ---- Daily plan: one question, straight after Sleep, for the nearer moment
    await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/day-plan/.test(k)) localStorage.removeItem(k); });
    await page.goto(`${APP}/daily-plan`);
    await onQ(page, 'How did you sleep last night?', 20000);
    await pressNext(page);
    const asked = await onQ(page, 'What will you do today to protect your energy for “Board away-day”?');
    pass(`${tag}: Daily plan asks about the nearer moment straight after Sleep (two on one day: one question)`, Boolean(asked), await qText(page));
    pass(`${tag}: the small line counts down in days to go`, (await page.locator('.ds-guide-label').innerText()).includes('Board away-day, 2 days to go'));
    pass(`${tag}: full-sentence suggestions`, (await page.locator('.peak-chips .ds-chip').allInnerTexts()).includes('I’ll be in bed by 22:30'));
    await page.locator('.peak-chips .ds-chip', { hasText: 'I’ll be in bed by 22:30' }).click();
    await pressNext(page);
    await onQ(page, 'What’s one thing you’re grateful for today?');
    pass(`${tag}: only one lead-up question that day`, (await qText(page)).startsWith('What’s one thing'));
    const todo = await until(async () => (await db.from('todos').select('id, text, source, source_id').eq('user_id', me).eq('text', 'I’ll be in bed by 22:30').is('deleted_at', null)).data?.[0], 10000);
    if (todo) madeTodos.add(todo.id);
    pass(`${tag}: the answer becomes one of today’s to-dos (peak_moment now 048 is there, with the moment as its source)`, todo?.source === 'peak_moment' && Boolean(todo?.source_id), JSON.stringify(todo));
    await page.locator('.ds-guide-close').click();
    await sleep(800);

    // ---- Daily review: "Did you do it?" in one tap
    await page.goto(`${APP}/daily-review`);
    await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
    await pressNext(page);
    const did = await onQ(page, 'Did you do it?');
    pass(`${tag}: Daily review asks “Did you do it?”`, Boolean(did), await qText(page));
    if (did) {
      await sleep(450);
      await answer(page, 'I did it');
      const ticked = await until(async () => (await db.from('todos').select('done_on').eq('id', todo?.id || '').limit(1)).data?.[0]?.done_on === today, 8000);
      pass(`${tag}: one tap ticks the lead-up to-do`, Boolean(ticked));
    }
    await page.locator('.ds-guide-close').click();
    await sleep(800);

    // ---- The review after, the day after (yesterday's Investor call)
    await page.goto(`${APP}/welcome`);
    await page.waitForSelector('.home-page', { timeout: 20000 });
    const card = await until(async () => (await page.locator('.ds-suggest').innerText().catch(() => '')).replace(/\s+/g, ' '), 6000);
    const onHome = /Investor call was yesterday/.test(card || '');
    pass(`${tag}: Home offers the review after, or another card has its turn`, onHome || /debrief|Daily|log today|wind down/i.test(card || ''), card);
    if (onHome) await page.getByRole('button', { name: 'Review it' }).click();
    else {
      const inv = saved.find((m) => m.name === 'Investor call');
      await page.goto(`${APP}/peak-moments/review/${inv.id}/${dayKey(-1)}`);
    }
    await onQ(page, 'How did “Investor call” go?', 20000);
    pass(`${tag}: the review says when it was`, (await page.locator('.ds-guide-label').innerText()).includes('Investor call was yesterday'));
    pass(`${tag}: step 1 is one tap, with no Next`, (await page.locator('.ds-guide-next').count()) === 0);
    await sleep(450);
    await answer(page, 'It went better than I hoped');
    await onQ(page, 'What helped your energy and focus most?');
    await page.locator('.ds-guide-body .ds-text').first().fill('A quiet evening before.');
    await pressNext(page);
    await onQ(page, 'What would you keep or change for next time?');
    await page.locator('.ds-guide-body .ds-text').first().fill('Start the early nights a week out.');
    await pressNext(page);
    await onQ(page, 'Your review');
    pass(`${tag}: the summary shows each answer with Edit`, (await page.locator('.ds-guide-plan-row').count()) === 3);
    await pressNext(page);
    pass(`${tag}: “Saved for your next peak moment”`, Boolean(await sawToast(page, 'Saved for your next peak moment')));
    const after = await device(page);
    pass(`${tag}: the review and its lesson are kept`, Object.values(after.reviews || {}).some((r) => r.answer === 'very_well' && r.lesson === 'Start the early nights a week out.') && Object.values(after.moments).some((m) => m.name === 'Investor call' && m.lesson === 'Start the early nights a week out.'));
    await page.goto(`${APP}/peak-moments`);
    await page.waitForSelector('.ds-peak-list');
    pass(`${tag}: Past shows the lesson`, (await page.locator('.ds-peak-lesson').allInnerTexts()).some((t) => t.includes('Start the early nights a week out.')));

    // ---- Edit a saved one from its summary
    await page.locator('.ds-peak-row', { hasText: 'Cup final' }).click();
    await onQ(page, 'Your peak moment', 15000);
    await page.locator('.ds-guide-plan-row', { hasText: 'Name' }).click();
    await onQ(page, 'What is it called?');
    await page.locator('.ds-guide-body .ds-text').first().fill('Cup final replay');
    // Every toast that shows from here on, however briefly.
    await page.evaluate(() => { window.peakToasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.ds-toast-text')) window.peakToasts.push(t.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
    await pressNext(page);
    await onQ(page, 'Your peak moment');
    const editToast = await until(() => page.evaluate(() => window.peakToasts.includes('Saved')), 8000);
    const names = Object.values((await device(page))?.moments || {}).map((m) => m.name);
    pass(`${tag}: an edit from the summary saves there and then (“Saved”)`, Boolean(editToast) && names.includes('Cup final replay'), `${await toastText(page)} / ${names.join(', ')}`);
    // Delete it, then Undo.
    await page.getByRole('button', { name: 'Delete this peak moment' }).click();
    pass(`${tag}: Delete says “Deleted” with Undo`, Boolean(await sawToast(page, 'Deleted')));
    await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click();
    pass(`${tag}: Undo brings it back`, await until(async () => Object.values((await device(page))?.moments || {}).some((m) => m.name === 'Cup final replay' && !m.gone), 5000));

    pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    } catch (e) {
      pass(`${tag}: the flow ran to its end`, false, e.message.split('\n')[0]);
      await page.screenshot({ path: join(out, `stopped-${width}.png`), fullPage: true }).catch(() => {});
    }
    await page.evaluate((k) => localStorage.removeItem(k), DEVICE).catch(() => {});
    await ctx.close();
    await cleanDay();
  }
} finally {
  // Only what this test made: the lead-up to-dos and today's day rows, then the seed back on the real today.
  await cleanDay();
  await cleanMoments().catch(() => null);
  try { seedForReal('--reset'); } catch (e) { pass('the seed goes back on the real today', false, e.message.slice(0, 200)); }
  await browser.close();
}

for (const r of results) console.log(r);
console.log(`\n${results.length - failures} of ${results.length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
