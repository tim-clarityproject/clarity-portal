import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, useIsPhone, useToast } from '../../components/design';
import { renewals, RENEWALS_NOTE } from '../../lib/coach/associatePay';
import { rowsOf } from '../../lib/coach/store';
import { TextLink, useCoachPortal } from './parts';
import { Card, Empty } from '../../components/design/Blocks';
import { PersonRow } from './peopleParts';
import './pay.css';

// Clients, Renewals (Phase 6b run 2, step 3; M11 C11), the owner's alone: the engagements and organisations' agreements
// ending in the next 90 days with their price, then Repeating income. The renewal proposal isn't drawn, so a row opens
// the client (or says whose client they are) or the organisation.

// The first renewals, soonest first; the rest behind Show all (a business with many ending at once).
const FIRST = 10;

/** One card (rule 13): its label, with the total at its right on a laptop. */
function Section({ title, aside, children }) {
  return <Card label={title} add={aside} className="cc-renew-card">{children}</Card>;
}

export default function RenewalsTab() {
  const { state, todayKey, admin, adminReady, coach, agreements, agreementVersions, orgDeals, organisations } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useIsPhone();
  const [all, setAll] = useState(false);
  const data = useMemo(() => renewals({
    today: todayKey, admin, coachId: coach.id, engagements: rowsOf(state, 'engagements'), agreements, versions: agreementVersions, orgDeals, organisations,
  }), [todayKey, admin, coach.id, state, agreements, agreementVersions, orgDeals, organisations]);

  if (!adminReady) return <Loading label="Loading your renewals" />;
  const open = (r) => {
    if (r.kind === 'organisation') { navigate(`/coach/organisations/${r.id}`); return; }
    if (!r.mine) { toast.show(`${r.title} is ${r.coachName}’s client, so only ${r.coachName} opens their page.`); return; }
    navigate(`/coach/clients/${r.id}`);
  };
  return (
    <>
      <Section title="Renewals in the next 90 days" aside={data.totalWords && !isPhone ? <span className="cc-pay-aside">{data.totalWords}</span> : null}>
        {data.rows.length === 0 && <Empty>Nothing ends in the next 90 days.</Empty>}
        {data.rows.length > 0 && (
          <>
            <div className="ds-rows-list">
              {(all ? data.rows : data.rows.slice(0, FIRST)).map((r) => (
                <PersonRow
                  key={r.key}
                  name={r.title}
                  facts={isPhone ? r.facts : [...r.facts, r.ends]}
                  when={r.value}
                  label={[r.title, ...r.facts, r.ends, r.value].filter(Boolean).join(', ')}
                  href={r.kind === 'organisation' ? `/coach/organisations/${r.id}` : r.mine ? `/coach/clients/${r.id}` : undefined}
                  onClick={() => open(r)}
                />
              ))}
            </div>
            {data.rows.length > FIRST && <div className="cc-acts"><TextLink aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${data.rows.length}`}</TextLink></div>}
            <p className="cc-note cc-pay-note">{RENEWALS_NOTE}</p>
          </>
        )}
      </Section>
      {data.repeating.length > 0 && (
        <Section title="Repeating income">
          <div className="ds-rows-list">
            {data.repeating.map((r) => (
              <PersonRow key={r.key} name={r.title} facts={r.facts} when={r.value} label={[r.title, ...r.facts, r.value].filter(Boolean).join(', ')} href={`/coach/organisations/${r.id}`} onClick={() => navigate(`/coach/organisations/${r.id}`)} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
