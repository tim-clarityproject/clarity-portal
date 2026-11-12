// Phase 4 step 9: every Phase 4 screen and state measured against its
// mock-up (M2 Home as Today, M3 the menus and hubs, M19 Sleep wind down and
// Work's done, the Breathe orb), in the running app on the TEST database
// only, signed in as the invented test client (every other host and every
// email call is blocked).
//
//   node --import ./tests/scores/register.mjs tests/phase4/compare.mjs [folder]
//
// The mock-ups are opened from the scratchpad copy (or MOCKUPS=...), with
// the real fonts: Nekst is inside each mock-up, DM Sans comes from the same
// @fontsource files the app uses (the Google Fonts request is answered
// locally). Nothing in a mock-up is run but its own drawing. Each mock-up
// draws a desktop frame and a phone frame; the desktop frame is also
// measured at 640px for half width.
//
// For every screen and state, at 1280px, 640px, 390px and 360px, dark and
// light, it measures the app (and the mock-up's frame, for the record):
//  - exactly one coral button where the screen has a main action, never more;
//  - 44px tap areas;
//  - no coral in any chart, dial or bar mark; figures mint for good and
//    grey (or the text colour) below the standard, never coral;
//  - icons with words: centred on the middle of the capitals (within 1px),
//    16px, 6px from their words; the "i" 6px after its sentence;
//  - pop-ups 12px inside both screen edges;
//  - no keys (legends);
//  - no sideways scrolling (360px included);
//  - the writing rules on every line people read: one sentence per line, no
//    colons (times aside) or brackets, no dashes or semicolons, the banned
//    words (START-HERE writing rule 5 and the old names), rule 60 (saved
//    items named in words, the date on the right), rule 64 (a question about
//    one thing names it) and rule 65 (results never judge or give orders).
// Then:
//  - the safe area: Home Screen app on a notch (47px) and a Dynamic Island
//    (59px) phone, every Phase 4 page and the open menu inside the insets;
//  - tap counts: Log today, Daily plan, Daily review and Add a to-do from
//    Home, on desktop and phone, in every moment of a mid-sprint day;
//  - the wording that differs from the mock-up (figures, dates and names
//    made neutral), each explained by an approved later rule (ALLOWED, with
//    the reason) or left "to check".
//
// Every date is FIXED (tests/phase2/fixed-day.mjs): the seed is built around
// Wed 21 Oct 2026 and every browser's clock is set per screen. Seeded rows
// for the evening and the morning after are deleted at the end, and the test
// client is put back on the real today (plan v3.2, Sprint 1). Writes
// report.txt (and screenshots) to the folder. Exits 1 when a rule check
// fails or a wording line is left to check.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FIXED_TODAY, seedFixed, seedForReal, londonInstant } from '../phase2/fixed-day.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const MOCKS = process.env.MOCKUPS || join(homedir(), 'Downloads', 'clarity-phase-4');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || join(process.cwd(), 'tmp-compare4');
const SHOTS = process.env.SHOTS !== '0';
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['screens', 'safe', 'taps'];

if (FIXED_TODAY !== '2026-10-21') throw new Error('compare.mjs is written around the default fixed day, Wed 21 Oct 2026.');
for (const f of ['m2-home.html', 'm3-hub-pages.html', 'm19-sleep-wind-down.html', 'breathe-orb.html']) {
  if (!existsSync(join(MOCKS, f))) throw new Error(`Mock-up not found: ${join(MOCKS, f)}`);
}

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

const WED = FIXED_TODAY;
const THU = '2026-10-22';
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(250);
  }
  return v;
}
const seedAround = (day, ...flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags, `--today=${day}`], { stdio: 'pipe' }).toString().trim();

// ------------------------------------------------------------ what is measured
const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)', 'rgb(185, 61, 43)'];
const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];
// START-HERE writing rule 5, the casual words (rule 4), "tap" and "click"
// (rule 41), short units (26 Oct rule 8), and the old names people no
// longer see (CLAUDE.md 8 and 26; decisions: Points of leverage removed).
const BANNED = [
  'journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'optimize', 'synergy', 'wellness',
  'self-care', 'hold space', 'failed', 'fail', 'missed', 'behind', 'sorted', 'crack on', 'reckon',
  'submit', 'ok', 'click', 'tap', 'mate', 'nice', 'love that', 'purpose', 'intake', 'ground', 'hrs', 'wks', 'min', 'about \\d+ minutes',
  'inversion', 'tough conversation', 'if-then', 'wheel of life', 'decision history', 'my decisions', 'stop doing audit', 'time allocation audit',
  'above or below the line', 'chemistry call', 'points of leverage',
];

/**
 * Runs in the page. side 'app' measures the whole page (header, phone bar,
 * the Breathe button and toasts left out) or one part (scope); side 'mock'
 * one mock-up frame, or one part of it.
 */
