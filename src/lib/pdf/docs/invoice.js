import { businessOf } from '../theme.js';
import { fromColumn, hours, longDay, money, monthYear, one, vatRow } from './money.js';

// An invoice as a document for the shared PDF template, to the approved 25 Nov PDFs (Polish 1; pdfs-25nov: "Invoice
// CLARITY-0151, Sam Carter" to a person and "Invoice CLARITY-1251, Cymru Active" to an organisation, with its
// timesheet page). Light only (PDF rule 1: invoices are printed and filed).
//
// Page 1: the lockup bar with INVOICE; the title with one line saying what it's for; the key facts on the right
// (number, invoice date, due date, payment terms, the PO and supplier numbers where they apply); From and Bill to; the
// amount due in a light panel; the line items (Description, Qty and Unit price, or Hours and Rate for an
// organisation's hours, and Amount); Subtotal, VAT ("Not VAT registered" until registered) and Total due under a rule;
// the payment details in a box (account name, bank, sort code, account number, payment reference); and the
// remittance line. Then, where the profile asks for one, the timesheet on its own page. The attached evidence
// (screenshots, PDFs) follows as its own pages, appended to the same file by the server (api/_agreementPdf.js,
// pdf-lib). Conventional finance words throughout (Bill to, Payment terms, Payment details); the portal keeps
// "settle". No late-payment interest, ever (run 3's brief item 32).
//
// The business's details (name, company number, website, email, bank) come from the coach's Settings, Business
// (068), never from here. The bank shown is the organisation's own Stripe transfer account when it has one (its
// transfers then match the invoice by themselves), else the business's.
//
// A draft (the preview before Send) has no number yet: numbers are taken only at Send (064).

/**
 * @param {object} o
 * @param {number|null} o.number         the CLARITY- number, null for a draft
 * @param {string} o.issuedOn            day key
 * @param {string} o.dueOn               day key
 * @param {number} o.termsDays
 * @param {string} o.orgName             who it's for (an organisation or a person)
 * @param {string} [o.legalName]
 * @param {string} [o.contact]           "Accounts Payable"
 * @param {string} [o.address]           lines separated by new lines
 * @param {string} [o.email]             where it's sent
 * @param {string|null} [o.poNumber]
 * @param {string|null} [o.supplierNumber]
 * @param {string|null} [o.theirReference]
 * @param {string} [o.about]             the line under the title ("Coaching services, December 2026")
 * @param {{ description: string, detail?: string, quantity?: number, minutes?: number|null, rateMinor?: number|null, amount: number }[]} o.lines
 * @param {string} [o.currency]
 * @param {{ accountName: string, sortCode: string, accountNumber: string, bankName?: string }|null} [o.bank]  the organisation's own
 * @param {{ day: string, what: string, who?: string, minutes: number }[]|null} [o.timesheet]
 * @param {number} [o.extraPages]        attached evidence pages after these (for the page count in the footer)
 * @param {object} [o.business]          the business's details (finance_settings, 068)
 * @param {string} [o.coachName]         who it's from, under the business's name
 * @param {boolean} [o.inPortal]         the client can settle it in their portal (card and Apple Pay)
 * @param {string} [o.termsWords]        the payment terms in words, where they aren't a number of days ("Due on receipt")
 */
