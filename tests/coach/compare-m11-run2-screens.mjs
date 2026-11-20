// Phase 6a run 2 (the coaching day): every screen M11 seq 77 draws for it,
// the built screen it is held against, and each meant difference with its
// reason. compare-m11-run2.mjs does the reading; compare-m11.mjs runs it.
//
// A row: `m11` (the screen's id in M11's picker), `clicks` (its data-a
// presses), `part` (page, sheet, bar or menu), or `sections` (the page's
// sections by their headings), or `from` (the page from that line on);
// `built` (the screen's name in screens.mjs, or one added below; `builtOn`
// names another for a phone); `who` and `on` when M11 has the state for one
// role or one size only; `shiftDays` when the built screen's pinned day
// isn't M11's; `cut` for the example M11 always shows typed; and its lists:
//   changes: [what M11 says, what the built screen says instead (or null: left out), why, options]
//   added:   [what only the built screen says, why, , options]
//   moved:   [a line both show that is in another place, why, , options]
// A pattern starting "name: " is for a control's spoken name (an aria-label
// with no words on screen). Options: `who` ('owner' or 'associate'), `on`
// ('d' or 'p'), `say` (how the table names a pattern), `data` (the test's
// seed, not the product: counted in the table, not listed), `quiet` (said
// once under the table, not on each row).
// A row with no `built` is not built: `why` says so.
// Anything that differs and is not listed FAILS: it is a fault, not a meant
// difference, until a rule explains it. The differences no rule explains
// that were kept as built are listed with "left for Tim to decide".
import { settle } from './shared.mjs';
import { DAY, ID, SES } from './seed.mjs';
import { TUE } from './screens.mjs';

// ---------------------------------------------------------------- the built screens M11 draws that screens.mjs doesn't open
const press = async (page, name) => { await page.getByRole('button', { name, exact: true }).first().click(); await settle(page, 450); };
const take = async (page) => { await page.locator('.ds-offer-take').click(); await settle(page, 500); };
const openFold = async (page, name) => { const b = page.locator('.cc-fold-btn', { hasText: name }).first(); if (await b.count() && (await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await settle(page, 300); } };
const bar = (minutes) => async (page) => {
  await page.evaluate((m) => sessionStorage.setItem('clarity-coach-test-calls', JSON.stringify([{ name: 'Sam Okafor', startsAt: new Date(Date.now() + m * 60000).toISOString(), zoom: 'https://zoom.example/j/1', briefTo: '/coach/clients' }])), minutes);
  await page.reload(); await page.waitForSelector('.cc-callbar', { timeout: 20000 }); await settle(page, 400);
};
const M11_WORDS = 'Send the renewal pack to Dana tomorrow #Kestrel @email ! 30m'; // the line M11 shows typed
const openTodo = async (page, id) => { await page.locator(`[data-todo="${id}"]`).click(); await settle(page, 600); };
const openBox = async (page, label) => { await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 400); };
const client = (id) => [`/coach/clients/${id}`, async (page) => { await openFold(page, 'Sessions and recaps'); await openFold(page, 'To-dos'); }];

export const EXTRA_GROUPS = [
  {
    name: 'm11-tue', at: TUE,
    screens: [
      ['m11-menu', '/coach', async (page) => { await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600); }],
      ['m11-today-note', '/coach', async (page) => { await page.locator('.cc-inline-link', { hasText: 'Priya Nair' }).first().click(); await settle(page, 600); }],
      ['m11-plan-3', '/coach', async (page) => { await take(page); await press(page, 'Next'); await press(page, 'Next'); }],
      ['m11-today-add', '/coach', async (page) => { await press(page, 'Add to-do'); await page.locator('.ds-dialog textarea, .ds-dialog input[type=text]').first().fill(M11_WORDS); await settle(page, 300); }],
      ['m11-today-more', '/coach', async (page, size) => { if (size === 400) return 'skip'; const row = page.locator(`.cc-todo-row:has([data-todo="${DAY.t9}"])`).first(); await row.hover(); await row.locator('.cc-todo-more').click(); await settle(page, 400); return null; }],
      ['m11-todo-when', '/coach/todos', async (page) => { await openTodo(page, DAY.t3); await openBox(page, 'When I’ll do it'); }],
      ['m11-todo-repeats', '/coach/todos', async (page) => { await openTodo(page, DAY.t3); await openBox(page, 'Repeats'); }],
      ['m11-quick-add', '/coach/todos', async (page, size) => { if (size === 400) { await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600); } await page.getByLabel('What needs doing?').first().fill(M11_WORDS); await settle(page, 300); }],
    ],
  },
  { name: 'm11-bar', at: TUE, screens: [['m11-bar-8', '/coach', bar(7.6)], ['m11-bar-5', '/coach', bar(4.6)], ['m11-bar-now', '/coach', bar(-0.2)]] },
  {
    name: 'm11-clients', at: TUE, seed: { sessions: true }, shares: 'sessions',
    screens: [['m11-session-what', `/coach/sessions/${SES.write}`, async (page) => { await openBox(page, 'What happened'); }], ['m11-client-sam', ...client(ID.sam)], ['m11-client-mia', ...client(ID.mia)], ['m11-client-leo', ...client(ID.leo)], ['m11-client-marcus', ...client(ID.marcus)], ['m11-client-jordan', ...client(ID.jordan)]],
  },
];