function measure({ side, frame, CORAL, MINT, BANNED, scope }) {
  const whole = side === 'app' ? document.body : document.querySelector(frame);
  const inScope = scope ? [...whole.querySelectorAll(scope)].find((el) => el.getBoundingClientRect().width > 0) : null;
  const root = inScope || whole;
  const chrome = side === 'app' ? '.hdr, nav.ds-phone-bar, .ds-orb, .ds-toast-region' : '[data-hdw], [data-nb], [data-mn], .fab, [data-tw], [data-ov], .nbar, .hd';
  const always = side === 'app' ? '.ds-sr, .ds-tip[hidden], [inert], [hidden]' : '.vh, .fbar [data-sv], [hidden], .toast';
  const hide = inScope ? always : `${chrome}, ${always}`;
  const outside = (el) => !inScope && el.closest(chrome);
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0] || el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;

  // Lines people read.
  const style = document.createElement('style');
  // A word kept whole (keepWords: .ds-keep, never wrapping) is read as part
  // of its line: inside a flex button it would otherwise become its own
  // piece ("Add a" + "to-do"), as innerText splits flex items.
  style.textContent = `${hide} { display: none !important; } body .ui-root .ds-keep { display: contents !important; }`;
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
    ? '.ds-mdial, .ds-sdial, .ds-ychart, .ds-bar, .ds-wchart, .ds-dial, .ds-chart, .ds-guide-pct, .ds-scale'
    : '.hd2, [class*=dial], .yc, .ych, .ychart, .bar, .pctw, svg.rd, .rdial';
  const marks = [];
  for (const chart of root.querySelectorAll(chartSel)) {
    if (outside(chart) || !vis(chart)) continue;
    for (const el of [chart, ...chart.querySelectorAll('*')]) {
      if (el.closest('button:not([data-tip]):not(.yb), a') && !el.matches('[data-tip]') && !el.closest('.ds-mdial, .hd2')) continue;
      const st = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const paints = [st.backgroundColor, el instanceof SVGElement ? st.fill : null, el instanceof SVGElement ? st.stroke : null, el.matches('i, span:empty') ? st.borderTopColor : null]
        .filter((c) => c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)' && !/^url/.test(c));
      for (const c of paints) marks.push({ c, el: label(el), coral: CORAL.includes(c), mint: MINT.includes(c) });
    }
  }
  const coralMarks = [...new Set(marks.filter((m) => m.coral).map((m) => `${m.el} ${m.c}`))];

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
      const cs = getComputedStyle(last.parentElement);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const mt = ctx.measureText('H');
      const base = ch.top + (ch.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 + mt.fontBoundingBoxAscent;
      const off = icon.top + icon.height / 2 - (base - mt.actualBoundingBoxAscent / 2);
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
  // celebration word for word (writing rule 19), and the stepper's empty value.
  const approved = [/^For example: /, /^Great (week|sprint)(, [^!]+)?! You (smashed your standard|averaged \d+%)\.$/, /^–$/];
  for (const l of lines) {
    if (approved.some((re) => re.test(l))) continue;
    const plain = l.replace(/\bDr\. /g, 'Dr ').replace(/\be\.g\. /gi, 'eg ').replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    if (/[()[\]]/.test(l)) writing.push(`brackets: ${l}`);
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    if (/[·•]/.test(l)) writing.push(`dot between items (26 Oct rule 5): ${l}`);
    if (/…/.test(l)) writing.push(`cut off with "…": ${l}`);
    if (/\bstep \d+ of \d+\b/i.test(l)) writing.push(`step count: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(words(l))) writing.push(`banned "${w}": ${l}`);
  }
  // Buttons: never "I" or "me" (writing rule 13), never Submit, OK or Go.
  // Help's situations are said the way the person would say them (M2: "I'm
  // under pressure"), so they are rows of situations, not commands.
  for (const b of buttons) {
    if (b.matches('.ds-helplist-row, .hl button, .hl a')) continue;
    // Recovery's "Ready to go again" (was M15's "I’m ready to go again";
    // buttons never say "I", decisions part 4, Phase 4 reported) is checked
    // like every other button.
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\b(I|me|Submit|OK|Go)\b/.test(t)) writing.push(`button words (writing rule 13): ${t}`);
  }
  // Rule 64: a question about one thing names it.
  const aboutTheNewThing = /^(Which Strategies did it help\?|How much did it help\?|How much did it help “[^”]+”( and “[^”]+”|, “[^”]+”)*\?|How much will it move\?|How much will it move “[^”]+”\?|Which Strategy does it serve\?|Which week should it move to\?|Which day\?|Which week\?|Where did it show today\?)$/;
  for (const l of lines) {
    if (/^How much (will it move|did it help) (this|these) Strateg/i.test(l)) writing.push(`rule 64, name the Strategy: ${l}`);
    if (!/\?$/.test(l) || aboutTheNewThing.test(l)) continue;
    if (/\b(this|that) (project|item|person|strategy|habit|objective|to-do|thing|win|tool|thought)\b/i.test(l) || /\b(did|does|is|was) it\b/i.test(l)) writing.push(`rule 64, name the one thing: ${l}`);
  }
  // Rule 65: results hold up a mirror.
  for (const l of lines) {
    if (/\b(unimportant|not important|of no value|a waste|waste of|pointless|useless)\b/i.test(l)) writing.push(`rule 65, never judge: ${l}`);
    if (/^(fix|free up)\b/i.test(l) && !/[.?!]$/.test(l)) writing.push(`rule 65, a label never orders: ${l}`);
  }

  // Rule 60: saved items named in words, the tool under, the date on the right.
  const saved = [];
  if (side === 'app') {
    const dateAsName = /^(today|yesterday)$|^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d|^\d{1,2}(st|nd|rd|th)?\s+[a-z]{3}|^\d{4}-\d{2}-\d{2}/i;
    for (const row of root.querySelectorAll('.hlist-row, .ds-hub-recent .ds-row, .ds-carryon .ds-row')) {
      if (!vis(row)) continue;
      const t = row.querySelector('.hlist-row-title, .ds-row-title');
      const d = row.querySelector('.hlist-row-date, .ds-row-date, .ds-row-meta');
      if (!t) continue;
      const title = t.textContent.trim();
      if (dateAsName.test(title)) saved.push(`a date as the name: ${title}`);
      if (row.matches('.hlist-row')) {
        const tb = t.getBoundingClientRect();
        const db2 = d?.getBoundingClientRect();
        if (!db2 || db2.left < tb.left + 40 || Math.abs(db2.top - tb.top) > 12) saved.push(`the date is not on the right of "${title.slice(0, 30)}"`);
        if (!row.querySelector('.hlist-row-tags b')?.textContent.trim()) saved.push(`no tool under "${title.slice(0, 30)}"`);
      }
    }
  }

  // Figures: mint for good, grey (or the text colour) below the standard, never coral.
  const figures = [];
  let tokens = null;
  if (side === 'app') {
    const probe = document.createElement('span');
    (root.closest('.ui-root') || root.querySelector('.ui-root') || document.querySelector('.ui-root')).appendChild(probe);
    const resolve = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
    tokens = { good: resolve('--good'), grey: resolve('--text-2'), text: resolve('--text') };
    probe.remove();
    for (const el of root.querySelectorAll('.ds-stat-value, .ds-weekline-figure, .ds-mdial-line, .ds-logweek-total strong, .ds-objfig-change, [class*="--good"], [class*="--below"]')) {
      if (outside(el) || !vis(el) || el.closest('button:not(.ds-weekline):not(.ds-mdial)') || el instanceof SVGElement) continue;
      const cls = String(el.className?.baseVal ?? el.className);
      figures.push({ what: label(el), cls, color: getComputedStyle(el).color });
    }
  }

  const tips = [...root.querySelectorAll('[data-tip]')].filter((el) => !outside(el) && vis(el)).length;
  const headings = [...root.querySelectorAll('h1, h2, h3, .ds-guide-question, .ds-guide-title, .ds-end-title, .ds-page-title, .ds-suggest-question')].filter((el) => vis(el) && !outside(el)).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  return { lines, coralButtons, small, coralMarks, icons, keys, sideways, writing, saved, tips, headings, figures, tokens, theme: document.documentElement.getAttribute('data-theme') };
}

/** Opens the first, middle and last pop-up and measures them against the screen. */
async function popups(page, touch) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-tip]')) {
      if (el.closest('[inert], [aria-hidden="true"]')) el.removeAttribute('data-cmp-tip');
      else el.setAttribute('data-cmp-tip', '');
    }
  });
  const n = await page.locator('[data-cmp-tip]:visible').count();
  if (!n) return { n: 0, worst: null };
  let worst = null;
  for (const i of [...new Set([0, Math.floor(n / 2), n - 1])]) {
    const el = page.locator('[data-cmp-tip]:visible').nth(i);
    const read = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden && getComputedStyle(x).display !== 'none');
      if (!t) return null;
      const b = t.getBoundingClientRect();
      return { left: b.left, right: window.innerWidth - b.right };
    });
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      if (touch) await el.tap({ timeout: 2000 });
      else await el.hover({ timeout: 2000 });
    } catch { /* focus next */ }
    let r = await until(read, 1500);
    if (!r) {
      await el.focus().catch(() => {});
      r = await until(read, 1500);
    }
    if (r) {
      const inside = Math.min(r.left, r.right);
      if (worst === null || inside < worst) worst = inside;
    }
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur?.());
  }
  return { n, worst };
}

// ------------------------------------------------------------ approved differences
// Mock-up wording the app does not show, or shows differently, because an
// approved later rule wins, or because the invented data differ
// (progress.md, Steps 1 to 8). Each entry: the screens it covers, a pattern
// on the neutral line, and why.
const ALLOWED = [
  // Everywhere
  { side: 'mock', re: /^\d+%$|^#%$|^#$/, why: 'figures come from src/lib/scores on the seeded rows, not the mock-up’s' },
  { side: 'both', re: /^(saving|saved|will sync)$/, why: 'save status changes as it saves' },
  { side: 'mock', re: /^who can see this: /, why: 'the mock-up spells the screen-reader words out; the app keeps them in .ds-sr' },
  { side: 'mock', re: /^i$/, why: 'the mock-up’s "i" is a letter; the app draws the shared InfoIcon' },
  { side: 'mock', re: /·/, why: 'no dots between items (26 Oct rule 5): separate labels' },
  { side: 'mock', re: /about # minutes|^no more than # minutes$/, why: '"~4 minutes" times (CLAUDE.md 27, writing rule 28)' },
  { side: 'both', re: /^(good (morning|afternoon|evening)|good to see you), <name>$/, why: 'invented data: the seeded client’s first name, not the mock-up’s Sam' },
  { side: 'both', re: /^(# )?(of )?#( (steps|litres|l|hours|sessions|notes|messages|minutes|late finishes|<name>))?( <day>| this week| today)?$|^(#|no more than #)( \w+| <name>)? a day$|^yes or no each day, aim for # days a week$|^average #( aim for #)?$|^# of # days( this week)?$|^rated # to # <day>, aim for #$|^# this week, no more than #$|^£k$|^#k$/, why: 'each habit’s own measure line, from the seeded plan through src/lib (the mock-up’s habits differ)' },
  { side: 'both', re: /^(#\.? )?<name>((, | and |, and )<name>)*(,? ?(highest priority|high|medium|low|#\/#|habit|to-do))?$/, why: 'invented data: the seeded test client’s names, not the mock-up’s example' },
  { side: 'both', re: /^<day>( # <month>)?$/, why: 'dates follow the fixed day (made neutral)' },
  { side: 'app', re: /^~# minutes$/, why: '"~4 minutes" times (CLAUDE.md 27, writing rule 28)' },
  { side: 'both', re: /^[−–+]$/, why: 'the stepper’s minus and plus, drawn as icons in the mock-up' },
  { side: 'both', re: /^# <day>, no more than #$|^#( <name>)? today$/, why: 'each habit’s own measure line, from the seeded plan through src/lib (the mock-up’s habits differ)' },
  // Home (M2)
  // Phase 5 preview fixes (Tim, 5 Nov; decisions part 4, "Phase 5 preview check").
  { screen: /./, side: 'mock', re: /^only you$/, why: 'DECLUTTER (Tim, 5 Nov): the eye alone beside the title, its words in the pop-up and for screen readers' },
  { screen: /^home/, side: 'mock', re: /^your to-dos for <day> show here once you've planned your day\.$/, why: 'DECLUTTER (Tim, 5 Nov): no line saying what will show' },
  { screen: /^home, afternoon/, side: 'mock', re: /^(how is <day> going\?|your review is suggested from #.*)$/, why: 'ONE CARD TAKES TURNS (Tim, 5 Nov): after Daily plan’s morning, the due monthly review takes the card' },
  { screen: /^home/, side: 'app', re: /^your day's done, <name>$|^your day's done, sam$/, why: 'DAY STATES (Tim, 5 Nov): reviewed, the greeting is “Your day’s done, Sam.” at any time of day' },
  { screen: /^home, recovery|recovery/i, side: 'app', re: /^you're in recovery, so there are no numbers to log <day>\.$/, why: 'A PAUSED TOOL IS A GATE (Tim, 5 Nov): Recovery’s Home says there are no numbers to log today' },
  { screen: /^home/, side: 'mock', re: /^((coaching )?session with (<name>|tim) <day> at #\.?|what would make it useful\?|get ready for my session|ready for your monthly review\?|start my check-in|<name> has sent you a note\.|read my note|your agreement is ready to sign\.|read and sign)$/, why: 'quiet lines with no data until Phase 6a (the coach’s note, the coaching session, the agreement): left out (Step 2); the monthly review’s line (Phase 5 step 1) shows only while this month’s check-in is due' },
  { screen: /^home, new coaching/, side: 'app', re: /^(ready for your first review\?|start my first review)$/, why: 'data: the new coaching client has not started the First review, so Home asks “Ready for your first review?” (Phase 5 step 1, M12 v14); M2 draws it half done (“Ready to finish your first review?”)' },
  { screen: /^home/, side: 'app', re: /^(ready for your monthly review\?|start my check-in)$/, why: 'the monthly review’s quiet line (M2, built in Phase 5 step 1) shows while this month’s check-in is due; the mock-up’s state shows it only on some moments' },
  // Tim, 10 Nov (part 5): the renames, the calm layout, the slim menu and five-word ratings.
  { side: 'mock', re: /^(plan my day|review my day|ready for your monthly check-in\?|ready to finish your first check-in\?|finish my first check-in|they'll wait for you in <day>'s plan my day\.|plan my day will have them ready\.|from review my day( and last night's sleep wind down)?|performance sprint # ends on <day> # <month>\.)$/, why: 'Tim, 10 Nov (part 5): Plan my day is the Daily plan, Review my day the Daily review, the check-in the Monthly review and First review, and no sentence carries a sprint number' },
  { side: 'app', re: /^(daily plan|daily review|start my daily plan|start my daily review|your monthly review is ready\.|start my monthly review|monthly hardware and software review|<month> review|they'll wait for you in <day>'s daily plan\.|your daily plan will have them ready\.|from daily review( and last night's sleep wind down)?|your performance sprint ends on <day> # <month>\.|weekly performance debrief)$/, why: 'Tim, 10 Nov (part 5): Plan my day is the Daily plan, Review my day the Daily review, the check-in the Monthly review and First review, and no sentence carries a sprint number; the test client now has two pinned tools' },
  { side: 'app', re: /^(view your week|priority #)$/, why: 'Tim, 10 Nov (part 5): the dial’s line is the link itself, “View your week”; a carried-over item says which of last night’s priorities it was' },
  { side: 'app', re: /^(poor|fair|good|very good|excellent|rated each day, aim for (poor|fair|good|very good|excellent)( or lower)?)$/, why: 'ratings are five words, never numbers (5e rule 29i; Tim, 10 Nov (part 5); CLAUDE.md 26c)' },
  { screen: /^menu open/, side: 'app', re: /^(with others|dashboard|plan|reset|review|sign out)$/, why: 'the slim desktop menu (menu-options.html, option A; Tim, 9 Nov) lists Dashboard, Plan, Reset and Review under Personal, With others, and Sign out' },
  { screen: /^menu open/, side: 'mock', re: /^(dashboard, plan, reset, review|breathe|log <day>)$/, why: 'the slim desktop menu (option A; Tim, 9 Nov): no area lines, and no Log today or Breathe in it' },
  { screen: /^home/, side: 'mock', re: /^week # of #$/, why: 'LATER RULE: the dial’s line names the sprint and is a quiet link into it (Tim, 3 Nov, Phase 2 preview fixes 7f5959e): “Sprint 1, week 4 of 8”' },
  { screen: /^home/, side: 'app', re: /^sprint #,? week # of #$/, why: 'LATER RULE: the dial’s line names the sprint and is a quiet link into it (Tim, 3 Nov, Phase 2 preview fixes 7f5959e): “Sprint 1, week 4 of 8”' },
  { screen: /^hub, plan$/, side: 'mock', re: /^week # of #$/, why: 'NAMED DIFFERENCE: the tiles’ live lines (“Sprint 4, week 4 of 8”) are not built; tiles show their fixed line and time (Step 1 left them for later)' },
  { screen: /^menu open/, side: 'mock', re: /^(meeting planner|journal|get unstuck)$/, why: 'invented data: M3’s example pins; the app shows the test client’s own pins (person_settings.page_preferences.menu_pins, menuPins.js)' },
  { screen: /^hub, review$/, side: 'app', re: /^(hardware and software check-in|check your body and mind are backing your performance\.|~# minutes)$/, why: 'Phase 5 step 1: the check-in is built, so it gets its tile; its line says how it helps (CLAUDE.md 16, one line on how it helps, as Life balance review’s “Check the rest of your life is backing your performance.”), for M3’s “Check in on your hardware and software each month.”' },
  { screen: /^home/, side: 'mock', re: /^your usual range is # to #%\.$/, why: 'data: the seeded sprint has fewer than 6 finished weeks, so “Your usual range appears after 6 weeks.” (M2’s own rule)' },
  { screen: /^home/, side: 'app', re: /^your usual range appears after # weeks\.$/, why: 'data: the seeded sprint has fewer than 6 finished weeks, so “Your usual range appears after 6 weeks.” (M2’s own rule)' },
  { screen: /^home/, side: 'app', re: /^(daily plan|daily review|add a to-do)$/, why: 'RULE OVER MOCK-UP: Daily plan, Daily review and Add a to-do on Today, for two taps from Home (experience rule 21; Step 2)' },
  { screen: /^home/, side: 'mock', re: /^i need help with something$/, why: 'RULE OVER MOCK-UP: never “I” on a button (writing rule 13, 27 Oct): “Get help with something” (Step 9)' },
  { screen: /^home/, side: 'mock', re: /^(# of # to-dos done so far\.)$/, why: 'UNDEFINED: “2 of 3 to-dos done so far” is not in the scoring methods, so no count line (Step 2)' },
  { screen: /^home/, side: 'mock', re: /^(how you want to be <day>|<day>'s strategy)$/, why: 'data: no Daily plan is finished for the day shown, so Today says “Your to-dos for today show here once you’ve planned your day.” (M2’s own before-planning state)' },
  { screen: /^home/, side: 'app', re: /^your to-dos for <day> show here once you've planned your day\.$/, why: 'data: no Daily plan is finished for the day shown, so Today says “Your to-dos for today show here once you’ve planned your day.” (M2’s own before-planning state)' },
  { screen: /^home/, side: 'app', re: /^(highest priority|only you|habit|to-do|this week|log <day>|litres|yes|no|# weekly habits, # done|performance score this week|#%|week # of #)$/, why: 'the tag and label words of Today, Log today and the week line, as separate labels (26 Oct rule 5); the eye says “Only you” (rule 24)' },
  { screen: /^home, last week/, side: 'app', re: /^let's start with this week\.$/, why: 'data: the last-week seed has nothing logged in the last 7 days, so Home also says the coming-back line (experience rule 18; Step 2 GAP_DAYS)' },
  { screen: /^home, recovery/, side: 'mock', re: /^(recovery week|suggested for now|ready for performance sprint #\?|this is your recovery week, so nothing is tracked\.|performance sprint # can start on <day> # <month>\.|plan performance sprint #)$/, why: 'RULE OVER MOCK-UP: Recovery started at any time shows M15’s basics (sleep, Breathe, What would help you recharge today?), the later approved design (Step 2)' },
  { screen: /^home, recovery/, side: 'app', re: /^(your chart starts after your second night\.|change my target range|edit my target range)$/, why: 'LATER APPROVED DESIGN: the Recovery sleep chart (Tim, 3 Nov, 14:26): the empty chart’s one line and the target range’s quiet link, under Sleep and Breathe' },
  { screen: /^home, recovery/, side: 'app', re: /^(you're in recovery until <day> # <month>\.|# days to go\.|what would help you recharge <day>\?|this is optional, like everything here\.|only you|sleep|how did you sleep last night\?|~# minutes?|breathe|slow your breathing to settle your body\.|# # or # minutes|add a few more days|ready to go again)$/, why: 'RULE OVER MOCK-UP: Recovery started at any time shows M15’s basics (sleep, Breathe, What would help you recharge today?), the later approved design (Step 2)' },
  { screen: /^home, new/, side: 'mock', re: /^(ready to add your mission\?|add my mission)$/, why: 'data: the mission quiet line shows two weeks after joining with no mission (M2); the test account’s join date decides (home.mjs checks both)' },
  { screen: /^home, new coaching/, side: 'mock', re: /^(suggested for now|ready to finish your first review\?|you're about halfway through\.|it helps <name> get the most from your first session\.|it helps tim get the most from your first session\.|finish my first review|ready to sign your coaching agreement\?|read and sign my agreement|your first session with tim is on <day> # <month> at #\.?|done)$/, why: 'no data until Phase 6a: the First review, the agreement and the first session’s date (Step 2)' },
  { screen: /^home, wind down/, side: 'mock', re: /^(done at #|done|habit|to-do)$/, why: 'M19 draws Home’s 21:00 card on a short Home; the rest of Home follows M2 (Home’s own mock-up)' },
  // The menu and the hubs (M3)
  { screen: /^menu open/, side: 'mock', re: /^(meetings, conversations, your team|health check, strategy, leverage|settings, coaching, chat to tim)$/, why: 'CHOICE and decisions (Step 1): the Dashboard joined in Phase 5, no Your people tools yet, Points of leverage removed (Tim, 2 Nov), Chat only with a coach; lines as full phrases' },
  { screen: /^menu open/, side: 'app', re: /^(meetings and conversations|health check and strategy|settings and coaching)$/, why: 'CHOICE and decisions (Step 1): the Dashboard joined in Phase 5, no Your people tools yet, Points of leverage removed (Tim, 2 Nov), Chat only with a coach; lines as full phrases' },
  { screen: /^hub/, side: 'mock', re: /^(personal|plan|reset|review|interpersonal|strategic)i$/, why: 'the mock-up’s title runs into its letter "i"; the app draws the shared InfoIcon' },
  { screen: /^hub/, side: 'app', re: /^(personal|plan|reset|review|interpersonal|strategic)$/, why: 'the mock-up’s title runs into its letter "i"; the app draws the shared InfoIcon' },
  { screen: /^hub/, side: 'mock', re: /^(dashboard|see what's working, week by week\.|updated <day>|find my sweet spot|see where your strengths, interests and values meet\.|deliberate vs default|choose the version of you that performs when it counts\.|travel and jet lag plan|arrive sharp for what matters after a long flight\.|delegation audit|hand over what others can own\.|emotional wash|work through a strong emotion so it doesn't run you\.|work through a difficult emotion so you can think clearly again\.|identity beyond the role|remember who you are beyond the job title\.|remember who you are beyond the title, so setbacks don't shake you\.|hardware and software check-in|check in on your hardware and software each month\.|above or below the line|notice where you are and get back above the line\.|performance evidence|keep proof of your progress for the days you doubt it\.|~# minute to add|# pieces|prepare for a difficult conversation|see their side before you argue yours\.|prepare for a pitch|get clear on your message before you pitch\.|your people|map my stakeholders|read the politics and look after key relationships\.|map my team|see where each of your direct reports stands\.|understand their sweet spot|see where a direct report will be most motivated and how best to use them\.|decide who decides|make clear who owns which decisions\.|strategy on a page|put your strategy on one page your team can share\.|points of leverage|find the moves that give the biggest return\.|pre-mortem for an initiative|stop a team project going wrong before it starts\.|due this week|due this month|review due|next due <day> # <month>)$/, why: 'NOT BUILT: a tool that doesn’t exist yet gets no tile (brief Step 1; list in progress.md); Points of leverage removed (Tim, 2 Nov)' },
  { screen: /^hub/, side: 'mock', re: /^(version #|sprint # week # of #|done <day>|opens <day>|sprint # week #|draft saved|pitch on <day>)$/, why: 'NAMED DIFFERENCE: the tiles’ live lines (“Version 3.2”, “Sprint 4, week 4 of 8”, “Done today”, “Opens Friday”) are not built; tiles show their fixed line and time (Step 1 left them for later)' },
  { screen: /^hub/, side: 'mock', re: /^(referral pipeline|harbour proposal|harbour discovery call|harbour introduction call|leadership team|product team|# versions?, (latest )?<day> # <month>)$/, why: 'invented data: the mock-up’s saved items and teams; the app lists the test client’s own (HubRecent, HubTeams)' },
  { screen: /^hub/, side: 'app', re: /^(morrow cycles kick-off|<name> on contribution)$/, why: 'invented data: the test client’s own saved items (HubRecent)' },
  { screen: /^hub, reset$/, side: 'app', re: /^(sleep wind down|clear your head before bed, so you sleep well and perform <day>\.|new|~# minutes)$/, why: 'M19 (29 Oct) adds Sleep wind down to Reset, second, with New, after M3 (23 Oct)' },
  { screen: /\(m19\)/, side: 'mock', re: /^(what reset is for|reset your body so you can perform under pressure\.|get ready to perform in a high-pressure moment\.|clear your head so you can decide well\.)$/, why: 'NAMED DIFFERENCE: M19 sketches the Reset hub with its own tile lines and a “What Reset is for” link; the app keeps M3’s hub (the hubs’ mock-up) with its ⓘ, plus M19’s Sleep wind down tile' },
  { screen: /\(m19\)/, side: 'app', re: /^(personal|slow your breathing to settle your body\.|# # or # minutes|get ready for a high-pressure moment\.|clear your head\.|pin tools to my menu)$/, why: 'NAMED DIFFERENCE: M19 sketches the Reset hub with its own tile lines and a “What Reset is for” link; the app keeps M3’s hub (the hubs’ mock-up) with its ⓘ, plus M19’s Sleep wind down tile' },
  // M19
  { screen: /breathe$/, side: 'mock', re: /^change the sound$/, why: 'NOT BUILT: sound is left out until real audio files exist (brief Step 6); off until chosen' },
  { screen: /carried over/, side: 'mock', re: /^(from daily review and last night's sleep wind down|check-in message to a past client)$/, why: 'invented data: no thought here was written in both places, so no merged row (the merge is checked in wind-down.mjs)' },
  { screen: /carried over/, side: 'app', re: /^(only you|habit, .*|rolled over from week #|add a to-do|skip)$/, why: 'NAMED DIFFERENCE: Daily plan keeps Phase 3’s M5 pick rows and This week list under Carried over (Step 6)' },
  { side: 'mock', re: /^back$/, why: 'the shared guided tool draws Back as the one chevron on a phone (26 Oct rule 6)' },
  { screen: /^home/, side: 'app', re: /^get help with something$/, why: 'RULE OVER MOCK-UP: never “I” on a button (writing rule 13, 27 Oct): “Get help with something” (Step 9)' },
];

// Invented data on both sides, made "<name>" in the neutral form so only the
// wording around them is compared. The mock-ups' come from their own data
// (M2's MISSION, OBJ0, STRATS, MEAS and todos; M19's thoughts and list; M3's
// recent items); the app's are read from the test database.
const MOCK_DATA = [
  'Be a world-class high-performance coach', 'Build a practice that changes how leaders perform',
  'Maintain my availability to do good work', 'Deepen my coaching craft', 'Grow through referrals', 'Build The Clarity Portal',
  'Coaching clients', 'How world-class is my coaching?', 'Annual revenue', 'Publish my coaching book',
  'Be fit and healthy', 'Protect my evenings', 'Stay sharp', 'Reflect after every session', 'Keep learning', 'Stay in touch with past clients', 'Weekly strategic block',
  'Steps', 'Training sessions', 'Water', 'Late finishes', 'Focus', 'Reflective notes', 'Reading', 'Check-in messages', 'Strategic block happened', 'Did you finish late today?',
  'Book a physio assessment', 'Ask Evan for an introduction to Harbour', 'Draft the Harbour case study', 'Shortlist breathing sound loops', 'Update my LinkedIn profile',
  'Test the new Daily plan with two clients', 'Book a supervision session', 'Renew supervision contract', 'Spoke at a breakfast event and two people asked about coaching',
  'Call Evan before 09:00 about the referral', 'Finish the Harbour case study', 'Send the Harbour proposal', 'Send the Harbour proposal by 12:00', 'Training session',
  'Reply to Max about the workshop', 'Book a day off for the half term', 'Calm under pressure',
];
const APP_DATA = ['Call Evan before 09:00 about the referral', 'Finish the Harbour case study', 'Reply to Max about the workshop'];
let appData = [];
async function loadAppData() {
  const rows = async (q, col) => ((await q).data || []).map((r) => r[col]).filter(Boolean);
  appData = [
    ...(await rows(db.from('performance_plans').select('mission').eq('user_id', me), 'mission')),
    ...(await rows(db.from('plan_strategies').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('outcome_objectives').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('habits').select('name').eq('user_id', me), 'name')),
    ...(await rows(db.from('todos').select('text').eq('user_id', me), 'text')),
    ...APP_DATA,
  ];
}
const dataNames = () => [...new Set([...MOCK_DATA, ...appData])]
  .filter((n) => n.length > 3)
  .map((n) => n.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase())
  .sort((a, b) => b.length - a.length);

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December';
const DAYS = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow|Yesterday';
let names = [];
const neutral = (l) => names.reduce((t, n) => t.split(n).join('<name>'), l
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ').replace(/‑/g, '-')
  .toLowerCase())
  .replace(new RegExp(`\\b(${DAYS.toLowerCase()})\\b`, 'g'), '<day>')
  .replace(new RegExp(`\\b(${MONTHS.toLowerCase()})\\b`, 'g'), '<month>')
  .replace(/[£$]?\d[\d,.:]*/g, '#')
  .replace(/^(good (morning|afternoon|evening)|good to see you), [^,.!?]+$/, '$1, <name>')
  .replace(/\s+/g, ' ')
  .trim();

const allowed = (screen, side, line) => ALLOWED.find((a) => (!a.screen || new RegExp(a.screen.source, 'i').test(screen)) && (a.side === 'both' || a.side === side) && new RegExp(a.re.source, 'i').test(line));
function wordingDiff(screen, appLines, mockLines) {
  const a = new Set(appLines.map(neutral));
  const m = new Set(mockLines.map(neutral));
  const explained = [];
  const check = [];
  const reasons = new Set();
  for (const [side, from, other] of [['mock', m, a], ['app', a, m]]) {
    for (const l of [...from].filter((x) => !other.has(x))) {
      const why = allowed(screen, side, l);
      if (why) reasons.add(why.why);
      (why ? explained : check).push(`${side === 'mock' ? 'mock-up only' : 'app only'}: ${l}${why ? `  [${why.why}]` : ''}`);
    }
  }
  return { same: [...m].filter((l) => a.has(l)).length, total: m.size, explained, check, reasons: [...reasons] };
}

// ------------------------------------------------------------ the browser
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
const mockCache = new Map();
/** One mock-up state, both frames (and the desktop frame at 640px). */
async function mockState(page, { file, clicks = [], scope }, mode) {
  const key = `${file}|${clicks.join('>')}|${String(scope)}|${mode}`;
  if (mockCache.has(key)) return mockCache.get(key);
  if (process.env.VERBOSE) console.log(`mock ${key}`);
  await page.goto(`file://${join(MOCKS, file)}`);
  await Promise.race([page.evaluate(() => document.fonts.ready), sleep(5000)]);
  await page.locator(`button[data-m="${mode === 'dark' ? 1 : 0}"]`).first().click();
  await sleep(200);
  for (const c of clicks) {
    await page.locator(c).first().click({ timeout: 10000 });
    await sleep(350);
  }
  await sleep(700); // the mock-ups' reveal animation
  const args = { CORAL, MINT, BANNED };
  const sc = (phone) => (typeof scope === 'function' ? scope(phone) : scope);
  const d = await page.evaluate(measure, { ...args, side: 'mock', frame: '#dk .frame', scope: sc(false) });
  await page.evaluate(() => { document.querySelector('#dk .frame').style.width = '640px'; });
  await sleep(150);
  const half = await page.evaluate(measure, { ...args, side: 'mock', frame: '#dk .frame', scope: sc(false) });
  await page.evaluate(() => { document.querySelector('#dk .frame').style.width = ''; });
  const p = await page.evaluate(measure, { ...args, side: 'mock', frame: '#ph .frame', scope: sc(true) });
  const r = { 1280: d, 640: half, 390: p, 360: p };
  mockCache.set(key, r);
  return r;
}

let storage = null;
// The coach my_coach answers with: undefined leaves the database's answer.
let coachAnswer;
async function guard(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
    if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
    if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
    if (coachAnswer !== undefined && /\/rest\/v1\/rpc\/my_coach/.test(url)) {
      const body = coachAnswer ? [{ coach_id: '00000000-0000-4000-8000-000000000001', first_name: coachAnswer, mobile: '+447700900123', contact_ways: ['whatsapp'], away_until: null }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}
async function appContext(width, mode, { height, touch } = {}) {
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
    const s = await ctx.storageState();
    // Only the sign-in itself: no page's device copy, draft or step is carried over.
    storage = { cookies: s.cookies, origins: s.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((x) => !/^(clarity-cache|clarity-draft|ds-guide|clarity-day-plan-local|clarity-queue)/.test(x.name)) })) };
    await ctx.close();
  }
  const context = await browser.newContext({
    viewport: { width, height: height || (phone ? 844 : 900) }, hasTouch: touch ?? phone, isMobile: touch ?? phone,
    locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, storageState: storage,
  });
  await context.clock.install({ time: londonInstant(THU, '13:00') });
  await context.addInitScript((m) => {
    try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ }
  }, mode);
  await guard(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  return { context, page, phone };
}

