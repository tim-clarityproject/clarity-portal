// The coach portal's screens, each opened by name, and one walk over them:
// as the owner and as an associate (and, for the client's own Coaching
// page, as the test client), at 1440, 768 and 400, dark and light. Used by
// the screenshots (shots.mjs) and by the UI tester (ui.mjs).
//
// Run 1's screens (SCREENS, the group "run1"): the owner's walk has 049's
// tables answered by the stand-in (so "Maya's client" rows show); the
// associate's keeps everything on the device.
//
// Run 2's screens (the coaching day; the groups after it): each group pins
// the page's clock to a day at or before the real one (never ahead: sign-in
// rule 46), counts the seed's days from that day, and keeps everything on
// the device for both roles: the stand-in tells the page 049 and 050 aren't
// there, stops any write and lists it, and the walk reports any it finds.
// What a client shares, the access codes' table and every /api/ call are
// answered by stand-ins. The client's page is opened as the test client
// with every function it calls stood in (client.mjs).
import { chromium } from 'playwright';
import { accountId, APP, clearDevice, coachContext, seedDevice, settle, SIZES, standIn } from './shared.mjs';
import { ADMIN_ROWS, CAL, DAY, ID, PRESSURE, seedClock, seedRows, seedWithCal, seedWithDay, SES, SHARED } from './seed.mjs';
import { bookStore, guestStandIn } from './book-standin.mjs';
import { clearCoaching, clientContext, clientStandIn, fromCoach } from './client.mjs';

/**
 * Marks three calls on the device as a round of the sync marks one moved in Google Calendar (Sam's, with its session; Ruth's
 * Chemistry Call; Priya's), the way another tab's change arrives. Resolves Sam's session id.
 */
const movedInGoogle = async (page) => {
  const session = await page.evaluate((ids) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('clarity-coach-local:'));
    const s = JSON.parse(localStorage.getItem(key));
    for (const id of ids) if (s.rows.coach_cal_items?.[id]) s.rows.coach_cal_items[id] = { ...s.rows.coach_cal_items[id], moved_in_google_at: new Date().toISOString() };
    const next = JSON.stringify(s);
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: next }));
    return s.rows.coach_cal_items?.[ids[0]]?.session_id || null;
  }, [CAL.samTue, CAL.ruth, CAL.priyaTue]);
  await settle(page, 600);
  return session;
};

const click = (name, role = 'button') => async (page) => { await page.getByRole(role, { name, exact: true }).first().click(); await settle(page, 500); };
export const SCREENS = [
  ['today', '/coach'],
  ['today-note', '/coach', async (page) => { await page.locator('.cc-main .cc-inline-link').first().click(); await settle(page, 600); }],
  ['menu', '/coach', async (page) => { await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click(); await settle(page, 600); }],
  ['search', '/coach', async (page) => { await page.getByRole('button', { name: 'Search, or do anything' }).click(); await settle(page, 400); }],
  ['search-typed', '/coach', async (page) => { await page.getByRole('button', { name: 'Search, or do anything' }).click(); await page.keyboard.type('sam'); await settle(page, 400); }],
  ['bell', '/coach', async (page) => { await page.getByRole('button', { name: /^Notifications/ }).click(); await settle(page, 600); }],
  ['clients', '/coach/clients', null, { expects: ['tabs'] }],
  ['clients-board', '/coach/clients', async (page, size) => { if (size === 400) { await click('View')(page); await page.getByRole('menuitemcheckbox', { name: 'Board' }).click(); } else await page.getByRole('button', { name: 'Board', exact: true }).click(); await settle(page, 600); }],
  ['clients-table', '/coach/clients', async (page, size) => { if (size < 1100) return 'skip'; await page.getByRole('button', { name: 'Table', exact: true }).click(); await settle(page, 600); return null; }],
  ['clients-table-menu', '/coach/clients', async (page, size) => { if (size < 1100) return 'skip'; await page.getByRole('button', { name: 'Table', exact: true }).click(); await settle(page, 400); await page.getByRole('button', { name: 'Sector', exact: true }).click(); await settle(page, 500); return null; }],
  ['clients-filter', '/coach/clients', click('Filter')],
  ['clients-picked', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await page.getByRole('button', { name: 'List', exact: true }).click(); await settle(page, 400); await page.getByRole('checkbox', { name: 'Select Sam Okafor' }).click({ force: true }); await page.getByRole('checkbox', { name: 'Select Leo Grant' }).click({ force: true }); await settle(page, 400); return null; }],
  ['clients-add', '/coach/clients', click('Add client')],
  ['clients-team', '/coach/clients', async (page) => { await click('Add a team')(page); await page.locator('#cc-team-paste').fill('Name,Email,Role\nDana Whitfield,dana@example.invalid,Chief of staff\nSam Again,sam@example.invalid,\nGrace Liu,grace.liu@example.invalid,Partner\nGrace Twice,grace.liu@example.invalid,'); await settle(page, 400); }],
  ['clients-export', '/coach/clients', async (page, size) => { if (size === 400) return 'skip'; await click('Export')(page); return null; }],
  ['clients-groups', '/coach/clients?tab=groups', null, { expects: ['tabs'] }],
  ['clients-workshops', '/coach/clients?tab=workshops', null, { expects: ['tabs'] }],
  ['clients-past', '/coach/clients/past'],
  ['client-sam', `/coach/clients/${ID.sam}`],
  ['client-sam-open', `/coach/clients/${ID.sam}`, async (page) => { for (const f of ['Private notes', 'Engagement', 'About Sam', 'Details', 'More']) { await page.getByRole('button', { name: f, exact: true }).click(); await settle(page, 150); } }],
  ['client-sam-everything', `/coach/clients/${ID.sam}`, click('Everything')],
  ['client-leo', `/coach/clients/${ID.leo}`],
  ['client-marcus', `/coach/clients/${ID.marcus}`],
  ['client-priya', `/coach/clients/${ID.priya}`],
  ['client-jordan', `/coach/clients/${ID.jordan}`],
  ['group', `/coach/groups/${ID.group}`],
  ['workshop-next', `/coach/workshops/${ID.wsNext}`],
  ['workshop-past', `/coach/workshops/${ID.wsPast}`],
  ['organisation', `/coach/organisations/${ID.kestrel}`, null, 'owner'],
  ['settings', '/coach/settings'],
  ...['you', 'away', 'notifications', 'booking', 'hours', 'zones', 'calendars', 'tags', 'look'].map((s) => [`settings-${s}`, `/coach/settings/${s}`]),
  ...['email', 'layouts', 'coaches', 'log'].map((s) => [`settings-${s}`, `/coach/settings/${s}`, null, 'owner']),
  ['settings-edit', '/coach/settings/you', async (page) => { await page.getByRole('button', { name: 'Edit Name clients see' }).click(); await settle(page, 300); }],
  ['coming', '/coach/library'],
];

