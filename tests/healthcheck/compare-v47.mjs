// Health Check 4 (was Health Check 3's compare-v46): every changed Health
// Check screen measured against the approved mock-up (M7b version 47), in the
// running app with the real fonts. Same idea as feature's
// tests/phase2/compare.mjs. Version 47 adds the style facts (type sizes,
// drop-down and box heights, the weight choices, the footer button, the
// headline's font, toasts) and the coral hover in each mode.
//
//   node tests/healthcheck/compare-v47.mjs [folder]
//   APP_URL=http://localhost:5174 (default)  MOCKUP=<path to the mock-up>
//   ONLY=<regex on the screen id>  SHOTS=0 (no screenshots)  WIDTHS=1280,360
//   TEXT2X=1 (the text at twice the size: read only the sideways and tap checks)
//
// The app is the outside Health Check (health-check.html) on the dev server.
// Its two database calls are answered here with the mock-up's own invented
// answers (Kestrel Group), as in tests/popups.mjs; every email call and
// everything outside localhost is blocked, so nothing is sent and no live
// link is used. The mock-up is opened from ~/Downloads (or MOCKUP=...): Nekst
// is inside it, DM Sans comes from the same @fontsource files the app uses
// (its Google Fonts request is answered locally). The mock-up draws a desktop
// frame and a 360px phone frame; the desktop frame is also measured at 700px
// for half width.
//
// For every screen and state, at 1280px, 700px, 390px and 360px, dark and
// light, it measures the app (and the mock-up's frame, for the record):
//  - exactly one coral button;
//  - 44px tap areas (a chart dot by its 44px hit circle);
//  - no coral in the chart (soft coral is "needs attention", not coral);
//  - icons with words: the icon centred on the middle of the capitals
//    (within 1px) and 6px from its words, measured to the icon's visible
//    edge; the ⓘ 6px after its sentence's last letter;
//  - pop-ups 12px inside both screen edges (every ⓘ, How it works and the
//    first, middle and last chart dot);
//  - no sideways scrolling (360px included);
//  - the writing rules on every line people read, pop-ups included: one
//    sentence per line; no colons; the only brackets are "(CSF)" or
//    "(CSFs)" straight after the term they introduce; no dashes or
//    semicolons; rule 64 (a question about one project names it in curly
//    quotes, with "Project n of N" above it and no panel repeating the name);
//    rule 65 (a mirror, never a judgement: question labels name a topic,
//    reasons say what was rated, nothing is called unimportant or a waste).
// Then the layout facts beside the mock-up's (section order, At a glance side
// by side or stacked, the weight choices, the chart's dots, phone rows), and
// the wording that differs from the mock-up (figures and dates made
// neutral), each either explained (ALLOWED, with the reason) or left "to
// check". Writes report.txt, table.txt and screenshots to the folder. Exits 1
// when a rule check fails or a wording difference is unexplained.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5174';
const MOCK = process.env.MOCKUP || join(homedir(), 'Downloads', 'clarity-health-check-4', 'm7b-v47.html');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
const out = process.argv[2] || join(process.cwd(), 'tmp-compare-v47');
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
mkdirSync(out, { recursive: true });

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

// ------------------------------------------------------------ the invented answers
// The mock-up's own (OWN in versions 46 and 47): Kestrel Group, 4 CSFs weighted
// Critical, Very important, Very important, Important, and 7 projects.
const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
const kestrel = (complete) => ({
  objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
  csfs: CSF.map((text, i) => ({ id: `f${i}`, text, level: [3, 2, 2, 1][i] })),
  projects: PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
  ratings: { owner: Object.fromEntries(PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])) },
  ...(complete ? { completedAt: '2026-10-27T09:00:00.000Z' } : {}),
});

// ------------------------------------------------------------ what is measured
const BANNED = [
  'journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'optimize', 'synergy', 'wellness',
  'self-care', 'failed', 'fail', 'missed', 'behind', 'sorted', 'crack on', 'reckon', 'submit', 'ok', 'click', 'tap', 'mate', 'nice', 'purpose',
];
// Rule 65: nothing is called unimportant, of no value or a waste, and no orders.
const JUDGING = ['unimportant', 'not important', 'no value', 'of no value', 'waste', 'wasted', 'worthless', 'pointless', 'you should', 'you must', 'stop doing'];
const LABELS = ['Timing', 'Progress', 'Resource', 'CSF cover', 'On track'];
// Wording the brief gives word for word, kept although a rule would word it
// differently. Version 47 took "behind" out of the order line, so none is left.
const APPROVED = [];

