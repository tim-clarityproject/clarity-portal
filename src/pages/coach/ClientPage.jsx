import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AddButton, Button, Dropdown, InlineChoice, PageHeader, SearchField, SlidePanel, Stat, StatGroup, SwitchRow, TextBox, TextField, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { zonePlace } from '../../lib/time';
import { formatClockTime } from '../../lib/dateFormatter';
import { coachReadyNow, keyOf, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { deleteClient, inviteClient, inviteWords, moveClient, NEEDS_049 } from '../../lib/coach/actions';
import {
  birthdaysOn, birthdayWords, clean, clockWords, dayWords, ENGAGEMENT_KINDS, fieldFromTyped, fieldValue, fieldWords, firstName,
  gettingStarted, isEmail, minutesClocked, minutesWords, possessive, quickContacts, runningEntry, sessionsLeft, START_ZONES,
  timeCredit, timeline, TIMELINE_KINDS, viewAskState,
} from '../../lib/coach/model';
import { carriedTimeline, emailsOn, leadTimeline } from '../../lib/coach/crm';
import { EmailRows } from './crmParts';
import './leads.css';
import { engagementToSave, heldWords, lengthPlace, nextSession, openWords, sortTodos, whenWords, withHeldTyped, withSessions } from '../../lib/coach/day';
import { Back, Detail, EditCell, Eye, Fold, InlineLink, Line, TextLink, useCoachPortal, useEverySecond, Part } from './parts';
import { AddSessionPanel, SessionRows } from './sessionParts';
import { QuickAddPanel, TodoList, TodoPanel } from './todoParts';
import { currentEngagement } from './clientData';
import { TagsPanel } from './ClientPanels';
import { FieldPanel } from './Settings';
import NameNote from './NameNote';

// A client's page (M11: Sam, Leo, Marcus, Priya and Jordan). Overview is
// the Mission, the next session (run 3), sessions to go, then folding
// sections that remember what was left open. Everything is one timeline in
// date order. Sessions and recaps (each session opens After a call) and
// the coach's own to-dos for this client came with run 2.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const VIEWS = [{ value: 'over', label: 'Overview' }, { value: 'all', label: 'Everything' }];
const PIN = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5l5 5-2.2.7-2.6 2.6.3 3.2-1 1L5.5 10.5 1.5 14.5M5.5 10.5L2 7l1-1 3.2.3 2.6-2.6z" /></svg>;
const MAX_FILE = 50 * 1024 * 1024;
// The brief before a call (its own file): opened from the next session.
const BriefPanel = lazy(() => import('./Brief'));

function useDone() {
  const toast = useToast();
  return async (work, message = 'Saved', onUndo) => {
    try {
      const status = await work();
      toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true });
      return true;
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      return false;
    }
  };
}

// ---------------------------------------------------------------- the engagement panel
export function EngagementPanel({ draft, setDraft, profile = null, group = null }) {
  const { userId, coach, state, sessions: allSessions, sessionPeople } = useCoachPortal();
  const done = useDone();
  const [problem, setProblem] = useState(null);
  if (!draft) return <SlidePanel open={false} onClose={() => setDraft(null)} title="Engagement" />;
  const before = rowsOf(state, 'engagements').find((e) => e.id === draft.id) || null;
  const set = (change) => { setDraft({ ...draft, ...change }); setProblem(null); };
  const whole = (v, max) => (clean(v) === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : undefined);
  const save = async () => {
    const sessions = whole(draft.sessions, 1000);
    const every = whole(draft.every, 52);
    const minutes = whole(draft.minutes, 600);
    const creditHours = clean(draft.credit) === '' ? null : Number(draft.credit);
    if (sessions === undefined) { setProblem('Type the number of sessions as a whole number.'); return; }
    if (every === undefined || every === 0) { setProblem('Type how many weeks apart, from 1 to 52.'); return; }
    if (!minutes || minutes < 5) { setProblem('Type the usual length in minutes, 5 or more.'); return; }
    if (creditHours != null && !(creditHours >= 0 && creditHours <= 10000)) { setProblem('Type the time credit in hours.'); return; }
    if (draft.starts && draft.ends && draft.ends < draft.starts) { setProblem('The end comes after the start.'); return; }
    if (draft.kind === 'sessions' && sessions == null && creditHours == null) { setProblem('Type how many sessions, or a time credit, to carry on.'); return; }
    // The count is never edited here: it goes with its base, as it stands now (day.js's engagementToSave).
    const row = engagementToSave({
      id: draft.id, coach_id: coach.id, profile_id: profile ? profile.id : null, group_id: group ? group.id : null, kind: draft.kind, name: clean(draft.name).slice(0, 120) || null,
      sessions_total: sessions, sessions_held: before?.sessions_held || 0, ...(before?.sessions_held_base != null ? { sessions_held_base: before.sessions_held_base } : {}),
      default_minutes: minutes, every_weeks: every, starts_on: draft.starts || null, ends_on: draft.ends || null,
      time_credit_minutes: creditHours == null ? null : Math.round(creditHours * 60), funded_by: clean(draft.funded).slice(0, 120) || null, status: 'active',
    }, allSessions, sessionPeople);
    if (await done(() => saveRow(userId, 'engagements', row), before ? 'Saved' : 'Engagement added', () => (before ? saveRow(userId, 'engagements', engagementToSave(before, allSessions, sessionPeople)) : removeRow(userId, 'engagements', row.id)))) setDraft(null);
  };
  return (
    <SlidePanel open onClose={() => setDraft(null)} title={before ? 'Edit engagement' : 'Add engagement'} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>{before ? 'Save my edit' : 'Add engagement'}</Button></div>}>
      <div className="cc-field"><Dropdown label="Kind" options={ENGAGEMENT_KINDS} value={draft.kind} onChange={(v) => set({ kind: v })} /></div>
      <div className="cc-field"><TextField label="Name" value={draft.name} maxLength={120} placeholder="e.g. 6-month coaching" onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="cc-field cc-two">
        <TextField label="Sessions in total" inputMode="numeric" value={draft.sessions} onChange={(e) => set({ sessions: e.target.value })} />
        <TextField label="Usual length, minutes" inputMode="numeric" value={draft.minutes} onChange={(e) => set({ minutes: e.target.value })} />
      </div>
      <div className="cc-field cc-two">
        <TextField label="Every how many weeks" inputMode="numeric" value={draft.every} onChange={(e) => set({ every: e.target.value })} />
        <TextField label="Time credit, hours" inputMode="decimal" value={draft.credit} onChange={(e) => set({ credit: e.target.value })} />
      </div>
      <div className="cc-field cc-two">
        <TextField label="Starts" type="date" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} />
        <TextField label="Ends" type="date" value={draft.ends} min={draft.starts || undefined} onChange={(e) => set({ ends: e.target.value })} />
      </div>
      <div className="cc-field"><TextField label="Funded by" value={draft.funded} maxLength={120} placeholder="e.g. Their organisation" onChange={(e) => set({ funded: e.target.value })} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <p className="cc-note">Agreements, signatures and invoices come later. This is the record the portal counts sessions and time against.</p>
    </SlidePanel>
  );
}

