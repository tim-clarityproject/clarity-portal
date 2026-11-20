// Run 3's design rules for the calendar and booking (Tim, 19 Nov; Phase 6a
// run 3), each as a check that can fail. The UI tester (ui.mjs) runs the
// first part on every screen of the coach portal and of the booking pages
// (a screen with no tile, square or hatching simply has nothing to fail),
// and the driven checks on the screens that name them in `expects`
// (screens.mjs), so a rule that quietly stops being drawn fails too.
//
//   - the tile colours of 19 Nov, read from computed styles in each mode;
//   - 4px corners, no tile text under 12px, every tile line 4.5 to 1 against
//     what is really behind it;
//   - out-of-hours hatching under the tiles, flat lines, and no gradient
//     anywhere; Open times outlined in mint, never coral;
//   - the Schedule's 10px square of the tile's colour before the time;
//   - two time columns, UK and one other, switched by one choice, right on a
//     clock-change day; each call's block with the client's own time;
//   - working hours edited on the calendar; to-dos on the calendar;
//   - no key hints; the booking pages' own rules.

/** The colours of 19 Nov, as computed styles give them. */
export const TILE = {
  client: { bg: ['rgb(255, 189, 158)'], text: 'rgb(0, 0, 0)' },
  chemistry: { bg: ['rgb(95, 239, 187)'], text: 'rgb(0, 0, 0)' },
  connection: {
    dark: { bg: ['rgb(28, 72, 56)', 'rgba(95, 239, 187, 0.3)'], text: 'rgb(213, 250, 236)' }, // mint at 30% on the black page
    light: { bg: ['rgb(205, 249, 232)'], text: 'rgb(11, 90, 61)' },
  },
  mint: { dark: 'rgb(95, 239, 187)', light: 'rgb(11, 122, 82)' },
  coral: ['rgb(255, 111, 92)', 'rgb(255, 189, 158)', 'rgb(168, 78, 40)', 'rgb(194, 65, 46)'],
};

/**
 * Runs in the page: everything that can be read without touching anything.
 * @param {{ app: string, theme: 'dark'|'light', phone: boolean, tile: object }} o
 */
