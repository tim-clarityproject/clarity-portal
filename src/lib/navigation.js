import pageText from '../content/pageText';

// The portal's map (mock-up M3, approved 23 Oct; Phase 4 step 1): the
// menu's areas, the hub pages and the tools on them. The menu never lists
// tools: each area opens a hub of type-only tiles, the tool's name, one
// line on how it helps and how long it takes.
//
// Only tools that exist get a tile (brief, step 1). A tool not rebuilt yet
// opens its current page under its new name and its new address (step 5;
// the old addresses redirect, RENAMED below). The Dashboard joined Personal
// in Phase 5 step 2, as its first big tile. Not built yet, so no tile: Find my sweet spot, Deliberate vs default, Travel
// and jet lag plan, Delegation audit, Emotional wash, Identity beyond the
// role, Stay deliberate under pressure,
// Confidence Bank, Prepare for a difficult conversation, Prepare for
// a pitch, Map my stakeholders, Map my team, Understand their sweet spot,
// Decide who decides, Strategy on a page and Pre-mortem for an initiative.
// The Team performance check joined Interpersonal in Phase 8a step 3 (M10),
// under "Your team" (Claude's call: M3 has no group for it).
// Sleep wind down joined Reset in step 6 (M19), second, marked New for its
// first two weeks (`newUntil`). The Hardware and Software check-in joined
// Review in Phase 5 step 1, last, so M3's own order is kept. Points of leverage is removed
// (Tim, 2 Nov): no tile anywhere, and its address goes to Strategic.
//
// Tiles are in the order M3 shows. Later, most used first, from private
// usage counts.

/**
 * Every tool with a tile. `routes` are the addresses that belong to it,
 * so the menu can mark the area someone is in.
 */
export const TOOLS = {
  // The Individual Performance Dashboard (Phase 5 step 2): Personal's
  // first big tile, "Dashboard" (writing rule 38; M3 AREA.dash).
  dash: {
    name: 'Individual Performance Dashboard',
    short: 'Dashboard',
    line: 'See what’s working, week by week.',
    to: '/dashboard',
    routes: ['/dashboard'],
  },
  ipp: {
    name: 'Individual Performance Plan',
    line: 'Say what you’re aiming for and how you’ll get there.',
    to: '/performance-plan',
    routes: ['/performance-plan', '/personal-operating-plan', '/onboarding-mission', '/mission-progress-review'],
  },
  sprint: {
    name: 'Performance Sprint',
    line: 'Do the work, week by week.',
    to: '/performance-sprint',
    routes: ['/performance-sprint', '/recovery'],
  },
  pmd: {
    name: 'Daily plan',
    line: 'Choose what matters most today.',
    // One time for the tile, Home's card and the tool (Tim, 10 Nov: they never disagree).
    time: '~4 minutes',
    to: '/daily-plan',
    routes: ['/daily-plan', '/my-day/plan', '/plan-my-day', '/daily-plan-summary'],
  },
  grow: {
    name: 'Get unstuck',
    line: 'Turn a goal or a decision into next steps you’ll take.',
    time: '~15 minutes',
    to: '/get-unstuck',
    routes: ['/get-unstuck'],
  },
  inv: {
    name: 'Pre-mortem',
    line: 'Test a plan by imagining it went wrong.',
    time: '~10 minutes',
    to: '/pre-mortem',
    routes: ['/pre-mortem'],
  },
  time: {
    name: 'Time audit',
    line: 'See where your time goes and free some up.',
    time: '~10 minutes',
    to: '/time-audit',
    routes: ['/time-audit'],
  },
  breathe: {
    name: 'Breathe',
    line: 'Slow your breathing to settle your body.',
    time: '1, 3 or 5 minutes',
    to: '/breathe',
    routes: ['/breathe', '/breathing-sessions-summary'],
  },
  wind: {
    name: 'Sleep wind down',
    line: 'Clear your head before bed, so you sleep well and perform tomorrow.',
    time: '~6 minutes',
    to: '/sleep-wind-down',
    routes: ['/sleep-wind-down'],
    // M19: New for its first two weeks. CHOICE: two weeks from go-live
    // (27 Nov), so until Fri 11 Dec 2026.
    newUntil: '2026-12-11',
  },
  pp: {
    name: 'Pressure plan',
    line: 'Get ready for a high-pressure moment.',
    time: '~8 minutes',
    to: '/pressure-plan',
    routes: ['/pressure-plan'],
  },
  journal: {
    name: 'Journal',
    line: 'Clear your head.',
    time: 'As long as you like',
    to: '/daily-journal',
    routes: ['/daily-journal'],
  },
  rmd: {
    name: 'Daily review',
    line: 'Learn from today so tomorrow goes better.',
    time: '~5 minutes',
    to: '/daily-review',
    routes: ['/daily-review', '/my-day/review', '/review-plan', '/review-summary'],
  },
  debrief: {
    name: 'Weekly performance debrief',
    line: 'Close the week and set up the next one.',
    time: '~5 minutes',
    to: '/performance-sprint/debrief',
    routes: ['/performance-sprint/debrief'],
  },
  aar: {
    name: 'After-action review',
    line: 'Learn from one event while it’s fresh.',
    time: '~5 minutes',
    to: '/my-journal',
    state: { reviewType: 'after-action' },
    routes: ['/my-journal'],
  },
  lbr: {
    name: 'Life balance review',
    line: 'Check the rest of your life is backing your performance.',
    time: '~6 minutes',
    to: '/life-balance-review',
    routes: ['/life-balance-review'],
  },
  check: {
    name: 'Monthly Hardware and Software review',
    short: 'Monthly review',
    line: 'Check your body and mind are backing your performance.',
    time: '~3 minutes',
    to: '/monthly-review',
    routes: ['/monthly-review', '/check-in'],
  },
  meet: {
    name: 'Meeting planner',
    line: 'Plan a meeting so it gets the result you need.',
    time: '~8 minutes',
    to: '/plan-meeting',
    routes: ['/plan-meeting', '/meeting-summary'],
  },
  fb: {
    name: 'Give difficult feedback',
    line: 'Give hard feedback clearly and fairly.',
    time: '~8 minutes',
    to: '/give-difficult-feedback',
    routes: ['/give-difficult-feedback'],
  },
  // The Team performance check (M10, version 5.6; Phase 8a step 3): trust,
  // alignment and autonomy for each direct report. M10 gives no time: three
  // one-tap questions a person, so ~5 minutes for a team of five (Claude's call).
  team: {
    name: 'Team performance check',
    line: 'See where each of your people stands and what to ask next.',
    time: '~5 minutes',
    to: '/team-performance-check',
    routes: ['/team-performance-check'],
  },
  hc: {
    name: 'Strategic Alignment Health Check',
    line: 'See whether your team’s work matches its strategy.',
    time: '~15 minutes',
    to: '/goal-setting',
    routes: ['/goal-setting', '/risks-assessment', '/strategies', '/critical-success-factors', '/project-'],
  },
};