// ---------------------------------------------------------------- run 2: the coaching day
export const TUE = new Date(2026, 10, 17, 9, 0);
/** The same Tuesday at 12:22, 8 minutes before Sam's call: the next-call bar is showing. */
export const BAR_AT = new Date(2026, 10, 17, 12, 22);
export const EVE = new Date(2026, 10, 17, 18, 45);
export const FRI = new Date(2026, 10, 13, 13, 30);

const press = async (page, name) => { await page.getByRole('button', { name, exact: true }).first().click(); await settle(page, 450); };
const take = async (page) => { await page.locator('.ds-offer-take').click(); await settle(page, 500); };
const openFold = async (page, name) => { const b = page.locator('.cc-fold-btn', { hasText: name }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await settle(page, 300); } };
const pick = async (page, label, option) => {
  await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).first().click(); await settle(page, 300);
  await page.getByRole('option', { name: option, exact: true }).click(); await settle(page, 400);
};
const next = async (page, times = 1) => { for (let i = 0; i < times; i += 1) await press(page, 'Next'); };
const openOver = async (page) => { await page.locator('.cc-today-over .cc-inline-link').click(); await settle(page, 500); };
/** The Weekly review, from Friday's offer: the week's energy is rated first when it hasn't been. */
const openReview = async (page) => {
  await take(page);
  if (await page.locator('[role=dialog]').filter({ hasText: 'How was your energy this week?' }).count() && !(await page.locator('[role=dialog]').filter({ hasText: 'Step 1 of 5' }).count())) {
    await page.getByRole('radio', { name: 'Good', exact: true }).click(); await settle(page, 1000);
    await take(page);
  }
};
const chooseBoard = async (page, size) => {
  if (size === 400) { await press(page, 'View'); await page.getByRole('menuitemcheckbox', { name: 'Board' }).click(); } else await page.getByRole('button', { name: 'Board', exact: true }).click();
  await settle(page, 600);
};
/** Chooses two to-dos: the round tick on a laptop and a tablet, press and hold then a tap on a phone. */
const chooseTwo = async (page, size) => {
  const rows = page.locator('.cc-todo-row');
  if (size === 400) {
    await rows.nth(1).dispatchEvent('pointerdown', { bubbles: true, pointerType: 'touch' });
    await settle(page, 650);
    await rows.nth(1).dispatchEvent('pointerup', { bubbles: true, pointerType: 'touch' });
    await settle(page, 200);
    await rows.nth(2).locator('.cc-todo-open').click();
  } else {
    await rows.nth(1).locator('.cc-pick').click({ force: true });
    await rows.nth(2).locator('.cc-pick').click({ force: true });
  }
  await settle(page, 400);
};
const openAdd = async (page) => { await page.locator('.ds-addrow', { hasText: 'Add to-do' }).first().click(); await settle(page, 600); };
const QUICK_WORDS = 'Call Dana about the review tomorrow 10:00 30m #Kestrel renewal @Phone !';
const emails = (page) => page.locator('section, .cc-part').filter({ has: page.getByRole('heading', { name: 'Emails' }) }).last();

/** The workshop to come has both reminders on; the past one's day-before reminder went, and its follow-up hasn't. */
const workshopSeed = (rows) => {
  const sentAt = new Date(TUE); sentAt.setDate(sentAt.getDate() - 17); sentAt.setHours(7, 0, 4, 0);
  return {
    ...rows,
    workshops: rows.workshops.map((w) => (w.id === ID.wsNext ? { ...w, remind_hour_before: true } : w)),
    workshop_sends: [{ id: '00000000-0000-4000-8000-00000000a001', workshop_id: ID.wsPast, kind: 'day_before', sent_at: sentAt.toISOString(), people: 22, sent_by: null }],
  };
};

/**
 * Run 2's screens, in groups. A group: `at` (the pinned clock), `seed`
 * (options for seedWithDay, or a function that changes its rows), `shares`
 * ('sessions' answers what a client shares as sessions.mjs does), `init`
 * (runs in the page before anything loads), `roles`, and its screens.
 * A screen: [name, path, what to do first, options]. Options: `roles`,
 * `expects` (the design rules that must be found on it, by name: see
 * rules.mjs), `full` (a full-page picture), `viewport`, `sizes`.
 */
