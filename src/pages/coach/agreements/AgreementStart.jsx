import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorMessage, Loading, PageHeader, useToast } from '../../../components/design';
import { newId, rowNow, rowsOf, saveRow } from '../../../lib/coach/store';
import { supabase } from '../../../lib/supabase';
import { KIND_NAMES } from '../../../lib/agreements/terms';
import { KIND_SHORT, firstOf, newDraft, orgFold, packageRow, startFor, startPackages } from '../../../lib/coach/agreementBuilder';
import { Back, TextLink, useCoachPortal } from '../parts';
import { useLeadActions } from '../leadParts';
import { ListRow, SAVE_PROBLEM } from './builderParts';
import './builder.css';

// Choose a starting point (Phase 6b run 3, Group B; M28 s-start; brief items 1 and 31): /coach/agreements/new?for=
// client:<id> | org:<id> | lead:<id> (&as=quote: "Send Sam a quote"). The coach's saved packages come first; every
// price can change for the client in the builder. A package makes the draft (the agreement and its first version, on
// the device at once) and opens the builder. A lead becomes a client first (risk 12: Mark as won, with Undo).
//
// AgreementButtons: New agreement and Send [name] a quote on an organisation's and a lead's page (M28: "Leads and
// organisations have the same button"); a client's page has its own in AgreementFold.

/** The owner's packages for an associate (065 lets every coach read them; an associate's store holds no Finances). */
function usePackages() {
  const { state, isOwner } = useCoachPortal();
  const own = rowsOf(state, 'pricing_packages');
  const [owners, setOwners] = useState(null);
  useEffect(() => {
    if (isOwner || own.length) return undefined;
    let live = true;
    supabase.from('pricing_packages').select('*').eq('archived', false).then(({ data }) => { if (live) setOwners(data || []); }, () => { if (live) setOwners([]); });
    return () => { live = false; };
  }, [isOwner, own.length]);
  return startPackages(own.length ? own : owners || []);
}

export default function AgreementStart() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const portal = useCoachPortal();
  const { userId, coach, isOwner, todayKey, clients = [], organisations = [], leads = [], partial } = portal;
  const packages = usePackages();
  const who = startFor(params.get('for'));
  const asQuote = params.get('as') === 'quote';
  const busy = useRef(false);
  const [problem, setProblem] = useState(null);

  const profile = who?.kind === 'client' ? clients.find((c) => c.id === who.id) || null : null;
  const organisation = who?.kind === 'org' ? organisations.find((o) => o.id === who.id) || null : null;
  const lead = who?.kind === 'lead' ? leads.find((l) => l.id === who.id) || null : null;
  if (lead?.won_profile_id) return <Navigate to={`/coach/agreements/new?for=client:${lead.won_profile_id}${asQuote ? '&as=quote' : ''}`} replace />;

  const name = profile?.name || organisation?.name || lead?.name || '';
  const first = firstOf(name) || name;
  const back = () => navigate(profile ? `/coach/clients/${profile.id}` : organisation ? `/coach/organisations/${organisation.id}` : lead ? `/coach/leads/${lead.id}` : '/coach/clients');

  if (!profile && !organisation && !lead) {
    if (partial) return <div className="cc-page"><div className="cc-col"><Loading label="Loading" /></div></div>;
    return (
      <div className="cc-page"><div className="cc-col">
        <Back to="Clients" onClick={() => navigate('/coach/clients')} />
        <PageHeader title="New agreement" />
        <p className="cc-quiet">Start an agreement from a client’s or an organisation’s page.</p>
      </div></div>
    );
  }

  const start = async ({ pkg = null, kind = null }) => {
    if (busy.current) return;
    busy.current = true;
    setProblem(null);
    const draft = newDraft({ pkg, kind, who: { profile, organisation }, coach, isOwner, ids: { agreementId: newId(), versionId: newId() }, todayKey });
    if (asQuote) draft.version.send_as = 'quote';
    try {
      await saveRow(userId, 'agreements', draft.agreement);
      await saveRow(userId, 'agreement_versions', draft.version);
      navigate(`/coach/agreements/${draft.agreement.id}/edit`);
    } catch {
      setProblem(SAVE_PROBLEM);
      toast.error(SAVE_PROBLEM);
    } finally { busy.current = false; }
  };

  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        <Back to={name} onClick={back} />
        <PageHeader title="New agreement" meta={[name]} />
        {lead ? <LeadFirst lead={lead} first={first} asQuote={asQuote} /> : (
          <>
            <p className="ab-say ab-start-say">Start from one of your packages. You can change anything for {first}.</p>
            <div className="ab-rows">
              {packages.map((p) => {
                const row = packageRow(p, { funded: Boolean(organisation) });
                return <ListRow key={p.id} title={row.title} line={row.meta} aside={row.short} onClick={() => start({ pkg: p })} label={`${row.title}, ${row.short}`} />;
              })}
              {packages.length === 0 && Object.entries(KIND_NAMES).map(([k, label]) => (
                <ListRow key={k} title={label} line="Start with nothing filled in." aside={KIND_SHORT[k]} onClick={() => start({ kind: k })} />
              ))}
            </div>
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            {isOwner && <TextLink onClick={() => navigate('/coach/settings/agreements')}>Manage my packages</TextLink>}
          </>
        )}
      </div>
    </div>
  );
}