const settle = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  new Promise((r) => { setTimeout(r, 3000); }),
]));
const path = (page) => new URL(page.url()).pathname;
const quiet = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => null);
  await until(async () => (await page.locator('.ds-loading').count()) === 0, 15000);
  await settle(page);
};
const at = (page, day, time) => page.clock.setSystemTime(londonInstant(day, time));
async function go(page, to, sel) {
  await page.goto(`${APP}${to}`);
  await page.waitForSelector(sel, { timeout: 30000 });
  await quiet(page);
}
const home = (page) => go(page, '/welcome', '.home-page .ds-page-title');
const heading = async (page) => ((await page.locator('.ds-guide-question, .ds-guide-title, .ds-end-title').first().textContent().catch(() => '')) || '').trim();
async function nextUntil(page, want, tries = 8) {
  for (let i = 0; i < tries && !want.test(await heading(page)); i += 1) {
    const before = await heading(page);
    for (let k = 0; k < 4; k += 1) {
      await page.locator('.ds-guide-skip, .ds-guide-next').first().click();
      if (await until(async () => (await heading(page)) !== before, 2500)) break;
    }
  }
  await settle(page);
  return want.test(await heading(page));
}
async function openMenu(page, phone) {
  if (phone) {
    await page.locator('.ds-bar-menu').click();
    await page.waitForSelector('#site-tile-menu .ds-tmenu-tile', { timeout: 5000 });
    await until(async () => (await page.locator('.ds-tmenu').evaluate((el) => getComputedStyle(el).opacity)) === '1', 3000);
  } else {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.waitForSelector('#site-menu .ds-dmenu-area', { timeout: 5000 });
    await until(async () => (await page.locator('.ds-dmenu').evaluate((el) => getComputedStyle(el).opacity)) === '1', 3000);
  }
  await settle(page);
}
async function hub(page, to) {
  await go(page, to, '.ds-hub-page .ds-page-title');
}

