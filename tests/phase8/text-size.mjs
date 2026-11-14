// The two Visual tools (M10) at the largest text size, twice the standard
// (as tests/phase0e/app.mjs checks the older pages): on a phone, 390 by
// 844, every screen of the Team performance check and the Emotional wash
// must wrap rather than break. Nothing scrolls sideways, on the page or
// inside the tool; nothing that can be read or tapped runs off the side;
// and no tap area shrinks below 44px.
//
// Signed in as the invented test client on the TEST database; every other
// host, every server function and every email call is blocked. Each screen
// opens from answers put on the device, so nothing is saved.
//
//   node tests/phase8/text-size.mjs [folder for screenshots]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, M10, TEAM_PATH, WASH_PATH, block, clearTeamCheck, clearWash, m10Wash, readEnv, seedWash, signIn, sleep, until, withCoach } from './shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-text-size');
mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};

const TEAM = {
  people: M10.people.map((p, i) => ({ id: `m10-person-${i + 1}`, name: p.name, role: p.role, t: p.t[0], a: p.a[0], u: p.u[0] })),
  shared: false,
  last: { at: '2026-10-14T09:00:00.000Z', people: Object.fromEntries(M10.people.map((p, i) => [`m10-person-${i + 1}`, { t: p.t[1], a: p.a[1], u: p.u[1] }])) },
};
// [name, tool, the step it opens on, what to press once it is open]
const SCREENS = [
  ['team, who reports to you', 'team', 0],
  ['team, trust', 'team', 1],
  ['team, your team', 'team', 16],
  ['team, your team with the table', 'team', 16, 'table'],
  ['wash, what happened', 'wash', 0],
  ['wash, the kind of feeling', 'wash', 1],
  ['wash, the words', 'wash', 2],
  ['wash, related to', 'wash', 3],
  ['wash, the story', 'wash', 4, 'example'],
  ['wash, is it true', 'wash', 5],
  ['wash, park and reflect', 'wash', 8],
  ['wash, how will you wash it', 'wash', 12],
  ['wash, accept and act', 'wash', 16],
  ['wash, your wash', 'wash', 17],
];

// Runs in the page: what scrolls sideways, what runs off the side, what is too small to tap.
function measure() {
  const root = [...document.querySelectorAll('.ds-guide')].pop();
  const scroller = root.querySelector('.ds-guide-scroll');
  const wide = window.innerWidth;
  const outp = { sideways: Math.max(document.documentElement.scrollWidth - wide, scroller.scrollWidth - scroller.clientWidth), off: [], small: [], size: getComputedStyle(root.querySelector('.ds-guide-question, .ds-guide-nudge, .ds-guide-plan-line, .ds-headline')).fontSize };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert], [hidden], [aria-hidden=true], .ds-sr');
  };
  for (const el of root.querySelectorAll('h1, h2, h3, p, button, a, textarea, input, small, th, td, .ds-guide-label, .ds-guide-name, .ds-answer, .ds-chip, .ds-seg-btn, .ds-guide-plan-line')) {
    if (!visible(el)) continue;
    // Back's 44px tap area is invisible and may reach past the edge; what shows is its chevron (rule 29t).
    const r = (el.matches('.ds-guide-back') ? el.querySelector('.ds-chevron') : el).getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 40);
    // A button's words stay inside its pill.
    if (el.matches('.ds-btn')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect();
      if (w.left < r.left - 0.5 || w.right > r.right + 0.5 || w.top < r.top - 0.5 || w.bottom > r.bottom + 0.5) outp.off.push(`${name}: its words run outside the button`);
    }
    if (r.left < -0.5 || r.right > wide + 0.5) outp.off.push(`${name} ${r.left.toFixed(0)} to ${r.right.toFixed(0)}`);
    // Words cut off inside their own box.
    if (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).overflowX !== 'visible' && !el.matches('textarea, input')) outp.off.push(`${name} is cut off by ${el.scrollWidth - el.clientWidth}px`);
    const tap = el.getBoundingClientRect();
    // A shared part may reach 44px through its ::before or ::after (a pill in a segmented control).
    const stretch = (ps) => ps.content !== 'none' && ps.position === 'absolute' && (parseFloat(ps.height) || 0) >= 43.5 && (parseFloat(ps.width) || 0) >= 43.5;
    const reaches = stretch(getComputedStyle(el, '::after')) || stretch(getComputedStyle(el, '::before'));
    if (el.matches('button, a[href], textarea, input') && !reaches && (tap.width < 43.5 || tap.height < 43.5)) outp.small.push(`${name} ${tap.width.toFixed(1)}x${tap.height.toFixed(1)}`);
  }
  return outp;
}

