import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Loading, PageOpening, useToast } from '../../../components/design';
import { BUILDER_LINES } from '../../../content/pageLines/coach';
import { newId, rowNow, rowsOf, saveRow } from '../../../lib/coach/store';
import { supabase } from '../../../lib/supabase';
import { firstOf, newDraft, orgFold, startFor, startPackages } from '../../../lib/coach/agreementBuilder';
import { Back, TextLink, useCoachPortal } from '../parts';
import { useLeadActions } from '../leadParts';
import { SAVE_PROBLEM } from './builderParts';
import './builder.css';
import MistakeLine from '../../../components/agreements/MistakeLine';

// New agreement (Phase 6b run 3, Group B; Polish 1, Stage C: M28 version 6 has no starting page): /coach/agreements/
// new?for=client:<id> | org:<id> | lead:<id> (&as=quote: "Send Sam a quote"). The draft is made at once from the first
// package (an organisation's from its first team package) and the builder opens at its first question; the package is
// chosen there, at "What are you offering?". A lead becomes a client first (risk 12: Mark as won, with Undo).
//
// AgreementButtons: New agreement and Send [name] a quote on an organisation's and a lead's page (M28: "Leads and
// organisations have the same button"); a client's page has its own in its Agreements card (ClientPage.jsx).

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
  return { list: startPackages(own.length ? own : owners || []), ready: isOwner || own.length > 0 || owners !== null };
}

export default function AgreementStart() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const portal = useCoachPortal();
  const { userId, coach, isOwner, todayKey, clients = [], organisations = [], leads = [], partial } = portal;
  const { list: packages, ready } = usePackages();
  const who = startFor(params.get('for'));
  const asQuote = params.get('as') === 'quote';
  const busy = useRef(false);
  const [problem, setProblem] = useState(null);

  const profile = who?.kind === 'client' ? clients.find((c) => c.id === who.id) || null : null;
  const organisation = who?.kind === 'org' ? organisations.find((o) => o.id === who.id) || null : null;
  const lead = who?.kind === 'lead' ? leads.find((l) => l.id === who.id) || null : null;
  const name = profile?.name || organisation?.name || lead?.name || '';
  const first = firstOf(name) || name;

  // M28 version 6: "New agreement" opens the questionnaire at its first question, its answers filled in from the first
  // package (the coach changes it at "What are you offering?"). The draft is made at once and kept on the device.
  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setProblem(null);
    const pkg = (organisation && !profile ? packages.find((p) => p.agreement_kind === 'team') : packages.find((p) => p.agreement_kind !== 'team')) || packages[0] || null;
    const draft = newDraft({ pkg, kind: pkg ? null : (organisation && !profile ? 'team' : 'sessions'), who: { profile, organisation }, coach, isOwner, ids: { agreementId: newId(), versionId: newId() }, todayKey });
    if (asQuote) draft.version.send_as = 'quote';
    try {
      await saveRow(userId, 'agreements', draft.agreement);
      await saveRow(userId, 'agreement_versions', draft.version);
      navigate(`/coach/agreements/${draft.agreement.id}/edit`, { replace: true });
    } catch {
      busy.current = false;
      setProblem(SAVE_PROBLEM);
      toast.error(SAVE_PROBLEM);
    }
  };
  const go = (profile || organisation) && ready && !partial && !problem;
  useEffect(() => { if (go) start(); });

  if (lead?.won_profile_id) return <Navigate to={`/coach/agreements/new?for=client:${lead.won_profile_id}${asQuote ? '&as=quote' : ''}`} replace />;
  const back = () => navigate(profile ? `/coach/clients/${profile.id}` : organisation ? `/coach/organisations/${organisation.id}` : lead ? `/coach/leads/${lead.id}` : '/coach/clients');

  if (!profile && !organisation && !lead) {
    if (partial) return <div className="cc-page"><div className="cc-col"><Loading label="Loading" /></div></div>;
    return (
      <div className="cc-page"><div className="cc-col">
        <Back to="Clients" onClick={() => navigate('/coach/clients')} />
        <PageOpening title="New agreement" line="Start an agreement from a client’s or an organisation’s page." />
      </div></div>
    );
  }
  if (lead) {
    return (
      <div className="cc-page">
        <div className="cc-col ab-page">
          <Back to={name} onClick={back} />
          <LeadFirst lead={lead} first={first} asQuote={asQuote} />
        </div>
      </div>
    );
  }
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        {problem ? (
          <>
            <Back to={name} onClick={back} />
            <PageOpening label={name} title="New agreement" line="The draft didn’t save, so nothing has changed." action={<Button variant="primary" onClick={() => { setProblem(null); start(); }}>Try again</Button>} />
            <MistakeLine>{problem}</MistakeLine>
          </>
        ) : <Loading label="Starting the agreement" />}
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
  return <PageOpening label={lead.name} title="New agreement" line={BUILDER_LINES.start(first)} action={<Button variant="primary" onClick={make}>Make {first} a client</Button>} />;
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
