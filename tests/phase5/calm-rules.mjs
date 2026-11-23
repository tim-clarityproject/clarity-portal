// The calm-rules check (Tim's rules of 5 Nov, START-HERE 5e; part 5 of 10
// Nov): every page in scope, at 1280px and 390 by 844, in dark and light,
// with the real fonts. It fails on any break:
//
//   - no icon in any add button (words only, 5e rule 29e);
//   - every tap area 44px or more;
//   - no sideways scroll;
//   - at most one eye per page or section, beside its title: its centre
//     within 0.5px of the middle of the title's capitals and 12px (±1)
//     after its last letter;
//   - no "Performance Sprint" followed by a number in client text;
//   - no numbered ratings ("out of 10", "/10", "1 to 5");
//   - no title in capitals over 3 words;
//   - the page's background and text match the person's light or dark
//     setting, and the menu button never sits over a logo or content;
//   - no old names (Plan my day, Review my day, the check-in, Performance
//     Evidence), no crosshair used as a plus;
//   - no answer with a grey second line that repeats or rewords it (Tim,
//     11 Nov, 12:51);
//   - every chevron beside one line of text is centred on that text, on the
//     middle of its x-height or of its capitals, within 0.5px, open and
//     closed (Tim, 11 Nov, 14:36; tests/phase5/chevrons.mjs), read at twice
//     the pixels a point (an ordinary phone or laptop screen); one beside
//     a name with a line under it is centred on the two together, within
//     1px; the portal's own (older) Health Check route is measured too
//     (Tim, 12 Nov; CHEV_PARTS=pages,health-check,old-route runs a part);
//   - every outlined edge reaches 3 to 1 against what it sits on (Tim, 12
//     Nov; tests/phase5/edges.mjs);
//   - no two tap areas overlap, so nothing that can be tapped shares its
//     44px with a neighbour (Tim, 11 Nov; tests/phase5/taps.mjs);
//   - on a summary or results page, "Questions to start with" never comes
//     before a chart, in the page's order or on screen (Tim, 13 Nov, 18:11;
//     rule 29ar; tests/phase5/summary-order.mjs);
//   - no console errors.
//
//   - the coach authenticator's screens (Phase 6a run 5), stood in whole
//     with nothing signed in, and the owner's Reset panel on the test
//     coach's saved read-only sign-in; ONLY=^coach-auth runs them alone;
//
//   - the outside Health Check follows the device, light or dark (Tim, 10
//     Nov, 23:22): its own page on every screen (M7b version 51), and the
//     portal's own route; with ONLY=^health-check nothing signs in.
//
// It also saves a light screenshot of every page at both widths into the
// folder given (Tim's screens folder), named by page.
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked. Nothing is saved.
//
//   node --import ./tests/scores/register.mjs tests/phase5/calm-rules.mjs [folder for screenshots]
import { GUEST_TOKEN, GUEST_VISIT, M10, M9, m10Wash } from '../phase8/shared.mjs';
import { STEPS as HC_STEPS, appPage as hcPage, kestrel as hcKestrel, signIn as hcSignIn } from '../healthcheck/hc-shared.mjs';
import { IDS as HC_IDS, m7Rows } from '../healthcheck/inside-shared.mjs';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chevronsOff, measureChevrons } from './chevrons.mjs';
import { outlinedEdges } from './edges.mjs';
import { overlappingTaps } from './taps.mjs';
import { toastCovers } from './toasts.mjs';
import { checkReveals } from './reveals.mjs';
import { questionsBeforeCharts } from './summary-order.mjs';
import { backGaps, buttonProblems, chevronOnlyFolds, controlsFamily, doubledRules, importantMarks, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { checkPopups } from './popups.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let failures = 0;
let passes = 0;
let revealsChecked = 0;
const fails = [];
// The UI tester's run for the new buttons (Tim, 18 Nov): WIDTHS=1440,768,400
// TEXT=2 MOTION=reduce UI=1 checks only what the brief asks of every page
// there (button words that never wrap or cut off, the buttons' look, one
// coral button per screen, every tap area 44px, no sideways scroll).
const WIDTHS = (process.env.WIDTHS || '1280,390').split(',').map(Number);
const SCALE = Number(process.env.TEXT || 1);
const MOTION = process.env.MOTION || 'no-preference';
const UI = process.env.UI === '1';
const UI_CHECK = /opened|real fonts|tap area|sideways|button|add row/;
const pass = (name, ok, detail = '') => {
  if (UI && !UI_CHECK.test(name)) return;
  if (ok) passes += 1;
  else { failures += 1; fails.push(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// [name, address, what to do once it's open (optional)]
// The Travel plan's pages read plans kept on the device, a few days from today (London's).
const TRAVEL = (() => {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const day = (n) => { const [y, m, d] = t.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const LHR = { key: 'LHR', code: 'LHR', name: 'London Heathrow, LHR', city: 'London', zone: 'Europe/London' };
  const JFK = { key: 'JFK', code: 'JFK', name: 'New York JFK', city: 'New York', zone: 'America/New_York' };
  const DXB = { key: 'DXB', code: 'DXB', name: 'Dubai, DXB', city: 'Dubai', zone: 'Asia/Dubai' };
  const id = (n) => `7d000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const at = '2026-11-01T09:00:00.000Z';
  const moment = (n, name, on, city, zone) => ({ id: id(n), name, area: 'work', kind: 'perform', span: 'day', startsOn: on, endsOn: on, placeCity: city, placeZone: zone, repeat: null, lesson: '', shared: false, createdAt: at, updatedAt: at });
  const board = moment(10, 'Harbour board meeting', day(7), 'New York', 'America/New_York');
  const keynote = moment(11, 'Keynote', day(22), 'Dubai', 'Asia/Dubai');
  // Three days away in Tokyo, with no plan: Home's offer row.
  const launch = moment(12, 'Tokyo launch', day(3), 'Tokyo', 'Asia/Tokyo');
  const plan = { id: id(1), title: 'New York trip', flightOut: { id: id(2), from: LHR, to: JFK, leaves: `${day(5)}T12:00`, lands: `${day(5)}T15:00` }, flightHome: { id: id(3), from: JFK, to: LHR, leaves: `${day(9)}T19:00`, lands: `${day(10)}T07:00` }, momentIds: [board.id], momentTimes: { [board.id]: '09:00' }, usualSleep: { start: '22:30', end: '06:30' }, noCaffeine: false, createdAt: at, updatedAt: at };
  const short = { id: id(4), title: 'Dubai trip', flightOut: { id: id(5), from: LHR, to: DXB, leaves: `${day(20)}T21:00`, lands: `${day(21)}T08:00` }, flightHome: { id: id(6), from: DXB, to: LHR, leaves: `${day(23)}T09:00`, lands: `${day(23)}T13:00` }, momentIds: [keynote.id], momentTimes: { [keynote.id]: '14:00' }, usualSleep: { start: '22:00', end: '06:00' }, noCaffeine: false, createdAt: at, updatedAt: at };
  // A short trip far west: sleep moves so getting up isn't at 02:00, with its one line (Tim, 18 Nov).
  const west = { id: id(13), title: 'New York trip', flightOut: { id: id(14), from: LHR, to: JFK, leaves: `${day(30)}T09:00`, lands: `${day(30)}T12:00` }, flightHome: { id: id(15), from: JFK, to: LHR, leaves: `${day(32)}T19:00`, lands: `${day(33)}T07:00` }, momentIds: [], momentTimes: {}, usualSleep: { start: '23:00', end: '07:00' }, noCaffeine: false, createdAt: at, updatedAt: at };
  // Under way today: Home's "Today’s travel plan" card.
  const now = { ...plan, id: id(7), flightOut: { ...plan.flightOut, id: id(8), leaves: `${day(0)}T12:00`, lands: `${day(0)}T15:00` }, flightHome: { ...plan.flightHome, id: id(9), leaves: `${day(4)}T19:00`, lands: `${day(5)}T07:00` }, momentIds: [], momentTimes: {} };
  return { plan, short, west, now, moments: [board, keynote, launch] };
})();
const PAGES_ALL = [
  ['home', '/welcome'],
  ['menu', '/welcome', 'menu'],
  ['hub-personal', '/personal'],
  ['hub-plan', '/personal/plan'],
  ['hub-reset', '/personal/reset'],
  ['hub-review', '/personal/review'],
  ['hub-interpersonal', '/interpersonal'],
  ['hub-strategic', '/strategic'],
  ['performance-sprint', '/performance-sprint'],
  ['view-your-year', '/performance-sprint/year'],
  ['plan', '/performance-plan'],
  ['edit-my-plan', '/performance-plan/edit'],
  ['dashboard', '/dashboard'],
  ['daily-plan', '/daily-plan'],
  ['daily-review', '/daily-review'],
  ['weekly-debrief', '/performance-sprint/debrief'],
  ['monthly-review', '/monthly-review'],
  ['recovery', '/recovery'],
  ['my-plans', '/my-plans'],
  ['my-reviews', '/my-reviews'],
  ['my-account', '/my-account'],
  ['my-account-password', '/my-account/password'],
  ['my-account-email', '/my-account/email'],
  // The end-of-sprint review's two written questions and the first-time
  // builder's working days (Tim, 10 Nov): opened on their step, nothing saved.
  ['sprint-review-worked', '/performance-sprint/review', 'review:1'],
  ['sprint-review-next-time', '/performance-sprint/review', 'review:2'],
  ['build-working-days', '/performance-plan/build', 'build:4'],
  // Get unstuck (M9; Phase 8a): the first step (with See an example), a middle step, the Options step with the
  // timer, and Your plan, opened on their step from a draft on the device
  // (nothing saved); then a guest's start and end pages, on stand-in
  // answers (migration 035 isn't on the test project until Tim runs it).
  ['get-unstuck-goal', '/get-unstuck', 'unstuck:0'],
  ['get-unstuck-reality', '/get-unstuck', 'unstuck:1'],
  ['get-unstuck-options', '/get-unstuck', 'unstuck:3'],
  ['get-unstuck-plan', '/get-unstuck', 'unstuck:6'],
  ['guest-start', `/guest/${GUEST_TOKEN}?email=${encodeURIComponent(M9.guestEmail)}`, 'guest:start'],
  ['guest-end', `/guest/${GUEST_TOKEN}`, 'guest:end'],
  // The Team performance check (M10; Phase 8a step 3): who reports to you,
  // a one-tap question with its lines of meaning, and the results (the
  // chart, trust, and Questions to start with last), opened on their step
  // from a check on the device (nothing saved).
  ['team-check-people', '/team-performance-check', 'team:0'],
  ['team-check-trust', '/team-performance-check', 'team:1'],
  ['team-check-results', '/team-performance-check', 'team:16'],
  // The Emotional wash (M10; Phase 8a step 3): what happened (the eye), the
  // words side by side, the story (See an example opens in place), a one-tap
  // check, Park and reflect and Accept and act with their follow-ups open
  // in the chosen card, and Your wash, opened on their step from a wash on
  // the device (nothing saved).
  ['wash-what', '/emotional-wash', 'wash:0'],
  ['wash-words', '/emotional-wash', 'wash:2'],
  ['wash-story', '/emotional-wash', 'wash:4'],
  ['wash-true', '/emotional-wash', 'wash:5'],
  ['wash-park', '/emotional-wash', 'wash:8'],
  ['wash-act', '/emotional-wash', 'wash:16'],
  ['wash-summary', '/emotional-wash', 'wash:17'],
  // The Health Check inside the portal (M7 version 8.2): Your teams with no
  // teams and with M7's two, a version's results (Versions after the
  // questions), Compare two versions, the example, and the first step of a
  // new version and of a new team. M7's teams are answered for the Health
  // Check's own read only (nothing in the database is read or written).
  ['hc-inside-empty', '/strategic-alignment', 'hc:empty'],
  ['hc-inside-teams', '/strategic-alignment', 'hc:m7'],
  ['hc-inside-results', `/strategic-alignment/version/${HC_IDS.lt3}`, 'hc:m7'],
  ['hc-inside-compare', `/strategic-alignment/compare?team=7a000000-0000-4000-8000-00000000a001&a=${HC_IDS.lt2}&b=${HC_IDS.lt3}`, 'hc:m7'],
  ['hc-inside-example', '/strategic-alignment/example', 'hc:empty'],
  ['hc-inside-new-version', '/strategic-alignment/new?team=7a000000-0000-4000-8000-00000000a001', 'hc:m7'],
  ['hc-inside-new-team', '/strategic-alignment/new-team', 'hc:m7'],
  // The Travel plan (M21 version 7.2; Phase 8b part B): Start, set-up's
  // first step, a plan with its chart and key moments, a day across two time
  // zones, and a short trip, from plans and peak moments put on the device
  // (048 isn't on the test project, so they live there; nothing is saved).
  ['travel-start', '/travel-plan', 'travel'],
  ['travel-setup', '/travel-plan/new', 'travel'],
  ['travel-plan', `/travel-plan/${TRAVEL.plan.id}`, 'travel'],
  ['travel-day', `/travel-plan/${TRAVEL.plan.id}/day/${TRAVEL.plan.flightOut.leaves.slice(0, 10)}`, 'travel'],
  ['travel-short', `/travel-plan/${TRAVEL.short.id}`, 'travel'],
  ['travel-short-west', `/travel-plan/${TRAVEL.west.id}`, 'travel'],
  ['home-travel', '/welcome', 'travel'],
  // Peak moments (M18 version 28; Phase 8b part A): the list, Add's first
  // step, a saved one's summary and the sprint page, from the same peak
  // moments on the device.
  ['peak-list', '/peak-moments', 'travel'],
  ['peak-add', '/peak-moments/add', 'travel'],
  ['peak-edit', `/peak-moments/edit/${TRAVEL.moments[0].id}`, 'travel'],
  ['peak-sprint', '/performance-sprint', 'travel'],
];
// M10's own invented team, as the tool keeps a check while it is open.
const TEAM_CHECK = {
  people: M10.people.map((p, i) => ({ id: `m10-person-${i + 1}`, name: p.name, role: p.role, t: p.t[0], a: p.a[0], u: p.u[0] })),
  shared: false,
  last: { at: '2026-10-14T09:00:00.000Z', people: Object.fromEntries(M10.people.map((p, i) => [`m10-person-${i + 1}`, { t: p.t[1], a: p.a[1], u: p.u[1] }])) },
};
// M9's own example, as the tool keeps it while it is being worked on.
const UNSTUCK_PLAN = {
  goal: M9.goal,
  cons: M9.cons,
  opps: M9.opps,
  opts: M9.opts,
  acts: M9.acts.map((text, option) => ({ id: `calm-${option}`, option, text, where: null, todoId: null, strategyId: null })),
  shared: false,
};
const PAGES = PAGES_ALL.filter(([name]) => !ONLY || ONLY.test(name));

const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };
const TEXT = { dark: 'rgb(255, 255, 255)', light: 'rgb(0, 0, 0)' };

/** Runs in the page. */
function measure({ phone }) {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  const root = document.querySelector('.ds-guide--fullscreen') || document.body;
  const text = root.innerText;

  // Add buttons: words only.
  const addIcons = [];
  for (const b of document.querySelectorAll('button, a')) {
    if (!vis(b)) continue;
    const words = (b.textContent || '').trim();
    // Since 18 Nov an add row carries its own small cross (.ds-addrow-mark), drawn with no image; nothing else does.
    const adds = b.classList.contains('ds-addrow') || /^(add|start a new|something else|save a new)\b/i.test(words);
    if (adds && b.querySelector('svg, img, .ds-cross, .ds-bold-cross')) addIcons.push(label(b));
  }
  // A crosshair is only ever the close (turned), the spinner, the menu button or the orb.
  const plusCross = [...document.querySelectorAll('.ds-cross')].filter((c) => vis(c)
    && !c.classList.contains('ds-cross--close') && !c.classList.contains('ds-cross--turned') && !c.classList.contains('ds-cross--spin')
    && !c.closest('.ds-orb, .ds-sdial, .ds-loading, .ds-saving, .ds-floating-orb, .ds-fab, [class*="orb"], [class*="dial"], [role=status]')).map((c) => label(c.closest('button, a, div') || c));

  // Tap areas (a shared part may reach 44px through its ::before or ::after).
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, label, [role=radio], [role=checkbox], [role=switch], [role=tab], [role=option], summary')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2 || getComputedStyle(el).opacity === '0')) continue;
    if (el.tagName === 'LABEL' && !el.querySelector('input[type=checkbox], input[type=radio]')) continue;
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) continue;
    if (el.closest('label') && el.tagName !== 'LABEL' && el.tagName !== 'INPUT') continue;
    if (el.closest('.ds-ctable td, .ds-ctable th')) continue;
    // The tap area is the control's own box together with an invisible
    // ::after or ::before laid round it (every button since 18 Nov: 34px
    // high, 40px on a phone, in a 44px-high target as wide as it). Both
    // ways, the larger of the two must reach 44px.
    const reach = (p) => (p.content !== 'none' && p.position === 'absolute' && p.display !== 'none' && p.pointerEvents !== 'none')
      ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
    const [ra, rb] = [reach(getComputedStyle(el, '::after')), reach(getComputedStyle(el, '::before'))];
    const tapW = Math.max(b.width, ra.w, rb.w);
    const tapH = Math.max(b.height, ra.h, rb.h);
    if (tapW >= 43.5 && tapH >= 43.5) continue;
    if (el.matches('.ds-seg-btn') && b.height >= 38) continue;
    // A link inside a sentence is as tall as its line (WCAG's inline exception).
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.innerText.trim().length > el.innerText.trim().length + 12) continue;
    // The play icon beside the eye (Tim, 14 Nov, 09:28): 44px tall and 32px wide, so the two icons are 16px apart and their tap areas never overlap.
    if (el.matches('.ds-title-icons > .ds-play') && b.height >= 43.5 && b.width >= 31.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }

  // Eyes: once per page or section, beside the title. The play icon is not
  // an eye; with it, the pair's first icon is the one 12px after the title
  // (Tim, 14 Nov, 09:28: play, then the eye 16px on, measured by the
  // Health Check's own suites), so the eye's own gap is read from it.
  // The middle of the capitals on the title's last line, from the last
  // letter's own box and the font's metrics (as tests/phase2/title-info.mjs).
  const capMiddle = (letter, textEl) => {
    const cs = getComputedStyle(textEl);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const mt = ctx.measureText('H');
    const baseline = letter.top + (letter.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 + mt.fontBoundingBoxAscent;
    return baseline - mt.actualBoundingBoxAscent / 2;
  };
  const eyes = [...root.querySelectorAll('.ds-who--eye, .ds-who')].filter((e) => vis(e) && !e.matches('.ds-play') && !e.closest('.ds-modal, [role=dialog] [role=dialog]'));
  const eyeNotes = [];
  const perGroup = new Map();
  for (const eye of eyes) {
    const group = eye.closest('.ds-section, section, .ds-guide-page, .ds-fold, .dash-fold') || eye.closest('.ui-root');
    perGroup.set(group, (perGroup.get(group) || 0) + 1);
    const heading = eye.closest('h1, h2, h3, .ds-page-title-row, .ds-guide-question, .ds-guide-title, .ds-dialog-title');
    if (!heading) { eyeNotes.push(`${label(eye)}: not beside a title`); continue; }
    const title = heading.matches('.ds-page-title-row') ? heading.querySelector('.ds-page-title') : heading;
    // The title's last letter.
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!eye.contains(n) && !n.parentElement.closest('.ds-sr') && n.textContent.trim()) last = n;
    if (!last) { eyeNotes.push(`${label(eye)}: no title words`); continue; }
    const end = last.textContent.replace(/\s+$/, '').length;
    const range = document.createRange();
    range.setStart(last, Math.max(0, end - 1));
    range.setEnd(last, end);
    const letter = range.getBoundingClientRect();
    const pair = eye.closest('.ds-title-icons')?.querySelector('.ds-play');
    const svg = ((pair && vis(pair)) ? pair : eye).querySelector('svg') || eye;
    const icon = svg.getBoundingClientRect();
    const sameLine = Math.abs((icon.top + icon.height / 2) - (letter.top + letter.height / 2)) < letter.height;
    // Letter-spacing leaves space after the last letter: it isn't part of the gap.
    const ls = parseFloat(getComputedStyle(last.parentElement).letterSpacing) || 0;
    const gap = icon.left - (letter.right - ls);
    const off = icon.top + icon.height / 2 - capMiddle(letter, last.parentElement);
    if (!sameLine) eyeNotes.push(`${label(title)}: the eye is on its own line`);
    else {
      // 12px from the letter's ink to the eye's visible edge (read from the pixels by the UI tester,
      // 14 Nov; tokens.css --icon-title-gap): the letter's box ends about 1px after its ink in a
      // sentence and about 2px after it in spaced capitals, so box to box it is 11px and 10px.
      const want = ls > 0 ? 10 : 11;
      if (Math.abs(gap - want) > 1) eyeNotes.push(`${label(title)}: the eye is ${gap.toFixed(1)}px after the last letter’s box (${want} ±1)`);
      if (Math.abs(off) > 0.5) eyeNotes.push(`${label(title)}: the eye is ${off.toFixed(2)}px off the middle of the capitals (±0.5)`);
    }
  }
  for (const [group, n] of perGroup) if (n > 1) eyeNotes.push(`${label(group.querySelector('h1, h2, h3, .ds-guide-question') || group)}: ${n} eyes in one page or section`);

  // Titles in capitals: 3 words at most.
  const longTitles = [...root.querySelectorAll('h1, h2, h3, .ds-page-title, .ds-section-title')].filter((h) => vis(h) && getComputedStyle(h).textTransform === 'uppercase')
    .map((h) => (h.childNodes.length ? [...h.childNodes].filter((n) => !(n.nodeType === 1 && n.matches('.ds-page-aside, .ds-sr'))).map((n) => n.textContent).join('') : h.textContent).replace(/\s+/g, ' ').trim())
    // One name is allowed its four words: "Questions to start with:" is a
    // results section's name in approved M10 (version 5.6, 13 Nov), drawn in
    // the same small capitals as "Trust" above it (the mock-up wins; for Tim to confirm).
    // The Health Check's own names, as approved M7b and M7 draw them: the
    // page title STRATEGIC ALIGNMENT HEALTH CHECK (Tim, 13 Nov, 21:40 and
    // 23:08: the agreed exception), and its results' and Compare's section
    // names in small capitals.
    .filter((t) => t.split(' ').filter(Boolean).length > 3 && !['questions to start with:', 'questions to start with', 'strategic alignment health check', 'strategic importance against progress', 'projects added and removed'].includes(t.toLowerCase()));

  // The menu button never sits over a logo or content.
  const over = [];
  const btn = document.querySelector('.hdr-menu');
  if (btn && vis(btn) && !phone) {
    const b = btn.getBoundingClientRect();
    for (const el of document.querySelectorAll('img, svg, h1, h2, p, a, button, input')) {
      if (btn.contains(el) || el.contains(btn) || !vis(el) || el.closest('#site-menu, .ds-dmenu-wrap')) continue;
      const r = el.getBoundingClientRect();
      if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) over.push(label(el));
    }
  }
  // No repeated second line under an answer (Tim, 11 Nov, 12:51): a grey
  // second line may only add something the answer can't say. It repeats the
  // answer when, with the small words taken out, everything it says is
  // already in the answer (or the other way round), or most of it is.
  // (The same rule as repeatsItsAnswer in tests/performance/second-lines.test.mjs: keep the two alike.)
  const SMALL = new Set(['i', 'i’ll', "i'll", 'i’m', "i'm", 'it', 'its', 'it’s', 'the', 'a', 'an', 'my', 'me', 'to', 'is', 'are', 'be', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'this', 'that', 'need', 'want', 'will', 'do', 'eg', 'e', 'g', 'each', 'with', 'your', 'you']);
  const NOT = new Set(['not', 'no', 'never', 'without', 'don’t', "don't", 'won’t', "won't", 'can’t', "can't"]);
  const tokens = (t) => String(t ?? '').toLowerCase().replace(/[“”"().,:;!?/–—-]/g, ' ').split(/\s+/).filter(Boolean);
  const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w).replace(/e$/, '').replace(/([b-df-hj-np-tv-z])\1$/, '$1');
  const wordsOf = (t) => [...new Set(tokens(t).filter((w) => !SMALL.has(w)).map(stem).filter((w) => w && !SMALL.has(w)))];
  const repeats = [];
  for (const answer of root.querySelectorAll('.ds-answer, .ds-seg-btn, .ds-level-row, [role=radio], [role=option], [role=checkbox].ds-answer, .opts5 button, .ddl button')) {
    if (!vis(answer)) continue;
    const note = answer.querySelector('.ds-answer-note, .ds-dd-hint, small, .ds-pick-detail');
    if (!note || !vis(note)) continue;
    const second = note.innerText.replace(/\s+/g, ' ').trim();
    const first = answer.innerText.replace(/\s+/g, ' ').trim().replace(second, '').trim();
    if (!first || !second) continue;
    if (tokens(first).join(' ') === tokens(second).join(' ')) { repeats.push(`"${first.slice(0, 40)}" / "${second.slice(0, 40)}"`); continue; }
    if (tokens(first).some((w) => NOT.has(w)) !== tokens(second).some((w) => NOT.has(w))) continue;
    const a = wordsOf(first);
    const b = wordsOf(second);
    if (!a.length || !b.length) continue;
    const shared = b.filter((w) => a.includes(w)).length;
    const inAnswer = shared / b.length; // how much of the second line the answer already says
    const ofAnswer = a.filter((w) => b.includes(w)).length / a.length; // how much of the answer the second line says again
    if (inAnswer >= 0.75 || (ofAnswer >= 0.75 && shared >= 2)) repeats.push(`"${first.slice(0, 40)}" / "${second.slice(0, 40)}"`);
  }

  const page = document.querySelector('.ui-root') || document.body;
  const heading = document.querySelector('.ds-page-title, .ds-guide-question, .ds-guide-title, .ds-hub-page h1, h1');
  return {
    text,
    addIcons,
    plusCross,
    small,
    eyeNotes,
    longTitles,
    over,
    repeats,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    background: getComputedStyle(document.documentElement).backgroundColor,
    pageBackground: getComputedStyle(page).backgroundColor,
    textColour: heading ? getComputedStyle(heading).color : null,
  };
}

const browser = await chromium.launch();
// With no portal page asked for (ONLY=^health-check, or the chevrons' own parts), nothing signs in.
for (const width of PAGES.length ? WIDTHS : []) {
  for (const mode of ['light', 'dark']) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: MOTION });
    // The device's text-size setting, as a root size (16px is standard), on every page it opens.
    if (SCALE !== 1) await context.addInitScript((px) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html{font-size:${px}px !important}`; document.head.appendChild(st); }); }, 16 * SCALE);
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
      if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
      if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
      // A guest's link: the one question the start page asks, answered as migration 042 would.
      if (/\/rpc\/guest_link_info/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tool: 'grow', tool_label: 'Get unstuck', coach_name: M9.coach, open: true }) });
      if (/\/rpc\/guest_/.test(url)) return route.abort();
      // The first-time builder needs a person with no plan: every read is
      // answered empty for that page only (nothing in the database is touched).
      if (emptyReads && route.request().method() === 'GET' && /\/rest\/v1\/(?!person_settings|profiles)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      // The inside Health Check's own read of its rows: M7's teams, or none (and it never writes here).
      if (insideRows && /\/rest\/v1\/decisions\?.*tool_type=eq\.strategic-alignment/.test(url) && route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(insideRows) });
      if (insideRows && /\/rest\/v1\/decisions/.test(url) && route.request().method() !== 'GET') return route.abort();
      if (emptyReads && /\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (emptyReads && route.request().method() !== 'GET' && /\/rest\/v1\//.test(url)) return route.abort();
      return route.fallback();
    });
    let emptyReads = false;
    let insideRows = null;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(/welcome/, { timeout: 30000 });

    for (const [name, path, act] of PAGES) {
      const tag = `${name} ${width}px ${mode}`;
      errors.length = 0;
      try {
        // A guided tool opened on one step: its saved place is set first.
        const [kind, at] = /^(review|build|unstuck|team|wash):\d+$/.test(act || '') ? act.split(':') : [];
        if ((act || '').startsWith('guest:')) {
          // What a guest's tab keeps of the link: nothing yet (the start), or a finished plan (the end).
          await page.evaluate(({ end, token, visit, plan, email, coach }) => {
            const key = `clarity-guest:${token}`;
            if (!end) { sessionStorage.removeItem(key); return; }
            sessionStorage.setItem(key, JSON.stringify({ visit, email, tool: 'grow', toolLabel: 'Get unstuck', coachName: coach, phase: 'end', copySent: true, item: { id: '33333333-3333-4333-8333-333333333333', plan, status: 'completed' } }));
          }, { end: act === 'guest:end', token: GUEST_TOKEN, visit: GUEST_VISIT, plan: UNSTUCK_PLAN, email: M9.guestEmail, coach: M9.coach });
        }
        if (act === 'travel') {
          // The Travel plan's plans and peak moments, kept on the device as the app keeps them until 048.
          await page.waitForFunction(() => /"id":"[0-9a-f-]{36}"/.test(localStorage.getItem('clarity-portal-auth') || ''), null, { timeout: 15000 });
          await page.evaluate((T) => {
            const uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id;
            localStorage.setItem(`clarity-travel-plans-local:${uid}`, JSON.stringify({ plans: { [T.plan.id]: T.plan, [T.short.id]: T.short, [T.west.id]: T.west, [T.now.id]: T.now }, ticks: {} }));
            localStorage.setItem(`clarity-peak-moments-local:${uid}`, JSON.stringify({ moments: Object.fromEntries(T.moments.map((m) => [m.id, m])), reviews: {}, leadUps: {}, shareWork: false }));
            localStorage.setItem('clarity-travel-plans-not-yet', String(Date.now()));
            localStorage.setItem('clarity-peak-moments-not-yet', String(Date.now()));
          }, TRAVEL);
        }
        emptyReads = kind === 'build';
        if (kind) {
          // The person's page copies carry their id: wait until one is on the device.
          // (Or the sign-in kept on the device, which always has it: the copies
          // are cleared after each guided screen, and are only written again
          // while the device is still being warmed.)
          await page.waitForFunction(() => Object.keys(localStorage).some((x) => /^clarity-[a-z-]+:[0-9a-f-]{36}(:|$)/.test(x)) || /"id":"[0-9a-f-]{36}"/.test(localStorage.getItem('clarity-portal-auth') || ''), null, { timeout: 15000 });
          if (kind === 'wash') {
            // Away from the tool first (a plain file of the portal's own): the wash screen before this
            // one keeps its own copy of the wash as it closes, and this tab's own copy wins.
            await page.goto(`${APP}/version.json`);
            await page.evaluate(() => { for (const x of Object.keys(localStorage)) if (x.includes(':emotional-wash:')) localStorage.removeItem(x); });
          }
          await page.evaluate(({ kind: k, at: n, plan, team, wash, washDone }) => {
            // The person's id, from any of their page copies on the device.
            let uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
            if (!uid) { try { uid = JSON.parse(localStorage.getItem('clarity-portal-auth')).user.id; } catch { /* none */ } }
            for (const x of Object.keys(localStorage)) if (x.startsWith('clarity-cache:') && k === 'build') localStorage.removeItem(x);
            if (k === 'team') {
              // The Team performance check carries on from the check kept on the device, at the step it was left on.
              localStorage.setItem(`clarity-draft:${uid}:team-check:new`, JSON.stringify({ v: { id: '77777777-7777-4777-8777-777777777777', check: team, status: 'new', saved: false, createdAt: null, finishedAt: null }, at: Date.now() }));
              localStorage.setItem(`ds-guide:team-check-${uid}-new`, JSON.stringify({ index: Number(n), skipped: [] }));
              localStorage.setItem('clarity-tool-answers-not-yet', String(Date.now()));
              return;
            }
            if (k === 'wash') {
              // The Emotional wash carries on from the wash kept on the device, at the step it was left on.
              localStorage.setItem(`clarity-draft:${uid}:emotional-wash:new`, JSON.stringify({ v: { id: '88888888-8888-4888-8888-888888888888', wash: Number(n) === 17 ? washDone : wash, status: 'new', saved: false, createdAt: null, finishedAt: null }, at: Date.now() }));
              localStorage.setItem(`ds-guide:emotional-wash-${uid}-new`, JSON.stringify({ index: Number(n), skipped: [] }));
              localStorage.setItem('clarity-tool-answers-not-yet', String(Date.now()));
              return;
            }
            if (k === 'unstuck') {
              // Get unstuck carries on from its draft on the device, at the step it was left on.
              localStorage.setItem(`clarity-draft:${uid}:get-unstuck:new`, JSON.stringify({ v: { id: '44444444-4444-4444-8444-444444444444', plan, status: 'new', saved: false }, at: Date.now() }));
              localStorage.setItem(`ds-guide:get-unstuck-${uid}-new`, JSON.stringify({ index: Number(n), skipped: [] }));
              return;
            }
            localStorage.setItem(`ds-guide:${k === 'review' ? `performance-sprint-review-${uid}` : `performance-plan-build-${uid}`}`, JSON.stringify({ index: Number(n), skipped: [] }));
          }, { kind, at, plan: UNSTUCK_PLAN, team: TEAM_CHECK, wash: m10Wash('steps'), washDone: m10Wash('sum') });
        }
        insideRows = act === 'hc:m7' ? m7Rows(null) : act === 'hc:empty' ? [] : null;
        await page.goto(`${APP}${path}`);
        if (insideRows) await page.waitForSelector('.ds-page-title, .ds-guide-question', { timeout: 20000 });
        if (kind === 'review') {
          await page.getByRole('button', { name: 'Review it now' }).click({ timeout: 15000 }).catch(() => null);
        }
        if (kind) {
          await page.waitForSelector(act === 'team:16' || act === 'wash:17' ? '.ds-guide-title' : '.ds-guide-question', { timeout: 20000 });
          const want = { 'review:1': 'What worked best in this sprint?', 'review:2': 'What would make the next sprint even better?', 'build:4': 'Which days do you work?', 'unstuck:0': 'What do you want to achieve?', 'unstuck:1': 'What’s in the way of', 'unstuck:3': 'What could you do to reach', 'unstuck:6': 'Here’s your plan', 'team:0': 'Who reports to you?', 'team:1': 'How much does “Priya Shah” trust you as their leader?', 'team:16': 'YOUR TEAM', 'wash:0': 'What happened?', 'wash:2': 'Which words fit the feeling?', 'wash:4': 'What story are you telling yourself', 'wash:5': 'Is “The chair has never rated me” true?', 'wash:8': 'How will you wash “The chair has never rated me”?', 'wash:16': 'How will you wash “I need to win the board back', 'wash:17': 'YOUR WASH' }[act];
          const got = (await page.locator('.ds-guide-question, .ds-guide-title').first().innerText()).replace(/\s+/g, ' ').trim();
          pass(`${tag}: opened on "${want}"`, got.toUpperCase().startsWith(want.toUpperCase()), got);
          const eyes = await page.locator('.ds-guide-question .ds-who, .ds-guide-question .ds-page-aside, .ds-guide-title .ds-who').count();
          // Get unstuck shows the eye on its first step and on Your plan only (Tim, 13 Nov, 09:32).
          if ((kind === 'unstuck' && at !== '0' && at !== '6') || act === 'team:1' || (kind === 'wash' && at !== '0' && at !== '17')) pass(`${tag}: no eye on a middle step`, eyes === 0, `${eyes}`);
          else pass(`${tag}: the eye is inside the heading`, eyes >= 1, `${eyes}`);
        }
        await page.waitForLoadState('networkidle').catch(() => null);
        await page.evaluate(() => document.fonts.ready);
        await sleep(1200);
        if (act === 'menu') {
          // The phone bar's menu button shows up to 768px wide, the header's above it.
          await page.locator('.ds-bar-menu:visible, .hdr-menu:visible').first().click();
          await sleep(700);
        }
        const fonts = await page.evaluate(() => [document.fonts.check('16px "DM Sans"'), document.fonts.check('16px Nekst')]);
        pass(`${tag}: the real fonts are loaded`, fonts[0] && fonts[1], JSON.stringify(fonts));
        const r = await page.evaluate(measure, { phone });
        pass(`${tag}: no icon in any add button`, r.addIcons.length === 0, r.addIcons.join('; '));
        pass(`${tag}: no crosshair used as a plus`, r.plusCross.length === 0, r.plusCross.slice(0, 4).join('; '));
        pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 6).join('; '));
        pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
        // Every button in the new style, its words on one line and whole, and one coral button (Tim, 18 Nov).
        const btns = await page.evaluate(buttonProblems, { phone, scale: SCALE });
        pass(`${tag}: every button in the new style, its words whole and inside its card, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 5).join('; '));
        const uneven = await page.evaluate(sideBySide);
        pass(`${tag}: boxes side by side are one height (button check)`, uneven.length === 0, uneven.slice(0, 4).join('; '));
        const nekst = await page.evaluate(nekstInControls);
        pass(`${tag}: no Nekst inside any control (button check)`, nekst.length === 0, nekst.slice(0, 5).join('; '));
        // One controls family (Tim, 22 Nov; design reference 22 Nov): the gliding switch is the one toggle, the quiet precision switch, no pills, buttons 40px (44px on a phone) with 8px corners, no Nekst, one coral button.
        const family = await page.evaluate(controlsFamily, { phone, scale: SCALE });
        pass(`${tag}: one controls family (button check; ${family.toggles} toggles read)`, family.problems.length === 0, family.problems.slice(0, 5).join('; '));
        const sides = await page.evaluate(sideLines);
        pass(`${tag}: no thick coloured side line (button check)`, sides.length === 0, sides.slice(0, 5).join('; '));
        // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the thin line (tidy pass follow-up 1; Tim, 18 Nov, and 12:30).
        const backs = await page.evaluate(backGaps);
        pass(`${tag}: Back's chevron is 10px from its words (button check; ${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
        const imp = await page.evaluate(importantMarks);
        pass(`${tag}: Important is the soft coral tick box edge or the thin line, and nothing else (button check; ${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
        const doubled = await page.evaluate(doubledRules);
        pass(`${tag}: no line under a heading over rows with their own lines (button check)`, doubled.length === 0, doubled.slice(0, 4).join('; '));
        const folds = await page.evaluate(chevronOnlyFolds);
        pass(`${tag}: every fold opens from its whole heading row (button check)`, folds.length === 0, folds.slice(0, 4).join('; '));
        pass(`${tag}: at most one eye per page or section, beside its title`, r.eyeNotes.length === 0, r.eyeNotes.slice(0, 4).join('; '));
        const numbered = /Performance Sprint \d/.exec(r.text);
        pass(`${tag}: no "Performance Sprint" followed by a number`, !numbered, numbered?.[0]);
        // A person's own objective (M7's invented "…above 9 out of 10.") is their words, not a rating the portal shows.
        const ownWords = insideRows ? await page.evaluate(() => [...document.querySelectorAll('.hc-objective')].map((e) => e.innerText).join('\n')) : '';
        const rating = /out of 10\b|\b\d+(\.\d+)?\/10\b|\b1 to 5\b|rated 1\b/i.exec(ownWords ? r.text.split(ownWords.trim()).join(' ') : r.text);
        pass(`${tag}: no numbered ratings`, !rating, rating ? `"${r.text.slice(Math.max(0, rating.index - 30), rating.index + 30).replace(/\n/g, ' ')}"` : '');
        pass(`${tag}: no second line that repeats its answer`, r.repeats.length === 0, r.repeats.slice(0, 4).join('; '));
        const lowEdges = await page.evaluate(outlinedEdges);
        pass(`${tag}: every outlined edge reaches 3 to 1`, lowEdges.length === 0, lowEdges.slice(0, 6).join('; '));
        // Two chart dots that sit close share part of their 44px tap circles: a chart's marks are where the answers put them (as the Health Check's own suites accept).
        const shared = (await page.evaluate(overlappingTaps)).filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
        pass(`${tag}: no two tap areas overlap`, shared.length === 0, shared.slice(0, 6).join('; '));
        // A toast never covers a link or button fixed to the screen (tidy pass item 2).
        const covered = await page.evaluate(toastCovers);
        pass(`${tag}: a toast covers no button or link`, covered.length === 0, covered.slice(0, 4).join('; '));
        const early = await page.evaluate(questionsBeforeCharts);
        pass(`${tag}: Questions to start with never come before a chart`, early.length === 0, early.slice(0, 4).join('; '));
        // A pop-up holds one short line; longer explanations open in the side panel (Tim, 16 Nov, 23:31).
        const pops = await page.evaluate(checkPopups);
        pass(`${tag}: every pop-up is one short line, and no ⓘ sits in a list row (${pops.checked} read)`, pops.problems.length === 0, pops.problems.slice(0, 4).join('; '));
        pass(`${tag}: no title in capitals over 3 words`, r.longTitles.length === 0, r.longTitles.join('; '));
        const old = /plan my day|review my day|hardware and software check-in|monthly check-in|first check-in|performance evidence/i.exec(r.text);
        pass(`${tag}: no old names`, !old, old?.[0]);
        pass(`${tag}: the background and text match the ${mode} setting`, r.theme === mode && r.background === BACKGROUND[mode] && (r.textColour == null || r.textColour === TEXT[mode]), `${r.theme} ${r.background} ${r.textColour}`);
        pass(`${tag}: the menu button sits over nothing`, r.over.length === 0, r.over.slice(0, 3).join('; '));
        pass(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
        if (out && mode === 'light') await page.screenshot({ path: join(out, `${name}-${width === 1280 ? '1280' : width === 390 ? '390x844' : width}.png`), fullPage: true });
        // Anything that opens on the same page keeps your place (Tim, 13
        // Nov): each reveal is pressed at the foot of the screen. Once per
        // width is enough (the two modes lay out the same).
        if (mode === 'dark' && act !== 'menu') {
          const reveals = await page.evaluate(checkReveals);
          revealsChecked += reveals.checked;
          pass(`${tag}: what opens in place keeps your place and shows (${reveals.checked} pressed)`, reveals.problems.length === 0, reveals.problems.slice(0, 5).join('; '));
        }
        if (act === 'menu') await page.keyboard.press('Escape');
        insideRows = null;
        if (kind) await page.evaluate(() => { for (const x of Object.keys(localStorage)) if (x.startsWith('ds-guide:performance-') || x.startsWith('ds-guide:get-unstuck-') || x.startsWith('ds-guide:team-check-') || x.startsWith('ds-guide:emotional-wash-') || x.startsWith('clarity-cache:') || x.startsWith('clarity-draft:')) localStorage.removeItem(x); });
        emptyReads = false;
      } catch (e) {
        emptyReads = false;
        pass(`${tag}: opened`, false, e.message.split('\n')[0]);
      }
    }
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// The outside Health Check (Tim, 10 Nov, 23:22): it follows the person's
// device, light or dark, like every other page. Its own page
// (health-check.html, which Vercel serves for /health-check/*) is opened with
// invented answers and the two database calls answered here, so nothing is
// read or saved anywhere: the welcome screen, signing in, the first question
// and the results, at both sizes, on a device set to light and one set to
// dark. Then the portal's own /health-check route, which must follow the
// device too, even when the portal on this device is set the other way.
const HC_ONLY = !ONLY || ONLY.test('health-check');
// The mock-up's own invented answers (Kestrel Group), for the portal's own older route below.
const hcAnswers = (complete) => (complete ? hcKestrel() : {});
const HC_DIALOG = '[role=dialog]:not(.ds-guide)';
const HC_DONE = { complete: true, step: { screen: 'done' } };
const hcRows = (p) => p.locator('button.hc-prow').first().waitFor({ timeout: 15000 });
const hcBegin = async (p) => { await p.getByRole('button', { name: 'Begin the Health Check' }).click(); await p.locator('.ds-guest-question').waitFor({ timeout: 10000 }); };
// Every screen of the outside page (M7b version 51's switcher): [name, the page's options, how to reach it, the layer on top]
const HC_SCREENS = [
  ['welcome', { watched: false }, async () => {}, '.ds-guest'],
  ['welcome-watched', { watched: true }, async () => {}, '.ds-guest'],
  ['sign-in', {}, hcBegin, '.ds-guest'],
  ['return-visit', { step: HC_STEPS.objective }, async (p, s) => { await hcSignIn(p, s); await p.locator('.ds-guide-close').click(); await p.getByRole('button', { name: 'Pick up where you left off' }).waitFor({ timeout: 10000 }); await sleep(5500); }, '.ds-guest'],
  ['first-question', { step: HC_STEPS.objective }, hcSignIn, '.ds-guide'],
  ['success-factors', { step: HC_STEPS.csf }, hcSignIn, '.ds-guide'],
  ['weights', { step: HC_STEPS.weight }, hcSignIn, '.ds-guide'],
  ['projects', { step: HC_STEPS.projects }, hcSignIn, '.ds-guide'],
  ['contribution', { step: HC_STEPS.contrib }, hcSignIn, '.ds-guide'],
  ['dates', { step: HC_STEPS.when }, hcSignIn, '.ds-guide'],
  ['progress', { step: HC_STEPS.progress }, hcSignIn, '.ds-guide'],
  ['resource-required', { step: HC_STEPS.resource }, hcSignIn, '.ds-guide'],
  ['results', HC_DONE, async (p, s) => { await hcSignIn(p, s); await hcRows(p); }, '.ds-guide'],
  ['example-report', {}, async (p) => { await hcBegin(p); await p.getByRole('button', { name: 'See an example report' }).click(); await hcRows(p); }, '.ds-guest'],
  ['quick-guide', HC_DONE, async (p, s) => { await hcSignIn(p, s); await hcRows(p); await p.locator('.ds-guide-title .ds-play').click(); await p.locator(`${HC_DIALOG} .hc-vcard`).waitFor({ timeout: 10000 }); await sleep(600); await p.evaluate(() => document.querySelector('[role=dialog] video')?.pause()); }, HC_DIALOG],
  ['who-can-see-this', { step: HC_STEPS.objective }, async (p, s) => { await hcSignIn(p, s); await p.locator('.ds-guide-question .ds-who:not(.ds-play)').click(); await p.locator(HC_DIALOG).waitFor({ timeout: 10000 }); }, HC_DIALOG],
  ['download-pdf', HC_DONE, async (p, s) => { await hcSignIn(p, s); await hcRows(p); await p.locator('.ds-guide-next').click(); await p.locator(HC_DIALOG).waitFor({ timeout: 10000 }); }, HC_DIALOG],
];

/** Runs in the Health Check's own page. `layer`: the part on top (the page, the guided tool, or an open panel). */
function measureHealthCheck({ layer }) {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  const top = [...document.querySelectorAll(layer)].filter(vis).pop() || document.body;
  // The page itself: the guest frame, or the guided tool that covers the screen.
  const hc = [...document.querySelectorAll('.ds-guide--fullscreen, .ds-guest')].filter(vis).pop() || document.body;
  const small = [];
  for (const el of top.querySelectorAll('button, a, select, textarea, input, [role=radio], [role=checkbox], [role=switch], [role=option], [role=slider], [role=combobox], summary, .hc-dot')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.matches('.hc-dot') ? el.querySelector('.hc-dot-tap').getBoundingClientRect() : el.getBoundingClientRect();
    // The tap area is the control's own box together with an invisible
    // ::after or ::before laid round it (every button since 18 Nov: 34px
    // high, 40px on a phone, in a 44px-high target as wide as it). Both
    // ways, the larger of the two must reach 44px.
    const reach = (p) => (p.content !== 'none' && p.position === 'absolute' && p.display !== 'none' && p.pointerEvents !== 'none')
      ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
    const [ra, rb] = [reach(getComputedStyle(el, '::after')), reach(getComputedStyle(el, '::before'))];
    const tapW = Math.max(b.width, ra.w, rb.w);
    const tapH = Math.max(b.height, ra.h, rb.h);
    if (tapW >= 43.5 && tapH >= 43.5) continue;
    // A pill in the segmented control reaches 44px high through its ::after, and is as wide as its word.
    const after = getComputedStyle(el, '::after');
    if (el.matches('.ds-seg-btn') && b.width >= 43.5 && (parseFloat(after.height) || 0) >= 43.5) continue;
    // A link inside a sentence is as tall as its line (WCAG's inline exception).
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.innerText.trim().length > el.innerText.trim().length + 12) continue;
    // The play icon beside the eye (Tim, 14 Nov, 09:28): 44px tall and 32px wide, so the two icons are 16px apart and their tap areas never overlap.
    if (el.matches('.ds-title-icons > .ds-play') && b.height >= 43.5 && b.width >= 31.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  // The first solid colour behind the page.
  const solid = (el) => { for (let x = el; x; x = x.parentElement) { const c = getComputedStyle(x).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return null; };
  const heading = [...hc.querySelectorAll('h1, h2, .ds-guide-question, .ds-guide-title')].find(vis);
  const scroller = top.querySelector('.ds-guide-scroll, .ds-dialog-body') || top;
  return {
    small,
    sideways: Math.max(document.documentElement.scrollWidth - window.innerWidth, scroller.scrollWidth - scroller.clientWidth),
    background: solid(hc),
    behind: getComputedStyle(document.documentElement).backgroundColor,
    textColour: heading ? getComputedStyle(heading).color : null,
    theme: document.documentElement.getAttribute('data-theme'),
    text: hc.innerText,
  };
}

if (HC_ONLY) {
  for (const width of WIDTHS) {
    for (const mode of ['light', 'dark']) {
      const phone = width < 600;
      for (const [screen, opts, reach, layer] of HC_SCREENS) {
        const tag = `health-check ${screen} ${width}px ${mode}`;
        let b = null;
        try {
          // Nothing leaves this machine: the two database calls and every /api/ call are answered by the
          // Health Check suites' own stand-ins (tests/healthcheck/hc-shared.mjs); everything else outside is stopped.
          // The portal on this device is set the other way: the Health Check has no such setting and follows the device.
          b = await hcPage(browser, width, mode, { ...opts, textTwice: SCALE === 2 || opts.textTwice, motion: MOTION !== 'reduce', storage: { 'clarity-colour-mode': mode === 'light' ? 'dark' : 'light' } });
          const { page } = b;
          await reach(page, b.session);
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(2, 2);
          await sleep(700);
          const r = await page.evaluate(measureHealthCheck, { layer });
          pass(`${tag}: the page and its text follow the device (${mode})`, r.background === BACKGROUND[mode] && r.behind === BACKGROUND[mode] && r.textColour === TEXT[mode] && r.theme === mode, `${r.background} ${r.behind} ${r.textColour} ${r.theme}`);
          pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 6).join('; '));
          pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
          const btns = await page.evaluate(buttonProblems, { phone, scale: SCALE });
          pass(`${tag}: every button in the new style, its words whole and inside its card, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 5).join('; '));
          const uneven = await page.evaluate(sideBySide);
          pass(`${tag}: boxes side by side are one height (button check)`, uneven.length === 0, uneven.slice(0, 4).join('; '));
          const nekst = await page.evaluate(nekstInControls);
          pass(`${tag}: no Nekst inside any control (button check)`, nekst.length === 0, nekst.slice(0, 5).join('; '));
          // One controls family (Tim, 22 Nov; design reference 22 Nov): the gliding switch is the one toggle, the quiet precision switch, no pills, buttons 40px (44px on a phone) with 8px corners, no Nekst, one coral button.
          const family = await page.evaluate(controlsFamily, { phone, scale: SCALE });
          pass(`${tag}: one controls family (button check; ${family.toggles} toggles read)`, family.problems.length === 0, family.problems.slice(0, 5).join('; '));
          const sides = await page.evaluate(sideLines);
          pass(`${tag}: no thick coloured side line (button check)`, sides.length === 0, sides.slice(0, 5).join('; '));
          // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the thin line (tidy pass follow-up 1; Tim, 18 Nov, and 12:30).
          const backs = await page.evaluate(backGaps);
          pass(`${tag}: Back's chevron is 10px from its words (button check; ${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
          const imp = await page.evaluate(importantMarks);
          pass(`${tag}: Important is the soft coral tick box edge or the thin line, and nothing else (button check; ${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
          const doubled = await page.evaluate(doubledRules);
          pass(`${tag}: no line under a heading over rows with their own lines (button check)`, doubled.length === 0, doubled.slice(0, 4).join('; '));
          const folds = await page.evaluate(chevronOnlyFolds);
          pass(`${tag}: every fold opens from its whole heading row (button check)`, folds.length === 0, folds.slice(0, 4).join('; '));
          pass(`${tag}: no old names (CSF, Critical Success Factor, “How it works”)`, !/\bCSFs?\b|Critical Success Factor|How it works/.test(r.text), (r.text.match(/.{0,30}(CSF|Critical Success Factor|How it works).{0,30}/) || [''])[0]);
          // Every outlined edge reaches 3 to 1 (rule 8a), and no two tap areas overlap. Two chart dots that sit
          // close share part of their 44px tap circles: a chart's marks are where the answers put them.
          const edges = await page.evaluate(outlinedEdges);
          pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.slice(0, 4).join('; '));
          const overlaps = (await page.evaluate(overlappingTaps)).filter((o) => !/^hc-dot .* \+ hc-dot /.test(o));
          pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.slice(0, 4).join('; '));
          const covered = await page.evaluate(toastCovers);
          pass(`${tag}: a toast covers no button or link`, covered.length === 0, covered.slice(0, 4).join('; '));
          // The summary opens with the visuals and the questions come last (Tim, 13 Nov; rule 29ar).
          const early = await page.evaluate(questionsBeforeCharts);
          pass(`${tag}: Questions to start with never come before a chart`, early.length === 0, early.slice(0, 4).join('; '));
          const pops = await page.evaluate(checkPopups);
          pass(`${tag}: every pop-up is one short line, and no ⓘ sits in a list row (${pops.checked} read)`, pops.problems.length === 0, pops.problems.slice(0, 4).join('; '));
          if (screen === 'results' || screen === 'example-report') {
            const order = await page.evaluate((own) => {
              const root = [...document.querySelectorAll('.ds-guide--fullscreen, .ds-guest')].pop();
              const top = (sel, words) => { const el = [...root.querySelectorAll(sel)].find((x) => !words || x.textContent.trim() === words); return el ? el.getBoundingClientRect().top + window.scrollY : null; };
              const head = (words) => top('.ds-results-head', words);
              return [top('.ds-headline'), top('.hc-chart svg'), head('Projects'), top('.hc-objective'), head('Success Factors'), head('Questions to start with'), ...(own ? [head('Keep your results')] : [])];
            }, screen === 'results');
            pass(`${tag}: the headline, the chart, Projects, the Objective, the Success Factors, the questions${screen === 'results' ? ', then Keep your results' : ''}`, order.every((y, i) => y != null && (i === 0 || y > order[i - 1])), order.map((y) => (y == null ? 'missing' : Math.round(y))).join(', '));
          }
          pass(`${tag}: no console errors`, b.problems.length === 0, b.problems.slice(0, 2).join(' | '));
          pass(`${tag}: nothing asked of an outside address`, b.session.outside.length === 0, [...new Set(b.session.outside)].slice(0, 3).join(' | '));
          if (out) await page.screenshot({ path: join(out, `health-check-${screen}-${width === 1280 ? '1280' : width === 390 ? '390x844' : width}-${mode}.png`), fullPage: true });
        } catch (e) {
          pass(`${tag}: opened`, false, e.message.split('\n')[0]);
        }
        if (b) await b.ctx.close();
      }
      // The portal's own /health-check route (kept for rolling back): the device's mode, not the portal's saved choice.
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', colorScheme: mode });
      try {
        await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
        await context.addInitScript((other) => { try { localStorage.setItem('clarity-colour-mode', other); } catch { /* blocked */ } }, mode === 'light' ? 'dark' : 'light');
        const page = await context.newPage();
        await page.goto(`${APP}/health-check/tok-calm-rules-0000000000000000000000000000`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const got = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), background: getComputedStyle(document.documentElement).backgroundColor }));
        pass(`health-check, the portal's own route ${width}px ${mode}: follows the device, not the portal's saved choice`, got.theme === mode && got.background === BACKGROUND[mode], `${got.theme} ${got.background}`);
        // Typed with capitals, the app opens the same page: it follows the device too (break-it tester, 11 Nov).
        await page.goto(`${APP}/Health-Check/tok-calm-rules-0000000000000000000000000000`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const capitals = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        pass(`health-check, the portal's own route ${width}px ${mode}: the same with capitals in the address`, capitals === mode, capitals);
        // Any other page still follows the saved choice (set the other way here).
        await page.goto(`${APP}/auth/login`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const elsewhere = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        pass(`health-check ${width}px ${mode}: every other page keeps the saved choice`, elsewhere === (mode === 'light' ? 'dark' : 'light'), elsewhere);
      } catch (e) {
        pass(`health-check, the portal's own route ${width}px ${mode}: opened`, false, e.message.split('\n')[0]);
      }
      await context.close();
    }
  }
}