// ------------------------------------------------------------ the data
const REVIEW = APP_DATA;
async function cleanDays() {
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'other_tool', 'plan_my_day']).in('created_on', [WED, THU]);
  await db.from('day_plans').delete().eq('user_id', me).in('local_date', [WED, THU]);
  await db.from('day_reviews').delete().eq('user_id', me).in('local_date', [WED, THU]);
}
async function holdWedReview() {
  await db.from('day_reviews').delete().eq('user_id', me).eq('local_date', WED);
}
async function restoreWedReview() {
  const { data } = await db.from('day_reviews').select('id').eq('user_id', me).eq('local_date', WED).limit(1);
  if (!data?.length) await db.from('day_reviews').insert({ user_id: me, local_date: WED, status: 'finished', finished_at: `${WED}T19:30:00Z`, tomorrow: REVIEW });
}
async function cleanMorning() {
  await db.from('todos').delete().eq('user_id', me).in('source', ['review_my_day', 'other_tool', 'plan_my_day']).eq('created_on', THU);
  await db.from('day_plans').delete().eq('user_id', me).eq('local_date', THU);
  // Wednesday night's finished wind-down goes too, before the next device
  // opens anything (Phase 5 follow-up 2, open fault 2). Deleting it only
  // when that device reached the 21:15 Home screen was too late: its
  // earlier screens had already read the finished night (as the app should,
  // so a wind-down done on one device counts on all of them) and kept it
  // on the device, so Home rightly hid the card there. A person can't
  // un-finish a night, so the app was right; the test cleared it too late.
  await db.from('wind_down_nights').delete().eq('user_id', me).eq('night', WED);
}
// Wednesday evening: a plan with one to-do left open, and a finished review
// with three things for tomorrow (as tests/phase4/wind-down.mjs seeds it).
async function wednesday() {
  await cleanDays();
  const sprint = (await db.from('sprints').select('*').eq('user_id', me).eq('status', 'running').single()).data;
  const weekNow = Math.floor((Date.UTC(2026, 9, 21) - Date.parse(`${sprint.start_on}T00:00:00Z`)) / (7 * 86400000)) + 1;
  const openTodo = (await db.from('todos').select('id').eq('user_id', me).eq('sprint_id', sprint.id).eq('planned_week', weekNow).is('done_on', null).is('deleted_at', null).limit(1)).data?.[0];
  const wedPlan = (await db.from('day_plans').insert({ user_id: me, local_date: WED, status: 'finished', finished_at: `${WED}T07:30:00Z` }).select('id').single()).data;
  if (openTodo) await db.from('day_plan_todos').insert({ day_plan_id: wedPlan.id, todo_id: openTodo.id, user_id: me, is_top: true });
  await db.from('day_reviews').insert({ user_id: me, local_date: WED, status: 'finished', finished_at: `${WED}T19:30:00Z`, tomorrow: REVIEW });
}

