// The UI tester for the coach portal (Phase 6a runs 1 and 2): every page
// and panel, as the owner and as an associate (and the client's own
// Coaching page as the test client), at 1440, 768 and 400, dark and light,
// held to the calm rules with the portal's own checkers (the same functions
// calm-rules runs on every client page) and to the rules of 18 Nov:
//   - every tap area 44px or more, and no two overlap; no sideways scroll;
//   - every button in the controls family, one coral button a screen;
//   - boxes, choices and cards side by side are one height;
//   - no Nekst inside a control, no coloured side line, no line
//     under a heading over rows with their own lines, folds open from the
//     whole heading row;
//   - every outlined edge reaches 3 to 1; pop-ups are one short line;
//   - chevrons centred on their words;
//   - no keyboard shortcut is shown anywhere; Add rows drop "a" and "an";
//   - each mode uses its own colours; nothing in the console;
// to run 3's rules for the calendar and booking (Tim, 19 Nov; cal-rules.mjs),
// each a named check on every screen: the tile colours read from computed
// styles in both modes, 4px corners, no tile text under 12px, every tile
// line 4.5 to 1 against what is behind it, flat hatching under the tiles
// and no gradient anywhere, Open times in mint, the Schedule's 10px square,
// the client's own time in each call's block, no key hints; and, on the
// screens that are there for them, the two time columns (clock-change days
// included), working hours edited on the week, a to-do on the calendar, and
// the booking pages' own rules (the device's mode, one coral button, times
// with a city, "Show early and late times");
// and to run 2's design rules (Tim, 18 and 19 Nov; rules.mjs), each a named
// check on every screen: underlined tabs that scroll in their own strip;
// boxes side by side level; one line of help at most, and help that can be
// hidden and shown again; alerts as one short line; money rates; chart
// pop-ups; table headings that stay; figures on an equal grid; the
// Important tick box; a week over capacity; no key hints; and on a phone
// nothing under the phone bar and one coral button in view.
//
//   node --import ./tests/scores/register.mjs tests/coach/ui.mjs [folder for screenshots]
//   ONLY, GROUPS, SIZES, MODES and ROLES narrow it (see screens.mjs).
//   TWICE=1: run 2's screens at twice the standard text size instead (no
//   sideways scroll, nothing cut off, boxes still level).
// It ends with one COUNT line for each role, size and mode.
import { mkdirSync } from 'node:fs';
import { backGaps, buttonProblems, chevronOnlyFolds, controlsFamily, doubledRules, importantMarks, nekstInControls, sideBySide, sideLines } from '../buttons/buttons-check.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { toastCovers } from '../phase5/toasts.mjs';
import { checkPopups } from '../phase5/popups.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';
import { APP, makeReport } from './shared.mjs';
import { GROUPS, picture as takePicture, walk } from './screens.mjs';
import { chartPopups, hiddenHelp, readRules, readTwice, SOFT_CORAL, tableHeadings } from './rules.mjs';
import { earlyAndLate, hoursEditing, readBooking, readCalRules, readPhoneCalendar, TILE, todoOnCalendar, zoneColumns } from './cal-rules.mjs';
import { settle } from './shared.mjs';
import { actionsProblems, dotStyleProblems, mapCard, mapProblems, nearestWins, netTabProblems, readActions, readDotStyles, readFloatingMenus, readClipped, readLeadRules, readMap, readNetTabs, readTableRows, tableFrozen } from './net-rules.mjs';
import { toastText } from './shared.mjs';
import { DAY } from './seed.mjs';
import { centredGroups, centringProblems } from '../signin/centring.mjs';

const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const TWICE = process.env.TWICE === '1';
const made = makeReport(`Coach portal, the UI tester${TWICE ? ', twice the text size' : ''}`);
// The same report, counted for each role, size and mode as well.
const counts = {};
let counting = 'the walk';
const report = {
  pass(what, ok, detail = '') { const c = counts[counting] || (counts[counting] = [0, 0]); c[ok ? 0 : 1] += 1; return made.pass(what, ok, detail); },
  done() { for (const [key, [p, f]] of Object.entries(counts)) console.log(`COUNT ${key}: ${p} passed, ${f} failed`); return made.done(); },
};
const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };

