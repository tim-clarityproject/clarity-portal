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
// Most in need of attention = importance % x progress gap / 4 x (resource + 3) / 8
// (methods M20.1, version 1.3). The progress gap is (5 - progress) for Bad,
// Fair, Good and Excellent (3, 2, 1, 0), and 2.5 for Embryonic: a project that
// has only just started is too early to tell, so it ranks below Bad and above
// Fair (Tim, 27 Oct; it was 4). Resource multiplies it: 1 Minimal x0.5,
// 2 Low x0.625, 3 Moderate x0.75, 4 High x0.875, 5 Very high x1; a blank
// resource counts as Moderate. The score stays out of 100. Ties go to the
// higher importance, then the higher resource.
//   Data platform (58.33%, progress 1, resource 5):  58.33 x 2.5/4 x 8/8 = 36.46
//   Leadership programme (41.67%, progress 2, resource 4): 41.67 x 3/4 x 7/8 = 27.34
//   Same importance and progress, resource 5 vs 2 (e.g. 50%, progress 3):
//     50 x 2/4 x 8/8 = 25.00 ranks above 50 x 2/4 x 5/8 = 15.63

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

/**
 * Whether a project has been rated: at least one contribution score for a
 * factor that is still on the list (a score for a deleted factor doesn't
 * count). An unrated project shows "Not rated", never 0%, in the app and the
 * PDF alike, and is left out of averages.
 * @param {Object<string, number>} [contrib] factor id -> 0..3
 * @param {string[]} factorIds the current factors
 */
export function isRated(contrib, factorIds) {
  return (factorIds || []).some((id) => typeof contrib?.[id] === 'number');
}

/** What a project's importance reads as: "58%" or "Not rated". */
export function importanceText(row) {
  return row.rated ? `${roundPct(row.importance)}%` : 'Not rated';
}

/** Whole-number percentage for display only. */
export function roundPct(pct) {
  return Math.round(pct);
}

// An unrated resource counts as Moderate (3) rather than hiding the
// project, the same in the attention score and in the tie-break.
const resourceOrModerate = (resource) => (resource == null ? 3 : resource);

/** The resource multiplier: (resource + 3) / 8, so 1 -> 0.5 and 5 -> 1. */
export function resourceFactor(resource) {
  return (resourceOrModerate(resource) + 3) / 8;
}

/**
 * The progress gap in the attention score: 5 - progress, except Embryonic (1),
 * which counts as 2.5.
 * @param {number} progress 1..5
 */
export function progressGap(progress) {
  return progress === 1 ? 2.5 : 5 - progress;
}

/**
 * Most in need of attention: importance % x progress gap / 4 x (resource + 3) / 8.
 * @param {number} importancePct exact importance %
 * @param {number|null|undefined} progress 1..5, or unset
 * @param {number|null|undefined} resource 1..5, or unset
 * @returns {number} -1 when progress is not set yet (sorts last)
 */
export function attentionScore(importancePct, progress, resource) {
  if (progress == null) return -1;
  return ((importancePct * progressGap(progress)) / 4) * resourceFactor(resource);
}

/** A project is important when its strategic importance is above this line. */
export const IMPORTANT_ABOVE = 50;

/**
 * Where a project sits on the importance against progress chart (methods
 * M20.1). The one copy of the rule: the chart, the one-pager, the PDF and the
 * email all use it, so they can never disagree.
 *   moving_well     importance above 50% with Good or Excellent progress
 *   needs_managing  importance above 50% with Fair progress
 *   needs_attention importance above 50% with Bad progress
 *   less_important  50% or less at any progress, or Embryonic at any
 *                   importance (exactly 50% is not above the line)
 * @param {number|null|undefined} progress 1..5, or unset
 * @param {number} importancePct exact importance %
 * @returns {'moving_well'|'needs_managing'|'needs_attention'|'less_important'|null}
 *   null when there is no progress rating (not drawn)
 */
export function healthCheckState(progress, importancePct) {
  if (progress == null) return null;
  if (progress === 1 || !(importancePct > IMPORTANT_ABOVE)) return 'less_important';
  if (progress >= 4) return 'moving_well';
  if (progress === 3) return 'needs_managing';
  return 'needs_attention';
}

/**
 * Projects ranked most in need of attention first; ties go to the higher
 * importance, then the higher resource.
 * @param {{id: string, text: string}[]} projects
 * @param {{id: string, text: string}[]} factors
 * @param {Object} ownerRatings ratings.owner: projectId -> {contrib, progress, resource}
 * @returns {{project: object, importance: number, rated: boolean, progress: number|null, resource: number|null, attention: number}[]}
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
        rated: isRated(r.contrib, factorIds),
        progress,
        resource: r.resource ?? null,
        attention: attentionScore(importance, progress, r.resource),
      };
    })
    .sort((a, b) => (b.attention - a.attention)
      || (b.importance - a.importance)
      || (resourceOrModerate(b.resource) - resourceOrModerate(a.resource)));
}