// ------------------------------------------------------------ the screens
// mock: { file, clicks, scope } (null when the state isn't mocked: rules only).
// scope: the app part measured (a function of phone, or a selector).
// coral: 'one' (exactly one main button), 'none', or 'atMost' (one at most).
// widths: which widths the screen exists at (the desktop menu and the
// floating Breathe button only from 769px; the phone bar under it).
const M2 = 'm2-home.html';
const M3 = 'm3-hub-pages.html';
const M19 = 'm19-sleep-wind-down.html';
const ORB = 'breathe-orb.html';
const m2 = (p, mo) => ({ file: M2, clicks: [`#sw [data-p="${p}"]`, ...(mo ? [`#sw [data-mo="${mo}"]`] : [])] });
const m3 = (k, menu) => ({ file: M3, clicks: [`button[data-k="${k}"]`, ...(menu ? ['button[data-om]'] : [])], ...(menu ? { scope: (phone) => (phone ? '.tl' : '.mx') } : {}) });
const m19 = (k) => ({ file: M19, clicks: [`#sw button[data-k="${k}"]`] });
const desktopOnly = (w) => w >= 769;
const phoneOnly = (w) => w < 769;
const homeAt = async (page, day, time) => { await at(page, day, time); await home(page); };
const GUIDE = '.ds-guide';

