import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/design';
import { coldRows, NO_COLD_LEADS } from '../../lib/coach/crm';
import { Back, TextLink, useCoachPortal } from './parts';
import { useLeadActions, useLeadData } from './leadParts';
import './leads.css';

// Cold leads (Phase 6a run 4): every lead marked as cold, the next to check
// in on first, with what happened and when to check in again. A cold lead
// keeps its page and its timeline, and comes back into the pipeline, at
// the stage it left, with "Bring back". M11 has the link and no screen of
// its own for this, so it is built from the shared rows.

export default function ColdLeads() {
  const navigate = useNavigate();
  const { todayKey } = useCoachPortal();
  const { all } = useLeadData();
  const actions = useLeadActions();
  const rows = coldRows(all, todayKey);
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to="Leads" onClick={() => navigate('/coach/leads')} />
        <PageHeader title="Cold leads" />
        {rows.length === 0 && <p className="cc-quiet">{NO_COLD_LEADS}</p>}
        <div className="cc-rows">
          {rows.map((r) => (
            <div key={r.id} className="cc-line cc-lead-cold">
              <span>
                <button type="button" className="cc-table-name" onClick={() => navigate(`/coach/leads/${r.id}`)}>{r.name}</button>
                <small>{[r.sub, r.happened].filter(Boolean).join(', ')}</small>
                <small>{r.since}. {r.check}.</small>
              </span>
              <TextLink aria-label={`Bring ${r.name} back`} onClick={() => actions.warm(all.find((l) => l.id === r.id))}>Bring back</TextLink>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
