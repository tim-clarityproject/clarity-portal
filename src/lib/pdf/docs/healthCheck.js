import { cleanItems, PROGRESS, RESOURCE } from '../../../pages/alignment/alignmentFlow';
import { rankProjects, roundPct, MAX_CONTRIBUTION } from '../../alignmentScore';
import { quadrant, PROGRESS_WORDS } from '../../../pages/alignment/chartLayout';
import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';

// The Strategic Alignment Health Check as a document for the shared PDF template.

const STANDARD = 50; // the line between more and less important, as on the results page
// Words for the four parts of the importance against progress chart, used
// in the sentence and the screen-reader description only: the chart itself
// names no quadrants, as on the results page. Progress "Fair" sits on the
// centre line.
const AREAS = {
  topLeft: 'Important but behind',
  topRight: 'Important and moving well',
  bottomLeft: 'Less important and behind',
  bottomRight: 'Less important and moving well',
};
const word = (list, v) => (v == null ? '' : (list.find(([k]) => k === v)?.[1] || ''));

/** True when the answers changed after the Health Check was finished. */
export function changedSince(updatedAt, completedAt) {
  if (!updatedAt || !completedAt) return false;
  return parseDbTimestamp(updatedAt).getTime() - parseDbTimestamp(completedAt).getTime() > 60000;
}

/**
 * @param {Object} input
 * @param {Object} input.draft the answers: objective, csfs, projects, ratings
 * @param {string|null} [input.completedAt]
 * @param {string|null} [input.updatedAt] the last save; shown as "Updated" when after completion
 * @param {string|null} [input.organisation] the client's organisation, when known
 */
export function healthCheckPdf({ draft, completedAt = null, updatedAt = null, organisation = null }) {
  const factors = cleanItems(draft.csfs || []);
  const projects = cleanItems(draft.projects || []);
  const ranked = rankProjects(projects, factors, draft.ratings).map((r, i) => ({ ...r, text: r.project.text, n: i + 1 }));
  const nf = factors.length;
  const n = ranked.length;
  // a project with no contribution ratings has no importance to show yet
  const rated = (r) => Object.keys(draft.ratings?.[r.project.id]?.contrib || {}).length > 0;
  const scoredRows = ranked.filter(rated);
  const m = scoredRows.length;
  const scored = m > 0;
  const average = scored ? roundPct(scoredRows.reduce((s, r) => s + r.importance, 0) / scoredRows.length) : 0;
  const org = organisation?.trim() || null;
  // the chart shows projects with a progress rating, as on the results page
  const plotted = ranked.filter((r) => r.progress != null);
  const good = plotted.filter((r) => quadrant(r.progress, r.importance) === 'mi').length;
  const behind = plotted.filter((r) => quadrant(r.progress, r.importance) === 'co').length;
  const quadrantName = (r) => {
    if (r.progress === 3) return 'on the centre line';
    const top = r.importance > STANDARD;
    if (r.progress > 3) return (top ? AREAS.topRight : AREAS.bottomRight).toLowerCase();
    return (top ? AREAS.topLeft : AREAS.bottomLeft).toLowerCase();
  };
  const dotSentence = () => {
    const one = plotted.length === 1 ? plotted[0] : null;
    // The chart names no quadrants, so the sentence says what the words mean.
    const onLine = (r) => `${r.text} has Fair progress, so it sits on the line between behind and moving well.`;
    const facts = (r) => `${roundPct(r.importance)}% strategic importance and ${PROGRESS_WORDS[r.progress - 1]} progress`;
    const first = one
      ? (one.progress === 3 ? onLine(one) : `${one.text} is ${quadrantName(one)}: ${facts(one)}.`)
      : `${good} of ${plotted.length} projects ${good === 1 ? 'is' : 'are'} important and moving well: above ${STANDARD}% strategic importance, with Good or Excellent progress.${behind ? ` ${behind} ${behind === 1 ? 'is' : 'are'} important but behind, with Embryonic or Bad progress, so ${behind === 1 ? 'it needs' : 'they need'} attention first.` : ''}`;
    const missing = n - plotted.length;
    const rest = missing ? ` ${missing} ${missing === 1 ? 'project has' : 'projects have'} no progress rating yet, so ${missing === 1 ? 'it is' : 'they are'} not on the chart.` : '';
    return first + rest;
  };

  return {
    docName: 'Health Check',
    title: 'Strategic Alignment Health Check',
    who: org,
    confidential: true,
    details: [org, formatDocDate(completedAt || new Date()), 'Strategic Alignment Health Check'],
    updatedAt: changedSince(updatedAt, completedAt) ? updatedAt : null,
    date: completedAt || new Date(),
    subject: 'Strategic Alignment Health Check results',
    glance: [
      { label: 'Projects', value: String(n), big: true },
      { label: 'Critical Success Factors', value: String(nf), big: true },
      ...(scored ? [
        { label: 'Average strategic importance', value: `${average}%`, big: true },
        ...(plotted.length ? [{ label: AREAS.topRight, value: `${good} of ${plotted.length}`, big: true }] : []),
      ] : []),
    ],
    sections: [
      { title: 'Objective', blocks: [{ type: 'text', text: draft.objective || '' }] },
      { title: 'Critical Success Factors', blocks: [{ type: 'list', ordered: true, items: factors.map((f) => f.text) }] },
      {
        title: 'Strategic importance versus progress',
        blocks: plotted.length ? [{
          type: 'dots',
          points: plotted.map((r) => ({ n: r.n, label: r.text, x: r.progress, y: r.importance, good: quadrant(r.progress, r.importance) === 'mi' })),
          xLabels: PROGRESS_WORDS,
          yMax: 100,
          xCentre: 3,
          yCentre: STANDARD,
          axisX: 'Progress',
          axisY: 'Strategic importance',
          keyGood: 'Coral: important and moving well',
          keyOther: 'Grey outline: every other project',
          listNote: 'Numbers match the project table.',
          sentence: dotSentence(),
          alt: `Dot chart of strategic importance, from 0% to 100%, against progress, from Embryonic to Excellent, divided by lines at ${STANDARD}% and Fair. ${plotted.map((r) => `${r.n}. ${r.text}: ${roundPct(r.importance)}%, ${PROGRESS_WORDS[r.progress - 1]}, ${quadrantName(r)}`).join('. ')}.`,
        }] : [],
      },
      {
        title: 'Your projects',
        blocks: [
          { type: 'text', tone: 'detail', text: 'Most in need of attention first.' },
          {
            type: 'table',
            columns: [
              { label: 'No.', width: 0.45 },
              { label: 'Project', width: 3 },
              { label: 'Strategic importance', width: 1.15, align: 'right' },
              { label: 'Progress', width: 1.05 },
              { label: 'Resource required', width: 1.15 },
            ],
            rows: ranked.map((r) => [String(r.n), r.text, rated(r) ? `${roundPct(r.importance)}%` : '', word(PROGRESS, r.progress), word(RESOURCE, r.resource)]),
          },
          {
            type: 'text',
            tone: 'detail',
            text: `Strategic importance: a project’s contribution scores added together, divided by the highest possible score (${nf} Critical Success Factors × ${MAX_CONTRIBUTION} = ${nf * MAX_CONTRIBUTION}), shown as a percentage.`,
          },
        ],
      },
    ],
  };
}