/** A lead becomes a client before an agreement (risk 12): Mark as won, with Undo, then the starting point. */
function LeadFirst({ lead, first, asQuote }) {
  const actions = useLeadActions();
  const navigate = useNavigate();
  const { userId } = useCoachPortal();
  const make = async () => {
    const ok = await actions.won(lead);
    const now = rowNow(userId, 'coach_leads', { id: lead.id });
    if (ok && now?.won_profile_id) navigate(`/coach/agreements/new?for=client:${now.won_profile_id}${asQuote ? '&as=quote' : ''}`, { replace: true });
  };
  return (
    <>
      <p className="ab-say ab-start-say">An agreement is with a client, so {first} becomes your client first. You can undo it.</p>
      <div className="ab-acts"><Button variant="primary" onClick={make}>Make {first} a client</Button></div>
    </>
  );
}

/**
 * New agreement and Send [name] a quote, on an organisation's page (with its newest sponsor agreement's line) and a
 * lead's (whose own coral button is Log a call, so these are quieter there).
 */
export function AgreementButtons({ kind, id, name }) {
  const navigate = useNavigate();
  const { agreements = [], agreementVersions = [] } = useCoachPortal();
  const fold = useMemo(() => (kind === 'organisation' ? orgFold({ agreements, versions: agreementVersions, organisationId: id, name }) : null), [kind, agreements, agreementVersions, id, name]);
  if (!id) return null;
  const first = kind === 'lead' ? firstOf(name) || name : name;
  const forWho = kind === 'organisation' ? `org:${id}` : `lead:${id}`;
  return (
    <section className="ds-section cc-part ab-buttons" aria-label="Agreement">
      {kind === 'organisation' && <div className="ds-section-head"><h2 className="ds-section-title">Agreement</h2></div>}
      {fold?.line && <p className="ab-say">{fold.line}</p>}
      <div className="ab-acts">
        <Button variant={kind === 'organisation' ? 'primary' : 'outline'} onClick={() => navigate(`/coach/agreements/new?for=${forWho}`)}>New agreement</Button>
        {fold?.agreement && <Button variant="outline" onClick={() => navigate(`/coach/agreements/${fold.agreement.id}`)}>{`${name}’s agreement`}</Button>}
      </div>
      <TextLink onClick={() => navigate(`/coach/agreements/new?for=${forWho}&as=quote`)}>Send {first} a quote</TextLink>
    </section>
  );
}
