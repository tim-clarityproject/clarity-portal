import { useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../components/design';
import { coachState, forgetRows, keyOf, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { leadStagesStart } from '../../lib/coach/crmData';
import { fieldFromTyped, fieldValue } from '../../lib/coach/model';
import {
  alreadyRan, automationsSaid, claimed, coldPlan, discoveryPatch, firstStage, LEAD_ADDED, leadDetailsPatch, leadEvent, leadNote, logCall, moneyFromTyped,
  NEEDS_AMOUNT, newLead, openLeads, runAutomations, stageEvent, stageMove, stageOf, startStages, warmPlan, withFirstStage, withNextStep, wonEvent, wonPlan,
} from '../../lib/coach/crm';
import { useCoachPortal } from './parts';

// What the Leads pages share (Phase 6a run 4): the leads as the pages read
// them, the pipeline's starting stages, and every action on a lead, each
// saved device first with Undo for 10 seconds. The rules and the words are
// crm.js's; nothing here works one out. Automations run from here after
// something the coach does (a stage move, Won): each run is claimed first,
// so nothing runs twice, and an automation only ever adds a to-do or moves
// a stage.

export const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
/** The three dots of a row's More menu. */
export const MORE = <svg className="cc-lead-dots" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.1" /><circle cx="8" cy="8" r="1.1" /><circle cx="13" cy="8" r="1.1" /></svg>;

/** The leads as the pages read them: the stages, the open leads (each with a stage), and what sorting and filtering need. */
export function useLeadData() {
  const { state, leads, leadStages, leadEvents, leadFields, tags, todayKey } = useCoachPortal();
  return useMemo(() => {
    const all = leads.filter((l) => !l.merged_into);
    const values = rowsOf(state, 'coach_field_values');
    const tagLinks = rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === 'lead');
    const byId = new Map(leadFields.map((f) => [f.id, f]));
    const valueOf = (lead, fieldId) => (byId.has(fieldId) ? fieldValue(byId.get(fieldId), values, lead.id) : null);
    const tagIds = (lead) => tagLinks.filter((l) => l.item_id === lead.id).map((l) => l.tag_id);
    return {
      stages: leadStages, all, values, tagLinks,
      open: openLeads(all).map((l) => withFirstStage(l, leadStages)),
      ctx: { stages: leadStages, events: leadEvents, todayKey, fieldValue: valueOf, tagIds },
      tagNames: (lead) => tagIds(lead).map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean),
    };
  }, [state, leads, leadStages, leadEvents, leadFields, tags, todayKey]);
}

/** The pipeline's five starting stages, made once: by the database when 052 is there, on the device before. */
export function useStartStages() {
  const { userId, coach, isOwner, leadStages } = useCoachPortal();
  const asked = useRef(false);
  const none = leadStages.length === 0;
  useEffect(() => {
    if (!isOwner || !none || asked.current) return;
    asked.current = true;
    (async () => {
      try {
        const made = await leadStagesStart(userId);
        // Before 052: the same five on the device, unless another tab made them a moment ago.
        if (made === null && rowsOf(coachState(userId), 'coach_lead_stages').filter((s) => s.coach_id === coach.id).length === 0) {
          await saveRows(userId, startStages(coach.id, newId).map((s) => ['coach_lead_stages', s]));
        }
      } catch { asked.current = false; /* it is asked again the next time Leads opens */ }
    })();
  }, [isOwner, none, userId, coach.id]);
}

