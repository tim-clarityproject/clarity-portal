import { dayKeyWords } from './time/index.js';

// Portal levels for people who aren't coaching clients (Free, Individual, Executive; 061's portal_subscriptions). Group
// C's (Phase 6b run 3; M28 s-levels, s-cancel, s-locked). Gating is off until Tim decides prices and who keeps what
// (plan risk 20): nothing is locked, My Account shows no Your plan row, and choosing or cancelling a plan changes
// nothing (the pages say so calmly). Checked by tests/performance/client-money.test.mjs.
export const GATING_ON = false;

/** The device's copy of someone's plan (pageCache). */
export const PLAN_CACHE = 'my-plan';

export const LEVELS = Object.freeze(['free', 'individual', 'executive']);

/** M28's three plans (s-levels), with the daily tools' names of CLAUDE.md rule 26a. Prices are M28's until Tim sets them. */
export const PLANS = Object.freeze([
  { level: 'free', name: 'Free', price: '£0', line: 'It has the Daily plan, the Daily review, the Confidence Bank, and Breathe and Reset.' },
  { level: 'individual', name: 'Individual', price: '£16/month', line: 'Everything for your own performance, from your plan and sprints to the dashboard and the tools.' },
  { level: 'executive', name: 'Executive', price: '£40/month', line: 'Everything in Individual, plus the strategy tools for leading teams.' },
]);

export const PLAN_WORDS = Object.freeze({
  title: 'Your plan',
  current: 'Your plan',
  refund: 'You can cancel any time, and you get a full refund within 14 days of first investing.',
  cancel: 'Cancel my plan',
  keep: 'Keep my plan',
  keepsLine: 'You keep everything you’ve made, and the free tools carry on.',
  notOpen: 'Plans aren’t open yet, so nothing has changed.',
  seePlans: 'See plans',
  notNow: 'Not now',
});

const nameOf = (level) => (PLANS.find((p) => p.level === level) || PLANS[0]).name;

/** The level someone is on: their newest active (or cancelling) subscription's, else Free. */
export function levelOf(rows) {
  const live = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && LEVELS.includes(r.level) && (r.status === 'active' || r.status === 'cancelling' || r.status === 'past_due'))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return live[0] ? { level: live[0].level, endsOn: live[0].status === 'cancelling' ? live[0].current_period_end : null, source: live[0].source || 'self', periodEnd: live[0].current_period_end || null } : { level: 'free', endsOn: null, source: 'self', periodEnd: null };
}

/** My Account's row line: the plan's name ("Free", "Individual"). */
export const planLine = (level) => nameOf(level);

/** "Choose Individual". */
export const chooseWords = (level) => `Choose ${nameOf(level)}`;

/** "You’re on Individual." */
export const chosenLine = (level) => `You’re on ${nameOf(level)}.`;

/** s-cancel: "Your Individual plan ends on Fri 18 Dec." (the end of the period already invested in), or without a day. */
export function cancelLine(level, endDay = null) {
  const name = nameOf(level);
  return /^\d{4}-\d{2}-\d{2}$/.test(endDay || '') ? `Your ${name} plan ends on ${dayKeyWords(endDay)}.` : `Your ${name} plan ends at the end of this month.`;
}
export const CANCELLED_LINE = 'We’ve cancelled your plan and emailed you to confirm.';

/** Which plans have a tool (s-locked's tile line): "On Individual and Executive". */
export function onPlans(levels) {
  const names = (levels || []).filter((l) => LEVELS.includes(l)).map(nameOf);
  if (!names.length) return '';
  return `On ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`;
}

/** Whether a tool is locked for someone: never while gating is off. */
export const isLocked = (toolLevels, level, gating = GATING_ON) => Boolean(gating) && Array.isArray(toolLevels) && toolLevels.length > 0 && !toolLevels.includes(level);