export const GROUPS = [
  { name: 'run1', screens: SCREENS },
  {
    name: 'tue', at: TUE,
    screens: [
      ['today-tue', '/coach', null, { full: true, expects: ['over', 'figures', 'important'] }],
      ['today-over', '/coach', openOver, { expects: ['panel'] }],
      ['today-move', '/coach', async (page) => { await openOver(page); await press(page, 'Choose what to move'); }, { expects: ['panel'] }],
      ['today-plan-1', '/coach', take, { expects: ['panel'] }],
      ['today-plan-2', '/coach', async (page) => { await take(page); await next(page); }, { expects: ['panel'] }],
      ['today-plan-3', '/coach', async (page) => { await take(page); await next(page, 2); await page.locator('.ds-dialog .cc-today-still .ds-link').first().click(); await settle(page, 300); }, { expects: ['panel'] }],
      ['today-add', '/coach', async (page) => { await press(page, 'Add to-do'); await page.locator('.ds-dialog textarea, .ds-dialog input[type=text]').first().fill(QUICK_WORDS); await settle(page, 300); }, { expects: ['panel'] }],
      ['today-attention-all', '/coach', async (page) => { await page.getByRole('button', { name: /^Show all \d+$/ }).click(); await settle(page, 300); await page.getByRole('button', { name: 'Show fewer' }).scrollIntoViewIfNeeded(); }],
    ],
  },
  {
    name: 'eve', at: EVE,
    screens: [
      ['today-eve', '/coach', null, { full: true, expects: ['figures'] }],
      ['today-close-1', '/coach', take, { expects: ['panel'] }],
      ['today-close-2', '/coach', async (page) => { await take(page); await next(page); }, { expects: ['panel'] }],
      ['today-close-3', '/coach', async (page) => { await take(page); await next(page, 2); }, { expects: ['panel'] }],
    ],
  },
  {
    name: 'fri', at: FRI,
    screens: [
      ['today-fri', '/coach', null, { full: true, expects: ['figures'] }],
      ['today-energy', '/coach', take, { expects: ['panel'] }],
      ['today-review-1', '/coach', openReview, { expects: ['panel'] }],
      ['today-review-2', '/coach', async (page) => { await openReview(page); await next(page); }, { expects: ['panel'] }],
      ['today-review-3', '/coach', async (page) => { await openReview(page); await next(page, 2); }, { expects: ['panel'] }],
      ['today-review-4', '/coach', async (page) => { await openReview(page); await next(page, 3); }, { expects: ['panel', 'chart'] }],
      ['today-review-5', '/coach', async (page) => { await openReview(page); await next(page, 4); await page.locator('.ds-dialog textarea').fill('Leave Thursday afternoon clear for writing.'); await settle(page, 200); }, { expects: ['panel'] }],
    ],
  },
  { name: 'cap', at: TUE, seed: { over: true }, screens: [['today-cap', '/coach', async (page) => { await page.locator('.cc-today-figures').scrollIntoViewIfNeeded(); await settle(page, 200); }, { full: true, expects: ['capacity', 'figures'] }]] },
  {
    name: 'fin', at: TUE, roles: ['owner'],
    init: () => { try { sessionStorage.setItem('clarity-coach-test-finances', '1'); } catch { /* blocked */ } },
    screens: [['today-finances', '/coach', null, { expects: ['finances'] }]],
  },
  {
    name: 'todos', at: TUE,
    screens: [
      ['todos-today', '/coach/todos', null, { full: true, expects: ['tabs', 'important'] }],
      ['todos-upcoming', '/coach/todos?tab=upcoming', null, { full: true, expects: ['tabs', 'important'] }],
      ['todos-someday', '/coach/todos?tab=someday', null, { full: true, expects: ['tabs'] }],
      ['todos-done', '/coach/todos', async (page) => { await openFold(page, 'Done'); await page.locator('.cc-fold-body').scrollIntoViewIfNeeded(); }, { expects: ['tabs'] }],
      ['todos-quick-add', '/coach/todos', async (page, size) => {
        // On a laptop and a tablet the quick add is on the page; on a phone it is the full-screen panel.
        if (size === 400) await openAdd(page);
        await page.getByLabel('What needs doing?').first().fill(QUICK_WORDS); await settle(page, 300);
      }, { expects: ['help'] }],
      ['todos-quick-add-panel', '/coach/todos', async (page) => { await openAdd(page); await page.locator('.ds-dialog').getByLabel('What needs doing?').fill(QUICK_WORDS); await settle(page, 300); }, { expects: ['panel', 'help'] }],
      ['todos-quick-add-empty', '/coach/todos', async (page) => { await openAdd(page); await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300); }, { expects: ['panel'] }],
      ['todos-help', '/coach/todos', async (page) => { await openAdd(page); await page.locator('.ds-dialog .ds-explain-link').click(); await settle(page, 600); }, { expects: ['panel', 'explain'] }],
      ['todos-todo', '/coach/todos', async (page) => { await page.locator(`[data-todo="${DAY.t3}"]`).click(); await settle(page, 600); }, { expects: ['panel', 'level'] }],
      ['todos-todo-foot', '/coach/todos', async (page) => { await page.locator(`[data-todo="${DAY.t3}"]`).click(); await settle(page, 600); await page.locator('.ds-dialog-body').evaluate((b) => { b.scrollTop = b.scrollHeight; }); await settle(page, 300); }, { expects: ['panel'] }],
      ['todos-todo-important', '/coach/todos', async (page) => { await page.locator(`[data-todo="${DAY.t1}"]`).click(); await settle(page, 600); }, { expects: ['panel', 'level'] }],
      ['todos-todo-day', '/coach/todos', async (page) => { await page.locator(`[data-todo="${DAY.t9}"]`).click(); await settle(page, 600); await pick(page, 'Deadline', 'Another day'); }, { expects: ['panel', 'level'] }],
      ['todos-todo-email', '/coach/todos', async (page) => { await page.locator(`[data-todo="${DAY.t11}"]`).click(); await settle(page, 600); await page.locator('.cc-todo-linked').scrollIntoViewIfNeeded(); await settle(page, 200); }, { expects: ['panel'] }],
      ['todos-picked', '/coach/todos', chooseTwo, { expects: ['bulk'] }],
      ['todos-picked-menu', '/coach/todos', async (page, size) => { await chooseTwo(page, size); await page.locator('.cc-todo-bulk').getByRole('button', { name: 'Move', exact: true }).click(); await settle(page, 400); }],
      ['todos-more', '/coach/todos', async (page, size) => { if (size === 400) return 'skip'; await page.locator('.cc-todo-row').nth(1).hover(); await page.locator('.cc-todo-row').nth(1).locator('.cc-todo-more').click(); await settle(page, 400); return null; }],
      ['todo-list', `/coach/todos/lists/${DAY.listKestrel}`, null, { full: true, expects: ['important'] }],
      ['todo-list-heading', `/coach/todos/lists/${DAY.listKestrel}`, async (page) => { await page.locator('.ds-addrow', { hasText: 'Add heading' }).click(); await settle(page, 400); }],
      ['todo-list-heading-menu', `/coach/todos/lists/${DAY.listKestrel}`, async (page) => { await page.getByRole('button', { name: 'More for Before the review' }).click(); await settle(page, 400); }],
    ],
  },
  {
    name: 'sessions', at: TUE, seed: { sessions: true }, shares: 'sessions',
    screens: [
      ['brief', '/coach', async (page) => { await page.locator('.cc-today-call--open').first().click(); await settle(page, 900); }, { expects: ['panel'] }],
      ['brief-foot', '/coach', async (page) => { await page.locator('.cc-today-call--open').first().click(); await settle(page, 900); await page.locator('.ds-dialog-body').evaluate((b) => { b.scrollTop = b.scrollHeight; }); await settle(page, 300); }, { expects: ['panel'] }],
      ['session', `/coach/sessions/${SES.write}`, null, { full: true, expects: ['level'] }],
      ['session-unwritten', `/coach/sessions/${SES.blank}`, null, { full: true, expects: ['level'] }],
      ['session-late', `/coach/sessions/${SES.late}`, null, { full: true }],
      ['session-no-show', `/coach/sessions/${SES.blank}`, async (page) => { await pick(page, 'What happened', 'No-show'); }, { full: true }],
      ['session-moved', `/coach/sessions/${SES.blank}`, async (page) => { await pick(page, 'What happened', 'Moved'); }, { full: true, expects: ['level'] }],
      ['session-sent', `/coach/sessions/${SES.sent}`, null, { full: true }],
      ['session-future', `/coach/sessions/${SES.future}`, null, { full: true }],
      ['session-group', `/coach/sessions/${SES.group1}`, null, { full: true }],
      ['close', `/coach/clients/${ID.priya}/close`, null, { full: true }],
      ['client-sessions', `/coach/clients/${SES.hannah}`, async (page) => { await openFold(page, 'Sessions and recaps'); await openFold(page, 'To-dos'); }, { full: true }],
      ['client-add-session', `/coach/clients/${SES.hannah}`, async (page) => { await openFold(page, 'Sessions and recaps'); await page.locator('.ds-addrow', { hasText: 'Add session' }).first().click(); await settle(page, 500); }, { expects: ['panel', 'level'] }],
      ['group-sessions', `/coach/groups/${ID.group}`, null, { full: true }],
    ],
  },
  {
    name: 'left', at: TUE, seed: workshopSeed,
    screens: [
      ['settings-hours-capacity', '/coach/settings/hours', async (page) => { await page.getByText('Coaching hours each week').scrollIntoViewIfNeeded(); await settle(page, 200); }, { expects: ['capacity-row'] }],
      ['settings-capacity-edit', '/coach/settings/hours', async (page) => { await page.getByRole('button', { name: 'Edit Coaching hours each week' }).click(); await settle(page, 300); }],
      ['settings-look-help', '/coach/settings/look', async (page) => { await page.getByText('Hidden help').scrollIntoViewIfNeeded(); await settle(page, 200); }, { expects: ['hidden-help'] }],
      ['workshop-emails', `/coach/workshops/${ID.wsNext}`, async (page) => { await emails(page).scrollIntoViewIfNeeded(); await settle(page, 200); }, { full: true }],
      ['workshop-emails-after', `/coach/workshops/${ID.wsPast}`, async (page) => { await emails(page).scrollIntoViewIfNeeded(); await settle(page, 200); }, { full: true }],
      ['workshop-follow-up', `/coach/workshops/${ID.wsPast}`, async (page) => { await emails(page).getByRole('button', { name: 'Send the follow-up' }).click(); await settle(page, 600); }, { expects: ['panel'] }],
      ['organisation-code', `/coach/organisations/${ID.kestrel}`, async (page) => { await page.locator('.cc-line', { hasText: 'Access code' }).scrollIntoViewIfNeeded(); await settle(page, 200); }, { roles: ['owner'] }],
      ['organisation-code-shown', `/coach/organisations/${ID.kestrel}`, async (page) => { await page.locator('.cc-line', { hasText: 'Access code' }).getByRole('button', { name: /^(Make an access code|Reset the code)$/ }).click(); await settle(page, 700); const again = page.locator('[role=dialog]').last().getByRole('button', { name: 'Reset the code', exact: true }); if (await again.count()) { await again.click(); await settle(page, 800); } }, { roles: ['owner'], expects: ['panel'] }],
      ['organisation-code-reset', `/coach/organisations/${ID.kestrel}`, async (page) => { await page.locator('.cc-line', { hasText: 'Access code' }).getByRole('button', { name: 'Reset the code' }).click(); await settle(page, 600); }, { roles: ['owner'], expects: ['panel'] }],
      ['board', '/coach/clients', async (page, size) => { await chooseBoard(page, size); }, { full: true }],
      ['board-more', '/coach/clients', async (page, size) => { if (size !== 400) return 'skip'; await chooseBoard(page, size); await page.getByRole('button', { name: 'More for Sam Okafor' }).click(); await settle(page, 500); return null; }],
      ['clients-table-scrolled', '/coach/clients', async (page) => { await page.getByRole('button', { name: 'Table', exact: true }).click(); await settle(page, 600); await page.evaluate(() => window.scrollTo(0, 450)); await settle(page, 300); }, { sizes: [1440], viewport: { width: 1440, height: 520 }, expects: ['table'] }],
    ],
  },
  // The calendar (run 3): M11's own week on the device (seedWithCal), for both roles.
  {
    name: 'cal', at: TUE, cal: true,
    screens: [
      ['cal-week', '/coach/calendar?view=week', null, { full: true }],
      ['cal-day', '/coach/calendar?view=day', null, { full: true }],
      ['cal-month', '/coach/calendar?view=month', null, { full: true }],
      ['cal-schedule', '/coach/calendar?view=schedule'],
      ['cal-todos', '/coach/calendar?view=week', async (page, size) => { if (size === 400) return 'skip'; await press(page, 'Show to-dos'); await page.evaluate(() => window.scrollTo(0, 0)); return null; }, { full: true }],
      ['cal-hours', '/coach/calendar?view=week', async (page, size) => { if (size === 400) await page.getByRole('button', { name: 'Working hours' }).scrollIntoViewIfNeeded(); await press(page, 'Working hours'); await page.evaluate(() => window.scrollTo(0, 0)); }, { full: true }],
      ['cal-quick', '/coach/calendar?view=week', async (page) => { await press(page, 'Add to calendar'); await page.locator('.ds-dialog').getByLabel('Title').fill('Coffee with Dan Thu 10:00'); await settle(page, 300); }, { expects: ['panel'] }],
      ['cal-quick-beside', '/coach/calendar?view=week', async (page, size) => { if (size === 400) return 'skip'; const b = await page.locator('[data-cal-day="2026-11-19"]').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + 44 * 2.3); await settle(page, 600); return null; }],
      ['cal-quick-empty', '/coach/calendar?view=week', async (page) => { await press(page, 'Add to calendar'); await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300); }, { expects: ['panel'] }],
      ['cal-item', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-sched-row', { hasText: 'Writing' }).first().click(); await settle(page, 700); }, { expects: ['panel', 'level'] }],
      ['cal-item-more', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-sched-row', { hasText: 'Leaders’ dinner' }).first().click(); await settle(page, 700); await press(page, 'More options'); }, { expects: ['panel'] }],
      ['cal-item-more-foot', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-sched-row', { hasText: 'Leaders’ dinner' }).first().click(); await settle(page, 700); await press(page, 'More options'); await page.locator('.ds-dialog-body').evaluate((b) => { b.scrollTop = b.scrollHeight; }); await settle(page, 300); }, { expects: ['panel'] }],
      ['cal-repeat', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-sched-row', { hasText: 'Training' }).first().click(); await settle(page, 700); await press(page, 'More options'); await pick(page, 'Repeats', 'Custom'); }, { expects: ['panel'] }],
      ['cal-todo-item', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-sched-row', { hasText: 'Send the Kestrel proposal' }).first().click(); await settle(page, 700); }, { expects: ['panel'] }],
      ['cal-calendars', '/coach/calendar?view=schedule', async (page) => { await press(page, 'My calendars'); }, { expects: ['panel'] }],
      ['cal-zone-menu', '/coach/calendar?view=day', async (page) => { await page.locator('.cc-cal-zone-btn').click(); await settle(page, 400); }],
      ['cal-view-menu', '/coach/calendar', async (page, size) => { if (size !== 400) return 'skip'; await press(page, 'View'); return null; }],
      ['cal-jump', '/coach/calendar?view=schedule', async (page) => { await page.locator('.cc-cal-range').click(); await settle(page, 500); }],
      ['cal-note', '/coach/calendar?view=day', async (page) => { await page.locator('[data-cal-key]', { hasText: 'Priya Nair' }).first().focus(); await page.keyboard.press('ArrowDown'); await settle(page, 900); await press(page, 'Open the note'); }, { expects: ['panel'] }],
      ['todos-calendar', '/coach/todos', async (page) => { await page.locator('.cc-todo-bar .cc-seg').getByRole('button', { name: 'Calendar', exact: true }).click(); await settle(page, 700); }, { full: true, expects: ['tabs'] }],
      // Last: the switch is kept in Settings, so every screen after it would show seven days.
      ['cal-weekends', '/coach/calendar?view=week', async (page, size) => { if (size === 400) return 'skip'; await page.getByRole('switch', { name: 'Weekends' }).click(); await settle(page, 700); return null; }, { full: true }],
    ],
  },
  // Booking (run 3, step 4): Book a call, the single-use link, Offer times, a poll, Open for calls and Settings' Booking, on M11's week.
  {
    name: 'book', at: TUE, cal: true,
    screens: [
      ['book-call', '/coach/calendar/book', async (page) => { await pick(page, 'Who is it with', 'Jordan Reyes'); await page.locator('.ds-dialog .ds-answer').first().click(); await settle(page, 300); await pick(page, 'How often', 'Every 2 weeks'); await settle(page, 500); }, { expects: ['panel'] }],
      ['book-call-empty', '/coach/calendar/book', async (page) => { await page.locator('.ds-dialog .ds-btn--primary').click(); await settle(page, 300); }, { expects: ['panel'] }],
      ['book-call-person', '/coach/calendar/book', async (page) => { await pick(page, 'Who is it with', 'Leo Grant'); await page.locator('.ds-dialog').getByRole('radio', { name: 'In person' }).click(); await settle(page, 400); }, { expects: ['panel'] }],
      ['book-call-group', '/coach/calendar/book', async (page) => { await pick(page, 'Who is it with', 'Kestrel leadership team'); await page.locator('.ds-dialog').getByLabel('Who’s invited?').fill('Dana Whitfield <dana@example.invalid>, Paul Garner'); await settle(page, 400); }, { expects: ['panel'] }],
      ['book-link', '/coach/settings/booking', async (page) => { await press(page, 'Make a single-use link'); await settle(page, 400); }, { expects: ['panel'] }],
      ['book-link-made', '/coach/settings/booking', async (page) => { await press(page, 'Make a single-use link'); await page.locator('.ds-dialog').getByLabel('Who is it for?').fill('Dana Whitfield'); await press(page, 'Create the link'); await settle(page, 600); }, { expects: ['panel'] }],
      ['book-offer', '/coach/calendar/offer', async (page, size) => { for (const [day, row] of size === 400 ? [['2026-11-17', 8.2]] : [['2026-11-18', 8.2], ['2026-11-20', 2.2]]) { const b = await page.locator(`[data-cal-day="${day}"]`).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + 44 * row); await settle(page, 300); } await page.evaluate(() => window.scrollTo(0, 0)); }, { full: true }],
      ['book-poll-start', '/coach/calendar/polls/new', async (page) => { await page.locator('.ds-dialog').getByLabel('What’s it for?').fill('Three-way meeting'); await page.locator('.ds-dialog').getByLabel('Who’s invited?').fill('Mia Torres <mia@example.invalid>, Paul Garner <paul@example.invalid>'); await settle(page, 300); }, { expects: ['panel'] }],
      ['book-poll-pick', '/coach/calendar/polls/new', async (page, size) => { await page.locator('.ds-dialog').getByLabel('What’s it for?').fill('Three-way meeting'); await page.locator('.ds-dialog').getByLabel('Who’s invited?').fill('Mia Torres <mia@example.invalid>, Paul Garner <paul@example.invalid>'); await press(page, 'Pick the times'); await settle(page, 600); if (size !== 400) { const b = await page.locator('[data-cal-day="2026-11-18"]').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + 44 * 8.2); await settle(page, 300); } await page.evaluate(() => window.scrollTo(0, 0)); }, { full: true }],
      ['book-poll', `/coach/calendar/polls/${CAL.poll}`, null, { full: true }],
      ['book-poll-mia', `/coach/calendar/polls/${CAL.poll}`, async (page) => { await press(page, 'As Mia sees it'); }, { full: true }],
      ['book-open', '/coach/calendar/open', null, { full: true }],
      ['book-open-edit', '/coach/calendar/open', async (page) => { await page.locator('.cc-cal-tile--open').first().click(); await settle(page, 600); }, { expects: ['panel'] }],
      ['book-open-add', '/coach/calendar/open', async (page) => { await press(page, 'Add open time'); await settle(page, 300); }, { expects: ['panel'] }],
      ['book-settings', '/coach/settings/booking', null, { full: true }],
      ['book-settings-limit', '/coach/settings/booking', async (page) => { await press(page, 'Edit Gap between calls'); }],
      ['book-settings-type', '/coach/settings/booking', async (page) => { await press(page, 'Edit Chemistry Call page'); await settle(page, 400); }, { expects: ['panel'] }],
    ],
  },
  // Google Calendar, Zoom and the next-call bar (run 3, steps 3 and 6), on M11's week at 12:22: Sam's call is 8 minutes away, so
  // the bar shows. The device keeps what a screen changed, so the plain screens come first, then a call "moved in Google"
  // (marked on the device as a round would mark it), and the stand-in switches last.
  {
    name: 'sync', at: BAR_AT, cal: true,
    screens: [
      ['sync-bar', '/coach', null, { full: true }],
      ['sync-bar-brief', '/coach', async (page) => { await page.locator('.cc-callbar .cc-inline-link').click(); await settle(page, 900); }, { expects: ['panel'] }],
      ['sync-settings', '/coach/settings/calendars', null, { full: true }],
      ['sync-settings-google', '/coach/settings/calendars', async (page) => { await press(page, 'Connect Google Calendar'); }],
      ['sync-settings-zoom', '/coach/settings/calendars', async (page) => { await press(page, 'Connect Zoom'); }],
      ['sync-moved-week', '/coach/calendar?view=week', async (page) => { await movedInGoogle(page); }, { full: true }],
      ['sync-moved-schedule', '/coach/calendar?view=schedule', async (page) => { await movedInGoogle(page); }],
      ['sync-moved-item', '/coach/calendar?view=schedule', async (page) => { await movedInGoogle(page); await page.locator('.cc-sched-row', { hasText: 'Ruth Adeyemi' }).first().click(); await settle(page, 700); }, { expects: ['panel'] }],
      ['sync-moved-brief', '/coach', async (page) => { await movedInGoogle(page); await page.locator('.cc-callbar .cc-inline-link').click(); await settle(page, 900); }, { expects: ['panel'] }],
      ['sync-moved-session', '/coach', async (page) => {
        const id = await movedInGoogle(page);
        await page.evaluate((to) => { window.history.pushState({}, '', to); window.dispatchEvent(new PopStateEvent('popstate')); }, `/coach/sessions/${id}`);
        await page.waitForSelector('.cc-ses', { timeout: 10000 }); await settle(page, 600);
      }, { full: true }],
      ['sync-settings-standins', '/coach/settings/calendars', async (page) => { await page.getByRole('switch', { name: 'Use a stand-in Google Calendar' }).click(); await page.getByRole('switch', { name: 'Use a stand-in Zoom' }).click(); await settle(page, 2500); }, { full: true }],
    ],
  },
  // Help that can be hidden, walked once for each role, size and mode (rules.mjs's hiddenHelp does the walking).
  { name: 'help', at: TUE, screens: [['help-hidden', '/coach/todos', null, { expects: ['help-flow'] }]] },
  {
    name: 'client', roles: ['client'], root: '.ui-root',
    screens: [
      ['coaching', '/coaching', null, { full: true }],
      ['coaching-add', '/coaching', async (page) => { await page.getByRole('button', { name: /^Add to my backlog: Book a 15-minute/ }).click(); await settle(page, 900); }, { expects: ['panel'] }],
      ['coaching-nothing', '/coaching', null, { data: () => fromCoach({ nothing: true }) }],
      ['coaching-home', '/welcome', async (page) => { const line = page.locator('.ds-quiet-row').filter({ hasText: 'has sent something for you' }).first(); if (await line.count()) await line.scrollIntoViewIfNeeded(); }],
      // Run 3: the client's own sessions (with 051: book, move inside 24 hours, cancel; before it: one calm line).
      ['coaching-book', '/coaching', async (page) => { await page.getByRole('button', { name: 'Book a session', exact: true }).click(); await settle(page, 700); await page.locator('.coaching-times .ds-answer').first().click(); await settle(page, 300); }, { full: true }],
      ['coaching-move-late', '/coaching', async (page) => { await page.getByRole('button', { name: /^Move the session/ }).first().click(); await settle(page, 700); }, { full: true }],
      ['coaching-cancel', '/coaching', async (page) => { await page.getByRole('button', { name: /^Cancel the session/ }).last().click(); await settle(page, 400); }, { full: true }],
      // Last: "not yet" is remembered on the device for an hour, so every screen after it would show the calm line.
      ['coaching-not-yet', '/coaching', null, { full: true, data: () => ({ ...fromCoach(), sessions: undefined }) }],
    ],
  },
];

