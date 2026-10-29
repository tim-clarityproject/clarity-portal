// Strategic Alignment Health Check: scoring. One small shared module, used by
// the rating screens (live strategic importance) and, in SA3, the one-pager.
//
// Strategic importance % = sum of contribution scores / (factors x 3) x 100,
// each factor weighted by its level (methods M20.1, version 1.4): Critical 3
// counts 1.4, Very important 2 (the default) 1.2 and Important 1 counts 1, so
// importance = sum(contribution x weight) / sum(3 x weight) x 100. With every
// factor at Very important it is exactly the unweighted figure, so every older
// Health Check scores as before. The exact value is kept; round only when
// displaying (use roundPct).
//
// Worked check (test case M20-4, the mock-up's invented results): weights
// Critical, Very important, Very important, Important (1.4, 1.2, 1.2, 1).
// "Customer success programme" High, High, Low, Medium = 3, 3, 1, 2:
// (4.2 + 3.6 + 1.2 + 2) / (3 x 4.8) = 11 / 14.4 = 76.39%, shown as 76% (75%
// unweighted). "New office fit-out" 0, 0, 1, 1: 2.2 / 14.4 = 15% (17%).
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

// ---------------------------------------------------------------- CSF levels
// Each Critical Success Factor (CSF) is saved with its level, how much it
// matters to the objective: `level` on its item in the answers' csfs list
// (alignment_sessions.data, which allows extra keys on an item, so no database
// change). A missing or bad level reads as Very important, so every older
// Health Check reads as before. Removing a CSF removes its level with it.

/** Very important: every CSF's level unless changed. */
export const DEFAULT_CSF_LEVEL = 2;

/** The three levels, heaviest first, with their names. */
export const CSF_LEVELS = [
  { level: 3, name: 'Critical' },
  { level: 2, name: 'Very important' },
  { level: 1, name: 'Important' },
];

/** How much each level counts in strategic importance (Tim, 28 Oct, 14:40). */
export const CSF_WEIGHTS = { 1: 1, 2: 1.2, 3: 1.4 };

// The same weights as whole numbers in the same ratio (5 : 6 : 7), so the sums
// are exact and every CSF at Very important gives exactly the unweighted
// figure, to the last decimal place.
const EXACT_WEIGHT = { 1: 5, 2: 6, 3: 7 };

/**
 * A CSF's level, 3 Critical, 2 Very important or 1 Important; Very important
 * when it has none saved or a bad one.
 * @param {{level?: number}|null|undefined} factor a CSF item
 * @returns {1|2|3}
 */
export function csfLevel(factor) {
  const level = factor?.level;
  return level === 1 || level === 2 || level === 3 ? level : DEFAULT_CSF_LEVEL;
}

/** A level's name: "Critical", "Very important" or "Important". */
export function csfLevelName(level) {
  return CSF_LEVELS.find((l) => l.level === level)?.name ?? 'Very important';
}

/**
 * Each CSF's level, by id, for strategicImportance.
 * @param {{id: string, level?: number}[]} factors
 * @returns {Object<string, 1|2|3>}
 */
export function csfLevels(factors) {
  return Object.fromEntries((factors || []).map((f) => [f.id, csfLevel(f)]));
}

/**
 * Exact strategic importance as a percentage (0 to 100):
 * sum(contribution x weight) / sum(3 x weight) x 100.
 * @param {Object<string, number>} [contrib] factor id -> 0..3
 * @param {string[]} factorIds the current factors; others are ignored
 * @param {Object<string, number>} [levels] factor id -> level 1..3 (csfLevels);
 *   a factor without one counts as Very important
 * @returns {number}
 */
