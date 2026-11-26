import PDFDocument from 'pdfkit';
import { createTypesetter, seenSpec, seenText, STYLES } from './text.js';
import { flatten, tagNode } from './parts.js';
import { layoutPages } from './layout.js';
import { PAPER } from './paper.js';
import { PDF_THEMES, PDF_AUTHOR, businessOf } from './theme.js';
import { formatFileDate, formatUpdatedAt } from '../dateFormatter.js';

// The shared PDF template. One document description in, a finished PDF out, in
// the light or dark version and on A4 or US Letter. See CLAUDE.md, "PDF rules".
//
// A document description:
// {
//   docName: 'Health Check',          // file name and running header (left)
//   title: 'Strategic Alignment Health Check',
//   who: 'Northfield Logistics',      // organisation or person; running header (right), file name
//   confidential: true,               // footer "Confidential: for <who>" (their own answers)
//   details: ['Northfield Logistics', 'Mon 26 Oct 2026', 'Health Check'],
//   updatedAt: '2026-10-26T09:30:00', // set when downloaded again after changes
//   date: '2026-10-26',               // for the file name
//   subject: 'one line for the file properties',
//   glance: [{ label, value, note?, big? }],          // two to four
//   sections: [{ title, blocks: [
//     { type: 'text', text, tone?: 'detail' },
//     { type: 'field', label, text },                // a question and its answer
//     { type: 'list', items, ordered? },
//     { type: 'table', title?, columns: [{ label, width, align? }], rows: [[...]] },
//     { type: 'bars', rows: [{ label, value }], max?, unit?, standard: { value }, sentence, alt },
//     { type: 'signature', parties: [{ role, name?, date? }] },
//   ] }],
// }
// Blank answers, empty lists and empty sections are left out (PDF rule 11).

const MM = 72 / 25.4;
const MARGIN = 19 * MM;
// The 25 Nov PDFs (Polish 1; pdfs-25nov/pdf-examples-25nov.html): the running header sits 12mm from the top with
// 10mm under it; the footer's hairline and line sit 12mm from the foot, with room above it.
const HEADER_TOP = 12 * MM;
const HEADER_GAP = 10 * MM; // under the running header
const FOOT_BOTTOM = 12 * MM;
const FOOT_PAD = 3.5 * MM; // the footer's hairline to its words
const FOOTER_GAP = 3 * MM; // the content's last line to the footer's hairline (as the approved pages: the remittance line sits just above it)