const GROUPS = [
  {
    name: 'mid-sprint',
    seed: () => seedFixed('--reset'),
    before: wednesday,
    screens: [
      { id: 'home, morning', mock: m2('mid', 'am'), coral: 'one', open: (p) => homeAt(p, THU, '08:30') },
      { id: 'home, afternoon', mock: m2('mid', 'pm'), coral: 'one', open: (p) => homeAt(p, THU, '13:00') },
      { id: 'home, evening', mock: m2('mid', 'eve'), coral: 'one', open: (p) => homeAt(p, THU, '17:30') },
      // At 13:00 Wednesday's review (finished at 19:30) hasn't happened yet:
      // held back for this screen, or Home shows the day's done (Tim, 5 Nov).
      { id: 'home, debrief ready', mock: m2('mid', 'deb'), coral: 'one', open: async (p) => { await holdWedReview(); await homeAt(p, WED, '13:00'); } },
      { id: 'home, coming back after a gap', mock: null, coral: 'atMost', open: async (p) => { await restoreWedReview(); await homeAt(p, '2026-10-30', '10:00'); } },
      { id: 'home, help open', mock: null, coral: 'atMost', open: async (p) => { await homeAt(p, THU, '13:00'); await p.locator('.home-help .ds-btn').click(); await p.waitForSelector('.ds-helplist-row', { timeout: 5000 }); await settle(p); } },
      { id: 'header', mock: null, coral: 'none', scope: '.hdr', open: (p) => homeAt(p, THU, '13:00') },
      { id: 'phone bar', mock: null, coral: 'none', scope: 'nav.ds-phone-bar', widths: phoneOnly, open: (p) => homeAt(p, THU, '13:00') },
      { id: 'Breathe button', mock: { file: ORB, clicks: ['button[data-s="button"]'], scope: '.fab' }, coral: 'none', scope: '.ds-orb', widths: desktopOnly, open: (p) => homeAt(p, THU, '13:00') },
      // The slim desktop menu (option A, 9 Nov) has no coral button; the phone's tile menu keeps Log today.
      { id: 'menu open', mock: m3('plan', true), coral: 'most', scope: (phone) => (phone ? '.ds-tmenu' : '.ds-dmenu'), open: async (p, phone) => { await homeAt(p, THU, '13:00'); await openMenu(p, phone); } },
      { id: 'hub, Personal', mock: m3('personal'), coral: 'none', open: (p) => hub(p, '/personal') },
      { id: 'hub, Plan', mock: m3('plan'), coral: 'none', open: (p) => hub(p, '/personal/plan') },
      { id: 'hub, Reset', mock: m3('ground'), coral: 'none', open: (p) => hub(p, '/personal/reset') },
      { id: 'hub, Reset with Sleep wind down (M19)', mock: m19('hub'), coral: 'none', open: (p) => hub(p, '/personal/reset') },
      { id: 'hub, Review', mock: m3('review'), coral: 'none', open: (p) => hub(p, '/personal/review') },
      { id: 'hub, Interpersonal', mock: m3('interpersonal'), coral: 'none', open: (p) => hub(p, '/interpersonal') },
      { id: 'hub, Strategic', mock: m3('strategic'), coral: 'none', open: (p) => hub(p, '/strategic') },
      { id: 'pin tools panel', mock: null, coral: 'atMost', scope: '.ds-panel, .ds-sheet, [role=dialog]', open: async (p) => { await hub(p, '/personal/plan'); await p.getByRole('button', { name: 'Pin tools to my menu' }).click(); await p.getByRole('dialog', { name: 'Pin tools' }).waitFor({ timeout: 8000 }); await settle(p); } },
      { id: 'My Plans', mock: null, coral: 'atMost', open: async (p) => { await go(p, '/my-plans', '.hlist-wrap'); await until(async () => (await p.locator('.hlist-row, .hlist-empty').count()) > 0, 20000); } },
      { id: 'My Plans, filter open', mock: null, coral: 'atMost', open: async (p) => { await go(p, '/my-plans', '.hlist-wrap'); await p.locator('.ds-filter > button').click(); await p.waitForSelector('.ds-filter-panel:not([hidden])', { timeout: 5000 }); await settle(p); } },
      { id: 'My Reviews', mock: null, coral: 'atMost', open: async (p) => { await go(p, '/my-reviews', '.hlist-wrap'); await until(async () => (await p.locator('.hlist-row, .hlist-empty').count()) > 0, 20000); } },
      // Wednesday night, then Thursday morning: in this order, on one device.
      // Each width is a new device: last width's finished night is cleared
      // after it closes (cleanMorning), before the next device opens anything.
      { id: 'home, wind down from 21:00', mock: m19('home'), coral: 'one', open: async (p) => { await restoreWedReview(); await db.from('wind_down_nights').delete().eq('user_id', me).eq('night', WED); await homeAt(p, WED, '21:15'); } },
      { id: 'sleep wind down, tomorrow', mock: m19('think'), coral: 'one', scope: GUIDE, open: async (p) => { await at(p, WED, '22:30'); await go(p, '/sleep-wind-down', '.ds-guide-question'); await p.getByRole('textbox', { name: 'Thought 1' }).fill('Book a day off for the half term'); await until(async () => (await p.locator('.ds-guide-bar').innerText()).includes('Saved'), 8000); } },
      { id: 'sleep wind down, breathe', mock: m19('breathe'), coral: 'none', scope: GUIDE, open: async (p) => { await p.locator('.ds-guide-next').click(); await p.locator('.ds-night-breathe .ds-borb').waitFor({ timeout: 8000 }); await settle(p); } },
      { id: 'sleep wind down, Sleep well', mock: m19('night'), coral: 'none', scope: GUIDE, open: async (p) => { await p.getByRole('button', { name: 'End early' }).click(); await until(async () => (await heading(p)) === 'Sleep well', 8000); await settle(p); } },
      { id: 'daily review, close the day', mock: m19('close'), coral: 'one', scope: GUIDE, open: async (p) => { await at(p, WED, '21:00'); await go(p, '/daily-review', '.ds-guide'); await nextUntil(p, /^Ready to close the day\?$/); } },
      { id: 'daily review, Work’s done for today', mock: m19('wdone'), coral: 'one', scope: GUIDE, open: async (p) => { await nextUntil(p, /^Work’s done for today$/, 2); } },
      { id: 'daily plan, carried over', mock: m19('morning'), coral: 'one', scope: GUIDE, open: async (p) => { await at(p, THU, '08:30'); await go(p, '/daily-plan', '.ds-guide-question'); await nextUntil(p, /^What will you do today\?$/); await p.locator('.ds-pick-groups').waitFor({ timeout: 15000 }); await settle(p); } },
    ],
    after: cleanMorning,
  },
  {
    name: 'last week of the sprint',
    seed: () => seedAround('2026-09-23', '--reset'),
    screens: [
      { id: 'home, last week of the sprint', mock: m2('mid', 'last'), coral: 'one', open: (p) => homeAt(p, THU, '13:00') },
    ],
  },
  {
    name: 'Recovery',
    seed: () => seedFixed('--reset', '--recovery'),
    screens: [
      { id: 'home, Recovery', mock: m2('mid', 'rec'), coral: 'atMost', open: async (p) => { await homeAt(p, WED, '13:00'); await until(async () => (await p.locator('.home-recovery').count()) > 0, 15000); } },
    ],
  },
  {
    name: 'new',
    seed: () => seedFixed('--empty'),
    screens: [
      { id: 'home, new, no coach', mock: m2('newn'), coral: 'one', coach: null, open: (p) => homeAt(p, WED, '10:00') },
      { id: 'home, new coaching client', mock: m2('newc'), coral: 'atMost', coach: 'Tim', open: (p) => homeAt(p, WED, '10:00') },
    ],
  },
];

