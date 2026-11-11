// The one shared email template (Tim, 10 Nov: "every email in the new
// portal's style"; mock-up email-template.html, approved 14:26). Every
// email the portal sends is described as a small document (its heading,
// lines, one button, any sign-in box, its footer) and this turns that one
// description into both the HTML and the plain-text version, so the two
// can never say different things. No email builds its own HTML.
//
// The email is always light: many email apps force their own dark mode and
// would spoil a dark one. Built for Gmail, Outlook and Apple Mail: tables
// for layout, every style inline, nothing that relies on a web font (Nekst
// and DM Sans load where the app allows; Helvetica or Arial everywhere
// else), and an image with its words as alt text, so the email still reads
// with images blocked. Outlook on Windows ignores max-width, so it alone
// gets a 520px table around the column (the "if mso" comments). A word
// too long for the column (a web address typed into an objective, a name
// with no spaces) breaks onto the next line instead of pushing the email
// sideways.
//
// A document:
//   { brand: 'portal' | 'project'   the bold crosshair and "The Clarity
//                                   Portal", or The Clarity Project's logo
//                                   (Leading Ideas comes from the business)
//     subject, preheader?           the inbox line and the grey preview
//     blocks: [                      top to bottom
//       { type: 'heading', text }
//       { type: 'text', text, quiet? }         quiet: the secondary grey
//       { type: 'button', label, href, time? } the one coral button; only a
//                                              time ever sits beside it
//       { type: 'details', rows: [[label, value], …] }  the sign-in box
//       { type: 'link', label, href }          a quiet underlined link
//       { type: 'files', names: [] }           attachment names
//       { type: 'label', text }                a section name, Nekst capitals
//       { type: 'quote', text, by }
//       { type: 'question', text }
//       { type: 'section', blocks: [] }        its own part, a line above
//       { type: 'coral-link', label, href }    the one quiet coral underline
//       { type: 'slot', placeholder }          where Kit puts the message
//     ]
//     footer: { lines: [text | { label, href } | [ {label, href}, … ]], legal? }
//   }

export const EMAIL_COLOURS = Object.freeze({
  bg: '#F9F8F5', text: '#000000', quiet: '#4A4A49', line: '#DCDAD3', coral: '#FF6F5C', legal: '#7F7F7C',
});

/** The line every email signs off with, whoever the coach is (Tim, 10 Nov, 13:29). */
export const EMAIL_SIGN_OFF = 'The Clarity Project LTD, founded by Dr. Tim Dutton';

// The portal's own address hosts Nekst for the apps that load it (Apple
// Mail); Gmail and Outlook ignore it and use the fallbacks.
const FONT_HOST = 'https://portal.theclarityproject.co.uk';
const BODY_FONT = '\'DM Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif';
const TITLE_FONT = `Nekst,${BODY_FONT}`;

export const EMAIL_IMAGES = Object.freeze({
  crosshair: { cid: 'clarity-crosshair', file: 'the-clarity-portal.png', path: '/brand/bold-crosshair-black-email@2x.png', width: 24, height: 24, alt: 'The Clarity Portal' },
  project: { cid: 'clarity-project', file: 'the-clarity-project.png', path: '/brand/the-clarity-project-horizontal-black-email@2x.png', width: 220, height: 28, alt: 'The Clarity Project' },
});

const C = EMAIL_COLOURS;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
// One line, whatever was typed: every kind of line break and control
// character becomes a space (a subject must never gain a second line, and
// the plain text must never gain a made-up footer or link line), and the
// characters that turn text round (the direction overrides) are dropped.
// eslint-disable-next-line no-control-regex
const BREAKS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;
const TURNS = /[\u202A-\u202E\u2066-\u2069]/g;
export const oneLine = (s) => String(s ?? '').replace(TURNS, '').replace(BREAKS, ' ').trim();