/** Runs in the page: tap sizes, sideways scroll, shortcut hints, add rows, the board's cards, the mode's colours. */
function measure(appSelector) {
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => { const b = d.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).pop();
  const app = document.querySelector(appSelector) || document.body;
  const root = top || app;
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01; };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} “${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}”`;
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, [role=radio], [role=checkbox], [role=switch], [role=option], [role=menuitem], [role=menuitemcheckbox]')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2)) continue;
    const reach = (p) => (p.content !== 'none' && p.position === 'absolute' && p.display !== 'none' && p.pointerEvents !== 'none') ? { w: parseFloat(p.width) || 0, h: parseFloat(p.height) || 0 } : { w: 0, h: 0 };
    const [ra, rb] = [reach(getComputedStyle(el, '::after')), reach(getComputedStyle(el, '::before'))];
    const tapW = Math.max(b.width, ra.w, rb.w);
    const tapH = Math.max(b.height, ra.h, rb.h);
    if (tapW >= 43.5 && tapH >= 43.5) continue;
    if (el.matches('.ds-seg-btn') && b.height >= 33.5) continue; // inside the switch's own 40px track, 44px on a phone
    // A fold's button fills its whole heading row (its ::after is inset 0 of the row).
    if (el.matches('.cc-fold-btn') && el.closest('.cc-fold-head').getBoundingClientRect().height >= 43.5) continue;
    // The shared date picker's own days (`DatePicker`, the design reference's part: seven days share its 360px, so each is
    // 44px tall and 41 to 43px wide with its neighbours touching, and a wider tap area would overlap them). Only a day of that
    // picker's own grid, a full 44px tall and never under 40.5 wide.
    if (el.matches('.ds-cal .ds-cal-grid .ds-cal-day, .ds-cal .ds-cal-day') && b.height >= 43.5 && b.width >= 40.5) continue;
    // A placed to-do's tick sits inside its calendar tile, which is as tall as its minutes (15 minutes is 11px), so a 44px
    // area can't fit without covering the tile it sits in and its neighbours (run 3; M11 draws it so). Only the tick of a
    // to-do's own tile, never smaller than the 11px box it is drawn as, and only where the tile itself (which opens the
    // to-do, where it can be ticked at full size) is a control around it.
    if (el.matches('.cc-cal-tile--todo .cc-cal-tick') && b.width >= 10.5 && b.height >= 10.5 && el.closest('.cc-cal-tile--todo').matches('[role=button], button, [tabindex]')) continue;
    // A link inside a sentence carries its own 44px strip.
    if (el.matches('.cc-inline-link') && ra.h >= 43.5) continue;
    small.push(`${label(el)} ${Math.round(tapW)}x${Math.round(tapH)}`);
  }
  const text = (app.innerText || '') + [...document.querySelectorAll('.ds-portal')].map((p) => p.innerText).join('\n');
  const adds = [...document.querySelectorAll('.ds-addrow')].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^Add (a|an) /.test(t));
  // Cards side by side are one height; cards stacked in one column (a phone's board) keep their own (M11's phone).
  const shownCards = [...document.querySelectorAll('.cc-card')].filter(vis);
  const sideBySideCards = new Set(shownCards.map((c) => Math.round(c.getBoundingClientRect().left))).size > 1;
  const cards = sideBySideCards ? shownCards.map((c) => Math.round(c.getBoundingClientRect().height)) : [];
  const cs = getComputedStyle(app);
  return {
    small,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    shortcuts: [...document.querySelectorAll('kbd')].filter(vis).length + ((text.match(/[⌘⌥⇧]|\b(Cmd|Ctrl)\s?\+/g) || []).length),
    adds,
    cards: [...new Set(cards)],
    background: cs.backgroundColor,
    theme: document.documentElement.getAttribute('data-theme'),
    fail: /\bfail(ed|s|ure)?\b/i.test(text),
    purpose: /\b(your|my) (purpose|mission)\b/.test(text),
    text,
    phone: window.innerWidth < 600,
    // On a phone each lead card is its name and one grey line (tidy follow-up 3, run 6's 33): how many lines each shows.
    cardLines: [...document.querySelectorAll('.cc-lead-card .cc-lead-line1')].filter(vis).map((l) => Math.round(l.getBoundingClientRect().height / (parseFloat(getComputedStyle(l).lineHeight) || 18))),
  };
}

/** A picture of the screen as it stands, taken as shots.mjs takes them (when a folder was given). */
const picture = (page, file, full) => (OUT ? takePicture(page, `${OUT}/${file}.png`, full) : null);

/** What a screen must show, by the name it gives in `expects` (screens.mjs). */
const KINDS_ON_THE_WEEK = ['client', 'chemistry', 'connection', 'admin', 'writing', 'other', 'life', 'hold'];
/** Run 3's: read from cal-rules.mjs's `found`. */
const CAL_MUST = {
  tiles: (c) => c.found.tiles > 5,
  kinds: (c) => KINDS_ON_THE_WEEK.every((k) => c.found.kinds.includes(k)),
  hatch: (c) => c.found.hatch > 0,
  squares: (c) => c.found.squares > 5,
  month: (c) => c.found.tiles + c.found.squares > 5,
  'client-time': (c) => c.found.clientTimes > 0,
  'open-times': (c) => c.found.kinds.includes('open'),
  weekends: (c) => /\bSat\b/.test(c.found.said) && /\bSun\b/.test(c.found.said),
  which: (c) => ['Which ones?', 'This one', 'This and following', 'All of them'].every((w) => c.found.said.includes(w)),
  'moved-tile': (c) => c.found.movedTile,
  'bar-8': (c) => c.found.bar && /in 8 minutes/.test(c.found.bar.words) && !c.found.bar.soon,
  'bar-5': (c) => c.found.bar && /in 5 minutes/.test(c.found.bar.words) && c.found.bar.soon,
  'bar-now': (c) => c.found.bar && /is starting now/.test(c.found.bar.words) && c.found.bar.soon,
  'bar-in': (c) => c.found.bar && /started 6 minutes ago/.test(c.found.bar.words) && c.found.bar.soon,
  // One quiet line for the one change, however many US time zones the coach's clients are in.
  'clock-line': (c) => (c.found.said.match(/US clocks go back on Sunday 1 Nov\./g) || []).length === 1 && /Mia’s \w+ call moves from \d\d:\d\d to \d\d:\d\d UK time from \w+ \d+ Nov, and Jordan’s \w+ call moves from \d\d:\d\d to \d\d:\d\d UK time from \w+ \d+ Nov\./.test(c.found.said),
  // Checked by their own driven checks above.
  zones: () => true, early: () => true, 'hours-edit': () => true, 'todo-tile': () => true, 'todos-panel': () => true, 'phone-cal': () => true,
};
const MUST = {
  finances: (r) => r.text.includes('November £2,300 of £5,000'),
  'capacity-row': (r) => /Capacity/i.test(r.text) && r.text.includes('Coaching hours each week'),
  'hidden-help': (r) => r.text.includes('Hidden help') && r.text.includes('Nothing is hidden.'),
  // Run 4, Leads.
  // On a phone a card is its name and one grey line (M11's calm phone; tidy follow-up 3): the parts that don't fit are left out.
  'lead-board': (r) => (r.phone
    ? ['£31,500', '£15,750 likely', 'No value yet'].every((w) => r.text.includes(w)) && r.cardLines.length > 0 && r.cardLines.every((n) => n === 1)
    : ['£31,500', '£15,750 likely', 'No value yet', 'Opened 3 times', 'Quiet for 19 days', 'Still to find out: when', 'Ready to decide'].every((w) => r.text.includes(w))),
  'lead-waiting': (r) => r.text.includes('You emailed Sarah Kent, who isn’t in the portal yet.') && r.text.includes('Chris Doyle may be in here twice.'),
  'lead-page': (r) => ['Nearly there. Still to find out: when.', 'Referred by', 'Hannah Wells', 'Leadership Accelerator. Opened 3 times.', 'Not known yet'].every((w) => r.text.includes(w)),
  // Run 4, step 3: Automations, Boards, emails logged, past clients' check-ins, the account map.
  automations: (r) => ['When a lead moves to Proposal sent, add the to-do “Follow up on the proposal”, 3 days later.', 'Ran 4 times in November', 'When a Chemistry Call is booked, add the to-do “Read their booking answers”, the day before.', 'Off', 'Automations add to-dos and move stages. They never send anything.'].every((w) => r.text.includes(w)) && !/add tags|keep people in touch/.test(r.text),
  'automations-link': (r) => r.text.includes('Automations') && r.text.includes('Cold leads'),
  boards: (r) => ['Speaking', '4 stages', '5 cards', 'Partners', '3 stages', '2 cards', 'New board'].every((w) => r.text.includes(w)),
  board: (r) => ['Ideas', 'Pitched', 'Confirmed', 'Done', 'CIPD Festival of Work', '£4,500', '800 HR leaders', 'League Managers Association', 'Head coaches', 'Edit this board'].every((w) => r.text.includes(w)),
  'email-settings': (r) => ['Forward emails to to-dos', 'Copy-in address', 'Log Gmail with clients and leads', 'Connect Gmail', 'Gmail isn’t set up yet.', 'This address is ready once the email service is set up.'].every((w) => r.text.includes(w)),
  'email-addresses': (r) => /todo\.[a-z0-9.]+@in\.example\.invalid/.test(r.text) && /log\.[a-z0-9.]+@in\.example\.invalid/.test(r.text) && (r.text.match(/\bCopy\b/g) || []).length >= 2,
  'past-due': (r) => ['Suggest check-ins at 3, 6 and 12 months', 'Check-ins due', 'Grace Liu', '6-month check-in', 'Ben Ortiz', '3-month check-in', 'Leah Moran', '12-month check-in', 'Everyone', 'Omar Haddad'].every((w) => new RegExp(w.replace(/[-,]/g, '[-,]'), 'i').test(r.text)),
  'keep-in-touch': (r) => /keep in touch/i.test(r.text) && ['Ben Ortiz', '3-month check-in', 'Grace Liu', '6-month check-in'].every((w) => r.text.includes(w)),
  'account-map': (r) => ['Dana Whitfield', 'Sponsor', 'Jo Mensah', 'HR', 'Asked about team workshops', 'Leadership Accelerator for Sam', '£13,460', 'Portal seats', '20 seats', '£640/month', 'Team workshops for the leadership team', 'Proposal sent', 'Opened 2 times', '6 of 20 seats are free.', 'Offer the seats', 'Add to the pipeline', 'Next renewal'].every((w) => r.text.includes(w)) && /who’s who/i.test(r.text) && /agreements and proposals/i.test(r.text) && /room to grow/i.test(r.text),
  // An associate: only the board the owner shared, read only; the owner's other board isn't there at all.
  'shared-board': (r) => r.text.includes('Speaking') && !r.text.includes('Partners') && !r.text.includes('New board'),
  'read-only': (r) => r.text.includes('You can see it and can’t edit it.') && r.text.includes('CIPD Festival of Work') && !r.text.includes('Edit this board') && !r.text.includes('Add card'),
  'board-gone': (r) => r.text.includes('This board isn’t here any more.') && !r.text.includes('Quillmark'),
  // Run 4, step 4: Network (Actions, Table, Map, one person), Today's Keep in touch, the menu's count and search.
  'net-actions': (r) => has(r, ['Due now', 'Sofia Marsh', 'Key contact', 'Every 3 months', '9 days overdue', '7 days overdue', 'Show all 9', 'Coming up', 'Due Sun 29 Nov', 'Add someone', '3 people have had no contact for 18 months and aren’t in a focus list.', 'Review them', 'Not now']),
  'net-ready': (r) => has(r, ['Ready to archive?', '3 people', 'No contact for 18 months, and not in a focus list.', 'Bea Reeves', 'Harbour City FC', 'Last spoke', 'Cancel', 'Archive 3']),
  'net-person': (r) => has(r, ['David Stark', 'Chief medical officer, Citadel', 'You last spoke on Sun 15 Nov.', 'How often?', 'Every 2 months', 'I spoke to David today', 'Email', 'WhatsApp', 'Not now, in 2 weeks', 'Stop keeping in touch', 'Contact', 'Edit contact details', 'How it is', 'Invest', 'They matter, and there’s room to build trust.', 'Trust in you', '6/10', 'Edit ratings', 'What you’ve given', 'You’ve given once and haven’t asked yet.', 'An idea', 'Log what you gave', 'What you’ve asked', 'Nothing asked yet.', 'Log an ask', 'Move to Leads', 'Archive']),
  'net-ratings': (r) => has(r, ['Edit ratings', 'Dana Whitfield', 'How much influence do they have?', 'How much do they trust you?', 'How much value do you deliver to them?', 'How much do you get from it?', 'Every change is kept with its date.', 'Cancel', 'Save']),
  'net-table': (r) => has(r, ['18 people', 'Name', 'Organisation', 'Role', 'Email', 'Phone', 'Where to focus', 'Influence', 'Trust in you', 'Value delivery', 'What you get', 'Rhythm', 'Last spoke', 'Next due', 'Given', 'Asked', 'Sector', 'Sofia Marsh', '9 days overdue', 'Add someone', 'Import a spreadsheet', 'Export', 'Show or hide columns', 'Archived, 2']) && !/Showing \d/.test(r.text),
  'net-colmenu': (r) => has(r, ['Sort', 'Keep close first', 'Rebalance? first', 'Show only', 'Keep close', 'Maintain', 'Invest', 'Rebalance?', 'No list']),
  'net-rating': (r) => /0\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s+10/.test(r.text),
  'net-focus': (r) => has(r, ['Where to focus, 1', 'of 18 people', 'Clear', 'Keep close']) && !r.text.includes('Sofia Marsh'),
  'net-columns': (r) => has(r, ['Columns', 'Organisation', 'Where they work.', 'How much they trust you, 0 to 10.', 'Worked out from the rhythm and when you last spoke.', 'How many times you’ve asked for something.', 'Sector', 'Add column']),
  'net-import': (r) => has(r, ['Import a spreadsheet', 'Drop an Excel or CSV file here', 'Choose a file', 'Duplicates show before anyone is added.', '1 person to add. 1 may already be here. 1 row has no name, so it is left out.', 'Possible duplicates', 'Dana Whitfield, Kestrel Group, is already in your Network, with the same email.', 'Add anyway', 'Your columns', 'Nell Okoye', 'Add 1 person']),
  'net-archive': (r) => has(r, ['Network', '2 archived', 'Adam Ford', 'Priyesh Young']) && !r.text.includes('Import a spreadsheet') && !r.text.includes('Sofia Marsh'),
  'net-map': (r) => has(r, ['Everyone', 'Influence', 'Trust', '7 or more', 'How to read the map']) && !r.text.includes('Showing'),
  'net-map-help': (r) => has(r, ['How to read the map', 'Up and across', 'A green dot with a fine ring', 'Keep close: their trust in you and what you get are both 7 or more.', 'An outline', 'A solid dot in the text colour', 'A dashed grey outline', 'A number', 'A pale dot with a number', 'A plain grey dot', 'Don’t show me this again']),
  'net-found': (r) => r.text.includes('David Stark'),
  'net-today': (r) => has(r, ['Keep in touch', 'Sofia Marsh', 'Key contact', 'Dana Whitfield', 'Hannah Wells', 'Show all 9', 'Ben Ortiz', '3-month check-in']),
  'net-menu': (r) => /Network\s*9\b/.test(r.text),
  'net-search': (r) => has(r, ['Sofia Marsh', 'Network']),
  'net-searched': (r) => /\b\d+ of 18 people\b/.test(r.text) && r.text.includes('Clear') && r.text.includes('Dana Whitfield') && !r.text.includes('Sofia Marsh'),
  // Show narrows the map to one list: the count says so ("3 of 18 people"), or the calm line when nobody is in it.
  'net-only': (r) => /\b\d+ of 18 people\b/.test(r.text) || r.text.includes('Nobody in this list is on the map.'),
  // Checked by their own driven checks.
  'net-fold': () => true, 'net-fold-all': () => true, 'net-50': () => true, 'net-100': () => true, 'net-styles': () => true, 'net-styles-mixed': () => true, 'net-nearest': () => true, 'toast-undo': () => true, 'net-saved': () => true,
  'net-many-actions': (r) => has(r, ['36 people have had no contact for 18 months and aren’t in a focus list.', 'Show all 30', 'days overdue', 'Coming up']),
  'net-many-table': (r) => has(r, ['1,164 people', 'Showing 50 of 1,164', 'Show 50 more', 'Archived, 36']),
  'net-many-map': (r) => r.text.includes('Showing 150 of 1,164 people: your focus lists first, then who you spoke to most recently.'),
  'net-spot': (r) => /\d+ people/i.test(r.text) && /Trust \d+\/10, influence \d+\/10/.test(r.text) && /Due /.test(r.text),
  // An associate: no Network page, no Network in the menu, nobody of the owner's Network in search (they are on their own Today).
  'not-network': (r) => !/\bNetwork\b/i.test(r.text.replace(/network_/g, '')) && !r.text.includes('Sofia Marsh') && !r.text.includes('9 days overdue'),
  // Checked by their own driven checks below.
  'net-frozen': () => true,
  // An associate: no Leads page, no Leads in the menu, no lead in search (they are on their own Today).
  'not-leads': (r) => !/\bLeads?\b/.test(r.text) && !r.text.includes('Amy Cole') && !r.text.includes('Quiet for 19 days'),
};
/** Every one of these words is on the screen, whatever its capitals (a section heading is drawn in capitals). */
const has = (r, list) => { const t = r.text.replace(/\u00a0/g, ' ').toLowerCase(); return list.every((w) => t.includes(w.toLowerCase())); };
// Underlined tabs are the same on a laptop and a phone: the same words, size, line and space at every width.
const TABS_LOOK = { size: '16px', line: 2, gap: '22px' };

const problems = await walk(async (page, { name, role, size, theme, run, root, expects, full, group, day }) => {
  const tag = `${name}, ${role}, ${size}px ${theme}`;
  counting = `${role} ${size} ${theme}`;
  const phone = size <= 600;
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(2, 2);

  if (TWICE) {
    const t = await page.evaluate(readTwice, root);
    report.pass(`${tag}: the text is twice the standard size`, parseFloat(t.size) >= 28, t.size);
    report.pass(`${tag}: at twice the text size, no sideways scroll`, t.sideways <= 0, `${t.sideways}px`);
    report.pass(`${tag}: at twice the text size, nothing runs off the side or is cut off`, t.off.length === 0, t.off.slice(0, 5).join(' | '));
    const rules = await page.evaluate(readRules, { app: root, phone, wide: false, theme, softCoral: SOFT_CORAL[theme], mint: [] });
    report.pass(`${tag}: at twice the text size, boxes side by side still line up`, rules.level.length === 0, rules.level.slice(0, 4).join('; '));
    report.pass(`${tag}: at twice the text size, the tabs keep to their own strip`, rules.tabs.length === 0, rules.tabs.slice(0, 4).join('; '));
    report.pass(`${tag}: at twice the text size, figures stay on an equal grid`, rules.figures.length === 0, rules.figures.slice(0, 4).join('; '));
    if (group === 'public' || group === 'signin') {
      const al = await page.evaluate(centredGroups, { root: group === 'public' ? '.cc-col' : '.si-col' });
      report.pass(`${tag}: at twice the text size, one left edge (sign-in rule 49; ${al.align === 'centre' ? 'a message, centred' : 'on the left edge'})`, centringProblems(al).length === 0, centringProblems(al).slice(0, 4).join('; '));
    }
    await picture(page, `twice-${name}.${role}.${size}.${theme}`, false);
    return;
  }

  if (expects.includes('help-flow')) {
    // (No picture: this screen is To-dos again, walked for its help link.)
    for (const [what, ok, detail] of await hiddenHelp(page, { app: APP, phone })) report.pass(`${tag}: ${what}`, ok, detail);
    return;
  }

  if (role === 'signed-out' && group !== 'public') {
    // The sign-in pages: only that the coach header's rule for the body changed nothing on them.
    // (The booking pages outside the portal, the group "public", are read in full like every other screen.)
    const s = await page.evaluate(readRules, { app: root, phone, wide: false, theme, softCoral: SOFT_CORAL[theme], mint: [] });
    report.pass(`${tag}: the coach header’s rule for the body doesn’t reach the sign-in page`, s.header.length === 0, s.header.join('; '));
    report.pass(`${tag}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0);
    report.pass(`${tag}: the body keeps the portal’s own sideways overflow (hidden)`, await page.evaluate(() => getComputedStyle(document.body).overflowX) === 'hidden', await page.evaluate(() => getComputedStyle(document.body).overflowX));
    await picture(page, `${name}.${role}.${size}.${theme}`, false);
    return;
  }

  // The picture is taken before anything is opened, hovered or scrolled by a check.
  await picture(page, `${name}.${role}.${size}.${theme}`, full);
  const r = await page.evaluate(measure, root);
  if (root === '.cc-app') report.pass(`${tag}: the page follows the chosen mode`, r.theme === theme && r.background === BACKGROUND[theme], `${r.theme} ${r.background}`);
  report.pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 5).join('; '));
  report.pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
  report.pass(`${tag}: no keyboard shortcut is shown`, r.shortcuts === 0, `${r.shortcuts}`);
  report.pass(`${tag}: Add rows drop “a” and “an”`, r.adds.length === 0, r.adds.join('; '));
  report.pass(`${tag}: every card on the board is one height where columns sit side by side`, r.cards.length <= 1, r.cards.join(', '));
  report.pass(`${tag}: no “fail” in what people read`, !r.fail);
  report.pass(`${tag}: Mission keeps its capital`, !r.purpose);
  const btns = await page.evaluate(buttonProblems, { phone, scale: 1 });
  report.pass(`${tag}: every button in the controls family, its words whole, one coral button (${btns.checked} read)`, btns.problems.length === 0, btns.problems.slice(0, 4).join('; '));
  const uneven = await page.evaluate(sideBySide);
  report.pass(`${tag}: boxes side by side are one height`, uneven.length === 0, uneven.slice(0, 4).join('; '));
  const nekst = await page.evaluate(nekstInControls);
  report.pass(`${tag}: no Nekst inside any control`, nekst.length === 0, nekst.slice(0, 4).join('; '));
  // One controls family (Tim, 22 Nov; design reference 22 Nov; tests/buttons/buttons-check.mjs controlsFamily).
  const family = await page.evaluate(controlsFamily, { phone, scale: 1 });
  report.pass(`${tag}: one controls family (${family.toggles} toggles read)`, family.problems.length === 0, family.problems.slice(0, 4).join('; '));
  const sides = await page.evaluate(sideLines);
  report.pass(`${tag}: no coloured side line`, sides.length === 0, sides.slice(0, 4).join('; '));
  // Back's chevron 10px from its words, and Important only as the soft coral tick box edge or the small soft coral box before the title (tidy pass follow-ups 1 and 2; Tim, 18 Nov, 12:55).
  const backs = await page.evaluate(backGaps);
  report.pass(`${tag}: Back's chevron is 10px from its words (${backs.checked} read)`, backs.problems.length === 0, backs.problems.slice(0, 4).join('; '));
  const imp = await page.evaluate(importantMarks);
  report.pass(`${tag}: Important is the soft coral tick box edge or the small soft coral box, and nothing else (${imp.checked} read)`, imp.problems.length === 0, imp.problems.slice(0, 4).join('; '));
  const doubled = await page.evaluate(doubledRules);
  report.pass(`${tag}: no line under a heading over rows with their own lines`, doubled.length === 0, doubled.slice(0, 4).join('; '));
  const folds = await page.evaluate(chevronOnlyFolds);
  report.pass(`${tag}: every fold opens from its whole heading row`, folds.length === 0, folds.slice(0, 4).join('; '));
  const edges = await page.evaluate(outlinedEdges);
  report.pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.slice(0, 4).join('; '));
  // The map's dots keep their 44px tap areas where spots are closer than that (a phone): a tap opens the dot whose centre
  // is nearest it (ChartTips' `nearest`, as the Health Check's chart; network-flows.mjs taps every overlap), so one dot's
  // area over its neighbour's is the one overlap that is meant. Nothing else may overlap, and no dot may overlap anything else.
  const overlaps = (await page.evaluate(overlappingTaps)).filter((o) => !/^cc-net-dot .* \+ cc-net-dot /.test(o));
  report.pass(`${tag}: no two tap areas overlap`, overlaps.length === 0, overlaps.slice(0, 4).join('; '));
  // A toast never covers a button or link fixed to the screen: the select-several bar, the session bar, a panel's foot (tidy pass item 2).
  const covered = await page.evaluate(toastCovers);
  report.pass(`${tag}: a toast covers no button or link`, covered.length === 0, covered.slice(0, 4).join('; '));
  const pops = await page.evaluate(checkPopups);
  report.pass(`${tag}: every pop-up is one short line (${pops.checked} read)`, pops.problems.length === 0, pops.problems.slice(0, 3).join('; '));
  // A drop-down showing "UK" is read as capitals by the checker (its value is two capital letters): the
  // chevron is the shared drop-down's own, centred on lowercase words as everywhere else.
  const chevrons = chevronsOff(await measureChevrons(page)).filter((c) => !/^ds-dd "UK"/.test(c) && !/^ds-dd "\d+"/.test(c) && !/^ds-cal-nav /.test(c)); // a drop-down showing only a number (Edit ratings' 0 to 10) is read the same way: figures stand as tall as capitals // and the shared date picker's own month arrows
  // Run 6's Repeats menu open (todos-todo-repeat): the panel is scrolled to its end to fit the open list, and the pixel reader's
  // hiding of words moves that scroll under it, so a closed drop-down above reads 6 to 26px off. The same chevrons measure
  // centred with the list closed (the UI tester's probe, both modes) and on todos-todo, so a closed drop-down is not read here.
  if (name === 'todos-todo-repeat') chevrons.splice(0, chevrons.length, ...chevrons.filter((c) => !/^ds-dd ".*" \(closed\)/.test(c)));
  report.pass(`${tag}: chevrons are centred on their words`, chevrons.length === 0, chevrons.slice(0, 3).join('; '));

  // ---- Run 2's design rules (Tim, 18 and 19 Nov), on every screen.
  const rules = await page.evaluate(readRules, { app: root, phone, wide: size >= 1440, theme, softCoral: SOFT_CORAL[theme], mint: ['rgb(95, 239, 187)', 'rgb(11, 122, 82)'] });
  const rule = (what, list) => report.pass(`${tag}: ${what}`, list.length === 0, list.slice(0, 4).join('; '));
  rule('tabs are underlined tabs that scroll in their own strip', rules.tabs);
  if (rules.tabsLook) report.pass(`${tag}: the tabs are the same on a laptop and a phone`, Object.entries(TABS_LOOK).every(([k, v]) => rules.tabsLook[k] === v), JSON.stringify(rules.tabsLook));
  rule('boxes side by side line up (tops level, one height)', rules.level);
  rule('one line of help at most, and never two in a row', rules.help);
  rule('an explanation panel ends with “Don’t show me this again”', rules.explain);
  rule('an alert is one short line with its link inside and no button', rules.over);
  rule('money rates read “£750/hr”, with “per hour” for a screen reader', rules.money);
  rule('figures in a row sit on an equal grid', rules.figures);
  rule('Important is the soft coral tick box, sorted first and named', rules.important);
  rule('a week over capacity is a full soft coral bar with no warning words', rules.capacity);
  rule('no key hint is shown', rules.keys);
  rule(root === '.cc-app' ? 'the coach header stays at the top as the page scrolls' : 'the coach header’s rule for the body doesn’t reach the client portal', rules.header);
  if (root !== '.cc-app') report.pass(`${tag}: the body keeps the portal’s own sideways overflow (hidden)`, await page.evaluate(() => getComputedStyle(document.body).overflowX) === 'hidden', await page.evaluate(() => getComputedStyle(document.body).overflowX));
  rule('a chart writes its 0 once', rules.zero);
  if (phone) rule('on a phone nothing sits under the phone bar and one coral button at most is in view', rules.phone);
  if (size <= 768) rule('the older phone rule for plain buttons changes no button here', rules.oldPhone);
  if (role === 'associate') report.pass(`${tag}: an associate never sees the Finances line`, !/£2,300/.test(r.text));
  if (rules.found.chart) {
    const tips = await chartPopups(page, { phone });
    report.pass(`${tag}: chart pop-ups (${tips.read} opened) are ${phone ? 'one line, inside the screen' : 'a title with rows when they hold more than one fact'}`, tips.read > 0 && tips.problems.length === 0, tips.problems.slice(0, 3).join('; '));
  }
  // ---- Run 4, step 4: Network's map and its table's own box, on the screens that hold them.
  if (await page.locator('.cc-net-map svg').count()) rule('the map: one shared 0, a faint point at every spot, “7 or more” once on each line and outside the chart, one same-size dot a spot, never coral, at most 150 people, 44px tap areas, no key', mapProblems(await page.evaluate(readMap), { phone }));
  // ---- Run 4: the UI tester's own named checks (TEST4-UI.md), on the screens that hold them.
  const RUN4 = ['leads', 'leads-many', 'leads-associate', 'crm', 'crm-associate', 'network', 'network-many', 'network-associate'].includes(group);
  if (RUN4) {
    const floating = await page.evaluate(readFloatingMenus);
    rule('no words are cut off at the side, a box’s own words included', await page.evaluate(readClipped));
    if (floating.read) rule(`floating menus sit over everything, inside the screen and outside the table (${floating.read} read)`, floating.problems);
  }
  if (['leads', 'leads-many', 'crm'].includes(group)) {
    const l = await page.evaluate(readLeadRules, size >= 1100);
    rule(`Leads and boards: how ready in words, never a number; money the portal’s way; Edit, never Change; no table under 1100px (${l.cards} cards read)`, l.problems);
  }
  if (role === 'owner' && (await page.locator('.cc-net .cc-utabs').count())) rule('Network is three underlined tabs, Actions first', netTabProblems(await page.evaluate(readNetTabs)));
  if (expects.includes('net-fold') || expects.includes('net-fold-all')) rule('Due now reads “9 days overdue”, most overdue first, folding after 8 with Show all; Coming up soonest first, folding after 4', actionsProblems(await page.evaluate(readActions), { all: expects.includes('net-fold-all') }));
  if (expects.includes('net-50') || expects.includes('net-100')) {
    const t = await page.evaluate(readTableRows);
    const want = expects.includes('net-100') ? 100 : 50;
    rule(`the table holds ${want} rows a page with “Show 50 more”, never everyone (${t.rows} rows read)`, [t.rows !== want ? `${t.rows} rows in the page` : null, /Show 50 more/.test(t.foot) ? null : `under the table: “${t.foot}”`, /Showing [\d,]+ of 1,164/.test(t.foot) ? null : 'no “Showing … of 1,164”'].filter(Boolean));
  }
  if (await page.locator('.cc-net-map svg').count()) {
    const need = expects.includes('net-styles') ? ['keep_close', 'maintain', 'invest', 'rebalance', 'none'] : expects.includes('net-styles-mixed') ? ['mixed'] : [];
    rule(`the map’s dots: Keep close green with a fine ring, Maintain solid, Invest an outline, Rebalance? a dashed grey outline, mixed pale, no list plain grey, never coral (read in ${theme})`, dotStyleProblems(await page.evaluate(readDotStyles), { need }));
    const open = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].some((d) => d.getBoundingClientRect().width > 0));
    if (!open && (await page.locator('.cc-net-map .cc-net-dot:not(:has(.cc-net-num))').count())) rule(`a single dot’s pop-up ${phone ? 'is its name first, inside the screen' : 'is a card: the name, the organisation and the list, then Influence, Trust and Catch-up, inside the screen'}`, await mapCard(page, { phone, settle }));
  }
  if (expects.includes('toast-undo')) {
    const said = await toastText(page);
    const undo = await page.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).count();
    const want = expects.includes('net-saved') ? 'Saved.' : null;
    rule(`the change says so${want ? ` (“${want}”)` : ''} with Undo`, [!said.trim() ? 'no toast' : want && said.trim() !== want ? `the toast says “${said}”` : null, undo ? null : 'no Undo in the toast'].filter(Boolean));
  }
  // Run 6 (item 3): a save refused because the session changed in another tab is said calmly, with a way to see it, and the
  // recap never says "Saved" beside it.
  if (expects.includes('changed')) {
    const said = await page.evaluate(() => ({
      line: document.querySelector('.cc-ses-changed')?.innerText.replace(/\s+/g, ' ').trim() || '',
      saved: (() => { const box = [...document.querySelectorAll('textarea')].find((t) => /^Recap for /.test(t.labels?.[0]?.innerText || '')); const foot = box?.closest('.ds-textbox-field')?.querySelector('.ds-textbox-foot'); return Boolean(foot && /\bSaved\b/.test(foot.innerText)); })(),
    }));
    rule('“This session changed in another tab.” with “Reload to see it”, and the recap never says “Saved”', [
      /^This session changed in another tab\. Reload to see it$/.test(said.line) ? null : `the line reads “${said.line}”`,
      said.saved ? 'the recap says “Saved”' : null,
    ].filter(Boolean));
  }
  if (expects.includes('net-frozen')) rule('the table sits in its own box: its heading row and its Name column stay put as it scrolls down and sideways, and the page never scrolls sideways', await tableFrozen(page, { settle }));
  if (expects.includes('table')) rule('the table’s heading row stays at the top as the page and the table scroll', await tableHeadings(page));
  // ---- Run 3's rules for the calendar and booking (Tim, 19 Nov), on every screen.
  const cal = await page.evaluate(readCalRules, { app: root, theme, phone, tile: TILE });
  rule(`tiles are the colours of 19 Nov (${cal.found.tiles} read)`, cal.colours);
  rule('tiles have 4px corners', cal.corners);
  rule('no tile text is under 12px', cal.small);
  rule('every tile line is 4.5 to 1 against what is behind it', cal.contrast);
  rule('no line of a tile is cut through by the tile’s own edge', cal.cut);
  rule(`out-of-hours hatching is flat lines under the tiles (${cal.found.hatch} read)`, cal.hatch);
  rule('no gradient anywhere', cal.gradients);
  rule('Open times are outlined in mint, never coral', cal.open);
  rule(`the Schedule’s square is 10px, the tile’s colour, edged or dashed as it should be, before the time (${cal.found.squares} read)`, cal.squares);
  rule('no key hint (⌘, Ctrl, Cmd, Esc, Shift) is shown or spoken', cal.keys);
  rule(`a call’s block gives the client’s own time with a city, 12-hour for the US and Canada (${cal.found.clientTimes} read)`, cal.clientTime);
  // One left edge (Tim, 23 Nov 2026, 17:40; sign-in rule 49): a page with a form or a list is on the column's left
  // edge, the brand above it included; a short message is centred throughout; never a mix.
  if (group === 'public' || group === 'signin') {
    const al = await page.evaluate(centredGroups, { root: group === 'public' ? '.cc-col' : '.si-col' });
    rule(`one left edge, or a short message centred throughout (sign-in rule 49; ${al.rows.length} rows ${al.align === 'centre' ? 'centred' : 'on the left edge'})`, centringProblems(al));
  }
  if (group === 'public') {
    const book = await page.evaluate(readBooking, { theme, coral: ['rgb(255, 111, 92)', 'rgb(255, 133, 116)', 'rgb(240, 96, 78)'] });
    rule('the booking page follows the device’s light or dark', book.device);
    rule('one coral button at most', book.coral);
    rule(`times are said with a city or country, never letters or an offset (${book.found.times} times read)`, book.zones);
    rule('a page that holds early and late times back offers “Show early and late times”', book.early);
    if (expects.includes('early')) rule('only times from 07:00 that end by 20:00 the visitor’s time show, until “Show early and late times” is pressed', await earlyAndLate(page, { settle }));
  }
  if (phone && root === '.cc-app') {
    const pc = await page.evaluate(readPhoneCalendar);
    rule(`on a phone the calendar can be used: nothing runs off the side, rows and columns a finger wide (${pc.rows} rows, ${pc.cols} columns)`, pc.problems);
  }
  // The driven checks, on the screens that are there for them.
  if (expects.includes('zones') && (await page.locator('.cc-cal .cc-cal-times').count())) rule('two time columns, UK and one other switched by one choice, each hour right for the day', await zoneColumns(page, { settle, day }));
  if (expects.includes('hours-edit')) rule('working hours: a handle at each day’s start and finish with 44px tap areas, events dimmed, Done, arrow keys move 15 minutes', await hoursEditing(page, { settle }));
  if (expects.includes('todo-tile')) rule(`a to-do under 45 minutes on the calendar: one line, the tick, the title ending “…”, the time only if it fits${phone ? '' : ', its full title on hover after 0.3 seconds'}${expects.includes('todos-panel') ? ', the dashed coral outline on the to-dos panel while dragged over' : ''}`, await todoOnCalendar(page, { settle, hover: !phone, key: `todo:${DAY.t12}`, title: 'Send the Kestrel proposal', coral: ['rgb(255, 111, 92)', 'rgb(255, 133, 116)', 'rgb(194, 65, 46)', 'rgb(168, 78, 40)', 'rgb(255, 189, 158)'] }));
  // What this screen is there to show must be on it.
  for (const need of expects) {
    if (need === 'table' || need === 'help-flow' || need === 'changed') continue;
    if (need === 'level' && size < 1440) continue; // on a phone, and for some rows on a tablet, the boxes stack
    if (phone && ['cal-week', 'cal-clock-week'].includes(name) && ['tiles', 'kinds', 'hatch'].includes(need)) continue; // on a phone the week is its own list, not a squashed grid: its rows are read as the Schedule's are
    const there = MUST[need] ? MUST[need](r) : CAL_MUST[need] ? CAL_MUST[need](cal) : rules.found[need];
    report.pass(`${tag}: the screen shows what it is for (${need})`, Boolean(there));
  }
  if (expects.includes('net-nearest')) {
    const near = await nearestWins(page, { settle });
    if (phone || near.read) rule(`where two dots’ tap areas overlap, the press opens the nearer one (${near.read} pressed)`, phone && !near.read ? ['no two dots close enough to press between'] : near.problems);
  }
  if (run === 2 && expects.includes('panel') && phone) report.pass(`${tag}: on a phone a side panel is the whole screen`, await page.evaluate(() => { const d = [...document.querySelectorAll('.ds-dialog')].filter((x) => x.getBoundingClientRect().width > 0).pop(); if (!d) return true; const b = d.getBoundingClientRect(); return d.matches('.ds-sheet, [class*=sheet]') || b.width >= window.innerWidth - 1; }));
}, { twice: TWICE, groups: TWICE ? GROUPS.map((g) => g.name).filter((g) => g !== 'run1' && g !== 'help') : null });
counting = 'the walk';
report.pass('every screen opened, with nothing in the console and nothing written to the database', problems.length === 0, problems.slice(0, 8).join(' | '));
report.done();
