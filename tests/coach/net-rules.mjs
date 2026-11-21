// Network's own rules for the UI tester (Phase 6a run 4, step 4; the
// prompt's step 4 and the handover of 19 Nov), each read from the page:
// the table in its own box with its headings and its Name column staying
// put, and the map (one shared 0, a faint point a spot, "7 or more" once on
// each line and outside the chart, one same-size dot a spot, never coral,
// at most 150 people, 44px tap areas).

/** Runs in the page: what the map draws. */
export function readMap() {
  const svg = document.querySelector('.cc-net-map svg');
  if (!svg) return { none: true };
  // A dot that holds the keyboard wears the coral focus ring, as every control does: the dots are read at rest.
  if (svg.contains(document.activeElement)) document.activeElement.blur();
  const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const dots = [...svg.querySelectorAll('.cc-net-dot')].map((g) => {
    const o = g.querySelector('.cc-net-o');
    const cs = getComputedStyle(o);
    return { style: (g.getAttribute('class').match(/cc-net-dot--([a-z_]+)/) || [])[1], n: Number(g.querySelector('.cc-net-num')?.textContent || 1), r: Number(o.getAttribute('r')), fill: cs.fill, stroke: cs.stroke, dash: cs.strokeDasharray,
      tap: box(g.querySelector('.cc-net-tap')), o: box(o), ring: Boolean(g.querySelector('.cc-net-ring')), label: g.getAttribute('aria-label') || '', role: g.getAttribute('role'), tab: g.getAttribute('tabindex') };
  });
  const texts = [...svg.querySelectorAll('text')].map((t) => ({ words: t.textContent.trim(), cls: t.getAttribute('class') || '', box: box(t), size: parseFloat(getComputedStyle(t).fontSize) }));
  const points = [...svg.querySelectorAll('.cc-net-point')].map(box);
  const frame = { l: Math.min(...points.map((p) => p.l)), r: Math.max(...points.map((p) => p.r)), t: Math.min(...points.map((p) => p.t)), b: Math.max(...points.map((p) => p.b)) };
  return { dots, texts, points: points.length, frame, lines: svg.querySelectorAll('.cc-net-seven').length, svg: box(svg), page: document.documentElement.clientWidth, keys: document.querySelectorAll('.cc-net-map [class*=legend], .cc-net-map [class*=key]').length };
}

const CORAL = /rgb\((255, 111, 92|255, 133, 116|240, 96, 78|255, 189, 158|168, 78, 40|233, 91, 72)\)/;

/** What the map gets wrong, as a list of plain lines (empty when it is right). */
export function mapProblems(m, { phone, cap = 150 }) {
  if (m.none) return ['no map on the screen'];
  const out = [];
  const zeros = m.texts.filter((t) => t.words === '0');
  if (zeros.length !== 1) out.push(`the 0 is written ${zeros.length} times`);
  if (m.points !== 121) out.push(`${m.points} faint points, not one at each of the 121 spots`);
  const sevens = m.texts.filter((t) => t.words === '7 or more');
  if (m.lines !== 2 || sevens.length !== 2) out.push(`${m.lines} lines at 7 and ${sevens.length} “7 or more” labels`);
  const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  for (const s of sevens) if (m.dots.some((d) => overlaps(s.box, d.o))) out.push('a “7 or more” label sits on a dot');
  if (!phone && sevens.some((s) => s.box.l > m.frame.l + 4 && s.box.r < m.frame.r - 4 && s.box.t > m.frame.t + 4 && s.box.b < m.frame.b - 4)) out.push('a “7 or more” label is inside the chart');
  for (const want of ['Influence', 'Trust']) if (m.texts.filter((t) => t.words === want).length !== 1) out.push(`${want} isn’t written once`);
  if (m.texts.filter((t) => t.words === '10').length !== 2) out.push('10 isn’t at each far end');
  const sizes = [...new Set(m.dots.map((d) => d.r))];
  if (sizes.length > 1) out.push(`dots of ${sizes.length} sizes (${sizes.join(', ')})`);
  if (sizes.length === 1 && sizes[0] !== (phone ? 8.5 : 9.5)) out.push(`dots of radius ${sizes[0]}`);
  const coral = m.dots.filter((d) => CORAL.test(d.fill) || CORAL.test(d.stroke));
  if (coral.length) out.push(`${coral.length} coral dots`);
  const small = m.dots.filter((d) => d.tap.w < 43.5 || d.tap.h < 43.5);
  if (small.length) out.push(`${small.length} dots with a tap area under 44px (${small[0].tap.w.toFixed(0)})`);
  const people = m.dots.reduce((n, d) => n + d.n, 0);
  if (people > cap) out.push(`${people} people on the map, over ${cap}`);
  const spots = new Set(m.dots.map((d) => `${Math.round(d.o.l)}:${Math.round(d.o.t)}`));
  if (spots.size !== m.dots.length) out.push('two dots share a spot');
  if (m.dots.some((d) => d.role !== 'button' || d.tab !== '0' || !/ Open$/.test(d.label))) out.push('a dot can’t be opened by keyboard, or doesn’t say it opens');
  // Each style differs by shape, not by colour alone.
  const by = (style) => m.dots.filter((d) => d.style === style);
  if (by('keep_close').some((d) => !d.ring)) out.push('a Keep close dot has no ring');
  if (by('invest').some((d) => d.stroke === 'none')) out.push('an Invest dot has no outline');
  if (by('rebalance').some((d) => d.dash === 'none')) out.push('a Rebalance? dot isn’t dashed');
  if (by('maintain').some((d) => d.stroke !== 'none')) out.push('a Maintain dot isn’t solid');
  if (m.keys) out.push('a key is on the screen');
  if (m.svg.r > m.page + 0.5) out.push(`the chart runs off the side (${Math.round(m.svg.r)} of ${m.page})`);
  if (m.texts.some((t) => t.size < 9.5)) out.push('text under 10px on the map');
  return out;
}

