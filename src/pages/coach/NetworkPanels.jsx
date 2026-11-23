import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddButton, Button, Checkbox, Dropdown, InlineChoice, SearchField, SlidePanel, SwitchRow, TextBox, TextField, useToast } from '../../components/design';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { logActivity } from '../../lib/coach/actions';
import { toCsv } from '../../lib/coach/model';
import { canReadXlsx, xlsxBytes, xlsxTable } from '../../lib/coach/xlsx';
import { csvTable, emailsOn, EXPORT_FORMATS, EXPORT_HELP, exportName, hasHeadingRow, leadFromNetwork, leadOfPerson, matchColumns, sameId } from '../../lib/coach/crm';
import {
  archiveNetwork, importNetwork, mergeNetwork, networkDuplicatesOf, networkPageOf, networkPerson, removeNetworkGive, removeNetworkPeople, removeNetworkPerson, restoreNetwork, saveNetworkGive, saveNetworkPerson, unmergeNetwork,
} from '../../lib/coach/networkData';
import {
  ADD_RHYTHMS, ADD_WORDS, ARCHIVED_ONE, archivePlan, columnProblem, COLUMNS_WORDS, columnSwitches, contactChange, duplicateLine, exportChoices, exportQueries, exportRows, GIVE_WORDS, giveAskLine, giveCounts, giveDays,
  giveRows, howItIs, IMPORT_WORDS, importButtonWords, importedToast, importFileKind, importRows, importSummary, isNarrowed, lastSpokeLine, NETWORK_IMPORT_DROP, NETWORK_IMPORT_FIELDS, NETWORK_IMPORT_HELP, networkProblem,
  networkSheetRows, newColumn, newGive, newPerson, NO_RHYTHM, notNow, PANEL_WORDS, PERSON_GONE, PERSON_WORDS, personContacts, personSub, RATING_CHOICES, RATING_WORDS, ratingHistory, ratingOutOf, RATINGS, RATINGS_HELP,
  ratingsChange, READY_BUTTONS, readyQuery, readyRow, RESTORED, RHYTHMS, rhythmWords, ROLES, spokeLabel, spokeToday, spotPeople, spotTitle, stopKeeping, TABLE_WORDS, withColumnShown,
  mergedPersonWords, NETWORK_MERGE_WORDS, networkMergePlan, networkMergeValues,
} from '../../lib/coach/network';
import { Part, Row, TextLink, useCoachPortal } from './parts';
import { EmailRows } from './crmParts';
import { useStartStages } from './leadParts';
import { Problem, useNetworkActions, useNetworkAsk } from './networkParts';

// Network's panels (M11 seq 77): Add someone, one person (Contact, How it
// is, What you've given and What you've asked, each with its own Log,
// Move to Leads, Archive or Restore), Ready to archive?, the people at one
// spot of the map, Show or hide columns with Add column, Import a
// spreadsheet (duplicates first) and Export. Each is the shared side
// panel; no button is ever greyed out; nothing here sends anything: Email
// and WhatsApp open the coach's own apps. Every word and rule is network.js's.

const NONE = '__none__';
const rhythmOptions = (list) => [...list.map((m) => ({ value: String(m), label: rhythmWords(m) })), { value: NONE, label: NO_RHYTHM }];