export function readCalRules(o) {
  const app = document.querySelector(o.app) || document.body;
  const roots = [app, ...document.querySelectorAll('.ds-portal')];
  const all = (sel) => roots.flatMap((r) => [...r.querySelectorAll(sel)]);
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const st = getComputedStyle(p); if (st.display === 'none' || st.visibility === 'hidden') return false; }
    return true;
  };
  const words = (el, n = 28) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const rgba = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; const [r, g, b, a = 1] = m.map(Number); return [r, g, b, a]; };
  const over = (top, under, alpha) => top.slice(0, 3).map((v, i) => v * alpha + under[i] * (1 - alpha));
  const lum = ([r, g, b]) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** The page's own colour behind a part: the first ancestor with a fill. */
  const behind = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c[3] >= 0.99) return c; } return o.theme === 'dark' ? [0, 0, 0, 1] : [249, 248, 245, 1]; };
  /** How see-through a part is, with everything it sits in. */
  const opacity = (el) => { let a = 1; for (let p = el; p && p !== document.documentElement; p = p.parentElement) a *= Number(getComputedStyle(p).opacity); return a; };
  const KINDS = ['client', 'chemistry', 'connection', 'admin', 'writing', 'other', 'life', 'hold', 'open'];
  const kindOf = (el) => KINDS.find((k) => el.classList.contains(`cc-cal-tile--${k}`)) || null;
  const grey = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) <= 12;
  const same = (c, list) => list.some((x) => { const [a, b] = [rgba(c), rgba(x)]; return a.every((v, i) => Math.abs(v - b[i]) < (i === 3 ? 0.01 : 0.6)); });
  const mint = o.tile.mint[o.theme];
  const out = { found: {}, colours: [], corners: [], small: [], contrast: [], hatch: [], gradients: [], open: [], squares: [], keys: [], clientTime: [], cut: [] };

  // ---- Tiles (the week, the day, a banner, the month's items): their colours, corners, sizes and contrast.
  const tiles = all('.cc-cal-tile, .cc-month-item').filter((t) => vis(t) && !t.matches('.cc-cal-tile--new'));
  out.found.tiles = tiles.length;
  out.found.kinds = [...new Set(tiles.map(kindOf))].filter(Boolean);
  for (const t of tiles) {
    const kind = kindOf(t);
    const cs = getComputedStyle(t);
    const name = `${kind || 'no kind'} “${words(t)}”`;
    if (!kind) { out.colours.push(`${name}: a tile with none of the nine colours`); continue; }
    const bg = cs.backgroundColor;
    const dashedAll = ['Top', 'Right', 'Bottom', 'Left'].every((s) => cs[`border${s}Style`] === 'dashed' && parseFloat(cs[`border${s}Width`]) >= 1);
    const want = o.tile[kind] ? (o.tile[kind].bg ? o.tile[kind] : o.tile[kind][o.theme]) : null;
    if (want) {
      if (!same(bg, want.bg)) out.colours.push(`${name}: its colour is ${bg}`);
      if (!same(cs.color, [want.text])) out.colours.push(`${name}: its words are ${cs.color}`);
    }
    if (kind === 'client') {
      // A hairline edge: a 1px line drawn all the way round (an inset shadow, or a border).
      const shadow = /(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+1px\s+inset/.exec(cs.boxShadow);
      const edged = (shadow && rgba(shadow[1])[3] > 0.5) || (parseFloat(cs.borderTopWidth) === 1 && cs.borderTopStyle === 'solid');
      if (!edged) out.colours.push(`${name}: no hairline edge (${cs.boxShadow})`);
    }
    if (['admin', 'writing', 'other'].includes(kind)) {
      const c = rgba(bg);
      if (c[3] < 0.99 || !grey(c)) out.colours.push(`${name}: its colour ${bg} isn’t one of the greys`);
    }
    if (kind === 'life' || kind === 'hold') {
      if (!dashedAll) out.colours.push(`${name}: its outline isn’t dashed all the way round (${cs.borderTopStyle})`);
      if (!same(bg, [`rgb(${behind(t).slice(0, 3).join(', ')})`]) && rgba(bg)[3] > 0.01) out.colours.push(`${name}: it has a fill (${bg})`);
    }
    if (kind === 'open') {
      const edge = cs.borderTopColor;
      if (cs.borderTopStyle !== 'solid' || !same(edge, [mint])) out.open.push(`${name}: its outline is ${cs.borderTopStyle} ${edge}`);
      if (same(edge, o.tile.coral) || same(cs.color, o.tile.coral) || same(bg, o.tile.coral)) out.open.push(`${name}: coral on an Open time`);
    } else if (dashedAll && kind !== 'life' && kind !== 'hold') out.colours.push(`${name}: a dashed outline on a tile that isn’t life, personal or held`);
    if (Math.abs(parseFloat(cs.borderTopLeftRadius) - 4) > 0.01 || Math.abs(parseFloat(cs.borderBottomRightRadius) - 4) > 0.01) out.corners.push(`${name}: corners ${cs.borderTopLeftRadius}`);
    // Every line of words in it: its size, and its contrast against what is really behind it (the tile's own
    // colour, seen through however see-through the tile is just now).
    const page = behind(t);
    const alpha = opacity(t);
    const fill = rgba(bg)[3] > 0.01 ? over(rgba(bg), page, rgba(bg)[3]) : page.slice(0, 3);
    const seenFill = over(fill, page, alpha);
    const dimmed = Boolean(t.closest('.cc-cal--hours')) || t.matches('.cc-cal-tile--lifted'); // events are dimmed while working hours are edited, and while one is dragged
    const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    const done = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || done.has(el) || el.closest('.ds-sr, svg') || !vis(el)) continue;
      done.add(el);
      const ls = getComputedStyle(el);
      if (parseFloat(ls.fontSize) < 11.99) out.small.push(`${name}: “${words(el, 18)}” is ${ls.fontSize}`);
      // A line the tile's own edge cuts through: more than a third of it under the bottom edge, while its top still shows.
      if (t.matches('.cc-cal-tile')) {
        const range = document.createRange(); range.selectNodeContents(n);
        const box = t.getBoundingClientRect();
        // (A line its own part already hides whole, a title kept to the lines that fit, isn't on the screen at all.)
        const own = /hidden|clip/.test(ls.overflowY) ? el.getBoundingClientRect() : null;
        for (const r of range.getClientRects()) if (r.height > 4 && !(own && r.top >= own.bottom - 1) && r.top < box.bottom - 2 && r.bottom - Math.min(box.bottom, own ? own.bottom : Infinity) > r.height * 0.34) { out.cut.push(`${name}: “${words(el, 18)}” is cut through by the tile’s edge (${Math.round(r.bottom - box.bottom)}px of ${Math.round(r.height)}px hidden)`); break; }
      }
      if (dimmed) continue;
      const ink = over(rgba(ls.color), seenFill, alpha * rgba(ls.color)[3]);
      const r = ratio(ink, seenFill);
      if (r < 4.5) out.contrast.push(`${name}: “${words(el, 18)}” is ${r.toFixed(2)} to 1`);
    }
  }

  // ---- Out-of-hours hatching: flat lines, under the tiles. No gradient anywhere.
  const offs = all('.cc-cal-off').filter(vis);
  out.found.hatch = offs.length;
  for (const off of offs) {
    const cs = getComputedStyle(off);
    const z = cs.zIndex === 'auto' ? 0 : Number(cs.zIndex);
    const column = off.closest('.cc-cal-col');
    const mine = column ? [...column.querySelectorAll('.cc-cal-tile')].filter(vis) : [];
    const b = off.getBoundingClientRect();
    for (const t of mine) {
      const tb = t.getBoundingClientRect();
      if (tb.bottom <= b.top + 1 || tb.top >= b.bottom - 1) continue;
      const tz = getComputedStyle(t).zIndex === 'auto' ? 0 : Number(getComputedStyle(t).zIndex);
      const after = Boolean(off.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (tz < z || (tz === z && !after)) out.hatch.push(`the hatching is drawn over “${words(t)}”`);
      if (rgba(getComputedStyle(t).backgroundColor)[3] < 0.99) out.hatch.push(`the hatching shows through “${words(t)}”`);
    }
    if (/gradient/.test(cs.backgroundImage)) out.hatch.push('the hatching is a gradient');
    if (off.tagName.toLowerCase() !== 'svg' || !off.querySelector('rect[fill^="url(#"]')) out.hatch.push('the hatching isn’t the pattern of flat lines');
  }
  const pattern = document.querySelector('#cc-cal-hatch');
  if (offs.length) {
    if (!pattern) out.hatch.push('no pattern of lines is defined');
    else {
      if (pattern.querySelector('linearGradient, radialGradient') || [...pattern.children].some((c) => c.tagName.toLowerCase() !== 'line')) out.hatch.push('the pattern holds something other than lines');
      const line = pattern.querySelector('line');
      const stroke = line ? getComputedStyle(line).stroke : '';
      if (!line || /url|gradient/.test(stroke) || rgba(stroke)[3] < 0.99) out.hatch.push(`the pattern’s line is ${stroke || 'missing'}`);
    }
  }
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') { if (/Gradient$/.test(el.tagName)) out.gradients.push(`an SVG ${el.tagName}`); continue; }
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && cs.content === 'none') continue;
        if (/gradient\(/.test(cs.backgroundImage) || /gradient\(/.test(cs.maskImage || '') || /gradient\(/.test(cs.borderImageSource || '')) {
          if (pseudo === null && !vis(el)) continue;
          out.gradients.push(`${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()}${pseudo || ''} “${words(el, 20)}”`);
        }
      }
    }
  }

  // ---- The Schedule's square (and the month's, on a phone): 10px, the tile's colour, before the time.
  const squares = all('.cc-sched-square').filter(vis);
  out.found.squares = squares.length;
  for (const s of squares) {
    const kind = kindOf(s);
    const cs = getComputedStyle(s);
    const b = s.getBoundingClientRect();
    const row = s.closest('.cc-sched-row');
    const name = `${kind || 'no kind'} square${row ? ` “${words(row.querySelector('.cc-sched-words') || row, 22)}”` : ''}`;
    if (!kind) { out.squares.push(`${name}: none of the nine colours`); continue; }
    if (Math.abs(b.width - 10) > 0.5 || Math.abs(b.height - 10) > 0.5) out.squares.push(`${name}: ${b.width.toFixed(1)} by ${b.height.toFixed(1)}`);
    const edge = { style: cs.borderTopStyle, width: parseFloat(cs.borderTopWidth) };
    if (kind === 'life' || kind === 'hold') {
      if (edge.style !== 'dashed' || edge.width < 1) out.squares.push(`${name}: its square isn’t dashed`);
      if (rgba(cs.backgroundColor)[3] > 0.01) out.squares.push(`${name}: its dashed square has a fill`);
    } else {
      const want = o.tile[kind] ? (o.tile[kind].bg ? o.tile[kind] : o.tile[kind][o.theme]) : null;
      if (want && !same(cs.backgroundColor, want.bg)) out.squares.push(`${name}: its square is ${cs.backgroundColor}`);
      if (kind === 'open') { if (!same(cs.borderTopColor, [mint]) && !same(cs.backgroundColor, [mint])) out.squares.push(`${name}: an Open time’s square isn’t mint`); continue; }
      // Grey and pale squares have a 1px edge: the three greys and the soft mint. (Peach and mint are the tiles' full
      // colours and are told by their colour, in light mode too, so they carry none.)
      const pale = ['connection', 'admin', 'writing', 'other'].includes(kind);
      if (pale && !(edge.style === 'solid' && Math.abs(edge.width - 1) < 0.01)) out.squares.push(`${name}: a grey or pale square with no 1px edge`);
      if (edge.style === 'dashed') out.squares.push(`${name}: a dashed square on an item that isn’t held or life`);
    }
    if (row) {
      const time = row.querySelector('.cc-sched-time');
      if (!time || s.getBoundingClientRect().right > time.getBoundingClientRect().left + 0.5) out.squares.push(`${name}: the square isn’t before the time`);
    }
  }

  // ---- No key hints, anywhere a person can read: the page, its panels and menus, and what a pointer shows.
  const said = roots.map((r) => r.innerText || '').join('\n');
  const tips = roots.flatMap((r) => [...r.querySelectorAll('[title], [aria-keyshortcuts], [data-tip], [aria-label]')]).filter(vis).map((el) => `${el.getAttribute('title') || ''} ${el.getAttribute('data-tip') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('aria-keyshortcuts') ? 'aria-keyshortcuts' : ''}`).join('\n');
  const HINT = /[⌘⌥⇧⌃⏎⎋↵]|\b(Ctrl|Cmd|Esc|Shift|Alt|Option)\b(?!\s+(Group|key\b))|\b(Enter|Escape|Backspace)\s+(key|to)\b|\bPress\s+[A-Z]\b|aria-keyshortcuts/;
  for (const line of `${said}\n${tips}`.split('\n')) { const t = line.trim(); if (t && HINT.test(t)) out.keys.push(`“${t.slice(0, 60)}”`); }
  for (const k of all('kbd').filter(vis)) out.keys.push(`a key drawn: “${words(k)}”`);
  out.keys = [...new Set(out.keys)];

  // ---- Each call's block shows the client's own time: a city, never letters, 12-hour for the US and Canada.
  const LETTERS = /\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|BST|UTC|CET|CEST|ET|CT|PT|NY|CHI|LA|LON|SGT|GST|AEDT|AEST)\b/;
  const US = /(New York|Chicago|Los Angeles|Denver|Toronto|Vancouver|Phoenix)/;
  out.found.clientTimes = 0;
  for (const t of all('.cc-cal-tile, .cc-sched-row').filter(vis)) {
    for (const line of (t.innerText || '').split('\n')) {
      if (LETTERS.test(line)) out.clientTime.push(`“${line.trim().slice(0, 50)}” names a zone by letters`);
      const m = US.exec(line);
      if (!m) continue;
      out.found.clientTimes += 1;
      if (!/\b\d{1,2}:\d{2} (am|pm)\b/.test(line)) out.clientTime.push(`“${line.trim().slice(0, 50)}”: a time in ${m[1]} that isn’t 12-hour`);
      if (/\b(1[3-9]|2[0-3]):\d{2} (am|pm)|\b0\d:\d{2} (am|pm)/.test(line)) out.clientTime.push(`“${line.trim().slice(0, 50)}”: not a 12-hour time`);
    }
  }
  // ---- What a screen is there to show (ui.mjs's `expects`).
  const bar = document.querySelector('.cc-callbar');
  out.found.bar = bar ? { words: bar.innerText.replace(/\s+/g, ' ').trim(), soon: bar.classList.contains('cc-callbar--soon'), zoom: [...bar.querySelectorAll('a')].some((a) => a.innerText.trim() === 'Join on Zoom') } : null;
  out.found.movedTile = all('.cc-cal-tile, .cc-sched-row').filter(vis).some((t) => /Moved in Google Calendar/.test(t.innerText));
  out.found.oneLine = all('.cc-cal-tile--one').filter(vis).length;
  out.found.said = said;
  return out;
}

