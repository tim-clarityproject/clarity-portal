import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown, ErrorMessage, Loading, PageHeader, useToast } from '../../../components/design';
import { mainPoints, hoursPoints, teamPoints } from '../../../lib/agreements/clauses';
import { NOTHING_LINE, differences } from '../../../lib/agreements/differences';
import { checkTerms, kindOf } from '../../../lib/agreements/terms';
import { quoteNumber } from '../../../lib/agreements/quote';
import { builderLines, readerView, sendWords } from '../../../lib/coach/agreementBuilder';
import { Back, useCoachPortal } from '../parts';
import { Hint, ListRow, Pick, PointsList, Sec, useAgreementDraft } from './builderParts';
import { useSavedSignature, useSend } from './useSend';

// Check before sending (Phase 6b run 3, Group B; M28 s-check, s-t-check, s-h-check; brief items 18, 19 and 22):
// /coach/agreements/:id/check. Built from what's in the builder, so changing anything there changes this list: every
// difference from the standard (edited clauses, discounts, mixed lengths, pricing by the hour or month, visit days,
// funding, notice, due days, expiry, pausing off, invoicing as delivered), each with Edit; the Main points; what is
// settled when signing; and "How should it go?": an agreement to sign, or a quote first (valid 14, 30 or 60 days, the
// saved signature going on as it is sent). A team's check goes to the sponsor, a block of hours' to the client.

export default function CheckSend() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const d = useAgreementDraft(id);
  const { isOwner } = useCoachPortal();
  const send = useSend(d);
  const saved = useSavedSignature(d.userId);
  const [sendAs, setSendAs] = useState(null);
  const [valid, setValid] = useState('30');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const { agreement, draft, party, standards } = d;

  if (!agreement || !draft) {
    return <div className="cc-page"><div className="cc-col"><Back to="New agreement" onClick={() => navigate(`/coach/agreements/${id}/edit`)} />{d.loading ? <Loading label="Loading the agreement" /> : <p className="cc-quiet">There’s nothing waiting to be sent on this agreement.</p>}</div></div>;
  }
  const terms = draft.terms || {};
  const kind = kindOf(terms);
  const first = party.first || 'them';
  const overrides = draft.overrides || {};
  const how = sendAs || draft.send_as || 'agreement';
  const meta = [party.name, `Version ${draft.version}`];
  const back = <Back to={draft.version > 1 ? `Version ${draft.version}` : 'New agreement'} onClick={() => navigate(`/coach/agreements/${id}/edit`)} />;
  const lines = builderLines(terms, { first, orgName: party.orgName });
  const missing = checkTerms(terms);
  const whereTo = () => navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : agreement.organisation_id ? `/coach/organisations/${agreement.organisation_id}` : '/coach/clients');

  // Sends straight away with the saved signature; with none, the signing page draws one first.
  const go = async (as) => {
    if (missing.length) { setProblem(missing[0]); return; }
    if (!saved) { navigate(`/coach/agreements/${id}/sign${as === 'quote' ? `?as=quote&valid=${valid}` : ''}`); return; }
    setBusy(true);
    setProblem(null);
    const answer = await send({ sendAs: as, validDays: Number(valid), signature: { saved } });
    setBusy(false);
    if (!answer.ok) { setProblem(answer.message); return; }
    whereTo();
    if (answer.waiting) toast.show(`Signed. It goes to ${first} once your practice’s owner approves it.`);
    else if (as === 'quote') toast.show(`Quote ${answer.quoteNumber ? quoteNumber(answer.quoteNumber) : ''} signed and sent to ${first}`.replace('Quote  signed', 'Quote signed'));
    else toast.show(kind === 'team' ? 'Sent to the sponsor' : `Sent to ${first}`);
  };

  if (kind === 'team' || kind === 'hours') {
    return (
      <div className="cc-page">
        <div className="cc-col ab-page">
          {back}
          <PageHeader title="Check before sending" meta={meta} />
          {kind === 'team' && <Sec id="ab-points">Main points</Sec>}
          <PointsList points={kind === 'team' ? teamPoints(terms) : hoursPoints(terms)} />
          {problem && <ErrorMessage>{problem}</ErrorMessage>}
          <div className="ab-acts">
            <Button variant="primary" onClick={() => go('agreement')} aria-busy={busy || undefined}>{sendWords({ kind, first })}</Button>
          </div>
          {!isOwner && <Hint>It goes once your practice’s owner approves it.</Hint>}
        </div>
      </div>
    );
  }

  const diffs = differences(terms, { overrides, standards, clientFirst: first });
  const { clauses } = readerView(terms, { standards, overrides });
  const points = mainPoints(terms, { choice: terms.choice ?? 'upfront', clauses });
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        {back}
        <PageHeader title="Check before sending" meta={meta} />
        <Sec id="ab-diff">What’s different</Sec>
        {diffs.length === 0 ? <p className="ab-say">{NOTHING_LINE}</p> : (
          <div className="ab-rows">
            {diffs.map((r) => (
              <ListRow key={`${r.label}-${r.detail}`} title={r.label} line={r.detail} aside="Edit" label={`Edit ${r.label}`}
                onClick={() => navigate(r.where === 'clause' ? `/coach/agreements/${id}/clauses/${r.clauseKey}` : `/coach/agreements/${id}/edit`)} />
            ))}
          </div>
        )}
        <Sec id="ab-points">Main points</Sec>
        <PointsList points={points} />
        <Hint>{lines.firstPay}</Hint>
        <Pick label="How should it go?" options={[{ value: 'agreement', label: 'An agreement to sign' }, { value: 'quote', label: 'A quote first' }]} value={how} onChange={(v) => { setSendAs(v); setProblem(null); }} />
        {how === 'agreement' && (
          <>
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            <div className="ab-acts">
              <Button variant="primary" onClick={() => (missing.length ? setProblem(missing[0]) : navigate(`/coach/agreements/${id}/sign`))}>Sign and send</Button>
              <Button variant="outline" onClick={() => navigate(`/coach/agreements/${id}/preview`)}>See the whole agreement</Button>
            </div>
          </>
        )}
        {how === 'quote' && (
          <>
            <Dropdown label="How long is the quote valid?" options={[14, 30, 60].map((n) => ({ value: String(n), label: `${n} days` }))} value={valid} onChange={setValid} />
            <Hint>{saved === null ? 'You sign it next, and your signature goes on as you send it.' : 'Your saved signature goes on as you send it.'}</Hint>
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            <div className="ab-acts">
              <Button variant="primary" onClick={() => go('quote')} aria-busy={busy || undefined}>Sign and send the quote</Button>
              <Button variant="outline" onClick={() => toast.show('The quote’s PDF is ready once it’s sent and has its number.')}>Download the quote as a PDF</Button>
            </div>
          </>
        )}
        {!isOwner && <Hint>It goes once your practice’s owner approves it.</Hint>}
      </div>
    </div>
  );
}