// WIDTHS=1280,390 and MODES=dark narrow a run while working on it; the full run uses all.
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1280, 640, 390, 360];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];
const table = [];
const wanted = (id) => !ONLY || ONLY.test(id);

function ruleChecks(tag, r, coral) {
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  const n = r.coralButtons.length;
  const coralOk = coral === 'one' ? n === 1 : coral === 'none' ? n === 0 : n <= 1;
  pass(`${tag}: ${coral === 'one' ? 'one coral button' : coral === 'none' ? 'no coral button' : 'at most one coral button'}`, coralOk, r.coralButtons.join('; ') || 'none');
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in any chart, dial or bar mark`, r.coralMarks.length === 0, r.coralMarks.slice(0, 4).join('; '));
  const badIcon = r.icons.filter((i) => Math.abs(i.off) > 1 || Math.abs(i.gap - 6) > 0.75 || Math.abs(i.size - 16) > 0.5);
  pass(`${tag}: icons centred on the capitals, 16px, 6px from their words (${r.icons.length})`, badIcon.length === 0, badIcon.slice(0, 3).map((i) => `${i.what} off ${i.off} gap ${i.gap} size ${i.size}`).join('; '));
  pass(`${tag}: no keys`, r.keys.length === 0, r.keys.join('; '));
  if (r.pop.n) pass(`${tag}: pop-ups 12px inside the edges (${r.pop.n} marks)`, r.pop.worst !== null && r.pop.worst >= 11.5, `${r.pop.worst === null ? 'none opened' : `${r.pop.worst.toFixed(1)}px`}`);
  pass(`${tag}: writing rules (with rules 64 and 65)`, r.writing.length === 0, [...new Set(r.writing)].slice(0, 4).join(' | '));
  pass(`${tag}: rule 60, saved items named in words with the date on the right`, r.saved.length === 0, r.saved.slice(0, 3).join(' | '));
  const t = r.tokens;
  const badFig = (r.figures || []).filter((f) => {
    if (CORAL.includes(f.color)) return true;
    if (/--good\b/.test(f.cls)) return f.color !== t.good;
    if (/--below\b/.test(f.cls)) return f.color !== t.grey;
    return MINT.includes(f.color);
  });
  pass(`${tag}: figures mint for good, grey or text colour below, never coral (${(r.figures || []).length})`, badFig.length === 0, badFig.slice(0, 3).map((f) => `${f.what} ${f.cls} ${f.color}`).join('; '));
}

process.on('uncaughtException', (e) => {
  pass('the run finished', false, e.message.split('\n')[0]);
  console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
  cleanDays().catch(() => null).finally(() => {
    try { seedForReal('--reset'); } catch { /* reported above */ }
    process.exit(1);
  });
});

if (PARTS.includes('screens')) {
  const mock = await mockPage();
  for (const group of GROUPS) {
    if (!group.screens.some((s) => wanted(s.id))) continue;
    console.log(`${group.name}: ${group.seed()}`);
    if (group.before) await group.before();
    await loadAppData();
    names = dataNames();
    for (const mode of MODES) {
      const mocks = {};
      for (const s of group.screens.filter((x) => wanted(x.id) && x.mock)) mocks[s.id] = await mockState(mock, s.mock, mode);
      for (const width of WIDTHS) {
        const own = await appContext(width, mode);
        const { page, phone } = own;
        for (const s of group.screens.filter((x) => wanted(x.id))) {
          if (s.widths && !s.widths(width)) continue;
          const tag = `${s.id}, ${width}px ${mode}`;
          coachAnswer = s.coach;
          if (process.env.VERBOSE) console.log(tag);
          try {
            await s.open(page, phone);
          } catch (e) {
            pass(`${tag}: opens`, false, `${e.message.split('\n')[0]} (on ${path(page)})`);
            continue;
          }
          await page.mouse.move(0, 0);
          await page.evaluate(() => document.fonts.ready);
          const scope = typeof s.scope === 'function' ? s.scope(phone) : s.scope;
          const r = await page.evaluate(measure, { side: 'app', CORAL, MINT, BANNED, scope });
          r.pop = await popups(page, phone);
          ruleChecks(tag, r, s.coral);
          pass(`${tag}: follows the mode`, r.theme === mode || s.scope === GUIDE, `${r.theme}`);
          if (SHOTS && (width === 1280 || width === 360)) await page.screenshot({ path: join(out, `${s.id.replace(/\W+/g, '-')}-${width}-${mode}.png`), fullPage: !s.scope });
          if (mode === 'dark' && (width === 1280 || width === 390)) {
            const m = s.mock ? mocks[s.id][width] : null;
            const entry = { screen: s.id, width, mocked: Boolean(s.mock), app: r.headings[0] || s.id };
            if (m) Object.assign(entry, wordingDiff(s.id, r.lines, m.lines), { mockRules: { coral: m.coralButtons.length, small: m.small.length, coralMarks: m.coralMarks.length, keys: m.keys.length, sideways: m.sideways } });
            table.push(entry);
          }
        }
        coachAnswer = undefined;
        await own.context.close();
        if (group.after) await group.after();
      }
    }
  }
  await mock.close();
}

// ------------------------------------------------------------ the safe area
// The Home Screen app on a notch phone (47px) and a Dynamic Island phone
// (59px), upright: every Phase 4 page's top bar and the open menu sit inside
// the insets, and the phone bar above the home indicator. Chromium can't
// emulate display-mode, so the app's code is served with
// "(display-mode: standalone)" read as true (as tests/phase4/header.mjs does).
if (PARTS.includes('safe')) {
  seedFixed('--reset');
  const ROUTES = ['/welcome', '/personal', '/personal/plan', '/personal/reset', '/personal/review', '/interpersonal', '/strategic', '/my-plans', '/my-reviews', '/sleep-wind-down', '/daily-plan', '/daily-review'];
  const CASES = [
    { name: 'notch', width: 390, height: 844, inset: { top: 47, left: 0, right: 0, bottom: 34 } },
    { name: 'Dynamic Island', width: 393, height: 852, inset: { top: 59, left: 0, right: 0, bottom: 34 } },
  ];
  const inside = (page, s) => page.evaluate((ins) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const bad = [];
    for (const e of document.querySelectorAll('button, a, h1, h2, h3, img, svg, input, [role=button], p, label, .ds-page-title, .ds-guide-bar *')) {
      const r = e.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || r.bottom <= 0 || r.top >= Math.min(H, 220) || r.right <= 0 || r.left >= W) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.closest('[inert], [aria-hidden="true"]')) continue;
      if (r.top < ins.top - 0.5) bad.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} top ${Math.round(r.top)}`);
    }
    const bar = document.querySelector('nav.ds-phone-bar');
    const barB = bar ? [...bar.querySelectorAll('a, button')].map((b) => b.getBoundingClientRect().bottom) : [];
    if (barB.some((b) => b > H - ins.bottom + 0.5)) bad.push(`phone bar button bottom ${Math.round(Math.max(...barB))} past ${H - ins.bottom}`);
    return { bad: bad.slice(0, 4), sideways: document.documentElement.scrollWidth > W };
  }, s);
  for (const c of CASES) {
    for (const mode of ['dark', 'light']) {
      const own = await appContext(c.width, mode, { height: c.height, touch: true });
      const { context, page } = own;
      try {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.inset });
        await context.route(`${APP}/src/**`, async (route) => {
          const res = await route.fetch();
          const body = await res.text();
          return route.fulfill({ response: res, body: body.replaceAll('(display-mode: standalone)', '(min-width: 0px)') });
        });
        await at(page, WED, '13:00');
        for (const route of ROUTES) {
          await page.goto(`${APP}${route}`);
          await until(async () => (await page.locator('.ds-page-title, .ds-guide-bar, .hdr').count()) > 0, 20000);
          await quiet(page);
          const r = await inside(page, c.inset);
          pass(`safe area, Home Screen app, ${c.name} (${c.inset.top}px) ${mode}: ${route} inside the insets`, r.bad.length === 0 && !r.sideways, `${r.bad.join('; ')}${r.sideways ? ' sideways' : ''}`);
        }
        await page.goto(`${APP}/welcome`);
        await page.waitForSelector('.home-page .ds-page-title', { timeout: 30000 });
        await quiet(page);
        await openMenu(page, true);
        const menu = await page.evaluate((ins) => {
          const H = window.innerHeight;
          const r = [...document.querySelectorAll('#site-tile-menu .ds-tmenu-tile, #site-tile-menu button')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
          return { top: Math.min(...r.map((b) => b.top)), bottom: Math.max(...r.map((b) => b.bottom)), H, ok: r.every((b) => b.top >= ins.top - 0.5 && b.bottom <= H - ins.bottom + 0.5) };
        }, c.inset);
        pass(`safe area, Home Screen app, ${c.name} (${c.inset.top}px) ${mode}: the open menu inside the insets`, menu.ok, JSON.stringify(menu));
        if (SHOTS && mode === 'dark') await page.screenshot({ path: join(out, `safe-${c.inset.top}-menu.png`) });
      } catch (e) {
        pass(`safe area, ${c.name} ${mode}: ran to the end`, false, e.message.split('\n')[0]);
      } finally {
        await context.close();
      }
    }
  }
}

