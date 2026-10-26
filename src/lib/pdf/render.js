import PDFDocument from 'pdfkit';
import { createTypesetter, STYLES } from './text';
import { flatten, tagNode } from './parts';
import { layoutPages } from './layout';
import { PAPER } from './paper';
import { PDF_THEMES, PDF_AUTHOR, PORTAL_ADDRESS, PORTAL_URL } from './theme';
import { formatFileDate, formatUpdatedAt } from '../dateFormatter';

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
const HEADER_BAND = 12 + 16; // running header line and the space under it
const FOOTER_BAND = 16 + 16; // logo mark and the space above it
const LOGO = 16;

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
  const title = [spec.docName, spec.who, formatFileDate(spec.date || new Date())]
    .map((p) => shorten(clean(p)))
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
  ['Nekst', 'NekstLight', 'DMSans', 'DMSansExt', 'DMSansMedium', 'DMSansMediumExt'].forEach((n) => add(n, fonts[n]));
  const emoji = (fonts.emoji || []).map((bytes, i) => {
    add(`Emoji${i}`, bytes);
    return `Emoji${i}`;
  });
  const keep = (list) => list.filter((n) => names.includes(n));
  return {
    nekst: keep(['Nekst', 'DMSans', 'DMSansExt', ...emoji]),
    light: keep(['NekstLight', 'Nekst', 'DMSans', 'DMSansExt', ...emoji]),
    body: keep(['DMSans', 'DMSansExt', ...emoji]),
    medium: keep(['DMSansMedium', 'DMSansMediumExt', 'DMSans', 'DMSansExt', ...emoji]),
  };
}

/**
 * @param {Object} spec the document description (above)
 * @param {Object} options
 * @param {'light'|'dark'} [options.variant]
 * @param {{width: number, height: number}} [options.paper] from paperFor()
 * @param {{fonts: Object<string, Uint8Array>, logos: {positive: Uint8Array, negative: Uint8Array}}} options.assets
 * @returns {Promise<{bytes: Uint8Array, pages: number, fileName: string, title: string, layout: Object[][]}>}
 */
export async function renderPdf(spec, { variant = 'light', paper = PAPER.A4, assets }) {
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
  const geom = {
    top: (i) => MARGIN + (i > 0 ? HEADER_BAND : 0),
    bottom: () => H - MARGIN - FOOTER_BAND,
  };
  const sample = 'Most of the team agreed the new routing plan should start soon.';
  const measure = Math.min(contentW, (ts.width(sample, STYLES.body) / sample.length) * 62);
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

  const logo = doc.openImage(t.logo === 'negative' ? assets.logos.negative : assets.logos.positive);
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
      fn();
      doc.endMarkedContent();
    },
    artifact(fn, type = 'Layout') {
      doc.markContent('Artifact', { type });
      fn();
      doc.endMarkedContent();
    },
  };

  const who = spec.who ? String(spec.who).trim() : '';
  const s = STYLES.small;
  pages.forEach((page, pi) => {
    doc.addPage({ size: [W, H], margin: 0 });
    if (variant === 'dark') ctx.artifact(() => doc.rect(0, 0, W, H).fill(t.page), 'Background');
    page.items.forEach(({ u, y }, k) => u.draw(ctx, MARGIN, y, { first: k === 0 || page.items[k - 1].u.kind === 'thead' }));

    // running header, from page 2: the document name and who it is for
    if (pi > 0) {
      ctx.artifact(() => {
        const by = MARGIN + ts.baseline(s);
        const left = ts.fit(spec.docName || spec.title, s, who ? contentW * 0.55 : contentW);
        ts.draw(left, MARGIN, by, s, t.detail);
        if (who) ts.draw(ts.fit(who, s, contentW - ts.width(left, s) - 24), MARGIN + contentW, by, s, t.detail, 'right');
      }, 'Pagination');
    }

    // footer: the logo mark, the portal address (a working link), who it is
    // confidential for, and the page number (none on a one-page PDF)
    const fy = H - MARGIN - LOGO;
    const by = fy + LOGO / 2 + s.size * 0.35;
    ctx.artifact(() => doc.image(logo, MARGIN, fy, { width: LOGO, height: LOGO }), 'Pagination');
    const ax = MARGIN + LOGO + 8;
    const aw = ts.width(PORTAL_ADDRESS, s);
    const link = doc.struct('Link');
    root.el.add(link);
    const content = doc.markStructureContent('Link');
    link.add(content);
    ts.draw(PORTAL_ADDRESS, ax, by, s, t.detail);
    doc.endMarkedContent();
    doc.link(ax, fy, aw, LOGO, PORTAL_URL, { structParent: link, Contents: new String(`The Clarity Portal, ${PORTAL_ADDRESS}`) });
    link.end();
    ctx.artifact(() => {
      let right = MARGIN + contentW;
      if (pages.length > 1) {
        const num = `Page ${pi + 1} of ${pages.length}`;
        ts.draw(num, right, by, { ...s, features: ['tnum'] }, t.detail, 'right');
        right -= ts.width(num, s) + 16;
      }
      if (spec.confidential) {
        const text = who ? `Confidential: for ${who}` : 'Confidential';
        ts.draw(ts.fit(text, s, right - (ax + aw + 16)), right, by, s, t.detail, 'right');
      }
    }, 'Pagination');
  });

  // section bookmarks when it is over two pages
  if (pages.length > 2) {
    pages.forEach((p, pi) => p.items.forEach(({ u }) => {
      if (u.kind === 'heading' && u.section != null) doc.outline.addItem(sections[u.section].title, { pageNumber: pi });
    }));
  }

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
  const layout = pages.map((p) => p.items.map(({ u, cont }) => ({ kind: u.kind, lines: u.lines, h: Math.round(u.h), group: u.group ?? null, keep: !!u.keep, cont: !!cont })));
  return { bytes, pages: pages.length, fileName, title, layout };
}
