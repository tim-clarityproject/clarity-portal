import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, PageHeader } from '../../components/design';
import { newId } from '../../lib/coach/store';
import { clean, fieldValue, fieldWords, firstName, isEmail, quickContacts } from '../../lib/coach/model';
import { mobileForLinks } from '../../lib/coach/network';
import { bookingLines, cameFromRow, coldRows, discoveryRows, isWonLead, LEAD_GONE, leadCard, leadOwnFields, leadTimeline, readiness, whereTitle } from '../../lib/coach/crm';
import { Back, Detail, EditCell, InlineLink, Part, TextLink, useCoachPortal } from './parts';
import { useLeadActions, useLeadData, useStartStages } from './leadParts';
import { ColdPanel, EditLeadPanel, EmailPanel, LeadNotePanel, LogCallPanel, WherePanel } from './LeadPanels';
import { TagsPanel } from './ClientPanels';
import { FieldPanel } from './Settings';
import './leads.css';

// A lead's own page (M11 seq 77: "A lead", "A lead with emails", "A lead:
// where they are"): who they are and how to reach them (Email and WhatsApp
// open the coach's own apps: nothing is ever sent from here), the next
// step, Log a call, Add note, Mark as won, then where the lead is from the
// discovery call notes (how ready they are, in words, never a score), one
// timeline (a booking, calls, proposals and their opens, notes, emails,
// stage moves), and the details with Referred by. Every rule and word is
// crm.js's.