/**
 * The hub pages. Their ⓘ words are in src/content/pageText.js (rule 7).
 * Each ⓘ starts with one full sentence saying what the
 * area is (Tim, 2 Nov). The "most used move up" lines in M3 are left out
 * until the tiles really do move. `recent`: the last three saved items at
 * the foot of Plan, Review and Interpersonal (M3), from My Plans or My
 * Reviews in that area, with a link to the whole list filtered to it.
 * Reset has none, so journal entries never show on a shared screen.
 */
export const HUBS = {
  personal: {
    title: 'Personal',
    path: '/personal',
    area: 'personal',
    info: pageText.hubPersonal,
    // The Dashboard first (M3 H.personal.big), then the three hubs.
    tool: 'dash',
    areas: ['plan', 'reset', 'review'],
  },
  plan: {
    title: 'Plan',
    path: '/personal/plan',
    area: 'personal',
    up: 'personal',
    line: 'Set your direction and decide well.',
    info: pageText.hubPlan,
    groups: [
      { tools: ['ipp', 'sprint', 'pmd'] },
      { title: 'Decide', tools: ['grow', 'inv', 'time'] },
    ],
    recent: { list: 'plans', area: 'personal', title: 'My Plans', to: '/my-plans?area=personal' },
  },
  reset: {
    title: 'Reset',
    path: '/personal/reset',
    area: 'personal',
    up: 'personal',
    line: 'Get back to your best when the pressure is on.',
    info: pageText.hubReset,
    groups: [{ tools: ['breathe', 'wind', 'pp', 'journal'] }],
  },
  review: {
    title: 'Review',
    path: '/personal/review',
    area: 'personal',
    up: 'personal',
    line: 'Turn what happened into better performance.',
    info: pageText.hubReview,
    groups: [{ tools: ['rmd', 'debrief', 'aar', 'lbr', 'check'] }],
    recent: { list: 'reviews', area: 'personal', title: 'My Reviews', to: '/my-reviews?area=personal' },
  },
  interpersonal: {
    title: 'Interpersonal',
    path: '/interpersonal',
    area: 'interpersonal',
    info: pageText.hubInterpersonal,
    groups: [
      { title: 'Meetings and conversations', tools: ['meet', 'fb'] },
      { title: 'Your team', tools: ['team'] },
    ],
    recent: { list: 'plans', area: 'interpersonal', title: 'My Plans', to: '/my-plans?area=interpersonal' },
  },
  strategic: {
    title: 'Strategic',
    path: '/strategic',
    area: 'strategic',
    anchor: 'hc',
    info: pageText.hubStrategic,
    groups: [],
  },
};

