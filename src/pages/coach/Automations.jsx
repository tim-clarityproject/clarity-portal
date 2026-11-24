import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AddButton, Button, Dropdown, PageHeader, SlidePanel, TextField, useToast } from '../../components/design';
import { newId, removeRow, saveRow } from '../../lib/coach/store';
import {
  ACTIONS, AUTOMATION_HELP, AUTOMATION_WORDS, automationSavePlan, automationSentence, automationSwitch, blankAutomation, CATCH_UP, CATCH_UP_HELP, countChoices,
  keepInTouchAutomation, keepInTouchId, keepInTouchOnKey, ranWords, todoDayChoices, TRIGGERS,
} from '../../lib/coach/crm';
import { Back, TextLink, useCoachPortal } from './parts';
import { useStartStages } from './leadParts';
import { calm } from './crmParts';
import './crm.css';

// Automations (M11 seq 77: "Automations", "Automations: add one"), the
// owner's: when this happens, add a to-do or move a stage. Nothing else can
// be chosen, and nothing is ever sent (the run's prompt wins over M11's
// "add tags and keep people in touch"). Each reads as one sentence with
// how often it ran this month, and a switch; the sentence opens it. One
// that would send a lead round in a circle is refused, calmly. The rules
// and words are crm.js's; the automations themselves run from Leads (a
// stage move, Won), the guided close (coaching ends) and crmParts.jsx's
// watch (a quiet lead, a proposal opened, a call booked, someone due a
// catch-up). The keep-in-touch automation (run 8's 3: "Catch up with [first
// name]") is always listed, OFF until the coach switches it on; switching it
// on (or saving it) is what first saves it.

const NONE = '__any__';

