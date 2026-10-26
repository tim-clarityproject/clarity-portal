// M20. Tools that already score today (docs/scoring-methods.md, M20).
//
// Their rules are not changing in the overhaul, so this section documents
// them from the code and re-exports the code that does the arithmetic,
// rather than copying it: the Health Check's in src/lib/alignmentScore.js
// and the Life balance review's in src/lib/wheelOfLife.js. The one rule kept
// elsewhere today (the chart area, `quadrant` in
// src/pages/alignment/chartLayout.js) is written here as m20Area, and a test
// checks the two agree on every input.

import { attentionScore, isRated, rankProjects, resourceFactor, strategicImportance } from '../alignmentScore.js';
import { average as wheelAverage, computeStats, tableRows } from '../wheelOfLife.js';

// ---------------------------------------------------------------- M20.1 Health Check
export {
  strategicImportance as m20StrategicImportance,
  attentionScore as m20AttentionScore,
  resourceFactor as m20ResourceFactor,
  isRated as m20IsRated,
  rankProjects as m20RankProjects,
};

/** The line between more and less important: above 50% is important. */
export const M20_IMPORTANCE_LINE = 50;

/**
 * M20.1: where a project sits on the importance against progress chart.
 * 'good' important and moving well (above 50% with Good or Excellent);
 * 'behind' important but behind (above 50% with Embryonic or Bad);
 * 'neutral' everything else: 50% or less, Fair progress (on the line), or
 * no progress rating yet.
 * @param {number|null} progress 1 Embryonic … 5 Excellent
 * @param {number} importancePct exact
 */
export function m20Area(progress, importancePct) {
  if (progress == null) return 'neutral';
  if (progress > 3 && importancePct > M20_IMPORTANCE_LINE) return 'good';
  if (progress < 3 && importancePct > M20_IMPORTANCE_LINE) return 'behind';
  return 'neutral';
}

/**
 * M20.1: the average strategic importance on the PDF's At a glance panel:
 * the mean of the rated projects' exact importance, rounded; 0 when none
 * is rated (as the PDF shows it today).
 * @param {{ importance: number, rated: boolean }[]} ranked rankProjects' rows
 */
export function m20AverageImportance(ranked) {
  const rated = (ranked || []).filter((r) => r.rated);
  if (!rated.length) return 0;
  return Math.round(rated.reduce((s, r) => s + r.importance, 0) / rated.length);
}

/**
 * M20.1 and M19.3: alignment for one version of a team's Health Check: the
 * share of its rated projects (rated, with a progress rating) that are
 * important and moving well (Claude). Null when none is rated.
 */
export function m20Alignment(ranked) {
  const rated = (ranked || []).filter((r) => r.rated && r.progress != null);
  if (!rated.length) return null;
  return (rated.filter((r) => m20Area(r.progress, r.importance) === 'good').length / rated.length) * 100;
}

// ---------------------------------------------------------------- M20.2 Life balance review
export {
  wheelAverage as m20LifeBalanceAverage,
  computeStats as m20LifeBalanceStats,
  tableRows as m20LifeBalanceRows,
};
