// Every M11 screen of Phase 6a runs 1 and 2, held against the built page,
// word for word where the run builds it as M11 draws it, with each meant
// difference listed with why.
//
//   node --import ./tests/scores/register.mjs tests/coach/compare-m11.mjs [M11 v3.6 file] [M11 seq 77 file]
//
// RUN=1 or RUN=2 runs one run's screens (both when left out). Run 1's
// screens are listed below and read from M11 v3.6, as run 1 left them.
// Run 2's (the coaching day) are in compare-m11-run2-screens.mjs and read
// from M11 seq 77 (the second argument, or M11_RUN2), line by line, as the
// owner and as an associate, on a laptop (1440) and a phone (400): see
// compare-m11-run2.mjs. One browser run stays inside 10 minutes when run 2
// is split by role and size:
//   RUN=2 ROLES=owner SIZES=1440 node --import ./tests/scores/register.mjs tests/coach/compare-m11.mjs
//   (then ROLES=owner SIZES=400, ROLES=associate SIZES=1440, ROLES=associate SIZES=400;
//    SCREENS=<pattern> narrows it to some of M11's screens)
// A difference no rule explains is never listed as meant: it FAILS, and is
// printed again under "Faults" with the words on both sides.
//
// The built pages are made from the portal's shared parts (the design
// reference wins over M11 for how a part looks), so this compares what
// each screen says and holds, not pixels: the calm rules and the 18 Nov
// rules are measured on every screen by ui.mjs.
//   same:    words M11 shows that the built screen shows too
//   differs: words M11 shows that the built screen leaves out or says
//            another way, each with its reason (the run's prompt wins over
//            M11; a later run builds it; a rule of the portal)
// It prints the table the report uses.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { accountId, APP, clearDevice, coachContext, makeReport, seedDevice, settle, standIn } from './shared.mjs';
import { ADMIN_ROWS, seedRows } from './seed.mjs';
import { openScreen } from './screens.mjs';
import { compareRun2, m11File } from './compare-m11-run2.mjs';
import { EVERYWHERE, EXTRA_GROUPS, ROWS } from './compare-m11-run2-screens.mjs';

const RUNS = (process.env.RUN || '1,2').split(',');
const M11 = process.argv[2] || join(homedir(), 'Downloads/clarity-phase-6a/M11-coach-portal-v3.6.html');
if (RUNS.includes('1') && !existsSync(M11)) { console.log(`The M11 file isn’t at ${M11}. Give its path as the first argument.`); process.exit(1); }
const M11_SEQ77 = m11File(process.argv[3]);
if (RUNS.includes('2') && !M11_SEQ77) { console.log('M11 seq 77 wasn’t found. Give its path as the second argument, or as M11_RUN2.'); process.exit(1); }
const report = makeReport('Coach portal against M11');

const RUN2 = 'the coaching day is run 2';
const RUN3 = 'the calendar and booking are run 3';
const RUN4 = 'the CRM is run 4';
const LATER = 'agreements, prices and invoices are Phase 6b';
const KEYS = 'no keyboard shortcut is shown anywhere (Tim, 18 Nov)';

