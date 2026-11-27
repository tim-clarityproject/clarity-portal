// Stage D, item 15 (Tim, 27 Nov): Finances showed "An invoice for £900 is 9 days overdue. Nadia Kerr" with "Reminders:
// None sent yet", while Needs you said "Nothing needs you right now." Why: Needs you listed an overdue invoice only once
// the nightly round had drafted its reminder, and that round drafted reminders only with Stripe's key (and never runs
// on the local stand-in). Now an invoice already past 3 or 7 days overdue when it is first seen owes its latest reminder
// only (never one per missed day, and never an earlier stage after a later one), the round drafts it with or without
// Stripe, Send drafts it on the spot if the round hasn't, and Needs you and Finances list the same invoice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REMINDER_DAYS, reminderDue, stageOwed } from '../../src/lib/billing/money.js';
import { billing } from '../../api/_routes/coach-billing.js';
import { remindersNightly } from '../../api/_routes/billing-nightly.js';
import * as d from '../../src/lib/agreements/duringAgreement.js';
import { visible } from '../../src/lib/agreements/needsYou.js';
import { needsYouRows, reminderLines } from '../../src/lib/coach/financeData.js';
import { fakeDb } from './_fakeDb.mjs';

const COACH = { id: 'c-alex', role: 'owner', active: true };
const DUE = '2026-11-18';
const NINE_DAYS_ON = '2026-11-27T10:00:00Z'; // 9 days overdue in London
const inv = { id: 'i-nadia', coach_id: COACH.id, profile_id: 'p-nadia', status: 'sent', number: 9703, total_minor: 90000, paid_minor: 0, currency: 'GBP',
  due_on: DUE, payer_zone: 'Europe/London', payer_name: 'Nadia Kerr', payer_email: 'nadia@example.invalid', hosted_url: 'https://invoice.stripe.example/x', settles_to: 'client' };

test('REMINDER_DAYS are 3, 7 and 14', () => {
  assert.deepEqual([...REMINDER_DAYS], [3, 7, 14]);
});

test('the latest stage reached only, never an earlier one after a later one', () => {
  assert.equal(stageOwed(2, []), null);
  assert.equal(stageOwed(3, []), 3);
  assert.equal(stageOwed(9, []), 7, 'first seen 9 days overdue: the 7-day one only');
  assert.equal(stageOwed(10, [7]), null, 'the day after: the missed 3-day one is never drafted');
  assert.equal(stageOwed(14, [7]), 14);
  assert.equal(stageOwed(30, []), 14);
  assert.equal(stageOwed(30, [14]), null);
  assert.equal(reminderDue({ dueKey: DUE, now: NINE_DAYS_ON, zone: 'Europe/London', drafted: [] }), 7);
  assert.equal(reminderDue({ dueKey: DUE, now: '2026-11-28T10:00:00Z', zone: 'Europe/London', drafted: [7] }), null);
});

function world() {
  const db = fakeDb({ invoices: [{ ...inv }], invoice_reminders: [], invoice_reminder_pauses: [], coaches: [COACH] });
  const now = { value: new Date(NINE_DAYS_ON) };
  return { db, now, b: billing({ server: db, stripe: null, coach: COACH, now: () => now.value }) };
}

test('the drafting job, first seeing an invoice inserted already 9 days overdue: one reminder, the 7-day one, then the 14-day one on its day', async () => {
  const { db, now, b } = world();
  assert.deepEqual(await b.draftReminders(), { drafted: 1 });
  assert.deepEqual(db.tables.invoice_reminders.map((r) => r.stage), [7]);
  assert.deepEqual(await b.draftReminders(), { drafted: 0 }, 'asked again the same night: nothing more');
  now.value = new Date('2026-11-28T03:15:00Z');
  assert.deepEqual(await b.draftReminders(), { drafted: 0 }, 'the next night: no 3-day one after the 7-day one');
  now.value = new Date('2026-12-02T03:15:00Z');
  assert.deepEqual(await b.draftReminders(), { drafted: 1 });
  assert.deepEqual(db.tables.invoice_reminders.map((r) => r.stage), [7, 14]);
});

test('the nightly round drafts reminders without Stripe too, for every active coach', async () => {
  const { db, now } = world();
  const r = await remindersNightly({ server: db, now: () => now.value });
  assert.deepEqual(r, { reminders: 1, problems: 0 });
  assert.deepEqual(db.tables.invoice_reminders.map((x) => [x.invoice_id, x.stage]), [['i-nadia', 7]]);
  assert.deepEqual((await remindersNightly({ server: db, now: () => now.value })).reminders, 0);
});

