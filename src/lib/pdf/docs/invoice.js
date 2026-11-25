import { formatDocDate } from '../../dateFormatter.js';
import { dayKeyWords } from '../../time/index.js';
import { hoursFigure, moneyText, rateText } from '../../agreements/currency.js';

// An invoice as a document for the shared PDF template (Phase 6b run 3, brief items 26 to 30; M28 s-inv-pdf). Light only
// (PDF rule 1: invoices are printed and filed). Page 1: the title "Invoice", the details line (who it's for, the day it
// was issued, its CLARITY- number), who it's to and its details (due day, purchase order, supplier number, their
// reference), the lines with hours, rate and amount, the total due, and How to settle (bank transfer to the
// organisation's own Stripe account number, quoting the invoice number). Then, where the profile asks for one, the
// timesheet on its own page (date, what, hours, with the total). The attached evidence (screenshots, PDFs) follows as
// its own pages, appended to the same file by the server (api/_agreementPdf.js, pdf-lib). No VAT lines (not VAT
// registered yet) and no late-payment interest, ever (brief item 32).
//
// A draft (the preview before Send) has no number yet: numbers are taken only at Send (064), so a preview reads
// "Draft, numbered when it's sent".

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const dayWords = (day) => (day ? dayKeyWords(day, { year: true }) : '');

/**
 * @param {object} o
 * @param {number|null} o.number         the CLARITY- number, null for a draft
 * @param {string} o.issuedOn            day key
 * @param {string} o.dueOn               day key
 * @param {number} o.termsDays
 * @param {string} o.orgName             who it's for (an organisation or a person)
 * @param {string} [o.legalName]
 * @param {string} [o.address]           lines separated by new lines
 * @param {string|null} [o.poNumber]
 * @param {string|null} [o.supplierNumber]
 * @param {string|null} [o.theirReference]
 * @param {{ description: string, minutes?: number|null, rateMinor?: number|null, amount: number }[]} o.lines
 * @param {string} [o.currency]
 * @param {{ accountName: string, sortCode: string, accountNumber: string }|null} [o.bank]
 * @param {{ day: string, what: string, minutes: number }[]|null} [o.timesheet]
 * @param {number} [o.extraPages]        attached evidence pages after these (for the page count in the footer)
 */
export function invoicePdf({
  number = null, issuedOn, dueOn, termsDays = 30, orgName, legalName = '', address = '', poNumber = null, supplierNumber = null,
  theirReference = null, lines = [], currency = 'GBP', bank = null, timesheet = null, extraPages = 0,
}) {
  const ref = number ? `CLARITY-${number}` : null;
  const who = one(orgName);
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const anyHours = lines.some((l) => Number(l.minutes) > 0);
  const toText = [one(legalName) || who, ...String(address || '').split(/\n/).map(one)].filter(Boolean).join('\n');
  const details = [
    { type: 'field', label: 'To', text: toText },
    { type: 'field', label: 'Due', text: `${dayWords(dueOn)}, within ${termsDays} days` },
    poNumber ? { type: 'field', label: 'Purchase order', text: one(poNumber) } : null,
    supplierNumber ? { type: 'field', label: 'Supplier number', text: one(supplierNumber) } : null,
    theirReference ? { type: 'field', label: 'Your reference', text: one(theirReference) } : null,
    ref ? null : { type: 'text', tone: 'detail', text: 'Draft. It’s numbered when it’s sent.' },
  ].filter(Boolean);
  const columns = anyHours
    ? [{ label: 'Description', width: 5 }, { label: 'Hours', width: 1.2, align: 'right' }, { label: 'Rate', width: 1.6, align: 'right' }, { label: 'Amount', width: 1.6, align: 'right' }]
    : [{ label: 'Description', width: 6 }, { label: 'Amount', width: 2, align: 'right' }];
  const rows = lines.map((l) => (anyHours
    ? [one(l.description), Number(l.minutes) > 0 ? hoursFigure(l.minutes).replace(/ hours?$/, '') : '', Number(l.rateMinor) > 0 ? rateText(l.rateMinor, 'hour', currency) : '', moneyText(l.amount, currency)]
    : [one(l.description), moneyText(l.amount, currency)]));
  rows.push(anyHours ? ['Total due', '', '', moneyText(total, currency)] : ['Total due', moneyText(total, currency)]);
  const settle = bank && bank.accountNumber
    ? [
      { type: 'text', text: `By bank transfer within ${termsDays} days, to the account below, quoting ${ref || 'the invoice number'}. The account number is unique to ${who}, so your transfer matches this invoice automatically.` },
      { type: 'field', label: 'Account name', text: one(bank.accountName) || 'The Clarity Project LTD' },
      { type: 'field', label: 'Sort code', text: one(bank.sortCode) },
      { type: 'field', label: 'Account number', text: one(bank.accountNumber) },
      { type: 'field', label: 'Reference', text: ref || 'The invoice number' },
    ]
    : [{ type: 'text', text: `Within ${termsDays} days, quoting ${ref || 'the invoice number'}.` }];
  const sheet = (timesheet || []).filter((r) => Number(r.minutes) > 0);
  const sheetMinutes = sheet.reduce((a, r) => a + Number(r.minutes), 0);
  return {
    docName: ref ? `Invoice ${ref}` : 'Invoice draft',
    title: 'Invoice',
    who,
    confidential: false,
    details: [[who, formatDocDate(issuedOn), ref || 'Draft'].filter(Boolean).join(', ')],
    date: issuedOn,
    subject: ref ? `Invoice ${ref} for ${who}` : `Draft invoice for ${who}`,
    extraPages: Math.max(0, Number(extraPages) || 0),
    glance: [],
    sections: [
      { title: 'Details', blocks: details },
      { title: 'What it’s for', blocks: [{ type: 'table', title: 'What it’s for', columns, rows }] },
      { title: 'How to settle', blocks: settle },
      ...(sheet.length ? [{
        title: 'Timesheet',
        newPage: true,
        blocks: [{
          type: 'table',
          title: 'Timesheet',
          columns: [{ label: 'Date', width: 2 }, { label: 'What', width: 5 }, { label: 'Hours', width: 1.2, align: 'right' }],
          rows: [...sheet.map((r) => [dayWords(r.day), one(r.what) || 'Coaching session', hoursFigure(r.minutes).replace(/ hours?$/, '')]),
            ['Total', '', hoursFigure(sheetMinutes).replace(/ hours?$/, '')]],
        }],
      }] : []),
    ],
  };
}
