// Phase 6a run 4 (Leads, the CRM and Network): every screen M11 seq 77
// draws for it, the built screen it is held against, and each meant
// difference with its reason. compare-m11-run2.mjs does the reading and
// comparing (see compare-m11-run2-screens.mjs for what a row and its lists
// are); compare-m11.mjs runs it with RUN=4.
//
// The built screens are screens.mjs's own (the groups leads, crm, network,
// network-many and their associates': M11's own people on the device, on
// M11's own Tuesday, 17 Nov 2026). M11's own "today" in these screens is
// Thu 19 Nov, so the seed's dates (calls, last spoke, due dates) fall a day
// or two from M11's, and Network's seed is M11's first twenty people (or
// 1,164 invented ones), where M11 holds 1,139.
// Leads, Network, Automations and the owner's boards are the owner's alone
// (the prompt; BRIEF4), so their rows are read as the owner, and an
// associate's rows hold M11's Maya against what the built portal gives her
// instead: her own Today, or the shared board, read only.
// Anything that differs and is not listed FAILS.

// ---------------------------------------------------------------- the reasons
// Each names the source that wins over M11: the run's prompt, a rule in CLAUDE.md, the handover of 19 Nov, or a builder's report.
const seed = (m11, built, why, more = {}) => [m11, built, `the test’s data: ${why}`, { data: true, ...more }];
const seeded = (built, why, more = {}) => [built, `the test’s data: ${why}`, null, { data: true, ...more }];
const OWNER = { who: 'owner' };
const ASSOC = 'Leads, Network and Automations are the owner’s alone, and an associate who opens one lands on their own Today (the prompt; BRIEF4: “associates see only shared boards”); M11 draws Maya the owner’s screen';
const TIM = (why) => `left for Tim to decide (the UI tester, run 4): ${why}`;
const D = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const M = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const DAY = `${D} \\d{1,2} ${M}( \\d{4})?`;
const r = (s) => new RegExp(s);

const EDIT = 'every control that opens something to alter it says “Edit”, never “Change”, and names what it edits (5e rule 29am; BRIEF4: M11’s “Change stage” is “Edit stage”)';
const SPOKEN = 'a control with its own words is read out by them; a row that opens is named for what it opens, to a screen reader';
const REPORTS = 'lead reports are Finances, Phase 6b (crm-additions 3; the prompt)';
const PROPOSAL = 'proposals are Phase 6b; a proposal’s lines still show on a timeline (builder C’s report)';
const WAIT_ORG = 'the waiting line has no organisation: an email doesn’t say where someone works (builder B’s decision 4)';
const NEWEST = 'the timeline is strictly newest first (builder B’s decision 6)';
const ONEVALUE = 'one Value: the lead’s own; a coach’s own field named Value is left out of Details and the table (builder C’s decision 3)';
const IMSG = 'iMessage shows only for a +1 number (coach rule 11)';
const ADDCARD = 'the add row at the end of each column, named for its column (rule 29; builder D’s decision 6)';
const YEAR = 'a date in another year than this one carries its year (the portal’s date words)';
const NOSEND = 'nothing the coach writes sends by itself: Email opens the coach’s own email app (coach rule 11)';
const FINANCES = 'prices, invoices and what was invested are Finances, Phase 6b (coach rule 18; builder D’s “not built”)';
const HASHED = 'an organisation’s access code is kept hashed, so it is shown once when made, then only reset (coach rule 24)';
const KICKER = 'Nekst capitals are for page titles and section names only; a panel’s own labels and an explanation panel’s title are DM Sans in sentence case (rule 4; “Explanations (16 Nov)”)';
const OUTOF = 'a dot’s spoken name says its list, then each rating “out of 10” (26 Oct design rule 8: full words), and a numbered dot says “Choose to see who”';
const SOONEST = 'check-ins are listed soonest first, on Past clients and on Today alike (builder B’s decision 7)';
const MOST = 'Today’s Keep in touch lists the people most overdue first, as Actions does (the prompt: “Due now, most overdue first”)';

