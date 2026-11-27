// The coach portal's map (Phase 6a runs 1 and 2; M11's menu screen): its pages, in
// the menu's order, for the owner and for an associate. `owner`: only the
// owner has it. `later`: its page comes in a later run of Phase 6a (or in
// 6b or 6c); until then it shows on previews only, and opens the calm
// "Coming in this build" page.
// `shared`: the owner's, and an associate's only once the owner has shared
// something there with them (Boards: run 4).
// `off`: switched off for now (Tim's walk of Stage C, 27 Nov, item 1: Boards, until after go-live): out of the menu,
// search and every page, its addresses sent to Leads; its code and saved boards are kept, so BOARDS_ON brings it back.

/** Boards, switched off until after go-live (walk of Stage C, item 1). True brings back its menu item, search and pages. */
export const BOARDS_ON = false;

export const COACH_MENU = [
  { key: 'today', label: 'Today', to: '/coach' },
  { key: 'finances', label: 'Finances', to: '/coach/finances', owner: true },
  // Polish 1, Stage C (M28 v6 "needs"): every drafted next step as its own page, in the Finances group.
  { key: 'needs-you', label: 'Needs you', to: '/coach/needs-you' },
  { key: 'todos', label: 'To-dos', to: '/coach/todos' },
  { key: 'clients', label: 'Clients', to: '/coach/clients' },
  { key: 'leads', label: 'Leads', to: '/coach/leads', owner: true },
  { key: 'network', label: 'Network', to: '/coach/network', owner: true },
  { key: 'boards', label: 'Boards', to: '/coach/boards', shared: true, off: !BOARDS_ON },
  { key: 'calendar', label: 'Calendar', to: '/coach/calendar' },
  { key: 'leading-ideas', label: 'Leading Ideas', to: '/coach/leading-ideas', later: true },
  { key: 'library', label: 'Library', to: '/coach/library', later: true },
  { key: 'settings', label: 'Settings', to: '/coach/settings' },
];

export const COACH_PAGES = COACH_MENU;

// Settings' sections, in M11's order. Associates never see Email, Tags and
// fields, Note layouts, Coaches or the Activity log. `wired: false`: its rows
// and storage are here now, and a later run puts them to work.
export const SETTINGS_SECTIONS = [
  { key: 'you', label: 'Your details' },
  // Stage D, item 13 (Tim, 27 Nov): the authenticator and recovery codes, in the coach frame (was My Account's).
  { key: 'sign-in-security', label: 'Sign-in security' },
  { key: 'away', label: 'Away and cover' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'booking', label: 'Booking' },
  { key: 'hours', label: 'Working hours' },
  { key: 'zones', label: 'Time zones' },
  { key: 'calendars', label: 'My calendars' },
  // Phase 6b run 3 (M28 s-packages): packages, standard wording, extras, your signature and talking points.
  { key: 'agreements', label: 'Agreements' },
  // Polish 1, Stage C (C5, migration 068): company name and number, website, email and bank details for the PDFs.
  { key: 'business', label: 'Business', owner: true },
  { key: 'email', label: 'Email', owner: true, wired: false },
  { key: 'tags', label: 'Tags and fields' },
  { key: 'layouts', label: 'Note layouts', owner: true, wired: false },
  { key: 'coaches', label: 'Coaches', owner: true },
  { key: 'log', label: 'Activity log', owner: true },
  // Stage D, item 12: "Look" is Appearance (its old address, /coach/settings/look, lands here).
  { key: 'appearance', label: 'Appearance' },
];

export const COACH_NAME = 'Clarity Coach';

// Pages named by their address's end (Phase 6b run 3): read before TITLES, whose matches are by the start.
const ENDINGS = [
  [/^\/coach\/organisations\/[^/]+\/billing$/, 'Billing'],
  [/^\/coach\/organisations\/[^/]+\/invoices\/new$/, 'New invoice'],
  [/^\/coach\/agreements\/new$/, 'New agreement'],
  [/^\/coach\/agreements\/[^/]+\/edit$/, 'Agreement builder'],
  [/^\/coach\/agreements\/[^/]+\/clauses(\/[^/]+)?$/, 'Clauses'],
  [/^\/coach\/agreements\/[^/]+\/check$/, 'Check before sending'],
  [/^\/coach\/agreements\/[^/]+\/preview$/, 'Preview the agreement'],
  [/^\/coach\/agreements\/[^/]+\/sign$/, 'Sign and send'],
  [/^\/coach\/agreements\/[^/]+\/hours$/, 'Hours log'],
  [/^\/coach\/agreements\/[^/]+\/sent$/, 'Sent'],
  [/^\/coach\/settings\/agreements\/wording(\/.*)?$/, 'Standard wording'],
];

