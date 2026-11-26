import { useNavigate, useParams } from 'react-router-dom';
import { Loading, PageOpening } from '../../../components/design';
import AgreementView from '../../../components/agreements/AgreementView';
import { readerView } from '../../../lib/coach/agreementBuilder';
import { mainPoints, resolveChoice } from '../../../lib/agreements/clauses';
import { ASK_CHANGE } from '../../../lib/coaching/clientMoney';
import { Back } from '../parts';
import { useAgreementDraft } from './builderParts';

// Preview the agreement (Phase 6b run 3, Group B; M28 s-preview; brief items 15 and 16): /coach/agreements/:id/preview.
// The whole agreement as the client will see it: Main points, the contents, every clause in order with each firm rule's
// reason under it (the shared AgreementView, the same the client signs from), up front chosen as it starts. With no
// draft left it shows the newest version as sent.

export default function Preview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const d = useAgreementDraft(id);
  const version = d.draft || d.versions[0] || null;
  const back = <Back to={d.draft ? 'Does this read right?' : d.party.name || 'Back'} onClick={() => (d.draft ? navigate(`/coach/agreements/${id}/edit?q=check`) : navigate(-1))} />;
  if (!version) return <div className="cc-page"><div className="cc-col">{back}{d.loading ? <Loading label="Loading the agreement" /> : <PageOpening title="The agreement" line="That agreement isn’t here." />}</div></div>;
  const view = d.draft
    ? readerView(version.terms || {}, { standards: d.standards, overrides: version.overrides || {} })
    : sentView(version);
  return (
    <div className="cc-page">
      <div className="cc-col ab-page">
        {back}
        <PageOpening label={`${d.party.name || ''}${d.party.name ? ', ' : ''}version ${version.version}`} title="The agreement" line={`As ${d.party.first || 'they'} will see it${d.draft ? ', with up front chosen to start with' : ''}.`} />
        {/* "Ask for a change" under each clause as the client sees it while it waits to be signed; here it does nothing (UI finding 7). */}
        <AgreementView points={view.points} clauses={view.clauses} idPrefix="pv" after={d.draft ? askShown : undefined} />
      </div>
    </div>
  );
}

/** The client's "Ask for a change", drawn as their quiet link and doing nothing in the coach's preview. */
const askShown = () => <p className="ab-ask-shown"><span className="ds-link">{ASK_CHANGE}</span></p>;

/** A version as it was sent: its stored clauses (the choice made, once signed), never worked out again. */
function sentView(version) {
  const choice = version.settle_choice || 'upfront';
  const clauses = resolveChoice(version.clauses || [], choice);
  return { clauses, points: mainPoints(version.terms || {}, { choice, clauses }) };
}
