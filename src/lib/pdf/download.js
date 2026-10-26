import { renderPdf } from './render';
import { loadPdfAssets } from './assets';
import { paperFor } from './paper';

// Makes a PDF from a document description and saves it as a file (no print
// dialog). Loaded only when a PDF is asked for, so pages stay light.

/**
 * @param {Object} spec the document description (see render.js)
 * @param {'light'|'dark'} variant
 * @param {Object} [options]
 * @param {string|null} [options.country] the person's country setting, when there is one
 */
export async function downloadPdf(spec, variant, { country = null } = {}) {
  const assets = await loadPdfAssets(spec);
  const { bytes, fileName } = await renderPdf(spec, { variant, paper: paperFor({ country }), assets });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return fileName;
}
