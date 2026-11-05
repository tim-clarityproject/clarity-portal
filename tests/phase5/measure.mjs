// The measured rules for every Phase 5 screen (Phase 5 step 5), shared by
// tests/phase5/compare.mjs and tests/phase5/patterns.mjs. As
// tests/phase4/compare.mjs measures, plus: rule 62 (never claim more than
// the evidence), no line said twice on a screen (decisions part 4, 3 Nov),
// pop-ups that never move the page (its scroll position, its height and the
// place of every part stay the same while one is open), the "i"'s own
// pop-up, twice the text size, reduced motion and the safe area.
//
// Nothing here writes anything: it reads the page as drawn.

export const CORAL = ['rgb(255, 111, 92)', 'rgb(194, 65, 46)', 'rgb(224, 83, 63)', 'rgb(255, 138, 122)', 'rgb(185, 61, 43)'];
export const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];
// START-HERE writing rule 5, the casual words (rule 4), "tap" and "click"
// (rule 41), short units (26 Oct rule 8), the old names (CLAUDE.md 8 and
// 26), and the check-in's own: never "Support, any time" (rule 51), never
// rank a client's goals (rule 56).
export const BANNED = [
  'journey', 'unlock', 'unleash', 'transform', 'leverage', 'optimise', 'optimize', 'synergy', 'wellness',
  'self-care', 'hold space', 'failed', 'fail', 'missed', 'behind', 'sorted', 'crack on', 'reckon',
  'submit', 'ok', 'click', 'tap', 'mate', 'nice', 'love that', 'purpose', 'intake', 'ground', 'hrs', 'wks', 'min', 'about \\d+ minutes',
  'inversion', 'tough conversation', 'if-then', 'wheel of life', 'decision history', 'my decisions',
  'above or below the line', 'points of leverage', 'support, any time', 'hardware first', 'start with hardware', 'weakest',
];

/**
 * Runs in the page: the whole page (header, phone bar, the Breathe button
 * and toasts left out), or one part (scope). `exempt` lists sentences that
 * may show twice (as a regular expression source).
 */
