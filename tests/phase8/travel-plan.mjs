// The Travel plan (M21, version 7.2; Phase 8b part B), the flows: signed in
// as the invented test client on the TEST database, on the fixed day
// (tests/phase2/fixed-day.mjs: the browser's clock starts on it), at 1440,
// 768 and 400 wide, dark and light. Every other host and every email call is
// blocked.
//
// Migration 048 isn't on the test project yet, so plans and peak moments
// live on the device, as the app keeps them until it is (src/lib/travel/
// store.js, src/lib/peakMoments/store.js): the test seeds, reads and clears
// those copies. The only rows written are the person's page settings (the
// offer's state and usual sleep, person_settings.page_preferences), and the
// test takes its own keys out again at the start and the end.
//
//   node --import ./tests/scores/register.mjs tests/phase8/travel-plan.mjs [folder for screenshots]
//   SIZES=1440,768,400 MODES=dark,light   to run some (each one width and mode is about 2 minutes)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP, block, clientDb, pressNext, readEnv, signIn, sleep, until } from './shared.mjs';
import { FIXED_TODAY, fixClock, fixedLabel, seedFixed } from '../phase2/fixed-day.mjs';
import { checkExplainOpener, explainWords } from '../explain-panel.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-travel');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '1440,768,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');

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
const TRAVEL = `clarity-travel-plans-local:${me}`;
const PEAK = `clarity-peak-moments-local:${me}`;
console.log(`Fixed day: ${fixedLabel()}`);
seedFixed('--reset');

