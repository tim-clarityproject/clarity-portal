// The page layout step (PDF rules 23 to 29). It works out every page break
// before anything is drawn, from the units made in parts.js. Colours play no
// part, so the light and dark versions always break in the same places; each
// paper size is laid out on its own.
//
// Rules it applies:
// - a run of units joined by `keep` goes on one page, or moves whole to the next;
// - a run taller than a whole page starts on a fresh page and breaks only where
//   `keep` allows, or inside a paragraph taller than a page, leaving at least
//   three lines on each side;
// - a table that carries on repeats "<title>, continued" and its column names;
// - a last page never holds just a line or two: the last run of the page before
//   moves over with it.

/**
 * @param {Object[]} units from flatten()
 * @param {{top: (i: number) => number, bottom: (i: number) => number}} geom content edges of page i
 * @returns {{items: {u: Object, y: number}[]}[]} the pages
 */
export function paginate(units, geom) {
  const pages = [];
  let page = null;
  let y = 0;
  const placedRows = new Map(); // table -> rows placed so far
  const fullPage = geom.bottom(1) - geom.top(1);

  const open = () => {
    page = { items: [] };
    pages.push(page);
    y = geom.top(pages.length - 1);
  };
  const room = () => geom.bottom(pages.length - 1) - y;
  const place = (u) => {
    if (page.items.length) y += u.gap;
    page.items.push({ u, y });
    y += u.h;
    if (u.table) placedRows.set(u.table, (placedRows.get(u.table) || 0) + 1);
  };
  const continuation = (u) => (u.table && placedRows.get(u.table) ? u.table.continued() : []);
  const height = (chain, atTop) => chain.reduce((s, u, k) => s + u.h + (k === 0 && atTop ? 0 : u.gap), 0);
  const newPage = (u) => {
    const cont = continuation(u);
    open();
    cont.forEach((c) => {
      page.items.push({ u: c, y, cont: true });
      y += c.h;
    });
  };

  open();
  const queue = units.slice();
  let i = 0;
  let guard = 0;
  while (i < queue.length) {
    guard += 1;
    if (guard > 20000) throw new Error('The page layout did not settle.');
    let j = i;
    while (j < queue.length - 1 && queue[j].keep) j += 1;
    const chain = queue.slice(i, j + 1);
    const fresh = page.items.every((it) => it.cont); // empty, or only a table's continued heading
    if (queue[i].breakBefore && !fresh) {
      newPage(queue[i]);
      continue;
    }
    if (height(chain, page.items.length === 0) <= room()) {
      chain.forEach(place);
      i = j + 1;
      continue;
    }
    const contH = height(continuation(queue[i]), true);
    if (!fresh && height(chain, true) + contH <= fullPage) {
      newPage(queue[i]); // the whole run moves to the next page
      continue;
    }
    // A run taller than a whole page: start it on a fresh page, then break
    // between units where allowed, or inside an over-long paragraph.
    if (!fresh && !page.long) {
      newPage(queue[i]);
      page.long = true;
      continue;
    }
    const u = queue[i];
    const gap = page.items.length ? u.gap : 0;
    if (u.h + gap <= room()) {
      place(u);
      i += 1;
      continue;
    }
    const parts = u.split ? u.split(room() - gap) : null;
    if (parts) {
      queue.splice(i, 1, ...parts);
      continue;
    }
    if (!fresh) {
      newPage(u);
      page.long = true;
      continue;
    }
    place(u); // taller than a page and cannot split: it runs on as it is
    i += 1;
  }
  return pages;
}

const linesOn = (page) => page.items.reduce((s, it) => s + (it.u.lines ?? 0), 0);

/**
 * paginate(), then the last-page rule: a last page holding only a line or two
 * takes the last run of the page before with it.
 */
export function layoutPages(units, geom) {
  let pages = paginate(units, geom);
  for (let tries = 0; tries < 4 && pages.length > 1; tries += 1) {
    const last = pages[pages.length - 1];
    if (linesOn(last) > 2) break;
    const prev = pages[pages.length - 2].items;
    let k = prev.length - 1;
    while (k > 0 && prev[k - 1].u.keep) k -= 1;
    const target = prev[k].u;
    if (k === 0 || !units.includes(target) || target.breakBefore) break;
    target.breakBefore = true;
    pages = paginate(units, geom);
  }
  return pages;
}