// The test's people, organisations and their words: M11 invents its own (1,139 people), the seed holds twenty, or 1,164.
const NAME = /^[A-Z][a-z]+ [A-Z][a-z']+( \d+)?$/; // (the 1,164's names repeat with a number: “Quinn Abbott 2”)
const ORG = /^(Citadel|Kestrel Group|Quillmark|Linden Partners|Ashby Rugby|Westgate Schools|Ridgeway Trust|Northfield Logistics|Tessaly Foods|Vale Health|Brightwater Capital|Corran Energy|Harbour Lane|Orbital Health|Marlow Analytics|Harbour City FC|Arden Vale|Fenwick Rowing|Fenwick Partners|Ridgeway Foods|Pacific Arc|Brightline Media|Self-funded)$/;
const ROLES = /^(Key contact|Sponsor|Client|Network|Referrer|Past client|Chief medical officer)$/;
const RHYTHM = /^Every (month|\d+ months|year)$/;
const DUE = r(`^(\\d+ days? overdue|Due today|Due ${DAY})$`);
const ROW = /@example\.(com|invalid)\b/;
const COUNTS = /^([\d,]+ (people|PEOPLE)( have had no contact for 18 months and aren’t in a focus list\.)?|Show all \d+|Archived, \d+|Archive \d+|\d+|Showing [\d,]+ of [\d,]+( people: your focus lists first, then who you spoke to most recently\.)?|[\d,]+ of [\d,]+ people|[\d,]+ archived)$/;
const SPOKE = r(`^Last spoke ${DAY}$|^Last spoke \\d+ ${M} \\d{4}$|^You last spoke on ${DAY}\\.$`);
const PEOPLE = [
  seed(NAME, null, 'M11’s people are its own invented 1,139; the seed’s are its own', { say: 'M11’s people' }),
  seed(ORG, null, 'the organisations are each side’s own invented ones', { say: 'M11’s organisations' }),
  seed(ROLES, null, 'each person’s role is the seed’s', { say: 'roles' }),
  seed(DUE, null, 'when each catch-up is due follows the seed', { say: 'due words' }),
  seed(ROW, null, 'a row of the table: the seed’s person (invented addresses use example.invalid in the tests)', { say: 'the table’s rows' }),
  seed(COUNTS, null, 'the counts follow the seed’s people', { say: 'Show all 27, Archived, 37, the dots’ numbers' }),
  seed(SPOKE, null, 'when they last spoke is the seed’s', { say: 'Last spoke' }),
  seed(/^(\d+ )*\d+ Every .+ \d+ \d+$|^Trust \d+\/10, influence \d+\/10$|^Show 50 more$/, null, 'a row and a spot’s ratings are the seed’s; with M11’s 1,139 people the table has more pages', { say: 'a row’s ratings, Show 50 more' }),
  seed(/^name: (Archive .+|.+, .+\. (Change|Edit)|.+, trust \d+, influence \d+(, .+)?\. Open)$/, null, 'each control M11 names for its own people', { say: 'M11’s people’s controls' }),
];
const PEOPLE_ADDED = [
  seeded(NAME, 'the seed’s people', { say: 'the seed’s people' }), seeded(ROLES, 'the seed’s roles'), seeded(RHYTHM, 'the seed’s rhythms'),
  seeded(DUE, 'the seed’s due dates'), seeded(ROW, 'the seed’s rows'), seeded(COUNTS, 'the seed’s counts'), seeded(SPOKE, 'the seed’s dates'),
  seeded(/^Trust \d+\/10, influence \d+\/10$/, 'the spot’s ratings'),
  seeded(/^Name Organisation Role Email Phone Where to focus(, \d+)? Influence Trust in you Value delivery What you get Rhythm Last spoke Next due Given Asked Sector$/, 'the seed holds one column of the coach’s own, Sector (the prompt: your own columns, unlimited)', { say: 'the Sector column' }),
  [/^name: Clear the search$/, 'the shared search box has its own Clear (the built design reference)'],
  [/^name: .+ for .+, .+\. Edit$/, `${EDIT}; each cell is named for its person too`, null, { say: '“Trust in you for Dana Whitfield, 8. Edit”' }],
  [/^name: .+\. Influence \d+ out of 10, trust \d+ out of 10\.( Choose to see who\.)? Open$/, OUTOF, null, { say: '“Dana Whitfield, Keep close. Influence 9 out of 10, trust 8 out of 10. Open”' }],
];
const PEOPLE_MOVED = [seeded(/./, 'the people are the seed’s, so they stand in the seed’s own order', { quiet: true, say: 'the order of the seed’s people' })];
const net = (row) => ({ ...OWNER, ...row, changes: [...(row.changes || []), ...PEOPLE], added: [...(row.added || []), ...PEOPLE_ADDED], moved: [...(row.moved || []), ...PEOPLE_MOVED] });

// The leads' calls: the calendar seed's (run 3), a day from M11's.
const CALLS = r(`^(Chemistry Call, |Connection Call, )?${DAY}(, \\d\\d:\\d\\d)?$`);
const LEAD_DATES = [seed(CALLS, null, 'the booking-made leads’ calls are the calendar seed’s (run 3), a day from M11’s', { say: 'Chemistry Call, Wed 18 Nov, 13:00' })];
const LEAD_DATES_ADDED = [seeded(CALLS, 'the calendar seed’s calls', { say: 'the seed’s calls' })];
const DOYLES = seeded(/^(Chris Doyle|Christopher Doyle|Doyle Capital|Doyle Capital Partners|name: (Select|More for) (Chris|Christopher) Doyle)$/, 'the seed’s two Chris Doyles are open leads in New (M11 names them only in its line “Chris Doyle may be in here twice.”)', { say: 'the two Chris Doyles' });
const PHONE_CARDS = TIM('on a phone a lead keeps the lines it has on a laptop (organisation, value, the next step’s words, opened, quiet, how ready), the duplicates line and Search leads; M11’s phone shows a card’s name and next step only, and no search (26 Oct rule 10: phones show less)');
const MORE_TOUCH = 'on a touch screen a card can’t be dragged, so each has More, with Edit stage (builder C’s report)';
const LEADS_PAGE = {
  changes: [['Reports', null, REPORTS, { maybe: true }], ['You emailed Sarah Kent at Arden Vale, who isn’t in the portal yet.', 'You emailed Sarah Kent, who isn’t in the portal yet.', WAIT_ORG], ...LEAD_DATES],
  added: [DOYLES, ...LEAD_DATES_ADDED,
    [/^(Chris Doyle may be in here twice\.|Review|Head coach, rugby|Opened (3 times|once)|Still to find out: when|£18,000|Brightwater Capital|Quiet for 19 days|Ready to decide|Search leads|Book a Chemistry Call|Chemistry Call|Follow up on the proposal|Send workshop dates|Check in on the decision)$/, PHONE_CARDS, null, { on: 'p', say: 'a card’s other lines on a phone' }],
    [/^name: More for .+$/, MORE_TOUCH, null, { on: 'p', say: 'More for Amy Cole, on a phone' }]],
  // Automations is second in the foot row now, as M11 has it (tidy follow-up 3, run 6's 31): nothing is moved.
  moved: [],
};

