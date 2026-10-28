// Phase 2 step 1 checks in the running app: the Individual Performance
// Plan, its version history and the My Mission panel, signed in as the
// invented test client on the TEST database only (every other host and
// every email call is blocked). Seed the plan first with
// node --import ./tests/scores/register.mjs scripts/seed-test-plan.mjs
//
//   node tests/phase2/plan-page.mjs [folder for screenshots]
//
// At 1280px, 700px, 390px and 360px, in dark and light:
//  - the page shows the mission, 4 objective cards and 4 Strategy tiles;
//  - no sideways scrolling;
//  - at most one coral (primary) button;
//  - every button and link has a 44px tap area;
//  - no coral in any bar (mint for good, grey below the standard);
//  - the objective number's pop-up says "Outcome Objective 1", then the name,
//    12px inside both screen edges;
//  - a tile opens its detail (inline on a laptop, a panel on a phone);
//  - "How the system fits together" opens the pop-up; Escape closes it;
//  - the header's pill opens the My Mission panel;
//  - version history lists versions and one opens.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
let blocked = 0;
const blockedHosts = new Set();
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

function testAccount() {
  const env = {};
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return { email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD };
}

const browser = await chromium.launch();
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)'];

async function signedIn({ width, mode }) {
  const phone = width < 769;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    hasTouch: phone,
    isMobile: phone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
  });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    const note = () => blockedHosts.add(url.replace(/\?.*$/, '').slice(0, 80));
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) { blocked += 1; note(); return route.abort(); }
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) { blocked += 1; note(); return route.abort(); }
    if (/\/functions\/v1\//.test(url)) { blocked += 1; note(); return route.abort(); }
    return route.fallback();
  });
  const page = await context.newPage();
  const { email, password } = testAccount();
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  return { context, page, phone };
}

async function layoutChecks(page, tag) {
  const r = await page.evaluate((coral) => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && !el.closest('[hidden],[inert]');
    };
    const sideways = document.documentElement.scrollWidth - window.innerWidth;
    const primaries = [...document.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter(vis).length;
    // Tap areas: the element, or its ::after stretch, must reach 44px.
    const small = [];
    for (const el of document.querySelectorAll('.ipp-page button, .ipp-page a, .ipp-page [data-tip]')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const ah = parseFloat(after.height) || 0;
      const aw = parseFloat(after.width) || 0;
      const stretched = after.content !== 'none' && after.position === 'absolute' && (after.inset === '0px' || ah >= 44 || (after.top === '0px' && after.bottom === '0px'));
      if ((b.height >= 43.5 && b.width >= 43.5) || stretched || (ah >= 44 && (aw >= 44 || b.width >= 44))) continue;
      small.push(`${el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const coralBars = [...document.querySelectorAll('.ds-bar > span')].filter((s) => coral.includes(getComputedStyle(s).backgroundColor)).length;
    return {
      sideways,
      primaries,
      small,
      coralBars,
      mission: document.querySelector('.ds-mission-card-text')?.textContent || '',
      cards: document.querySelectorAll('.ds-objective').length,
      tiles: document.querySelectorAll('.ds-stile').length,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  }, CORAL);
  pass(`${tag}: plan content`, r.mission.includes('world-class') && r.cards === 4 && r.tiles === 4, `cards ${r.cards}, tiles ${r.tiles}`);
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: at most one coral button`, r.primaries <= 1, `${r.primaries}`);
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 6).join('; '));
  pass(`${tag}: no coral bars`, r.coralBars === 0, `${r.coralBars}`);
  return r;
}

const shot = async (page, name) => { if (out) await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };

