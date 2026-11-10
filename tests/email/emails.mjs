// The shared email template, checked the way an inbox would show it
// (Tim, 10 Nov). For every email on the test page's list (invented people
// only), at 600px and 375px:
//
//   - it is built for Gmail, Outlook and Apple Mail: tables for layout,
//     every style inline (no classes doing the styling, no CSS variables,
//     flex or grid), no script, and nothing that relies on a web font
//     (every font names Helvetica and Arial behind it);
//   - it is always light, and says so to the email app;
//   - no sideways scroll, nothing wider than its column, and at 375px the
//     button runs the full width with any time under it;
//   - exactly one coral button at most, with black words;
//   - every link and button has a real address (https, or Kit's own
//     placeholder on the public Leading Ideas), never "#" or empty;
//   - the image has its words as alt text or beside it, so the email reads
//     with images blocked, and it loads;
//   - no postal address anywhere, and the sign-off line where the mock-up
//     has it;
//   - the plain-text version reads properly: the same words in the same
//     order as the HTML, every address written out, no HTML left in it;
//   - times follow the time zone rules: a place name after every clock
//     time, 12-hour for the US reader, none at all in the 1-hour reminder,
//     and the travel line only for a frequent traveller.
//
// It also saves a screenshot of each email at both widths into the folder
// given (Tim's screens folder), and opens the hidden test page itself.
// Nothing is sent and the database isn't touched.
//
//   node --import ./tests/scores/register.mjs tests/email/emails.mjs [folder for screenshots]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMAIL_IMAGES, EMAIL_SIGN_OFF, renderEmail } from '../../src/lib/email/template.js';
import { EMAIL_EXAMPLES } from '../../src/pages/emailPreview/examples.js';
import { sessionTomorrowEmail } from '../../src/lib/email/emails.js';
import { instantAt } from '../../src/lib/time/index.js';

