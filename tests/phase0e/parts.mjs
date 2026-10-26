// Phase 0e checks on the shared parts, in the design gallery (no sign-in,
// no database) and on the Health Check results page (its two server calls
// answered here with an invented session, so no database is touched).
//
//   node tests/phase0e/parts.mjs [folder for screenshots]
//
// Needs the dev server on http://localhost:5173.
//  1. Colours: in Dark and Light panes, with the device set to light and
//     to dark, every good mark, tick, switch, bar and score is the mint of
//     its own pane's mode, and nothing good is coral.
//  2. Pop-ups: every chart mark's pop-up stays 12px inside the screen, on
//     a laptop (1280px, hover) and a phone (390px, tap).
//  3. Icons with words: icon centres within 1px of the middle of the
//     capital letters; tappable ones turn coral on hover.
//  4. Tap areas of 44px on a phone, and no sideways scrolling at 390px.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

const MINT = { dark: 'rgb(95, 239, 187)', light: 'rgb(11, 122, 82)' };
const ON_MINT = { dark: 'rgb(0, 0, 0)', light: 'rgb(255, 255, 255)' };
const CORAL = { dark: 'rgb(255, 111, 92)', light: 'rgb(194, 65, 46)' };
const CORALS = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)'];

const browser = await chromium.launch();

// ---- 1. colours ----------------------------------------------------------
for (const device of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: device });
  await page.goto(`${APP}/design-reference`, { waitUntil: 'networkidle' });
  // Open one eye panel's switch list so a switch that is on can be read.
  const found = await page.evaluate(({ MINT, ON_MINT, CORALS }) => {
    const rows = [];
    document.querySelectorAll('.dr-pane[data-theme]').forEach((pane) => {
      const mode = pane.getAttribute('data-theme');
      const read = (sel, prop, pseudo) => [...pane.querySelectorAll(sel)].map((el) => getComputedStyle(el, pseudo)[prop]);
      const checks = [
        ['week bars at or above the standard', '.ds-wchart-bar--good', 'backgroundColor', MINT[mode]],
        ['dial weeks at or above the standard', '.ds-dial-seg--good', 'stroke', MINT[mode]],
        ['live score at or above the standard', '.ds-stat-value--good', 'color', MINT[mode]],
        ['progress bars', '.ds-bar > span', 'backgroundColor', MINT[mode]],
        ['ticked boxes', ".ds-check-box[aria-checked='true'] > span", 'backgroundColor', MINT[mode]],
        ['ticks on ticked boxes', ".ds-check-box[aria-checked='true'] svg", 'stroke', ON_MINT[mode]],
        ['small-win ticks', '.ds-win-tick', 'backgroundColor', MINT[mode]],
        ['small-win tick marks', '.ds-win-tick svg', 'stroke', ON_MINT[mode]],
        ['Saved', '.ds-status--saved', 'color', MINT[mode]],
      ];
      checks.forEach(([name, sel, prop, want]) => {
        const got = read(sel, prop);
        rows.push({ mode, name, count: got.length, wrong: got.filter((c) => c !== want), coral: got.filter((c) => CORALS.includes(c)) });
      });
    });
    return rows;
  }, { MINT, ON_MINT, CORALS });
  // Totals per mode and part, across every pane in the gallery.
  const totals = {};
  found.forEach((r) => {
    const k = `${r.mode}|${r.name}`;
    const t = totals[k] || (totals[k] = { mode: r.mode, name: r.name, count: 0, wrong: [], coral: [] });
    t.count += r.count;
    t.wrong.push(...r.wrong);
    t.coral.push(...r.coral);
  });
  Object.values(totals).forEach((r) => {
    pass(`Colour, device ${device}, ${r.mode} pane: ${r.name} (${r.count})`, r.count > 0 && r.wrong.length === 0 && r.coral.length === 0,
      r.wrong.length ? `found ${[...new Set(r.wrong)].join(', ')}` : (r.count ? '' : 'none found'));
  });

  // A switch that is on, in the "What Tim sees" panel, in each pane.
  for (const [i, mode] of [[0, 'dark'], [1, 'light']]) {
    const pane = page.locator('#c3b .dr-pane').nth(i);
    await pane.locator('button.ds-who').nth(1).click();
    await page.waitForTimeout(450);
    const sw = await page.evaluate(() => [...document.querySelectorAll(".ds-switch[aria-checked='true']")].map((el) => getComputedStyle(el).backgroundColor));
    pass(`Colour, device ${device}, ${mode} pane: switches that are on (${sw.length})`, sw.length > 0 && sw.every((c) => c === MINT[mode]), [...new Set(sw)].join(', '));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
  await page.close();
}

