import { cleanItems, PROGRESS, RESOURCE } from '../../../pages/alignment/alignmentFlow';
import { importanceText, roundPct, MAX_CONTRIBUTION } from '../../alignmentScore';
import { PROGRESS_WORDS } from '../../../pages/alignment/chartLayout';
import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';
import { countLine, resultRows, stateSentence, stateWords } from '../../../health-check/words';

// The Strategic Alignment Health Check as a document for the shared PDF template.

// The four states, the next step and the wording come from the results page
// (src/health-check/words.js, mock-up M7b version 4), so the page and the PDF
// never disagree. The PDF keeps a key in words (PDF rules 18 and 21), with
// the four kinds of dot told apart by shape as well as colour.

const STANDARD = 50; // the line between more and less important, as on the results page
const KEY = [
  { state: 'mi', text: 'Green dot, moving well' },
  { state: 'pe', text: 'Outlined dot, needs managing' },
  { state: 'co', text: 'Double ring, needs attention' },
  { state: '', text: 'Grey ring, less important or too early to tell' },
];
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
  const rows = resultRows({ ...draft, csfs: draft.csfs || [], projects: draft.projects || [], ratings: draft.ratings || {} });
  const nf = factors.length;
  const n = rows.length;
  // a project with no contribution ratings for the current CSFs has no
  // importance to show yet (the same test as the results page)
  const scoredRows = rows.filter((r) => r.rated);
  const scored = scoredRows.length > 0;
  const average = scored ? roundPct(scoredRows.reduce((s, r) => s + r.importance, 0) / scoredRows.length) : 0;
  const org = organisation?.trim() || null;
  // the chart shows projects with a progress rating, as on the results page
  const plotted = rows.filter((r) => r.progress != null);
  const good = plotted.filter((r) => r.q === 'mi').length;
  const top = rows[0];
  const facts = (r) => (r.rated
    ? `${r.text} has ${r.pct}% strategic importance and ${PROGRESS_WORDS[r.progress - 1]} progress.`
    : `${r.text} has ${PROGRESS_WORDS[r.progress - 1]} progress, and its strategic importance isn’t rated yet.`);
  const dotSentence = () => {
    const first = plotted.length === 1 ? `${facts(plotted[0])} ${stateSentence(plotted[0])}` : countLine(plotted);
    const missing = n - plotted.length;
    const rest = missing ? ` ${missing} ${missing === 1 ? 'project has' : 'projects have'} no progress rating yet, so ${missing === 1 ? 'it isn’t' : 'they aren’t'} on the chart.` : '';
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
      { label: 'Critical Success Factors (CSFs)', value: String(nf), big: true },
      ...(scored ? [
        { label: 'Average strategic importance', value: `${average}%`, big: true },
        ...(plotted.length ? [{ label: 'Important and moving well', value: `${good} of ${plotted.length}`, big: true }] : []),
      ] : []),
    ],
    sections: [
      { title: 'Objective', blocks: [{ type: 'text', text: draft.objective || '' }] },
      // Headings are set in capitals, where the abbreviation would read "CSFS", so they never carry it.
      { title: 'Critical Success Factors', blocks: [{ type: 'list', ordered: true, items: factors.map((f) => f.text) }] },
      {
        title: 'Strategic importance against progress',
        blocks: plotted.length ? [{
          type: 'dots',
          points: plotted.map((r) => ({ n: r.n, label: r.text, x: r.progress, y: r.importance, state: r.q })),
          xLabels: PROGRESS_WORDS,
          yMax: 100,
          xCentre: 3,
          yCentre: STANDARD,
          axisX: 'Progress',
          axisY: 'Strategic importance',
          key: KEY,
          listNote: 'Numbers match the project table.',
          sentence: dotSentence(),
          alt: `Dot chart of strategic importance, from 0% to 100%, against progress, from Embryonic to Excellent, divided by lines at ${STANDARD}% and Fair. ${plotted.map((r) => `${r.n}. ${r.text}, ${importanceText(r).toLowerCase()}, ${PROGRESS_WORDS[r.progress - 1]}. ${stateSentence(r)}`).join(' ')}`,
        }] : [],
      },
      ...(top ? [{ title: 'Next step', blocks: [{ type: 'text', text: `Start with “${top.text}”.` }] }] : []),
      {
        title: 'Your projects',
        blocks: [
          { type: 'text', tone: 'detail', text: 'The one most in need of attention comes first.' },
          {
            type: 'table',
            columns: [
              { label: 'No.', width: 0.45 },
              { label: 'Project', width: 3 },
              { label: 'Strategic importance', width: 1.15, align: 'right' },
              { label: 'Progress', width: 1.05 },
              { label: 'Resource required', width: 1.15 },
            ],
            rows: rows.map((r) => [
              String(r.n),
              { text: r.text, detail: [stateWords(r), ...r.dates].join('\n') },
              importanceText(r),
              word(PROGRESS, r.progress),
              word(RESOURCE, r.resource),
            ]),
          },
          {
            type: 'text',
            tone: 'detail',
            text: `Strategic importance adds up a project’s contribution scores and shows them as a share of the highest possible score, ${nf * MAX_CONTRIBUTION} for ${nf} CSF${nf === 1 ? '' : 's'}.`,
          },
        ],
      },
    ],
  };
}