/** Runs in the page: the two time columns as they stand. Each row: what the other column and the coach's say. */
export function readColumns() {
  const cal = [...document.querySelectorAll('.cc-cal')].find((c) => c.getBoundingClientRect().width > 0);
  if (!cal) return null;
  const cols = [...cal.querySelectorAll('.cc-cal-times')];
  const zones = [...cal.querySelectorAll('.cc-cal-head .cc-cal-zone')].map((z) => z.innerText.trim());
  const read = (c) => (c ? [...c.querySelectorAll('.cc-cal-hour')].map((h) => h.textContent.trim()) : []);
  const days = [...cal.querySelectorAll('[data-cal-day]')].map((d) => d.getAttribute('data-cal-day'));
  return { zones, other: read(cols[0]), coach: read(cols[1]), days, columns: cols.length, button: Boolean(cal.querySelector('.cc-cal-zone-btn')), widths: cols.map((c) => Math.round(c.getBoundingClientRect().width)) };
}

const ZONES = { 'New York': 'America/New_York', Chicago: 'America/Chicago', 'Los Angeles': 'America/Los_Angeles', Denver: 'America/Denver', Toronto: 'America/Toronto', Dubai: 'Asia/Dubai', Singapore: 'Asia/Singapore', UK: 'Europe/London' };
const clockIn = (at, zone) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
const dayIn = (at, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
/** Every instant of a UK day on which the UK clock reads a whole hour, in order (25 of them when the clocks go back). */
function ukHours(day) {
  const [y, m, d] = day.split('-').map(Number);
  const out = [];
  for (let t = Date.UTC(y, m - 1, d, -2); t <= Date.UTC(y, m - 1, d, 26); t += 3600000) if (dayIn(new Date(t), 'Europe/London') === day) out.push(new Date(t));
  return out;
}

/**
 * The two time columns, held against the clocks themselves: the coach's
 * column is the UK's whole hours, and beside each the other place's own
 * time at that same moment (so a day the clocks change on reads right).
 * @returns {string[]} problems
 */
export function columnProblems(read, { day = null } = {}) {
  const bad = [];
  if (!read) return ['no calendar grid is showing'];
  if (read.columns !== 2) bad.push(`${read.columns} time columns`);
  if (read.zones[1] !== 'UK') bad.push(`the coach’s column is headed “${read.zones[1]}”`);
  const zone = ZONES[read.zones[0]];
  if (!zone) { bad.push(`the other column is headed “${read.zones[0]}”, which isn’t a place the test knows`); return bad; }
  if (/^[A-Z]{2,4}$/.test(read.zones[0]) && read.zones[0] !== 'UK') bad.push(`the other column is headed by letters (“${read.zones[0]}”)`);
  const on = day || read.days[0];
  const hours = ukHours(on);
  // The rows start at the UK hour the first label names, and each is the next hour of the day as the clocks ran it.
  let at = hours.findIndex((h) => clockIn(h, 'Europe/London') === read.coach[0]);
  if (at < 0) return [...bad, `the first UK label is “${read.coach[0]}”`];
  // When the UK's own clocks go back, an hour is on the day twice: 24 labels can only name each once.
  const seen = new Set();
  for (let i = 0; i < read.coach.length; i += 1) {
    while (at < hours.length && seen.has(clockIn(hours[at], 'Europe/London'))) at += 1;
    const h = hours[at];
    if (!h) { bad.push(`there are more rows (${read.coach.length}) than hours on ${on}`); break; }
    seen.add(clockIn(h, 'Europe/London'));
    const [uk, other] = [clockIn(h, 'Europe/London'), clockIn(h, zone)];
    if (read.coach[i] !== uk) bad.push(`row ${i + 1}: the UK label is “${read.coach[i]}”, not ${uk}`);
    if (read.other[i] !== other) bad.push(`row ${i + 1} (${uk} UK): ${read.zones[0]} reads “${read.other[i]}”, and the clock there says ${other}`);
    at += 1;
  }
  return bad;
}

/** Chooses the second time column's place with one choice (the zone's own button, then the place). */
export async function chooseZone(page, place, settle) {
  const btn = page.locator('.cc-cal-zone-btn').first();
  await btn.waitFor({ timeout: 5000 });
  if ((await btn.innerText()).trim() === place) return 0;
  await btn.click(); await settle(page, 350);
  const item = page.getByRole('menuitemcheckbox', { name: place, exact: true }).or(page.getByRole('menuitemradio', { name: place, exact: true })).or(page.getByRole('menuitem', { name: place, exact: true })).first();
  await item.click(); await settle(page, 600);
  return 1;
}

/** Drives the page: the second column is switched by one choice, and both columns read right before and after. */
export async function zoneColumns(page, { settle, day = null, to = 'Dubai' }) {
  const out = [];
  const before = await page.evaluate(readColumns);
  for (const p of columnProblems(before, { day })) out.push(`${before?.zones?.[0] || 'the grid'}: ${p}`);
  if (!before || !before.button) { out.push('the other column has no button to switch it'); return out; }
  const was = before.zones[0];
  const next = was === to ? 'Singapore' : to;
  // One choice: the button opens the places, and choosing one is all it takes.
  await page.locator('.cc-cal-zone-btn').first().click(); await settle(page, 350);
  const places = await page.locator('[role=menu] [role^=menuitem]').allInnerTexts();
  for (const need of ['New York', 'Chicago', 'Los Angeles', 'Denver', 'Toronto', 'Dubai', 'Singapore']) if (!places.some((p) => p.trim().startsWith(need))) out.push(`the choice doesn’t offer ${need}`);
  await page.locator('[role=menu] [role^=menuitem]', { hasText: new RegExp(`^${next}`) }).first().click(); await settle(page, 700);
  const after = await page.evaluate(readColumns);
  if (after.zones[0] !== next) out.push(`after choosing ${next} the column is headed “${after.zones[0]}”`);
  if (await page.locator('[role=menu]').count()) out.push('the choice stayed open after choosing');
  for (const p of columnProblems(after, { day })) out.push(`${next}: ${p}`);
  // Put back as it was, so the next screen starts where this one did.
  await page.locator('.cc-cal-zone-btn').first().click(); await settle(page, 350);
  await page.locator('[role=menu] [role^=menuitem]', { hasText: new RegExp(`^${was}`) }).first().click(); await settle(page, 700);
  return out;
}

/**
 * Drives the page: working hours being edited on the week. A handle at each
 * day's start and finish, each a 44px tap area; events dimmed; a Done
 * button; the arrow keys move a handle 15 minutes.
 */
export async function hoursEditing(page, { settle }) {
  const out = [];
  const read = () => page.evaluate(() => {
    const cal = document.querySelector('.cc-cal--hours');
    if (!cal) return null;
    const cols = [...cal.querySelectorAll('.cc-cal-col')].filter((c) => c.getBoundingClientRect().width > 0);
    const handle = (h) => { const b = h.getBoundingClientRect(); const a = getComputedStyle(h, '::after'); return { label: h.getAttribute('aria-label'), now: Number(h.getAttribute('aria-valuenow')), text: h.getAttribute('aria-valuetext'), words: h.innerText.trim(), tapW: Math.max(b.width, parseFloat(a.width) || 0), tapH: Math.max(b.height, a.content !== 'none' ? parseFloat(a.height) || 0 : 0), role: h.getAttribute('role'), tab: h.tabIndex }; };
    const tiles = [...cal.querySelectorAll('.cc-cal-tile')].filter((t) => t.getBoundingClientRect().width > 0);
    return {
      days: cols.map((c) => ({ day: c.getAttribute('data-cal-day'), from: [...c.querySelectorAll('.cc-cal-handle--from')].map(handle), to: [...c.querySelectorAll('.cc-cal-handle--to')].map(handle) })),
      dimmed: tiles.filter((t) => Number(getComputedStyle(t).opacity) < 0.75).length,
      plain: tiles.filter((t) => Number(getComputedStyle(t).opacity) >= 0.75 && !t.matches('.cc-cal-tile--life, .cc-cal-tile--hold')).length,
      tiles: tiles.length,
      inert: tiles.every((t) => getComputedStyle(t).pointerEvents === 'none'),
      done: [...document.querySelectorAll('.cc-app button')].filter((b) => b.innerText.trim() === 'Done' && b.getBoundingClientRect().width > 0).length,
    };
  });
  const r = await read();
  if (!r) return ['the week isn’t in its editing mode'];
  if (!r.days.length) out.push('no day is showing');
  const working = r.days.filter((d) => d.from.length || d.to.length);
  if (!working.length) out.push('no day has a handle');
  for (const d of working) {
    if (d.from.length !== 1 || d.to.length !== 1) { out.push(`${d.day}: ${d.from.length} start and ${d.to.length} finish handles`); continue; }
    for (const h of [d.from[0], d.to[0]]) {
      if (h.tapW < 43.5 || h.tapH < 43.5) out.push(`${h.label}: its tap area is ${Math.round(h.tapW)} by ${Math.round(h.tapH)}`);
      if (h.role !== 'slider' || h.tab !== 0) out.push(`${h.label}: it can’t be reached by keyboard`);
      if (!/\d{2}:\d{2}/.test(h.words)) out.push(`${h.label}: it doesn’t show its time (“${h.words}”)`);
    }
    if (d.to[0].now <= d.from[0].now) out.push(`${d.day}: the finish isn’t after the start`);
  }
  if (r.tiles && r.plain > 0) out.push(`${r.plain} of ${r.tiles} events aren’t dimmed`);
  if (r.tiles && !r.inert) out.push('an event can still be dragged while the hours are edited');
  if (r.done !== 1) out.push(`${r.done} Done buttons`);
  // The arrow keys: down is 15 minutes later, up 15 minutes earlier (and it is put back as it was).
  const first = page.locator('.cc-cal--hours .cc-cal-handle--from').first();
  if (await first.count()) {
    const was = Number(await first.getAttribute('aria-valuenow'));
    await first.focus();
    await page.keyboard.press('ArrowDown'); await settle(page, 250);
    const down = Number(await page.locator('.cc-cal--hours .cc-cal-handle--from').first().getAttribute('aria-valuenow'));
    await page.locator('.cc-cal--hours .cc-cal-handle--from').first().focus();
    await page.keyboard.press('ArrowUp'); await settle(page, 250);
    const up = Number(await page.locator('.cc-cal--hours .cc-cal-handle--from').first().getAttribute('aria-valuenow'));
    if (down - was !== 15) out.push(`the down arrow moved the start ${down - was} minutes`);
    if (up !== was) out.push(`the up arrow left the start at ${up}, not back at ${was}`);
  }
  return out;
}

/**
 * Drives the page: a to-do placed on the calendar for under 45 minutes. One
 * line: the tick, the title ending "…" when it is cut, the start time only
 * if it fits; its full title on hover after about 0.3 seconds (where there
 * is a pointer); and, with the to-dos panel showing, the dashed coral
 * outline on the panel while the to-do is dragged over it.
 */
export async function todoOnCalendar(page, { settle, hover = true, key, title, coral }) {
  const out = [];
  const tile = page.locator(`[data-cal-key="${key}"]`).first();
  if (!(await tile.count())) return [`the placed to-do isn’t on the calendar (${key})`];
  await tile.scrollIntoViewIfNeeded(); await settle(page, 200);
  const r = await tile.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const inside = (x) => { if (!x) return null; const c = x.getBoundingClientRect(); return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, w: c.width, shown: c.width > 0 && getComputedStyle(x).display !== 'none' }; };
    const t = el.querySelector('.cc-cal-title'); const tick = el.querySelector('.cc-cal-tick'); const time = el.querySelector('.cc-cal-time');
    const ts = t ? getComputedStyle(t) : null;
    return {
      one: el.classList.contains('cc-cal-tile--one'), h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom,
      title: inside(t), tick: inside(tick), time: inside(time), timeText: time ? time.textContent.trim() : '',
      ellipsis: ts ? ts.textOverflow === 'ellipsis' && ts.whiteSpace === 'nowrap' && ts.overflow.includes('hidden') : false,
      cut: t ? t.scrollWidth > t.clientWidth + 0.5 : false, text: t ? t.textContent.trim() : '',
      lineHigh: ts ? parseFloat(ts.lineHeight) || parseFloat(ts.fontSize) * 1.2 : 0, tickRole: tick ? `${tick.getAttribute('role')} ${tick.getAttribute('aria-checked')}` : '',
    };
  });
  if (!r.one) out.push('a to-do under 45 minutes isn’t drawn on one line');
  if (!r.tick || !r.tick.shown) out.push('it has no tick'); else if (!/^checkbox (true|false)$/.test(r.tickRole)) out.push(`its tick is “${r.tickRole}”`);
  if (r.title && r.tick && r.tick.right > r.title.left + 0.5) out.push('the tick isn’t before the title');
  if (r.title && r.title.bottom - r.title.top > r.lineHigh * 1.6) out.push('the title runs to a second line');
  if (!r.ellipsis) out.push('a title too long for the tile wouldn’t end with “…”');
  if (r.text !== title) out.push(`the title reads “${r.text}”`);
  if (r.time && r.time.shown) {
    // The time shows only when it fits: whole, inside the tile, after the title.
    if (r.time.right > r.right + 0.5 || r.time.left < r.title.right - 0.5) out.push(`the start time (${r.timeText}) shows though it doesn’t fit`);
    if (!/^\d{2}:\d{2}$/.test(r.timeText)) out.push(`the start time reads “${r.timeText}”`);
  }
  const pop = () => page.locator('.ds-infopop:not([hidden])', { hasText: title }).count();
  if (hover) {
    if (!r.cut) out.push('the test’s to-do isn’t cut off here, so its hover can’t be read');
    else {
      await page.mouse.move(2, 2); await settle(page, 150);
      await tile.hover(); await settle(page, 130);
      const early = await pop();
      await settle(page, 420);
      const late = await pop();
      if (early) out.push('the full title shows at once, before 0.3 seconds');
      if (late !== 1) out.push('hovering the cut-off to-do doesn’t show its full title');
      await page.mouse.move(2, 2); await settle(page, 250);
      if (await pop()) out.push('the full title stays after the pointer has left');
    }
  }
  // Dragged over the to-dos panel: a dashed coral outline says it will come off the calendar. It is carried
  // back to where it was before it is let go, so nothing changes.
  const panel = page.locator('.cc-cal-todos').first();
  if (hover && await panel.count()) {
    const outline = () => panel.evaluate((el) => { const cs = getComputedStyle(el); return { style: cs.outlineStyle, colour: cs.outlineColor, width: parseFloat(cs.outlineWidth), over: el.classList.contains('cc-cal-todos--over') }; });
    const rest = await outline();
    if (rest.over || (rest.style === 'dashed' && coral.includes(rest.colour))) out.push('the panel is outlined before anything is dragged over it');
    const tb = await tile.boundingBox(); const pb = await panel.boundingBox();
    const from = { x: tb.x + Math.min(tb.width / 2, 60), y: tb.y + tb.height / 2 };
    const to = { x: pb.x + pb.width / 2, y: Math.min(pb.y + pb.height / 2, pb.y + 80) };
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x - 12, from.y + 4, { steps: 3 });
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 }); await settle(page, 350);
    const held = await outline();
    if (!held.over || held.style !== 'dashed' || !coral.includes(held.colour) || held.width < 1) out.push(`over the panel its outline is ${held.style} ${held.colour} ${held.width}px`);
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(from.x, from.y, { steps: 6 }); await settle(page, 250);
    const back = await outline();
    if (back.over) out.push('the outline stays once the to-do has left the panel');
    await page.mouse.up(); await settle(page, 700);
    const toast = await page.locator('.ds-toast').filter({ hasText: 'Back on your to-do list.' }).count();
    if (toast) { out.push('carried back to its place and let go, the to-do still came off the calendar'); await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click().catch(() => {}); await settle(page, 700); }
    if (!(await page.locator(`[data-cal-key="${key}"]`).count())) out.push('the to-do is no longer on the calendar after the drag');
  }
  return out;
}