export const draftFrom = (e) => (e
  ? { id: e.id, kind: e.kind, name: e.name || '', sessions: e.sessions_total == null ? '' : String(e.sessions_total), minutes: String(e.default_minutes || 60), every: e.every_weeks == null ? '' : String(e.every_weeks), credit: e.time_credit_minutes == null ? '' : String(e.time_credit_minutes / 60), starts: e.starts_on || '', ends: e.ends_on || '', funded: e.funded_by || '' }
  : { id: newId(), kind: 'sessions', name: '', sessions: '', minutes: '60', every: '2', credit: '', starts: '', ends: '', funded: '' });

// ---------------------------------------------------------------- About them
function AboutPanel({ open, onClose, profile, about }) {
  const { userId, coach } = useCoachPortal();
  const done = useDone();
  const [f, setF] = useState({});
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setF({ day: about?.birthday_day ? String(about.birthday_day) : '', month: about?.birthday_month ? String(about.birthday_month) : '', partner: about?.partner || '', children: about?.children || '', other: about?.other || '' }); setProblem(null); } }, [open, about]);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }));
  const save = async () => {
    const day = clean(f.day) === '' ? null : Number(f.day);
    const month = f.month ? Number(f.month) : null;
    if ((day == null) !== (month == null)) { setProblem('A birthday needs its day and its month.'); return; }
    if (day != null && (!Number.isInteger(day) || day < 1 || day > new Date(2024, month, 0).getDate())) { setProblem('That day isn’t in that month.'); return; }
    const row = { profile_id: profile.id, coach_id: coach.id, birthday_day: day, birthday_month: month, partner: clean(f.partner).slice(0, 120) || null, children: clean(f.children).slice(0, 240) || null, other: String(f.other || '').trim().slice(0, 2000) || null };
    if (await done(() => saveRow(userId, 'client_about', row), 'Saved', () => (about ? saveRow(userId, 'client_about', about) : removeRow(userId, 'client_about', keyOf('client_about', row))))) onClose();
  };
  const first = firstName(profile.name);
  return (
    <SlidePanel open={open} onClose={onClose} title={`About ${first}`} titleAside={<Eye sentence="Only you can see this." />} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
      <div className="cc-field cc-two">
        <TextField label="Birthday, day" inputMode="numeric" value={f.day || ''} onChange={(e) => { setF({ ...f, day: e.target.value }); setProblem(null); }} />
        <Dropdown label="Month" placeholder="Choose a month" options={months} value={f.month || null} onChange={(v) => { setF({ ...f, month: v }); setProblem(null); }} />
      </div>
      <div className="cc-field"><TextField label="Partner" value={f.partner || ''} maxLength={120} onChange={(e) => setF({ ...f, partner: e.target.value })} /></div>
      <div className="cc-field"><TextField label="Children" value={f.children || ''} maxLength={240} onChange={(e) => setF({ ...f, children: e.target.value })} /></div>
      <div className="cc-field"><TextBox label="Other" value={f.other || ''} maxLength={2000} onChange={(v) => setF({ ...f, other: v })} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- the page
export default function ClientPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const done = useDone();
  const portal = useCoachPortal();
  const { userId, coach, isOwner, coaches, state, clients, organisations, tags, fields, settings, todayKey, reloadCoaches, sessions: allSessions, sessionPeople, todos } = portal;
  const { leads, leadEvents, emails, emailLinks, callTypes = [] } = portal;
  const profile = clients.find((p) => p.id === id) || null;

  const foldsKey = deviceKey('cache', userId, 'coach-folds');
  const [folds, setFolds] = useState(() => readJson(foldsKey) || {});
  const toggle = (key) => setFolds((f) => { const next = { ...f, [key]: !f[key] }; writeJson(foldsKey, next); return next; });
  const [view, setView] = useState('over');
  const [panel, setPanel] = useState(null);
  const [engDraft, setEngDraft] = useState(null);
  const [field, setField] = useState(null);
  const [note, setNote] = useState('');
  const [noteProblem, setNoteProblem] = useState(null);
  const [typedName, setTypedName] = useState('');
  const [deleteProblem, setDeleteProblem] = useState(null);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const [shared, setShared] = useState(null);
  const [openTodo, setOpenTodo] = useState(null);
  const [briefId, setBriefId] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);
  const fileRef = useRef(null);
  const busy = useRef(false);
  // One tap from Past clients: back in the list, with a new engagement to fill in.
  const location = useLocation();
  useEffect(() => {
    if (location.state?.open !== 'engagement') return;
    setEngDraft(draftFrom(null));
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);

  const data = useMemo(() => {
    if (!profile) return null;
    const engagements = rowsOf(state, 'engagements').filter((e) => e.profile_id === profile.id);
    const engagement = currentEngagement(engagements, { profileId: profile.id });
    return {
      engagements, engagement,
      packs: rowsOf(state, 'engagement_packs'),
      projects: engagement ? rowsOf(state, 'engagement_projects').filter((p) => p.engagement_id === engagement.id).sort((a, b) => (a.position || 0) - (b.position || 0)) : [],
      entries: rowsOf(state, 'time_entries'),
      notes: rowsOf(state, 'client_notes').filter((n) => n.profile_id === profile.id && n.coach_id === coach.id).sort((a, b) => String(b.noted_on).localeCompare(String(a.noted_on)) || String(b.created_at).localeCompare(String(a.created_at))),
      files: rowsOf(state, 'client_files').filter((f) => f.profile_id === profile.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      about: rowsOf(state, 'client_about').find((a) => a.profile_id === profile.id && a.coach_id === coach.id) || null,
      links: rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === 'client' && l.item_id === profile.id),
      values: rowsOf(state, 'coach_field_values'),
      requests: rowsOf(state, 'client_view_requests').filter((r) => r.profile_id === profile.id),
    };
  }, [state, profile, coach.id]);

  // What the client shares (their Mission, their latest week score), through the checked function of 032.
  const linked = profile?.user_id || null;
  useEffect(() => {
    if (!linked) { setShared(null); return undefined; }
    let live = true;
    supabase.rpc('coach_client_list', { p_coach: null, p_search: null, p_organisation: null, p_limit: 200, p_offset: 0 }).then(({ data: rows }) => {
      if (live) setShared((rows || []).find((r) => r.client_id === linked) || null);
    });
    return () => { live = false; };
  }, [linked]);

  const running = runningEntry(rowsOf(state, 'time_entries').filter((e) => e.coach_id === coach.id));
  const now = useEverySecond(Boolean(running));

  if (!profile || !data) {
    return (
      <div className="cc-page"><div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageHeader title="Client" />
        <p className="cc-quiet">This client isn’t in your list any more.</p>
      </div></div>
    );
  }

  const first = firstName(profile.name);
  const { engagement, packs, entries, notes, files, about, links, values, projects, requests } = data;
  // Sessions left follows each recorded session (day.js's withSessions); the kept row itself is never saved from here to change the count.
  const mySessions = allSessions.filter((x) => x.profile_id === profile.id);
  const counted = withSessions(engagement, allSessions, sessionPeople);
  const sessions = sessionsLeft(counted, packs);
  const next = nextSession(mySessions, () => true, portal.now);
  const myTodos = sortTodos(todos.filter((t) => t.profile_id === profile.id && !t.done_at));
  // Saved for any reason but a typed count, the engagement carries the count as it stands now (never the one it was loaded with).
  const asKept = (e) => engagementToSave(e, allSessions, sessionPeople);
  const typeHeld = (total) => done(() => saveRow(userId, 'engagements', withHeldTyped(engagement, total, counted.sessions_recorded)), 'Saved', () => saveRow(userId, 'engagements', asKept(engagement)));
  const credit = timeCredit(engagement, packs, entries, now);
  const pinned = notes.filter((n) => n.pinned).slice(0, 3);
  const org = organisations.find((o) => o.id === profile.organisation_id) || null;
  const contacts = quickContacts(profile);
  const started = gettingStarted(profile, { engagement, sessionsHeld: counted?.sessions_held || 0 });
  const save = (change, message) => done(() => saveRow(userId, 'client_profiles', { ...profile, ...change }), message, () => saveRow(userId, 'client_profiles', profile));
  const birthday = birthdaysOn(about ? [about] : [], [profile], todayKey).length > 0;
  const tagNames = links.map((l) => tags.find((t) => t.id === l.tag_id)?.name).filter(Boolean);
  const zones = [...new Set(['Europe/London', ...(settings.time_zones || START_ZONES), ...(profile.time_zone ? [profile.time_zone] : [])])].map((z) => ({ value: z, label: zonePlace(z) })).sort((a, b) => a.label.localeCompare(b.label));

  // ---- notes
  const addNote = async (e) => {
    e.preventDefault();
    if (!clean(note)) { setNoteProblem('Type your note to carry on.'); return; }
    if (busy.current) return; // one note a press
    busy.current = true;
    const row = { id: newId(), profile_id: profile.id, coach_id: coach.id, body: note.trim().slice(0, 4000), noted_on: todayKey, pinned: false };
    try {
      if (await done(() => saveRow(userId, 'client_notes', row), 'Note added', () => removeRow(userId, 'client_notes', row.id))) { setNote(''); setNoteProblem(null); }
    } finally { busy.current = false; }
  };
  const pin = (n, on) => {
    if (on && pinned.length >= 3) { toast.show('Up to 3 notes can be pinned. Unpin one first.'); return; }
    done(() => saveRow(userId, 'client_notes', { ...n, pinned: on }), on ? 'Pinned to the top' : 'Unpinned', () => saveRow(userId, 'client_notes', n));
  };

  // ---- time credit
  const clock = async (projectId) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const at = new Date().toISOString();
      if (running && running.engagement_id === engagement.id && (running.project_id || null) === projectId) {
        const ended = { ...running, ended_at: at };
        await done(() => saveRow(userId, 'time_entries', ended), `Clocked out. ${minutesWords(minutesClocked([ended], {}))} added`, () => saveRow(userId, 'time_entries', running));
      } else {
        const pairs = [];
        if (running) pairs.push(['time_entries', { ...running, ended_at: at }]);
        const row = { id: newId(), engagement_id: engagement.id, project_id: projectId, coach_id: coach.id, started_at: at, ended_at: null };
        pairs.push(['time_entries', row]);
        await done(() => saveRows(userId, pairs), 'Clocked in', async () => { await removeRow(userId, 'time_entries', row.id); if (running) await saveRow(userId, 'time_entries', running); });
      }
    } finally { busy.current = false; }
  };
  const addProject = async (name) => {
    const row = { id: newId(), engagement_id: engagement.id, name: clean(name).slice(0, 120), position: projects.length };
    await done(() => saveRow(userId, 'engagement_projects', row), 'Project added', () => removeRow(userId, 'engagement_projects', row.id));
  };

  // ---- files, both ways
  const addFiles = async (list) => {
    const picked = [...(list || [])];
    if (!picked.length) return;
    if (coachReadyNow() !== true) { toast.show(NEEDS_049); return; }
    for (const file of picked) {
      if (file.size > MAX_FILE) { toast.show(`${file.name} is over 50 MB, so it wasn’t added.`); continue; }
      const fid = newId();
      const path = `${profile.id}/${fid}-${file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}`;
      const { error } = await supabase.storage.from('client-files').upload(path, file, { upsert: false });
      if (error) { toast.error('That file didn’t upload. Check your connection and try again.'); continue; }
      const row = { id: fid, profile_id: profile.id, name: file.name.slice(0, 200), storage_path: path, size_bytes: file.size, mime: file.type || null, added_by: 'coach', added_by_user: userId };
      await done(() => saveRow(userId, 'client_files', row), 'File added', async () => { await removeRow(userId, 'client_files', fid); await supabase.storage.from('client-files').remove([path]); });
    }
  };
  const openFile = async (f) => {
    const { data: signed, error } = await supabase.storage.from('client-files').createSignedUrl(f.storage_path, 60);
    if (error || !signed?.signedUrl) { toast.error('That file didn’t open. Check your connection and try again.'); return; }
    window.open(signed.signedUrl, '_blank', 'noopener');
  };

  // ---- More
  const exportData = () => {
    const mine = {
      exported_on: todayKey, client: profile, organisation: org?.name || null, engagements: data.engagements, packs: packs.filter((p) => data.engagements.some((e) => e.id === p.engagement_id)),
      time: entries.filter((t) => data.engagements.some((e) => e.id === t.engagement_id)), private_notes: notes, about_them: about, files: files.map((f) => ({ name: f.name, added_by: f.added_by, added: f.created_at })),
      tags: tagNames, fields: fields.map((f) => ({ name: f.name, value: fieldValue(f, values, profile.id) })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${profile.name}, data, ${todayKey}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveRow(userId, 'data_requests', { id: newId(), coach_id: coach.id, profile_id: profile.id, person_name: profile.name, kind: 'export', requested_on: todayKey, done_at: new Date().toISOString() }).catch(() => {});
    toast.show('Downloaded');
  };
  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await deleteClient(userId, state, profile, typedName);
      toast.show('Deleted');
      navigate('/coach/clients', { replace: true });
    } catch (error) {
      setDeleteProblem(error.message || SAVE_PROBLEM);
    } finally { busy.current = false; }
  };
  const move = async (toId) => {
    const to = coaches.find((c) => c.coach_id === toId);
    try {
      const from = await moveClient(userId, profile.id, toId);
      reloadCoaches();
      toast.saved({ message: `${first} moved to ${to.first_name}`, long: true, onUndo: () => moveClient(userId, profile.id, from).then(reloadCoaches).catch(() => {}) });
      navigate('/coach/clients');
    } catch (error) { toast.error(error.message || SAVE_PROBLEM); }
  };
  const viewAsk = viewAskState(requests, portal.now);
  const invite = async () => {
    if (busy.current) return; // one request per press
    busy.current = true;
    try {
      const answer = await inviteClient(userId, profile);
      toast.saved({ message: inviteWords(first, answer), long: true });
      setPanel(null);
    } catch (error) { toast.error(error?.message || SAVE_PROBLEM); } finally { busy.current = false; }
  };
  const askToView = () => done(() => saveRow(userId, 'client_view_requests', { id: newId(), profile_id: profile.id, coach_id: coach.id, asked_at: new Date().toISOString(), answered_at: null, allowed: null, expires_at: null }), `${first} has been asked`);

  const saveField = (f, typed) => {
    const row = fieldFromTyped(f, typed);
    if (row === undefined) { toast.show(f.kind === 'number' ? 'Type a number to carry on.' : f.kind === 'date' ? 'Choose a day to carry on.' : 'Choose one from the list to carry on.'); return false; }
    const key = { field_id: f.id, item_id: profile.id };
    const before = values.find((v) => v.field_id === f.id && v.item_id === profile.id) || null;
    done(() => (row === null ? removeRow(userId, 'coach_field_values', keyOf('coach_field_values', key)).then(() => 'saved') : saveRow(userId, 'coach_field_values', { ...key, coach_id: coach.id, value_text: null, value_number: null, value_date: null, ...row })),
      'Saved', () => (before ? saveRow(userId, 'coach_field_values', before) : removeRow(userId, 'coach_field_values', keyOf('coach_field_values', key))));
    return true;
  };
  const saveText = (key, check, problemLine) => (typed) => {
    const v = clean(typed);
    if (v && check && !check(v)) { toast.show(problemLine); return false; }
    save({ [key]: v || null });
    return true;
  };

  const everything = timeline({ notes, files, entries: entries.filter((t) => data.engagements.some((e) => e.id === t.engagement_id)), engagements: data.engagements, projects: rowsOf(state, 'engagement_projects') }, { kind, q }, now);
  // A client who was a lead keeps the lead's timeline (Won carries it over without copying: crm.js's carriedTimeline). It
  // is older than anything on the client's own, so it follows it.
  const carried = kind === 'all' ? leadTimeline(carriedTimeline(leadEvents, leads, profile.id), { emails, todayKey, callNames: Object.fromEntries(callTypes.map((t) => [t.key, t.name])) }).filter((r) => !clean(q) || `${r.title} ${r.lines.join(' ')}`.toLowerCase().includes(clean(q).toLowerCase())) : [];
  // Emails logged with this client (the copy-in address or Gmail; run 4) sit on the same timeline, each in its place by time.
  const mails = kind === 'all' ? emailsOn(emails, emailLinks, 'client', profile.id, todayKey, profile).filter((r) => !clean(q) || r.title.toLowerCase().includes(clean(q).toLowerCase())) : [];
  const timelineRows = [...everything.map((i) => ({ sort: String(i.at || i.day || ''), item: i })), ...mails.map((m) => ({ sort: String(m.at || ''), mail: m }))].sort((a, b) => b.sort.localeCompare(a.sort));
  const engagementWords = engagement ? [ENGAGEMENT_KINDS.find((k) => k.value === engagement.kind)?.label, engagement.name].filter(Boolean).join(', ') : 'None yet';
  const others = coaches.filter((c) => c.active && c.coach_id !== coach.id);

  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back onClick={() => navigate(profile.status === 'past' ? '/coach/clients/past' : '/coach/clients')} to={profile.status === 'past' ? 'Past clients' : 'Clients'} />
        <PageHeader title={profile.name} meta={[!isOwner && org ? org.name : null, profile.job_title, profile.city, profile.status === 'paused' ? 'Paused' : null, profile.status === 'past' ? 'Past client' : null]} />
        {isOwner && org && <div className="cc-links"><TextLink onClick={() => navigate(`/coach/organisations/${org.id}`)}>{org.name}</TextLink></div>}
        {birthday && <p className="cc-quiet">It’s <InlineLink onClick={() => setPanel('note')}>{possessive(first)}</InlineLink> birthday today.</p>}
        {pinned.length > 0 && (
          <div className="cc-pins" aria-label="Pinned notes">
            {pinned.map((n) => <p key={n.id}>{PIN}<span>{n.body}</span></p>)}
          </div>
        )}
        {contacts.length > 0 && (
          <div className="cc-links">
            {contacts.map((c) => <a key={c.key} className="ds-link" href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel={c.key === 'whatsapp' ? 'noreferrer' : undefined}>{c.label}</a>)}
          </div>
        )}
        <div className="cc-tabs"><InlineChoice ariaLabel="Show" semantics="pressed" options={VIEWS} value={view} onChange={setView} form="pills" /></div>

        {view === 'all' && (
          <div className="cc-fade" key="all">
            <div className="cc-timeline-bar">
              <SearchField label={`Search ${possessive(first)} history`} placeholder={`Search ${possessive(first)} history`} value={q} onChange={setQ} />
              <Dropdown label="Show" options={TIMELINE_KINDS} value={kind} onChange={setKind} />
            </div>
            {timelineRows.length === 0 && carried.length === 0 && <p className="cc-quiet">{q || kind !== 'all' ? 'Nothing matches.' : `Nothing is on ${possessive(first)} timeline yet.`}</p>}
            {timelineRows.map(({ item: i, mail }) => (mail ? <EmailRows key={mail.id} rows={[mail]} /> : (
              <div key={i.id} className="cc-timeline-row">
                <span>{dayWords((i.day || String(i.at)).slice(0, 10), todayKey)}</span>
                <div><b>{i.title}</b><p>{i.line}</p></div>
              </div>
            )))}
            {carried.map((r) => (
              <div key={r.id} className="cc-timeline-row">
                <span>{r.when}</span>
                <div><b>{r.title}</b>{r.tag && <p>{r.tag}</p>}{r.lines.map((line) => <p key={line}>{line}</p>)}</div>
              </div>
            ))}
          </div>
        )}

        {view === 'over' && (
          <div className="cc-fade" key="over">
            {shared?.mission && <div className="cc-soft"><span className="cc-soft-label">{possessive(first)} Mission</span><p>{shared.mission}</p></div>}

            {!started.complete && profile.status !== 'past' && (
              <Part title="Getting started">
                {started.rows.map((r) => (
                  <Line key={r.key} title={r.label} small={r.key === 'invited' && !profile.email && !r.done ? `Add ${possessive(first)} email first.` : null}>
                    {r.done ? <span className="cc-line-state cc-line-state--good">Done</span>
                      : r.key === 'engagement' ? <TextLink onClick={() => setEngDraft(draftFrom(null))}>Add engagement</TextLink>
                        : r.key === 'invited' ? <TextLink onClick={() => { if (!profile.email) { toggle('det'); return; } setPanel('invite'); }}>Invite to the portal</TextLink>
                          : <TextLink aria-label={`Tick ${r.label}`} onClick={() => save({ getting_started: { ...(profile.getting_started || {}), [r.key]: true } })}>Tick as done</TextLink>}
                  </Line>
                ))}
              </Part>
            )}

            <Part title="Next coaching session">
              {next ? (
                <div className="cc-ses-next">
                  <span><b>{whenWords(next.starts_at, todayKey)}</b><small>{lengthPlace(next)}</small></span>
                  <TextLink onClick={() => { setBriefAsked(true); setBriefId(next.id); }}>Open the brief</TextLink>
                </div>
              ) : (
                <p className="cc-quiet cc-ses-none"><span>No session is booked.</span>{profile.status !== 'past' && <TextLink onClick={() => navigate('/coach/calendar/book', { state: { clientId: profile.id } })}>Book a call</TextLink>}{profile.status !== 'past' && <TextLink onClick={() => setPanel('session')}>Add session</TextLink>}</p>
              )}
            </Part>

            {(sessions || credit) && (
              <StatGroup className="cc-stats">
                {sessions && <Stat label="Coaching sessions to go" value={`${sessions.left} of ${sessions.total}`} bar={sessions.total ? sessions.left / sessions.total : 0} />}
                {credit && <Stat label="Time credit left" value={minutesWords(credit.left)} bar={credit.total ? credit.left / credit.total : 0} />}
              </StatGroup>
            )}

            {credit && (
              <Part title="Projects">
                {[...projects, ...(projects.length ? [] : [{ id: null, name: 'Coaching' }])].map((p) => {
                  const on = running && running.engagement_id === engagement.id && (running.project_id || null) === p.id;
                  const total = minutesClocked(entries, { engagementId: engagement.id, projectId: p.id }, now);
                  return (
                    <Line key={p.id || 'none'} title={p.name} small={on ? <>Clocked in for <span className="cc-clock">{clockWords(running.started_at, now)}</span></> : `${minutesWords(total)} so far`}>
                      <TextLink aria-label={`${on ? 'Clock out of' : 'Clock in to'} ${p.name}`} onClick={() => clock(p.id)}>{on ? 'Clock out' : 'Clock in'}</TextLink>
                    </Line>
                  );
                })}
                <ProjectAdd onAdd={addProject} />
              </Part>
            )}

            <div className="cc-folds">
              <Fold title="Progress" open={Boolean(folds.prog)} onToggle={() => toggle('prog')} summary={shared?.latest_week_score != null ? `Performance score this week ${Math.round(shared.latest_week_score)}%` : ''}>
                {shared?.latest_week_score != null
                  ? <StatGroup className="cc-stats"><Stat label="Performance score, latest week" value={`${Math.round(shared.latest_week_score)}%`} good={shared.latest_week_score >= 85} /></StatGroup>
                  : <p className="cc-quiet">{profile.user_id ? `${first} isn’t sharing a score with you yet.` : `${first} has no portal account yet, so there is nothing to show.`}</p>}
              </Fold>
              <Fold title="Sessions and recaps" open={Boolean(folds.ses)} onToggle={() => toggle('ses')} summary={heldWords(counted)}>
                {profile.status !== 'past' && <div className="cc-add"><AddButton onClick={() => setPanel('session')}>Add session</AddButton></div>}
                <SessionRows sessions={mySessions} label="Sessions" />
                {engagement && (
                  <Line title="Sessions held" small={counted.sessions_recorded > 0 ? `${counted.sessions_recorded} recorded here, counted with the ones from before.` : 'Each session you write up is counted here.'}>
                    <span className="cc-line-actions">
                      <TextLink aria-label="One fewer session held" onClick={() => { if (counted.sessions_held > 0) typeHeld(counted.sessions_held - 1); }}>Take one off</TextLink>
                      <span className="cc-line-state">{counted.sessions_held || 0}</span>
                      <TextLink aria-label="One more session held" onClick={() => typeHeld((counted.sessions_held || 0) + 1)}>Add one</TextLink>
                    </span>
                  </Line>
                )}
                {!engagement && <p className="cc-quiet">Add an engagement to count sessions against it.</p>}
              </Fold>
              <Fold title="Private notes" eye={<Eye sentence="Only you can see these." />} open={Boolean(folds.notes)} onToggle={() => toggle('notes')} summary={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${pinned.length ? `, ${pinned.length} pinned` : ''}`}>
                {notes.map((n) => (
                  <Line key={n.id} title={n.pinned ? 'Pinned' : dayWords(n.noted_on, todayKey)} small={n.body}>
                    <span className="cc-line-actions">
                      <TextLink aria-label={`${n.pinned ? 'Unpin' : 'Pin'} the note of ${dayWords(n.noted_on, todayKey)}`} onClick={() => pin(n, !n.pinned)}>{n.pinned ? 'Unpin' : 'Pin to the top'}</TextLink>
                      <TextLink aria-label={`Delete the note of ${dayWords(n.noted_on, todayKey)}`} onClick={() => done(() => removeRow(userId, 'client_notes', n.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'client_notes', n))}>Delete</TextLink>
                    </span>
                  </Line>
                ))}
                <form noValidate onSubmit={addNote} className="cc-field">
                  <TextBox label="A new note" value={note} maxLength={4000} onChange={(v) => { setNote(v); setNoteProblem(null); }} />
                  {noteProblem && <p className="cc-problem" role="alert">{noteProblem}</p>}
                  <div className="cc-acts"><Button variant="outline" type="submit">Add my note</Button></div>
                </form>
              </Fold>
              <Fold title="To-dos" open={Boolean(folds.todo)} onToggle={() => toggle('todo')} summary={myTodos.length ? openWords(myTodos) : ''}>
                {myTodos.length === 0 && <p className="cc-quiet">Your own to-dos for {first} show here.</p>}
                {myTodos.length > 0 && <TodoList todos={myTodos} view="list" label={`Your to-dos for ${first}`} onOpen={setOpenTodo} />}
                <div className="cc-add"><AddButton onClick={() => setPanel('todo')}>Add to-do</AddButton></div>
              </Fold>
              <Fold title="Files" eye={<Eye sentence={`You and ${first} can see these.`} shared />} open={Boolean(folds.files)} onToggle={() => toggle('files')} summary={`${files.length} ${files.length === 1 ? 'file' : 'files'}`}>
                {files.map((f) => (
                  <Line key={f.id} title={f.name} small={`Added by ${f.added_by === 'client' ? first : 'you'}, ${dayWords(String(f.created_at).slice(0, 10), todayKey)}`}>
                    <span className="cc-line-actions">
                      <TextLink aria-label={`Open ${f.name}`} onClick={() => openFile(f)}>Open</TextLink>
                      {f.added_by_user === userId && <TextLink aria-label={`Delete ${f.name}`} onClick={() => done(async () => { await removeRow(userId, 'client_files', f.id); await supabase.storage.from('client-files').remove([f.storage_path]); return 'saved'; }, 'Deleted')}>Delete</TextLink>}
                    </span>
                  </Line>
                ))}
                <div
                  className={`cc-drop${over ? ' cc-drop--over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
                >
                  Drag files here to share them with {first}.
                </div>
                <div className="cc-acts"><TextLink onClick={() => fileRef.current?.click()}>Add file</TextLink></div>
                <input ref={fileRef} className="cc-hidden-file" type="file" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </Fold>
              <Fold title="Engagement" open={Boolean(folds.eng)} onToggle={() => toggle('eng')} summary={engagementWords}>
                {engagement ? (
                  <>
                    <Detail label="Kind">{ENGAGEMENT_KINDS.find((k) => k.value === engagement.kind)?.label}</Detail>
                    {engagement.name && <Detail label="Name">{engagement.name}</Detail>}
                    {sessions && <Detail label="Coaching sessions">{`${sessions.total} of ${engagement.default_minutes} minutes${engagement.every_weeks ? `, every ${engagement.every_weeks === 1 ? 'week' : `${engagement.every_weeks} weeks`}` : ''}`}</Detail>}
                    {credit && <Detail label="Time credit">{`${minutesWords(credit.total)}, ${minutesWords(credit.left)} left`}</Detail>}
                    {engagement.funded_by && <Detail label="Funded by">{engagement.funded_by}</Detail>}
                    {engagement.starts_on && <Detail label="Starts">{dayWords(engagement.starts_on, todayKey)}</Detail>}
                    {engagement.ends_on && <Detail label="Ends">{dayWords(engagement.ends_on, todayKey)}</Detail>}
                    <div className="cc-acts">
                      <TextLink onClick={() => setEngDraft(draftFrom(engagement))}>Edit</TextLink>
                      <TextLink onClick={() => setPanel('pack')}>Add session pack</TextLink>
                      <TextLink onClick={() => done(() => saveRow(userId, 'engagements', asKept({ ...engagement, status: 'ended' })), 'Engagement ended', () => saveRow(userId, 'engagements', asKept(engagement)))}>End this engagement</TextLink>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="cc-quiet">{first} has no engagement running.</p>
                    <div className="cc-add"><AddButton onClick={() => setEngDraft(draftFrom(null))}>Add engagement</AddButton></div>
                  </>
                )}
              </Fold>
              <Fold title={`About ${first}`} eye={<Eye sentence="Only you can see this." />} open={Boolean(folds.about)} onToggle={() => toggle('about')} summary={about?.birthday_day ? `Birthday ${birthdayWords(about.birthday_month, about.birthday_day)}` : ''}>
                {about?.birthday_day && <Detail label="Birthday">{birthdayWords(about.birthday_month, about.birthday_day)}</Detail>}
                {about?.partner && <Detail label="Partner">{about.partner}</Detail>}
                {about?.children && <Detail label="Children">{about.children}</Detail>}
                {about?.other && <Detail label="Other">{about.other}</Detail>}
                {!about && <p className="cc-quiet">A birthday, the people who matter to them, anything you want to remember.</p>}
                <div className="cc-acts"><TextLink onClick={() => setPanel('about')}>Edit</TextLink></div>
              </Fold>
              <Fold title="Details" open={Boolean(folds.det)} onToggle={() => toggle('det')} summary={tagNames.join(', ')}>
                <Detail label="Email" edit><EditCell label="Email" value={profile.email || ''} onSave={saveText('email', (v) => isEmail(v.toLowerCase()), 'That email doesn’t look right. Check it and try again.')} /></Detail>
                <Detail label="Mobile" edit><EditCell label="Mobile" value={profile.mobile || ''} onSave={(typed) => { const v = clean(typed).replace(/[\s()-]/g, ''); if (v && !/^\+[0-9]{6,15}$/.test(v)) { toast.show('Type the number with its country code, such as +44 7700 900123.'); return false; } save({ mobile: v || null }); return true; }} /></Detail>
                <Detail label="Role" edit><EditCell label="Role" value={profile.job_title || ''} onSave={saveText('job_title')} /></Detail>
                <Detail label="City" edit><EditCell label="City" value={profile.city || ''} onSave={saveText('city')} /></Detail>
                <Detail label="Referred by" edit><EditCell label="Referred by" value={profile.referred_by || ''} onSave={saveText('referred_by')} /></Detail>
                {fields.map((f) => {
                  const v = fieldValue(f, values, profile.id);
                  return <Detail key={f.id} label={f.name} edit><EditCell label={f.name} value={v} words={fieldWords(f, v, todayKey)} kind={f.kind} options={f.options || []} onSave={(typed) => saveField(f, typed)} /></Detail>;
                })}
                <Detail label="Tags" edit><button type="button" className={`cc-cell${tagNames.length ? '' : ' cc-cell--empty'}`} aria-label={`Tags, ${tagNames.join(', ') || 'none'}. Edit`} onClick={() => setPanel('tags')}>{tagNames.join(', ') || 'Add'}</button></Detail>
                <div className="cc-add"><AddButton onClick={() => setField({ id: newId(), name: '', kind: 'text', optionsText: '' })}>Add field</AddButton></div>
                <div className="cc-field"><Dropdown label="Time zone" placeholder="Choose a time zone" options={zones} value={profile.time_zone || null} onChange={(v) => save({ time_zone: v })} /></div>
                <div className="cc-field"><SwitchRow label="Frequent traveller" note={`Session emails say the calendar invite moves with ${first}.`} checked={profile.frequent_traveller === true} onChange={(on) => save({ frequent_traveller: on })} /></div>
                {profile.status !== 'past' && <div className="cc-field"><SwitchRow label="Paused" note="A paused client stays in your list, in the board’s Paused column." checked={profile.status === 'paused'} onChange={(on) => save({ status: on ? 'paused' : 'active' })} /></div>}
              </Fold>
              <Fold title="More" open={Boolean(folds.more)} onToggle={() => toggle('more')} summary="View as client, close, export or delete">
                <div className="cc-links">
                  {profile.user_id && (!viewAsk || viewAsk.state === 'no') && <TextLink onClick={askToView}>Ask to view {possessive(first)} portal</TextLink>}
                  {profile.status === 'past'
                    ? <TextLink onClick={() => save({ status: 'active', ended_on: null }, `${first} is back in your clients`).then(() => setEngDraft(draftFrom(null)))}>Start a new engagement</TextLink>
                    : <TextLink onClick={() => navigate(`/coach/clients/${profile.id}/close`)}>Start the guided close</TextLink>}
                  <TextLink onClick={exportData}>Export {possessive(first)} data</TextLink>
                  <TextLink onClick={() => { setTypedName(''); setDeleteProblem(null); setPanel('delete'); }}>Delete {possessive(first)} data</TextLink>
                </div>
                {profile.user_id && viewAsk?.state === 'yes' && <p className="cc-quiet" role="status">{first} said yes. You can view what {first} shares until {formatClockTime(viewAsk.until)}.</p>}
                {profile.user_id && viewAsk?.state === 'asked' && <p className="cc-note" role="status">{first} has been asked, and the answer will show here.</p>}
                {profile.user_id && viewAsk?.state === 'no' && <p className="cc-note" role="status">{first} said no.</p>}
                {profile.user_id && <p className="cc-note">{first} is asked first. A yes lets you view for 30 minutes.</p>}
                {isOwner && others.length > 0 && (
                  <div className="cc-field"><Dropdown label="Move to a coach" placeholder="Choose a coach" options={others.map((c) => ({ value: c.coach_id, label: c.full_name || c.first_name }))} value={null} onChange={move} /></div>
                )}
              </Fold>
            </div>
          </div>
        )}
      </div>

      <EngagementPanel draft={engDraft} setDraft={setEngDraft} profile={profile} />
      <AboutPanel open={panel === 'about'} onClose={() => setPanel(null)} profile={profile} about={about} />
      <TagsPanel profile={panel === 'tags' ? profile : null} onClose={() => setPanel(null)} />
      <FieldPanel draft={field} setDraft={setField} />
      <NameNote profile={panel === 'note' ? profile : null} reason="It’s their birthday today." onClose={() => setPanel(null)} />
      <PackPanel open={panel === 'pack'} onClose={() => setPanel(null)} engagement={engagement} />
      <AddSessionPanel open={panel === 'session'} onClose={() => setPanel(null)} profile={profile} engagement={engagement} />
      <QuickAddPanel open={panel === 'todo'} onClose={() => setPanel(null)} defaults={{ profile_id: profile.id }} />
      <TodoPanel id={openTodo} onClose={() => setOpenTodo(null)} />
      {briefAsked && <Suspense fallback={null}><BriefPanel sessionId={briefId} onClose={() => setBriefId(null)} /></Suspense>}
      <SlidePanel
        open={panel === 'invite'}
        onClose={() => setPanel(null)}
        title="Invite to the portal"
        footer={<div className="cc-panel-foot"><TextLink onClick={() => setPanel(null)}>Not now</TextLink><Button variant="primary" onClick={invite}>Invite {first}</Button></div>}
      >
        <p className="cc-quiet">{first} gets an email at {profile.email}, with a link to create their account.</p>
        <p className="cc-note">When {first} accepts in The Clarity Portal, their account joins this page and you become their coach.</p>
      </SlidePanel>
      <SlidePanel
        open={panel === 'delete'}
        onClose={() => setPanel(null)}
        title={`Delete ${possessive(first)} data`}
        footer={<div className="cc-panel-foot"><TextLink onClick={() => setPanel(null)}>Keep it</TextLink><Button variant="primary" onClick={remove}>Delete {possessive(first)} data</Button></div>}
      >
        <p className="cc-quiet">Everything on this page goes, and it can’t be undone. Invoices stay for 6 years, as the law requires.</p>
        <div className="cc-field"><TextField label={`Type ${profile.name} to confirm`} value={typedName} autoComplete="off" onChange={(e) => { setTypedName(e.target.value); setDeleteProblem(null); }} /></div>
        {deleteProblem && <p className="cc-problem" role="alert">{deleteProblem}</p>}
      </SlidePanel>
    </div>
  );
}

