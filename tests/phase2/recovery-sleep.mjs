// Recovery's sleep chart (approved by Tim, Tue 3 Nov 2026, 14:26): one
// measured check per step, in the running app, signed in as the invented
// test client on the TEST database only. Every other host and every email
// call is blocked, and nothing is written: the open Recovery, its nights
// and the person's page settings are answered here, and every write is
// answered as if it had saved and recorded, so the checks can read what
// would have been sent. Every browser's clock is fixed at noon on Tue 3
// Nov 2026.
//
//   node tests/phase2/recovery-sleep.mjs [report file] [folder for screenshots]
//   ONLY=question,chart,action,target,repeats,sizes to run some parts
//
// 1. question: the Sleep tile asks hours and quality on one screen ("How
//    did you sleep last night?", "Total hours" 0 to 14 in half hours,
//    "Quality" in the portal's five words); saving lands back on Recovery's
//    Home with "Saved", the day plan is sent, and the new bar grows in once
//    (not with reduced motion).
// 2. chart: the "Sleep" section with "Only you" on the right; "Last night"
//    and its hours in Nekst Light with "hours" small and grey; "Average
//    quality" the most common word, ties to the better word; one bar per
//    day, mint inside or above the range, grey below, a 2px stub to come;
//    only last night's figure above its bar; "Day 1"... and "Last night";
//    every other day on a phone; names never touch; the band between two
//    dashed mint lines, labelled to the right (laptop) or above its right
//    end (phone); no key; the pop-up (hours, night, quality) on hover, tap
//    and focus, 12px inside the screen, moving nothing; the empty frame
//    before two nights; "Show as a table" with the chevron, Night, Hours,
//    Quality.
// 3. action: below the range, "Last night was under your target range.",
//    "Tonight, Sleep wind down could help." and "Open Sleep wind down";
//    inside, "Last night was inside your target range." and "Keep doing
//    what’s working." with nothing else to do; above likewise.
// 4. target: 7 to 9 hours marked "Suggested for adults aged 18 to 64.";
//    "Edit my target range" opens two steppers in place ("From 7 hours",
//    "To 9 hours"), half hours from 4 to 12, the start always below the
//    end; it saves by itself with "Saved", then "This is your own target
//    range."; the chart follows; the same control in My Account.
// 5. repeats: no line under the chart repeats a figure or label the chart
//    already shows.
// 6. sizes: 360px, 430px, half-width (640px) and full desktop (1280px),
//    dark and light, with reduced motion: no sideways scroll, nothing
//    overlaps, 44px tap areas, at most one coral button.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const [out, shots] = process.argv.slice(2);
if (shots) mkdirSync(shots, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const part = (n) => !ONLY || ONLY.has(n);

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`;
  results.push(line);
  console.log(line);
};

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');

const TODAY = '2026-11-03';
const CLOCK = new Date(`${TODAY}T12:00:00Z`);
const MINT = { dark: 'rgb(95, 239, 187)', light: 'rgb(11, 122, 82)' };
const BELOW = { dark: 'rgb(99, 99, 98)', light: 'rgb(143, 141, 136)' };
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)'];

// The Recovery: started Fri 30 Oct for 7 days, so today is Day 5 of 7.
const RECOVERY = {
  id: '00000000-0000-4000-8000-00000000c0de',
  sprint_id: null,
  start_on: '2026-10-30',
  chosen_days: 7,
  extended_days: 0,
  ended_at: null,
  end_on: null,
  let_coach_know: false,
  updated_at: '2026-10-30 09:00:00',
};
const night = (local_date, sleep_hours, sleep_quality) => ({ local_date, sleep_hours, sleep_quality });
// Day 1 to Day 5: 7.5 Good, 6 Poor, none, 8 Good, then last night.
const NIGHTS = {
  below: [night('2026-10-30', 7.5, 'good'), night('2026-10-31', 6, 'poor'), night('2026-11-02', 8, 'good'), night(TODAY, 6.5, 'fair')],
  inside: [night('2026-10-30', 7.5, 'good'), night('2026-10-31', 6, 'poor'), night('2026-11-02', 8, 'very_good'), night(TODAY, 8, 'very_good')],
  above: [night('2026-10-30', 7.5, 'fair'), night('2026-10-31', 6, 'poor'), night(TODAY, 10, 'good')],
  one: [night(TODAY, 6.5, 'fair')],
  none: [],
  // The usual quality's tie: Good twice and Fair twice goes to Good.
  tie: [night('2026-10-30', 7, 'fair'), night('2026-10-31', 7, 'good'), night('2026-11-01', 7, 'fair'), night('2026-11-02', 7, 'good'), night(TODAY, 7.5, 'poor')],
};

const still = (page) => page.evaluate(() => new Promise((done) => {
  let frames = 0;
  const tick = () => {
    frames += 1;
    const moving = document.getAnimations().some((a) => a.playState === 'running');
    if ((frames >= 3 && !moving) || frames > 150) done();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

const browser = await chromium.launch();
let storage = null;

// One browser window with its own faked Recovery, nights and settings.
async function open({ width = 1280, height = 900, mode = 'dark', nights = NIGHTS.below, prefs = {}, motion = 'no-preference' } = {}) {
  const phone = width < 769;
  const state = { nights: nights.map((n) => ({ ...n })), prefs: JSON.parse(JSON.stringify(prefs)), writes: [] };
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
    reducedMotion: motion,
    storageState: storage || undefined,
  });
  await ctx.clock.install({ time: CLOCK });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (!url.includes(TEST_HOST) || !/\/rest\/v1\//.test(url)) return route.fallback();
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const method = req.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !/\/rpc\//.test(url)) {
      // Never written: answered as saved, kept for the checks, and shown
      // back by the faked reads below.
      const body = req.postData() || '';
      state.writes.push({ method, table, body });
      try {
        const row = JSON.parse(body);
        const r = Array.isArray(row) ? row[0] : row;
        if (table === 'day_plans' && r?.local_date) {
          state.nights = [...state.nights.filter((n) => n.local_date !== r.local_date), night(r.local_date, r.sleep_hours, r.sleep_quality)];
        }
        if (table === 'person_settings' && r?.page_preferences) state.prefs = r.page_preferences;
      } catch { /* not JSON */ }
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (method !== 'GET') return route.fallback();
    if (table === 'recovery_periods') return json(route, [RECOVERY]);
    if (table === 'recovery_recharge_answers') return json(route, []);
    if (table === 'day_plans' && /^(local_date,)?sleep_hours,sleep_quality$/.test((u.searchParams.get('select') || '').replace(/\s/g, ''))) {
      const eq = u.searchParams.get('local_date');
      const list = eq?.startsWith('eq.') ? state.nights.filter((n) => n.local_date === eq.slice(3)) : state.nights;
      return json(route, [...list].sort((a, b) => (a.local_date < b.local_date ? -1 : 1)));
    }
    if (table === 'person_settings' && u.searchParams.get('select')?.includes('page_preferences')) {
      return json(route, [{ user_id: 'me', page_preferences: state.prefs, updated_at: '2026-11-01 09:00:00' }]);
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, `${e.message} ${(e.stack || '').split('\n').slice(1, 4).join(' ')}`));
  if (!storage) {
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(/welcome/, { timeout: 30000 });
    storage = await ctx.storageState();
  }
  return { ctx, page, phone, state };
}

async function recoveryHome(page, path = '/recovery/today') {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.rec-sleep-sec', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  await still(page);
}

const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

// What the chart shows, measured.
const chartFacts = (page) => page.evaluate(() => {
  const sec = document.querySelector('.rec-sleep-sec');
  if (!sec) return null;
  const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
  const bars = [...sec.querySelectorAll('.ds-schart-bar')].map((b) => ({
    cls: b.className,
    h: b.getBoundingClientRect().height,
    bg: getComputedStyle(b).backgroundColor,
    tag: b.querySelector('.ds-schart-tag')?.textContent || null,
    tip: JSON.parse(b.getAttribute('data-tip') || 'null'),
    box: r(b),
  }));
  const axis = [...sec.querySelectorAll('.ds-schart-axis > span')].map((s) => ({
    text: s.textContent,
    shown: getComputedStyle(s).visibility !== 'hidden',
    box: r(s.firstElementChild),
  }));
  const band = sec.querySelector('.ds-schart-band');
  const bs = band && getComputedStyle(band);
  const stat = (label) => {
    const st = [...sec.querySelectorAll('.ds-stat')].find((s) => s.querySelector('.ds-stat-label')?.textContent === label);
    if (!st) return null;
    const v = st.querySelector('.ds-stat-value');
    const u = st.querySelector('.ds-unit');
    return {
      value: v.firstChild?.textContent || '',
      font: getComputedStyle(v).fontFamily,
      weight: getComputedStyle(v).fontWeight,
      unit: u?.textContent || null,
      unitColour: u ? getComputedStyle(u).color : null,
      unitSize: u ? parseFloat(getComputedStyle(u).fontSize) : null,
      valueSize: parseFloat(getComputedStyle(v).fontSize),
    };
  };
  const head = sec.querySelector('.ds-section-head');
  const who = sec.querySelector('.ds-section-title .ds-who');
  const side = sec.querySelector('.ds-schart-range-side');
  const strip = sec.querySelector('.ds-schart-range-strip');
  const plot = sec.querySelector('.ds-schart-plot');
  return {
    title: sec.querySelector('.ds-section-title')?.textContent,
    // The eye alone, its words for screen readers (5 Nov); its drawn icon, not its 44px tap area, lines up on the right.
    who: who ? (who.getAttribute('aria-label') || who.textContent) : null,
    // Beside the title's last letter, 12px after it (5e rule 29d; 10 Nov: never at the far edge).
    whoRight: who && head ? (who.querySelector('svg, .ds-icon') || who).getBoundingClientRect().left - head.getBoundingClientRect().left : null,
    last: stat('Last night'),
    average: stat('Usual quality'),
    bars,
    axis,
    band: band ? { box: r(band), top: bs.borderTopStyle, bottom: bs.borderBottomStyle, colour: bs.borderTopColor, bg: bs.backgroundColor } : null,
    side: side ? { text: side.textContent, box: r(side.querySelector('.ds-schart-range-at')) } : null,
    strip: strip ? { text: strip.textContent, box: r(strip), align: getComputedStyle(strip).textAlign } : null,
    plot: r(plot),
    empty: sec.querySelector('.ds-schart-frame')?.textContent || null,
    legend: sec.querySelectorAll('[class*="legend"], [class*="key"]').length,
    fold: sec.querySelector('.ds-collapse-head')?.textContent || null,
    foldChevron: Boolean(sec.querySelector('.ds-collapse-head .ds-chevron, .ds-collapse-head [class*=chevron]')),
    lines: [...sec.querySelectorAll('.rec-sleep-line')].map((p) => p.textContent),
    links: [...sec.querySelectorAll('.rec-sleep-links button')].map((b) => b.textContent),
    sectionText: sec.innerText,
  };
});

const popUp = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden);
  if (!t) return null;
  const b = t.getBoundingClientRect();
  return { lines: [...t.children].map((c) => c.textContent), left: b.left, right: innerWidth - b.right, top: b.top, bottom: innerHeight - b.bottom };
});

const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('.ui-root *:not(.ds-portal):not(.ds-portal *)')]
  .filter((el) => !el.closest('.ds-portal, .hdr, .ds-phone-bar, .ds-toast-region'))
  .map((el) => el.getBoundingClientRect())
  .filter((b) => b.width || b.height)
  .map((b) => `${Math.round(b.left)},${Math.round(b.top + scrollY)},${Math.round(b.width)},${Math.round(b.height)}`));

const overlaps = (list) => {
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) return [i, j];
    }
  }
  return null;
};

// ------------------------------------------------------------------ 1. the question
if (part('question')) {
  for (const motion of ['no-preference', 'reduce']) {
    for (const width of [1280, 390]) {
      const tag = `question ${width}px${motion === 'reduce' ? ' reduced motion' : ''}`;
      const { ctx, page, phone, state } = await open({ width, height: width < 769 ? 844 : 900, nights: NIGHTS.below.filter((n) => n.local_date !== TODAY), motion });
      await recoveryHome(page);
      const tile = page.locator('.rec-tiles button, .rec-tiles a, .rec-tiles [role=button]').filter({ hasText: 'Sleep' }).first();
      await (phone ? tile.tap() : tile.click());
      await page.waitForSelector('.rec-sleep .ds-stepper', { timeout: 10000 }).catch(() => {});
      await still(page);
      const facts = await page.evaluate(() => {
        const panel = document.querySelector('.rec-sleep')?.closest('[role=dialog]') || document.querySelector('.rec-sleep')?.parentElement;
        return {
          heading: panel?.querySelector('.ipp-panel-title')?.textContent || null,
          labels: [...document.querySelectorAll('.rec-sleep .ds-label-row-text, .rec-sleep .ds-field-label, .rec-sleep legend, .rec-sleep label')].map((l) => l.textContent.trim()).filter(Boolean),
          options: [...document.querySelectorAll('.rec-sleep [role=radio], .rec-sleep input[type=radio]')].map((o) => (o.getAttribute('aria-label') || o.closest('label')?.textContent || o.textContent).trim()),
          oneScreen: document.querySelectorAll('.rec-sleep .ds-stepper').length === 1,
        };
      });
      pass(`${tag}: heading`, facts.heading === 'How did you sleep last night?', facts.heading);
      pass(`${tag}: "Total hours" and "Quality" on one screen`, facts.labels.includes('Total hours') && facts.labels.some((l) => l.startsWith('Quality')) && facts.oneScreen, facts.labels.join(' | '));
      pass(`${tag}: quality in the portal's five words`, ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'].every((w) => facts.options.includes(w)), facts.options.join(', '));
      const plus = page.locator('.rec-sleep .ds-stepper-btn').nth(1);
      const minus = page.locator('.rec-sleep .ds-stepper-btn').nth(0);
      const value = () => page.locator('.rec-sleep .ds-stepper-value').textContent();
      await plus.click({ force: true });
      // As Daily plan's stepper: the first press goes on from 7 hours.
      pass(`${tag}: hours start from 7, in steps of 0.5`, (await value()) === '7.5', await value());
      await plus.click({ force: true });
      pass(`${tag}: in steps of 0.5`, (await value()) === '8', await value());
      for (let i = 0; i < 20; i += 1) await minus.click({ force: true });
      pass(`${tag}: no lower than 0`, (await value()) === '0', await value());
      for (let i = 0; i < 32; i += 1) await plus.click({ force: true });
      pass(`${tag}: no higher than 14`, (await value()) === '14', await value());
      for (let i = 0; i < 15; i += 1) await minus.click({ force: true });
      pass(`${tag}: back to 6.5`, (await value()) === '6.5', await value());
      // The five words (Tim, 10 Nov): "Good" saves the key 'fair', as "Fair" did.
      await page.locator('.rec-sleep').getByText('Good', { exact: true }).click();
      await page.getByRole('button', { name: 'Save my sleep' }).click();
      const toast = await page.waitForSelector('.ds-toast-text', { timeout: 8000 }).then((t) => t.textContent()).catch(() => null);
      pass(`${tag}: "Saved"`, toast === 'Saved', toast);
      const sent = state.writes.find((w) => w.table === 'day_plans');
      pass(`${tag}: today's day plan sent with 6.5 and Good (saved as 'fair')`, Boolean(sent && /"local_date":"2026-11-03"/.test(sent.body) && /"sleep_hours":6.5/.test(sent.body) && /"sleep_quality":"fair"/.test(sent.body)), sent?.body?.slice(0, 160));
      await page.waitForTimeout(100);
      const grow = await page.evaluate(() => {
        const bar = document.querySelector('.ds-schart-bar--grow');
        return { has: Boolean(bar), anims: bar ? bar.getAnimations().length : 0, name: bar ? getComputedStyle(bar).animationName : null };
      });

      if (motion === 'reduce') pass(`${tag}: the new bar doesn't move with reduced motion`, grow.has && grow.name === 'none', JSON.stringify(grow));
      else pass(`${tag}: the new bar grows in`, grow.has && grow.name === 'ds-schart-grow', JSON.stringify(grow));
      await still(page);
      await page.waitForTimeout(500);
      const panelGone = await page.locator('.rec-sleep').isHidden().catch(() => true);
      pass(`${tag}: back on Recovery's Home`, panelGone && /\/recovery\/today/.test(page.url()));
      const after = await chartFacts(page);
      pass(`${tag}: the new bar shows 6.5`, after?.bars?.[4]?.tag === '6.5', after?.bars?.[4]?.tag);
      // Functionality tester (3 Nov): offline, the panel opens on the
      // night already saved (the page's own copy), so a quality chosen on
      // its own never sends empty hours over it.
      await ctx.setOffline(true);
      await (phone ? tile.tap() : tile.click());
      await page.waitForSelector('.rec-sleep .ds-stepper', { timeout: 10000 }).catch(() => {});
      await still(page);
      pass(`${tag}: offline, the panel opens on the saved 6.5`, (await value()) === '6.5', await value());
      await page.locator('.rec-sleep').getByText('Good', { exact: true }).click();
      await page.getByRole('button', { name: 'Save my sleep' }).click();
      const queued = await page.waitForSelector('.ds-toast-text:text("Will sync")', { timeout: 8000 }).then(() => true).catch(() => false);
      pass(`${tag}: offline, "Will sync"`, queued);
      await ctx.setOffline(false);
      await page.waitForFunction(() => true);
      await page.waitForTimeout(3000);
      const all = state.writes.filter((w) => w.table === 'day_plans');
      pass(`${tag}: no save sends empty hours`, all.length >= 2 && all.every((w) => !/"sleep_hours":null/.test(w.body)), all.map((w) => w.body.slice(0, 120)).join(' || '));
      await ctx.close();
    }
  }
}

