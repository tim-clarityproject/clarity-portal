// Get unstuck against its mock-up, M9 (version 12), part by part: the
// mock-up file itself and the built page on the same screen, Desktop
// (1440) and Phone (390, M9's phone frame), dark and light. Positions and
// sizes to half a pixel, fonts, sizes, letter-spacing and colours, and
// every visible sentence word for word.
//
//   node tests/phase8/compare-m9.mjs [folder for screenshots]
//   ONLY=goal,sum WIDTHS=1440 MODES=dark   to run a part of it
//   WIDTHS=400   takes the built page's screenshots only (M9's phone is 390 wide)
//
// The built page runs on the TEST database as the invented test client
// (every other host, every server function and every email call is
// blocked); the guest pages get stand-in answers shaped as migration 035's
// (tests/phase8/shared.mjs). The one to-do the tool adds is deleted at the
// end, with anything the tool saved.
//
// How the two are lined up: M9 draws its screens inside a review frame
// (1180px on a laptop, a 390px phone with a 47px status bar), so each part
// is measured from the content's own corner (the left end and top of the
// % bar; the title on a guest page) and the bottom bar from the bottom of
// the screen. Differences that are meant are listed in ALLOWED with why;
// anything else fails.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP, M9, M9_FILE, addPanel, block, clientDb, fillTo, guestApi, guestStandIn, guestStart, onQuestion, pressNext, readEnv, signIn, sleep, typeRows, until, withCoach,
} from './shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-compare');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1440, 390];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];
const TOL = 0.5;

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`);
};
const note = (text) => results.push(`NOTE  ${text}`);

// ---------------------------------------------------------------- the parts
// [name, M9's selector, the built page's selector, which one (0 = first), what to compare]
// what: 'box' position and size; 'text' font, size, spacing and colour; 'edge' border colour and radius.
const BAR = [
  ['the tool’s name', '.gl b', '.ds-guide-name', 0, ['pos', 'text']],
  ['close', '.gbar .iconbtn .x', '.ds-guide-close .ds-cross', 0, ['box']],
  ['the % bar', '.qpct', '.ds-guide-pct-track', 0, ['box']],
];
const HEAD = [
  ['the stage name', '.qn', '.ds-guide-label', 0, ['pos', 'text']],
  ['the question', '#h1', '.ds-guide-question', 0, ['pos', 'text']],
  ['the line under it', '.nudge', '.ds-guide-nudge', 0, ['pos', 'text']],
];
const FOOT = [
  ['the coral button', '.gft .btn', '.ds-guide-next', 0, ['foot', 'text']],
  ['Skip', '.gft .text', '.ds-guide-foot .ds-guide-skip', 0, ['foot', 'text']],
];
const ROWS = [
  ['the first box', '.rw textarea', '.ds-rowlist .ds-text', 0, ['box', 'text', 'edge']],
  ['the second box', '.rw textarea', '.ds-rowlist .ds-text', 1, ['box']],
  ['the first remove crosshair', '.rw .x', '.ds-rowlist-remove .ds-cross', 0, ['box']],
  ['the add button', '.addrow .ghost', '.ds-rowlist-add', 0, ['box', 'text', 'edge']],
];
const SCREENS = {
  goal: [...BAR, ...HEAD, ...FOOT,
    ['See an example', '.qbody .text', '.ds-guide-example-link', 0, ['pos', 'text']],
    ['the goal box', '#goal', '.ds-guide-body .ds-text', 0, ['box', 'text', 'edge']]],
  cons: [...BAR, ...HEAD, ...FOOT, ...ROWS],
  opps: [...BAR, ...HEAD, ...FOOT, ...ROWS],
  opts: [...BAR, ...HEAD, ...FOOT, ...ROWS,
    ['the timer’s ring', '.ring', '.ds-timer-ring', 0, ['box']],
    ['the ring as drawn', '.ring svg', '.ds-timer-ring svg', 0, ['box']],
    ['the time', '.ring span', '.ds-timer-time', 0, ['text']],
    ['the timer’s button', '.tbs .ghost', '.ds-timer .ds-btn', 0, ['box', 'text', 'edge']]],
  will: [...BAR, ...HEAD, ...FOOT,
    ['the first answer', '.opt', '.ds-answer', 0, ['box', 'text', 'edge']],
    ['the second answer', '.opt', '.ds-answer', 1, ['box']],
    ['the last answer', '.opt', '.ds-answer', 4, ['box', 'edge']]],
  steps: [...BAR, ...HEAD, ...FOOT,
    ['the first next step', '.ns textarea', '.ds-nextstep .ds-text', 0, ['box', 'text']],
    ['where it is', '.nsm span', '.ds-nextstep-meta > span', 0, ['pos', 'text']],
    ['its link', '.nsm .text', '.ds-nextstep-meta .ds-link', 0, ['text']],
    ['the second next step', '.ns textarea', '.ds-nextstep .ds-text', 1, ['box']],
    ['where the second is', '.nsm span', '.ds-nextstep-meta > span', 1, ['pos', 'text']]],
  sum: [...BAR, ['the question', '#h1', '.ds-guide-question', 0, ['pos', 'text']], FOOT[0],
    ['the eye', '.eye1 svg', '.ds-guide-question .ds-who svg', 0, ['box']],
    ['the first row', '.sr', '.ds-guide-plan-row', 0, ['box']],
    ['its label', '.sr .k', '.ds-guide-plan-label', 0, ['pos', 'text']],
    ['its answer', '.sr .v p', '.ds-guide-plan-line', 0, ['pos', 'text']],
    ['Edit', '.sr .ed', '.ds-guide-plan-edit', 0, ['box', 'text']],
    ['the second row', '.sr', '.ds-guide-plan-row', 1, ['box']],
    ['the last row', '.sr', '.ds-guide-plan-row', 4, ['box']],
    ['where a next step is', '.sr .v small', '.ds-guide-plan-line small', 0, ['text']]],
  editsum: [...BAR, ...HEAD, FOOT[0],
    ['the goal box', '#goal', '.ds-guide-body .ds-text', 0, ['box']]],
  gwel: [
    ['the bold crosshair', '.gtop svg', '.ds-guest-top svg', 0, ['box']],
    ['the title', '.ptl', '.ds-guest-title', 0, ['pos', 'text']],
    ['the Email label', '.field label', '.ds-guest-field label', 0, ['pos', 'text']],
    ['the Email box', '#em', '.ds-guest-field input', 0, ['box', 'text', 'edge']],
    ['the Access code label', '.field label', '.ds-guest-field label', 1, ['pos', 'text']],
    ['the Access code box', '#code', '.ds-guest-field input', 1, ['box']],
    ['who sees the answers', '.bsent', '.ds-guest-sentence', 0, ['pos', 'text']],
    ['Start my plan', '.bnote .btn', '.ds-btn-note .ds-btn', 0, ['box', 'text']],
    ['~15 minutes', '.bnote small', '.ds-btn-note-text', 0, ['pos', 'text']],
    ['Privacy Policy', '.legal .text', '.ds-guest-legal .ds-link', 0, ['pos', 'text']],
    ['Data Storage Notice', '.legal .text', '.ds-guest-legal .ds-link', 1, ['pos']]],
  gend: [
    ['the bold crosshair', '.gtop svg', '.ds-guest-top svg', 0, ['box']],
    ['the heading', '#h1', '.ds-guest-question', 0, ['pos', 'text']],
    ['the copy line', '.narrow > .sub', '.ds-guest-sub', 0, ['pos', 'text']],
    ['the first next step', '.li', '.ds-guest-list li', 0, ['box', 'text']],
    ['the second next step', '.li', '.ds-guest-list li', 1, ['box']],
    ['Download my PDF', '.btn.wide', '.ds-guest-pdf .ds-btn', 0, ['box', 'text']],
    ['the calm card', '.calm', '.ds-calm-card', 0, ['box', 'edge']],
    ['its sentence', '.calm p', '.ds-calm-card p', 0, ['pos', 'text']],
    ['its quieter line', '.calm .sub', '.ds-calm-card-sub', 0, ['pos', 'text']],
    ['Create my free account', '.calm .ghost', '.ds-calm-card .ds-btn', 0, ['box', 'text', 'edge']],
    ['Delete my answers', '.legal .text', '.ds-guest-legal .ds-link', 0, ['pos', 'text']]],
};
// Screens that are a panel over the page: their words, and the panel's own parts.
const PANELS = {
  who: [['the panel’s title', '.shh h2', '[role=dialog]:not(.ds-guide) h2', 0, ['text']]],
  add: [['the panel’s title', '.shh h2', '[role=dialog]:not(.ds-guide) h2', 0, ['text']]],
  len: [['the panel’s title', '.shh h2', '.ds-timer-title', 0, ['text']],
    ['the first length', '.sheet .opt', '[role=dialog]:not(.ds-guide) .ds-answer', 0, ['text']]],
};

// Differences that are meant, each with why: `${screen}|${part}|${what}` (a * matches any screen).
// The values are Tim's own later rules, or the portal's one shared part
// (Phases 0 to 5) where M9 copied an earlier design reference.
const ALLOWED = new Map(Object.entries(JSON.parse(process.env.ALLOWED_JSON || '{}')));
const EDGE = 'every outlined edge takes the edges colour, 3 to 1 (rule 8a; Tim, 12 Nov, after M9’s parts were drawn)';
const BOX = 'the portal’s one-line box is 58px, as M9’s own text boxes are; M9’s two start boxes come out 1.4px shorter, so what follows sits that much lower';
const WHOLE = 'M9’s script sizes a two-line box in whole pixels; the portal’s box is its words’ own height, up to 0.3px a row different';
export const ALLOW = [
  ['*|the add button|edge', EDGE],
  ['*|the timer’s button|edge', EDGE],
  ['*|the last answer|edge', EDGE],
  ['*|Create my free account|edge', EDGE],
  ['who|the panel’s title|text size', 'the eye’s panel is the portal’s shared small panel (22px title), as on the dashboard'],
  ['sum|the eye|left', 'the eye is 12px from the last letter’s ink to its own visible edge, as M9’s is (read from both pages’ pixels by the UI tester, 14 Nov); the portal’s eye is drawn half a pixel wider and starts at its box’s edge, so its box sits 0.5px to the right of M9’s'],
  ['sum|the coral button|width@phone', 'M9 draws no PDF link on the summary, so its button runs the full width on a phone; the built bar has “Download my PDF” at its left and the button takes the rest, as on the two Visual tools'],
  ['*|the add button|top@phone', WHOLE],
  ['*|where the second is|top@phone', WHOLE],
  ['gwel|the Email box|height', BOX],
  ['gwel|the Access code label|top', BOX],
  ['gwel|the Access code box|top', BOX],
  ['gwel|the Access code box|height', BOX],
  ['gwel|who sees the answers|top', BOX],
  ['gwel|Start my plan|top', BOX],
  ['gwel|~15 minutes|top', BOX],
  ['gwel|Privacy Policy|top', BOX],
  ['gwel|Data Storage Notice|top', BOX],
];
for (const [key, why] of ALLOW) ALLOWED.set(key, why);
const allowed = (screen, part, what) => ALLOWED.get(`${screen}|${part}|${what}`) || ALLOWED.get(`*|${part}|${what}`) || ALLOWED.get(`*|*|${what}`);

// Sentences that differ on purpose (M9's words -> the built page's), or are only on one side.
const NEWER_PANEL = 'the add panel is the one shared panel of 13 Nov (step 4): “Where should it go?” with This week, Backlog and Don’t add it replaces “Which week?”';
const OWN_PLAN = 'the test client’s own Strategies, where M9 shows invented ones';
const WORDS_M9_ONLY = new Map([
  ['add', [
    ['Hire well and fast', OWN_PLAN],
    ['How much will it move this Strategy?', 'the shared panel’s own question, “How much will it move its Strategy?”'],
    ['Which week?', NEWER_PANEL],
    ['Next week', NEWER_PANEL],
  ]],
]);
const WORDS_BUILT_ONLY = new Map([
  ['add', [
    ['Maintain my availability to do good work', OWN_PLAN],
    ['Deepen my coaching craft', OWN_PLAN],
    ['Grow through referrals', OWN_PLAN],
    ['Build The Clarity Portal', OWN_PLAN],
    ['How much will it move its Strategy?', 'the shared panel’s own question'],
    ['Where should it go?', NEWER_PANEL],
    ['Backlog', NEWER_PANEL],
    ['Don’t add it', NEWER_PANEL],
    ['CANCEL', 'the shared panel keeps Cancel (step 4)'],
  ]],
  ['sum', [['Download my PDF', 'Tim’s step 2 asks for the PDF on the signed-in summary; M9 draws it on the guest’s end page only. It is the quiet link at the bottom bar’s left, as M10 draws it on the Team performance check’s results']]],
]);

// ---------------------------------------------------------------- measuring (runs in the page)
function measureParts({ parts, mock, anchor, bottom }) {
  const q = (sel, nth, root = document) => [...root.querySelectorAll(sel)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })[nth] || null;
  const a = q(anchor, 0);
  const ar = a ? a.getBoundingClientRect() : { left: 0, top: 0 };
  // M9's phone frame has a 10px bezel: the screen ends inside it.
  const frame = typeof bottom === 'string' ? q(bottom, 0) : null;
  const foot = frame ? frame.getBoundingClientRect().bottom - parseFloat(getComputedStyle(frame).borderBottomWidth) : window.innerHeight;
  const rgb = (c) => c.replace(/\s+/g, '');
  // The part of a box that has ink in it: text lines, not the block's whole width.
  const ink = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return el.getBoundingClientRect();
    return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  };
  const outp = {};
  for (const [name, mSel, bSel, nth] of parts) {
    const el = q(mock ? mSel : bSel, nth);
    if (!el) { outp[`${name}#${nth}`] = null; continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const i = ink(el);
    outp[`${name}#${nth}`] = {
      x: r.left - ar.left, y: r.top - ar.top, w: r.width, h: r.height,
      ix: i.left - ar.left, iy: i.top - ar.top,
      fromBottom: foot - r.bottom, right: r.right - ar.left,
      font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
      lh: cs.lineHeight === 'normal' ? 'normal' : parseFloat(cs.lineHeight), upper: cs.textTransform === 'uppercase',
      colour: rgb(cs.color), fill: rgb(cs.backgroundColor),
      edge: `${parseFloat(cs.borderTopWidth)}px ${rgb(cs.borderTopColor)}`, radius: parseFloat(cs.borderTopLeftRadius),
    };
  }
  return outp;
}

