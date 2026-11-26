// Phase 6a run 2 (the coaching day) against M11 seq 77: how each screen is
// read on both sides and held together. The list of screens, with every
// meant difference and its reason, is in compare-m11-run2-screens.mjs; this
// file is only the reading and the comparing. Run through compare-m11.mjs.
//
// What is compared (words, not pixels): every line M11 shows must be on the
// built screen, or be listed as a meant difference with its reason; every
// line the built screen shows must be in M11, or be listed as an addition
// with its reason; the lines both show must come in the same order (so the
// sections do); and the buttons and links that only have a spoken name
// (an icon's aria-label) are held the same way.
//
// The built screens are screens.mjs's own (their pinned clocks and seeds
// reproduce M11's data), opened by its walk, which stands in every page
// before it loads and reports any write it had to stop. A few screens M11
// draws that screens.mjs doesn't open are added to its groups here.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GROUPS, walk } from './screens.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Where M11 seq 77 is: the path given, M11_RUN2, or the places it has been kept (the last is where it was when this was written, 20 Nov). */
export function m11File(given) {
  const places = [given, process.env.M11_RUN2, join(homedir(), 'Downloads/clarity-phase-6a/M11-coach-portal-seq77.html'), join(homedir(), 'Downloads/clarity-phase-6a/m11.html'), join(homedir(), 'Downloads/M11-coach-portal-seq77.html'),
    '/private/tmp/claude-501/-Users-timdutton-code-clarity-portal/a9b9cd21-1705-444d-a7ac-4d1ae62921b4/scratchpad/m11/m11.html'].filter(Boolean);
  return places.find((p) => existsSync(p)) || null;
}

// What a part of a screen says, read the same way on both sides: its lines, what its boxes hold or say
// when empty, and the spoken names of the buttons and links that have no words of their own.
const READ = (roots) => {
  const clean = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const HIDDEN = '.ds-sr, .srt'; // words only a screen reader hears: the built pages' class, and M11's
  const lines = []; const boxes = []; const names = [];
  for (const root of roots) {
    if (!root || !root.getClientRects().length) continue; // not drawn at all: its innerText would be its markup's text, styles included
    const unseen = [...root.querySelectorAll(HIDDEN)].map((e) => clean(e.textContent)).filter(Boolean);
    const mine = [];
    for (const l of String(root.innerText || '').split('\n')) {
      const t = clean(l); if (!t) continue;
      const at = unseen.indexOf(t);
      if (at >= 0) unseen.splice(at, 1); else mine.push(t);
    }
    lines.push(...mine);
    for (const e of root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea')) {
      if (!seen(e)) continue;
      // What a box says when empty, and what it holds; a box that only repeats its own label adds nothing.
      for (const t of [e.placeholder, e.value]) if (clean(t) && !mine.includes(clean(t))) boxes.push(clean(t));
    }
    for (const e of root.querySelectorAll('button, a, [role=button], [role=checkbox], [role=switch], [role=tab], [role=radio], [role=option], [role=menuitem], input[type=checkbox]')) {
      const label = clean(e.getAttribute('aria-label'));
      if (!label || !seen(e)) continue;
      let shown = clean(e.innerText);
      for (const h of e.querySelectorAll(HIDDEN)) shown = clean(shown.replace(clean(h.textContent), ''));
      // A control whose spoken name is more than its words, and isn't a line of the screen anyway.
      if (!shown.includes(label) && !mine.includes(label)) names.push(label);
    }
  }
  return { lines, boxes, names: [...new Set(names)] };
};

const run = (page, pick, arg) => page.evaluate(([read, picker, a]) => {
  // eslint-disable-next-line no-new-func
  const roots = new Function('arg', `return (${picker})(arg)`)(a);
  // eslint-disable-next-line no-new-func
  return new Function('roots', `return (${read})(roots)`)(roots);
}, [READ.toString(), pick.toString(), arg]);