// ---------------------------------------------------------------- the reasons
// Each names the source that wins over M11: the run's prompt, a rule in CLAUDE.md, or a later run.
const seed = (m11, built, why, more = {}) => [m11, built, `the test’s data: ${why}`, { data: true, ...more }];
const seeded = (built, why, more = {}) => [built, `the test’s data: ${why}`, null, { data: true, ...more }];
const FIN = 'Finances is Phase 6b: Today’s Finances line is built and hidden until it exists (coach rule 17)';
const MONEY = 'invoices, top-ups, agreements and the renewal proposal are Finances, Phase 6b (coach rule 26)';
const KIT = 'Keep in touch and past clients’ check-ins on Today are run 4 (coach rule 26)';
const FACTS = 'Who needs attention is coaching facts only (coach rule 17): sessions, recaps, time credit and no next session';
const NOTIME = 'a peak moment keeps its day and place, never a time of day, so the forecast and Coming up give none (migration 048)';
const NUDGE = 'the prompt’s recap nudge: one quiet line when a recap is still unsent 24 hours after a call (coach rule 17)';
const RENEW = 'the prompt’s row for 2 sessions or fewer left; Offer a renewal opens “Coming in this build” until the renewal proposal, Phase 6b (coach rules 17 and 26)';
const WRITEUP = 'the prompt’s row for a session still to write up (coach rule 17)';
const ZOOM = 'Join on Zoom shows only when the session has a link, which the calendar brings in run 3 (coach rule 20)';
const HELP1 = 'one line of help at most, the rest behind a quiet link to the side panel (coach rule 23)';
const ADDROW = 'the add row at the end of a list (rule 29)';
const STEP3 = 'Plan my day’s step 3 gives each to-do a time from a menu of the gaps between calls; dragging onto a calendar comes with the calendar, run 3 (the prompt)';
const PEAK = 'the debrief is shown with the client portal’s own three answers and the moment’s own name (Peak moments rule 5; the prompt: no invented fields)';
const MAIL = 'email logging is run 4 (coach rule 26)';
const ATTACH = 'a to-do’s attachments and the forwarded-email address are run 4 (coach rule 16)';
const DATES = 'dates read “Planned for Wed 18 Nov, 10:00”; Today and Tomorrow stay single words (coach rule 16)';
const SAID = 'a to-do’s day is said wherever the list isn’t Today’s own (coach rule 16)';
const BACK = 'Back goes to the client the page is about (the prompt)';
const ADDSESSION = 'sessions are added from a client’s or group’s page until the calendar, run 3 (coach rule 19)';
const HELD = 'the prompt’s count of sessions held, with run 1’s one fewer and one more (coach rule 19)';
const ASKED = 'testimonial and case-study requests are Phase 6b and 6c: nothing sends, the coach ticks that they asked (coach rule 26)';
const POPUP = 'a menu is the shared pop-up, drawn above the page (the built design reference), so it is read after the page; M11 draws it inside the row';
const LABELS = 'the shared text box shows its label (the built design reference); M11 keeps this one for screen readers only';
// Differences no rule explains, kept as built for Tim to decide (run 2's report, 20 Nov). Each is listed, so anything new still fails.
const TIM = (why) => `left for Tim to decide (run 2’s report): ${why}`;
const T_NOTE = TIM('the note’s line comes from why the name was shown (the birthday line here), not the next call');
const T_REVIEW = TIM('the weekly review’s step 3 lists what was done under its heading, 5 then Show all');
const T_CLOSE3 = TIM('Close the day’s step 3 says the day once above the list (rule 29ap) and shows each estimate');
const T_GOALS = TIM('the guided close shows the goals without the start and now ratings');
const T_GROUP = TIM('a group session has no single client’s brief, so its link is “Open”');
const T_WHEN = TIM('When offers Today, Tomorrow, Another day (the date picker) and Someday, with After work as its own switch');
const T_REPEATS = TIM('Repeats offers the general rules; “2 weeks after I finish it” (a repeat counted from finishing) is not built');
const T_TAGS = TIM('tags stay on a phone’s rows');
const T_SELECT = TIM('Done rows and a client page’s to-dos have no select or More');
const T_TIME = TIM('under a day’s heading only the time shows (rule 29ap: no repeated line)');

