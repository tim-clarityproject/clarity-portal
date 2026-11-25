import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Loading, PageHeader, useToast } from '../../../components/design';
import { ask } from '../../../lib/agreements/askClient';
import { sentRows } from '../../../lib/agreements/duringAgreement';
import { loadCoach, rowsOf, saveChange } from '../../../lib/coach/store';
import { Back, TextLink, useCoachPortal } from '../parts';
import '../needsYou/needsyou.css';

// Invoice sent (Phase 6b run 3, Group D; M28 s-inv-sent: /coach/invoices/:id; brief items 28 and 30): an organisation's
// invoice once it has gone with its one PDF attached. Where it went, the file, their supplier portal (with a reminder
// in Needs you until it's marked as uploaded), when it's due by bank transfer and whether it's settled. Their transfer
// is matched by Stripe (their own account number), so Mark as settled is only for a payment that came another way.
// Mark as settled and Send again ask the server; nothing here sends by itself.

export default function InvoiceSent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const busy = useRef(false);
  const inv = (p.invoices || []).find((i) => i.id === id) || null;
  if (!inv) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the invoice" /></div></div>;
    return <div className="cc-page"><div className="cc-col"><Back to="Today" onClick={() => navigate('/coach')} /><PageHeader title="Invoice" /><p className="cc-quiet">This invoice isn’t here any more.</p></div></div>;
  }
  const org = p.organisations.find((o) => o.id === inv.organisation_id) || null;
  const client = p.clients.find((c) => c.id === inv.profile_id) || null;
  const profile = rowsOf(p.state, 'org_billing_profiles').find((r) => r.organisation_id === inv.organisation_id && r.coach_id === p.coach.id) || null;
  const rows = sentRows({ invoice: inv, profile, orgName: org?.name || '', today: p.todayKey });
  const settled = inv.status === 'paid';
  const once = async (fn) => { if (busy.current) return; busy.current = true; try { await fn(); } finally { busy.current = false; } };

  const markSettled = () => once(async () => {
    const { coachBilling } = await import('../../../lib/coach/financeActions');
    const answer = await coachBilling(p.userId, { kind: 'paid_by_hand', invoiceId: inv.id });
    if (!answer.ok) { toast.error(answer.message); return; }
    toast.saved({ message: 'Marked as settled.' });
  });
  const sendAgain = () => once(async () => {
    const answer = await ask('billing', 'org_invoice_send', { invoiceId: inv.id, again: true, organisationId: inv.organisation_id });
    if (!answer.ok) { toast.error(answer.message); return; }
    toast.saved({ message: 'Sent again, with the same PDF.' });
    loadCoach(p.userId, { again: true }).catch(() => {});
  });
  const markUploaded = () => once(async () => {
    const answer = await ask('billing', 'mark_uploaded', { invoiceId: inv.id });
    if (!answer.ok) { toast.error(answer.message); return; }
    // Its Needs you line goes now, so the device doesn't wait for the server's copy.
    const key = { coach_id: p.coach.id, item_key: `portal:${inv.id}` };
    await saveChange(p.userId, 'needs_you_done', key, { state: 'done', until: null, at: new Date().toISOString() }).catch(() => {});
    toast.saved({ message: 'Marked as uploaded to their portal' });
    loadCoach(p.userId, { again: true }).catch(() => {});
  });

  return (
    <div className="cc-page">
      <div className="cc-col ny-page">
        <Back to="Today" onClick={() => navigate('/coach')} />
        <PageHeader title={inv.number != null ? `CLARITY-${inv.number}` : 'Invoice'} meta={[org?.name || client?.name || inv.payer_name]} />
        <ul className="ny-list" aria-label="Where it stands">
          {rows.map((r) => (
            <li key={r.label} className="ny-li">
              <span className="ny-li-t">{r.label}</span>
              <span className={`ny-li-d${r.done ? ' ny-li-d--done' : ''}`}>{r.value}</span>
            </li>
          ))}
        </ul>
        {!settled && (
          <div className="cc-acts">
            <Button variant="primary" onClick={markSettled}>Mark as settled</Button>
            <Button variant="outline" onClick={sendAgain}>Send again</Button>
          </div>
        )}
        {profile?.supplier_portal && !inv.portal_uploaded_at && (
          <div className="cc-acts">
            {profile.portal_url && <a className="ds-link" href={profile.portal_url} target="_blank" rel="noreferrer">Open their supplier portal</a>}
            <TextLink onClick={markUploaded}>Mark as uploaded to their portal</TextLink>
          </div>
        )}
        <p className="ny-hint">Their bank transfer is matched to this invoice by Stripe.</p>
      </div>
    </div>
  );
}
