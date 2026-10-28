// The page title's "i" (the shared PageHeader), on every page that has
// one, signed in as the invented test client on the TEST database only
// (every other host and every email call is blocked). CLAUDE.md rule 25
// and Tim, 28 Oct: the "i" sits 6px after the title's last word, on the
// last line when the title wraps, centred on that line's capitals, never
// alone on a line, with its 44px tap area.
//
//   node tests/phase2/title-info.mjs <report file> [widths] [modes] [text sizes] [routes]
//   (defaults: 1280,700,390,360  dark,light  1,2  every route without a parameter)
//
// Measures the gap from the last letter (less its letter-spacing, which is
// empty space) to the icon's visible edge, and the icon's centre against
// the middle of the capitals from the font's metrics.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
const APP = 'http://localhost:5173', TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const [out, w = '1280,700,390,360', m = 'dark,light', sc = '1,2', only] = process.argv.slice(2);
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const mm = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (mm) env[mm[1]] = mm[2].replace(/^['"]|['"]$/g, ''); }
const ROUTES = (only ? only.split(',') : readFileSync('src/App.jsx', 'utf8').match(/path="[^"]*"/g).map((s) => s.slice(6, -1)).filter((p) => !p.includes(':') && !p.includes('*')).concat(['/design-reference']));
const browser = await chromium.launch();
const rows = []; const bad = [];
for (const scale of sc.split(',').map(Number)) for (const width of w.split(',').map(Number)) for (const mode of m.split(',')) {
  const phone = width < 769;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
  await ctx.addInitScript((mo) => { try { localStorage.setItem('clarity-colour-mode', mo); } catch {} }, mode);
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(u) || (/supabase\.co/.test(u) && !u.includes(TEST_HOST)) || /\/functions\/v1\//.test(u)) return r.abort(); return r.fallback(); });
  const page = await ctx.newPage();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL); await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter'); await page.waitForURL(/welcome/, { timeout: 30000 });
  for (const p of ROUTES) {
    if (/sign-up|reset-password|callback|^\/login$|^\/$/.test(p)) continue;
    await page.goto(`${APP}${p}`).catch(() => {});
    if (scale !== 1) await page.addStyleTag({ content: `html{font-size:${16 * scale}px !important}` }).catch(() => {});
    await page.waitForTimeout(1100);
    const r = await page.evaluate(() => {
      const out = [];
      for (const btn of document.querySelectorAll('.ds-page-info-toggle')) {
        const svg = btn.querySelector('.ds-info'); const b = svg.getBoundingClientRect(); if (!b.width) continue;
        const h = btn.closest('.ds-page-title-row').querySelector('.ds-page-title');
        const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let last = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) last = n;
        const end = last.textContent.replace(/\s+$/, '').length;
        const rg = document.createRange(); rg.setStart(last, end - 1); rg.setEnd(last, end);
        const ch = rg.getBoundingClientRect();
        const cs = getComputedStyle(last.parentElement);
        const ls = parseFloat(cs.letterSpacing) || 0;
        const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const mt = c.measureText('H');
        // The character's box is the font's content area: its baseline sits fontBoundingBoxAscent below the top.
        const base = ch.top + (ch.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 + mt.fontBoundingBoxAscent;
        const cap = base - mt.actualBoundingBoxAscent / 2;
        const lines = [...h.getClientRects()].length > 1 ? new Set([...h.getClientRects()].map((x) => Math.round(x.top))).size : Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight));
        const tb = btn.getBoundingClientRect();
        out.push({ title: h.textContent.trim().slice(0, 40), gap: +(b.left - (ch.right - ls)).toFixed(2), gapRaw: +(b.left - ch.right).toFixed(2), off: +(b.top + b.height / 2 - cap).toFixed(2), sameLine: Math.abs((b.top + b.height / 2) - (ch.top + ch.height / 2)) < ch.height / 2, lines, tap: `${Math.round(tb.width)}x${Math.round(tb.height)}`, over: Math.round(tb.right - innerWidth), size: b.width });
      }
      return { out, sideways: document.documentElement.scrollWidth - innerWidth };
    }).catch((e) => ({ out: [], err: e.message }));
    for (const o of r.out) {
      const line = `${scale}x ${width} ${mode} ${p} "${o.title}" gap ${o.gap} (raw ${o.gapRaw}) off ${o.off} lines ${o.lines} same ${o.sameLine} tap ${o.tap} over ${o.over} sideways ${r.sideways}`;
      rows.push(line);
      if (Math.abs(o.gap - 6) > 0.75 || Math.abs(o.off) > 1 || !o.sameLine || o.tap !== '44x44' || r.sideways > 0) bad.push(line);
    }
  }
  await ctx.close();
  console.log(`done ${scale}x ${width} ${mode}: ${rows.length} rows, ${bad.length} bad`);
}
await browser.close();
writeFileSync(out, rows.join('\n') + '\n\nBAD\n' + bad.join('\n'));
console.log(`rows ${rows.length}, bad ${bad.length}`); console.log(bad.slice(0, 40).join('\n'));
process.exit(bad.length || !rows.length ? 1 : 0);