// The parts of M11's frame, and of the built one.
const M11_PARTS = {
  page: () => [document.querySelector('#fr .pg'), document.querySelector('#fr .gft'), document.querySelector('#fr .bulk')], // the page, its bottom bar and the bar for several chosen
  sheet: () => [document.querySelector('#fr .sheet')],
  bar: () => [document.querySelector('#fr .ncb')],
  header: () => [document.querySelector('#fr .hdr')],
  menu: () => [document.querySelector('#fr .mnav')?.parentElement],
  sections: (titles) => [...document.querySelectorAll('#fr .pg section.sec, #fr .pg .fold, #fr .pg section')].filter((s) => {
    const h = s.querySelector('.sech, h2, h3, .fh'); const t = (h ? h.innerText : '').split('\n')[0].trim().toLowerCase();
    return titles.some((x) => t === x.toLowerCase());
  }).filter((s, i, all) => !all.some((o) => o !== s && o.contains(s))),
};
const BUILT_PARTS = {
  page: () => [document.querySelector('.cc-main') || document.querySelector('.ui-root.cc-book'), ...document.querySelectorAll('.ds-portal')], // the page (a booking page outside the portal has no frame), with any menu it has open (on a phone a menu is a panel from the foot)
  sheet: () => [...document.querySelectorAll('.ds-portal')], // the panel, and any menu it has open
  bar: () => [document.querySelector('.cc-callbar')],
  header: () => [document.querySelector('.cc-header')],
  // Polish 1's frame menu: the laptop's menu column, or the phone's menu panel (CLAUDE.md, Polish 1 "Frame and menu").
  menu: () => [[...document.querySelectorAll('.cc-menu, .ds-pmenu, .ds-frame-side .ds-menu')].find((m) => m.getBoundingClientRect().height > 0) || null],
  sections: (titles) => [...document.querySelectorAll('.cc-main section')].filter((s) => {
    const h = s.querySelector('h2'); const t = (h ? h.innerText : '').split('\n')[0].trim().toLowerCase();
    return titles.some((x) => t === x.toLowerCase());
  }).concat([...document.querySelectorAll('.ds-portal')]),
};

/** M11's dates moved by whole days, for a screen whose pinned clock is another day than M11's (never ahead of the real one: sign-in rule 46). */
export function shiftDates(text, days) {
  if (!days) return text;
  return text.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (all, _d, n, m) => {
    const d = new Date(2026, MONTHS.indexOf(m), Number(n) + days);
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  });
}

const norm = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
const hit = (pattern, line) => (pattern instanceof RegExp ? pattern.test(line) : norm(line).includes(norm(pattern)));
const applies = (entry, who, dev) => { const o = entry[3] || {}; return (!o.who || o.who === who) && (!o.on || o.on === dev); };

/** M11's lines without the ones between two of its lines (`cut`: { after, before, boxes: what the box itself holds }): an example M11 always shows typed, which the built box only shows once it is typed. */
function cutLines(lines, cut) {
  if (!cut) return lines;
  const from = lines.findIndex((l) => norm(l) === norm(cut.after));
  const to = lines.findIndex((l, i) => i > from && norm(l) === norm(cut.before));
  if (from < 0 || to < 0) return lines;
  return lines.filter((l, i) => !(i > from && i < to) && !(cut.boxes || []).some((x) => norm(l) === norm(x)));
}

/** What is left of each list once every line both hold has been taken out, once for each time both show it. */
function leftovers(a, b) {
  const left = b.map((l) => ({ l, n: norm(l), taken: false }));
  const leftA = [];
  for (const l of a) { const f = left.find((x) => !x.taken && x.n === norm(l)); if (f) f.taken = true; else leftA.push(l); }
  return [leftA, left.filter((x) => !x.taken).map((x) => x.l)];
}

// An addition or a move is listed as [words, why, , options]; inside it is held as a difference is: [words, nothing instead, why, options].
const SHAPED = new Map();
function shaped(e) {
  if (!SHAPED.has(e)) SHAPED.set(e, [e[0], null, e[1], e[3] || e[2] || undefined]);
  return SHAPED.get(e);
}