/** An associate's row: M11 draws Maya the owner's screen; the built portal gives her her own page instead. */
const CLOSED_MOVED = [/./, ASSOC, null, { quiet: true, maybe: true, say: 'the order' }];
const closed = (name, m11, built) => ({ name: `${name}, as an associate`, m11, built, who: 'associate',
  changes: [[/./, null, ASSOC, { say: `M11’s ${name}` }]], added: [[/./, `${ASSOC}: what shows is her own page`, null, { say: 'her own page' }]], moved: [CLOSED_MOVED] });

const ORGPAGE = {
  changes: [[/^(Invested this year|£34,600|Price per seat|£32\/month)$/, null, FINANCES, { say: 'Invested this year, Price per seat' }], ['CLARITY-KESTREL Copy', 'No access code is set.', HASHED],
    seed(r(`^(Renews |Expires on )?${DAY}\\.?$`), null, 'the seed’s days are two days before M11’s', { say: 'Mon 8 Mar, Renews Mon 8 Mar' }),
    seed(r(`^(Spoke|Emailed) ${DAY}$`), null, 'when the coach last spoke to or emailed each contact is the seed’s', { say: 'Spoke Mon 12 Oct' }),
    [/^(HR director|Finance)$/, null, 'a contact’s role is one of the account map’s roles: Sponsor, Invoices, Buyer, HR, Participant (crm-additions 9; builder A)', { say: 'HR director, Finance' }],
    seed(/^(Chief financial officer|Today, \d\d:\d\d|Owen Price|Maya’s client|Group of 6|Owen’s coaching ends on Fri 29 Jan\.|The last one was Tue 3 Nov\.|Seats in use|14 of 20|Open)$/, null, 'the seed: Sam’s title, his and the group’s next sessions, Maya’s client Owen (an associate’s clients come only from the database), when Owen’s coaching ends, the last workshop, the seats in use and the documents’ files', { say: 'next sessions, Owen Price, the seats in use' })],
  added: [[/^(People coached here|Seats in use|1|1 of 20)$/, 'the account map’s figures without Finances: the people coached and the seats in use (builder D’s report)', null, { say: 'People coached here, Seats in use' }],
    seeded(r(`^(Renews |Ends |Expires on )?${DAY}\\.?$|^(Spoke|Emailed) ${DAY}$`), `the seed’s days; ${YEAR}`, { say: 'Sat 6 Mar 2027' }),
    [/^(HR|Invoices)$/, 'a contact’s role is one of the account map’s roles (crm-additions 9; builder A)', null, { say: 'HR, Invoices' }], seeded(/^(Chief executive|Group of 3|Seats|20|City|London|Edit)$/, 'the seed’s Sam, group and the organisation’s own details (run 1)', { say: 'Chief executive, Group of 3' }),
    [/^(Active|6-month coaching for Sam|7 of 12 sessions to go)$/, TIM('Agreements and proposals lists the engagements as well as the deals (run 1 listed the engagements there; builder D added the deals)'), null, { say: '6-month coaching for Sam, under Agreements and proposals' }],
    ['Add agreement or proposal', 'the add row at the end of the list (rule 29)'], ['Asked about team workshops', TIM('on a phone Who’s who keeps each contact’s note; M11’s phone leaves it out'), null, { on: 'p', maybe: true }], ['Owen’s coaching ends soon.', 'the seed holds no end day for Owen’s coaching on the device, so the line says “soon”'],
    [/^(No access code is set\.|Make an access code)$/, HASHED], ['Prices and invoices arrive with Finances.', FINANCES], ['Delete', 'a document can be deleted, with Undo (run 1)'],
    [/^name: (Edit .+|Delete .+|Offer the seats: .+|Plan a renewal: .+|Add to the pipeline: .+)$/, 'each Edit, Delete and Room to grow action is named for what it is about (5e rule 29am)', null, { say: 'Edit Dana Whitfield, Offer the seeds: …' }]],
  moved: [seeded(/./, 'the seed’s organisation has its rows in another order where M11’s next sessions and Owen aren’t there', { say: 'the order of the rows' })],
};

import { THEY, THEY_NAMES } from './compare-m11-they.mjs';

export const EXTRA_GROUPS = [];

/** Differences that hold on every screen of this run: met where M11 shows them, never required. */

