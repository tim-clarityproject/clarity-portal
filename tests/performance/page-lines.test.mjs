// Every page's opening line is one full sentence, never two, and never says "pay" (Polish 1 rule 12; 26 Oct rule 9;
// Tim's walk of Stage B, item 5), and none says who can see the page (the eye does). The example pages' and M28 v6's
// own lines keep their words even where they have two sentences: listed in KEPT. FX7, 26 Nov.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../../src/content/pageLines/client.js';
import * as coach from '../../src/content/pageLines/coach.js';

// The example pages' and M28 v6's own words, kept exactly.
const KEPT = new Set([
  client.preparingLine('Alex'), client.preparingLine(''),
  coach.needsYouLine(5), coach.needsYouLine(1), coach.needsYouLine(0),
  coach.MONEY_LINES.newInvoice,
  coach.bookingLine({ minutes: 30 }), coach.bookingLine({ minutes: 30, zoom: true }), coach.bookingLine({ minutes: 30, description: 'A call to talk about coaching' }),
]);

const lines = [
  ...Object.values(client.B1_LINES), ...Object.values(client.B2_LINES), ...Object.values(client.B3_LINES), ...Object.values(client.HUB_LINES),
  client.DASHBOARD_LINE, client.ACCOUNT_LINE,
  client.homeLine({ needs: 2, session: { when: 'tomorrow', time: '09:00' }, coached: true }), client.homeLine({ needs: 0 }), client.homeLine({ needs: 1, coached: true }),
  coach.CALENDAR_LINE, coach.TODOS_LINE, coach.todoListLine(true), coach.todoListLine(false), coach.SETTINGS_LINE, coach.settingsSectionLine('Email'),
  coach.BOARDS_LINE, coach.boardPageLine(true), coach.boardPageLine(false), coach.AUTOMATIONS_LINE, coach.OPEN_FOR_CALLS_LINE, coach.pollLine('Sam and Jo'), coach.pollLine(''),
  coach.financesLine('April'), coach.sessionLine({ name: 'Sam' }), coach.sessionLine({ name: 'Sam', happened: true }), coach.sessionLine({ name: 'Sam', sent: true }),
  ...['clientsLine', 'pastLine', 'leadsLine', 'coldLine', 'reportsLine', 'networkLine', 'orgLine', 'groupLine'].map((k) => coach.PEOPLE[k]),
  coach.clientLine({ role: 'Head of Sales', city: 'Leeds' }), coach.clientLine({ role: 'Head of Sales' }), coach.clientLine({ city: 'Leeds' }), coach.clientLine(),
  coach.workshopLine({ organisation: 'Halden', place: 'Leeds' }), coach.workshopLine({ past: true }), coach.leadLine({ first: 'Jo' }), coach.leadLine({ first: 'Jo', cold: true }), coach.leadLine({ first: 'Jo', won: true }),
  coach.AGREEMENT_LINES.whatToSay, coach.AGREEMENT_LINES.orgBilling,
  coach.agreementLine({ signedOn: 'Mon 2 Nov', end: 'Fri 30 Apr', pausedTo: 'Mon 7 Dec' }), coach.agreementLine({ first: 'Sam' }), coach.agreementLine({ signedOn: 'Mon 2 Nov', end: 'Fri 30 Apr' }),
  coach.MONEY_LINES.hours('Imogen'), coach.MONEY_LINES.invoiceSent,
  coach.BUILDER_LINES.packages, coach.BUILDER_LINES.terms, coach.BUILDER_LINES.termsAssociate, coach.BUILDER_LINES.clauses('Sam'), coach.BUILDER_LINES.clausesAssociate('Sam'),
  coach.BUILDER_LINES.check('Sam'), coach.BUILDER_LINES.sign('Sam'), coach.BUILDER_LINES.start('Jo'),
];

test('every opening line is one sentence ending in a full stop, never "pay", never who can see it', () => {
  for (const line of lines) {
    assert.equal(typeof line, 'string', String(line));
    assert.match(line, /[.?]$/, `ends with a full stop: ${line}`);
    assert.ok(!/\bpa(y|id|yment)s?\b/i.test(line), `no "pay": ${line}`);
    assert.ok(!/\b(who can (see|read)|sees? the same|shared with|only you can)\b/i.test(line), `no who-sees words: ${line}`);
    if (KEPT.has(line)) continue;
    assert.ok(!/[.?!]\s+[A-Z]/.test(line.replace(/\b(Mr|Mrs|Ms|Dr)\.\s/g, '')), `one sentence: ${line}`);
  }
});

test('the lines that were phrases are now sentences (a sample, the report draft’s flags)', () => {
  assert.equal(client.B1_LINES.myPlans, 'Every plan you’ve saved is here, newest first.');
  assert.equal(client.B1_LINES.myReviews, 'Every review you’ve saved is here, newest first.');
  assert.equal(client.B1_LINES.myJournals, 'Every journal entry you’ve written is here, newest first.');
  assert.equal(coach.PEOPLE.clientsLine, 'Here are the people you coach, and when you see each of them next.');
  assert.equal(coach.clientLine({ role: 'Head of Sales', city: 'Leeds' }), 'Their role is Head of Sales, and they’re based in Leeds.');
});
