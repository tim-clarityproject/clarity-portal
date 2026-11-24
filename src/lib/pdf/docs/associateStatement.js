import { formatDocDate } from '../../dateFormatter';

// An associate's monthly statement as a document for the shared PDF template (Phase 6b run 2, step 5; M11 C13's
// "Download my November statement"). Light only, like the other money paperwork that is filed (PDF rule 1). It holds
// the associate's own hours, rate and pay, and the lines M11's statement panel shows, never a business figure. The
// facts come from statementFacts in src/lib/coach/associatePay.js.

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const STATEMENT_DOC = 'Monthly statement';

/**
 * @param {Object} f statementFacts(): { name, monthWords, readyOn: Date, paidOn: Date|null, hours, pay, rate, lines }
 */
export function associateStatementPdf(f) {
  const who = oneLine(f.name) || null;
  const title = `Statement for ${f.monthWords}`;
  const glance = [
    { label: 'Coaching hours', value: f.hours },
    { label: 'Pay', value: f.pay },
    f.rate ? { label: 'Rate', value: f.rate } : null,
  ].filter((g) => g && g.value);
  const rows = (f.lines || []).filter((l) => l && l.label).map((l) => [oneLine(l.label), oneLine(l.detail), oneLine(l.value)]);
  return {
    docName: STATEMENT_DOC,
    title,
    who,
    confidential: true,
    details: [who, f.monthWords, STATEMENT_DOC],
    date: f.readyOn,
    subject: `${STATEMENT_DOC}, ${f.monthWords}`,
    glance,
    sections: [
      {
        title: 'What it’s made of',
        blocks: rows.length ? [{
          type: 'table',
          columns: [{ label: 'Line', width: 3 }, { label: 'Detail', width: 3 }, { label: 'Amount', width: 2, align: 'right' }],
          rows,
        }] : [],
      },
      {
        title: 'Paying it',
        blocks: [
          { type: 'text', text: `The statement is ready on ${formatDocDate(f.readyOn)}.` },
          f.paidOn
            ? { type: 'text', text: `The Clarity Project LTD paid it on ${formatDocDate(f.paidOn)}.` }
            : { type: 'text', text: 'The Clarity Project LTD pays it outside the portal.', tone: 'detail' },
        ],
      },
    ],
  };
}