/** Runs in the page: side 'app' measures the Health Check page, side 'mock' one mock-up frame. */
function measure({ side, frame, BANNED, JUDGING, LABELS, APPROVED, scope, projectName }) {
  const whole = side === 'app' ? document.querySelector('.hc') : document.querySelector(frame);
  const tipBox = side === 'app' ? document.getElementById('hc-tip') : whole.querySelector('[data-tipb]');
  const inScope = scope ? [...document.querySelectorAll(scope)].find((el) => el.getBoundingClientRect().width > 0 && (side === 'app' || whole.contains(el))) : null;
  const root = inScope || whole;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0] || el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  // The colours, as this mode resolves them.
  const probe = (v, prop = 'color') => {
    const s = document.createElement('span');
    s.style[prop] = `var(${v})`;
    whole.appendChild(s);
    const c = getComputedStyle(s)[prop];
    s.remove();
    return c;
  };
  const CORAL = [...new Set([probe('--accent'), probe('--coral-fill')])].filter((c) => c && c !== 'rgba(0, 0, 0, 0)');
  const SOFT = probe('--soft');
  const PH = probe('--ph');

  // Lines people read (the screen-reader words and the mock-up's save status left out).
  const style = document.createElement('style');
  style.textContent = '.vh, [hidden], .obar [data-sv], .obar .saved, .obar .saving { display: none !important; }';
  document.head.appendChild(style);
  const lines = (root.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  style.remove();

  // Coral buttons.
  const all = side === 'app' ? document.body : whole;
  const buttons = [...all.querySelectorAll('button, a, [role=button]')].filter((el) => vis(el) && !el.closest('.obar'));
  // A button is coral by its own fill, or by its round play mark (the Watch this first panel).
  const coralButtons = buttons.filter((el) => [el, el.querySelector('.bpc')].some((x) => x && CORAL.includes(getComputedStyle(x).backgroundColor))).map(label);

  // Tap areas.
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, [role=button], [role=radio], [role=option], [role=slider]')) {
    if (!vis(el) || el.disabled) continue;
    if (el.tagName === 'INPUT' && getComputedStyle(el).opacity === '0') continue;
    const b = el.getBoundingClientRect();
    if (el.matches('g.dot')) {
      const hit = el.querySelector('.hit');
      if (hit && Number(hit.getAttribute('r')) * 2 * (b.width ? 1 : 1) >= 43.5 * (el.ownerSVGElement.viewBox.baseVal.width / el.ownerSVGElement.getBoundingClientRect().width)) continue;
      if (hit && hit.getBoundingClientRect().width >= 43.5) continue;
    }
    if (b.height >= 43.5 && b.width >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }

  // The chart: no coral; which colours it uses; each dot's place and size.
  const chart = root.querySelector('.chart svg');
  const coralMarks = [];
  const markColours = new Set();
  let dots = [];
  if (chart && vis(chart)) {
    for (const el of chart.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      for (const c of [st.fill, st.stroke]) {
        if (!c || c === 'none' || /^url/.test(c) || c === 'rgba(0, 0, 0, 0)' || c === 'transparent') continue;
        markColours.add(c);
        if (CORAL.includes(c)) coralMarks.push(`${el.tagName} ${c}`);
      }
    }
    dots = [...chart.querySelectorAll('g.dot')].map((g) => {
      const c = [...g.querySelectorAll('circle:not(.hit)')].pop();
      const rings = g.querySelectorAll('circle:not(.hit)').length;
      return { n: g.dataset.n || g.getAttribute('aria-label')?.match(/\d+/)?.[0], cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r'), sw: getComputedStyle(c).strokeWidth, rings };
    });
  }

  // Icons with words (the eye, How it works, Quick guide) and the ⓘ after a sentence.
  const metrics = (el) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return { m: ctx.measureText('H'), ls: parseFloat(cs.letterSpacing) || 0 };
  };
  const capMid = (rect, el) => {
    const { m } = metrics(el);
    const base = rect.top + (rect.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
    return base - m.actualBoundingBoxAscent / 2;
  };
  const visible = (svg) => {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const k = r.width / (vb?.width || r.width);
    const bb = svg.getBBox();
    const half = (parseFloat(getComputedStyle(svg.querySelector('path, circle')).strokeWidth) || 0) / 2;
    return { left: r.left + (bb.x - half) * k, right: r.left + (bb.x + bb.width + half) * k, mid: r.top + r.height / 2, size: r.width };
  };
  const icons = [];
  for (const el of root.querySelectorAll('.ilink')) {
    if (!vis(el)) continue;
    const svg = el.querySelector('svg');
    const text = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!svg || !text) continue;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const ch = range.getBoundingClientRect();
    const v = visible(svg);
    icons.push({ what: label(el), off: +(v.mid - capMid(ch, el)).toFixed(2), gap: +(ch.left - v.right).toFixed(2), size: +v.size.toFixed(1) });
  }
  for (const btn of root.querySelectorAll('.ipb')) {
    if (!vis(btn)) continue;
    const svg = btn.querySelector('svg');
    const host = btn.parentElement;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (btn.contains(n) || n.parentElement.closest('.vh')) continue;
      if (n.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING && n.textContent.trim()) last = n;
    }
    if (!svg || !last) continue;
    const end = last.textContent.replace(/\s+$/, '').length;
    const range = document.createRange();
    range.setStart(last, Math.max(0, end - 1));
    range.setEnd(last, end);
    const ch = range.getBoundingClientRect();
    const v = visible(svg);
    const { ls } = metrics(last.parentElement);
    icons.push({ what: `i after "${last.textContent.trim().slice(-24)}"`, off: +(v.mid - capMid(ch, last.parentElement)).toFixed(2), gap: +(v.left - (ch.right - ls)).toFixed(2), size: +v.size.toFixed(1), info: true });
  }

  // Sideways scrolling.
  let sideways;
  if (side === 'app') sideways = document.documentElement.scrollWidth - window.innerWidth;
  else {
    const sc = whole.querySelector('.scroll');
    sideways = Math.max(0, sc.scrollWidth - sc.clientWidth);
  }

  // Writing rules.
  const writing = [];
  const lower = (l) => l.toLowerCase().replace(/[’']/g, "'");
  for (const l of lines) {
    if (APPROVED.includes(l)) continue;
    const plain = l.replace(/\bDr\. /g, 'Dr ').replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((s) => /[a-z]/i.test(s));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) writing.push(`two sentences: ${l}`);
    if (/:(?!\d)/.test(l.replace(/\b\d{1,2}:\d{2}\b/g, ''))) writing.push(`colon: ${l}`);
    const brackets = l.match(/\([^)]*\)|[()[\]]/g) || [];
    for (const b of brackets) {
      const ok = /^\(CSFs?\)$/.test(b) && new RegExp(`Critical Success Factors?\\s*\\${b.slice(0, -1)}\\)`).test(l);
      if (!ok) writing.push(`brackets: ${l}`);
    }
    if (/[–—;]/.test(l)) writing.push(`dash or semicolon: ${l}`);
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(lower(l))) writing.push(`banned "${w}": ${l}`);
    for (const w of JUDGING) if (lower(l).includes(w)) writing.push(`rule 65, judging "${w}": ${l}`);
    // Rule 64: a question about one project names it, never "this project".
    if (/\?$/.test(l) && /\bthis (project|csf|critical success factor)\b/i.test(l)) writing.push(`rule 64, unnamed: ${l}`);
  }
  // Rule 64 on a project's screen: the heading names it in curly quotes, the
  // counter sits above it in the placeholder grey, and no panel repeats the name.
  const r64 = {};
  if (projectName) {
    const h = [...root.querySelectorAll('h2')].find(vis);
    const counter = [...root.querySelectorAll('.cnt2, .cnt')].find(vis);
    r64.heading = h?.textContent.trim();
    r64.named = !!h && h.textContent.includes(`“${projectName}”`);
    r64.counterAbove = !!counter && !!h && counter.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1;
    r64.counter = counter?.textContent.replace(/\s+/g, ' ').trim();
    r64.counterGrey = !!counter && [...counter.querySelectorAll('span')].concat(counter).some((s) => getComputedStyle(s).color === PH);
    r64.repeats = [...root.querySelectorAll('p, div, span, b')].filter((el) => vis(el) && !h.contains(el) && el.children.length === 0 && el.textContent.trim() === projectName).length;
    if (!r64.named) writing.push(`rule 64, not named: ${r64.heading}`);
    if (!r64.counterAbove) writing.push('rule 64, no counter above the question');
    if (r64.repeats) writing.push('rule 64, a panel repeats the name');
  }
  // Rule 65 on the questions to start with.
  const questions = [...root.querySelectorAll('.mv')].filter(vis).map((mv) => ({
    label: mv.querySelector('small')?.textContent.trim(),
    question: mv.querySelector('.nxt, .mvt')?.textContent.trim(),
    reason: mv.querySelector('.why')?.textContent.trim(),
    size: getComputedStyle(mv.querySelector('.nxt, .mvt')).fontSize,
    circle: !!mv.querySelector('.n, .num, i'),
  }));
  for (const q of questions) {
    if (!LABELS.includes(q.label)) writing.push(`rule 65, label is not a topic: ${q.label}`);
    if (!/^(You|They) (rated|didn’t)|^None of them/.test(q.reason || '')) writing.push(`rule 65, reason doesn't say what was rated: ${q.reason}`);
    if (!/\?$/.test(q.question || '')) writing.push(`rule 65, not a question: ${q.question}`);
  }

  // Layout facts.
  const rect = (sel) => { const el = [...root.querySelectorAll(sel)].find(vis); return el ? el.getBoundingClientRect() : null; };
  const layout = {};
  layout.sections = [...root.querySelectorAll('h2, h3, .obj1 .oh small, .mvs > .fl, .sortr > .fl')].filter(vis).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  const gst = rect('.gst');
  const mvs = rect('.mvs');
  if (gst && mvs) layout.glance = mvs.left >= gst.right - 1 && Math.abs(mvs.top - gst.top) < 40 ? 'side by side' : (mvs.top >= gst.bottom - 1 ? 'stacked' : 'other');
  const wrow = [...root.querySelectorAll('.wrow')].find(vis);
  if (wrow) {
    const bs = [...wrow.querySelectorAll('[role=radio], button')].filter(vis).map((b) => b.getBoundingClientRect());
    const oneRow = bs.length === 3 && bs.every((b) => Math.abs(b.top - bs[0].top) < 1);
    const equal = bs.length === 3 && bs.every((b) => Math.abs(b.width - bs[0].width) < 1.5);
    layout.weight = `${bs.length} choices${oneRow ? ', one row' : ''}${equal ? ', equal' : ''}`;
    layout.weightRows = [...root.querySelectorAll('.wrow')].filter(vis).length;
  }
  const row = [...root.querySelectorAll('.pr:not(.h)')].find(vis);
  if (row) {
    layout.rowDates = [...row.querySelectorAll('.pst > span')].filter(vis).length - 1;
    layout.rowFigures = [...row.querySelectorAll('.pm')].filter(vis).length;
  }
  const gaps = [...root.querySelectorAll('.csf .gap')].filter(vis);
  if (gaps.length) layout.gapColour = getComputedStyle(gaps[0]).color === SOFT ? 'soft coral' : getComputedStyle(gaps[0]).color;
  const bigplay = [...root.querySelectorAll('.bigplay, .vbig, [data-a="vplay"].big')].find(vis);
  if (bigplay) {
    const bg = getComputedStyle(bigplay).backgroundColor;
    const a = bg.startsWith('rgba') ? Number(bg.split(',')[3]) : 1;
    layout.watchPanel = a >= 0.999 ? 'solid' : `see-through (${bg})`;
  }
  // Style facts (version 47): type sizes, box heights, the weight choices,
  // the footer button, the headline's font and the toast, as this side draws them.
  const styleOf = (sel, props) => {
    // never inside the mock-up's Quick guide scenes, which draw whole screens in miniature
    const el = [...root.querySelectorAll(sel)].find((x) => vis(x) && !x.closest('.stg'));
    if (!el) return undefined;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) {
      if (p === 'fontFamily') o[p] = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      else if (p === 'height') o[p] = Math.round(el.getBoundingClientRect().height * 2) / 2;
      else if (p === 'lines') {
        const sp = el.querySelector('span') || el;
        const lh = parseFloat(getComputedStyle(sp).lineHeight) || parseFloat(getComputedStyle(sp).fontSize) * 1.2;
        o[p] = Math.round(sp.getBoundingClientRect().height / lh);
      } else o[p] = cs[p];
    }
    return o;
  };
  const facts = {
    title: styleOf('h2.t', ['fontSize', 'lineHeight', 'fontFamily']),
    question: styleOf('.qh', ['fontSize', 'lineHeight']),
    // its box, by min-height: on a phone the mock-up's row squeezes the box until its words wrap,
    // where the app's row moves the box under its label instead and keeps it on one line
    smallDropDown: styleOf('.dd.sm', ['minHeight', 'fontSize', 'paddingLeft', 'columnGap']),
    weightDropDown: styleOf('.wrow .dd', ['height', 'fontSize', 'paddingLeft']),
    listBox: styleOf('.srow textarea', ['minHeight', 'fontSize', 'paddingLeft', 'paddingTop']),
    removeCross: styleOf('.rm .x', ['width', 'backgroundColor']),
    weightChosen: styleOf('.seg button[aria-checked="true"]', ['borderTopWidth', 'borderTopColor', 'boxShadow', 'color']),
    weightOther: styleOf('.seg button[aria-checked="false"]', ['borderTopWidth', 'color']),
    headline: styleOf('.gst b', ['fontFamily', 'fontWeight', 'fontSize']),
    footerButton: styleOf('.ft .btn', ['paddingLeft', 'paddingRight', 'letterSpacing']),
    toast: styleOf('.toast', ['height', 'lines', 'borderTopLeftRadius', 'fontSize']),
  };
  for (const [k, v] of Object.entries(facts)) if (v !== undefined) layout[`s:${k}`] = v;
  const tipTargets = [...root.querySelectorAll(side === 'app' ? '.ipb, .ilink[aria-expanded], .chart g.dot' : '[data-tip]')].filter(vis).length;
  const tip = tipBox && !tipBox.hidden ? tipBox.innerText.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  return { lines, coralButtons, small, coralMarks, markColours: [...markColours], dots, icons, sideways, writing, questions, layout, tipTargets, tip, r64 };
}