/**
 * The table's own box: scrolled down and sideways, the heading row stays at
 * the top of the box and the Name column at its left, with nothing showing
 * through either; and the page itself never scrolls sideways.
 */
export async function tableFrozen(page, { settle }) {
  const read = () => page.evaluate(() => {
    const box = document.querySelector('.cc-net-box');
    if (!box) return null;
    const b = box.getBoundingClientRect();
    const heads = [...box.querySelectorAll('thead th')].map((x) => x.getBoundingClientRect());
    const names = [...box.querySelectorAll('tbody .cc-net-name')].map((x) => x.getBoundingClientRect());
    const cs = (el) => getComputedStyle(el).backgroundColor;
    return { top: b.top, left: b.left, x: box.scrollLeft, y: box.scrollTop, maxX: box.scrollWidth - box.clientWidth, maxY: box.scrollHeight - box.clientHeight, headTops: heads.map((h) => Math.round(h.top - b.top)), nameLefts: [...new Set(names.map((n) => Math.round(n.left - b.left)))],
      headLeft: Math.round(heads[0].left - b.left), headFill: cs(box.querySelector('thead th')), nameFill: cs(box.querySelector('tbody .cc-net-name')), sideways: document.documentElement.scrollWidth - window.innerWidth,
      under: names.filter((n) => n.bottom > b.top + 1 && n.top < heads[0].bottom - 1).length };
  });
  const out = [];
  const before = await read();
  if (!before) return ['no table box on the screen'];
  if (before.maxX < 40) out.push('the table doesn’t scroll sideways in its box');
  await page.locator('.cc-net-box').evaluate((b) => { b.scrollTop = Math.min(400, b.scrollHeight); b.scrollLeft = 320; });
  await settle(page, 250);
  const a = await read();
  if (a.x < 100) out.push(`the box only scrolled ${a.x}px sideways`);
  if (a.maxY > 100 && a.y < 100) out.push(`the box only scrolled ${a.y}px down`);
  if (a.headTops.some((t) => Math.abs(t) > 1)) out.push(`the heading row moved (${[...new Set(a.headTops)].join(', ')})`);
  if (a.nameLefts.length !== 1 || Math.abs(a.nameLefts[0]) > 1 || Math.abs(a.headLeft) > 1) out.push(`the Name column moved (${a.nameLefts.join(', ')}; its heading ${a.headLeft})`);
  if (/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(a.headFill) || /rgba\(\d+, \d+, \d+, 0\)|transparent/.test(a.nameFill)) out.push('rows show through the heading row or the Name column');
  if (a.sideways > 0) out.push(`the page scrolls sideways (${a.sideways}px)`);
  return out;
}

// ---------------------------------------------------------------- the UI tester's own checks for run 4 (TEST4-UI.md)

