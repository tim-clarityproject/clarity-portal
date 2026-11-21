// This run's design rules for the coach portal (Tim, 18 and 19 Nov; Phase 6a
// run 2), each as a check that can fail. The UI tester (ui.mjs) runs them on
// every screen; a screen that must show a rule names it in `expects`
// (screens.mjs), so a rule that quietly stops being drawn fails too.
//
// The functions in the first part run in the page (page.evaluate); the ones
// after it drive the page (a pop-up opened, a panel hidden and shown again).
// Each gives a list of problems in words, empty when the rule holds.

/** Soft coral, as tokens.css has it in each mode (the Important tick box's edge, a week over capacity). */
export const SOFT_CORAL = { dark: 'rgb(255, 189, 158)', light: 'rgb(168, 78, 40)' };
const MINT = ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'];

/**
 * Runs in the page: every rule that can be read without touching anything.
 * @param {{ app: string, phone: boolean, wide: boolean, theme: 'dark'|'light', softCoral: string, mint: string[] }} o
 */
export function readRules(o) {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const app = document.querySelector(o.app) || document.body;
  const root = top || app;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden], [inert]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const st = getComputedStyle(p); if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false; }
    return true;
  };
  const words = (el, n = 36) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const name = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} “${words(el)}”`;
  const clear = (c) => !c || /rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c);
  /** How many lines of words an element holds (by where its words are drawn). */
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tall = parseFloat(getComputedStyle(el).fontSize) || 16;
    const mids = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => (r.top + r.bottom) / 2).sort((a, b) => a - b);
    let n = 0; let last = -Infinity;
    for (const m of mids) { if (m - last > tall * 0.7) { n += 1; last = m; } }
    return n;
  };
  const text = `${app.innerText || ''}\n${[...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n')}`;
  const out = { found: {} };

  // ---- Tabs: underlined, never the gliding switch; on a phone they scroll in their own strip.
  out.tabs = [];
  const strip = [...app.querySelectorAll('.cc-utabs')].filter(vis)[0];
  out.found.tabs = Boolean(strip);
  if (strip) {
    const tabs = [...strip.querySelectorAll('[role=tab]')].filter(vis);
    const chosen = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    if (strip.getAttribute('role') !== 'tablist' || tabs.length < 2) out.tabs.push(`the strip is not a list of tabs (${tabs.length} tabs)`);
    if (strip.closest('.ds-seg') || strip.querySelector('.ds-seg, .ds-seg-btn, .ds-seg-tile')) out.tabs.push('the tabs are the gliding switch');
    if (chosen.length !== 1) out.tabs.push(`${chosen.length} tabs are chosen`);
    const under = (t) => { const s = getComputedStyle(t).boxShadow; const m = /(rgba?\([^)]+\))\s+0px\s+(-?[\d.]+)px\s+0px\s+0px\s+inset/.exec(s); return m && !clear(m[1]) ? Math.abs(parseFloat(m[2])) : 0; };
    for (const t of tabs) {
      const on = t.getAttribute('aria-selected') === 'true';
      const line = under(t);
      if (on && !(line >= 1)) out.tabs.push(`the chosen tab “${words(t)}” has no line under it`);
      if (!on && line > 0) out.tabs.push(`“${words(t)}” is underlined though it isn’t chosen`);
      const st = getComputedStyle(t);
      if (!clear(st.backgroundColor)) out.tabs.push(`“${words(t)}” has a fill`);
      if (st.whiteSpace !== 'nowrap') out.tabs.push(`“${words(t)}” can break onto two lines`);
    }
    if (new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size > 1) out.tabs.push('the tabs are not on one line');
    if (!/auto|scroll/.test(getComputedStyle(strip).overflowX)) out.tabs.push(`the strip can’t scroll sideways on its own (${getComputedStyle(strip).overflowX})`);
    // The strip moved sideways never moves the page.
    const before = window.scrollX;
    strip.scrollLeft = 60;
    const moved = strip.scrollLeft;
    if (strip.scrollWidth - strip.clientWidth > 1 && moved < 1) out.tabs.push('the strip is wider than its space and doesn’t scroll');
    if (window.scrollX !== before || document.documentElement.scrollWidth - window.innerWidth > 0) out.tabs.push('the page scrolls sideways with the tabs');
    strip.scrollLeft = 0;
    out.tabsLook = { labels: tabs.map((t) => words(t)).join(' | '), size: chosen[0] ? getComputedStyle(chosen[0]).fontSize : '', line: chosen[0] ? under(chosen[0]) : 0, gap: getComputedStyle(strip).columnGap, overflow: strip.scrollWidth - strip.clientWidth };
  }

  // ---- Boxes side by side line up: their tops are level and their heights match.
  out.level = [];
  const boxes = [...root.querySelectorAll('.ds-dd, .ds-field, .ds-grow, .ds-seg:not(.ds-seg-measure), .ds-date, .ds-datebox, input[type=time], input[type=date]')]
    .filter((el) => vis(el) && !el.closest('.ds-seg-measure') && !(el.matches('input') && el.closest('.ds-field, .ds-grow') && el.closest('.ds-field, .ds-grow') !== el))
    .map((el) => ({ el, b: el.getBoundingClientRect() })).filter(({ b }) => b.height >= 30);
  out.found.level = false;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, c] = [boxes[i], boxes[j]];
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
      const gap = Math.max(a.b.left, c.b.left) - Math.min(a.b.right, c.b.right);
      if (gap < 0 || gap > 64) continue; // one above the other, or far apart
      const overlap = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
      if (overlap < Math.min(a.b.height, c.b.height) * 0.4) continue; // on different rows
      out.found.level = true;
      if (Math.abs(a.b.top - c.b.top) > 0.5) out.level.push(`${name(a.el)} and ${name(c.el)}: tops ${a.b.top.toFixed(1)} and ${c.b.top.toFixed(1)}`);
      else if (Math.abs(a.b.height - c.b.height) > 0.5) out.level.push(`${name(a.el)} and ${name(c.el)}: heights ${a.b.height.toFixed(1)} and ${c.b.height.toFixed(1)}`);
    }
  }

  // ---- One line of help at most under anything, and never two help lines in a row.
  out.help = [];
  const HELP = '.cc-note, .ds-hint, .ds-panel-note, .ds-switchrow-note, .cc-qadd-help, .ds-answer-note, .coaching-ask-note, .coaching-note';
  const helps = [...root.querySelectorAll(HELP)].filter(vis);
  out.found.help = helps.length > 0;
  for (const el of helps) {
    const n = lines(el);
    if (o.wide && n > 1) out.help.push(`${n} lines of help: “${words(el, 70)}”`);
    let after = el.nextElementSibling;
    while (after && !vis(after)) after = after.nextElementSibling;
    if (after && after.matches(HELP)) out.help.push(`two help lines in a row: “${words(el, 40)}” then “${words(after, 40)}”`);
  }
  // An explanation panel that is open ends with "Don’t show me this again".
  out.explain = [];
  const panel = [...document.querySelectorAll('.ds-explain-panel')].filter(vis).pop();
  out.found.explain = Boolean(panel);
  if (panel && o.app === '.cc-app') {
    const buttons = [...panel.querySelectorAll('.ds-dialog-body button, .ds-explain-action button')].filter(vis);
    const last = buttons[buttons.length - 1];
    if (!last || words(last) !== 'Don’t show me this again') out.explain.push(`the panel ends with “${last ? words(last) : 'no button'}”`);
    const action = panel.querySelector('.ds-explain-action');
    if (action && action.nextElementSibling && vis(action.nextElementSibling)) out.explain.push('something follows “Don’t show me this again”');
  }

  // ---- Alerts are one short line: the over-full line is one sentence with its link inside, and no button.
  out.over = [];
  const overs = [...root.querySelectorAll('.cc-today-over')].filter(vis);
  out.found.over = overs.length > 0;
  for (const el of overs) {
    const said = el.textContent.replace(/\s+/g, ' ').trim();
    if (!/^Today is [^.]+ over\.$/.test(said)) out.over.push(`it reads “${said}”`);
    if ((said.match(/[.!?]/g) || []).length !== 1) out.over.push('it is more than one sentence');
    if (el.querySelector('.ds-btn, .ui-btn-primary, .ui-btn-ghost')) out.over.push('it holds a button');
    let after = el.nextElementSibling;
    while (after && !vis(after)) after = after.nextElementSibling;
    if (after && after.matches('.ds-btn') ) out.over.push('a button follows it');
    if (lines(el) > 1 && o.wide) out.over.push(`it runs to ${lines(el)} lines`);
    // On the page the words that say how far open the detail; inside a panel the line is plain.
    if (!top) {
      const link = el.querySelector('.cc-inline-link');
      if (!link) out.over.push('no link inside the sentence');
      else if (link.getAttribute('aria-haspopup') !== 'dialog') out.over.push('its link doesn’t say it opens a panel');
      else if (!/over$/.test(words(link))) out.over.push(`the link reads “${words(link)}”`);
    }
  }

  // ---- Money rates: "£750/hr", never "£750 an hour" or "£750 / hr", and a screen reader hears "per hour".
  out.money = [];
  const spaced = text.match(/[£$€][\d,.]+\s+(an|per|a)\s+(hour|month|hr)\b|[£$€][\d,.]+(\s+\/\s*|\s*\/\s+)(hr|hour|month)\b/g) || [];
  for (const m of spaced) out.money.push(`“${m}”`);
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
  const rates = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/\/(hr|month)\b/.test(n.nodeValue) && n.parentElement && vis(n.parentElement)) rates.push(n);
  out.found.money = rates.length > 0;
  for (const n of rates) {
    const unit = /\/hr/.test(n.nodeValue) ? 'per hour' : 'per month';
    let heard = false;
    for (let p = n.parentElement, up = 0; p && up < 4; p = p.parentElement, up += 1) {
      if ((p.getAttribute('aria-label') || '').includes(unit) || [...p.querySelectorAll('.ds-sr')].some((s) => s.textContent.includes(unit))) { heard = true; break; }
    }
    if (!heard) out.money.push(`“${n.nodeValue.trim().slice(0, 30)}” has no “${unit}” for a screen reader`);
  }

  // ---- Figures in a row sit on an equal grid (two by two on a phone).
  out.figures = [];
  const grids = new Set([...root.querySelectorAll('.cc-today-figures, .ds-stats')].filter(vis));
  for (const s of root.querySelectorAll('.ds-stat')) { const p = s.parentElement?.closest('.cc-today-figures, .ds-stats') || s.parentElement; if (p && vis(p) && [...p.children].filter((k) => vis(k)).length > 1) grids.add(p); }
  out.found.figures = grids.size > 0;
  for (const g of grids) {
    const kids = [...g.children].filter(vis).map((k) => k.getBoundingClientRect());
    if (kids.length < 2) continue;
    const widths = kids.map((b) => b.width);
    if (Math.max(...widths) - Math.min(...widths) > 0.5) out.figures.push(`${name(g)}: columns ${widths.map((w) => w.toFixed(1)).join(', ')} wide`);
    const rows = [];
    for (const b of kids) { const r = rows.find((x) => Math.abs(x.top - b.top) <= 0.5); if (r) r.items.push(b); else rows.push({ top: b.top, items: [b] }); }
    const perRow = rows.map((r) => r.items.length);
    if (o.phone && Math.max(...perRow) > 2) out.figures.push(`${name(g)}: ${Math.max(...perRow)} figures in one row on a phone`);
    if (rows.length > 1 && new Set(perRow.slice(0, -1)).size > 1) out.figures.push(`${name(g)}: rows of ${perRow.join(', ')}`);
    // A row whose figures don't share a top: one has dropped under a wrapped label.
    const lefts = [...new Set(kids.map((b) => Math.round(b.left)))];
    if (rows.length > Math.ceil(kids.length / Math.max(1, lefts.length))) out.figures.push(`${name(g)}: figures in one row don’t share a top`);
  }

  // ---- Important: the soft coral tick box (a 2px edge), sorted first, and "important" in its name.
  out.important = [];
  const marked = [...root.querySelectorAll('.ds-todo--important')].filter(vis);
  out.found.important = marked.length > 0;
  for (const row of marked) {
    const box = row.querySelector('.ds-check-box');
    if (!box) { out.important.push(`“${words(row)}” has no tick box`); continue; }
    if (box.getAttribute('aria-checked') === 'true') continue; // a ticked box fills mint
    const edges = [box, ...box.children].flatMap((el) => [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')]);
    const ok = edges.some((st) => (st.borderTopColor === o.softCoral && Math.abs(parseFloat(st.borderTopWidth) - 2) < 0.26 && st.borderTopStyle !== 'none')
      || (st.boxShadow && st.boxShadow.includes(o.softCoral) && /\b2px\b/.test(st.boxShadow)));
    if (!ok) { const st = edges.find((e) => parseFloat(e.borderTopWidth) > 0) || edges[0]; out.important.push(`“${words(row)}”: the box’s edge is ${st.borderTopWidth} ${st.borderTopColor}${st.boxShadow && st.boxShadow !== 'none' ? `, shadow ${st.boxShadow}` : ''}, not 2px ${o.softCoral}`); }
    if (!/important/i.test(box.getAttribute('aria-label') || '')) out.important.push(`“${words(row)}”: the tick box’s name doesn’t say it is important (“${box.getAttribute('aria-label') || ''}”)`);
    if (!/, important/.test(row.querySelector('.ds-todo-text')?.textContent || '')) out.important.push(`“${words(row)}”: its words don’t say it is important to a screen reader`);
  }
  for (const list of root.querySelectorAll('[role=list]')) {
    const rows = [...list.querySelectorAll('.ds-todo')].filter((r) => vis(r) && r.closest('[role=list]') === list && !r.matches('.ds-todo--done'));
    // A list that runs over several days is in day order: Important comes first within each day.
    const dayOf = (r) => (list.getAttribute('aria-label') === 'Upcoming to-dos' ? r.querySelector('.ds-todo-tag')?.textContent || '' : '');
    const bad = rows.some((r, i) => r.matches('.ds-todo--important') && rows.slice(0, i).some((e) => !e.matches('.ds-todo--important') && dayOf(e) === dayOf(r)));
    const flags = rows.map((r) => r.matches('.ds-todo--important'));
    if (bad && flags.indexOf(false) >= 0) out.important.push(`in “${list.getAttribute('aria-label') || 'a list'}” an Important to-do sits under one that isn’t`);
  }

  // ---- Capacity over: "17 of 15" with "2 over", a full bar in soft coral, never mint, and no warning words.
  out.capacity = [];
  const caps = [...root.querySelectorAll('.cc-today-cap--over')].filter(vis);
  out.found.capacity = caps.length > 0;
  for (const cap of caps) {
    const said = cap.innerText.replace(/\s+/g, ' ');
    const m = /(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)/.exec(said);
    if (!m || !(Number(m[1]) > Number(m[2]))) out.capacity.push(`it reads “${said.slice(0, 60)}”`);
    else if (!said.includes(`${Number((Number(m[1]) - Number(m[2])).toFixed(2))} over`)) out.capacity.push(`“${m[0]}” without how far over (“${said.slice(0, 60)}”)`);
    const track = cap.querySelector('.ds-bar');
    const bar = track?.querySelector('span');
    if (!track || !bar || !vis(track)) { out.capacity.push('no bar'); continue; }
    const [tb, bb] = [track.getBoundingClientRect(), bar.getBoundingClientRect()];
    if (Math.abs(tb.width - bb.width) > 0.5) out.capacity.push(`the bar is ${bb.width.toFixed(1)}px of a ${tb.width.toFixed(1)}px track`);
    const fill = getComputedStyle(bar).backgroundColor;
    if (o.mint.includes(fill)) out.capacity.push('the bar is mint');
    if (fill !== o.softCoral) out.capacity.push(`the bar is ${fill}, not soft coral ${o.softCoral}`);
    const group = cap.closest('[role=group]') || cap;
    if (/warning|too (much|many)|overload|exceed|careful|danger|alert|!/i.test(group.innerText) || group.querySelector('[role=alert]')) out.capacity.push(`warning words: “${group.innerText.replace(/\s+/g, ' ').slice(0, 80)}”`);
  }

  // ---- No key hints anywhere.
  out.keys = [...new Set([...(text.match(/[⌘⌥⇧⌃↵⏎]|\b(Cmd|Ctrl|Esc)\b/g) || []), ...[...document.querySelectorAll('kbd')].filter(vis).map((k) => `<kbd> ${k.textContent}`)])];

  // ---- Charts: where both axes start at 0 the 0 is written once.
  out.zero = [];
  const charts = [...root.querySelectorAll('.ds-tipzone, svg[role=img], [class*=chart]')].filter((c) => vis(c) && !c.parentElement.closest('.ds-tipzone, svg[role=img], [class*=chart]'));
  for (const c of charts) {
    const zeros = [...c.querySelectorAll('text, span, small, b, i')].filter((el) => vis(el) && el.children.length === 0 && /^0%?$/.test(el.textContent.trim()));
    if (zeros.length > 1) out.zero.push(`${name(c)} writes 0 ${zeros.length} times`);
  }
  out.found.chart = [...root.querySelectorAll('[data-tip]')].filter(vis).length > 0;

  // ---- A phone: nothing under the phone bar, and never more than one coral button in view.
  out.phone = [];
  out.found.panel = Boolean(top);
  out.found.bulk = [...document.querySelectorAll('.cc-todo-bulk')].filter(vis).length > 0;
  const coral = [...root.querySelectorAll('.ds-btn--primary, .ui-btn-primary')].filter((b) => { if (!vis(b)) return false; const r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth; });
  out.coral = coral.map((b) => words(b));
  if (o.phone) {
    if (coral.length > 1) out.phone.push(`${coral.length} coral buttons in view: ${coral.map((b) => `“${words(b)}”`).join(', ')}`);
    const bar = [...document.querySelectorAll('.cc-phonebar, .ds-phonebar, .phone-bar')].filter(vis)[0];
    if (bar && !top) {
      const barBox = bar.getBoundingClientRect();
      // Parts fixed to the screen never sit on the bar.
      for (const el of document.querySelectorAll('.cc-bulk, .cc-ses-bar, .ds-bottombar, .ds-toast')) {
        if (!vis(el)) continue;
        const b = el.getBoundingClientRect();
        if (b.bottom > barBox.top + 0.5 && b.top < barBox.bottom - 0.5) out.phone.push(`${name(el)} sits on the phone bar (${b.bottom.toFixed(0)} against ${barBox.top.toFixed(0)})`);
      }
      // Scrolled to its end, the page's last line clears the bar.
      const was = window.scrollY;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      const col = app.querySelector('.cc-page, main') || app;
      let last = null;
      for (const el of col.querySelectorAll('button, a, input, textarea, p, h1, h2, h3, li, small, [role=listitem], .ds-stat')) {
        if (!vis(el) || el.closest('.cc-phonebar, .ds-phonebar, .cc-header, .cc-bulk, .cc-ses-bar, .ds-bottombar, .ds-sr') || getComputedStyle(el).position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        // What scrolls inside its own box (Network's table, run 4) is seen only as far as that box reaches: the box must clear the bar.
        let bottom = r.bottom;
        for (let p = el.parentElement; p && p !== col; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)) bottom = Math.min(bottom, p.getBoundingClientRect().bottom);
        const b = { bottom };
        if (!last || b.bottom > last.b.bottom) last = { el, b };
      }
      const barNow = bar.getBoundingClientRect();
      if (last && last.b.bottom > barNow.top + 0.5) out.phone.push(`the page’s last line (${name(last.el)}) ends ${Math.round(last.b.bottom - barNow.top)}px under the phone bar`);
      window.scrollTo({ top: was, behavior: 'instant' });
    }
  }

  // ---- The coach header stays at the top as the page scrolls; the body rule behind it (overflow-x: clip)
  // is the coach pages' alone, so the client portal and the sign-in pages keep theirs.
  out.header = [];
  const header = document.querySelector('.cc-header');
  const bodyClips = getComputedStyle(document.body).overflowX === 'clip';
  if (o.app === '.cc-app') {
    if (!bodyClips) out.header.push(`on a coach page the body’s sideways overflow is ${getComputedStyle(document.body).overflowX}, not clip`);
    if (header && vis(header) && !top) {
      const was = window.scrollY;
      window.scrollTo({ top: was + 300, behavior: 'instant' });
      if (window.scrollY > 0 && Math.abs(header.getBoundingClientRect().top) > 0.5) out.header.push(`scrolled ${Math.round(window.scrollY)}px, the header is at ${header.getBoundingClientRect().top.toFixed(0)}`);
      window.scrollTo({ top: was, behavior: 'instant' });
    }
  } else if (bodyClips || document.querySelector('.cc-app')) out.header.push('the coach pages’ rule for the body reaches this page');

  // ---- The older phone rule (mobile.css pads every plain button and sets its size up to 768px) changes
  // nothing here: with the rule taken away for a moment, every button is the size and shape it was.
  out.oldPhone = [];
  if (window.innerWidth <= 768) {
    const old = [];
    for (const sheet of document.styleSheets) {
      let list = [];
      try { list = [...sheet.cssRules]; } catch { continue; }
      for (const media of list) {
        if (!(media instanceof CSSMediaRule)) continue;
        for (const r of media.cssRules) if (r.selectorText === 'button:not(.breathe-button)') old.push(r);
      }
    }
    out.found.oldPhone = old.length > 0;
    const buttons = [...root.querySelectorAll('button')].filter(vis);
    // What shows: where the button and everything inside it are drawn, and the size of its words.
    const read = () => buttons.map((b) => {
      const inside = [b, ...b.querySelectorAll('*')];
      return {
        // Measured from the button's own corner, so one button that grows doesn't count against those under it.
        boxes: inside.map((el, n) => { const r = el.getBoundingClientRect(); const o0 = b.getBoundingClientRect(); return n === 0 ? [0, 0, r.width, r.height] : [r.left - o0.left, r.top - o0.top, r.width, r.height]; }),
        sizes: inside.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())).map((el) => getComputedStyle(el).fontSize).join(' '),
      };
    });
    const withRule = read();
    const kept = old.map((r) => ['font-size', 'padding', 'min-height'].map((k) => [k, r.style.getPropertyValue(k), r.style.getPropertyPriority(k)]));
    old.forEach((r) => ['font-size', 'padding', 'min-height'].forEach((k) => r.style.removeProperty(k)));
    const without = read();
    old.forEach((r, i) => kept[i].forEach(([k, v, pri]) => { if (v) r.style.setProperty(k, v, pri); }));
    buttons.forEach((b, i) => {
      const [a, c] = [withRule[i], without[i]];
      const what = [];
      if (a.sizes !== c.sizes) what.push(`its words are ${a.sizes.split(' ')[0]} where its own style says ${c.sizes.split(' ')[0]}`);
      const moved = a.boxes.map((box, n) => Math.max(...box.map((v, k) => Math.abs(v - c.boxes[n][k])))).reduce((m, v) => Math.max(m, v), 0);
      if (moved > 0.5) what.push(`it, or what is inside it, is drawn ${moved.toFixed(0)}px off where its own style puts it (${a.boxes[0][2].toFixed(0)} by ${a.boxes[0][3].toFixed(0)} against ${c.boxes[0][2].toFixed(0)} by ${c.boxes[0][3].toFixed(0)})`);
      if (what.length) out.oldPhone.push(`${name(b)}: ${what.join(', ')}`);
    });
  }
  return out;
}

