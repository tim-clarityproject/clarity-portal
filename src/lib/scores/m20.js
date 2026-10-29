// M20. Tools that already score today (docs/scoring-methods.md, M20).
//
// Their rules are not changing in the overhaul, so this section documents
// them from the code and re-exports the code that does the arithmetic,
// rather than copying it: the Health Check's in src/lib/alignmentScore.js
// and the Life balance review's in src/lib/wheelOfLife.js. The four chart
// states (methods 1.3) are healthCheckState in alignmentScore.js, re-exported
// here as m20State; m20Area is a small wrapper giving today's three drawn
// areas, and a test checks it agrees with the chart's `quadrant` on every input.
//
// Methods 1.4 (Health Check 3): the CSF weights, each Health Check's own line
// for "important", the headline, the questions to start with and dot size,
// also in alignmentScore.js and re-exported here. Every figure on the Health
// Check's page, its PDF and its emails comes from these.

import {
  attentionScore, healthCheckState, IMPORTANT_ABOVE, isRated, progressGap, rankProjects, resourceFactor, strategicImportance,
  CSF_LEVELS, CSF_WEIGHTS, DEFAULT_CSF_LEVEL, csfLevel, csfLevelName, csfLevels, LINE_CHOICES, importantLine, isAboveLine,
  isTooEarly, withCsfLevel, withImportantLine, headline, questions, dueWhen, DUE_SOON_MONTHS, csfsWithoutHigh, dotSize,
} from '../alignmentScore.js';
import { average as wheelAverage, computeStats, tableRows } from '../wheelOfLife.js';

// ---------------------------------------------------------------- M20.1 Health Check
export {
  strategicImportance as m20StrategicImportance,
  attentionScore as m20AttentionScore,
  progressGap as m20ProgressGap,
  resourceFactor as m20ResourceFactor,
  healthCheckState as m20State,
  isRated as m20IsRated,
  rankProjects as m20RankProjects,
  CSF_LEVELS as M20_CSF_LEVELS,
  CSF_WEIGHTS as M20_CSF_WEIGHTS,
  DEFAULT_CSF_LEVEL as M20_DEFAULT_CSF_LEVEL,
  csfLevel as m20CsfLevel,
  csfLevelName as m20CsfLevelName,
  csfLevels as m20CsfLevels,
  LINE_CHOICES as M20_LINE_CHOICES,
  importantLine as m20ImportantLine,
  isAboveLine as m20IsAboveLine,
  isTooEarly as m20IsTooEarly,
  withCsfLevel as m20WithCsfLevel,
  withImportantLine as m20WithImportantLine,
  headline as m20Headline,
  questions as m20Questions,
  dueWhen as m20DueWhen,
  DUE_SOON_MONTHS as M20_DUE_SOON_MONTHS,
  csfsWithoutHigh as m20CsfsWithoutHigh,
  dotSize as m20DotSize,
};

/** The suggested line between more and less important, and every older
 * Health Check's: above 50% is important unless the Health Check sets its
 * own (m20ImportantLine). */
export const M20_IMPORTANCE_LINE = IMPORTANT_ABOVE;

const AREA = { moving_well: 'good', needs_attention: 'attention', needs_managing: 'neutral', less_important: 'neutral' };

/**
 * M20.1: today's three drawn areas of the importance against progress chart,
 * from the four states (m20State): 'good' moving well, 'attention' needs
 * attention (above the line with Bad progress), 'neutral' everything else
 * (needs managing, less important, Embryonic at any importance, or no
 * progress rating yet).
 * @param {number|null} progress 1 Embryonic … 5 Excellent
 * @param {number} importancePct exact
 * @param {number} [line] the Health Check's line, 50 if not given
 */
export function m20Area(progress, importancePct, line = IMPORTANT_ABOVE) {
  return AREA[healthCheckState(progress, importancePct, line)] ?? 'neutral';
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
 * important and moving well (Claude). Null when none is rated. Each version
 * keeps its own line.
 * @param {number} [line] that version's line, 50 if not given
 */
export function m20Alignment(ranked, line = IMPORTANT_ABOVE) {
  const rated = (ranked || []).filter((r) => r.rated && r.progress != null);
  if (!rated.length) return null;
  return (rated.filter((r) => healthCheckState(r.progress, r.importance, line) === 'moving_well').length / rated.length) * 100;
}

// ---------------------------------------------------------------- M20.2 Life balance review
export {
  wheelAverage as m20LifeBalanceAverage,
  computeStats as m20LifeBalanceStats,
  tableRows as m20LifeBalanceRows,
};
