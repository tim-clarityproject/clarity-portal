import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/design';
import { rowsOf } from '../../../lib/coach/store';
import { foldModel, possessive } from '../../../lib/coach/agreementBuilder';
import { Detail, Fold, TextLink, useCoachPortal } from '../parts';
import { Hint, ListRow } from './builderParts';
import './builder.css';

// A client's Agreement fold (Phase 6b run 3, Group B; M28 s-client and s-sent; brief items 21 and 22): the line saying
// where the agreement stands, New agreement, [Name]'s agreement and Send [name] a quote; once it has gone, its Sent,
// Opened (with the time), Signed and Settled rows, See it as [name] and when an unsigned offer runs out. Opened is the
// coach's only (065 never tells the client). Run 1's rows for a signed agreement stay, with Open the agreement (its
// PDF). While the first screen is still loading, run 1's fold shows with its own crosshair (coach rule 49).
// Props: { profileId, name, first, fold (run 1's agreementFold), loading, openAgreement(), children (run 1's fold) }.

export default function AgreementFold({ profileId, name, first, fold, loading, openAgreement, children }) {
  const navigate = useNavigate();
  const { state, agreements = [], agreementVersions = [], invoices = [], isOwner, coaches = [] } = useCoachPortal();
  const ownerFirst = isOwner ? 'you' : coaches.find((c) => c.role === 'owner')?.first_name || 'your practice’s owner';
  const [open, setOpen] = useState(false);
  const quotes = rowsOf(state, 'agreement_quotes');
  const opens = rowsOf(state, 'agreement_link_opens');
  const model = useMemo(() => foldModel({ agreements, versions: agreementVersions, quotes, opens, invoices, profileId, first: first || name, ownerFirst, now: new Date() }),
    [agreements, agreementVersions, quotes, opens, invoices, profileId, first, name, ownerFirst]);
  if (loading) return children ?? null;
  const who = first || name;
  const agr = model.agreement;
  const signed = Boolean(model.version?.client_signed_at);
  const summary = model.summary || fold?.summary || '';
  const openIt = () => {
    if (!agr) return;
    if (agr.status === 'draft' && !model.quote) navigate(`/coach/agreements/${agr.id}/edit`);
    else navigate(`/coach/agreements/${agr.id}`);
  };
  return (
    <Fold title="Agreement" open={open} onToggle={() => setOpen((o) => !o)} summary={summary}>
      <div className="ab-fold">
      <p className="ab-say">{model.line}</p>
      {model.rows.length > 0 && (
        <div>
          <p className="ab-fold-head">{model.head}</p>
          <div className="ab-rows">
            {model.rows.map((r) => <ListRow key={r.label} still title={r.label} aside={<span className={r.done ? 'ab-row-aside--done' : undefined}>{r.value}</span>} />)}
          </div>
        </div>
      )}
      {signed && fold?.rows?.map((r) => <Detail key={r.label} label={r.label}>{r.value}</Detail>)}
      <div className="ab-acts">
        <Button variant="primary" onClick={() => navigate(`/coach/agreements/new?for=client:${profileId}`)}>New agreement</Button>
        {agr && <Button variant="outline" onClick={openIt}>{`${possessive(who)} agreement`}</Button>}
      </div>
      <div className="ab-acts">
        <TextLink onClick={() => navigate(`/coach/agreements/new?for=client:${profileId}&as=quote`)}>Send {who} a quote</TextLink>
        {agr && model.version && <TextLink onClick={() => navigate(`/coach/agreements/${agr.id}/preview`)}>See it as {who}</TextLink>}
        {signed && <TextLink onClick={openAgreement}>Open the agreement</TextLink>}
      </div>
      {model.expiry && <Hint>{model.expiry}</Hint>}
      </div>
    </Fold>
  );
}