export default function Automations() {
  const { userId, coach, automations, automationRuns, leadStages: stages, callTypes, todayKey } = useCoachPortal();
  useStartStages();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [problem, setProblem] = useState(null);
  const [line, setLine] = useState(null); // a switch refused: { id, words }
  const busy = useRef(false);
  const ctx = { stages, callTypes };
  const isNew = draft ? !automations.some((a) => a.id === draft.id) : false;
  // The keep-in-touch automation: the saved one, or one not saved yet, switched off, with the coach's own id for it (every tab the same).
  const keepId = keepInTouchId(coach.id);
  const keep = keepInTouchAutomation(automations, { id: keepId, coachId: coach.id });
  const keepSaved = automations.some((a) => a.id === keep.id);
  const listed = keepSaved ? automations : [...automations, keep];
  const isKeep = draft?.trigger === CATCH_UP;
  useEffect(() => { setProblem(null); }, [draft?.id]);
  // "Add automation" chosen in search opens its panel once.
  const location = useLocation();
  useEffect(() => {
    if (location.state?.open === 'add') { setDraft(blankAutomation({ id: newId(), coachId: coach.id, stages, position: automations.length })); navigate(location.pathname, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.open]);

  const set = (change) => { setDraft((d) => ({ ...d, ...change })); setProblem(null); };
  const setTrigger = (value) => {
    const t = TRIGGERS.find((x) => x.value === value);
    set({ trigger: value, trigger_count: t?.needs === 'count' ? t.suggested : null, trigger_stage_id: t?.needs === 'stage' ? draft.trigger_stage_id || stages.find((s) => !s.is_won)?.id || null : null,
      call_type_key: t?.needs === 'call' ? draft.call_type_key || null : null, todo_days: value !== 'call_booked' && Number(draft.todo_days) < 0 ? 0 : draft.todo_days });
  };
  const save = async () => {
    if (busy.current) return;
    const plan = automationSavePlan(draft, { automations, stages });
    if (plan.error) { setProblem(plan.error); return; }
    busy.current = true;
    const before = automations.find((a) => a.id === plan.automation.id) || null;
    try {
      const status = await saveRow(userId, 'coach_automations', plan.automation);
      toast.saved({ message: status === 'queued' ? 'Will sync' : plan.toast, long: true, onUndo: () => (before ? saveRow(userId, 'coach_automations', before) : removeRow(userId, 'coach_automations', plan.automation.id)).catch((e) => toast.error(calm(e))) });
      setDraft(null);
    } catch (e) { setProblem(calm(e)); } finally { busy.current = false; }
  };
  const remove = async () => {
    const before = automations.find((a) => a.id === draft.id);
    if (!before) { setDraft(null); return; }
    try {
      await removeRow(userId, 'coach_automations', before.id);
      toast.saved({ message: AUTOMATION_WORDS.deleted, long: true, onUndo: () => saveRow(userId, 'coach_automations', before).catch((e) => toast.error(calm(e))) });
      setDraft(null);
    } catch (e) { setProblem(calm(e)); }
  };
  const flip = async (a, on) => {
    const plan = automationSwitch(a, on, { automations, stages });
    if (plan.error) { setLine({ id: a.id, words: plan.error }); return; }
    setLine(null);
    try {
      // Keep in touch counts only catch-ups that fall due from the day it is switched on (run 8's 3; Claude's call,
      // 24 Nov): the day is kept as one of its own runs, before it is on, so its first round already knows it.
      if (on && a.trigger === CATCH_UP) {
        const mark = { id: newId(), automation_id: a.id, coach_id: coach.id, event_key: keepInTouchOnKey(todayKey), lead_id: null, profile_id: null, todo_id: null, ran_at: new Date().toISOString() };
        if (!automationRuns.some((r) => r.automation_id === a.id && r.event_key === mark.event_key)) {
          await saveRow(userId, 'coach_automation_runs', mark).catch((e) => { if (e?.code !== '23505') throw e; }); // switched on twice today: one is enough
        }
      }
      const status = await saveRow(userId, 'coach_automations', plan.automation);
      const saved = automations.some((x) => x.id === a.id);
      toast.saved({ message: status === 'queued' ? 'Will sync' : plan.toast, long: true, onUndo: () => (saved ? saveRow(userId, 'coach_automations', a) : removeRow(userId, 'coach_automations', a.id)).catch((e) => toast.error(calm(e))) });
    } catch (e) { toast.error(calm(e)); }
  };

  const trigger = draft ? TRIGGERS.find((t) => t.value === draft.trigger) || TRIGGERS[0] : null;
  const openStages = stages.filter((s) => !s.is_won);
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to="Leads" onClick={() => navigate('/coach/leads')} />
        <PageHeader title={AUTOMATION_WORDS.title} />
        {automations.length === 0 && <p className="cc-quiet">{AUTOMATION_WORDS.none}</p>}
        <div className="cc-rows cc-auto-rows">
          {listed.map((a) => {
            const sentence = automationSentence(a, ctx);
            return (
              <div key={a.id} className="cc-auto-row">
                <button type="button" className="cc-auto-open" aria-label={`Edit: ${sentence}`} onClick={() => setDraft({ ...a })}>
                  <b>{sentence}</b>
                  <small>{ranWords(a, automationRuns, todayKey)}</small>
                </button>
                <button type="button" role="switch" className="ds-switch" aria-checked={a.active === true} aria-label={`On: ${sentence}`} onClick={() => flip(a, !a.active)} />
                {line?.id === a.id && <p className="cc-problem cc-auto-line" role="alert">{line.words}</p>}
              </div>
            );
          })}
        </div>
        <div className="cc-add"><AddButton onClick={() => setDraft(blankAutomation({ id: newId(), coachId: coach.id, stages, position: automations.length }))}>{AUTOMATION_WORDS.add}</AddButton></div>
        <p className="cc-note cc-auto-help">{AUTOMATION_HELP}</p>
      </div>

      <SlidePanel draftKey={`automation:${isNew ? 'new' : draft?.id}`}
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={isNew && !isKeep ? AUTOMATION_WORDS.add : AUTOMATION_WORDS.edit}
        footer={draft ? <div className="cc-panel-foot">{isNew ? <span /> : <TextLink onClick={remove}>Delete</TextLink>}<Button variant="primary" onClick={save}>Save</Button></div> : null}
      >
        {draft && (
          <>
            {/* One keep-in-touch automation a coach: it is its own row in the list, never a second one from here. */}
            <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.when} options={TRIGGERS.filter((t) => (isKeep ? t.value === CATCH_UP : t.value !== CATCH_UP)).map((t) => ({ value: t.value, label: t.label }))} value={draft.trigger} onChange={setTrigger} /></div>
            {isKeep && <p className="cc-note">{CATCH_UP_HELP}</p>}
            {trigger.needs === 'stage' && <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.stage} options={stages.map((s) => ({ value: s.id, label: s.name }))} value={draft.trigger_stage_id} onChange={(v) => set({ trigger_stage_id: v })} /></div>}
            {trigger.needs === 'count' && <div className="cc-field"><Dropdown label={draft.trigger === 'lead_quiet' ? AUTOMATION_WORDS.days : AUTOMATION_WORDS.times} options={countChoices(draft.trigger)} value={draft.trigger_count ?? trigger.suggested} onChange={(v) => set({ trigger_count: v })} /></div>}
            {trigger.needs === 'call' && <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.call} options={[{ value: NONE, label: AUTOMATION_WORDS.anyCall }, ...callTypes.map((c) => ({ value: c.key, label: c.name }))]} value={draft.call_type_key || NONE} onChange={(v) => set({ call_type_key: v === NONE ? null : v })} /></div>}
            {!isKeep && <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.then} options={ACTIONS} value={draft.action} onChange={(v) => set({ action: v, to_stage_id: v === 'stage' ? draft.to_stage_id || openStages.find((s) => s.id !== draft.trigger_stage_id)?.id || null : null })} /></div>}
            {draft.action === 'todo' && !isKeep && (
              <>
                <div className="cc-field"><TextField label={AUTOMATION_WORDS.todo} value={draft.todo_title || ''} maxLength={300} placeholder={AUTOMATION_WORDS.todoExample} autoComplete="off" onChange={(e) => set({ todo_title: e.target.value })} /></div>
                <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.todoWhen} options={todoDayChoices(draft.trigger)} value={Number(draft.todo_days) || 0} onChange={(v) => set({ todo_days: v })} /></div>
              </>
            )}
            {draft.action === 'stage' && <div className="cc-field"><Dropdown label={AUTOMATION_WORDS.toStage} options={openStages.map((s) => ({ value: s.id, label: s.name }))} value={draft.to_stage_id} onChange={(v) => set({ to_stage_id: v })} /></div>}
            <p className="cc-auto-sentence" aria-live="polite">{automationSentence(draft, ctx)}</p>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
          </>
        )}
      </SlidePanel>
    </div>
  );
}