// The booking pages outside the portal (run 3, step 4), signed out: 051's functions are answered by book-standin.mjs from M11's
// seeded week, on M11's own Tuesday. Nothing reaches the test project, and no email is asked for that would send.
const bookAt = async (page) => { await pick(page, 'Your time zone', 'New York'); await settle(page, 300); };
GROUPS.push({
  name: 'public', roles: ['signed-out'], root: '.ui-root', at: TUE,
  screens: [
    ['bpage', `/book/${CAL.chemKey}`, bookAt],
    ['bpage-time', `/book/${CAL.chemKey}`, async (page) => { await bookAt(page); await page.locator('.cc-book-time').nth(1).click(); await settle(page, 500); }, { full: true }],
    ['bpage-needs', `/book/${CAL.chemKey}`, async (page) => { await bookAt(page); await page.locator('.cc-book-time').first().click(); await settle(page, 300); await page.locator('.cc-book-form .ds-btn--primary').click(); await settle(page, 300); }, { full: true }],
    ['bpage2', `/book/${CAL.chemKey}`, async (page) => { await bookAt(page); await press(page, 'Show my calendar'); await settle(page, 500); }, { full: true }],
    ['bpage-booked', `/book/${CAL.chemKey}`, async (page) => { await bookAt(page); await page.locator('.cc-book-time').first().click(); await settle(page, 300); await page.getByLabel('Your name').fill('Grace Liu'); await page.getByLabel('Your email').fill('grace@example.invalid'); await page.getByLabel('What would you like from the call?').fill('To think through a new role.'); await page.locator('.cc-book-form .ds-btn--primary').click(); await settle(page, 900); }, { full: true }],
    ['bpage-connection', `/book/${CAL.connKey}`, null],
    ['bpage-link', `/book/link/${CAL.linkDanaKey}`, null],
    ['bpage-nobody', '/book/00000000-0000-4000-8000-00000000dead', null],
    ['bpage-not-yet', `/book/${CAL.chemKey}`, null, { there: false }],
    ['bmine', `/book/mine/${CAL.bookNadiaKey}`, null],
    ['bmine-move', `/book/mine/${CAL.bookNadiaKey}`, async (page) => { await press(page, 'Move it'); await settle(page, 700); }, { full: true }],
    ['bmine-cancel', `/book/mine/${CAL.bookNadiaKey}`, async (page) => { await press(page, 'Cancel it'); await settle(page, 300); }],
    ['poll-vote', `/poll/${CAL.pollMiaKey}`, null],
  ],
});