function ProjectAdd({ onAdd }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  if (!adding) return <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add project</AddButton></div>;
  return (
    <form noValidate className="cc-field" onSubmit={(e) => { e.preventDefault(); if (!clean(name)) { setProblem('Type the project’s name to carry on.'); return; } onAdd(name); setName(''); setAdding(false); }}>
      <TextField label="Project" value={name} maxLength={120} autoFocus onChange={(e) => { setName(e.target.value); setProblem(null); }} />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <div className="cc-acts"><Button variant="outline" type="submit">Add project</Button><TextLink onClick={() => setAdding(false)}>Cancel</TextLink></div>
    </form>
  );
}

function PackPanel({ open, onClose, engagement }) {
  const { userId, todayKey } = useCoachPortal();
  const done = useDone();
  const [sessions, setSessions] = useState('');
  const [hours, setHours] = useState('');
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setSessions(''); setHours(''); setProblem(null); } }, [open]);
  const add = async () => {
    const s = clean(sessions) === '' ? null : Number(sessions);
    const h = clean(hours) === '' ? null : Number(hours);
    if (s == null && h == null) { setProblem('Type the sessions or the hours in this pack to carry on.'); return; }
    if ((s != null && (!Number.isInteger(s) || s < 1 || s > 1000)) || (h != null && !(h > 0 && h <= 10000))) { setProblem('Type a whole number of sessions, or the hours.'); return; }
    const row = { id: newId(), engagement_id: engagement.id, sessions: s, minutes: h == null ? null : Math.round(h * 60), bought_on: todayKey };
    if (await done(() => saveRow(userId, 'engagement_packs', row), 'Pack added', () => removeRow(userId, 'engagement_packs', row.id))) onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Add session pack" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add the pack</Button></div>}>
      <div className="cc-field cc-two">
        <TextField label="Sessions" inputMode="numeric" value={sessions} onChange={(e) => { setSessions(e.target.value); setProblem(null); }} />
        <TextField label="Or hours of time credit" inputMode="decimal" value={hours} onChange={(e) => { setHours(e.target.value); setProblem(null); }} />
      </div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <p className="cc-note">A pack adds to what’s left on this engagement.</p>
    </SlidePanel>
  );
}
