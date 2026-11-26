import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, ChipRow, Dropdown, InlineChoice, SlidePanel, SwitchRow, TextField, useToast } from '../../components/design';
import { instantAt, zonePlace } from '../../lib/time';
import { keyOf, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { addClientFor, logActivity, mergeClients, unmergeClients } from '../../lib/coach/actions';
import {
  canFavourite, clean, exportRows, FAVOURITES_FULL, isEmail, mergePlan, mergeValues, parseTeam, STAGES, START_ZONES,
  TEAM_STATE_WORDS, teamPreview, toCsv, viewFromList,
} from '../../lib/coach/model';
import { xlsxBytes } from '../../lib/coach/xlsx';
import { TextLink, useCoachPortal } from './parts';
import { countFigure, countWords } from '../../lib/coach/numbers';

// The Clients page's panels (M11, version 3.6): Add client, Add team,
// Filter with saved views, Export to a spreadsheet, Merge into one, a
// client's tags, Add group and Add workshop. Each is the shared side panel,
// and no button is ever greyed out: pressed too early, it says what's missing.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const NONE = '__none__';
const NEW = '__new__';

function useDone() {
  const toast = useToast();
  return async (work, message, onUndo) => {
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

function useZoneOptions(extra) {
  const { settings } = useCoachPortal();
  return useMemo(() => [...new Set(['Europe/London', ...(settings.time_zones || START_ZONES), ...(extra ? [extra] : [])])]
    .map((z) => ({ value: z, label: zonePlace(z) })).sort((a, b) => a.label.localeCompare(b.label)), [settings.time_zones, extra]);
}

/** The organisation choice, with a new one typed in place (the owner's; 026 lets only the owner add one). */
function OrganisationChoice({ value, onChange, newName, onNewName }) {
  const { organisations, isOwner } = useCoachPortal();
  const options = [
    { value: NONE, label: 'No organisation' },
    ...organisations.map((o) => ({ value: o.id, label: o.name })).sort((a, b) => a.label.localeCompare(b.label)),
    ...(isOwner ? [{ value: NEW, label: 'A new organisation' }] : []),
  ];
  return (
    <>
      <Dropdown label="Organisation" options={options} value={value || NONE} onChange={(v) => onChange(v === NONE ? null : v)} />
      {value === NEW && <div className="cc-field"><TextField label="The organisation’s name" value={newName} maxLength={120} onChange={(e) => onNewName(e.target.value)} /></div>}
    </>
  );
}

/** Makes the organisation when a new one was typed; returns its id (or the one chosen). */
async function organisationFor(userId, value, newName, organisations) {
  if (value !== NEW) return { id: value || null, made: null };
  const name = clean(newName);
  const same = organisations.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (same) return { id: same.id, made: null };
  const row = { id: newId(), name, created_by: userId };
  await saveRow(userId, 'organisations', row);
  return { id: row.id, made: row };
}

// ---------------------------------------------------------------- Add client
/**
 * Quick Add's client (Polish 1, rule 10): a name typed under the list's label and Enter, saved as the coach's own client
 * with nothing else, exactly as Add client saves one (Undo removes it). Returns the new id, or null when it didn't save.
 */
export function useQuickAddClient() {
  const { userId, coach } = useCoachPortal();
  const done = useDone();
  return async (typed) => {
    const name = clean(typed);
    if (!name) return null;
    const id = newId();
    const profile = { id, coach_id: coach.id, user_id: null, name, email: null, organisation_id: null, time_zone: null, frequent_traveller: false, referred_by: null, status: 'active', getting_started: {}, created_by: userId };
    const ok = await done(() => saveRows(userId, [['client_profiles', profile]]), `${name} is in your clients`, () => removeRow(userId, 'client_profiles', id).catch(() => {}));
    return ok ? id : null;
  };
}

export function AddClientPanel({ open, onClose, onAdded, initialName = '' }) {
  const { userId, coach, isOwner, coaches, tags, organisations, clients } = useCoachPortal();
  const done = useDone();
  const zones = useZoneOptions();
  const start = { name: initialName, email: '', org: null, orgName: '', coachId: coach.id, tagIds: [], zone: null, traveller: false, referred: '' };
  const [f, setF] = useState(start);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setF(start); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const active = coaches.filter((c) => c.active);
  const add = async () => {
    if (busy.current) return;
    const name = clean(f.name);
    const email = clean(f.email).toLowerCase();
    if (!name) { setProblem({ at: 'name', line: 'Type their name to carry on.' }); return; }
    if (email && !isEmail(email)) { setProblem({ at: 'email', line: 'That email doesn’t look right. Check it and try again.' }); return; }
    if (f.org === NEW && !clean(f.orgName)) { setProblem({ at: 'org', line: 'Type the organisation’s name to carry on.' }); return; }
    if (email && clients.some((p) => p.email === email)) { setProblem({ at: 'email', line: 'You already have a client with that email.' }); return; }
    busy.current = true;
    const id = newId();
    let made = null;
    const ok = await done(async () => {
      const org = await organisationFor(userId, f.org, f.orgName, organisations);
      made = org.made;
      const profile = { id, coach_id: f.coachId, user_id: null, name, email: email || null, organisation_id: org.id, time_zone: f.zone, frequent_traveller: f.traveller, referred_by: clean(f.referred) || null, status: 'active', getting_started: {}, created_by: userId };
      // Tags are the coach's own, so they go only on the coach's own client.
      const links = f.coachId === coach.id ? f.tagIds.map((t) => ['coach_tag_links', { tag_id: t, item_kind: 'client', item_id: id, coach_id: coach.id }]) : [];
      if (f.coachId !== coach.id) { await addClientFor(f.coachId, profile); return 'saved'; }
      return saveRows(userId, [['client_profiles', profile], ...links]);
    }, f.coachId === coach.id ? `${name} is in your clients` : `${name} is added`, f.coachId !== coach.id ? undefined : async () => {
      for (const t of f.tagIds) await removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', { tag_id: t, item_kind: 'client', item_id: id })).catch(() => {});
      await removeRow(userId, 'client_profiles', id).catch(() => {});
      if (made) await removeRow(userId, 'organisations', made.id).catch(() => {});
    });
    busy.current = false;
    if (ok) { onClose(); onAdded?.(id, f.coachId === coach.id); }
  };
  const at = (key) => (problem?.at === key ? <p className="cc-problem" role="alert">{problem.line}</p> : null);
  return (
    <SlidePanel open={open} onClose={onClose} title="Add client" draftKey="client:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add client</Button></div>}>
      <div className="cc-field"><TextField label="Name" value={f.name} maxLength={120} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />{at('name')}</div>
      <div className="cc-field"><TextField label="Email" type="email" value={f.email} autoComplete="off" onChange={(e) => set({ email: e.target.value })} />{at('email')}</div>
      <div className="cc-field"><OrganisationChoice value={f.org} onChange={(v) => set({ org: v })} newName={f.orgName} onNewName={(v) => set({ orgName: v })} />{at('org')}</div>
      {isOwner && active.length > 1 && (
        <div className="cc-field"><Dropdown label="Coach" options={active.map((c) => ({ value: c.coach_id, label: c.coach_id === coach.id ? 'You' : c.full_name || c.first_name }))} value={f.coachId} onChange={(v) => set({ coachId: v })} /></div>
      )}
      {tags.length > 0 && f.coachId === coach.id && (
        <div className="cc-field">
          <span className="cc-field-label" id="cc-add-tags">Tags</span>
          <ChipRow label="Tags">{tags.map((t) => <Chip key={t.id} pressed={f.tagIds.includes(t.id)} onClick={() => set({ tagIds: f.tagIds.includes(t.id) ? f.tagIds.filter((x) => x !== t.id) : [...f.tagIds, t.id] })}>{t.name}</Chip>)}</ChipRow>
        </div>
      )}
      <div className="cc-field"><Dropdown label="Time zone" placeholder="Choose a time zone" options={zones} value={f.zone} onChange={(v) => set({ zone: v })} /></div>
      <div className="cc-field"><SwitchRow label="Frequent traveller" note="Session emails say the calendar invite moves with them." checked={f.traveller} onChange={(on) => set({ traveller: on })} /></div>
      <div className="cc-field"><TextField label="Referred by" value={f.referred} maxLength={120} autoComplete="off" onChange={(e) => set({ referred: e.target.value })} /></div>
      <p className="cc-note">Nothing is sent until you invite them from their page.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Add team
export function AddTeamPanel({ open, onClose }) {
  const { userId, coach, organisations, clients } = useCoachPortal();
  const done = useDone();
  const [text, setText] = useState('');
  const [org, setOrg] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [problem, setProblem] = useState(null);
  const fileRef = useRef(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setText(''); setOrg(null); setOrgName(''); setProblem(null); } }, [open]);
  const organisation = organisations.find((o) => o.id === org) || null;
  const seatsLeft = organisation && organisation.seat_count > 0 ? Math.max(0, organisation.seat_count - clients.filter((p) => p.organisation_id === organisation.id && p.status !== 'past').length) : null;
  const preview = useMemo(() => teamPreview(parseTeam(text), clients, { seatsLeft }), [text, clients, seatsLeft]);
  const readFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setProblem('That file can’t be read here. Save it as CSV, or copy the rows and paste them.'); return; }
    if (file.size > 2 * 1024 * 1024) { setProblem('That file is too big. Paste the rows instead.'); return; }
    setText(await file.text()); setProblem(null);
  };
  const add = async () => {
    if (busy.current) return;
    if (!preview.rows.length) { setProblem('Paste a list or choose a spreadsheet to carry on.'); return; }
    if (!preview.add) { setProblem('There’s nobody new to add in this list.'); return; }
    if (org === NEW && !clean(orgName)) { setProblem('Type the organisation’s name to carry on.'); return; }
    busy.current = true;
    const ids = [];
    let made = null;
    const ok = await done(async () => {
      const o = await organisationFor(userId, org, orgName, organisations);
      made = o.made;
      const pairs = preview.rows.filter((r) => r.state === 'new').map((r) => {
        const id = newId();
        ids.push(id);
        const mobile = clean(r.mobile).replace(/[\s()-]/g, '');
        return ['client_profiles', { id, coach_id: coach.id, user_id: null, name: r.name.slice(0, 120), email: r.email || null, mobile: /^\+[0-9]{6,15}$/.test(mobile) ? mobile : null, job_title: clean(r.job_title).slice(0, 120) || null, city: clean(r.city).slice(0, 80) || null, organisation_id: o.id, status: 'active', getting_started: {}, created_by: userId }];
      });
      return saveRows(userId, pairs);
    }, `${preview.add} ${preview.add === 1 ? 'client' : 'clients'} added`, async () => {
      for (const id of ids) await removeRow(userId, 'client_profiles', id).catch(() => {});
      if (made) await removeRow(userId, 'organisations', made.id).catch(() => {});
    });
    busy.current = false;
    if (ok) onClose();
  };
  const summary = [
    preview.add ? `${preview.add} to add.` : null,
    preview.already ? `${preview.already} ${preview.already === 1 ? 'is' : 'are'} already ${preview.already === 1 ? 'a client' : 'clients'}.` : null,
    preview.duplicates ? `${preview.duplicates} ${preview.duplicates === 1 ? 'is' : 'are'} in this list twice.` : null,
    preview.unreadable ? `${preview.unreadable} ${preview.unreadable === 1 ? 'needs' : 'need'} a look first.` : null,
  ].filter(Boolean);
  return (
    <SlidePanel open={open} onClose={onClose} title="Add team" draftKey="team:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>{preview.add ? `Add ${preview.add} ${preview.add === 1 ? 'client' : 'clients'}` : 'Add the team'}</Button></div>}>
      <div className="cc-field"><OrganisationChoice value={org} onChange={(v) => { setOrg(v); setProblem(null); }} newName={orgName} onNewName={(v) => { setOrgName(v); setProblem(null); }} /></div>
      <div className="cc-field">
        <label className="cc-field-label" htmlFor="cc-team-paste">Paste a list, or rows from a spreadsheet</label>
        <textarea id="cc-team-paste" className="cc-paste" rows={6} value={text} placeholder="Dana Whitfield <dana@example.com>" onChange={(e) => { setText(e.target.value); setProblem(null); }} />
      </div>
      <div className="cc-acts">
        <TextLink onClick={() => fileRef.current?.click()}>Choose a spreadsheet</TextLink>
        <input ref={fileRef} className="cc-hidden-file" type="file" accept=".csv,.tsv,.txt,text/csv" tabIndex={-1} aria-hidden="true" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <p className="cc-note">A spreadsheet needs a Name and an Email column.</p>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      {preview.rows.length > 0 && (
        <div className="cc-preview" aria-live="polite">
          <p className="cc-quiet">{summary.join(' ')}</p>
          {preview.overSeats > 0 && <p className="cc-quiet">{organisation.name} has {seatsLeft} {seatsLeft === 1 ? 'seat' : 'seats'} left, and this adds {preview.add}.</p>}
          {preview.rows.slice(0, 200).map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={`${r.email}-${i}`} className={`cc-preview-row${r.state === 'new' ? ' cc-preview-row--new' : ''}`}>
              <span>{r.name || 'No name'}<small>{[r.email, r.job_title].filter(Boolean).join(', ')}</small></span>
              <span>{TEAM_STATE_WORDS[r.state]}</span>
            </div>
          ))}
          {preview.rows.length > 200 && <p className="cc-note">And {preview.rows.length - 200} more.</p>}
        </div>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Export to a spreadsheet
function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportPanel({ open, onClose, shown, all, ctx }) {
  const { userId, coach, todayKey } = useCoachPortal();
  const toast = useToast();
  const [what, setWhat] = useState('view');
  const [format, setFormat] = useState('xlsx');
  useEffect(() => { if (open) setWhat(shown.length === all.length ? 'all' : 'view'); }, [open, shown.length, all.length]);
  const own = (rows) => rows.filter((r) => !r.admin);
  const options = [
    ...(shown.length !== all.length ? [{ value: 'view', label: `This view, ${countWords(own(shown).length, 'client')}` }] : []),
    { value: 'all', label: `All your clients, ${countFigure(own(all).length)}` },
  ];
  const go = () => {
    const rows = exportRows(own(what === 'view' ? shown : all), ctx, todayKey);
    const n = rows.length - 1;
    const name = `Clients, ${todayKey}`;
    if (format === 'csv') download(`${name}.csv`, `﻿${toCsv(rows)}`, 'text/csv;charset=utf-8');
    else download(`${name}.xlsx`, xlsxBytes(rows, 'Clients'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    logActivity(userId, coach, 'export', `exported ${countWords(n, 'client')} to a spreadsheet.`);
    toast.show('Downloaded');
    onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Export to a spreadsheet" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={go}>Download</Button></div>}>
      <div className="cc-field"><Dropdown label="What to export" options={options} value={what} onChange={setWhat} /></div>
      <div className="cc-field"><InlineChoice label="Format" options={[{ value: 'xlsx', label: 'Excel' }, { value: 'csv', label: 'CSV' }]} value={format} onChange={setFormat} form="pills" /></div>
      <p className="cc-note">Every field comes with it, your own fields included.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Merge into one
export function MergePanel({ pair, onClose, onDifferent }) {
  const { userId, state, organisations } = useCoachPortal();
  const toast = useToast();
  const [choices, setChoices] = useState({});
  const busy = useRef(false);
  const ids = pair ? `${pair[0].id}|${pair[1].id}` : '';
  useEffect(() => { setChoices({}); }, [ids]);
  if (!pair) return <SlidePanel open={false} onClose={onClose} title="Merge into one" />;
  const [a, b] = pair;
  const show = (key, v) => (key === 'organisation_id' ? organisations.find((o) => o.id === v)?.name || 'An organisation' : key === 'time_zone' ? zonePlace(v) : String(v));
  const plan = mergePlan(a, b, show) || [];
  const merge = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const undo = await mergeClients(userId, state, a.id, b.id, mergeValues(choices));
      toast.saved({ message: 'Merged into one', long: true, onUndo: () => unmergeClients(userId, undo).catch((e) => toast.error(e.message || SAVE_PROBLEM)) });
      onClose();
    } catch (error) {
      toast.error(error?.message || SAVE_PROBLEM);
    } finally {
      busy.current = false;
    }
  };
  return (
    <SlidePanel
      open
      onClose={onClose}
      title="Merge into one"
      footer={<div className="cc-panel-foot"><TextLink onClick={() => { onDifferent?.(pair); onClose(); }}>They’re different people</TextLink><Button variant="primary" onClick={merge}>Merge into one</Button></div>}
    >
      <p className="cc-quiet">These two look like the same person. Choose what to keep where they differ.</p>
      <div className="cc-merge-head" aria-hidden="true"><span /><span>{a.name}</span><span>{b.name}</span></div>
      {plan.map((row) => (
        <div key={row.key} className="cc-merge-row" role={row.choose ? 'radiogroup' : undefined} aria-label={row.choose ? row.label : undefined}>
          <span className="cc-merge-label">{row.label}</span>
          {row.choose ? (
            <>
              <button type="button" role="radio" className="cc-merge-choice" aria-checked={(choices[row.key] || 'a') === 'a'} onClick={() => setChoices({ ...choices, [row.key]: 'a' })}>{row.a}</button>
              <button type="button" role="radio" className="cc-merge-choice" aria-checked={choices[row.key] === 'b'} onClick={() => setChoices({ ...choices, [row.key]: 'b' })}>{row.b}</button>
            </>
          ) : <span className="cc-merge-one">{row.one}</span>}
        </div>
      ))}
      <p className="cc-note">Their notes, files, tags and engagements join into one. Nothing is lost.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Filter and saved views
export function FilterPanel({ open, onClose, list, setList, count }) {
  const { userId, coach, isOwner, coaches, tags, fields, organisations, views, state } = useCoachPortal();
  const done = useDone();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setName(''); setProblem(null); } }, [open]);
  const f = list.filters;
  const set = (change) => setList({ ...list, filters: { ...f, ...change }, viewId: null });
  const toggle = (key, value) => set({ [key]: (f[key] || []).includes(value) ? f[key].filter((x) => x !== value) : [...(f[key] || []), value] });
  const toggleField = (id, value) => {
    const now = f.fields?.[id] || [];
    set({ fields: { ...(f.fields || {}), [id]: now.includes(value) ? now.filter((x) => x !== value) : [...now, value] } });
  };
  const mine = views.filter((v) => v.list === 'clients').sort((a, b) => a.name.localeCompare(b.name));
  const values = rowsOf(state, 'coach_field_values');
  const save = async () => {
    const n = clean(name);
    if (!n) { setProblem('Name this view to carry on.'); return; }
    if (mine.some((v) => v.name.toLowerCase() === n.toLowerCase())) { setProblem('You already have a view with that name.'); return; }
    const row = { id: newId(), coach_id: coach.id, list: 'clients', favourite: false, position: mine.length, ...viewFromList(n, list) };
    if (await done(() => saveRow(userId, 'coach_views', row), 'View saved', () => removeRow(userId, 'coach_views', row.id))) { setName(''); setList({ ...list, viewId: row.id }); }
  };
  const favourite = (v) => {
    if (!v.favourite && !canFavourite(views)) { setProblem(FAVOURITES_FULL); return; }
    done(() => saveRow(userId, 'coach_views', { ...v, favourite: !v.favourite }), v.favourite ? 'Taken out of the menu' : 'Added to the menu', () => saveRow(userId, 'coach_views', v));
  };
  const others = coaches.filter((c) => c.active);
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Filter"
      className="ds-panel--toast-room"
      footer={<div className="cc-panel-foot"><TextLink onClick={() => setList({ ...list, filters: { tag: [], status: [], organisation: null, coach: null, fields: {} }, viewId: null })}>Clear</TextLink><Button variant="primary" onClick={onClose}>Show {count} {count === 1 ? 'client' : 'clients'}</Button></div>}
    >
      {tags.length > 0 && (
        <div className="cc-field"><span className="cc-field-label">Tags</span>
          <ChipRow label="Tags">{tags.map((t) => <Chip key={t.id} pressed={(f.tag || []).includes(t.id)} onClick={() => toggle('tag', t.id)}>{t.name}</Chip>)}</ChipRow>
        </div>
      )}
      <div className="cc-field"><span className="cc-field-label">Status</span>
        <ChipRow label="Status">{STAGES.map((s) => <Chip key={s.value} pressed={(f.status || []).includes(s.value)} onClick={() => toggle('status', s.value)}>{s.label}</Chip>)}</ChipRow>
      </div>
      {organisations.length > 0 && (
        <div className="cc-field"><Dropdown label="Organisation" options={[{ value: NONE, label: 'Any organisation' }, ...organisations.map((o) => ({ value: o.id, label: o.name })).sort((x, y) => x.label.localeCompare(y.label))]} value={f.organisation || NONE} onChange={(v) => set({ organisation: v === NONE ? null : v })} /></div>
      )}
      {isOwner && others.length > 1 && (
        <div className="cc-field"><Dropdown label="Coach" options={[{ value: NONE, label: 'Any coach' }, ...others.map((c) => ({ value: c.coach_id, label: c.coach_id === coach.id ? 'You' : c.full_name || c.first_name }))]} value={f.coach || NONE} onChange={(v) => set({ coach: v === NONE ? null : v })} /></div>
      )}
      {fields.filter((field) => field.kind === 'choice' || field.kind === 'text').map((field) => {
        const options = field.kind === 'choice' ? field.options || [] : [...new Set(values.filter((v) => v.field_id === field.id).map((v) => String(v.value_text ?? v.value_number ?? v.value_date ?? '')).filter(Boolean))].sort().slice(0, 24);
        if (!options.length) return null;
        const on = f.fields?.[field.id] || [];
        return (
          <div key={field.id} className="cc-field"><span className="cc-field-label">{field.name}</span>
            <ChipRow label={field.name}>
              {options.map((o) => <Chip key={o} pressed={on.includes(o)} onClick={() => toggleField(field.id, o)}>{o}</Chip>)}
              <Chip pressed={on.includes('none')} onClick={() => toggleField(field.id, 'none')}>Not set</Chip>
            </ChipRow>
          </div>
        );
      })}
      <div className="cc-part ds-section">
        <div className="ds-section-head"><h3 className="ds-section-title">Saved views</h3></div>
        {mine.map((v) => (
          <div key={v.id} className="cc-line">
            <span><button type="button" className="cc-table-name" onClick={() => { setList({ ...list, apply: v.id }); onClose(); }}>{v.name}</button></span>
            <span className="cc-line-actions">
              <TextLink aria-label={`${v.favourite ? 'Remove' : 'Add'} ${v.name} ${v.favourite ? 'from' : 'to'} the menu`} onClick={() => favourite(v)}>{v.favourite ? 'Remove from the menu' : 'Add to the menu'}</TextLink>
              <TextLink aria-label={`Delete the view ${v.name}`} onClick={() => done(() => removeRow(userId, 'coach_views', v.id).then(() => 'saved'), 'Deleted', () => saveRow(userId, 'coach_views', v))}>Delete</TextLink>
            </span>
          </div>
        ))}
        <div className="cc-field"><TextField label="Name this view" value={name} maxLength={60} placeholder="e.g. Media clients" onChange={(e) => { setName(e.target.value); setProblem(null); }} /></div>
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        <div className="cc-acts"><Button variant="outline" onClick={save}>Save as a view</Button></div>
      </div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- one client's tags
/** `kind`: whose tags these are, 'client' unless told ('lead' on a lead's page: run 4). `profile` is the person: its id and name. */
export function TagsPanel({ profile, onClose, kind = 'client' }) {
  const { userId, coach, tags, state } = useCoachPortal();
  const done = useDone();
  if (!profile) return <SlidePanel open={false} onClose={onClose} title="Tags" />;
  const links = rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === kind && l.item_id === profile.id);
  const toggle = (tag) => {
    const link = links.find((l) => l.tag_id === tag.id);
    const row = { tag_id: tag.id, item_kind: kind, item_id: profile.id, coach_id: coach.id };
    if (link) done(() => removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', link)).then(() => 'saved'), 'Saved', () => saveRow(userId, 'coach_tag_links', link));
    else done(() => saveRow(userId, 'coach_tag_links', row), 'Saved', () => removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', row)));
  };
  return (
    <SlidePanel open onClose={onClose} title="Tags">
      <p className="cc-quiet">{profile.name}</p>
      {tags.length === 0 && <p className="cc-quiet">You have no tags yet. Add them in Settings, under Tags and fields.</p>}
      <div className="cc-field"><ChipRow label="Tags">{tags.map((t) => <Chip key={t.id} pressed={links.some((l) => l.tag_id === t.id)} onClick={() => toggle(t)}>{t.name}</Chip>)}</ChipRow></div>
      <p className="cc-note">The same tags work on clients, leads, to-dos and the library. Clients never see them.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Add group, Add workshop
export function AddGroupPanel({ open, onClose, onAdded }) {
  const { userId, coach, organisations } = useCoachPortal();
  const done = useDone();
  const [name, setName] = useState('');
  const [org, setOrg] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setName(''); setOrg(null); setOrgName(''); setProblem(null); } }, [open]);
  const add = async () => {
    if (!clean(name)) { setProblem('Type the group’s name to carry on.'); return; }
    if (org === NEW && !clean(orgName)) { setProblem('Type the organisation’s name to carry on.'); return; }
    const id = newId();
    const ok = await done(async () => {
      const o = await organisationFor(userId, org, orgName, organisations);
      return saveRow(userId, 'coach_groups', { id, coach_id: coach.id, organisation_id: o.id, name: clean(name).slice(0, 120) });
    }, 'Group added', () => removeRow(userId, 'coach_groups', id));
    if (ok) { onClose(); onAdded?.(id); }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Add group" draftKey="group:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add group</Button></div>}>
      <div className="cc-field"><TextField label="Name" value={name} maxLength={120} placeholder="e.g. Leadership team" onChange={(e) => { setName(e.target.value); setProblem(null); }} /></div>
      <div className="cc-field"><OrganisationChoice value={org} onChange={setOrg} newName={orgName} onNewName={setOrgName} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

export const WORKSHOP_QUESTIONS = [
  { id: 'want', q: 'What do you want from the session?', kind: 'long', needed: true },
  { id: 'role', q: 'Your role', kind: 'short', needed: true },
  { id: 'know', q: 'Anything we should know?', kind: 'short', needed: false },
];
export const SURVEY_QUESTIONS = [
  { id: 'useful', q: 'How useful was it?', kind: 'rating' },
  { id: 'recommend', q: 'Would you recommend it?', kind: 'yesno' },
  { id: 'differently', q: 'What will you do differently?', kind: 'long' },
];

export function AddWorkshopPanel({ open, onClose, onAdded }) {
  const { userId, coach, organisations, settings, todayKey } = useCoachPortal();
  const done = useDone();
  const zones = useZoneOptions(settings.time_zone);
  const start = { title: '', org: null, orgName: '', day: '', from: '09:30', to: '12:30', zone: settings.time_zone || 'Europe/London', place: '', capacity: '20' };
  const [f, setF] = useState(start);
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setF(start); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const add = async () => {
    const title = clean(f.title);
    if (!title) { setProblem('Type the workshop’s title to carry on.'); return; }
    if (!f.day) { setProblem('Choose its day to carry on.'); return; }
    if (!/^\d{2}:\d{2}$/.test(f.from) || !/^\d{2}:\d{2}$/.test(f.to) || f.to <= f.from) { setProblem('The end time comes after the start.'); return; }
    const capacity = Number(f.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) { setProblem('Type the number of places, from 1 to 2000.'); return; }
    if (f.org === NEW && !clean(f.orgName)) { setProblem('Type the organisation’s name to carry on.'); return; }
    const id = newId();
    const ok = await done(async () => {
      const o = await organisationFor(userId, f.org, f.orgName, organisations);
      return saveRow(userId, 'workshops', {
        id, coach_id: coach.id, organisation_id: o.id, title: title.slice(0, 80), starts_at: instantAt(f.day, f.from, f.zone).toISOString(), ends_at: instantAt(f.day, f.to, f.zone).toISOString(), time_zone: f.zone,
        place: clean(f.place).slice(0, 120) || null, capacity, page_key: newId(), registration_open: false, registration_closes_on: null, questions: WORKSHOP_QUESTIONS,
        remind_day_before: true, remind_hour_before: false, survey_on: true, survey_questions: SURVEY_QUESTIONS, follow_up: null,
      });
    }, 'Workshop added', () => removeRow(userId, 'workshops', id));
    if (ok) { onClose(); onAdded?.(id); }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Add workshop" draftKey="workshop:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add workshop</Button></div>}>
      <div className="cc-field"><TextField label="Title" value={f.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} /></div>
      <div className="cc-field"><OrganisationChoice value={f.org} onChange={(v) => set({ org: v })} newName={f.orgName} onNewName={(v) => set({ orgName: v })} /></div>
      <div className="cc-field"><TextField label="Day" type="date" value={f.day} min={todayKey} onChange={(e) => set({ day: e.target.value })} /></div>
      <div className="cc-field cc-two">
        <TextField label="Starts" type="time" value={f.from} onChange={(e) => set({ from: e.target.value })} />
        <TextField label="Ends" type="time" value={f.to} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <div className="cc-field"><Dropdown label="Time zone" options={zones} value={f.zone} onChange={(v) => set({ zone: v })} /></div>
      <div className="cc-field"><TextField label="Place" value={f.place} maxLength={120} placeholder="e.g. In person, Leeds" onChange={(e) => set({ place: e.target.value })} /></div>
      <div className="cc-field"><TextField label="Places" inputMode="numeric" value={f.capacity} onChange={(e) => set({ capacity: e.target.value })} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}
