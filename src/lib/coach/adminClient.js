// The owner's admin view of an associate's client (follow-up 5, item 10): only admin facts, as coach rule 9 sets out
// (049's coach_admin_clients: name, coach, organisation, status, the engagement and its sessions), each agreement's
// business facts (064's coach_admin_agreements) and the client's invoices, which the owner reads already. Never notes,
// About them, files, tags, fields or anything of the coaching.
import { moneyWords } from '../billing/money.js';
import { dayKeyWords } from '../time/index.js';
import { invoiceNo, invoiceTitle } from './financeData.js';
import { ENGAGEMENT_KINDS } from './model.js';
import { countWords } from './numbers.js';

const AGREEMENT_STATUS = { draft: 'Draft', sent: 'Sent, waiting to be signed', signed: 'Signed', ended: 'Ended', ended_not_renewed: 'Ended, not renewed' };
const dayOf = (at) => (at ? String(at).slice(0, 10) : null);

/** The engagement's lines: its kind, sessions held of how many, time credit, and when it ends. */
export function adminEngagementLines(row) {
  if (!row?.engagement_kind) return [];
  // Its kind is the first row's own title (the section is already called Engagement).
  const out = [{ title: ENGAGEMENT_KINDS.find((k) => k.value === row.engagement_kind)?.label || 'Coaching', value: '' }];
  if (Number(row.sessions_total) > 0) out.push({ title: 'Sessions', value: `${countWords(Number(row.sessions_held) || 0, 'session', 'sessions')} held of ${Number(row.sessions_total)}` });
  if (Number(row.time_credit_minutes) > 0) out.push({ title: 'Time credit', value: countWords(Math.round(Number(row.time_credit_minutes) / 60), 'hour', 'hours') });
  if (row.ends_on) out.push({ title: 'Ends', value: dayKeyWords(row.ends_on) });
  return out;
}

/** Each agreement: its reference, what it is, where it stands and its total. */
export function adminAgreementLines(agreements = []) {
  return (agreements || []).map((a) => {
    const signed = dayOf(a.client_signed_at);
    const status = a.status === 'signed' && signed ? `Signed ${dayKeyWords(signed)}` : AGREEMENT_STATUS[a.status] || 'Draft';
    return {
      key: a.agreement_id,
      title: a.coaching ? String(a.coaching) : 'Coaching agreement',
      facts: [a.reference, status, a.funded_by ? `Funded by ${a.funded_by}` : null].filter(Boolean),
      value: Number.isFinite(Number(a.total_minor)) && a.total_minor != null ? moneyWords(Number(a.total_minor), a.currency === 'USD' ? 'USD' : 'GBP') : '',
    };
  });
}

/** The client's invoices (their own, or on one of their agreements), newest first, with where each stands. */
export function adminInvoiceLines({ invoices = [], profileId, agreementIds = [], todayKey }) {
  const theirs = new Set(agreementIds);
  return (invoices || [])
    .filter((i) => i && i.status !== 'void' && (i.profile_id === profileId || (i.agreement_id && theirs.has(i.agreement_id))))
    .sort((a, b) => String(b.issued_on || b.created_at || '').localeCompare(String(a.issued_on || a.created_at || '')))
    .map((i) => {
      const left = Math.max(0, Number(i.total_minor) - Number(i.paid_minor || 0));
      const state = i.status === 'paid' ? `Paid${dayOf(i.paid_at) ? ` ${dayKeyWords(dayOf(i.paid_at))}` : ''}`
        : i.status === 'draft' ? 'Waiting to send'
          : i.due_on && i.due_on < todayKey && left > 0 ? `Overdue since ${dayKeyWords(i.due_on)}`
            : i.due_on ? `Due ${dayKeyWords(i.due_on)}` : 'Sent';
      return { key: i.id, title: invoiceNo(i) || invoiceTitle(i), facts: [invoiceNo(i) ? invoiceTitle(i) : null, state].filter(Boolean), value: moneyWords(Number(i.total_minor), i.currency || 'GBP') };
    });
}
