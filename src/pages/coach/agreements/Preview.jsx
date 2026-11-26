import { useNavigate, useParams } from 'react-router-dom';
import { Loading, PageOpening } from '../../../components/design';
import { ClausesCard, PointsCard } from '../../coaching/AgreementParts';
import { readerView } from '../../../lib/coach/agreementBuilder';
import { mainPoints, resolveChoice } from '../../../lib/agreements/clauses';
import '../../coaching/clientAgreement.css';
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
        {/* The same cards the client reads from (the UI tester's P13; M28 v6 "sign"): The main points, then The agreement
            with its clauses opening one at a time, each paragraph's reason in a quieter line under it. */}
        <div className="ab-preview-cards">
          <PointsCard points={view.points} />
          <ClausesCard clauses={view.clauses} idPrefix="pv" />
        </div>
        {d.draft && <p className="ab-ask-shown">{`${d.party.first || 'They'} can ask for a change to any clause before signing.`}</p>}
      </div>
    </div>
  );
}


/** A version as it was sent: its stored clauses (the choice made, once signed), never worked out again. */
function sentView(version) {
  // Before the client has chosen how to settle, both ways, as they read it (Q1).
  const choice = version.settle_choice || 'either';
  const clauses = resolveChoice(version.clauses || [], choice);
  return { clauses, points: mainPoints(version.terms || {}, { choice, clauses }) };
}
