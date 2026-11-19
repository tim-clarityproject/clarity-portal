import { useNavigate } from 'react-router-dom';
import { PageHeader, SearchField, useToast } from '../../components/design';
import { useState } from 'react';
import { saveRow } from '../../lib/coach/store';
import { clean, dayWords } from '../../lib/coach/model';
import { Back, Line, TextLink, useCoachPortal } from './parts';

// Past clients (M11): hidden from the main list but searchable, and one
// tap starts a new engagement. The 3, 6 and 12 month check-ins M11 draws
// here belong to Network and arrive with the CRM (run 4).
export default function PastClients() {
  const { userId, clients, organisations, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const past = clients.filter((p) => p.status === 'past').sort((a, b) => String(b.ended_on || '').localeCompare(String(a.ended_on || '')));
  const words = clean(q).toLowerCase().split(' ').filter(Boolean);
  const orgName = (id) => organisations.find((o) => o.id === id)?.name || '';
  const shown = past.filter((p) => words.every((w) => `${p.name} ${orgName(p.organisation_id)}`.toLowerCase().includes(w)));
  const restart = async (p) => {
    try {
      await saveRow(userId, 'client_profiles', { ...p, status: 'active', ended_on: null });
      toast.saved({ message: `${p.name} is back in your clients`, long: true, onUndo: () => saveRow(userId, 'client_profiles', p) });
      navigate(`/coach/clients/${p.id}`, { state: { open: 'engagement' } });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageHeader title="Past clients" />
        {past.length === 0 && <p className="cc-quiet">Nobody is here yet. A client moves here when their coaching ends.</p>}
        {past.length > 0 && <div className="cc-search-field"><SearchField label="Search past clients" placeholder="Search past clients" value={q} onChange={setQ} /></div>}
        {past.length > 0 && shown.length === 0 && <p className="cc-quiet">Nobody matches.</p>}
        <div className="cc-rows">
          {shown.map((p) => (
            <Line key={p.id} title={<button type="button" className="cc-table-name" onClick={() => navigate(`/coach/clients/${p.id}`)}>{p.name}</button>} small={[orgName(p.organisation_id) || 'Self-funded', p.ended_on ? `Ended ${dayWords(p.ended_on, todayKey)}` : null].filter(Boolean).join(', ')}>
              <TextLink aria-label={`Start a new engagement with ${p.name}`} onClick={() => restart(p)}>Start a new engagement</TextLink>
            </Line>
          ))}
        </div>
      </div>
    </div>
  );
}
