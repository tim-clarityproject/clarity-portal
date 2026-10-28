// Phase 2 step 8: every Phase 2 screen measured against its mock-up (M1,
// M6, M15), in the running app on the TEST database only, signed in as the
// invented test client (every other host and every email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase2/compare.mjs [folder]
//
// The mock-ups are read from ~/Downloads/clarity-phase-2 (or MOCKUPS=...)
// and opened in Playwright too, with the real fonts: Nekst is inside each
// mock-up, DM Sans comes from the same @fontsource files the app uses (the
// Google Fonts request is answered locally). Each mock-up draws a desktop
// frame (988px) and a phone frame (360px); the desktop frame is also
// measured at 700px for half width.
//
// For every screen and state, at 1280px, 700px, 390px and 360px, dark and
// light, it measures the app (and the mock-up's frame, for the record):
//  - at most one coral button (exactly one in a guided tool);
//  - 44px tap areas;
//  - no coral in any chart or dial mark, and which colours the marks use
//    (mint for good, grey for below the standard);
//  - icons with words: the icon centred on the middle of the capitals
//    (within 1px) and 6px from its words; the "i" 6px after its sentence;
//  - pop-ups 12px inside both screen edges (first, middle and last mark);
//  - no keys (legends);
//  - no sideways scrolling (360px included);
//  - the writing rules on every line people read, pop-ups included: one
//    sentence per line, no colons (times aside) or brackets, no dashes or
//    semicolons, none of the banned words.
// Then it lists the wording that differs from the mock-up (figures, dates
// and names made neutral), each either explained by an approved later rule
// (ALLOWED, with the reason) or left "to check".
//
// It changes the test client's data with the seed script and ends with the
// usual seeded plan and running sprint (--reset). Writes report.txt (and
// screenshots) to the folder. Exits 1 when a rule check fails.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-2');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || join(process.cwd(), 'tmp-compare');
const SHOTS = process.env.SHOTS !== '0';
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const seed = (...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags], { stdio: 'pipe' }).toString().trim();

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

// ------------------------------------------------------------ what is measured
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)', 'rgb(185, 61, 43)'];
const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];
const BANNED = [
  'journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'optimize', 'synergy', 'wellness',
  'self-care', 'hold space', 'failed', 'fail', 'missed', "you're behind", 'fallen behind', 'falling behind', 'sorted', 'crack on', 'reckon',
  'submit', 'ok', 'click', 'tap', 'mate', 'nice', 'purpose', 'intake', 'ground',
];

/**
 * Runs in the page. side 'app' measures the whole page (header, phone bar,
 * the Breathe orb and toasts left out); side 'mock' one mock-up frame.
 */
