import pageText from '../content/pageText';

// The portal's map (mock-up M3, approved 23 Oct; Phase 4 step 1): the
// menu's areas, the hub pages and the tools on them. The menu never lists
// tools: each area opens a hub of type-only tiles, the tool's name, one
// line on how it helps and how long it takes.
//
// Only tools that exist get a tile (brief, step 1). A tool not rebuilt yet
// opens its current page under its new name (CLAUDE.md rule 26: routes
// keep their old names until step 5). Not built yet, so no tile: the
// Dashboard (Phase 5), Find my sweet spot, Deliberate vs default, Travel
// and jet lag plan, Delegation audit, Emotional wash, Identity beyond the
// role, Hardware and Software check-in, Stay deliberate under pressure,
// Performance Evidence, Prepare for a difficult conversation, Prepare for
// a pitch, Map my stakeholders, Map my team, Understand their sweet spot,
// Decide who decides, Strategy on a page and Pre-mortem for an initiative.
// Sleep wind down joins Reset in step 6. Points of leverage is removed
// (Tim, 2 Nov): no tile anywhere, and its address goes to Strategic.
//
// Tiles are in the order M3 shows. Later, most used first, from private
// usage counts.

/**
 * Every tool with a tile. `routes` are the addresses that belong to it,
 * so the menu can mark the area someone is in.
 */
export const TOOLS = {
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
    name: 'Plan my day',
    line: 'Choose what matters most today.',
    time: '~3 minutes',
    to: '/my-day/plan',
    routes: ['/my-day/plan', '/plan-my-day', '/daily-plan-summary'],
  },
  grow: {
    name: 'Get unstuck',
    line: 'Turn a goal or a decision into next steps you’ll take.',
    time: '~15 minutes',
    to: '/grow-step-1',
    routes: ['/grow-step-'],
  },
  inv: {
    name: 'Pre-mortem',
    line: 'Test a plan by imagining it went wrong.',
    time: '~10 minutes',
    to: '/inversion-step-1',
    routes: ['/inversion-'],
  },
  time: {
    name: 'Time audit',
    line: 'See where your time goes and free some up.',
    time: '~10 minutes',
    to: '/stop-doing-audit',
    routes: ['/stop-doing-audit'],
  },
  breathe: {
    name: 'Breathe',
    line: 'Slow your breathing to settle your body.',
    time: '1, 3 or 5 minutes',
    to: '/breathe',
    routes: ['/breathe', '/breathing-sessions-summary'],
  },
  pp: {
    name: 'Pressure plan',
    line: 'Get ready for a high-pressure moment.',
    time: '~8 minutes',
    to: '/if-then-planning',
    routes: ['/if-then-planning'],
  },
  journal: {
    name: 'Journal',
    line: 'Clear your head.',
    time: 'As long as you like',
    to: '/daily-journal',
    routes: ['/daily-journal'],
  },
  rmd: {
    name: 'Review my day',
    line: 'Learn from today so tomorrow goes better.',
    time: '~3 minutes',
    to: '/my-day/review',
    routes: ['/my-day/review', '/review-plan', '/review-summary'],
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
    to: '/wheel-of-life',
    routes: ['/wheel-of-life'],
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
    to: '/tough-conversation-step-1',
    routes: ['/tough-conversation-'],
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
 * until the tiles really do move.
 */
export const HUBS = {
  personal: {
    title: 'Personal',
    path: '/personal',
    area: 'personal',
    info: pageText.hubPersonal,
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
  },
  reset: {
    title: 'Reset',
    path: '/personal/reset',
    area: 'personal',
    up: 'personal',
    line: 'Get back to your best when the pressure is on.',
    info: pageText.hubReset,
    groups: [{ tools: ['breathe', 'pp', 'journal'] }],
  },
  review: {
    title: 'Review',
    path: '/personal/review',
    area: 'personal',
    up: 'personal',
    line: 'Turn what happened into better performance.',
    info: pageText.hubReview,
    groups: [{ tools: ['rmd', 'debrief', 'aar', 'lbr'] }],
  },
  interpersonal: {
    title: 'Interpersonal',
    path: '/interpersonal',
    area: 'interpersonal',
    info: pageText.hubInterpersonal,
    groups: [{ title: 'Meetings and conversations', tools: ['meet', 'fb'] }],
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

/** The number of tools a hub holds, for Personal's big tiles ("6 tools"). */
export function toolCount(hubKey) {
  const hub = HUBS[hubKey];
  const n = (hub.groups || []).reduce((sum, g) => sum + g.tools.length, 0) + (hub.anchor ? 1 : 0);
  return `${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/**
 * The menu's areas (M3). Home is in the desktop menu only; the phone has
 * Home on its bar. The Strategic line leaves out "leverage" (removed, Tim,
 * 2 Nov) and Personal names only what is built (no Dashboard until
 * Phase 5).
 */
export function menuAreas(coachName) {
  return [
    { key: 'home', name: 'Home', line: 'Today', to: '/welcome', desktopOnly: true },
    { key: 'personal', name: 'Personal', line: 'Plan, reset, review', to: '/personal' },
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

const AREA_ROUTES = {
  home: ['/welcome'],
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
 * The pin panel's groups (M3 PINGRP): every tool with a tile except the
 * plan and the sprint, which always stay at the top of Plan.
 */
export const PIN_GROUPS = [
  { title: 'Plan', tools: ['pmd', 'grow', 'inv', 'time'] },
  { title: 'Reset', tools: ['breathe', 'pp', 'journal'] },
  { title: 'Review', tools: ['rmd', 'debrief', 'aar', 'lbr'] },
  { title: 'Interpersonal', tools: ['meet', 'fb'] },
  { title: 'Strategic', tools: ['hc'] },
];

export const MAX_PINS = 3;
const PINNABLE = new Set(PIN_GROUPS.flatMap((g) => g.tools));

/** Pins as saved, cleaned: known tools only, no repeats, at most 3. */
export function cleanPins(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((k) => typeof k === 'string' && PINNABLE.has(k)))].slice(0, MAX_PINS);
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
};
