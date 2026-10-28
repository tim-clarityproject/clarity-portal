// Individual Performance Plan versions (portal-overhaul-decisions.md,
// "Versions (IPP)"; Phase 1 spec section 2).
//
//   Major (2.0): the mission changed; an Outcome Objective added or
//                removed; a Strategy added or removed; a Strategy re-tagged
//                to different objectives.
//   Minor (2.1): any other change to the plan: a habit added, removed or
//                edited, a default measure or impact changed, names,
//                descriptions, targets and dates.
//   None:        logging, scores, figures, a milestone reached, unplanned
//                wins and reviews never make a version.
//
// A version is a snapshot of the plan (planSnapshot), kept in
// plan_versions and never changed. Comparing two snapshots says which kind
// of change was made, so every editor uses the same rule.

/**
 * The plan as a version keeps it. Rows can be database rows (snake_case)
 * or the page's own shape; only what the plan says is kept, never figures,
 * logs or scores. Archived rows are left out.
 */
export function planSnapshot({ mission, objectives = [], strategies = [], links = [], habits = [] }) {
  const live = (row) => !row.archived_at && !row.archivedAt;
  const objectiveIds = new Set(objectives.filter(live).map((o) => o.id));
  const strategyIds = new Set(strategies.filter(live).map((s) => s.id));
  const served = new Map();
  for (const l of links) {
    const sid = l.strategy_id ?? l.strategyId;
    const oid = l.objective_id ?? l.objectiveId;
    if (!strategyIds.has(sid) || !objectiveIds.has(oid)) continue;
    if (!served.has(sid)) served.set(sid, []);
    served.get(sid).push(oid);
  }
  const bySort = (a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0);
  return {
    mission: (mission || '').trim(),
    objectives: objectives.filter(live).sort(bySort).map((o) => ({
      id: o.id,
      name: o.name,
      kind: o.kind,
      unit: o.unit ?? null,
      direction: o.direction ?? 'up',
      start: o.start_value ?? o.start ?? null,
      target: o.target_value ?? o.target ?? null,
      byWhen: o.by_when ?? o.byWhen ?? null,
      dueOn: o.due_on ?? o.dueOn ?? null,
    })),
    strategies: strategies.filter(live).sort(bySort).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      objectiveIds: [...(served.get(s.id) || [])].sort(),
    })),
    habits: habits.filter(live).filter((h) => strategyIds.has(h.strategy_id ?? h.strategyId)).sort(bySort).map((h) => ({
      id: h.id,
      strategyId: h.strategy_id ?? h.strategyId,
      name: h.name,
      measure: h.measure,
      unit: h.unit ?? null,
      target: h.target ?? null,
      targetPer: h.target_per ?? h.targetPer ?? null,
      limit: h.limit_value ?? h.limit ?? null,
      limitPer: h.limit_per ?? h.limitPer ?? null,
      direction: h.direction ?? null,
      topNumber: h.top_number ?? h.topNumber ?? null,
      impact: h.impact ?? 2,
    })),
  };
}

const ids = (list) => new Set((list || []).map((x) => x.id));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const stable = (x) => JSON.stringify(x);

/**
 * Which kind of change turns one snapshot into the other.
 * @returns {'major'|'minor'|null} null when nothing the plan says changed
 */
export function planChangeKind(before, after) {
  if (!before) return 'major';
  if ((before.mission || '') !== (after.mission || '')) return 'major';
  if (!sameSet(ids(before.objectives), ids(after.objectives))) return 'major';
  if (!sameSet(ids(before.strategies), ids(after.strategies))) return 'major';
  const servedBefore = new Map((before.strategies || []).map((s) => [s.id, new Set(s.objectiveIds || [])]));
  for (const s of after.strategies || []) {
    if (!sameSet(servedBefore.get(s.id) || new Set(), new Set(s.objectiveIds || []))) return 'major';
  }
  return stable(before) === stable(after) ? null : 'minor';
}

/** The version after a change: a major change starts a new whole number. */
export function nextVersion({ major, minor }, kind) {
  if (kind === 'major') return { major: major + 1, minor: 0 };
  if (kind === 'minor') return { major, minor: minor + 1 };
  return { major, minor };
}

/** "Version 3.2". */
export function versionLabel({ major, minor }) {
  return `Version ${major}.${minor}`;
}

/** "3.2" from a route, or null when it isn't a version number. */
export function parseVersion(text) {
  const m = /^(\d+)\.(\d+)$/.exec(String(text || '').trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** What a version's kind is called in its history. */
export const VERSION_KIND_LABEL = {
  start: 'First version',
  major: 'Major change',
  minor: 'Minor change',
};
