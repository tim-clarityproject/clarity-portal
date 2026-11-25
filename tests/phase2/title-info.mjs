// A heading's or sentence's small icon (the ⓘ, the eye, the play icon) stays
// joined to its last word (rule 25, 29d; tidy pass item 1, 22 Nov): every
// `.ds-title-end` (PageHeader's and a guided step's titleWithAside, a
// nudge's endWithIcon, SentenceInfo) holds the last word and its icon, and
// the icon must sit on the same line as that word's last letter, never on a
// line of its own, at every text size up to twice and on a 360px phone,
// with its 44px tap area and no sideways scroll. Signed in as the invented
// test client on the TEST database only, reading (every other host,
// /functions/v1/ and every email call blocked; nothing is saved: every
// write to the database is answered locally).
//
//   node --import ./tests/scores/register.mjs tests/phase2/title-info.mjs <report file> [widths] [modes] [text sizes] [routes]
//   (defaults: 360,390,1280  dark  2,1  every route without a parameter)
//   APP_URL=http://localhost:5207 to use another server.
//
// (It looked for .ds-page-info-toggle until 22 Nov, which no page has had
// since the 5 Nov declutter, so it measured nothing.)
import { accountsText, TEST_HOST as TARGET_HOST } from '../target.mjs';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = TARGET_HOST;
const [out = '/dev/null', w = '360,390,1280', m = 'dark', sc = '2,1', only] = process.argv.slice(2);
const env = {};
for (const line of accountsText().split('\n')) { const mm = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (mm) env[mm[1]] = mm[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes(TARGET_HOST)) throw new Error('Not the test project.');
const ROUTES = (only ? only.split(',') : readFileSync('src/App.jsx', 'utf8').match(/path="[^"]*"/g).map((s) => s.slice(6, -1)).filter((p) => !p.includes(':') && !p.includes('*')).concat(['/design-reference']));

/** In the page: every title end with an icon, and whether the icon is on its word's last line. */
function measureTitleEnds() {
  const found = [];
  for (const end of document.querySelectorAll('.ui-root .ds-title-end')) {
    const icon = end.querySelector('.ds-page-aside svg, .ds-page-aside .ds-info, button svg, .ds-info, svg');
    if (!icon) continue;
    const ib = icon.getBoundingClientRect();
    if (!ib.width || !ib.height) continue;
    const walker = document.createTreeWalker(end, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('button, .ds-page-aside, .ds-sr, .sr-only')) last = n;
    if (!last) continue;
    const len = last.textContent.replace(/\s+$/, '').length;
    const rg = document.createRange(); rg.setStart(last, len - 1); rg.setEnd(last, len);
    const ch = rg.getBoundingClientRect();
    const mid = ib.top + ib.height / 2;
    const tap = end.querySelector('button, [role=button]')?.getBoundingClientRect();
    const owner = end.closest('h1, h2, h3, p, legend, label, div');
    found.push({
      text: (owner?.textContent || end.textContent).replace(/\s+/g, ' ').trim().slice(0, 48),
      joined: mid > ch.top && mid < ch.bottom,
      after: ib.left >= ch.right - 1,
      tap: tap ? Math.round(tap.height) : 0,
    });
  }
  return { found, sideways: document.documentElement.scrollWidth - innerWidth };
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
const rows = []; const bad = [];
try {
  for (const scale of sc.split(',').map(Number)) for (const width of w.split(',').map(Number)) for (const mode of m.split(',')) {
    const phone = width < 769;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
    await ctx.addInitScript((mo) => { try { localStorage.setItem('clarity-colour-mode', mo); } catch { /* private window */ } }, mode);
    await ctx.route('**/*', (r) => {
      const req = r.request(); const u = req.url();
      if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(u) || (/supabase\.co/.test(u) && !u.includes(TEST_HOST)) || /\/functions\/v1\//.test(u) || /\/api\//.test(new URL(u).pathname)) return r.abort();
      // Read only: anything that would write to the test project is answered here.
      if (u.includes(TEST_HOST) && /\/rest\/v1\//.test(u) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !/\/rpc\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return r.fallback();
    });
    const page = await ctx.newPage();
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL); await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter'); await page.waitForURL(/welcome/, { timeout: 30000 });
    for (const p of ROUTES) {
      if (/sign-up|reset-password|callback|^\/login$|^\/$|sign-out|logout/.test(p)) continue;
      await page.goto(`${APP}${p}`).catch(() => {});
      if (scale !== 1) await page.addStyleTag({ content: `html{font-size:${16 * scale}px !important}` }).catch(() => {});
      await page.waitForTimeout(1100);
      const r = await page.evaluate(measureTitleEnds).catch((e) => ({ found: [], err: e.message }));
      for (const o of r.found) {
        const line = `${scale}x ${width} ${mode} ${p} "${o.text}" joined ${o.joined} after ${o.after} tap height ${o.tap || '-'} sideways ${r.sideways}`;
        rows.push(line);
        if (!o.joined || !o.after || (o.tap && o.tap < 44) || r.sideways > 0) bad.push(line);
      }
    }
    await ctx.close();
    console.log(`done ${scale}x ${width} ${mode}: ${rows.length} icons, ${bad.length} not joined`);
  }
} finally {
  await browser.close();
}
writeFileSync(out, `${rows.join('\n')}\n\nBAD\n${bad.join('\n')}\n`);
console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${rows.length} title and sentence icons measured, ${bad.length} not joined to their last word`);
console.log(bad.slice(0, 30).join('\n'));
process.exit(bad.length || !rows.length ? 1 : 0);