// ---------------------------------------------------------------------------
// Chevrons centred on their text (Tim, 11 Nov, 14:36): every chevron beside
// one line of words sits on the middle of that text's x-height (lowercase)
// or of its capitals, within 0.5px, closed and open. Read from the screen's
// own pixels on a screen with two pixels to a point (tests/phase5/chevrons.mjs),
// on every page in scope at both sizes, with every fold and drop-down opened
// in turn, and on the outside Health Check.
const CHEVRONS = !ONLY || ONLY.test('chevrons');
// CHEV_PARTS=pages,health-check,old-route runs some of it (all three unless told).
const CHEV_PARTS = (process.env.CHEV_PARTS || 'pages,health-check,old-route').split(',');
if (CHEVRONS) {
  for (const width of [1280, 390]) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light', reducedMotion: 'reduce' });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
      if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
      if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
      // The inside Health Check reads M7's own teams (nothing in the database is read for it).
      if (/\/rest\/v1\/decisions\?.*tool_type=eq\.strategic-alignment/.test(url) && route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m7Rows(null)) });
      // Nothing is saved while folds are opened and closed.
      if (/supabase\.co\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fallback();
    });
    const page = await context.newPage();
    let measured = 0;
    if (CHEV_PARTS.includes('pages')) try {
      await page.goto(`${APP}/auth/login`);
      await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
      await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
      await page.keyboard.press('Enter');
      await page.waitForURL(/welcome/, { timeout: 30000 });
      const paths = [...new Set(PAGES_ALL.filter(([, , act]) => !act).map(([, path]) => path)), '/personal/plan', '/life-balance-review', '/get-unstuck', '/team-performance-check', '/emotional-wash',
        // The inside Health Check (M7): its teams, a version's results and Compare.
        ...PAGES_ALL.filter(([name]) => /^hc-inside-(teams|results|compare)$/.test(name)).map(([, path]) => path)]
        // CHEV_ONLY='emotional-wash|personal/reset' reads only the pages whose address matches.
        .filter((p) => !process.env.CHEV_ONLY || new RegExp(process.env.CHEV_ONLY).test(p));
      for (const path of paths) {
        const tag = `chevrons ${path} ${width}px`;
        try {
          await page.goto(`${APP}${path}`);
          await page.waitForLoadState('networkidle').catch(() => null);
          await page.evaluate(() => document.fonts.ready);
          await sleep(1000);
          const closed = await measureChevrons(page);
          measured += closed.length;
          pass(`${tag}: every chevron is centred on its text`, chevronsOff(closed).length === 0, chevronsOff(closed).slice(0, 4).join('; '));
          // Open each fold and drop-down in turn (a drop-down's list is measured, then closed again).
          let opened = 0;
          for (let i = 0; i < 14; i += 1) {
            const next = page.locator('[aria-expanded=false]:has(.ds-chevron)').first();
            if (!(await next.count())) break;
            const ok = await next.click({ timeout: 2000 }).then(() => true).catch(() => false);
            if (!ok) break;
            opened += 1;
            await sleep(350);
            if (await page.locator('[role=listbox]').count()) {
              const list = await measureChevrons(page);
              measured += list.length;
              pass(`${tag}: with a drop-down open, every chevron is centred on its text`, chevronsOff(list).length === 0, chevronsOff(list).slice(0, 4).join('; '));
              await page.keyboard.press('Escape');
              await sleep(250);
              break;
            }
          }
          if (opened) {
            await sleep(500);
            const open = await measureChevrons(page);
            measured += open.length;
            pass(`${tag}: with its folds open, every chevron is centred on its text`, chevronsOff(open).length === 0, chevronsOff(open).slice(0, 4).join('; '));
          }
        } catch (e) {
          pass(`${tag}: measured`, false, e.message.split('\n')[0]);
        }
      }
      // Back beside a guided tool's name (the Daily review's second screen; nothing is saved).
      try {
        await page.goto(`${APP}/daily-review`);
        await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
        for (let i = 0; i < 3 && !(await page.locator('.ds-guide-back').count()); i += 1) {
          await page.getByRole('button', { name: /^(Next|Skip)$/ }).first().click({ timeout: 3000 }).catch(() => null);
          await sleep(600);
        }
        await page.evaluate(() => document.fonts.ready);
        await sleep(600);
        const guide = (await measureChevrons(page)).filter((c) => c.label.startsWith('ds-guide-back'));
        measured += guide.length;
        pass(`chevrons, a guided tool's Back ${width}px: centred on the capitals of the tool's name`, guide.length === 1 && chevronsOff(guide).length === 0, guide.length ? chevronsOff(guide).join('; ') : 'Back was not found');
      } catch (e) {
        pass(`chevrons, a guided tool's Back ${width}px: measured`, false, e.message.split('\n')[0]);
      }
    } catch (e) {
      pass(`chevrons ${width}px: signed in`, false, e.message.split('\n')[0]);
    }
    if (CHEV_PARTS.includes('pages')) pass(`chevrons ${width}px: chevrons beside text were found and measured (${measured})`, measured >= (process.env.CHEV_ONLY ? 1 : 20), `${measured}`);
    await context.close();

    // The outside Health Check (rebuilt to M7b version 51): Back on the email and code screen, Back beside the
    // tool's name on a question, and the results' drop-downs, closed and open. Its stand-ins are the Health
    // Check suites' own (tests/healthcheck/hc-shared.mjs): nothing signs in and nothing is saved.
    if (CHEV_PARTS.includes('health-check')) {
      let hc = null;
      try {
        hc = await hcPage(browser, width, 'light', { complete: true, step: { screen: 'done' }, scale: 2 });
        const page2 = hc.page;
        await page2.getByRole('button', { name: 'Begin the Health Check' }).click();
        await page2.locator('.ds-guest-question').waitFor({ timeout: 10000 });
        await page2.evaluate(() => document.fonts.ready);
        await sleep(600);
        const signIn = await measureChevrons(page2);
        pass(`chevrons, Health Check email and code ${width}px: Back's chevron is centred on its word`, signIn.length >= 1 && chevronsOff(signIn).length === 0, signIn.length ? chevronsOff(signIn).join('; ') : 'no chevron found');
        await hcSignIn(page2, hc.session);
        await page2.locator('button.hc-prow').first().waitFor({ timeout: 15000 });
        // The pointer is moved off the page's parts: left where the last press was, it would be pointing
        // at a chart dot once the results are drawn, and the dot's pop-up would lie over a drop-down.
        await page2.mouse.move(2, 2);
        await sleep(700);
        const results = await measureChevrons(page2);
        pass(`chevrons, Health Check results ${width}px: every chevron is centred on its text (${results.length})`, results.length >= 2 && chevronsOff(results).length === 0, results.length ? chevronsOff(results).join('; ') : 'no chevron found');
        // A drop-down open (a laptop: its list opens under it and its arrow turns; a phone gets a bottom panel).
        if (!phone) {
          await page2.locator('.hc-ctl .ds-dd').first().click();
          await page2.getByRole('option').first().waitFor({ timeout: 5000 });
          await sleep(500);
          const open = await measureChevrons(page2);
          // (The open list lies over the drop-down under it, which is passed over as covered.)
          pass(`chevrons, Health Check results ${width}px: the same with a drop-down open`, open.length >= 1 && chevronsOff(open).length === 0, open.length ? chevronsOff(open).join('; ') : 'no chevron found');
          await page2.keyboard.press('Escape');
          await sleep(400);
        }
        // A question: Back beside the tool's name in capitals.
        await page2.getByRole('button', { name: 'Edit the objective' }).click();
        await page2.locator('.ds-guide-back').waitFor({ timeout: 10000 });
        await page2.mouse.move(2, 2);
        await sleep(700);
        const question = await measureChevrons(page2);
        pass(`chevrons, Health Check question ${width}px: Back's chevron is centred on the tool's name`, question.length >= 1 && chevronsOff(question).length === 0, question.length ? chevronsOff(question).join('; ') : 'no chevron found');
        // The dates: two drop-downs with their arrows.
        await page2.locator('.ds-guide-back').click();
        await page2.locator('button.hc-prow').first().waitFor({ timeout: 10000 });
        await sleep(500);
        await page2.locator('button.hc-prow').first().click();
        for (let i = 0; i < 4; i += 1) { await sleep(500); await page2.locator('.ds-answer[aria-checked=true]').click(); }
        await page2.locator('.hc-dates .ds-dd').first().waitFor({ timeout: 10000 });
        await page2.mouse.move(2, 2);
        await sleep(700);
        const dates = await measureChevrons(page2);
        pass(`chevrons, Health Check dates ${width}px: every chevron is centred on its text (${dates.length})`, dates.length >= 3 && chevronsOff(dates).length === 0, dates.length ? chevronsOff(dates).join('; ') : 'no chevron found');
      } catch (e) {
        pass(`chevrons, Health Check ${width}px: measured`, false, e.message.split('\n')[0]);
      }
      if (hc) await hc.ctx.close();
    }

    // The portal's own /health-check route (the older page, kept for rolling
    // back; Tim, 12 Nov): Back beside its word, and the results' sort arrows.
    const old = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'light', reducedMotion: 'reduce' });
    if (CHEV_PARTS.includes('old-route')) try {
      await old.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
        const url = route.request().url();
        const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (url.endsWith('/rpc/alignment_open')) return json({ ok: true, status: 'complete', current_step: null, data: hcAnswers(true), version: 1, updated_at: '2026-10-27 09:30:00.123', completed_at: '2026-10-27 09:30:00', client_label: 'Kestrel Group', coach_name: 'Tim' });
        if (url.endsWith('/rpc/alignment_save')) return json({ ok: true, version: 2, updated_at: '2026-10-27 10:00:00', status: 'complete' });
        return route.abort();
      });
      await old.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      const page3 = await old.newPage();
      await page3.goto(`${APP}/health-check/tok-calm-rules-0000000000000000000000000000`);
      await page3.locator('input[type=email]').waitFor({ timeout: 20000 });
      await page3.locator('input[type=email]').fill('sam.example@invented.test');
      await page3.locator('.al-otp-input').fill('ABC234');
      await page3.locator('form button[type=submit]').click();
      await page3.locator('.al-foot .ui-back-link').waitFor({ timeout: 15000 });
      await page3.evaluate(() => document.fonts.ready);
      await sleep(900);
      const list = await measureChevrons(page3);
      const back = list.filter((c) => c.label.startsWith('ui-back-link'));
      pass(`chevrons, the portal's own Health Check route ${width}px: Back's chevron is centred on its word`, back.length === 1 && chevronsOff(back).length === 0, back.length ? chevronsOff(back).join('; ') : 'Back was not found');
      pass(`chevrons, the portal's own Health Check route ${width}px: every chevron beside words is centred on them (${list.length})`, chevronsOff(list).length === 0, chevronsOff(list).slice(0, 4).join('; '));
      // Its results table sorts by a heading or a pill, whose arrow then shows beside the words.
      const sorter = page3.locator('.al-hb, .fpills-btn').first();
      if (await sorter.count()) {
        await sorter.click({ timeout: 3000 }).catch(() => null);
        await sleep(500);
        const sorted = (await measureChevrons(page3));
        const arrows = sorted.filter((c) => !c.label.startsWith('ui-back-link'));
        pass(`chevrons, the portal's own Health Check route ${width}px: the sort arrow is centred on its words (${arrows.length})`, chevronsOff(arrows).length === 0, chevronsOff(arrows).join('; '));
        if (process.env.CHEV_SHOW) console.log(`old route sorted ${width}: ${sorted.map((c) => `${c.label} ${c.off.toFixed(2)} ${c.capitals ? 'caps' : 'lower'} ${c.font}`).join(' | ')} || skipped: ${sorted.skipped.map((s) => `${s.label}: ${s.why}`).join(' | ')}`);
      } else if (process.env.CHEV_SHOW) console.log(`old route ${width}: no sort heading or pill on this screen`);
      if (process.env.CHEV_SHOW) console.log(`old route ${width}: ${list.map((c) => `${c.label} ${c.off.toFixed(2)}`).join(' | ')} || skipped: ${list.skipped.map((s) => `${s.label}: ${s.why}`).join(' | ')}`);
    } catch (e) {
      pass(`chevrons, the portal's own Health Check route ${width}px: measured`, false, e.message.split('\n')[0]);
    }
    await old.close();
  }
}