// ---------------------------------------------------------------- Add someone
export function AddPersonPanel({ open, onClose, onAdded }) {
  const { userId, coach, todayKey } = useCoachPortal();
  const { act } = useNetworkActions();
  const start = { name: '', role: ROLES[0], rhythm: '3' };
  const [f, setF] = useState(start);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setF(start); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const add = async () => {
    if (busy.current) return;
    const made = newPerson({ id: newId(), coachId: coach.id, name: f.name, role: f.role, rhythm: f.rhythm === NONE ? null : Number(f.rhythm), today: todayKey });
    if (made.error) { setProblem(made.error); return; }
    busy.current = true;
    const ok = await act({ run: () => saveNetworkPerson(userId, made.person), message: made.toast, undo: () => removeNetworkPerson(userId, made.person.id) });
    busy.current = false;
    if (ok) { onClose(); onAdded?.(made.person); }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title={ADD_WORDS.title} draftKey="network-person:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>{ADD_WORDS.button}</Button></div>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="cc-field"><TextField label={ADD_WORDS.who} value={f.name} maxLength={120} autoComplete="off" onChange={(e) => set({ name: e.target.value })} /><Problem line={problem} /></div>
        <div className="cc-field"><Dropdown label={ADD_WORDS.role} options={ROLES.map((r) => ({ value: r, label: r }))} value={f.role} onChange={(v) => set({ role: v })} /></div>
        <div className="cc-field"><Dropdown label={ADD_WORDS.rhythm} options={rhythmOptions(ADD_RHYTHMS)} value={f.rhythm} onChange={(v) => set({ rhythm: v })} /></div>
      </form>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- one person
const KV = ({ label, children, quiet = false }) => <div className="cc-net-kv"><span>{label}</span><span className={quiet ? 'cc-net-kv-none' : undefined}>{children}</span></div>;

export function PersonPanel({ id, onClose }) {
  const { userId, coach, leads, leadStages, emails, emailLinks, todayKey } = useCoachPortal();
  useStartStages();
  const { act, change } = useNetworkActions();
  const toast = useToast();
  const navigate = useNavigate();
  const found = useNetworkAsk(id ? () => networkPerson(userId, id) : null, [id, userId]);
  const [sub, setSub] = useState(null); // 'contact' | 'ratings' | 'gave' | 'asked' | 'merge'
  const [draft, setDraft] = useState({});
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => { setSub(null); setProblem(null); }, [id]);
  const person = found.data?.person?.id === id ? found.data.person : null; // never an earlier person's answer
  // Merge into one (tidy follow-up 3, run 6's 36): who to merge with, found by search, then that person's own record.
  const mergeQ = sub === 'merge' ? draft.q || '' : null;
  const others = useNetworkAsk(mergeQ !== null && !draft.other ? () => networkPageOf(userId, { search: mergeQ, limit: 8 }) : null, [mergeQ, draft.other, userId]);
  const other = useNetworkAsk(sub === 'merge' && draft.other ? () => networkPerson(userId, draft.other) : null, [sub, draft.other, userId]);
  const gives = person ? found.data.gives || [] : [];
  const ratings = person ? found.data.ratings || [] : [];
  const back = () => { setSub(null); setProblem(null); };
  const open = (kind) => {
    setProblem(null);
    if (kind === 'contact') setDraft({ email: person.email || '', phone: person.phone || '' });
    if (kind === 'ratings') setDraft(Object.fromEntries(RATINGS.map((k) => [k, person[k] == null ? NONE : String(person[k])])));
    if (kind === 'gave' || kind === 'asked') setDraft({ kind: null, note: '', day: todayKey });
    if (kind === 'merge') setDraft({ q: '', other: null, choices: {} });
    setSub(kind);
  };
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setProblem(null); };
  /** A change from network.js: saved with its toast and Undo, or its calm line shown. Resolves whether it was kept. */
  const keep = async (plan) => {
    if (busy.current) return false;
    busy.current = true;
    const answer = await change(plan);
    busy.current = false;
    if (answer && answer.error) { setProblem(answer.error); return false; }
    return answer === true;
  };
  const saveSub = async () => {
    if (sub === 'contact' && await keep(contactChange(person, draft))) back();
    if (sub === 'ratings') {
      const typed = Object.fromEntries(RATINGS.map((k) => [k, draft[k] === NONE ? null : Number(draft[k])]));
      if (await keep(ratingsChange(person, typed, { today: todayKey, coachId: coach.id }))) back();
    }
    if (sub === 'gave' || sub === 'asked') {
      if (busy.current) return;
      const made = newGive({ id: newId(), coachId: coach.id, personId: person.id, direction: sub, kind: draft.kind, note: draft.note, today: draft.day || todayKey });
      if (made.error) { setProblem(made.error); return; }
      busy.current = true;
      const ok = await act({ run: () => saveNetworkGive(userId, made.give), message: made.toast, undo: () => removeNetworkGive(userId, made.give.id) });
      busy.current = false;
      if (ok) back();
    }
  };

  let title = person?.name || 'Network';
  let body = null;
  let footer = null;
  const subFoot = <div className="cc-panel-foot"><TextLink onClick={back}>Cancel</TextLink><Button variant="primary" onClick={saveSub}>{PANEL_WORDS.save}</Button></div>;

  if (id && !found.loading && !person) {
    body = <p className="cc-quiet">{found.error ? networkProblem(found.error) : PERSON_GONE}</p>;
  } else if (person && sub === 'contact') {
    title = PANEL_WORDS.contact;
    footer = subFoot;
    body = (
      <form noValidate onSubmit={(e) => { e.preventDefault(); saveSub(); }}>
        <p className="cc-net-who">{person.name}</p>
        <div className="cc-field"><TextField label={PANEL_WORDS.email} type="email" autoComplete="off" value={draft.email} onChange={(e) => set({ email: e.target.value })} /></div>
        <div className="cc-field"><TextField label={PANEL_WORDS.phone} type="tel" autoComplete="off" maxLength={40} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
        <Problem line={problem} />
      </form>
    );
  } else if (person && sub === 'ratings') {
    title = PANEL_WORDS.ratings;
    footer = subFoot;
    const options = [...RATING_CHOICES.map((n) => ({ value: String(n), label: String(n) })), { value: NONE, label: PANEL_WORDS.notRated }];
    const history = RATINGS.map((k) => [k, ratingHistory(ratings, k, todayKey)]).filter(([, list]) => list.length > 1);
    body = (
      <>
        <p className="cc-net-who">{person.name}</p>
        {RATINGS.map((k) => <div key={k} className="cc-field"><Dropdown label={RATING_WORDS[k].question} options={options} value={draft[k] ?? NONE} onChange={(v) => set({ [k]: v })} /></div>)}
        <p className="cc-note">{RATINGS_HELP}</p>
        <Problem line={problem} />
        {history.length > 0 && (
          <Part title={PANEL_WORDS.history}>
            {history.map(([k, list]) => list.slice(0, 4).map((h, i) => (
              <div key={`${k}${i}`} className="cc-net-give"><span><b>{RATING_WORDS[k].label}, {h.value}</b>{h.change && <small>{h.change}</small>}</span><span className="cc-row-when">{h.when}</span></div>
            )))}
          </Part>
        )}
      </>
    );
  } else if (person && sub === 'merge') {
    const W = NETWORK_MERGE_WORDS;
    title = W.title;
    const b = draft.other && other.data?.person?.id === draft.other ? other.data.person : null;
    if (!draft.other) {
      const found2 = (others.data?.rows || []).filter((r) => r.id !== person.id && !r.merged_into);
      footer = <div className="cc-panel-foot"><TextLink onClick={back}>{W.back}</TextLink><Button variant="primary" onClick={() => setProblem(W.choose)}>{W.button}</Button></div>;
      body = (
        <>
          <p className="cc-net-who">{person.name}</p>
          <p className="cc-quiet">{W.who}</p>
          <div className="cc-field"><SearchField label={W.search} placeholder={W.search} value={draft.q || ''} onChange={(v) => set({ q: v })} /></div>
          <div className="cc-rows">
            {found2.map((r) => <Row key={r.id} title={r.name} facts={[personSub(r)]} onClick={() => set({ other: r.id, choices: {} })} />)}
          </div>
          {!others.loading && found2.length === 0 && <p className="cc-quiet">{W.none}</p>}
          <Problem line={problem} />
        </>
      );
    } else {
      const plan = networkMergePlan(person, b) || [];
      const choices = draft.choices || {};
      const merge = async () => {
        if (busy.current || !b) return;
        busy.current = true;
        let mergeId = null;
        const ok = await act({
          run: async () => { mergeId = await mergeNetwork(userId, person.id, b.id, networkMergeValues(choices)); return 'saved'; },
          message: mergedPersonWords({ name: choices.name === 'b' ? b.name : person.name }),
          undo: () => unmergeNetwork(userId, mergeId),
        });
        busy.current = false;
        if (ok) back();
      };
      footer = <div className="cc-panel-foot"><TextLink onClick={() => set({ other: null, choices: {} })}>{W.back}</TextLink><Button variant="primary" onClick={merge}>{W.button}</Button></div>;
      body = !b ? <p className="cc-quiet">{other.loading ? '' : other.error ? networkProblem(other.error) : PERSON_GONE}</p> : (
        <>
          <p className="cc-quiet">{W.intro}</p>
          <div className="cc-merge-head" aria-hidden="true"><span /><span>{person.name}</span><span>{b.name}</span></div>
          {plan.map((row) => (
            <div key={row.key} className="cc-merge-row" role={row.choose ? 'radiogroup' : undefined} aria-label={row.choose ? row.label : undefined}>
              <span className="cc-merge-label">{row.label}</span>
              {row.choose ? (
                <>
                  <button type="button" role="radio" className="cc-merge-choice" aria-checked={(choices[row.key] || 'a') === 'a'} onClick={() => set({ choices: { ...choices, [row.key]: 'a' } })}>{row.a}</button>
                  <button type="button" role="radio" className="cc-merge-choice" aria-checked={choices[row.key] === 'b'} onClick={() => set({ choices: { ...choices, [row.key]: 'b' } })}>{row.b}</button>
                </>
              ) : <span className="cc-merge-one">{row.one}</span>}
            </div>
          ))}
          <p className="cc-note">{W.nothingLost}</p>
          <Problem line={problem} />
        </>
      );
    }
  } else if (person && (sub === 'gave' || sub === 'asked')) {
    const words = GIVE_WORDS[sub];
    title = words.log;
    footer = subFoot;
    body = (
      <>
        <p className="cc-net-who">{person.name}</p>
        <div className="cc-field"><InlineChoice label={PANEL_WORDS.kind} options={words.kinds.map(([value, label]) => ({ value, label }))} value={draft.kind} onChange={(v) => set({ kind: v })} form="rows" /></div>
        <div className="cc-field"><TextBox label={words.question} value={draft.note || ''} maxLength={600} onChange={(v) => set({ note: v })} /></div>
        <div className="cc-field"><Dropdown label={PANEL_WORDS.when} options={giveDays(todayKey)} value={draft.day || todayKey} onChange={(v) => set({ day: v })} /></div>
        <Problem line={problem} />
      </>
    );
  } else if (person) {
    const archived = Boolean(person.archived_at);
    const how = howItIs(person);
    const counts = giveCounts(gives, person.id);
    const gave = giveRows(gives, 'gave', todayKey);
    const asked = giveRows(gives, 'asked', todayKey);
    const contacts = personContacts(person);
    const lead = leadOfPerson(leads, person.id);
    const mail = emailsOn(emails, emailLinks, 'network', person.id, todayKey, person);
    const move = async () => {
      if (lead) { navigate(`/coach/leads/${lead.id}`); return; }
      // Its ids are made from the person's (sameId): pressed twice, or in two tabs, it is one lead with one line.
      const made = leadFromNetwork(person, { id: sameId(person.id, 0x1ead) || newId(), eventId: sameId(person.id, 0x1eae) || newId(), coachId: coach.id, stages: leadStages, nowIso: new Date().toISOString(), todayKey });
      if (made.error) { toast.error(made.error); return; }
      await act({
        run: () => saveRows(userId, [['coach_leads', made.lead], ['coach_lead_events', made.event]]), message: made.toast,
        undo: async () => { await removeRow(userId, 'coach_lead_events', made.event.id).catch(() => {}); await removeRow(userId, 'coach_leads', made.lead.id); },
      });
    };
    const archive = async () => { if (await act({ run: () => archiveNetwork(userId, [person.id], []), message: ARCHIVED_ONE, undo: () => restoreNetwork(userId, [person.id], []) })) onClose(); };
    const restore = () => act({ run: () => restoreNetwork(userId, [person.id], []), message: RESTORED, undo: () => archiveNetwork(userId, [person.id], []) });
    const side = (rows) => rows.map((r) => <div key={r.id} className="cc-net-give"><span><b>{r.kind}</b>{r.note && <small>{r.note}</small>}</span><span className="cc-row-when">{r.when}</span></div>);
    body = (
      <>
        {personSub(person) && <p className="cc-net-who">{personSub(person)}</p>}
        <p className="cc-quiet">{lastSpokeLine(person, todayKey)}</p>
        {archived && <p className="cc-note">{PERSON_WORDS.archivedNote}</p>}
        <div className="cc-field">
          <Dropdown label={PERSON_WORDS.howOften} options={rhythmOptions([...new Set([...RHYTHMS, ...(person.rhythm_months ? [person.rhythm_months] : [])])].sort((a, b) => a - b))} value={person.rhythm_months ? String(person.rhythm_months) : NONE}
            onChange={(v) => keep({ patch: { id: person.id, rhythm_months: v === NONE ? null : Number(v) }, undo: { id: person.id, rhythm_months: person.rhythm_months ?? null }, toast: TABLE_WORDS.saved })} />
        </div>
        <div className="cc-acts cc-net-acts">
          <Button variant="outline" onClick={() => keep(spokeToday(person, todayKey))}>{spokeLabel(person)}</Button>
          {contacts.map((c) => <a key={c.key} className="ds-link" href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel={c.key === 'whatsapp' ? 'noreferrer' : undefined}>{c.label}</a>)}
        </div>
        {person.rhythm_months != null && (
          <div className="cc-acts">
            <TextLink onClick={() => keep(notNow(person, todayKey))}>{PERSON_WORDS.notNow}</TextLink>
            <TextLink onClick={() => keep(stopKeeping(person))}>{PERSON_WORDS.stop}</TextLink>
          </div>
        )}
        <Problem line={problem} />

        <Part title={PERSON_WORDS.contact}>
          <KV label={PANEL_WORDS.email} quiet={!person.email}>{person.email || 'Not added yet'}</KV>
          <KV label={PANEL_WORDS.phone} quiet={!person.phone}>{person.phone || 'Not added yet'}</KV>
          <div className="cc-acts"><TextLink onClick={() => open('contact')}>{PERSON_WORDS.editContact}</TextLink></div>
        </Part>

        <Part title={PERSON_WORDS.howItIs}>
          <p className="cc-net-how"><b>{how.label}</b><small>{how.line}</small></p>
          {RATINGS.map((k) => <KV key={k} label={RATING_WORDS[k].label} quiet={person[k] == null}>{ratingOutOf(person[k]) || PANEL_WORDS.notRated}</KV>)}
          <div className="cc-acts"><TextLink onClick={() => open('ratings')}>{PERSON_WORDS.editRatings}</TextLink></div>
        </Part>

        <Part title={GIVE_WORDS.gave.title}>
          <p className="cc-quiet">{giveAskLine(counts.given, counts.asked)}</p>
          {side(gave)}
          <div className="cc-acts"><TextLink onClick={() => open('gave')}>{GIVE_WORDS.gave.log}</TextLink></div>
        </Part>

        <Part title={GIVE_WORDS.asked.title}>
          {asked.length === 0 && <p className="cc-quiet">{GIVE_WORDS.asked.none}</p>}
          {side(asked)}
          <div className="cc-acts"><TextLink onClick={() => open('asked')}>{GIVE_WORDS.asked.log}</TextLink></div>
        </Part>

        {mail.length > 0 && <Part title="Emails"><EmailRows rows={mail} /></Part>}

        <div className="cc-acts cc-net-end">
          <TextLink onClick={move}>{lead ? PERSON_WORDS.openLead : PERSON_WORDS.moveToLeads}</TextLink>
          {!archived && <TextLink onClick={() => open('merge')}>{PERSON_WORDS.merge}</TextLink>}
          {archived ? <TextLink onClick={restore}>{PERSON_WORDS.restore}</TextLink> : <TextLink onClick={archive}>{PERSON_WORDS.archive}</TextLink>}
        </div>
      </>
    );
  }
  return <SlidePanel open={Boolean(id)} onClose={onClose} title={title} footer={footer} className="cc-net-person">{body}</SlidePanel>;
}