// [title, M11 screen, who, clicks in M11 (data-a), built screen, built role, same words, differences]
const SCREENS = [
  ['The header, on Today', 'today:tue', 'owner', [], 'today', 'owner',
    ['Search or do anything', 'Today', 'birthday today.'],
    [['November so far', LATER]]],
  ['The next-call bar', 'today:tue', 'owner', [], 'callbar', 'owner', ['Open the brief', 'Join on Zoom', 'in 8 minutes'], []],
  ['The menu, owner', 'menu', 'owner', [], 'menu', 'owner',
    ['Today', 'To-dos', 'Clients', 'Leads', 'Network', 'Boards', 'Calendar', 'Leading Ideas', 'Library', 'Favourite views', 'Executives', 'Settings', 'Sign out'],
    [['Kestrel renewal', 'to-do lists arrive with To-dos, in run 2'], ['Speaking', 'boards arrive with the CRM, in run 4']]],
  ['The menu, associate', 'menu', 'maya', [], 'menu', 'associate',
    ['Today', 'To-dos', 'Clients', 'Calendar', 'Leading Ideas', 'Library', 'Favourite views', 'Settings', 'Sign out'], []],
  ['Search', 'qj', 'owner', [], 'search', 'owner',
    ['Search or type an action', 'Actions'],
    [['Join the next call', RUN3], ['Select several', KEYS], ['Undo the last change', KEYS], ['Book a call', RUN3]]],
  ['Notifications', 'bell', 'owner', [], 'bell', 'owner', ['Notifications', 'Mark all as read'], [['booked a Chemistry Call', RUN3]]],
  ['Clients', 'clients', 'owner', [], 'clients', 'owner',
    ['Clients', 'People', 'Groups', 'Workshops', 'Search clients', 'List', 'Board', 'Table', 'Filter', 'Export', 'Next session first', 'Everyone', 'Sam Okafor', 'Maya’s client', 'Add client', 'Past clients'],
    [['Message clients', 'there are no messages inside the portal (the prompt)'], ['Today, 12:30', RUN3]]],
  ['Clients as a board', 'clientsb', 'owner', [], 'clients-board', 'owner', ['Starting', 'Active', 'Renewal due', 'Closing', 'Paused', 'to go'], []],
  ['Clients as a table', 'clientst', 'owner', [], 'clients-table', 'owner',
    ['Name', 'Next session', 'Sessions to go', 'Last contact', 'Sector', 'Value', 'Renewal date', 'Finance'],
    [['£24,000', 'a number field shows its number; a money field comes with prices in Phase 6b']]],
  ['A column menu', 'clientst', 'owner', ['colm:sector'], 'clients-table-menu', 'owner', ['Sort', 'A to Z', 'Show only', 'Finance', 'Not set'], []],
  ['Filter and saved views', 'filter', 'owner', [], 'clients-filter', 'owner',
    ['Filter', 'Tags', 'Executive', 'Status', 'Starting', 'Organisation', 'Any organisation', 'Sector', 'Saved views', 'Remove from the menu', 'Add to the menu', 'Name this view', 'Save as a view', 'Clear'], []],
  ['Several chosen', 'clients', 'owner', ['set:tab:people', 'sel:client:sam', 'sel:client:leo'], 'clients-picked', 'owner', ['2 chosen', 'Tag', 'Move'], []],
  ['Export to a spreadsheet', 'export', 'owner', [], 'clients-export', 'owner',
    ['Export to a spreadsheet', 'What to export', 'Format', 'Excel', 'CSV', 'Every field comes with it, your own fields included.', 'Download'], []],
  ['Groups', 'clients', 'owner', ['set:tab:groups'], 'clients-groups', 'owner', ['Kestrel leadership team', 'Kestrel Group', 'Add group'], [['6 people', 'the test’s own group has 3 people']]],
  ['Workshops', 'clients', 'owner', ['set:tab:workshops'], 'clients-workshops', 'owner', ['Leading under pressure', 'Northfield Logistics', '18 of 20 places', '3 waiting', 'Decide who decides', 'Add workshop'], [['Follow-up to send', 'workshop emails send in a later run']]],
  ['A client, mid-engagement (Sam)', 'client:sam', 'owner', [], 'client-sam', 'owner',
    ['Clients', 'Sam Okafor', 'Kestrel Group', 'Chief executive', 'London', 'Prefers early calls when travelling.', 'Let Sam raise the CFO first.', 'Email', 'WhatsApp', 'Overview', 'Everything', 'Next coaching session', 'Coaching sessions to go', '7 of 12', 'Progress', 'Sessions and recaps', 'Private notes', 'To-dos', 'Files', 'About Sam', 'Details', 'More'],
    [['Agreement', 'the prompt names this section Engagement; agreements are Phase 6b'], ['iMessage', 'iMessage shows only for +1 numbers (the prompt), and Sam’s is +44'], ['Book a call', RUN3], ['Open the brief', RUN2], ['Sam’s Mission', 'the Mission shows once Sam has a portal account and shares it']]],
  ['A client, the sections open (Sam)', 'client:sam', 'owner', ['fold:prog', 'fold:ses', 'fold:notes', 'fold:agr', 'fold:about', 'fold:det', 'fold:more'], 'client-sam-open', 'owner',
    ['Pin to the top', 'Unpin', 'Birthday', '12 Mar', 'Partner', 'Ama', 'Children', 'Kofi and Esi', 'Referred by', 'Dana Whitfield', 'Sector', 'Finance', 'Tags', 'Executive, Finance sector, Kestrel', 'Add field', 'Frequent traveller', 'Start the guided close', 'Export Sam’s data', 'Delete Sam’s data'],
    [['Ask to view Sam’s portal', 'it shows once Sam has a portal account to view'], ['Sponsor', LATER], ['Expenses allowed', LATER]]],
  ['A client, Everything (Sam)', 'everything', 'owner', [], 'client-sam-everything', 'owner', ['Search Sam’s history', 'Everything', 'Private note'], [['Invoice 1031 paid', LATER], ['Fathom summary', RUN2], ['Sam emailed', RUN4]]],
  ['A new client (Leo)', 'client:leo', 'owner', [], 'client-leo', 'owner',
    ['Leo Grant', 'Northfield Logistics', 'Operations director', 'Leeds', 'Getting started', 'First session', 'Welcome pack', 'Next coaching session'],
    [['First check-in', 'the portal’s name for it is the First review (rule 26a)'], ['Send the pack', 'the Library and its packs are Phase 6c'], ['Agreement', 'the first step here is the engagement; agreements are Phase 6b']]],
  ['A client on time credit (Marcus)', 'client:marcus', 'owner', [], 'client-marcus', 'owner',
    ['Marcus Bell', 'Head of people', 'Time credit left', '2 hours 10 minutes', 'Projects', 'Leadership offsite design', '6 hours 40 minutes so far', 'Team performance check', 'One-to-one coaching', 'Clock in'], []],
  ['A head coach (Jordan)', 'client:jordan', 'owner', [], 'client-jordan', 'owner',
    ['Jordan Reyes', 'Harbour City FC', 'Head coach', 'Chicago', 'Coaching sessions to go', '9 of 20', 'iMessage'],
    [['Fixtures', 'fixtures come with the calendar, in run 3']]],
  ['A group', 'group', 'owner', [], 'group', 'owner',
    ['Kestrel leadership team', 'Kestrel Group', 'Next group session', 'Group sessions left', '4 of 6', 'Members', 'Sam Okafor', 'Counts against Sam’s own', 'Dana Whitfield', 'Counts against the group’s', 'Add member', 'Sessions and recaps'],
    [['One recap to all 6', RUN2]]],
  ['A workshop, before the day', 'workshop2', 'owner', [], 'workshop-next', 'owner',
    ['Leading under pressure', 'Northfield Logistics', 'In person, Leeds', 'Registered', '18 of 20', 'Waiting list', 'Registration', 'Registration page', 'Places', 'Questions', 'What do you want from the morning?', 'Your role', 'Anything we should know?', 'Add question', 'Reminders', 'Email the day before', 'Email 1 hour before', 'A short survey the day after', 'Afterwards'],
    [['Tick people in as they arrive on Thu', 'attendance has its own section, Who’s coming, with each person to tick as they arrive']]],
  ['A workshop, after the day', 'workshop', 'owner', [], 'workshop-past', 'owner',
    ['Decide who decides', 'Kestrel Group', 'In person, London', 'Came', '19 of 22', 'Survey answers', '15 of 19', 'Average rating', 'Attendance', 'Add attendees', 'Would you recommend it?', '14 yes', 'What will you do differently?', 'Write down who decides before the meeting, not after.', 'Materials', 'Add file', 'What each person gets'],
    []],
  ['A workshop registration page', 'wreg', 'owner', [], 'public', 'owner', ['The Clarity Project', 'Leading under pressure', 'Your name', 'Your email', 'What do you want from the morning?', 'Your role', 'Anything we should know?', 'Register'], [['places taken.', 'a full sentence: “18 of 20 places are taken.”']]],
  ['An organisation, with its account map', 'org', 'owner', [], 'organisation', 'owner',
    ['Kestrel Group', 'Organisation', 'London', 'Who’s who', 'Dana Whitfield', 'Sponsor', 'Decides on renewals', 'Lee Hart', 'Invoices go to Lee', 'Sam Okafor', 'Client', 'Owen Price', 'Maya’s client', 'Kestrel leadership team', 'Add someone', 'Room to grow', 'seats are free.', 'Seats', 'Organisation area', 'Documents', 'Master services agreement', 'No expiry date.', 'Non-disclosure agreement', 'Add document'],
    [['Agreements and proposals', `this run lists the engagements; ${LATER}`], ['Invested this year', LATER], ['Price per seat', LATER], ['CLARITY-KESTREL', 'access codes are kept hashed, as already built, so the page can’t show one to copy']]],
  ['Settings, Your details', 'settings', 'owner', [], 'settings', 'owner',
    ['Settings', 'Your details', 'Away and cover', 'Notifications', 'Booking', 'Working hours', 'My calendars', 'Email', 'Tags and fields', 'Note layouts', 'Coaches', 'Activity log', 'Look', 'Name clients see', 'Mobile', 'Edit', 'How clients can reach you', 'WhatsApp', 'iMessage'],
    [['Second time zone', 'the prompt names this section Time zones, with the editable list']]],
  ['Settings, a row being edited', 'settings', 'owner', ['sed:name'], 'settings-edit', 'owner', ['Name clients see', 'Save', 'Cancel'], []],
  ['Settings, Away and cover', 'settings', 'owner', ['sets:away'], 'settings-away', 'owner', ['Away and cover', 'Away', 'Each client agrees first', 'cover coach'], [['Maya sees only what they share, until', 'cover is for one client at a time (the prompt: cover coach, client, start, end), so it is a list with Add cover, each with its own dates']]],
  ['Settings, Notifications', 'settings', 'owner', ['sets:noti'], 'settings-notifications', 'owner', ['Bookings, moves and cancellations', 'Agreements signed', 'Payments in and overdue', 'Support flags', '10 minutes before each call', 'This one comes in quiet hours too.', 'The bell in the header keeps everything, whatever you choose here.'], []],
  ['Settings, Booking', 'setph', 'owner', [], 'settings-booking', 'owner', ['Booking', 'Reminders', 'Email 24 hours before', 'Email 1 hour before', 'Limits', 'Gap between calls', 'Calls a day, at most', 'Notice needed', 'Open this far ahead'], [['Chemistry Call page', RUN3], ['Text messages', 'nothing in the portal sends a text message']]],
  ['Settings, Working hours', 'settings', 'owner', ['sets:hours'], 'settings-hours', 'owner', ['Working hours', 'Your working day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Open for bookings'], [['Set my open times', RUN3]]],
  ['Settings, My calendars', 'settings', 'owner', ['sets:cals'], 'settings-calendars', 'owner', ['My calendars', 'Work', 'Personal', 'Family', 'Titles for you, Busy to everyone else'], [['Google Calendar, tim@', RUN3]]],
  ['Settings, Tags and fields', 'settings', 'owner', ['sets:tags'], 'settings-tags', 'owner', ['Tags and fields', 'Tags', 'Executive', 'Sport', 'Finance sector', 'Kestrel', 'uses', 'Add tag', 'Custom fields', 'Sector', 'Choice from 6', 'Value', 'Number', 'Renewal date', 'Date', 'Add field'], []],
  ['Settings, Note layouts', 'settings', 'owner', ['sets:lay'], 'settings-layouts', 'owner', ['Note layouts', 'First session', 'What brought them to coaching, What good looks like in 6 months, What to watch for', 'Regular session', 'Focus, Insight, Next time', 'Review', 'Close'], []],
  ['Settings, Coaches', 'settings', 'owner', ['sets:coaches'], 'settings-coaches', 'owner', ['Coaches', 'Maya Collins', 'Associate', 'Approve Maya’s profile', 'Add coach'], [['£100 an hour', 'a rate is written “£100/hr”, heard as “per hour” (Tim, 19 Nov)']]],
  ['Settings, Activity log', 'settings', 'owner', ['sets:log'], 'settings-log', 'owner', ['Activity log', 'moved Owen Price to Maya Collins.'], []],
  ['Settings, Look', 'settings', 'owner', ['sets:look'], 'settings-look', 'owner', ['Look', 'Match my device', 'Edit'], []],
  ['Settings, associate', 'settings', 'maya', [], 'settings', 'associate', ['Your details', 'Away and cover', 'Notifications', 'Booking', 'Working hours', 'My calendars', 'Look', 'Name clients see', 'Maya'], [['Second time zone', 'the prompt names this section Time zones']]],
  ['Settings on a phone', 'settings', 'owner-phone', [], 'settings', 'owner-phone', ['Settings', 'Your details', 'Away and cover', 'Notifications', 'Booking', 'Working hours', 'My calendars', 'Tags and fields', 'Coaches', 'Activity log', 'Look'], [['Tim, email and messages', 'each section’s row is its name alone: its values show inside it']]],
  ['Past clients', 'past', 'owner', [], 'clients-past', 'owner', ['Clients', 'Past clients', 'Grace Liu', 'Ended'], [['Check-ins due', `past clients’ check-ins belong to Network: ${RUN4}`]]],
  ['Merge into one', 'merge', 'owner', [], 'merge', 'owner', ['Merge into one', 'These two look like the same person. Choose what to keep where they differ.', 'They’re different people', 'Nothing is lost.'], [['Both timelines join into one.', 'said as what joins: “Their notes, files, tags and engagements join into one.”']]],
  ['A name in a quiet line opens a note', 'today:tue', 'owner', ['sheet:bday'], 'today-note', 'owner', ['Priya Nair', 'A note to Priya', 'Happy birthday, Priya!', 'View Priya’s page'], [['Portal message', 'the client portal has no messages page to show one in, so only Email is offered: a message would go nowhere'], ['Send message', 'as above']]],
  ['A page of a later run', 'calendar', 'owner', [], 'coming', 'owner', ['Calendar'], [['Week', RUN3]]],
];