test('Send on an owed reminder drafts it on the spot (once, however often pressed), and never past one that may have gone', async () => {
  const { db, b } = world();
  const first = await b.draftOwedReminder('i-nadia');
  assert.ok(first.reminderId);
  assert.deepEqual(await b.draftOwedReminder('i-nadia'), first, 'pressed again: the same one, waiting');
  assert.deepEqual(db.tables.invoice_reminders.map((r) => r.stage), [7]);
  const claimed = await b.reminderToSend(first.reminderId);
  assert.equal(claimed.reminder.stage, 7);
  assert.deepEqual(await b.draftOwedReminder('i-nadia'), { none: true }, 'marked as sending: Send again after a check, never a new draft');
  const other = billing({ server: db, stripe: null, coach: { id: 'c-maya', role: 'coach', active: true }, now: () => new Date(NINE_DAYS_ON) });
  await assert.rejects(other.draftOwedReminder('i-nadia'), /isn’t yours/);
});

test('Needs you and Finances agree on an invoice 9 days overdue with no reminder drafted yet', () => {
  const today = '2026-11-27';
  const clients = [{ id: 'p-nadia', name: 'Nadia Kerr' }];
  const items = visible(d.needsYouItems({ coachId: COACH.id, today, now: Date.parse(NINE_DAYS_ON), invoices: [inv], invoiceReminders: [], clients }), [], today);
  const overdue = items.filter((i) => i.kind === 'overdue');
  assert.equal(overdue.length, 1, 'Needs you no longer says "Nothing needs you right now."');
  assert.equal(overdue[0].title, 'Reminder ready for Nadia Kerr');
  assert.equal(overdue[0].line, 'CLARITY-9703, £900, 9 days overdue');
  assert.deepEqual([overdue[0].data.reminderId, overdue[0].data.stage], [null, 7], 'Send drafts the 7-day one');
  const fin = needsYouRows({ invoices: [inv], today, names: {} }).filter((r) => r.invoiceId === 'i-nadia');
  assert.equal(fin.length, 1);
  assert.match(fin[0].title, /^An invoice for £900 is 9 days overdue\.$/);
  // Today: never twice (Who needs attention leaves it to Needs you).
  assert.equal(d.attentionInvoices([inv], { reminders: [], coachId: COACH.id, today }).length, 0);
  // Finances' own panel says the reminder is ready and Send a reminder now sends it.
  const lines = reminderLines({ invoice: inv, reminders: [], today });
  assert.equal(lines.owed, 7);
  assert.deepEqual(lines.lines, ['None sent yet', 'The last one goes on Wed 2 Dec', 'The 7-day reminder is ready to send']);
});

test('once drafted, the same item (same key) stays; once sent, Needs you lets it go until the next stage', () => {
  const today = '2026-11-27';
  const clients = [{ id: 'p-nadia', name: 'Nadia Kerr' }];
  const owed = d.needsYouItems({ coachId: COACH.id, today, invoices: [inv], invoiceReminders: [], clients }).find((i) => i.kind === 'overdue');
  const drafted = d.needsYouItems({ coachId: COACH.id, today, invoices: [inv], invoiceReminders: [{ id: 'r7', invoice_id: 'i-nadia', stage: 7, drafted_at: '2026-11-27T03:15:00Z' }], clients }).find((i) => i.kind === 'overdue');
  assert.equal(owed.key, drafted.key, 'Done or Not now on the owed item holds once it is drafted');
  assert.equal(drafted.data.reminderId, 'r7');
  const sent = [{ id: 'r7', invoice_id: 'i-nadia', stage: 7, drafted_at: '2026-11-27T03:15:00Z', sent_at: '2026-11-27T09:00:00Z' }];
  assert.equal(d.overdueInNeedsYou(inv, { reminders: sent, coachId: COACH.id, today }), false);
  assert.equal(d.overdueInNeedsYou(inv, { reminders: sent, coachId: COACH.id, today: '2026-12-02' }), true, 'the 14-day one is owed on its day');
  assert.equal(d.overdueInNeedsYou(inv, { reminders: [], pauses: [{ profile_id: 'p-nadia' }], coachId: COACH.id, today }), false, 'paused: no reminder offered');
});