/** Opens every pop-up target (all the ⓘ and How it works, the first, middle and last dot) and measures it. */
async function popups(page, { side, frameSel, touch }) {
  const sel = side === 'app' ? '.hc .ipb:visible, .hc .ilink[aria-expanded]:visible, .hc .chart g.dot:visible' : `${frameSel} [data-tip]:visible`;
  const n = await page.locator(sel).count();
  if (!n) return { n: 0, worst: null, texts: [], tried: 0 };
  const dotsAt = [];
  for (let i = 0; i < n; i += 1) if (await page.locator(sel).nth(i).evaluate((el) => el.matches('g.dot'))) dotsAt.push(i);
  const picks = [...new Set([...Array.from({ length: n }, (_, i) => i).filter((i) => !dotsAt.includes(i)), dotsAt[0], dotsAt[Math.floor(dotsAt.length / 2)], dotsAt[dotsAt.length - 1]].filter((i) => i != null))];
  let worst = null;
  const texts = [];
  let opened = 0;
  for (const i of picks) {
    const el = page.locator(sel).nth(i);
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      if (touch) await el.tap({ timeout: 2000 });
      else await el.hover({ timeout: 2000 });
    } catch { /* tried focus next */ }
    await page.waitForTimeout(200);
    const read = () => page.evaluate(({ side, frameSel }) => {
      const box = side === 'app' ? document.getElementById('hc-tip') : document.querySelector(`${frameSel} [data-tipb]`);
      if (!box || box.hidden || getComputedStyle(box).display === 'none') return null;
      const b = box.getBoundingClientRect();
      const edge = side === 'app' ? { left: 0, right: document.documentElement.clientWidth } : document.querySelector(`${frameSel} .scroll`).getBoundingClientRect();
      return { inside: Math.min(b.left - edge.left, edge.right - b.right), lines: box.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean) };
    }, { side, frameSel });
    let r = await read();
    if (!r) { await el.focus().catch(() => {}); await page.waitForTimeout(200); r = await read(); }
    if (r) {
      opened += 1;
      texts.push(...r.lines);
      if (worst === null || r.inside < worst) worst = r.inside;
    }
    if (touch) await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.waitForTimeout(120);
  }
  return { n, worst, texts, tried: picks.length, opened };
}