// ---------------------------------------------------------------------------
// The coach authenticator's screens (Phase 6a run 5; M26 seq 7): Enter your
// code (and its wait after 5 wrong codes), Set up your authenticator, Save
// your recovery codes, Lost your authenticator app?, You're in (and the
// 2-or-fewer line), My Account's Sign-in security (at rest and both of its
// current-code steps), and the owner's Reset authenticator panel on
// Settings, Coaches. Every screen but the last is stood in whole
// (tests/signin/coachWorld.mjs: an invented associate, Supabase's MFA, 053
// and the server's reset), so nothing signs in to the test project and no
// authenticator is enrolled. The Coaches page is the test coach's saved
// read-only sign-in with 049 to 053 and the server stood in
// (tests/coach/shared.mjs). ONLY=^coach-auth runs this part alone.
const COACH_AUTH = !ONLY || ONLY.test('coach-auth');
if (COACH_AUTH) {
  const { coachWorld } = await import('../signin/coachWorld.mjs');
  const code = (page) => page.getByRole('textbox', { name: 'Code', exact: true });
  const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
  const SCREENS = [
    ['coach-auth-code', { factor: 'verified' }, '/coach/sign-in/code', '.si-field'],
    ['coach-auth-code-wait', { factor: 'verified' }, '/coach/sign-in/code', '.si-field', async (page) => {
      for (let i = 1; i <= 5; i += 1) { await code(page).fill(`00000${i}`); await press(page, 'Sign in'); await sleep(350); }
      await page.getByText('That was 5 wrong codes in a row.').waitFor({ timeout: 10000 });
    }, /status of 422/],
    ['coach-auth-setup', { factor: 'none', codesMade: false, codesSaved: false }, '/coach/sign-in/set-up', '.si-qr svg'],
    ['coach-auth-codes', { factor: 'verified', aal: 'aal2', codesSaved: false }, '/coach/sign-in/recovery-codes', '.si-rc li'],
    ['coach-auth-lost', { factor: 'verified' }, '/coach/sign-in/help', '.si-field'],
    ['coach-auth-in', { factor: 'verified', codesLeft: 3 }, '/coach/sign-in/help', '.si-field', async (page, world) => {
      await page.getByLabel('Recovery code').fill(world.codes.find((c) => !c.used).code);
      await press(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('That recovery code is now used.').waitFor({ timeout: 10000 });
    }],
    ['coach-auth-low-codes', { factor: 'verified', codesLeft: 2 }, '/coach', null, async (page, world) => {
      await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 15000 });
      await code(page).fill(world.goodCode);
      await press(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('Make new codes in My Account').waitFor({ timeout: 10000 });
    }],
    ['coach-auth-security', { factor: 'verified', aal: 'aal2', codesLeft: 9 }, '/my-account/sign-in-security', '.si-srow'],
    ['coach-auth-security-codes', { factor: 'verified', aal: 'aal2', codesLeft: 9 }, '/my-account/sign-in-security', '.si-srow', async (page) => {
      await page.getByRole('button', { name: 'Make new codes' }).click();
      await code(page).waitFor();
    }],
    ['coach-auth-security-phone', { factor: 'verified', aal: 'aal2', codesLeft: 9 }, '/my-account/sign-in-security', '.si-srow', async (page) => {
      await page.getByRole('button', { name: 'Set up on a new phone' }).click();
      await code(page).waitFor();
    }],
    ['coach-auth-reset', null, '/coach/settings/coaches', null, async (page) => {
      await page.getByRole('button', { name: /^More for / }).first().click({ timeout: 25000 });
      await page.getByRole('menuitem', { name: 'Reset authenticator' }).click();
      await page.getByRole('dialog', { name: /Reset .*authenticator/i }).waitFor({ timeout: 10000 });
      // 053 stood in as "not there yet" (404 PGRST202): the browser notes it as a resource that didn't load.
    }, /status of 404/],
  ].filter(([name]) => !ONLY || ONLY.test(name));
  for (const width of WIDTHS) {
    for (const mode of ['light', 'dark']) {
      const phone = width < 600;
      for (const [name, world, path, wait, then, okError] of SCREENS) {
        const tag = `${name} ${width}px ${mode}${SCALE !== 1 ? ` text ×${SCALE}` : ''}`;
        let context;
        let store = null;
        try {
          if (world) {
            context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: MOTION, serviceWorkers: 'block' });
            await context.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
          } else {
            const { coachContext } = await import('../coach/shared.mjs');
            // coachContext knows 1440, 768 and 400 by name; any other width is passed as its viewport.
            context = await coachContext(browser, { size: phone ? 400 : { width, height: 900 }, theme: mode, reducedMotion: MOTION });
          }
          if (SCALE !== 1) await context.addInitScript((px) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html{font-size:${px}px !important}`; document.head.appendChild(st); }); }, 16 * SCALE);
          const w = world ? await coachWorld(context, world) : null;
          const page = await context.newPage();
          if (!world) {
            const { standIn } = await import('../coach/shared.mjs');
            store = await standIn(page, { role: 'owner', db: 'none' });
            await page.route('**/api/coach-auth-reset', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ran: false, message: 'Resetting an authenticator only works on the live site, so nothing has changed here.' }) }));
          }
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !(okError && okError.test(m.text()))) errors.push(m.text().slice(0, 160)); });
          await page.goto(`${APP}${path}`);
          if (wait) await page.waitForSelector(wait, { timeout: 20000 });
          if (then) await then(page, w);
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(1, 1);
          await sleep(800);
          const fonts = await page.evaluate(() => [document.fonts.check('16px "DM Sans"'), document.fonts.check('16px Nekst')]);
          pass(`${tag}: the real fonts are loaded`, fonts[0] && fonts[1], JSON.stringify(fonts));
          const r = await page.evaluate(measure, { phone });
          pass(`${tag}: no icon in any add button`, r.addIcons.length === 0, r.addIcons.join('; '));
          pass(`${tag}: no crosshair used as a plus`, r.plusCross.length === 0, r.plusCross.slice(0, 4).join('; '));
          pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 6).join('; '));
          pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
          const btns = await page.evaluate(buttonProblems, { phone, scale: SCALE });
          pass(`${tag}: every button in the new style, its words whole and inside its card, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 5).join('; '));
          const uneven = await page.evaluate(sideBySide);
          pass(`${tag}: boxes side by side are one height (button check)`, uneven.length === 0, uneven.slice(0, 4).join('; '));
          const nekst = await page.evaluate(nekstInControls);
          pass(`${tag}: no Nekst inside any control (button check)`, nekst.length === 0, nekst.slice(0, 5).join('; '));
          // One controls family (Tim, 22 Nov; design reference 22 Nov): the gliding switch is the one toggle, the quiet precision switch, no pills, buttons 40px (44px on a phone) with 8px corners, no Nekst, one coral button.
          const family = await page.evaluate(controlsFamily, { phone, scale: SCALE });
          pass(`${tag}: one controls family (button check; ${family.toggles} toggles read)`, family.problems.length === 0, family.problems.slice(0, 5).join('; '));
          const sides = await page.evaluate(sideLines);
          pass(`${tag}: no thick coloured side line (button check)`, sides.length === 0, sides.slice(0, 5).join('; '));
          // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the thin line (tidy pass follow-up 1; Tim, 18 Nov, and 12:30).
          const backs = await page.evaluate(backGaps);
          pass(`${tag}: Back's chevron is 10px from its words (button check; ${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
          const imp = await page.evaluate(importantMarks);
          pass(`${tag}: Important is the soft coral tick box edge or the thin line, and nothing else (button check; ${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
          const doubled = await page.evaluate(doubledRules);
          pass(`${tag}: no line under a heading over rows with their own lines (button check)`, doubled.length === 0, doubled.slice(0, 4).join('; '));
          const folds = await page.evaluate(chevronOnlyFolds);
          pass(`${tag}: every fold opens from its whole heading row (button check)`, folds.length === 0, folds.slice(0, 4).join('; '));
          pass(`${tag}: at most one eye per page or section, beside its title`, r.eyeNotes.length === 0, r.eyeNotes.slice(0, 4).join('; '));
          const rating = /out of 10\b|\b\d+(\.\d+)?\/10\b|\b1 to 5\b|rated 1\b/i.exec(r.text);
          pass(`${tag}: no numbered ratings`, !rating, rating?.[0]);
          pass(`${tag}: no second line that repeats its answer`, r.repeats.length === 0, r.repeats.slice(0, 4).join('; '));
          const lowEdges = await page.evaluate(outlinedEdges);
          pass(`${tag}: every outlined edge reaches 3 to 1`, lowEdges.length === 0, lowEdges.slice(0, 6).join('; '));
          const shared = await page.evaluate(overlappingTaps);
          pass(`${tag}: no two tap areas overlap`, shared.length === 0, shared.slice(0, 6).join('; '));
          const covered = await page.evaluate(toastCovers);
          pass(`${tag}: a toast covers no button or link`, covered.length === 0, covered.slice(0, 4).join('; '));
          const pops = await page.evaluate(checkPopups);
          pass(`${tag}: every pop-up is one short line, and no ⓘ sits in a list row (${pops.checked} read)`, pops.problems.length === 0, pops.problems.slice(0, 4).join('; '));
          // M26's own titles, word for word (sign-in rule 2; the run's prompt: "exactly as M26 draws and words
          // them"), are the agreed exception, as the outside Health Check's full name is.
          const M26_TITLES = /^(Set up your authenticator|Save your recovery codes|Lost your authenticator app\?|Reset .+’s authenticator\?)$/i;
          const long = r.longTitles.filter((t) => !M26_TITLES.test(t.trim()));
          pass(`${tag}: no title in capitals over 3 words (M26's own titles excepted)`, long.length === 0, long.join('; '));
          // The chevrons beside words (Back, My Account, the menu's): centred on their text within 0.5px.
          if (SCALE === 1) {
            const chev = await measureChevrons(page);
            pass(`${tag}: every chevron beside text is centred on it (${chev.length} measured)`, chevronsOff(chev).length === 0, chevronsOff(chev).slice(0, 4).join('; '));
          }
          pass(`${tag}: the background and text match the ${mode} setting`, r.theme === mode && r.background === BACKGROUND[mode], `${r.theme} ${r.background}`);
          pass(`${tag}: the menu button sits over nothing`, r.over.length === 0, r.over.slice(0, 3).join('; '));
          pass(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
          if (store) pass(`${tag}: nothing was written to the test project`, !store.calls.some((c) => /^blocked/.test(c)), store.calls.filter((c) => /^blocked/.test(c)).slice(0, 3).join(', '));
          if (w) pass(`${tag}: nothing reached anywhere but the stand-ins`, !w.calls.some((c) => c.startsWith('blocked')), w.calls.filter((c) => c.startsWith('blocked')).join(', '));
          if (out && mode === 'light') await page.screenshot({ path: join(out, `${name}-${width === 1280 ? '1280' : width === 390 ? '390x844' : width}.png`), fullPage: true });
          if (mode === 'dark') {
            const reveals = await page.evaluate(checkReveals);
            revealsChecked += reveals.checked;
            pass(`${tag}: what opens in place keeps your place and shows (${reveals.checked} pressed)`, reveals.problems.length === 0, reveals.problems.slice(0, 5).join('; '));
          }
        } catch (e) {
          pass(`${tag}: opened`, false, e.message.split('\n')[0]);
        }
        await context?.close();
      }
    }
  }
}

await browser.close();

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