// Polish 1 (Stages A to C; the 25 Nov design reference): the meant differences it brought to run 4's screens. Listed once
// here, met where M11 shows them, never required.
const P1_OPEN = 'Polish 1: every page opens the same way (PageOpening: a small grey label, the title, one grey line, its one main button), and every card has a 13px label (CLAUDE.md, Polish 1 “Layout”)';
const P1_ADD = '“+ Add” by a list’s label shows the word Add, its spoken name saying what it adds (CLAUDE.md, Polish 1 “Adding”; coach-portal.md rule 16’s Polish 1 note)';
const P1_DISCOVERY = 'the Chemistry Call is now the Discovery call (Tim, 25 Nov; coach-portal.md rule 31’s Polish 1 note)';
const P1_ROWS = 'Polish 1’s list rows: a name and one grey line, the value under the name on a phone (CLAUDE.md, Polish 1 “Layout”)';
const P1_AGREE = 'agreements and money on a lead’s and an organisation’s page: New agreement, Send a quote, and the organisation’s Agreement and Billing cards (Phase 6b run 3; agreements.md; Polish 1 Stage C)';
const P1_MENU = 'Polish 1’s frame menu (CLAUDE.md, Polish 1 “Frame and menu”): plain words in groups by gaps, the page you’re on in black, no counts or to-do lists’ headings, Settings in the foot, Sign out a button there, and Needs you in the Finances group (M28 v6)';
export const EVERYWHERE = {
  changes: [...THEY,
    [/^(name: )?Add (someone|lead|field|document|automation|client)$/, null, P1_ADD, { quiet: true, say: 'Add someone, Add lead and the like' }],
    [/(Chemistry Call|CHEMISTRY CALL)/, null, P1_DISCOVERY, { quiet: true, say: 'Chemistry Call' }],
    ['2 h 10 min credit', '2 hours 10 minutes credit', 'units are full words (26 Oct design rule 8)', { quiet: true }],
    [/^(All leads|Connection Call|Brightwater Capital|Leadership Accelerator\. Opened 3 times\.|Leadership Accelerator, £13,500 \+ VAT\.|20 seats)$/, null, P1_ROWS, { quiet: true, say: 'a row’s third fact on a phone' }],
    [/^(Today|Finances|To-dos|Clients|Leads|Network|Boards|Calendar|Leading Ideas|Library|Settings|Sign out|FAVOURITE VIEWS|Executives|Speaking|Partners|Kestrel renewal|Northfield workshop|The book|\d+|name: Close the menu|name: To-dos, \d+ for today)$/, null, P1_MENU, { quiet: true, say: 'the old menu’s lines' }],
  ],
  added: [
    ...THEY_NAMES,
    [/^(Add|name: Add (someone|lead|field|document|automation|client|a team from a spreadsheet)|Add a team from a spreadsheet)$/, P1_ADD, null, { quiet: true, say: '+ Add' }],
    [/(Discovery call|DISCOVERY CALL)/, P1_DISCOVERY, null, { quiet: true, say: 'Discovery call' }],
    [/^(The people you keep in touch with, and who is due a catch-up\.|The people who might become clients, and the next step with each of them\.|The people you coach there, and what you know about the organisation\.|Where things stand with .+, and the next step\.|Small jobs done for you as leads move\. Nothing is ever sent\.|Anything you track in stages, one card at a time\.|The people you’ve coached, and when to check in with each of them\.|The people you coach, and when you see each of them next\.|How your practice runs: your details, booking, calendars and the rest\.|Your email settings\.|Only you can see this board\.|EVERYONE|YOUR AUTOMATIONS|ORGANISATION, .+|[A-Z ,]+, (NEW|CALL BOOKED|PROPOSAL SENT|DECIDING|WON)|\d+ stages, \d+ cards?|name: Sort: .+)$/, P1_OPEN, null, { quiet: true, say: 'the page’s opening, its line and its cards’ labels' }],
    [/^(New agreement|Send .+ a quote|AGREEMENT|BILLING|Billing and invoices|name: Billing and invoices for .+|Their billing isn’t set up yet, so invoices go to their main contact with 30 days to settle\.|(£[\d,]+(\/month)?)?, Renews .+)$/, P1_AGREE, null, { quiet: true, say: 'New agreement, Send a quote, Agreement and Billing' }],
    [/^(Agreements|Business)$/, 'Settings’ sections gained Agreements (Phase 6b run 3) and Business (Polish 1, Stage C, migration 068)', null, { quiet: true, say: 'Agreements and Business in Settings' }],
    [/^(\d+ days ago|2 hours 10 minutes credit)$/, 'a table’s cells are read one by one; units are full words (26 Oct design rule 8)', null, { quiet: true, say: '12 days ago, in its own cell' }],
    [/^(Needs you|Leading Ideas|Library|Admin|Business|Privacy|Search or do anything|name: Close the menu|name: Search, or do anything|name: Notifications, \d+ new)$/, `${P1_MENU}; on a phone the menu holds Search and Notifications at its top (Tim’s walk, item 21)`, null, { quiet: true, say: 'the frame menu’s lines' }],
    [/^name: Who can see this: /, 'the eye says “Who can see this:” before its words to a screen reader (rule 24)', null, { quiet: true, say: 'Who can see this:' }],
    [/^name: Close$/, 'a panel and, on a phone, a menu has the shared Close (the built design reference)', null, { quiet: true, say: 'Close' }],
  ],
  moved: [
    [/^(reports|all leads|new board|founder|head coach, rugby|northfield logistics|kestrel group|harbour city fc|head coaches|sport leaders)$/, `${P1_OPEN}; ${P1_ROWS}`, null, { quiet: true, say: 'the opening’s links and a row’s lines' }],
    [/^(finances|calendar)$/, `${P1_MENU}: Today, Calendar and To-dos are the first group, Finances the third`, null, { quiet: true, say: 'Finances and Calendar in the menu' }],
    [/^(proposal sent|next step|follow up on the proposal|thu 19 nov|log a call|email|add note|opened your proposal|today, 09:12)$/, `${P1_OPEN}: a lead’s stage is in the label over the name, then Where things stand and its next step; the timeline follows`, null, { quiet: true, say: 'a lead’s stage and next step' }],
  ],
};