// ------------------------------------------------------------ approved differences
// Mock-up wording the app shows differently, because an approved later rule
// wins or because it is mock-up only (progress.md, Parts 1 to 4). Each entry:
// the screens it covers, which side, a pattern on the neutral line, and why.
const ALLOWED = [
  { side: 'both', re: /^(saving|saved)$/, why: 'save status changes as it saves' },
  { screen: /welcome/, side: 'both', re: /.*/, why: 'the mock-up draws its Quick guide as moving scenes; the app plays the real video (Health Check 5), and its player is measured against version 49 by tests/healthcheck/quick-guide.mjs layout; the panel over it is measured here' },
  { side: 'mock', re: /^<month> #$|^<day> # <month>$/, why: 'the date is the Health Check’s own completed date (Tue 27 Oct in the mock-up)' },
  { screen: /sign-in/, side: 'mock', re: /^what's your access code\?$/, why: 'the code box is labelled "Access code" under the question heading (Tim, 29 Oct, decisions part 3: a question heading is never followed by a second question)' },
  { screen: /sign-in/, side: 'app', re: /^access code$/, why: 'the code box’s short label (Tim, 29 Oct)' },
  { screen: /sign-in/, side: 'mock', re: /^[a-z0-9]$/, why: 'the mock-up fills the code boxes with an invented code; the app’s are empty until typed' },
  { screen: /sign-in/, side: 'mock', re: /^only you and tim see your answers\.$/, why: 'before the code is checked the page can’t know the coach, so a first visit says "your coach" (the name comes back with the session, and is kept for a return visit)' },
  { screen: /sign-in/, side: 'app', re: /^only you and your coach see your answers\.$/, why: 'the same line before the session names the coach' },
];

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December';
const DAYS = 'Mon|Tue|Wed|Thu|Fri|Sat|Sun';
const neutral = (l) => l
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ')
  .replace(new RegExp(`\\b(${DAYS})\\b`, 'g'), '<day>')
  .replace(new RegExp(`\\b(${MONTHS})\\b`, 'g'), '<month>')
  .replace(/\b\d{4}\b(?!")/g, '#')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const allowed = (screen, side, line) => ALLOWED.find((a) => (!a.screen || a.screen.test(screen)) && (a.side === 'both' || a.side === side) && new RegExp(a.re.source, 'i').test(line));
function wordingDiff(screen, appLines, mockLines) {
  const a = new Set(appLines.map(neutral));
  const m = new Set(mockLines.map(neutral));
  const explained = [];
  const check = [];
  for (const l of [...m].filter((x) => !a.has(x))) { const w = allowed(screen, 'mock', l); (w ? explained : check).push(`mock-up only: ${l}${w ? `  [${w.why}]` : ''}`); }
  for (const l of [...a].filter((x) => !m.has(x))) { const w = allowed(screen, 'app', l); (w ? explained : check).push(`app only: ${l}${w ? `  [${w.why}]` : ''}`); }
  return { same: [...m].filter((l) => a.has(l)).length, total: m.size, explained, check };
}

// ------------------------------------------------------------ the browser sides
const browser = await chromium.launch();
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;

async function mockPage(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: mode, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
    const w = /500/.test(r.request().url()) ? 500 : 400;
    r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(FONTS, `dm-sans-latin-${w}-normal.woff2`)) });
  });
  await ctx.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Opens a mock-up screen and measures its desktop frame (and at 700px) and its phone frame. */