function words({ root, hide }) {
  const el = [...document.querySelectorAll(root)].pop();
  if (!el) return [];
  const hidden = [...document.querySelectorAll(hide)];
  const was = hidden.map((h) => h.style.display);
  hidden.forEach((h) => { h.style.display = 'none'; });
  // One line per block, as the browser lays the words out.
  const lines = el.innerText.split('\n').map((t) => t.replace(/\s+/g, ' ').trim());
  for (const t of el.querySelectorAll('textarea, input')) if (t.value && t.checkVisibility?.()) lines.push(t.value.trim());
  for (const t of el.querySelectorAll('[placeholder]')) if (!t.value && t.checkVisibility?.()) lines.push(t.getAttribute('placeholder'));
  hidden.forEach((h, i) => { h.style.display = was[i]; });
  return [...new Set(lines.filter(Boolean))];
}

// ---------------------------------------------------------------- comparing
const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;
function compare(tag, screen, parts, m, b, phone) {
  for (const [name, , , nth, what] of parts) {
    const key = `${name}#${nth}`;
    const M = m[key];
    const B = b[key];
    if (!M) { note(`${tag}: M9 doesn’t draw ${name} here`); continue; }
    if (!B) { pass(`${tag}: ${name} is on the page`, Boolean(allowed(screen, name, 'missing')), 'not found'); continue; }
    const check = (label, ok, detail) => {
      const why = allowed(screen, name, label) || (phone && allowed(screen, name, `${label}@phone`));
      if (why && !ok) { note(`${tag}: ${name}, ${label} differs as meant (${detail}): ${why}`); return; }
      pass(`${tag}: ${name}, ${label}`, ok, detail);
    };
    for (const w of what) {
      if (w === 'box' || w === 'box:ink') {
        check('left', near(M.x, B.x), `M9 ${M.x.toFixed(2)}, built ${B.x.toFixed(2)}`);
        check('top', near(M.y, B.y), `M9 ${M.y.toFixed(2)}, built ${B.y.toFixed(2)}`);
        check('width', near(M.w, B.w), `M9 ${M.w.toFixed(2)}, built ${B.w.toFixed(2)}`);
        check('height', near(M.h, B.h), `M9 ${M.h.toFixed(2)}, built ${B.h.toFixed(2)}`);
      } else if (w === 'pos') {
        check('left', near(M.ix, B.ix), `M9 ${M.ix.toFixed(2)}, built ${B.ix.toFixed(2)}`);
        check('top', near(M.iy, B.iy), `M9 ${M.iy.toFixed(2)}, built ${B.iy.toFixed(2)}`);
      } else if (w === 'foot') {
        check('from the bottom', near(M.fromBottom, B.fromBottom), `M9 ${M.fromBottom.toFixed(2)}, built ${B.fromBottom.toFixed(2)}`);
        check('height', near(M.h, B.h), `M9 ${M.h.toFixed(2)}, built ${B.h.toFixed(2)}`);
        check('right edge', near(M.right, B.right), `M9 ${M.right.toFixed(2)}, built ${B.right.toFixed(2)}`);
        check('width', near(M.w, B.w), `M9 ${M.w.toFixed(2)}, built ${B.w.toFixed(2)}`);
      } else if (w === 'text') {
        check('font', M.font === B.font, `M9 ${M.font}, built ${B.font}`);
        check('text size', near(M.size, B.size, 0.01), `M9 ${M.size}, built ${B.size}`);
        check('letter-spacing', near(M.ls, B.ls, 0.05), `M9 ${M.ls}, built ${B.ls}`);
        check('capitals', M.upper === B.upper, `M9 ${M.upper}, built ${B.upper}`);
        check('colour', M.colour === B.colour, `M9 ${M.colour}, built ${B.colour}`);
      } else if (w === 'edge') {
        check('edge', M.edge === B.edge, `M9 ${M.edge}, built ${B.edge}`);
        check('corners', near(M.radius, B.radius, 0.01) || (M.radius > 100 && B.radius > 100), `M9 ${M.radius}, built ${B.radius}`);
      }
    }
  }
}
function compareWords(tag, screen, mw, bw) {
  const norm = (s) => s.replace(/ /g, ' ').replace(/[⁠​]/g, '').replace(/\s+/g, ' ').trim();
  const M = new Set(mw.map(norm));
  const B = new Set(bw.map(norm));
  const upper = new Set([...B].map((s) => s.toUpperCase()));
  const upperM = new Set([...M].map((s) => s.toUpperCase()));
  const skipM = new Map(WORDS_M9_ONLY.get(screen) || []);
  const skipB = new Map(WORDS_BUILT_ONLY.get(screen) || []);
  for (const s of M) {
    if (B.has(s) || upper.has(s.toUpperCase())) continue;
    if (skipM.has(s)) { note(`${tag}: M9’s “${s}” isn’t on the page, as meant: ${skipM.get(s)}`); continue; }
    pass(`${tag}: M9’s words “${s.slice(0, 90)}” are on the page`, false, 'missing');
  }
  for (const s of B) {
    if (M.has(s) || upperM.has(s.toUpperCase())) continue;
    if (skipB.has(s)) { note(`${tag}: the page’s “${s}” isn’t in M9, as meant: ${skipB.get(s)}`); continue; }
    pass(`${tag}: the page’s words “${s.slice(0, 90)}” are M9’s`, false, 'not in M9');
  }
  pass(`${tag}: every sentence compared`, true);
}