// ------------------------------------------------------------ what the test seeds
const LHR = { key: 'LHR', code: 'LHR', name: 'London Heathrow, LHR', city: 'London', zone: 'Europe/London' };
const JFK = { key: 'JFK', code: 'JFK', name: 'New York JFK', city: 'New York', zone: 'America/New_York' };
const id = (n) => `7c000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = (n, outDay, homeDay, more = {}) => ({
  id: id(n),
  title: 'New York trip',
  flightOut: { id: id(n + 100), from: LHR, to: JFK, leaves: `${outDay}T12:00`, lands: `${outDay}T15:00` },
  flightHome: { id: id(n + 200), from: JFK, to: LHR, leaves: `${homeDay}T19:00`, lands: `${dayKeyFrom(homeDay, 1)}T07:00` },
  momentIds: [],
  momentTimes: {},
  usualSleep: { start: '22:30', end: '06:30' },
  noCaffeine: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...more,
});
function dayKeyFrom(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const peak = (n, name, on, city, zone) => ({ id: id(n), name, area: 'work', kind: 'perform', span: 'day', startsOn: on, endsOn: on, placeCity: city, placeZone: zone, repeat: null, lesson: '', shared: false, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', sent: false, gone: false });
// Under way today: the flight out is today (Home's card, Show earlier days, the Daily plan).
const UNDER_WAY = plan(1, dayKey(0), dayKey(4));
// Finished a month ago: it stays, with Use again.
const FINISHED = plan(2, dayKey(-40), dayKey(-35));
// A peak moment in New York in the trip set up by hand, and two nearer ones elsewhere (Home's offer).
const BOARD = peak(10, 'Harbour board meeting', dayKey(7), 'New York', 'America/New_York');
const DUBAI = peak(11, 'Dubai keynote', dayKey(4), 'Dubai', 'Asia/Dubai');
const TOKYO = peak(12, 'Tokyo launch', dayKey(5), 'Tokyo', 'Asia/Tokyo');
const OFFER_KEYS = [DUBAI, TOKYO].map((m) => `travel-offer:${m.id}:${m.startsOn}`);

/** Takes this test's own page settings out again (the offers' state and usual sleep). */
async function tidySettings() {
  const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).maybeSingle();
  const prefs = data?.page_preferences;
  if (!prefs || typeof prefs !== 'object') return;
  const offers = { ...(prefs.offers || {}) };
  let changed = false;
  for (const k of OFFER_KEYS) if (k in offers) { delete offers[k]; changed = true; }
  const next = { ...prefs, offers };
  if ('travel_sleep' in next) { delete next.travel_sleep; changed = true; }
  if (changed) await db.from('person_settings').update({ page_preferences: next }).eq('user_id', me);
}

const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await toastText(page)).includes(words), ms);
const qText = (page) => page.locator('.ds-guide-question, .ds-guide-title').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const onQ = (page, starts, ms = 15000) => until(async () => (await qText(page)).startsWith(starts), ms);
const device = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
const problem = (page) => page.locator('.ds-guide-problem').innerText().catch(() => '');
const dates = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => (e.innerText || e.textContent).replace(/\s+/g, ' ').trim()));

async function seed(page, { plans = [], moments = [] }) {
  await page.evaluate(({ T, P, plans: ps, moments: ms }) => {
    localStorage.setItem(T, JSON.stringify({ plans: Object.fromEntries(ps.map((p) => [p.id, p])), ticks: {} }));
    localStorage.setItem(P, JSON.stringify({ moments: Object.fromEntries(ms.map((m) => [m.id, m])), reviews: {}, leadUps: {}, shareWork: false }));
    // 048 isn't on the test project: say so, so the stores never ask.
    localStorage.setItem('clarity-travel-plans-not-yet', String(Date.now()));
    localStorage.setItem('clarity-peak-moments-not-yet', String(Date.now()));
  }, { T: TRAVEL, P: PEAK, plans, moments });
}

async function pickPlace(page, label, typed, name) {
  const box = page.getByRole('combobox', { name: label });
  await box.click();
  await box.fill(typed);
  await until(async () => (await page.getByRole('option', { name: new RegExp(name) }).count()) > 0, 5000);
  await page.keyboard.press('Enter');
  await until(async () => (await box.inputValue()) === name, 3000);
}

async function chooseOption(page, label, option) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await sleep(300);
}

/** The middle of one of the chart's day dots, on screen. */
async function dotAt(page, i) {
  const b = await page.locator('.ds-tc-dot').nth(i).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const readout = (page) => page.locator('.ds-tc-readout').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const litLabel = (page) => page.locator('.ds-tc-day--on').textContent().catch(() => '');

async function run(browser, width, mode) {
  const phone = width < 600;
  const tag = `${width}px ${mode}`;
  await tidySettings();
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, hasTouch: phone, isMobile: phone });
  await fixClock(ctx);
  await block(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await signIn(page, env);
  await seed(page, { plans: [UNDER_WAY, FINISHED], moments: [BOARD, DUBAI, TOKYO] });
  const shot = (name) => page.screenshot({ path: join(out, `${width}-${mode}-${name}.png`), fullPage: false }).catch(() => null);

  // ---------------------------------------------------------------- Home's offer, a week before
  await page.goto(`${APP}/welcome`);
  const offer = page.locator('.ds-offer', { hasText: 'Plan my Dubai trip' });
  pass(`${tag}: Home offers “Plan my Dubai trip” 4 days before its peak moment in another time zone`, await until(async () => (await offer.count()) === 1, 20000));
  const icon = await page.evaluate(() => {
    const svg = document.querySelector('.ds-offer .ds-offer-icon--plane');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const grey = getComputedStyle(document.querySelector('.ds-offer-words small')).color;
    return { w: Math.round(parseFloat(getComputedStyle(svg).width)), h: Math.round(parseFloat(getComputedStyle(svg).height)), rotated: r.width > 22, fill: getComputedStyle(svg).fill, grey, circle: Math.round(svg.parentElement.getBoundingClientRect().width), coral: [...document.querySelectorAll('.ds-offer *')].some((e) => getComputedStyle(e).color === 'rgb(255, 111, 92)') };
  });
  pass(`${tag}: the offer's icon is the solid plane, 22px in the 44px circle, in the secondary grey; no coral`, icon && icon.w === 22 && icon.h === 22 && icon.circle === 44 && icon.fill === icon.grey && !icon.coral, JSON.stringify(icon));
  pass(`${tag}: the offer says its time and has Not now`, (await offer.innerText()).includes('~3 minutes') && (await offer.getByRole('button', { name: 'Not now' }).count()) === 1);
  pass(`${tag}: one offer at a time (the Tokyo trip waits)`, (await page.locator('.ds-offer', { hasText: 'Tokyo' }).count()) === 0);
  await shot('offer');
  await offer.getByRole('button', { name: /Plan my Dubai trip/ }).click();
  pass(`${tag}: taking the offer opens set-up with the trip's city filled in`, await onQ(page, 'Where are you flying?') && (await page.getByRole('combobox', { name: 'To' }).inputValue()) === 'Dubai');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${APP}/welcome`);
  const tokyo = page.locator('.ds-offer', { hasText: 'Plan my Tokyo trip' });
  pass(`${tag}: the next trip is offered once the first is taken`, await until(async () => (await tokyo.count()) === 1, 15000));
  await tokyo.getByRole('button', { name: 'Not now' }).click();
  pass(`${tag}: Not now says “We won’t ask again for this trip.” and the row goes`, await sawToast(page, 'We won’t ask again for this trip.') && await until(async () => (await tokyo.count()) === 0, 3000));
  // Kept with the person's page settings (the device's copy first).
  await until(async () => (await page.evaluate((k) => Object.entries(localStorage).some(([key, v]) => key.endsWith(':menu-pins') && v.includes(k) && v.includes('"never":true')), OFFER_KEYS[1])), 5000);
  await page.reload();
  await page.locator('.ds-page-title').first().waitFor({ timeout: 20000 });
  await sleep(1500);
  pass(`${tag}: it isn't offered again`, (await page.locator('.ds-offer', { hasText: /Plan my (Tokyo|Dubai) trip/ }).count()) === 0);

  // ---------------------------------------------------------------- Home's card during the trip, with private ticks
  const card = page.locator('.ds-tcard');
  pass(`${tag}: during the trip Home shows “Today’s travel plan”`, await until(async () => (await card.count()) === 1, 10000) && (await card.innerText()).includes('Today’s travel plan'));
  pass(`${tag}: the card's line is the day's (“You fly to New York today.”)`, (await card.locator('.ds-tcard-title').innerText()).trim() === 'You fly to New York today.');
  const ticks = card.getByRole('checkbox');
  pass(`${tag}: three steps, each with its own tick box and its zone on a travel day`, (await ticks.count()) === 3 && (await card.locator('.ds-tsteps-zone').count()) === 3);
  const times = await dates(page, '.ds-tcard-time');
  const mins = times.map((t) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; });
  pass(`${tag}: in time order`, mins.every((m, i) => i === 0 || m >= mins[i - 1]), times.join(' | '));
  const box = await ticks.first().boundingBox();
  pass(`${tag}: each tick box has a 44px tap area`, box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
  await ticks.first().click();
  pass(`${tag}: ticking a step ticks it`, await until(async () => (await ticks.first().getAttribute('aria-checked')) === 'true', 3000));
  const kept = await device(page, TRAVEL);
  pass(`${tag}: the tick is kept on the device for that day only`, Object.keys(kept?.ticks?.[UNDER_WAY.id] || {}).join() === today, JSON.stringify(kept?.ticks));
  await page.reload();
  pass(`${tag}: the tick stays after a reload`, await until(async () => (await page.locator('.ds-tcard').getByRole('checkbox').first().getAttribute('aria-checked')) === 'true', 15000));
  pass(`${tag}: nothing says what wasn't ticked`, !/missed|not done|didn’t|left to do|\d of 3/i.test(await page.locator('.ds-tcard').innerText()));
  await shot('home-card');

  // ---------------------------------------------------------------- the Daily plan, without tick boxes
  await page.goto(`${APP}/daily-plan`);
  await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
  for (let i = 0; i < 8 && !(await qText(page)).startsWith('What will you do today?'); i += 1) {
    await page.evaluate(({ uid, d, n }) => localStorage.setItem(`ds-guide:day-plan-${uid}-${d}`, JSON.stringify({ index: n, skipped: [] })), { uid: me, d: today, n: i + 1 });
    await page.reload();
    await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
  }
  const tp = page.locator('.ds-tpanel');
  pass(`${tag}: the Daily plan's “What will you do today?” shows today's travel steps above the list`, (await qText(page)).startsWith('What will you do today?') && await until(async () => (await tp.count()) === 1, 8000));
  pass(`${tag}: three rows with their times, and no tick boxes`, (await tp.locator('.ds-tpanel-row').count()) === 3 && (await tp.locator('[role=checkbox], input, .ds-check-box').count()) === 0);
  const order = await page.evaluate(() => {
    const p = document.querySelector('.ds-tpanel');
    const list = document.querySelector('.ds-guide-body .ds-rows, .ds-guide-body .ds-pick-groups, .ds-guide-body .day-quiet-line');
    return p && list ? Boolean(p.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  });
  pass(`${tag}: the travel steps sit above the day's list`, order !== false, String(order));
  await shot('daily-plan');
  await tp.getByRole('button', { name: 'Open today’s travel plan' }).click();
  pass(`${tag}: “Open today’s travel plan” opens today's page`, await onQ(page, 'You fly to New York today.'));

  // ---------------------------------------------------------------- set-up to plan
  await page.goto(`${APP}/travel-plan`);
  await page.locator('.ds-page-title').first().waitFor({ timeout: 20000 });
  pass(`${tag}: Start asks “Where are you flying next…?” with Plan my trip and ~3 minutes`, /^Where are you flying next/.test(await page.locator('.travel-calm .ds-empty-title').innerText()) && (await page.locator('.travel-calm').innerText()).includes('~3 minutes'));
  pass(`${tag}: Start lists the peak moments in another time zone`, (await page.locator('.ds-peak-row', { hasText: 'Harbour board meeting' }).count()) === 1);
  pass(`${tag}: Start lists the saved plans, a finished one too`, (await page.locator('.ds-peak-row', { hasText: 'Finished' }).count()) === 1);
  await page.getByRole('button', { name: 'Plan my trip' }).click();
  await onQ(page, 'Where are you flying?');
  pass(`${tag}: set-up opens on the flight out, with the eye, From already filled from the last trip`, (await page.locator('.ds-guide-question .ds-who').count()) === 1 && (await page.getByRole('combobox', { name: 'From' }).inputValue()) === 'London Heathrow, LHR');
  await pressNext(page);
  pass(`${tag}: nothing in To says “Choose where you’re flying to to carry on.”, never a greyed-out button`, await until(async () => (await problem(page)).includes('Choose where you’re flying to to carry on.'), 4000) && !(await page.locator('.ds-guide-next').isDisabled()));
  const to = page.getByRole('combobox', { name: 'To' });
  await to.click();
  await to.fill('zzz');
  pass(`${tag}: no match says so`, await until(async () => (await page.locator('.ds-place-none').innerText().catch(() => '')) === 'No airport matches “zzz”. Try the city or the 3-letter code.', 3000));
  await shot('setup-search');
  await page.keyboard.press('Escape');
  await pickPlace(page, 'To', 'jfk', 'New York JFK');
  pass(`${tag}: To finds an airport by its code`, (await to.inputValue()) === 'New York JFK');
  const when = page.locator('.travel-when input');
  await when.nth(0).fill(`${dayKey(5)}T12:00`);
  await when.nth(1).fill(`${dayKey(5)}T15:00`);
  await pressNext(page);
  pass(`${tag}: the flight home is next, the way back already filled in`, await onQ(page, 'When do you fly home?') && (await page.getByRole('combobox', { name: 'From' }).inputValue()) === 'New York JFK' && (await page.getByRole('combobox', { name: 'To' }).inputValue()) === 'London Heathrow, LHR');
  await when.nth(0).fill(`${dayKey(9)}T19:00`);
  await when.nth(1).fill(`${dayKey(10)}T07:00`);
  await pressNext(page);
  pass(`${tag}: the key moments ask what to be sharpest for in New York`, await onQ(page, 'What do you need to be sharpest for in New York?'));
  const boardRow = page.locator('.ds-guide-body .ds-answer', { hasText: 'Harbour board meeting' });
  pass(`${tag}: the trip's peak moment is already chosen; the one in Tokyo isn't offered`, (await boardRow.getAttribute('aria-pressed')) === 'true' && (await page.locator('.ds-guide-body .ds-answer', { hasText: 'Tokyo' }).count()) === 0);
  await page.getByRole('button', { name: 'Add a key moment' }).click();
  await pressNext(page);
  pass(`${tag}: a key moment with no name says “Type the key moment’s name to carry on.”`, await until(async () => (await problem(page)).includes('Type the key moment’s name to carry on.'), 4000));
  await page.locator('.travel-extra .ds-text').fill('Investor dinner');
  await chooseOption(page, 'Start time', '19:30');
  await shot('setup-moments');
  await pressNext(page);
  pass(`${tag}: the check asks what to change`, await onQ(page, 'What would you change'));
  const rows = await dates(page, '.ds-guide-plan-row');
  pass(`${tag}: the check shows the flights, the key moments and usual sleep, each with Edit`, rows.length === 4 && rows[0].startsWith('Flight out London to New York') && rows[2].includes('Harbour board meeting') && rows[2].includes('Investor dinner') && rows[3].startsWith('Usual sleep') && rows.every((r) => r.endsWith('Edit')), rows.join(' | '));
  await page.locator('.ds-guide-plan-row', { hasText: 'Usual sleep' }).click();
  pass(`${tag}: Edit on usual sleep opens its panel`, await until(async () => (await page.locator('.travel-sleep-panel .ds-dialog-title').innerText().catch(() => '')) === 'Usual sleep', 4000));
  await shot('setup-sleep');
  await chooseOption(page, 'Bedtime', '22:30');
  await chooseOption(page, 'Wake time', '06:30');
  await page.locator('.travel-sleep-panel').getByRole('button', { name: 'Save' }).click();
  await until(async () => (await page.locator('.travel-sleep-panel').count()) === 0, 3000);
  pass(`${tag}: Save says “Saved” and the row shows the new times`, await sawToast(page, 'Saved') && await until(async () => (await page.locator('.ds-guide-plan-row', { hasText: 'Usual sleep' }).innerText()).includes('22:30 to 06:30'), 4000));
  pass(`${tag}: “Make my plan” is the one coral button`, (await page.locator('.ds-btn--primary:visible').count()) === 1 && (await page.locator('.ds-guide-next').innerText()).toUpperCase() === 'MAKE MY PLAN');
  await page.locator('.ds-guide-next').click();
  pass(`${tag}: “Making your plan” shows first`, await until(async () => (await page.getByText('Making your plan').count()) > 0, 3000));
  pass(`${tag}: the plan opens with “Your plan is saved.”`, await onQ(page, 'Here’s your plan for New York', 10000) && await sawToast(page, 'Your plan is saved.'));
  await shot('plan');
  const stored = await device(page, TRAVEL);
  const made = Object.values(stored.plans).find((p) => p.flightOut.leaves === `${dayKey(5)}T12:00`);
  const peaks = await device(page, PEAK);
  const dinner = Object.values(peaks.moments).find((m) => m.name === 'Investor dinner');
  pass(`${tag}: the plan is kept with both key moments, and “Add a key moment” made a new peak moment`, made && made.momentIds.length === 2 && dinner && made.momentIds.includes(dinner.id) && made.momentTimes[dinner.id] === '19:30' && dinner.placeCity === 'New York', JSON.stringify(made?.momentIds));
  pass(`${tag}: the plan has its dates, the one line, the chart, Day by day and Your trip, in that order`, await page.evaluate(() => {
    const t = document.querySelector('.ds-guide').innerText;
    const i = ['Do the steps that fit your days. Each one helps.', 'YOUR BODY CLOCK', 'DAY BY DAY', 'YOUR TRIP'].map((w) => t.toUpperCase().indexOf(w.toUpperCase()));
    return i.every((x, j) => x >= 0 && (j === 0 || x > i[j - 1]));
  }));
  const key = (await page.locator('.ds-tc-key').innerText()).replace(/\s+/g, ' ').trim();
  pass(`${tag}: the chart names each time zone on its own line, and the key numbers the moments in date order`, (await dates(page, '.ds-tc-level-name')).join(' | ') === 'London time, GMT | New York time, GMT −4' && (await page.locator('.ds-tc-marker').count()) === 2 && key === '1 Investor dinner 2 Harbour board meeting', `${await dates(page, '.ds-tc-level-name')} / ${key}`);
  pass(`${tag}: no sideways scroll on the plan`, await noSideScroll(page));
  const madeId = made?.id;

  // ---------------------------------------------------------------- the read-out: mouse, touch and keys
  const chart = page.locator('.ds-tc-chart');
  await chart.scrollIntoViewIfNeeded();
  pass(`${tag}: the chart scrubs across and still scrolls the page (touch-action pan-y)`, (await chart.evaluate((e) => getComputedStyle(e).touchAction)) === 'pan-y');
  const labels = await dates(page, '.ds-tc-day');
  if (!phone) {
    const p2 = await dotAt(page, 2);
    await page.mouse.move(p2.x, p2.y);
    const r2 = await until(async () => (await readout(page)).startsWith('Body clock'), 3000);
    pass(`${tag}: pointing at a day reads it out, the clock line alone`, r2, await readout(page));
    pass(`${tag}: no date in the read-out; the day's label on the axis is lit instead`, !/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\bOct\b|\bNov\b/.test(await readout(page)) && (await litLabel(page)) === labels[2], `${await readout(page)} / ${await litLabel(page)}`);
    const moIdx = (await page.locator('.ds-tc-dot').evaluateAll((els) => els.findIndex((e) => e.classList.contains('ds-tc-dot--moment'))));
    const pm = await dotAt(page, moIdx);
    await page.mouse.move(pm.x, pm.y);
    await sleep(200);
    pass(`${tag}: a key moment's day leads with the moment, then the body clock`, /^\d .+(, \d\d:\d\d)? Body clock/.test(await readout(page)), await readout(page));
    await shot('readout-mouse');
    await page.mouse.move(2, 2);
    pass(`${tag}: leaving the chart hides the read-out`, await until(async () => (await page.locator('.ds-tc-readout').count()) === 0, 2000));
  }
  // Touch: a tap reads a day, dragging across scrubs, tapping the same day again hides it.
  const touch = async (type, i) => {
    const p = await dotAt(page, i);
    await chart.evaluate((el, { type: t, x, y }) => el.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true, pointerId: 9, isPrimary: true })), { type, x: p.x, y: p.y });
  };
  if (phone) {
    const p1 = await dotAt(page, 1);
    await page.touchscreen.tap(p1.x, p1.y);
    pass(`${tag}: a tap reads that day`, await until(async () => (await litLabel(page)) === labels[1] && (await readout(page)).includes('Body clock'), 3000), `${await litLabel(page)} ${await readout(page)}`);
    const hidden = await page.locator('.ds-tc-day--hidden').count();
    pass(`${tag}: on a phone every other day's label hides, and shows when it's the day being read`, hidden >= Math.floor(labels.length / 2) - 1 && !(await page.locator('.ds-tc-day--on').evaluate((e) => e.classList.contains('ds-tc-day--hidden'))), `${hidden}`);
    await shot('readout-touch');
  }
  await touch('pointerdown', 3);
  await touch('pointermove', 4);
  await touch('pointermove', 6);
  pass(`${tag}: dragging across scrubs from day to day`, await until(async () => (await litLabel(page)) === labels[6], 2000), await litLabel(page));
  await touch('pointerup', 6);
  await touch('pointerdown', 6);
  await touch('pointerup', 6);
  pass(`${tag}: tapping the same day again hides it`, await until(async () => (await page.locator('.ds-tc-readout').count()) === 0, 2000));
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  pass(`${tag}: the arrow keys read the first day first`, await until(async () => (await litLabel(page)) === labels[0], 2000), await litLabel(page));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  pass(`${tag}: then day by day`, (await litLabel(page)) === labels[1]);
  pass(`${tag}: a screen reader hears the day and where the body clock is`, /Body clock/.test(await page.locator('.ds-tc-chart [aria-live]').textContent()));
  await page.keyboard.press('Escape');
  pass(`${tag}: Escape hides it`, await until(async () => (await page.locator('.ds-tc-readout').count()) === 0, 2000));
  pass(`${tag}: the chart has its whole sentence for a screen reader`, /^Your body clock moves from London time towards New York time, .+ Use the arrow keys to read each day\.$/.test(await chart.getAttribute('aria-label')));

  // ---------------------------------------------------------------- a day: zone labels only on travel days
  const dayPage = async (d) => {
    await page.goto(`${APP}/travel-plan/${madeId}/day/${d}`);
    await page.waitForSelector('.ds-guide-question', { timeout: 15000 });
    await sleep(300);
    return { rows: await page.locator('.ds-tsteps-row').count(), zones: await page.locator('.ds-tsteps-zone').count(), text: await page.locator('.ds-guide').innerText() };
  };
  const fly = await dayPage(dayKey(5));
  pass(`${tag}: the day it flies, every time has its zone under it`, (await qText(page)) === 'You fly to New York today.' && fly.rows === 3 && fly.zones === 3, JSON.stringify({ rows: fly.rows, zones: fly.zones }));
  await shot('day-two-zones');
  const away = await dayPage(dayKey(7));
  pass(`${tag}: a day in New York has no zone labels, and “Times are New York time.”`, away.zones === 0 && away.text.includes('Times are New York time.'), JSON.stringify({ zones: away.zones }));
  pass(`${tag}: a key moment's day is named for it, and its row comes in time order`, (await qText(page)) === 'Harbour board meeting is today.' && away.text.includes('Harbour board meeting'));
  const before = await dayPage(dayKey(2));
  pass(`${tag}: a day at home before the flight has no zone labels and no zone line`, before.zones === 0 && !before.text.includes('Times are'));
  pass(`${tag}: each row is the time and the step, nothing else (no ⓘ, no kind)`, (await page.locator('.ds-tsteps-row .ds-info, .ds-tsteps-row button').count()) === 0);
  pass(`${tag}: the first day's footer has All days and Next day`, (await page.getByRole('button', { name: 'All days' }).count()) === 1 && (await page.getByRole('button', { name: 'Next day' }).count()) === 1);
  await page.getByRole('button', { name: 'Next day' }).click();
  pass(`${tag}: Next day opens the next day`, await until(async () => page.url().endsWith(`/day/${dayKey(3)}`) && (await page.getByRole('button', { name: 'Previous day' }).count()) === 1, 5000));

  // ---------------------------------------------------------------- Why these steps help, and no caffeine
  await dayPage(dayKey(7));
  const why = page.getByRole('button', { name: 'Why these steps help' });
  await checkExplainOpener(page, why, { tag: `${tag} Why these steps help`, pass, touch: phone });
  await why.click();
  await until(async () => (await explainWords(page)) !== null, 4000);
  const words = await explainWords(page);
  pass(`${tag}: the panel explains Light, Caffeine and Sleep, then the medicines line`, words && words[0] === 'Why these steps help' && ['Light', 'Caffeine', 'Sleep'].every((w) => words.includes(w)) && words.at(-1) === 'This plan doesn’t cover medicines or supplements. Ask your GP or pharmacist about those.', JSON.stringify(words));
  await shot('why');
  const noCaf = page.locator('.ds-explain-panel').getByRole('button', { name: 'I don’t have caffeine' });
  pass(`${tag}: “I don’t have caffeine” is at the panel's end`, (await noCaf.count()) === 1);
  await noCaf.click();
  pass(`${tag}: it closes the panel and says “Caffeine steps removed from your plan.” with Undo`, await until(async () => (await explainWords(page)) === null, 3000) && await sawToast(page, 'Caffeine steps removed from your plan.') && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1);
  const noCaffeineRows = async () => (await dates(page, '.ds-tsteps-words')).filter((w) => /caffeine/i.test(w)).length;
  pass(`${tag}: every caffeine step goes`, await until(async () => (await noCaffeineRows()) === 0, 3000));
  await shot('no-caffeine');
  await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo brings them back`, await until(async () => (await noCaffeineRows()) === 1, 3000));
  await why.click();
  await until(async () => (await explainWords(page)) !== null, 4000);
  await page.locator('.ds-explain-panel').getByRole('button', { name: 'I don’t have caffeine' }).click();
  await until(async () => (await noCaffeineRows()) === 0, 3000);
  await sleep(600);
  await why.click();
  await until(async () => (await explainWords(page)) !== null, 4000);
  pass(`${tag}: with none, the panel has no Caffeine and offers “Show caffeine steps again”`, !(await explainWords(page)).includes('Caffeine') && (await page.locator('.ds-explain-panel').getByRole('button', { name: 'Show caffeine steps again' }).count()) === 1);
  await page.locator('.ds-explain-panel').getByRole('button', { name: 'Show caffeine steps again' }).click();
  pass(`${tag}: “Show caffeine steps again” says “Caffeine steps are back.”`, await sawToast(page, 'Caffeine steps are back.') && await until(async () => (await noCaffeineRows()) === 1, 3000));

  // ---------------------------------------------------------------- under way: Show earlier days, and an edit from today
  await page.goto(`${APP}/travel-plan/${UNDER_WAY.id}`);
  await onQ(page, 'Here’s your plan for New York');
  const firstRow = (await dates(page, '.travel-plan .ds-tdays[aria-label="Day by day"] .ds-tday-title'))[0];
  pass(`${tag}: once under way, Day by day starts with today`, firstRow === new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', ''), firstRow);
  const fold = page.getByRole('button', { name: 'Show earlier days' });
  pass(`${tag}: earlier days fold under “Show earlier days”, closed`, (await fold.count()) === 1 && (await fold.getAttribute('aria-expanded')) === 'false');
  await fold.click();
  pass(`${tag}: opening it shows the 3 days before`, await until(async () => (await page.locator('.ds-tdays[aria-label="Earlier days"] .ds-tday').count()) === 3 && (await fold.getAttribute('aria-expanded')) === 'true', 3000));
  await shot('under-way');
  const earlierBefore = await device(page, TRAVEL);
  await page.getByRole('button', { name: 'Edit flight home' }).click();
  await until(async () => (await page.locator('.travel-panel .ds-dialog-title').innerText().catch(() => '')) === 'Flight home', 4000);
  const pw = page.locator('.travel-panel .travel-when input');
  await pw.nth(0).fill(`${dayKey(6)}T19:00`);
  await pw.nth(1).fill(`${dayKey(7)}T07:00`);
  await page.locator('.travel-panel').getByRole('button', { name: 'Save' }).click();
  pass(`${tag}: editing a flight says “Saved. Your plan is updated.”`, await sawToast(page, 'Saved. Your plan is updated.'));
  const after = (await device(page, TRAVEL)).plans[UNDER_WAY.id];
  pass(`${tag}: the edit reworks the plan from today, and the days before stay as they were`, after.past?.from === today && after.past.days.map((d) => d.date).join() === [dayKey(-3), dayKey(-2), dayKey(-1)].join() && !earlierBefore.plans[UNDER_WAY.id].past, JSON.stringify(after.past?.days?.map((d) => d.date)));
  pass(`${tag}: Your trip shows the new flight home`, (await page.locator('.travel-trip').innerText()).includes(`New York to London, ${new Date(`${dayKey(6)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}`));

  // ---------------------------------------------------------------- Who can see this
  await page.locator('.ds-guide-question .ds-who button, .ds-guide-question button.ds-who').first().click().catch(() => null);
  const whoText = await until(async () => (await page.locator('[role=dialog]:not(.ds-guide)').last().innerText().catch(() => '')).includes('Only you can see your plan.'), 4000);
  pass(`${tag}: the eye says “Only you can see your plan.”`, whoText);
  await page.keyboard.press('Escape');
  await sleep(400);

  // ---------------------------------------------------------------- saved plans: Use again, and Delete with Undo
  await page.goto(`${APP}/travel-plan/${FINISHED.id}`);
  await onQ(page, 'Here’s your plan for New York');
  pass(`${tag}: a finished plan stays, with Use again`, (await page.getByRole('button', { name: 'Use again' }).count()) === 1);
  await page.getByRole('button', { name: 'Use again' }).click();
  pass(`${tag}: Use again opens set-up with the same places, the days still to choose`, await onQ(page, 'Where are you flying?') && (await page.getByRole('combobox', { name: 'To' }).inputValue()) === 'New York JFK' && (await page.locator('.travel-when input').first().inputValue()) === '');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.goto(`${APP}/travel-plan/${madeId}`);
  await onQ(page, 'Here’s your plan for New York');
  await page.getByRole('button', { name: 'Delete this plan' }).click();
  pass(`${tag}: Delete goes back to Start with “Deleted” and Undo`, await until(async () => page.url().endsWith('/travel-plan'), 5000) && await sawToast(page, 'Deleted') && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1);
  pass(`${tag}: it's gone from the device`, !(await device(page, TRAVEL)).plans[madeId]);
  await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click();
  pass(`${tag}: Undo puts it back`, await until(async () => Boolean((await device(page, TRAVEL)).plans[madeId]), 3000) && await until(async () => (await page.locator('.ds-peak-list[aria-label="Saved plans"] .ds-peak-row').count()) === 3, 3000));
  pass(`${tag}: no sideways scroll on Start`, await noSideScroll(page));
  await shot('start');

  pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  // Clean up: only what this run made.
  await page.evaluate(({ T, P }) => { localStorage.removeItem(T); localStorage.removeItem(P); }, { T: TRAVEL, P: PEAK });
  await ctx.close();
  await tidySettings();
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  for (const width of SIZES) for (const mode of MODES) {
    try {
      await run(browser, width, mode);
    } catch (e) {
      pass(`${width}px ${mode}: the run finished`, false, e.message);
    }
  }
} finally {
  await browser.close();
  await tidySettings().catch(() => null);
}
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