async function mockState(page, s, mode) {
  await page.goto(`file://${MOCK}`);
  await page.evaluate(() => document.fonts.ready);
  await page.click(`#sw [data-m="${mode === 'dark' ? 1 : 0}"]`);
  await page.click(`#sw [data-k="${s.mock}"]`);
  await page.waitForTimeout(500);
  const args = { BANNED, JUDGING, LABELS, APPROVED, projectName: s.projectName };
  const one = async (fr, i, pops) => {
    if (s.mockAct) await s.mockAct(page, fr, i);
    await page.waitForTimeout(400);
    const r = await page.evaluate(measure, { ...args, side: 'mock', frame: fr, scope: s.scope ? s.scope.replace('#hc-tip', '[data-tipb]') : null });
    r.pop = pops && !s.scope ? await popups(page, { side: 'mock', frameSel: fr, touch: false }) : null;
    if (s.mockUndo) await s.mockUndo(page, fr, i);
    return r;
  };
  const d = await one('#dk .frame', 0, true);
  if (!s.scope) d.hover = await hoverCoral(page, '#dk .frame');
  if (SHOTS) await page.locator('#dk .frame').screenshot({ path: join(out, `mock-${s.id.replace(/\W+/g, '-')}-desk-${mode}.png`) }).catch(() => {});
  await page.evaluate(() => { document.querySelector('#dk .frame').style.width = '700px'; });
  const half = await one('#dk .frame', 0);
  await page.evaluate(() => { document.querySelector('#dk .frame').style.width = ''; });
  const p = await one('#ph .frame', 1, true);
  if (SHOTS) await page.locator('#ph .frame').screenshot({ path: join(out, `mock-${s.id.replace(/\W+/g, '-')}-phone-${mode}.png`) }).catch(() => {});
  half.hover = d.hover;
  return { 1280: d, 700: half, 390: p, 360: p };
}