// ------------------------------------------------------------------ 2. the chart
const SIZES = [[1280, 900], [640, 900], [430, 932], [360, 780]];
if (part('chart')) {
  for (const mode of ['dark', 'light']) {
    for (const [width, height] of SIZES) {
      const tag = `chart ${width}px ${mode}`;
      const { ctx, page, phone: touch } = await open({ width, height, mode, motion: 'reduce' });
      const phone = width <= 600; // the app's phone layout (PHONE_QUERY)
      await recoveryHome(page);
      await shot(page, `chart-${width}-${mode}`);
      const f = await chartFacts(page);
      if (!f) { pass(`${tag}: the Sleep section shows`, false); await ctx.close(); continue; }
      pass(`${tag}: headed "Sleep"`, /^sleep$/i.test(f.title), f.title);
      pass(`${tag}: "Only you" beside the title, not at the far edge`, /Only you/.test(f.who || '') && f.whoRight != null && f.whoRight > 20 && f.whoRight < 160, `${f.who} ${f.whoRight}`);
      pass(`${tag}: "Last night" 6.5 in Nekst Light`, f.last?.value === '6.5' && /nekst/i.test(f.last.font) && Number(f.last.weight) <= 300, JSON.stringify(f.last));
      pass(`${tag}: "hours" small and grey beside it`, f.last?.unit === 'hours' && f.last.unitSize < f.last.valueSize && f.last.unitColour !== 'rgb(255, 255, 255)' && f.last.unitColour !== 'rgb(0, 0, 0)', JSON.stringify(f.last));
      // The saved keys read straight across in the five words (Tim, 10 Nov, 23:22): the most common key, 'good', reads "Very good".
      pass(`${tag}: "Usual quality Very good" (most common)`, f.average?.value === 'Very good', f.average?.value);
      pass(`${tag}: one bar per day of the Recovery (7)`, f.bars.length === 7, String(f.bars.length));
      const states = f.bars.map((b) => /--(good|below|none|next)/.exec(b.cls)?.[1]);
      pass(`${tag}: inside or above mint, below grey, to come stubs`, states.join(',') === 'good,below,none,good,below,next,next', states.join(','));
      pass(`${tag}: mint bars are mint`, f.bars.filter((b, i) => states[i] === 'good').every((b) => b.bg === MINT[mode]), f.bars.map((b) => b.bg).join(' '));
      pass(`${tag}: grey bars are the below-standard grey`, f.bars.filter((b, i) => states[i] === 'below').every((b) => b.bg === BELOW[mode]), f.bars.map((b) => b.bg).join(' '));
      pass(`${tag}: days to come a 2px stub`, f.bars.filter((b, i) => states[i] === 'next').every((b) => Math.abs(b.h - 2) < 0.5), f.bars.map((b) => b.h.toFixed(1)).join(' '));
      pass(`${tag}: no coral in the chart`, !f.bars.some((b) => CORAL.includes(b.bg)));
      const scale = f.bars[0].h / 7.5;
      pass(`${tag}: drawn to scale from zero`, Math.abs(f.bars[3].h / scale - 8) < 0.1 && Math.abs(f.bars[1].h / scale - 6) < 0.1, `${f.bars[3].h} ${f.bars[1].h}`);
      pass(`${tag}: only last night's figure above its bar`, f.bars.filter((b) => b.tag).length === 1 && f.bars[4].tag === '6.5', f.bars.map((b) => b.tag).join(','));
      const shown = f.axis.filter((a) => a.shown);
      pass(`${tag}: "Last night" under the latest bar`, f.axis[4].text === 'Last night' && f.axis[4].shown, f.axis[4].text);
      pass(`${tag}: days named "Day 1", "Day 2" and so on`, f.axis.every((a, i) => i === 4 || a.text === `Day ${i + 1}`), f.axis.map((a) => a.text).join(','));
      if (phone) pass(`${tag}: every other day on a phone`, !shown.some((a, i) => i && f.axis.indexOf(a) - f.axis.indexOf(shown[i - 1]) < 2 && a.text !== 'Last night' && shown[i - 1].text !== 'Last night'), shown.map((a) => a.text).join(','));
      else pass(`${tag}: every day named on a laptop`, shown.length >= 6, shown.map((a) => a.text).join(','));
      pass(`${tag}: no two names touch`, !overlaps(shown.map((a) => a.box)), shown.map((a) => a.text).join(','));
      const px = (h) => f.plot.bottom - h * scale;
      pass(`${tag}: the band runs from 7 to 9 hours`, f.band && Math.abs(f.band.box.bottom - px(7)) < 1.5 && Math.abs(f.band.box.top - px(9)) < 1.5, JSON.stringify(f.band?.box));
      pass(`${tag}: two thin dashed mint lines`, f.band?.top === 'dashed' && f.band?.bottom === 'dashed' && f.band.colour === MINT[mode], JSON.stringify(f.band));
      pass(`${tag}: a faint mint band`, /rgba?\(|color\(srgb/.test(f.band?.bg || '') && f.band.bg !== 'rgba(0, 0, 0, 0)', f.band?.bg);
      if (phone) {
        pass(`${tag}: range labelled above the chart's right end`, f.strip && /Your target range 7 to 9 hours/.test(f.strip.text) && f.strip.align === 'right' && f.strip.box.bottom <= f.plot.top + 0.5, JSON.stringify(f.strip));
      } else {
        pass(`${tag}: range labelled to the right of the chart`, f.side && /Your target range 7 to 9 hours/.test(f.side.text) && f.side.box.left >= f.plot.right, JSON.stringify(f.side));
      }
      pass(`${tag}: no key`, f.legend === 0);
      // The pop-up.
      const bar = page.locator('.ds-schart-bar').nth(1);
      await bar.scrollIntoViewIfNeeded();
      await still(page);
      const before = await boxes(page);
      if (touch) await bar.tap(); else await bar.hover();
      await still(page);
      const tip = await popUp(page);
      pass(`${tag}: pop-up on ${touch ? 'tap' : 'hover'}: hours, night, quality`, tip && tip.lines.join(' | ') === '6 hours | Day 2, night of 30 Oct. | Quality: Fair.', tip?.lines?.join(' | '));
      pass(`${tag}: pop-up 12px inside the screen`, tip && tip.left >= 11.5 && tip.right >= 11.5 && tip.top >= 11.5 && tip.bottom >= 11.5, JSON.stringify(tip));
      const after = await boxes(page);
      pass(`${tag}: the pop-up moves nothing`, before.join(';') === after.join(';'));
      await page.keyboard.press('Escape');
      await page.locator('.ds-schart-bar').nth(4).focus();
      await still(page);
      const focusTip = await popUp(page);
      pass(`${tag}: pop-up on keyboard focus`, focusTip?.lines?.[0] === '6.5 hours' && focusTip.lines[1] === 'Day 5, night of 2 Nov.', focusTip?.lines?.join(' | '));
      const next = f.bars[6].tip;
      pass(`${tag}: a day to come says so`, next?.value === 'To come' && next.when === 'Day 7, night of 4 Nov.', JSON.stringify(next));
      await page.keyboard.press('Escape');
      // The table.
      pass(`${tag}: "Show as a table" with the chevron`, f.fold === 'Show as a table' && f.foldChevron, f.fold);
      await page.locator('.rec-sleep-sec .ds-collapse-head').click();
      await still(page);
      const table = await page.evaluate(() => ({
        head: [...document.querySelectorAll('.rec-sleep-sec thead th')].map((t) => t.textContent),
        rows: [...document.querySelectorAll('.rec-sleep-sec tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()),
      }));
      pass(`${tag}: table columns Night, Hours, Quality`, table.head.join(',') === 'Night,Hours,Quality', table.head.join(','));
      pass(`${tag}: a row per answered night`, table.rows.length === 4 && /29 Oct/.test(table.rows[0]) && /7\.5 hours/.test(table.rows[0]) && /Very good/.test(table.rows[0]), table.rows.join(' / '));
      await ctx.close();
    }
  }
  // The usual quality's tie goes to the better word.
  {
    const { ctx, page } = await open({ nights: NIGHTS.tie });
    await recoveryHome(page);
    const f = await chartFacts(page);
    pass('chart: a tie goes to the better word (the keys fair 2 and good 2, read Good and Very good: Very good)', f?.average?.value === 'Very good', f?.average?.value);
    await ctx.close();
  }
  // Before two nights: the empty frame with one line.
  for (const [key, width] of [['one', 1280], ['none', 360]]) {
    const { ctx, page } = await open({ width, height: 800, nights: NIGHTS[key] });
    await recoveryHome(page);
    const f = await chartFacts(page);
    pass(`chart ${key} night${key === 'one' ? '' : 's'} ${width}px: the empty frame, one line`, f?.empty === 'Your chart starts after your second night.' && f.bars.length === 0, f?.empty);
    pass(`chart ${key} ${width}px: no table yet`, !f?.fold);
    await shot(page, `empty-${key}-${width}`);
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 3. the action
if (part('action')) {
  const CASES = {
    below: { lines: ['Last night was under your target range.', 'Tonight, Sleep wind down could help.'], links: ['Open Sleep wind down', 'Edit my target range'] },
    inside: { lines: ['Last night was inside your target range.', 'Keep doing what’s working.'], links: ['Edit my target range'] },
    above: { lines: ['Last night was above your target range.', 'Keep doing what’s working.'], links: ['Edit my target range'] },
  };
  for (const [key, want] of Object.entries(CASES)) {
    for (const width of [1280, 360]) {
      const { ctx, page, phone } = await open({ width, height: 800, nights: NIGHTS[key] });
      await recoveryHome(page);
      const f = await chartFacts(page);
      pass(`action ${key} ${width}px: the lines`, f?.lines?.join(' | ') === want.lines.join(' | '), f?.lines?.join(' | '));
      pass(`action ${key} ${width}px: one sentence per line`, f?.lines?.every((l) => (l.match(/[.!?]/g) || []).length === 1));
      pass(`action ${key} ${width}px: the links`, f?.links?.join(' | ') === want.links.join(' | '), f?.links?.join(' | '));
      if (key === 'below') {
        const link = page.getByRole('button', { name: 'Open Sleep wind down' });
        await (phone ? link.tap() : link.click());
        await page.waitForURL(/sleep-wind-down/, { timeout: 8000 }).catch(() => {});
        pass(`action below ${width}px: opens Sleep wind down`, /\/sleep-wind-down/.test(page.url()), page.url());
      }
      await ctx.close();
    }
  }
}

// ------------------------------------------------------------------ 4. the target range
if (part('target')) {
  for (const [width, mode] of [[1280, 'dark'], [360, 'light']]) {
    const tag = `target ${width}px ${mode}`;
    const { ctx, page, phone, state } = await open({ width, height: 900, mode });
    await recoveryHome(page);
    let f = await chartFacts(page);
    pass(`${tag}: starts at 7 to 9, "Suggested for adults aged 18 to 64."`, /Your target range 7 to 9 hours\s*Suggested for adults aged 18 to 64\./.test((phone ? f.strip?.text : f.side?.text) || ''), (phone ? f.strip?.text : f.side?.text));
    const link = page.getByRole('button', { name: 'Edit my target range' });
    pass(`${tag}: "Edit my target range" closed`, (await link.getAttribute('aria-expanded')) === 'false');
    const linkBox = await link.boundingBox();
    pass(`${tag}: the link is 44px tall`, linkBox && linkBox.height >= 43.5, String(linkBox?.height));
    const before = await page.evaluate(() => document.querySelector('.ds-schart')?.getBoundingClientRect().top + scrollY);
    await (phone ? link.tap() : link.click());
    await still(page);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.rec-sleep-sec .ds-starget-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    pass(`${tag}: opens in place: "From 7 hours", "To 9 hours"`, rows.length === 2 && /^From\s.*7\s*hours$/.test(rows[0]) && /^To\s.*9\s*hours$/.test(rows[1]), rows.join(' / '));
    const chartTop = await page.evaluate(() => document.querySelector('.ds-schart')?.getBoundingClientRect().top + scrollY);
    pass(`${tag}: nothing above it moves`, Math.abs(chartTop - before) < 0.5, `${before} ${chartTop}`);
    pass(`${tag}: open`, (await link.getAttribute('aria-expanded')) === 'true');
    const btns = page.locator('.rec-sleep-sec .ds-starget .ds-stepper-btn');
    const val = (i) => page.locator('.rec-sleep-sec .ds-starget .ds-stepper-value').nth(i).textContent();
    // A plain minus and plus, drawn alike, never the crosshair (5e rules 29e and 29g; swept 10 Nov).
    const icons = await btns.evaluateAll((bs) => bs.slice(0, 2).map((b) => ({ step: Boolean(b.querySelector('svg.ds-step-icon')), cross: Boolean(b.querySelector('.ds-crosshair, [class*=cross], img')) })));
    pass(`${tag}: the portal's stepper: a plain minus and plus, never the crosshair`, icons.length === 2 && icons.every((i) => i.step && !i.cross), JSON.stringify(icons));
    const tapBoxes = await btns.evaluateAll((list) => list.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    pass(`${tag}: stepper buttons 44px`, tapBoxes.every((s) => s >= 43.5), tapBoxes.join(','));
    // From: up to 8.5 at most (below To 9).
    for (let i = 0; i < 6; i += 1) await btns.nth(1).click({ force: true });
    pass(`${tag}: the start stays below the end`, (await val(0)) === '8.5', await val(0));
    for (let i = 0; i < 12; i += 1) await btns.nth(0).click({ force: true });
    pass(`${tag}: from no lower than 4`, (await val(0)) === '4', await val(0));
    for (let i = 0; i < 10; i += 1) await btns.nth(3).click({ force: true });
    pass(`${tag}: to no higher than 12`, (await val(1)) === '12', await val(1));
    for (let i = 0; i < 20; i += 1) await btns.nth(2).click({ force: true });
    pass(`${tag}: the end stays above the start`, (await val(1)) === '4.5', await val(1));
    // Settle on 6.5 to 8.5 in half hours.
    for (let i = 0; i < 4; i += 1) await btns.nth(3).click({ force: true });
    for (let i = 0; i < 5; i += 1) await btns.nth(1).click({ force: true });
    for (let i = 0; i < 4; i += 1) await btns.nth(3).click({ force: true });
    const pair = `${await val(0)} to ${await val(1)}`;
    pass(`${tag}: half hours`, pair === '6 to 8.5', pair);
    const saving = await page.locator('.rec-sleep-sec .ds-starget-foot').innerText();
    pass(`${tag}: saving by itself (no Save button)`, /Saving/.test(saving) && !(await page.locator('.rec-sleep-sec .ds-starget button', { hasText: /^Save/ }).count()), saving);
    await page.waitForFunction(() => /Saved/.test(document.querySelector('.rec-sleep-sec .ds-starget-foot')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
    const foot = await page.locator('.rec-sleep-sec .ds-starget-foot').innerText();
    pass(`${tag}: "Saved", then "This is your own target range."`, /Saved/.test(foot) && /This is your own target range\./.test(foot), foot.replace(/\s+/g, ' '));
    const sent = state.writes.filter((w) => w.table === 'person_settings').pop();
    const sentTarget = sent ? JSON.parse(sent.body).page_preferences?.sleep_target : null;
    pass(`${tag}: kept with the person's settings`, sentTarget && `${sentTarget.from} to ${sentTarget.to}` === pair, JSON.stringify(sentTarget));
    f = await chartFacts(page);
    const label = (phone ? f.strip?.text : f.side?.text) || '';
    pass(`${tag}: the chart follows`, label === `Your target range ${pair} hours`, label);
    pass(`${tag}: "Suggested" gone once changed`, !/Suggested/.test(f.sectionText));
    // Reloaded, it stays (from the account's copy).
    await recoveryHome(page);
    f = await chartFacts(page);
    pass(`${tag}: still there after a reload`, ((phone ? f.strip?.text : f.side?.text) || '') === `Your target range ${pair} hours`, (phone ? f.strip?.text : f.side?.text));
    // The same control in My Account.
    await page.goto(`${APP}/my-account`);
    await page.waitForSelector('.account-row--sleep', { timeout: 15000 }).catch(() => {});
    await still(page);
    const acc = await page.locator('.account-row--sleep').innerText().catch(() => '');
    pass(`${tag}: My Account (Settings) shows it`, /Sleep target range/.test(acc) && acc.includes(`${pair} hours`), acc.replace(/\s+/g, ' '));
    const accLink = page.locator('.account-row--sleep').getByRole('button', { name: 'Edit my target range' });
    await (phone ? accLink.tap() : accLink.click());
    await still(page);
    const accRows = await page.evaluate(() => [...document.querySelectorAll('.account-sleep-target .ds-starget-row')].length);
    pass(`${tag}: My Account opens the same control`, accRows === 2);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    pass(`${tag}: My Account no sideways scroll`, scroll <= 0, String(scroll));
    await shot(page, `account-${width}-${mode}`);
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 5. no repeats
if (part('repeats')) {
  for (const key of ['below', 'inside', 'above']) {
    for (const width of [1280, 360]) {
      const { ctx, page } = await open({ width, height: 800, nights: NIGHTS[key] });
      await recoveryHome(page);
      const f = await chartFacts(page);
      const figures = [...new Set(f.bars.filter((b) => b.tag).map((b) => b.tag).concat([f.last?.value].filter(Boolean)))];
      const labels = ['7 to 9', 'target range 7', 'Day ', 'Last night 6', 'hours'];
      const bad = f.lines.filter((l) => figures.some((n) => new RegExp(`(^|[^0-9.])${n.replace('.', '\\.')}([^0-9]|$)`).test(l)) || labels.some((w) => l.includes(w)));
      pass(`repeats ${key} ${width}px: no line under the chart repeats a figure or label it shows`, !bad.length, bad.join(' | '));
      // Nor the figures above the chart.
      const figs = await page.evaluate(() => [...document.querySelectorAll('.rec-sleep-sec .rec-sleep-figs .ds-stat-note')].map((n) => n.textContent));
      pass(`repeats ${key} ${width}px: no grey line under the big figures`, figs.length === 0, figs.join(' | '));
      await ctx.close();
    }
  }
}

// ------------------------------------------------------------------ 6. sizes and modes
if (part('sizes')) {
  for (const mode of (process.env.MODES || 'dark,light').split(',')) {
    for (const [width, height] of SIZES) {
      for (const path of (process.env.PATHS || '/recovery/today,/welcome').split(',')) {
        const tag = `sizes ${path} ${width}px ${mode}`;
        const { ctx, page } = await open({ width, height, mode, motion: 'reduce' });
        await recoveryHome(page, path);
        if (!(await page.locator('.rec-sleep-sec').count())) {
          pass(`${tag}: the Sleep section shows`, false, page.url());
          await shot(page, `missing-${path.replace(/\W+/g, '')}-${width}-${mode}`);
          await ctx.close();
          continue;
        }
        const facts = await page.evaluate((coral) => {
          const sec = document.querySelector('.rec-sleep-sec');
          const all = [...document.querySelectorAll('.rec-sleep-sec *')];
          const texts = all.filter((el) => el.childElementCount === 0 && el.textContent.trim() && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.ds-sr') && !el.closest('.ds-collapse:not(.ds-collapse--open) .ds-collapse-body'))
            .map((el) => ({ t: el.textContent.trim(), b: el.getBoundingClientRect() }))
            .filter((x) => x.b.width && x.b.height);
          const taps = [...sec.querySelectorAll('button, a, [tabindex="0"]:not(.ds-schart-bar)')].map((b) => ({ t: b.textContent.trim(), h: b.getBoundingClientRect().height }));
          const corals = [...document.querySelectorAll('.ui-root button, .ui-root a')].filter((b) => b.offsetParent && coral.includes(getComputedStyle(b).backgroundColor)).length;
          const secBox = sec.getBoundingClientRect();
          return {
            scroll: document.documentElement.scrollWidth - innerWidth,
            texts,
            taps,
            corals,
            inside: texts.every((x) => x.b.left >= secBox.left - 1 && x.b.right <= secBox.right + 1),
          };
        }, CORAL);
        pass(`${tag}: no sideways scroll`, facts.scroll <= 0, String(facts.scroll));
        const o = overlaps(facts.texts.map((x) => x.b));
        pass(`${tag}: no words overlap`, !o, o ? `${facts.texts[o[0]].t} / ${facts.texts[o[1]].t}` : '');
        pass(`${tag}: every word inside the section`, facts.inside);
        const small = facts.taps.filter((t) => t.h < 43.5);
        pass(`${tag}: 44px tap areas`, !small.length, small.map((t) => `${t.t} ${t.h}`).join(', '));
        pass(`${tag}: at most one coral button`, facts.corals <= 1, String(facts.corals));
        await shot(page, `sizes-${path.replace(/\W+/g, '')}-${width}-${mode}`);
        await ctx.close();
      }
    }
  }
  // Twice the standard text size (the device's setting): still no sideways scroll.
  for (const width of [360, 1280]) {
    const { ctx, page } = await open({ width, height: 900 });
    await recoveryHome(page);
    await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    await still(page);
    const facts = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.ds-schart-axis > span')].filter((s) => getComputedStyle(s).visibility !== 'hidden').map((s) => s.firstElementChild.getBoundingClientRect());
      return { scroll: document.documentElement.scrollWidth - innerWidth, names: shown };
    });
    pass(`sizes 2x text ${width}px: no sideways scroll`, facts.scroll <= 0, String(facts.scroll));
    pass(`sizes 2x text ${width}px: no two names along the bottom touch`, !overlaps(facts.names));
    await shot(page, `twice-${width}`);
    await ctx.close();
  }
}

await browser.close();
const summary = `${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed.`;
console.log(summary);
if (out) writeFileSync(out, `${results.join('\n')}\n\n${summary}\n`);
process.exit(failures ? 1 : 0);
