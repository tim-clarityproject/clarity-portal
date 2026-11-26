// Phase 6a run 3 (the calendar and booking): every screen M11 seq 77 draws
// for it, the built screen it is held against, and each meant difference
// with its reason. compare-m11-run2.mjs does the reading and comparing (see
// compare-m11-run2-screens.mjs for what a row and its lists are);
// compare-m11.mjs runs it with RUN=3.
//
// The built screens are screens.mjs's own (the groups cal, book, sync,
// bar5, barnow and public: M11's own week on the device, on M11's own
// Tuesday). A row with `as: 'signed-out'` is a booking page outside the
// portal, opened with nobody signed in.
// Anything that differs and is not listed FAILS.

// ---------------------------------------------------------------- the reasons
// Each names the source that wins over M11: the run's prompt, the time zone rules, a rule in CLAUDE.md, or the builders' reports.
const seed = (m11, built, why, more = {}) => [m11, built, `the test’s data: ${why}`, { data: true, ...more }];
const seeded = (built, why, more = {}) => [built, `the test’s data: ${why}`, null, { data: true, ...more }];

const D = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const US = '(New York|Chicago|Los Angeles|Denver|Toronto)';
const TZ12 = '12-hour for a client in the US or Canada, and a city’s name, never letters (time zone rules 4 and 5; builder B’s report): “9:45 am Chicago”, “Los Angeles”, a column headed “Chicago”';
const NOSEND = 'nothing the coach writes sends by itself (the prompt; coach rule 11): the coach copies each link or opens a drafted note in their own email';
const QUARTER = 'the database offers a start every quarter hour in the visitor’s own time (the prompt; time zone rule 8), where M11 draws half hours';
const OPENONLY = 'the test’s data: a booking page offers the coach’s Open for calls times only (builder A’s report), and the seed’s are next week, Mon 23 and Fri 27';
const UNITS = 'units are full words (26 Oct design rule 8)';
const GRID = 'Open for calls uses the calendar’s own grid, with its two time columns and hatching (builder D’s report)';
const HELP1 = 'one line of help at most, the rest behind a quiet link to the side panel (coach rule 23)';
const PICKING = 'while times are being picked the calendar can’t be changed, so the links that start something else step back (builder D’s report)';
const SCHED = 'M11’s Schedule lists the week in its title, Monday to Friday; the built Schedule lists what’s next, from today for four weeks (calendar-parity.md: “a scrolling list of what’s next”), under the same week’s title, so Monday’s rows are left out and later weeks follow';
const TODOS14 = 'the seed has 14 to-dos to place, where M11 has 8, so the panel shows 8 and “Show all 14”';
const TYPED = { after: 'What needs doing?', before: 'Add to-do', boxes: ['Send the renewal pack to Dana tomorrow #Kestrel @email ! 30m'] }; // the example M11 always shows typed
const PLACE = [
  [/^name: .+\. Drag onto the calendar$/, null, 'a to-do to place is read out as its words and its estimate; it is dragged on, or opened and given a time', { say: 'a to-do to place, “… Drag onto the calendar”' }],
];
const PLACED = [
  seeded(/^(Write issue 149 of Leading Ideas|Show all 14)$/, TODOS14, { say: 'Show all 14' }),
];
const OWNTIME = ['Your own time', null, 'Writing and Admin are kinds of their own (the colours of 19 Nov: Admin, Writing and Other), so their row has no second line repeating their name (5e rule 29ap); Training, plain own time, keeps “Your own time”'];
const NETWORK = ['Networking call', 'Discovery call', 'the prompt names the two call types, and a row says which; coffee in person says “In person”; the first is now the Discovery call (Tim, 25 Nov; coach-portal.md rule 31’s Polish 1 note)'];
// Polish 1 (Stage A and B; the 25 Nov design reference and Tim's walk item 26): the meant differences the calendar's new
// opening and bar brought. Listed once here, met where M11 shows them, never required.
const P1_OPEN = 'Polish 1: every page opens the same way (PageOpening: its one grey line and its one main button, “Add a session”) (CLAUDE.md, Polish 1 “Layout”; coach-portal.md rule 49’s Polish 1 note)';
const P1_BAR = 'Polish 1: the calendar’s bar is the month or week, previous and next, Month and Week as one joined switch, and one “Show” drop-down for the kinds (CalendarBar; rule 17)';
const P1_FOOT = 'Polish 1 (Tim’s walk, item 26): under the calendar its own switches, then one quiet “Calendar settings” link that opens Add to calendar, Working hours, Set my open times, Offer times by email and My calendars in place';
const P1_BOOK = 'Polish 1 (Stage A, the booking page): the coach’s full name and the call’s name over one sentence, the one month grid (MonthGrid, rule 17) and the chosen day’s times under it, “Times are in … time.” with Change the time zone, and Continue (coach-portal.md rule 31’s Polish 1 note; migration 066)';
const TIM = (why) => `left for Tim to decide: ${why}`;
/** The built grid's tiles come in time order, day by day (how a keyboard and a screen reader meet them); M11's markup lists a day's calls, then own items, then family and held times. */
const GRID_ORDER = [/./, 'the built grid lists each day’s tiles in time order, as a keyboard and a screen reader meet them; M11’s markup lists a day’s calls first, then the rest', null, { quiet: true, say: 'the order of a day’s tiles' }];
const BAR_NAME = [/^name: .+: open the brief$/, 'the name on the bar opens the brief in place and says so to a screen reader (builder E’s report)'];