for (const mode of ['dark', 'light']) {
  for (const width of [1280, 700, 390, 360]) {
    const tag = `${width}px ${mode}`;
    const { context, page, phone } = await signedIn({ width, mode });
    await page.goto(`${APP}/performance-plan`);
    await page.waitForSelector('.ds-stile', { timeout: 30000 });
    await page.waitForTimeout(400);
    const r = await layoutChecks(page, tag);
    pass(`${tag}: page follows the mode`, r.theme === mode, `${r.theme}`);
    await shot(page, `plan-${width}-${mode}`);

    if (width === 1280 || width === 390) {
      // The objective number's pop-up.
      const num = page.locator('.ds-stile .ds-onum--tip').first();
      await num.focus();
      await page.waitForTimeout(150);
      const tip = await page.evaluate(() => {
        const t = document.querySelector('.ds-tip:not([hidden])');
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { text: t.textContent, left: b.left, right: window.innerWidth - b.right };
      });
      pass(`${tag}: number pop-up`, Boolean(tip && /^Outcome Objective 1/.test(tip.text) && tip.left >= 12 && tip.right >= 12), JSON.stringify(tip));
      await page.keyboard.press('Escape');

      // A tile opens its detail.
      await page.locator('.ds-stile-btn').first().click();
      await page.waitForTimeout(500);
      if (phone) {
        const panel = await page.locator('.ds-dialog.ds-panel').count();
        pass(`${tag}: tile opens the panel`, panel === 1);
        await shot(page, `detail-${width}-${mode}`);
        await page.keyboard.press('Escape');
      } else {
        const detail = await page.locator('.ds-sdetail').count();
        pass(`${tag}: tile opens the detail`, detail === 1);
        await shot(page, `detail-${width}-${mode}`);
        await page.locator('.ds-sdetail .ds-icon-btn').click();
      }
      await page.waitForTimeout(500);

      // The system pop-up.
      await page.locator('.ds-page-meta .ds-info-link').click();
      await page.waitForTimeout(500);
      const sys = await page.evaluate(() => {
        const d = document.querySelector('.ds-popup');
        return d ? { text: d.textContent, overflow: d.scrollWidth - d.clientWidth } : null;
      });
      pass(`${tag}: system pop-up`, Boolean(sys && sys.text.includes('Your tactics go into each sprint') && !/[↓↑←→]/.test(sys.text)), sys ? '' : 'not open');
      await page.screenshot({ path: out ? `${out}/system-${width}-${mode}.png` : undefined });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      pass(`${tag}: Escape closes it`, (await page.locator('.ds-popup').count()) === 0);

      // The header pill opens the My Mission panel.
      await page.locator(phone ? '.hdr-phone .hdr-mis' : '.hdr-desktop .hdr-mis').click();
      await page.waitForSelector('.ds-drop', { timeout: 10000 });
      await page.waitForTimeout(500);
      const mp = await page.evaluate(() => {
        const d = document.querySelector('.ds-drop');
        const b = d.getBoundingClientRect();
        return { text: d.textContent, rows: d.querySelectorAll('.ds-mpanel-objectives li').length, bottom: window.innerHeight - b.bottom, top: b.top };
      });
      if (phone) pass(`${tag}: My Mission panel rises from the bottom`, Math.abs(mp.bottom) <= 1, `${mp.bottom}px from the bottom`);
      pass(`${tag}: My Mission panel`, mp.rows === 4 && mp.text.includes('Open my plan') && mp.text.includes('world-class'), JSON.stringify({ rows: mp.rows }));
      await page.screenshot({ path: out ? `${out}/mission-panel-${width}-${mode}.png` : undefined });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    if (width === 1280 || width === 390) {
      await page.goto(`${APP}/performance-plan/history`);
      await page.waitForSelector('.ds-row', { timeout: 20000 });
      const rows = await page.locator('.ds-row').count();
      pass(`${tag}: version history`, rows === 5, `${rows} rows`);
      await layoutHistory(page, tag);
      await shot(page, `history-${width}-${mode}`);
      await page.locator('.ds-row').first().click();
      await page.waitForSelector('.ipp-version-rows', { timeout: 20000 });
      const title = await page.locator('.ds-page-title').textContent();
      pass(`${tag}: one version opens`, /Version 3\.2/i.test(title), title);
      await shot(page, `version-${width}-${mode}`);
    }
    await context.close();
  }
}

async function layoutHistory(page, tag) {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  pass(`${tag}: history no sideways scroll`, sideways <= 0, `${sideways}px`);
}

// The milestone: Mark as done, then Undo, saved both ways.
{
  const { context, page } = await signedIn({ width: 1280, mode: 'dark' });
  await page.goto(`${APP}/performance-plan`);
  await page.waitForSelector('.ds-status-action-link', { timeout: 30000 });
  await page.locator('.ds-status-action-link').click();
  await page.waitForTimeout(800);
  const done = await page.locator('.ds-status-action-state--done').count();
  pass('Milestone: Mark as done shows Done', done === 1);
  await page.locator('.ds-toast-undo').click();
  await page.waitForTimeout(3000);
  await page.reload();
  await page.waitForSelector('.ds-status-action-link', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const after = await page.locator('.ds-status-action-state--done').count();
  pass('Milestone: Undo is saved', after === 0);
  await context.close();
}

await browser.close();
console.log(results.join('\n'));
console.log(`Blocked: ${[...blockedHosts].join(', ')}`);
console.log(`\n${failures === 0 ? 'All passed' : `${failures} failed`} (${blocked} outside or email calls blocked)`);
process.exit(failures ? 1 : 0);
