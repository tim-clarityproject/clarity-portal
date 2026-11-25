/* global AbortSignal */
// The daily reference rates (Phase 6b run 3, brief item 42; plan section 5): the European Central Bank's free daily list
// (euro foreign exchange reference rates, published around 16:00 Frankfurt time on working days), read once a night by
// the nightly round (api/_routes/billing-nightly.js) and kept in 065's fx_reference_rates, so a page never asks the
// ECB itself. The list is in euros; a rate here is units of each currency to £1 (065 and fx.js's unitsPerGbp), worked
// out through the pound's own rate on the list. The UAE dirham isn't on the list: it is pegged to the US dollar at
// 3.6725 (source 'peg'). Pure apart from fetchEcbRates, which takes its fetch. Checked by tests/performance/fx-fetch.test.mjs.
import { CURRENCY_LIST } from '../agreements/currency.js';

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
/** The dirham's fixed rate to the US dollar (Central Bank of the UAE, since 1997). */
export const AED_PER_USD = 3.6725;
/** The most bytes the list is read to (it is about 2 KB). */
export const ECB_MAX_BYTES = 64 * 1024;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round8 = (n) => Math.round(n * 1e8) / 1e8;

/**
 * The list's day and its rates in euros: { day: '2026-11-25', perEuro: { USD: 1.0412, GBP: 0.8327, ... } }, or null
 * when it isn't the ECB's list. Reads only <Cube time=…> and <Cube currency=… rate=…/>; anything else is ignored.
 */
export function parseEcbXml(xml) {
  const text = String(xml || '').slice(0, ECB_MAX_BYTES);
  const dayMatch = /<Cube\s+time\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/.exec(text);
  if (!dayMatch || !DAY.test(dayMatch[1])) return null;
  const perEuro = {};
  const re = /<Cube\s+currency\s*=\s*['"]([A-Z]{3})['"]\s+rate\s*=\s*['"]([0-9]+(?:\.[0-9]+)?)['"]\s*\/?>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0 && !(m[1] in perEuro)) perEuro[m[1]] = rate;
  }
  return Object.keys(perEuro).length ? { day: dayMatch[1], perEuro } : null;
}

/**
 * Units of each currency to £1 from the list: EUR is 1 ÷ the pound's rate, any other X is X's rate ÷ the pound's, and
 * the dirham is the dollar's × 3.6725. Only the portal's currencies (currency.js), never the pound itself, each a
 * number above 0 and below 100,000 with 8 decimal places (065's units_per_gbp). Null without the pound's rate.
 * @returns {{ day: string, rates: Object<string, { units: number, source: 'ECB'|'peg' }> }|null}
 */
export function unitsPerPound(parsed) {
  const gbp = Number(parsed?.perEuro?.GBP);
  if (!parsed?.day || !(gbp > 0)) return null;
  const rates = {};
  for (const c of CURRENCY_LIST) {
    if (c === 'GBP') continue;
    let units = null;
    let source = 'ECB';
    if (c === 'EUR') units = 1 / gbp;
    else if (c === 'AED') { const usd = Number(parsed.perEuro.USD); units = usd > 0 ? (usd / gbp) * AED_PER_USD : null; source = 'peg'; }
    else if (Number(parsed.perEuro[c]) > 0) units = Number(parsed.perEuro[c]) / gbp;
    if (units != null && units > 0 && units < 100000) rates[c] = { units: round8(units), source };
  }
  return { day: parsed.day, rates };
}

/** The rows for 065's fx_reference_rates: [{ day, currency, units_per_gbp, source, fetched_at }]. */
export function rateRows(perPound, fetchedAt = new Date()) {
  if (!perPound?.day) return [];
  return Object.entries(perPound.rates).map(([currency, r]) => ({
    day: perPound.day, currency, units_per_gbp: r.units, source: r.source, fetched_at: new Date(fetchedAt).toISOString(),
  }));
}

/**
 * Reads today's list from the ECB. Resolves the rows to keep, or [] when the list can't be read (no answer, not the
 * list, no pound): the rates already kept stay, and the screens show the last day's (never blocking sending).
 * @param {{ fetcher?: typeof fetch, now?: () => Date, timeoutMs?: number }} [o]
 */
export async function fetchEcbRates({ fetcher = globalThis.fetch, now = () => new Date(), timeoutMs = 10000 } = {}) {
  try {
    const r = await fetcher(ECB_DAILY_URL, { headers: { Accept: 'application/xml, text/xml' }, ...(timeoutMs > 0 && typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
    if (!r || !r.ok) return [];
    const xml = await r.text();
    return rateRows(unitsPerPound(parseEcbXml(xml)), now());
  } catch {
    return [];
  }
}