export const ROWS = [
  // ---- Leads
  { name: 'Leads, the board', m11: 'leads', built: 'leads-board', ...OWNER, ...LEADS_PAGE,
    added: [...LEADS_PAGE.added, seeded('4', 'New holds the seed’s two Chris Doyles as well as Elena and Jack, so its count is 4 where M11’s is 2')],
    changes: [...LEADS_PAGE.changes, [/^name: .+, .+, (New|Call booked|Proposal sent|Deciding|Won)$/, null, SPOKEN, { say: 'a card’s spoken name' }],
      // A phone card is its name and one grey line (tidy follow-up 3, run 6's 33): M11 fits the organisation beside a call's line on its frame; the built card, inside its stage's own padding, is a little narrower, so the organisation is the part left out.
      [/^(Harbour City FC|Vale Health|Kestrel Group)$/, null, TIM('on a phone a card’s one grey line leaves out the organisation when it and the next step don’t both fit; M11’s wider card fits both for Ruth, Nadia and Chris Lowe'), { on: 'p', say: 'the organisation beside a call on a phone card' }]] },
  { name: 'Leads as a list', m11: 'leadsl', built: 'leads-list', ...OWNER, ...LEADS_PAGE,
    changes: [...LEADS_PAGE.changes, ['name: More for Leo Grant', null, 'a won lead has become a client: its row opens the client and has no More (builder C’s report: More is Edit details, Edit stage, Log a call, Select, Mark as cold, none of which apply)', { on: 'd', say: 'More for Leo Grant, on a laptop (a phone’s list shows no More on its rows)' }]] },
  { name: 'Leads as a table', m11: 'leadst', built: 'leads-table', ...OWNER, on: 'd', ...LEADS_PAGE,
    changes: [...LEADS_PAGE.changes, [/^name: Stage, .+\. Change$/, null, EDIT, { say: 'Stage, Proposal sent. Change' }], ['name: Next step, none. Edit', 'Next step, empty. Edit', 'an empty cell is read out as “empty”, as in every built table']],
    added: [...LEADS_PAGE.added, [/^(.* Add( Add)*|New Add \d+ days ago Add Add Add|Won Fri 13 Nov Logistics £13,500 Add)$/, 'a row’s empty cells read “Add” on the row’s own line', null, { maybe: true, say: 'a row with its empty cells' }], ['Add lead', 'the add row under the table, as under the board and the list (rule 29)'],
      [/^name: Stage, .+\. Edit$/, EDIT, null, { say: 'Stage, Proposal sent. Edit' }], [/^name: (Next step|Sector|Value|Renewal date), .+\. Edit$/, 'each cell is named with its value', null, { say: 'a cell’s spoken name' }]],
    moved: [...LEADS_PAGE.moved, [/./, TIM('the table opens soonest next step first (Tom’s overdue one at the top); M11 lists them in the order they were added'), null, { say: 'the table’s order' }]] },
  { name: 'A lead', m11: 'lead', built: 'lead-amy', ...OWNER,
    changes: [['iMessage', null, IMSG], seed('amy.cole@northfield.co', 'amy.cole@example.invalid', 'invented addresses in the tests are example.invalid'), [/^(Value|£13,500)$/, null, ONEVALUE, { say: 'the second Value' }]],
    added: [[/^name: (Edit where Amy is|Email, .+\. Edit|Phone, .+\. Edit|Tags, .+\. Edit)$/, EDIT, null, { say: 'Edit where Amy is, Email … Edit' }]],  // On a phone the timeline is a line and one grey line, as M11 has it (tidy follow-up 3, run 6's 33): the notes and their order match now.
    moved: [[/^(mark as won|booking link)$/, 'Mark as won and Booking link stay in the row on a phone (builder C’s decision 8)', null, { on: 'p', say: 'Mark as won, Booking link' }], [/^(today, 07:55|amy replied: our ceo is in on thursday|email)$/, NEWEST, null, { say: 'Amy’s reply above the proposal opened' }], ['northfield logistics', 'the organisation is its own link line under the title, as on a client’s page (builder C’s decision 8)', null, { maybe: true }], [/^(value|£13,500)$/, ONEVALUE, null, { say: 'Value' }]] },
  { name: 'A lead with emails', m11: 'lead2', built: 'lead-ruth', ...OWNER,
    changes: [['iMessage', null, IMSG], ['Send a proposal', null, PROPOSAL], ...LEAD_DATES, seed('ruth.adeyemi@harbourcityfc.co.uk', 'ruth@example.invalid', 'invented addresses'), [/^(Value|Add)$/, null, ONEVALUE, { say: 'the second Value' }]],
    added: [...LEAD_DATES_ADDED, [/^name: (Edit where Ruth is|Email, .+\. Edit|Phone, .+\. Edit|Tags, .+\. Edit)$/, EDIT, null, { say: 'Edit where Ruth is' }]],
    moved: [['harbour city fc', 'the organisation is its own link line under the title (builder C’s decision 8)', null, { maybe: true }], ['value', ONEVALUE], [/^(mark as won|booking link)$/, 'Mark as won and Booking link stay in the row on a phone (builder C’s decision 8)', null, { on: 'p', say: 'Mark as won, Booking link' }], seeded(r(`^${DAY.toLowerCase()}$`), 'the timeline’s days are the seed’s')] },
  { name: 'An email on a timeline', m11: 'email', part: 'sheet', built: 'lead-email', ...OWNER,
    changes: [seed('Thanks for the details, Tim. Before Wednesday, can we start in January? Our season review lands in December and I want the staff free for it.', 'Thanks for the details. Before Wednesday, can we start in January? Our season review lands in December and I want the staff free for it.', 'the seed’s email doesn’t name the coach (the test’s coach is Alex)'),
      ['Open in Gmail', null, 'Gmail’s connection isn’t set up (it needs Google’s review), so there is no link to it; the copy-in address logs the email (builder B’s and D’s “not built”)']] },
  { name: 'A lead: where they are', m11: 'leadq', clicks: ['sheet:qed'], part: 'sheet', built: 'lead-where', ...OWNER,
    changes: [['Cancel', null, 'a panel closes with its own cross (the built design reference)']], added: [['Save my edit', 'a panel that edits saves with “Save my edit” (5e rule 29am); M11 says “Save”']] },
  { name: 'A lead: Log a call', m11: 'logq', part: 'sheet', built: 'lead-call', ...OWNER,
    changes: [[/^e\.g\. /, null, 'a box’s example is under it only where it helps; the shared text box shows its label (the built design reference)', { say: 'e.g. Keen to start in January' }], seed('Chemistry Call', null, 'the built panel is Ruth’s: her call is already booked, so “What kind of call?” starts on the seed’s choice')] },
  { name: 'Leads: edit stages', m11: 'pipe', part: 'sheet', built: 'leads-stages', ...OWNER,
    changes: [['Drag a stage to move it. A stage with leads in it can be removed once they’ve moved on.', 'Drag a stage to move it.', 'one line of help at most (Tim, 18 Nov); a stage with leads in it asks where they go when it is removed (builder B’s decision 1)'],
      ['Won is always last, because it makes the lead a client.', null, 'one line of help at most: the Won row shows it instead, with no handle, no cross and 100% (builder C’s decision 5)'], ['Cancel', null, 'a panel closes with its own cross (the built design reference; builder C’s decision 5)'],
      [/^name: Drag to move .+\. Or use the up and down arrow keys$/, null, 'no keyboard shortcut is said or shown (Tim, 18 Nov); the arrow keys still move it', { say: 'Drag to move … Or use the up and down arrow keys' }]],
    added: [['Save my edit', 'a panel that edits saves with “Save my edit” (5e rule 29am); M11 says “Save”'], [/^name: (Move|Remove) .+$/, 'each stage’s handle and cross are named for it (rule 30)', null, { say: 'Move New, Remove New' }], ['Likely to win', 'on a phone the likelihood box keeps its label, where the column heading isn’t shown', null, { on: 'p' }]], },
  { name: 'Leads: merge into one', m11: 'merge', part: 'sheet', built: 'leads-merge', ...OWNER,
    changes: [seed('chris@doylecapital.co.uk', 'chris@example.invalid', 'invented addresses')] },
  { name: 'Leads: export', m11: 'export', part: 'sheet', built: 'leads-export', ...OWNER,
    changes: [seed('This view, 8 leads', 'This view, 10 leads', 'the seed has the two Chris Doyles as well as M11’s eight')] },
  { name: 'Leads: reports', m11: 'leadrep', why: REPORTS },
  { name: 'Automations', m11: 'auto', built: 'automations', ...OWNER,
    changes: [[/^(When a lead is won, keep in touch every 3 months\.|Ran 1 time in November)$/, null, 'an automation only adds a to-do or moves a stage (the prompt), so “keep in touch” isn’t one; the seed has five automations (builder A’s decision 2)', { say: 'When a lead is won, keep in touch every 3 months.' }],
      ['Automations add to-dos, move stages, add tags and keep people in touch. They never send anything.', 'Automations add to-dos and move stages. They never send anything.', 'the prompt: automations only ever create to-dos or move stages']],
    added: [[/^name: (Edit|On): When .+$/, 'each sentence opens it, and each switch is named for its automation', null, { say: 'Edit: When …, On: When …' }],
      // Run 8's prompt, item 3 (not in M11): keep in touch, one more kind, always listed and off until switched on.
      [/^When someone is due a catch-up, add the to-do “Catch up with \[first name\]”, due that day\.$/, 'run 8’s prompt (item 3): the keep-in-touch automation, always listed, off until the coach switches it on', null, { say: 'When someone is due a catch-up, add the to-do “Catch up with [first name]”, due that day.' }]] },
  { name: 'Automations: add one', m11: 'autoed', part: 'sheet', built: 'automations-add', ...OWNER },
  // ---- Boards
  { name: 'Boards', m11: 'boards', built: 'boards', ...OWNER },
  { name: 'A board: Speaking', m11: 'board', built: 'board', ...OWNER,
    changes: [seed(r(`^${D} \\d+ ${M}, (£[\\d,]+|Sport leaders)$`), null, 'the seed’s dates are two days before M11’s', { say: 'Wed 10 Jun, £4,500' })],
    added: [seeded(r(`^${DAY}, (£[\\d,]+|Sport leaders)$`), `the seed’s dates; ${YEAR}`, { say: 'Tue 8 Jun 2027, £4,500' }), [/^name: Add card to .+$/, ADDCARD, null, { say: 'Add card to Ideas' }]],
    moved: [['edit this board', TIM('on a phone Edit this board sits with the view links under the title; M11’s phone puts it after the columns'), null, { on: 'p' }]] },
  { name: 'A board as a table', m11: 'boardt', built: 'board-table', ...OWNER, on: 'd',
    changes: [seed(/^(CIPD|Northfield leadership|Leaders in Sport|Henley|League Managers|Add$|Head coaches$|Sport leaders$)/, null, 'the seed’s dates, a row a line', { say: 'the rows' })],
    added: [seeded(/^(CIPD|Northfield leadership|Leaders in Sport|Henley|League Managers)/, `the seed’s rows, each on one line; ${YEAR}`, { maybe: true, say: 'the rows' }), seeded(r(`^${DAY}$`), `the seed’s dates, each in its own cell; ${YEAR}`, { say: 'a row’s date' }), [/^name: (Stage|Date|Fee|Audience), .+\. Edit$/, `${EDIT}; each cell is named with its value`, null, { say: 'Stage, Pitched. Edit' }]] },
  { name: 'Boards: a new board', m11: 'bnew', part: 'sheet', built: 'boards-new', ...OWNER,
    changes: [['You can change the stages and fields at any time.', 'You can edit the stages and fields at any time.', '“Edit”, never “Change” (5e rule 29am)']] },
  // ---- emails, past clients, organisations, clients
  { name: 'Settings: emails on timelines', m11: 'mail', built: 'settings-email', ...OWNER,
    changes: [['Second time zone', 'Time zones', 'the prompt names this section Time zones (run 1)', { on: 'd', say: 'Second time zone, in the laptop’s list of sections (a phone opens one section full screen)' }], [/^(todo\.tim\.7kx2@in\.theclarityproject\.co\.uk|log\.tim@in\.theclarityproject\.co\.uk|Copy)$/, null, 'no inbound-email service is set up yet, so neither address is shown or copied until it is (builder B’s rule: anything not set up is off)', { say: 'the two addresses and Copy' }],
      ['Log emails on timelines', null, TIM('the section’s rows are Forward emails to to-dos, Copy-in address, Connect Gmail and Log Gmail with clients and leads; M11 heads the second part “Log emails on timelines”')]],
    added: [['This address is ready once the email service is set up.', 'the calm line until the inbound-email service exists (builder B’s report)'], ['Connect Gmail', 'the prompt: an optional Gmail connection'], [/^Gmail isn’t set up yet\./, 'Gmail’s connection needs Google’s review first (builder B’s “not built”)'],
      [/^(Use stand-in addresses on this device|Use a stand-in Gmail on this device|For testing on this build\. Nothing leaves this tab\.)$/, 'the stand-in switches show only on builds that aren’t the live site (builder D’s report)', null, { say: 'Use stand-in addresses on this device' }]] },
  { name: 'Past clients', m11: 'past', built: 'past', ...OWNER,
    changes: [seed(/^(Fenwick Partners|Brightline Media|Harbour City FC)$/, null, 'the seed’s past clients’ organisations'), seed(r(`^(Due|Ended) ${DAY}$`), null, 'the seed’s days', { say: 'Due Sat 12 Dec, Ended Fri 12 Jun' })],
    added: [seeded(r(`^(.+, )?Ended ${DAY}$|^Due ${DAY}$`), 'the seed’s days', { say: 'Self-funded, Ended Tue 18 Aug' }), ['Start a new engagement', 'a past client can start again from the list (run 2’s Past clients)'], ['Search past clients', 'the list can be searched (run 2’s Past clients)'],
      [/^name: .+, \d+-month check-in, Due .+\. Open the note$/, SPOKEN, null, { say: 'Ben Ortiz, 3-month check-in, … Open the note' }]],
    moved: [[/./, SOONEST, null, { say: 'the check-ins’ order' }]] },
  { name: 'Past clients: a check-in note', m11: 'pastp', part: 'sheet', built: 'past-note', ...OWNER,
    changes: [seed(r(`^(6-month check-in, due|Ended) ${DAY}$`), null, 'the seed’s days'), [/^(Grace’s Mission|Lead the firm through its merger without losing the senior team\.)$/, null, 'a past client’s Mission needs their sharing, which isn’t read here yet, so nothing shows (builder D’s “not built”)', { say: 'Grace’s Mission' }],
      [/^Hi Grace, /, 'Hi Grace, It’s been 6 months since we finished working together, and I’ve been wondering how things are going. How are you getting on? Alex', TIM('the note’s words are checkInNote’s (crm.js): numbers as figures, and the test’s coach is Alex'), { say: 'the note’s words' }]],
    added: [seeded(r(`^(6-month check-in, due|Ended) ${DAY}$`), 'the seed’s days'), ['Nothing is sent until you send it from your own email.', NOSEND]] },
  { name: 'An organisation', m11: 'org', built: 'org-map', ...OWNER, ...ORGPAGE },
  { name: 'An organisation: the account map', m11: 'orgmap', built: 'org-map', ...OWNER, ...ORGPAGE },
  { name: 'Clients as a board', m11: 'clientsb', built: 'clients-board', ...OWNER,
    changes: [[/^(Renewals|Testimonials)$/, null, 'renewals and testimonials are Clients views of Finances, Phase 6b (crm-additions 10; M11 lists clren and cltest under Finances)', { say: 'Renewals, Testimonials' }], ['Message clients', null, 'there are no messages in the portal (coach rule 11)'],
      seed(/^(\d+|.+ to go|Today, \d\d:\d\d|Thu 19 Nov|Mon 23 Nov|Wed 25 Nov|Wed 18 Nov|Fri 20 Nov|Aldermoor performance unit|Session pack, no account yet|Nora Ellis|Pacific Arc|Hannah Wells|Quillmark|Caleb Hunt|Ridgeway Foods|Self-funded|Not booked)$/, null, 'run 1’s seed: its own clients, none with a session booked', { say: 'M11’s clients and their next sessions' }),
      [/^name: .+, .+$/, null, SPOKEN, { say: 'a card’s spoken name' }]],
    added: [[/^(Everyone|More|Export|Search clients|name: More for .+)$/, TIM('on a phone run 1’s Clients keeps Everyone, Export, More on each card and Search; M11’s phone shows fewer (26 Oct rule 10)'), null, { on: 'p', say: 'Everyone, Export, More, Search on a phone' }], seeded(/^(\d+|Not booked|No engagement yet|.+ to go|Maya’s client)$/, 'run 1’s seed: its own clients, none with a session booked', { say: 'Not booked' }), ['Add team', 'M11 draws no link for adding a team; run 1’s link, worded “Add team” by rule 29 (no “a” or “an” in an Add)', null, { maybe: true }]],
    moved: [seeded(/./, 'run 1’s seed has its own clients, in its own order', { say: 'the order of the cards' })] },
  { name: 'Today, with Keep in touch', m11: 'todaykit', sections: ['Keep in touch'], built: 'today-keep-network', ...OWNER,
    changes: [...PEOPLE],
    added: [...PEOPLE_ADDED, [/^name: .+: (.+ since you spoke|\d+-month check-in, due .+)\.( Open| Open the note)?$/, 'each row is read out as one sentence (crm-additions 7: “Dan Reid: 3 months since you spoke.”)', null, { say: 'Dan Reid: 3 months since you spoke.' }],
      seeded(/^(Leah Moran|12-month check-in|Grace Liu|6-month check-in|Ben Ortiz|3-month check-in)$/, 'the seed has three check-ins due within 30 days; up to three show (builder B’s report)')],
    moved: [[/./, `${MOST}; ${SOONEST}`, null, { say: 'the order of the rows' }]] },
  { name: 'The menu, with Network’s count and the boards', m11: 'menu', part: 'menu', built: 'net-menu', ...OWNER,
    changes: [seed(/^(27|name: Network, 27 due a catch-up)$/, null, 'nine of the seed’s people are due a catch-up', { say: 'Network, 27' }), seed(/^(Renewals due|Quiet leads|Phone to-dos)$/, null, 'the favourite views are the seed’s own', { say: 'M11’s favourite views' })],
    added: [seeded(/^(9|name: Network, 9 due a catch-up)$/, 'nine of the seed’s people are due a catch-up', { maybe: true, say: 'Network, 9' }), seeded(/^(Admin|Business)$/, 'the seed’s to-do lists', { maybe: true })] },
  // ---- Network
  net({ name: 'Network: Actions', m11: 'kit', built: 'net-actions', }),
  net({ name: 'Network: Table', m11: 'ntable', built: 'net-table' }),
  net({ name: 'Network: Table, changing a rating', m11: 'nedit', built: 'net-table-rating' }),
  net({ name: 'Network: Table, a column menu', m11: 'ncolm', built: 'net-table-colmenu' }),
  net({ name: 'Network: Table, Keep close only', m11: 'netfocus', built: 'net-table-focus' }),
  net({ name: 'Network: Import a spreadsheet', m11: 'nimport', part: 'sheet', built: 'net-import-empty', added: [['Or paste rows copied from a spreadsheet', 'the prompt: import from a spreadsheet, the same pattern as Leads’ import, which takes pasted rows (builder E’s report)'], ['Add people', 'the panel’s button says what it will do once rows are read (“Add 1 person”); before that, “Add people”']] }),
  net({ name: 'Network: Ready to archive?', m11: 'narcp', part: 'sheet', built: 'net-ready' }),
  net({ name: 'Network: the archive', m11: 'narchv', built: 'net-archive' }),
  net({ name: 'Network: one person, with contact, given and asked', m11: 'kitp', part: 'sheet', built: 'net-person',
    changes: [['Network', null, 'the panel has no “Network” kicker above the role (builder E’s decision)']],
    added: [['iMessage', `${IMSG}: David’s is +1`], ['Merge with someone', 'Merge, as Leads has it, with Undo (tidy follow-up 3, run 6’s 36)']] }),
  net({ name: 'Network: one person, with ratings', m11: 'netrate', part: 'sheet', built: 'net-person-ratings' }),
  net({ name: 'Network: the map, Where to focus', m11: 'netmap', built: 'net-many-map' }),
  net({ name: 'Network: How to read the map', m11: 'nhowp', part: 'sheet', built: 'net-map-help' }),
  net({ name: 'Network: the map, one spot’s people', m11: 'nbunp', part: 'sheet', built: 'net-many-spot', changes: [seed(/^(Keep close|Maintain|Invest|Rebalance\?)$/, null, 'the spot’s people and their lists are the seed’s', { say: 'each person’s list' })] }),
  net({ name: 'Network: the map, finding someone', m11: 'nbig', built: 'net-map-found' }),
  net({ name: 'Network: the map, Rebalance? only', m11: 'nsmall', built: 'net-many-rebalance', added: [seeded(/^\d+ people, Rebalance\?$/, 'the test’s pointer stays where the list was, over a dot, so that dot’s one-line pop-up shows (a finger leaves no pointer behind)', { on: 'p', say: '6 people, Rebalance?' })] }),
  // ---- an associate
  closed('Leads', 'leads', 'leads-closed'),
  closed('Network', 'kit', 'net-closed'),
  closed('Automations', 'auto', 'automations-closed'),
  { name: 'Boards, as an associate', m11: 'boards', built: 'boards-shared', who: 'associate',
    changes: [[/^(Partners|3 stages|2 cards|New board)$/, null, 'an associate sees only the boards the owner shares, and can’t make one (the prompt; builder A’s decision 4)', { say: 'Partners, New board' }]] },
  { name: 'A board, shared, as an associate', m11: 'board', built: 'board-shared', who: 'associate',
    changes: [[/^(Edit this board|Add card)$/, null, 'a shared board is read only for an associate (builder A’s decision 4)', { say: 'Edit this board, Add card' }], seed(r(`^${D} \\d+ ${M}, (£[\\d,]+|Sport leaders)$`), null, 'the seed’s dates are two days before M11’s', { say: 'Wed 10 Jun, £4,500' })],
    added: [['The owner’s board. You can see it and can’t edit it.', 'a shared board says whose it is and that it can’t be edited (builder D’s report); the test’s associate doesn’t hold the owner’s name'], seeded(r(`^${DAY}, (£[\\d,]+|Sport leaders)$`), `the seed’s dates; ${YEAR}`)] },
];
