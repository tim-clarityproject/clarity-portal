import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Chip, ChipRow, PageHeader, SlidePanel, Stat, StatGroup, SwitchRow, TextField, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { coachReadyNow, newId, removeRow, rowsOf, saveRow } from '../../lib/coach/store';
import { NEEDS_049 } from '../../lib/coach/actions';
import { addDays, clean, dayWords, ENGAGEMENT_KINDS, firstName, isEmail, possessive, sessionsLeft } from '../../lib/coach/model';
import { Back, Eye, Line, Row, SettingRow, TextLink, useCoachPortal } from './parts';
import { currentEngagement } from './clientData';

// An organisation (M11, with version 3.6's account map), the owner's: Who's
// who (contacts with their roles, the people coached there, its groups),
// the engagements running there, Room to grow, seats, and documents with an
// optional expiry.
const ROLES = [{ value: 'sponsor', label: 'Sponsor' }, { value: 'invoices', label: 'Invoices contact' }];
const roleWords = (roles) => ROLES.filter((r) => (roles || []).includes(r.value)).map((r) => r.label).join(', ');

export default function OrganisationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, coach, state, organisations, clients, groups, workshops, admin, todayKey } = useCoachPortal();
  const org = organisations.find((o) => o.id === id) || null;
  const [contact, setContact] = useState(null);
  const [doc, setDoc] = useState(null);
  const [problem, setProblem] = useState(null);
  const fileRef = useRef(null);
  if (!org) {
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients')} /><PageHeader title="Organisation" /><p className="cc-quiet">This organisation isn’t here any more.</p></div></div>;
  }
  const done = async (work, message = 'Saved', onUndo) => {
    try { const status = await work(); toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true }); return true; } catch (error) { toast.error(error?.message || 'That didn’t save. Check your connection and try again.'); return false; }
  };
  const save = (change) => done(() => saveRow(userId, 'organisations', { ...org, ...change }), 'Saved', () => saveRow(userId, 'organisations', org));
  const contacts = rowsOf(state, 'organisation_contacts').filter((c) => c.organisation_id === org.id).sort((a, b) => a.name.localeCompare(b.name));
  const docs = rowsOf(state, 'organisation_documents').filter((d) => d.organisation_id === org.id).sort((a, b) => a.name.localeCompare(b.name));
  const mine = clients.filter((p) => p.organisation_id === org.id && p.status !== 'past');
  const theirs = admin.filter((a) => a.organisation_id === org.id && a.coach_id !== coach.id && a.status !== 'past');
  const here = groups.filter((g) => g.organisation_id === org.id);
  const engagements = rowsOf(state, 'engagements');
  const packs = rowsOf(state, 'engagement_packs');
  const people = mine.length + theirs.length;
  const seats = Number(org.seat_count) || 0;
  const withAccount = mine.filter((p) => p.user_id).length;

  // Room to grow: worked out from what is here, one calm line each.
  const grow = [];
  if (seats > withAccount) grow.push({ key: 'seats', title: `${seats - withAccount} of ${seats} seats are free.`, small: 'People coached here could use them for their own sprints.' });
  const soon = addDays(todayKey, 60);
  for (const p of mine) {
    const e = currentEngagement(engagements, { profileId: p.id });
    const s = sessionsLeft(e, packs);
    if (e?.ends_on && e.ends_on <= soon) grow.push({ key: `end-${p.id}`, title: `${possessive(firstName(p.name))} coaching ends on ${dayWords(e.ends_on, todayKey)}.`, small: 'A renewal could be planned now.', to: `/coach/clients/${p.id}` });
    else if (s && s.total > 0 && s.left <= 2) grow.push({ key: `left-${p.id}`, title: `${firstName(p.name)} has ${s.left} of ${s.total} sessions to go.`, small: 'A renewal could be planned now.', to: `/coach/clients/${p.id}` });
  }
  for (const a of theirs) {
    if (a.ends_on && a.ends_on <= soon) grow.push({ key: `end-${a.profile_id}`, title: `${possessive(firstName(a.name))} coaching ends on ${dayWords(a.ends_on, todayKey)}.`, small: `${a.coach_first_name} is their coach.` });
  }
  const ahead = workshops.filter((w) => w.organisation_id === org.id && w.starts_at && w.starts_at.slice(0, 10) >= todayKey);
  if (!ahead.length) grow.push({ key: 'workshop', title: 'No workshop is booked here.', small: 'A team workshop is one way to grow the work.' });

  const saveContact = async () => {
    const name = clean(contact.name);
    const email = clean(contact.email).toLowerCase();
    if (!name) { setProblem('Type their name to carry on.'); return; }
    if (email && !isEmail(email)) { setProblem('That email doesn’t look right. Check it and try again.'); return; }
    const before = contacts.find((c) => c.id === contact.id) || null;
    const row = { ...(before || {}), id: contact.id, organisation_id: org.id, name: name.slice(0, 120), email: email || null, job_title: clean(contact.job_title).slice(0, 120) || null, roles: contact.roles, note: clean(contact.note).slice(0, 240) || null, created_by: before?.created_by || userId };
    if (await done(() => saveRow(userId, 'organisation_contacts', row), before ? 'Saved' : 'Added', () => (before ? saveRow(userId, 'organisation_contacts', before) : removeRow(userId, 'organisation_contacts', row.id)))) setContact(null);
  };
  const saveDoc = async () => {
    const name = clean(doc.name);
    if (!name) { setProblem('Type the document’s name to carry on.'); return; }
    let path = null;
    if (doc.file) {
      if (coachReadyNow() !== true) { setProblem(NEEDS_049); return; }
      path = `${userId}/organisations/${org.id}/${doc.id}-${doc.file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}`;
      const { error } = await supabase.storage.from('coach-files').upload(path, doc.file, { upsert: false });
      if (error) { setProblem('That file didn’t upload. Check your connection and try again.'); return; }
    }
    const row = { id: doc.id, organisation_id: org.id, name: name.slice(0, 200), storage_path: path, expires_on: doc.expires || null, created_by: userId };
    if (await done(() => saveRow(userId, 'organisation_documents', row), 'Document added', () => removeRow(userId, 'organisation_documents', row.id))) setDoc(null);
  };
  const openDoc = async (d) => {
    const { data, error } = await supabase.storage.from('coach-files').createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error('That file didn’t open. Check your connection and try again.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageHeader title={org.name} meta={['Organisation', org.city]} />
        <StatGroup className="cc-stats">
          <Stat label="People coached here" value={String(people)} />
          {seats > 0 && <Stat label="Seats in use" value={`${withAccount} of ${seats}`} bar={seats ? withAccount / seats : 0} />}
        </StatGroup>

        <section className="cc-section">
          <div className="ds-section-head"><h2 className="ds-section-title">Who’s who</h2></div>
          {contacts.map((c) => (
            <Row key={c.id} title={c.name} facts={[roleWords(c.roles), c.job_title, c.note]} when="" onClick={() => { setProblem(null); setContact({ id: c.id, name: c.name, email: c.email || '', job_title: c.job_title || '', roles: c.roles || [], note: c.note || '' }); }} label={`Edit ${c.name}`} />
          ))}
          {mine.map((p) => <Row key={p.id} title={p.name} facts={['Client', p.job_title]} when="" onClick={() => navigate(`/coach/clients/${p.id}`)} />)}
          {theirs.map((a) => <Row key={a.profile_id} title={a.name} facts={[`${a.coach_first_name}’s client`]} when="" />)}
          {here.map((g) => {
            const n = rowsOf(state, 'coach_group_members').filter((m) => m.group_id === g.id).length;
            return <Row key={g.id} title={g.name} facts={[`Group of ${n}`]} when="" onClick={() => navigate(`/coach/groups/${g.id}`)} />;
          })}
          <div className="cc-add"><AddButton onClick={() => { setProblem(null); setContact({ id: newId(), name: '', email: '', job_title: '', roles: [], note: '' }); }}>Add someone</AddButton></div>
        </section>

        <section className="cc-section">
          <div className="ds-section-head"><h2 className="ds-section-title">Engagements</h2></div>
          {mine.map((p) => {
            const e = currentEngagement(engagements, { profileId: p.id });
            if (!e) return null;
            const s = sessionsLeft(e, packs);
            return <Row key={p.id} title={`${e.name || ENGAGEMENT_KINDS.find((k) => k.value === e.kind)?.label} for ${firstName(p.name)}`} facts={['Active', s ? `${s.left} of ${s.total} sessions to go` : null]} when={e.ends_on ? `Ends ${dayWords(e.ends_on, todayKey)}` : ''} onClick={() => navigate(`/coach/clients/${p.id}`)} />;
          })}
          {theirs.filter((a) => a.engagement_kind).map((a) => (
            <Row key={a.profile_id} title={`${ENGAGEMENT_KINDS.find((k) => k.value === a.engagement_kind)?.label} for ${firstName(a.name)}`} facts={[`${a.coach_first_name}’s client`, a.sessions_total ? `${Math.max(0, a.sessions_total - a.sessions_held)} of ${a.sessions_total} sessions to go` : null]} when={a.ends_on ? `Ends ${dayWords(a.ends_on, todayKey)}` : ''} />
          ))}
          {!mine.some((p) => currentEngagement(engagements, { profileId: p.id })) && !theirs.some((a) => a.engagement_kind) && <p className="cc-quiet">No engagement is running here. Agreements and proposals arrive with the Business space.</p>}
        </section>

        {grow.length > 0 && (
          <section className="cc-section">
            <div className="ds-section-head"><h2 className="ds-section-title">Room to grow</h2></div>
            {grow.slice(0, 5).map((g) => (
              <Line key={g.key} title={g.title} small={g.small}>
                {g.to ? <TextLink aria-label={`Open the page for: ${g.title}`} onClick={() => navigate(g.to)}>Open their page</TextLink> : <span />}
              </Line>
            ))}
          </section>
        )}

        <section className="cc-section">
          <div className="ds-section-head"><h2 className="ds-section-title">Seats</h2></div>
          <SettingRow
            label="Seats"
            value={String(seats)}
            editor={({ value, setValue, label }) => <TextField label={label} inputMode="numeric" value={value ?? ''} onChange={(e) => setValue(e.target.value)} autoFocus />}
            check={(v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100000 ? null : 'Type a whole number of seats.')}
            onSave={(v) => save({ seat_count: Number(v) })}
          />
          <SettingRow
            label="City"
            value={org.city || ''}
            words={org.city || 'Not added yet'}
            editor={({ value, setValue, label }) => <TextField label={label} value={value ?? ''} maxLength={80} onChange={(e) => setValue(e.target.value)} autoFocus />}
            onSave={(v) => save({ city: clean(v) || null })}
          />
          <SwitchRow label="Organisation area" note={`Seats unlock the team tools for ${org.name}.`} checked={org.area_enabled === true} onChange={(on) => save({ area_enabled: on })} />
          <p className="cc-note">Access codes stay as they were set up. Prices and invoices arrive with the Business space.</p>
        </section>

        <section className="cc-section">
          <div className="ds-section-head"><h2 className="ds-section-title">Documents <Eye sentence="Only you can see these." /></h2></div>
          {docs.length === 0 && <p className="cc-quiet">No documents yet. A services agreement or a non-disclosure agreement would sit here.</p>}
          {docs.map((d) => (
            <Line key={d.id} title={d.name} small={d.expires_on ? `${d.expires_on < todayKey ? 'Expired' : 'Expires'} on ${dayWords(d.expires_on, todayKey)}.` : 'No expiry date.'}>
              <span className="cc-line-actions">
                {d.storage_path && <TextLink aria-label={`Open ${d.name}`} onClick={() => openDoc(d)}>Open</TextLink>}
                <TextLink aria-label={`Delete ${d.name}`} onClick={() => done(() => removeRow(userId, 'organisation_documents', d.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'organisation_documents', d))}>Delete</TextLink>
              </span>
            </Line>
          ))}
          <div className="cc-add"><AddButton onClick={() => { setProblem(null); setDoc({ id: newId(), name: '', expires: '', file: null }); }}>Add document</AddButton></div>
        </section>
      </div>

      <SlidePanel
        open={Boolean(contact)}
        onClose={() => setContact(null)}
        title={contact && contacts.some((c) => c.id === contact.id) ? 'Edit details' : 'Add someone'}
        footer={contact ? (
          <div className="cc-panel-foot">
            {contacts.some((c) => c.id === contact.id) ? <TextLink onClick={() => { const before = contacts.find((c) => c.id === contact.id); done(() => removeRow(userId, 'organisation_contacts', contact.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'organisation_contacts', before)).then(() => setContact(null)); }}>Delete</TextLink> : <span />}
            <Button variant="primary" onClick={saveContact}>{contacts.some((c) => c.id === contact.id) ? 'Save my edit' : 'Add this person'}</Button>
          </div>
        ) : null}
      >
        {contact && (
          <>
            <div className="cc-field"><TextField label="Name" value={contact.name} maxLength={120} autoComplete="off" onChange={(e) => { setContact({ ...contact, name: e.target.value }); setProblem(null); }} /></div>
            <div className="cc-field"><TextField label="Email" type="email" value={contact.email} autoComplete="off" onChange={(e) => { setContact({ ...contact, email: e.target.value }); setProblem(null); }} /></div>
            <div className="cc-field"><TextField label="Role there" value={contact.job_title} maxLength={120} placeholder="e.g. HR director" onChange={(e) => setContact({ ...contact, job_title: e.target.value })} /></div>
            <div className="cc-field"><span className="cc-field-label">For you, they are</span>
              <ChipRow label="For you, they are">{ROLES.map((r) => <Chip key={r.value} pressed={contact.roles.includes(r.value)} onClick={() => setContact({ ...contact, roles: contact.roles.includes(r.value) ? contact.roles.filter((x) => x !== r.value) : [...contact.roles, r.value] })}>{r.label}</Chip>)}</ChipRow>
            </div>
            <div className="cc-field"><TextField label="A note" value={contact.note} maxLength={240} placeholder="e.g. Decides on renewals" onChange={(e) => setContact({ ...contact, note: e.target.value })} /></div>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
          </>
        )}
      </SlidePanel>

      <SlidePanel open={Boolean(doc)} onClose={() => setDoc(null)} title="Add document" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={saveDoc}>Add document</Button></div>}>
        {doc && (
          <>
            <div className="cc-field"><TextField label="Name" value={doc.name} maxLength={200} placeholder="e.g. Non-disclosure agreement" onChange={(e) => { setDoc({ ...doc, name: e.target.value }); setProblem(null); }} /></div>
            <div className="cc-field"><TextField label="Expires, if it does" type="date" value={doc.expires} onChange={(e) => setDoc({ ...doc, expires: e.target.value })} /></div>
            <div className="cc-acts">
              <TextLink onClick={() => fileRef.current?.click()}>{doc.file ? `Chosen: ${doc.file.name}` : 'Choose the file'}</TextLink>
              <input ref={fileRef} className="cc-hidden-file" type="file" tabIndex={-1} aria-hidden="true" onChange={(e) => { setDoc({ ...doc, file: e.target.files?.[0] || null }); setProblem(null); e.target.value = ''; }} />
            </div>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
          </>
        )}
      </SlidePanel>
    </div>
  );
}