export default function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const portal = useCoachPortal();
  const { isOwner, leads, leadEvents, leadFields, organisations, clients, emails, bookings, callTypes, todayKey } = portal;
  useStartStages();
  const { stages, open, values, tagNames, ctx } = useLeadData();
  const actions = useLeadActions();
  const [panel, setPanel] = useState(null); // 'edit' | 'call' | 'note' | 'where' | 'cold' | 'tags'
  const [mail, setMail] = useState(null);
  const [field, setField] = useState(null);

  const kept = leads.find((l) => l.id === id) || null;
  const lead = kept ? open.find((l) => l.id === id) || kept : null;
  const timeline = useMemo(() => {
    if (!lead) return [];
    const mine = leadEvents.filter((e) => e.lead_id === lead.id);
    const booking = lead.booking_id ? bookings.find((b) => b.id === lead.booking_id) || null : null;
    return leadTimeline([...mine, ...bookingLines(lead, { events: mine, booking, callName: callTypes.find((t) => t.key === lead.call_type_key)?.name || '' })], { emails, lead, todayKey, callNames: Object.fromEntries(callTypes.map((t) => [t.key, t.name])) });
  }, [lead, leadEvents, bookings, callTypes, emails, todayKey]);

  if (kept?.merged_into && leads.some((l) => l.id === kept.merged_into)) return <Navigate to={`/coach/leads/${kept.merged_into}`} replace />;
  if (!lead || lead.merged_into) {
    return (
      <div className="cc-page"><div className="cc-col">
        <Back to="Leads" onClick={() => navigate('/coach/leads')} />
        <PageHeader title="Lead" />
        <p className="cc-quiet">{LEAD_GONE}</p>
      </div></div>
    );
  }

  const first = firstName(lead.name) || 'This lead';
  const card = leadCard(lead, ctx);
  const won = isWonLead(lead, stages);
  const cold = Boolean(lead.cold_at);
  const org = isOwner && lead.organisation_id ? organisations.find((o) => o.id === lead.organisation_id) || null : null;
  const client = lead.won_profile_id ? clients.find((c) => c.id === lead.won_profile_id) || null : null;
  const contacts = quickContacts({ email: lead.email, mobile: mobileForLinks(lead.phone) });
  const coldRow = cold ? coldRows([lead], todayKey)[0] : null;
  const from = cameFromRow(lead);
  const ready = readiness(lead);
  const names = tagNames(lead);
  const saveText = (key, check, line) => (typed) => {
    const v = clean(typed);
    if (v && check && !check(v)) { actions.say(line); return false; }
    actions.saveLead(lead, { ...lead, [key]: (key === 'email' ? v.toLowerCase() : v) || null });
    return true;
  };

  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to={cold ? 'Cold leads' : 'Leads'} onClick={() => navigate(cold ? '/coach/leads/cold' : '/coach/leads')} />
        <PageHeader title={lead.name} meta={[org ? null : lead.organisation, lead.job_title, cold ? 'Cold' : card.stage]} />
        {org && <div className="cc-links"><TextLink onClick={() => navigate(`/coach/organisations/${org.id}`)}>{org.name}</TextLink></div>}
        {contacts.length > 0 && (
          <div className="cc-links">
            {contacts.map((c) => <a key={c.key} className="ds-link" href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel={c.key === 'whatsapp' ? 'noreferrer' : undefined}>{c.label}</a>)}
          </div>
        )}
        {coldRow && (
          <p className="cc-quiet cc-lead-line"><span>{coldRow.since}. {coldRow.happened} {coldRow.check}.</span><TextLink onClick={() => actions.warm(lead)}>Bring back</TextLink></p>
        )}
        {won && (
          <p className="cc-quiet cc-lead-line"><span>{first} is a client now{card.wonOn ? `, won on ${card.wonOn}` : ''}.</span>{client && <TextLink onClick={() => navigate(`/coach/clients/${client.id}`)}>Open the client’s page</TextLink>}</p>
        )}
        {!won && !cold && (
          <div className="cc-soft cc-lead-nextbox">
            <span className="cc-soft-label">Next step</span>
            <p>{card.next.step || 'None yet'}</p>
            {card.next.when && <small>{card.next.when}</small>}
            {card.quiet && <small>{card.quiet}</small>}
          </div>
        )}
        <div className="cc-lead-acts">
          <Button variant="primary" onClick={() => setPanel('call')}>Log a call</Button>
          <Button variant="outline" onClick={() => setPanel('note')}>Add note</Button>
          {!won && !cold && <TextLink onClick={() => actions.won(lead)}>Mark as won</TextLink>}
          {!won && <TextLink onClick={() => navigate('/coach/calendar/book', { state: { title: lead.name } })}>Booking link</TextLink>}
        </div>

        {!won && (
          <section className="ds-section cc-part">
            <div className="ds-section-head cc-lead-head"><h2 className="ds-section-title">{whereTitle(lead)}</h2><TextLink aria-label={`Edit where ${first} is`} onClick={() => setPanel('where')}>Edit</TextLink></div>
            <p className="cc-lead-sum">{ready.line}</p>
            {discoveryRows(lead).map((r) => (
              <div key={r.key} className="cc-lead-q"><span>{r.label}</span><span className={r.known ? undefined : 'cc-lead-q--no'}>{r.words}</span></div>
            ))}
          </section>
        )}

        <Part title="Timeline">
          {timeline.length === 0 && <p className="cc-quiet">Nothing is on {first}’s timeline yet. A call, a note or an email shows here.</p>}
          <div className="cc-lead-tl">
            {timeline.map((row) => {
              const email = row.emailId ? emails.find((e) => e.id === row.emailId) || null : null;
              const inner = <><span>{row.when}</span><div><b>{row.title}</b>{row.tag && <p>{row.tag}</p>}{row.lines.map((line) => <p key={line}>{line}</p>)}</div></>;
              return email
                ? <button key={row.id} type="button" className="cc-timeline-row cc-lead-mail" onClick={() => setMail(email)}>{inner}</button>
                : <div key={row.id} className="cc-timeline-row">{inner}</div>;
            })}
          </div>
        </Part>

        <Part title="Details">
          <Detail label="Email" edit><EditCell label="Email" value={lead.email || ''} onSave={saveText('email', (v) => isEmail(v.toLowerCase()), 'That email doesn’t look right. Check it and try again.')} /></Detail>
          <Detail label="Phone" edit><EditCell label="Phone" value={lead.phone || ''} onSave={saveText('phone')} /></Detail>
          <Detail label={from.label}>{from.personId && isOwner ? <InlineLink onClick={() => navigate(`/coach/network?person=${from.personId}`)}>{from.value}</InlineLink> : from.value}</Detail>
          <Detail label="Value" edit><EditCell label="Value" value={lead.value == null ? '' : String(lead.value)} words={card.valueWords} empty="Not set yet" onSave={(typed) => actions.value(lead, typed)} /></Detail>
          {leadOwnFields(leadFields).map((f) => {
            const v = fieldValue(f, values, lead.id);
            return <Detail key={f.id} label={f.name} edit><EditCell label={f.name} value={v} words={fieldWords(f, v, todayKey)} kind={f.kind} options={f.options || []} onSave={(typed) => actions.field(lead, f, typed, values)} /></Detail>;
          })}
          <Detail label="Tags" edit><button type="button" className={`cc-cell${names.length ? '' : ' cc-cell--empty'}`} aria-label={`Tags, ${names.join(', ') || 'none'}. Edit`} onClick={() => setPanel('tags')}>{names.join(', ') || 'Add'}</button></Detail>
          {lead.notes && <Detail label="Notes">{lead.notes}</Detail>}
          <div className="cc-add"><AddButton onClick={() => setField({ id: newId(), name: '', kind: 'text', optionsText: '' })}>Add field</AddButton></div>
          <div className="cc-acts">
            <TextLink onClick={() => setPanel('edit')}>Edit details</TextLink>
            {!won && !cold && <TextLink onClick={() => setPanel('cold')}>Mark as cold</TextLink>}
          </div>
        </Part>
      </div>
      <EditLeadPanel lead={panel === 'edit' ? lead : null} onClose={() => setPanel(null)} />
      <LogCallPanel lead={panel === 'call' ? lead : null} onClose={() => setPanel(null)} />
      <LeadNotePanel lead={panel === 'note' ? lead : null} onClose={() => setPanel(null)} />
      <WherePanel lead={panel === 'where' ? lead : null} onClose={() => setPanel(null)} />
      <ColdPanel lead={panel === 'cold' ? lead : null} onClose={() => setPanel(null)} />
      <TagsPanel kind="lead" profile={panel === 'tags' ? lead : null} onClose={() => setPanel(null)} />
      <EmailPanel email={mail} onClose={() => setMail(null)} />
      <FieldPanel draft={field} setDraft={setField} appliesTo="lead" />
    </div>
  );
}
