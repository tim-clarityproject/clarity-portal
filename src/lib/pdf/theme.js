// The two looks of every tool PDF (PDF rules 1, 9 and 16). Same layout, content
// and page breaks; only these colours change. PDFs cannot read
// the CSS variables in tokens.css, so their colours live here, in one place.

export const PDF_THEMES = {
  light: {
    page: '#FFFFFF',
    text: '#111110',
    detail: '#636362',
    line: '#DCDCD9',
    panel: '#F4F4F3',
    panelEdge: null,
    coral: '#FF6F5C', // the title line only
    good: '#0B7A52', // green: at or above the standard (Tim, 26 Oct), deep green on light pages
    onGood: '#FFFFFF', // a number on a green dot
    mark: '#000000', // the footer's bold crosshair: black on light pages (Tim, 26 Oct, 16:13)
  },
  dark: {
    page: '#000000',
    text: '#FFFFFF',
    detail: '#A3A3A0',
    line: '#262626',
    panel: '#111110',
    panelEdge: '#262626', // a thin edge so panels hold on a dim phone
    coral: '#FF6F5C', // the title line only
    good: '#5FEFBB', // mint on dark pages
    onGood: '#000000',
    mark: '#FFFFFF', // white on dark pages
  },
};

export const PDF_AUTHOR = 'Dr. Tim Dutton, The Clarity Project LTD';
export const PORTAL_ADDRESS = 'portal.theclarityproject.co.uk';
export const PORTAL_URL = `https://${PORTAL_ADDRESS}`;

// The business behind every document (the 25 Nov PDFs' footer, invoices' From and Payment details): from the coach's
// Settings, Business (068: finance_settings' company_name, company_number, website, invoice_email and the bank
// details), read by the server for the documents it makes. The company number and the bank details are never written
// here: a document without them leaves them out.
export const COMPANY_NAME = 'The Clarity Project LTD';
export const COMPANY_WEBSITE = 'theclarityproject.co.uk';

const tidy = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * The business's details as a document uses them, from a finance_settings row (or the same names in camelCase).
 * @returns {{ name: string, number: string, website: string, url: string, email: string, vatNumber: string,
 *   bank: { name: string, accountName: string, sortCode: string, accountNumber: string } | null }}
 */
export function businessOf(row) {
  const r = row && typeof row === 'object' ? row : {};
  const pick = (...keys) => keys.map((k) => tidy(r[k])).find(Boolean) || '';
  const website = pick('website').replace(/^https?:\/\//i, '').replace(/\/+$/, '') || COMPANY_WEBSITE;
  const bank = {
    name: pick('bank_name', 'bankName'),
    accountName: pick('bank_account_name', 'accountName') || pick('company_name', 'name') || COMPANY_NAME,
    sortCode: pick('bank_sort_code', 'sortCode'),
    accountNumber: pick('bank_account_number', 'accountNumber'),
  };
  return {
    name: pick('company_name', 'name') || COMPANY_NAME,
    number: pick('company_number', 'number'),
    website,
    url: `https://${website}`,
    email: pick('invoice_email', 'email'),
    vatNumber: pick('vat_number', 'vatNumber'),
    vatRegistered: r.vat_registered === true || r.vatRegistered === true,
    bank: bank.sortCode && bank.accountNumber ? bank : null,
  };
}
