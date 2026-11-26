import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, InlineChoice, Loading, SwitchRow, TextBox, TextField, useToast } from '../../../components/design';
import { Card, PageOpening, Row } from '../../../components/design/Blocks';
import { AGREEMENT_LINES } from '../../../content/pageLines/coach';
import { openPo, profileForm, profileRow } from '../../../lib/agreements/duringAgreement';
import { moneyText, toMinor } from '../../../lib/agreements/currency';
import { keyOf, newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { Back, useCoachPortal } from '../parts';
import { Problem } from '../needsYou/panels';
import '../agreements/agreementPage.css';

/** "300" as "£300"; anything that isn't a figure stays as typed. */
const rateShown = (typed) => { const n = parseFloat(String(typed ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? moneyText(toMinor(n, 'GBP'), 'GBP') : (typed ?? ''); };

// An organisation's billing (Phase 6b run 3, Group D; M28 s-org-billing: /coach/organisations/:id/billing; brief items
// 25, 28, 30 and 34), the owner's: set once per organisation, then every invoice follows it. Their legal name, billing
// address and where invoices go; on every invoice the supplier number they gave you, the purchase order (062's
// purchase_orders, the open one), their reference, the hourly rate and when they settle; then a timesheet page, evidence
// that must be attached, and their supplier portal. Each change saves as it is made (a box when it is left), with Undo.
// One row a coach and organisation (065's org_billing_profiles); its Stripe customer and bank details are the server's.
// M28's "Which organisation?" switches between its two examples; here the page is the organisation's own.

const TERMS = [{ value: 14, label: '14 days' }, { value: 30, label: '30 days' }, { value: 60, label: '60 days' }];

/**
 * The organisation's page's Billing card (mounted by Group A on OrganisationPage.jsx; Polish 1, Stage C, C4): where
 * invoices go, the open purchase order, the hourly rate and when they settle, as rows, with Edit opening this page.
 * The owner's only, as the page.
 */
export function OrgBillingLink({ organisationId, name }) {
  const navigate = useNavigate();
  const p = useCoachPortal() || {};
  if (!p.isOwner || !organisationId) return null;
  const row = rowsOf(p.state, 'org_billing_profiles').find((r) => r.organisation_id === organisationId && r.coach_id === p.coach?.id) || null;
  const org = (p.organisations || []).find((o) => o.id === organisationId) || null;
  const f = profileForm(row, org);
  const po = openPo(p.purchaseOrders || [], organisationId);
  const open = () => navigate(`/coach/organisations/${organisationId}/billing`);
  const rows = row ? [
    { name: 'Invoices go to', value: f.email || 'Their main contact' },
    { name: 'Purchase order', value: f.needsPo ? (po?.number || 'Needed, not in yet') : 'Not needed' },
    { name: 'Hourly rate', value: f.rate ? rateShown(f.rate) : '' },
    { name: 'They settle in', value: `${Number(f.terms) || 30} days` },
  ].filter((r) => r.value) : [];
  return (
    <Card className="ap-orgbill" label="Billing" link={{ children: 'Edit', onClick: open, 'aria-label': `Edit billing for ${name || 'this organisation'}` }}>
      {rows.length ? rows.map((r) => <Row key={r.name} name={r.name} value={r.value} />)
        : <Row name={AGREEMENT_LINES.billingEmpty} />}
    </Card>
  );
}

export default function OrgBilling() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const org = p.organisations.find((o) => o.id === id) || null;
  const row = rowsOf(p.state, 'org_billing_profiles').find((r) => r.organisation_id === id && r.coach_id === p.coach.id) || null;
  const po = openPo(p.purchaseOrders, id);
  const [form, setForm] = useState(() => profileForm(row, org));
  const [poNumber, setPoNumber] = useState(po?.number || '');
  const [problem, setProblem] = useState(null);
  // The rate shows as money (£300, as every money box: builderParts' MoneyField) until it is typed in (UI finding 7).
  const [rateFocus, setRateFocus] = useState(false);
  const seen = useRef(row?.updated_at ?? null);
  // Another tab's or device's save shows here, unless a box is being typed in.
  useEffect(() => {
    if ((row?.updated_at ?? null) === seen.current) return;
    seen.current = row?.updated_at ?? null;
    if (!document.activeElement?.closest?.('input, textarea')) setForm(profileForm(row, org));
  }, [row, org]);
  useEffect(() => { if (!document.activeElement?.closest?.('input')) setPoNumber(po?.number || ''); }, [po?.number]);
  const saving = useRef(false);

  const save = useMemo(() => async (next) => {
    const made = profileRow(next, { coachId: p.coach.id, organisationId: id, before: row });
    if (made.problem) { setProblem(made.problem); return; }
    setProblem(null);
    const before = row;
    const same = before && Object.keys(made.row).every((k) => k === 'updated_at' || k === 'created_at' || JSON.stringify(made.row[k] ?? null) === JSON.stringify(before[k] ?? null));
    if (same || saving.current) return;
    saving.current = true;
    try {
      const out = { ...made.row, id: before?.id || newId() };
      await saveRow(p.userId, 'org_billing_profiles', out);
      seen.current = null;
      toast.saved({ message: 'Saved', long: true, onUndo: () => (before ? saveRow(p.userId, 'org_billing_profiles', before) : removeRow(p.userId, 'org_billing_profiles', keyOf('org_billing_profiles', out))).catch(() => {}) });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); } finally { saving.current = false; }
  }, [p.coach.id, p.userId, id, row, toast]);

  if (!org) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the organisation" /></div></div>;
    return <div className="cc-page"><div className="cc-col ap-page"><Back onClick={() => navigate('/coach/clients')} /><PageOpening title="Billing" line="This organisation isn’t here any more." /></div></div>;
  }
  const set = (patch, now = false) => { const next = { ...form, ...patch }; setForm(next); if (now) save(next); };
  const leave = () => save(form);
  const savePo = async () => {
    const n = poNumber.trim();
    if (!n || n === po?.number) return;
    const newRow = { id: newId(), coach_id: p.coach.id, organisation_id: id, number: n.slice(0, 80), currency: 'GBP', status: 'open' };
    try {
      await saveRow(p.userId, 'purchase_orders', newRow);
      if (po) await saveRow(p.userId, 'purchase_orders', { ...po, status: 'closed' });
      toast.saved({ message: 'Saved', long: true, onUndo: async () => { await removeRow(p.userId, 'purchase_orders', newRow.id).catch(() => {}); if (po) await saveRow(p.userId, 'purchase_orders', po).catch(() => {}); } });
    } catch (e) { toast.error(e?.code === '23505' ? 'That purchase order is already here.' : 'That didn’t save. Check your connection and try again.'); }
  };
  const at = (k) => (problem?.at === k ? <Problem>{problem.words}</Problem> : null);

  return (
    <div className="cc-page">
      <div className="cc-col ap-page">
        <Back to={org.name} onClick={() => navigate(`/coach/organisations/${org.id}`)} />
        <PageOpening
          label="Billing"
          title={org.name}
          line={AGREEMENT_LINES.orgBilling}
          action={<Button variant="primary" onClick={() => navigate(`/coach/organisations/${org.id}/invoices/new`)}>New invoice</Button>}
        />
        <div className="ds-cols">
          <div>
            <Card label="Billing details">
              <div className="ap-fields">
                <TextField label="What’s their legal name?" value={form.legal} maxLength={200} autoComplete="off" onChange={(e) => set({ legal: e.target.value })} onBlur={leave} />
                <div onBlur={leave}><TextBox label="What’s their billing address?" value={form.address} maxLength={500} onChange={(v) => set({ address: v })} /></div>
                <div>
                  <TextField label="Where do invoices go?" type="email" value={form.email} maxLength={320} autoComplete="off" onChange={(e) => set({ email: e.target.value })} onBlur={leave} />
                  {at('email')}
                </div>
              </div>
            </Card>
            <Card label="On every invoice">
              <div className="ap-fields">
                <TextField label="What’s your supplier number with them?" value={form.supplier} placeholder="e.g. SUP-004417" maxLength={80} autoComplete="off" onChange={(e) => set({ supplier: e.target.value })} onBlur={leave} />
                <SwitchRow label="Needs a purchase order" note="Invoices can’t go until the PO is on them." checked={form.needsPo} onChange={(on) => set({ needsPo: on }, true)} />
                {form.needsPo && <TextField label="What’s the purchase order?" value={poNumber} maxLength={80} autoComplete="off" onChange={(e) => setPoNumber(e.target.value)} onBlur={savePo} />}
                <TextField label="Do they have a reference?" value={form.reference} placeholder="e.g. a cost centre or project" maxLength={160} autoComplete="off" onChange={(e) => set({ reference: e.target.value })} onBlur={leave} />
                <div>
                  <TextField label="What’s your hourly rate for them?" inputMode="decimal" value={rateFocus ? form.rate : rateShown(form.rate)} placeholder="e.g. £300" autoComplete="off" onFocus={() => setRateFocus(true)} onChange={(e) => set({ rate: e.target.value })} onBlur={() => { setRateFocus(false); leave(); }} />
                  {at('rate')}
                </div>
                <InlineChoice label="When do they settle?" options={TERMS} value={Number(form.terms)} onChange={(v) => set({ terms: v }, true)} semantics="radio" />
              </div>
            </Card>
          </div>
          <div>
            <Card label="With each invoice">
              <div className="ap-fields">
                <SwitchRow label="Add a timesheet page" note="Every invoice includes a page listing each coaching session or hour, built from what’s logged." checked={form.timesheet} onChange={(on) => set({ timesheet: on }, true)} />
                <SwitchRow label="Evidence must be attached" note="Every invoice needs a file attached, such as a screenshot of hours, added as pages in the same PDF." checked={form.evidence} onChange={(on) => set({ evidence: on }, true)} />
                <SwitchRow label="They want invoices on their supplier portal" note="After sending, a reminder in Needs you to upload it there too." checked={form.portal} onChange={(on) => set({ portal: on }, true)} />
                {form.portal && (
                  <div>
                    <TextField label="What’s their portal’s address?" value={form.portalUrl} placeholder="https://" maxLength={500} autoComplete="off" onChange={(e) => set({ portalUrl: e.target.value })} onBlur={leave} />
                    {at('portal')}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
