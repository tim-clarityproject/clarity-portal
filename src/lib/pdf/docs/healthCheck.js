import { PROGRESS, RESOURCE } from '../../../pages/alignment/alignmentFlow';
import { importanceText } from '../../alignmentScore';
import { PROGRESS_WORDS } from '../../../pages/alignment/chartLayout';
import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';
import {
  csfLevel, csfLevelName, headlineSentence, importanceLines, RES, resultsModel, stateSentence, stateWords,
} from '../../../health-check/words';

// The Strategic Alignment Health Check as a document for the shared PDF template.

// The PDF follows the results page (mock-up M7b version 46): the headline in
// the At a glance panel, then the objective, the questions to start with and
// their reasons, the chart (dot size shows resource, and the across line is
// the Health Check's own line for important), the CSFs with their levels, and
// the project list. Every figure and word comes from resultsModel
// (src/health-check/words.js, from src/lib/scores/m20.js), so the page and the
// PDF never disagree. The PDF keeps a key in words (PDF rules 18 and 21), with
// the four kinds of dot told apart by shape as well as colour.

const KEY = [
  { state: 'mi', text: 'Green dot, moving well' },
  { state: 'pe', text: 'Outlined dot, needs managing' },
  { state: 'co', text: 'Double ring, needs attention' },
  { state: '', text: 'Grey ring, less important or too early to tell' },
];
// Dot radii (points) for m20DotSize: small, middle and large, about the
// mock-up's 8, 12 and 17 scaled to the PDF's chart, the smallest still
// holding a two-figure number.
const RADII = { small: 8, middle: 11, large: 14.5 };
const word = (list, v) => (v == null ? '' : (list.find(([k]) => k === v)?.[1] || ''));
const resourceWord = (v) => (RES[v] || RES[3])[0]; // a blank resource counts as Moderate, as its dot size does

/** True when the answers changed after the Health Check was finished. */
export function changedSince(updatedAt, completedAt) {
  if (!updatedAt || !completedAt) return false;
  return parseDbTimestamp(updatedAt).getTime() - parseDbTimestamp(completedAt).getTime() > 60000;
}

/**
 * @param {Object} input
 * @param {Object} input.draft the answers: objective, csfs, projects, ratings, importantLine
 * @param {string|null} [input.completedAt]
 * @param {string|null} [input.updatedAt] the last save; shown as "Updated" when after completion
 * @param {string|null} [input.organisation] the client's organisation, when known
 */
export function healthCheckPdf({ draft, completedAt = null, updatedAt = null, organisation = null }) {
  // The Timing question counts from the Health Check's date: the completed
  // date, or today, as on the results page.
  const asOf = completedAt ? parseDbTimestamp(completedAt) : new Date();
  const model = resultsModel({ ...draft, csfs: draft.csfs || [], projects: draft.projects || [], ratings: draft.ratings || {} }, { asOf });
  const { rows, factors, line, headline, questions, gaps } = model;
  const nf = factors.length;
  const n = rows.length;
  const org = organisation?.trim() || null;
  // the chart shows projects with a progress rating, as on the results page
  const plotted = rows.filter((r) => r.progress != null);
  const dotSentence = () => {
    const missing = n - plotted.length;
    const rest = missing ? ` ${missing} ${missing === 1 ? 'project has' : 'projects have'} no progress rating yet, so ${missing === 1 ? 'it isn’t' : 'they aren’t'} on the chart.` : '';
    return headlineSentence(headline) + rest;
  };
  // "Strategic importance is how much a project helps your CSFs, out of 100%. …", from the column's ⓘ
  const [, first, ...more] = importanceLines();
  const importanceNote = [`Strategic importance is ${first.line.charAt(0).toLowerCase()}${first.line.slice(1)}`, ...more.map((l) => l.line)].join(' ');

  return {
    docName: 'Health Check',
    title: 'Strategic Alignment Health Check',
    who: org,
    confidential: true,
    details: [org, formatDocDate(completedAt || new Date()), 'Strategic Alignment Health Check'],
    updatedAt: changedSince(updatedAt, completedAt) ? updatedAt : null,
    date: completedAt || new Date(),
    subject: 'Strategic Alignment Health Check results',
    // the headline first (PDF rule 12): "2 of 5" important projects moving well, then the rest
    glance: [
      { label: 'Important projects moving well', value: headline.big, note: headline.important ? headline.rest : headline.line, big: true },
      { label: 'Important means above', value: `${line}%`, big: true },
      { label: 'Projects', value: String(n), big: true },
      { label: 'Critical Success Factors (CSFs)', value: String(nf), big: true },
    ],
    sections: [
      { title: 'Objective', blocks: [{ type: 'text', text: draft.objective || '' }] },
      {
        title: 'Questions to start with',
        blocks: questions.map((q) => ({ type: 'field', label: q.label, text: q.question, note: q.reason })),
      },
      {
        title: 'Strategic importance against progress',
        blocks: plotted.length ? [{
          type: 'dots',
          points: plotted.map((r) => ({ n: r.n, label: r.text, x: r.progress, y: r.importance, state: r.q, size: r.size })),
          radii: RADII,
          xLabels: PROGRESS_WORDS,
          yMax: 100,
          yTicks: [0, line, 100],
          xCentre: 3,
          yCentre: line,
          axisX: 'Progress',
          axisY: 'Strategic importance',
          key: KEY,
          keyNotes: ['Bigger dots require more resource.', `Important means above ${line}%.`],
          listNote: 'Numbers match the project table.',
          sentence: dotSentence(),
          alt: `Dot chart of strategic importance, from 0% to 100%, against progress, from Embryonic to Excellent, divided by lines at ${line}% and Fair. Important means above ${line}%. Bigger dots require more resource. ${plotted.map((r) => `${r.n}. ${r.text}, ${importanceText(r).toLowerCase()}, ${PROGRESS_WORDS[r.progress - 1]}. ${stateSentence(r)} Resource required is ${resourceWord(r.resource)}.`).join(' ')}`,
        }] : [],
      },
      // Headings are set in capitals, where the abbreviation would read "CSFS", so they never carry it.
      {
        title: 'Critical Success Factors',
        blocks: [{
          type: 'table',
          columns: [
            { label: 'No.', width: 0.45 },
            { label: 'Critical Success Factor', width: 3.9 },
            { label: 'How much it matters', width: 1.45 },
          ],
          rows: factors.map((f, i) => [
            String(i + 1),
            { text: f.text, detail: gaps.includes(f.id) ? 'No project strongly supports this yet.' : '' },
            csfLevelName(csfLevel(f)),
          ]),
        }],
      },
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
          { type: 'text', tone: 'detail', text: importanceNote },
        ],
      },
    ],
  };
}
