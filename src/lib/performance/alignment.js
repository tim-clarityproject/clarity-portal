// The alignment check (portal-overhaul-decisions.md, "Alignment rules"):
// every Outcome Objective has at least one Strategy working on it, and
// every Strategy serves at least one objective. The plan flags gaps both
// ways. A structural check on what the plan says, not a score, so it lives
// here rather than in src/lib/scores.

/**
 * @param {{id: string, name: string}[]} objectives the plan's live objectives
 * @param {{id: string, name: string}[]} strategies the plan's live Strategies
 * @param {{strategyId: string, objectiveId: string}[]} links which Strategy serves which objective
 * @returns {{ ok: boolean,
 *   unservedObjectives: {id, name}[], unlinkedStrategies: {id, name}[],
 *   strategiesFor: Map<string, string[]>, objectivesFor: Map<string, string[]> }}
 */
export function alignmentCheck(objectives = [], strategies = [], links = []) {
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const strategyIds = new Set(strategies.map((s) => s.id));
  const strategiesFor = new Map(objectives.map((o) => [o.id, []]));
  const objectivesFor = new Map(strategies.map((s) => [s.id, []]));
  for (const l of links) {
    if (!objectiveIds.has(l.objectiveId) || !strategyIds.has(l.strategyId)) continue;
    if (!strategiesFor.get(l.objectiveId).includes(l.strategyId)) strategiesFor.get(l.objectiveId).push(l.strategyId);
    if (!objectivesFor.get(l.strategyId).includes(l.objectiveId)) objectivesFor.get(l.strategyId).push(l.objectiveId);
  }
  const unservedObjectives = objectives.filter((o) => strategiesFor.get(o.id).length === 0);
  const unlinkedStrategies = strategies.filter((s) => objectivesFor.get(s.id).length === 0);
  return {
    ok: unservedObjectives.length === 0 && unlinkedStrategies.length === 0,
    unservedObjectives,
    unlinkedStrategies,
    strategiesFor,
    objectivesFor,
  };
}

/**
 * The check's lines, as M1 words them: two quiet "good" labels when the plan
 * lines up, or one line per gap ("Annual revenue has no Strategy working on
 * it").
 * @returns {{ good: boolean, text: string }[]}
 */
export function alignmentLines(check) {
  if (check.ok) {
    return [
      { good: true, text: 'Every objective has a Strategy' },
      { good: true, text: 'Every Strategy serves an objective' },
    ];
  }
  return [
    ...check.unservedObjectives.map((o) => ({ good: false, text: `${o.name} has no Strategy working on it` })),
    ...check.unlinkedStrategies.map((s) => ({ good: false, text: `${s.name} serves no objective yet` })),
  ];
}