/** Differences that hold on every screen: met where M11 shows them, never required. */
export const EVERYWHERE = {
  changes: [
    [/^(Elena Ruiz|Tom Hale|Ruth Adams)$/, null, 'a to-do names its client; a lead’s or contact’s name on its row comes with the CRM, run 4, and one from an email says “From email” with the sender in its panel', { quiet: true, say: 'a lead’s or contact’s name on a to-do’s row' }],
    seed(/^Group of 6$/, 'Group of 3', 'the Kestrel group has 3 members, where M11’s has 6', { quiet: true, say: 'Group of 6' }),
    // An associate: M11 gives Maya her own invented people; the test's associate keeps the owner's seed on the device.
    seed(/^(Nina Shah|Nina Shah in \d minutes|Nina Shah Starting now|Lakeside Rowing Club|Ross Kemp|Ella Fraser|13:00|16:30|Prepare for supervision with Tim|Send Nina the pressure plan worksheet|No next session is booked, and one is due by Fri \d+ Nov\.|Nothing here yet\.|Book a call|Season review with the board, 10:00|Season review with the board|6 of 12|5|Today|Self-funded|Wed 18 Nov|Zoom|60 minutes|Done)$/, null, 'M11 gives Maya her own invented clients and to-dos; the test’s associate keeps the owner’s seed on the device', { who: 'associate', quiet: true, say: 'Maya’s own clients and to-dos' }),
    [/^name: (Select|More for|Mark) .*(Prepare for supervision with Tim|Send Nina the pressure plan worksheet)/, null, 'the test’s data: Maya’s own to-dos', { who: 'associate', data: true, quiet: true, say: 'Maya’s own to-dos’ controls' }],
    [/^(SUPERVISION|Hours since your last check-in|8 of 10|Next check-in with Tim|Thu 19 Nov, 16:00, Zoom|Thu 12 Nov, 16:00, Zoom|Join on Zoom|YOUR HOURS AND PAY|Coaching hours in November|24|Pay for November|£2,400|Download my November statement)$/, null, 'an associate’s Supervision and Your hours and pay are Phase 6b and 6c (coach rule 26)', { who: 'associate', quiet: true, say: 'Supervision, and Your hours and pay' }],
  ],
  added: [
    [/^name: Who can see this: /, 'the eye says “Who can see this:” before its words to a screen reader (rule 24)', null, { quiet: true, say: 'Who can see this:' }],
    [/^name: \d\d:\d\d, .+\. Open the (brief|group)$/, 'a call’s row tells a screen reader what it opens; its words are M11’s', null, { quiet: true, say: 'a call’s spoken name' }],
    [/^name: [^“”]+, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ (Nov|Dec)$/, 'a forecast row is read out as one sentence; its words are the row’s', null, { quiet: true, say: 'a forecast row’s spoken name' }],
    [/^name: .+\. Open$/, 'a session’s row tells a screen reader it opens; its words are the row’s', null, { quiet: true, say: 'a session row’s spoken name' }],
    [/^name: Edit capacity$/, 'an Edit link says what it edits to a screen reader (5e rule 29am)', null, { quiet: true, say: 'Edit capacity' }],
    [/^name: Remove /, 'the crosshair that removes a row is named for its row (rule 30)', null, { quiet: true, say: 'Remove …' }],
    [/^name: .+, important$/, 'Important is said to a screen reader wherever its box shows (rule 4a)', null, { quiet: true, say: '…, important' }],
    [/^Sam Okafor (in \d minutes|is starting now)$/, 'the test’s data: the test’s call is Sam’s for both roles, where M11 gives Maya one of her own', null, { who: 'associate', data: true, quiet: true, say: 'Sam’s call on the associate’s bar' }],
    [/^name: Close$/, 'on a phone a menu is the shared panel from the foot, with its own Close (the built design reference)', null, { on: 'p', quiet: true, say: 'Close, on a phone’s menu' }],
  ],
  moved: [[/^today$/, 'the test’s data: Maya’s own to-do says Today under it', null, { who: 'associate', data: true, quiet: true, say: 'Today, on Maya’s own to-do' }]],
};
// What the test's associate shows is the owner's seed, so each of its lines is held against the owner's M11 screen too.
// M11's Maya has a quieter day: nothing over, two rows in Who needs attention, nothing done. Those states are the owner's only.
const OWNER = { who: 'owner' };
const BRIEF_NAME = [/^name: .+: open the brief$/, 'the name on the bar opens the brief too, and says so to a screen reader (run 3: the bar’s name opens the brief in place)'];
// (On a phone the bar is the name, when and Join on Zoom, as M11 draws it: the name itself opens the brief. Run 3.)
const TAG_P = [/^(Writing|Phone)$/, T_TAGS, null, { on: 'p', say: 'a tag M11’s phone leaves off a row' }];

const steps = (n) => Array.from({ length: n }, () => 'fstep:1');

// Today's page, whichever day: what M11 shows that is another phase's, and what the prompt adds.
const TODAY = {
  changes: [
    ['November £2,300 of £5,000', null, FIN], ['Cash dips in May', null, FIN],
    [/^name: Priya Nair\. Send a message or an email$/, null, 'there are no messages in the portal: the name opens a note with Email only (coach rule 11)', { say: 'Send a message or an email' }],
    [/^(KEEP IN TOUCH|Dan Reid|Referrer|Client|Dana Whitfield|Sponsor|Show all 27|Grace Liu|6-month check-in|Ben Ortiz|3-month check-in|Due (Sat|Fri) \d+ (Nov|Dec))$/i, null, KIT, { say: 'Keep in touch, and past clients’ check-ins' }],
    [/^(An answer in Leo’s first check-in needs you\.|Read the draft note)$/, null, `${FACTS}; a flag from an answer in the portal isn’t one`, { say: 'An answer in Leo’s first check-in needs you.' }],
    [/^(Northfield Logistics|An invoice for .+ overdue\.|View the invoice|Invoice a top-up|Owen Price)$/, null, MONEY, { say: 'overdue invoices and Invoice a top-up' }],
    [/^(Kestrel Group|Sam’s agreement ends in 6 weeks\.|Start the renewal)$/, null, MONEY, { say: 'Sam’s agreement ends in 6 weeks.' }],
    [/^(Maya Collins|A supervision check-in is due, after 11 coaching hours\.|Book a check-in)$/, null, 'an associate’s Supervision is Phase 6b and 6c (coach rule 26)', { say: 'A supervision check-in is due' }],
    [/^(The NDA expires on Mon 30 Nov\.|View the document)$/, null, `${FACTS}; a document’s expiry shows on the organisation’s page`, { say: 'The NDA expires on Mon 30 Nov.' }],
    ['Board meeting, 09:00', 'Board meeting', NOTIME], ['Keynote at the Leeds Leaders Forum, 10:00', 'Keynote at the Leeds Leaders Forum', NOTIME, { on: 'd' }],
    ['v Rangers, away, New York, 19:00 there, 00:00 for you', 'v Rangers, away, New York', NOTIME, { on: 'd' }],
    ['Keynote, 10:00', 'Keynote at the Leeds Leaders Forum', `${NOTIME}; M11’s phone gives the moment a shorter name of its own, and a moment has one name`, { on: 'p' }],
    ['v Rangers, 00:00 for you', 'v Rangers, away', `${NOTIME}; on a phone the line is shorter: the place is left off`, { on: 'p' }],
    seed(/^(Hannah Wells|Leo Grant|Marcus Bell|Check the recap|Yesterday’s recap is ready to check\.|2 hours 10 minutes of time credit are left\.|Show all 9|Nothing is booked after today, and a session is due by Tue 1 Dec\.|Book a call)$/, null, 'Who needs attention follows the seed’s own sessions, so M11’s rows are others or sit behind Show all', { say: 'M11’s own rows in Who needs attention' }),
  ],
  added: [
    [/’s recap from .+ hasn’t been sent yet\.$/, NUDGE, null, { say: 'Leo’s recap from Sun 15 Nov hasn’t been sent yet.' }], ['Send the recap', NUDGE],
    [/ has \d sessions? left\.$/, RENEW, null, { say: 'Jordan has 1 session left.' }], ['Offer a renewal', RENEW],
    [/^(Yesterday|Today)’s session is ready to write up\.$/, WRITEUP, null, { say: 'Yesterday’s session is ready to write up.' }], ['Write it up', WRITEUP],
    ['Open Marcus’s page', 'time credit’s row opens the client’s page: Invoice a top-up is Finances, Phase 6b (coach rule 26)'], TAG_P,
    seeded(/^((Sun|Wed) \d+ Nov’s recap is ready to check\.|Show all \d|Jordan Reyes|Priya Nair|Marcus Bell|Leo Grant|Sam Okafor|Check the recap|2 hours 10 minutes of time credit are left\.)$/, 'the seed’s own rows in Who needs attention', { say: 'the seed’s own rows in Who needs attention' }),
  ],
  moved: [seeded(/^(check the recap|priya nair|leo grant|marcus bell|jordan reyes|sam okafor)$/, 'Who needs attention’s rows are the seed’s, in its own order', { say: 'a row of Who needs attention' })],
};
const today = (more = {}) => ({ changes: [...TODAY.changes, ...(more.changes || [])], added: [...TODAY.added, ...(more.added || [])], moved: [...TODAY.moved, ...(more.moved || [])] });

