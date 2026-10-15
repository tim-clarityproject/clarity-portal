// Strategic Alignment Health Check: scoring. One small shared module, used by
// the rating screens (live strategic importance) and, in SA3, the one-pager.
//
// Strategic importance % = sum of contribution scores / (factors x 3) x 100.
// The exact value is kept; round only when displaying (use roundPct).
//
// Worked check (spec example): "Data platform" scores 0 + 2 + 2 + 3 = 7 against
// 4 factors, so the maximum is 4 x 3 = 12 and 7 / 12 x 100 = 58.33...
//   strategicImportance({ a: 0, b: 2, c: 2, d: 3 }, ['a', 'b', 'c', 'd'])
//     -> 58.333...   roundPct(...) -> 58
// Most in need of attention = importance % x (5 - progress) / 4, so progress 1
// keeps the full importance and progress 5 scores 0. For Data platform at
// progress 1: 58.33 x 4 / 4 = 58.33; at progress 5: 0.

/** Highest contribution score for one factor. */
export const MAX_CONTRIBUTION = 3;

/**
 * Exact strategic importance as a percentage (0 to 100).
 * @param {Object<string, number>} [contrib] factor id -> 0..3
 * @param {string[]} factorIds the current factors; others are ignored
 * @returns {number}
 */
export function strategicImportance(contrib, factorIds) {
  if (!factorIds || factorIds.length === 0) return 0;
  const sum = factorIds.reduce((total, id) => total + (Number(contrib?.[id]) || 0), 0);
  return (sum / (factorIds.length * MAX_CONTRIBUTION)) * 100;
}

/** Whole-number percentage for display only. */
export function roundPct(pct) {
  return Math.round(pct);
}

/**
 * Most in need of attention: importance % x (5 - progress) / 4.
 * @param {number} importancePct exact importance %
 * @param {number|null|undefined} progress 1..5, or unset
 * @returns {number} -1 when progress is not set yet (sorts last)
 */
export function attentionScore(importancePct, progress) {
  if (progress == null) return -1;
  return (importancePct * (5 - progress)) / 4;
}

/**
 * Projects ranked most in need of attention first; ties go to the higher
 * importance.
 * @param {{id: string, text: string}[]} projects
 * @param {{id: string, text: string}[]} factors
 * @param {Object} ownerRatings ratings.owner: projectId -> {contrib, progress, resource}
 * @returns {{project: object, importance: number, progress: number|null, resource: number|null, attention: number}[]}
 */
export function rankProjects(projects, factors, ownerRatings) {
  const factorIds = factors.map((f) => f.id);
  return projects
    .map((project) => {
      const r = ownerRatings?.[project.id] || {};
      const importance = strategicImportance(r.contrib, factorIds);
      const progress = r.progress ?? null;
      return {
        project,
        importance,
        progress,
        resource: r.resource ?? null,
        attention: attentionScore(importance, progress),
      };
    })
    .sort((a, b) => (b.attention - a.attention) || (b.importance - a.importance));
}
