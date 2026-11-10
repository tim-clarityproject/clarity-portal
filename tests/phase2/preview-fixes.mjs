// Tim's preview check (Tue 3 Nov 2026, 13:05 to 14:18): one measured check
// per fix, in the running app, signed in as the invented test client on the
// TEST database only. Every other host and every email call is blocked, and
// nothing is written: every write to the database is answered here as if it
// had saved, and recorded, so the plan-part check can read what would have
// been sent (the test client's plan and versions are never changed).
//
//   node tests/phase2/preview-fixes.mjs [report file] [folder for screenshots]
//   ONLY=info,bars,days,greeting,part,pill,dial,hyphens to run some parts
//
// 1. info:     every ⓘ on the pages listed floats: hovering, clicking and
//              tapping it moves nothing on the page (every element's box
//              measured before and after), its pop-up sits 12px inside both
//              screen edges, flips below its ⓘ when there's no room above,
//              closes when the pointer leaves, stays after a click until a
//              second click, a click away or Escape, and opens on tap.
// 2. bars:     every bar in Log today and Log this week (the sprint and
//              Home) shows the same value as the figure above it, from zero
//              to its target ("0 of 10,000 steps today" is an empty bar).
// 3. days:     Recovery's day counter: the value is centred in the pill with
//              and without "suggested", and doesn't move between them.
// 4. greeting: no ⓘ after a greeting ("Welcome back, Sam"); every other
//              page title keeps its ⓘ.
// 5. part:     the Mission, an objective, a Strategy and a habit each open on
//              their own in the slide-across panel, save by themselves with
//              "Saved" (no Save button), and leave with the same version as
//              Edit my plan (minor for a name, major for the mission).
// 6. pill:     in Safari's engine (WebKit) at iPhone 16 size, portrait and
//              landscape, and at 360 and 430 wide: the mission reads from
//              the left after its label, at most two lines, never "…",
//              never broken at a hyphen; no desktop menu button on a phone
//              (the phone bar shows instead, upright and turned).
// 7. dial:     Home's dial line reads "Sprint N, week X of Y" with the
//              portal's chevron, one button with one name ("Open Sprint N,
//              week X of Y") and at least 44px tall; on a laptop it
//              underlines in coral on hover and focus; nothing else moves.
// 8. hyphens:  on the main pages at phone widths, no word is broken at its
//              hyphen anywhere.
import { chromium, webkit, devices } from 'playwright';
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
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};
const note = (s) => { results.push(`NOTE  ${s}`); console.log(`NOTE  ${s}`); };

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('Not the test project.');

// Wait until the page has drawn and nothing is moving.
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

