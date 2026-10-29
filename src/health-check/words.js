// The Health Check's words (mock-up M7b version 46), and its results worked
// out from src/lib/scores/m20.js (methods M20.1, version 1.4). Definitions are
// Claude's drafts, for Adie to edit.

import { cleanItems } from '../pages/alignment/alignmentFlow.js';
import { roundPct } from '../lib/alignmentScore.js';
import {
  M20_CSF_LEVELS, M20_LINE_CHOICES, M20_IMPORTANCE_LINE, m20CsfLevel, m20CsfLevelName, m20CsfsWithoutHigh, m20DotSize, m20Headline,
  m20ImportantLine, m20IsTooEarly, m20Questions, m20RankProjects, m20State,
} from '../lib/scores/m20.js';
import { projectDatesText } from '../lib/projectDates.js';

export const CON = [
  ['None', 'It doesn’t move this CSF.'],
  ['Low', 'It helps a little, or only indirectly.'],
  ['Medium', 'It clearly helps, but the CSF doesn’t depend on it.'],
  ['High', 'This CSF would be hard to achieve without it.'],
];
// index 1 to 5
export const PROG = [null,
  ['Embryonic stage', 'It’s still an idea or being scoped, with no agreed plan, owner or resources yet.'],
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

/** The CSF levels, most first: Critical, Very important, Important. */
export const CSF_LEVELS = M20_CSF_LEVELS;
export const csfLevel = m20CsfLevel;
export const csfLevelName = m20CsfLevelName;

/** The choices for "Important means above", 50% suggested. */
export const LINE_OPTIONS = M20_LINE_CHOICES.map((v) => ({ value: v, label: `${v}%${v === M20_IMPORTANCE_LINE ? ', suggested' : ''}` }));

/**
 * Everything the results page shows, worked out once: the rows, the line, the
 * headline, the questions to start with and the CSFs no project rates High.
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
  return [`${headline.big} ${headline.line}`, headline.rest].filter(Boolean).join(' ');
}

/** How it works, at the top of the results: the word, then its meaning (Tim, 28 Oct, 14:21). */
export function howItWorks(line) {
  return [
    { bold: 'How it works' },
    { term: 'Strategic importance', meaning: 'How much a project helps the CSFs, counting the ones that matter most more, out of 100%.' },
    { term: 'Important', meaning: `A project above the line you set, which is now ${line}%.` },
    { term: 'Most in need of attention', meaning: 'Important projects that are behind and require more resource come first.' },
    { term: 'Too early to tell', meaning: 'A project at the Embryonic stage.' },
    { term: 'Bigger dots', meaning: 'Projects that require more resource.' },
  ];
}

/** The ⓘ beside the list's order line explains only that order (Tim, 28 Oct, 14:37). */
export const ORDER_LINES = [
  { bold: 'Most in need of attention' },
  { line: 'Important projects that are behind and require more resource come first.' },
];

/** The ⓘ on the "Strategic importance" column heading (Tim, 28 Oct, 14:37 and 14:40). */
export function importanceLines(theirs = false) {
  return [
    { bold: 'Strategic importance' },
    { line: `How much a project helps ${theirs ? 'their' : 'your'} CSFs, out of 100%.` },
    { line: 'High on every CSF scores 100%.' },
    { line: 'A Critical CSF counts 40% more than an Important one, and a Very important one 20% more.' },
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
