// The Health Check's words (mock-up M7b version 4), and its results worked
// out from src/lib/alignmentScore.js. Definitions are Claude's drafts, for
// Adie to edit.

import { cleanItems } from '../pages/alignment/alignmentFlow.js';
import { healthCheckState, rankProjects, roundPct } from '../lib/alignmentScore.js';
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

/** The ranked rows the results, the chart and the PDF draw from. */
export function resultRows(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  return rankProjects(projects, factors, draft.ratings).map((r, i) => {
    const state = healthCheckState(r.progress, r.importance);
    const early = r.progress === 1 && r.importance > 50;
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
      state,
      q: Q[state] ?? '',
      early,
      dates: projectDatesText(r.project),
    };
  });
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

/** The line counting the important projects. */
export function countLine(rows, theirs = false) {
  const c = { mi: 0, pe: 0, co: 0 };
  rows.forEach((r) => { if (r.progress != null && c[r.q] != null) c[r.q] += 1; });
  const a = [];
  if (c.mi) a.push(`${c.mi} ${c.mi === 1 ? 'is' : 'are'} moving well`);
  if (c.pe) a.push(`${c.pe} ${c.pe === 1 ? 'needs' : 'need'} managing`);
  if (c.co) a.push(`${c.co} ${c.co === 1 ? 'needs' : 'need'} attention`);
  const whose = theirs ? 'their' : 'your';
  if (!a.length) return `None of ${whose} important projects is under way yet.`;
  return `Of ${whose} important projects, ${a.length === 1 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`}.`;
}

/** How the figures are worked out, as pop-up lines. */
export function howLines(nf, theirs = false) {
  return [
    { bold: 'How it’s worked out' },
    { line: `Strategic importance is how much a project contributes across all ${theirs ? 'their' : 'your'} CSFs.` },
    { line: `It adds up the contribution scores and shows them as a share of the highest possible score, ${nf * 3} for ${nf} CSF${nf === 1 ? '' : 's'}.` },
    { line: 'Most in need of attention ranks important projects higher when their progress is weaker and they need more resource.' },
    { line: 'A project at the Embryonic stage ranks between Bad and Fair, because it’s too early to tell.' },
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
