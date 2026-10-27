import { cleanItems } from '../alignmentFlow';
import { loadWithReload } from '../../../lib/loadWithReload';
import { rankProjects } from '../../../lib/alignmentScore';
import { formatUkDate, getLocalDateKey, parseDbTimestamp } from '../../../lib/dateFormatter';

// Builds and downloads the PDF. @react-pdf/renderer is imported only when a
// PDF is asked for, so the one-pager itself stays light.

let measureCtx = null;
const measure = (text, size) => {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${size}px "DM Sans", "Helvetica Neue", Arial, sans-serif`;
    return measureCtx.measureText(text).width;
  } catch {
    return text.length * size * 0.55;
  }
};

/** Safe file name: Strategic-Alignment-Health-Check-<first word>-<YYYY-MM-DD>.pdf */
export function pdfFileName(objective, completedAt) {
  const word = (objective.trim().split(/\s+/)[0] || 'Results').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'Results';
  const date = completedAt ? parseDbTimestamp(completedAt) : new Date();
  return `Strategic-Alignment-Health-Check-${word}-${getLocalDateKey(date)}.pdf`;
}

/**
 * @param {Object} draft the answers
 * @param {'light'|'dark'} variant
 * @param {string|null} completedAt
 * @returns {Promise<Blob>}
 */
export async function buildPdfBlob(draft, variant, completedAt) {
  const [{ pdf }, { default: AlignmentPdf }, React] = await Promise.all([
    loadWithReload(() => import('@react-pdf/renderer')),
    loadWithReload(() => import('./AlignmentPdf')),
    import('react'),
  ]);
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const ranked = rankProjects(projects, factors, draft.ratings).map((r, i) => ({
    id: r.project.id, text: r.project.text, importance: r.importance, rated: r.rated, progress: r.progress, resource: r.resource, n: i + 1,
  }));
  const element = React.createElement(AlignmentPdf, {
    variant,
    objective: draft.objective.trim(),
    factors,
    ranked,
    dateText: formatUkDate(completedAt || new Date().toISOString()),
    measure,
  });
  return pdf(element).toBlob();
}

/** Builds the PDF and downloads it as a file (no print dialog). */
export async function downloadPdf(draft, variant, completedAt) {
  const blob = await buildPdfBlob(draft, variant, completedAt);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName(draft.objective, completedAt);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