/** Runs in the page: Network's tabs, in order. */
export function readNetTabs() {
  const tabs = [...document.querySelectorAll('.cc-main .cc-utabs [role=tab]')].map((t) => ({ words: t.textContent.trim(), on: t.getAttribute('aria-selected') === 'true' }));
  return tabs;
}
/** Network's tabs are three underlined tabs, Actions first (the prompt's step 4). */
export function netTabProblems(tabs) {
  const words = tabs.map((t) => t.words);
  if (words.join('|') !== 'Actions|Table|Map') return [`the tabs are ${words.join(', ') || 'missing'}, not Actions, Table, Map`];
  return tabs.filter((t) => t.on).length === 1 ? [] : ['one tab isn’t marked as the one shown'];
}

/** Runs in the page: Actions' two lists, their rows and their "Show all" links. */
export function readActions() {
  const out = {};
  for (const part of document.querySelectorAll('.cc-main section, .cc-main .cc-part')) {
    const h = part.querySelector('h2'); if (!h) continue;
    const title = h.textContent.trim().toLowerCase();
    if (title !== 'due now' && title !== 'coming up') continue;
    out[title] = {
      rows: [...part.querySelectorAll('.cc-row')].map((r) => ({ name: (r.querySelector('.cc-row-title, b, strong') || r).textContent.trim(), when: (r.querySelector('.cc-row-when') || {}).textContent?.trim() || '' })),
      more: [...part.querySelectorAll('.cc-acts button, .cc-acts a')].map((b) => b.textContent.trim()).find((t) => /^Show all/.test(t)) || '',
    };
  }
  return out;
}
const MONTH = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
/** Due now: "9 days overdue" style, most overdue first, folding after 8 with "Show all"; Coming up: soonest first, folding after 4. */
export function actionsProblems(a, { all = false } = {}) {
  const out = [];
  const due = a['due now']; const coming = a['coming up'];
  if (!due) return ['no Due now list'];
  if (due.rows.some((r) => !/^(\d+ days? overdue|Due today)$/.test(r.when))) out.push(`a Due now row reads “${due.rows.find((r) => !/^(\d+ days? overdue|Due today)$/.test(r.when)).when}”`);
  const days = due.rows.map((r) => (r.when === 'Due today' ? 0 : Number(r.when.split(' ')[0])));
  if (days.some((d, i) => i > 0 && d > days[i - 1])) out.push(`Due now isn’t most overdue first (${days.join(', ')})`);
  if (!all && due.more && due.rows.length !== 8) out.push(`Due now shows ${due.rows.length} rows before “${due.more}”, not 8`);
  if (!all && !due.more && due.rows.length > 8) out.push(`Due now shows ${due.rows.length} rows with no Show all`);
  if (all && due.more) out.push(`Due now still offers “${due.more}” once opened`);
  if (due.more && !/^Show all [\d,]+$/.test(due.more)) out.push(`Due now’s link reads “${due.more}”`);
  if (coming) {
    if (coming.more && coming.rows.length !== 4) out.push(`Coming up shows ${coming.rows.length} rows before “${coming.more}”, not 4`);
    if (!coming.more && coming.rows.length > 4) out.push(`Coming up shows ${coming.rows.length} rows with no Show all`);
    const when = coming.rows.map((r) => { const m = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.exec(r.when); return m ? MONTH[m[2]] * 100 + Number(m[1]) : null; });
    if (when.some((w) => w === null)) out.push(`a Coming up row reads “${coming.rows[when.indexOf(null)].when}”`);
    // (Soonest first; a list running into January would wrap, and the seeds' Coming up stays inside November and December.)
    else if (when.some((w, i) => i > 0 && w < when[i - 1])) out.push('Coming up isn’t soonest first');
  }
  return out;
}

/** Runs in the page: the table's rows, and the words under it. */
export function readTableRows() {
  const box = document.querySelector('.cc-net-box');
  return { rows: box ? box.querySelectorAll('tbody tr').length : 0, foot: [...document.querySelectorAll('.cc-net-more')].map((m) => m.innerText.replace(/\s+/g, ' ').trim()).join(' '), count: (document.querySelector('.cc-net-ctl .cc-net-count') || {}).textContent || '' };
}

/**
 * Runs in the page: every menu open on the screen floats over everything (nothing at its corners or its middle belongs to
 * anything else), sits inside the screen, isn't inside the table's own box, and isn't cut off inside itself.
 */