// The Health Check results page: green for important and moving well,
// grey outlines for the rest (dark only: it is not yet a both-modes page).
const hcSession = {
  ok: true, status: 'complete', current_step: { screen: 'done' }, version: 3,
  updated_at: '2026-10-26T08:00:00', completed_at: '2026-10-20T09:00:00', client_label: 'Northbridge Logistics',
  data: {
    objective: 'Make Northbridge the most reliable regional carrier in Yorkshire by the end of next year.',
    csfs: ['On-time delivery above 97%', 'Drivers who stay with us', 'Accurate tracking for customers'].map((text, i) => ({ id: `f${i}`, text })),
    projects: ['New routing system', 'Driver mentoring scheme', 'Customer tracking app', 'Electric van trial', 'Depot safety audit', 'A project with a very long name that has to wrap somewhere sensible'].map((text, i) => ({ id: `p${i}`, text })),
    ratings: { owner: Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [`p${i}`, { contrib: { f0: 3 - (i % 4), f1: (i + 1) % 4, f2: 3 }, progress: [4, 5, 2, 1, 3, 4][i], resource: 2 }])) },
  },
};
async function openHealthCheck(width, touch) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch });
  await ctx.route(/supabase\.co/, (route) => {
    const url = route.request().url();
    if (/rpc\/alignment_open/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hcSession) });
    if (/rpc\/alignment_save/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, version: 3 }) });
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${APP}/health-check/invented-test-token`);
  await page.getByLabel('Email').fill('respondent@example.com');
  await page.locator('form input:not([type=email])').first().fill('ABCDEF');
  await page.getByRole('button', { name: /^(begin|continue)$/i }).click();
  await page.locator('.al-chart').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
{
  const { ctx, page } = await openHealthCheck(1280, false);
  const dots = await page.evaluate(() => [...document.querySelectorAll('.al-pt .al-core')].map((c) => ({ fill: getComputedStyle(c).fill, stroke: getComputedStyle(c).stroke })));
  const good = dots.filter((d) => d.fill === MINT.dark);
  const outlines = dots.filter((d) => d.fill !== MINT.dark);
  pass(`Colour, Health Check results: green dots (${good.length}) and grey outlines (${outlines.length})`,
    good.length > 0 && outlines.every((d) => d.stroke === 'rgb(163, 163, 160)') && !dots.some((d) => CORALS.includes(d.fill) || CORALS.includes(d.stroke)));
  if (out) await page.screenshot({ path: join(out, 'health-check-results.png'), fullPage: true });
  await ctx.close();
}

// ---- 2. pop-ups -------------------------------------------------------------
async function checkTips(page, selector, label, touch) {
  const marks = page.locator(selector);
  const n = await marks.count();
  let worst = null;
  let shown = 0;
  for (let i = 0; i < n; i += 1) {
    const m = marks.nth(i);
    if (!(await m.isVisible())) continue;
    await m.scrollIntoViewIfNeeded();
    if (touch) await m.tap({ force: true });
    else await m.hover({ force: true });
    await page.waitForTimeout(60);
    const box = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden);
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { l: r.left, r: window.innerWidth - r.right, t: r.top, b: window.innerHeight - r.bottom, display: getComputedStyle(t).display };
    });
    if (!box) continue;
    shown += 1;
    const min = Math.min(box.l, box.r, box.t, box.b);
    if (!worst || min < worst.min) worst = { min, ...box, i };
  }
  const hidden = await page.evaluate(() => [...document.querySelectorAll('.ds-tip[hidden]')].every((t) => getComputedStyle(t).display === 'none'));
  pass(`Pop-ups, ${label}: ${shown} of ${n} marks show one, each at least 12px inside the screen`, shown === n && worst && worst.min >= 12 - 0.5,
    worst ? `closest edge ${worst.min.toFixed(1)}px` : 'none shown');
  pass(`Pop-ups, ${label}: closed ones are display none`, hidden);
}
for (const [w, touch] of [[1280, false], [390, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.goto(`${APP}/design-reference#c8`, { waitUntil: 'networkidle' });
  await checkTips(page, '#c8 [data-tip]', `gallery charts, ${w}px`, touch);
  await ctx.close();
  const hc = await openHealthCheck(w, touch);
  await checkTips(hc.page, '.al-chart [data-tip]', `Health Check chart, ${w}px`, touch);
  await hc.ctx.close();
}