/**
 * Runs in the page: a booking page outside the portal. It follows the
 * device's light or dark; one coral button at most in view; every time is
 * said with a city or country name, never letters; "Show early and late
 * times" is offered wherever times are listed.
 * @param {{ theme: 'dark'|'light', coral: string[] }} o
 */
export function readBooking(o) {
  const root = document.querySelector('.ui-root') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const inView = (el) => { const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < window.innerHeight && b.right > 0 && b.left < window.innerWidth; };
  const out = { device: [], coral: [], zones: [], early: [], found: {} };
  const bg = getComputedStyle(root).backgroundColor;
  const want = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' }[o.theme];
  const theme = document.documentElement.getAttribute('data-theme');
  if (bg !== want) out.device.push(`on a ${o.theme} device the page is ${bg}`);
  if (theme && theme !== o.theme) out.device.push(`on a ${o.theme} device the page is set to ${theme}`);
  if (matchMedia(`(prefers-color-scheme: ${o.theme})`).matches !== true) out.device.push('the test’s device isn’t in the mode it should be');
  const filled = [...root.querySelectorAll('button, a, [role=button]')].filter((b) => vis(b) && o.coral.includes(getComputedStyle(b).backgroundColor));
  const seen = filled.filter(inView);
  if (seen.length > 1) out.coral.push(`${seen.length} coral buttons in view: ${seen.map((b) => `“${b.innerText.trim().slice(0, 24)}”`).join(', ')}`);
  if (filled.length > 1) out.coral.push(`${filled.length} coral buttons on the page: ${filled.map((b) => `“${b.innerText.trim().slice(0, 24)}”`).join(', ')}`);
  const text = root.innerText || '';
  const times = [...root.querySelectorAll('.cc-book-time')].filter(vis);
  out.found.times = times.length;
  const LETTERS = /\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|GMT|BST|UTC|CET|CEST|ET|CT|PT|NY|CHI|LA|LON)\b/;
  for (const line of text.split('\n')) if (LETTERS.test(line)) out.zones.push(`“${line.trim().slice(0, 60)}” names a zone by letters`);
  if (/\b(GMT|UTC)[+-]\d/.test(text) || /[+-]\d{2}:\d{2}\b/.test(text)) out.zones.push('an offset is shown instead of a place');
  // Wherever a clock time is said, the page says whose clock it is: "… time" with a city or country.
  const clock = /\b\d{1,2}:\d{2}( (am|pm))?\b/;
  const place = /\b[A-Z][A-Za-z’' ]+ time\b/;
  out.found.clock = clock.test(text);
  if (clock.test(text) && !place.test(text) && !/Your time zone/.test(text)) out.zones.push('times are shown with no city or country named');
  const zoneBox = [...root.querySelectorAll('[role=combobox]')].filter(vis).find((c) => /time zone/i.test(c.getAttribute('aria-label') || c.closest('.ds-field, .cc-field, div')?.innerText || ''));
  if (zoneBox && /^[A-Z]{2,4}$/.test((zoneBox.innerText || '').trim()) && !['UK', 'US', 'UAE'].includes(zoneBox.innerText.trim())) out.zones.push(`the time zone box holds letters (“${zoneBox.innerText.trim()}”)`);
  out.found.zoneBox = zoneBox ? (zoneBox.innerText || '').trim() : null;
  // The page only offers "Show early and late times" when it is holding some back (07:00 to 20:00 the visitor's time), so
  // it is never a dead link; the screen that is there for it (`early`) presses it: see earlyAndLate below.
  const toggle = [...root.querySelectorAll('button, a')].filter(vis).find((b) => /^(Show|Hide) early and late times$/.test(b.innerText.trim()));
  out.found.early = toggle ? toggle.innerText.trim() : null;
  if (/The free times are early or late where you are\./.test(text) && !toggle) out.early.push('the page says the free times are early or late, with no “Show early and late times”');
  for (const t of times) { const s = t.innerText.trim(); if (!/^\d{1,2}:\d{2}( (am|pm))?$/.test(s.split('\n')[0])) out.zones.push(`a time reads “${s.slice(0, 30)}”`); }
  return out;
}

