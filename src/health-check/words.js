// The Health Check's words (mock-up M7b version 51; Success Factors, never
// Critical Success Factors: Tim, 14 Nov, 09:38), and its results worked
// out from src/lib/scores/m20.js (methods M20.1, version 1.4). Definitions are
// Claude's drafts, for a coach to edit.

import { cleanItems } from '../pages/alignment/alignmentFlow.js';
import { roundPct } from '../lib/alignmentScore.js';
import {
  M20_CSF_LEVELS, M20_LINE_CHOICES, M20_IMPORTANCE_LINE, m20CsfLevel, m20CsfLevelName, m20CsfsWithoutHigh, m20DotSize, m20Headline,
  m20ImportantLine, m20IsTooEarly, m20Questions, m20RankProjects, m20State,
} from '../lib/scores/m20.js';
import { projectDatesText } from '../lib/projectDates.js';

export const CON = [
  ['None', 'It doesn’t move this Success Factor.'],
  ['Low', 'It helps a little, or only indirectly.'],
  ['Medium', 'It clearly helps, but the Success Factor doesn’t depend on it.'],
  ['High', 'This Success Factor would be hard to achieve without it.'],
];
// index 1 to 5
export const PROG = [null,
  ['Embryonic', 'It’s still an idea or being scoped, with no agreed plan, owner or resources yet.'],
  ['Bad', 'It’s well off track, with key milestones slipping or no clear way through.'],
  ['Fair', 'It’s moving, but slower than planned or with problems being fixed.'],
  ['Good', 'It’s on track, with milestones met and problems handled within the team.'],
  ['Excellent', 'It’s ahead of plan, or already delivering what it was for.'],
];
export const PROGS = ['', 'Embryonic', 'Bad', 'Fair', 'Good', 'Excellent'];
export const RES = [null,
  ['Minimal', 'It can be done alongside normal work.'],
  ['Low', 'It needs a small amount of someone’s time or budget.'],
  ['Moderate', 'It needs real time from a few people, or a noticeable budget.'],
  ['High', 'It needs a dedicated team or a large budget.'],
  ['Very high', 'It’s one of the biggest demands on the organisation’s people or money.'],
];

// The third word of each is the PDF's line under its list; the page shows none (Tim, 14 Nov, 09:46).
export const SORTS = [
  ['att', 'Most in need of attention', 'The one most in need of attention comes first.'],
  ['imp', 'Strategic importance', 'The most important comes first.'],
  ['prog', 'Progress', 'The one with the least progress comes first.'],
  ['res', 'Resource required', 'The one needing the most resource comes first.'],
];

/** The drawing class for each state: mint filled, an outline, a soft coral double ring, a grey ring. */
const Q = { moving_well: 'mi', needs_managing: 'pe', needs_attention: 'co', less_important: '' };

/** The ranked rows the results, the chart and the PDF draw from, against the Health Check's own line. */
export function resultRows(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const line = m20ImportantLine(draft);
  return m20RankProjects(projects, factors, draft.ratings).map((r, i) => {
    const state = m20State(r.progress, r.importance, line);
    return {
      n: i + 1,
      id: r.project.id,
      text: r.project.text,
      project: r.project,
      importance: r.importance,
      pct: roundPct(r.importance),
      rated: r.rated,
      progress: r.progress,
      resource: r.resource,
      contrib: r.contrib,
      index: r.index,
      line,
      state,
      q: Q[state] ?? '',
      early: m20IsTooEarly(r.progress, r.importance, line),
      size: m20DotSize(r.resource),
      dates: projectDatesText(r.project),
    };
  });
}

/** The Success Factor levels, most first: Critical, Very important, Important. */
export const CSF_LEVELS = M20_CSF_LEVELS;
export const csfLevel = m20CsfLevel;
export const csfLevelName = m20CsfLevelName;

/** The choices for "Important means above", 50% suggested. */
export const LINE_OPTIONS = M20_LINE_CHOICES.map((v) => ({ value: v, label: `${v}%${v === M20_IMPORTANCE_LINE ? ', suggested' : ''}` }));

/**
 * Everything the results page shows, worked out once: the rows, the line, the
 * headline, the questions to start with and the Success Factors no project rates High.
 * @param {Object} draft the answers
 * @param {{asOf?: string|Date, theirs?: boolean}} [opts] asOf: the Health
 *   Check's date (the completed date, or today), for the Timing question
 */
export function resultsModel(draft, { asOf, theirs = false } = {}) {
  const factors = cleanItems(draft.csfs);
  const rows = resultRows(draft);
  const line = m20ImportantLine(draft);
  return {
    rows,
    factors,
    line,
    headline: m20Headline(rows, { line, theirs }),
    questions: m20Questions(rows, factors, { line, asOf, theirs }),
    gaps: m20CsfsWithoutHigh(rows, factors),
  };
}

/** The state in a word or two, for the project list. */
export function stateWords(row) {
  if (row.progress == null || !row.rated) return 'Not rated yet';
  if (row.q === 'mi') return 'Moving well';
  if (row.q === 'pe') return 'Needs managing';
  if (row.q === 'co') return 'Needs attention';
  return row.early ? 'Too early to tell' : 'Less important';
}

/** The state as a sentence, for pop-ups and screen readers. */
export function stateSentence(row) {
  if (row.progress == null || !row.rated) return 'It isn’t fully rated yet.';
  if (row.q === 'mi') return 'It’s important and moving well.';
  if (row.q === 'pe') return 'It’s important and needs managing.';
  if (row.q === 'co') return 'It’s important and needs attention.';
  return row.early ? 'It’s important, but it’s too early to tell.' : 'It’s less important to the objective.';
}