/**
 * Runs in the page at twice the text size: what scrolls sideways, what runs
 * off the side and what is cut off inside its own box.
 */
export function readTwice(appSelector) {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const root = top || document.querySelector(appSelector) || document.body;
  const wide = document.documentElement.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && !el.closest('[hidden], [inert], [aria-hidden=true], .ds-sr, .ds-seg-measure'); };
  /** Inside something that scrolls sideways on its own (underlined tabs, the board, a table). */
  const inStrip = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (/auto|scroll/.test(getComputedStyle(p).overflowX) && p.scrollWidth - p.clientWidth > 1) return true; } return false; };
  const off = [];
  for (const el of root.querySelectorAll('h1, h2, h3, p, button, a, textarea, input, small, th, td, label, li, dt, dd, .ds-chip, .ds-seg-btn, .ds-stat-value, .ds-todo-text, .ds-todo-tag, .cc-setrow-label, .cc-setrow-value')) {
    if (!vis(el) || inStrip(el)) continue;
    const r = el.getBoundingClientRect();
    const name = `${String(el.className || el.tagName).split(' ')[0]} “${(el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 36)}”`;
    if (el.matches('.ds-btn')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect();
      if (w.width > 0 && (w.left < r.left - 0.5 || w.right > r.right + 0.5 || w.top < r.top - 0.5 || w.bottom > r.bottom + 0.5)) off.push(`${name}: its words run outside the button`);
    }
    if (getComputedStyle(el).position !== 'fixed' && (r.left < -0.5 || r.right > wide + 0.5)) off.push(`${name} runs from ${r.left.toFixed(0)} to ${r.right.toFixed(0)} of ${wide}`);
    const cs = getComputedStyle(el);
    if (el.matches('textarea, input')) continue;
    if (el.scrollWidth - el.clientWidth > 1 && /hidden|clip/.test(cs.overflowX)) off.push(`${name} is cut off by ${el.scrollWidth - el.clientWidth}px`);
    if (el.scrollHeight - el.clientHeight > 1 && /hidden|clip/.test(cs.overflowY) && el.clientHeight > 0) off.push(`${name} is cut off below by ${el.scrollHeight - el.clientHeight}px`);
  }
  const inner = [...document.querySelectorAll('.ds-dialog-body')].filter(vis).map((b) => b.scrollWidth - b.clientWidth);
  return { size: getComputedStyle(document.documentElement).fontSize, sideways: Math.max(document.documentElement.scrollWidth - window.innerWidth, 0, ...inner), off: [...new Set(off)] };
}