/** "New" on a tool's tile while it is new (M19: in the text colour, never coral or mint). */
export function isNewTool(key, today) {
  const until = TOOLS[key]?.newUntil;
  return Boolean(until && today && today <= until);
}

/** The number of tools a hub holds, for Personal's big tiles ("6 tools"). */
export function toolCount(hubKey) {
  const hub = HUBS[hubKey];
  const n = (hub.groups || []).reduce((sum, g) => sum + g.tools.length, 0) + (hub.anchor ? 1 : 0);
  return `${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/**
 * The menu's areas (M3). Home is in the desktop menu only; the phone has
 * Home on its bar. The Strategic line leaves out "leverage" (removed, Tim,
 * 2 Nov). Personal names the Dashboard since Phase 5 (M3: "Dashboard,
 * plan, reset, review").
 */
export function menuAreas(coachName) {
  return [
    { key: 'home', name: 'Home', line: 'Today', to: '/welcome', desktopOnly: true },
    { key: 'personal', name: 'Personal', line: 'Dashboard, plan, reset, review', to: '/personal' },
    { key: 'interpersonal', name: 'Interpersonal', line: 'Meetings and conversations', to: '/interpersonal' },
    { key: 'strategic', name: 'Strategic', line: 'Health Check and strategy', to: '/strategic' },
    {
      key: 'account',
      name: 'My Account',
      line: coachName ? `Settings, coaching, chat to ${coachName}` : 'Settings and coaching',
      to: '/my-account',
    },
  ];
}

/**
 * The desktop menu (menu-options.html, option A, the slim panel; Tim, 9
 * Nov, 14:41): Home at the top, the hubs under two quiet group labels,
 * and My Account at the bottom, with Sign out below it. Pinned tools sit
 * above Home, as before. No Log today or Breathe in the menu: Log today
 * is on Home and Breathe has its own button.
 */
export const DESKTOP_MENU = {
  top: [{ key: 'home', name: 'Home', to: '/welcome' }],
  groups: [
    {
      title: 'Personal',
      items: [
        { key: 'dash', name: 'Dashboard', to: '/dashboard' },
        { key: 'plan', name: 'Plan', to: '/personal/plan' },
        { key: 'reset', name: 'Reset', to: '/personal/reset' },
        { key: 'review', name: 'Review', to: '/personal/review' },
      ],
    },
    {
      title: 'With others',
      items: [
        { key: 'interpersonal', name: 'Interpersonal', to: '/interpersonal' },
        { key: 'strategic', name: 'Strategic', to: '/strategic' },
      ],
    },
  ],
  foot: [{ key: 'account', name: 'My Account', to: '/my-account' }],
};

const AREA_ROUTES = {
  home: ['/welcome'],
  personal: ['/dashboard'],
  account: ['/my-account', '/edit-profile', '/about'],
};

function matches(pathname, route) {
  if (route.endsWith('-')) return pathname.startsWith(route);
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Which menu area a page belongs to (marked aria-current in the menu). */
export function areaOf(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const hub of Object.values(HUBS)) {
    if (path === hub.path) return hub.area;
  }
  for (const [area, routes] of Object.entries(AREA_ROUTES)) {
    if (routes.some((r) => matches(path, r))) return area;
  }
  for (const [hubKey, hub] of Object.entries(HUBS)) {
    const keys = [...(hub.groups || []).flatMap((g) => g.tools), ...(hub.anchor ? [hub.anchor] : [])];
    if (keys.some((k) => TOOLS[k].routes.some((r) => matches(path, r)))) return HUBS[hubKey].area;
  }
  if (['/my-plans', '/decision-history', '/decision-summary'].includes(path)) return 'personal';
  if (['/my-reviews', '/daily-journals'].some((r) => matches(path, r))) return 'personal';
  return null;
}

/**
 * Which row of the desktop menu a page belongs to (marked aria-current):
 * 'home', 'dash', a hub ('plan', 'reset', 'review', 'interpersonal',
 * 'strategic') for the hub itself and every tool on it, or 'account'.
 * The Personal hub page itself has no row of its own.
 */
export function menuCurrent(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (AREA_ROUTES.home.some((r) => matches(path, r))) return 'home';
  if (AREA_ROUTES.personal.some((r) => matches(path, r))) return 'dash';
  if (AREA_ROUTES.account.some((r) => matches(path, r))) return 'account';
  for (const key of ['plan', 'reset', 'review', 'interpersonal', 'strategic']) {
    const hub = HUBS[key];
    if (path === hub.path) return key;
    const keys = [...(hub.groups || []).flatMap((g) => g.tools), ...(hub.anchor ? [hub.anchor] : [])];
    if (keys.some((k) => TOOLS[k].routes.some((r) => matches(path, r)))) return key;
  }
  if (['/my-plans', '/decision-history', '/decision-summary'].includes(path)) return 'plan';
  if (['/my-reviews', '/daily-journals'].some((r) => matches(path, r))) return 'review';
  return null;
}

// Pages that aren't a hub or a tool's own page, by address (the longest
// match wins), for the browser tab.
const PAGE_NAMES = [
  // A guest's link (M9): the tab reads as the tool a guest link opens today.
  ['/guest', 'Get unstuck'],
  ['/welcome', 'Home'],
  ['/my-account', 'My Account'],
  ['/my-account/password', 'Password'],
  ['/my-account/email', 'Email'],
  // The sign-in pages (M26): each tab reads as its page's title.
  ['/auth/login', 'Sign in'],
  ['/auth/sign-up', 'Create your account'],
  ['/auth/check-email', 'Check your email'],
  ['/auth/confirmed', 'Email confirmed'],
  ['/auth/mission', 'Email confirmed'],
  ['/email-confirmation', 'Email confirmed'],
  ['/auth/google', 'Signing you in'],
  ['/auth/before-you-start', 'Before you start'],
  ['/auth/invite', 'Welcome'],
  ['/forgot-password', 'Reset your password'],
  ['/forgot-password/check-email', 'Check your email'],
  ['/auth/reset-password', 'New password'],
  ['/coach/sign-in', 'Coach sign in'],
  ['/coach/sign-in/code', 'Enter your code'],
  ['/coach/sign-in/help', 'Lost your authenticator app'],
  ['/edit-profile', 'My Account'],
  ['/about', 'About'],
  ['/my-plans', 'My Plans'],
  ['/my-reviews', 'My Reviews'],
  ['/daily-journals', 'Journal'],
  ['/performance-plan/build', 'Build my plan'],
  ['/performance-plan/edit', 'Edit my plan'],
  ['/performance-plan/history', 'Version history'],
  ['/performance-sprint/year', 'View your year'],
  ['/performance-sprint/debrief', 'Weekly performance debrief'],
  ['/performance-sprint/review', 'End-of-sprint review'],
  ['/performance-sprint/start', 'Start my sprint'],
  ['/recovery', 'Recovery'],
];

/**
 * The browser tab's title for a page: the page's full name, then the
 * portal's ("Individual Performance Dashboard, The Clarity Portal"). The
 * title on screen can be the short form (5e rule 29b: capitals only for
 * names of up to about 3 words); the tab always has the full name.
 */
export const PORTAL_NAME = 'The Clarity Portal';
export function tabTitle(pathname) {
  const path = renamedPath(pathname.replace(/\/+$/, '') || '/');
  let name = null;
  const page = PAGE_NAMES.filter(([r]) => matches(path, r)).sort((x, y) => y[0].length - x[0].length)[0];
  if (page) [, name] = page;
  if (!name) name = Object.values(HUBS).find((h) => h.path === path)?.title || null;
  if (!name) {
    const tool = Object.values(TOOLS)
      .flatMap((t) => t.routes.map((r) => [r, t.name]))
      .filter(([r]) => matches(path, r))
      .sort((x, y) => y[0].length - x[0].length)[0];
    if (tool) [, name] = tool;
  }
  return name ? `${name}, ${PORTAL_NAME}` : PORTAL_NAME;
}

/**
 * The pin panel's groups (M3 PINGRP): every tool with a tile except the
 * plan and the sprint, which always stay at the top of Plan.
 */
export const PIN_GROUPS = [
  { title: 'Plan', tools: ['pmd', 'grow', 'inv', 'time'] },
  { title: 'Reset', tools: ['breathe', 'wind', 'pp', 'journal'] },
  { title: 'Review', tools: ['rmd', 'debrief', 'aar', 'lbr'] },
  { title: 'Interpersonal', tools: ['meet', 'fb'] },
  { title: 'Strategic', tools: ['hc'] },
];

export const MAX_PINS = 3;
const PINNABLE = new Set(PIN_GROUPS.flatMap((g) => g.tools));

/**
 * The tool a stored pin means. Pins are saved as tool keys, but a pin
 * holding an address (an old one, such as /grow-step-1, or a new one) is
 * read as the tool it opens, so it still opens after the renames.
 */
function pinKey(pin) {
  if (typeof pin !== 'string') return null;
  if (PINNABLE.has(pin)) return pin;
  if (!pin.startsWith('/')) return null;
  const path = renamedPath(pin.split(/[?#]/)[0].replace(/\/+$/, ''));
  return [...PINNABLE].find((k) => TOOLS[k].to === path || TOOLS[k].routes.some((r) => matches(path, r))) || null;
}

/** Pins as saved, cleaned: known tools only, no repeats, at most 3. */
export function cleanPins(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(pinKey).filter(Boolean))].slice(0, MAX_PINS);
}

/**
 * Tools renamed in Phase 4 (brief, step 5): each old address and its new
 * one, in words matching the name people see. Every old address
 * redirects with its query, hash and state (App.jsx MovedTo), so saved
 * items, old emails, bookmarks and Home Screen apps open the same thing.
 * File names, database values and saved tool types keep their old names.
 * /plan-my-day and /review-plan redirect only in part (App.jsx).
 */
export const RENAMED = {
  // Get unstuck is one guided tool at one address (M9; Tim, 13 Nov).
  '/grow-step-1': '/get-unstuck',
  '/grow-step-2': '/get-unstuck',
  '/grow-step-3': '/get-unstuck',
  '/grow-step-3b-prioritize': '/get-unstuck',
  '/grow-step-4': '/get-unstuck',
  '/inversion-step-1': '/pre-mortem',
  '/inversion-step-2': '/pre-mortem/risks',
  '/inversion-step-3': '/pre-mortem/plan',
  '/inversion-thinking-summary': '/pre-mortem/summary',
  '/if-then-planning': '/pressure-plan',
  '/if-then-planning-summary': '/pressure-plan/summary',
  '/stop-doing-audit': '/time-audit',
  '/stop-doing-audit-summary': '/time-audit/summary',
  '/tough-conversation-step-1': '/give-difficult-feedback',
  '/tough-conversation-step-2': '/give-difficult-feedback/questions',
  '/tough-conversation-summary': '/give-difficult-feedback/summary',
  '/wheel-of-life': '/life-balance-review',
  '/wheel-of-life/areas': '/life-balance-review/areas',
  '/wheel-of-life/check-in': '/life-balance-review/check-in',
  '/wheel-of-life/results': '/life-balance-review/results',
  '/wheel-of-life/targets': '/life-balance-review/targets',
};

/**
 * Tools renamed on 10 Nov (Tim, 08:55 to 08:57): Plan my day is the Daily
 * plan, Review my day the Daily review, and the Hardware and Software
 * check-in the Monthly Hardware and Software review. Each old address
 * goes to its new one with whatever follows it (a day, a month, a
 * month's answers) and its query, hash and state (App.jsx MovedUnder),
 * so saved items, pins, bookmarks and old emails still open the same thing.
 */
export const MOVED_UNDER = {
  '/my-day/plan': '/daily-plan',
  '/my-day/review': '/daily-review',
  '/check-in': '/monthly-review',
};

/**
 * Get unstuck's step addresses from Phase 4 (/get-unstuck/reality and the
 * rest): the tool is one address now, and each of these redirects to it
 * with its query, hash and state (App.jsx).
 */
export const GET_UNSTUCK_STEPS = ['/get-unstuck/reality', '/get-unstuck/options', '/get-unstuck/prioritise', '/get-unstuck/will-do'];

/** An address after the renames (itself when it wasn't renamed). */
export function renamedPath(path) {
  if (RENAMED[path] || MOVED[path]) return RENAMED[path] || MOVED[path];
  for (const [from, to] of Object.entries(MOVED_UNDER)) {
    if (path === from || path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  }
  return path;
}

/**
 * Old section pages and their hub (brief, step 1). The query, the hash
 * and any state are passed on (App.jsx MovedTo).
 */
export const MOVED = {
  '/plan-section': '/personal/plan',
  '/planning-tools': '/personal/plan',
  '/decide-section': '/personal/plan',
  '/decision-tools': '/personal/plan',
  '/ground-section': '/personal/reset',
  '/review-section': '/personal/review',
  '/account-section': '/my-account',
  '/points-of-leverage': '/strategic',
  // My decisions joined the one My Plans list (step 4). Its discard toast
  // comes with it in the state.
  '/decision-history': '/my-plans',
  ...RENAMED,
};
