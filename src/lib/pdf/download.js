import { renderPdf } from './render';
import { loadPdfAssets } from './assets';
import { paperFor } from './paper';
import { savePdfFile } from './saveFile';
import { businessFacts } from './business';

// Makes a PDF from a document description and saves it as a file (no print
// dialog). Loaded only when a PDF is asked for, so pages stay light.

/**
 * @param {Object} spec the document description (see render.js)
 * @param {'light'|'dark'} variant
 * @param {Object} [options]
 * @param {string|null} [options.country] the person's country setting, when there is one
 */
export async function downloadPdf(given, variant, { country = null } = {}) {
  const { bytes, fileName } = await makePdf(given, variant, { country });
  return savePdfFile(bytes, fileName);
}

/** The same PDF's bytes and file name, not yet handed over (opened in a tab by openPdf: Stage D item 14). */
export async function makePdf(given, variant, { country = null } = {}) {
  // The footer's company name and number come from the business's own settings (068), never the code.
  const facts = given.business ? null : await businessFacts();
  const spec = facts ? { ...given, business: facts } : given;
  const assets = await loadPdfAssets(spec);
  return renderPdf(spec, { variant, paper: paperFor({ country }), assets });
}