// The only addresses a link may have: an https address, or one of the two
// services' own placeholders, whole, in the templates saved outside the
// code (Supabase's link, Kit's unsubscribe link). Anything else (javascript:,
// data:, http:, an address with a name and password before the host, a line
// break) is refused, so the email is not sent with it.
const LINK_PLACEHOLDERS = ['{{ .ConfirmationURL }}', '{{ unsubscribe_url }}'];
export function safeHref(href) {
  if (LINK_PLACEHOLDERS.includes(href)) return href;
  // A developer's own machine (api/_portalOrigin.js gives this only off a deployment).
  if (typeof href === 'string' && /^http:\/\/localhost:\d{2,5}\/[A-Za-z0-9\-._~/]*$/.test(href)) return href;
  let url = null;
  // eslint-disable-next-line no-control-regex
  try { url = typeof href === 'string' && /^https:\/\/[a-z0-9[][^\s\u0000-\u001F\u007F-\u009F\u2028\u2029<>"'\\]*$/i.test(href) ? new URL(href) : null; } catch { url = null; }
  if (!url || url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('An email link must be an https address.');
  return href;
}
// An image is inside the email (cid:), on an https address, one of this
// build's own files (the test page), or the PNG itself (the browser checks).
function safeSrc(src) {
  if (typeof src === 'string' && (/^cid:[a-z-]+$/.test(src) || (/^\/[a-z0-9@._/-]+$/i.test(src) && !src.startsWith('//')) || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src))) return src;
  return safeHref(src);
}
const SLOT = '{{ message_content }}';

const row = (html, style = '') => `<tr><td style="${style}">${html}</td></tr>`;
// Reading text is 1.6 tall; the small parts (the sign-in box, the time, the quiet link, the footer) are 1.5, as in the mock-up.
const text = (size, colour, extra = '', lineHeight = 1.6) => `font-family:${BODY_FONT};font-size:${size}px;line-height:${lineHeight};color:${colour};${extra}`;

function brandHtml(brand, src) {
  if (brand === 'project') {
    const i = EMAIL_IMAGES.project;
    return row(`<img src="${esc(safeSrc(src('project')))}" width="${i.width}" height="${i.height}" alt="${i.alt}" style="display:block;border:0;width:${i.width}px;max-width:100%;height:auto;${text(16, C.text)}">`);
  }
  const i = EMAIL_IMAGES.crosshair;
  return row(`<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="padding:0 12px 0 0;vertical-align:middle;"><img src="${esc(safeSrc(src('crosshair')))}" width="${i.width}" height="${i.height}" alt="" style="display:block;border:0;width:${i.width}px;height:${i.height}px;"></td>
<td style="vertical-align:middle;font-family:${BODY_FONT};font-size:11px;line-height:1.5;letter-spacing:0.16em;text-transform:uppercase;color:${C.text};">The Clarity Portal</td>
</tr></table>`);
}

const linkStyle = (colour, line = C.line) => `color:${colour};text-decoration:underline;text-decoration-color:${line};text-underline-offset:3px;`;

function footerLine(line) {
  if (typeof line === 'string') return esc(line);
  const links = Array.isArray(line) ? line : [line];
  return links.map((l) => `<a href="${esc(safeHref(l.href))}" style="color:${C.quiet};text-decoration:underline;">${esc(l.label)}</a>`).join(' &middot; ');
}

function blockHtml(b, first) {
  switch (b.type) {
    case 'heading':
      return row(`<h1 style="margin:0;font-family:${BODY_FONT};font-size:22px;line-height:1.3;font-weight:400;color:${C.text};text-wrap:balance;">${esc(b.text)}</h1>`, `padding:${b.tight ? 10 : 36}px 0 0;`);
    case 'text':
      return row(esc(b.text), `padding:${b.sectionText ? 10 : 14}px 0 0;${text(16, b.quiet ? C.quiet : C.text, 'text-wrap:pretty;')}`);
    case 'button':
      // A table cell carries the colour and the shape, so Outlook shows a
      // coral button too (with square corners); on a phone it runs full
      // width with the time under it. Outlook on Windows ignores padding
      // on a link, so the cell carries the same padding for Outlook alone
      // (mso-padding-alt), or its button would shrink to the words.
      return row(`<table role="presentation" cellspacing="0" cellpadding="0" border="0" class="cta"><tr>
<td class="btn-cell" bgcolor="${C.coral}" style="background:${C.coral};border-radius:999px;text-align:center;mso-padding-alt:16px 24px;"><a class="btn" href="${esc(safeHref(b.href))}" style="display:inline-block;padding:16px 24px;font-family:${TITLE_FONT};font-size:12px;line-height:16px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;color:#000000;text-decoration:none;border-radius:999px;">${esc(b.label)}</a></td>
${b.time ? `<td class="cta-time" style="padding:0 0 0 16px;vertical-align:middle;${text(14, C.quiet, '', 1.5)}">${esc(b.time)}</td>` : ''}
</tr></table>`, 'padding:28px 0 0;');
    case 'details':
      return row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;"><tr><td style="padding:13px 18px 13px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">${b.rows.map(([label, value]) => `<tr>
<td style="padding:3px 16px 3px 0;vertical-align:baseline;white-space:nowrap;${text(13, C.quiet, '', 1.5)}">${esc(label)}</td>
<td style="padding:3px 0;vertical-align:baseline;word-break:break-word;overflow-wrap:anywhere;${text(15, C.text, 'font-weight:500;letter-spacing:0.02em;', 1.5)}">${esc(value)}</td>
</tr>`).join('')}</table>
</td></tr></table>`, 'padding:22px 0 0;');
    case 'link':
      return row(`<a href="${esc(safeHref(b.href))}" style="font-family:${BODY_FONT};font-size:15px;line-height:1.5;${linkStyle(C.text)}">${esc(b.label)}</a>`, `padding:20px 0 0;${text(15, C.text, '', 1.5)}`);
    case 'coral-link':
      return row(`<a href="${esc(safeHref(b.href))}" style="font-family:${BODY_FONT};font-size:16px;line-height:1.6;color:${C.text};text-decoration:underline;text-decoration-color:${C.coral};text-decoration-thickness:2px;text-underline-offset:4px;">${esc(b.label)}</a>`, `padding:10px 0 0;${text(16, C.text)}`);
    case 'files':
      return row(b.names.map((n) => `<span style="display:inline-block;margin:0 8px 8px 0;padding:8px 12px;border:1px solid ${C.line};border-radius:8px;${text(13, C.quiet)}">${esc(n)}</span>`).join(''), 'padding:22px 0 0;');
    case 'label':
      return row(esc(b.text), `padding:${first ? 20 : 36}px 0 0;font-family:${TITLE_FONT};font-size:12px;line-height:1.6;letter-spacing:0.16em;text-transform:uppercase;color:${C.quiet};`);
    case 'quote':
      return row(`<div style="font-family:${BODY_FONT};font-size:20px;line-height:1.45;color:${C.text};text-wrap:pretty;">${esc(b.text)}</div>${b.by ? `<div style="padding:8px 0 0;${text(14, C.quiet, '', 1.45)}">${esc(b.by)}</div>` : ''}`, 'padding:12px 0 0;');
    case 'question':
      return row(esc(b.text), `padding:12px 0 0;font-family:${BODY_FONT};font-size:20px;line-height:1.45;color:${C.text};`);
    case 'note':
      // A smaller pair of lines under a label: a name, then its line.
      return row(`${b.lead ? `<span style="${text(14, C.quiet)}">${esc(b.lead)}</span><br>` : ''}${esc(b.text)}${b.after ? `<br><span style="${text(14, C.quiet)}">${esc(b.after)}</span>` : ''}`, `padding:${b.lead ? 12 : 10}px 0 0;${text(16, C.text, 'text-wrap:pretty;')}`);
    case 'slot':
      // Where another service puts the message itself (Kit's {{ message_content }}); only ever a fixed placeholder, never a person's words.
      if (b.placeholder !== SLOT) throw new Error('The only slot an email has is Kit’s own message placeholder.');
      return row(b.placeholder, `padding:0;${text(16, C.text)}`);
    case 'section':
      return `${row('', `padding:64px 0 0;border-bottom:1px solid ${C.line};font-size:0;line-height:0;`)}${row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${b.blocks.map((x, i) => blockHtml(x.type === 'text' ? { ...x, sectionText: true } : x, i === 0)).join('\n')}</table>`, 'padding:4px 0 0;')}`;
    default:
      throw new Error(`The email template has no "${b.type}" part.`);
  }
}

function footerHtml(footer, sectionBefore) {
  const lines = footer.lines.map((l) => `<tr><td style="padding:3px 0;${text(13, C.quiet, '', 1.5)}">${footerLine(l)}</td></tr>`).join('\n');
  const legal = footer.legal ? `<tr><td style="padding:9px 0 0;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${C.legal};">${esc(footer.legal)}</td></tr>` : '';
  return `${row('', `padding:${sectionBefore ? 28 : 40}px 0 0;border-bottom:1px solid ${C.line};font-size:0;line-height:0;`)}${row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${lines}${legal}</table>`, 'padding:17px 0 0;')}`;
}

// ---------------------------------------------------------------- plain text
// Each piece of an email is one line of the plain text, whatever was typed
// into it: a name with line breaks in it can't write a footer or a link line
// of its own (`t`).
const t = oneLine;
function blockText(b) {
  switch (b.type) {
    case 'heading': return [t(b.text), ''];
    case 'text': return [t(b.text), ''];
    case 'button': return [`${t(b.label)}${b.time ? ` (${t(b.time)})` : ''}:`, safeHref(b.href), ''];
    case 'details': return [...b.rows.map(([label, value]) => `${t(label)}: ${t(value)}`), ''];
    case 'link': return [`${t(b.label)}:`, safeHref(b.href), ''];
    case 'coral-link': return [`${t(b.label)}:`, safeHref(b.href), ''];
    case 'files': return ['Attached:', ...b.names.map((n) => `- ${t(n)}`), ''];
    case 'label': return [`${t(b.text)}:`];
    case 'quote': return [t(b.text), ...(b.by ? [t(b.by)] : []), ''];
    case 'question': return [t(b.text), ''];
    case 'note': return [...(b.lead ? [t(b.lead)] : []), t(b.text), ...(b.after ? [t(b.after)] : []), ''];
    case 'slot': return [b.placeholder, ''];
    case 'section': return ['----', '', ...b.blocks.flatMap(blockText)];
    default: throw new Error(`The email template has no "${b.type}" part.`);
  }
}

function footerText(footer) {
  const out = ['----'];
  for (const l of footer.lines) {
    if (typeof l === 'string') out.push(t(l));
    else for (const link of (Array.isArray(l) ? l : [l])) out.push(`${t(link.label)}: ${safeHref(link.href)}`);
  }
  if (footer.legal) out.push(t(footer.legal));
  return out;
}

/**
 * Turns an email's document into what is sent.
 * @param {object} doc      the document (see the top of this file)
 * @param {object} [o]
 * @param {(key: 'crosshair'|'project') => string} [o.image]  where each image comes from: by default
 *        "cid:…", an inline image attached to the email (imagesFor gives the attachments);
 *        the test page passes its own addresses
 * @returns {{ subject: string, html: string, text: string, images: string[] }}
 */
export function renderEmail(doc, { image = (key) => `cid:${EMAIL_IMAGES[key].cid}` } = {}) {
  const brand = doc.brand === 'project' ? 'project' : 'portal';
  const subject = oneLine(doc.subject);
  const blocks = doc.blocks.filter(Boolean);
  const last = blocks[blocks.length - 1];
  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500&amp;display=swap" rel="stylesheet">
<style>
@font-face{font-family:Nekst;font-weight:400;font-style:normal;src:url(${FONT_HOST}/fonts/Nekst-Regular.woff2) format("woff2");}
:root{color-scheme:light only;}
@media (max-width:480px){
.pad{padding:28px 20px 24px!important;}
.cta,.cta tbody,.cta tr{display:block!important;width:100%!important;}
.btn-cell{display:block!important;width:100%!important;}
.btn{display:block!important;}
.cta-time{display:block!important;width:100%!important;padding:10px 0 0!important;text-align:center!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.text};">
${doc.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(doc.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" class="pad" style="padding:40px 32px 32px;">
<!--[if mso]><table role="presentation" width="520" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;text-align:left;word-break:break-word;overflow-wrap:anywhere;">
${brandHtml(brand, image)}
${blocks.map((b) => blockHtml(b, false)).join('\n')}
${footerHtml(doc.footer, last?.type === 'section')}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const textLines = [
    brand === 'project' ? 'The Clarity Project' : 'The Clarity Portal',
    '',
    ...blocks.flatMap(blockText),
    ...footerText(doc.footer),
  ];
  return { subject, html, text: textLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), images: [brand === 'project' ? 'project' : 'crosshair'] };
}

/**
 * The inline images an email needs, as Resend attachments.
 * @param {string[]} keys           renderEmail's `images`
 * @param {Record<string,string>} base64  api/_emailImages.js
 */
export function imagesFor(keys, base64) {
  return keys.map((key) => ({
    filename: EMAIL_IMAGES[key].file,
    content: base64[key],
    content_id: EMAIL_IMAGES[key].cid,
    content_type: 'image/png',
    disposition: 'inline',
  }));
}
