import { useEffect, useMemo, useRef, useState } from 'react';
import { AddButton, Button, Chip, ChipRow, Dropdown, IconButton, InlineChoice, SlidePanel, SwitchRow, TextBox, TextField, useToast } from '../../components/design';
import { keyOf, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { logActivity } from '../../lib/coach/actions';
import { leadMerge, leadUnmerge } from '../../lib/coach/crmData';
import { emailBody } from '../../lib/coach/networkData';
import { canFavourite, FAVOURITES_FULL, fieldValue, fieldWords, firstName } from '../../lib/coach/model';
import { canReadXlsx, xlsxBytes, xlsxTable } from '../../lib/coach/xlsx';
import {
  COLD_CHECKS, COLD_REASONS, crmProblem, csvTable, duplicateWords, emailPanel, EMPTY_LEAD_FILTERS, EXPORT_FORMATS, EXPORT_HELP, exportName, exportWhat, followUpDays, hasHeadingRow,
  hideThread, IMPORT_EMPTY, IMPORT_HELP, IMPORT_MAX, IMPORT_NEEDS_NAME, IMPORT_TOO_MANY, importButton, importedWords, importFileProblem, IMPORT_UNREADABLE, isXlsxFile, KEPT_AS_TWO, LEAD_IMPORT_FIELDS,
  LEAD_SOURCES, leadExportRows, leadFromImport, leadImportPlan, leadMergeDevice, leadMergePlan, leadsCsv, leadUnmergeDevice, leadViewFromList, matchColumns, MERGE_INTRO,
  MERGE_NOTHING_LOST, mergedLead, mergedWords, mergePair, moveLeadsQuestion, QUALIFY, sheetRows, stageOf, STAGES_HELP, stagesDraft, stagesSavePlan, whereTitle, withNotSame,
} from '../../lib/coach/crm';
import { TextLink, useCoachPortal } from './parts';
import { SAVE_PROBLEM, useLeadActions, useLeadData } from './leadParts';

// The Leads pages' panels (M11 seq 77): Add lead, Edit details, Log a call
// with what you learned, Add note, Where a lead is, Mark as cold, Edit
// stages, Import from a spreadsheet (duplicates first), Export, Merge into
// one, Filter with saved views, and an email on a timeline. Each is the
// shared side panel, and no button is ever greyed out: pressed too early,
// it says what's missing. Nothing here sends anything.

const NONE = '__none__';
const calm = (error) => crmProblem(error);
const Problem = ({ line }) => (line ? <p className="cc-problem" role="alert">{line}</p> : null);

// ---------------------------------------------------------------- Add lead
export function AddLeadPanel({ open, onClose, onAdded }) {
  const actions = useLeadActions();
  const start = { name: '', email: '', organisation: '', source: 'referral', referredBy: '' };
  const [f, setF] = useState(start);
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setF(start); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const add = async () => {
    const answer = await actions.add(f);
    if (answer?.error) { setProblem(answer); return; }
    if (answer) { onClose(); onAdded?.(answer); }
  };
  const at = (key) => (problem?.at === key ? <Problem line={problem.error} /> : null);
  return (
    <SlidePanel open={open} onClose={onClose} title="Add lead" draftKey="lead:new" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>Add lead</Button></div>}>
      <div className="cc-field"><TextField label="Who is it?" value={f.name} maxLength={120} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />{at('name')}</div>
      <div className="cc-field"><TextField label="What’s their email?" type="email" value={f.email} autoComplete="off" onChange={(e) => set({ email: e.target.value })} />{at('email')}</div>
      <div className="cc-field"><TextField label="Which organisation?" value={f.organisation} maxLength={120} autoComplete="off" onChange={(e) => set({ organisation: e.target.value })} /></div>
      <div className="cc-field"><Dropdown label="Where did they come from?" options={LEAD_SOURCES.map(([value, label]) => ({ value, label }))} value={f.source} onChange={(v) => set({ source: v })} /></div>
      {f.source === 'referral' && <div className="cc-field"><TextField label="Who referred them?" value={f.referredBy} maxLength={120} autoComplete="off" onChange={(e) => set({ referredBy: e.target.value })} /></div>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Edit details
export function EditLeadPanel({ lead, onClose }) {
  const { leadStages } = useCoachPortal();
  const actions = useLeadActions();
  const [f, setF] = useState({});
  const [problem, setProblem] = useState(null);
  const id = lead?.id || null;
  useEffect(() => {
    if (!lead) return;
    setF({ name: lead.name || '', organisation: lead.organisation || '', job_title: lead.job_title || '', email: lead.email || '', phone: lead.phone || '', stageId: lead.stage_id || null, next_step: lead.next_step || '',
      next_step_on: lead.next_step_on || '', value: lead.value == null ? '' : String(lead.value), source: LEAD_SOURCES.some(([k]) => k === lead.source) ? lead.source : 'other', referred_by: lead.referred_by || '', notes: lead.notes || '' });
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!lead) return <SlidePanel open={false} onClose={onClose} title="Edit details" />;
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const save = async () => {
    // Where they came from is kept as it was unless another is chosen (a booking page's lead stays a booking page's).
    const answer = await actions.details(lead, { ...f, source: f.source === 'other' && !LEAD_SOURCES.some(([k]) => k === lead.source) ? lead.source : f.source });
    if (answer?.error) { setProblem(answer); return; }
    if (answer) onClose();
  };
  const at = (key) => (problem?.at === key ? <Problem line={problem.error} /> : null);
  const cold = Boolean(lead.cold_at);
  return (
    <SlidePanel open onClose={onClose} title="Edit details" draftKey={`lead-edit:${lead.id}`} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
      <div className="cc-field"><TextField label="Name" value={f.name || ''} maxLength={120} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />{at('name')}</div>
      <div className="cc-field"><TextField label="Organisation" value={f.organisation || ''} maxLength={120} autoComplete="off" onChange={(e) => set({ organisation: e.target.value })} /></div>
      <div className="cc-field"><TextField label="Role" value={f.job_title || ''} maxLength={120} autoComplete="off" onChange={(e) => set({ job_title: e.target.value })} /></div>
      <div className="cc-field"><TextField label="Email" type="email" value={f.email || ''} autoComplete="off" onChange={(e) => set({ email: e.target.value })} />{at('email')}</div>
      <div className="cc-field"><TextField label="Mobile" type="tel" value={f.phone || ''} maxLength={40} autoComplete="off" onChange={(e) => set({ phone: e.target.value })} /></div>
      {!cold && !lead.won_at && <div className="cc-field"><Dropdown label="Stage" options={leadStages.map((s) => ({ value: s.id, label: s.name }))} value={f.stageId} onChange={(v) => set({ stageId: v })} /></div>}
      {!lead.won_at && (
        <div className="cc-field cc-two">
          <TextField label="Next step" value={f.next_step || ''} maxLength={200} autoComplete="off" onChange={(e) => set({ next_step: e.target.value })} />
          <TextField label="Its day" type="date" value={f.next_step_on || ''} onChange={(e) => set({ next_step_on: e.target.value })} />
        </div>
      )}
      <div className="cc-field"><TextField label="Value" inputMode="decimal" value={f.value || ''} placeholder="e.g. 13,500" autoComplete="off" onChange={(e) => set({ value: e.target.value })} />{at('value')}</div>
      <div className="cc-field"><Dropdown label="Where they came from" options={LEAD_SOURCES.map(([value, label]) => ({ value, label }))} value={f.source} onChange={(v) => set({ source: v })} /></div>
      {f.source === 'referral' && <div className="cc-field"><TextField label="Who referred them?" value={f.referred_by || ''} maxLength={120} autoComplete="off" onChange={(e) => set({ referred_by: e.target.value })} /></div>}
      <div className="cc-field"><TextBox label="Notes" value={f.notes || ''} maxLength={6000} onChange={(v) => set({ notes: v })} /></div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Log a call, with what you learned
export function LogCallPanel({ lead, onClose }) {
  const { leadStages, callTypes, todayKey } = useCoachPortal();
  const actions = useLeadActions();
  const [f, setF] = useState({});
  const [problem, setProblem] = useState(null);
  const id = lead?.id || null;
  useEffect(() => {
    if (!lead) return;
    setF({ how: '', next: '', when: '3', day: '', stageId: lead.stage_id || null, learned: Object.fromEntries(QUALIFY.map((q) => [q.key, lead[q.key] || ''])) });
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!lead) return <SlidePanel open={false} onClose={onClose} title="Log a call" />;
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const days = followUpDays(todayKey);
  const save = async () => {
    const chosen = days.find((d) => d.value === f.when);
    if (String(f.next || '').trim() && f.when === 'pick' && !f.day) { setProblem('Choose a day to carry on.'); return; }
    const answer = await actions.call(lead, { how: f.how, next: f.next, nextOn: f.when === 'pick' ? f.day || null : chosen?.day || null, stageId: f.stageId, learned: f.learned, callName: callTypes.find((t) => t.key === lead.call_type_key)?.name || '' });
    if (answer?.error) { setProblem(answer.error); return; }
    if (answer) onClose();
  };
  return (
    <SlidePanel open onClose={onClose} title={`Log a call with ${firstName(lead.name) || 'this lead'}`} draftKey={`lead-call:${lead.id}`} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save the call</Button></div>}>
      <div className="cc-field"><TextBox label="How did it go?" value={f.how || ''} maxLength={6000} onChange={(v) => set({ how: v })} /></div>
      <div className="cc-field"><TextField label="What happens next?" value={f.next || ''} maxLength={200} autoComplete="off" onChange={(e) => set({ next: e.target.value })} /></div>
      <div className="cc-field"><Dropdown label="When?" options={days.map((d) => ({ value: d.value, label: d.label }))} value={f.when} onChange={(v) => set({ when: v })} /></div>
      {f.when === 'pick' && <div className="cc-field"><TextField label="The day" type="date" min={todayKey} value={f.day || ''} onChange={(e) => set({ day: e.target.value })} /></div>}
      {!lead.cold_at && !lead.won_at && <div className="cc-field"><Dropdown label="Stage" options={leadStages.map((s) => ({ value: s.id, label: s.name }))} value={f.stageId} onChange={(v) => set({ stageId: v })} /></div>}
      <div className="cc-part ds-section">
        <div className="ds-section-head"><h3 className="ds-section-title">What you learned</h3></div>
        {QUALIFY.map((q) => (
          <div key={q.key} className="cc-field"><TextField label={q.question} value={f.learned?.[q.key] || ''} maxLength={600} autoComplete="off" onChange={(e) => set({ learned: { ...(f.learned || {}), [q.key]: e.target.value } })} /></div>
        ))}
      </div>
      <Problem line={problem} />
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Add note
export function LeadNotePanel({ lead, onClose }) {
  const actions = useLeadActions();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState(null);
  const id = lead?.id || null;
  useEffect(() => { setText(''); setProblem(null); }, [id]);
  if (!lead) return <SlidePanel open={false} onClose={onClose} title="Add note" />;
  const save = async () => {
    const answer = await actions.note(lead, text);
    if (answer?.error) { setProblem(answer.error); return; }
    if (answer) onClose();
  };
  return (
    <SlidePanel open onClose={onClose} title="Add note" draftKey={`lead-note:${lead.id}`} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Add my note</Button></div>}>
      <div className="cc-field"><TextBox label={`What do you want to remember about ${firstName(lead.name) || 'this lead'}?`} value={text} maxLength={6000} onChange={(v) => { setText(v); setProblem(null); }} /></div>
      <Problem line={problem} />
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Where a lead is (the discovery call notes)
export function WherePanel({ lead, onClose }) {
  const actions = useLeadActions();
  const [f, setF] = useState({});
  const id = lead?.id || null;
  useEffect(() => { if (lead) setF(Object.fromEntries(QUALIFY.map((q) => [q.key, lead[q.key] || '']))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  if (!lead) return <SlidePanel open={false} onClose={onClose} title="Where they are" />;
  const save = async () => { if (await actions.discovery(lead, f)) onClose(); };
  return (
    <SlidePanel open onClose={onClose} title={whereTitle(lead)} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
      {QUALIFY.map((q) => (
        <div key={q.key} className="cc-field"><TextField label={q.question} value={f[q.key] || ''} maxLength={600} autoComplete="off" onChange={(e) => setF({ ...f, [q.key]: e.target.value })} /></div>
      ))}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Mark as cold
export function ColdPanel({ lead, onClose, onDone }) {
  const actions = useLeadActions();
  const [f, setF] = useState({ reason: 'timing', text: '', check: '3m' });
  const [problem, setProblem] = useState(null);
  const id = lead?.id || null;
  useEffect(() => { setF({ reason: 'timing', text: '', check: '3m' }); setProblem(null); }, [id]);
  if (!lead) return <SlidePanel open={false} onClose={onClose} title="Mark as cold" />;
  const set = (change) => { setF((v) => ({ ...v, ...change })); setProblem(null); };
  const save = async () => {
    const answer = await actions.cold(lead, f);
    if (answer?.error) { setProblem(answer.error); return; }
    if (answer) { onClose(); onDone?.(); }
  };
  return (
    <SlidePanel open onClose={onClose} title={`Mark ${firstName(lead.name) || 'this lead'} as cold`} draftKey={`lead-cold:${lead.id}`} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Mark as cold</Button></div>}>
      <div className="cc-field"><Dropdown label="What happened?" options={COLD_REASONS.map(([value, label]) => ({ value, label }))} value={f.reason} onChange={(v) => set({ reason: v })} /></div>
      {f.reason === 'else' && <div className="cc-field"><TextField label="What happened, in your words?" value={f.text} maxLength={300} autoComplete="off" onChange={(e) => set({ text: e.target.value })} /></div>}
      <div className="cc-field"><Dropdown label="When should you check in again?" options={COLD_CHECKS.map(([value, label]) => ({ value, label }))} value={f.check} onChange={(v) => set({ check: v })} /></div>
      <Problem line={problem} />
      <p className="cc-note">They wait in Cold leads, and can come back at any time.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Edit stages
const GRIP = <svg className="cc-lead-dots" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.5" cy="3" r="1.1" /><circle cx="10.5" cy="3" r="1.1" /><circle cx="5.5" cy="8" r="1.1" /><circle cx="10.5" cy="8" r="1.1" /><circle cx="5.5" cy="13" r="1.1" /><circle cx="10.5" cy="13" r="1.1" /></svg>;

export function StagesPanel({ open, onClose }) {
  const { userId, coach, leads, leadStages, automations } = useCoachPortal();
  const toast = useToast();
  const [draft, setDraft] = useState([]);
  const [problem, setProblem] = useState(null);
  const [said, setSaid] = useState('');
  const rowsRef = useRef(null);
  const focusName = useRef(null);
  const focusGrip = useRef(null);
  const drag = useRef(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setDraft(stagesDraft(leadStages).map((d) => ({ ...d, likelihood: `${d.likelihood}%` }))); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (focusName.current) { rowsRef.current?.querySelector(`[data-stage-name="${focusName.current}"]`)?.focus(); focusName.current = null; }
    if (focusGrip.current) { rowsRef.current?.querySelector(`[data-stage-grip="${focusGrip.current}"]`)?.focus(); focusGrip.current = null; }
  });
  const change = (id, patch) => { setDraft((d) => d.map((s) => (s.id === id ? { ...s, ...patch } : s))); setProblem(null); };
  const inStage = (id) => leads.filter((l) => l.stage_id === id && !l.merged_into && !l.cold_at).length;
  const kept = draft.filter((s) => !s.removed && !s.is_won);
  /** Where a removed stage's leads go: the stage chosen, or the one before it in the list as it now stands. */
  const goesTo = (s, i) => (s.toId && kept.some((k) => k.id === s.toId) ? s.toId : (draft.slice(0, i).filter((k) => !k.removed && !k.is_won).pop() || kept[0])?.id || null);
  /** A stage moved to a new place among the stages before Won (the removed ones keep theirs). */
  const moveTo = (id, to) => setDraft((d) => {
    const open2 = d.filter((s) => !s.is_won);
    const from = open2.findIndex((s) => s.id === id);
    const at = Math.max(0, Math.min(open2.length - 1, to));
    if (from < 0 || from === at) return d;
    const [moved] = open2.splice(from, 1);
    open2.splice(at, 0, moved);
    setSaid(`${moved.name || 'The stage'} is now number ${at + 1} of ${open2.length}.`);
    return [...open2, ...d.filter((s) => s.is_won)];
  });
  const gripKey = (e, s) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const order = draft.filter((x) => !x.is_won);
    const visible = order.filter((x) => !x.removed);
    const next = visible[visible.findIndex((x) => x.id === s.id) + (e.key === 'ArrowUp' ? -1 : 1)];
    if (!next) return;
    focusGrip.current = s.id;
    moveTo(s.id, order.findIndex((x) => x.id === next.id));
  };
  const gripDown = (e, s) => { if (e.button > 0) return; drag.current = s.id; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const gripMove = (e) => {
    if (!drag.current) return;
    const rows = [...(rowsRef.current?.querySelectorAll('[data-stage-row]') || [])].filter((r) => r.dataset.stageRow !== 'won');
    const over = rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY >= b.top && e.clientY < b.bottom; });
    if (over && over.dataset.stageRow !== drag.current) moveTo(drag.current, draft.filter((x) => !x.is_won).findIndex((x) => x.id === over.dataset.stageRow));
  };
  const gripUp = () => { drag.current = null; };
  const add = () => { const id = newId(); focusName.current = id; setDraft((d) => [...d.filter((s) => !s.is_won), { id, name: '', likelihood: '50', is_won: false, removed: false, toId: null }, ...d.filter((s) => s.is_won)]); setProblem(null); };
  const remove = (s) => {
    if (kept.length <= 1) { setProblem({ error: 'A pipeline needs at least one stage before Won.' }); return; }
    // A stage only just added simply goes; one with leads asks where they go first.
    if (!stageOf(leadStages, s.id)) setDraft((d) => d.filter((x) => x.id !== s.id));
    else change(s.id, { removed: true, toId: null });
  };
  const save = async () => {
    if (busy.current) return;
    const plan = stagesSavePlan(leadStages, leads, draft.map((s, i) => (s.removed ? { ...s, toId: goesTo(s, i) } : s)), { coachId: coach.id, automations });
    if (plan.error) { setProblem(plan); return; }
    if (plan.same) { onClose(); return; }
    busy.current = true;
    try {
      const status = await saveRows(userId, plan.save);
      for (const [table, id] of plan.remove) await removeRow(userId, table, id);
      toast.saved({
        message: status === 'queued' ? 'Will sync' : plan.toast, long: true,
        onUndo: async () => { try { await saveRows(userId, plan.undo.save); for (const [table, id] of plan.undo.remove) await removeRow(userId, table, id); } catch (e) { toast.error(calm(e)); } },
      });
      onClose();
    } catch (e) { setProblem({ error: calm(e) }); } finally { busy.current = false; }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Edit stages" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Save my edit</Button></div>}>
      <div className="cc-stage-head" aria-hidden="true"><span>Stage</span><span>Likely to win</span></div>
      <div className="cc-stage-rows" ref={rowsRef}>
        {draft.map((s, i) => {
          if (s.removed) {
            const count = inStage(s.id);
            const was = stageOf(leadStages, s.id);
            if (!was) return null; // it has just been saved as removed, and the panel is closing
            return (
              <div key={s.id} className="cc-stage-gone" data-stage-row={s.id}>
                <p className="cc-quiet">{count ? moveLeadsQuestion(was, count) : `${was.name} goes when you save.`}</p>
                {count > 0 && <div className="cc-field"><Dropdown label="Move them to" options={kept.map((k) => ({ value: k.id, label: k.name || 'The new stage' }))} value={goesTo(s, i)} onChange={(v) => change(s.id, { toId: v })} /></div>}
                <div className="cc-acts"><TextLink onClick={() => change(s.id, { removed: false, toId: null })} aria-label={`Keep ${was.name}`}>Keep it</TextLink></div>
              </div>
            );
          }
          const name = s.name || 'the new stage';
          return (
            <div key={s.id} className={`cc-stage-row${s.is_won ? ' cc-stage-row--won' : ''}`} data-stage-row={s.is_won ? 'won' : s.id}>
              {s.is_won ? <span className="cc-stage-grip" /> : (
                <button type="button" className="cc-round cc-stage-grip" data-stage-grip={s.id} aria-label={`Move ${name}`} aria-roledescription="Stage that can be moved up or down" onKeyDown={(e) => gripKey(e, s)} onPointerDown={(e) => gripDown(e, s)} onPointerMove={gripMove} onPointerUp={gripUp} onPointerCancel={gripUp}>{GRIP}</button>
              )}
              <input className="cc-cell-input" data-stage-name={s.id} aria-label={s.is_won ? 'The last stage’s name' : `Stage ${i + 1}’s name`} aria-invalid={problem?.at === s.id || undefined} value={s.name} maxLength={40} autoComplete="off" onChange={(e) => change(s.id, { name: e.target.value })} />
              {s.is_won ? <span className="cc-stage-fixed">100%</span>
                : <input className="cc-cell-input" aria-label={`How likely ${name} is to win, as a percentage`} inputMode="numeric" value={s.likelihood} maxLength={4} autoComplete="off" onChange={(e) => change(s.id, { likelihood: e.target.value })} onBlur={(e) => { const t = e.target.value.replace(/[%\s]/g, ''); if (/^\d{1,3}$/.test(t)) change(s.id, { likelihood: `${Number(t)}%` }); }} onFocus={(e) => change(s.id, { likelihood: e.target.value.replace('%', '') })} />}
              {s.is_won ? <span /> : <IconButton label={`Remove ${name}`} onClick={() => remove(s)} />}
            </div>
          );
        })}
      </div>
      <span className="ds-sr" role="status" aria-live="polite">{said}</span>
      <Problem line={problem?.error} />
      <div className="cc-add"><AddButton onClick={add}>Add stage</AddButton></div>
      {/* One line of help at most (Tim, 18 Nov): M11's second line, why Won is last, is what the Won row itself shows (no handle, no cross, 100%). */}
      <p className="cc-note">{STAGES_HELP}</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Import from a spreadsheet
export function ImportLeadsPanel({ open, onClose }) {
  const { userId, coach, leadStages } = useCoachPortal();
  const { all } = useLeadData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [cells, setCells] = useState(null); // an Excel file's rows of cells (xlsx.js); pasted or CSV rows are read from `text`
  const [chosen, setChosen] = useState({}); // a column's index to the field the coach chose ('' leaves it out)
  const [anyway, setAnyway] = useState({}); // a duplicate's row number, when it is to be added all the same
  const [problem, setProblem] = useState(null);
  const fileRef = useRef(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setText(''); setCells(null); setChosen({}); setAnyway({}); setProblem(null); } }, [open]);
  const sheet = useMemo(() => {
    const table = cells || csvTable(text);
    if (!table.length) return null;
    const headed = hasHeadingRow(table[0]);
    const width = Math.max(...table.map((r) => r.length));
    const headings = Array.from({ length: width }, (_, i) => (headed ? table[0][i] || '' : ''));
    const matched = matchColumns(headings);
    const body = headed ? table.slice(1) : table;
    return { headed, body, columns: matched.columns.map((c) => ({ ...c, sample: body.find((r) => r[c.index])?.[c.index] || '' })) };
  }, [text, cells]);
  const columns = sheet ? sheet.columns.map((c) => ({ ...c, field: chosen[c.index] !== undefined ? chosen[c.index] || null : c.field })) : [];
  const named = columns.some((c) => ['name', 'first', 'last'].includes(c.field));
  const read = useMemo(() => (sheet ? sheetRows(sheet.body, columns) : { rows: [], skipped: 0 }), /* eslint-disable-next-line react-hooks/exhaustive-deps */ [sheet, JSON.stringify(chosen)]);
  const plan = useMemo(() => leadImportPlan(read.rows, all), [read, all]);
  const adding = [...plan.fresh, ...plan.duplicates.filter((d) => anyway[d.index])].sort((a, b) => a.index - b.index);
  const readFile = async (file) => {
    if (!file) return;
    const line = importFileProblem(file.name, file.size);
    if (line) { setProblem(line); return; }
    try {
      if (isXlsxFile(file.name)) {
        if (!canReadXlsx()) { setProblem(IMPORT_UNREADABLE); return; }
        const rows = await xlsxTable(new Uint8Array(await file.arrayBuffer()));
        setText(''); setCells(rows.length ? rows : null); setChosen({}); setAnyway({}); setProblem(rows.length ? null : IMPORT_EMPTY);
      } else { const t = await file.text(); setCells(null); setText(t); setChosen({}); setAnyway({}); setProblem(csvTable(t).length ? null : IMPORT_EMPTY); }
    } catch { setProblem(IMPORT_UNREADABLE); }
  };
  const choose = (index, field) => {
    // A field is one column's at a time: choosing it for another takes it from the first.
    setChosen((c) => { const next = { ...c, [index]: field }; if (field) for (const col of columns) if (col.index !== index && col.field === field) next[col.index] = ''; return next; });
    setProblem(null);
  };
  const add = async () => {
    if (busy.current) return;
    if (!sheet) { setProblem('Paste the rows or choose a spreadsheet to carry on.'); return; }
    if (!named) { setProblem(IMPORT_NEEDS_NAME); return; }
    if (read.rows.length > IMPORT_MAX) { setProblem(IMPORT_TOO_MANY); return; }
    if (!read.rows.length) { setProblem(IMPORT_EMPTY); return; }
    if (!adding.length) { setProblem('Everyone in this file is already a lead. Choose “Add anyway” beside anyone to add them again.'); return; }
    busy.current = true;
    try {
      const made = adding.map(({ row }) => leadFromImport(row, { id: newId(), coachId: coach.id, stages: leadStages })).filter(Boolean);
      const status = await saveRows(userId, made.map((l) => ['coach_leads', l]));
      toast.saved({ message: status === 'queued' ? 'Will sync' : importedWords(made.length), long: true, onUndo: async () => { for (const l of made) await removeRow(userId, 'coach_leads', l.id).catch(() => {}); } });
      onClose();
    } catch (e) { setProblem(calm(e)); } finally { busy.current = false; }
  };
  const fieldOptions = [{ value: NONE, label: 'Leave out' }, ...LEAD_IMPORT_FIELDS.map((f) => ({ value: f.key, label: f.label }))];
  return (
    <SlidePanel open={open} onClose={onClose} title="Import from a spreadsheet" draftKey="lead-import" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={add}>{adding.length ? importButton(adding.length) : 'Add leads'}</Button></div>}>
      <div className="cc-field" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer?.files?.[0]); }}>
        <label className="cc-field-label" htmlFor="cc-lead-paste">Paste rows from a spreadsheet, or drop an Excel or CSV file here</label>
        <textarea id="cc-lead-paste" className="cc-paste" rows={5} value={text} placeholder={'Name, Email, Organisation\nDana Whitfield, dana@example.com, Kestrel Group'} onChange={(e) => { setText(e.target.value); setCells(null); setChosen({}); setAnyway({}); setProblem(null); }} />
      </div>
      <div className="cc-acts">
        <TextLink onClick={() => fileRef.current?.click()}>Choose a file</TextLink>
        <input ref={fileRef} className="cc-hidden-file" type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabIndex={-1} aria-hidden="true" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <p className="cc-note">{IMPORT_HELP}</p>
      <Problem line={problem} />
      {sheet && (
        <div aria-live="polite">
          <p className="cc-quiet">{[adding.length ? `${adding.length.toLocaleString('en-GB')} to add.` : 'Nobody new to add yet.', plan.duplicates.length ? `${plan.duplicates.length.toLocaleString('en-GB')} may already be here.` : null, read.skipped ? `${read.skipped} ${read.skipped === 1 ? 'row has' : 'rows have'} no name, so ${read.skipped === 1 ? 'it is' : 'they are'} left out.` : null].filter(Boolean).join(' ')}</p>
          {plan.duplicates.length > 0 && (
            <div className="cc-part ds-section">
              <div className="ds-section-head"><h3 className="ds-section-title">Possible duplicates</h3></div>
              {plan.duplicates.slice(0, 100).map((d) => (
                <div key={d.index} className="cc-line">
                  <span><b>{d.row.name}</b><small>{duplicateWords(d)}</small></span>
                  <TextLink aria-pressed={Boolean(anyway[d.index])} aria-label={`${anyway[d.index] ? 'Leave out' : 'Add anyway'}: ${d.row.name}`} onClick={() => setAnyway((a) => ({ ...a, [d.index]: !a[d.index] }))}>{anyway[d.index] ? 'Leave out' : 'Add anyway'}</TextLink>
                </div>
              ))}
              {plan.duplicates.length > 100 && <p className="cc-note">And {plan.duplicates.length - 100} more, left out.</p>}
            </div>
          )}
          <div className="cc-part ds-section">
            <div className="ds-section-head"><h3 className="ds-section-title">Your columns</h3></div>
            {columns.map((c) => (
              <div key={c.index} className="cc-field"><Dropdown label={c.heading || (c.sample ? `Column ${c.index + 1}, “${c.sample.slice(0, 40)}”` : `Column ${c.index + 1}`)} options={fieldOptions} value={c.field || NONE} onChange={(v) => choose(c.index, v === NONE ? '' : v)} /></div>
            ))}
          </div>
          <div className="cc-preview">
            {adding.slice(0, 50).map(({ index, row }) => (
              <div key={index} className="cc-preview-row cc-preview-row--new">
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

export function ExportLeadsPanel({ open, onClose, shown }) {
  const { userId, coach, leadFields, todayKey } = useCoachPortal();
  const { all, stages, values, tagNames } = useLeadData();
  const toast = useToast();
  const [what, setWhat] = useState('view');
  const [format, setFormat] = useState('xlsx');
  useEffect(() => { if (open) setWhat('view'); }, [open]);
  const options = [{ value: 'view', label: exportWhat(shown.length) }, { value: 'all', label: `Every lead, ${all.length.toLocaleString('en-GB')}, cold and won included` }];
  const go = () => {
    const list = what === 'view' ? shown : all;
    const ctx = { stages, fields: leadFields, tagNames, fieldWords: (l, f) => { const v = fieldValue(f, values, l.id); return f.kind === 'number' ? v ?? '' : fieldWords(f, v, todayKey); } };
    const name = exportName('Leads', todayKey);
    if (format === 'csv') download(`${name}.csv`, `﻿${leadsCsv(list, ctx, todayKey)}`, 'text/csv;charset=utf-8');
    else download(`${name}.xlsx`, xlsxBytes(leadExportRows(list, ctx, todayKey), 'Leads'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    logActivity(userId, coach, 'export', `exported ${list.length} ${list.length === 1 ? 'lead' : 'leads'} to a spreadsheet.`);
    toast.show('Downloaded');
    onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Export to a spreadsheet" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={go}>Download</Button></div>}>
      <div className="cc-field"><Dropdown label="What to export" options={options} value={what} onChange={setWhat} /></div>
      <div className="cc-field"><InlineChoice label="Format" options={EXPORT_FORMATS.map(([value, label]) => ({ value, label }))} value={format} onChange={setFormat} form="pills" /></div>
      <p className="cc-note">{EXPORT_HELP}</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Merge into one
const KEYED = new Set(['coach_tag_links', 'coach_field_values', 'coach_email_links']); // a row of these is found by who it is on, so moving one is adding it there and taking it from here

export function MergeLeadsPanel({ pair, onClose }) {
  const { userId, coach, state, settings, leadEvents, todos, bookings, emailLinks } = useCoachPortal();
  const { values, tagLinks } = useLeadData();
  const toast = useToast();
  const [choices, setChoices] = useState({});
  const busy = useRef(false);
  const ids = pair ? `${pair.a.id}|${pair.b.id}` : '';
  useEffect(() => { setChoices({}); }, [ids]);
  if (!pair) return <SlidePanel open={false} onClose={onClose} title="Merge into one" />;
  // A won lead is always the one kept (its client carries its timeline); two clients aren't merged here.
  const ordered = mergePair(pair.a, pair.b) || pair;
  const { a, b } = ordered.error ? pair : ordered;
  const plan = leadMergePlan(a, b) || [];
  const taken = Object.fromEntries(Object.entries(choices).filter(([, v]) => v === 'b').map(([k]) => [k, true]));
  const merge = async () => {
    if (busy.current) return;
    if (ordered.error) { toast.show(ordered.error); return; }
    busy.current = true;
    try {
      const mergeId = await leadMerge(userId, a.id, b.id, taken);
      if (mergeId !== null) {
        toast.saved({ message: mergedWords(mergedLead(a, b, taken)), long: true, onUndo: () => leadUnmerge(userId, mergeId).catch((e) => toast.error(calm(e))) });
      } else {
        // Before 052: the same moves on the device, with everything Undo needs.
        const device = leadMergeDevice(a, b, taken, { events: leadEvents, todos, bookings, emailLinks, tagLinks, fieldValues: values.filter((v) => v.item_id === a.id || v.item_id === b.id) });
        if (!device) { onClose(); return; }
        const moved = device.save.slice(2);
        await saveRows(userId, device.save);
        for (const [table, row] of device.undo.restore) if (KEYED.has(table)) await removeRow(userId, table, keyOf(table, row)).catch(() => {});
        toast.saved({
          message: device.toast, long: true,
          onUndo: async () => {
            try {
              for (const [table, row] of moved) if (KEYED.has(table)) await removeRow(userId, table, keyOf(table, row)).catch(() => {});
              await saveRows(userId, leadUnmergeDevice(device.undo));
            } catch (e) { toast.error(calm(e)); }
          },
        });
      }
      onClose();
    } catch (e) { toast.error(calm(e)); } finally { busy.current = false; }
  };
  const different = async () => {
    const before = rowsOf(state, 'coach_settings').find((s) => s.coach_id === coach.id) || null;
    try {
      await saveRow(userId, 'coach_settings', { ...settings, coach_id: coach.id, crm: withNotSame(settings.crm, a, b) });
      toast.saved({ message: KEPT_AS_TWO, long: true, onUndo: () => saveRow(userId, 'coach_settings', { ...(before || settings), coach_id: coach.id, crm: before?.crm || {} }).catch((e) => toast.error(calm(e))) });
      onClose();
    } catch (e) { toast.error(calm(e)); }
  };
  return (
    <SlidePanel open onClose={onClose} title="Merge into one" footer={<div className="cc-panel-foot"><TextLink onClick={different}>They’re different people</TextLink><Button variant="primary" onClick={merge}>Merge into one</Button></div>}>
      <p className="cc-quiet">{MERGE_INTRO}</p>
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
      <p className="cc-note">{MERGE_NOTHING_LOST}</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Filter and saved views
export function LeadFilterPanel({ open, onClose, list, setList, count }) {
  const { userId, coach, tags, leadFields, views, state } = useCoachPortal();
  const toast = useToast();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setName(''); setProblem(null); } }, [open]);
  const f = list.filters;
  const set = (change) => setList({ ...list, filters: { ...f, ...change }, viewId: null });
  const toggle = (key, value) => set({ [key]: (f[key] || []).includes(value) ? f[key].filter((x) => x !== value) : [...(f[key] || []), value] });
  const toggleField = (id, value) => { const now = f.fields?.[id] || []; set({ fields: { ...(f.fields || {}), [id]: now.includes(value) ? now.filter((x) => x !== value) : [...now, value] } }); };
  const mine = views.filter((v) => v.list === 'leads').sort((a, b) => a.name.localeCompare(b.name));
  const values = rowsOf(state, 'coach_field_values');
  const done = async (work, message, onUndo) => {
    try { const status = await work(); toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true }); return true; } catch (e) { toast.error(calm(e)); return false; }
  };
  const save = async () => {
    const view = leadViewFromList(name, list);
    if (!view.name) { setProblem('Name this view to carry on.'); return; }
    if (mine.some((v) => v.name.toLowerCase() === view.name.toLowerCase())) { setProblem('You already have a view with that name.'); return; }
    const row = { id: newId(), coach_id: coach.id, list: 'leads', favourite: false, position: mine.length, ...view };
    if (await done(() => saveRow(userId, 'coach_views', row), 'View saved', () => removeRow(userId, 'coach_views', row.id))) { setName(''); setList({ ...list, viewId: row.id }); }
  };
  const favourite = (v) => {
    if (!v.favourite && !canFavourite(views)) { setProblem(FAVOURITES_FULL); return; }
    done(() => saveRow(userId, 'coach_views', { ...v, favourite: !v.favourite }), v.favourite ? 'Taken out of the menu' : 'Added to the menu', () => saveRow(userId, 'coach_views', v));
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Filter" className="ds-panel--toast-room" footer={<div className="cc-panel-foot"><TextLink onClick={() => setList({ ...list, filters: EMPTY_LEAD_FILTERS, viewId: null })}>Clear</TextLink><Button variant="primary" onClick={onClose}>Show {count} {count === 1 ? 'lead' : 'leads'}</Button></div>}>
      {tags.length > 0 && (
        <div className="cc-field"><span className="cc-field-label">Tags</span>
          <ChipRow label="Tags">{tags.map((t) => <Chip key={t.id} pressed={(f.tag || []).includes(t.id)} onClick={() => toggle('tag', t.id)}>{t.name}</Chip>)}</ChipRow>
        </div>
      )}
      <div className="cc-field"><SwitchRow label="Only quiet leads" checked={(f.last || []).includes('quiet')} onChange={(on) => set({ last: on ? ['quiet'] : [] })} /></div>
      {leadFields.filter((field) => field.kind === 'choice' || field.kind === 'text').map((field) => {
        const options = field.kind === 'choice' ? field.options || [] : [...new Set(values.filter((v) => v.field_id === field.id).map((v) => String(v.value_text ?? '')).filter(Boolean))].sort().slice(0, 24);
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
        <div className="cc-field"><TextField label="Name this view" value={name} maxLength={60} placeholder="e.g. Quiet leads" onChange={(e) => { setName(e.target.value); setProblem(null); }} /></div>
        <Problem line={problem} />
        <div className="cc-acts"><Button variant="outline" onClick={save}>Save as a view</Button></div>
      </div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- an email on a timeline
export function EmailPanel({ email, onClose }) {
  const { userId, emails, todayKey } = useCoachPortal();
  const toast = useToast();
  const [body, setBody] = useState(null);
  const id = email?.id || null;
  useEffect(() => {
    setBody(null);
    if (!id) return undefined;
    let live = true;
    emailBody(userId, id).then((text) => { if (live) setBody(text || ''); }).catch(() => { if (live) setBody(''); });
    return () => { live = false; };
  }, [userId, id]);
  if (!email) return <SlidePanel open={false} onClose={onClose} title="Email" />;
  const words = emailPanel(email, todayKey);
  const hide = async () => {
    const plan = hideThread(emails, email);
    try {
      await saveRows(userId, plan.save.map((e) => ['coach_emails', e]));
      toast.saved({ message: plan.toast, long: true, onUndo: () => saveRows(userId, plan.undo.map((e) => ['coach_emails', e])).catch((e) => toast.error(calm(e))) });
      onClose();
    } catch (e) { toast.error(calm(e)); }
  };
  return (
    <SlidePanel open onClose={onClose} title={words.title} footer={<div className="cc-panel-foot"><TextLink onClick={hide}>{words.hide}</TextLink>{words.open ? <a className="ds-link" href={words.open.href} target="_blank" rel="noreferrer">{words.open.label}</a> : <span />}</div>}>
      <p className="cc-email-who"><b>{words.from}</b>{words.to && <span>To {words.to}</span>}<span>{words.when}</span></p>
      <p className="cc-email-body">{body || words.snippet}</p>
    </SlidePanel>
  );
}