import { THEY, THEY_NAMES } from './compare-m11-they.mjs';

export const EXTRA_GROUPS = [];

/** Differences that hold on every screen of this run: met where M11 shows them, never required. */
export const EVERYWHERE = {
  changes: [
    ...THEY,
    ['Book a call', 'Add a session', P1_OPEN, { quiet: true, say: 'Book a call' }],
    [/^(Schedule|Day|View)$/, null, P1_BAR, { quiet: true, say: 'Schedule, Day and View in the bar' }],
    ['Weekends', null, `${P1_FOOT}; the link reads “Show weekends” (hidden while the working hours are edited)`, { quiet: true, say: 'the Weekends switch' }],
    ['Chemistry Call page', 'Discovery call page', 'Discovery call (Tim, 25 Nov; coach-portal.md rule 31’s Polish 1 note)', { quiet: true }],
    [/^(What needs doing\?|e\.g\. Call Sam Fri 10:00 #Kestrel @phone ! 30m|Add to-do)$/, null, 'Polish 1 “Adding”: “+ Add” by the list’s label opens Quick Add, so the always-open quick-add box is gone (CLAUDE.md, Polish 1 “Adding”)', { quiet: true, say: 'the quick-add box' }],
    [/^(Add to calendar|Working hours|Set my open times|Offer times by email|My calendars)$/, null, P1_FOOT, { quiet: true, say: 'Add to calendar, Working hours and the rest' }],
    [/^(Travel|Nadia Osei|Ruth Adeyemi)\d\d:\d\d$/, null, 'a narrow tile’s name and time are read as two lines in the built grid, where M11’s markup runs them together', { quiet: true, say: 'a narrow tile’s name and time' }],
    seed('15 min', null, 'two of M11’s 15-minute to-dos aren’t among the seed’s first eight', { quiet: true }),
    [new RegExp(`^(\\d\\d:\\d\\d, )?\\d\\d:\\d\\d (${US.slice(1, -1)}|LA)$`), null, TZ12, { quiet: true, say: 'a US client’s own time, “09:45 Chicago”' }],
    [/^(CHI|NY|LA|LON)$/, null, TZ12, { quiet: true, say: 'a time column headed by letters, “CHI”' }],
    [/^name: .+ time\. Choose the second time zone$/, null, 'its spoken name is “Second time column, Chicago. Edit”: “Edit”, never “Choose” (5e rule 29am)', { quiet: true, say: 'the second column’s spoken name' }],
    [/^Event(, \d\d:\d\d to \d\d:\d\d)?$/, null, TIM('an item with a place says where it is (“In person, 18:30 to 20:30”), where M11 names its kind (“Event”)'), { quiet: true, say: 'Event' }],
    [new RegExp(`^name: .+, ${D} \\d+ Nov \\d\\d:\\d\\d to \\d\\d:\\d\\d(, .+)?$`), null, 'a tile’s spoken name is built the same way, with a comma after the day and its place or kind at the end', { quiet: true, say: 'a tile’s spoken name' }],
    seed(/^(Long run|08:00 to 09:00|Esme’s swimming gala|Lunch with Sarah’s parents|Sat|Sun|21|22)$/, null, 'M11’s weekend holds three family items; the seed’s weekend holds what the day seed put there', { quiet: true, say: 'M11’s weekend items' }),
    // An associate: M11 gives Maya her own bar; the test's associate keeps the owner's seed on the device.
    seed(/^(Prepare for supervision with Tim|Send Nina the pressure plan worksheet|Today|Add to-do)$/, null, 'M11 gives Maya her own to-dos, listed beside her calendar; the test’s associate keeps the owner’s seed on the device', { who: 'associate', quiet: true, say: 'Maya’s own to-dos' }),
    [/^name: (Select|More for|Mark) .*(Prepare for supervision with Tim|Send Nina the pressure plan worksheet)/, null, 'the test’s data: Maya’s own to-dos', { who: 'associate', data: true, quiet: true, say: 'Maya’s own to-dos’ controls' }],
    seed(/^Nina Shah( in \d minutes| Starting now)?$/, null, 'M11 gives Maya her own call; the test’s associate keeps the owner’s seed on the device', { who: 'associate', quiet: true, say: 'Maya’s own call on the bar' }),
  ],
  added: [
    ...THEY_NAMES,
    [/^(Your coaching sessions, calls and visits in one place\.|Add a session|Everything you plan to do is here, day by day\.|These are the times people outside can book a call with you\.|Set how your practice runs here: your details, booking, calendars and the rest\.|Your booking settings are here\.|Here are the times you offered Mia Torres and Paul Garner, and who can make each one\.)$/, P1_OPEN, null, { quiet: true, say: 'the page’s opening line and its main button' }],
    [/^(Show|All types|Month|Week)$/, P1_BAR, null, { quiet: true, say: 'Month, Week and Show' }],
    [/^name: (Previous|Next) (week|day|days|month)$/, `${P1_BAR}; the arrows are named for a screen reader`, null, { quiet: true, say: 'Previous and Next, named' }],
    [/^(Show weekends|Hide weekends|Calendar settings)$/, P1_FOOT, null, { quiet: true, say: 'Show weekends and Calendar settings' }],
    [/^(Discovery call|Discovery call page|name: Copy the Discovery call page’s link|name: Edit Discovery call page)$/, 'Discovery call (Tim, 25 Nov; coach-portal.md rule 31’s Polish 1 note)', null, { quiet: true, say: 'Discovery call' }],
    [/^(Agreements|Business)$/, 'Settings’ sections gained Agreements (Phase 6b run 3) and Business (Polish 1, Stage C, migration 068)', null, { quiet: true, say: 'Agreements and Business in Settings' }],
    [/^(\d+ (minutes|hours?)|name: .+, \d+ (minutes|hours?))$/, 'units are full words (26 Oct design rule 8): a to-do’s estimate reads “2 hours”, and a to-do to place is named with it', null, { quiet: true, say: '2 hours; a to-do named with its estimate' }],
    [/^(ALEX MORGAN|DISCOVERY CALL|A 30-minute call on Zoom\. Choose a day, then a time\.|November 2026|\d{1,2}|(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY) \d+ NOVEMBER|Times are in .+ time\.|Continue|name: (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d+ November)$/, P1_BOOK, null, { quiet: true, say: 'the booking page’s month grid and its parts' }],
    [/^(# a list or client, @ a tag, ! important|More it understands)$/, `the quick add’s one line of help: ${HELP1}`, null, { quiet: true, say: 'the quick add’s line of help' }],
    seeded('Fri 27', OPENONLY.replace('the test’s data: ', ''), { quiet: true }),
    [new RegExp(`^(\\d\\d:\\d\\d, )?\\d{1,2}:\\d\\d (am|pm) ${US}$`), TZ12, null, { quiet: true, say: '“9:45 am Chicago”' }],
    [/^(Chicago|New York|Los Angeles)$/, TZ12, null, { quiet: true, say: 'a column headed “Chicago”' }],
    [/^In person, \d\d:\d\d to \d\d:\d\d$/, TIM('an item with a place says where it is, where M11 names its kind (“Event”)'), null, { quiet: true, say: 'In person, 18:30 to 20:30' }],
    [new RegExp(`^name: .+, ${D} \\d+ (Oct|Nov|Dec)(, \\d\\d:\\d\\d to \\d\\d:\\d\\d| to ${D} \\d+ (Oct|Nov|Dec))(, .+)?$`), 'a tile’s spoken name: its title, day, times, then the client’s own time and its place or kind', null, { quiet: true, say: 'a tile’s spoken name' }],
    [/^name: .+, done$/, 'a placed to-do’s tick is named for its to-do (the prompt: placed to-dos are tickable)', null, { quiet: true, say: 'a placed to-do’s tick' }],
    [/^name: .+\. Jump to a date$/, 'the dates open the mini month (calendar-parity.md: jump to a date)', null, { quiet: true, say: 'Jump to a date' }],
    [/^name: Second time column, .+\. Edit$/, '“Edit”, never “Choose” (5e rule 29am)', null, { quiet: true, say: 'Second time column, Chicago. Edit' }],
    [/^Show the whole day$/, 'the grid shows 08:00 to 21:00, opened out for what is on it; this link shows midnight to midnight (builder C’s report)', null, { quiet: true, say: 'Show the whole day' }],
    seeded(/^(Zoom|Zoom, \d\d:\d\d to \d\d:\d\d|Call Priya about the keynote|Travel|15 minutes|30 minutes|1 hour|To-do|Chemistry Call|Connection Call)$/, 'the seed also holds the day seed’s sessions and a second placed to-do, so some lines show more often than in M11', { quiet: true, say: 'the day seed’s extra calls' }),
    seeded(/^(08:30|11:30|12:30|Ruth Adeyemi|Nadia Osei|Group)$/, 'M11’s Maya has a quieter week of her own; the test’s associate keeps the owner’s', { who: 'associate', quiet: true, say: 'the owner’s week on the associate’s calendar' }),
    seeded(/^Sam Okafor (in \d minutes|is starting now)$/, 'the test’s call is Sam’s for both roles', { who: 'associate', quiet: true, say: 'Sam’s call on the associate’s bar' }),
    ['Working hours', 'on a phone the bar holds only the date and Book a call, so Working hours is a link at the foot (the prompt: working hours are set on the calendar; a day at a time on a phone)', null, { on: 'p', quiet: true, say: 'Working hours, at the foot on a phone' }],
    [/^name: Who can see this: /, 'the eye says “Who can see this:” before its words to a screen reader (rule 24)', null, { quiet: true, say: 'Who can see this:' }],
    [/^name: Close$/, 'on a phone a menu is the shared panel from the foot, with its own Close (the built design reference)', null, { on: 'p', quiet: true, say: 'Close, on a phone’s menu' }],
  ],
  moved: [],
};
export const ROWS = [
  // (On a phone the week is its own list, as M11's phone draws it.)
  { name: 'Calendar, the week', m11: 'calendar', built: 'cal-week', moved: [GRID_ORDER],
    changes: [[...OWNTIME, { on: 'p' }], [...NETWORK, { on: 'p' }]],
    added: [seeded(/^(10:00|10:30)$/, 'the day seed’s extra calls and second placed to-do have rows of their own', { on: 'p', say: 'the day seed’s extra rows' })] },
  { name: 'Calendar, the week with weekends', m11: 'calwk', built: 'cal-weekends', on: 'd', moved: [GRID_ORDER],
    changes: [seed(/^(Family|Personal)$/, null, 'M11’s weekend holds three family and personal items the seed doesn’t', { say: 'the weekend’s Family and Personal lines' })] },
  { name: 'Calendar, editing an item', m11: 'cedit', part: 'sheet', built: 'cal-which',
    changes: [seed('Mon 16 Nov', 'Tue 17 Nov', 'the built panel opens Training from the Schedule, whose first one is today’s (a repeat every Monday and Tuesday)')],
    added: [
      [/^(Which ones\?|This one|This and following|All of them)$/, 'Training repeats, so the panel asks which ones an edit is for (the prompt: this one, this and following, all)', null, { say: 'Which ones?' }],
      ['More options', 'the full panel (calendar-parity.md, Go-live): repeats, location, notes, reminders, busy or free, private'],
      ['Duplicate', 'Duplicate and Delete, with Undo (calendar-parity.md, M11)'],
    ] },
  { name: 'Calendar, Schedule view', m11: 'calsched', built: 'cal-schedule',
    changes: [
      [/^(MON 16 NOV|15:30|17:00|14:00|18:00|Swimming with Esme|Family|Hannah Wells|Mia and Paul|Held for a poll)$/, null, TIM(SCHED), { say: 'Monday’s rows' }],
      NETWORK,
      ['16 to 20 Nov', 'From today', 'the Schedule runs on from today, so it is headed “From today”, not a week’s dates (tidy follow-up 3, run 6’s 20)'],
    ],
    added: [
      [new RegExp(`^${D.toUpperCase()} \\d+ (NOV|DEC)$`), TIM(SCHED), null, { say: 'the days after Friday' }],
      seeded(/^(\d\d:\d\d|All day|Leading Teams conference|In person|Chemistry Call|Connection Call)$/, 'the rows of the days M11 doesn’t list, the seed’s two-day conference among them', { say: 'later days’ rows' }),
    ],
    moved: [[/./, 'with Monday left out and later weeks added, the lines both show fall in other places', null, { quiet: true, say: 'the order of the Schedule’s rows' }]] },
  { name: 'Calendar, one day', m11: 'calday', built: 'cal-day', moved: [GRID_ORDER] },
  { name: 'Calendar with the to-dos panel', m11: 'caltd', built: 'cal-todos', on: 'd', moved: [GRID_ORDER], changes: [...PLACE], added: [...PLACED] },
  { name: 'Calendar, working hours being edited', m11: 'calendar', clicks: ['whedit'], built: 'cal-hours', on: 'd', moved: [GRID_ORDER],
    changes: [[/^(Add to calendar|Set my open times|Show to-dos|Offer times by email|My calendars)$/, null, TIM('while the hours are edited the built page shows only the one line and Done, so nothing else is started half-way; M11 keeps Add to calendar and the foot links'), { say: 'Add to calendar and the foot links' }]],
    added: [seeded('21:00', 'the seed’s Thursday finishes at 20:45, so the grid opens out to 21:00')] },
  { name: 'Calendar, offer times by email', m11: 'cft', built: 'book-offer', moved: [GRID_ORDER],
    changes: [
      [/^\d\d:\d\d NY$/, '5:00 am New York', `${TZ12}; the test picks two other free times`, { on: 'd', say: 'a picked time, “07:00 NY”' }],
      ['Show to-dos', null, PICKING, { on: 'd' }],
      seed('2 picked', 'Pick free times', 'on a phone the test’s one press lands on a call, so nothing is picked and the bar still reads “Pick free times”', { on: 'p' }),
    ],
    added: [
      [/^(Their time zone|How long\?|60 minutes)$/, 'the bar asks how long the call is as well as their time zone (builder D’s report)', null, { say: 'How long?' }],
      ['Open in my email', NOSEND, null, { on: 'd' }],
      ['Picked', 'a picked time says so under its time, so it isn’t told by its outline alone', null, { on: 'd' }],
    ] },
  { name: 'Calendar, picking times for a poll', m11: 'pollpick', built: 'book-poll-pick', moved: [GRID_ORDER],
    changes: [
      ['Pick 2 to 5 times', '1 picked', 'the bar counts what is picked once something is (the test picks one); before that it reads “Pick 2 to 5 times”', { on: 'd' }],
      ['Send the poll', 'Make the poll', NOSEND],
      ['Show to-dos', null, PICKING, { on: 'd' }],
    ],
    added: [
      ['Three-way meeting, 60 minutes', 'the bar says which poll the times are for, set up in the panel before (builder D’s report)'],
      ['Picked', 'a picked time says so under its time, so it isn’t told by its outline alone', null, { on: 'd' }],
    ] },
  { name: 'A poll', m11: 'poll', built: 'book-poll', who: 'owner',
    changes: [[/^(Mon 16|Thu 19|Fri 20) Nov, \d\d:\d\d London$/, 'Mon 16 Nov, 17:00 UK time', 'a time is said with “UK time”, never “London” (time zone rule 4; builder D’s report)', { say: '17:00 London' }]],
    added: [
      [/^(Mon 16|Thu 19|Fri 20) Nov, \d\d:\d\d UK time$/, 'a time is said with “UK time” (time zone rule 4)', null, { say: '17:00 UK time' }],
      ['They’re in UK time.', 'the page says whose clock the times are on (time zone rule 4)'],
      [/^(WHO’S ASKED|Mia Torres|Paul Garner|Answered, (New York|UK) time|Copy link|Open in my email|Edit time zone|Nothing is sent until you send it from your own email\.)$/, NOSEND, null, { say: 'Who’s asked, with Copy link and Open in my email' }],
      [/^name: (Copy (Mia|Paul)’s link|Open the note to (Mia|Paul) in my email|Edit (Mia|Paul)’s time zone)$/, NOSEND, null, { say: 'each person’s links, named for a screen reader' }],
      [/^name: Confirm .+ UK time$/, 'each Confirm is named for its time to a screen reader', null, { say: 'Confirm, named for its time' }],
      ['Cancel the poll', 'a poll can be cancelled, which frees its held times (builder D’s report)'],
    ],
    moved: [['three-way meeting', 'the poll’s name is the page’s title, with who it is with in the opening line under it (Polish 1, PageOpening)']],
 },
  { name: 'Book a call', m11: 'book', part: 'sheet', built: 'book-call',
    changes: [
      seed(/^(Thu 19|Fri 20) Nov, \d\d:\d\d$/, null, 'the free times are worked out from the seed’s own week and Open for calls, so they fall on Mon 23 Nov', { say: 'M11’s three suggested times' }),
      [/^\d{1,2}:\d\d for Jordan in Chicago$/, '8:15 am for Jordan in Chicago', TZ12, { say: '9:30 for Jordan in Chicago' }],
      seed(/^(!|Thu 17 Dec at 15:30 clashes with Supervision with Maya\. Choose another time for that one)$/, null, 'none of the seed’s six calls clashes with anything (a clash and its other times are walked in book-flows.mjs)', { say: 'the clash M11 shows' }),
    ],
    added: [
      seeded(/^Mon 23 Nov, \d\d:\d\d$/, 'the free times fall on Mon 23 Nov', { say: 'the seed’s three suggested times' }),
      [/^\d{1,2}:\d\d am for Jordan in Chicago$/, TZ12, null, { say: '8:15 am for Jordan in Chicago' }],
      ['Choose my own time', 'the prompt’s Book a call lets the coach type a day and time of their own (builder D’s report)'],
      [/^Mon 23 Nov, \d\d:\d\d UK time · \d{1,2}:\d\d am Chicago time$/, 'the coach sees both clocks for the time chosen (time zone rule 5)', null, { say: 'both clocks for the chosen time' }],
      [/: That’s .+ in the US\.$/, 'a public holiday in the client’s country is flagged (time zone rule 9; the prompt)', null, { say: 'That’s Martin Luther King Jr. Day in the US.' }],
    ] },
  { name: 'A single-use link', m11: 'slink', part: 'sheet', built: 'book-link',
    changes: [['4 wk', 'weeks', UNITS]],
    added: [
      ['hours', `“24 h” is “24 hours”: ${UNITS}`],
      ['It offers your Open for calls times.', 'the panel’s one line of help: which times a link offers (builder A’s report)'],
      [/^(Open links|Sponsor call, 30 minutes, Open|Three-way meeting, 30 minutes, Open|Paul Garner|Dana Whitfield|Copy|Close)$/, 'the open links are listed under the form, each with Copy and Close (builder D’s report; M11 lists them only in Settings)', null, { say: 'Open links, each with Copy and Close' }],
      [/^name: (Copy|Close) the link for .+$/, 'each link’s Copy and Close are named for their person', null, { say: 'Copy and Close, named for a screen reader' }],
    ] },
  { name: 'A booking page, as the guest sees it', m11: 'bpage', built: 'bpage', as: 'signed-out', who: 'owner', ...{
    changes: [
      seed('With Tim', null, 'the stand-in’s coach is called Alex, and the page names the coach once, in full, at its top (Polish 1)'),
      seed(/^(Wed 18|Thu 19|Fri 20|Mon 23)$/, null, `${OPENONLY.replace('the test’s data: ', '')}; ${P1_BOOK}`, { say: 'Wed 18, Thu 19, Fri 20, Mon 23' }),
      [/^1[12]:[03]0$/, null, `${TZ12}; ${QUARTER}`, { say: '11:00, 11:30' }],
      [/^(THE CLARITY PROJECT|CHEMISTRY CALL|30 minutes, Zoom|Your time zone|New York)$/, null, P1_BOOK, { say: 'the page’s old heading and its time zone box' }],
    ],
    added: [
      [/^\d{1,2}:\d\d am$/, `${TZ12}; ${QUARTER}; the chosen day’s times under the month`, null, { say: 'the chosen day’s times, 12-hour in New York' }],
    ],
    moved: [[/^(show my calendar|your time zone|new york)$/, P1_BOOK, null, { say: 'Show my calendar and the time zone, under the times' }]] } },
  { name: 'A booking page, with Show my calendar', m11: 'bpage2', built: 'bpage2', as: 'signed-out', who: 'owner',
    changes: [
      seed('With Tim', null, 'the stand-in’s coach is called Alex, and the page names the coach once, in full, at its top (Polish 1)'),
      seed(/^(Wed 18|Thu 19|Fri 20|Mon 23)$/, null, `${OPENONLY.replace('the test’s data: ', '')}; ${P1_BOOK}`, { say: 'Wed 18, Thu 19, Fri 20, Mon 23' }),
      [/^1[12]:[03]0$/, null, `${QUARTER}; the hours beside “Your calendar” are the hours of the day shown`, { say: '11:00, 11:30, 12:00' }],
      [/^(THE CLARITY PROJECT|CHEMISTRY CALL|30 minutes, Zoom|Your time zone|New York)$/, null, P1_BOOK, { say: 'the page’s old heading and its time zone box' }],
    ],
    added: [
      [/^\d{1,2}:\d\d am$/, `${TZ12}; ${QUARTER}; the chosen day’s times under the month`, null, { say: 'the chosen day’s times, 12-hour in New York' }],
    ],
    moved: [[/^(\d\d:\d\d|show my calendar|your time zone|new york)$/, `the hour labels follow the day shown; ${P1_BOOK}`, null, { say: 'the hours, Show my calendar and the time zone' }]] },
  { name: 'Open for calls', m11: 'open', built: 'book-open', who: 'owner',
    changes: [
      seed(/^(Writing|Supervision with Maya)$/, null, 'next week in the seed holds the day seed’s sessions and Training, not M11’s Writing and Supervision', { on: 'd' }),
      [new RegExp(`^name: Open, ${D} \\d+ Nov \\d\\d:\\d\\d to \\d\\d:\\d\\d$`), null, 'a block’s spoken name is built as a tile’s is, with a comma after the day', { say: 'an Open block’s spoken name' }],
    ],
    added: [
      [/^(UK|\d\d:00)$/, GRID, null, { say: 'the two time columns' }],
      seeded(/^(Priya Nair|Jordan Reyes|Mia Torres|Marcus Bell|Sam Okafor)$/, 'next week holds the day seed’s sessions, drawn as busy'),
      ['Add open time', 'a row and panel to add a block by keyboard and on a phone, as well as by dragging (builder D’s report; rule 29)'],
      [/^(Mon|Tue|Wed|Thu|Fri) \d\d$/, 'on a phone Open for calls shows a day at a time, chosen from the week’s days (builder D’s report)', null, { on: 'p', say: 'the week’s days, to choose one' }],
    ],
    moved: [GRID_ORDER] },
  { name: 'To-dos as a calendar', m11: 'todocal', built: 'todos-calendar', moved: [GRID_ORDER], cut: TYPED,
    changes: [...PLACE,
      ['View', 'List', 'the List and Calendar switch is the same on a phone as on a laptop (Tim’s design rules of 18 and 19 Nov)', { on: 'p' }],
      [/^(Send Sam the decision rights article|Reply to Ruth about the January start|Call Priya about the keynote|Pull Sam’s progress for the review|30 min)$/, null, TIM('on a phone the panel shows its first four to-dos, then “Show all 14”, so the day stays on the screen; M11’s phone lists all eight'), { on: 'p', say: 'the fifth to-do to place and on' }],
      [/^(Zoom|Group), \d\d:\d\d to \d\d:\d\d$/, 'Zoom', 'beside the to-dos panel a tile gives its place alone, as M11’s laptop does (builder C’s report)', { on: 'p', say: 'Zoom, 12:30 to 13:30' }],
    ],
    added: [...PLACED,
      [/^(List|Calendar)$/, 'the List and Calendar switch is the same on a phone as on a laptop (Tim’s design rules of 18 and 19 Nov)', null, { on: 'p', say: 'List, Calendar' }],
      seeded(/^(Sam Okafor|Priya Nair|Jordan Reyes|Mia Torres|Marcus Bell|In person)$/, 'the day seed’s extra calls are on the week too', { on: 'd', say: 'the day seed’s extra calls' })] },
  { name: 'Settings, Booking', m11: 'setph', built: 'book-settings',
    changes: [
      ['Second time zone', 'Time zones', 'the prompt names this section Time zones, with the editable list (run 1)', { on: 'd' }],
      ['Text messages', null, 'nothing in the portal sends a text message (builder D’s report)'],
      ['Email 24 hours before', 'Email the day before', 'the switch says when the email goes: the day before (tidy follow-up 3, run 6’s 26)'],
      ['Your call with Tim is tomorrow at 9:00 your time.', 'is tomorrow at 09:00 UK time.', 'an email gives a clock time with its place, never “your time” (time zone rule 4; Emails rule 7); the test’s coaches are called Alex and Maya'],
      [/^(Join on Zoom|Reschedule|Cancel)$/, null, '“What the email says” is the one line; the email’s own buttons are in the email (builder D’s report; the template is in /email-preview)', { say: 'the email’s Join on Zoom, Reschedule and Cancel' }],
    ],
    added: [
      ['Each person reads the time in their own time zone.', 'the row’s one line of help (time zone rule 7)'],
      ['Copy link', 'each booking page’s own link can be copied from its row (the prompt: each with its own link)'],
      ['Booking pages and single-use links offer only your Open for calls times.', 'the section’s one line of help (builder A’s report)'],
      [/^name: (Copy the (Chemistry|Connection) Call page’s link|Edit (Chemistry|Connection) Call page|Make a single-use link)$/, 'each Edit and Copy says what it is for to a screen reader (5e rule 29am)', null, { say: 'Edit and Copy, named for a screen reader' }],
    ] },
  { name: 'Today, 5 minutes before a call: the next-call bar', m11: 'today:5', part: 'bar', built: 'bar-5', added: [BAR_NAME] },
  { name: 'Today, as a call starts: the next-call bar', m11: 'today:now', part: 'bar', built: 'bar-now',
    changes: [['Sam Okafor Starting now', 'Sam Okafor is starting now', 'every line is a full sentence with a verb (26 Oct design rule 9)', { on: 'd' }]],
    added: [['Sam Okafor is starting now', 'every line is a full sentence with a verb (26 Oct design rule 9); M11 says “Starting now”', null, { on: 'p' }], BAR_NAME] },
];
