import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Checkbox, Loading, PageHeader, TextField, useToast } from '../../../components/design';
import { ask } from '../../../lib/agreements/askClient';
import { moneyText } from '../../../lib/agreements/currency';
import { evidenceHint, introLine, pageCount, pageWords, problems, rate as rateFor, totalLine } from '../../../lib/agreements/orgInvoice';
import { billTo, invoicePeriod, olderWords, openPo, orgInvoiceRows, penceFrom, rowDay, rowHours } from '../../../lib/agreements/duringAgreement';
import { uploadReceipt } from '../../../lib/coach/financeActions';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { loadCoach, newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { deviceZone } from '../../../lib/time/index.js';
import { Back, TextLink, useCoachPortal } from '../parts';
import { Problem } from '../needsYou/panels';
import InvoicePreview from './InvoicePreview';
import '../needsYou/needsyou.css';

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
    sources: rowsOf(p.state, 'invoice_sources'), zone, now: p.now,
  }), [id, p.clients, p.sessions, p.state, zone, p.now]);
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
  const line = (r) => (
    <div key={r.key} className="ny-qrow">
      <Checkbox checked={isTicked(r.key)} onChange={(on) => { setTicked((was) => ({ ...was, [r.key]: on })); setProblem(null); }}>{`${rowDay(r.day, p.todayKey)}, ${r.what}`}</Checkbox>
      <span className="ny-qrow-h">{rowHours(r.minutes)}</span>
    </div>
  );

  return (
    <div className="cc-page">
      <div className="cc-col ny-page">
        <Back to={org.name} onClick={() => navigate(`/coach/organisations/${org.id}/billing`)} />
        <PageHeader title="New invoice" meta={[org.name]} />
        <h2 className="ny-sec">Addressed to</h2>
        {profile ? <p className="ny-billto">{billTo(profile, org.name).map((l) => <span key={l}>{l}</span>)}</p> : <p className="ny-hint">{`${org.name} has no billing details yet.`}</p>}
        <div className="cc-acts"><TextLink onClick={() => navigate(`/coach/organisations/${org.id}/billing`)}>{profile ? 'Change their billing details' : 'Add their billing details'}</TextLink></div>
        <div className="cc-two ny-two">
          <TextField label="What’s the purchase order?" value={pon} maxLength={80} autoComplete="off" onChange={(e) => { setPoNumber(e.target.value); setProblem(null); }} />
          <TextField label="What’s your supplier number?" value={sup} maxLength={80} autoComplete="off" onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <TextField label="Do they have a reference?" value={ref} maxLength={160} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        <h2 className="ny-sec">What it’s for</h2>
        <p className="ny-hint">{introLine(rateMinor, c)}</p>
        {all.length === 0 ? <p className="ny-say">Nothing is logged since the last invoice.</p> : (
          <div role="group" aria-label="What it’s for">
            {period.recent.map(line)}
            {period.older.length > 0 && (
              <>
                <div className="cc-acts"><TextLink aria-expanded={showOlder} aria-controls="ny-older" onClick={() => setShowOlder((v) => !v)}>{showOlder ? 'Hide older' : olderWords(period.older.length)}</TextLink></div>
                <div id="ny-older" hidden={!showOlder}>{showOlder && period.older.map(line)}</div>
              </>
            )}
          </div>
        )}
        {rows.length > 0 && <p className="ny-hint">{totalLine(rows, rateMinor, profile?.terms_days || 30, c)}</p>}
        <TextField label="What’s your hourly rate for this invoice?" inputMode="decimal" value={typedRate ?? (rateMinor ? moneyText(rateMinor, c) : '')} placeholder="e.g. £300" autoComplete="off" onChange={(e) => setTypedRate(e.target.value)} />
        {profile?.timesheet && (
          <>
            <h2 className="ny-sec">Timesheet page</h2>
            <p className="ny-hint">Built from the coaching sessions ticked above, as page 2.</p>
          </>
        )}
        <h2 className="ny-sec">Attached pages</h2>
        {evidence.length === 0 ? <p className="ny-say">Nothing attached.</p> : (
          <ul className="ny-list" aria-label="Attached pages">
            {evidence.map((e, i) => (
              <li key={e.id} className="ny-li">
                <span><span className="ny-li-t ny-li-t--file">{e.file_name}</span><span className="ny-li-m">{`Added as page ${pageOf(i)}`}</span></span>
                <TextLink onClick={() => removeFile(e)} aria-label={`Remove ${e.file_name}`}>Remove</TextLink>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" hidden onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ''; }} />
        <AddButton onClick={() => fileRef.current?.click()}>Add screenshot or PDF</AddButton>
        {profile?.evidence_required && <p className="ny-hint">{evidenceHint(org.name)}</p>}
        <Problem>{problem}</Problem>
        <div className="cc-acts">
          <Button variant="primary" onClick={send}>Send to their finance team</Button>
          <Button variant="outline" onClick={() => setPreview(true)}>Preview the PDF</Button>
        </div>
        <p className="ny-hint">{`One PDF, ${pageWords(pages)}. ${rows.length ? `${moneyText(Math.round(rows.reduce((a, r) => a + r.minutes, 0) * rateMinor / 60), c)} in all.` : ''}`.trim()}</p>
      </div>
      <InvoicePreview open={preview} onClose={() => setPreview(false)} body={body} onSend={send} />
    </div>
  );
}