export function readFloatingMenus() {
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const out = [];
  const menus = [...document.querySelectorAll('[role=menu]')].filter(vis);
  for (const m of menus) {
    const shell = m.closest('.ds-popover, .ds-pop, [class*=popover], .ds-dialog') || m;
    const b = shell.getBoundingClientRect();
    const name = m.getAttribute('aria-label') || 'a menu';
    const w = window.innerWidth; const h = window.innerHeight;
    if (b.left < -0.5 || b.top < -0.5 || b.right > w + 0.5 || b.bottom > h + 0.5) out.push(`${name} runs off the screen (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)} of ${w} by ${h})`);
    if (m.closest('.cc-net-box, .cc-table, .cc-table-box')) out.push(`${name} is inside the table, so the table can cut it off`);
    const inset = 6;
    for (const [x, y] of [[b.left + inset, b.top + inset], [b.right - inset, b.top + inset], [b.left + inset, b.bottom - inset], [b.right - inset, b.bottom - inset], [(b.left + b.right) / 2, (b.top + b.bottom) / 2]]) {
      if (x < 0 || y < 0 || x > w || y > h) continue;
      const at = document.elementFromPoint(x, y);
      if (at && !shell.contains(at)) { out.push(`${name} is under ${at.tagName.toLowerCase()}.${String(at.className).split(' ')[0]} at ${Math.round(x)},${Math.round(y)}`); break; }
    }
  }
  return { read: menus.length, problems: out };
}

/** Runs in the page: each map dot's colours, read from computed styles, and the mode's own tokens for them. */
export function readDotStyles() {
  const host = document.querySelector('.cc-net-map');
  if (!host) return null;
  const probe = (v) => { const d = document.createElement('span'); d.style.color = `var(${v})`; host.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const t = { good: probe('--good'), text: probe('--text'), bg: probe('--bg'), below: probe('--below'), raised: probe('--raised'), line: probe('--line'), coral: probe('--coral') };
  if (host.contains(document.activeElement)) document.activeElement.blur();
  const dots = [...host.querySelectorAll('.cc-net-dot')].map((g) => {
    const o = getComputedStyle(g.querySelector('.cc-net-o'));
    const ring = g.querySelector('.cc-net-ring');
    return { style: (g.getAttribute('class').match(/cc-net-dot--([a-z_]+)/) || [])[1], fill: o.fill, stroke: o.stroke, dash: o.strokeDasharray, ring: ring ? getComputedStyle(ring).stroke : null };
  });
  return { t, dots };
}
const grey = (c) => { const m = String(c).match(/\d+(\.\d+)?/g); if (!m) return false; const [r, g, b] = m.map(Number); return Math.max(r, g, b) - Math.min(r, g, b) <= 14; };
/** The dot styles of 19 Nov: Keep close green with a fine ring, Maintain solid, Invest an outline, Rebalance? a dashed grey outline, mixed pale, no list plain grey; never coral. */
export function dotStyleProblems(s, { need = [] } = {}) {
  if (!s) return ['no map on the screen'];
  const out = [];
  const { t } = s;
  const seen = new Set(s.dots.map((d) => d.style));
  for (const n of need) if (!seen.has(n)) out.push(`no ${n} dot on the screen to read`);
  for (const d of s.dots) {
    const say = (what) => out.push(`a ${d.style} dot ${what} (fill ${d.fill}, edge ${d.stroke})`);
    if (d.fill === t.coral || d.stroke === t.coral) say('is coral');
    if (d.style === 'keep_close' && !(d.fill === t.good && d.ring === t.good)) say('isn’t green with a green ring');
    if (d.style === 'maintain' && !(d.fill === t.text && d.stroke === 'none')) say('isn’t solid in the text colour');
    if (d.style === 'invest' && !(d.fill === t.bg && d.stroke === t.text && d.dash === 'none')) say('isn’t an outline in the text colour');
    if (d.style === 'rebalance' && !(d.stroke === t.below && d.dash !== 'none' && grey(t.below) && d.fill === t.bg)) say('isn’t a dashed grey outline');
    if (d.style === 'mixed' && !(d.fill === t.raised && d.fill !== t.text && d.fill !== t.good)) say('isn’t pale');
    if (d.style === 'none' && !(d.fill === t.line && grey(t.line) && d.stroke === 'none')) say('isn’t plain grey');
  }
  return [...new Set(out)].slice(0, 6);
}

/**
 * A single dot's pop-up card (Tim, 19 Nov, 15:54): the name as its title, then the organisation and the list, then the
 * rows Influence, Trust and Catch-up; inside the screen. On a phone a dot's pop-up is one line (read by chartPopups), so
 * only its words and its place are read there.
 */
export async function mapCard(page, { phone, settle }) {
  const dot = page.locator('.cc-net-map .cc-net-dot:not(:has(.cc-net-num))').first();
  if (!(await dot.count())) return ['no single dot on the map to read'];
  const label = await dot.getAttribute('aria-label');
  const listed = !/cc-net-dot--none\b/.test(await dot.getAttribute('class')); // M11: a person in no list has no list line, only the organisation
  const name = label.split(/[,.]/)[0].trim();
  if (phone) await dot.focus(); else await dot.hover({ force: true });
  await settle(page, 300);
  const tip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.ds-tip')].filter((t) => !t.hidden && t.getBoundingClientRect().width > 0).pop();
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { title: el.querySelector('.ds-tip-title')?.textContent.trim() || '', sub: [...el.querySelectorAll('.ds-tip-sub')].map((s) => s.textContent.trim()), rows: [...el.querySelectorAll('.ds-tip-row dt')].map((d) => d.textContent.trim()), words: el.innerText.replace(/\s+/g, ' ').trim(), l: b.left, r: b.right, t: b.top, b: b.bottom, w: window.innerWidth, h: window.innerHeight };
  });
  await page.keyboard.press('Escape'); if (!phone) await page.mouse.move(2, 2);
  await settle(page, 150);
  if (!tip) return [`pointing at ${name} opened no pop-up`];
  const out = [];
  if (tip.l < 0 || tip.r > tip.w || tip.t < 0 || tip.b > tip.h) out.push(`${name}’s pop-up runs off the screen`);
  if (!tip.words.startsWith(name)) out.push(`${name}’s pop-up starts “${tip.words.slice(0, 30)}”`);
  if (!phone) {
    if (tip.title !== name) out.push(`the card’s title is “${tip.title}”, not ${name}`);
    if (listed && (!tip.sub.length || !/(Keep close|Maintain|Invest|Rebalance\?)$/.test(tip.sub[tip.sub.length - 1]))) out.push(`under the title: “${tip.sub.join(' / ')}”, not the organisation and the list`);
    if (tip.rows.join('|') !== 'Influence|Trust|Catch-up') out.push(`the card’s rows are ${tip.rows.join(', ') || 'missing'}, not Influence, Trust, Catch-up`);
  }
  return out;
}