const settle = (page, ms = 300) => page.waitForTimeout(ms);

/**
 * Chart pop-ups: one with more than one fact is a title, then label and
 * value rows; on a phone a pop-up is one line and stays inside the screen.
 * Opens up to `most` marks of the top layer, one at a time.
 */
export async function chartPopups(page, { phone, most = 5 }) {
  const problems = [];
  const marks = await page.evaluate(() => {
    const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
    return [...(top || document).querySelectorAll('[data-tip]')].map((el, i) => { el.setAttribute('data-ui-mark', String(i)); const b = el.getBoundingClientRect(); return { i, shown: b.width > 0 && b.height > 0 }; }).filter((m) => m.shown).map((m) => m.i);
  });
  let read = 0;
  for (const i of marks.slice(0, most)) {
    const mark = page.locator(`[data-ui-mark="${i}"]`);
    await mark.scrollIntoViewIfNeeded().catch(() => {});
    // A mark that opens something when tapped (a Network dot opens its person): its pop-up is read from keyboard focus on a phone.
    const opens = await mark.getAttribute('data-opens');
    if (phone && opens) await mark.focus(); else if (phone) await mark.tap({ force: true }).catch(() => mark.click({ force: true })); else await mark.hover({ force: true });
    await settle(page, 250);
    const tip = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('.ds-tip')].filter((t) => !t.hidden && t.getBoundingClientRect().width > 0).pop();
      const mark = document.querySelector(`[data-ui-mark="${n}"]`);
      let facts = null;
      try { facts = JSON.parse(mark.getAttribute('data-tip')); } catch { /* not ours */ }
      if (!el) return { none: true, facts };
      const range = document.createRange();
      range.selectNodeContents(el);
      const tall = parseFloat(getComputedStyle(el).fontSize) || 14;
      const mids = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => (r.top + r.bottom) / 2).sort((a, b) => a - b);
      let lines = 0; let last = -Infinity;
      for (const m of mids) { if (m - last > tall * 0.7) { lines += 1; last = m; } }
      const b = el.getBoundingClientRect();
      const kids = [...el.children].filter((k) => k.getBoundingClientRect().width > 0);
      return {
        facts, lines, left: b.left, right: b.right, top: b.top, bottom: b.bottom, wide: window.innerWidth, high: window.innerHeight,
        words: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
        title: Boolean(kids[0] && kids[0].matches('.ds-tip-title, .ds-tip-kind, .ds-tip-when, h3, h4')),
        rows: el.querySelectorAll('.ds-tip-row, dl > div, tr').length,
      };
    }, i);
    if (tip.none) { problems.push(`mark ${i + 1} opened no pop-up`); continue; }
    read += 1;
    const many = (tip.facts?.extra?.length || 0) + (tip.facts?.value ? 1 : 0) > 1;
    if (phone) {
      if (tip.lines > 1) problems.push(`“${tip.words}” is ${tip.lines} lines on a phone`);
      if (tip.left < 0 || tip.right > tip.wide || tip.top < 0 || tip.bottom > tip.high) problems.push(`“${tip.words}” runs off the screen (${Math.round(tip.left)} to ${Math.round(tip.right)} of ${tip.wide})`);
    } else if (many && !(tip.title && tip.rows >= 2)) problems.push(`“${tip.words}” holds ${1 + tip.facts.extra.length} facts and isn’t a title with label and value rows`);
    await page.keyboard.press('Escape');
    if (!phone) await page.mouse.move(2, 2);
    await settle(page, 150);
  }
  return { read, problems };
}