const env = readEnv();
const browser = await chromium.launch();
try {
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: true, isMobile: true });
    await block(ctx);
    await withCoach(ctx, M10.coach);
    await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    await signIn(page, env);
    for (const [name, tool, index, press] of SCREENS) {
      const tag = `${name}, twice the text size, ${mode}`;
      try {
        // Away from the tool first, so the screen before can't keep its own answers again as it closes.
        await page.goto(`${APP}/version.json`);
        await clearTeamCheck(page);
        await clearWash(page);
        if (tool === 'wash') {
          await seedWash(page, { wash: m10Wash(index === 17 ? 'sum' : 'steps'), index });
        } else {
          await page.evaluate(({ c, at }) => {
            let uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
            if (!uid) { try { uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id; } catch { /* none */ } }
            localStorage.setItem(`clarity-draft:${uid}:team-check:new`, JSON.stringify({ v: { id: '66666666-6666-4666-8666-666666666666', check: c, status: 'new', saved: false, createdAt: null, finishedAt: null }, at: Date.now() }));
            localStorage.setItem(`ds-guide:team-check-${uid}-new`, JSON.stringify({ index: at, skipped: [] }));
            localStorage.setItem('clarity-tool-answers-not-yet', String(Date.now()));
          }, { c: TEAM, at: index });
        }
        await page.goto(`${APP}${tool === 'wash' ? WASH_PATH : TEAM_PATH}`);
        // The device's text-size setting, as a root size (16px is standard).
        await page.addStyleTag({ content: 'html{font-size:32px !important}' });
        await page.waitForSelector('.ds-guide-question, .ds-guide-title', { timeout: 20000 });
        await until(async () => (await page.locator('.ds-namerow, .ds-answer, .ds-steprow, .ds-guide-body textarea, .ds-guide-plan-row').count()) > 0, 15000);
        await page.evaluate(() => document.fonts.ready);
        await sleep(4200); // "Draft restored" goes
        if (press === 'table') { await page.locator('.ds-ctable-fold .ds-link').click(); await sleep(900); }
        if (press === 'example') { await page.locator('.ds-guide-example-link').click(); await sleep(600); }
        const m = await page.evaluate(measure);
        pass(`${tag}: the text is twice the standard size`, parseFloat(m.size) >= 28, m.size);
        pass(`${tag}: no sideways scroll`, m.sideways <= 0, `${m.sideways}px`);
        pass(`${tag}: nothing runs off the side or is cut off`, m.off.length === 0, m.off.slice(0, 5).join(' | '));
        pass(`${tag}: every tap area is still 44px`, m.small.length === 0, m.small.slice(0, 5).join(' | '));
        if (mode === 'light') await page.screenshot({ path: join(out, `large-text-${name.replace(/[ ,]+/g, '-')}.png`), fullPage: false });
      } catch (error) {
        pass(`${tag}: opened`, false, `${error.message}`.split('\n')[0]);
      }
    }
    pass(`twice the text size, ${mode}: no page errors`, errors.length === 0, errors.join(' | '));
    await page.goto(`${APP}/version.json`);
    await clearTeamCheck(page);
    await clearWash(page);
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
