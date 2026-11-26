import { useNavigate } from 'react-router-dom';
import { SearchField, SwitchRow, useToast } from '../../components/design';
import { Card, Empty, PageOpening } from '../../components/design/Blocks';
import { PEOPLE } from '../../content/pageLines/coach';
import { PersonRow } from './peopleParts';
import { useState } from 'react';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { clean, dayWords } from '../../lib/coach/model';
import { CHECK_INS_SWITCH, checkInsDue, checkInsOn, checkInsToSuggest, PAST_WORDS } from '../../lib/coach/crm';
import { Back, Line, TextLink, useCoachPortal } from './parts';
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
      <div className="cc-col cc-people">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageOpening title={PEOPLE.pastTitle} line={PEOPLE.pastLine} />
        {past.length === 0 && <Card label={PEOPLE.pastLabel}><Empty action={{ children: 'Your clients', href: '/coach/clients', onClick: (e) => { e.preventDefault(); navigate('/coach/clients'); } }}>A client moves here when their coaching ends.</Empty></Card>}
        {past.length > 0 && <div className="cc-past-switch"><SwitchRow label={CHECK_INS_SWITCH} checked={on} onChange={flip} /></div>}
        {due.length > 0 && (
          <Card label={PAST_WORDS.due}>
            <div className="ds-rows-list">
              {due.map((d) => <PersonRow key={d.id} name={d.name} facts={[d.what, d.sub]} when={d.when} label={`${d.name}, ${d.what}, ${d.when}. Open the note`} onClick={() => setOpenId(d.id)} />)}
            </div>
          </Card>
        )}
        {past.length > 0 && (
          <>
            <div className="cc-pbar-wrap"><div className="cc-pbar-search"><SearchField label="Search past clients" placeholder="Search past clients" value={q} onChange={setQ} /></div></div>
            <Card label={PAST_WORDS.everyone}>
              {shown.length === 0 && <Empty>Nobody matches. Clear the search to see everyone.</Empty>}
              <div className="ds-rows-list cc-past-rows">
                {shown.map((p) => (
                  <Line key={p.id} title={<a href={`/coach/clients/${p.id}`} className="cc-past-name" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(`/coach/clients/${p.id}`); }}>{p.name}</a>} small={[orgName(p.organisation_id) || 'Self-funded', p.ended_on ? `Ended ${dayWords(p.ended_on, todayKey)}` : null].filter(Boolean).join(', ')}>
                    <TextLink aria-label={`Start a new engagement with ${p.name}`} onClick={() => restart(p)}>Start a new engagement</TextLink>
                  </Line>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
      <CheckInPanel checkInId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