export function strategicImportance(contrib, factorIds, levels) {
  if (!factorIds || factorIds.length === 0) return 0;
  let sum = 0;
  let max = 0;
  factorIds.forEach((id) => {
    const weight = EXACT_WEIGHT[csfLevel({ level: levels?.[id] })];
    sum += (Number(contrib?.[id]) || 0) * weight;
    max += MAX_CONTRIBUTION * weight;
  });
  return (sum / max) * 100;
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

// ---------------------------------------------------------------- The line
// Each Health Check sets its own line for "important" (Tim, 28 Oct, 14:25): a
// project is important when its strategic importance is above it. 30 to 80 in
// steps of 10, 50 unless changed. It is saved as `importantLine` at the top of
// the answers (alignment_sessions.data; no database change). A Health Check
// with none saved, or a bad one, reads as 50. Exactly at the line is not above.

/** The suggested line, and every older Health Check's. */
export const IMPORTANT_ABOVE = 50;

/** The lines a person can choose. */
export const LINE_CHOICES = [30, 40, 50, 60, 70, 80];

/**
 * The saved line, or 50.
 * @param {{importantLine?: number}|null|undefined} data the Health Check's answers
 * @returns {number}
 */
export function importantLine(data) {
  const line = data?.importantLine;
  return LINE_CHOICES.includes(line) ? line : IMPORTANT_ABOVE;
}

/** Whether a strategic importance is above the line (exactly at it is not). */
export function isAboveLine(importancePct, line = IMPORTANT_ABOVE) {
  return importancePct > line;
}

/**
 * The answers with one CSF's level changed (a new object; the rest kept).
 * @param {Object} data the Health Check's answers
 * @param {string} csfId
 * @param {1|2|3} level
 */
export function withCsfLevel(data, csfId, level) {
  if (![1, 2, 3].includes(level)) return data;
  return { ...data, csfs: (data?.csfs || []).map((f) => (f.id === csfId ? { ...f, level } : f)) };
}

/**
 * The answers with the line changed (a new object; the rest kept). A value
 * that isn't one of the choices leaves the answers as they are.
 * @param {Object} data the Health Check's answers
 * @param {number} line 30, 40, 50, 60, 70 or 80
 */
export function withImportantLine(data, line) {
  if (!LINE_CHOICES.includes(line)) return data;
  return { ...data, importantLine: line };
}

/**
 * Where a project sits on the importance against progress chart (methods
 * M20.1). The one copy of the rule: the chart, the one-pager, the PDF and the
 * email all use it, so they can never disagree.
 *   moving_well     importance above the line with Good or Excellent progress
 *   needs_managing  importance above the line with Fair progress
 *   needs_attention importance above the line with Bad progress
 *   less_important  at or below the line at any progress, or Embryonic at any
 *                   importance (exactly at the line is not above it); an
 *                   Embryonic project above the line is too early to tell
 *                   (isTooEarly)
 * @param {number|null|undefined} progress 1..5, or unset
 * @param {number} importancePct exact importance %
 * @param {number} [line] the Health Check's line (importantLine), 50 if not given
 * @returns {'moving_well'|'needs_managing'|'needs_attention'|'less_important'|null}
 *   null when there is no progress rating (not drawn)
 */
export function healthCheckState(progress, importancePct, line = IMPORTANT_ABOVE) {
  if (progress == null) return null;
  if (progress === 1 || !isAboveLine(importancePct, line)) return 'less_important';
  if (progress >= 4) return 'moving_well';
  if (progress === 3) return 'needs_managing';
  return 'needs_attention';
}

/**
 * An Embryonic project above the line: important, but too early to tell.
 * @param {number|null|undefined} progress
 * @param {number} importancePct
 * @param {number} [line]
 */
export function isTooEarly(progress, importancePct, line = IMPORTANT_ABOVE) {
  return progress === 1 && isAboveLine(importancePct, line);
}

/**
 * Projects ranked most in need of attention first; ties go to the higher
 * importance, then the higher resource. Each factor counts by its level
 * (csfLevel: `level` on the factor item, Very important when there is none).
 * @param {{id: string, text: string}[]} projects
 * @param {{id: string, text: string, level?: number}[]} factors
 * @param {Object} ownerRatings ratings.owner: projectId -> {contrib, progress, resource}
 * @returns {{project: object, index: number, importance: number, rated: boolean, progress: number|null, resource: number|null, contrib: Object<string, number>, attention: number}[]}
 *   index is the project's place in the list given
 */
export function rankProjects(projects, factors, ownerRatings) {
  const factorIds = factors.map((f) => f.id);
  const levels = csfLevels(factors);
  return projects
    .map((project, index) => {
      const r = ownerRatings?.[project.id] || {};
      const importance = strategicImportance(r.contrib, factorIds, levels);
      const progress = r.progress ?? null;
      return {
        project,
        index,
        importance,
        rated: isRated(r.contrib, factorIds),
        progress,
        resource: r.resource ?? null,
        contrib: r.contrib || {},
        attention: attentionScore(importance, progress, r.resource),
      };
    })
    .sort((a, b) => (b.attention - a.attention)
      || (b.importance - a.importance)
      || (resourceOrModerate(b.resource) - resourceOrModerate(a.resource)));
}

// ---------------------------------------------------------------- At a glance
// The results lead with one headline figure and up to three questions
// (methods M20.1, version 1.4; Tim, 28 Oct, 14:00 to 15:26). They hold up a
// mirror: each reason says what was rated, never that something doesn't
// matter (rule 65). `theirs` gives the example report's wording ("They",
// "their").

/** Progress and resource in a word, by rating 1..5, as the reasons say them. */
export const PROGRESS_NAMES = ['', 'Embryonic', 'Bad', 'Fair', 'Good', 'Excellent'];
export const RESOURCE_NAMES = ['', 'Minimal', 'Low', 'Moderate', 'High', 'Very high'];

const joinAnd = (parts) => (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * The headline: the important projects moving well, of every important one.
 * Important means above the line, with a progress rating, including those
 * too early to tell, so the parts always add up to the total.
 *   big   "2 of 5" ("0" with none important)
 *   line  "important projects are moving well." ("is" when 1 is moving well),
 *         or "None of your important projects is under way yet."
 *   rest  "1 needs managing, 1 needs attention and 1 is too early to tell.",
 *         or "" when every important project is moving well
 * @param {ReturnType<typeof rankProjects>} ranked
 * @param {{line?: number, theirs?: boolean}} [opts]
 */
export function headline(ranked, { line = IMPORTANT_ABOVE, theirs = false } = {}) {
  const counts = { movingWell: 0, needsManaging: 0, needsAttention: 0, tooEarly: 0 };
  (ranked || []).forEach((r) => {
    const state = healthCheckState(r.progress, r.importance, line);
    if (state === 'moving_well') counts.movingWell += 1;
    else if (state === 'needs_managing') counts.needsManaging += 1;
    else if (state === 'needs_attention') counts.needsAttention += 1;
    else if (isTooEarly(r.progress, r.importance, line)) counts.tooEarly += 1;
  });
  const important = counts.movingWell + counts.needsManaging + counts.needsAttention + counts.tooEarly;
  const parts = [];
  if (counts.needsManaging) parts.push(`${counts.needsManaging} ${counts.needsManaging === 1 ? 'needs' : 'need'} managing`);
  if (counts.needsAttention) parts.push(`${counts.needsAttention} ${counts.needsAttention === 1 ? 'needs' : 'need'} attention`);
  if (counts.tooEarly) parts.push(`${counts.tooEarly} ${counts.tooEarly === 1 ? 'is' : 'are'} too early to tell`);
  const rest = parts.length ? `${joinAnd(parts)}.` : '';
  if (!important) {
    return { ...counts, important, big: '0', line: `None of ${theirs ? 'their' : 'your'} important projects is under way yet.`, rest: '' };
  }
  return {
    ...counts,
    important,
    big: `${counts.movingWell} of ${important}`,
    line: `important projects ${counts.movingWell === 1 ? 'is' : 'are'} moving well.`,
    rest: rest.charAt(0).toUpperCase() + rest.slice(1),
  };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "YYYY-MM" (or the start of "YYYY-MM-DD") as a month count; a Date by its local month; else null. */
function monthCount(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear() * 12 + value.getMonth();
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})/.exec(value) : null;
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

const monthWords = (count) => `${MONTH_NAMES[count % 12]} ${Math.floor(count / 12)}`;

/** A Timing question is asked when a project is due within this many months. */
export const DUE_SOON_MONTHS = 3;

/**
 * "it’s due to finish this month", "next month", "in 2 months", or, when the
 * month is past, "it was due to finish in Sep 2026".
 * @param {number} monthsLeft due month minus the Health Check's month
 * @param {string} dueWords "Mon YYYY"
 */
export function dueWhen(monthsLeft, dueWords) {
  if (monthsLeft < 0) return `it was due to finish in ${dueWords}`;
  if (monthsLeft === 0) return 'it’s due to finish this month';
  if (monthsLeft === 1) return 'it’s due to finish next month';
  return `it’s due to finish in ${monthsLeft} months`;
}

/**
 * The questions to start with: up to three, the most urgent first, each kind
 * at most once, and no project named twice.
 *   timing    above the line, progress Bad or Fair, due to finish within 3
 *             months of the Health Check's month or already past it; the
 *             highest in the attention order
 *   progress  the highest-ranked project that needs attention
 *   resource  rated, with a progress rating, at or below the line, resource
 *             High or Very high; the highest resource first, then the lowest
 *             importance, then the list order
 *   csf       a CSF no project rates High (3); the heavier first, then the
 *             first in the list
 *   on_track  only when none of the others applies
 * @param {ReturnType<typeof rankProjects>} ranked
 * @param {{id: string, text: string, level?: number}[]} factors
 * @param {{line?: number, asOf?: string|Date, theirs?: boolean}} [opts]
 *   asOf: the Health Check's date ("YYYY-MM", "YYYY-MM-DD" or a Date); the
 *   Timing question is left out without it
 * @returns {{kind: 'timing'|'progress'|'resource'|'csf'|'on_track', label: string, question: string, reason: string, projectId?: string, csfId?: string}[]}
 */
export function questions(ranked, factors, { line = IMPORTANT_ABOVE, asOf, theirs = false } = {}) {
  const rows = ranked || [];
  const they = theirs ? 'They' : 'You';
  const whose = theirs ? 'their' : 'your';
  const out = [];
  const named = new Set();
  const ask = (q) => {
    out.push(q);
    if (q.projectId) named.add(q.projectId);
  };

  const now = monthCount(asOf);
  if (now != null) {
    for (const r of rows) {
      const due = r.project?.due === 'open' ? null : monthCount(r.project?.due);
      if (due == null || !isAboveLine(r.importance, line) || !(r.progress === 2 || r.progress === 3)) continue;
      const left = due - now;
      if (left > DUE_SOON_MONTHS) continue;
      ask({
        kind: 'timing',
        label: 'Timing',
        question: `Is “${r.project.text}” worth a sprint of extra resource to finish by ${monthWords(due)}, or should its timeline change?`,
        reason: `${they} rated its progress ${PROGRESS_NAMES[r.progress]}, and ${dueWhen(left, monthWords(due))}.`,
        projectId: r.project.id,
      });
      break;
    }
  }

  const fix = rows.find((r) => !named.has(r.project.id) && healthCheckState(r.progress, r.importance, line) === 'needs_attention');
  if (fix) {
    ask({
      kind: 'progress',
      label: 'Progress',
      question: `What would get “${fix.project.text}” back on track?`,
      reason: `${they} rated its progress ${PROGRESS_NAMES[fix.progress]}, and it’s above ${whose} line for important.`,
      projectId: fix.project.id,
    });
  }

  const heavy = rows
    .filter((r) => !named.has(r.project.id) && r.rated && r.progress != null && !isAboveLine(r.importance, line) && r.resource >= 4)
    .sort((a, b) => (b.resource - a.resource) || (a.importance - b.importance) || (a.index - b.index))[0];
  if (heavy) {
    ask({
      kind: 'resource',
      label: 'Resource',
      question: `Is “${heavy.project.text}” worth the resource it takes?`,
      reason: `${they} rated its resource ${RESOURCE_NAMES[heavy.resource]}, and its strategic importance is ${roundPct(heavy.importance)}%.`,
      projectId: heavy.project.id,
    });
  }

  const gap = (factors || [])
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !rows.some((r) => r.contrib?.[f.id] === MAX_CONTRIBUTION))
    .sort((a, b) => (csfLevel(b.f) - csfLevel(a.f)) || (a.i - b.i))[0];
  if (gap) {
    ask({
      kind: 'csf',
      label: 'CSF cover',
      question: `What could strongly support “${gap.f.text}”?`,
      reason: `${they} didn’t rate any project High for this CSF.`,
      csfId: gap.f.id,
    });
  }

  if (!out.length) {
    ask({
      kind: 'on_track',
      label: 'On track',
      question: `What will keep ${whose} important projects on track?`,
      reason: 'None of them needs action right now.',
    });
  }
  return out.slice(0, 3);
}

/**
 * Which CSFs no project rates High (3), in the list's order. Their cards say
 * "No project strongly supports this yet."
 * @param {ReturnType<typeof rankProjects>} ranked
 * @param {{id: string}[]} factors
 * @returns {string[]} CSF ids
 */
export function csfsWithoutHigh(ranked, factors) {
  return (factors || []).filter((f) => !(ranked || []).some((r) => r.contrib?.[f.id] === MAX_CONTRIBUTION)).map((f) => f.id);
}

/**
 * Dot size on the chart, from resource: Minimal or Low small, Moderate
 * middle, High or Very high large. A blank resource counts as Moderate.
 * @param {number|null|undefined} resource 1..5
 * @returns {'small'|'middle'|'large'}
 */
export function dotSize(resource) {
  const r = resourceOrModerate(resource);
  if (r <= 2) return 'small';
  return r === 3 ? 'middle' : 'large';
}
