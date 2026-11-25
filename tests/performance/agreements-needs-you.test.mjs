// src/lib/agreements/needsYou.js: Needs you's items in M28's words, Done and Not now (brief items 10, 23, 24, 40, 41).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as n from '../../src/lib/agreements/needsYou.js';

const today = '2026-11-25';

test('M28’s rows and their lines', () => {
  const items = [
    n.changeItem({ requestId: 'r1', name: 'Sam Reid', clauseTitle: '8. Ending and changes', day: '2026-11-23', today }),
    n.renewItem({ agreementId: 'a4', name: 'Alex Morgan', endDay: '2027-02-12', day: '2026-11-24', today }),
    n.priceItem({ agreementId: 'a3', name: 'Jo Patel', feeMinor: 300000, sinceDay: '2026-01-04', dueDay: '2027-01-04', day: today, today }),
    n.poItem({ organisationId: 'o1', orgName: 'Northfield Logistics', number: 1250, day: '2026-11-24', today }),
    n.overdueItem({ invoiceId: 'i1', name: 'Sam Reid', number: 1243, amountMinor: 300000, daysOverdue: 14, day: today, today }),
    n.approvalItem({ agreementId: 'a2', coachName: 'Priya Shah', clientName: 'Kai Thompson', coaching: '6-month coaching', day: today, today }),
    n.hoursItem({ agreementId: 'a5', firstName: 'Adie', usedMinutes: 640, blockMinutes: 800, day: today, today }),
    n.signReminderItem({ versionId: 'v1', name: 'Sam Reid', version: 1, sentDay: '2026-11-22', day: today, today }),
    n.deliveredItem({ agreementId: 'a1', name: 'Jo Patel', count: 2, amountMinor: 150000, day: today, today }),
    n.firstPaymentItem({ versionId: 'v2', firstName: 'Sam', day: today, today }),
  ];
  const shown = n.visible(items, [], today);
  assert.deepEqual(shown.map((i) => [i.title, i.line, i.when]), [
    ['Invoice ready for Jo Patel', '2 coaching sessions since the last one, £1,500', 'Today'],
    ['Reminder ready for Sam Reid', 'Hasn’t signed version 1, sent 3 days ago', 'Today'],
    ['Sam signed, and the first payment isn’t settled yet.', 'A reminder is drafted for you to send', 'Today'],
    ['Adie’s block is 80% used', '10 hours 40 minutes of 13 hours 20 minutes', 'Today'],
    ['Priya Shah made an agreement for you to approve', 'Kai Thompson, 6-month coaching', 'Today'],
    ['Reminder ready for Sam Reid', 'CLARITY-1243, £3,000, 14 days overdue', 'Today'],
    ['Northfield Logistics needs a purchase order', 'Invoice CLARITY-1250 is waiting', 'Yesterday'],
    ['Yearly price review for Jo Patel', 'Retainer, £3,000/month since Jan 2026, review due Mon 4 Jan', 'Today'],
    ['Offer Alex Morgan the next 6 months', 'These 6 months end Fri 12 Feb, a month from now', 'Yesterday'],
    ['Sam Reid asked for a change to their agreement', '8. Ending and changes', 'Mon'],
  ]);
});

test('Done hides an item; Not now hides it until its day; keys are stable', () => {
  const a = n.deliveredItem({ agreementId: 'a1', name: 'Jo', count: 1, amountMinor: 75000, day: today, today });
  assert.equal(a.key, 'delivered:a1');
  assert.deepEqual(n.visible([a], [{ item_key: 'delivered:a1', state: 'done' }], today), []);
  assert.deepEqual(n.visible([a], [{ item_key: 'delivered:a1', state: 'not_now', until: '2026-11-26' }], today), []);
  assert.equal(n.visible([a], [{ item_key: 'delivered:a1', state: 'not_now', until: '2026-11-25' }], today).length, 1);
  assert.equal(n.doneRow('c1', a.key).state, 'done');
  assert.equal(n.EMPTY_LINE, 'Nothing needs you right now.');
});