/** Every action on a lead. Each resolves true when it saved, false when it didn't (a calm line has then been shown), or `{ error }` to show in its panel. */
export function useLeadActions() {
  const { userId, coach, leadStages: stages, automations, clients, organisations, todayKey } = useCoachPortal();
  const toast = useToast();
  const busy = useRef(false);
  const stamp = () => ({ nowIso: new Date().toISOString(), todayKey });
  const leadsNow = () => rowsOf(coachState(userId), 'coach_leads').filter((l) => l.coach_id === coach.id);
  const problem = (error) => toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);

  /** Runs one event through the automations; resolves what ran and how to take it back. */
  const runFor = async (event) => {
    const made = { runs: [], todos: [], events: [], leads: [] };
    let done = { ran: 0, todos: 0, moves: 0 };
    try {
      done = await runAutomations(event, { automations, leads: leadsNow(), stages, coachId: coach.id, newId, ...stamp(), leadsNow }, {
        claim: async (run) => {
          if (alreadyRan(rowsOf(coachState(userId), 'coach_automation_runs'), run)) return false;
          try { await saveRow(userId, 'coach_automation_runs', run); made.runs.push(run.id); return true; } catch (e) {
            if (claimed(e)) throw e;
            forgetRows(userId, [['coach_automation_runs', run.id]]); // another tab or device ran it first
            return false;
          }
        },
        addTodo: async (todo) => { await saveRow(userId, 'coach_todos', todo); made.todos.push(todo.id); },
        move: async ({ lead, event: line }) => { await saveRows(userId, [['coach_leads', lead], ['coach_lead_events', line]]); made.events.push(line.id); },
      });
    } catch { /* what ran, ran: the coach's own change is already saved */ }
    return {
      done,
      undo: async () => {
        for (const id of made.todos) await removeRow(userId, 'coach_todos', id).catch(() => {});
        for (const id of made.events) await removeRow(userId, 'coach_lead_events', id).catch(() => {});
        for (const id of made.runs) await removeRow(userId, 'coach_automation_runs', id).catch(() => {});
      },
    };
  };

  /** Saves rows, runs what follows, and says so with Undo. One at a time. */
  const act = async ({ pairs, message, undo, event = null }) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const status = await saveRows(userId, pairs);
      const auto = event ? await runFor(event) : null;
      toast.saved({
        message: status === 'queued' ? 'Will sync' : [message, auto ? automationsSaid(auto.done) : ''].filter(Boolean).join(' '), long: true,
        onUndo: async () => { try { if (auto) await auto.undo(); await undo(); } catch (e) { problem(e); } },
      });
      return true;
    } catch (e) { problem(e); return false; } finally { busy.current = false; }
  };
  const drop = (table, id) => removeRow(userId, table, id).catch(() => {});

  const won = (lead) => {
    const email = String(lead.email || '').toLowerCase();
    const existing = email ? clients.find((c) => String(c.email || '').toLowerCase() === email) || null : null;
    const plan = wonPlan(lead, { stages, profileId: newId(), eventId: newId(), dealId: newId(), ...stamp(), existingProfile: existing });
    if (plan.error) { toast.show(plan.error); return Promise.resolve(false); }
    // The agreement draft is a stub for Finances (6b): it rides on the Won line, and on the organisation's deals when there is one.
    const line = { ...plan.event, data: { ...plan.event.data, agreement_draft: plan.agreementDraft } };
    return act({
      pairs: [...(plan.profile ? [['client_profiles', { ...plan.profile, created_by: userId }]] : []), ['coach_leads', plan.lead], ['coach_lead_events', line], ...(plan.deal ? [['organisation_deals', plan.deal]] : [])],
      message: plan.toast, event: wonEvent(plan.lead),
      undo: async () => {
        await saveRow(userId, 'coach_leads', lead);
        await drop('coach_lead_events', line.id);
        if (plan.deal) await drop('organisation_deals', plan.deal.id);
        if (plan.profile) await drop('client_profiles', plan.profile.id);
      },
    });
  };

  const moveStage = (lead, toStage) => {
    if (!lead || !toStage || lead.stage_id === toStage.id) return Promise.resolve(false);
    if (toStage.is_won) return won(lead);
    const plan = stageMove(lead, toStage, { id: newId(), ...stamp(), stages });
    return act({
      pairs: [['coach_leads', plan.lead], ['coach_lead_events', plan.event]], message: plan.toast, event: stageEvent(plan.lead, toStage.id, plan.event.id),
      undo: async () => { await saveRow(userId, 'coach_leads', lead); await drop('coach_lead_events', plan.event.id); },
    });
  };

  /** A lead saved with something changed on it (a next step typed over, a value), with Undo. */
  const saveLead = (before, after, message = 'Saved') => act({ pairs: [['coach_leads', after]], message, undo: () => saveRow(userId, 'coach_leads', before) });

  return {
    won, moveStage, saveLead,
    /** One calm line, said as the page's other messages are. */
    say: (line) => toast.show(line),
    /** A next step typed over in the table (blank clears it and its day). */
    nextStep: (lead, typed) => saveLead(lead, withNextStep(lead, typed)),
    /** The lead's own value typed over: "£13,500", "13.5k", or blank for none. */
    value: (lead, typed) => {
      const amount = moneyFromTyped(typed);
      if (amount === undefined) { toast.show(NEEDS_AMOUNT); return false; }
      saveLead(lead, { ...lead, value: amount });
      return true;
    },
    /** One of the coach's own fields typed over (049's coach_field_values, as on Clients). */
    field: (lead, f, typed, values) => {
      const row = fieldFromTyped(f, typed);
      if (row === undefined) { toast.show(f.kind === 'number' ? 'Type a number to carry on.' : f.kind === 'date' ? 'Choose a day to carry on.' : 'Choose one from the list to carry on.'); return false; }
      const key = { field_id: f.id, item_id: lead.id };
      const before = values.find((v) => v.field_id === f.id && v.item_id === lead.id) || null;
      const k = keyOf('coach_field_values', key);
      (row === null ? removeRow(userId, 'coach_field_values', k).then(() => 'saved') : saveRow(userId, 'coach_field_values', { ...key, coach_id: coach.id, value_text: null, value_number: null, value_date: null, ...row }))
        .then((status) => toast.saved({ message: status === 'queued' ? 'Will sync' : 'Saved', long: true, onUndo: () => (before ? saveRow(userId, 'coach_field_values', before) : removeRow(userId, 'coach_field_values', k)).catch(problem) }))
        .catch(problem);
      return true;
    },
    /** What you learned, edited from "Where Amy is". */
    discovery: (lead, typed) => saveLead(lead, { ...lead, ...discoveryPatch(typed) }),
    /** Add lead. Resolves the new lead's id, or `{ error, at }`. */
    add: async (typed) => {
      const id = newId();
      const made = newLead({ id, coachId: coach.id, stages, name: typed.name, email: typed.email, organisation: typed.organisation, source: typed.source, referredBy: typed.referredBy });
      if (made.error) return { error: made.error, at: made.error.includes('email') ? 'email' : 'name' };
      const org = made.lead.organisation ? organisations.find((o) => o.name.toLowerCase() === made.lead.organisation.toLowerCase()) || null : null;
      const lead = { ...made.lead, organisation_id: org?.id ?? null };
      const line = lead.referred_by ? leadEvent({ id: newId(), lead, kind: 'referred', ...stamp(), title: `Referred by ${lead.referred_by}`, data: { by: lead.referred_by } }) : null;
      const ok = await act({
        pairs: [['coach_leads', lead], ...(line ? [['coach_lead_events', line]] : [])], message: LEAD_ADDED(firstStage(stages)),
        undo: async () => { if (line) await drop('coach_lead_events', line.id); await drop('coach_leads', id); },
      });
      return ok ? id : false;
    },
    /** Edit details. Resolves true, false, or `{ error, at }`. */
    details: async (lead, typed) => {
      const patch = leadDetailsPatch(lead, typed, { organisations });
      if (patch.error) return patch;
      const to = patch.toStageId ? stageOf(stages, patch.toStageId) : null;
      if (to?.is_won) {
        // Won makes a client: the details are saved first, then Won runs as it does from anywhere else.
        try { await saveRow(userId, 'coach_leads', patch.lead); } catch (e) { problem(e); return false; }
        return won(patch.lead);
      }
      const move = to ? stageMove(patch.lead, to, { id: newId(), ...stamp(), stages }) : null;
      return act({
        pairs: move ? [['coach_leads', move.lead], ['coach_lead_events', move.event]] : [['coach_leads', patch.lead]], message: 'Saved', event: move ? stageEvent(move.lead, to.id, move.event.id) : null,
        undo: async () => { await saveRow(userId, 'coach_leads', lead); if (move) await drop('coach_lead_events', move.event.id); },
      });
    },
    /** Log a call, with what was learned, what happens next (a to-do) and the stage. */
    call: async (lead, typed) => {
      const to = typed.stageId && typed.stageId !== lead.stage_id ? stageOf(stages, typed.stageId) : null;
      const plan = logCall(lead, to?.is_won ? { ...typed, stageId: lead.stage_id } : typed, { id: newId(), todoId: newId(), moveId: newId(), ...stamp(), stages });
      if (plan.error) return plan;
      const moved = plan.movedTo ? plan.events.find((e) => e.kind === 'stage') : null;
      const ok = await act({
        pairs: [['coach_leads', plan.lead], ...plan.events.map((e) => ['coach_lead_events', e]), ...(plan.todo ? [['coach_todos', plan.todo]] : [])], message: plan.toast,
        event: moved ? stageEvent(plan.lead, plan.movedTo.id, moved.id) : null,
        undo: async () => { await saveRow(userId, 'coach_leads', lead); for (const e of plan.events) await drop('coach_lead_events', e.id); if (plan.todo) await drop('coach_todos', plan.todo.id); },
      });
      // Won was chosen as the stage: the call is logged, then Won runs as it does from anywhere else.
      if (ok && to?.is_won) await won(plan.lead);
      return ok;
    },
    /** Add note. */
    note: async (lead, typed) => {
      const plan = leadNote(lead, typed, { id: newId(), ...stamp() });
      if (plan.error) return plan;
      return act({ pairs: [['coach_lead_events', plan.event]], message: 'Note added', undo: () => drop('coach_lead_events', plan.event.id) });
    },
    /** Mark as cold: what happened, and when to check in again (a to-do on that day). */
    cold: async (lead, typed) => {
      const plan = coldPlan(lead, typed, { eventId: newId(), todoId: newId(), ...stamp() });
      if (plan.error) return plan;
      return act({
        pairs: [['coach_leads', plan.lead], ['coach_lead_events', plan.event], ...(plan.todo ? [['coach_todos', plan.todo]] : [])], message: plan.toast,
        undo: async () => { await saveRow(userId, 'coach_leads', lead); await drop('coach_lead_events', plan.event.id); if (plan.todo) await drop('coach_todos', plan.todo.id); },
      });
    },
    /** A cold lead brought back into the pipeline, at the stage it left. */
    warm: (lead) => {
      const plan = warmPlan(lead, { eventId: newId(), ...stamp(), stages });
      return act({ pairs: [['coach_leads', plan.lead], ['coach_lead_events', plan.event]], message: plan.toast, undo: async () => { await saveRow(userId, 'coach_leads', lead); await drop('coach_lead_events', plan.event.id); } });
    },
  };
}
