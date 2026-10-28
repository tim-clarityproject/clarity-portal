import { useMemo } from 'react';
import { useCachedLoad } from '../pageCache';
import { loadActivePlan, loadPlanPage, loadPlanVersions, loadSprintPage } from './api';
import { planView } from './view';

// The plan's React hooks: each page shows its last data at once from the
// device, then refreshes quietly (Smoothness, Phase 0e).

/** The plan page and the My Mission panel share one copy. */
export const PLAN_CACHE = 'performance-plan';

export function usePlanPage(userId) {
  const loaded = useCachedLoad({ userId, name: PLAN_CACHE, load: () => loadPlanPage(userId) });
  const view = useMemo(() => (loaded.data ? planView(loaded.data) : null), [loaded.data]);
  return { ...loaded, view };
}

/** Only whether the person has a plan, and its mission: for the header pill. */
export function useActivePlan(userId) {
  return useCachedLoad({ userId, name: 'performance-plan-head', load: () => loadActivePlan(userId) });
}

export function usePlanVersions(userId) {
  return useCachedLoad({ userId, name: 'performance-plan-versions', load: () => loadPlanVersions(userId) });
}

/** The Performance Sprint page's rows. */
export const SPRINT_CACHE = 'performance-sprint';

export function useSprintPage(userId) {
  return useCachedLoad({ userId, name: SPRINT_CACHE, load: () => loadSprintPage(userId) });
}
