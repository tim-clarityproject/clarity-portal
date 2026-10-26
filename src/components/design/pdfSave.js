import { loadWithReload } from '../../lib/loadWithReload';

// Makes a PDF on the shared template and saves it. Shared by PdfDownload and
// any other trigger (the Health Check's Download a PDF card). The PDF code
// loads only when a PDF is asked for.

export const PDF_ERROR = 'Your PDF wasn’t made. Check your connection and try again.';

/**
 * @param {() => Object|Promise<Object>} getDocument the document description (src/lib/pdf/render.js)
 * @param {'light'|'dark'} look
 * @returns {Promise<string>} the file name
 */
export async function savePdf(getDocument, look) {
  const [doc, { downloadPdf }] = await Promise.all([
    getDocument(),
    loadWithReload(() => import('../../lib/pdf/download')),
  ]);
  return downloadPdf(doc, look);
}
