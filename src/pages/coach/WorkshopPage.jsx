import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Checkbox, InlineChoice, PageHeader, SlidePanel, Stat, StatGroup, SwitchRow, TextBox, TextField, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { coachReadyNow, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { NEEDS_049 } from '../../lib/coach/actions';
import { clean, parsePeople, workshopCounts, workshopIsPast } from '../../lib/coach/model';
import { Back, Line, SettingRow, TextLink, useCoachPortal, Part } from './parts';
import { workshopWhen } from './workshopWords';

// A workshop (M11): the page before and after the day. Registration with
// its public page, questions, capacity and a waiting list; reminders;
// attendance ticked on the day; materials; the follow-up; and a short
// survey the day after. Attendees are emails, not clients, pasted with the
// same parser as "Who's invited?". Nothing here sends by itself.

const KINDS = [{ value: 'short', label: 'Short answer' }, { value: 'long', label: 'Long answer' }];
const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';

export default function WorkshopPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { userId, state, workshops, organisations, settings } = useCoachPortal();
  const workshop = workshops.find((w) => w.id === id) || null;
  const [panel, setPanel] = useState(null);
  const [pasted, setPasted] = useState('');
  const [question, setQuestion] = useState(null);
  const [problem, setProblem] = useState(null);
  const [followUp, setFollowUp] = useState(null);
  const [all, setAll] = useState(false);
  const fileRef = useRef(null);
  if (!workshop) {
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients?tab=workshops')} /><PageHeader title="Workshop" /><p className="cc-quiet">This workshop isn’t here any more.</p></div></div>;
  }
  const attendees = rowsOf(state, 'workshop_attendees').filter((a) => a.workshop_id === workshop.id && a.status !== 'cancelled').sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const materials = rowsOf(state, 'workshop_materials').filter((m) => m.workshop_id === workshop.id);
  const answers = rowsOf(state, 'workshop_survey_answers').filter((s) => s.workshop_id === workshop.id);
  const counts = workshopCounts(attendees, workshop.capacity);
  const past = workshopIsPast(workshop);
  const org = organisations.find((o) => o.id === workshop.organisation_id);
  const registered = attendees.filter((a) => a.status === 'registered');
  const waiting = attendees.filter((a) => a.status === 'waiting');
  const done = async (work, message = 'Saved', onUndo) => {
    try { const status = await work(); toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true }); return true; } catch (error) { toast.error(error?.message || SAVE_PROBLEM); return false; }
  };
  const save = (change, message) => done(() => saveRow(userId, 'workshops', { ...workshop, ...change }), message, () => saveRow(userId, 'workshops', workshop));
  const pageAddress = `${window.location.origin}/workshop/${workshop.page_key}`;
  const copy = async (text, said) => { try { await navigator.clipboard.writeText(text); toast.show(said); } catch { toast.show('That didn’t copy. Select the address and copy it yourself.'); } };

  const preview = parsePeople(pasted);
  const have = new Set(attendees.map((a) => a.email));
  const fresh = preview.people.filter((p) => !have.has(p.email));
  const addAttendees = async () => {
    if (!fresh.length) { setProblem(preview.people.length ? 'Everyone in this list is already here.' : 'Paste names and emails to carry on.'); return; }
    let places = counts.left;
    const rows = fresh.slice(0, 2000).map((p) => {
      const status = places > 0 ? 'registered' : 'waiting';
      places -= 1;
      return { id: newId(), workshop_id: workshop.id, name: p.name || null, email: p.email, status, answers: {}, attended: false, source: 'pasted', survey_key: newId(), registered_at: new Date().toISOString() };
    });
    if (await done(() => saveRows(userId, rows.map((r) => ['workshop_attendees', r])), `${rows.length} ${rows.length === 1 ? 'person' : 'people'} added`, async () => { for (const r of rows) await removeRow(userId, 'workshop_attendees', r.id).catch(() => {}); })) { setPanel(null); setPasted(''); setProblem(null); }
  };
  const saveQuestion = async () => {
    if (!clean(question.q)) { setProblem('Type the question to carry on.'); return; }
    const list = workshop.questions || [];
    const row = { id: question.id, q: clean(question.q).slice(0, 200), kind: question.kind, needed: question.needed };
    const next = list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row];
    if (next.length > 12) { setProblem('A registration page takes up to 12 questions.'); return; }
    if (await save({ questions: next })) { setQuestion(null); setProblem(null); }
  };
  const addMaterial = async (file) => {
    if (!file) return;
    if (coachReadyNow() !== true) { toast.show(NEEDS_049); return; }
    const mid = newId();
    const path = `${userId}/workshops/${workshop.id}/${mid}-${file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}`;
    const { error } = await supabase.storage.from('coach-files').upload(path, file, { upsert: false });
    if (error) { toast.error('That file didn’t upload. Check your connection and try again.'); return; }
    await done(() => saveRow(userId, 'workshop_materials', { id: mid, workshop_id: workshop.id, name: file.name.slice(0, 200), storage_path: path, link: null }), 'File added', async () => { await removeRow(userId, 'workshop_materials', mid); await supabase.storage.from('coach-files').remove([path]); });
  };
  const openMaterial = async (m) => {
    if (m.link) { window.open(m.link, '_blank', 'noopener'); return; }
    const { data, error } = await supabase.storage.from('coach-files').createSignedUrl(m.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error('That file didn’t open. Check your connection and try again.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const ratings = answers.map((s) => Number(s.answers?.useful)).filter((n) => n >= 1 && n <= 5);
  const average = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
  const yes = answers.filter((s) => s.answers?.recommend === 'yes').length;
  const said = answers.map((s) => clean(s.answers?.differently)).filter(Boolean);
  const list = all ? registered : registered.slice(0, 8);

  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate('/coach/clients?tab=workshops')} />
        <PageHeader title={workshop.title} meta={[org?.name, workshopWhen(workshop, { readerZone: settings.time_zone }), workshop.place]} />
        <StatGroup className="cc-stats">
          {past
            ? <Stat label="Came" value={`${counts.came} of ${counts.registered}`} bar={counts.registered ? counts.came / counts.registered : 0} />
            : <Stat label="Registered" value={`${counts.registered} of ${workshop.capacity}`} bar={workshop.capacity ? counts.registered / workshop.capacity : 0} />}
          {!past && <Stat label="Waiting list" value={String(counts.waiting)} />}
          {past && workshop.survey_on && <Stat label="Survey answers" value={`${answers.length} of ${counts.came}`} />}
          {past && average && <Stat label="Average rating" value={`${average} of 5`} />}
        </StatGroup>

        {!past && (
          <Part title="Registration">
            <SwitchRow label="Registration page" note={workshop.registration_open ? 'Open: anyone with the link can register.' : 'Closed: the page says registration isn’t open.'} checked={workshop.registration_open === true} onChange={(on) => save({ registration_open: on }, on ? 'Registration is open' : 'Registration is closed')} />
            <div className="cc-acts">
              <TextLink onClick={() => copy(pageAddress, 'Link copied')}>Copy the page’s link</TextLink>
              <a className="ds-link" href={pageAddress} target="_blank" rel="noreferrer">Open the page</a>
            </div>
            <SettingRow
              label="Places"
              value={String(workshop.capacity)}
              editor={({ value, setValue, label }) => <TextField label={label} inputMode="numeric" value={value ?? ''} onChange={(e) => setValue(e.target.value)} autoFocus />}
              check={(v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 2000 ? null : 'Type the number of places, from 1 to 2000.')}
              onSave={(v) => save({ capacity: Number(v) })}
            />
            <SettingRow
              label="Closes"
              value={workshop.registration_closes_on || ''}
              words={workshop.registration_closes_on || 'On the day'}
              editor={({ value, setValue, label }) => <TextField label={label} type="date" value={value ?? ''} onChange={(e) => setValue(e.target.value)} autoFocus />}
              onSave={(v) => save({ registration_closes_on: v || null })}
            />
            <p className="cc-small-label">Questions</p>
            {(workshop.questions || []).map((x) => (
              <Line key={x.id} title={x.q} small={`${x.kind === 'long' ? 'Long answer' : 'Short answer'}${x.needed ? ', needed' : ''}`}>
                <TextLink aria-label={`Edit the question ${x.q}`} onClick={() => { setQuestion({ ...x }); setProblem(null); }}>Edit</TextLink>
              </Line>
            ))}
            <div className="cc-add"><AddButton onClick={() => { setQuestion({ id: newId(), q: '', kind: 'short', needed: false }); setProblem(null); }}>Add question</AddButton></div>
          </Part>
        )}

        {!past && (
          <Part title="Reminders">
            <SwitchRow label="Email the day before" checked={workshop.remind_day_before === true} onChange={(on) => save({ remind_day_before: on })} />
            <SwitchRow label="Email 1 hour before" checked={workshop.remind_hour_before === true} onChange={(on) => save({ remind_hour_before: on })} />
            <p className="cc-note">These keep your choice. Reminders start to send when booking emails arrive with the calendar.</p>
          </Part>
        )}

        <Part title={past ? 'Attendance' : 'Who’s coming'}>
          {registered.length === 0 && <p className="cc-quiet">Nobody is registered yet.</p>}
          {list.map((a) => (
            <div key={a.id} className="cc-tickrow">
              <Checkbox checked={a.attended === true} onChange={(on) => done(() => saveRow(userId, 'workshop_attendees', { ...a, attended: on }), 'Saved', () => saveRow(userId, 'workshop_attendees', a))}>
                <span className="cc-tickrow-words">{a.name || a.email}{a.name && <small>{a.email}</small>}</span>
              </Checkbox>
            </div>
          ))}
          {registered.length > 8 && !all && <div className="cc-acts"><TextLink aria-expanded="false" onClick={() => setAll(true)}>Show all {registered.length}</TextLink></div>}
          {waiting.length > 0 && <p className="cc-small-label">Waiting list</p>}
          {waiting.map((a) => (
            <Line key={a.id} title={a.name || a.email} small={a.name ? a.email : null}>
              <TextLink aria-label={`Give ${a.name || a.email} a place`} onClick={() => done(() => saveRow(userId, 'workshop_attendees', { ...a, status: 'registered' }), 'Saved', () => saveRow(userId, 'workshop_attendees', a))}>Give a place</TextLink>
            </Line>
          ))}
          <div className="cc-add"><AddButton onClick={() => { setPasted(''); setProblem(null); setPanel('attendees'); }}>Add attendees</AddButton></div>
          {!past && <p className="cc-note">Tick people in as they arrive on the day.</p>}
        </Part>

        {workshop.survey_on && past && answers.length > 0 && (
          <Part title="Survey">
            {average && <Line title="How useful was it?" small={`Average of ${ratings.length} ${ratings.length === 1 ? 'answer' : 'answers'}`}><span className="cc-line-state">{average} of 5</span></Line>}
            <Line title="Would you recommend it?" small={`${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`}><span className="cc-line-state cc-line-state--good">{yes} yes</span></Line>
            {said.length > 0 && <p className="cc-small-label">What will you do differently?</p>}
            {said.slice(0, 20).map((t, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="cc-soft"><p>“{t}”</p></div>
            ))}
          </Part>
        )}

        <Part title="Materials">
          {materials.length === 0 && <p className="cc-quiet">No materials yet.</p>}
          {materials.map((m) => (
            <Line key={m.id} title={m.name} small={m.link ? 'Link' : 'File'}>
              <span className="cc-line-actions">
                <TextLink aria-label={`Open ${m.name}`} onClick={() => openMaterial(m)}>Open</TextLink>
                <TextLink aria-label={`Delete ${m.name}`} onClick={() => done(() => removeRow(userId, 'workshop_materials', m.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'workshop_materials', m))}>Delete</TextLink>
              </span>
            </Line>
          ))}
          <div className="cc-add"><AddButton onClick={() => fileRef.current?.click()}>Add file</AddButton></div>
          <input ref={fileRef} className="cc-hidden-file" type="file" tabIndex={-1} aria-hidden="true" onChange={(e) => { addMaterial(e.target.files?.[0]); e.target.value = ''; }} />
        </Part>

        <Part title="Afterwards">
          <SwitchRow label="A short survey the day after" note="3 questions, by each person’s own link" checked={workshop.survey_on === true} onChange={(on) => save({ survey_on: on })} />
          {followUp == null ? (
            <>
              <div className="cc-soft"><span className="cc-soft-label">What each person gets</span><p>{workshop.follow_up || 'Nothing written yet.'}</p></div>
              <div className="cc-acts"><TextLink onClick={() => setFollowUp(workshop.follow_up || '')}>Edit the follow-up</TextLink></div>
            </>
          ) : (
            <form noValidate className="cc-field" onSubmit={(e) => { e.preventDefault(); save({ follow_up: followUp.trim().slice(0, 4000) || null }).then((ok) => { if (ok) setFollowUp(null); }); }}>
              <TextBox label="What each person gets" value={followUp} maxLength={4000} onChange={setFollowUp} />
              <div className="cc-acts"><Button variant="primary" type="submit">Save</Button><TextLink onClick={() => setFollowUp(null)}>Cancel</TextLink></div>
            </form>
          )}
          <p className="cc-note">Nothing is sent from here yet: the follow-up and the survey go out when workshop emails are switched on.</p>
        </Part>

        <div className="cc-acts">
          <TextLink onClick={() => done(async () => { await removeRow(userId, 'workshops', workshop.id); return 'saved'; }, 'Deleted', () => saveRows(userId, [['workshops', workshop], ...attendees.map((a) => ['workshop_attendees', a]), ...materials.map((m) => ['workshop_materials', m])])).then((ok) => { if (ok) navigate('/coach/clients?tab=workshops'); })}>Delete this workshop</TextLink>
        </div>
      </div>

      <SlidePanel open={panel === 'attendees'} onClose={() => setPanel(null)} title="Add attendees" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={addAttendees}>{fresh.length ? `Add ${fresh.length} ${fresh.length === 1 ? 'person' : 'people'}` : 'Add attendees'}</Button></div>}>
        <div className="cc-field">
          <label className="cc-field-label" htmlFor="cc-attendees">Who’s invited?</label>
          <textarea id="cc-attendees" className="cc-paste" rows={8} value={pasted} placeholder="Paste names and emails, e.g. Dan Reid <dan@example.com>" onChange={(e) => { setPasted(e.target.value); setProblem(null); }} />
        </div>
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        {pasted.trim() && (
          <p className="cc-quiet" aria-live="polite">
            {[`${fresh.length} to add.`, preview.people.length - fresh.length ? `${preview.people.length - fresh.length} already here.` : null, preview.duplicates ? `${preview.duplicates} twice in this list.` : null, preview.unread.length ? `${preview.unread.length} couldn’t be read.` : null, fresh.length > counts.left ? `${Math.max(0, fresh.length - counts.left)} will join the waiting list.` : null].filter(Boolean).join(' ')}
          </p>
        )}
      </SlidePanel>

      <SlidePanel
        open={Boolean(question)}
        onClose={() => setQuestion(null)}
        title={question && (workshop.questions || []).some((x) => x.id === question.id) ? 'Edit question' : 'Add question'}
        footer={question ? (
          <div className="cc-panel-foot">
            {(workshop.questions || []).some((x) => x.id === question.id) ? <TextLink onClick={() => save({ questions: workshop.questions.filter((x) => x.id !== question.id) }, 'Deleted').then(() => setQuestion(null))}>Delete</TextLink> : <span />}
            <Button variant="primary" onClick={saveQuestion}>Save</Button>
          </div>
        ) : null}
      >
        {question && (
          <>
            <div className="cc-field"><TextField label="Question" value={question.q} maxLength={200} onChange={(e) => { setQuestion({ ...question, q: e.target.value }); setProblem(null); }} /></div>
            <div className="cc-field"><InlineChoice label="Answer" options={KINDS} value={question.kind} onChange={(v) => setQuestion({ ...question, kind: v })} form="pills" /></div>
            <div className="cc-field"><SwitchRow label="Needed" note="People can’t register without answering it." checked={question.needed === true} onChange={(on) => setQuestion({ ...question, needed: on })} /></div>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
          </>
        )}
      </SlidePanel>
    </div>
  );
}
