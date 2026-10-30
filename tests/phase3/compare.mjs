// Phase 3 step 5: every Phase 3 screen and state measured against its
// mock-up (M5 for Plan my day and Review my day, M1 for the Weekly
// performance debrief), in the running app on the TEST database only,
// signed in as the invented test client (every other host and every email
// call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase3/compare.mjs [folder]
//
// The mock-ups are read from ~/Downloads/clarity-phase-3 (or MOCKUPS=...)
// and opened in Playwright too, with the real fonts: Nekst is inside each
// mock-up, DM Sans comes from the same @fontsource files the app uses (the
// Google Fonts request is answered locally). Each mock-up draws a desktop
// frame and a phone frame; the desktop frame is also measured at 700px for
// half width. Nothing in ~/Downloads is run: the files are opened as pages.
//
// For every screen and state, at 1280px, 700px, 390px and 360px, dark and
// light, it measures the app (and the mock-up's frame, for the record):
//  - one coral button on every guided screen (at most one elsewhere);
//  - 44px tap areas;
//  - no coral in any chart, bar or scale mark; figures mint for good and
//    grey below the standard, never coral (26 Oct rule 1);
//  - icons with words: the icon centred on the middle of the capitals
//    (within 1px), 16px, and 6px from its words; the "i" 6px after its sentence;
//  - pop-ups 12px inside both screen edges (first, middle and last mark);
//  - no keys (legends);
//  - no sideways scrolling (360px included);
//  - the writing rules on every line people read: one sentence per line,
//    no colons (times aside) or brackets, no dashes or semicolons, none of
//    the banned words, rule 64 (a question about one thing names it) and
//    rule 65 (results hold up a mirror, never judge or give orders).
// Then it lists the wording that differs from the mock-up (figures, dates
// and names made neutral), each either explained by an approved later rule
// (ALLOWED, with the reason) or left "to check".
//
// Every date is FIXED (tests/phase2/fixed-day.mjs): the seed is built
// around Wed 21 Oct 2026 (week 4 of the seeded sprint running, week 3's
// debrief window open) and every browser's clock starts on it; a state
// that needs another time (after midnight, the window closed) moves its own
// context's clock. It ends with the usual seeded plan and running sprint on
// the real today (--reset). Writes report.txt (and screenshots) to the
// folder. Exits 1 when a rule check fails or a wording line is left to check.
import { chromium } from 'playwright';
import { FIXED_TODAY, seedFixed, seedForReal, fixClock, fixedLabel, londonInstant } from '../phase2/fixed-day.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-3');
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
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) throw signInError;
const me = signIn.user.id;
console.log(`Fixed day: ${fixedLabel()}`);
const today = FIXED_TODAY;
const dayKey = (n, from = today) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

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
  'submit', 'ok', 'click', 'tap', 'mate', 'nice', 'purpose', 'intake', 'ground', 'hrs', 'wks', 'min', 'about \\d+ minutes',
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
    ? '.ds-sdial, .ds-ychart, .ds-bar, .ds-wchart, .ds-dial, .ds-chart, .ds-guide-pct, .ds-scale'
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
  // tough-week opening word for word (rule 20), M6's link "Not sure?
  // Answer 3 questions" (a label, kept as drawn), the celebration word for
  // word (writing rule 19: "Great week, Sam! You smashed your standard."),
  // and the stepper's empty value, drawn as M5 draws it (a placeholder, not words).
  const approved = [/^For example: /, /^Not your strongest (week|sprint)\. What still went well\?$/, /^Not sure\? Answer 3 questions$/, /^Great (week|sprint)(, [^!]+)?! You (smashed your standard|averaged \d+%)\.$/, /^–$/];
  for (const l of lines) {
    if (approved.some((re) => re.test(l))) continue;
    const plain = l.replace(/\bDr\. /g, 'Dr ').replace(/\be\.g\. /gi, 'eg ').replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    if (/[()[\]]/.test(l)) writing.push(`brackets: ${l}`);
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    if (/[·•]/.test(l)) writing.push(`dot between items (26 Oct rule 5): ${l}`);
    if (/\bstep \d+ of \d+\b/i.test(l)) writing.push(`step count: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(words(l))) writing.push(`banned "${w}": ${l}`);
  }

  // Buttons: never "I" or "me" (writing rule 13), never Submit, OK or Go.
  for (const b of buttons) {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\b(I|me|Submit|OK|Go)\b/.test(t)) writing.push(`button words (writing rule 13): ${t}`);
  }

  // Rule 64: a question about one thing names it ("How much did “Grow
  // through referrals” move?", never "this Strategy" or "it").
  // The add panels' questions are about the thing being written in that
  // same panel, which has no name until it is typed (M1 and M5 as approved;
  // naming the chosen Strategy would change the label as you choose, and
  // panels never jump, experience rule 45).
  // "Where did it show today?" follows the rating question on the same
  // screen, which names the way of being (M5 as approved; audit R2).
  const aboutTheNewThing = /^(Which Strategies did it help\?|How much did it help\?|Which Strategy does it serve\?|How much will it move this Strategy\?|Which week should it move to\?|Which day\?|Which week\?|Where did it show today\?)$/;
  for (const l of lines) {
    if (!/\?$/.test(l) || aboutTheNewThing.test(l)) continue;
    if (/\b(this|that) (project|item|person|strategy|habit|objective|to-do|thing|win)\b/i.test(l) || /\b(did|does|is|was) it\b/i.test(l)) writing.push(`rule 64, name the one thing: ${l}`);
  }
  // Rule 65: results hold up a mirror: nothing called unimportant or a
  // waste, and no labels that give orders.
  for (const l of lines) {
    if (/\b(unimportant|not important|of no value|a waste|waste of|pointless|useless)\b/i.test(l)) writing.push(`rule 65, never judge: ${l}`);
    if (/^(fix|free up)\b/i.test(l) && !/[.?!]$/.test(l)) writing.push(`rule 65, a label never orders: ${l}`);
  }

  // Figures: mint for good, grey below the standard, never coral (26 Oct rule 1).
  const figures = [];
  let tokens = null;
  if (side === 'app') {
    const probe = document.createElement('span');
    (root.closest('.ui-root') || root.querySelector('.ui-root') || document.querySelector('.ui-root')).appendChild(probe);
    const resolve = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
    tokens = { good: resolve('--good'), grey: resolve('--text-2'), text: resolve('--text') };
    probe.remove();
    for (const el of root.querySelectorAll('.ds-stat-value, .ds-logweek-total strong, .ds-objfig-change, [class*="--good"], [class*="--below"]')) {
      // Chart and dial marks are checked above as marks (no coral); here, the figures in words.
      if (outside(el) || !vis(el) || el.closest('button') || el instanceof SVGElement) continue;
      const cls = String(el.className?.baseVal ?? el.className);
      figures.push({ what: label(el), cls, color: getComputedStyle(el).color });
    }
  }

  // Pop-up triggers, for the caller to open.
  const tips = [...root.querySelectorAll('[data-tip]')].filter((el) => !outside(el) && vis(el)).length;
  const headings = [...root.querySelectorAll('h1, h2, h3, .ds-guide-question, .ds-guide-title, .qh, .ttl')].filter((el) => vis(el) && !outside(el)).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  return { lines, coralButtons, small, coralMarks, markColours, mintMarks, icons, keys, sideways, writing, tips, headings, figures, tokens, guided: guided ? Boolean(document.querySelector('.ds-guide')) : false, theme: document.documentElement.getAttribute('data-theme') };
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
// approved later rule wins (progress.md, steps 1 to 4). Each entry: the
// screens it covers, a pattern on the neutral line, and why.
const ALLOWED = [
  // Everywhere
  { side: 'both', re: /^(Breathe|Skip|Back|Next|Close)$/, why: 'shared tool chrome (the Breathe orb and the guided tool foot) is measured, not compared word for word' },
  { side: 'mock', re: /^\d+%$|^#%$|^#$/, why: 'figures come from src/lib/scores on the seeded rows, not the mock-up’s' },
  { side: 'both', re: /^(Saving|Saved|Will sync)$/, why: 'save status changes as it saves' },
  { side: 'mock', re: /^Who can see this: /, why: 'the mock-up spells the screen-reader words out; the app keeps them in .ds-sr' },
  { side: 'mock', re: /^i$/, why: 'the mock-up’s "i" is a letter; the app draws the shared InfoIcon' },
  { side: 'mock', re: /·/, why: 'no dots between items (26 Oct rule 5): separate labels' },
  { side: 'mock', re: /^you and tim$/, why: 'the test client has no coach, so the eye reads "Only you" (26 Oct rule 7)' },
  { side: 'app', re: /^only you$/, why: 'the test client has no coach, so the eye reads "Only you" (26 Oct rule 7)' },
  { side: 'mock', re: /about # minutes/, why: '"~5 minutes" (CLAUDE.md 27, writing rule 28)' },
  { side: 'app', re: /^~# minutes$/, why: '"~5 minutes" (CLAUDE.md 27, writing rule 28)' },
  { side: 'app', re: /^#% complete$/, why: 'the % complete bar replaces the step list on guided steps, as in approved M6 (decisions part 2)' },
  { side: 'mock', re: /^(#|sleep|gratitude|be|do|priority|strategy|risk|your day|numbers|went well|differently|strategies|tomorrow|stress|objectives|in the way|adjust|next week|summary)$/, why: 'the % complete bar replaces the step list on guided steps, as in approved M6 (decisions part 2)' },
  { side: 'mock', re: /^(plan my day|review my day|weekly performance debrief)( <day> # <month>)?$/, why: 'the top bar names the tool; the date is in the page (rule 5 of 26 Oct: no dots)' },
  { side: 'app', re: /^(plan my day|review my day|weekly performance debrief)$/, why: 'the top bar names the tool; the date is in the page (rule 5 of 26 Oct: no dots)' },
  { side: 'app', re: /^#%$/, why: 'the % complete bar replaces the step list on guided steps, as in approved M6 (decisions part 2)' },
  // Invented data (made "<name>" above) and the walk-through's own state
  { side: 'both', re: /^(#\.? )?<name>((, | and |, and )<name>)*(,? ?(highest priority|high|medium|low|#\/#))?$/, why: 'invented data: the seeded test client’s names and answers, not the mock-up’s example' },
  { side: 'mock', re: /^<day>$/, why: 'day names follow the fixed day (made neutral)' },
  { side: 'both', re: /^(# )?(of )?#( (steps|litres|hours|sessions|notes|messages|minutes|conversations|coffees|late finishes|<name>))?( <day>| this week)?$|^# <day>, no more than #$|^(#|no more than #)( \w+| <name>)? a day$|^# no more than #( a day)?$|^yes or no each day, aim for # days a week$|^average #( aim for #)?$|^# of # days( this week)?$|^rated # to # <day>, aim for #$|^# this week, no more than #$|^£k$|^#k$|^# ?weeks?$/, why: 'each habit’s and objective’s own measure line, from the seeded plan through src/lib, with its unit (the mock-up’s habits differ)' },
  { side: 'app', re: /^[−–]$/, why: 'the stepper’s minus and its empty value, drawn as M5 draws them (hrs1)' },
  { screen: /review my day/, side: 'app', re: /^add another$/, why: 'lists are rows (CLAUDE.md 30): up to three rows with Add another, for M5’s three numbered boxes' },
  { screen: /review my day/, side: 'mock', re: /^(high|medium|low)$/, why: 'the mock-up has a Strategy chosen; nothing is chosen in this walk-through, so no Low, Medium, High shows yet' },
  { screen: /plan my day/, side: 'mock', re: /^if it happens: /, why: 'no colons (writing rule 48): “If it happens, …” (step 1)' },
  { screen: /no plan/, side: 'app', re: /^try one of these\.$/, why: 'data: with no plan there are no earlier ways of being, so M5’s “You’ve used these recently.” is left out and the suggestions open the list' },
  { screen: /no plan/, side: 'mock', re: /^(or try one of these\.|you've used these recently\.|add a to-do|last night you also wrote this note\.|if it needs doing, add it as a to-do\.)$/, why: 'CHOICE (audit P0): with no plan, Do offers Build my plan, and there is no last night or earlier way of being' },
  { screen: /debrief, add a to-do/, side: 'both', re: /^(this week|week #),? <day> # <month> to <day> # <month>$/, why: 'data: week 3 is debriefed on Wednesday of week 4, so its next week is this week, named as the sprint page’s panel names it; M1’s debrief is at the end of week 4' },
  { screen: /debrief, your days/, side: 'both', re: /^strateg(y|ies) that moved$/, why: 'M1’s “Strategy that moved”, plural when several moved that day' },
  { side: 'app', re: /^(on last night's list|to-do this week|habit, .*|rolled over from week #|rolls over from week #|highest priority|done)$/, why: 'the mock-up’s dotted line split into separate labels, the Strategy and the tag (26 Oct rule 5)' },
  { side: 'app', re: /^(skipped|add)$/, why: 'M5’s note: skipped answers show in the summary with an Add link (this walk-through answers nothing)' },
  { side: 'mock', re: /^change$/, why: 'the mock-up’s answers are filled in; this walk-through answers nothing, so its rows say Skipped with Add (M5 note)' },
  { screen: /plan my day/, side: 'app', re: /^(you haven't chosen any to-dos yet\.|choose my to-dos)$/, why: 'nothing was chosen in this walk-through, so M5’s own empty state shows (M5 pri step)' },
  { screen: /plan my day/, side: 'mock', re: /^only you$/, why: 'nothing was chosen in this walk-through, so the list and its eye are not shown (M5’s own empty state)' },
  { screen: /no plan/, side: 'app', re: /^(your to-dos and strategies come from your plan\.|build your plan, and they show here\.|build my plan)$/, why: 'CHOICE (audit P0): with no plan, Do and Strategy offer Build my plan' },
  { screen: /no plan today/, side: 'both', re: /^(which of (this week's|<day>'s) to-dos did you do( <day>)?\?|did you do anything else on this week's list\?|show this week's list|choose any that moved <day>\.|on a scale of # to # how (<name> were you <day>|was <day>)\?|this morning you said <day> would serve <name>( and <name>)? most\.)$/, why: 'CHOICE (audit R0, step 2): no plan for the day, so the first screen lists this week’s list, and there is no way of being or Strategy of the day to name' },
  { screen: /review my day/, side: 'both', re: /^this morning you said <day> would serve <name>( and <name>)? most\.$/, why: 'invented data: the seeded morning chose two Strategies, the mock-up’s one' },
  { screen: /review my day/, side: 'mock', re: /^how much did it move\?$/, why: 'rule 64: the app names the Strategy (“How much did “Grow through referrals” move?”), shown once one is chosen' },
  { screen: /review my day/, side: 'mock', re: /^so far this week: /, why: 'no colons, one full sentence (writing rule 48): “So far this week you have …”, with each habit’s full name' },
  { screen: /review my day/, side: 'app', re: /^so far this week you have /, why: 'no colons, one full sentence (writing rule 48): “So far this week you have …”, with each habit’s full name' },
  { screen: /review my day/, side: 'mock', re: /^(did you finish late <day>\?|<name>)$/, why: 'no question is stored for a habit: the row uses its name (as the sprint page, Phase 2)' },
  { screen: /review my day/, side: 'mock', re: /^# of # done$|^plus # more from this week's list\.$/, why: 'invented data: nothing is ticked in this walk-through, so the summary’s to-dos row is skipped' },
  { screen: /debrief/, side: 'mock', re: /^your usual range is # to #%\.$/, why: 'data: the seeded sprint has fewer than 6 finished weeks, so “Your usual range appears after 6 weeks.” (M8)' },
  { screen: /debrief/, side: 'app', re: /^your usual range appears after # weeks\.$/, why: 'data: the seeded sprint has fewer than 6 finished weeks, so “Your usual range appears after 6 weeks.” (M8)' },
  { screen: /debrief/, side: 'mock', re: /^(share with tim|only you can see this debrief\.|tim will see this week's scores, your objective figures and your three answers\.)$/, why: 'the test client has no coach, so there is no share row (step 3: no coach, no row)' },
  { screen: /debrief/, side: 'mock', re: /^in a row, including this one$/, why: 'a full sentence (writing rule 48, 26 Oct rule 9): “You’ve debriefed 3 weeks in a row, including this one.” (step 3)' },
  { screen: /debrief/, side: 'app', re: /^(you've debriefed # weeks in a row, including this one\.|this week starts your streak\.)$/, why: 'a full sentence (writing rule 48, 26 Oct rule 9) for M1’s “In a row, including this one” (step 3)' },
  { screen: /debrief/, side: 'both', re: /^(here's your week, sam\.|great week, sam! you smashed your standard\.|what went well is saved with your week\.)$/, why: 'data: the seeded week 3 is at the standard, so the celebration shows (writing rule 19); the mock-up’s week is below it' },
  { screen: /debrief/, side: 'mock', re: /^fill in any day you missed, or leave it empty\.$/, why: 'writing rule 5 bans “missed”: “Fill in any day you didn’t log, or leave it empty.” (step 3)' },
  { screen: /debrief/, side: 'app', re: /^fill in any day you didn't log, or leave it empty\.$/, why: 'writing rule 5 bans “missed”: “Fill in any day you didn’t log, or leave it empty.” (step 3)' },
  { screen: /debrief/, side: 'mock', re: /^(not yet, by # <month> #|done)$/, why: 'milestones say “reached” (decisions 26 Oct, 11:43): “Not reached yet, due by …” (step 3)' },
  { screen: /debrief/, side: 'app', re: /^not reached yet, due by # <month> #$/, why: 'milestones say “reached” (decisions 26 Oct, 11:43): “Not reached yet, due by …” (step 3)' },
  { screen: /debrief/, side: 'both', re: /^# review my day entr(y|ies) this week$/, why: 'invented data: one Review my day entry in the seeded week 3, seven in the mock-up' },
  { screen: /finished/, side: 'mock', re: /^finish to lock in your score\.$/, why: 'a finished debrief opens on its summary, still changeable (step 3): “Your week is debriefed.”' },
  { screen: /finished/, side: 'app', re: /^(your week is debriefed\.|you can still change your answers\.)$/, why: 'a finished debrief opens on its summary, still changeable (step 3)' },
  { side: 'mock', re: /^performance score this week( ?#%)?$/, why: 'M5 (scoring methods): the live score is labelled "so far" wherever it shows' },
  { side: 'app', re: /^performance score this week so far( ?#%)?$/, why: 'M5 (scoring methods): the live score is labelled "so far" wherever it shows' },
];

// Invented data: names and answers differ between the mock-ups' example
// and the seeded test client (both invented). Each is made "<name>" in the
// neutral form, so only the wording around them is compared. The mock-ups'
// come from their own data (M5's STR, OPEN, RECENT, LASTNOTE and answers;
// M1's OBJ0, STRATS, MEAS, todos, DAYS and answers); the app's are read
// from the test database for each seed.
const MOCK_DATA = [
  'Maintain my availability to do good work', 'Deepen my coaching craft', 'Grow through referrals', 'Build The Clarity Portal',
  'Call Evan before 09:00 about the referral', 'Finish the Harbour case study', 'Send the Harbour proposal by 12:00', 'Training session',
  'Reflective notes after each session', 'Check-in message to a past client', 'Strategic block, 30 minutes', 'Book a physio assessment',
  'Present with my team', 'Calm under pressure', 'Idea: a short workshop for the Harbour leadership team.',
  'Breakfast with my daughter before school.', 'Back-to-back calls run over and the proposal slips.', 'Block 11:00 to 12:00 and move the 11:30 call if I need to.',
  'In the Harbour call, when the price question came up.', 'The Harbour call landed and the proposal went out at 11:50.',
  'Coaching clients', 'How world-class is my coaching?', 'Annual revenue', 'Publish my coaching book',
  'Be fit and healthy', 'Protect my evenings', 'Stay sharp', 'Reflect after every session', 'Keep learning', 'Stay in touch with past clients', 'Weekly strategic block',
  'Steps', 'Training sessions', 'Water', 'Late finishes', 'Focus', 'Reflective notes', 'Reading', 'Check-in messages', 'Strategic block happened', 'Did you finish late today?',
  'Ask Evan for an introduction to Harbour', 'Draft the Harbour case study', 'Shortlist breathing sound loops', 'Update my LinkedIn profile',
  'Test the new Plan my day with two clients', 'Book a supervision session', 'Renew supervision contract', 'Spoke at a breakfast event and two people asked about coaching',
  'Clear morning, two good sessions back to back.', 'Got the Harbour introduction from Evan.', 'Strategic block went well.', 'Long walk between calls.', 'Good energy all day.', 'Family day, no screens.', 'Light planning for next week.',
  'Start the reflective note straight after, not at lunch.', 'Finished late again. Protect Tuesday evenings.', 'Drink water before coffee.', 'Fewer back-to-back calls.', 'Prepare Monday on Friday.', 'Start earlier on Sunday.',
  'Two strong client weeks in a row, and the Harbour introduction landed.', 'Two late finishes on Tuesday and Thursday ate my evenings.', 'Block out 17:30 to 18:30 on Tuesdays for wrap-up, then stop.',
];
let appData = [];
async function loadAppData() {
  const rows = async (q, col) => ((await q).data || []).map((r) => r[col]).filter(Boolean);
  appData = [
    ...(await rows(db.from('plan_strategies').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('outcome_objectives').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('habits').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('todos').select('text').eq('user_id', me), 'text')),
    ...(await rows(db.from('wins').select('what').eq('user_id', me), 'what')),
    NIGHT, NOTE, 'A quiet start.', 'The Harbour call landed.', 'Leave ten minutes between calls.', 'Two referral calls landed.', 'Late finishes on Tuesday.', 'Stop work by 18:30 on weekdays.',
  ];
}
const dataNames = () => [...new Set([...MOCK_DATA, ...appData])]
  .map((n) => n.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase())
  .sort((a, b) => b.length - a.length);

// Neutral form of a line: figures, dates, days and names made the same.
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December';
const DAYS = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow|Yesterday';
const neutral = (l) => dataNames().reduce((t, n) => t.split(n).join('<name>'), l
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/‑/g, '-')
  .toLowerCase())
  .replace(new RegExp(`\\b(${DAYS.toLowerCase()})\\b`, 'g'), '<day>')
  .replace(new RegExp(`\\b(${MONTHS.toLowerCase()})\\b`, 'g'), '<month>')
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
  const reasons = new Set();
  for (const l of missing) {
    const why = allowed(screen, 'mock', l);
    if (why) reasons.add(why.why);
    (why ? explained : check).push(`mock-up only: ${l}${why ? `  [${why.why}]` : ''}`);
  }
  for (const l of extra) {
    const why = allowed(screen, 'app', l);
    if (why) reasons.add(why.why);
    (why ? explained : check).push(`app only: ${l}${why ? `  [${why.why}]` : ''}`);
  }
  const same = [...m].filter((l) => a.has(l)).length;
  return { same, total: m.size, explained, check, reasons: [...reasons] };
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
  await page.click(`button[data-k="${key}"]`);
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
async function appContext(width, mode, clock) {
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
  await fixClock(context, clock);
  await context.addInitScript((m) => {
    // Each context starts from the state saved straight after signing in,
    // so no page's device copy or draft from another size is ever shown.
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

const settle = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  new Promise((r) => { setTimeout(r, 3000); }),
]));
const go = async (page, path, sel) => {
  await page.goto(`${APP}${path}`);
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.waitForTimeout(700);
  await settle(page);
};
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title').first().textContent()) || '').trim();
// Next, one step at a time. A press the double-tap guard swallowed is
// pressed again only once the step plainly hasn't moved, and never on the
// last step (its button finishes the tool).
const percent = async (page) => Number(await page.locator('.ds-guide-pct').first().getAttribute('aria-valuenow').catch(() => '0')) || 0;
async function nextStep(page, times = 1) {
  for (let n = 0; n < times; n += 1) {
    const before = `${await heading(page)}|${await percent(page)}`;
    for (let i = 0; i < 5; i += 1) {
      if ((await percent(page)) >= 100) throw new Error('nextStep reached the last step');
      await page.locator('.ds-guide-next').click();
      const end = Date.now() + 3000;
      while (Date.now() < end && `${await heading(page)}|${await percent(page)}` === before) await page.waitForTimeout(100);
      if (`${await heading(page)}|${await percent(page)}` !== before) break;
    }
    await settle(page);
  }
}
const openPanel = async (page, name) => {
  await button(page, name).click();
  await page.waitForSelector('.ds-panel', { timeout: 15000 });
  await page.waitForTimeout(400);
  await settle(page);
};

async function appMeasure(page, width, mode, guided, scope) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const r = await page.evaluate(measure, { side: 'app', CORAL, MINT, BANNED, guided, scope });
  r.pop = await popups(page, width, width < 769);
  return r;
}

// ------------------------------------------------------------ the data
const NIGHT = 'Call Evan before 09:00 about the referral';
const NOTE = 'A short workshop for the Harbour leadership team.';
let sprint = null;
let weekStart = null;
async function loadSprint() {
  sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running')).data?.[0] || null;
  weekStart = sprint ? dayKey(14, sprint.start_on) : null; // week 3, whose debrief window is open
}
const strategyId = async (name) => (await db.from('plan_strategies').select('id').eq('user_id', me).eq('name', name).is('archived_at', null)).data[0].id;
// Last night's review and an earlier way of being, for Plan my day.
async function lastNight() {
  await db.from('day_reviews').delete().eq('user_id', me);
  await db.from('day_plans').delete().eq('user_id', me);
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'plan_my_day']);
  await db.from('day_reviews').insert({ user_id: me, local_date: dayKey(-1), status: 'finished', finished_at: `${dayKey(-1)}T20:30:00Z`, tomorrow: [NIGHT], on_my_mind: NOTE });
  await db.from('day_plans').insert({ user_id: me, local_date: dayKey(-2), way_of_being: 'Calm under pressure', status: 'finished', finished_at: `${dayKey(-2)}T08:00:00Z` });
}
// This morning's plan, as Plan my day saves it, for Review my day.
async function thisMorning() {
  await db.from('day_reviews').delete().eq('user_id', me).eq('local_date', today);
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', today);
  await db.from('todos').delete().eq('user_id', me).in('source', ['plan_my_day']);
  const todo = async (text) => (await db.from('todos').select('id').eq('user_id', me).eq('text', text).eq('sprint_id', sprint.id)).data[0].id;
  const plan = (await db.from('day_plans').insert({ user_id: me, local_date: today, way_of_being: 'Calm under pressure', grateful_for: 'A quiet start.', status: 'finished', finished_at: `${today}T08:00:00Z` }).select('id').single()).data.id;
  await db.from('day_plan_todos').insert([
    { day_plan_id: plan, todo_id: await todo('Draft the Harbour case study'), user_id: me, is_top: true },
    { day_plan_id: plan, todo_id: await todo('Shortlist breathing sound loops'), user_id: me, is_top: false },
  ]);
  await db.from('day_plan_strategies').insert([
    { day_plan_id: plan, strategy_id: await strategyId('Grow through referrals'), user_id: me },
    { day_plan_id: plan, strategy_id: await strategyId('Deepen my coaching craft'), user_id: me },
  ]);
}
// Week 1 debriefed (week 2 not, so its window has closed with no debrief),
// and one Review my day in week 3 for "Your days".
async function debriefWeeks() {
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id);
  await db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: 1, status: 'finished', finished_at: `${dayKey(8, sprint.start_on)}T18:00:00Z` });
  await db.from('day_reviews').delete().eq('user_id', me);
  const r = (await db.from('day_reviews').insert({ user_id: me, local_date: dayKey(2, weekStart), went_well: 'The Harbour call landed.', differently: 'Leave ten minutes between calls.', status: 'finished', finished_at: `${dayKey(2, weekStart)}T20:00:00Z` }).select('id').single()).data;
  await db.from('day_review_strategies').insert({ day_review_id: r.id, strategy_id: await strategyId('Grow through referrals'), level: 3, user_id: me });
}
async function week3Finished() {
  await db.from('weekly_debriefs').delete().eq('user_id', me).eq('sprint_id', sprint.id).eq('sprint_week', 3);
  await db.from('weekly_debriefs').insert({ user_id: me, sprint_id: sprint.id, sprint_week: 3, status: 'finished', finished_at: `${today}T09:00:00Z`, stress: 'a_little', went_well: 'Two referral calls landed.', got_in_way: 'Late finishes on Tuesday.', adjust: 'Stop work by 18:30 on weekdays.' });
}

// ------------------------------------------------------------ the screens
// mock: [file, key, steps] or null when the state isn't mocked (rules only).
// flow: [file, key] walks every step. clock: the context's own time.
const M5 = 'm5-daily-tools.html';
const M1 = 'm1-performance-system.html';
const GUIDE = '.ds-guide';
const DIALOG = '.ds-panel'; // the app's panel (the guided tool itself is a dialog too)
const SHEET = '.sheet'; // the mock-ups' panel
const GROUPS = [
  {
    seed: ['--reset'],
    before: lastNight,
    screens: [
      { id: 'plan my day', flow: [M5, 'plan'], open: (p) => go(p, '/my-day/plan', '.ds-guide-question') },
      { id: 'plan my day, add a to-do', scope: DIALOG, mock: [M5, 'plan', ['go:3', 'todoopen']], open: async (p) => { await go(p, '/my-day/plan', '.ds-guide-question'); await nextStep(p, 3); await openPanel(p, 'Add a to-do'); } },
      { id: 'review my day, no plan today', flow: [M5, 'rev'], open: (p) => go(p, '/my-day/review', '.ds-guide-question') },
    ],
  },
  {
    before: thisMorning,
    screens: [
      { id: 'plan my day, set', scope: GUIDE, mock: [M5, 'plan', ['go:7']], open: (p) => go(p, '/my-day/plan', '.ds-guide-question') },
      { id: 'review my day', flow: [M5, 'rev'], open: (p) => go(p, '/my-day/review', '.ds-guide-question') },
      { id: 'review my day, this week’s list open', scope: GUIDE, mock: [M5, 'rev', ['more']], open: async (p) => { await go(p, '/my-day/review', '.ds-guide-question'); await button(p, 'Show this week’s list').click(); await button(p, 'Hide this week’s list').waitFor(); await settle(p); } },
      { id: 'review my day, add a win', scope: DIALOG, mock: [M5, 'rev', ['go:3', 'winopen']], open: async (p) => { await go(p, '/my-day/review', '.ds-guide-question'); await nextStep(p, 3); await openPanel(p, 'Add an unplanned win'); } },
      { id: 'review my day, after midnight', scope: GUIDE, mock: null, clock: () => londonInstant(dayKey(1), '00:30'), open: (p) => go(p, '/my-day/review', '.ds-guide-question') },
    ],
  },
  {
    before: debriefWeeks,
    screens: [
      { id: 'sprint page, debrief ready', mock: null, open: (p) => go(p, '/performance-sprint', '.ds-sdial--running') },
      { id: 'debrief', flow: [M1, 'debrief'], open: (p) => go(p, '/performance-sprint/debrief', '.ds-guide-question') },
      { id: 'debrief, add a win', scope: DIALOG, mock: [M1, 'debrief', ['winopen']], open: async (p) => { await go(p, '/performance-sprint/debrief', '.ds-guide-question'); await openPanel(p, 'Add an unplanned win'); } },
      { id: 'debrief, your days open', scope: GUIDE, mock: [M1, 'debrief', ['ds:3', 'fold:days', 'day:0']], open: async (p) => { await go(p, '/performance-sprint/debrief', '.ds-guide-question'); await nextStep(p, 3); await p.locator('.deb-days .ds-collapse-summary, .deb-days button').first().click(); await p.locator('.deb-days [aria-expanded]').nth(1).click().catch(() => {}); await settle(p); } },
      { id: 'debrief, add a to-do', scope: DIALOG, mock: [M1, 'debrief', ['ds:6', 'addopen']], open: async (p) => { await go(p, '/performance-sprint/debrief', '.ds-guide-question'); await nextStep(p, 6); await openPanel(p, 'Add a to-do'); } },
      { id: 'debrief, week 2 closed', mock: null, open: (p) => go(p, `/performance-sprint/debrief/${sprint.id}/2`, '.deb-closed') },
      { id: 'debrief, none open today', mock: null, clock: () => londonInstant(dayKey(1), '12:30'), open: (p) => go(p, '/performance-sprint/debrief', '.deb-closed') },
    ],
  },
  {
    before: week3Finished,
    screens: [
      { id: 'debrief, finished opens on its summary', scope: GUIDE, mock: [M1, 'debrief', ['ds:7']], open: (p) => go(p, '/performance-sprint/debrief', '.ds-guide-question') },
    ],
  },
  {
    seed: ['--empty'],
    screens: [
      { id: 'plan my day, no plan', flow: [M5, 'plan'], open: (p) => go(p, '/my-day/plan', '.ds-guide-question') },
      { id: 'debrief, no sprint', mock: null, open: (p) => go(p, '/performance-sprint/debrief', '.deb-closed') },
    ],
  },
];

// WIDTHS=1280,390 and MODES=dark narrow a run while working on it; the full run uses all.
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1280, 700, 390, 360];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];
const report = [];
const table = [];
const mock = await mockPage();

/** The rule checks on one measured app screen. */
function ruleChecks(tag, r, guided) {
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: ${guided ? 'one coral button' : 'at most one coral button'}`, guided ? r.coralButtons.length === 1 : r.coralButtons.length <= 1, r.coralButtons.join('; '));
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in any chart, bar or scale mark`, r.coralMarks.length === 0, r.coralMarks.slice(0, 4).join('; '));
  const badIcon = r.icons.filter((i) => Math.abs(i.off) > 1 || Math.abs(i.gap - 6) > 0.75 || Math.abs(i.size - 16) > 0.5);
  pass(`${tag}: icons centred on the capitals, 16px, 6px from their words (${r.icons.length})`, badIcon.length === 0, badIcon.slice(0, 3).map((i) => `${i.what} off ${i.off} gap ${i.gap} size ${i.size}`).join('; '));
  pass(`${tag}: no keys`, r.keys.length === 0, r.keys.join('; '));
  if (r.pop.n) pass(`${tag}: pop-ups 12px inside the edges (${r.pop.n} marks)`, r.pop.worst !== null && r.pop.worst >= 11.5, `${r.pop.worst === null ? 'none opened' : `${r.pop.worst.toFixed(1)}px`}`);
  pass(`${tag}: writing rules (with rules 64 and 65)`, r.writing.length === 0, [...new Set(r.writing)].slice(0, 4).join(' | '));
  // Figures: mint only for good, grey for below, never coral.
  const t = r.tokens;
  const badFig = (r.figures || []).filter((f) => {
    if (CORAL.includes(f.color)) return true;
    if (/--good\b/.test(f.cls)) return f.color !== t.good;
    if (/--below\b/.test(f.cls)) return f.color !== t.grey;
    return MINT.includes(f.color);
  });
  pass(`${tag}: figures mint for good, grey below the standard, never coral (${(r.figures || []).length})`, badFig.length === 0, badFig.slice(0, 3).map((f) => `${f.what} ${f.cls} ${f.color}`).join('; '));
}

const wanted = (id) => !ONLY || ONLY.test(id);
for (const group of GROUPS) {
  if (!group.screens.some((s) => wanted(s.id))) continue;
  if (group.seed) {
    seedFixed(...group.seed);
    await loadSprint();
  }
  if (group.before) await group.before();
  await loadAppData();
  for (const mode of MODES) {
    // The mock-up side, once per mode.
    const mocks = {};
    for (const s of group.screens.filter((x) => wanted(x.id))) {
      if (s.mock) mocks[s.id] = await mockState(mock, ...s.mock, mode, s.scope === DIALOG ? SHEET : null);
      if (s.flow) mocks[s.id] = await mockFlow(mock, ...s.flow, mode);
    }
    for (const width of WIDTHS) {
      for (const s of group.screens.filter((x) => wanted(x.id))) {
        const tag = `${s.id}, ${width}px ${mode}`;
        // Each screen on a fresh device (no step or draft carried over from
        // another screen), with its own clock when the state needs one.
        const own = await appContext(width, mode, s.clock ? s.clock() : undefined);
        const { page, phone } = own;
        try {
          await s.open(page, phone);
        } catch (e) {
          pass(`${tag}: opens`, false, e.message.split('\n')[0]);
          await own.context.close();
          continue;
        }
        const appSteps = [];
        if (s.flow) {
          for (let i = 0; i < 20; i += 1) {
            const r = await appMeasure(page, width, mode, true, GUIDE);
            appSteps.push(r);
            ruleChecks(`${tag}, step ${i + 1} "${(r.headings.find((h) => h) || '').slice(0, 40)}"`, r, true);
            if (SHOTS && (width === 1280 || width === 360)) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${i + 1}-${width}-${mode}.png`), fullPage: true });
            // The last step is the one at 100%; its button finishes, so it is never pressed.
            const pct = (await page.locator('.ds-guide-pct').count()) ? Number(await page.locator('.ds-guide-pct').first().getAttribute('aria-valuenow')) : 0;
            if (pct >= 100 || !(await page.locator('.ds-guide-next').count())) break;
            await nextStep(page);
          }
        } else {
          const r = await appMeasure(page, width, mode, s.scope === GUIDE, s.scope);
          appSteps.push(r);
          ruleChecks(tag, r, s.scope === GUIDE);
          pass(`${tag}: follows the mode`, r.theme === mode, `${r.theme}`);
          if (SHOTS && (width === 1280 || width === 360)) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${width}-${mode}.png`), fullPage: true });
        }
        // Wording against the mock-up: laptop and phone, dark only (the words don't change with the mode).
        if (mode === 'dark' && (width === 1280 || width === 390)) {
          const mockSteps = s.flow ? mocks[s.id].map((f) => f[width]) : s.mock ? [mocks[s.id][width]] : [];
          const entry = { screen: s.id, width, mocked: Boolean(s.flow || s.mock), steps: [] };
          appSteps.forEach((a, i) => {
            if (!mockSteps.length) { entry.steps.push({ app: a.headings[0] || s.id, mock: null }); return; }
            // A flow's step pairs with the mock-up step that asks the same
            // question; failing that, the one in the same place (each tool
            // has M5's or M1's eight steps), then the likest.
            const sims = mockSteps.map((m, j) => ({ j, sim: similarity(a.headings.concat(a.lines.slice(0, 12)), m.headings.concat(m.lines.slice(0, 12))) }));
            const q = neutral(a.headings.find((h) => h) || '');
            const same = sims.find(({ j }) => neutral(mockSteps[j].headings.find((h) => h) || '') === q);
            const best = !s.flow ? { j: 0, sim: 1 }
              : same || (appSteps.length === mockSteps.length ? sims[i] : [...sims].sort((x, y) => y.sim - x.sim)[0]);
            const m = mockSteps[best.j];
            const d = wordingDiff(s.id, a.lines, m.lines);
            entry.steps.push({ app: a.headings.find((h) => h) || `step ${i + 1}`, mock: m.headings.find((h) => h) || `mock step ${best.j + 1}`, sim: best.sim, ...d, mockRules: { coral: m.coralButtons.length, small: m.small.length, coralMarks: m.coralMarks.length, keys: m.keys.length, sideways: m.sideways } });
          });
          table.push(entry);
        }
        await own.context.close();
      }
    }
  }
}
seedForReal('--reset');
await browser.close();

// ------------------------------------------------------------ report
report.push('PHASE 3 MOCK-UP COMPARISON', `${new Date().toISOString()} (fixed day ${fixedLabel()})`, '');
for (const e of table) {
  report.push(`== ${e.screen}, ${e.width}px`);
  for (const st of e.steps) {
    if (!st.mock) { report.push(`  ${st.app}: not mocked (rules only)`); continue; }
    report.push(`  ${st.app}  <->  mock-up "${st.mock}" (similarity ${st.sim.toFixed(2)}): ${st.same} of ${st.total} mock-up lines the same; mock-up rules: ${st.mockRules.coral} coral buttons, ${st.mockRules.small} small taps, ${st.mockRules.coralMarks} coral marks, ${st.mockRules.keys} keys`);
    for (const l of st.explained) report.push(`    kept: ${l}`);
    for (const l of st.check) report.push(`    to check: ${l}`);
  }
}
// The table for the report: one row per screen and state.
report.push('', 'SCREENS AND STATES');
const screens = [...new Set(table.map((e) => e.screen))];
for (const id of screens) {
  const entries = table.filter((e) => e.screen === id);
  const steps = entries.flatMap((e) => e.steps);
  const failed = results.some((r) => r.startsWith('FAIL') && r.includes(`  ${id}, `));
  const check = steps.reduce((n, st) => n + (st.check?.length || 0), 0);
  const reasons = [...new Set(steps.flatMap((st) => st.reasons || []))];
  const status = !entries[0].mocked ? 'not mocked: rules only' : check ? `${check} wording lines to check` : reasons.length ? 'matches with a change' : 'matches';
  report.push(`- ${id}: ${failed ? 'RULE CHECK FAILED; ' : ''}${status}${reasons.length ? ` (${reasons.join('; ')})` : ''}`);
}
report.push('', 'RULE CHECKS', ...results);
writeFileSync(join(out, 'report.txt'), report.join('\n'));
const toCheck = table.reduce((n, e) => n + e.steps.reduce((k, s) => k + (s.check?.length || 0), 0), 0);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(report.slice(report.indexOf('SCREENS AND STATES'), report.indexOf('RULE CHECKS')).join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed; ${toCheck} wording lines to check; report in ${join(out, 'report.txt')}`);
process.exit(failures || toCheck ? 1 : 0);