/** Every table's heading row stays at the top: the page is scrolled, then the table's own box if it scrolls. */
export async function tableHeadings(page) {
  const read = () => page.evaluate(() => {
    const th = [...document.querySelectorAll('.cc-table thead th')].map((x) => x.getBoundingClientRect());
    if (!th.length) return null;
    const header = document.querySelector('.cc-header').getBoundingClientRect();
    const rows = [...document.querySelectorAll('.cc-table tbody tr')].map((r) => r.getBoundingClientRect());
    const cs = getComputedStyle(document.querySelector('.cc-table thead th'));
    return { top: Math.round(th[0].top), bottom: Math.round(th[0].bottom), tops: new Set(th.map((b) => Math.round(b.top))).size, header: Math.round(header.bottom), headerTop: Math.round(header.top), firstRow: Math.round(rows[0].top), lastRow: Math.round(rows[rows.length - 1].bottom), fill: cs.backgroundColor, scrolled: Math.round(window.scrollY), max: document.documentElement.scrollHeight - window.innerHeight };
  });
  const problems = [];
  const a = await read();
  if (!a) return ['no table on the screen'];
  if (!(a.scrolled > 100)) problems.push(`the page only scrolled ${a.scrolled}px`);
  if (a.headerTop !== 0) problems.push(`the coach header left the top (${a.headerTop})`);
  if (a.top !== a.header || a.tops !== 1) problems.push(`scrolled ${a.scrolled}px, the heading row is at ${a.top}, the header ends at ${a.header}`);
  if (!(a.firstRow < a.bottom)) problems.push('no row has passed behind the heading row');
  if (/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(a.fill)) problems.push('rows show through the heading row');
  // Further down, while the table is still on the screen.
  await page.evaluate(() => window.scrollTo(0, Math.min(document.documentElement.scrollHeight, window.scrollY + 120)));
  await settle(page, 200);
  const b = await read();
  if (b.lastRow > b.header + 60 && (b.top !== b.header || b.tops !== 1)) problems.push(`scrolled ${b.scrolled}px, the heading row is at ${b.top}, the header ends at ${b.header}`);
  // The table's own box, where it scrolls up and down by itself.
  const own = await page.evaluate(() => {
    for (let p = document.querySelector('.cc-table')?.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight - p.clientHeight > 20) { const before = document.querySelector('.cc-table thead th').getBoundingClientRect().top; p.scrollTop = 80; return { before, after: document.querySelector('.cc-table thead th').getBoundingClientRect().top }; }
    }
    return null;
  });
  if (own && Math.abs(own.before - own.after) > 0.5) problems.push(`scrolling the table itself moves its heading row (${own.before.toFixed(0)} to ${own.after.toFixed(0)})`);
  return problems;
}

