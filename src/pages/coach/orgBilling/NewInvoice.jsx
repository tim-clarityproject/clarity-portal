import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Checkbox, Loading, PageHeader, TextField, useToast } from '../../../components/design';
import { AddLink, Card, Empty, PageOpening, Row, Rows } from '../../../components/design/Blocks';
import { MONEY_LINES } from '../../../content/pageLines/coach';
import { ask } from '../../../lib/agreements/askClient';
import { moneyText } from '../../../lib/agreements/currency';
import { descriptionLine, dueOn, evidenceHint, pageCount, pageWords, problems, rate as rateFor } from '../../../lib/agreements/orgInvoice';
import { scheduledProfiles, billTo, invoicePeriod, olderWords, openPo, orgInvoiceRows, penceFrom, rowDay, rowHours } from '../../../lib/agreements/duringAgreement';
import { uploadReceipt } from '../../../lib/coach/financeActions';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { loadCoach, newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { deviceZone } from '../../../lib/time/index.js';
import { Back, TextLink, useCoachPortal } from '../parts';
import { Problem } from '../needsYou/panels';
import InvoicePreview from './InvoicePreview';
import '../needsYou/needsyou.css';
import '../money/money.css';

// New invoice for an organisation (Phase 6b run 3, Group D; M28 s-inv-new: /coach/organisations/:id/invoices/new;
// brief items 26 to 28 and 34), the owner's: addressed from its billing profile, quoting the PO, the supplier number and
// their reference, from the coaching sessions and hours logged since the last invoice (untick to leave one off), at the
// hourly rate from their profile (or a sponsor agreement's), which can be changed for this invoice alone. A timesheet
// page where they want one, and any screenshot or PDF they need as evidence, all in one PDF (Group E's). It won't send
// while a PO or evidence is missing, each with a calm message (orgInvoice.problems). Its number is taken as it goes
// (064's one CLARITY- run), so the page doesn't promise one beforehand (M28 shows CLARITY-1251).

const EVIDENCE_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

export default function NewInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const zone = coachZoneOf(p.settings, deviceZone());
  const org = p.organisations.find((o) => o.id === id) || null;
  const profile = rowsOf(p.state, 'org_billing_profiles').find((r) => r.organisation_id === id && r.coach_id === p.coach.id) || null;
  const po = openPo(p.purchaseOrders, id);
  const all = useMemo(() => orgInvoiceRows({
    organisationId: id, clients: p.clients, sessions: p.sessions, entries: rowsOf(p.state, 'time_entries'), engagements: rowsOf(p.state, 'engagements'),
    sources: rowsOf(p.state, 'invoice_sources'), zone, now: p.now, covered: scheduledProfiles(p.agreements, rowsOf(p.state, 'agreement_versions'), p.clients),
  }), [id, p.clients, p.sessions, p.state, p.agreements, zone, p.now]);
  const evidence = rowsOf(p.state, 'invoice_evidence').filter((e) => e.organisation_id === id && !e.invoice_id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const sponsor = p.agreements.map((a) => (a.organisation_id === id ? rowsOf(p.state, 'agreement_versions').find((v) => v.agreement_id === a.id && v.status === 'signed') : null)).find(Boolean);
  const [ticked, setTicked] = useState({});
  const [showOlder, setShowOlder] = useState(false);
  const period = useMemo(() => invoicePeriod(all), [all]);
  const olderKeys = useMemo(() => new Set(period.older.map((r) => r.key)), [period]);
  // The invoice's month starts ticked; older rows start unticked (invoicePeriod).
  const isTicked = (key) => (key in ticked ? ticked[key] : !olderKeys.has(key));
  const [poNumber, setPoNumber] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [reference, setReference] = useState(null);
  const [typedRate, setTypedRate] = useState(null);
  const [problem, setProblem] = useState(null);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const busy = useRef(false);

  if (!org) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the invoice" /></div></div>;
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients')} /><PageHeader title="New invoice" /><p className="cc-quiet">This organisation isn’t here any more.</p></div></div>;
  }
  const c = profile?.currency || 'GBP';
  const pon = poNumber ?? po?.number ?? '';
  const sup = supplier ?? profile?.supplier_number ?? '';
  const ref = reference ?? profile?.their_reference ?? '';
  const typedPence = typedRate == null ? null : penceFrom(typedRate);
  const rateMinor = rateFor(profile, sponsor?.terms, Number.isNaN(typedPence) ? null : typedPence);
  const rows = all.filter((r) => isTicked(r.key));
  const pages = pageCount({ timesheet: Boolean(profile?.timesheet), attachments: evidence.length });
  const body = {
    organisationId: id, sessionIds: rows.filter((r) => r.kind === 'session').map((r) => r.id), entryIds: rows.filter((r) => r.kind === 'entry').map((r) => r.id),
    poNumber: pon.trim() || null, rateMinor, evidenceIds: evidence.map((e) => e.id), supplierNumber: sup.trim() || null, reference: ref.trim() || null,
  };
  const send = async () => {
    const list = problems({ orgName: org.name, profile: profile || {}, rows, poNumber: pon, evidence });
    if (!profile) list.unshift('Add their billing details first, so the invoice knows where to go.');
    else if (!profile.invoices_email) list.unshift('Add where their invoices go first, in their billing details.');
    if (!(rateMinor > 0)) list.push('Add your hourly rate for them first.');
    if (list.length) { setProblem(list[0]); setPreview(false); return; }
    if (busy.current) return;
    busy.current = true;
    try {
      const answer = await ask('billing', 'org_invoice_send', body);
      if (!answer.ok) { setProblem(answer.message); setPreview(false); return; }
      toast.saved({ message: `Sent to ${answer.sentTo || profile.invoices_email} with ${answer.fileName || 'the PDF'} attached.` });
      loadCoach(p.userId, { again: true }).catch(() => {});
      setPreview(false);
      if (answer.invoiceId) navigate(`/coach/invoices/${answer.invoiceId}`);
    } finally { busy.current = false; }
  };
  const addFile = async (file) => {
    if (!file) return;
    if (!EVIDENCE_TYPES.includes(file.type)) { toast.error('Add a PNG or JPEG screenshot, or a PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB. Add a smaller one.'); return; }
    try {
      const path = await uploadReceipt(p.userId, file, 'evidence');
      const row = { id: newId(), coach_id: p.coach.id, organisation_id: id, invoice_id: null, storage_path: path, file_name: String(file.name || 'evidence').slice(0, 160), mime: file.type, bytes: file.size, position: evidence.length };
      await saveRow(p.userId, 'invoice_evidence', row);
      setProblem(null);
      toast.saved({ message: `Added ${row.file_name}.`, long: true, onUndo: () => removeRow(p.userId, 'invoice_evidence', row.id).catch(() => {}) });
    } catch (e) { toast.error(e?.message || 'That file didn’t upload. Check your connection and try again.'); }
  };
  const removeFile = async (e) => {
    try {
      await removeRow(p.userId, 'invoice_evidence', e.id);
      toast.saved({ message: `Removed ${e.file_name}.`, long: true, onUndo: () => saveRow(p.userId, 'invoice_evidence', e).catch(() => {}) });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };
  const pageOf = (i) => 2 + (profile?.timesheet ? 1 : 0) + i;
  // What the preview makes on this device off the live site (InvoicePreview's localInvoice), as the server would.
  const localInput = () => {
    const sorted = [...rows].sort((x, y) => x.day.localeCompare(y.day));
    const contact = rowsOf(p.state, 'organisation_contacts').find((x) => x.organisation_id === id && /finance|invoice|accounts/i.test(`${x.role || ''} ${x.roles || ''}`));
    return {
      number: null, issuedOn: p.todayKey, dueOn: dueOn(p.todayKey, profile?.terms_days || 30), termsDays: profile?.terms_days || 30, orgName: org.name,
      legalName: profile?.legal_name || '', contact: contact?.name || '', email: profile?.invoices_email || '', address: profile?.billing_address || '',
      poNumber: pon.trim() || null, supplierNumber: sup.trim() || null, theirReference: ref.trim() || null, coachName: p.coach.full_name || p.coach.display_first_name || '',
      lines: sorted.length ? [{ description: descriptionLine({ orgName: org.name, count: sorted.length, firstDay: sorted[0].day, lastDay: sorted.at(-1).day, timesheet: Boolean(profile?.timesheet) }), minutes: sorted.reduce((a, r) => a + r.minutes, 0), rateMinor, amount: Math.round(sorted.reduce((a, r) => a + r.minutes, 0) * rateMinor / 60) }] : [],
      currency: c, timesheet: profile?.timesheet ? sorted.map((r) => ({ day: r.day, what: r.what, who: r.who || (r.kind === 'session' ? String(r.what).replace(/^Coaching session with /, '') : ''), minutes: r.minutes })) : null,
    };
  };
  const line = (r) => (
    <div key={r.key} className="ny-qrow cc-money-tick">
      <Checkbox checked={isTicked(r.key)} onChange={(on) => { setTicked((was) => ({ ...was, [r.key]: on })); setProblem(null); }}>{`${rowDay(r.day, p.todayKey)}, ${r.what}`}</Checkbox>
      <span className="ny-qrow-h">{rowHours(r.minutes)}</span>
    </div>
  );
  // Nothing to invoice: refused at Preview (F7), with no PDF made and no Send offered.
  const openPreview = () => {
    if (!rows.length) {
      setProblem(all.length ? 'Nothing is ticked, so there’s nothing to invoice yet. Tick the coaching sessions to invoice, then preview it.'
        : 'There’s nothing to invoice yet: no coaching sessions or time logged with them since their last invoice.');
      return;
    }
    setProblem(null);
    setPreview(true);
  };
  const minutes = rows.reduce((a, r) => a + r.minutes, 0);
  const totalMinor = Math.round(minutes * rateMinor / 60);
  // A value that may run long (their reference, the address, the email) sits under its name, so the name never squashes.
  const long = (v) => String(v || '').length > 20;
  const editRow = (key, label, value, field) => (editing === key ? field : (
    <Row key={key} name={label} value={long(value) ? undefined : value || 'None'} sub={long(value) ? value : undefined} onClick={() => setEditing(key)} label={`${label}, ${value || 'none'}. Edit`} />
  ));

  // Polish 1, Stage C (C2; M28 v6 "invoice"): the page opening with its one button (Preview and send), then the coaching
  // sessions to tick with their total and the attached pages on the left, what goes on the invoice on the right.
  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to={org.name} onClick={() => navigate(`/coach/organisations/${org.id}/billing`)} />
        <PageOpening label={`For ${org.name}`} title="New invoice" line={MONEY_LINES.newInvoice}
          action={<Button variant="primary" onClick={openPreview}>Preview and send</Button>} />
        <Problem>{problem}</Problem>
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card label="Coaching sessions" className="cc-money-ticks">
              {all.length === 0 ? <Empty action={{ children: 'Open your calendar', onClick: () => navigate('/coach/calendar') }}>Nothing is logged since the last invoice.</Empty> : (
                <div role="group" aria-label="Coaching sessions">
                  {period.recent.map(line)}
                  {period.older.length > 0 && (
                    <>
                      <div className="cc-acts cc-money-older"><TextLink aria-expanded={showOlder} aria-controls="ny-older" onClick={() => setShowOlder((v) => !v)}>{showOlder ? 'Hide older' : olderWords(period.older.length)}</TextLink></div>
                      <div id="ny-older" hidden={!showOlder}>{showOlder && period.older.map(line)}</div>
                    </>
                  )}
                  <Row name="Total" value={rows.length ? `${rowHours(minutes)}, ${moneyText(totalMinor, c)}` : 'Nothing ticked'} className="cc-money-total" />
                </div>
              )}
            </Card>
            <Card label="Attached pages" add={<AddLink label="Add screenshot or PDF" onClick={() => fileRef.current?.click()} />}>
              {evidence.length === 0 ? (
                <p className="cc-money-quiet">{profile?.evidence_required ? evidenceHint(org.name) : `Nothing attached. ${org.name} doesn’t need evidence.`}</p>
              ) : (
                <Rows label="Attached pages">
                  {evidence.map((e, i) => (
                    <Row key={e.id} name={e.file_name} sub={`Added as page ${pageOf(i)}`} value={<TextLink onClick={() => removeFile(e)} aria-label={`Remove ${e.file_name}`}>Remove</TextLink>} />
                  ))}
                </Rows>
              )}
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" hidden onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ''; }} />
            </Card>
          </div>
          <div>
            <Card label="On the invoice" className="cc-money-oninv">
              <div className="cc-money-field">
                <TextField label="What’s the purchase order?" value={pon} maxLength={80} autoComplete="off" onChange={(e) => { setPoNumber(e.target.value); setProblem(null); }} />
              </div>
              <Rows>
                {editRow('supplier', 'Supplier number', sup, (
                  <div key="supplier" className="cc-money-field cc-money-field--row"><TextField label="What’s your supplier number?" value={sup} maxLength={80} autoComplete="off" autoFocus onChange={(e) => setSupplier(e.target.value)} onBlur={() => setEditing(null)} /></div>
                ))}
                {editRow('reference', 'Their reference', ref, (
                  <div key="reference" className="cc-money-field cc-money-field--row"><TextField label="Do they have a reference?" value={ref} maxLength={160} autoComplete="off" autoFocus onChange={(e) => setReference(e.target.value)} onBlur={() => setEditing(null)} /></div>
                ))}
                {editRow('rate', 'Hourly rate', rateMinor ? `${moneyText(rateMinor, c)}/hour` : '', (
                  <div key="rate" className="cc-money-field cc-money-field--row"><TextField label="What’s your hourly rate for this invoice?" inputMode="decimal" value={typedRate ?? (rateMinor ? moneyText(rateMinor, c) : '')} placeholder="e.g. £300" autoComplete="off" autoFocus onChange={(e) => setTypedRate(e.target.value)} onBlur={() => setEditing(null)} /></div>
                ))}
                <Row name="Payment terms" value={`${profile?.terms_days || 30} days`} />
                <Row name="Timesheet page" value={profile?.timesheet ? 'Included' : 'Not included'} />
                <Row name="Addressed to" sub={profile ? billTo(profile, org.name).join(', ') : 'No billing details yet'} onClick={() => navigate(`/coach/organisations/${org.id}/billing`)} label={profile ? 'Edit their billing details' : 'Add their billing details'} />
                <Row name="Sent to" sub={profile?.invoices_email || 'Not set yet'} />
                <Row name="The PDF" value={`One file, ${pageWords(pages)}`} />
              </Rows>
            </Card>
          </div>
        </div>
      </div>
      <InvoicePreview open={preview} onClose={() => setPreview(false)} body={body} onSend={send} sendLabel={`Send to ${org.name}`} local={localInput()} />
    </div>
  );
}
