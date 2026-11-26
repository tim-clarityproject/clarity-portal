import { moneyText } from '../../agreements/currency.js';
import { businessOf } from '../theme.js';

// What the invoice, the quotation, the credit note and the agreement share (the 25 Nov PDFs, Polish 1): money with its
// pence ("£3,000.00", conventional on a document that is paid and filed), hours with one decimal ("8.0"), the long
// date ("25 November 2026"), and who it's from, from the business's own details (src/lib/pdf/theme.js businessOf).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "£3,000.00", "−£225.00", "¥12,000" (a currency without minor units keeps none). */
export function money(minor, currency = 'GBP') {
  const text = moneyText(Math.round(Number(minor) || 0), currency);
  const places = (/\.(\d+)$/.exec(moneyText(1, currency)) || [])[1]?.length || 0;
  return places && !/\.\d+$/.test(text) ? `${text}.${'0'.repeat(places)}` : text;
}

/** "8.0" hours from minutes. */
export const hours = (minutes) => (Math.round((Number(minutes) || 0) / 6) / 10).toFixed(1);

/** "25 November 2026" from a day key ("2026-11-25"). */
export function longDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** "November 2026" from a day key. */
export function monthYear(day) {
  const m = /^(\d{4})-(\d{2})/.exec(String(day || ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** "4 Jan to 2 Jul 2027" (or with both years when they differ). */
export function shortRange(from, to) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(from || ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(to || ''));
  if (!a || !b) return '';
  const mon = (m) => MONTHS[Number(m) - 1].slice(0, 3);
  return a[1] === b[1]
    ? `${Number(a[3])} ${mon(a[2])} to ${Number(b[3])} ${mon(b[2])} ${b[1]}`
    : `${Number(a[3])} ${mon(a[2])} ${a[1]} to ${Number(b[3])} ${mon(b[2])} ${b[1]}`;
}

/** The From column: the business, the coach, the business's email. */
export function fromColumn(business, coachName = '', label = 'From') {
  const b = businessOf(business);
  return { label, name: b.name, lines: [one(coachName), b.email].filter(Boolean) };
}

/** The VAT line: "Not VAT registered" until the business is registered (then its VAT number). */
export function vatRow(business) {
  const b = businessOf(business);
  return b.vatRegistered && b.vatNumber ? ['VAT number', b.vatNumber] : ['VAT', 'Not VAT registered'];
}
