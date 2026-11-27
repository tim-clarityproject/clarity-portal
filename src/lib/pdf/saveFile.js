// Saves a finished PDF's bytes as a file (no print dialog): the one place the browser hands a PDF over,
// for one made here (download.js) and for a stored one (a signed agreement's, made by the server: 064).

/**
 * @param {Uint8Array} bytes
 * @param {string} fileName
 * @returns {string} the file name
 */
export function savePdfFile(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // unref: a Node test run doesn't wait for it (a browser's timer has no unref).
  setTimeout(() => URL.revokeObjectURL(url), 60000)?.unref?.();
  return fileName;
}

// Stage D item 14 (Tim, 27 Nov): opening a business PDF ("Open it" on a signed agreement) never quietly saves it. On a
// laptop it opens in a new tab, whose viewer has its own Download; on an iPhone or iPad, Safari's own PDF viewer (with
// Share and Save to Files). Android's browser can't show a PDF in a tab, so there it is handed over as a file, which
// the phone opens in its own PDF viewer. Checked by tests/performance/pdf-open.test.mjs.

/** Whether this browser can show a PDF in a tab (every one but Android's). */
export const showsPdfInTab = (ua = globalThis.navigator?.userAgent || '') => !/Android/i.test(ua);

/**
 * A new tab opened at once, inside the tap (a pop-up blocker allows a tab only then, before anything is awaited), for
 * openPdfFile to fill once the PDF is here. Null where the browser shows no PDF in a tab, or blocks it.
 * @returns {Window|null}
 */
export function pdfTab() {
  if (!showsPdfInTab()) return null;
  try {
    const tab = globalThis.window?.open('', '_blank');
    if (!tab) return null;
    try { tab.opener = null; } catch { /* some browsers keep it read-only */ }
    return tab;
  } catch { return null; }
}

/** Closes the tab pdfTab opened when the PDF couldn't be had (the page says why). */
export function closePdfTab(tab) {
  try { if (tab && !tab.closed) tab.close(); } catch { /* already gone */ }
}

/**
 * Shows a finished PDF: in `tab` (from pdfTab, opened inside the tap), else in a new tab where the browser allows one,
 * else saved as a file (Android, or a blocked tab).
 * @param {Uint8Array} bytes
 * @param {string} fileName
 * @param {Window|null} [tab]
 * @returns {'tab'|'file'}
 */
export function openPdfFile(bytes, fileName, tab = null) {
  if (!showsPdfInTab()) { savePdfFile(bytes, fileName); return 'file'; }
  const type = { type: 'application/pdf' };
  const blob = typeof File === 'function' ? new File([bytes], fileName, type) : new Blob([bytes], type);
  const url = URL.createObjectURL(blob);
  let shown = false;
  if (tab && !tab.closed) {
    try { tab.location.href = url; shown = true; } catch { shown = false; }
  }
  if (!shown) {
    // Not 'noopener': with it the browser answers null even when the tab opened.
    try {
      const opened = globalThis.window?.open(url, '_blank');
      if (opened) { try { opened.opener = null; } catch { /* read-only */ } }
      shown = Boolean(opened);
    } catch { shown = false; }
  }
  if (!shown) {
    URL.revokeObjectURL(url);
    savePdfFile(bytes, fileName);
    return 'file';
  }
  // Kept a while, so the viewer's own Download still has it.
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60000)?.unref?.();
  return 'tab';
}