const TITLES = [
  ['/coach/agreements', 'Agreement'],
  ['/coach/what-to-say', 'What to say'],
  ['/coach/invoices', 'Invoice'],
  ['/coach/clients/past', 'Past clients'],
  ['/coach/leads/cold', 'Cold leads'],
  ['/coach/leads/automations', 'Automations'],
  ['/coach/leads/reports', 'Lead reports'],
  ['/coach/leads', 'Leads'],
  ['/coach/network', 'Network'],
  ['/coach/boards', 'Boards'],
  ['/coach/clients', 'Clients'],
  ['/coach/groups', 'Group'],
  ['/coach/workshops', 'Workshop'],
  ['/coach/organisations', 'Organisation'],
  ['/coach/settings', 'Settings'],
  ['/coach/todos', 'To-dos'],
  ['/coach/sessions', 'After a call'],
  ['/coach/renewals', 'Renewal'],
  ['/coach/calendar/open', 'Open for calls'],
  ['/coach/calendar/polls', 'Poll'],
  ['/coach/calendar', 'Calendar'],
  ['/coach/finances', 'Finances'],
  ['/coach/needs-you', 'Needs you'],
  ...COACH_MENU.filter((i) => i.later).map((i) => [i.to, i.label]),
];

/** The browser tab's title for a coach page: the page's name, then Clarity Coach. */
export function coachTitle(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '');
  if (path === '/coach') return `Today, ${COACH_NAME}`;
  const ending = ENDINGS.find(([re]) => re.test(path));
  if (ending) return `${ending[1]}, ${COACH_NAME}`;
  const hit = TITLES.find(([p]) => path === p || path.startsWith(`${p}/`));
  return hit ? `${hit[1]}, ${COACH_NAME}` : COACH_NAME;
}

/**
 * The menu's pages for one coach: an associate never has the owner's pages, and has a shared page only when something
 * there is shared with them. A page still to come (`later`: Leading Ideas and the Library, Phase 6c) and one switched
 * off (`off`: Boards) are in no menu and no search, on previews too (walk of Stage C, items 1 and 23); a page still to
 * come keeps its "Coming in this build" address on previews.
 */
export const menuFor = ({ isOwner, hasShared = false } = {}) => COACH_MENU.filter((i) => !i.off && !i.later && (!i.owner || isOwner) && (!i.shared || isOwner || hasShared));

/**
 * The coach portal's menu in the frame (25 Nov design reference and example pages, "Coach: Today"; polish 1, rule 19):
 * groups separated by gaps, not names, in Tim's order (walk of Stage C, item 2): Today, Calendar, To-dos, Needs you;
 * Clients, Leads, Network (and Boards once it is on); Finances, Leading Ideas, Library (once they are built). The
 * coach's own to-do lists under To-dos and favourite views as a last group; Settings in the foot.
 * `pathname` marks the page the coach is on.
 */
export const COACH_MENU_GROUPS = [['today', 'calendar', 'todos', 'needs-you'], ['clients', 'leads', 'network', 'boards'], ['finances', 'leading-ideas', 'library']];

export function coachFrameMenu({ isOwner, live = false, hasShared = false, pathname = '', lists = [], favourites = [] }) {
  const items = menuFor({ isOwner, live, hasShared });
  const current = (to) => (to === '/coach' ? pathname === '/coach' || pathname === '/coach/' : pathname === to || pathname.startsWith(`${to}/`));
  const row = (i) => ({ key: i.key, name: i.label, to: i.to, current: i.key === 'todos' ? pathname === i.to : current(i.to) });
  const placed = new Set(COACH_MENU_GROUPS.flat());
  const groups = COACH_MENU_GROUPS.map((keys, n) => {
    const rows = [];
    const inGroup = items.filter((i) => keys.includes(i.key) || (n === COACH_MENU_GROUPS.length - 1 && !placed.has(i.key) && i.key !== 'settings'));
    const at = (k) => (keys.includes(k) ? keys.indexOf(k) : keys.length);
    inGroup.sort((a, b) => at(a.key) - at(b.key));
    for (const i of inGroup) {
      rows.push(row(i));
      if (i.key === 'todos') lists.forEach((l) => rows.push({ key: `list-${l.id}`, name: l.name, to: `/coach/todos/lists/${l.id}`, current: pathname === `/coach/todos/lists/${l.id}` }));
    }
    return rows;
  });
  const fav = favourites.map((v) => ({ key: `view-${v.id}`, name: v.name, to: `/coach/${v.list === 'leads' ? 'leads' : 'clients'}?view=${v.id}` }));
  const settings = items.find((i) => i.key === 'settings') || { key: 'settings', label: 'Settings', to: '/coach/settings' };
  return { groups: fav.length ? [...groups, fav] : groups, foot: [row(settings)] };
}