// The quick add at the top of To-dos: M11 always shows an example typed in it; the built box shows its chips once something is typed (To-dos, Today types M11's line).
const TYPED = { after: 'What needs doing?', before: 'Add to-do', boxes: ['Send the renewal pack to Dana tomorrow #Kestrel @email ! 30m'] };
const QUICK = {
  changes: [['View', 'List', 'the List and Calendar switch is the same on a phone as on a laptop (Tim’s design rules for this run, 18 and 19 Nov)', { on: 'p' }]],
  added: [['# a list or client, @ a tag, ! important', `the quick add is one part, on the page and in its panel, with its one line of help: ${HELP1}`, null, { on: 'd' }], ['More it understands', HELP1, null, { on: 'd' }], ['Add to-do', ADDROW, null, { on: 'd' }],
    [/^(List|Calendar)$/, 'the List and Calendar switch is the same on a phone as on a laptop (Tim’s design rules for this run, 18 and 19 Nov)', null, { on: 'p', say: 'List, Calendar' }]],
};
const SESSIONS = {
  changes: [
    seed(/^(Late cancellation|Waived|Three-way meeting|With (Dana Whitfield|Paul Garner|Ruth Adams|Kim Alvarez)|Goals shared|Thu 22 Oct|Thu 8 Oct|Mon 14 Sep|Thu 5 Nov|Recap sent|Coaching session|60 minutes)$/, null, 'each client’s sessions are the seed’s own; M11 gives every client the same four', { say: 'M11’s four sessions' }),
    ['2 weeks after I finish it', null, T_REPEATS],
    [/^name: Select /, null, T_SELECT, { on: 'd', say: 'Select on a client’s to-do' }],
  ],
  added: [
    ['Add session', ADDSESSION],
    [/^(Sessions held|Take one off|Add one|\d+|\d+ recorded here, counted with the ones from before\.|Each session you write up is counted here\.)$/, HELD, null, { say: 'Sessions held, with Take one off and Add one' }],
    [/^name: One (fewer|more) session held$/, HELD, null, { say: 'One fewer and One more session held' }],
    seeded(/^((Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ Nov|To write up|Recap to send|Recap sent|30 minutes|60 minutes|Coaching session|SESSIONS AND RECAPS|Add an engagement to count sessions against it\.)$/, 'the seed’s own sessions, the ones to come included (every session is listed, newest first: the prompt)', { say: 'the seed’s own sessions' }),
    [/^(Today|Planned for Sat 21 Nov)$/, SAID, null, { say: 'a to-do’s day on a client’s page' }],
    [/^Your own to-dos for .+ show here\.$/, 'the calm empty line: these are the coach’s own to-dos for the client, never the client’s (coach rule 16)', null, { say: 'Your own to-dos for Leo show here.' }],
  ],
  moved: [seeded(/^(recap sent|thu 5 nov|coaching session|60 minutes)$/, 'the seed’s own sessions')],
};
// A to-do's panel.
const PANEL = {
  changes: [[/^(ATTACHMENTS|Add file)$/i, null, ATTACH, { say: 'Attachments, Add file' }], seed('Keep the morning to three parts. Ruth wants a short survey after.', null, 'the seed’s to-do has no notes')],
  added: [['Time, if it has one', 'When I’ll do it is a day and an optional time (the prompt)'], [/^(Client|No client)$/, 'the client a to-do belongs to (the prompt)', null, { say: 'Client' }]],
};
const AFTER_WORK = [/^(After work|It sits apart from your working day\.)$/, T_WHEN, null, { say: 'After work as a switch' }];
const clientRow = (name, who, more = {}) => ({ name: `${name}’s sessions and to-dos`, m11: `client:${who}`, clicks: ['fold:todo'], sections: ['Sessions and recaps', 'To-dos'], built: `m11-client-${who}`, ...SESSIONS, ...more });

export const ROWS = [
  // ---- the frame
  { name: 'The menu', m11: 'menu', part: 'menu', built: 'm11-menu',
    changes: [[/^(27|Speaking|Partners|name: Network, 27 due a catch-up)$/, null, 'Network’s count and the boards come with the CRM, run 4 (coach rule 26)', { who: 'owner', say: 'Network’s count, and the boards' }],
      seed(/^(Renewals due|Quiet leads|Phone to-dos)$/, null, 'the favourite views are the seed’s own', { say: 'M11’s favourite views' })],
    added: [seeded(/^(Admin|Business)$/, 'the seed makes Admin and Business to-do lists, so it has five; M11 has three lists (Kestrel renewal, Northfield workshop, The book), and Admin and Business there are only words on a to-do', { say: 'Admin, Business' })] },
  { name: 'A name’s note, from Today', m11: 'today:tue', clicks: ['sheet:bday'], part: 'sheet', built: 'm11-today-note', ...OWNER,
    changes: [[/^(How do you want to send it\?|Portal message|Priya sees this in her portal messages, with a notification on her phone\.|Send message)$/, null, 'there are no messages in the portal, so a note has one way to go: the coach’s own email (coach rule 11)', { say: 'Portal message' }],
      ['Call at 17:00', 'It’s their birthday today.', T_NOTE], [/^Happy birthday, Priya! .+ See you at 17:00, unless you’d rather move it\. Tim$/, 'Happy birthday, Priya! I hope you get some proper time off today.', T_NOTE, { say: 'See you at 17:00, unless you’d rather move it.' }]],
    added: [[/^(Nothing is sent until you send it from your own email\.|Open in my email)$/, 'nothing the coach writes sends by itself: Email opens the coach’s own email app (coach rule 11)', null, { say: 'Open in my email' }]] },
  // ---- Today
  { name: 'The next-call bar, 8 minutes before', m11: 'today:tue', part: 'bar', built: 'm11-bar-8', added: [BRIEF_NAME] },
  { name: 'The next-call bar, 5 minutes before', m11: 'today:5', part: 'bar', built: 'm11-bar-5', added: [BRIEF_NAME] },
  { name: 'The next-call bar, as the call starts', m11: 'today:now', part: 'bar', built: 'm11-bar-now',
    changes: [['Sam Okafor Starting now', 'Sam Okafor is starting now', 'every line is a full sentence with a verb (26 Oct design rule 9)', { on: 'd' }]],
    added: [['Sam Okafor is starting now', 'every line is a full sentence with a verb (26 Oct design rule 9); M11 says “Starting now”', null, { on: 'p' }], BRIEF_NAME] },
  { name: 'Today, a Tuesday morning', m11: 'today:tue', built: 'today-tue', ...today() },
  { name: 'Today, Who needs attention shown in full', m11: 'today:tue', clicks: ['more:att'], sections: ['Who needs attention'], built: 'today-attention-all', ...OWNER, ...today() },
  { name: 'Today, a to-do’s More menu', m11: 'today:tue', clicks: ['rm:todo:t9'], sections: ['To-dos'], built: 'm11-today-more', on: 'd', ...OWNER,
    changes: [['Label', 'Tag', TIM('“Tag” is the portal’s word everywhere (M11’s own bulk bar says Tag)')]],
    moved: [[/^(edit|date|tag|select|delete)$/, POPUP]] },
  { name: 'Today is 45 minutes over', m11: 'today:tue', clicks: ['sheet:overday'], part: 'sheet', built: 'today-over', ...OWNER,
    changes: [seed(/^(6 hours 45 minutes|09:00 to 18:30|9 hours 30 minutes)$/, null, 'M11’s own figures don’t come to 45 minutes over; the seed’s do: 4 hours 30 minutes of calls and 3 hours 30 minutes of to-dos in a day of 09:30 to 16:45', { say: 'the panel’s figures' })],
    added: [seeded(/^(4 hours 30 minutes|09:30 to 16:45|7 hours 15 minutes)$/, 'the figures that do come to 45 minutes over')] },
  { name: 'Choose what to move', m11: 'today:tue', clicks: ['sheet:overday', 'sheet:trim'], part: 'sheet', built: 'today-move', ...OWNER },
  { name: 'Add to-do, from Today', m11: 'today:tue', clicks: ['sheet:qadd'], part: 'sheet', built: 'm11-today-add',
    changes: [['Repeats, times and estimates work in plain words, such as every Monday, 10:00 or 30m.', 'More it understands', HELP1, { on: 'd' }]],
    added: [['e.g. Call Sam Fri 10:00 #Kestrel @phone ! 30m', 'the quick add is one part, so its box says the same when empty in the panel as on the page, where M11 has it'],
      [/^(# a list or client, @ a tag, ! important|More it understands)$/, `the quick add is one part on a phone and on a laptop, with its one line of help (coach rule 23); M11’s phone panel has none`, null, { on: 'p', say: 'the one line of help, on a phone' }]] },
  { name: 'Plan my day, step 1', m11: 'plan', part: 'sheet', built: 'today-plan-1' },
  { name: 'Plan my day, step 2', m11: 'plan', clicks: steps(1), part: 'sheet', built: 'today-plan-2',
    changes: [['Planned for Wed 18 Nov, 10:00', 'Tomorrow', DATES],
      seed(/^(1 h|30 min|15 min)$/, null, 'five of these to-dos have no estimate in the seed, and M11 gives each one', { say: 'an estimate on every to-do' }),
      seed(/^Planned for (Mon 23 Nov|Tue 1 Dec)$/, null, 'the seed counts its days on from the pinned day, so they are Sat 21 Nov and Sun 29 Nov', { say: 'Planned for Mon 23 Nov, Planned for Tue 1 Dec' })],
    added: [seeded(/^Planned for (Sat 21 Nov|Sun 29 Nov)$/, 'the seed’s own days')],
    moved: [seeded(/^(30 min|15 min)$/, 'the estimates the seed has')] },
  { name: 'Plan my day, step 3', m11: 'plan3', part: 'sheet', built: 'm11-plan-3',
    changes: [['Drag each one into a gap.', 'Give each one a time, or leave it without one.', STEP3],
      [/^(CHI|UK|Tue|17|\d\d:00)$/, null, STEP3, { say: 'the day column with its two time zones' }],
      [/^(Zoom, 12:30 to 13:30|Group, 14:00 to 15:30|15:45, 09:45 Chicago|Zoom, 17:00 to 18:00)$/, null, `${STEP3}; the calls are a plain list in time order, as Today’s Calls`, { say: 'the calls drawn on the day column' }],
      [/^(Training|09:45 to 12:00|Parents’ evening|Family)$/, null, 'the coach’s own calendar events come with the calendar, run 3', { say: 'Training and Parents’ evening' }],
      [/^name: (.+ Drag onto the calendar|Chicago time\. Choose the second time zone|.+, Tue 17 Nov \d\d:\d\d to \d\d:\d\d.*)$/, null, STEP3, { say: 'the calendar’s spoken names' }],
      seed(/^(Call Priya about the keynote|Pull Sam’s progress for the review|15 min|30 min)$/, null, 'M11’s step 3 has two to-dos picked in step 2; nothing is picked on the way here', { say: 'two to-dos picked in step 2' })],
    added: [[/^(Add a time|YOUR DAY)$/, STEP3, null, { say: 'Add a time, and Your day' }], [/^name: Add a time for /, STEP3, null, { say: 'Add a time for …' }],
      [/^(Kestrel Group|60 minutes|90 minutes|Harbour City FC|Self-funded|Group of 3|Zoom|09:45 Chicago)$/, `${STEP3}; the calls are a plain list in time order, as Today’s Calls`, null, { say: 'the calls as Today’s rows' }]],
    moved: [[/^(15 min|30 min|\d\d:\d\d|sam okafor|kestrel leadership team|jordan reyes|priya nair)$/, STEP3, null, { say: 'the calls and estimates' }]] },
  { name: 'Today, a Friday afternoon', m11: 'today:fri', built: 'today-fri', shiftDays: -7, ...today({
    changes: [['Weekly review', 'Rate my energy', 'on a Friday afternoon the one offer is Rate my energy, then the Weekly review (coach rule 17)'], ['~3 minutes', '~30 seconds', 'Rate my energy’s own time (coach rule 17)'],
      seed(/^(Quillmark|Zoom|Due Fri|From Fri 6 Nov|Pricing launch, 09:00|v Bay City, home, Chicago, 19:30 there, 01:30 for you|v Bay City, 01:30 for you|Wed 18 Nov|Tue 17 Nov)$/, null, 'the seed’s Friday: Mia at 14:00 in New York’s time where M11 has Hannah, and every day counted from the pinned Friday', { say: 'M11’s own Friday' })],
    added: [seeded(/^(It’s Priya Nair’s birthday today\.|Mia Torres|Brightline Media|09:00 New York|Due Mon|From Mon 9 Nov|Board meeting|Keynote at the Leeds Leaders Forum|Sat 14 Nov|Sun 15 Nov|Tue 17 Nov)$/, 'the seed’s Friday: Priya’s birthday is always the pinned day, and the forecast is the same three moments', { say: 'the seed’s own Friday' })],
    moved: [seeded(/^(zoom|northfield logistics|tue 17 nov|60 minutes)$/, 'the seed’s Friday')],
  }) },
  { name: 'Weekly review, step 1', m11: 'review', part: 'sheet', built: 'today-review-1', shiftDays: -7,
    added: [seeded(/^(Saved|Undo)$/, 'the message from Rate my energy, which the test answers on its way to the review (coach rule 17: energy first on a Friday afternoon)', { say: 'Saved, with Undo' })] },
  { name: 'Weekly review, step 2', m11: 'review', clicks: ['energy3:Good', ...steps(1)], part: 'sheet', built: 'today-review-2', shiftDays: -7,
    changes: [[/^(Own time|9 hours)$/, null, 'own time needs the calendar, run 3 (the prompt)', { say: 'Own time, 9 hours' }]] },
  { name: 'Weekly review, step 3', m11: 'review', clicks: ['energy3:Good', ...steps(2)], part: 'sheet', built: 'today-review-3', shiftDays: -7,
    changes: [[/^Done$/, null, T_REVIEW, { who: 'owner', say: 'Done on each to-do' }], seed(/^(9|Mon 9 Nov|Thu 5 Nov)$/, null, 'the seed’s week: 6 recaps sent, and its to-dos done on the pinned day', { say: 'M11’s own week' })],
    added: [seeded(/^(6|Fri 13 Nov)$/, 'the seed’s week'), [/^(Pay the Zoom invoice|Show all 12)$/, T_REVIEW, null, { say: '5 rows, then Show all 12' }]] },
  { name: 'Weekly review, step 4', m11: 'review', clicks: ['energy3:Good', ...steps(3)], part: 'sheet', built: 'today-review-4', shiftDays: -7 },
  { name: 'Weekly review, step 5', m11: 'review', clicks: ['energy3:Good', ...steps(4)], part: 'sheet', built: 'today-review-5', shiftDays: -7,
    added: [seeded('Leave Thursday afternoon clear for writing.', 'what the test types in the box')] },
  { name: 'A week over capacity', m11: 'capover', sections: ['Capacity'], built: 'today-cap', ...OWNER },
  { name: 'Capacity’s Edit, in Settings', m11: 'capover', clicks: ['caps'], from: 'Capacity', built: 'settings-hours-capacity',
    added: [['Each day has its own hours. Today’s over-full line and booking follow them, and they can be dragged on the calendar.', 'the page’s one line of help: the working day decides Today’s over-full line and booking, and is set on the calendar (coach rules 17 and 23; run 3)']] },
  { name: 'Today, the evening', m11: 'today:eve', built: 'today-eve', ...today({
    changes: [seed('Done', null, 'M11’s evening has every call written up, so each reads Done; the seed’s four aren’t yet, so each keeps its length and asks to be written up')],
    added: [seeded(/^(It’s Priya Nair’s birthday today\.|60 minutes|90 minutes)$/, 'the seed’s evening: the calls aren’t written up, and Priya’s birthday is always the pinned day', { say: 'the seed’s own evening' })],
  }) },
  { name: 'Close the day, step 1', m11: 'shutdown', part: 'sheet', built: 'today-close-1',
    changes: [seed('5 calls held, 3 recaps sent.', '0 calls held, 0 recaps sent.', 'none of the seed’s calls today is written up')],
    added: [seeded(/^7$/, 'the seed has 7 to-dos done today')] },
  { name: 'Close the day, step 2', m11: 'shutdown', clicks: steps(1), part: 'sheet', built: 'today-close-2' },
  { name: 'Close the day, step 3', m11: 'shutdown', clicks: steps(2), part: 'sheet', built: 'today-close-3',
    changes: [seed(/^(13:00|Ruth Adeyemi|Chemistry Call|17:00|Nora Ellis|9:00 Los Angeles)$/, null, 'tomorrow’s calls are the seed’s own: Priya at 08:30 and at 10:30', { say: 'M11’s own calls tomorrow' })],
    added: [seeded(/^(08:30|10:30|Priya Nair|Self-funded|Zoom|30 minutes|60 minutes)$/, 'tomorrow’s calls in the seed', { say: 'the seed’s own calls tomorrow' }), ['15 min', T_CLOSE3]],
    moved: [seeded(/^(30 minutes|60 minutes)$/, 'tomorrow’s calls in the seed'), [/^wed 18 nov$/, T_CLOSE3]] },
  { name: 'The brief', m11: 'brief', part: 'sheet', built: 'brief',
    changes: [[/^(Fri 13 Nov|Sam emailed: The board moved to Wednesday|Email)$/, null, MAIL, { say: 'Sam emailed: The board moved to Wednesday' }],
      ['After the investor update on Thu 12 Nov, Sam wrote this.', 'After “Investor update” on Thu 12 Nov, Sam wrote this.', PEAK],
      ['What went well', 'What helped', PEAK], ['What I’d change', 'Next time', PEAK],
      [/^(What I learnt|Silence after a question is fine\.)$/, null, `${PEAK}; the review has no fourth answer`, { say: 'What I learnt' }],
      ['Board meeting, Wed 18 Nov, 09:00', 'Board meeting, Wed 18 Nov', NOTIME], ['Join on Zoom', null, ZOOM]],
    added: [[/^(How it went|It went about as I hoped)$/, PEAK, null, { say: 'How it went' }],
      [/^name: .+, (done|not yet)\. Mark as (not yet done|done)$/, 'each action from last time can be switched between Done and Not yet (coach rule 20)', null, { say: 'Mark as done, Mark as not yet done' }]] },
  // ---- To-dos
  // On a laptop M11's line is typed into the box at the top; on a phone the page has no box (Add to-do opens the panel), so the page is read as it opens.
  { name: 'To-dos, Today', m11: 'todos', built: 'm11-quick-add', builtOn: { p: 'todos-today' }, changes: QUICK.changes, added: [...QUICK.added, TAG_P] },
  { name: 'To-dos, Upcoming', m11: 'todos', clicks: ['set:tdview:up'], built: 'todos-upcoming', cut: TYPED, ...QUICK,
    changes: [...QUICK.changes, seed('Marketing', 'Business', 'issue 149 is on the seed’s Business list'), seed(/^MON 23 NOV$/, 'SAT 21 NOV', 'the seed counts its days on from the pinned day'),
      [/^(2 weeks after I finish it|Monthly on the 1st)$/, null, T_REPEATS, { say: '2 weeks after I finish it, Monthly on the 1st' }],
      ['Planned for Wed 18 Nov, 10:00', '10:00', T_TIME], ['Fri 09:15', '09:15', T_TIME],
      seed('Planned for Tue 1 Dec', 'Planned for Sun 29 Nov', 'the seed’s to-do under Later is 12 days on from the pinned day')],
    added: [...QUICK.added, TAG_P, seeded(/^(Business|Every month)$/, 'the seed’s list and its monthly repeat'), [/^(10:00|09:15)$/, T_TIME, null, { who: 'associate', say: 'only the time' }]] },
  { name: 'To-dos, Someday', m11: 'todos', clicks: ['set:tdview:some'], built: 'todos-someday', cut: TYPED, ...QUICK },
  { name: 'To-dos, Done opened', m11: 'todos', clicks: ['fold:done'], built: 'todos-done', cut: TYPED, ...QUICK, ...OWNER,
    changes: [...QUICK.changes, seed(/^(Mon 16 Nov|Thu 12 Nov)$/, null, 'the seed’s to-dos were done on the pinned day and the day before'),
      [/^name: Mark “.+” as done$/, null, 'a ticked box’s name says what pressing it does: “as not done”', { say: '“Mark … as done” on a done to-do' }],
      [/^name: (Select|More for) (Send Hannah the recap|Book the Leeds room|Reply to Jack Moran|Write issue 148 of Leading Ideas|Pay the Zoom invoice)$/, null, T_SELECT, { on: 'd', say: 'Select and More on a done to-do' }]],
    added: [...QUICK.added, TAG_P, seeded(/^(Tue 17 Nov|Yesterday|Mon 16 Nov)$/, 'the day the seed’s to-dos were done'), [/^name: Mark “.+” as not done$/, 'a ticked box’s name says what pressing it does', null, { say: 'Mark … as not done' }]] },
  { name: 'A to-do', m11: 'todo', part: 'sheet', built: 'todos-todo', changes: PANEL.changes, added: [...PANEL.added, AFTER_WORK] },
  { name: 'A to-do, When I’ll do it opened', m11: 'todo', clicks: ['dd:tdw'], part: 'sheet', built: 'm11-todo-when',
    changes: [...PANEL.changes, [/^(After work, today|Thu 19 Nov|Mon 23 Nov)$/, null, T_WHEN, { say: 'After work, today; Thu 19 Nov; Mon 23 Nov' }]],
    added: [...PANEL.added, AFTER_WORK, ['Another day', T_WHEN]], moved: [[/^(today|tomorrow|someday)$/, POPUP]] },
  { name: 'A to-do, Repeats opened', m11: 'todo', clicks: ['dd:tdrep'], part: 'sheet', built: 'm11-todo-repeats',
    changes: [...PANEL.changes, [/^(Every Thursday|Monthly on the 1st|2 weeks after I finish it)$/, null, T_REPEATS, { say: 'Every Thursday, Monthly on the 1st, 2 weeks after I finish it' }]],
    added: [...PANEL.added, AFTER_WORK, [/^(Every day|Every weekday|Every 2 weeks|Every month|Every year)$/, T_REPEATS, null, { say: 'Every day, Every weekday, Every 2 weeks, Every month, Every year' }]], moved: [[/^(never|every week)$/, POPUP]] },
  { name: 'A to-do from a forwarded email', m11: 'todomail', part: 'sheet', built: 'todos-todo-email',
    changes: [[/^(ATTACHMENTS|Add file|Email from Ruth Adams|Forwarded from Gmail)$/i, null, ATTACH, { say: 'Attachments, with the forwarded email' }], seed('Forwarded from Gmail on Tue 17 Nov, 07:58.', null, 'the seed’s to-do has no notes')],
    added: [...PANEL.added, AFTER_WORK,
      [/^(The January start|Mon 16 Nov, 16:20)$/, 'Linked to gives the sender, the email’s subject and when it came (the prompt)', null, { say: 'the email’s subject and when it came' }]] },
  { name: 'Several to-dos chosen', m11: 'bulk', built: 'todos-picked', cut: TYPED, ...QUICK, added: [...QUICK.added, TAG_P] },
  { name: 'Several to-dos chosen, Move opened', m11: 'bulk', clicks: ['bulk:move'], built: 'todos-picked-menu', cut: TYPED, ...QUICK, added: [...QUICK.added, TAG_P, ['No list', TIM('“No list” lets Move take a to-do out of its list'), null, { on: 'd' }]] },
  { name: 'A to-do list', m11: 'list', built: 'todo-list', cut: TYPED, ...QUICK,
    changes: [...QUICK.changes, ['Fri 09:15', 'Planned for Fri 20 Nov, 09:15', DATES]],
    added: [...QUICK.added, [/^(Tomorrow|Planned for Sat 21 Nov)$/, SAID, null, { say: 'each to-do’s day' }],
      [/^name: More for (Before the review|The proposal)$/, 'a heading’s own menu, to rename or remove it: M11 draws headings and no way to change one', null, { say: 'More for a heading' }]] },
  // (To-dos as a calendar, M11's todocal, is built in run 3: its row is in compare-m11-run3-screens.mjs.)
  // ---- sessions
  { name: 'After a call', m11: 'session', built: 'session',
    changes: [['Clients', 'Hannah Wells', BACK], ['Open the Fathom summary', null, 'the Fathom draft is Phase 6c (coach rule 26)'],
      [/^(Layout|Regular session)$/, null, 'note layouts are rows in Settings, wired in a later run: the regular layout shows (coach rule 7)', { say: 'Layout' }]],
    added: [['Add action', ADDROW], ['What will they do?', 'each action is a box of its own, saying what it is for when empty (rule 30)'], [/^(Recap for Hannah|Notes for supervision)$/, LABELS, null, { say: 'Recap for Hannah, Notes for supervision as labels' }],
      ['Delete this session', 'a session is added by hand until the calendar (coach rule 19), so one added by mistake can be deleted, with Undo (coach rule 5)'],
      [/^name: “.+”: goes to (this week|the backlog)\. Switch it$/, 'the quiet link tells a screen reader what it switches', null, { say: 'Switch it' }]] },
  { name: 'After a call, What happened? opened', m11: 'session', clicks: ['dd:sess'], built: 'm11-session-what',
    changes: [['Clients', 'Hannah Wells', BACK], ['Open the Fathom summary', null, 'the Fathom draft is Phase 6c (coach rule 26)'], [/^(Layout|Regular session)$/, null, 'note layouts are wired in a later run (coach rule 7)', { say: 'Layout' }]],
    moved: [[/^(it went ahead|cancelled with under 24 hours’ notice|no-show|moved)$/, POPUP]],
    added: [['Add action', ADDROW], ['What will they do?', 'each action is a box of its own (rule 30)'], ['Delete this session', 'a session added by mistake can be deleted, with Undo (coach rules 5 and 19)'], [/^(Recap for Hannah|Notes for supervision)$/, LABELS, null, { say: 'labels' }],
      [/^name: “.+”: goes to (this week|the backlog)\. Switch it$/, 'the quiet link tells a screen reader what it switches', null, { say: 'Switch it' }]] },
  { name: 'The guided close', m11: 'close', built: 'close',
    changes: [['Clients', 'Priya Nair', BACK], seed('6-month coaching, Mon 4 May to Fri 4 Dec', '6-month coaching, Tue 8 Sep to Mon 7 Dec', 'the seed’s engagement has its own dates'),
      ['FIRST CHECK-IN GOALS', 'FIRST REVIEW GOALS', 'the portal’s name is the First review (rule 26a)'],
      seed('In the last session, on Fri 4 Dec.', 'In the last session, on Tue 17 Nov.', 'Priya’s last session in the seed is today’s'),
      ['Send the request', 'Not asked yet', ASKED],
      [/( at the start, and .+ now\.|^Done in July\.)$/, null, T_GOALS, { say: 'each goal’s rating at the start and now' }]],
    added: [[/^name: (Testimonial|Results for case studies): I’ve asked Priya$/, ASKED, null, { say: 'I’ve asked Priya' }], ['What Priya most wanted from coaching, in their own words.', T_GOALS]] },
  { name: 'A group’s sessions', m11: 'group', sections: ['Next group session', 'Sessions and recaps'], built: 'group-sessions',
    changes: [['Open the brief', 'Open', T_GROUP], ['Join on Zoom', null, ZOOM], seed('One recap to all 6', 'One recap to all 3', 'the Kestrel group has 3 members, where M11’s has 6')],
    added: [[/^name: Open the next group session$/, T_GROUP, null, { say: 'Open the next group session' }], ['Add session', ADDSESSION], ['Recap sent', 'a sent recap says so on its row, as a client’s session does (M11’s client pages)'],
      seeded('Tue 17 Nov', 'today’s group session is listed with the others (every session, newest first: the prompt)')] },
  clientRow('Sam', 'sam'), clientRow('Mia', 'mia'), clientRow('Leo', 'leo'), clientRow('Marcus', 'marcus'), clientRow('Jordan', 'jordan'),
];
