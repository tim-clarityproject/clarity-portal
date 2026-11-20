import { useNavigate } from 'react-router-dom';
import { PageHeader, SearchField, SwitchRow, useToast } from '../../components/design';
import { useState } from 'react';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { clean, dayWords } from '../../lib/coach/model';
import { CHECK_INS_SWITCH, checkInsDue, checkInsOn, checkInsToSuggest, PAST_WORDS } from '../../lib/coach/crm';
import { Back, Line, Part, Row, TextLink, useCoachPortal } from './parts';
import { CheckInPanel } from './pastParts';
import { calm } from './crmParts';
import './crm.css';

// Past clients (M11 seq 77: "Past clients"): hidden from the main list but
// searchable, and one tap starts a new engagement. Past clients stay warm
// (run 4): check-ins are suggested at 3, 6 and 12 months after coaching
// ends, each a quiet row that opens a note the coach edits and sends from
// their own email. The switch turns the suggestions off. Each coach's own.
export default function PastClients() {
  const { userId, coach, clients, organisations, settings, checkIns, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const past = clients.filter((p) => p.status === 'past').sort((a, b) => String(b.ended_on || '').localeCompare(String(a.ended_on || '')));
  const words = clean(q).toLowerCase().split(' ').filter(Boolean);
  const orgName = (id) => organisations.find((o) => o.id === id)?.name || '';
  const shown = past.filter((p) => words.every((w) => `${p.name} ${orgName(p.organisation_id)}`.toLowerCase().includes(w)));
  const on = checkInsOn(settings);
  const due = on ? checkInsDue(checkIns, past, { todayKey, organisations }) : [];
  const restart = async (p) => {
    try {
      await saveRow(userId, 'client_profiles', { ...p, status: 'active', ended_on: null });
      toast.saved({ message: `${p.name} is back in your clients`, long: true, onUndo: () => saveRow(userId, 'client_profiles', p) });
      navigate(`/coach/clients/${p.id}`, { state: { open: 'engagement' } });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };
  // Switched on again: the check-ins still to come for everyone here are suggested (any already there are left alone).
  const flip = async (next) => {
    const add = next ? checkInsToSuggest(past, { coachId: coach.id, newId, existing: checkIns, todayKey }) : [];
    try {
      await saveRows(userId, [['coach_settings', { ...settings, crm: { ...(settings.crm || {}), suggest_check_ins: next } }], ...add.map((c) => ['client_check_ins', c])]);
      toast.saved({
        message: next ? PAST_WORDS.switchedOn : PAST_WORDS.switchedOff, long: true,
        onUndo: async () => { try { await saveRow(userId, 'coach_settings', settings); for (const c of add) await removeRow(userId, 'client_check_ins', c.id).catch(() => {}); } catch (e) { toast.error(calm(e)); } },
      });
    } catch (e) { toast.error(calm(e)); }
  };
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageHeader title="Past clients" />
        {past.length === 0 && <p className="cc-quiet">Nobody is here yet. A client moves here when their coaching ends.</p>}
        {past.length > 0 && <div className="cc-past-switch"><SwitchRow label={CHECK_INS_SWITCH} checked={on} onChange={flip} /></div>}
        {due.length > 0 && (
          <Part title={PAST_WORDS.due}>
            <div className="cc-rows">
              {due.map((d) => <Row key={d.id} title={d.name} facts={[d.what, d.sub]} when={d.when} label={`${d.name}, ${d.what}, ${d.when}. Open the note`} onClick={() => setOpenId(d.id)} />)}
            </div>
          </Part>
        )}
        {past.length > 0 && (
          <Part title={PAST_WORDS.everyone}>
            <div className="cc-search-field"><SearchField label="Search past clients" placeholder="Search past clients" value={q} onChange={setQ} /></div>
            {shown.length === 0 && <p className="cc-quiet">Nobody matches.</p>}
            <div className="cc-rows">
              {shown.map((p) => (
                <Line key={p.id} title={<button type="button" className="cc-table-name" onClick={() => navigate(`/coach/clients/${p.id}`)}>{p.name}</button>} small={[orgName(p.organisation_id) || 'Self-funded', p.ended_on ? `Ended ${dayWords(p.ended_on, todayKey)}` : null].filter(Boolean).join(', ')}>
                  <TextLink aria-label={`Start a new engagement with ${p.name}`} onClick={() => restart(p)}>Start a new engagement</TextLink>
                </Line>
              ))}
            </div>
          </Part>
        )}
      </div>
      <CheckInPanel checkInId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
