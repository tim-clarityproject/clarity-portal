// Phase 6b run 3's emails (src/lib/email/agreementEmails.js): M28's words where M28 draws them, the coach's note first,
// one button, no "pay" and no interest in anything a client or organisation reads, every one through the shared template
// and on /email-preview.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail } from '../../src/lib/email/template.js';
import { EMAIL_EXAMPLES } from '../../src/pages/emailPreview/examples.js';
import { AGREEMENT_EMAILS, readyToSignEmail, quoteEmail, signReminderEmail, sponsorSignEmail, peopleNames, noteBlocks } from '../../src/lib/email/agreementEmails.js';

const L = 'https://portal.theclarityproject.co.uk/x';
const textOf = (doc) => renderEmail(doc).text;

test('every agreement email is on the test page and renders through the one template', () => {
  const docs = EMAIL_EXAMPLES.map((e) => e.doc());
  for (const name of Object.keys(AGREEMENT_EMAILS)) assert.ok(EMAIL_EXAMPLES.some((e) => String(e.doc).includes(name.replace(/Email$/, ''))), `${name} has an example`);
  assert.ok(docs.length > 40);
});

test('no "pay", no interest, at most one button, in every one of them', () => {
  for (const e of EMAIL_EXAMPLES.filter((x) => /agreement|quote|sponsor|org-invoice|team-member/.test(x.key))) {
    const r = renderEmail(e.doc());
    const words = r.text.replace(/Apple Pay/g, '');
    assert.ok(!/\bpa(y|id|ying|yment)\b/i.test(words.replace(/first payment/gi, '')), `${e.key}: never "pay"`);
    assert.ok(!/interest/i.test(r.text), `${e.key}: no interest`);
    assert.ok(e.doc().blocks.filter((b) => b?.type === 'button').length <= 1, `${e.key}: one button at most`);
  }
});

test('M28 s-c-email: the note first, ~5 minutes, Read and sign; a quote: See my quote and accept, sign and settle in one go', () => {
  const ready = textOf(readyToSignEmail({ firstName: 'Sam Reid', coachFirst: 'Tim', note: 'It was great to talk.', link: L }));
  assert.ok(ready.indexOf('It was great to talk.') < ready.indexOf('It takes ~5 minutes to read and sign.'));
  assert.match(ready, /^Hi Sam,/m);
  assert.match(ready, /Read and sign:/);
  assert.match(textOf(readyToSignEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L })), /Here is everything we agreed\./, 'M28’s note when none is left');
  const q = quoteEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L, number: 'Q-0042', validUntilWords: 'Fri 25 Dec 2026' });
  assert.equal(q.subject, 'Your coaching quote from Tim');
  assert.match(textOf(q), /accept, sign and settle in one go/);
  assert.match(textOf(q), /Quote Q-0042, valid until Fri 25 Dec 2026\./);
  assert.throws(() => quoteEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L, number: '42' }), /Q- number/);
});

test('M28 s-n-signrem: the drafted words, or the coach’s own after Edit', () => {
  assert.match(textOf(signReminderEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L })), /Just a nudge that your coaching agreement is waiting for you in the portal\./);
  const edited = textOf(signReminderEmail({ firstName: 'Sam', coachFirst: 'Tim', link: L, lines: 'Hi again.\n\nNo rush.' }));
  assert.ok(!/nudge/.test(edited) && /Hi again\./.test(edited) && /No rush\./.test(edited));
});

test('M28 s-s-email: the people named, ~5 minutes, signed online', () => {
  assert.equal(peopleNames(['Sam Reid', 'Jo Bell', 'Ali Khan']), 'Sam Reid, Jo Bell and Ali Khan');
  const s = sponsorSignEmail({ sponsorFirst: 'Priya', orgName: 'Northfield Logistics', names: ['Sam Reid'], coachFirst: 'Tim', link: L });
  assert.equal(s.subject, 'Coaching agreement for Northfield Logistics');
  assert.match(textOf(s), /Here’s the agreement for the coaching we discussed for Sam Reid\. It takes ~5 minutes to read, and you can sign it online\./);
});

test('what the coach typed stays text, a paragraph a block, never markup', () => {
  assert.deepEqual(noteBlocks('One.\n\n<b>Two</b>\n\n\n'), [{ type: 'text', text: 'One.' }, { type: 'text', text: '<b>Two</b>' }]);
  assert.ok(!renderEmail(readyToSignEmail({ firstName: 'Sam', coachFirst: 'Tim', note: '<script>x</script>', link: L })).html.includes('<script>x'));
});