let storage = null;
const writes = [];
async function open(engine, { width = 1280, height = 900, phone, mode = 'dark', device } = {}) {
  const isPhone = phone ?? width < 769;
  const ctx = await engine.newContext({
    ...(device ? devices[device] : {}),
    viewport: { width, height },
    hasTouch: isPhone,
    isMobile: engine === webkit ? undefined : isPhone,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: mode,
    storageState: storage || undefined,
  });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    if (url.includes(TEST_HOST) && /\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      // Never written: answered as saved, and kept for the checks.
      writes.push({ method: req.method(), table: new URL(url).pathname.split('/').pop(), body: req.postData() || '' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  if (!storage) {
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(/welcome/, { timeout: 30000 });
    storage = await ctx.storageState();
  }
  return { ctx, page };
}

async function go(page, path, ready) {
  await page.goto(`${APP}${path}`);
  if (ready) await page.waitForSelector(ready, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  await still(page);
}

// Every element's box on the page (in page coordinates), to tell whether
// anything moved.
const boxes = (page) => page.evaluate(() => {
  const list = [];
  for (const el of document.querySelectorAll('.ui-root *:not(.ds-portal):not(.ds-portal *)')) {
    if (el.closest('.ds-portal, .ds-infopop, .hdr, .ds-phone-bar, .ds-toast-region')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    list.push(`${Math.round(r.left)},${Math.round(r.top + scrollY)},${Math.round(r.width)},${Math.round(r.height)}`);
  }
  return list;
});
const moved = (a, b) => {
  if (a.length !== b.length) return `elements ${a.length} then ${b.length}`;
  const n = a.findIndex((x, i) => x !== b[i]);
  return n < 0 ? '' : `element ${n} ${a[n]} then ${b[n]}`;
};

const popInfo = (page) => page.evaluate(() => {
  const pop = [...document.querySelectorAll('.ds-infopop')].find((p) => !p.hidden);
  if (!pop) return null;
  const r = pop.getBoundingClientRect();
  return { left: r.left, right: innerWidth - r.right, top: r.top, bottom: innerHeight - r.bottom, text: pop.textContent.slice(0, 60) };
});

const browsers = {};
const launch = async (name) => { browsers[name] = browsers[name] || await (name === 'webkit' ? webkit : chromium).launch(); return browsers[name]; };

// ------------------------------------------------------------------ 1. info
const INFO_PAGES = [
  ['/performance-sprint', 'Performance Sprint'],
  ['/performance-plan', 'Individual Performance Plan'],
  ['/personal', 'Personal hub'],
  ['/personal/plan', 'Plan hub'],
  ['/strategic', 'Strategic hub'],
  ['/daily-journal', 'an older page'],
  ['/design-reference', 'the design gallery'],
];
if (part('info')) {
  const b = await launch('chromium');
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const { ctx, page } = await open(b, { width: w, height: h });
    // The test client is back from a Recovery today, so the sprint greets
    // them ("Welcome back", no ⓘ). Answered here with no Recovery, so the
    // sprint shows its own title and the ⓘ Tim pointed at.
    await ctx.route(/rest\/v1\/recovery_periods/, (route) => (route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fallback()));
    const phone = w < 769;
    for (const [path, name] of INFO_PAGES) {
      await go(page, path, '.ds-page-info-toggle, .ds-help-toggle, .ds-guide-i');
      const icons = page.locator('.ds-page-info-toggle:visible, .ds-help-toggle:visible, .ds-guide-i:visible');
      const count = await icons.count();
      if (!count) { note(`${w} ${name}: no ⓘ on screen`); continue; }
      for (let i = 0; i < Math.min(count, 3); i += 1) {
        const icon = icons.nth(i);
        await icon.scrollIntoViewIfNeeded();
        await still(page);
        const before = await boxes(page);
        if (phone) {
          await icon.tap();
        } else {
          await icon.hover();
        }
        await still(page);
        const shown = await popInfo(page);
        const after = await boxes(page);
        pass(`info ${w} ${name} ⓘ ${i + 1}: opens (${phone ? 'tap' : 'hover'})`, Boolean(shown));
        pass(`info ${w} ${name} ⓘ ${i + 1}: nothing on the page moves`, !moved(before, after), moved(before, after));
        if (shown) pass(`info ${w} ${name} ⓘ ${i + 1}: 12px inside both edges`, shown.left >= 11.5 && shown.right >= 11.5 && shown.top >= 11.5 && shown.bottom >= 11.5, JSON.stringify(shown));
        if (!phone) {
          await page.mouse.move(2, h - 2);
          await still(page);
          pass(`info ${w} ${name} ⓘ ${i + 1}: closes when the pointer leaves`, !(await popInfo(page)));
          await icon.click();
          await page.mouse.move(2, h - 2);
          await still(page);
          pass(`info ${w} ${name} ⓘ ${i + 1}: a click keeps it open`, Boolean(await popInfo(page)));
          await icon.click();
          await still(page);
          pass(`info ${w} ${name} ⓘ ${i + 1}: a second click closes it`, !(await popInfo(page)));
          await icon.click();
          await page.keyboard.press('Escape');
          await still(page);
          pass(`info ${w} ${name} ⓘ ${i + 1}: Escape closes it`, !(await popInfo(page)));
        } else {
          await page.mouse.click(4, Math.round(h / 2));
          await still(page);
          pass(`info ${w} ${name} ⓘ ${i + 1}: a tap away closes it`, !(await popInfo(page)));
        }
      }
    }
    // Flips below: the page title's ⓘ scrolled to the very top.
    await go(page, '/performance-plan', '.ds-page-info-toggle');
    const t = page.locator('.ds-page-info-toggle').first();
    // No ⓘ beside page titles any more (Tim's rules of 5 Nov).
    if (!(await t.count())) {
      note(`${w}: the plan's title has no ⓘ (rules of 5 Nov), so the flip below isn't measured here`);
      await ctx.close();
      continue;
    }
    await page.evaluate(() => { const el = document.querySelector('.ds-page-info-toggle'); scrollTo(0, scrollY + el.getBoundingClientRect().top - 14); });
    await still(page);
    if (phone) await t.tap(); else await t.hover();
    await still(page);
    const flip = await page.evaluate(() => {
      const pop = [...document.querySelectorAll('.ds-infopop')].find((p) => !p.hidden);
      const i = document.querySelector('.ds-page-info-toggle .ds-info').getBoundingClientRect();
      return pop ? { below: pop.getBoundingClientRect().top >= i.bottom, top: pop.getBoundingClientRect().top } : null;
    });
    pass(`info ${w}: with no room above, it flips below its ⓘ`, Boolean(flip?.below), JSON.stringify(flip));
    if (shots) await page.screenshot({ path: `${shots}/info-${w}.png` });
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 2. bars
if (part('bars')) {
  const b = await launch('chromium');
  for (const w of [1280, 390]) {
    const { ctx, page } = await open(b, { width: w });
    for (const [path, name] of [['/performance-sprint', 'the sprint'], ['/welcome', 'Home']]) {
      for (const view of ['day', 'week']) {
        await go(page, path, '.ds-log');
        if (view === 'week') {
          // The sprint's "Log by" switch (Home logs today only).
          if (path === '/welcome') continue;
          await page.locator('[aria-label="Log by"]').getByText('This week', { exact: true }).click();
          await still(page);
        }
        const rows = await page.evaluate(() => [...document.querySelectorAll('.ds-log')].map((r) => {
          const detail = r.querySelector('.ds-log-detail')?.textContent || '';
          const bar = r.querySelector(':scope > .ds-bar');
          const fill = bar?.firstElementChild;
          return { name: r.querySelector('.ds-log-name')?.textContent, detail, bar: bar ? fill.getBoundingClientRect().width / bar.getBoundingClientRect().width : null };
        }));
        let checked = 0;
        for (const r of rows) {
          if (r.bar == null) continue;
          const m = /^([\d,.]+)\D*? of ([\d,.]+)/.exec(r.detail);
          const done = /^Done this week/.test(r.detail);
          const once = /^(Once|Not yet) this week/.test(r.detail);
          if (!m && !done && !once) continue; // limits and ratings: the habit's score
          const want = m ? Math.min(1, Number(m[1].replace(/,/g, '')) / Number(m[2].replace(/,/g, ''))) : (done ? 1 : 0);
          checked += 1;
          pass(`bars ${w} ${name} (${view}) ${r.name}: "${r.detail}" bar ${Math.round(r.bar * 100)}%`, Math.abs(r.bar - want) < 0.015, `should be ${Math.round(want * 100)}%`);
        }
        if (!checked) note(`bars ${w} ${name} (${view}): no row with a target figure on screen`);
      }
    }
    await ctx.close();
  }
}

if (part('bars')) {
  const b = await launch('chromium');
  const { ctx, page } = await open(b, { width: 1280 });
  await go(page, '/performance-sprint', '.ds-log');
  const row = page.locator('.ds-log').filter({ has: page.locator('.ds-num-input') }).first();
  if (await row.count()) {
    writes.length = 0;
    const box = row.locator('.ds-num-input');
    await box.fill('');
    await box.evaluate((el) => {
      const dt = new DataTransfer(); dt.setData('text/plain', '12,000');
      el.focus();
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    });
    await box.fill('12,000');
    const typed = await box.inputValue();
    await box.blur();
    await page.waitForTimeout(1500);
    const sent = writes.filter((x) => x.table === 'habit_logs').map((x) => x.body).join(' ');
    pass('bars: "12,000" typed or pasted into a daily amount is 12,000, never 12', /12000/.test(typed) && /"value":12000\b/.test(sent), `box "${typed}", sent ${sent.slice(0, 120)}`);
  } else note('bars: no daily amount row to paste into');
  await ctx.close();
}

// ------------------------------------------------------------------ 3. days
if (part('days')) {
  const b = await launch('chromium');
  for (const w of [1280, 390]) {
    for (const scale of [1, 2]) {
      const { ctx, page } = await open(b, { width: w });
      await go(page, '/recovery', '.ds-daycount');
      if (scale !== 1) { await page.addStyleTag({ content: 'html{font-size:32px !important}' }); await still(page); }
      if (!(await page.locator('.ds-daycount').count())) { note(`days ${w}: no day counter (a Recovery is open on the test client?)`); await ctx.close(); continue; }
      const measure = () => page.evaluate(() => {
        const pill = document.querySelector('.ds-daycount').getBoundingClientRect();
        const v = document.querySelector('.ds-daycount-value > span').getBoundingClientRect();
        const sug = document.querySelector('.ds-daycount-value small');
        const s = sug?.getBoundingClientRect();
        return { text: document.querySelector('.ds-daycount-value > span').textContent, off: (v.top + v.height / 2) - (pill.top + pill.height / 2), top: v.top, sugShown: sug && getComputedStyle(sug).visibility !== 'hidden', sugInside: !s || (s.top >= pill.top && s.bottom <= pill.bottom), pillH: pill.height };
      });
      const a = await measure();
      await page.getByRole('button', { name: 'One day more' }).click();
      await still(page);
      const c = await measure();
      pass(`days ${w} ${scale}x: "${a.text}" with "suggested" is centred in the pill`, a.sugShown && Math.abs(a.off) <= 0.75, `off ${a.off.toFixed(2)}px`);
      pass(`days ${w} ${scale}x: "suggested" sits inside the pill`, a.sugInside);
      pass(`days ${w} ${scale}x: "${c.text}" without "suggested" is centred in the pill`, !c.sugShown && Math.abs(c.off) <= 0.75, `off ${c.off.toFixed(2)}px`);
      pass(`days ${w} ${scale}x: nothing moves when "suggested" goes`, Math.abs(a.top - c.top) < 0.5 && Math.abs(a.pillH - c.pillH) < 0.5, `top ${a.top} then ${c.top}`);
      if (shots && scale === 1) await page.locator('.ds-daycount').screenshot({ path: `${shots}/days-${w}.png` });
      await ctx.close();
    }
  }
}

// ------------------------------------------------------------------ 4. greeting
if (part('greeting')) {
  const b = await launch('chromium');
  const { ctx, page } = await open(b, { width: 1280 });
  for (const path of ['/welcome', '/performance-sprint', '/recovery/today']) {
    await go(page, path, '.ds-page-title');
    const r = await page.evaluate(() => [...document.querySelectorAll('.ds-page-title-row')].map((row) => ({ title: row.querySelector('.ds-page-title').textContent, i: Boolean(row.querySelector('.ds-page-info-toggle')) })));
    for (const t of r) {
      const greeting = /^(Welcome back|Good to see you|Good (morning|afternoon|evening))/i.test(t.title);
      if (greeting) pass(`greeting ${path} "${t.title}": no ⓘ`, !t.i);
      else if (path === '/performance-sprint') pass(`greeting ${path} "${t.title}": no ⓘ beside the title (rules of 5 Nov)`, !t.i);
      else note(`greeting ${path} "${t.title}" is not a greeting (ⓘ ${t.i ? 'shown' : 'none'})`);
    }
  }
  for (const path of ['/performance-plan', '/personal']) {
    await go(page, path, '.ds-page-title');
    pass(`greeting: ${path} has no ⓘ beside its title (rules of 5 Nov)`, (await page.locator('.ds-page-info-toggle').count()) === 0);
  }
  await ctx.close();
}

// ------------------------------------------------------------------ 5. part
if (part('part')) {
  const b = await launch('chromium');
  for (const w of [1280, 390]) {
    const { ctx, page } = await open(b, { width: w });
    const phone = w < 769;
    // The plan page no longer shows its version (calm layout, 10 Nov): the plan's history does.
    await page.goto(`${APP}/performance-plan/history`);
    await page.waitForFunction(() => /Version \d+\.\d+/.test(document.body.innerText), null, { timeout: 30000 });
    const version = (await page.locator('body').innerText()).match(/Version (\d+)\.(\d+)/);
    await go(page, '/performance-plan', '.ds-mission-card');
    const [major, minor] = version ? [Number(version[1]), Number(version[2])] : [0, 0];
    const panel = page.locator('.ds-panel:has(.plan-part)');
    const editAndLeave = async (label, typeInto, words, how) => {
      writes.length = 0;
      await page.getByRole('button', { name: label }).first().click();
      await page.waitForSelector('.ds-panel .plan-part', { timeout: 10000 });
      await still(page);
      const title = (await panel.locator('.ds-dialog-title').textContent()).trim();
      pass(`part ${w} ${label}: opens on its own, titled "${title}"`, title === label.split(':')[0]);
      pass(`part ${w} ${label}: no Save button`, (await panel.getByRole('button', { name: /^Save/ }).count()) === 0);
      const box = panel.locator(typeInto).first();
      await box.click();
      await box.press('End');
      await box.type(words, { delay: 20 });
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.ds-panel .ds-dialog-foot')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      pass(`part ${w} ${label}: shows "Saved" by itself`, /Saved/.test(await panel.locator('.ds-dialog-foot').innerText()));
      if (how === 'escape') await page.keyboard.press('Escape');
      else await panel.getByRole('button', { name: 'Done' }).click();
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.ds-toast-region')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      const toast = await page.locator('.ds-toast-region').innerText().catch(() => '');
      const versionWrite = writes.find((x) => x.table === 'plan_versions');
      return { toast, versionWrite, writes: [...writes] };
    };
    const tag = Date.now().toString().slice(-4);
    // A Strategy's name: a minor version.
    if (!phone) {
      await page.locator('.ds-stile-btn').first().click();
    } else {
      await page.locator('.ds-stile-btn').first().click();
      await page.waitForSelector('.ds-panel', { timeout: 8000 });
    }
    await still(page);
    let r = await editAndLeave('Edit this Strategy', 'input, textarea', ` ${tag}`, 'done');
    const v1 = r.versionWrite && JSON.parse(r.versionWrite.body);
    const row1 = Array.isArray(v1) ? v1[0] : v1;
    pass(`part ${w} Strategy: sends the Strategy and a minor version ${major}.${minor + 1}`, r.writes.some((x) => x.table === 'plan_strategies' && x.body.includes(tag)) && row1?.kind === 'minor' && row1?.major === major && row1?.minor === minor + 1, `${r.writes.map((x) => x.table).join(', ')} ${row1 ? `${row1.kind} ${row1.major}.${row1.minor}` : 'no version'}`);
    pass(`part ${w} Strategy: says "Saved. Your plan is now Version ${major}.${minor + 1}."`, r.toast.includes(`Saved. Your plan is now Version ${major}.${minor + 1}.`), r.toast);
    if (phone) { await page.keyboard.press('Escape'); await still(page); }
    await go(page, '/performance-plan', '.ds-mission-card');
    // An objective's name, closed with Escape: a minor version.
    r = await editAndLeave('Edit this objective', 'input, textarea', ` ${tag}`, 'escape');
    pass(`part ${w} objective: Escape saves and leaves the same way, with a minor version`, r.writes.some((x) => x.table === 'outcome_objectives' && x.body.includes(tag)) && /"kind":"minor"/.test(r.versionWrite?.body || ''), r.writes.map((x) => x.table).join(', '));
    await go(page, '/performance-plan', '.ds-mission-card');
    // The mission: a major version, as Edit my plan.
    r = await editAndLeave('Edit my mission', 'textarea, input', ` ${tag}`, 'done');
    pass(`part ${w} mission: saves the mission with a major version, as Edit my plan`, r.writes.some((x) => x.table === 'performance_plans' && x.body.includes(tag)) && /"kind":"major"/.test(r.versionWrite?.body || ''), r.writes.map((x) => x.table).join(', '));
    // A habit, from the Strategy's detail.
    await go(page, '/performance-plan', '.ds-mission-card');
    await page.locator('.ds-stile-btn').first().click();
    await still(page);
    if (await page.getByRole('button', { name: /^Edit this habit/ }).count()) {
      r = await editAndLeave('Edit this habit', '.plan-part input[type=text], .plan-part textarea', ` ${tag}`, 'done');
      pass(`part ${w} habit: saves the habit with a minor version`, r.writes.some((x) => x.table === 'habits' && x.body.includes(tag)) && /"kind":"minor"/.test(r.versionWrite?.body || ''), r.writes.map((x) => x.table).join(', '));
    } else note(`part ${w}: the first Strategy has no habit`);
    // Clearing a name to retype it never removes the part.
    await go(page, '/performance-plan', '.ds-mission-card');
    writes.length = 0;
    await page.getByRole('button', { name: 'Edit this objective' }).first().click();
    await page.waitForSelector('.ds-panel .plan-part');
    const nameBox = page.locator('.ds-panel .plan-part input, .ds-panel .plan-part textarea').first();
    await nameBox.fill('');
    await page.waitForTimeout(1500);
    pass(`part ${w}: clearing an objective's name to retype it archives and deletes nothing`, !writes.some((x) => x.method === 'DELETE' || /archived_at/.test(x.body)), writes.map((x) => `${x.method} ${x.table}`).join(', '));
    pass(`part ${w}: clearing one objective's name re-sends no other objective`, writes.filter((x) => x.table === 'outcome_objectives').length === 0, writes.map((x) => `${x.method} ${x.table}`).join(', '));
    pass(`part ${w}: an unfinished objective says what's needed`, (await page.locator('.ds-panel .plan-part-hint').count()) === 1);
    await page.keyboard.press('Escape');
    await still(page);
    // Opened and closed with no change: no version, nothing said.
    await go(page, '/performance-plan', '.ds-mission-card');
    writes.length = 0;
    await page.getByRole('button', { name: 'Edit my mission' }).click();
    await page.waitForSelector('.ds-panel .plan-part');
    await still(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    pass(`part ${w}: closed with no change, nothing is sent and no version kept`, writes.length === 0, writes.map((x) => `${x.method} ${x.table}`).join(', '));
    pass(`part ${w}: closed with no change, no "Saved"`, !/Saved/.test(await page.locator('.ds-toast-region').innerText().catch(() => '')));
    // Clearing the mission to rewrite it never saves an empty mission.
    writes.length = 0;
    await page.getByRole('button', { name: 'Edit my mission' }).click();
    await page.waitForSelector('.ds-panel .plan-part');
    await page.locator('.ds-panel .plan-part textarea, .ds-panel .plan-part input').first().fill('');
    await page.waitForTimeout(1500);
    pass(`part ${w}: clearing the mission sends no empty mission`, !writes.some((x) => x.table === 'performance_plans' && /"mission":(null|"")/.test(x.body)), writes.map((x) => `${x.method} ${x.table} ${x.body.slice(0, 60)}`).join(' | '));
    pass(`part ${w}: an empty mission says what's needed`, (await page.locator('.ds-panel .plan-part-hint').innerText().catch(() => '')).includes('Write your mission'));
    await page.keyboard.press('Escape');
    await still(page);

    // Back with a panel open (in the app: the sprint, then Open my plan):
    // the change is sent and its version kept.
    await go(page, '/performance-sprint', '.ds-sdial');
    await page.getByRole('button', { name: 'Open my plan' }).last().click();
    await page.waitForSelector('.ds-mission-card');
    await still(page);
    writes.length = 0;
    await page.getByRole('button', { name: 'Edit this objective' }).first().click();
    await page.waitForSelector('.ds-panel .plan-part');
    await page.locator('.ds-panel .plan-part input, .ds-panel .plan-part textarea').first().press('End');
    await page.locator('.ds-panel .plan-part input, .ds-panel .plan-part textarea').first().type(' B');
    await page.waitForTimeout(1200);
    await page.goBack();
    await page.waitForTimeout(2500);
    pass(`part ${w}: Back with a panel open still keeps the version`, writes.some((x) => x.table === 'plan_versions'), writes.map((x) => x.table).join(', '));

    // Offline: two changes, then back online: versions go up, never back.
    await go(page, '/performance-plan', '.ds-mission-card');
    writes.length = 0;
    await ctx.setOffline(true);
    const toasts = [];
    for (const [label, words] of [['Edit my mission', ' O1'], ['Edit this objective', ' O2']]) {
      await page.getByRole('button', { name: label }).first().click();
      await page.waitForSelector('.ds-panel .plan-part');
      const box = page.locator('.ds-panel .plan-part textarea, .ds-panel .plan-part input').first();
      await box.press('End');
      await box.type(words);
      await page.waitForTimeout(1200);
      await page.locator('.ds-panel:has(.plan-part)').getByRole('button', { name: 'Done' }).click();
      await page.waitForTimeout(1500);
      toasts.push(await page.locator('.ds-toast-region').innerText().catch(() => ''));
      await page.waitForTimeout(800);
    }
    pass(`part ${w}: offline, Done says "Will sync", never "Saved"`, toasts.every((t) => /Will sync/.test(t) && !/Saved/.test(t)), toasts.join(' | '));
    const m1 = /Version (\d+)\.(\d+)/.exec(toasts[0] || '');
    const m2 = /Version (\d+)\.(\d+)/.exec(toasts[1] || '');
    pass(`part ${w}: offline, the second change's version comes after the first`, m1 && m2 && (Number(m2[1]) * 1000 + Number(m2[2])) > (Number(m1[1]) * 1000 + Number(m1[2])), `${m1?.[0]} then ${m2?.[0]}`);
    await ctx.setOffline(false);
    await page.waitForTimeout(6000);
    const versions = writes.filter((x) => x.table === 'plan_versions').map((x) => { const b = JSON.parse(x.body); const r = Array.isArray(b) ? b[0] : b; return `${r.major}.${r.minor}`; });
    const plans = writes.filter((x) => x.table === 'performance_plans' && /"minor"/.test(x.body)).map((x) => { const r = JSON.parse(x.body); return `${r.major}.${r.minor}`; });
    pass(`part ${w}: back online, each version is sent once, in order, and the plan ends on the last`, versions.length === 2 && versions[0] !== versions[1] && plans[plans.length - 1] === versions[1], `versions ${versions.join(', ')}; plan ${plans.join(', ')}`);
    await go(page, '/performance-plan', '.ds-mission-card');
    pass(`part ${w}: "Edit my plan" (the full flow) is still there`, (await page.getByRole('button', { name: 'Edit my plan' }).count()) === 1);
    if (shots) await page.screenshot({ path: `${shots}/part-${w}.png`, fullPage: true });
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 6. pill
if (part('pill')) {
  const b = await launch('webkit');
  const sizes = [['iPhone 16 portrait', 393, 852], ['iPhone 16 landscape', 852, 393], ['360', 360, 780], ['430', 430, 932]];
  for (const mission of [null, 'Be a world-class high-performance coach for leaders who carry real responsibility']) {
    for (const [name, w, h] of sizes) {
      const { ctx, page } = await open(b, { width: w, height: h, phone: true });
      if (mission) {
        await ctx.route(/rest\/v1\/performance_plans/, async (route) => {
          if (route.request().method() !== 'GET') return route.fallback();
          const res = await route.fetch();
          let body = await res.json().catch(() => null);
          if (Array.isArray(body)) body = body.map((r) => ({ ...r, mission }));
          else if (body && typeof body === 'object') body = { ...body, mission };
          return route.fulfill({ response: res, body: JSON.stringify(body) });
        });
      }
      await go(page, '/welcome', '.hdr-mis');
      const r = await page.evaluate(() => {
        const pill = [...document.querySelectorAll('.hdr-mis')].find((p) => p.getBoundingClientRect().width > 0);
        const label = pill.querySelector('.hdr-mis-label').getBoundingClientRect();
        const text = pill.querySelector('.hdr-mis-text');
        const shown = getComputedStyle(text).display !== 'none';
        const t = text.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(text).lineHeight);
        const pad = parseFloat(getComputedStyle(text).paddingTop) + parseFloat(getComputedStyle(text).paddingBottom);
        // Each hyphen: the letters either side on the same line.
        const broken = [];
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (let i = 1; i < n.textContent.length - 1; i += 1) {
            if (n.textContent[i] !== '-') continue;
            const a = document.createRange(); a.setStart(n, i - 1); a.setEnd(n, i);
            const c = document.createRange(); c.setStart(n, i + 1); c.setEnd(n, i + 2);
            if (Math.abs(a.getBoundingClientRect().top - c.getBoundingClientRect().top) > 2) broken.push(n.textContent.slice(Math.max(0, i - 8), i + 8));
          }
        }
        // The first line's first letter: where the words start.
        const first = document.createRange();
        const tn = document.createTreeWalker(text, NodeFilter.SHOW_TEXT).nextNode();
        first.setStart(tn, 0); first.setEnd(tn, 1);
        const menu = document.querySelector('.hdr-menu');
        const mr = menu?.getBoundingClientRect();
        const bar = document.querySelector('.ds-phone-bar');
        return {
          shown,
          align: getComputedStyle(text).textAlign,
          lines: shown ? Math.round((t.height - pad) / lh) : 0,
          startGap: shown ? first.getBoundingClientRect().left - label.right : null,
          ellipsis: /…/.test(pill.textContent) || getComputedStyle(text).textOverflow === 'ellipsis',
          broken,
          menuShown: Boolean(mr && mr.width && getComputedStyle(menu).visibility !== 'hidden' && menu.closest('.hdr-desktop') && getComputedStyle(menu.closest('.hdr-desktop')).display !== 'none'),
          bar: Boolean(bar && bar.getBoundingClientRect().height > 0 && getComputedStyle(bar).display !== 'none'),
          wide: document.documentElement.scrollWidth - innerWidth,
          padTop: getComputedStyle(document.querySelector('.hdr')).paddingTop,
        };
      });
      const label = `pill ${name}${mission ? ' (long mission)' : ''}`;
      if (r.shown) {
        pass(`${label}: reads from the left`, r.align === 'left' || r.align === 'start', r.align);
        pass(`${label}: starts just after its label`, r.startGap >= 8 && r.startGap <= 40, `${r.startGap?.toFixed(1)}px`);
        pass(`${label}: at most two lines`, r.lines <= 2, `${r.lines} lines`);
        pass(`${label}: never broken at a hyphen`, !r.broken.length, r.broken.join(' | '));
      } else {
        note(`${label}: the pill shows "My Mission" alone (too long for two lines, or under 360px)`);
      }
      pass(`${label}: never "…"`, !r.ellipsis);
      pass(`${label}: no desktop menu button`, !r.menuShown);
      pass(`${label}: the phone bar is there`, r.bar);
      pass(`${label}: no sideways scroll`, r.wide <= 0, `${r.wide}px`);
      if (shots) await page.screenshot({ path: `${shots}/pill-${w}x${h}${mission ? '-long' : ''}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 240) } });
      await ctx.close();
    }
  }
  note('the notch: WebKit here cannot emulate safe-area insets; the header still adds env(safe-area-inset-top) in the browser (checked by tests/phase4/header.mjs in Chromium).');
}

// ------------------------------------------------------------------ 7. dial
if (part('dial')) {
  for (const [engineName, w] of [['chromium', 1280], ['chromium', 390], ['webkit', 393]]) {
    const b = await launch(engineName);
    const { ctx, page } = await open(b, { width: w, phone: w < 769 });
    await go(page, '/welcome', '.ds-mdial');
    if (!(await page.locator('.ds-mdial').count())) { note(`dial ${w}: no sprint running, so no dial`); await ctx.close(); continue; }
    const r = await page.evaluate(() => {
      const d = document.querySelector('.ds-mdial');
      const line = d.querySelector('.ds-mdial-line');
      return {
        name: d.getAttribute('aria-label'),
        line: line.textContent.trim(),
        chevron: Boolean(line.querySelector('.ds-chevron.ds-chevron--right')),
        otherIcons: line.querySelectorAll('svg, img').length,
        h: d.getBoundingClientRect().height,
        buttons: d.querySelectorAll('button, a').length,
        colour: getComputedStyle(line).color,
        underline: getComputedStyle(line.querySelector('.ds-mdial-link')).textDecorationColor,
      };
    });
    // The line is the link itself (calm layout, 10 Nov): "View your week".
    pass(`dial ${engineName} ${w}: the line reads "View your week"`, r.line === 'View your week', r.line);
    pass(`dial ${engineName} ${w}: followed by the portal's chevron, no other icon`, r.chevron && r.otherIcons === 0);
    pass(`dial ${engineName} ${w}: one button, named with the date, the week and "View your week."`, /week \d+ of \d+\. View your week\.$/.test(r.name) && r.buttons === 0, r.name);
    pass(`dial ${engineName} ${w}: a 44px tap area`, r.h >= 44, `${r.h}px`);
    if (shots) await page.locator('.ds-mdial').screenshot({ path: `${shots}/dial-${engineName}-${w}.png` });
    if (w < 769 && engineName === 'chromium') {
      await page.locator('.ds-mdial').dblclick();
      await page.waitForURL(/performance-sprint/, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.goBack();
      await page.waitForTimeout(1200);
      pass(`dial ${w}: a double tap leaves one page in Back`, /\/welcome/.test(page.url()), page.url());
      await go(page, '/welcome', '.ds-mdial');
    }
    if (w >= 769) {
      const before = await boxes(page);
      await page.locator('.ds-mdial').hover();
      await still(page);
      const hov = await page.evaluate(() => { const l = document.querySelector('.ds-mdial-line'); return { colour: getComputedStyle(l).color, underline: getComputedStyle(l.querySelector('.ds-mdial-link')).textDecorationColor, coral: getComputedStyle(document.querySelector('.ui-root')).getPropertyValue('--coral-text').trim() }; });
      const after = await boxes(page);
      pass(`dial ${w}: hover turns the line coral and underlines it`, hov.colour !== r.colour && hov.underline === hov.colour && r.underline !== hov.colour, JSON.stringify(hov));
      pass(`dial ${w}: nothing on Home moves on hover`, !moved(before, after), moved(before, after));
      await page.mouse.move(2, 2);
      await page.keyboard.press('Tab');
      await page.locator('.ds-mdial').focus();
      await still(page);
      const foc = await page.evaluate(() => getComputedStyle(document.querySelector('.ds-mdial-link')).textDecorationColor);
      note(`dial ${w}: focus by script shows the underline only with :focus-visible (keyboard); colour now ${foc}`);
      await page.locator('.ds-mdial').click();
      await page.waitForURL(/performance-sprint/, { timeout: 8000 }).catch(() => {});
      pass(`dial ${w}: opens the current sprint`, /performance-sprint/.test(page.url()));
    }
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 8. hyphens
if (part('hyphens')) {
  const b = await launch('webkit');
  for (const w of [360, 393]) {
    const { ctx, page } = await open(b, { width: w, height: 852, phone: true });
    for (const path of ['/welcome', '/performance-sprint', '/performance-plan', '/personal', '/personal/plan', '/strategic', '/my-account']) {
      await go(page, path, '.ds-page-title');
      const broken = await page.evaluate(() => {
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.textContent;
          if (!t.includes('-')) continue;
          const el = n.parentElement;
          if (!el || !el.getClientRects().length || el.closest('script, style, [hidden], [aria-hidden=true] svg')) continue;
          for (let i = 1; i < t.length - 1; i += 1) {
            if (t[i] !== '-' || !/\S/.test(t[i - 1]) || !/\S/.test(t[i + 1])) continue;
            const a = document.createRange(); a.setStart(n, i - 1); a.setEnd(n, i);
            const c = document.createRange(); c.setStart(n, i + 1); c.setEnd(n, i + 2);
            const ra = a.getBoundingClientRect(); const rc = c.getBoundingClientRect();
            if (!ra.width || !rc.width) continue;
            if (rc.top - ra.top > ra.height / 2) out.push(t.slice(Math.max(0, i - 12), i + 12).trim());
          }
        }
        return out;
      });
      pass(`hyphens ${w} ${path}: no word broken at its hyphen`, !broken.length, broken.join(' | '));
    }
    await ctx.close();
  }
}

for (const b of Object.values(browsers)) await b.close();
const report = `${results.join('\n')}\n\n${failures ? `${failures} failed` : 'All passed'}\n`;
if (out) writeFileSync(out, report);
console.log(failures ? `${failures} failed` : 'All passed');
process.exit(failures ? 1 : 0);
