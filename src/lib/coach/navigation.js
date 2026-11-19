// The coach portal's map (Phase 6a runs 1 and 2; M11's menu screen): its pages, in
// the menu's order, for the owner and for an associate. `owner`: only the
// owner has it. `later`: its page comes in a later run of Phase 6a (or in
// 6b or 6c); until then it shows on previews only, and opens the calm
// "Coming in this build" page.

export const COACH_MENU = [
  { key: 'today', label: 'Today', to: '/coach' },
  { key: 'finances', label: 'Finances', to: '/coach/finances', owner: true, later: true },
  { key: 'todos', label: 'To-dos', to: '/coach/todos' },
  { key: 'clients', label: 'Clients', to: '/coach/clients' },
  { key: 'leads', label: 'Leads', to: '/coach/leads', owner: true, later: true },
  { key: 'network', label: 'Network', to: '/coach/network', owner: true, later: true },
  { key: 'boards', label: 'Boards', to: '/coach/boards', owner: true, later: true },
  { key: 'calendar', label: 'Calendar', to: '/coach/calendar', later: true },
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
  { key: 'away', label: 'Away and cover' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'booking', label: 'Booking', wired: false },
  { key: 'hours', label: 'Working hours', wired: false },
  { key: 'zones', label: 'Time zones', wired: false },
  { key: 'calendars', label: 'My calendars', wired: false },
  { key: 'email', label: 'Email', owner: true, wired: false },
  { key: 'tags', label: 'Tags and fields' },
  { key: 'layouts', label: 'Note layouts', owner: true, wired: false },
  { key: 'coaches', label: 'Coaches', owner: true },
  { key: 'log', label: 'Activity log', owner: true },
  { key: 'look', label: 'Look' },
];

export const COACH_NAME = 'Clarity Coach';

const TITLES = [
  ['/coach/clients/past', 'Past clients'],
  ['/coach/clients', 'Clients'],
  ['/coach/groups', 'Group'],
  ['/coach/workshops', 'Workshop'],
  ['/coach/organisations', 'Organisation'],
  ['/coach/settings', 'Settings'],
  ['/coach/todos', 'To-dos'],
  ['/coach/sessions', 'After a call'],
  ['/coach/renewals', 'Renewal'],
  ...COACH_MENU.filter((i) => i.later).map((i) => [i.to, i.label]),
];

/** The browser tab's title for a coach page: the page's name, then Clarity Coach. */
export function coachTitle(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '');
  if (path === '/coach') return `Today, ${COACH_NAME}`;
  const hit = TITLES.find(([p]) => path === p || path.startsWith(`${p}/`));
  return hit ? `${hit[1]}, ${COACH_NAME}` : COACH_NAME;
}
