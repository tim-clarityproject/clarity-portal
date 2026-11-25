// The daily reference rates from the European Central Bank (Phase 6b run 3, brief item 42): the list read, turned into
// units to £1 through the pound's own rate, the dirham by its peg, and nothing kept when the list can't be read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AED_PER_USD, ECB_DAILY_URL, fetchEcbRates, parseEcbXml, rateRows, unitsPerPound } from '../../src/lib/fx/ecb.js';

// The ECB's daily list, shortened, with invented rates (never a real day's).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-11-25'>
      <Cube currency='USD' rate='1.0500'/>
      <Cube currency='JPY' rate='160.00'/>
      <Cube currency='GBP' rate='0.8400'/>
      <Cube currency='CHF' rate='0.9450'/>
      <Cube currency='ZAR' rate='19.1100'/>
      <Cube currency='TRY' rate='36.10'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

test('the list is read: its day and its rates in euros', () => {
  const p = parseEcbXml(XML);
  assert.equal(p.day, '2026-11-25');
  assert.deepEqual(p.perEuro, { USD: 1.05, JPY: 160, GBP: 0.84, CHF: 0.945, ZAR: 19.11, TRY: 36.1 });
  assert.equal(parseEcbXml('<html>not the list</html>'), null);
  assert.equal(parseEcbXml(''), null);
});

test('units to £1: through the pound; the euro as 1 ÷ the pound; the dirham by its dollar peg; only the portal’s currencies', () => {
  const r = unitsPerPound(parseEcbXml(XML));
  assert.equal(r.day, '2026-11-25');
  assert.equal(r.rates.EUR.units, 1.19047619); // £1 = €1.19, so €1 = £0.84 (M28's "1 EUR = £0.84")
  assert.equal(r.rates.USD.units, 1.25);
  assert.equal(r.rates.JPY.units, 190.47619048);
  assert.equal(r.rates.CHF.units, 1.125);
  assert.deepEqual(r.rates.AED, { units: Math.round(1.25 * AED_PER_USD * 1e8) / 1e8, source: 'peg' });
  assert.equal(r.rates.TRY, undefined, 'not one of the portal’s currencies');
  assert.equal(r.rates.GBP, undefined, 'never the pound itself');
  assert.equal(r.rates.CAD, undefined, 'not on this list: left out, never guessed');
  assert.equal(unitsPerPound(parseEcbXml(XML.replace("<Cube currency='GBP' rate='0.8400'/>", ''))), null, 'no pound: nothing');
});

test('the rows kept: 065’s fx_reference_rates, with the day and the source', () => {
  const rows = rateRows(unitsPerPound(parseEcbXml(XML)), new Date('2026-11-25T03:15:00Z'));
  assert.deepEqual(rows.find((r) => r.currency === 'EUR'), { day: '2026-11-25', currency: 'EUR', units_per_gbp: 1.19047619, source: 'ECB', fetched_at: '2026-11-25T03:15:00.000Z' });
  assert.ok(rows.every((r) => r.units_per_gbp > 0 && r.units_per_gbp < 100000));
});

test('fetching: the ECB’s own address; an answer that isn’t the list, or none, keeps nothing (the last rates stay)', async () => {
  let asked = null;
  const ok = await fetchEcbRates({ fetcher: async (url) => { asked = url; return { ok: true, text: async () => XML }; }, timeoutMs: 0 });
  assert.equal(asked, ECB_DAILY_URL);
  assert.equal(ok.length, 6);
  assert.deepEqual(await fetchEcbRates({ fetcher: async () => ({ ok: false, status: 503, text: async () => '' }), timeoutMs: 0 }), []);
  assert.deepEqual(await fetchEcbRates({ fetcher: async () => { throw new Error('offline'); }, timeoutMs: 0 }), []);
  assert.deepEqual(await fetchEcbRates({ fetcher: async () => ({ ok: true, text: async () => '<html></html>' }), timeoutMs: 0 }), []);
});
