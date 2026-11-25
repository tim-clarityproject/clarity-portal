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
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return fileName;
}