/** Runs in the page, on a phone: the calendar can be used (the Schedule's rows and the day's grid are a finger wide and tall). */
export function readPhoneCalendar() {
  const out = [];
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  for (const row of [...document.querySelectorAll('.cc-sched-row')].filter(vis)) { const b = row.getBoundingClientRect(); if (b.height < 43.5) out.push(`a Schedule row is ${Math.round(b.height)}px tall`); if (b.right > window.innerWidth + 0.5 || b.left < -0.5) out.push('a Schedule row runs off the side'); }
  const cols = [...document.querySelectorAll('.cc-cal .cc-cal-col')].filter(vis);
  for (const c of cols) { const b = c.getBoundingClientRect(); if (b.width < 120) out.push(`a day’s column is ${Math.round(b.width)}px wide`); if (b.right > window.innerWidth + 0.5) out.push('a day’s column runs off the side'); }
  for (const t of [...document.querySelectorAll('.cc-cal .cc-cal-tile')].filter(vis)) { const b = t.getBoundingClientRect(); if (b.right > window.innerWidth + 0.5 || b.left < -0.5) out.push(`“${t.textContent.trim().slice(0, 20)}” runs off the side`); }
  return { problems: [...new Set(out)], rows: document.querySelectorAll('.cc-sched-row').length, cols: cols.length };
}