export function invoicePdf({
  number = null, issuedOn, dueOn, termsDays = 30, orgName, legalName = '', contact = '', address = '', email = '', poNumber = null,
  supplierNumber = null, theirReference = null, about = '', lines = [], currency = 'GBP', bank = null, timesheet = null, extraPages = 0,
  business = null, coachName = '', inPortal = false, termsWords = '',
}) {
  const biz = businessOf(business);
  // Four figures at least, as the approved 25 Nov PDF prints it (CLARITY-0151; the stored number is unchanged).
  const ref = number ? `CLARITY-${String(number).padStart(4, '0')}` : null;
  const who = one(orgName);
  const po = one(poNumber);
  const items = (lines || []).filter((l) => one(l.description) || Number(l.amount));
  const total = items.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const anyHours = items.some((l) => Number(l.minutes) > 0);
  const sameDay = dueOn && issuedOn && dueOn === issuedOn;
  const terms = one(termsWords) || (sameDay ? 'Due on receipt' : `${termsDays} days`);
  const addressLine = String(address || '').split(/\n/).map(one).filter(Boolean).join(', ');

  const columns = anyHours
    ? [{ label: 'Description', width: 1 }, { label: 'Hours', mm: 16, align: 'right' }, { label: 'Rate', mm: 22, align: 'right' }, { label: 'Amount', mm: 26, align: 'right' }]
    : [{ label: 'Description', width: 1 }, { label: 'Qty', mm: 14, align: 'right' }, { label: 'Unit price', mm: 26, align: 'right' }, { label: 'Amount', mm: 26, align: 'right' }];
  const rows = items.map((l) => {
    const desc = { text: one(l.description), detail: one(l.detail) };
    if (anyHours) {
      return [desc, Number(l.minutes) > 0 ? hours(l.minutes) : '', Number(l.rateMinor) > 0 ? money(l.rateMinor, currency) : '', money(l.amount, currency)];
    }
    const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
    return [desc, String(qty), money(Math.round((Number(l.amount) || 0) / qty), currency), money(l.amount, currency)];
  });

  // The bank: the organisation's own transfer account, else the business's (Settings, Business).
  const own = bank && bank.accountNumber ? bank : null;
  const account = own || biz.bank;
  const payRef = [ref || 'The invoice number', po].filter(Boolean).join(' / ');
  const payRows = [
    account ? ['Account name', one(account.accountName) || biz.name] : null,
    account && one(account.bankName || account.name) ? ['Bank', one(account.bankName || account.name)] : null,
    account ? ['Sort code', one(account.sortCode)] : null,
    account ? ['Account number', one(account.accountNumber)] : null,
    ['Payment reference', payRef],
  ].filter(Boolean);

  const questions = biz.email ? biz.email : '';
  const notes = po
    ? [`Please quote the invoice number and PO number with your payment.${questions ? ` Remittance advice to ${questions}.` : ''}`]
    : [
      inPortal ? 'Card and Apple Pay are also accepted through your portal: open the invoice, then Settle my invoice.' : null,
      own ? `This account number is unique to ${who}, so your payment matches this invoice by itself.` : null,
      questions ? `Questions about this invoice: ${questions}` : null,
    ].filter(Boolean);

  const sheet = (timesheet || []).filter((r) => Number(r.minutes) > 0);
  const sheetMinutes = sheet.reduce((a, r) => a + Number(r.minutes), 0);
  const withWho = sheet.some((r) => one(r.who));
  const sheetDays = sheet.map((r) => r.day).filter(Boolean).sort();
  const sheetMonth = sheetDays.length && monthYear(sheetDays[0]) === monthYear(sheetDays[sheetDays.length - 1]) ? monthYear(sheetDays[0]) : '';
  const dayShort = (day) => { const d = longDay(day).split(' '); return d.length === 3 ? `${d[0]} ${d[1].slice(0, 3)} ${d[2]}` : ''; };

  return {
    kind: 'Invoice',
    docName: ref ? `Invoice ${ref}` : 'Invoice draft',
    running: [ref ? `Invoice ${ref}` : 'Invoice draft', po].filter(Boolean).join(' · '),
    title: 'Invoice',
    who,
    confidential: false,
    business,
    details: [one(about) || (issuedOn ? `Coaching services, ${monthYear(issuedOn)}` : 'Coaching services')],
    facts: [
      ['Invoice number', ref || 'Draft, numbered when it’s sent'],
      ['Invoice date', longDay(issuedOn)],
      ['Due date', longDay(dueOn)],
      ['Payment terms', terms],
      ['PO number', po],
      ['Supplier no.', one(supplierNumber)],
    ],
    date: issuedOn,
    subject: ref ? `Invoice ${ref} for ${who}` : `Draft invoice for ${who}`,
    extraPages: Math.max(0, Number(extraPages) || 0),
    glance: [],
    sections: [
      { title: 'From and bill to', look: 'none', blocks: [{ type: 'parties', columns: [
        fromColumn(business, coachName),
        { label: 'Bill to', name: one(legalName) || who, lines: [one(contact), addressLine, one(email), one(theirReference) ? `Your reference: ${one(theirReference)}` : ''] },
      ] }] },
      { title: 'Amount due', look: 'none', gapMm: 8, blocks: [{ type: 'due', label: 'Amount due', value: money(total, currency),
        note: [dueOn ? `Due ${longDay(dueOn)}` : '', po ? `Quote ${po}` : ''].filter(Boolean).join(' · ') }] },
      { title: 'Line items', look: 'none', gapMm: 7, blocks: [
        { type: 'table', title: 'Line items', ruled: true, columns, rows },
        { type: 'totals', rows: [['Subtotal', money(total, currency)], vatRow(business)], grand: [`Total due (${currency})`, money(total, currency)] },
      ] },
      { title: 'Payment details', look: 'none', gapMm: 7.4, blocks: [
        { type: 'pairs', label: 'Payment details', rows: payRows },
        ...notes.map((text, i) => ({ type: 'text', tone: 'note', text, gapMm: i === 0 ? 6 : 1.5 })),
      ] },
      ...(sheet.length ? [{
        title: 'Timesheet',
        newPage: true,
        blocks: [
          sheetMonth ? { type: 'text', tone: 'lead', text: `Services delivered in ${sheetMonth}` } : null,
          {
            type: 'table',
            title: 'Timesheet',
            ruled: true,
            gapMm: sheetMonth ? 7 : 0,
            columns: withWho
              ? [{ label: 'Date', mm: 32 }, { label: 'Participant', mm: 41.5 }, { label: 'Service', width: 1 }, { label: 'Hours', mm: 18, align: 'right' }]
              : [{ label: 'Date', mm: 32 }, { label: 'Service', width: 1 }, { label: 'Hours', mm: 18, align: 'right' }],
            rows: sheet.map((r) => (withWho
              ? [dayShort(r.day), one(r.who), one(r.what) || 'Coaching session', hours(r.minutes)]
              : [dayShort(r.day), one(r.what) || 'Coaching session', hours(r.minutes)])),
          },
          // 2.5mm under the last row, not the totals' usual 4mm: the approved timesheet's rule (the UI tester's P19).
          { type: 'totals', gapMm: 2.5, grand: ['Total hours', hours(sheetMinutes)] },
        ].filter(Boolean),
      }] : []),
    ],
  };
}