// ---------------------------------------------------------------- Ready to archive?
export function ReadyPanel({ open, onClose }) {
  const { userId, todayKey } = useCoachPortal();
  const { act } = useNetworkActions();
  const [page, setPage] = useState(null); // null until the list has come: never "0 people" while it is on its way, or can't come
  const [unticked, setUnticked] = useState({});
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  // Read once as it opens: the list never moves under the ticks.
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setUnticked({}); setProblem(null); setPage(null);
    networkPageOf(userId, readyQuery(todayKey)).then((p) => { if (live) setPage({ rows: p.rows, total: p.total }); }).catch((e) => { if (live) setProblem(networkProblem(e)); });
    return () => { live = false; };
  }, [open, userId, todayKey]);
  const plan = archivePlan((page?.rows || []).map((p) => p.id), Object.keys(unticked).filter((k) => unticked[k]));
  const go = async () => {
    if (busy.current) return;
    if (!page) { if (!problem) setProblem('The list is still on its way. Try again in a moment.'); return; }
    if (plan.needs) { setProblem(plan.needs); return; }
    busy.current = true;
    const ok = await act({ run: () => archiveNetwork(userId, plan.archive, plan.keep), message: plan.toast, undo: () => restoreNetwork(userId, plan.archive, plan.keep) });
    busy.current = false;
    if (ok) onClose();
  };
  const n = page?.total || 0;
  return (
    <SlidePanel open={open} onClose={onClose} title={READY_BUTTONS.title} footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>{READY_BUTTONS.cancel}</TextLink><Button variant="primary" onClick={go}>{page ? plan.button : 'Archive'}</Button></div>}>
      {page && <p className="cc-net-who">{n === 1 ? '1 person' : `${n.toLocaleString('en-GB')} people`}</p>}
      <p className="cc-quiet">No contact for 18 months, and not in a focus list.</p>
      <Problem line={problem} />
      <div className="cc-net-ready">
        {(page?.rows || []).map((p) => {
          const r = readyRow(p, todayKey);
          return (
            <Checkbox key={r.id} checked={!unticked[r.id]} onChange={(on) => { setUnticked((u) => ({ ...u, [r.id]: !on })); setProblem(null); }} after={<span className="cc-row-when">{r.last}</span>}>
              <span className="cc-net-ready-who"><b>{r.name}</b>{r.organisation && <small>{r.organisation}</small>}</span>
            </Checkbox>
          );
        })}
      </div>
      {page && page.total > page.rows.length && <p className="cc-note">The next {(page.total - page.rows.length).toLocaleString('en-GB')} show once these are done.</p>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- the people at one spot of the map
export function SpotPanel({ spot, rows, onClose, onOpen }) {
  const { todayKey } = useCoachPortal();
  const head = spot ? spotTitle(spot) : { title: '', meta: '' };
  return (
    <SlidePanel open={Boolean(spot)} onClose={onClose} title={head.title}>
      <p className="cc-net-who">{head.meta}</p>
      <div className="cc-rows">
        {spot && spotPeople(rows, spot, todayKey).map((p) => (
          <button key={p.id} type="button" className="cc-row" onClick={() => onOpen(p.id)}>
            <span><b>{p.name}</b><small>{[p.organisation, p.list].filter(Boolean).map((w) => <span key={w}>{w}</span>)}</small></span>
            <span className="cc-row-when">{p.due}</span>
          </button>
        ))}
      </div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Show or hide columns, and Add column
export function ColumnsPanel({ open, onClose, adding = false }) {
  const { userId, coach, settings, networkColumns } = useCoachPortal();
  const toast = useToast();
  const [add, setAdd] = useState(adding);
  const [f, setF] = useState({ name: '', kind: 'text' });
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setAdd(adding); setF({ name: '', kind: 'text' }); setProblem(null); } }, [open, adding]);
  const oops = () => toast.error(networkProblem(null));
  const flip = (c, shown) => {
    if (c.own) saveRow(userId, 'network_columns', { ...c.own, hidden: !shown }).catch(oops);
    else saveRow(userId, 'coach_settings', { ...settings, crm: withColumnShown(settings.crm, c.key, shown) }).catch(oops);
  };
  const make = async () => {
    const line = columnProblem(f.name, networkColumns);
    if (line) { setProblem(line); return; }
    const column = newColumn({ id: newId(), coachId: coach.id, name: f.name, kind: f.kind, columns: networkColumns });
    try {
      const status = await saveRow(userId, 'network_columns', column);
      toast.saved({ message: status === 'queued' ? 'Will sync' : COLUMNS_WORDS.added, long: true, onUndo: () => removeRow(userId, 'network_columns', column.id).catch(oops) });
      if (adding) onClose(); else { setAdd(false); setF({ name: '', kind: 'text' }); }
    } catch (e) { setProblem(networkProblem(e)); }
  };
  if (add) {
    return (
      <SlidePanel open={open} onClose={onClose} title={COLUMNS_WORDS.add} footer={<div className="cc-panel-foot">{adding ? <span /> : <TextLink onClick={() => { setAdd(false); setProblem(null); }}>Cancel</TextLink>}<Button variant="primary" onClick={make}>{COLUMNS_WORDS.add}</Button></div>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); make(); }}>
          <div className="cc-field"><TextField label={COLUMNS_WORDS.name} value={f.name} maxLength={40} autoComplete="off" onChange={(e) => { setF((v) => ({ ...v, name: e.target.value })); setProblem(null); }} /><Problem line={problem} /></div>
          <div className="cc-field"><Dropdown label={COLUMNS_WORDS.kind} options={COLUMNS_WORDS.kinds.map(([value, label]) => ({ value, label }))} value={f.kind} onChange={(v) => setF((x) => ({ ...x, kind: v }))} /></div>
        </form>
      </SlidePanel>
    );
  }
  return (
    <SlidePanel open={open} onClose={onClose} title={COLUMNS_WORDS.title}>
      <div className="cc-net-switches">
        {columnSwitches(networkColumns, settings.crm).map((c) => <SwitchRow key={c.key} label={c.label} note={c.note} checked={c.shown} onChange={(on) => flip(c, on)} />)}
      </div>
      <div className="cc-add"><AddButton onClick={() => { setAdd(true); setProblem(null); }}>{COLUMNS_WORDS.add}</AddButton></div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Import a spreadsheet
export function ImportPanel({ open, onClose }) {
  const { userId, coach, networkColumns, todayKey } = useCoachPortal();
  const { act } = useNetworkActions();
  const [table, setTable] = useState(null); // the file's rows of cells
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState({}); // a column's index to the field the coach chose ('' leaves it out)
  const [anyway, setAnyway] = useState({}); // a duplicate's row number, when it is to be added all the same
  const [dupes, setDupes] = useState([]);
  const [problem, setProblem] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const busy = useRef(false);
  const reset = () => { setChosen({}); setAnyway({}); setDupes([]); setProblem(null); };
  useEffect(() => { if (open) { setTable(null); setText(''); reset(); } }, [open]);
  const sheet = useMemo(() => {
    const cells = table || csvTable(text);
    if (!cells.length) return null;
    const headed = hasHeadingRow(cells[0], NETWORK_IMPORT_FIELDS);
    const width = Math.min(60, Math.max(...cells.map((r) => r.length)));
    const headings = Array.from({ length: width }, (_, i) => (headed ? cells[0][i] || '' : ''));
    const body = headed ? cells.slice(1) : cells;
    return { body, columns: matchColumns(headings, NETWORK_IMPORT_FIELDS).columns.map((c) => ({ ...c, sample: body.find((r) => r[c.index])?.[c.index] || '' })) };
  }, [table, text]);
  const columns = useMemo(() => (sheet ? sheet.columns.map((c) => ({ ...c, field: chosen[c.index] !== undefined ? chosen[c.index] || null : c.field })) : []), [sheet, chosen]);
  const named = columns.some((c) => ['name', 'first', 'last'].includes(c.field));
  const read = useMemo(() => (sheet ? networkSheetRows(sheet.body, columns) : { rows: [], skipped: 0 }), [sheet, columns]);
  const rows = useMemo(() => importRows(read.rows, { today: todayKey, columns: networkColumns }), [read, todayKey, networkColumns]);
  // Duplicates first: asked of everyone in Network (the database's own question once 052 is there), before anyone is added.
  useEffect(() => {
    if (!open || !rows.length) { setDupes([]); return undefined; }
    let live = true;
    networkDuplicatesOf(userId, rows).then((d) => { if (live) setDupes(d || []); }).catch((e) => { if (live) setProblem(networkProblem(e)); });
    return () => { live = false; };
  }, [open, rows, userId]);
  const dupeAt = new Map(dupes.map((d) => [d.index, d]));
  const adding = rows.filter((_, i) => !dupeAt.has(i) || anyway[i]);
  const readFile = async (file) => {
    if (!file) return;
    const how = importFileKind(file.name, file.size);
    if (how.problem) { setProblem(how.problem); return; }
    try {
      if (how.kind === 'xlsx') {
        if (!canReadXlsx()) { setProblem(IMPORT_WORDS.unreadable); return; }
        const cells = await xlsxTable(new Uint8Array(await file.arrayBuffer()));
        reset(); setText(''); setTable(cells.length ? cells : null);
        if (!cells.length) setProblem(IMPORT_WORDS.empty);
      } else { const t = await file.text(); reset(); setTable(null); setText(t); if (!csvTable(t).length) setProblem(IMPORT_WORDS.empty); }
    } catch { setProblem(IMPORT_WORDS.unreadable); }
  };
  const choose = (index, field) => {
    // A field is one column's at a time: choosing it for another takes it from the first.
    setChosen((c) => { const next = { ...c, [index]: field }; if (field) for (const col of columns) if (col.index !== index && col.field === field) next[col.index] = ''; return next; });
    setAnyway({}); setProblem(null);
  };
  const add = async () => {
    if (busy.current) return;
    if (!sheet) { setProblem(IMPORT_WORDS.none); return; }
    if (!named) { setProblem(IMPORT_WORDS.needsName); return; }
    if (read.rows.length > 5000) { setProblem(IMPORT_WORDS.tooMany); return; }
    if (!rows.length) { setProblem(IMPORT_WORDS.empty); return; }
    if (!adding.length) { setProblem(IMPORT_WORDS.allThere); return; }
    busy.current = true;
    let ids = [];
    const ok = await act({ run: async () => { const made = await importNetwork(userId, coach.id, adding.map((r) => ({ ...r, id: newId() }))); ids = made.ids; return 'saved'; }, message: importedToast(adding.length), undo: () => removeNetworkPeople(userId, ids) });
    busy.current = false;
    if (ok) { logActivity(userId, coach, 'other', `imported ${adding.length} ${adding.length === 1 ? 'person' : 'people'} into Network.`); onClose(); }
  };
  const fieldOptions = [{ value: NONE, label: 'Leave out' }, ...NETWORK_IMPORT_FIELDS.map((f) => ({ value: f.key, label: f.label }))];
  return (
    <SlidePanel open={open} onClose={onClose} title={IMPORT_WORDS.title} draftKey="network-import" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>{adding.length ? importButtonWords(adding.length) : 'Add people'}</Button></div>}>
      <div className={`cc-net-drop${over ? ' cc-net-drop--over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer?.files?.[0]); }}>
        <p>{NETWORK_IMPORT_DROP}</p>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>{IMPORT_WORDS.choose}</Button>
        <input ref={fileRef} className="cc-hidden-file" type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabIndex={-1} aria-hidden="true" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <p className="cc-note">{NETWORK_IMPORT_HELP}</p>
      {!table && (
        <div className="cc-field">
          <label className="cc-field-label" htmlFor="cc-net-paste">{IMPORT_WORDS.paste}</label>
          <textarea id="cc-net-paste" className="cc-paste" rows={4} value={text} onChange={(e) => { setText(e.target.value); reset(); }} />
        </div>
      )}
      <Problem line={problem} />
      {sheet && (
        <div aria-live="polite">
          <p className="cc-quiet">{importSummary({ adding: adding.length, duplicates: dupes.length, skipped: read.skipped })}</p>
          {dupes.length > 0 && (
            <Part title={IMPORT_WORDS.duplicates}>
              {dupes.slice(0, 100).map((d) => (
                <div key={d.index} className="cc-line">
                  <span><b>{rows[d.index]?.name}</b><small>{duplicateLine(d)}</small></span>
                  <TextLink aria-pressed={Boolean(anyway[d.index])} aria-label={`${anyway[d.index] ? IMPORT_WORDS.leaveOut : IMPORT_WORDS.addAnyway}: ${rows[d.index]?.name}`} onClick={() => setAnyway((a) => ({ ...a, [d.index]: !a[d.index] }))}>{anyway[d.index] ? IMPORT_WORDS.leaveOut : IMPORT_WORDS.addAnyway}</TextLink>
                </div>
              ))}
              {dupes.length > 100 && <p className="cc-note">And {(dupes.length - 100).toLocaleString('en-GB')} more, left out.</p>}
            </Part>
          )}
          <Part title={IMPORT_WORDS.columns}>
            {columns.map((c) => (
              <div key={c.index} className="cc-field"><Dropdown label={c.heading || (c.sample ? `Column ${c.index + 1}, “${c.sample.slice(0, 40)}”` : `Column ${c.index + 1}`)} options={fieldOptions} value={c.field || NONE} onChange={(v) => choose(c.index, v === NONE ? '' : v)} /></div>
            ))}
          </Part>
          <div className="cc-preview">
            {adding.slice(0, 50).map((row, i) => (
              <div key={i} className="cc-preview-row cc-preview-row--new">
                <span>{row.name}<small>{[row.email, row.organisation].filter(Boolean).join(', ')}</small></span>
                <span>New</span>
              </div>
            ))}
            {adding.length > 50 && <p className="cc-note">And {(adding.length - 50).toLocaleString('en-GB')} more.</p>}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Export
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

export function ExportPanel({ open, onClose, state, counts }) {
  const { userId, coach, networkColumns, todayKey } = useCoachPortal();
  const toast = useToast();
  const narrowed = isNarrowed(state) && !state.archived;
  const [what, setWhat] = useState('all');
  const [format, setFormat] = useState('xlsx');
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setWhat(state.archived ? 'archived' : narrowed ? 'view' : 'all'); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const go = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // A page at a time, never everyone in one question.
      const first = exportQueries(what, state, 1, todayKey)[0];
      const one = await networkPageOf(userId, first, networkColumns);
      const people = [...one.rows];
      for (const q of exportQueries(what, state, one.total, todayKey).slice(1)) people.push(...(await networkPageOf(userId, q, networkColumns)).rows);
      const rows = exportRows(people, networkColumns, todayKey);
      const name = exportName('Network', todayKey);
      if (format === 'csv') download(`${name}.csv`, `﻿${toCsv(rows)}`, 'text/csv;charset=utf-8');
      else download(`${name}.xlsx`, xlsxBytes(rows, 'Network'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      logActivity(userId, coach, 'export', `exported ${people.length} ${people.length === 1 ? 'person' : 'people'} from Network to a spreadsheet.`);
      toast.show('Downloaded');
      onClose();
    } catch (e) { setProblem(networkProblem(e)); } finally { busy.current = false; }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Export to a spreadsheet" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={go}>Download</Button></div>}>
      <div className="cc-field"><Dropdown label="What to export" options={exportChoices(counts.view, counts.active, narrowed).filter((o) => o.value !== 'archived' || counts.archived > 0)} value={what} onChange={setWhat} /></div>
      <div className="cc-field"><InlineChoice label="Format" options={EXPORT_FORMATS.map(([value, label]) => ({ value, label }))} value={format} onChange={setFormat} form="pills" /></div>
      <p className="cc-note">{EXPORT_HELP}</p>
      <Problem line={problem} />
    </SlidePanel>
  );
}