// ------------------------------------------------------------ tap counts
// From Home, the fewest taps that reach each one, tried in order: on Home
// itself (0), one tap on Home (1), the menu then one tap (2). Desktop and
// phone, at every moment of a mid-sprint day and in Recovery.
const tapCounts = [];
if (PARTS.includes('taps')) {
  const TARGETS = [
    { what: 'Log today', onHome: '#log-today .home-log-title', menu: 'Log today', reached: async (p) => { const b = await p.locator('#log-today').boundingBox(); return path(p) === '/welcome' && b && b.y < 500 && b.y > -50; } },
    { what: 'Daily plan', link: /^Daily plan$|^Start my daily plan$/i, menuTool: 'Daily plan', reached: async (p) => path(p) === '/daily-plan' },
    { what: 'Daily review', link: /^Daily review$|^Start my daily review$/i, menuTool: 'Daily review', reached: async (p) => path(p) === '/daily-review' },
    { what: 'Add a to-do', link: /^Add a to-do$/i, reached: async (p) => (await p.getByLabel('What needs doing?').count()) > 0 },
  ];
  const MOMENTS = [['morning', THU, '08:30'], ['afternoon', THU, '13:00'], ['evening', THU, '17:30'], ['21:15', THU, '21:15']];
  const runTaps = async (label, day, time, width) => {
    const phone = width < 769;
    const own = await appContext(width, 'dark');
    const { page } = own;
    try {
      for (const t of TARGETS) {
        await homeAt(page, day, time);
        let n = null;
        if (t.onHome && (await page.locator(t.onHome).count())) n = 0;
        if (n === null && t.link) {
          const el = page.locator('.home-page').getByRole('button', { name: t.link }).or(page.locator('.home-page').getByRole('link', { name: t.link })).first();
          if (await el.count()) {
            await el.click();
            if (await until(() => t.reached(page), 8000)) n = 1;
            await page.keyboard.press('Escape').catch(() => null);
          }
        }
        if (n === null) {
          await homeAt(page, day, time);
          await openMenu(page, phone);
          const menuId = phone ? '#site-tile-menu' : '#site-menu';
          const name = t.menu || t.menuTool;
          const el = name ? page.locator(menuId).getByRole('button', { name, exact: true }).or(page.locator(menuId).getByRole('link', { name, exact: true })).first() : null;
          if (el && (await el.count())) {
            await el.click();
            if (await until(() => t.reached(page), 8000)) n = 2;
          }
        }
        tapCounts.push({ label, view: phone ? 'phone' : 'desktop', what: t.what, n, paused: label === 'Recovery' });
        if (label === 'Recovery') {
          await homeAt(page, day, time);
          // Recovery pauses the day's tracking (experience rule 29, M15: "nothing
          // is tracked"): Home shows the recovery basics, and these four aren't
          // offered from Home until "Ready to go again".
          // A tool the person has pinned is still in their menu (2 taps): the rule is about what Home offers.
          pass(`taps, Recovery, ${phone ? 'phone' : 'desktop'}: ${t.what} is paused (not offered from Home)`, (n === null || n === 2) && (await page.locator('.home-recovery').count()) > 0, `${n}`);
        } else {
          pass(`taps, ${label}, ${phone ? 'phone' : 'desktop'}: ${t.what} is ${n === null ? 'more than two taps' : `${n} tap${n === 1 ? '' : 's'}`} from Home`, n !== null && n <= 2);
        }
      }
    } finally {
      await own.context.close();
    }
  };
  seedFixed('--reset');
  for (const [label, day, time] of MOMENTS) for (const width of [1280, 390]) await runTaps(label, day, time, width);
  seedFixed('--reset', '--recovery');
  for (const width of [1280, 390]) await runTaps('Recovery', WED, '13:00', width);
}

await browser.close();
await cleanDays();
seedForReal('--reset');

// ------------------------------------------------------------ report
const report = ['PHASE 4 MOCK-UP COMPARISON', `${new Date().toISOString()} (fixed day ${FIXED_TODAY})`, ''];
for (const e of table) {
  report.push(`== ${e.screen}, ${e.width}px`);
  if (!e.mocked) { report.push('  not mocked: rules only'); continue; }
  report.push(`  ${e.same} of ${e.total} mock-up lines the same; mock-up rules: ${e.mockRules.coral} coral buttons, ${e.mockRules.small} small taps, ${e.mockRules.coralMarks} coral marks, ${e.mockRules.keys} keys`);
  for (const l of e.explained) report.push(`    kept: ${l}`);
  for (const l of e.check) report.push(`    to check: ${l}`);
}
report.push('', 'SCREENS AND STATES');
for (const id of [...new Set(table.map((e) => e.screen))]) {
  const entries = table.filter((e) => e.screen === id);
  const failed = results.some((r) => r.startsWith('FAIL') && r.includes(`  ${id}, `));
  const check = entries.reduce((n, e) => n + (e.check?.length || 0), 0);
  const reasons = [...new Set(entries.flatMap((e) => e.reasons || []))];
  const status = !entries[0].mocked ? 'not mocked: rules only' : check ? `${check} wording lines to check` : reasons.length ? 'matches with a change' : 'matches';
  report.push(`- ${id}: ${failed ? 'RULE CHECK FAILED; ' : ''}${status}${reasons.length ? ` (${reasons.join('; ')})` : ''}`);
}
if (tapCounts.length) {
  report.push('', 'TAP COUNTS FROM HOME');
  for (const t of tapCounts) report.push(`- ${t.label}, ${t.view}: ${t.what} ${t.paused ? 'paused in Recovery' : t.n === null ? 'more than 2' : t.n}`);
}
report.push('', 'RULE CHECKS', ...results);
writeFileSync(join(out, 'report.txt'), report.join('\n'));
const toCheck = table.reduce((n, e) => n + (e.check?.length || 0), 0);
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(report.slice(report.indexOf('SCREENS AND STATES'), report.indexOf('RULE CHECKS')).join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed; ${toCheck} wording lines to check; report in ${join(out, 'report.txt')}`);
process.exit(failures || toCheck ? 1 : 0);