/** A context on the dev server with the two database calls answered here. */
async function appPage(width, mode, { complete, step, watched = true }) {
  const phone = width < 641;
  const ctx = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1,
    colorScheme: mode, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London',
  });
  const session = { email: 'sam.example@invented.test', code: 'ABC234', status: complete ? 'complete' : 'in_progress', data: kestrel(complete), current_step: step, version: 1, saves: 0 };
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const url = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/rpc/alignment_open')) {
      return json({ ok: true, status: session.status, current_step: session.current_step, data: session.data, version: session.version, updated_at: '2026-10-27 09:30:00.123', completed_at: complete ? '2026-10-27 09:30:00' : null, client_label: 'Kestrel Group', coach_name: 'Tim' });
    }
    if (url.endsWith('/rpc/alignment_save')) {
      const b = JSON.parse(route.request().postData() || '{}');
      session.data = b.p_data; session.version += 1; session.saves += 1;
      return json({ ok: true, version: session.version, updated_at: '2026-10-27 10:00:00', status: session.status });
    }
    return route.abort();
  });
  await ctx.route(/localhost:\d+\/health-check\/[^/.]+$/, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch({ url: `${APP}/health-check.html` });
    return route.fulfill({ response: r });
  });
  await ctx.route('**/api/alignment-email', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  // TEXT2X=1: the device's text size at twice the standard (the root at 32px), as tests/phase0e/app.mjs does on feature.
  if (process.env.TEXT2X) await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html { font-size: 32px !important; }'; document.head.appendChild(st); }); });
  if (watched) await ctx.addInitScript(() => { try { localStorage.setItem('hc-quick-guide-watched', '1'); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pass(`no page errors (${width}px ${mode})`, false, e.message));
  await page.goto(`${APP}/health-check/tok-compare-v47-000000000000000000000000000`);
  await page.locator('#hc-email, .wlc .btn.full').first().waitFor();
  return { ctx, page, session };
}
async function signIn(page, session) {
  const begin = page.getByRole('button', { name: 'Begin the Health Check' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.locator('#hc-email').fill(session.email);
  await page.locator('#hc-code').fill(session.code);
  await page.locator('form button[type=submit]').click();
  await page.locator('.hc-main .page h2').first().waitFor();
  await page.waitForTimeout(400);
}

// ------------------------------------------------------------ the screens
// mock: the mock-up's screen key; mockAct: what to do in a frame first
// (frame selector, frame index 0 desktop, 1 phone); open: the app state.
const mockAct = (a) => (page, fr, i) => page.evaluate(([x, k]) => window.__act(x, k), [a, i]);
const onResults = (extra) => async (page, session) => {
  await signIn(page, session);
  await page.locator('.gst b').waitFor();
  if (extra) await extra(page);
};
const lineTo = (v) => async (page) => {
  await page.locator('.sortr .dd').first().click();
  await page.getByRole('option', { name: new RegExp(`^${v}%`) }).click();
  await page.waitForTimeout(500);
};
const SCREENS = [
  // The mock-up's welcome holds its Quick guide's moving scenes (the app plays the real video), so only the panel and the one coral thing are compared here.
  { id: 'welcome, Watch this first', mock: 'welcome', layoutKeys: ['watchPanel'], app: { watched: false }, open: async (page) => { await page.locator('.wlc').waitFor(); await page.waitForTimeout(500); } },
  {
    id: 'sign-in', mock: 'signin', app: {},
    open: async (page) => {
      const begin = page.getByRole('button', { name: 'Begin the Health Check' });
      if (await begin.isVisible().catch(() => false)) await begin.click();
      await page.locator('#hc-email').waitFor();
      await page.waitForTimeout(400);
    },
  },
  { id: 'CSFs', mock: 'csf', app: { step: { screen: 'csf' } }, open: (p, s) => signIn(p, s) },
  { id: 'projects', mock: 'projects', app: { step: { screen: 'projects' } }, open: (p, s) => signIn(p, s) },
  { id: 'CSF weight', mock: 'weight', app: { step: { screen: 'weight' } }, open: (p, s) => signIn(p, s) },
  // On a phone each CSF has one branded drop-down; its panel is titled with the CSF's name (version 47).
  {
    id: 'CSF weight, phone drop-down open', mock: 'weight', scope: '.bs', app: { step: { screen: 'weight' } },
    mockAct: (page, fr, i) => page.evaluate((k) => { if (k === 1) window.__act('dd:w0', k); }, i),
    mockUndo: (page) => page.evaluate(() => window.__act('ddx', 1)),
    open: async (page, session) => { await signIn(page, session); const dd = page.locator('.wrow .dd').first(); if (await dd.isVisible().catch(() => false)) { await dd.click(); await page.waitForTimeout(400); } },
  },
  // Toasts are 44px tall and on one line (version 47): Deleted with Undo, and the example's line.
  {
    id: 'toast, Deleted', mock: 'projects', scope: '.toast', app: { step: { screen: 'projects' } },
    mockAct: (page, fr, i) => page.evaluate((k) => window.__act('rm:pr:6', k), i),
    mockUndo: (page) => page.evaluate(() => window.__act('undo', 0)),
    open: async (page, session) => { await signIn(page, session); await page.locator('.srow .rm').last().click(); await page.locator('.toast').waitFor(); await page.waitForTimeout(300); },
  },
  {
    id: 'toast, example', mock: 'example', scope: '.toast', app: {},
    mockAct: (page, fr, i) => page.evaluate((k) => window.__act('toast:exedit', k), i),
    open: async (page) => {
      const begin = page.getByRole('button', { name: 'Begin the Health Check' });
      if (await begin.isVisible().catch(() => false)) await begin.click();
      await page.getByRole('button', { name: 'See an example report' }).click();
      await page.locator('.pr:not(.h)').first().click();
      await page.locator('.toast').waitFor();
      await page.waitForTimeout(300);
    },
  },
  { id: 'contribution', mock: 'contrib', projectName: PR[1].t, app: { step: { screen: 'contrib', project: 1, factor: 0 } }, open: (p, s) => signIn(p, s) },
  { id: 'dates', mock: 'when', projectName: PR[3].t, app: { step: { screen: 'when', project: 3 } }, open: (p, s) => signIn(p, s) },
  { id: 'progress', mock: 'progress', projectName: PR[3].t, app: { step: { screen: 'progress', project: 3 } }, open: (p, s) => signIn(p, s) },
  { id: 'resource', mock: 'resource', projectName: PR[3].t, app: { step: { screen: 'resource', project: 3 } }, open: (p, s) => signIn(p, s) },
  { id: 'results', mock: 'results', app: { complete: true, step: { screen: 'done' } }, open: onResults(), lit: true },
  {
    id: 'results, How it works', mock: 'results', scope: '#hc-tip', app: { complete: true, step: { screen: 'done' } },
    mockAct: async (page, fr) => { await page.locator(`${fr} .ilink[data-tip]`).first().hover(); await page.locator(`${fr} .ilink[data-tip]`).first().click(); },
    mockUndo: async (page) => { await page.mouse.click(2, 2); },
    open: onResults(async (page) => { const b = page.getByRole('button', { name: 'How it works' }).first(); await b.click(); await page.waitForTimeout(300); }),
  },
  {
    id: 'results, line drop-down open', mock: 'results', scope: '.ddl, .bs', phoneLayoutKeys: [], app: { complete: true, step: { screen: 'done' } },
    mockAct: (page, fr, i) => page.evaluate((k) => window.__act('dd:line', k), i),
    mockUndo: (page) => page.evaluate(() => window.__act('ddx', 0)),
    open: onResults(async (page) => { await page.locator('.sortr .dd').first().click(); await page.waitForTimeout(400); }),
  },
  { id: 'results, line 70', mock: 'results', mockAct: mockAct('pick:line:70'), mockUndo: mockAct('pick:line:50'), app: { complete: true, step: { screen: 'done' } }, open: onResults(lineTo(70)) },
  { id: 'results, line 30', mock: 'results', mockAct: mockAct('pick:line:30'), mockUndo: mockAct('pick:line:50'), app: { complete: true, step: { screen: 'done' } }, open: onResults(lineTo(30)) },
  {
    id: 'example report', mock: 'example', app: {},
    open: async (page) => {
      const begin = page.getByRole('button', { name: 'Begin the Health Check' });
      if (await begin.isVisible().catch(() => false)) await begin.click();
      await page.getByRole('button', { name: 'See an example report' }).click();
      await page.locator('.gst b').waitFor();
      await page.waitForTimeout(400);
    },
    lit: true,
  },
];

// The coral button's hover, set per mode (version 47): #FF8A7A dark, #E0533F light.
const HOVER = { dark: 'rgb(255, 138, 122)', light: 'rgb(224, 83, 63)' };
async function hoverCoral(page, within) {
  const loc = page.locator(`${within} .btn:not(.quiet):not([disabled]):not([aria-disabled="true"]):visible`).first();
  if (!(await loc.count())) return null;
  await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await loc.hover({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(80);
  const bg = await loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.mouse.move(0, 0);
  return bg;
}

const WIDTHS = (process.env.WIDTHS || '1280,700,390,360').split(',').map(Number);
const MODES = ['dark', 'light'];
const report = [];
const table = [];

function ruleChecks(tag, r) {
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  pass(`${tag}: one coral button`, r.coralButtons.length === 1, r.coralButtons.join('; ') || 'none');
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in the chart`, r.coralMarks.length === 0, r.coralMarks.slice(0, 4).join('; '));
  const bad = r.icons.filter((i) => Math.abs(i.off) > 1 || Math.abs(i.gap - 6) > 0.75 || Math.abs(i.size - 16) > 0.5);
  pass(`${tag}: icons centred on the capitals, 16px, 6px from their words (${r.icons.length})`, bad.length === 0, bad.slice(0, 3).map((i) => `${i.what} off ${i.off} gap ${i.gap} size ${i.size}`).join('; '));
  if (r.pop && r.pop.n) {
    pass(`${tag}: every pop-up opens (${r.pop.opened} of ${r.pop.tried})`, r.pop.opened === r.pop.tried);
    pass(`${tag}: pop-ups 12px inside the edges`, r.pop.worst !== null && r.pop.worst >= 11.5, r.pop.worst === null ? 'none opened' : `${r.pop.worst.toFixed(1)}px`);
  }
  pass(`${tag}: writing rules`, r.writing.length === 0, [...new Set(r.writing)].slice(0, 4).join(' | '));
}

const mockSide = {};
const wanted = SCREENS.filter((s) => !ONLY || ONLY.test(s.id));
for (const mode of MODES) {
  const { ctx: mctx, page: mpage } = await mockPage(mode);
  for (const s of wanted) mockSide[`${s.id}|${mode}`] = await mockState(mpage, s, mode);
  await mctx.close();
}

for (const s of wanted) {
  const verdict = { screen: s.id, check: [], explained: new Set(), layout: [] };
  for (const mode of MODES) {
    for (const width of WIDTHS) {
      const tag = `${s.id}, ${width}px ${mode}`;
      const { ctx, page, session } = await appPage(width, mode, s.app);
      try {
        await s.open(page, session);
      } catch (e) {
        pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const r = await page.evaluate(measure, { side: 'app', BANNED, JUDGING, LABELS, APPROVED, scope: s.scope || null, projectName: s.projectName });
      if (SHOTS && (width === 1280 || width === 390 || width === 360)) await page.screenshot({ path: join(out, `app-${s.id.replace(/\W+/g, '-')}-${width}-${mode}.png`), fullPage: true });
      r.pop = s.scope ? null : await popups(page, { side: 'app', touch: width < 641 });
      if (r.pop) r.writing.push(...measureTipWriting(r.pop.texts));
      ruleChecks(tag, r);
      const m = mockSide[`${s.id}|${mode}`][width];
      // Layout against the mock-up.
      const L = (k) => JSON.stringify(r.layout[k]) === JSON.stringify(m.layout[k]);
      const styleKeys = [...new Set([...Object.keys(r.layout), ...Object.keys(m.layout)].filter((k) => k.startsWith('s:')))];
      for (const k of [...((width < 641 && s.phoneLayoutKeys) || s.layoutKeys || ['sections', 'glance', 'weight', 'weightRows', 'rowDates', 'gapColour', 'watchPanel']), ...styleKeys]) {
        if (r.layout[k] === undefined && m.layout[k] === undefined) continue;
        if (k === 'rowDates' && width === 700) continue; // the mock-up's desktop frame squeezed to 700px is not a layout of its own
        const ok = L(k);
        pass(`${tag}: layout ${k} as the mock-up`, ok, ok ? JSON.stringify(r.layout[k]).slice(0, 160) : `app ${JSON.stringify(r.layout[k])} | mock-up ${JSON.stringify(m.layout[k])}`.slice(0, 400));
        if (!ok) verdict.layout.push(`${k} at ${width}px ${mode}`);
      }
      if (width >= 641 && !s.scope) {
        const hov = await hoverCoral(page, '.hc');
        if (hov) pass(`${tag}: the coral button's hover is ${HOVER[mode]}`, hov === HOVER[mode], hov);
        if (m.hover) pass(`${tag}: the mock-up's hover is the same`, m.hover === HOVER[mode], m.hover);
      }
      if (s.projectName) pass(`${tag}: rule 64 counter "${r.r64.counter}" in the placeholder grey`, r.r64.counterGrey);
      if (r.questions.length) {
        const sizes = new Set(r.questions.map((q) => q.size));
        pass(`${tag}: the questions are the same size, with no number circles`, sizes.size === 1 && !r.questions.some((q) => q.circle), [...sizes].join(', '));
        const same = JSON.stringify(r.questions.map((q) => [q.label, q.question, q.reason])) === JSON.stringify(m.questions.map((q) => [q.label, q.question, q.reason]));
        pass(`${tag}: the questions match the mock-up word for word`, same, same ? r.questions.map((q) => q.label).join(', ') : `app ${JSON.stringify(r.questions.map((q) => q.question))} | mock-up ${JSON.stringify(m.questions.map((q) => q.question))}`);
      }
      if (r.dots.length && (width === 1280 || width === 360)) {
        const key = (d) => `${d.n}:${d.cx.toFixed(2)},${d.cy.toFixed(2)},r${d.r},${d.rings}`;
        // Within a hundredth of a pixel (the two sides add the same numbers in a different order).
        const same = r.dots.length === m.dots.length && r.dots.every((d, i) => d.n === m.dots[i].n && Math.abs(d.cx - m.dots[i].cx) < 0.01 && Math.abs(d.cy - m.dots[i].cy) < 0.01 && d.r === m.dots[i].r && d.rings === m.dots[i].rings);
        pass(`${tag}: every dot where the mock-up draws it (place, size, rings)`, same, same ? `${r.dots.length} dots` : `app ${r.dots.map(key).join(' ')} | mock-up ${m.dots.map(key).join(' ')}`);
        pass(`${tag}: every dot's outline is 1.5px`, r.dots.every((d) => d.sw === '1.5px'), [...new Set(r.dots.map((d) => d.sw))].join(', '));
      }
      // Pointing at a question about a project lights its dot (mouse only).
      if (s.lit && width === 1280) {
        const lit = page.locator('.mv').first();
        if (await lit.count()) {
          await page.mouse.move(1, 1);
          await lit.scrollIntoViewIfNeeded();
          await lit.hover({ position: { x: 40, y: 20 } });
          await page.waitForTimeout(450);
          const ops = await page.evaluate(() => [...document.querySelectorAll('.chart g.dot')].map((g) => Number(getComputedStyle(g).opacity)));
          await page.mouse.move(0, 0);
          const litOnes = ops.filter((o) => o > 0.9).length;
          const projectQ = (r.questions[0]?.label || '') !== 'CSF cover' && (r.questions[0]?.label || '') !== 'On track';
          pass(`${tag}: pointing at the first question lights its dot and fades the others`, !projectQ || (litOnes === 1 && ops.length > 1), ops.map((o) => o.toFixed(2)).join(' '));
        }
      }
      // Wording against the mock-up: desktop and phone, dark only (the words don't change with the mode).
      if (mode === 'dark' && (width === 1280 || width === 390)) {
        const w = wordingDiff(s.id, r.lines.concat(r.pop?.texts || []), m.lines.concat(m.pop?.texts || []));
        w.explained.forEach((x) => verdict.explained.add(x));
        verdict.check.push(...w.check.map((x) => `${width}px ${x}`));
        report.push(`\n## ${s.id}, ${width}px: ${w.same} of ${w.total} mock-up lines the same`);
        w.check.forEach((x) => report.push(`  TO CHECK ${x}`));
        w.explained.forEach((x) => report.push(`  explained ${x}`));
        pass(`${tag}: every wording difference from the mock-up is explained`, w.check.length === 0, w.check.slice(0, 3).join(' | '));
      }
      // The mock-up's own rule results, for the record.
      report.push(`  ${tag} mock-up: coral ${m.coralButtons.length}, small ${m.small.length}, chart coral ${m.coralMarks.length}, sideways ${m.sideways}, writing ${m.writing.length}${m.writing.length ? ` (${m.writing.slice(0, 2).join(' | ')})` : ''}`);
      await ctx.close();
    }
  }
  const status = verdict.check.length || verdict.layout.length ? 'differs, to check' : verdict.explained.size ? 'matches with a change' : 'matches';
  table.push(`${s.id} | ${status}${verdict.explained.size ? ` | ${[...new Set([...verdict.explained].map((x) => x.replace(/^.*\[(.*)\]$/, '$1')))].join('; ')}` : ''}${verdict.layout.length ? ` | layout: ${verdict.layout.join(', ')}` : ''}`);
}

/** The writing rules on pop-up lines (the same rules as the page's lines). */
function measureTipWriting(texts) {
  const w = [];
  for (const l of texts) {
    if (APPROVED.includes(l)) continue;
    const plain = l.replace(/\d\.\d/g, '0');
    const sentences = plain.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘0-9])/).filter((x) => /[a-z]/i.test(x));
    if (sentences.length > 1 && /[.!?]/.test(sentences[0].slice(-2))) w.push(`pop-up, two sentences: ${l}`);
    if (/:(?!\d)/.test(l)) w.push(`pop-up, colon: ${l}`);
    if (/[()[\]]/.test(l) && !/Critical Success Factors? \(CSFs?\)/.test(l)) w.push(`pop-up, brackets: ${l}`);
    if (/[–—;]/.test(l)) w.push(`pop-up, dash or semicolon: ${l}`);
  }
  return w;
}

await browser.close();
const passed = results.filter((r) => r.startsWith('PASS')).length;
const text = `${results.join('\n')}\n\n# Wording against the mock-up\n${report.join('\n')}\n\n${passed} passed, ${failures} failed.\n`;
writeFileSync(join(out, 'report.txt'), text);
writeFileSync(join(out, 'table.txt'), `${table.join('\n')}\n`);
console.log(results.filter((r) => r.startsWith('FAIL')).slice(0, 60).join('\n'));
console.log(`\n${table.join('\n')}\n\n${passed} passed, ${failures} failed. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