export function measure({ CORAL, MINT, BANNED, scope, exempt }) {
  const whole = document.body;
  const inScope = scope ? [...whole.querySelectorAll(scope)].find((el) => el.getBoundingClientRect().width > 0) : null;
  const root = inScope || whole;
  const chrome = '.hdr, nav.ds-phone-bar, .ds-orb, .ds-toast-region';
  const always = '.ds-sr, .ds-tip[hidden], [inert], [hidden], .ds-ctable caption';
  const hide = inScope ? always : `${chrome}, ${always}`;
  const outside = (el) => !inScope && el.closest(chrome);
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? el.tagName).split(' ')[0] || el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;

  // Lines people read. A word kept whole (keepWords: .ds-keep) is read as
  // part of its line: inside a flex button innerText would split it off.
  const style = document.createElement('style');
  style.textContent = `${hide} { display: none !important; } body .ui-root .ds-keep { display: contents !important; }`;
  document.head.appendChild(style);
  const lines = root.innerText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  style.remove();

  const buttons = [...root.querySelectorAll('button, a, [role=button]')].filter((el) => vis(el) && !outside(el));
  const coralButtons = buttons.filter((el) => CORAL.includes(getComputedStyle(el).backgroundColor)).map(label);

  // Tap areas (a shared part may reach 44px through its ::before or ::after).
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, label, [role=radio], [role=checkbox], [role=switch], [role=tab], [role=option], summary')) {
    if (outside(el) || !vis(el) || el.disabled) continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2 || getComputedStyle(el).opacity === '0')) continue;
    if (el.tagName === 'LABEL' && !el.querySelector('input[type=checkbox], input[type=radio]')) continue;
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) continue;
    if (el.closest('label') && el.tagName !== 'LABEL' && el.tagName !== 'INPUT') continue;
    if (el.closest('.ds-ctable td, .ds-ctable th')) continue;
    const stretch = (p) => p.content !== 'none' && p.position === 'absolute' && (parseFloat(p.height) || 0) >= 43.5 && (parseFloat(p.width) || 0) >= 43.5;
    if ((b.height >= 43.5 && b.width >= 43.5) || stretch(getComputedStyle(el, '::after')) || stretch(getComputedStyle(el, '::before'))) continue;
    // The shared pills reach 44px through their ::after (design.css .ds-seg-btn).
    if (el.matches('.ds-seg-btn') && b.height >= 38) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }

  // Chart, dial and bar marks: never coral.
  const marks = [];
  for (const chart of root.querySelectorAll('svg, .ds-bar, .ds-guide-pct, .ds-scale, [class*="chart"], [class*="dash-sq"], [class*="dash-mini"], [class*="dash-tbars"], [class*="dash-goal"]')) {
    if (outside(chart) || !vis(chart) || chart.closest('button.ds-btn, a.ds-btn, .ds-btn, .hdr, .ds-addbtn, .ds-iconword-icon, .ds-info, .ds-who')) continue;
    for (const el of [chart, ...chart.querySelectorAll('*')]) {
      if (el.closest('.ds-btn, .ds-addbtn, .ds-iconword-icon, .ds-who, .ds-info, .ds-chev, .ds-disclosure')) continue;
      const st = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const paints = [st.backgroundColor, el instanceof SVGElement ? st.fill : null, el instanceof SVGElement ? st.stroke : null]
        .filter((c) => c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)' && !/^url/.test(c));
      // The one agreed coral data mark (methods M0.8, Tim 5 Nov): the single
      // lowest bar in a list, counted per list below.
      const lowest = Boolean(el.closest('.ds-bar--lowest'));
      for (const c of paints) marks.push({ c, el: label(el), coral: CORAL.includes(c) && !lowest });
    }
  }
  const coralMarks = [...new Set(marks.filter((m) => m.coral).map((m) => `${m.el} ${m.c}`))];
  // At most one lowest bar per list, never on anything tappable.
  for (const list of root.querySelectorAll('.ck-areas, [data-band-list]')) {
    const n = [...list.querySelectorAll('.ds-bar--lowest')].filter(vis).length;
    if (n > 1) coralMarks.push(`${label(list)} has ${n} coral bars`);
  }
  for (const el of root.querySelectorAll('.ds-bar--lowest')) {
    if (el.closest('button, a, [role=button]')) coralMarks.push(`${label(el)} coral bar on something tappable`);
  }

  // Icons with words: centred on the middle of the capitals, 16px, 6px.
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
  for (const el of root.querySelectorAll('.ds-iconword')) {
    if (outside(el) || !vis(el)) continue;
    const svg = el.querySelector('.ds-iconword-icon > *');
    const text = el.querySelector('.ds-iconword-text');
    if (!svg || !text) continue;
    const icon = svg.getBoundingClientRect();
    icons.push({ what: label(el), off: +(icon.top + icon.height / 2 - capMiddle(text)).toFixed(2), gap: +(text.getBoundingClientRect().left - icon.right).toFixed(2), size: +icon.width.toFixed(1) });
  }
  // The "i" after a sentence or a title: 6px after the last word.
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
    const ls = parseFloat(cs.letterSpacing) || 0;
    icons.push({ what: `i after "${last.textContent.trim().slice(-24)}"`, off: +(icon.top + icon.height / 2 - (base - mt.actualBoundingBoxAscent / 2)).toFixed(2), gap: +(icon.left - (ch.right - ls)).toFixed(2), size: +icon.width.toFixed(1), info: true });
  }

  // Keys (legends).
  const keys = [...root.querySelectorAll('[class]')].filter((el) => !outside(el) && vis(el)
    && /(^|\s|-)(legend|key|chart-key|ds-key)(\s|$|-)/.test(String(el.className?.baseVal ?? el.className))).map(label);

  // Writing rules.
  const writing = [];
  const words = (l) => l.toLowerCase().replace(/[’']/g, "'");
  // Approved wording: help panels' "For example: …" (writing rule 23), the
  // celebration word for word (writing rule 19), the stepper's empty value,
  // and M12's fold line word for word ("Lowest: Movement 45/100"), a label
  // and one of the few colons writing rule 26 allows (Phase 5 step 1).
  const approved = [/^For example: /, /^Great (week|sprint)(, [^!]+)?! You (smashed your standard|averaged \d+%)\.$/, /^–$/, /^Lowest: [A-Z][a-z ]+ \d+\/100$/];
  const seen = new Map();
  const may = exempt ? new RegExp(exempt) : null;
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
    // "behind" as in falling behind is banned (rule 5); M4's own "What's
    // behind your performance" and "The work behind it is …" (approved
    // 26 Oct, v47) say where something comes from, not that someone is late.
    const said = words(l).replace(/what's behind|work behind it/g, '');
    for (const w of BANNED) if (new RegExp(`(^|[^a-z'-])${w}($|[^a-z'-])`, 'i').test(said)) writing.push(`banned "${w}": ${l}`);
    // Rule 62: never claim more than the evidence.
    if (/\b(proven|proves|research (shows|proves)|studies (show|prove)|science (shows|says)|scientifically|clinically|guarantee[sd]?)\b/i.test(l)) writing.push(`rule 62, a claim: ${l}`);
    if (/\b(coaching|the portal|this tool) (caused|causes|will cause)\b/i.test(l)) writing.push(`rule 62, a cause: ${l}`);
    // Rule 64: a question about one thing names it.
    if (/\?$/.test(l) && (/\b(this|that) (project|item|person|strategy|habit|objective|to-do|thing|win|tool|thought|pattern|area)\b/i.test(l))) writing.push(`rule 64, name the one thing: ${l}`);
    // Rule 65: results hold up a mirror.
    if (/\b(unimportant|not important|of no value|a waste|waste of|pointless|useless)\b/i.test(l)) writing.push(`rule 65, never judge: ${l}`);
    if (/^(fix|free up)\b/i.test(l) && !/[.?!]$/.test(l)) writing.push(`rule 65, a label never orders: ${l}`);
    // No line said twice (decisions part 4, 3 Nov): a sentence once a screen.
    // (A name ending in "?", such as an Outcome Objective "How world-class
    // is my coaching?", is the person's own name for a row, not a sentence.)
    if (/[.!]$/.test(l) && l.split(' ').length > 3 && !(may && may.test(l))) seen.set(l, (seen.get(l) || 0) + 1);
  }
  const repeats = [...seen.entries()].filter(([, n]) => n > 1).map(([l, n]) => `${n} times: ${l}`);
  // Buttons: never "I" or "me" (writing rule 13), never Submit, OK or Go.
  for (const b of buttons) {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (/\b(I|me|Submit|OK|Go)\b/.test(t)) writing.push(`button words (writing rule 13): ${t}`);
  }

  // Rule 60: saved items named in words, the tool under, the date on the right.
  const saved = [];
  const dateAsName = /^(today|yesterday)$|^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+\d|^\d{1,2}(st|nd|rd|th)?\s+[a-z]{3}|^\d{4}-\d{2}-\d{2}/i;
  for (const row of root.querySelectorAll('.hlist-row, .ds-hub-recent .ds-row')) {
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

  // Figures and marks: mint for good, grey below the standard, never coral.
  const probe = document.createElement('span');
  (root.closest('.ui-root') || root.querySelector('.ui-root') || document.querySelector('.ui-root')).appendChild(probe);
  const resolve = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
  const good = resolve('--good');
  const below = [resolve('--below'), resolve('--text-2'), resolve('--text-3')];
  probe.remove();
  const colours = [];
  for (const el of root.querySelectorAll('[class*="--good"], [class*="-good"], [class*="--below"], [class*="-below"], [class*="--up"]')) {
    if (outside(el) || !vis(el) || el.closest('.ds-btn')) continue;
    const cls = String(el.className?.baseVal ?? el.className);
    const st = getComputedStyle(el);
    const svg = el instanceof SVGElement;
    const paint = svg ? (st.fill !== 'none' && st.fill !== 'rgba(0, 0, 0, 0)' ? st.fill : st.stroke) : (st.backgroundColor !== 'rgba(0, 0, 0, 0)' ? st.backgroundColor : st.color);
    const isGood = /(--|-)good\b|--up\b/.test(cls);
    const ok = isGood ? paint === good || st.color === good || st.borderTopColor === good : below.includes(paint) || below.includes(st.color) || !MINT.includes(paint);
    if (CORAL.includes(paint) || !ok) colours.push(`${label(el)} ${cls.split(' ').find((c) => /good|below|up/.test(c))} ${paint}`);
  }

  const tips = [...root.querySelectorAll('[data-tip]')].filter((el) => !outside(el) && vis(el)).length;
  const headings = [...root.querySelectorAll('h1, h2, h3, .ds-guide-question, .ds-guide-title, .ds-end-title, .ds-page-title')].filter((el) => vis(el) && !outside(el)).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  return {
    lines, coralButtons, small, coralMarks, markCount: marks.length, icons, keys, writing, repeats, saved, colours, tips, headings,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    theme: document.documentElement.getAttribute('data-theme') || document.querySelector('.ui-root')?.getAttribute('data-theme'),
  };
}

/** Pass or fail each measured rule. coral: 'one', 'none' or 'atMost'. */
export function ruleChecks(pass, tag, r, coral) {
  pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  const n = r.coralButtons.length;
  const coralOk = coral === 'one' ? n === 1 : coral === 'none' ? n === 0 : n <= 1;
  pass(`${tag}: ${coral === 'one' ? 'one coral button' : coral === 'none' ? 'no coral button' : 'at most one coral button'}`, coralOk, r.coralButtons.join('; ') || 'none');
  pass(`${tag}: 44px tap areas`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  pass(`${tag}: no coral in any chart or mark (${r.markCount} paints)`, r.coralMarks.length === 0, r.coralMarks.slice(0, 4).join('; '));
  pass(`${tag}: mint for good, grey below`, r.colours.length === 0, r.colours.slice(0, 4).join('; '));
  const badIcon = r.icons.filter((i) => Math.abs(i.off) > 1 || Math.abs(i.gap - 6) > 0.75 || Math.abs(i.size - 16) > 0.5);
  pass(`${tag}: icons centred on the capitals, 16px, 6px from their words (${r.icons.length})`, badIcon.length === 0, badIcon.slice(0, 3).map((i) => `${i.what} off ${i.off} gap ${i.gap} size ${i.size}`).join('; '));
  pass(`${tag}: no keys`, r.keys.length === 0, r.keys.join('; '));
  pass(`${tag}: writing rules (one sentence a line, no colons or brackets, banned words, rules 62, 64, 65)`, r.writing.length === 0, [...new Set(r.writing)].slice(0, 4).join(' | '));
  pass(`${tag}: no line said twice`, r.repeats.length === 0, r.repeats.slice(0, 3).join(' | '));
  pass(`${tag}: rule 60, saved items named in words with the date on the right`, r.saved.length === 0, r.saved.slice(0, 3).join(' | '));
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Where everything is: the scroll position, the page's height and each part's place. */
const layout = (page) => page.evaluate(() => {
  const parts = [...document.querySelectorAll('main *, .ds-guide *, .dash-page *, .ui-root > div > *')].slice(0, 400)
    .filter((el) => !el.closest('.ds-tip, .ds-infopop, .ds-portal'))
    .map((el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top + window.scrollY)},${Math.round(b.width)},${Math.round(b.height)}`; });
  return { y: Math.round(window.scrollY), h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, parts: parts.join('|') };
});

/**
 * Opens the first, middle and last chart pop-up (and the first "i") and
 * checks each sits 12px inside both screen edges and never moves the page.
 */
export async function popups(page, touch, pass, tag) {
  const marks = page.locator('[data-tip]:visible');
  const n = await marks.count();
  let opened = 0;
  let worst = null;
  const moved = [];
  const escaped = [];
  for (const i of [...new Set([0, Math.floor(n / 2), n - 1])].filter((x) => x >= 0 && n)) {
    const el = marks.nth(i);
    // To the middle of the screen, clear of the fixed bars, so the tap itself never needs to scroll.
    try { await el.evaluate((x) => x.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })); } catch { continue; }
    await sleep(400);
    const before = await layout(page);
    try {
      if (touch) await el.tap({ timeout: 2000 });
      else await el.hover({ timeout: 2000 });
    } catch { await el.focus().catch(() => {}); }
    await sleep(300);
    let r = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden && getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0);
      if (!t) return null;
      const b = t.getBoundingClientRect();
      return { left: b.left, right: window.innerWidth - b.right };
    });
    if (!r) {
      await el.focus().catch(() => {});
      await sleep(300);
      r = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.ds-tip')].find((x) => !x.hidden && getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0);
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { left: b.left, right: window.innerWidth - b.right };
      });
    }
    if (r) {
      opened += 1;
      const inside = Math.min(r.left, r.right);
      if (worst === null || inside < worst) worst = inside;
      const after = await layout(page);
      if (after.y !== before.y || after.h !== before.h || after.w !== before.w || after.parts !== before.parts) moved.push(`mark ${i + 1}: y ${before.y}->${after.y}, height ${before.h}->${after.h}${after.parts !== before.parts ? ', parts moved' : ''}`);
    }
    // The first: Escape closes the pop-up and nothing else (not the guided
    // tool or panel it sits in). The others close by moving away.
    if (r && i === 0) {
      const at = page.url();
      await page.keyboard.press('Escape');
      await sleep(300);
      const shut = await page.evaluate(() => [...document.querySelectorAll('.ds-tip')].every((t) => t.hidden || getComputedStyle(t).display === 'none'));
      if (!shut || page.url() !== at) escaped.push(`Escape ${shut ? 'closed it but' : 'did not close it, and'} ${page.url() !== at ? `left ${new URL(at).pathname} for ${new URL(page.url()).pathname}` : 'stayed'}`);
      if (page.url() !== at) break;
    }
    // Close it by moving away (Escape only when it is still open: on a
    // guided tool's screen Escape with nothing open leaves the tool).
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.activeElement?.blur?.());
    await sleep(150);
    const still = await page.evaluate(() => [...document.querySelectorAll('.ds-tip')].some((t) => !t.hidden && getComputedStyle(t).display !== 'none'));
    if (still) await page.keyboard.press('Escape').catch(() => {});
    if (process.env.VERBOSE) console.log(`  pop-up ${i + 1}/${n}: ${r ? 'opened' : 'not opened'}, now on ${new URL(page.url()).pathname}`);
  }
  if (n) {
    pass(`${tag}: chart pop-ups open (${opened} of the ${Math.min(n, 3)} tried, ${n} marks)`, opened > 0, 'none opened');
    pass(`${tag}: chart pop-ups 12px inside the edges`, worst === null || worst >= 11.5, worst === null ? '' : `${worst.toFixed(1)}px`);
    pass(`${tag}: chart pop-ups never move the page`, moved.length === 0, moved.join('; '));
    if (opened) pass(`${tag}: Escape closes a chart pop-up and nothing else`, escaped.length === 0, escaped.join('; '));
    const closed = await page.evaluate(() => [...document.querySelectorAll('.ds-tip')].every((t) => t.hidden || getComputedStyle(t).display === 'none'));
    pass(`${tag}: a closed pop-up is hidden with display none`, closed);
  }
  // The first "i" and its own pop-up.
  const info = page.locator('button:has(.ds-info):visible').first();
  if (await info.count()) {
    try {
      await info.scrollIntoViewIfNeeded({ timeout: 2000 });
      await sleep(150);
      const before = await layout(page);
      await info.click({ timeout: 2000 });
      await sleep(400);
      const r = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.ds-infopop')].find((x) => !x.hidden && x.getBoundingClientRect().width > 0);
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { left: b.left, right: window.innerWidth - b.right, first: (t.innerText || '').split('\n')[0].trim() };
      });
      const after = await layout(page);
      pass(`${tag}: the "i" opens its pop-up`, Boolean(r));
      if (r) {
        pass(`${tag}: the "i" pop-up 12px inside the edges`, Math.min(r.left, r.right) >= 11.5, `${r.left.toFixed(1)} / ${r.right.toFixed(1)}`);
        pass(`${tag}: the "i" pop-up never moves the page`, after.y === before.y && after.h === before.h && after.parts === before.parts, `y ${before.y}->${after.y}, height ${before.h}->${after.h}${after.parts !== before.parts ? ', parts moved' : ''}`);
        pass(`${tag}: the "i" starts with one full sentence`, /^[A-Z“"‘].*[a-z”’"]+ [a-z].*[.?!]$/.test(r.first), r.first);
      }
      await page.keyboard.press('Escape');
      await sleep(200);
      const shut = await page.evaluate(() => [...document.querySelectorAll('.ds-infopop')].every((t) => t.hidden));
      pass(`${tag}: Escape closes the "i"`, shut);
    } catch (e) {
      pass(`${tag}: the "i" opens`, false, e.message.split('\n')[0]);
    }
  }
}

/**
 * Twice the text size (the device's text-size setting, as tests/phase0e
 * does): nothing scrolls sideways, tap areas hold, no text is cut off
 * inside its box, and spaced Nekst capitals never split inside a word.
 */
export function bigText() {
  const vis = (el) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 1 && b.height > 1 && st.visibility !== 'hidden' && !el.closest('[hidden],[inert],[aria-hidden="true"],.ds-sr'); };
  const clipped = [];
  for (const el of document.querySelectorAll('.ui-root button, .ui-root a, .ui-root p, .ui-root h1, .ui-root h2, .ui-root h3, .ui-root label, .ui-root span, .ui-root small, .ui-root td, .ui-root th')) {
    if (!vis(el) || el.closest('.hdr, nav.ds-phone-bar, .ds-orb, .ds-ctable-fold:not([open])')) continue;
    const st = getComputedStyle(el);
    if (!/hidden|clip/.test(st.overflowX + st.overflow) || !el.textContent.trim()) continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${String(el.className).split(' ')[0] || el.tagName} "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  const split = [];
  for (const el of document.querySelectorAll('.ui-root *')) {
    if (!vis(el) || el.closest('.hdr, nav.ds-phone-bar')) continue;
    if (!/Nekst/i.test(getComputedStyle(el).fontFamily)) continue;
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue;
      const t = node.textContent;
      const re = /\S+/g;
      for (let m = re.exec(t); m; m = re.exec(t)) {
        const r = document.createRange();
        r.setStart(node, m.index);
        r.setEnd(node, m.index + m[0].length);
        const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
        if (tops.size > 1) split.push(m[0]);
      }
    }
  }
  return { sideways: document.documentElement.scrollWidth - window.innerWidth, clipped: clipped.slice(0, 5), split: [...new Set(split)].slice(0, 5) };
}

/**
 * Reduced motion: an init script records every CSS transition or animation
 * that moves something (anything but opacity and colour) for longer than
 * 20ms, and every running script animation that does. A fade stays: the
 * approved still versions are opacity only (the loading crosshair pulses
 * instead of turning, design.css ds-pulse; a guided step cross-fades
 * instead of sliding, ds-fade, "the fade has its own fixed length").
 */
export const motionRecorder = () => {
  window.__motion = [];
  const still = /^(opacity|color|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|fill|stroke|outline-color|text-decoration-color|offset|computedOffset|easing|composite)$/;
  const ms = (list) => Math.max(0, ...String(list || '0s').split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) || 0));
  const name = (el) => `${el.tagName?.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0]}`;
  window.__moves = (a) => (a.effect?.getKeyframes?.() || []).some((k) => Object.keys(k).some((p) => !still.test(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))));
  document.addEventListener('transitionrun', (e) => {
    const st = getComputedStyle(e.target);
    const d = ms(st.transitionDuration) + ms(st.transitionDelay);
    if (d > 20 && !still.test(e.propertyName)) window.__motion.push(`transition ${e.propertyName} ${Math.round(d)}ms on ${name(e.target)}`);
  }, true);
  document.addEventListener('animationstart', (e) => {
    const d = ms(getComputedStyle(e.target).animationDuration);
    // Which properties its keyframes change, from the style sheets (the
    // element may be gone already, like the opening crosshair).
    let moves = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        const list = r instanceof CSSKeyframesRule ? [r] : r instanceof CSSMediaRule ? [...r.cssRules].filter((x) => x instanceof CSSKeyframesRule) : [];
        for (const k of list) {
          if (k.name !== e.animationName) continue;
          moves = [...k.cssRules].some((f) => [...f.style].some((p) => !still.test(p)));
        }
      }
    }
    if (moves === null) { const a = e.target.getAnimations?.().find((x) => x.animationName === e.animationName); moves = !a || window.__moves(a); }
    if (d > 20 && moves) window.__motion.push(`animation ${e.animationName} ${Math.round(d)}ms on ${name(e.target)}`);
  }, true);
};
export const motionSeen = (page) => page.evaluate(() => {
  const scripted = document.getAnimations()
    .filter((a) => a.playState === 'running' && !(a instanceof CSSTransition) && !(a instanceof CSSAnimation))
    .filter((a) => (a.effect?.getComputedTiming?.().duration || 0) > 20 && (!window.__moves || window.__moves(a)))
    .map((a) => `script animation ${Math.round(a.effect.getComputedTiming().duration)}ms on ${a.effect?.target?.className || a.effect?.target?.tagName}`);
  return [...new Set([...(window.__motion || []), ...scripted])];
});

/** The Home Screen app's safe area: nothing near the top above the inset, the phone bar above the home indicator. */
export const insideInsets = (page, inset) => page.evaluate((ins) => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const bad = [];
  for (const e of document.querySelectorAll('button, a, h1, h2, h3, img, svg, input, [role=button], p, label, .ds-page-title, .ds-guide-bar *')) {
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || r.bottom <= 0 || r.top >= Math.min(H, 220) || r.right <= 0 || r.left >= W) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.closest('[inert], [aria-hidden="true"], [hidden]')) continue;
    if (r.top < ins.top - 0.5) bad.push(`${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]} top ${Math.round(r.top)}`);
  }
  const bar = document.querySelector('nav.ds-phone-bar');
  const barB = bar ? [...bar.querySelectorAll('a, button')].map((b) => b.getBoundingClientRect().bottom) : [];
  if (barB.some((b) => b > H - ins.bottom + 0.5)) bad.push(`phone bar button bottom ${Math.round(Math.max(...barB))} past ${H - ins.bottom}`);
  // A panel or sheet that is open: its fixed buttons (not those in its
  // scrolling content) inside the insets too.
  const scrolls = (el) => /auto|scroll/.test(getComputedStyle(el).overflowY);
  for (const d of document.querySelectorAll('[role=dialog]')) {
    if (!d.getBoundingClientRect().width) continue;
    for (const b of d.querySelectorAll('button')) {
      let inScroll = false;
      for (let a = b.parentElement; a && a !== d; a = a.parentElement) if (scrolls(a)) { inScroll = true; break; }
      if (inScroll || scrolls(d)) continue;
      const r = b.getBoundingClientRect();
      if (!r.width || r.bottom <= 0 || r.top >= H) continue;
      if (r.top < ins.top - 0.5 || r.bottom > H - ins.bottom + 0.5) bad.push(`panel button "${b.textContent.trim().slice(0, 20)}" ${Math.round(r.top)}-${Math.round(r.bottom)}`);
    }
  }
  return { bad: bad.slice(0, 4), sideways: document.documentElement.scrollWidth > W };
}, inset);
