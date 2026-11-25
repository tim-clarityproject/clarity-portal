// src/lib/agreements/status.js: Sent, Opened, Signed, Settled for the coach (brief items 22 and 33; M28's s-sent).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../../src/lib/agreements/status.js';
import { formatClockTime } from '../../src/lib/dateFormatter.js';

const now = new Date();
const minsAgo = (m) => new Date(now.getTime() - m * 60000).toISOString();

test('sent and opened today show their times; not yet otherwise', () => {
  const sent = minsAgo(2);
  const opened = minsAgo(1);
  const rows = st.agreementStatus({ version: { version: 1, sent_at: sent }, opens: [{ opened_at: opened }], now });
  assert.deepEqual(rows.map((r) => r.label), ['Sent', 'Opened', 'Signed', 'Settled']);
  assert.equal(rows[0].value, `Today, ${formatClockTime(sent)}`);
  assert.equal(rows[1].value, `Today, ${formatClockTime(opened)}`);
  assert.equal(rows[2].value, 'Not yet');
  assert.equal(rows[2].done, false);
});

test('funded: settled reads "Invoiced to Northfield Logistics"', () => {
  const rows = st.agreementStatus({ version: { funded_by: 'Northfield Logistics' }, now });
  assert.equal(rows[3].value, 'Invoiced to Northfield Logistics');
});

test('the lines around it', () => {
  assert.equal(st.sentTitle({ version: { version: 1 }, firstName: 'Sam' }), 'Version 1, waiting for Sam to sign');
  assert.equal(st.sentTitle({ version: { version: 1, client_signed_at: minsAgo(1) }, firstName: 'Sam' }), 'Version 1, signed by Sam');
  assert.equal(st.sentTitle({ quote: { number: 42, status: 'sent' }, firstName: 'Sam' }), 'Quote Q-0042, waiting for Sam');
  assert.equal(st.sentLine({ version: { sent_at: minsAgo(1) }, now }), 'Sent today. A reminder is drafted for you at 3 and 7 days.');
  assert.equal(st.expiryLine({ version: { expires_on: '2026-12-25' }, firstName: 'Sam' }), 'If Sam hasn’t signed, it runs out on Fri 25 Dec 2026. You can reopen it in one step.');
});
