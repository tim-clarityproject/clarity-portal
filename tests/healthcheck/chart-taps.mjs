// The Health Check chart on a phone: where close dots' 44px tap areas
// overlap, a tap opens the pop-up of the dot whose centre is nearest the tap
// (Health Check follow-up 1, step 2). 40 projects at 400 wide, dark and light.
//
//   node --import ./tests/scores/register.mjs tests/healthcheck/chart-taps.mjs [out folder]
//
// Needs the dev server on the test project (it answers the page's own calls
// with stand-ins, hc-shared.mjs: never a real link or email).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { appPage, kestrel, signIn } from './hc-shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-chart-taps');
mkdirSync(out, { recursive: true });
const WIDTH = Number(process.env.WIDTH || 400);
const MODES = (process.env.MODES || 'dark,light').split(',');
const results = [];
const pass = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`);
};

const names = Array.from({ length: 40 }, (_, i) => `Project ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 2 : ''} for the tap test`);

const browser = await chromium.launch();
for (const mode of MODES) {
  const tag = `${WIDTH}px ${mode}`;
  const { ctx, page, session, problems } = await appPage(browser, WIDTH, mode, { complete: true, data: kestrel({ projects: names }), step: { screen: 'results' } });
  await signIn(page, session);
  const chart = page.locator('.hc-chart').first();
  await chart.waitFor();
  await chart.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const marks = await page.evaluate(() => [...document.querySelector('.hc-chart').querySelectorAll('[data-tip]')].map((m) => {
    const r = m.getBoundingClientRect();
    return { n: m.getAttribute('data-n'), x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 };
  }));
  pass(`${tag}: 40 dots on the chart`, marks.length === 40, String(marks.length));
  pass(`${tag}: every dot keeps a 44px tap area`, marks.every((m) => m.r * 2 >= 44), marks.map((m) => (m.r * 2).toFixed(1)).join(','));
  const vh = page.viewportSize().height;
  // Points where two tap areas overlap, along the line between the centres and off it.
  const points = [];
  for (let i = 0; i < marks.length; i += 1) {
    for (let j = i + 1; j < marks.length; j += 1) {
      const a = marks[i];
      const b = marks[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= a.r + b.r || d < 1) continue;
      for (const t of [0.3, 0.45, 0.55, 0.7]) {
        for (const off of [0, 6, -6]) {
          const nx = -(b.y - a.y) / d;
          const ny = (b.x - a.x) / d;
          // a tap lands on whole pixels
          points.push({ x: Math.round(a.x + (b.x - a.x) * t + nx * off), y: Math.round(a.y + (b.y - a.y) * t + ny * off) });
        }
      }
    }
  }
  const inside = (p) => marks.filter((m) => Math.hypot(p.x - m.x, p.y - m.y) <= m.r);
  // A point all but equally far from two centres (within 1px) is a tie, and either is right: left out.
  const clear = (p) => { const ds = inside(p).map((m) => Math.hypot(p.x - m.x, p.y - m.y)).sort((x, y) => x - y); return ds[1] - ds[0] > 1; };
  const usable = points.filter((p) => p.y > 60 && p.y < vh - 20 && inside(p).length >= 2 && clear(p));
  // Every overlap is tried, up to 160 taps (spread across the list).
  const step = Math.max(1, Math.ceil(usable.length / 160));
  const sample = usable.filter((_, k) => k % step === 0);
  pass(`${tag}: there are overlapping tap areas to try`, sample.length > 10, String(sample.length));
  let right = 0;
  const wrong = [];
  for (const p of sample) {
    const near = inside(p).sort((m1, m2) => Math.hypot(p.x - m1.x, p.y - m1.y) - Math.hypot(p.x - m2.x, p.y - m2.y))[0];
    await page.keyboard.press('Escape');
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(60);
    const open = await page.evaluate(() => document.querySelector('.hc-chart [data-tip][aria-describedby]')?.getAttribute('data-n') || null);
    if (open === near.n) right += 1;
    else wrong.push(`(${p.x.toFixed(0)},${p.y.toFixed(0)}) opened ${open}, nearest ${near.n}`);
  }
  pass(`${tag}: every tap in an overlap opens the nearest dot's pop-up (${right} of ${sample.length})`, wrong.length === 0, wrong.slice(0, 8).join(' | '));
  // A tap on a dot's own centre always opens that dot.
  let own = 0;
  for (const m of marks.filter((mm) => mm.y > 60 && mm.y < vh - 20)) {
    await page.keyboard.press('Escape');
    await page.touchscreen.tap(m.x, m.y);
    await page.waitForTimeout(60);
    const open = await page.evaluate(() => document.querySelector('.hc-chart [data-tip][aria-describedby]')?.getAttribute('data-n') || null);
    if (open === m.n) own += 1;
  }
  pass(`${tag}: a tap on any dot's centre opens that dot`, own === marks.filter((mm) => mm.y > 60 && mm.y < vh - 20).length, String(own));
  // The pop-up shows and stays on screen.
  const tipBox = await page.evaluate(() => { const t = document.querySelector('.ds-tip'); if (!t || t.hidden) return null; const r = t.getBoundingClientRect(); return { l: r.left, r: r.right }; });
  pass(`${tag}: the pop-up stays at least 12px inside the screen`, tipBox && tipBox.l >= 12 && tipBox.r <= WIDTH - 12, JSON.stringify(tipBox));
  await page.screenshot({ path: join(out, `chart-taps-${WIDTH}-${mode}.png`) });
  pass(`${tag}: no page errors`, problems.length === 0, problems.join(' | '));
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(join(out, 'report.txt'), results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail && !r.ok ? `: ${r.detail}` : ''}`).join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed (report: ${join(out, 'report.txt')})`);
process.exit(failed ? 1 : 0);