/**
 * The headline as one or two sentences, for the PDF's chart and the
 * completion email: "2 of 5 important projects are moving well. 1 needs
 * managing and 2 need attention.", or "None of your important projects is
 * under way yet."
 * @param {ReturnType<typeof m20Headline>} headline
 */
export function headlineSentence(headline) {
  if (!headline.important) return headline.line;
  if (headline.important === 1) return [headlineLine(headline), headline.rest].filter(Boolean).join(' ');
  return [`${headline.big} ${headline.line}`, headline.rest].filter(Boolean).join(' ');
}

/**
 * The results' opening sentence (M7b version 51: one sentence, never a big
 * figure): "2 of your 5 important projects are moving well.", "their" on the
 * example report, or "None of your important projects is under way yet."
 * What needs you follows on its own line (headline.rest).
 */
export function headlineLine(headline, theirs = false) {
  if (!headline.important) return headline.line;
  // One important project is said as one (the break-it tester, 15 Nov):
  // never "0 of your 1 important projects".
  if (headline.important === 1) {
    return `${theirs ? 'Their' : 'Your'} one important project ${headline.movingWell ? 'is' : 'isn’t'} moving well${headline.movingWell ? '' : ' yet'}.`;
  }
  return `${headline.movingWell} of ${theirs ? 'their' : 'your'} ${headline.important} important projects ${headline.movingWell === 1 ? 'is' : 'are'} moving well.`;
}

/** Strategic importance has one definition, word for word, in every pop-up (version 47). */
export const IMPORTANCE_MEANS = 'It’s how much a project helps the Success Factors, out of 100%.';
/** The order of "Most in need of attention", in full (version 47: never "behind"). */
export const ORDER_MEANS = 'Important projects that need attention and require more resource come first.';

/**
 * The ⓘ beside the chart's heading (M7b version 51; the wording of 13 Nov,
 * 18:13): how to read the chart, each mark's word then its meaning. The line's
 * figure follows the line the person set.
 */
export const CHART_TITLE = 'Strategic importance against progress';
export function chartInfo(line) {
  return [
    { bold: CHART_TITLE },
    { term: 'Each dot', meaning: 'It’s a project, numbered as in the list below.' },
    { term: 'Bigger dots', meaning: 'They show projects that require more resource.' },
    { term: 'Important', meaning: `It’s a project above the line you set, which is now ${line}%.` },
    { term: 'Too early to tell', meaning: 'It’s a project at the Embryonic stage.' },
  ];
}
/** The older name, kept for the portal's older route. */
export const howItWorks = chartInfo;

/**
 * How to read the chart, in the side panel (Tim, 16 Nov, 23:31: what a
 * chart's marks mean opens in the panel, from "How to read the chart"
 * under the chart). Each mark's word, then its meaning.
 */
export function chartExplain(line) {
  return {
    title: 'How to read the chart',
    terms: chartInfo(line).filter((l) => l.term),
  };
}

/** What a Success Factor is and isn't, in the side panel (no bullets there). */
export const SUCCESS_FACTOR_EXPLAIN = {
  title: 'What is a Success Factor?',
  lines: [
    'It’s one of the few things that must go right for you to reach your objective.',
    'For example, “Win and keep enterprise clients”.',
  ],
  terms: [
    { term: 'It’s not a project or a task', meaning: 'For example, “Launch the new CRM”.' },
    { term: 'It’s not a target or a measure', meaning: 'For example, “£40m in revenue”.' },
  ],
};

/** The one short line behind the ⓘ on "Strategic importance" (a pop-up holds one line). */
export const IMPORTANCE_SHORT = 'It’s how much a project helps the Success Factors.';
/** The one short line behind the projects step's ⓘ. */
export const PROJECTS_SHORT = 'It’s anything that takes your team’s time, money or people.';

/** What a Success Factor is, and what it isn't (Tim, 14 Nov, 09:29 and 09:41). */
export const SUCCESS_FACTOR_INFO = [
  { bold: 'What is a Success Factor?' },
  { line: 'It’s one of the few things that must go right for you to reach your objective.' },
  { line: 'For example, “Win and keep enterprise clients”.' },
  { heading: 'What it’s not:' },
  { bullets: ['A project or a task, such as “Launch the new CRM”.', 'A target or a measure, such as “£40m in revenue”.'] },
];

/** The ⓘ beside the list's order line explains only that order (Tim, 28 Oct, 14:37). */
export const ORDER_LINES = [
  { bold: 'Most in need of attention' },
  { line: ORDER_MEANS },
];

/**
 * The ⓘ on the "Strategic importance" column heading, the same on the example
 * report. It no longer explains the weights (Tim, 14 Nov, 09:46); the scoring
 * is unchanged.
 */
export function importanceLines() {
  return [
    { bold: 'Strategic importance' },
    { line: IMPORTANCE_MEANS },
    { line: 'High on every Success Factor scores 100%.' },
  ];
}

/** Sorts the ranked rows for the project list. */
export function sortRows(rows, key) {
  const out = rows.slice();
  const cmp = {
    imp: (a, b) => b.importance - a.importance,
    prog: (a, b) => (a.progress ?? 9) - (b.progress ?? 9),
    res: (a, b) => (b.resource ?? 0) - (a.resource ?? 0),
  }[key];
  if (cmp) out.sort((a, b) => cmp(a, b) || a.n - b.n);
  return out;
}

// The documents the reading pop-up opens (Reading.jsx), with their own pages.
export const READING = {
  privacy: { key: 'privacy', title: 'Privacy Policy', href: '/legal/privacy' },
  dataStorage: { key: 'dataStorage', title: 'Data Storage Notice', href: '/legal/data-storage' },
};