const table = [];
if (RUNS.includes('1')) {
  // What a screen says: its words, with what its boxes hold and say when empty.
  const READ = (root) => `${root.innerText} ${[...root.querySelectorAll('input, textarea')].map((e) => `${e.placeholder || ''} ${e.value || ''}`).join(' ')}`;
  const browser = await chromium.launch();
  const mock = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await mock.goto(`file://${M11}`);
  await mock.waitForTimeout(1500);
  async function m11Words(screen, who, clicks) {
    const [role, device] = who.split('-');
    await mock.click(`[data-r="${role}"]`);
    await mock.click(`[data-w="${device === 'phone' ? 'p' : 'd'}"]`);
    await mock.selectOption('#scr', screen);
    await mock.waitForTimeout(250);
    for (const a of clicks) { await mock.locator(`#fr [data-a="${a}"]`).first().click({ force: true }).catch(() => {}); await mock.waitForTimeout(200); }
    return (await mock.locator('#fr').evaluate(READ)).replace(/\s+/g, ' ');
  }

  const sessions = {};
  async function built(role) {
    if (sessions[role]) return sessions[role];
    const [who, device] = role.split('-');
    const size = device === 'phone' ? 400 : 1440;
    const ctx = await coachContext(browser, { size, theme: 'light' });
    const page = await ctx.newPage();
    const there = who === 'owner';
    await standIn(page, { role: who, db: there ? 'there' : 'none', rows: there ? seedRows() : {}, admin: there ? ADMIN_ROWS() : [] });
    await page.goto(`${APP}/coach`);
    await page.waitForSelector('.cc-app');
    const me = await accountId(page);
    await clearDevice(page, me);
    if (!there) await seedDevice(page, me, seedRows());
    sessions[role] = { ctx, page, me, size };
    return sessions[role];
  }
  async function builtWords(name, role) {
    const { page, size } = await built(role);
    if (name === 'callbar') {
      await page.goto(`${APP}/coach`);
      await page.evaluate(() => sessionStorage.setItem('clarity-coach-test-calls', JSON.stringify([{ name: 'Sam Okafor', startsAt: new Date(Date.now() + 7.6 * 60000).toISOString(), zoom: 'https://zoom.example/j/1', briefTo: '/coach/clients' }])));
      await page.goto(`${APP}/coach`); await page.waitForSelector('.cc-callbar'); 
      const t = await page.locator('.cc-callbar').innerText();
      await page.evaluate(() => sessionStorage.removeItem('clarity-coach-test-calls'));
      return t.replace(/\s+/g, ' ');
    }
    if (name === 'public') {
      const { ID } = await import('./seed.mjs');
      await page.goto(`${APP}/workshop/${ID.wsNextKey}`);
      await page.waitForSelector('.cc-public h1');
      await settle(page, 500);
      return (await page.locator('.cc-public').innerText()).replace(/\s+/g, ' ');
    }
    if (name === 'merge') {
      await page.goto(`${APP}/coach/clients`); await page.waitForSelector('.cc-app'); await settle(page, 900);
      await page.getByRole('button', { name: 'List', exact: true }).click().catch(() => {});
      await page.locator('.cc-pick-row', { hasText: 'Sam Okafor' }).hover();
      await page.getByRole('checkbox', { name: 'Select Sam Okafor' }).click({ force: true });
      await page.getByRole('checkbox', { name: 'Select Leo Grant' }).click({ force: true });
      await page.locator('.cc-bulk-btn', { hasText: 'Merge' }).click();
      await settle(page, 600);
    } else {
      await openScreen(page, name, size);
    }
    await settle(page, 300);
    const main = await page.locator('.cc-app').evaluate(READ);
    const layers = await page.locator('.ds-portal').evaluateAll((all, read) => all.map((el) => new Function('root', `return (${read})(root)`)(el)), READ.toString());
    return `${main} ${layers.join(' ')}`.replace(/\s+/g, ' ');
  }

  const has = (text, words) => text.toLowerCase().includes(words.toLowerCase());
  for (const [title, screen, who, clicks, name, role, same, differs] of SCREENS) {
    let m; let b;
    try { m = await m11Words(screen, who, clicks); b = await builtWords(name, role); } catch (e) { report.pass(`${title}: opened`, false, String(e).split('\n')[0]); continue; }
    const missingInMock = same.filter((w) => !has(m, w));
    const missingInBuilt = same.filter((w) => has(m, w) && !has(b, w));
    report.pass(`${title}: M11’s words are on the built screen (${same.length} read)`, missingInBuilt.length === 0, missingInBuilt.join(' | '));
    // Words this list expects of M11 that M11 doesn't say are the test's own (invented names differ): they must still be built.
    const own = missingInMock.filter((w) => !has(b, w));
    report.pass(`${title}: nothing listed is missing from both`, own.length === 0, own.join(' | '));
    for (const [words, why] of differs) {
      report.pass(`${title}: M11 shows “${words}”`, has(m, words), 'M11 doesn’t show it, so it isn’t a difference');
      report.pass(`${title}: the built screen leaves “${words}” out or says it another way (${why})`, !has(b, words), 'the built screen shows it, so it isn’t a difference any more');
    }
    table.push(`| ${title} | ${differs.length ? 'Matches with a change' : 'Matches'} | ${differs.map(([w, why]) => `“${w}”: ${why}`).join('; ') || ''} |`);
  }
  for (const s of Object.values(sessions)) { await clearDevice(s.page, s.me); await s.ctx.close(); }
  await browser.close();
}

// Run 2, the coaching day: M11 seq 77, line by line.
if (RUNS.includes('2')) {
  table.push('| **Run 2, the coaching day (M11 seq 77)** | | |');
  await compareRun2(report, table, { file: M11_SEQ77, rows: ROWS, extraGroups: EXTRA_GROUPS, everywhere: EVERYWHERE });
}
console.log('\n| M11 screen | Result | What differs and why |\n|---|---|---|');
console.log(table.join('\n'));
report.done();
