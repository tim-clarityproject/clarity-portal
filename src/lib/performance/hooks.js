import { useMemo } from 'react';
import { readCache, useCachedLoad, writeCache } from '../pageCache';
import { loadActivePlan, loadPlanPage, loadPlanVersions, loadRecoveryPage, loadSprintPage, loadYearPage } from './api';
import { withRecovery } from './recovery';
import { planView } from './view';

// The plan's React hooks: each page shows its last data at once from the
// device, then refreshes quietly (Smoothness, Phase 0e).

/** The plan page and the My Mission panel share one copy. */
export const PLAN_CACHE = 'performance-plan';

export function usePlanPage(userId, { showResults = false } = {}) {
  const loaded = useCachedLoad({ userId, name: PLAN_CACHE, load: () => loadPlanPage(userId) });
  const view = useMemo(() => (loaded.data ? planView(loaded.data, { showResults }) : null), [loaded.data, showResults]);
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

/** View your year's rows. */
export function useYearPage(userId) {
  return useCachedLoad({ userId, name: 'performance-year', load: () => loadYearPage(userId) });
}

/** The Recovery pages' rows (M15). */
export const RECOVERY_CACHE = 'performance-recovery';

export function useRecoveryPage(userId) {
  return useCachedLoad({ userId, name: RECOVERY_CACHE, load: () => loadRecoveryPage(userId) });
}

/**
 * A Recovery started, ended or lengthened: every page's copy on the
 * device learns it at once, so the plan, the sprint and the year show it
 * straight away, offline too, before they refresh.
 */
export function noteRecoveryOnDevice(userId, row) {
  for (const name of [PLAN_CACHE, SPRINT_CACHE, 'performance-year', RECOVERY_CACHE]) {
    const cached = readCache(userId, name);
    if (!cached?.v || !Array.isArray(cached.v.recoveries)) continue;
    writeCache(userId, name, { ...cached.v, recoveries: withRecovery(cached.v.recoveries, row) });
  }
}
