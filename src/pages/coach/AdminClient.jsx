import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Loading, PageHeader, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { moveClient } from '../../lib/coach/actions';
import { adminAgreementLines, adminEngagementLines, adminInvoiceLines } from '../../lib/coach/adminClient';
import { possessive } from '../../lib/coach/model';
import { Back, Line, Part, useCoachPortal } from './parts';

/**
 * The owner's view of an associate's client (follow-up 5, item 10): who coaches them (with Move to a coach), their
 * engagement, their agreements and their invoices. Admin facts only (coach rule 9): never notes, About them, files,
 * tags, fields or anything of the coaching, which stay the associate's.
 * @param {{ row: object }} p one row of 049's coach_admin_clients
 */
export default function AdminClient({ row }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, coaches, invoices = [], todayKey, reloadCoaches } = useCoachPortal();
  const [agreements, setAgreements] = useState(null); // null while asked; [] when none or not readable
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let live = true;
    setAgreements(null);
    setProblem(false);
    Promise.resolve(supabase.rpc('coach_admin_agreements', { p_profile: row.profile_id }))
      .then(({ data, error }) => {
        if (!live) return;
        // Before 064 there is nothing to ask: no agreements are shown rather than a wrong "none".
        if (error && !/coach_admin_agreements|PGRST202/.test(`${error.code} ${error.message}`)) setProblem(true);
        setAgreements(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (live) { setProblem(true); setAgreements([]); } });
    return () => { live = false; };
  }, [row.profile_id]);

  const coachFirst = row.coach_first_name || 'their coach';
  const others = (coaches || []).filter((c) => c.active && c.coach_id !== row.coach_id);
  const move = async (toId) => {
    const to = others.find((c) => c.coach_id === toId);
    try {
      const from = await moveClient(userId, row.profile_id, toId);
      reloadCoaches();
      toast.saved({ message: `${row.name} moved to ${to?.first_name || 'their new coach'}`, long: true, onUndo: () => moveClient(userId, row.profile_id, from).then(reloadCoaches).catch(() => {}) });
    } catch (error) { toast.error(error?.message || 'That didn’t save. Check your connection and try again.'); }
  };
  const engagement = adminEngagementLines(row);
  const agreementLines = adminAgreementLines(agreements || []);
  const invoiceLines = adminInvoiceLines({ invoices, profileId: row.profile_id, agreementIds: (agreements || []).map((a) => a.agreement_id), todayKey });

  return (
    <div className="cc-page"><div className="cc-col">
      <Back onClick={() => navigate('/coach/clients')} />
      <PageHeader title={row.name} meta={[`${possessive(coachFirst)} client`, row.organisation_name || null].filter(Boolean)} />
      <p className="cc-note">{coachFirst} coaches {row.name}, so their notes and coaching stay with {coachFirst}. You see who coaches them, the agreement and the invoices.</p>

      <Part title="Who coaches them">
        <Line title="Coach" small={row.status === 'past' ? 'A past client' : null}>{coachFirst}</Line>
        {others.length > 0 && (
          <div className="cc-field"><Dropdown label="Move to a coach" placeholder="Choose a coach" options={others.map((c) => ({ value: c.coach_id, label: c.full_name || c.first_name }))} value={null} onChange={move} /></div>
        )}
      </Part>

      {engagement.length > 0 && (
        <Part title="Engagement">
          {engagement.map((l) => <Line key={l.title} title={l.title}>{l.value}</Line>)}
        </Part>
      )}

      <Part title="Agreement">
        {agreements === null && <Loading label="Loading the agreement" />}
        {agreements !== null && problem && <p className="cc-quiet" role="alert">The agreement didn’t load. Check your connection and try again.</p>}
        {agreements !== null && !problem && agreementLines.length === 0 && <p className="cc-quiet">{row.name} has no agreement yet.</p>}
        {agreementLines.map((l) => <Line key={l.key} title={l.title} small={l.small}>{l.value}</Line>)}
      </Part>

      <Part title="Invoices">
        {agreements === null ? <Loading label="Loading the invoices" />
          : invoiceLines.length === 0 ? <p className="cc-quiet">{row.name} has no invoices yet.</p>
            : invoiceLines.map((l) => <Line key={l.key} title={l.title} small={l.small}>{l.value}</Line>)}
      </Part>
    </div></div>
  );
}