/** The longest run of lines both sides show in the same order; the lines of `a` left out of it have moved. */
function moved(a, b) {
  const n = a.length; const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = []; let i = 0; let j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { i += 1; j += 1; } else if (t[i + 1][j] >= t[i][j + 1]) { out.push(a[i]); i += 1; } else j += 1; }
  while (i < n) { out.push(a[i]); i += 1; }
  return out.filter((l) => b.includes(l));
}

/**
 * Compares run 2's screens. `rows` are the screens (see compare-m11-run2-screens.mjs), `extraGroups`
 * the built screens added to screens.mjs's own, `everywhere` the differences that hold on every screen.
 * SCREENS (a pattern on M11's screen id or the row's name), ROLES (owner,associate) and SIZES (1440,400)
 * narrow it; DUMP=<folder> writes what each side said, for whoever is writing the list.
 */
export async function compareRun2(report, table, { file, rows, extraGroups, everywhere, label = 'Run 2' }) {
  const only = process.env.SCREENS ? new RegExp(process.env.SCREENS) : null;
  const roles = (process.env.ROLES || 'owner,associate').split(',').filter((r) => r === 'owner' || r === 'associate');
  // A row with `as: 'signed-out'` (run 3's booking pages outside the portal) is opened with nobody signed in, and held against M11's owner screen.
  const outside = (r) => r.as === 'signed-out';
  const sizes = (process.env.SIZES || '1440,400').split(',').map(Number).filter((s) => s === 1440 || s === 400);
  const wanted = rows.filter((r) => !only || only.test(r.m11) || only.test(r.name));
  const dump = process.env.DUMP || null;
  if (dump) mkdirSync(dump, { recursive: true });

  // ---- the built side: screens.mjs's walk, narrowed to the screens these rows need
  for (const g of extraGroups) if (!GROUPS.some((x) => x.name === g.name)) GROUPS.push(g);
  const need = [...new Set(wanted.filter((r) => r.built).flatMap((r) => [r.built, ...Object.values(r.builtOn || {})]))];
  const kept = process.env.BUILT_KEPT || null; // for whoever is writing the list: the built screens' words kept in a file between runs (never for a real run)
  const built = kept && existsSync(kept) ? JSON.parse(readFileSync(kept, 'utf8')) : {};
  const was = { ONLY: process.env.ONLY, GROUPS: process.env.GROUPS, SIZES: process.env.SIZES, MODES: process.env.MODES, ROLES: process.env.ROLES };
  if (need.length && !(kept && existsSync(kept))) {
    process.env.ONLY = `^(${need.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
    delete process.env.GROUPS;
    process.env.SIZES = sizes.join(','); process.env.MODES = 'dark'; process.env.ROLES = [...roles, ...(wanted.some(outside) && roles.includes('owner') ? ['signed-out'] : [])].join(',');
    const problems = await walk(async (page, at) => {
      const got = {};
      for (const part of ['page', 'sheet', 'bar', 'header', 'menu']) got[part] = await run(page, BUILT_PARTS[part], null);
      for (const r of wanted.filter((x) => (x.built === at.name || Object.values(x.builtOn || {}).includes(at.name)) && x.sections)) got[`sections:${r.sections.join('|')}`] = await run(page, BUILT_PARTS.sections, r.builtSections || r.sections);
      built[`${at.name}|${at.role}|${at.size}`] = got;
    }, { groups: null });
    for (const [k, v] of Object.entries(was)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    report.pass(`${label}: every built screen opened, with no page error and no write leaving the page`, problems.length === 0, problems.slice(0, 8).join(' | '));
    if (kept) writeFileSync(kept, JSON.stringify(built));
  }

  // ---- M11's side
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const mock = await browser.newPage({ viewport: { width: 1600, height: 1300 } });
  const reads = new Map();
  const m11 = async (row, who, dev) => {
    const key = `${row.name}|${who}|${dev}`;
    if (reads.has(key)) return reads.get(key);
    // A fresh M11 for every read: what one screen left open (a tab, a fold, a panel) never shows on the next.
    await mock.goto(`file://${file}`);
    await mock.waitForSelector('#scr');
    await mock.waitForTimeout(300);
    await mock.click(`[data-r="${who === 'owner' ? 'owner' : 'maya'}"]`);
    await mock.click(`[data-w="${dev}"]`);
    await mock.selectOption('#scr', row.m11);
    await mock.waitForTimeout(250);
    for (const a of row.clicks || []) {
      const el = mock.locator(`#fr [data-a="${a}"]`).first();
      if (!(await el.count())) throw new Error(`M11 has no [data-a="${a}"] on ${row.m11}`);
      await el.click({ force: true }); await mock.waitForTimeout(250);
    }
    const got = await run(mock, M11_PARTS[row.sections ? 'sections' : row.part || 'page'], row.sections || null);
    reads.set(key, got);
    return got;
  };

  const verdicts = {};
  const used = new Map();
  const listed = new Map(); // every difference a row lists, to find the ones nothing met
  const everywhereMet = new Set();
  for (const row of wanted) {
    const v = { row, changes: new Map(), faults: [], opened: 0 };
    verdicts[row.name] = v;
    if (!row.built) { // not built: M11 draws it, and the built page must not half-show it
      table.push(`| ${row.m11}: ${row.name} | Not built | ${row.why} |`);
      report.pass(`${row.name}: M11 draws it (${row.m11})`, Boolean(await m11(row, 'owner', 'd').catch(() => null)), 'M11 has no such screen');
      continue;
    }
    const lists = [...(row.changes || []).map((e) => ['change', e]), ...(row.added || []).map((e) => ['added', shaped(e)]), ...(row.moved || []).map((e) => ['moved', shaped(e)]),
      ...everywhere.changes.map((e) => ['change', e, true]), ...everywhere.added.map((e) => ['added', shaped(e), true]), ...(everywhere.moved || []).map((e) => ['moved', shaped(e), true])];
    for (const who of roles) {
      if (row.who && row.who !== who) continue;
      for (const size of sizes) {
        const dev = size === 400 ? 'p' : 'd';
        if (row.on && row.on !== dev) continue;
        const where = `${row.name} (${who}, ${dev === 'p' ? 'phone' : 'desktop'})`;
        const part = row.sections ? `sections:${row.sections.join('|')}` : row.part || 'page';
        const builtName = row.builtOn?.[dev] || row.built; // `builtOn`: another built screen for a phone, or for a laptop
        const b = built[`${builtName}|${outside(row) ? 'signed-out' : who}|${size}`]?.[part];
        if (!b) { if (!(row.skips || []).includes(`${who}-${dev}`)) report.pass(`${where}: the built screen opened`, false, `no screen called ${builtName} was read`); continue; }
        let m;
        try { m = await m11(row, who, dev); } catch (e) { report.pass(`${where}: M11’s screen opened`, false, String(e).split('\n')[0]); continue; }
        // The other role's M11 screen too: the test's associate keeps the same seed as the owner, so its rows are the owner's.
        const other = await m11(row, who === 'owner' ? 'associate' : 'owner', dev).catch(() => ({ lines: [], boxes: [], names: [] }));
        v.opened += 1;
        const fix = (t) => shiftDates(t, row.shiftDays || 0);
        // `from`: only the lines from that one on (a part of a page that isn't a section of its own).
        const tail = (list) => (row.from ? list.slice(Math.max(0, list.findIndex((l) => norm(l) === norm(row.from)))) : list);
        const mLines = cutLines(row.from ? tail(m.lines.map(fix)) : [...m.lines, ...m.boxes].map(fix), row.cut); const bLines = row.from ? tail(b.lines) : [...b.lines, ...b.boxes];
        const bNames = norm(b.names.join(' ¦ ')); const mNames = norm([...m.names, ...other.names].map(fix).join(' ¦ '));
        if (dump) writeFileSync(join(dump, `${row.name.replace(/[^a-z0-9]+/gi, '-')}.${who}.${dev}.txt`), `M11 (${row.m11} ${(row.clicks || []).join(';')})\n${mLines.join('\n')}\n-- names\n${m.names.join('\n')}\n\nBUILT (${builtName})\n${bLines.join('\n')}\n-- names\n${b.names.join('\n')}\n`);
        const explain = (kind, line) => {
          const found = lists.find(([k, e]) => k === kind && applies(e, who, dev) && hit(e[0], line));
          if (found) { used.set(found[1], (used.get(found[1]) || 0) + 1); v.changes.set(found[1], found[0]); }
          return found;
        };
        // Line for line: a line counts once for each time it is shown. What is left on each side is then
        // read as running words, so one line here that is two lines there still matches.
        const [leftM, leftB] = leftovers(mLines, bLines);
        const tight = (t) => norm(t).replace(/ /g, ''); // M11 sometimes sets two parts side by side with no space between (“17 of 152 over”)
        const runB = tight(leftB.join(' ')); const runM = tight(leftM.join(' '));
        const otherLines = new Set([...other.lines, ...other.boxes].map((l) => norm(fix(l)))); // the other role's M11 screen, line for line
        // 1. every line M11 shows is on the built screen, or is a listed difference
        const missing = [...new Set(leftM.filter((l) => !runB.includes(tight(l))))];
        const unexplained = []; const unsaid = [];
        for (const l of missing) {
          const e = explain('change', l);
          if (!e) { unexplained.push(l); continue; }
          const says = e[1][1];
          if (says && !norm(bLines.join(' ')).includes(norm(says))) unsaid.push(`for M11’s “${l}” the list says the built screen has “${says}”, and it doesn’t`);
        }
        // 2. every line the built screen shows is in M11, or is a listed addition (or what a listed difference says instead)
        const instead = lists.filter(([k, e]) => k === 'change' && e[1] && applies(e, who, dev)).map(([, e]) => norm(e[1]));
        const extra = [...new Set(leftB.filter((l) => !runM.includes(tight(l)) && !otherLines.has(norm(l))))].filter((l) => !instead.some((x) => x.includes(norm(l)) || norm(l).includes(x)));
        const unlisted = extra.filter((l) => !explain('added', l));
        // 3. the lines both show come in the same order
        const lower = (list) => list.map(norm);
        const out = [...new Set(moved(lower(cutLines(tail(m.lines.map(fix)), row.cut)), lower(tail(b.lines))))].filter((l) => l.length > 3 && !explain('moved', l));
        // 4. the buttons and links with only a spoken name
        const names = row.from ? [] : m.names.map(fix).filter((n) => !bNames.includes(norm(n)) && !explain('change', `name: ${n}`));
        const newNames = row.from ? [] : b.names.filter((n) => !mNames.includes(norm(n)) && !explain('added', `name: ${n}`));
        for (const l of unsaid) v.faults.push(`${where}: ${l}`);
        report.pass(`${where}: what each listed difference says the built screen has instead is there`, unsaid.length === 0, unsaid.join(' | '));
        for (const l of unexplained) v.faults.push(`${where}: M11 shows “${l}” and the built screen doesn’t`);
        for (const l of unlisted) v.faults.push(`${where}: the built screen shows “${l}” and M11 doesn’t`);
        for (const l of out) v.faults.push(`${where}: “${l}” is in another place than M11 has it`);
        for (const l of names) v.faults.push(`${where}: M11 has a control named “${l}” and the built screen doesn’t`);
        for (const l of newNames) v.faults.push(`${where}: the built screen has a control named “${l}” and M11 doesn’t`);
        report.pass(`${where}: every line M11 shows is built or is a listed difference (${mLines.length} read)`, unexplained.length === 0, unexplained.map((l) => `“${l}”`).join(' | '));
        report.pass(`${where}: every built line is M11’s or is a listed addition (${bLines.length} read)`, unlisted.length === 0, unlisted.map((l) => `“${l}”`).join(' | '));
        report.pass(`${where}: the lines both show are in M11’s order`, out.length === 0, out.map((l) => `“${l}”`).join(' | '));
        report.pass(`${where}: the controls named only for a screen reader are the same`, names.length + newNames.length === 0, [...names.map((l) => `M11 only: “${l}”`), ...newNames.map((l) => `built only: “${l}”`)].join(' | '));
      }
    }
    for (const [kind, e, global] of lists) if (!global) listed.set(e, [kind, row.name, row]);
    // The table: each meant difference once; the seed's own differences (M11's invented data the seed doesn't hold) are counted, not listed.
    const label = (e) => e[3]?.say || (e[0] instanceof RegExp ? e[0].source : e[0]);
    for (const [e] of v.changes) if (e[3]?.quiet) everywhereMet.add(e);
    const meant = [...v.changes].filter(([e]) => !e[3]?.data && !e[3]?.quiet);
    const seed = [...v.changes].filter(([e]) => e[3]?.data && !e[3]?.quiet);
    const said = meant.map(([e, kind]) => (kind === 'added' ? `adds “${label(e)}”: ${e[2]}` : kind === 'moved' ? `“${label(e)}” moves: ${e[2]}` : `“${label(e)}”${e[1] ? ` is “${e[1]}”` : ' is left out'}: ${e[2]}`));
    if (seed.length) said.push(`(the test’s data differs from M11’s invented data in ${seed.length} ${seed.length === 1 ? 'way' : 'ways'}: ${[...new Set(seed.map(([e]) => e[2]))].join('; ')})`);
    const verdict = !v.opened ? 'Not read in this run' : v.faults.length ? `FAULT (${v.faults.length})` : meant.length ? 'Matches with a change' : 'Matches';
    v.verdict = verdict;
    const scope = [row.who === 'owner' ? 'owner only: M11’s Maya has no such state' : '', row.on === 'd' ? 'laptop only' : row.on === 'p' ? 'phone only' : ''].filter(Boolean).join(', ');
    table.push(`| ${row.m11}${(row.clicks || []).length ? ` → ${[...new Set(row.clicks)].join(', ')}` : ''}: ${row.name}${scope ? ` (${scope})` : ''} | ${verdict} | ${said.join('; ')} |`);
  }
  await browser.close();
  // A listed difference nothing met is out of date: it is no longer a difference, or M11 never showed it.
  // (Only when every screen was read as the owner, whose screens are M11's own data; one meant for a role or a size this run didn't read is left alone.)
  if (!only && roles.includes('owner')) {
    for (const [e, [kind, name, row]] of listed) {
      const o = { who: row.who, on: row.on, ...(e[3] || {}) };
      const read = (!o.who || roles.includes(o.who)) && (!o.on || sizes.includes(o.on === 'p' ? 400 : 1440));
      // `maybe`: a difference that holds on some reads only (Polish 1 changed what the screen shows around it), never required.
      if (read && !used.has(e) && !o.maybe) report.pass(`${name}: the listed ${kind === 'change' ? 'difference' : kind === 'added' ? 'addition' : 'move'} “${e[0] instanceof RegExp ? e[0].source : e[0]}” was met (${e[2]})`, false, 'no screen read shows it, so it isn’t a difference any more');
    }
  }
  if (everywhereMet.size) table.push(`| On many screens | Meant | ${[...everywhereMet].map((e) => `“${e[3]?.say || (e[0] instanceof RegExp ? e[0].source : e[0])}”${e[1] ? ` is “${e[1]}”` : ''}: ${e[2]}`).join('; ')} |`);
  const faults = Object.values(verdicts).flatMap((v) => v.faults);
  if (faults.length) console.log(`\nFaults: differences no rule explains (${faults.length})\n${faults.map((f) => `  - ${f}`).join('\n')}`);
  return verdicts;
}