/** Where two dots' tap areas overlap, a press opens the dot whose centre is nearest it (ChartTips' `nearest`), whichever is drawn on top. */
export async function nearestWins(page, { settle }) {
  const pair = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('.cc-net-map .cc-net-dot')].filter((g) => !g.querySelector('.cc-net-num')).map((g) => { const b = g.querySelector('.cc-net-o').getBoundingClientRect(); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, label: g.getAttribute('aria-label'), key: g.getAttribute('data-spot') }; });
    let best = null;
    for (const a of dots) for (const b of dots) { if (a === b) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < 30 && d > 8 && (!best || d < best.d)) best = { a, b, d }; }
    return best;
  });
  if (!pair) return { read: 0, problems: [] };
  const out = [];
  // Twice: once nearer each of the two, so the one drawn on top can't win both.
  for (const [near, far] of [[pair.a, pair.b], [pair.b, pair.a]]) {
    const x = near.x + (far.x - near.x) * 0.3; const y = near.y + (far.y - near.y) * 0.3;
    await page.mouse.click(x, y);
    await settle(page, 600);
    const said = await page.evaluate(() => { const d = [...document.querySelectorAll('.ds-modal--shown .ds-dialog, [role=dialog]')].filter((e) => e.getBoundingClientRect().width > 0).pop(); return d ? d.innerText : ''; });
    const want = near.label.split(/[,.]/)[0].trim(); const not = far.label.split(/[,.]/)[0].trim();
    const title = said.split('\n').map((l) => l.trim()).find(Boolean) || '';
    if (title.toLowerCase() !== want.toLowerCase()) out.push(`a press nearer ${want} than ${not} opened “${said.split('\n').slice(0, 2).join(' ').slice(0, 60)}”`);
    await page.keyboard.press('Escape'); await settle(page, 500);
  }
  return { read: 2, problems: out };
}

