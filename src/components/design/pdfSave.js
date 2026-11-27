import { loadWithReload } from '../../lib/loadWithReload';
import { closePdfTab, openPdfFile, pdfTab } from '../../lib/pdf/saveFile';

// Makes a PDF on the shared template and saves it. Shared by PdfDownload and
// any other trigger (the Health Check's Download a PDF card). The PDF code
// loads only when a PDF is asked for.

export const PDF_ERROR = 'Your PDF wasn’t made. Check your connection and try again.';

/**
 * @param {() => Object|Promise<Object>} getDocument the document description (src/lib/pdf/render.js), or
 *   { storedPdf: { bytes, fileName } } for a PDF already made and kept (a signed agreement's: 064), saved as it is
 * @param {'light'|'dark'} look
 * @returns {Promise<string>} the file name
 */
export async function savePdf(getDocument, look) {
  const doc = await getDocument();
  if (doc?.storedPdf) {
    const { savePdfFile } = await loadWithReload(() => import('../../lib/pdf/saveFile'));
    return savePdfFile(doc.storedPdf.bytes, doc.storedPdf.fileName);
  }
  const { downloadPdf } = await loadWithReload(() => import('../../lib/pdf/download'));
  return downloadPdf(doc, look);
}

/**
 * Opens a PDF to read rather than saving it (Stage D item 14: a signed agreement's row): a new tab on a laptop, whose
 * viewer has its own Download, and the phone's own PDF viewer (openPdfFile). Call it straight from the tap: the tab
 * opens before anything is awaited, so no pop-up blocker stops it.
 * @param {() => Object|Promise<Object>} getDocument as savePdf's
 * @param {'light'|'dark'} look
 * @returns {Promise<'tab'|'file'>}
 */
export async function openPdf(getDocument, look) {
  const tab = pdfTab();
  try {
    const doc = await getDocument();
    if (doc?.storedPdf) return openPdfFile(doc.storedPdf.bytes, doc.storedPdf.fileName, tab);
    const { makePdf } = await loadWithReload(() => import('../../lib/pdf/download'));
    const { bytes, fileName } = await makePdf(doc, look);
    return openPdfFile(bytes, fileName, tab);
  } catch (error) {
    closePdfTab(tab);
    throw error;
  }
}
