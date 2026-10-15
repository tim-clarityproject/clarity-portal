// Strategic Alignment Health Check: email content (plain, well-spaced HTML plus a
// plain-text version). Black page, white text, the logo mark only. The file name
// starts with an underscore so Vercel does not publish it as a route.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

const COLOURS = { bg: '#000000', text: '#FFFFFF', muted: '#A3A3A0', line: '#262626', coral: '#FF6F5C' };

function shell({ origin, heading, bodyHtml }) {
  return `<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:${COLOURS.bg};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLOURS.bg};">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
<tr><td style="padding-bottom:32px;"><img src="${esc(origin)}/brand/mark_colour-on-dark.png" width="40" height="40" alt="The Clarity Project" style="display:block;border:0;"></td></tr>
<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:1.3;letter-spacing:2px;text-transform:uppercase;color:${COLOURS.text};padding-bottom:12px;">${esc(heading)}</td></tr>
<tr><td style="padding-bottom:24px;"><div style="width:56px;height:1px;background:${COLOURS.coral};"></div></td></tr>
${bodyHtml}
<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${COLOURS.muted};padding-top:32px;border-top:1px solid ${COLOURS.line};">The Clarity Project &middot; theclarityproject.co.uk</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const para = (html) => `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${COLOURS.text};padding-bottom:20px;">${html}</td></tr>`;
const small = (html) => `<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${COLOURS.muted};padding-bottom:20px;">${html}</td></tr>`;
const button = (href, label) => `<tr><td style="padding-bottom:28px;"><a href="${esc(href)}" style="display:inline-block;background:${COLOURS.coral};color:#000000;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 32px;border-radius:999px;">${esc(label)}</a></td></tr>`;

export function ukDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

export function ukDateTime(value) {
  const d = new Date(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
  return `${date}, ${time}`;
}

/** The email to the respondent: a link to their results. Never contains the access code. */
export function linkEmail({ origin, token, dateText }) {
  const link = `${origin}/health-check/${token}`;
  const subject = 'Your Strategic Alignment Health Check';
  const html = shell({
    origin,
    heading: 'Your Strategic Alignment Health Check',
    bodyHtml: [
      para('Here is the link to your Strategic Alignment Health Check results, so you can find them again at any time.'),
      button(link, 'Open your results'),
      small('To open it you will need the same email address and the access code you were given.'),
      small(esc(dateText)),
    ].join('\n'),
  });
  const text = [
    'Your Strategic Alignment Health Check',
    '',
    'Here is the link to your Strategic Alignment Health Check results, so you can find them again at any time:',
    link,
    '',
    'To open it you will need the same email address and the access code you were given.',
    '',
    dateText,
    '',
    'The Clarity Project - theclarityproject.co.uk',
  ].join('\n');
  return { subject, html, text };
}

/** The notice to Tim and AD when a Strategic Alignment Health Check is completed. */
export function completeEmail({ origin, token, clientLabel, respondentEmail, completedText, objective, top }) {
  const link = `${origin}/health-check/${token}`;
  const label = oneLine(clientLabel);
  const subject = `Strategic Alignment Health Check completed: ${label}`;
  const topHtml = top.length
    ? `<ol style="margin:0;padding-left:20px;">${top.map((p) => `<li style="padding-bottom:6px;">${esc(p.text)} <span style="color:${COLOURS.muted};">(${p.importance}% strategic importance)</span></li>`).join('')}</ol>`
    : '<span style="color:#A3A3A0;">No projects were rated.</span>';
  const html = shell({
    origin,
    heading: 'Health Check completed',
    bodyHtml: [
      para(`<strong>${esc(label)}</strong> has completed the Strategic Alignment Health Check.`),
      small(`Respondent: ${esc(respondentEmail)}<br>Completed: ${esc(completedText)}`),
      para(`<span style="color:${COLOURS.muted};font-size:12px;letter-spacing:2px;text-transform:uppercase;">Objective</span><br>${esc(objective)}`),
      para(`<span style="color:${COLOURS.muted};font-size:12px;letter-spacing:2px;text-transform:uppercase;">Most in need of attention</span><br>${topHtml}`),
      button(link, 'Open the one-pager'),
      small('Opening it needs the respondent’s email address and the access code you sent them.'),
    ].join('\n'),
  });
  const text = [
    `${label} has completed the Strategic Alignment Health Check.`,
    '',
    `Respondent: ${respondentEmail}`,
    `Completed: ${completedText}`,
    '',
    'Objective:',
    objective,
    '',
    'Most in need of attention:',
    ...(top.length ? top.map((p, i) => `${i + 1}. ${p.text} (${p.importance}% strategic importance)`) : ['No projects were rated.']),
    '',
    `One-pager: ${link}`,
    'Opening it needs the respondent’s email address and the access code you sent them.',
    '',
    'The Clarity Project - theclarityproject.co.uk',
  ].join('\n');
  return { subject, html, text };
}