/**
 * Runs in the page: Leads' and the boards' own rules. A lead card says how ready they are in words, never a number or a
 * score; money is written the portal's way ("£13,500", "£640/month"); "Edit", never "Change"; and below 1100px no table
 * and no Table choice.
 */
export function readLeadRules(wide) {
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const out = [];
  const cards = [...document.querySelectorAll('.cc-lead-card:not(.cc-card-ghost)')].filter(vis);
  for (const c of cards) {
    const t = c.innerText.replace(/\s+/g, ' ');
    if (/\bscore\b|\d\s*%|\b\d+\s*\/\s*(5|10|100)\b|\b(qualified|readiness)\s*\d/i.test(t)) { out.push(`a card shows a number for how ready they are: “${t.slice(0, 60)}”`); break; }
  }
  const text = [document.querySelector('.cc-main')?.innerText || '', ...[...document.querySelectorAll('.ds-portal')].map((p) => p.innerText)].join('\n');
  const money = text.match(/£\s+\d|£\d+(\.\d+)?k\b|£\d{4,}|\bGBP\b|£[\d,]+(\.\d\d)? (\/|per) ?(hr|hour|month)\b|£[\d,]+\/h\b/gi);
  if (money) out.push(`money not written the portal’s way: ${[...new Set(money)].slice(0, 3).join(', ')}`);
  const names = [...document.querySelectorAll('button, a, [role=menuitem], [role=menuitemcheckbox], [role=option]')].filter(vis).map((b) => `${b.getAttribute('aria-label') || ''} ${b.textContent}`.trim());
  const change = names.find((n) => /^Change\b|\bChange stage\b/.test(n)) || (/\bChange stage\b/.test(text) ? 'Change stage' : null);
  if (change) out.push(`“${change.slice(0, 40)}”: Edit, never Change`);
  if (!wide) {
    if ([...document.querySelectorAll('.cc-main table')].some(vis)) out.push('a table shows below 1100px');
    if ([...document.querySelectorAll('.cc-main .ds-seg-btn, .cc-main [role=radio]')].some((b) => vis(b) && b.textContent.trim() === 'Table')) out.push('the Table view is offered below 1100px');
    if ([...document.querySelectorAll('[role=menuitemcheckbox], [role=menuitemradio]')].some((b) => vis(b) && b.textContent.trim() === 'Table')) out.push('the View menu offers Table below 1100px');
  }
  return { cards: cards.length, problems: out };
}

/**
 * Runs in the page: words cut off at the side. Every run of words on the page and its panels is held against the
 * nearest box around it that hides what overflows (a box that scrolls sideways by itself, a table's, is left out:
 * it is meant to be scrolled), and against the screen. A placeholder too wide for its box is read the same way.
 */
export function readClipped() {
  const out = [];
  const roots = [document.querySelector('.cc-main'), ...document.querySelectorAll('.ds-portal')].filter(Boolean);
  const clipOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (/auto|scroll/.test(o)) return 'scrolls';
      if (/hidden|clip/.test(o)) return p;
    }
    return null;
  };
  const w = document.documentElement.clientWidth;
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || el.closest('[hidden], .ds-sr, [aria-hidden=true]') || cs.textOverflow === 'ellipsis') continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const box = clipOf(el);
      if (box === 'scrolls') continue; // a box that scrolls sideways by itself (the Network table) is meant to be scrolled
      if (box && box.getBoundingClientRect().width <= 2) continue; // words only a screen reader hears, drawn 1px wide
      const b = box ? box.getBoundingClientRect() : { left: 0, right: w };
      if (r.right > Math.min(b.right, w) + 0.5 || r.left < Math.max(b.left, 0) - 0.5) out.push(`“${t.slice(0, 30)}” is cut off at the side (${Math.round(r.left)} to ${Math.round(r.right)}, its box ${Math.round(b.left)} to ${Math.round(b.right)})`);
    }
  }
  for (const i of document.querySelectorAll('.cc-main input[placeholder], .ds-portal input[placeholder]')) {
    if (!i.placeholder || i.value || i.getBoundingClientRect().width < 1) continue;
    const cs = getComputedStyle(i);
    const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (c.measureText(i.placeholder).width > room + 1) out.push(`the box’s words “${i.placeholder}” are cut off (${Math.round(c.measureText(i.placeholder).width)} of ${Math.round(room)}px)`);
  }
  return [...new Set(out)].slice(0, 6);
}
