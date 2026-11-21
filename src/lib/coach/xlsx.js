// A small Excel file (.xlsx) for Export to a spreadsheet (M11, version 3.6),
// written here so the portal needs no spreadsheet library: one sheet of
// text and numbers, never a formula. An .xlsx is a zip of a few XML files;
// they are stored without compression, which every spreadsheet app reads.

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of stored (uncompressed) files: [{ name, text }]. */
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true); dir.setUint16(12, 0, true); dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, data.length, true); dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const dirSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// What XML can't hold: the five marks, and control characters.
const xml = (v) => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function column(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * The file's bytes for rows of cells (the first row is the headings). A
 * number stays a number; everything else is text, so nothing typed by
 * anyone is ever run as a formula.
 */
export function xlsxBytes(rows, sheetName = 'Sheet1') {
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    const ref = `${column(c)}${r + 1}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (v == null || v === '') return '';
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    { name: '[Content_Types].xml', text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: '_rels/.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', text: `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>` },
  ]);
}

// ---------------------------------------------------------------- reading one (Network's import; Phase 6a run 4)
// The first sheet of an Excel file as rows of text cells, with no
// spreadsheet library: the zip is unpacked with the browser's own
// DecompressionStream, and the few XML parts are read as text. Formulas are
// never run: a formula's last saved value is read as its text. A date cell
// comes back as 2025-10-12, whatever it looked like in Excel.

const dec = new TextDecoder();
/** The most a file may unpack to, so a small file can never fill the device's memory. */
const UNPACK_MAX = 80 * 1024 * 1024;

/** Whether this browser can unpack an Excel file. */
export const canReadXlsx = () => typeof DecompressionStream === 'function' && typeof Response === 'function';

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The zip's files by name: each `{ method, data }`, still packed. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new Error('too big');
  const files = new Map();
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('not a zip');
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    total += view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (total > UNPACK_MAX) throw new Error('too big');
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('not a zip');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.set(name, { method, data: bytes.subarray(start, start + packed) });
    at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return files;
}

const unxml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'quot') return '"'; if (k === 'apos') return '\'';
  const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/_x000D_/g, '');
const attr = (tag, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag); return m ? unxml(m[1]) : null; };
/** The text inside every <t> of a piece of XML (a shared string, an inline string), without its phonetic guide. */
const texts = (xmlPart) => { let out = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; const src = xmlPart.replace(/<rPh[\s\S]*?<\/rPh>/g, ''); for (let m = re.exec(src); m; m = re.exec(src)) out += unxml(m[1]); return out; };
const colIndex = (ref) => { let n = 0; for (const ch of String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormat = (code) => /[dmyh]/i.test(String(code || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(String(code || ''));
const pad2 = (n) => String(n).padStart(2, '0');
/** An Excel day number as 2025-10-12 (the time of day, if any, is let go). */
function serialDay(serial, from1904) {
  const d = new Date(Math.round((Math.floor(serial) - (from1904 ? 24107 : 25569)) * 86400000));
  return Number.isNaN(d.getTime()) ? String(serial) : `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * The first sheet of an Excel file (.xlsx) as rows of text cells, in the
 * shape crm.js's csvTable gives for a CSV file. Rows with nothing in them
 * are dropped. Rejects when the file isn't one that can be read.
 * @param {Uint8Array|ArrayBuffer} file the file's bytes
 * @returns {Promise<string[][]>}
 */
export async function xlsxTable(file) {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  const files = unzip(bytes);
  const read = async (name) => { const f = files.get(name); if (!f) return ''; if (f.method === 0) return dec.decode(f.data); if (f.method !== 8) throw new Error('packed another way'); return dec.decode(await inflate(f.data)); };
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('not a workbook');
  const first = /<sheet\s[^>]*>/.exec(workbook);
  const rels = await read('xl/_rels/workbook.xml.rels');
  let path = 'xl/worksheets/sheet1.xml';
  const rid = first ? attr(first[0], 'r:id') : null;
  if (rid) for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) if (attr(m[0], 'Id') === rid) { const t = attr(m[0], 'Target') || ''; path = t.startsWith('/') ? t.slice(1) : `xl/${t}`; }
  const sheet = await read(path);
  if (!sheet) throw new Error('no sheet');
  const shared = [];
  for (const m of (await read('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(m[1] ? texts(m[1]) : '');
  const styles = await read('xl/styles.xml');
  const custom = new Map();
  for (const m of styles.matchAll(/<numFmt\s[^>]*>/g)) custom.set(Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode'));
  const xfs = [...(/<cellXfs[\s\S]*?<\/cellXfs>/.exec(styles)?.[0] || '').matchAll(/<xf\s[^>]*>/g)].map((m) => { const id = Number(attr(m[0], 'numFmtId')); return BUILT_IN_DATES.has(id) || (custom.has(id) && isDateFormat(custom.get(id))); });
  const from1904 = /<workbookPr\s[^>]*date1904="(1|true)"/.test(workbook);
  const rows = [];
  for (const r of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row = [];
    let next = 0;
    for (const c of r[1].matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = c[1] || '';
      const ref = attr(tag, 'r');
      const at = ref ? colIndex(ref) : next;
      next = at + 1;
      if (at < 0 || at > 500) continue;
      const kind = attr(tag, 't');
      const inner = c[2] || '';
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
      let value = '';
      if (kind === 'inlineStr') value = texts(inner);
      else if (!v) value = '';
      else if (kind === 's') value = shared[Number(v[1])] ?? '';
      else if (kind === 'b') value = v[1] === '1' ? 'Yes' : 'No';
      else if (kind === 'str' || kind === 'e') value = kind === 'e' ? '' : unxml(v[1]);
      else {
        const n = Number(v[1]);
        value = !Number.isFinite(n) ? unxml(v[1]) : xfs[Number(attr(tag, 's'))] ? serialDay(n, from1904) : String(Number(n.toPrecision(15)));
      }
      while (row.length < at) row.push('');
      row[at] = String(value).trim();
    }
    if (row.some((cell) => cell !== '')) rows.push(row);
    if (rows.length > 20001) break;
  }
  return rows;
}
