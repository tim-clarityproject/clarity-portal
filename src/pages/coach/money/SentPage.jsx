import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chevron, Loading, useToast } from '../../../components/design';
import { Card, Empty, Figure, PageOpening, Row, Rows } from '../../../components/design/Blocks';
import { agreementStatus, expiryLine } from '../../../lib/agreements/status';
import { isSigned } from '../../../lib/agreements/duringAgreement';
import { reminderLine, sentFacts, sentLabel, sentLead } from '../../../lib/coach/money';
import { rowsOf } from '../../../lib/coach/store';
import { formatClockTime } from '../../../lib/dateFormatter';
import { Back, useCoachPortal } from '../parts';
import FactRow from './FactRow';
import MistakeLine from '../../../components/agreements/MistakeLine';
import { signedPdfProblem } from '../../../lib/agreements/askClient';
import './money.css';

// Sent (Polish 1, Stage C, C2; M28 version 6, "sent": /coach/agreements/:id/sent). Where an agreement or a quote is once
// it has gone: its four statuses (Sent, Opened, Signed, Settled; a quote's Sent and Opened), worked out by run 3's
// agreementStatus (Opened is the coach's only: agreements rule 6), with the reminder line under them; beside them the
// agreement's price, dates and sessions, See it as [name] sees it, and the signed PDF once both have signed.

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export default function SentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const [pdfProblem, setPdfProblem] = useState(null);
  const a = p.agreements.find((x) => x.id === id) || null;
  const versions = useMemo(() => (p.agreementVersions || []).filter((v) => v.agreement_id === id).sort((x, y) => (y.version || 0) - (x.version || 0)), [p.agreementVersions, id]);
  const quotes = rowsOf(p.state, 'agreement_quotes');
  const opens = rowsOf(p.state, 'agreement_link_opens');
  // The version that went: the newest sent or signed one; else a draft that went as a quote.
  const sent = versions.find((v) => v.status === 'sent' || isSigned(v)) || null;
  const draft = versions.find((v) => v.status === 'draft') || null;
  const quote = !sent && draft ? quotes.find((q) => q.version_id === draft.id && q.status !== 'draft' && q.status !== 'withdrawn') || null : null;
  const version = sent || (quote ? draft : null);

  if (!a || !version) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the agreement" /></div></div>;
    return (
      <div className="cc-page">
        <div className="cc-col">
          <Back to="Clients" onClick={() => navigate('/coach/clients')} />
          <PageOpening title="Sent" />
          <Empty action={a ? { children: 'Open the agreement', onClick: () => navigate(`/coach/agreements/${a.id}/edit`) } : null}>Nothing has gone from this agreement yet.</Empty>
        </div>
      </div>
    );
  }
  const client = p.clients.find((c) => c.id === a.profile_id) || null;
  const org = p.organisations.find((o) => o.id === a.organisation_id) || null;
  const t = version.terms || {};
  const name = client?.name || t.clientName || org?.name || '';
  const first = firstOf(client?.name || t.clientFirst || name) || 'them';
  const signed = isSigned(version);
  const firstInvoice = version.funded_by ? null : (p.invoices || []).filter((i) => i.agreement_id === a.id && (i.version_id === version.id || !i.version_id))
    .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))[0] || null;
  const versionOpens = opens.filter((o) => (o.version_id && o.version_id === version.id) || (quote && o.quote_id === quote.id));
  const rows = quote
    ? agreementStatus({ version: { ...version, sent_at: quote.sent_at }, opens: versionOpens, now: new Date(p.now) }).slice(0, 2)
    : agreementStatus({ version, opens: versionOpens, firstInvoice, orgName: version.funded_by, now: new Date(p.now) });
  const facts = sentFacts(version, p.todayKey);
  const title = signed ? `Signed by ${first}` : quote ? `Quote sent to ${first}` : `Sent to ${first}`;
  const back = client ? () => navigate(`/coach/clients/${client.id}`) : org ? () => navigate(`/coach/organisations/${org.id}`) : () => navigate('/coach/clients');
  const downloadPdf = async () => {
    setPdfProblem(null);
    try {
      const [{ loadSignedPdf }, { savePdfFile }] = await Promise.all([import('../../../lib/coaching/agreements'), import('../../../lib/pdf/saveFile')]);
      const { bytes, fileName } = signed ? await loadSignedPdf(version) : await sentPdf({ version, agreement: a, clientName: name, clientEmail: client?.email || '' });
      savePdfFile(bytes, fileName);
    } catch { setPdfProblem(signed ? signedPdfProblem() : 'The PDF wasn’t made. Check your connection and try again.'); }
  };
  const note = quote ? '' : reminderLine(first, signed);
  const expiry = quote || signed ? '' : expiryLine({ version, firstName: first, today: p.todayKey });

  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to={name || 'Clients'} onClick={back} />
        <PageOpening label={sentLabel(version, quote)} title={title} line={sentLead({ version, first, quote, clock: formatClockTime })} />
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card label="Where it is">
              <Rows label="Where it is">
                {rows.map((r) => <FactRow key={r.label} name={r.label} value={r.value} />)}
              </Rows>
            </Card>
            {(note || expiry) && (
              <div className="cc-money-notes">
                {note && <p className="cc-money-note">{note}</p>}
                {expiry && <p className="cc-money-note">{expiry}</p>}
              </div>
            )}
          </div>
          <div>
            <Card label={quote ? 'The quote' : 'The agreement'}>
              {facts.price && <Figure value={facts.price} unit={facts.unit} />}
              <Rows>
                {facts.gbp && <Row name="In pounds" value={facts.gbp} />}
                {(facts.dates || facts.sessions) && <Row name={facts.dates || t.coaching || 'The coaching'} value={facts.sessions} />}
                <Row name={`See it as ${first} sees it`} value={<Chevron direction="right" />} onClick={() => navigate(`/coach/agreements/${a.id}/preview`)} className="cc-money-go" />
                {/* M28 v6 "sent": the PDF from the moment it goes (as sent, waiting for the client's signature), then as signed. */}
                {!quote && <Row name="Download the PDF" value={<Chevron direction="right" />} onClick={downloadPdf} className="cc-money-go" />}
                {!quote && pdfProblem && <MistakeLine>{pdfProblem}</MistakeLine>}
                {signed && <Row name="Open the agreement’s page" value={<Chevron direction="right" />} onClick={() => navigate(`/coach/agreements/${a.id}`)} className="cc-money-go" />}
              </Rows>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The agreement as it was sent, before the client signs (M28 v6 "sent": Download the PDF): the one agreement PDF
 * (src/lib/pdf/docs/agreement.js) from the version's stored clauses, with the business's own details (068), its
 * signing block still open. Light only (PDF rule 1). Once signed, the kept signed PDF is given instead.
 */
async function sentPdf({ version, agreement, clientName, clientEmail }) {
  const [{ agreementPdf }, { tidyVersion }, { renderPdf }, { loadPdfAssets }, { paperFor }, { businessFacts }] = await Promise.all([
    import('../../../lib/pdf/docs/agreement.js'), import('../../../lib/coaching/agreementRules.js'), import('../../../lib/pdf/render'),
    import('../../../lib/pdf/assets'), import('../../../lib/pdf/paper'), import('../../../lib/pdf/business'),
  ]);
  // The client's email in the parties block, as the approved agreement has it (the UI tester's Q6).
  const terms = { ...(version.terms || {}), clientEmail: version.terms?.clientEmail || clientEmail || '' };
  const tidy = tidyVersion({ ...version, terms, reference: version.reference || agreement?.reference });
  if (!tidy) throw new Error('No version to print.');
  const facts = await businessFacts().catch(() => null);
  const spec = agreementPdf({ version: tidy, clientName, raw: version, business: facts || null });
  const assets = await loadPdfAssets(spec);
  return renderPdf(spec, { variant: 'light', paper: paperFor({ country: null }), assets });
}