const clean = (s) => String(s ?? '').normalize('NFC')
  .replace(/[\\/:*?"<>|]/g, ' ')
  .replace(/\p{Extended_Pictographic}|\p{Cc}|\p{Mn}|\p{Cf}/gu, '') // emoji, joiners and control characters
  .replace(/\s+/g, ' ')
  .trim();
const shorten = (s, n = 60) => {
  if (s.length <= n) return s;
  const cut = s.lastIndexOf(' ', n);
  return s.slice(0, cut > 20 ? cut : n).trim();
};

/**
 * The name in words, such as "Health Check, Northfield Logistics, 26 Oct 2026",
 * and the file name, with "(dark)" at the end of the dark one.
 */
export function pdfName(spec, variant) {
  const title = [spec.docName, spec.who, spec.fileLabel || formatFileDate(spec.date || new Date())]
    .map((p) => shorten(clean(typeof p === 'string' ? seenText(p) : p)))
    .filter(Boolean)
    .join(', ');
  const full = variant === 'dark' ? `${title} (dark)` : title;
  return { title: full, fileName: `${full}.pdf` };
}

function registerFonts(doc, fonts) {
  const names = [];
  const add = (name, bytes) => {
    if (bytes) {
      doc.registerFont(name, bytes);
      names.push(name);
    }
  };
  ['Nekst', 'NekstLight', 'DMSans', 'DMSansExt', 'DMSansMedium', 'DMSansMediumExt', 'DMSansLight', 'DMSansLightItalic'].forEach((n) => add(n, fonts[n]));
  const emoji = (fonts.emoji || []).map((bytes, i) => {
    add(`Emoji${i}`, bytes);
    return `Emoji${i}`;
  });
  // Chinese text comes last in every chain, after the emoji font.
  const cjk = (fonts.cjk || []).map((bytes, i) => {
    add(`Cjk${i}`, bytes);
    return `Cjk${i}`;
  });
  const keep = (list) => list.filter((n) => names.includes(n));
  return {
    nekst: keep(['Nekst', 'DMSans', 'DMSansExt', ...emoji, ...cjk]),
    light: keep(['NekstLight', 'Nekst', 'DMSans', 'DMSansExt', ...emoji, ...cjk]),
    body: keep(['DMSans', 'DMSansExt', ...emoji, ...cjk]),
    medium: keep(['DMSansMedium', 'DMSansMediumExt', 'DMSans', 'DMSansExt', ...emoji, ...cjk]),
    // Figures in DM Sans Light, and a signature written as a name in its light italic (the 25 Nov PDFs).
    figure: keep(['DMSansLight', 'DMSans', 'DMSansExt', ...emoji, ...cjk]),
    hand: keep(['DMSansLightItalic', 'DMSansLight', 'DMSans', 'DMSansExt', ...emoji, ...cjk]),
  };
}

/**
 * @param {Object} spec the document description (above)
 * @param {Object} options
 * @param {'light'|'dark'} [options.variant]
 * @param {{width: number, height: number}} [options.paper] from paperFor()
 * @param {{fonts: Object<string, Uint8Array>}} options.assets
 * @returns {Promise<{bytes: Uint8Array, pages: number, fileName: string, title: string, layout: Object[][]}>}
 */
export async function renderPdf(given, { variant = 'light', paper = PAPER.A4, assets }) {
  // Nothing unseen is drawn: no font has a shape for it, so it showed as an empty box.
  const spec = seenSpec(given);
  const t = PDF_THEMES[variant] || PDF_THEMES.light;
  const { title, fileName } = pdfName(spec, variant);
  const W = paper.width;
  const H = paper.height;
  const doc = new PDFDocument({
    autoFirstPage: false,
    font: assets.fonts.DMSans, // the browser build has no Helvetica to start with
    size: [W, H],
    margin: 0,
    compress: true,
    tagged: true,
    subset: 'PDF/UA',
    pdfVersion: '1.7',
    lang: 'en-GB',
    displayTitle: true,
    info: {
      Title: title,
      Author: PDF_AUTHOR,
      Subject: spec.subject || spec.title,
      Creator: 'The Clarity Portal',
      Producer: 'The Clarity Portal',
    },
  });
  // pdfkit marks the file as PDF/UA part 1, but its check for the number 1 also
  // adds a font index (CIDSet) meant only for PDF/A-1, which it gets wrong for
  // accented letters. The same value as text keeps the PDF/UA mark without it.
  doc.subset = '1';
  // pdfkit copies the title and author into the file's XML metadata as they
  // are, so a name like "Ivy & Co" breaks it. Escape them for that copy only.
  const addInfo = doc._addInfo;
  doc._addInfo = function addEscapedInfo() {
    const saved = this.info;
    const xml = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    this.info = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, typeof v === 'string' ? xml(v) : v]));
    addInfo.call(this);
    this.info = saved;
  };
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const ts = createTypesetter(doc, registerFonts(doc, assets.fonts));
  const contentW = W - MARGIN * 2;

  // The running header and the footer never cut a name off with "…" (Tim,
  // 26 Oct, 16:12): a long name wraps onto more lines, and the header and
  // footer bands grow to hold them, inside the margins.
  const who = spec.who ? String(spec.who).trim() : '';
  const s = STYLES.foot;
  const docName = spec.running || spec.docName || spec.title || '';
  const leftW = who ? Math.min(ts.width(docName, s), contentW * 0.5) : contentW;
  const headLeft = ts.wrap(docName, s, Math.max(leftW, 1));
  const headRight = who ? ts.wrap(who, s, contentW - leftW - 24) : [];
  const headerBand = HEADER_TOP + Math.max(headLeft.length, headRight.length, 1) * s.lh + HEADER_GAP;

  // The footer (the 25 Nov PDFs): a hairline, then the company's name and number, its website (a working link),
  // "Confidential: for [name]" where the document holds their answers or terms, and "Page 1 of 2" on documents of
  // more than one page, each apart with a quiet dot. Nothing is hard-coded: the business's own details
  // (theme.js businessOf, from the coach's Settings, Business) or the company's name alone.
  const biz = businessOf(spec.business);
  const company = biz.number ? `${biz.name} · Company no. ${biz.number}` : biz.name;
  const site = biz.website;
  const dotW = ts.width('·', s) + 6 * MM; // 3mm either side of the quiet dot
  const numRoom = ts.width('Page 99 of 99', s) + 16;
  const companyW = ts.width(company, s);
  const siteW = ts.width(site, s);
  const confText = spec.confidential ? (who ? `Confidential: for ${who}` : 'Confidential') : '';
  const confX = companyW + dotW + siteW + dotW;
  const confLines = confText ? ts.wrap(confText, s, Math.max(contentW - confX - numRoom, contentW * 0.3)) : [];
  const footLines = Math.max(1, confLines.length);
  const footTop = (pageH) => pageH - FOOT_BOTTOM - footLines * s.lh - FOOT_PAD;
  const geom = {
    top: (i) => (i > 0 ? headerBand : MARGIN),
    bottom: () => footTop(H) - FOOTER_GAP,
  };
  const measure = Math.min(contentW, 150 * MM); // a paragraph's measure (the 25 Nov PDFs' 150mm)
  const L = { ts, contentW, measure, pageH: geom.bottom(1) - geom.top(1) };

  const details = [...(spec.details || [])];
  if (spec.updatedAt) details.push(formatUpdatedAt(spec.updatedAt));
  const full = { ...spec, details };

  // Lay out; over six pages, add the contents list and lay out again until
  // its page numbers settle.
  const root = tagNode('Document', null);
  let { units, sections } = flatten(L, full, null, root);
  let pages = layoutPages(units, geom);
  const sectionPages = () => {
    const at = [];
    pages.forEach((p, pi) => p.items.forEach(({ u }) => {
      if (u.kind === 'heading' && u.section != null && at[u.section] == null) at[u.section] = pi;
    }));
    return sections.map((s, k) => ({ title: s.title, page: (at[k] ?? 0) + 1 }));
  };
  if (pages.length > 6) {
    let entries = sectionPages();
    for (let pass = 0; pass < 4; pass += 1) {
      ({ units, sections } = flatten(L, full, entries, root));
      pages = layoutPages(units, geom);
      const next = sectionPages();
      const same = next.every((e, k) => e.page === entries[k].page);
      entries = next;
      if (same) break;
    }
  }

  root.el = doc.struct('Document');
  doc.addStructure(root.el);
  const el = (node) => {
    if (!node.el) {
      node.el = doc.struct(node.type, node.opts || {});
      el(node.parent).add(node.el);
    }
    return node.el;
  };
  const ctx = {
    doc,
    ts,
    t,
    mark(node, fn) {
      const e = el(node);
      const content = doc.markStructureContent(node.type);
      e.add(content);
      // A heading drawn in spaced capitals also carries its words as written
      // ("Next steps"), so copying, searching and screen readers get whole words.
      const actual = node.opts?.actual;
      if (actual) doc.markContent('Span', { actual });
      fn();
      if (actual) doc.endMarkedContent();
      doc.endMarkedContent();
    },
    artifact(fn, type = 'Layout') {
      doc.markContent('Artifact', { type });
      fn();
      doc.endMarkedContent();
    },
  };

  pages.forEach((page, pi) => {
    doc.addPage({ size: [W, H], margin: 0 });
    if (variant === 'dark') ctx.artifact(() => doc.rect(0, 0, W, H).fill(t.page), 'Background');
    page.items.forEach(({ u, y }, k) => u.draw(ctx, MARGIN, y, { first: k === 0 || page.items[k - 1].u.kind === 'thead' }));

    // running header, from page 2: the document's name and who it is for,
    // each wrapping onto more lines rather than being cut off
    if (pi > 0) {
      ctx.artifact(() => {
        const by = HEADER_TOP + ts.baseline(s);
        headLeft.forEach((ln, i) => ts.draw(ln, MARGIN, by + i * s.lh, s, t.detail));
        headRight.forEach((ln, i) => ts.draw(ln, MARGIN + contentW, by + i * s.lh, s, t.detail, 'right'));
      }, 'Pagination');
    }

    // footer: the hairline, the company, the website (a working link), who it
    // is confidential for (wrapping upwards when long, so the full name
    // always shows), and the page number (none on a one-page PDF)
    const top = footTop(H);
    const by = H - FOOT_BOTTOM - s.lh + ts.baseline(s);
    ctx.artifact(() => {
      doc.moveTo(MARGIN, top + 0.375).lineTo(MARGIN + contentW, top + 0.375).lineWidth(0.75).stroke(t.line);
      ts.draw(company, MARGIN, by, s, t.detail);
      ts.draw('·', MARGIN + companyW + dotW / 2 - ts.width('·', s) / 2, by, s, t.detail);
    }, 'Pagination');
    const ax = MARGIN + companyW + dotW;
    const link = doc.struct('Link');
    root.el.add(link);
    const content = doc.markStructureContent('Link');
    link.add(content);
    ts.draw(site, ax, by, s, t.detail);
    doc.endMarkedContent();
    doc.link(ax, by - s.size, siteW, s.lh, biz.url, { structParent: link, Contents: new String(`${biz.name}, ${site}`) });
    link.end();
    ctx.artifact(() => {
      // Pages added after the render (an invoice's evidence, appended with pdf-lib) count in the total.
      const total = pages.length + Math.max(0, Number(spec.extraPages) || 0);
      if (total > 1) ts.draw(`Page ${pi + 1} of ${total}`, MARGIN + contentW, by, s, t.detail, 'right');
      if (confLines.length) {
        ts.draw('·', ax + siteW + dotW / 2 - ts.width('·', s) / 2, by, s, t.detail);
        confLines.forEach((ln, i) => ts.draw(ln, MARGIN + confX, by - (confLines.length - 1 - i) * s.lh, s, t.detail));
      }
    }, 'Pagination');
  });

  // A contents list (bookmarks) in every PDF (PDF rule 33, Tim, 28 Oct): each
  // section once, by its name as written, on the page where it starts (never
  // again for a table carried on). With no sections, the title alone.
  const marked = new Set();
  pages.forEach((p, pi) => p.items.forEach(({ u, cont }) => {
    if (u.kind !== 'heading' || u.section == null || cont || marked.has(u.section)) return;
    marked.add(u.section);
    doc.outline.addItem(String(sections[u.section].title).replace(/\s+/g, ' ').trim(), { pageNumber: pi });
  }));
  if (!marked.size) doc.outline.addItem(String(spec.title || '').replace(/\s+/g, ' ').trim() || title, { pageNumber: 0 });

  root.el.end();
  doc.end();
  await finished;
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(size);
  let at = 0;
  chunks.forEach((c) => {
    bytes.set(c, at);
    at += c.length;
  });
  // `layout` lists what sits on each page, for the page-break checks
  // `y` and `limit` let the pack check nothing crosses into the footer (the 25 Nov PDFs' stress pack).
  const layout = pages.map((p, pi) => p.items.map(({ u, y, cont }) => ({ kind: u.kind, lines: u.lines, h: Math.round(u.h), y: Math.round(y * 10) / 10, limit: Math.round(geom.bottom(pi) * 10) / 10, footerTop: Math.round(footTop(H) * 10) / 10, group: u.group ?? null, keep: !!u.keep, cont: !!cont, ...(u.dots ? { dots: u.dots } : {}) })));
  return { bytes, pages: pages.length, fileName, title, layout };
}