/**
 * Help that can be hidden: the explanation panel ends with "Don’t show me
 * this again"; hiding removes its link, Undo brings it back; hidden again,
 * Settings, Look counts it and "Show it again" restores it. Starts and ends
 * on To-dos with nothing hidden.
 */
export async function hiddenHelp(page, { app, phone }) {
  const results = [];
  const say = (what, ok, detail = '') => results.push([what, Boolean(ok), detail]);
  const toTodos = async () => { await page.goto(`${app}/coach/todos`); await page.waitForSelector('.cc-app'); await settle(page, 1100); if (phone) { await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600); } };
  const link = () => page.locator('.ds-explain-link:visible');
  const toast = async () => (await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '')) || '';
  const hide = async () => { await link().first().click(); await settle(page, 600); await page.locator('.ds-explain-panel').getByRole('button', { name: 'Don’t show me this again' }).click(); await settle(page, 700); };
  await toTodos();
  say('the quick add has its quiet help link', (await link().count()) === 1, `${await link().count()} links`);
  await link().first().click(); await settle(page, 600);
  const ends = await page.evaluate(() => { const p = [...document.querySelectorAll('.ds-explain-panel')].pop(); const b = p ? [...p.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0) : []; return b.length ? b[b.length - 1].textContent.trim() : ''; });
  say('its explanation panel ends with “Don’t show me this again”', ends === 'Don’t show me this again', ends);
  await page.locator('.ds-explain-panel').getByRole('button', { name: 'Don’t show me this again' }).click(); await settle(page, 700);
  say('hiding it says so, with Undo', (await toast()) === 'Hidden. Settings, Look shows it again.' && (await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).count()) === 1, await toast());
  say('hiding it removes its link and closes the explanation', (await link().count()) === 0 && (await page.locator('.ds-explain-panel:visible').count()) === 0, `${await link().count()} links`);
  await page.locator('.ds-toast').getByRole('button', { name: 'Undo' }).click(); await settle(page, 700);
  say('Undo brings the link back', (await link().count()) === 1, `${await link().count()} links`);
  await hide();
  await page.goto(`${app}/coach/settings/look`); await page.waitForSelector('.cc-app'); await settle(page, 1100);
  const row = page.locator('.cc-line', { hasText: 'Hidden help' });
  say('Settings, Look counts what is hidden', /1 explanation is hidden\./.test(await row.innerText().catch(() => '')), (await row.innerText().catch(() => 'no row')).replace(/\s+/g, ' '));
  await row.getByRole('button', { name: 'Show it again' }).click().catch(() => {}); await settle(page, 700);
  say('“Show it again” says so, with Undo, and the row reads “Nothing is hidden.”', (await toast()) === 'Help shows again' && /Nothing is hidden\./.test(await row.innerText().catch(() => '')) && (await row.getByRole('button', { name: 'Show it again' }).count()) === 0, `${await toast()} | ${(await row.innerText().catch(() => '')).replace(/\s+/g, ' ')}`);
  await toTodos();
  say('and the link is back on To-dos', (await link().count()) === 1, `${await link().count()} links`);
  return results;
}