/**
 * Drives a booking page where some free times are early or late for the
 * visitor: only times that start at 07:00 or later and end by 20:00 their
 * time show at first; "Show early and late times" brings the rest, and
 * "Hide early and late times" takes them away again.
 */
export async function earlyAndLate(page, { settle, minutes = 30 }) {
  const out = [];
  // Every time on every day shown (each day is pressed in turn).
  const read = async () => {
    const days = page.locator('.cc-book-days [role=radio]');
    const all = [];
    const n = await days.count();
    for (let i = 0; i < Math.max(1, n); i += 1) { if (n) { await days.nth(i).click(); await settle(page, 250); } all.push(...await page.locator('.cc-book-time').allInnerTexts()); }
    return all.map((t) => t.trim());
  };
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})(?: (am|pm))?$/.exec(t); if (!m) return null; let h = Number(m[1]); if (m[3]) h = (h % 12) + (m[3] === 'pm' ? 12 : 0); return h * 60 + Number(m[2]); };
  const toggle = (name) => page.getByRole('button', { name, exact: true });
  if (!(await toggle('Show early and late times').count())) return ['times are held back here, and “Show early and late times” isn’t offered'];
  const before = await read();
  const odd = before.filter((t) => { const m = mins(t); return m === null || m < 7 * 60 || m + minutes > 20 * 60; });
  if (odd.length) out.push(`before it is pressed, times outside 07:00 to 20:00 show: ${odd.slice(0, 4).join(', ')}`);
  await toggle('Show early and late times').click(); await settle(page, 500);
  if (!(await toggle('Hide early and late times').count())) out.push('once pressed it doesn’t read “Hide early and late times”');
  const after = await read();
  if (!(after.length > before.length)) out.push(`pressing it brought no more times (${before.length} before, ${after.length} after)`);
  if (!after.some((t) => { const m = mins(t); return m !== null && (m < 7 * 60 || m + minutes > 20 * 60); })) out.push('none of the times it brought is early or late');
  if (await toggle('Hide early and late times').count()) { await toggle('Hide early and late times').click(); await settle(page, 400); }
  const again = await read();
  if (again.length !== before.length) out.push('hiding them again doesn’t go back to the times it began with');
  return out;
}
