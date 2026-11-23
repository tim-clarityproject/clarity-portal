import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Dropdown, InlineChoice, PageHeader, SlidePanel, Stat, StatGroup, TextField, useToast } from '../../components/design';
import { newId, removeRow, rowsOf, saveRow } from '../../lib/coach/store';
import { clean, firstName, isEmail, possessive, sessionsLeft } from '../../lib/coach/model';
import { lengthPlace, nextSession, whenWords, withSessions } from '../../lib/coach/day';
import { Back, Line, TextLink, useCoachPortal, Part } from './parts';
import { AddSessionPanel, SessionRows } from './sessionParts';
import { currentEngagement } from './clientData';
import { draftFrom, EngagementPanel } from './ClientPage';

// A group (M11): its members, each with what they count against (their own
// engagement or the group's), the next group session, sessions left, and
// its sessions, each written up once with one recap to everyone.
const COUNTS = [{ value: 'group', label: 'The group’s engagement' }, { value: 'own', label: 'Their own engagement' }];
const NONE = '__none__';

export default function GroupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, state, groups, clients, organisations, sessions: allSessions, sessionPeople, sessionsOlder, todayKey, now } = useCoachPortal();
  const group = groups.find((g) => g.id === id) || null;
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ profile: NONE, name: '', email: '', counts: 'group' });
  const [problem, setProblem] = useState(null);
  const [engDraft, setEngDraft] = useState(null);
  const [addingSession, setAddingSession] = useState(false);
  useEffect(() => { if (adding) { setF({ profile: NONE, name: '', email: '', counts: 'group' }); setProblem(null); } }, [adding]);
  if (!group) {
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients?tab=groups')} /><PageHeader title="Group" /><p className="cc-quiet">This group isn’t here any more.</p></div></div>;
  }
  const members = rowsOf(state, 'coach_group_members').filter((m) => m.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name));
  const engagement = currentEngagement(rowsOf(state, 'engagements'), { groupId: group.id });
  // Sessions left follows each recorded session (day.js's withSessions).
  const sessions = sessionsLeft(withSessions(engagement, allSessions, sessionPeople, sessionsOlder), rowsOf(state, 'engagement_packs'));
  const mySessions = allSessions.filter((x) => x.group_id === group.id);
  const next = nextSession(mySessions, () => true, now);
  const org = organisations.find((o) => o.id === group.organisation_id);
  const done = async (work, message, onUndo) => {
    try { const status = await work(); toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true }); return true; } catch (error) { toast.error(error?.message || 'That didn’t save. Check your connection and try again.'); return false; }
  };
  const free = clients.filter((p) => p.status !== 'past' && !members.some((m) => m.profile_id === p.id));
  const add = async () => {
    const client = clients.find((p) => p.id === f.profile);
    const name = client ? client.name : clean(f.name);
    const email = client ? client.email : clean(f.email).toLowerCase() || null;
    if (!name) { setProblem('Choose a client or type their name to carry on.'); return; }
    if (!client && email && !isEmail(email)) { setProblem('That email doesn’t look right. Check it and try again.'); return; }
    if (members.some((m) => (client && m.profile_id === client.id) || (email && m.email === email))) { setProblem('They’re already in this group.'); return; }
    const row = { id: newId(), group_id: group.id, profile_id: client ? client.id : null, name: name.slice(0, 120), email, counts_against: client ? f.counts : 'group' };
    if (await done(() => saveRow(userId, 'coach_group_members', row), 'Member added', () => removeRow(userId, 'coach_group_members', row.id))) setAdding(false);
  };
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate('/coach/clients?tab=groups')} />
        <PageHeader title={group.name} meta={[org?.name, `${members.length} ${members.length === 1 ? 'person' : 'people'}`]} />
        <Part title="Next group session">
          {next ? (
            <div className="cc-ses-next">
              <span><b>{whenWords(next.starts_at, todayKey)}</b><small>{lengthPlace(next)}</small></span>
              <TextLink aria-label="Open the next group session" onClick={() => navigate(`/coach/sessions/${next.id}`)}>Open</TextLink>
            </div>
          ) : (
            <p className="cc-quiet cc-ses-none"><span>No session is booked.</span><TextLink onClick={() => navigate('/coach/calendar/book', { state: { groupId: group.id } })}>Book a call</TextLink><TextLink onClick={() => setAddingSession(true)}>Add session</TextLink></p>
          )}
        </Part>
        {sessions && <StatGroup className="cc-stats"><Stat label="Group sessions left" value={`${sessions.left} of ${sessions.total}`} bar={sessions.total ? sessions.left / sessions.total : 0} /></StatGroup>}
        <div className="cc-acts">
          <TextLink onClick={() => setEngDraft(draftFrom(engagement))}>{engagement ? 'Edit the group’s engagement' : 'Add the group’s engagement'}</TextLink>
        </div>
        <Part title="Members">
          {members.length === 0 && <p className="cc-quiet">Nobody is in this group yet.</p>}
          {members.map((m) => {
            const own = m.counts_against === 'own';
            const first = firstName(m.name);
            return (
              <Line
                key={m.id}
                title={m.profile_id ? <button type="button" className="cc-table-name" onClick={() => navigate(`/coach/clients/${m.profile_id}`)}>{m.name}</button> : m.name}
                small={own ? `Counts against ${possessive(first)} own engagement` : 'Counts against the group’s engagement'}
              >
                <span className="cc-line-actions">
                  {m.profile_id && <TextLink aria-label={`Count ${m.name} against ${own ? 'the group’s engagement' : 'their own engagement'}`} onClick={() => done(() => saveRow(userId, 'coach_group_members', { ...m, counts_against: own ? 'group' : 'own' }), 'Saved', () => saveRow(userId, 'coach_group_members', m))}>{own ? 'Use the group’s' : 'Use their own'}</TextLink>}
                  <TextLink aria-label={`Remove ${m.name} from the group`} onClick={() => done(() => removeRow(userId, 'coach_group_members', m.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'coach_group_members', m))}>Remove</TextLink>
                </span>
              </Line>
            );
          })}
          <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add member</AddButton></div>
        </Part>
        <Part title="Sessions and recaps">
          <div className="cc-add"><AddButton onClick={() => setAddingSession(true)}>Add session</AddButton></div>
          <SessionRows sessions={mySessions} people={members.length} label="Group sessions" />
        </Part>
        <div className="cc-acts">
          <TextLink onClick={() => done(async () => { for (const m of members) await removeRow(userId, 'coach_group_members', m.id); await removeRow(userId, 'coach_groups', group.id); return 'saved'; }, 'Deleted', async () => { await saveRow(userId, 'coach_groups', group); for (const m of members) await saveRow(userId, 'coach_group_members', m); }).then((ok) => { if (ok) navigate('/coach/clients?tab=groups'); })}>Delete this group</TextLink>
        </div>
      </div>
      <SlidePanel draftKey={`group-member:${id}`} open={adding} onClose={() => setAdding(false)} title="Add member" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add member</Button></div>}>
        <div className="cc-field"><Dropdown label="One of your clients" options={[{ value: NONE, label: 'Someone who isn’t a client' }, ...free.map((p) => ({ value: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label))]} value={f.profile} onChange={(v) => { setF({ ...f, profile: v }); setProblem(null); }} /></div>
        {f.profile === NONE ? (
          <>
            <div className="cc-field"><TextField label="Name" value={f.name} maxLength={120} autoComplete="off" onChange={(e) => { setF({ ...f, name: e.target.value }); setProblem(null); }} /></div>
            <div className="cc-field"><TextField label="Email" type="email" value={f.email} autoComplete="off" onChange={(e) => { setF({ ...f, email: e.target.value }); setProblem(null); }} /></div>
          </>
        ) : <div className="cc-field"><InlineChoice label="A group session counts against" options={COUNTS} value={f.counts} onChange={(v) => setF({ ...f, counts: v })} /></div>}
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
      </SlidePanel>
      <EngagementPanel draft={engDraft} setDraft={setEngDraft} group={group} />
      <AddSessionPanel open={addingSession} onClose={() => setAddingSession(false)} group={group} engagement={engagement} />
    </div>
  );
}
