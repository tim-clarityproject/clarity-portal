import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Chip, ChipRow, Dropdown, PageHeader, SlidePanel, Stat, StatGroup, SwitchRow, TextField, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { coachCrmReadyNow, coachReadyNow, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { NEEDS_049 } from '../../lib/coach/actions';
import { accessCodeHash, codeGroups, makeAccessCode } from '../../lib/coach/accessCode';
import { addDays, clean, dayWords, ENGAGEMENT_KINDS, firstName, isEmail, possessive, sessionsLeft } from '../../lib/coach/model';
import { Back, Eye, Line, Row, SettingRow, TextLink, useCoachPortal, Part } from './parts';
import { currentEngagement } from './clientData';
import {
  ACCOUNT_WORDS, accountMap, CONTACT_ROLES, contactLast, DEAL_KINDS, DEAL_PER, DEAL_STATUSES, dealFromTyped, emailsOn, growthAction, growthLines, growthToLead,
} from '../../lib/coach/crm';
import { EmailRows } from './crmParts';
import { useStartStages } from './leadParts';
import './leads.css';
import './crm.css';
import './leftovers.css';

// An organisation (M11, with version 3.6's account map), the owner's: Who's
// who (contacts with their roles and when you last spoke or emailed, the
// people coached there, its groups), Agreements and proposals (each deal,
// its value and when it renews), Room to grow (each with the one thing to do
// next, which adds it to the pipeline), seats, and documents with an
// optional expiry. The map's rules and words are crm.js's (run 4).
// Sponsor and Invoices are 049's; Buyer, HR and Participant arrive with 052, so they are offered once it is there.
const ROLES_049 = ['sponsor', 'invoices'];
const rolesNow = () => CONTACT_ROLES.filter(([value]) => ROLES_049.includes(value) || coachCrmReadyNow() === true).map(([value, label]) => ({ value, label }));
const CODE_WORDS = {
  loading: '',
  none: 'No access code is set.',
  set: 'An access code is set.',
  unknown: 'The code can’t be checked right now.',
};

export default function OrganisationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, coach, state, organisations, clients, groups, workshops, admin, todayKey, orgDeals, orgGrowth, leadStages, emails, emailLinks } = useCoachPortal();
  useStartStages(); // Room to grow adds to the pipeline, which needs its stages
  const org = organisations.find((o) => o.id === id) || null;
  const [contact, setContact] = useState(null);
  const [doc, setDoc] = useState(null);
  const [deal, setDeal] = useState(null); // an agreement or proposal, as typed
  const [dealProblem, setDealProblem] = useState(null);
  const [problem, setProblem] = useState(null);
  const fileRef = useRef(null);
  // The access code (026's organisation_access_codes): only its hash is
  // kept, so the code shows once, when it is made, and never again.
  const [code, setCode] = useState({ state: 'loading' }); // 'loading' | 'none' | 'set' | 'unknown'
  const [codePanel, setCodePanel] = useState(null); // 'reset' | 'show'
  const [fresh, setFresh] = useState(null); // the new code, held only while its panel is open
  const [copied, setCopied] = useState(false);
  const [codeProblem, setCodeProblem] = useState(null);
  const making = useRef(false);
  const orgId = org?.id || null;
  const readCode = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase.from('organisation_access_codes').select('id').eq('organisation_id', orgId).is('switched_off_at', null).limit(1);
    setCode({ state: error ? 'unknown' : data?.length ? 'set' : 'none' });
  }, [orgId]);
  useEffect(() => { setCode({ state: 'loading' }); readCode(); }, [readCode]);
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
  if (seats > withAccount) grow.push({ key: 'seats', kind: 'seats', title: `${seats - withAccount} of ${seats} seats are free.`, small: 'People coached here could use them for their own sprints.' });
  const soon = addDays(todayKey, 60);
  for (const p of mine) {
    const e = currentEngagement(engagements, { profileId: p.id });
    const s = sessionsLeft(e, packs);
    if (e?.ends_on && e.ends_on <= soon) grow.push({ key: `end-${p.id}`, kind: 'renewal', title: `${possessive(firstName(p.name))} coaching ends on ${dayWords(e.ends_on, todayKey)}.`, small: 'A renewal could be planned now.', to: `/coach/clients/${p.id}` });
    else if (s && s.total > 0 && s.left <= 2) grow.push({ key: `left-${p.id}`, kind: 'renewal', title: `${firstName(p.name)} has ${s.left} of ${s.total} sessions to go.`, small: 'A renewal could be planned now.', to: `/coach/clients/${p.id}` });
  }
  for (const a of theirs) {
    if (a.ends_on && a.ends_on <= soon) grow.push({ key: `end-${a.profile_id}`, kind: 'renewal', title: `${possessive(firstName(a.name))} coaching ends on ${dayWords(a.ends_on, todayKey)}.`, small: `${a.coach_first_name} is their coach.` });
  }
  const ahead = workshops.filter((w) => w.organisation_id === org.id && w.starts_at && w.starts_at.slice(0, 10) >= todayKey);
  if (!ahead.length) grow.push({ key: 'workshop', kind: 'workshop', title: 'No workshop is booked here.', small: 'A team workshop is one way to grow the work.' });

  // The account map (run 4): Who's who, Agreements and proposals, and what was noted under Room to grow.
  const map = accountMap({ organisation: org, contacts, clients, adminClients: theirs, groups, deals: orgDeals, growth: orgGrowth, todayKey });
  const growRows = growthLines(map.growth, grow);
  const dealNames = new Set(map.deals.map((d) => d.name.toLowerCase()));
  /** Room to grow's one thing to do next: it goes into the pipeline as a lead, and the line then opens that lead. */
  const toPipeline = async (g) => {
    const noted = orgGrowth.find((r) => r.id === g.id) || null;
    const row = noted || { id: newId(), organisation_id: org.id, kind: g.kind, title: g.title, note: g.small || null, status: 'open', lead_id: null, created_by: userId };
    const made = growthToLead(row, org, { id: newId(), coachId: coach.id, stages: leadStages, contacts });
    if (made.error) { toast.show(made.error); return; }
    await done(() => saveRows(userId, [['coach_leads', made.lead], ['organisation_growth', made.growth]]), made.toast, async () => {
      if (noted) await saveRow(userId, 'organisation_growth', noted); else await removeRow(userId, 'organisation_growth', row.id);
      await removeRow(userId, 'coach_leads', made.lead.id);
    });
  };
  const openDeal = (d) => { const row = orgDeals.find((r) => r.id === d.id); if (!row) return; setDealProblem(null); setDeal({ id: row.id, name: row.name, kind: row.kind, status: row.status, value: row.value == null ? '' : String(row.value), per: row.per || 'once', renews: row.renews_on || '', detail: row.detail || '' }); };
  const saveDeal = async () => {
    const before = orgDeals.find((r) => r.id === deal.id) || null;
    const read = dealFromTyped(deal, { id: deal.id, organisationId: org.id, before, todayKey });
    if (read.error) { setDealProblem(read); return; }
    if (await done(() => saveRow(userId, 'organisation_deals', { ...read.deal, created_by: before?.created_by ?? userId }), before ? 'Saved' : 'Added', () => (before ? saveRow(userId, 'organisation_deals', before) : removeRow(userId, 'organisation_deals', read.deal.id)))) setDeal(null);
  };
  const dealAt = (key) => (dealProblem?.at === key ? <p className="cc-problem" role="alert">{dealProblem.error}</p> : null);

  // Make a code, or reset it: the new one is saved (its hash) before the old one is switched off.
  const makeCode = async (reset) => {
    if (making.current) return; // one request per press
    making.current = true;
    setCodeProblem(null);
    try {
      const next = makeAccessCode();
      const row = { id: newId(), organisation_id: org.id, code_hash: await accessCodeHash(next), seats, created_by: userId };
      const { error } = await supabase.from('organisation_access_codes').insert(row);
      if (error) {
        const words = 'The code wasn’t made. Check your connection and try again.';
        if (reset) setCodeProblem(words); else toast.error(words);
        return;
      }
      let oldStill = false;
      if (reset) {
        const { error: offError } = await supabase.from('organisation_access_codes').update({ switched_off_at: new Date().toISOString() }).eq('organisation_id', org.id).is('switched_off_at', null).neq('id', row.id);
        oldStill = Boolean(offError);
      }
      setCode({ state: 'set' });
      setCopied(false);
      setFresh({ code: next, oldStill });
      setCodePanel('show');
    } finally { making.current = false; }
  };
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(fresh.code); setCopied(true); } catch { toast.show('That didn’t copy. Select the code and copy it yourself.'); }
  };
  const closeCode = () => { setCodePanel(null); setFresh(null); setCopied(false); setCodeProblem(null); };

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
          {map.nextRenewal && <Stat label={ACCOUNT_WORDS.nextRenewal} value={map.nextRenewal} />}
        </StatGroup>

        <Part title="Who’s who">
          {map.whosWho.filter((w) => w.kind === 'contact').map((w) => {
            const c = contacts.find((x) => x.id === w.id);
            return <Row key={c.id} title={c.name} facts={[w.role, w.note]} when={contactLast(c, emails, emailLinks, todayKey)} onClick={() => { setProblem(null); setContact({ id: c.id, name: c.name, email: c.email || '', job_title: c.job_title || '', roles: c.roles || [], note: c.note || '' }); }} label={`Edit ${c.name}`} />;
          })}
          {mine.map((p) => <Row key={p.id} title={p.name} facts={['Client', p.job_title]} when="" onClick={() => navigate(`/coach/clients/${p.id}`)} />)}
          {theirs.map((a) => <Row key={a.profile_id} title={a.name} facts={[`${a.coach_first_name}’s client`]} when="" />)}
          {here.map((g) => {
            const n = rowsOf(state, 'coach_group_members').filter((m) => m.group_id === g.id).length;
            return <Row key={g.id} title={g.name} facts={[`Group of ${n}`]} when="" onClick={() => navigate(`/coach/groups/${g.id}`)} />;
          })}
          <div className="cc-add"><AddButton onClick={() => { setProblem(null); setContact({ id: newId(), name: '', email: '', job_title: '', roles: [], note: '' }); }}>Add someone</AddButton></div>
        </Part>

        <Part title="Agreements and proposals">
          {map.deals.map((d) => (
            <div key={d.id} className="cc-map-deal">
              <Row title={d.name} facts={[d.status, d.detail, d.opened]} when={<>{d.value && <b aria-label={d.valueSpoken}>{d.value}</b>}{d.renews && <span>{d.renews}</span>}</>} label={`Edit ${d.name}`} onClick={() => openDeal(d)} />
            </div>
          ))}
          {mine.map((p) => {
            const e = currentEngagement(engagements, { profileId: p.id });
            if (!e) return null;
            const s = sessionsLeft(e, packs);
            const title = `${e.name || ENGAGEMENT_KINDS.find((k) => k.value === e.kind)?.label} for ${firstName(p.name)}`;
            if (dealNames.has(title.toLowerCase())) return null; // its agreement is already listed above
            return <Row key={p.id} title={title} facts={['Active', s ? `${s.left} of ${s.total} sessions to go` : null]} when={e.ends_on ? `Ends ${dayWords(e.ends_on, todayKey)}` : ''} onClick={() => navigate(`/coach/clients/${p.id}`)} />;
          })}
          {theirs.filter((a) => a.engagement_kind).map((a) => (
            <Row key={a.profile_id} title={`${ENGAGEMENT_KINDS.find((k) => k.value === a.engagement_kind)?.label} for ${firstName(a.name)}`} facts={[`${a.coach_first_name}’s client`, a.sessions_total ? `${Math.max(0, a.sessions_total - a.sessions_held)} of ${a.sessions_total} sessions to go` : null]} when={a.ends_on ? `Ends ${dayWords(a.ends_on, todayKey)}` : ''} />
          ))}
          {map.deals.length === 0 && !mine.some((p) => currentEngagement(engagements, { profileId: p.id })) && !theirs.some((a) => a.engagement_kind) && <p className="cc-quiet">{ACCOUNT_WORDS.noDeals}</p>}
          <div className="cc-add"><AddButton onClick={() => { setDealProblem(null); setDeal({ id: newId(), name: '', kind: 'agreement', status: 'active', value: '', per: 'once', renews: '', detail: '' }); }}>{ACCOUNT_WORDS.addDeal}</AddButton></div>
        </Part>

        {growRows.length > 0 && (
          <Part title="Room to grow">
            {growRows.slice(0, 6).map((g) => (
              <Line key={g.id || g.key} title={g.title} small={g.note || g.small}>
                {g.leadId ? <TextLink aria-label={`Open the lead for: ${g.title}`} onClick={() => navigate(`/coach/leads/${g.leadId}`)}>Open the lead</TextLink>
                  : g.to ? <TextLink aria-label={`Open the page for: ${g.title}`} onClick={() => navigate(g.to)}>Open their page</TextLink>
                    : g.raised ? <span /> : <TextLink aria-label={`${g.action || growthAction(g.kind)}: ${g.title}`} onClick={() => toPipeline(g)}>{g.action || growthAction(g.kind)}</TextLink>}
              </Line>
            ))}
          </Part>
        )}

        <Part title="Seats">
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
          <Line title="Access code" small={CODE_WORDS[code.state]}>
            {code.state === 'none' && <TextLink onClick={() => (seats > 0 ? makeCode(false) : toast.show('Add the number of seats first, so the code knows how many people it lets in.'))}>Make an access code</TextLink>}
            {code.state === 'set' && <TextLink onClick={() => (seats > 0 ? setCodePanel('reset') : toast.show('Add the number of seats first, so the code knows how many people it lets in.'))}>Reset the code</TextLink>}
            {code.state === 'unknown' && <TextLink onClick={readCode}>Try again</TextLink>}
            {code.state === 'loading' && <span />}
          </Line>
          <p className="cc-note">Prices and invoices arrive with Finances.</p>
        </Part>

        <Part title="Documents" aside={<Eye sentence="Only you can see these." />}>
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
        </Part>
      </div>

      <SlidePanel draftKey={`org-contact:${id}:${contact && contacts.some((c) => c.id === contact.id) ? contact.id : 'new'}`}
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
              <ChipRow label="For you, they are">{rolesNow().map((r) => <Chip key={r.value} pressed={contact.roles.includes(r.value)} onClick={() => setContact({ ...contact, roles: contact.roles.includes(r.value) ? contact.roles.filter((x) => x !== r.value) : [...contact.roles, r.value] })}>{r.label}</Chip>)}</ChipRow>
            </div>
            <div className="cc-field"><TextField label="A note" value={contact.note} maxLength={240} placeholder="e.g. Decides on renewals" onChange={(e) => setContact({ ...contact, note: e.target.value })} /></div>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
            {/* Emails logged with this person (the copy-in address or Gmail): each opens. */}
            <EmailRows rows={emailsOn(emails, emailLinks, 'contact', contact.id, todayKey, contact)} />
          </>
        )}
      </SlidePanel>

      <SlidePanel draftKey={`org-deal:${id}:${deal && orgDeals.some((d) => d.id === deal.id) ? deal.id : 'new'}`}
        open={Boolean(deal)}
        onClose={() => setDeal(null)}
        title={deal && orgDeals.some((d) => d.id === deal.id) ? ACCOUNT_WORDS.editDeal : ACCOUNT_WORDS.addDeal}
        footer={deal ? (
          <div className="cc-panel-foot">
            {orgDeals.some((d) => d.id === deal.id) ? <TextLink onClick={() => { const before = orgDeals.find((d) => d.id === deal.id); done(() => removeRow(userId, 'organisation_deals', deal.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'organisation_deals', before)).then(() => setDeal(null)); }}>Delete</TextLink> : <span />}
            <Button variant="primary" onClick={saveDeal}>{orgDeals.some((d) => d.id === deal.id) ? 'Save my edit' : 'Add to this organisation'}</Button>
          </div>
        ) : null}
      >
        {deal && (
          <>
            <div className="cc-field"><TextField label="What is it called?" value={deal.name} maxLength={200} placeholder="e.g. Portal seats" autoComplete="off" onChange={(e) => { setDeal({ ...deal, name: e.target.value }); setDealProblem(null); }} />{dealAt('name')}</div>
            <div className="cc-field"><Dropdown label="What is it?" options={DEAL_KINDS} value={deal.kind} onChange={(v) => setDeal({ ...deal, kind: v, status: v === 'proposal' ? 'sent' : 'active' })} /></div>
            <div className="cc-field"><Dropdown label="Where is it up to?" options={DEAL_STATUSES} value={deal.status} onChange={(v) => setDeal({ ...deal, status: v })} /></div>
            <div className="cc-field"><TextField label="Value" value={deal.value} maxLength={20} placeholder="e.g. £13,500" autoComplete="off" onChange={(e) => { setDeal({ ...deal, value: e.target.value }); setDealProblem(null); }} />{dealAt('value')}</div>
            <div className="cc-field"><Dropdown label="How often?" options={DEAL_PER} value={deal.per} onChange={(v) => setDeal({ ...deal, per: v })} /></div>
            <div className="cc-field"><TextField label="Renews on, if it does" type="date" value={deal.renews} onChange={(e) => { setDeal({ ...deal, renews: e.target.value }); setDealProblem(null); }} />{dealAt('renews')}</div>
            <div className="cc-field"><TextField label="A detail" value={deal.detail} maxLength={200} placeholder="e.g. 20 seats" autoComplete="off" onChange={(e) => setDeal({ ...deal, detail: e.target.value })} /></div>
            {deal && orgDeals.find((d) => d.id === deal.id)?.lead_id && <div className="cc-acts"><TextLink onClick={() => navigate(`/coach/leads/${orgDeals.find((d) => d.id === deal.id).lead_id}`)}>Open the lead</TextLink></div>}
          </>
        )}
      </SlidePanel>

      <SlidePanel
        open={codePanel === 'reset'}
        onClose={closeCode}
        title="Reset the code"
        footer={<div className="cc-panel-foot"><TextLink onClick={closeCode}>Keep it</TextLink><Button variant="primary" onClick={() => makeCode(true)}>Reset the code</Button></div>}
      >
        <p className="cc-quiet">The code you gave out stops working as soon as you reset it, and a new one is shown once.</p>
        {codeProblem && <p className="cc-problem" role="alert">{codeProblem}</p>}
      </SlidePanel>

      <SlidePanel
        open={codePanel === 'show' && Boolean(fresh)}
        onClose={closeCode}
        title="Access code"
        footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={copyCode}>Copy</Button></div>}
      >
        {fresh && (
          <>
            <p className="cc-quiet">This is the only time the code is shown. Copy it now.</p>
            <p className="cc-code" aria-label={`Access code: ${codeGroups(fresh.code).join(' ')}`}>{fresh.code}</p>
            <p className="cc-code-copied" role="status">{copied ? 'Copied.' : ''}</p>
            {fresh.oldStill && <p className="cc-problem" role="alert">The old code still works, because switching it off didn’t save. Reset the code again in a moment.</p>}
          </>
        )}
      </SlidePanel>

      <SlidePanel draftKey={`org-doc:${id}`} open={Boolean(doc)} onClose={() => setDoc(null)} title="Add document" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={saveDoc}>Add document</Button></div>}>
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
