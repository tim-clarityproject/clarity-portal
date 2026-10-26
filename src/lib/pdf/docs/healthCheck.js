import { cleanItems, PROGRESS, RESOURCE } from '../../../pages/alignment/alignmentFlow';
import { rankProjects, roundPct, MAX_CONTRIBUTION } from '../../alignmentScore';
import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';

// The Strategic Alignment Health Check as a document for the shared PDF template.

const STANDARD = 50; // strategic importance at or above this is strongly aligned
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
  const above = scoredRows.filter((r) => roundPct(r.importance) >= STANDARD).length;
  const average = scored ? roundPct(scoredRows.reduce((s, r) => s + r.importance, 0) / scoredRows.length) : 0;
  const org = organisation?.trim() || null;
  const byImportance = scoredRows.slice().sort((a, b) => b.importance - a.importance || a.n - b.n);

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
        { label: `At or above the ${STANDARD}% standard`, value: `${above} of ${m}`, big: true },
      ] : []),
    ],
    sections: [
      { title: 'Objective', blocks: [{ type: 'text', text: draft.objective || '' }] },
      { title: 'Critical Success Factors', blocks: [{ type: 'list', ordered: true, items: factors.map((f) => f.text) }] },
      {
        title: 'Strategic importance',
        blocks: scored ? [{
          type: 'bars',
          standard: { value: STANDARD },
          rows: byImportance.map((r) => ({ label: `${r.n}. ${r.text}`, value: roundPct(r.importance) })),
          keyAbove: `At or above ${STANDARD}%`,
          keyBelow: `Below ${STANDARD}%`,
          keyStandard: `The ${STANDARD}% standard`,
          sentence: above === m
            ? `All ${m} projects are at or above the ${STANDARD}% standard: each one contributes strongly to your Critical Success Factors.`
            : `${above} of ${m} projects ${above === 1 ? 'is' : 'are'} at or above the ${STANDARD}% standard and contribute${above === 1 ? 's' : ''} strongly to your Critical Success Factors. The others contribute less.`,
          alt: `Bar chart of strategic importance for each project, on a scale from 0% to 100%, with the standard at ${STANDARD}%. ${byImportance.map((r) => `${r.n}. ${r.text}: ${roundPct(r.importance)}%`).join('. ')}.`,
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