// ---------------------------------------------------------------- M9 itself
const M9_SCREEN = { goal: 'Goal', cons: 'What’s in the way', opps: 'What’s working', opts: 'Options', will: 'Will', steps: 'Next steps', add: 'Add a to-do', sum: 'Your plan', editsum: 'Edit from your plan', who: 'Who can see this', gwel: 'Guest start', gend: 'Guest end' };
async function m9Open(browser, width, mode) {
  const phone = width < 600;
  // M9's review bar sits above the frame, so the window is taller than the frame.
  const ctx = await browser.newContext({ viewport: { width: phone ? 600 : width, height: 1200 }, colorScheme: mode, locale: 'en-GB' });
  await ctx.route(/^https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`file://${M9_FILE}`);
  await page.locator(`.rp[data-t="${mode}"]`).click();
  await page.locator(`.rp[data-w="${phone ? 'p' : 'd'}"]`).click();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
async function m9Show(page, screen) {
  if (screen === 'len') {
    await page.getByRole('button', { name: 'Options', exact: true }).click();
    await page.evaluate(() => { window.__st.tm = 360; window.__st.tlen = 360; window.__render(); window.__act('tlen'); });
  } else {
    await page.getByRole('group', { name: 'Screen' }).getByRole('button', { name: M9_SCREEN[screen], exact: true }).click();
    // The Options screen opens part-way through its timer in M9's review; the page is compared before it starts.
    if (screen === 'opts') await page.evaluate(() => { window.__st.tm = 360; window.__st.tlen = 360; window.__render(); });
    if (screen === 'gend') await page.evaluate(() => { window.__st.guest = true; window.__render(); });
  }
  await page.evaluate(() => { document.querySelectorAll('.qbody, .sheet, .scrim').forEach((el) => { el.style.animation = 'none'; }); });
  await sleep(250);
}

// ---------------------------------------------------------------- the run
const env = readEnv();
const { db, me } = await clientDb(env);
const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const { data: prefsRow } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = prefsRow?.[0]?.page_preferences ?? null;
const { data: decisionsBefore } = await db.from('decisions').select('id').eq('user_id', me).eq('tool_type', 'grow');
const keep = new Set((decisionsBefore || []).map((d) => d.id));
async function cleanUp() {
  await db.from('todos').delete().eq('user_id', me).eq('source', 'get_unstuck').gte('created_on', todayKey);
  const { data: now } = await db.from('decisions').select('id').eq('user_id', me).eq('tool_type', 'grow');
  for (const d of now || []) if (!keep.has(d.id)) await db.from('decisions').delete().eq('id', d.id).eq('user_id', me);
  if (prefsBefore) await db.from('person_settings').update({ page_preferences: prefsBefore }).eq('user_id', me);
}

const want = (screen) => !ONLY || ONLY.includes(screen);
const TOOL_ANCHOR = { mock: '.qpct', built: '.ds-guide-pct-track' };
const GUEST_ANCHOR = { gwel: { mock: '.ptl', built: '.ds-guest-title' }, gend: { mock: '#h1', built: '.ds-guest-question' } };
const HIDE = '.ds-sr, .tipx, .ds-toast, .toast, #tw, .rev, .notes';

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const phone = width < 600;
      const tagBase = `${phone ? 'Phone' : 'Desktop'} ${mode}`;
      const m9 = await m9Open(browser, width, mode);
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 860 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
      await block(ctx);
      await withCoach(ctx);
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* blocked */ } }, mode);
      // M9's person is Jordan: the page is told the same first name (nothing in the database changes).
      await ctx.route(/\/rest\/v1\/profiles\?select=first_name/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ first_name: M9.name }]) }));
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
      await signIn(page, env);
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/get-unstuck|timer-minutes/.test(k)) localStorage.removeItem(k); });
      await page.goto(`${APP}/get-unstuck`);
      await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
      await page.evaluate(() => document.fonts.ready);

      const one = async (screen, { panel = false } = {}) => {
        if (!want(screen)) return;
        const tag = `${tagBase}, ${screen}`;
        if (width === 400) { await sleep(500); await page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) }); return; }
        await m9Show(m9.page, screen);
        await sleep(600);
        await page.evaluate(() => { document.querySelectorAll('.ds-guide-page, .ds-guide-rv').forEach((el) => { el.style.animation = 'none'; }); });
        const parts = panel ? PANELS[screen] : SCREENS[screen];
        const guest = GUEST_ANCHOR[screen];
        const anchors = guest || TOOL_ANCHOR;
        const m = await m9.page.evaluate(measureParts, { parts, mock: true, anchor: anchors.mock, bottom: '#fr' });
        const b = await page.evaluate(measureParts, { parts, mock: false, anchor: anchors.built, bottom: null });
        compare(tag, screen, parts, m, b, phone);
        const mw = await m9.page.evaluate(words, { root: panel ? '.sheet' : '#fr', hide: HIDE });
        const bw = await page.evaluate(words, { root: panel ? '[role=dialog]:not(.ds-guide)' : (guest ? '.ds-guest' : '.ds-guide'), hide: HIDE });
        compareWords(tag, screen, mw, bw);
        await page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) });
        await m9.page.locator('#fr').screenshot({ path: join(out, `${screen}-${width}-${mode}-m9.png`) });
      };

      // Goal
      await page.locator('.ds-guide-body .ds-text').first().fill(M9.goal);
      await page.locator('.ds-guide-question').click();
      await one('goal');
      await pressNext(page); await onQuestion(page, 'What’s in the way');
      await typeRows(page, M9.cons, 'constraint');
      await page.locator('.ds-guide-question').click();
      await one('cons');
      await pressNext(page); await onQuestion(page, 'What’s already working');
      await typeRows(page, M9.opps, 'opportunity');
      await page.locator('.ds-guide-question').click();
      await one('opps');
      await pressNext(page); await onQuestion(page, 'What could you do');
      await typeRows(page, M9.opts, 'option');
      await page.locator('.ds-guide-question').click();
      await page.evaluate(() => document.querySelector('.ds-guide-scroll').scrollTo(0, 0));
      await one('opts');
      if (want('len')) {
        await page.locator('.ds-timer-ring').click();
        await sleep(700);
        await one('len', { panel: true });
        await page.keyboard.press('Escape');
        await sleep(600);
      }
      await pressNext(page); await onQuestion(page, 'Which options');
      await page.locator('.ds-answer').nth(0).click();
      await page.locator('.ds-answer').nth(1).click();
      await page.locator('.ds-guide-question').click();
      await one('will');
      await pressNext(page); await onQuestion(page, 'What exactly');
      await page.locator('.ds-nextstep .ds-text').nth(0).fill(M9.acts[0]);
      await page.locator('.ds-nextstep .ds-text').nth(1).fill(M9.acts[1]);
      // M9's first step is already in this week: add it for real (deleted at the end).
      await page.getByRole('button', { name: 'Add next step 1 to this week' }).click();
      await addPanel(page, 'This week');
      await until(async () => (await page.locator('.ds-nextstep-good').count()) === 1, 10000);
      await sleep(5600); // the toast goes
      await page.locator('.ds-guide-question').click();
      await one('steps');
      if (want('add')) {
        await page.getByRole('button', { name: 'Add next step 2 to this week' }).click();
        await sleep(700);
        await one('add', { panel: true });
        await page.keyboard.press('Escape');
        await sleep(600);
      }
      await pressNext(page); await onQuestion(page, 'Here’s your plan');
      await one('sum');
      if (want('who')) {
        await page.locator('.ds-guide-question .ds-who').click();
        await sleep(700);
        await one('who', { panel: true });
        await page.keyboard.press('Escape');
        await sleep(600);
      }
      await page.locator('.ds-guide-plan-row').first().click();
      await onQuestion(page, 'What do you want to achieve?');
      await sleep(500);
      await one('editsum');
      pass(`${tagBase}: no page errors in the tool`, errors.length === 0, errors.join(' | '));
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/get-unstuck/.test(k)) localStorage.removeItem(k); });
      await ctx.close();

      // The guest pages, on stand-in answers.
      if (want('gwel') || want('gend')) {
        const g = await browser.newContext({ viewport: { width, height: phone ? 844 : 860 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
        const state = await guestStandIn(g);
        await block(g, { api: guestApi(state) });
        const gp = await g.newPage();
        const gerrors = [];
        gp.on('pageerror', (e) => gerrors.push(e.message.slice(0, 200)));
        await guestStart(gp);
        await gp.getByLabel('Access code').fill(M9.guestCode);
        await gp.evaluate(() => document.fonts.ready);
        await gp.locator('.ds-guest-title').click();
        const gone = async (screen) => {
          if (!want(screen)) return;
          const tag = `${tagBase}, ${screen}`;
          if (width === 400) { await sleep(500); await gp.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`), fullPage: true }); return; }
          await m9Show(m9.page, screen);
          await sleep(500);
          const parts = SCREENS[screen];
          const m = await m9.page.evaluate(measureParts, { parts, mock: true, anchor: GUEST_ANCHOR[screen].mock, bottom: '#fr' });
          const b = await gp.evaluate(measureParts, { parts, mock: false, anchor: GUEST_ANCHOR[screen].built, bottom: null });
          compare(tag, screen, parts, m, b, phone);
          compareWords(tag, screen, await m9.page.evaluate(words, { root: '#fr', hide: HIDE }), await gp.evaluate(words, { root: '.ds-guest', hide: HIDE }));
          await gp.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`), fullPage: true });
          await m9.page.locator('#fr').screenshot({ path: join(out, `${screen}-${width}-${mode}-m9.png`) });
        };
        await gone('gwel');
        await gp.getByRole('button', { name: 'Start my plan' }).click();
        await fillTo(gp, 'sum');
        await pressNext(gp);
        await gp.waitForSelector('.ds-guest-question', { timeout: 15000 });
        await until(async () => (await gp.locator('.ds-guest-sub').count()) > 0, 8000);
        await gone('gend');
        pass(`${tagBase}: no page errors on the guest pages`, gerrors.length === 0, gerrors.join(' | '));
        await g.close();
      }
      await m9.ctx.close();
      await sleep(1500);
    }
  }
} finally {
  await browser.close();
  await cleanUp().catch((e) => results.push(`NOTE  clean-up: ${e.message}`));
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${passed} passed, ${failures} failed, ${results.filter((r) => r.startsWith('NOTE')).length} notes. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