// ---- 3. icons with words ------------------------------------------------------
for (const [w, touch] of [[1280, false], [390, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.goto(`${APP}/design-reference#c3b`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const offsets = await page.evaluate(() => [...document.querySelectorAll('#c3b .ds-iconword, #c3 .ds-iconword')].map((el) => {
    const icon = el.querySelector('.ds-iconword-icon > *').getBoundingClientRect();
    const text = el.querySelector('.ds-iconword-text');
    // The baseline: a zero-size inline box sits on it.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    text.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();
    const cs = getComputedStyle(text);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent;
    const capMiddle = baseline - cap / 2;
    const iconMiddle = icon.top + icon.height / 2;
    // The gap from the icon's visible edge to the words.
    const gap = text.getBoundingClientRect().left - icon.right;
    return { words: text.textContent.replace('Who can see this: ', '').trim(), off: iconMiddle - capMiddle, gap, size: icon.width };
  }));
  const worst = offsets.reduce((a, b) => (Math.abs(b.off) > Math.abs(a.off) ? b : a), offsets[0]);
  pass(`Icons, ${w}px: ${offsets.length} icons centred on the capital letters`, offsets.length > 0 && Math.abs(worst.off) <= 1, `largest offset ${worst.off.toFixed(2)}px ("${worst.words}")`);
  pass(`Icons, ${w}px: every icon 16px, 6px from its words`, offsets.every((o) => Math.abs(o.size - 16) < 0.5 && Math.abs(o.gap - 6) < 0.5), [...new Set(offsets.map((o) => `${o.size}px/${o.gap.toFixed(1)}px`))].join(', '));
  if (!touch) {
    for (const [i, mode] of [[0, 'dark'], [1, 'light']]) {
      const pane = page.locator('#c3b .dr-pane').nth(i);
      const taps = pane.locator('.ds-iconword--tap');
      const n = await taps.count();
      const colours = [];
      for (let k = 0; k < n; k += 1) {
        await taps.nth(k).hover();
        await page.waitForTimeout(200);
        colours.push(await taps.nth(k).evaluate((el) => getComputedStyle(el).color));
      }
      await page.mouse.move(0, 0);
      pass(`Icons, ${mode} pane: ${n} tappable icons turn coral on hover`, n > 0 && colours.every((c) => c === CORAL[mode]), [...new Set(colours)].join(', '));
    }
  }
  if (out) await page.locator('#c3b').screenshot({ path: join(out, `icons-${w}.png`) });
  await ctx.close();
}

// ---- 4. tap areas and sideways scrolling on a phone ------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`${APP}/design-reference`, { waitUntil: 'networkidle' });
  const small = await page.evaluate(() => [...document.querySelectorAll('.ds-iconword--tap, .dr-arrow-demo, .ds-cal-nav, .ds-switch, .ds-option, .ds-guide-i, .ds-help-toggle, .ui-back-link')]
    .filter((el) => el.offsetParent)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, '::before');
      // A switch reaches 44px through its ::before.
      const reach = el.classList.contains('ds-switch') ? r.height - 2 * parseFloat(before.top || 0) : r.height;
      return { cls: el.className, h: Math.round(reach), text: el.textContent.trim().slice(0, 30) };
    })
    .filter((x) => x.h < 44));
  pass('Tap areas, gallery at 390px: every touched link and button at least 44px tall', small.length === 0, small.map((s) => `${s.text || s.cls} ${s.h}px`).slice(0, 6).join('; '));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  pass('No sideways scrolling, gallery at 390px', wide <= 0, `${wide}px too wide`);
  await ctx.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failures} of ${results.length} passed`);
process.exit(failures ? 1 : 0);
