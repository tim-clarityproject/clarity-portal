import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Chevron, Loading, PageHeader, useToast } from '../../../components/design';
import { Card, PageOpening, Row, Rows } from '../../../components/design/Blocks';
import { MONEY_LINES } from '../../../content/pageLines/coach';
import FactRow from '../money/FactRow';
import { ask } from '../../../lib/agreements/askClient';
import { sentRows } from '../../../lib/agreements/duringAgreement';
import { loadCoach, rowsOf, saveChange } from '../../../lib/coach/store';
import { Back, useCoachPortal } from '../parts';
import '../needsYou/needsyou.css';
import '../money/money.css';

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

  // Polish 1, Stage C (C2): the page opening (its one button, Mark as settled, while it isn't), then where it is as the
  // reference's card, with Send again and their supplier portal as rows that open.
  const who = org?.name || client?.name || inv.payer_name || '';
  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to={org ? org.name : 'Today'} onClick={() => (org ? navigate(`/coach/organisations/${org.id}/billing`) : navigate('/coach'))} />
        <PageOpening label={[inv.number != null ? `CLARITY-${inv.number}` : null, who].filter(Boolean).join(', ') || null} title={settled ? 'Invoice settled' : 'Invoice sent'} line={MONEY_LINES.invoiceSent}
          action={settled ? null : <Button variant="primary" onClick={markSettled}>Mark as settled</Button>} />
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card label="Where it is">
              <Rows label="Where it stands">
                {rows.map((r) => <FactRow key={r.label} name={r.label} value={r.value} keepYear={r.label === 'Attached'} />)}
              </Rows>
            </Card>
            <p className="cc-money-note cc-money-note--after">Their bank transfer is matched to this invoice by Stripe.</p>
          </div>
          <div>
            <Card label="What you can do">
              <Rows>
                {!settled && <Row name="Send it again" sub="With the same PDF" value={<Chevron direction="right" />} onClick={sendAgain} />}
                {profile?.supplier_portal && !inv.portal_uploaded_at && profile.portal_url && <Row name="Open their supplier portal" value={<Chevron direction="right" />} href={profile.portal_url} />}
                {profile?.supplier_portal && !inv.portal_uploaded_at && <Row name="Mark as uploaded to their portal" value={<Chevron direction="right" />} onClick={markUploaded} />}
                {settled && <Row name="Settled" value="Nothing more to do" />}
              </Rows>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