function measure({ side, frame, CORAL, MINT, BANNED, guided, scope }) {
  const whole = side === 'app' ? document.body : document.querySelector(frame);
  // A panel or pop-up is compared on its own: the page under it is inert.
  const inScope = scope ? [...whole.querySelectorAll(scope)].find((el) => el.getBoundingClientRect().width > 0) : null;
  const root = inScope || whole;
  const hide = side === 'app'
    ? '.hdr, nav.bottom-tab-bar, .ds-orb, .ds-toast-region, .ds-sr, .ds-tip[hidden], [inert]'
    : '[data-hdw], [data-nb], [data-mn], .fab, [data-tw], .vh, .fbar [data-sv], [hidden]';
  const outside = (el) => el.closest(side === 'app' ? '.hdr, nav.bottom-tab-bar, .ds-orb, .ds-toast-region' : '[data-hdw], [data-nb], [data-mn], .fab, [data-tw]');
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0] || el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;

  // Lines people read.
  const style = document.createElement('style');
  style.textContent = `${hide} { display: none !important; }`;
  document.head.appendChild(style);
  const lines = root.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  style.remove();

  // Coral buttons.
  const buttons = [...root.querySelectorAll('button, a, [role=button]')].filter((el) => vis(el) && !outside(el));
  const coralButtons = buttons.filter((el) => CORAL.includes(getComputedStyle(el).backgroundColor)).map(label);

  // Tap areas.
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, label, [role=radio], [role=checkbox], [role=switch], [role=tab], [role=option]')) {
    if (outside(el) || !vis(el) || el.disabled) continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2 || getComputedStyle(el).opacity === '0')) continue;
    if (el.tagName === 'LABEL' && !el.querySelector('input[type=checkbox], input[type=radio]')) continue;
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) continue;
    if (el.closest('label') && el.tagName !== 'LABEL' && el.tagName !== 'INPUT') continue;
    const after = getComputedStyle(el, '::after');
    const before = getComputedStyle(el, '::before');
    const stretch = (p) => p.content !== 'none' && p.position === 'absolute' && (parseFloat(p.height) || 0) >= 43.5 && (parseFloat(p.width) || 0) >= 43.5;
    if ((b.height >= 43.5 && b.width >= 43.5) || stretch(after) || stretch(before)) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }

  // Chart and dial marks: coral never; which colours they use.
  const chartSel = side === 'app'
    ? '.ds-sdial, .ds-ychart, .ds-bar, .ds-wchart, .ds-dial, .ds-chart, .ds-guide-pct'
    : '[class*=dial], .yc, .ych, .ychart, .bar, .pctw, svg.rd, .rdial';
  const marks = [];
  for (const chart of root.querySelectorAll(chartSel)) {
    if (outside(chart) || !vis(chart)) continue;
    for (const el of [chart, ...chart.querySelectorAll('*')]) {
      if (el.closest('button:not([data-tip]):not(.yb), a') && !el.matches('[data-tip]')) continue;
      const st = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const paints = [st.backgroundColor, el instanceof SVGElement ? st.fill : null, el instanceof SVGElement ? st.stroke : null, el.matches('i, span:empty') ? st.borderTopColor : null]
        .filter((c) => c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)' && !/^url/.test(c));
      for (const c of paints) marks.push({ c, el: label(el), coral: CORAL.includes(c), mint: MINT.includes(c) });
    }
  }
  const coralMarks = [...new Set(marks.filter((m) => m.coral).map((m) => `${m.el} ${m.c}`))];
  const markColours = [...new Set(marks.map((m) => m.c))];
  const mintMarks = marks.filter((m) => m.mint).length;

  // Icons with words.
  const capMiddle = (textEl) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    textEl.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();
    const cs = getComputedStyle(textEl);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return baseline - ctx.measureText('H').actualBoundingBoxAscent / 2;
  };
  const icons = [];
  if (side === 'app') {
    for (const el of root.querySelectorAll('.ds-iconword')) {
      if (outside(el) || !vis(el)) continue;
      const svg = el.querySelector('.ds-iconword-icon > *');
      const text = el.querySelector('.ds-iconword-text');
      if (!svg || !text) continue;
      const icon = svg.getBoundingClientRect();
      const off = icon.top + icon.height / 2 - capMiddle(text);
      const gap = text.getBoundingClientRect().left - icon.right;
      icons.push({ what: label(el), off: +off.toFixed(2), gap: +gap.toFixed(2), size: +icon.width.toFixed(1) });
    }
    // The "i" after a sentence or title: 6px after the last word.
    for (const svg of root.querySelectorAll('.ds-info')) {
      const btn = svg.closest('button');
      // The page title's "i" counts too: 6px after the title's last word, on
      // its last line (Tim, 28 Oct).
      if (!btn || outside(btn) || !vis(btn) || btn.closest('.ds-iconword')) continue;
      const host = btn.parentElement;
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let last = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (btn.contains(n) || n.parentElement.closest('.ds-sr')) continue;
        if (n.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING && n.textContent.trim()) last = n;
      }
      if (!last) continue;
      const end = last.textContent.replace(/\s+$/, '').length;
      const range = document.createRange();
      range.setStart(last, Math.max(0, end - 1));
      range.setEnd(last, end);
      const ch = range.getBoundingClientRect();
      const icon = svg.getBoundingClientRect();
      if (Math.abs(icon.top + icon.height / 2 - (ch.top + ch.height / 2)) > ch.height) continue; // not on the same line
      // The middle of the capitals on the last word's own line, from the
      // font's metrics (a probe added to the text could re-wrap a title).
      const cs = getComputedStyle(last.parentElement);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const mt = ctx.measureText('H');
      const base = ch.top + (ch.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 + mt.fontBoundingBoxAscent;
      const off = icon.top + icon.height / 2 - (base - mt.actualBoundingBoxAscent / 2);
      // Letter-spacing after the last letter is empty space, not the word.
      const ls = parseFloat(cs.letterSpacing) || 0;
      icons.push({ what: `i after "${last.textContent.trim().slice(-24)}"`, off: +off.toFixed(2), gap: +(icon.left - (ch.right - ls)).toFixed(2), size: +icon.width.toFixed(1), info: true });
    }
  }

  // Keys.
  const keys = [...root.querySelectorAll('[class]')].filter((el) => !outside(el) && vis(el)
    && /(^|\s|-)(legend|ylg|key|chart-key|ds-key)(\s|$|-)/.test(String(el.className?.baseVal ?? el.className))).map(label);

  // Sideways scrolling.
  let sideways;
  if (side === 'app') sideways = document.documentElement.scrollWidth - window.innerWidth;
  else {
    const sc = root.querySelector('.scroll') || root;
    sideways = Math.max(0, sc.scrollWidth - sc.clientWidth);
  }

  // Writing rules.
  const writing = [];
  const words = (l) => l.toLowerCase().replace(/[’']/g, "'");
  // Approved wording: help panels' "For example: …" (writing rule 23), the
  // tough-week opening word for word (rule 20), and M6's link "Not sure?
  // Answer 3 questions" (a label, kept as drawn).
  const approved = [/^For example: /, /^Not your strongest (week|sprint)\. What still went well\?$/, /^Not sure\? Answer 3 questions$/];
  for (const l of lines) {
    if (approved.some((re) => re.test(l))) continue;
    const plain = l.replace(/\bDr\. /g, 'Dr ').replace(/\be\.g\. /gi, 'eg ').replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    if (/[()[\]]/.test(l)) writing.push(`brackets: ${l}`);
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    if (/\bstep \d+ of \d+\b/i.test(l)) writing.push(`step count: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(words(l))) writing.push(`banned "${w}": ${l}`);
  }

  // Pop-up triggers, for the caller to open.
  const tips = [...root.querySelectorAll('[data-tip]')].filter((el) => !outside(el) && vis(el)).length;
  const headings = [...root.querySelectorAll('h1, h2, h3, .ds-guide-question, .ds-guide-title, .qh, .ttl')].filter((el) => vis(el) && !outside(el)).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  return { lines, coralButtons, small, coralMarks, markColours, mintMarks, icons, keys, sideways, writing, tips, headings, guided: guided ? Boolean(document.querySelector('.ds-guide')) : false, theme: document.documentElement.getAttribute('data-theme') };
}

/** Opens the first, middle and last pop-up and measures them against the screen. */
async function popups(page, width, touch) {
  // Only marks people can reach: none under an open panel (the page is inert then).
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-tip]')) {
      if (el.closest('[inert], [aria-hidden="true"]')) el.removeAttribute('data-cmp-tip');
      else el.setAttribute('data-cmp-tip', '');
    }
  });
  const n = await page.locator('[data-cmp-tip]:visible').count();
  if (!n) return { n: 0, worst: null, texts: [] };
  const picks = [...new Set([0, Math.floor(n / 2), n - 1])];
  let worst = null;
  const texts = [];
  for (const i of picks) {
    const el = page.locator('[data-cmp-tip]:visible').nth(i);
    const read = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden && getComputedStyle(x).display !== 'none');
      if (!t) return null;
      const b = t.getBoundingClientRect();
      return { left: b.left, right: window.innerWidth - b.right, lines: [...t.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean) };
    });
    // Hover on a laptop, a tap on a phone; keyboard focus opens it too.
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      if (touch) await el.tap({ timeout: 2000 });
      else await el.hover({ timeout: 2000 });
    } catch { /* tried focus next */ }
    await page.waitForTimeout(250);
    let r = await read();
    if (!r) {
      await el.focus().catch(() => {});
      await page.waitForTimeout(250);
      r = await read();
    }
    if (r) {
      texts.push(...r.lines);
      const inside = Math.min(r.left, r.right);
      if (!worst || inside < worst) worst = inside;
    }
    // Closed by moving away and blurring: Escape would also close a guided tool.
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur?.());
  }
  return { n, worst, texts, width };
}

// ------------------------------------------------------------ approved differences
// Mock-up wording the app does not show, or shows differently, because an
// approved later rule wins (progress.md, steps 1 to 7). Each entry: the
// screens it covers, a pattern on the neutral line, and why.
const ALLOWED = [
  // Everywhere
  { side: 'mock', re: /^(Personal|Plan|Home|Chat to #?\w*)$/, why: 'header, menu and back links belong to Home and navigation (Phase 4); back links name the page they go to' },
  { side: 'both', re: /^(Breathe|Skip|Back|Next|Close)$/, why: 'shared tool chrome (the Breathe orb and the guided tool foot) is measured, not compared word for word' },
  { side: 'mock', re: /^\d+%$|^#%$|^#$/, why: 'figures come from src/lib/scores on the seeded rows, not the mock-up’s' },
  { side: 'both', re: /^(Saving|Saved|Will sync)$/, why: 'save status changes as it saves' },
  { side: 'mock', re: /^Who can see this: /, why: 'the mock-up spells the screen-reader words out; the app keeps them in .ds-sr' },
  { side: 'mock', re: /^i$/, why: 'the mock-up’s "i" is a letter; the app draws the shared InfoIcon' },
  { side: 'mock', re: /·/, why: 'no dots between items (26 Oct rule 5): separate labels' },
  { side: 'app', re: /^(version #|changed <day> # <month>|outcome objective #|by # <month> #|# (weeks?|months?|days?) left|rated out of #|milestone|weeks # to #|week # of #|<day> # <month> to <day> # <month>|rolled over from week #|unplanned win, <day>)$/, why: 'the mock-up’s dotted line split into separate labels (26 Oct rule 5)' },
  { side: 'mock', re: /^you and tim$/, why: 'the test client has no coach, so the eye reads "Only you"' },
  { side: 'app', re: /^only you$/, why: 'the test client has no coach, so the eye reads "Only you"' },
  // M1 plan
  { screen: /plan/, side: 'mock', re: /^Performance score this week$/, why: 'M5: "…this week so far"' },
  { screen: /plan|system/, side: 'mock', re: /How it fits together|with Recovery between sprints/, why: 'no overline; the line is kept word for word where it is used' },
  { screen: /plan/, side: 'mock', re: /^None open\.$|^Nothing tagged yet\.$/, why: 'full sentences (writing rule 48)' },
  { screen: /plan/, side: 'mock', re: /^Work this sprint/, why: 'needs a link table; empty until it exists (step 1)' },
  // M1 sprint
  { screen: /sprint/, side: 'mock', re: /^Standard reached this week$|^Performance score this week$/, why: 'full sentences and "so far" (M5, writing rule 48)' },
  { screen: /sprint/, side: 'mock', re: /^Start my debrief$|debrief/i, why: 'the debrief is Phase 3: a link to nothing breaks writing rule 41' },
  { screen: /sprint/, side: 'mock', re: /^Did you finish late today\?$/, why: 'no question is stored for a habit: the row uses its name' },
  { screen: /sprint|year/, side: 'mock', re: /^Week \d+$|^\d+$|^#$/, why: 'week numbers are hidden on phones and live in pop-ups' },
  // M1 year
  { screen: /year/, side: 'mock', re: /^SPRINT #$|^Sprint #$|Still to come|A planned break between sprints|Open the week summary/, why: 'DM Sans sentence case labels; full sentences; Recovery any time (M15); the week summary is Phase 3' },
  // M6
  { screen: /build|edit|start|review/, side: 'mock', re: /^#$|^\d+$/, why: 'M6’s step list is replaced by the % complete bar' },
  { screen: /start/, side: 'mock', re: /Clear space|Time audit|Delegation audit/, why: 'neither tool exists yet: a link to nothing breaks writing rule 41 (step 3)' },
  { screen: /start/, side: 'mock', re: /^From Performance Sprint #$/, why: 'the sprint’s habits come from the plan: "From your plan"' },
  { screen: /review/, side: 'mock', re: /^Up from # of # last sprint\.$/, why: 'comparisons with last sprint live only in the crosshair’s pop-up' },
  { screen: /review/, side: 'mock', re: /How long a Recovery\?|^# weeks?$/, why: 'the M15 day counter at /recovery chooses how long' },
  { screen: /review/, side: 'mock', re: /^# objective done$|Held # of # weeks/, why: '"reached" and "Kept up in" (M11)' },
  { screen: /sprint|year|review/, side: 'mock', re: /^(met your standard|below|below your standard|recovery|this week, so far)(: # weeks)?$/, why: 'the mock-up’s key: no keys on screen (26 Oct rule 3); every mark has a pop-up' },
  { screen: /sprint/, side: 'mock', re: /^your usual range is # to #%\.$/, why: 'data: the seeded sprint has fewer than 6 weeks, so "Your usual range appears after 6 weeks." (M8)' },
  { screen: /sprint/, side: 'mock', re: /^strategic block happened$/, why: 'no label is stored for a habit: the row uses its name' },
  { screen: /sprint/, side: 'mock', re: /^(sa|su)$/, why: 'the week view shows working days only (brief), plus any day off already logged' },
  { screen: /sprint/, side: 'mock', re: /^# days$/, why: 'time left in the unit that fits (M9.2)' },
  { screen: /build|edit|start|review/, side: 'mock', re: /^(objectives|habits|length|start|standard|ready|finished|worked|next time|clear space|coaching clients|launch the lead…|confidence lead…)$/, why: 'M6’s step list is replaced by the % complete bar' },
  { screen: /start|build/, side: 'mock', re: /^pick any day\. you can move it before it starts\.$/, why: 'one sentence per line: split into two lines (writing rule 49)' },
  { screen: /review/, side: 'mock', re: /^since you started: /, why: 'a full sentence with no colon (writing rule 48): "Since you started, your average is …"' },
  { screen: /review/, side: 'mock', re: /^great sprint, sam! you averaged #%\.$/, why: 'data: the seeded sprint averaged below the standard, so the tough-sprint opening shows (rule 20)' },
  { screen: /paused/, side: 'mock', re: /^performance sprint$/, why: 'the title keeps its number, "Performance Sprint N" (step 7)' },
  { screen: /plan|panel/, side: 'mock', re: /^performance score this week ?#%$/, why: 'M5: "…this week so far"' },
  { screen: /plan|panel/, side: 'app', re: /^performance score this week so far ?#?%?$|^this strategy has no score yet this week\.$/, why: 'M5: "…this week so far"; UNDEFINED tile with no score (step 1)' },
  { screen: /Strategy detail/, side: 'mock', re: /^[^:]+: (rated|yes or no|#)/, why: 'no colons: the habit’s name, then its measure on its own line' },
  { screen: /Strategy detail/, side: 'app', re: /^(no to-dos are open for this strategy\.|nothing is tagged to this strategy yet\.|when a tool finishes, you can tag it to this strategy\.|work this sprint|to-dos this sprint|habits|edit this strategy|serves objectives #( and #)?)$/, why: 'full sentences (writing rule 48); Work this sprint stays empty until its link table exists (step 1)' },
  { screen: /system/, side: 'app', re: /^(your scores and debriefs update your objectives and plan|your tactics go into each sprint|changes rarely\.|what you aim for and how\.|where you do the work\.)$/, why: 'the pop-up’s turned chevrons replace M1’s text arrows; its labels stay word for word' },
  { screen: /year/, side: 'mock', re: /^performance score#%$/, why: 'the same label and figure, on two lines' },
  { screen: /year/, side: 'app', re: /^(open my plan|open my sprint|show as a table|running|performance score|this week so far|week #|performance sprint( #, week #| # week #)?)$/, why: '"Show as a table" (graphs rule), the links at the foot, and the dotted lines split (step 5)' },
  { screen: /recovery|paused|welcome/, side: 'app', re: /^(performance sprint|plan|good (morning|afternoon|evening), sam)$/, why: 'back links name the page they go to (step 7); the greeting follows the time of day' },
  { screen: /paused/, side: 'app', re: /^(performance sprint #|show my results|your scores and standards are hidden until you're back\.|open my recovery day|how the system fits together)$/, why: 'step 7: Show my results and Open my recovery day (no other way in until Home); the title keeps its number' },
  { screen: /welcome/, side: 'app', re: /.*/, why: 'Welcome back sits on the sprint page for the first day back, with the rest of the page underneath (step 7)' },
  { screen: /review/, side: 'both', re: /^(#%|# of #|#of #|#\/#|#k of #k|up # this sprint|not yet|average|standard #%|weeks at your standard|best week|week # #%|performance sprint #|# to # <month>|kept up in # of # weeks|# sessions a week)$/, why: 'the finished dial’s centre and figures, and each objective’s and habit’s lines as separate labels with no dots (step 6)' },
  { screen: /review/, side: 'mock', re: /^(milestone, not yet\. by .*|[^,]+, (#|once) a week|#\/# up # this sprint|# of # up # this sprint|add an objective)$/, why: 'separate labels (step 6); Add an objective shows only under 4 objectives (the seeded plan has 4)' },
  { screen: /review/, side: 'app', re: /^since you started, /, why: 'a full sentence with no colon (writing rule 48)' },
  { screen: /year with/, side: 'app', re: /^(no sprint running|its review is waiting for you\.)$/, why: 'data: Sprint 2 has ended and waits for its review, so no week is "this week" (the label "No sprint running" is a pop-up value)' },
  { screen: /year with/, side: 'mock', re: /^open this week$/, why: 'data: no sprint is running this week' },
  { screen: /start|build|edit/, side: 'app', re: /^(#%|other|# to #|pick any day\.|you can move it before it starts\.|from your plan|(high|medium|low) impact|starting it finishes performance sprint #\.?)$/, why: 'the % bar; "Other" length (2 to 16); one sentence per line; "From your plan"; impact as its own grey label (steps 2 and 3)' },
  // M15
  { screen: /recovery/, side: 'mock', re: /Home now shows only the basics|^Good morning|^Good afternoon|^Good evening/, why: 'Home is rebuilt in Phase 4' },
  { screen: /paused|welcome|recovery/, side: 'mock', re: /^Let Tim know|^Tim /, why: 'the coach line names the person’s own coach and is left out with no coach (test client has none)' },
];

// Neutral form of a line: figures, dates, days and names made the same.
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December';
const DAYS = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow|Yesterday';
const neutral = (l) => l
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ')
  .replace(new RegExp(`\\b(${DAYS})\\b`, 'g'), '<day>')
  .replace(new RegExp(`\\b(${MONTHS})\\b`, 'g'), '<month>')
  .replace(/[£$]?\d[\d,.]*/g, '#')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase(); // Nekst capitals come out of innerText in upper case

const allowed = (screen, side, line) => ALLOWED.find((a) => (!a.screen || a.screen.test(screen)) && (a.side === 'both' || a.side === side) && new RegExp(a.re.source, 'i').test(line));

function wordingDiff(screen, appLines, mockLines) {
  const a = new Set(appLines.map(neutral));
  const m = new Set(mockLines.map(neutral));
  const missing = [...m].filter((l) => !a.has(l));
  const extra = [...a].filter((l) => !m.has(l));
  const explained = [];
  const check = [];
  for (const l of missing) {
    const why = allowed(screen, 'mock', l);
    (why ? explained : check).push(`mock-up only: ${l}${why ? `  [${why.why}]` : ''}`);
  }
  for (const l of extra) {
    const why = allowed(screen, 'app', l);
    (why ? explained : check).push(`app only: ${l}${why ? `  [${why.why}]` : ''}`);
  }
  const same = [...m].filter((l) => a.has(l)).length;
  return { same, total: m.size, explained, check };
}

const similarity = (a, b) => {
  const wa = new Set(a.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(1, Math.min(wa.size, wb.size));
};

// ------------------------------------------------------------ the browser sides
const browser = await chromium.launch();
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;

async function mockPage() {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await page.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
    const w = /500/.test(r.request().url()) ? 500 : 400;
    r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
  });
  await page.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
  return page;
}

/** Opens a mock-up state and measures its frames. steps: data-a values clicked in turn. */
async function mockState(page, file, key, steps, mode, scope) {
  await page.goto(`file://${join(MOCKS, file)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.click(`button[data-m="${mode === 'dark' ? 1 : 0}"]`);
  await page.click(`button[data-k="${key}"], button[data-scr="${key}"]`);
  await page.waitForTimeout(300);
  for (const a of steps) {
    await page.locator(`.frame.d [data-a="${a}"]`).first().click();
    await page.waitForTimeout(350);
  }
  return mockFrames(page, scope);
}
async function mockFrames(page, scope) {
  await page.waitForTimeout(500); // the mock-ups' reveal animation
  const args = { CORAL, MINT, BANNED, scope };
  const d = await page.evaluate(measure, { ...args, side: 'mock', frame: '.frame.d' });
  await page.evaluate(() => { document.querySelector('.frame.d').style.width = '700px'; });
  await page.waitForTimeout(150);
  const half = await page.evaluate(measure, { ...args, side: 'mock', frame: '.frame.d' });
  await page.evaluate(() => { document.querySelector('.frame.d').style.width = ''; });
  const p = await page.evaluate(measure, { ...args, side: 'mock', frame: '.frame.p' });
  return { 1280: d, 700: half, 390: p, 360: p };
}

/** A guided mock-up flow: every step's frames, Next after Next. */
async function mockFlow(page, file, key, mode) {
  await page.goto(`file://${join(MOCKS, file)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.click(`button[data-m="${mode === 'dark' ? 1 : 0}"]`);
  await page.click(`button[data-k="${key}"]`);
  await page.waitForTimeout(300);
  const steps = [];
  for (let i = 0; i < 16; i += 1) {
    steps.push(await mockFrames(page));
    const next = page.locator('.frame.d .ft .btn');
    if ((await next.getAttribute('data-a')) === 'finish') break;
    await next.click();
    await page.waitForTimeout(300);
  }
  return steps;
}

let storage = null;
async function appContext(width, mode) {
  const phone = width < 769;
  if (!storage) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await guard(ctx);
    const p = await ctx.newPage();
    await p.goto(`${APP}/auth/login`);
    await p.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await p.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await p.keyboard.press('Enter');
    await p.waitForURL(/welcome/, { timeout: 30000 });
    storage = await ctx.storageState();
    await ctx.close();
  }
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, storageState: storage,
  });
  await context.addInitScript((m) => {
    // Each context starts from the state saved straight after signing in,
    // so no page's device copy from an earlier seed is ever shown.
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await guard(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page, phone };
}
async function guard(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_REF)) return route.abort();
    if (/\/functions\/v1\//.test(url)) return route.abort();
    return route.fallback();
  });
}

const go = async (page, path, sel) => {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.waitForTimeout(900);
};
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();

async function appMeasure(page, width, mode, guided, scope) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const r = await page.evaluate(measure, { side: 'app', CORAL, MINT, BANNED, guided, scope });
  r.pop = await popups(page, width, width < 769);
  return r;
}

// ------------------------------------------------------------ the screens
// mock: [file, key, steps] or null when the state isn't mocked (rules only).
const M1 = 'm1-performance-system.html';
const M6 = 'm6-setup-flows.html';
const M15 = 'm15-recovery.html';
const GROUPS = [
  {
    seed: ['--reset'],
    screens: [
      { id: 'plan', mock: [M1, 'ipp', []], open: (p) => go(p, '/performance-plan', '.ds-stile') },
      { id: 'plan system pop-up', scope: '[role=dialog]', mock: [M1, 'ipp', ['sys']], open: async (p) => { await go(p, '/performance-plan', '.ds-stile'); await p.locator('.ds-page-meta .ds-info-link').click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(500); } },
      { id: 'plan My Mission panel', scope: '[role=dialog]', mock: [M1, 'ipp', ['mp']], open: async (p, phone) => { await go(p, '/performance-plan', '.ds-stile'); await p.locator(phone ? '.hdr-phone .hdr-mis' : '.hdr-desktop .hdr-mis').click(); await p.waitForSelector('.ds-drop'); await p.waitForTimeout(500); } },
      { id: 'plan Strategy detail', mock: [M1, 'ipp', ['tile:0']], open: async (p) => { await go(p, '/performance-plan', '.ds-stile'); await p.locator('.ds-stile-btn').first().click(); await p.waitForSelector('.ds-dialog.ds-panel, .ds-sdetail'); await p.waitForTimeout(500); } },
      { id: 'plan version history', mock: null, open: (p) => go(p, '/performance-plan/history', '.ds-row') },
      { id: 'plan one version', mock: null, open: async (p) => { await go(p, '/performance-plan/history', '.ds-row'); await p.locator('.ds-row').first().click(); await p.waitForSelector('.ipp-version-rows'); await p.waitForTimeout(500); } },
      { id: 'sprint running, today', mock: [M1, 'sprint', []], open: (p) => go(p, '/performance-sprint', '.ds-sdial--running') },
      { id: 'sprint running, this week', mock: [M1, 'sprint', ['view:week']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await button(p, 'This week').click(); await p.waitForTimeout(600); } },
      { id: 'sprint details open', mock: [M1, 'sprint', ['details']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await p.getByRole('button', { name: /Sprint details/ }).first().click(); await p.waitForTimeout(600); } },
      { id: 'sprint habit panel', scope: '[role=dialog]', mock: [M1, 'sprint', ['hab:train']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await p.locator('button[aria-label$="week, target and impact"]').first().click(); await p.waitForSelector('.ds-panel'); await p.waitForTimeout(600); } },
      { id: 'sprint add a to-do', scope: '[role=dialog]', mock: [M1, 'sprint', ['addopen']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await button(p, 'Add a to-do').click(); await p.waitForSelector('.ds-panel'); await p.waitForTimeout(600); } },
      { id: 'sprint add a win', scope: '[role=dialog]', mock: [M1, 'sprint', ['winopen']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await button(p, 'Add an unplanned win').click(); await p.waitForSelector('.ds-panel'); await p.waitForTimeout(600); } },
      { id: 'sprint move a to-do', scope: '[role=dialog]', mock: [M1, 'sprint', ['move:1']], open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--running'); await p.getByRole('button', { name: /^Move/ }).first().click(); await p.waitForSelector('.ds-panel'); await p.waitForTimeout(600); } },
      { id: 'year', mock: [M1, 'year', []], open: (p) => go(p, '/performance-sprint/year', '.ds-ychart-col') },
      { id: 'start a sprint, one running', mock: null, open: (p) => go(p, '/performance-sprint/start', '.sprint-start-running') },
      { id: 'start a sprint', flow: [M6, 'sprint'], open: async (p) => { await go(p, '/performance-sprint/start', '.sprint-start-running'); await button(p, 'Start a new sprint').click(); await p.waitForSelector('.ds-guide'); await p.waitForTimeout(700); } },
      { id: 'edit my plan', flow: [M6, 'plan'], open: (p) => go(p, '/performance-plan/edit', '.ds-guide') },
      { id: 'recovery take a recovery week', mock: [M15, 'start', []], open: (p) => go(p, '/recovery', '.rec-question') },
    ],
  },
  {
    seed: ['--empty'],
    screens: [
      { id: 'plan empty', mock: null, open: (p) => go(p, '/performance-plan', 'h1, .ds-empty-title') },
      { id: 'sprint none', mock: null, open: (p) => go(p, '/performance-sprint', '.ds-empty, h1') },
      { id: 'build my plan', flow: [M6, 'plan'], open: (p) => go(p, '/performance-plan/build', '.ds-guide') },
    ],
  },
  {
    seed: ['--ended'],
    screens: [
      { id: 'sprint over, not reviewed', mock: null, open: (p) => go(p, '/performance-sprint', '.sprint-hero--over') },
      { id: 'year with Recovery', mock: [M1, 'year', []], open: (p) => go(p, '/performance-sprint/year', '.ds-ychart-col') },
      { id: 'review', flow: [M6, 'end'], open: (p) => go(p, '/performance-sprint/review', '.ds-guide') },
    ],
  },
  {
    seed: ['--reset', '--recovery=3,7'],
    screens: [
      { id: 'sprint paused', mock: [M15, 'sprint', []], open: (p) => go(p, '/performance-sprint', '.ds-sdial--paused') },
      { id: 'sprint paused, results shown', mock: null, open: async (p) => { await go(p, '/performance-sprint', '.ds-sdial--paused'); await button(p, 'Show my results').click(); await p.waitForTimeout(700); } },
      { id: 'recovery day', mock: [M15, 'home', []], open: (p) => go(p, '/recovery/today', '.rec-banner') },
      { id: 'recovery check-in', mock: [M15, 'end', []], open: (p) => go(p, '/recovery/check-in', '.rec-question') },
      { id: 'recovery check-in, a few more days', mock: [M15, 'end', ['feel:more']], open: async (p) => { await go(p, '/recovery/check-in', '.rec-question'); await p.getByRole('radio', { name: 'A few more days' }).click(); await p.waitForTimeout(500); } },
      { id: 'recovery add a few more days', mock: null, open: (p) => go(p, '/recovery/check-in?add=1', '.rec-question') },
      { id: 'plan in recovery', mock: null, open: (p) => go(p, '/performance-plan', '.ds-rec-notice') },
      { id: 'year in recovery', mock: null, open: (p) => go(p, '/performance-sprint/year', '.ds-ychart-col') },
    ],
  },
  {
    seed: ['--reset', '--recovery=10,14'],
    before: async () => {
      const { context, page } = await appContext(390, 'dark');
      await go(page, '/performance-sprint', '.ds-sdial--paused');
      await button(page, 'I’m ready to go again').click();
      await page.waitForSelector('.rec-welcome', { timeout: 15000 });
      await context.close();
    },
    screens: [
      { id: 'sprint welcome back', mock: [M15, 'back', []], open: (p) => go(p, '/performance-sprint', '.rec-welcome') },
    ],
  },
];

const WIDTHS = [1280, 700, 390, 360];
const MODES = ['dark', 'light'];
const report = [];
const table = [];
const mock = await mockPage();

/** The rule checks on one measured app screen. */
function ruleChecks(tag, r, guided) {
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: ${guided ? 'one coral button' : 'at most one coral button'}`, guided ? r.coralButtons.length === 1 : r.coralButtons.length <= 1, r.coralButtons.join('; '));
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in any chart or dial mark`, r.coralMarks.length === 0, r.coralMarks.slice(0, 4).join('; '));
  const badIcon = r.icons.filter((i) => Math.abs(i.off) > 1 || Math.abs(i.gap - 6) > 0.75 || Math.abs(i.size - 16) > 0.5);
  pass(`${tag}: icons centred on the capitals, 16px, 6px from their words (${r.icons.length})`, badIcon.length === 0, badIcon.slice(0, 3).map((i) => `${i.what} off ${i.off} gap ${i.gap} size ${i.size}`).join('; '));
  pass(`${tag}: no keys`, r.keys.length === 0, r.keys.join('; '));
  if (r.pop.n) pass(`${tag}: pop-ups 12px inside the edges (${r.pop.n} marks)`, r.pop.worst !== null && r.pop.worst >= 11.5, `${r.pop.worst === null ? 'none opened' : `${r.pop.worst.toFixed(1)}px`}`);
  pass(`${tag}: writing rules`, r.writing.length === 0, [...new Set(r.writing)].slice(0, 4).join(' | '));
}

const wanted = (id) => !ONLY || ONLY.test(id);
for (const group of GROUPS) {
  if (!group.screens.some((s) => wanted(s.id))) continue;
  seed(...group.seed);
  if (group.before) await group.before();
  for (const mode of MODES) {
    // The mock-up side, once per mode.
    const mocks = {};
    for (const s of group.screens.filter((x) => wanted(x.id))) {
      if (s.mock) mocks[s.id] = await mockState(mock, ...s.mock, mode, s.scope);
      if (s.flow) mocks[s.id] = await mockFlow(mock, ...s.flow, mode);
    }
    for (const width of WIDTHS) {
      const { context, page, phone } = await appContext(width, mode);
      for (const s of group.screens.filter((x) => wanted(x.id))) {
        const tag = `${s.id}, ${width}px ${mode}`;
        try {
          await s.open(page, phone);
        } catch (e) {
          pass(`${tag}: opens`, false, e.message.split('\n')[0]);
          continue;
        }
        const appSteps = [];
        if (s.flow) {
          for (let i = 0; i < 20; i += 1) {
            const r = await appMeasure(page, width, mode, true);
            appSteps.push(r);
            ruleChecks(`${tag}, step ${i + 1} "${(r.headings.find((h) => h) || '').slice(0, 40)}"`, r, true);
            if (SHOTS && (width === 1280 || width === 390)) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${i + 1}-${width}-${mode}.png`), fullPage: true });
            // The last step is the one at 100%; its button finishes, so it is never pressed.
            // A bare opening step has no bar: it is never the last one.
            const pct = (await page.locator('.ds-guide-pct').count()) ? Number(await page.locator('.ds-guide-pct').first().getAttribute('aria-valuenow')) : 0;
            if (pct >= 100 || !(await page.locator('.ds-guide-next').count())) break;
            await page.locator('.ds-guide-next').click();
            await page.waitForTimeout(650);
          }
        } else {
          const r = await appMeasure(page, width, mode, false, s.scope);
          appSteps.push(r);
          ruleChecks(tag, r, false);
          pass(`${tag}: follows the mode`, r.theme === mode, `${r.theme}`);
          if (SHOTS && (width === 1280 || width === 390)) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${width}-${mode}.png`), fullPage: true });
        }
        // Wording against the mock-up: laptop and phone, dark only (the words don't change with the mode).
        if (mode === 'dark' && (width === 1280 || width === 390)) {
          const mockSteps = s.flow ? mocks[s.id].map((f) => f[width]) : s.mock ? [mocks[s.id][width]] : [];
          const entry = { screen: s.id, width, steps: [] };
          appSteps.forEach((a, i) => {
            if (!mockSteps.length) { entry.steps.push({ app: a.headings[0] || s.id, mock: null }); return; }
            const best = s.flow
              ? mockSteps.map((m, j) => ({ j, sim: similarity(a.headings.concat(a.lines.slice(0, 12)), m.headings.concat(m.lines.slice(0, 12))) })).sort((x, y) => y.sim - x.sim)[0]
              : { j: 0, sim: 1 };
            const m = mockSteps[best.j];
            const d = wordingDiff(s.id, a.lines, m.lines);
            entry.steps.push({ app: a.headings.find((h) => h) || `step ${i + 1}`, mock: m.headings.find((h) => h) || `mock step ${best.j + 1}`, sim: best.sim, ...d, mockRules: { coral: m.coralButtons.length, small: m.small.length, coralMarks: m.coralMarks.length, keys: m.keys.length, sideways: m.sideways } });
          });
          table.push(entry);
        }
      }
      await context.close();
    }
  }
}
seed('--reset');
await browser.close();

// ------------------------------------------------------------ report
report.push('PHASE 2 MOCK-UP COMPARISON', `${new Date().toISOString()}`, '');
for (const e of table) {
  report.push(`== ${e.screen}, ${e.width}px`);
  for (const st of e.steps) {
    if (!st.mock) { report.push(`  ${st.app}: not mocked (rules only)`); continue; }
    report.push(`  ${st.app}  <->  mock-up "${st.mock}" (similarity ${st.sim.toFixed(2)}): ${st.same} of ${st.total} mock-up lines the same; mock-up rules: ${st.mockRules.coral} coral buttons, ${st.mockRules.small} small taps, ${st.mockRules.coralMarks} coral marks, ${st.mockRules.keys} keys`);
    for (const l of st.explained) report.push(`    kept: ${l}`);
    for (const l of st.check) report.push(`    to check: ${l}`);
  }
}
report.push('', 'RULE CHECKS', ...results);
writeFileSync(join(out, 'report.txt'), report.join('\n'));
const toCheck = table.reduce((n, e) => n + e.steps.reduce((k, s) => k + (s.check?.length || 0), 0), 0);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed; ${toCheck} wording lines to check; report in ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