const APP = process.env.APP_URL || 'http://localhost:5173';
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
let passes = 0;
const fails = [];
const pass = (name, ok, detail = '') => { if (ok) passes += 1; else fails.push(`FAIL  ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); };

// The images as the email carries them, so the page needs no server.
const dataUri = (key) => `data:image/png;base64,${readFileSync(`public${EMAIL_IMAGES[key].path}`).toString('base64')}`;
const KIT = /^\{\{ (unsubscribe_url|address) \}\}$/;

const browser = await chromium.launch();
for (const example of EMAIL_EXAMPLES) {
  const email = renderEmail(example.doc(), { image: dataUri });
  const sent = renderEmail(example.doc());
  const tag = example.key;
  const html = email.html;

  // ---- built for Gmail, Outlook and Apple Mail
  const body = html.slice(html.indexOf('<body'));
  pass(`${tag}: tables for layout, nothing laid out with flex or grid`, /<table role="presentation"/.test(body) && !/display:\s*(flex|grid|inline-flex)/.test(body));
  pass(`${tag}: every style is inline (no CSS variables, no class doing the styling)`, !/var\(--/.test(html) && !/<(p|div|span|a|td|h1|img)[^>]*class="(?!pad|cta|btn|btn-cell|cta-time)[^"]*"/.test(body));
  pass(`${tag}: no script`, !/<script/i.test(html));
  const families = [...body.matchAll(/font-family:([^;"]+)/g)].map((m) => m[1]);
  pass(`${tag}: no web font is relied on: every font has Helvetica and Arial behind it`, families.length > 0 && families.every((f) => /Helvetica,Arial,sans-serif$/.test(f.trim())), families.find((f) => !/Helvetica,Arial,sans-serif$/.test(f.trim())));
  pass(`${tag}: always light, and says so`, /<meta name="color-scheme" content="light only">/.test(html) && /bgcolor="#F9F8F5"/.test(body));
  pass(`${tag}: a sent email carries its image inside it`, /src="cid:clarity-(crosshair|project)"/.test(sent.html) && sent.images.length === 1);

  // ---- links
  const links = [...body.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1].replace(/&amp;/g, '&'), label: m[2].replace(/<[^>]+>/g, '').trim() }));
  const badLinks = links.filter((l) => !(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(l.href) || KIT.test(l.href)) || !l.label);
  pass(`${tag}: every link and button has a real address`, badLinks.length === 0, JSON.stringify(badLinks));
  pass(`${tag}: no postal address`, !/\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/.test(email.text) && !/\b\d+ [A-Z][a-z]+ (Road|Street|Lane|Avenue|Close|Drive|Way)\b/.test(email.text));
  const isPublicList = tag === 'leading-ideas-public';
  const isLeadingIdeas = tag.startsWith('leading-ideas');
  pass(`${tag}: the sign-off line, as the mock-up has it`, isLeadingIdeas ? !email.text.includes(EMAIL_SIGN_OFF) && email.text.includes('Leading Ideas by Dr. Tim Dutton, every Thursday.') : email.text.includes(EMAIL_SIGN_OFF));
  if (isPublicList) pass(`${tag}: the address is only ever the one saved in Kit`, email.text.includes('The Clarity Project LTD · {{ address }}') && email.text.includes('Unsubscribe: {{ unsubscribe_url }}'));

  // ---- the plain-text version
  const text = email.text;
  pass(`${tag}: plain text has no HTML or entities`, !/<[a-z/][^>]*>|&amp;|&middot;|&#39;|&quot;/i.test(text));
  pass(`${tag}: plain text writes every address out`, links.every((l) => text.includes(l.href)), links.find((l) => !text.includes(l.href))?.href);
  const htmlWords = body.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const sentences = (example.doc().blocks.filter(Boolean).flatMap((b) => (b.type === 'section' ? b.blocks : [b])).flatMap((b) => [b.lead, b.label, b.text, b.by, b.after, ...(b.rows || []).flat()]).filter(Boolean));
  let at = -1;
  let inOrder = true;
  for (const s of sentences) { const i = text.indexOf(s, Math.max(0, at)); if (i < 0 || !htmlWords.includes(s)) { inOrder = false; pass(`${tag}: "${s.slice(0, 40)}" is in both versions`, false); break; } at = i; }
  pass(`${tag}: the plain text says the same things in the same order as the HTML`, inOrder);
  pass(`${tag}: plain text opens with who it is from and ends with the footer`, /^The Clarity (Portal|Project)\n/.test(text) && /----\n[^\n]+/.test(text));
  pass(`${tag}: plain text has no run of blank lines`, !/\n{3,}/.test(text));

  // ---- in a browser, as an inbox shows it
  for (const width of [600, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const coral = (c) => /255,\s*111,\s*92/.test(c);
      const buttons = [...document.querySelectorAll('td')].filter((td) => coral(getComputedStyle(td).backgroundColor));
      const column = document.querySelector('table table');
      const b = buttons[0]?.getBoundingClientRect();
      const time = document.querySelector('.cta-time')?.getBoundingClientRect();
      const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).map((e) => e.tagName);
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        wide: wide.slice(0, 3),
        bg: getComputedStyle(document.body).backgroundColor,
        buttons: buttons.length,
        buttonText: buttons[0] ? getComputedStyle(buttons[0].querySelector('a')).color : null,
        buttonH: b ? Math.round(b.height) : null,
        buttonFull: b && column ? Math.abs(b.width - column.getBoundingClientRect().width) < 2 : null,
        timeUnder: b && time ? time.top >= b.bottom - 1 : null,
        timeBeside: b && time ? time.left >= b.right - 1 && Math.abs((time.top + time.height / 2) - (b.top + b.height / 2)) < 8 : null,
        columnW: column ? Math.round(column.getBoundingClientRect().width) : null,
        images: [...document.images].map((i) => ({ ok: i.complete && i.naturalWidth > 0, w: i.getBoundingClientRect().width, alt: i.alt, near: (i.closest('table')?.innerText || '').trim() })),
        h1: document.querySelectorAll('h1').length,
        coralText: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() && coral(getComputedStyle(e).color)).length,
      };
    });
    const t = `${tag} ${width}px`;
    pass(`${t}: no sideways scroll`, m.sideways <= 0 && m.wide.length === 0, `${m.sideways}px ${m.wide.join()}`);
    pass(`${t}: light, even on a device set to dark`, m.bg === 'rgb(249, 248, 245)', m.bg);
    pass(`${t}: the column is at most 520px`, m.columnW <= 520 && m.columnW >= Math.min(520, width - 64) - 1, `${m.columnW}`);
    pass(`${t}: at most one coral button, with black words, 44px or taller`, m.buttons <= 1 && (m.buttons === 0 || (m.buttonText === 'rgb(0, 0, 0)' && m.buttonH >= 44)), JSON.stringify([m.buttons, m.buttonText, m.buttonH]));
    pass(`${t}: no coral words`, m.coralText === 0, `${m.coralText}`);
    pass(`${t}: one heading`, m.h1 === 1, `${m.h1}`);
    if (m.buttons === 1 && width === 375) pass(`${t}: the button runs full width${m.timeUnder === null ? '' : ', with the time under it'}`, m.buttonFull === true && m.timeUnder !== false, JSON.stringify([m.buttonFull, m.timeUnder]));
    if (m.buttons === 1 && width === 600 && m.timeBeside !== null) pass(`${t}: only the time sits beside the button`, m.timeBeside === true);
    pass(`${t}: the image loads, and the email names itself with images blocked`, m.images.length === 1 && m.images[0].ok && (m.images[0].alt === 'The Clarity Project' || /The Clarity Portal/i.test(m.images[0].near)), JSON.stringify(m.images));
    if (out) await page.screenshot({ path: join(out, `email-${tag}-${width}.png`), fullPage: true });
    await page.close();
  }
}

// ---- the time zone rules in the reminders
const text = (key) => renderEmail(EMAIL_EXAMPLES.find((e) => e.key === key).doc()).text;
const subject = (key) => renderEmail(EMAIL_EXAMPLES.find((e) => e.key === key).doc()).subject;
pass('reminder, Chicago: a 12-hour time with the city, in the subject and the body', subject('session-tomorrow') === 'Your coaching session with Jess is tomorrow at 10:00 am Chicago time' && text('session-tomorrow').includes('Your coaching session with Jess is tomorrow, Wed 11 Nov, at 10:00 am Chicago time.'), subject('session-tomorrow'));
pass('reminder, the UK: a 24-hour time with "UK time"', subject('session-tomorrow-uk') === 'Your coaching session with Tim is tomorrow at 15:00 UK time' && text('session-tomorrow-uk').includes('tomorrow, Wed 11 Nov, at 15:00 UK time.'), subject('session-tomorrow-uk'));
pass('reminder: the travel line only for a frequent traveller', text('session-tomorrow').includes('Travelling? Your calendar invite moves with you.') && !text('session-tomorrow-uk').includes('Travelling?'));
pass('the 1-hour reminder never gives a clock time', !/\d{1,2}:\d{2}|\b(am|pm)\b| time\b/.test(`${subject('session-one-hour')} ${text('session-one-hour').split('----')[0]}`), text('session-one-hour'));
pass('no email writes a zone in letters or a date in numbers', EMAIL_EXAMPLES.every((e) => { const r = renderEmail(e.doc()); return !/\b(EST|EDT|CST|CDT|PST|PDT|BST|GMT|UTC)\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(`${r.subject} ${r.text}`); }));
{
  // The reader's own day decides "tomorrow": a Sydney Monday 08:00 session, read in Sydney on Sunday.
  const at = instantAt('2026-11-16', '08:00', 'Australia/Sydney');
  const d = renderEmail(sessionTomorrowEmail({ coach: 'Tim', at, zone: 'Australia/Sydney', prepLink: 'https://portal.theclarityproject.co.uk/welcome', zoomLink: 'https://zoom.us/j/0', preferencesLink: 'https://portal.theclarityproject.co.uk/my-account', now: instantAt('2026-11-15', '07:00', 'Australia/Sydney') }));
  pass('reminder, Sydney: "tomorrow" is the reader’s own tomorrow, in Sydney time', d.subject === 'Your coaching session with Tim is tomorrow at 08:00 Sydney time' && d.text.includes('tomorrow, Mon 16 Nov, at 08:00 Sydney time.'), d.subject);
}

// ---- the hidden test page
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests = [];
  page.on('request', (r) => { if (/supabase\.co|resend\.com|\/api\//.test(r.url())) requests.push(r.url()); });
  try {
    await page.goto(`${APP}/email-preview`);
    await page.waitForSelector('.emailp-frame', { timeout: 20000 });
    await page.waitForTimeout(800);
    pass('test page: opens with the first email', (await page.locator('[data-email-subject]').innerText()) === 'Northfield Logistics finished their Health Check');
    for (const e of EMAIL_EXAMPLES) {
      await page.goto(`${APP}/email-preview?email=${e.key}`);
      await page.waitForSelector('.emailp-frame');
      await page.waitForTimeout(500);
      const frame = page.frameLocator('.emailp-frame');
      const expected = renderEmail(e.doc());
      pass(`test page, ${e.key}: shows its subject, the email and its plain text`, (await page.locator('[data-email-subject]').innerText()) === expected.subject && (await frame.locator('h1').count()) === 1 && (await page.locator('[data-email-text]').innerText()).trim() === expected.text, await page.locator('[data-email-subject]').innerText());
      pass(`test page, ${e.key}: the image shows`, await frame.locator('img').first().evaluate((i) => i.complete && i.naturalWidth > 0));
    }
    await page.goto(`${APP}/email-preview?email=session-tomorrow&width=375`);
    await page.waitForSelector('.emailp-frame');
    pass('test page: the phone width is 375px', Math.round((await page.locator('.emailp-frame').boundingBox()).width) === 375);
    pass('test page: no errors, nothing sent and no database call', errors.length === 0 && requests.length === 0, [...errors, ...requests].join(' | '));
    if (out) await page.screenshot({ path: join(out, 'email-test-page.png'), fullPage: true });
  } catch (e) {
    pass('test page: opened', false, e.message.split('\n')[0]);
  }
  await page.close();
}
await browser.close();

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