// The sign-in pages, signed out: the coach header's rule for the body must change nothing on them.
GROUPS.push({ name: 'signin', roles: ['signed-out'], root: '.ui-root', screens: [['sign-in', '/auth/login'], ['coach-sign-in', '/coach/sign-in']] });

const optionsOf = (opt) => (typeof opt === 'string' ? { roles: [opt] } : opt || {});
const fulfil = (body) => (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : route.fallback());

/** Opens a group's page for one role, size and mode: signed in, standing in, its clock pinned and its seed on the device. */
async function openGroup(browser, group, { role, size, theme, reducedMotion }) {
  const errors = [];
  if (group.name === 'client') {
    const ctx = await clientContext(browser, { size, theme, reducedMotion });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    const held = { data: fromCoach() };
    // The stand-in reads whatever the screen asked for (held.data is swapped by a screen's `data`).
    const proxy = new Proxy({}, { get: (_, k) => held.data[k], set: (_, k, v) => { held.data[k] = v; return true; } });
    const stood = await clientStandIn(page, proxy);
    await page.goto(`${APP}/coaching`);
    await page.waitForSelector('.ui-root', { timeout: 20000 });
    await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
    await clearCoaching(page);
    return {
      page, errors, held, wait: '.ui-root',
      close: async () => {
        const stray = stood.blocked.filter((b) => !/person_settings/.test(b));
        const problems = [...new Set(errors)].map((e) => `client ${size} ${theme}: ${e}`);
        if (stray.length) problems.push(`client ${size} ${theme}: a write left the page (stopped): ${[...new Set(stray)].slice(0, 4).join('; ')}`);
        await clearCoaching(page, { after: true });
        await ctx.close();
        return problems;
      },
    };
  }
  if (group.name === 'public') {
    // Nobody is signed in: 051's functions are answered from a database made here, and anything else is stopped and listed.
    seedClock(group.at || null);
    const ctx = await browser.newContext({ viewport: SIZES[size], colorScheme: theme, serviceWorkers: 'block', reducedMotion, hasTouch: size === 400 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    if (group.at) await page.clock.setFixedTime(group.at);
    const held = { store: null };
    const stopped = [];
    const fresh = (there = true) => { held.store = Object.assign(held.store || {}, bookStore(seedWithCal({ accounts: true }), { now: () => group.at || new Date() }), { there, blocked: stopped }); return held.store; };
    await guestStandIn(page, fresh());
    return {
      page, errors, wait: '.ui-root', fresh,
      close: async () => { const stray = held.store.blocked || []; await ctx.close(); return [...new Set(errors)].map((e) => `signed out ${size} ${theme}: ${e}`).concat(stray.length ? [`signed out ${size} ${theme}: a write left the page (stopped): ${[...new Set(stray)].slice(0, 4).join('; ')}`] : []); },
    };
  }
  if (group.name === 'signin') {
    // Nobody is signed in, nothing is typed, and no request but a read leaves the page.
    const ctx = await browser.newContext({ viewport: SIZES[size], colorScheme: theme, serviceWorkers: 'block', reducedMotion, hasTouch: size === 400 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
    await page.route('**/rest/v1/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })));
    return { page, errors, wait: '.ui-root', close: async () => { await ctx.close(); return [...new Set(errors)].map((e) => `signed out ${size} ${theme}: ${e}`); } };
  }
  const ctx = await coachContext(browser, { size, theme, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  const device = group.name !== 'run1';
  const there = !device && role === 'owner';
  seedClock(group.at || null);
  if (group.at) await page.clock.setFixedTime(group.at);
  const store = await standIn(page, { role, db: there ? 'there' : 'none', rows: there ? seedRows() : {}, admin: there ? ADMIN_ROWS() : [] });
  if (device) {
    const user = (route) => (new URL(route.request().url()).searchParams.get('user_id') || '').replace(/^(eq\.|in\.\(|\))/g, '').replace(/\)$/, '');
    // The portal's own questions on sign-in are answered with nothing, so none is stopped mid-way and none reaches the database.
    await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
    if (group.shares === 'sessions') {
      await page.route('**/rest/v1/peak_moments*', (route) => fulfil(user(route).includes(SES.samUser) ? SHARED.moments(SES.samUser) : [])(route));
      await page.route('**/rest/v1/session_prep*', (route) => fulfil(user(route) === SES.samUser ? SHARED.prep() : null)(route));
      await page.route('**/rest/v1/week_scores*', (route) => fulfil(user(route) === SES.samUser ? SHARED.weekScores() : [])(route));
      await page.route('**/rest/v1/peak_reviews*', (route) => fulfil(user(route) === SES.samUser ? SHARED.reviews() : [])(route));
      await page.route('**/rest/v1/checkins*', (route) => fulfil(user(route) === SES.priyaUser ? SHARED.checkins() : [])(route));
    } else await page.route('**/rest/v1/peak_moments*', fulfil(PRESSURE.moments()));
    // The access codes' table (026): a stand-in that keeps what it is given, so nothing reaches the test project.
    const codes = [];
    await page.route('**/rest/v1/organisation_access_codes*', (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const org = (url.searchParams.get('organisation_id') || '').replace('eq.', '');
      const answer = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'GET') return answer(codes.filter((r) => r.organisation_id === org && !r.switched_off_at).map((r) => ({ id: r.id })));
      if (req.method() === 'POST') { codes.push({ switched_off_at: null, ...req.postDataJSON() }); return answer([], 201); }
      if (req.method() === 'PATCH') { const not = (url.searchParams.get('id') || '').replace('neq.', ''); for (const r of codes) if (r.organisation_id === org && !r.switched_off_at && r.id !== not) Object.assign(r, req.postDataJSON()); return answer([]); }
      return route.abort();
    });
    if (group.init) await page.addInitScript(group.init);
  }
  await page.goto(`${APP}/coach`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  const me = await accountId(page);
  await page.evaluate((t) => localStorage.setItem('clarity-colour-mode', t), theme);
  await clearDevice(page, me);
  if (device) {
    const rows = (group.cal ? seedWithCal : seedWithDay)({ accounts: true, ...(typeof group.seed === 'object' && group.seed ? group.seed : {}) });
    await seedDevice(page, me, typeof group.seed === 'function' ? group.seed(rows) : rows);
  } else if (!there) await seedDevice(page, me, seedRows());
  return {
    page, errors, store, me, wait: '.cc-app',
    close: async () => {
      const problems = [...new Set(errors)].map((e) => `${role} ${size} ${theme}: ${e}`);
      const blocked = device ? store.calls.filter((c) => c.startsWith('blocked')) : [];
      if (blocked.length) problems.push(`${role} ${size} ${theme}, ${group.name}: a write left the page (stopped): ${[...new Set(blocked)].slice(0, 4).join('; ')}`);
      await clearDevice(page, me);
      await ctx.close();
      return problems;
    },
  };
}

/**
 * Opens every screen and hands it to `visit(page, { name, role, size, theme, group, run, root, expects, full })`.
 * ONLY (a pattern on the screen's name), GROUPS (names), SIZES, MODES and ROLES narrow it.
 * `twice`: every screen is opened at twice the standard text size.
 * Resolves the problems met on the way (a screen that didn't open, a page error, a write that was stopped).
 */
export async function walk(visit, { reducedMotion = 'reduce', twice = false, groups = null } = {}) {
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const wanted = process.env.GROUPS ? process.env.GROUPS.split(',') : groups;
  const sizes = (process.env.SIZES || '1440,768,400').split(',').map(Number);
  const modes = (process.env.MODES || 'dark,light').split(',');
  const roles = (process.env.ROLES || 'owner,associate,client,signed-out').split(',');
  const browser = await chromium.launch();
  const problems = [];
  try {
    for (const role of roles) {
      for (const size of sizes) {
        for (const theme of modes) {
          for (const group of GROUPS) {
            if (wanted && !wanted.includes(group.name)) continue;
            if (!(group.roles || ['owner', 'associate']).includes(role)) continue;
            const screens = group.screens.filter(([name, , , opt]) => {
              const o = optionsOf(opt);
              return (!only || only.test(name)) && (!o.roles || o.roles.includes(role)) && (!o.sizes || o.sizes.includes(size));
            });
            if (!screens.length) continue;
            const t = await openGroup(browser, group, { role, size, theme, reducedMotion });
            for (const [name, path, act, opt] of screens) {
              const o = optionsOf(opt);
              if (o.data && t.held) t.held.data = o.data(); else if (t.held) t.held.data = fromCoach();
              if (t.fresh) t.fresh(o.there !== false); // each public screen starts from the seed again (a booking made on one never shows on the next)
              await t.page.setViewportSize(o.viewport || SIZES[size]);
              try {
                await t.page.goto(`${APP}${path}`);
                await t.page.waitForSelector(t.wait, { timeout: 20000 });
                if (twice) await t.page.addStyleTag({ content: 'html{font-size:32px !important}' });
                await settle(t.page, group.name === 'run1' ? 900 : 1200);
              } catch (e) { t.errors.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`); continue; }
              let skipped = null;
              try { if (act) skipped = await act(t.page, size); } catch (e) { t.errors.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`); }
              if (skipped === 'skip') continue;
              await visit(t.page, { name, role, size, theme, group: group.name, run: group.name === 'run1' ? 1 : 2, root: group.root || '.cc-app', expects: o.expects || [], full: Boolean(o.full) });
            }
            problems.push(...await t.close());
          }
        }
      }
    }
  } finally {
    await browser.close();
    seedClock(null);
  }
  return problems;
}

/**
 * A picture of the screen as it stands. A panel is pictured as the screen
 * shows it. A long page (`full`) is pictured whole by making the window as
 * tall as the page for a moment, so the header stays at the top and a
 * bottom bar at the foot, where they are on a real screen.
 */
export async function picture(page, path, full = false) {
  const panel = await page.evaluate(() => [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].some((d) => d.getBoundingClientRect().width > 0));
  if (!full || panel) { await page.screenshot({ path }); return; }
  const was = page.viewportSize();
  const at = await page.evaluate(() => { const y = window.scrollY; window.scrollTo({ top: 0, behavior: 'instant' }); return y; });
  const high = await page.evaluate(() => document.documentElement.scrollHeight);
  if (high > was.height) { await page.setViewportSize({ width: was.width, height: Math.min(high, 9000) }); await settle(page, 250); }
  await page.screenshot({ path });
  if (high > was.height) { await page.setViewportSize(was); await settle(page, 250); }
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), at);
}

/** Opens one screen by its name on a page already signed in and standing in (for the M11 comparison). */
export async function openScreen(page, name, size = 1440) {
  const screen = GROUPS.flatMap((g) => g.screens).find(([n]) => n === name);
  if (!screen) throw new Error(`No screen called ${name}`);
  const [, path, act] = screen;
  await page.goto(`${APP}${path}`);
  await page.waitForSelector('.cc-app', { timeout: 20000 });
  await settle(page, 900);
  if (act) await act(page, size);
}
