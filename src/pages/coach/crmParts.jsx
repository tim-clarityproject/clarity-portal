import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { coachCrmReady, coachState, forgetRows, loadCoach, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { emailAddressesStart, logEmail } from '../../lib/coach/crmData';
import { networkDuplicatesOf, saveEmailBody } from '../../lib/coach/networkData';
import {
  alreadyRan, automationMatches, checkInsToSuggest, claimed, crmProblem, emailLogPlan, endedEvent, openingEvents, runAutomations, todoFromEmail,
} from '../../lib/coach/crm';
import { copyInStandIn, gmailStandIn, STAND_IN_DOMAIN } from '../../lib/coach/connect/standIn.js';
import { directionOf, readInbound } from '../../lib/coach/connect/copyInEmail.js';
import { gmailOnce } from '../../lib/coach/connect/gmail.js';
import { chooseEmailAdapters, emailStatus } from '../../lib/coach/connect/index.js';
import { askEmailServer } from '../../lib/coach/connect/server.js';
import { TimelineRow, useCoachPortal } from './parts';
import { EmailPanel } from './LeadPanels';

// What step 3's pages share (Phase 6a run 4): running automations for the
// events nobody presses a button for (a lead gone quiet, a proposal opened,
// a call booked, coaching ended), emails arriving through the copy-in
// address and Gmail, and the emails on a client's or a contact's timeline. Every rule is
// crm.js's. NOTHING HERE SENDS ANYTHING: an automation only ever adds a
// to-do or moves a stage, and an email is only ever read and logged.

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
export const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
/** The calm line for a save that didn't go (crm.js's crmProblem: never the database's technical words). */
export const calm = (error) => crmProblem(error);

// ---------------------------------------------------------------- automations

/**
 * Runs one event through the automations, each run claimed first (the
 * device's own runs are read fresh, then the unique row), and resolves what
 * ran and how to take it back. The same runner Leads uses after a stage
 * move, for the events that have no button.
 * @returns {(event: object) => Promise<{ done: { ran: number, todos: number, moves: number }, undo: () => Promise<void> }>}
 */
export function useRunAutomations() {
  const { userId, coach, todayKey } = useCoachPortal();
  const coachId = coach.id;
  return useCallback(async (event) => {
    const mine = (table) => rowsOf(coachState(userId), table).filter((r) => r.coach_id === coachId);
    const made = { runs: [], todos: [], events: [], leads: [] };
    let done = { ran: 0, todos: 0, moves: 0 };
    try {
      done = await runAutomations(event, { automations: mine('coach_automations'), leads: mine('coach_leads'), stages: mine('coach_lead_stages'), coachId, newId, nowIso: new Date().toISOString(), todayKey, leadsNow: () => mine('coach_leads') }, {
        claim: async (run) => {
          if (alreadyRan(rowsOf(coachState(userId), 'coach_automation_runs'), run)) return false;
          try { await saveRow(userId, 'coach_automation_runs', run); made.runs.push(run.id); return true; } catch (e) {
            if (claimed(e)) throw e;
            forgetRows(userId, [['coach_automation_runs', run.id]]); // another tab or device ran it first
            return false;
          }
        },
        addTodo: async (todo) => { await saveRow(userId, 'coach_todos', todo); made.todos.push(todo.id); },
        move: async ({ lead, event: line }) => {
          const before = mine('coach_leads').find((l) => l.id === lead.id) || null;
          await saveRows(userId, [['coach_leads', lead], ['coach_lead_events', line]]);
          made.events.push(line.id);
          if (before) made.leads.push(before);
        },
      });
    } catch { /* what ran, ran */ }
    return {
      done,
      undo: async () => {
        for (const id of made.todos) await removeRow(userId, 'coach_todos', id).catch(() => {});
        for (const id of made.events) await removeRow(userId, 'coach_lead_events', id).catch(() => {});
        for (const lead of made.leads.reverse()) await saveRow(userId, 'coach_leads', lead).catch(() => {});
        for (const id of made.runs) await removeRow(userId, 'coach_automation_runs', id).catch(() => {});
      },
    };
  }, [userId, coachId, todayKey]);
}

/**
 * The automations nobody presses a button for, asked about while the
 * owner's portal is open: leads that have gone quiet, proposals opened and
 * calls booked that are still to come. Each event is claimed before it
 * runs, so a reload, a second tab or asking again runs nothing twice.
 * Mounted once by CoachApp; it shows nothing.
 */
export function AutomationWatch() {
  const { userId, isOwner, coach, automations, leads, leadEvents, bookings, todayKey } = useCoachPortal();
  const run = useRunAutomations();
  const busy = useRef(false);
  const again = useRef(false);
  const loaded = useRef(false);
  const signature = useMemo(() => JSON.stringify([
    todayKey,
    automations.filter((a) => a.active && ['lead_quiet', 'proposal_opened', 'call_booked'].includes(a.trigger)).map((a) => [a.id, a.trigger, a.trigger_count, a.call_type_key, a.action, a.to_stage_id]),
    leads.map((l) => [l.id, l.last_contact_on, l.booking_id, l.stage_id, Boolean(l.cold_at), Boolean(l.merged_into)]),
    leadEvents.filter((e) => e.kind === 'proposal_opened').length,
    bookings.map((b) => [b.id, b.status, b.starts_at]),
  ]), [todayKey, automations, leads, leadEvents, bookings]);
  const watching = isOwner && automations.some((a) => a.active && ['lead_quiet', 'proposal_opened', 'call_booked'].includes(a.trigger));
  useEffect(() => {
    if (!watching) return undefined;
    const round = async () => {
      if (busy.current) { again.current = true; return; }
      if (document.visibilityState === 'hidden') return; // a hidden tab never asks; the next change, or the next open, does
      busy.current = true;
      try {
        // When the portal opens, the newest runs are read first, so nothing another device ran is asked for again. After that
        // the device's own copy is enough: the database's unique run row refuses a second run whatever this device holds.
        if (!loaded.current) { loaded.current = true; await loadCoach(userId).catch(() => null); }
        const mine = (table) => rowsOf(coachState(userId), table).filter((r) => r.coach_id === coach.id);
        const active = mine('coach_automations');
        const events = openingEvents({ leads: mine('coach_leads'), stages: mine('coach_lead_stages'), events: mine('coach_lead_events'), bookings: mine('coach_bookings'), todayKey })
          .filter((event) => active.some((a) => automationMatches(a, event)));
        for (const event of events) await run(event);
      } finally {
        busy.current = false;
        if (again.current) { again.current = false; setTimeout(round, 400); }
      }
    };
    const timer = setTimeout(round, 1500);
    return () => clearTimeout(timer);
  }, [watching, signature, userId, coach.id, todayKey, run]);
  return null;
}

/**
 * Coaching ended (Move to Past clients): the check-ins to suggest at 3, 6
 * and 12 months when they are switched on, and the automations that start
 * "when coaching ends". Resolves how to take it all back.
 * @returns {(profile: object) => Promise<{ todos: number, undo: () => Promise<void> }>} `profile`: the client as saved, now past
 */
export function useCoachingEnded() {
  const { userId, coach, isOwner, settings, checkIns, todayKey } = useCoachPortal();
  const run = useRunAutomations();
  return useCallback(async (profile) => {
    const suggest = settings?.crm?.suggest_check_ins !== false ? checkInsToSuggest([profile], { coachId: coach.id, newId, existing: checkIns, todayKey }) : [];
    try { if (suggest.length) await saveRows(userId, suggest.map((c) => ['client_check_ins', c])); } catch { /* suggested again from Past clients */ }
    // Automations are the owner's; an associate's client ending sets none off.
    const auto = isOwner ? await run(endedEvent(profile)) : null;
    return {
      todos: auto?.done.todos || 0,
      undo: async () => {
        if (auto) await auto.undo();
        for (const c of suggest) await removeRow(userId, 'client_check_ins', c.id).catch(() => {});
      },
    };
  }, [userId, coach.id, isOwner, settings, checkIns, todayKey, run]);
}

// ---------------------------------------------------------------- emails arriving

const standKey = (userId, name) => deviceKey('cache', userId, `coach-email-standin-${name}`);
const keepAt = (key) => ({ read: () => readJson(key), write: (state) => { writeJson(key, state); } });
/** Which email stand-ins are switched on on this device (never on the live site). */
export const emailStandInsOn = (userId) => (LIVE ? {} : readJson(standKey(userId, 'on')) || {});
export const setEmailStandIn = (userId, name, on) => { if (!LIVE) writeJson(standKey(userId, 'on'), { ...emailStandInsOn(userId), [name]: Boolean(on) }); };
/** The stand-ins as this device keeps them now (made fresh each time, so every tab reads the same ones). */
const standInsNow = (userId) => ({ copyIn: copyInStandIn({ keep: keepAt(standKey(userId, 'copy-in')) }), gmail: gmailStandIn({ keep: keepAt(standKey(userId, 'gmail')) }) });
const STAND_IN_KEYS = [{ kind: 'log', key: 'log.you.standin7k' }, { kind: 'todo', key: 'todo.you.standin9b' }];

/**
 * The owner's two addresses as Settings shows them: { log, todo } in full,
 * or '' for each when the email service isn't set up. On a build that isn't
 * live the stand-in's addresses show once its switch is on.
 */
export function useEmailAddresses() {
  const { userId, isOwner, emailAddresses } = useCoachPortal();
  const [state, setState] = useState({ log: '', todo: '', ready: false, gmail: false, standIns: emailStandInsOn(userId) });
  const [turn, setTurn] = useState(0);
  const keys = JSON.stringify(emailAddresses.map((k) => [k.kind, k.key]));
  useEffect(() => {
    if (!isOwner) return undefined;
    let live = true;
    (async () => {
      const on = emailStandInsOn(userId);
      // Only the live site's server ever has a key, so nothing else is asked.
      const status = LIVE ? await emailStatus(askEmailServer) : { copy_in: false, gmail: false, domain: null };
      const stand = standInsNow(userId);
      const chosen = chooseEmailAdapters(status, { ask: askEmailServer, live: LIVE || !on.copyIn, standIns: stand });
      // The keys are the database's (made once, with 052); the stand-in has its own until then.
      let rows = JSON.parse(keys).map(([kind, key]) => ({ kind, key }));
      if (!rows.length && status.copy_in) rows = (await emailAddressesStart(userId).catch(() => null)) || [];
      if (!rows.length && !LIVE && on.copyIn) rows = STAND_IN_KEYS;
      const shown = await chosen.copyIn.addresses(rows).catch(() => ({ log: '', todo: '' }));
      if (live) setState({ log: shown.log || '', todo: shown.todo || '', ready: true, gmail: status.gmail === true, standIns: on });
    })();
    return () => { live = false; };
  }, [userId, isOwner, keys, turn]);
  return { ...state, refresh: () => setTurn((n) => n + 1) };
}

/**
 * Emails arriving (the copy-in address and Gmail), one loop for the owner's
 * portal, mounted by CoachApp. With the real services the DATABASE logs
 * each email as it arrives (the server calls email_in), and the store's own
 * loading shows it; this loop is for Gmail's rounds and, on a build that
 * isn't live, for the stand-ins, so every screen can be walked with no key.
 * An email is logged by the database once 052 is there (coach_email_add),
 * and by crm.js's emailLogPlan on the device before that.
 */
export function EmailSync() {
  const { userId, isOwner, coach, settings } = useCoachPortal();
  const { user } = useContext(AuthContext);
  const busy = useRef(false);
  const latest = useRef(null);
  latest.current = { coachId: coach.id, own: [coach.email, user?.email].filter(Boolean), logGmail: settings?.email?.log_gmail === true };

  const round = useCallback(async () => {
    if (!isOwner || LIVE || busy.current) return { logged: 0, todos: 0, waiting: 0 }; // on the live site the server and the database do this
    const on = emailStandInsOn(userId);
    if (!on.copyIn && !on.gmail) return { logged: 0, todos: 0, waiting: 0 };
    busy.current = true;
    const out = { logged: 0, todos: 0, waiting: 0 };
    try {
      const { coachId, own, logGmail } = latest.current;
      const stand = standInsNow(userId);
      const there = (await coachCrmReady().catch(() => false)) === true;
      const mine = (table) => rowsOf(coachState(userId), table).filter((r) => r.coach_id === coachId);
      /** One email logged: by the database with 052, on the device before it. */
      const log = async (email) => {
        if (there) { const answer = await logEmail(userId, email); return answer || { new: false, links: 0, waiting: 0 }; }
        const people = [email.from, ...(email.to || []), ...(email.cc || [])].filter((p) => p?.email);
        const found = await networkDuplicatesOf(userId, people.map((p) => ({ name: null, email: p.email }))).catch(() => []);
        const state = coachState(userId);
        const plan = emailLogPlan(email, {
          id: newId(), coachId, newId, nowIso: new Date().toISOString(), emails: mine('coach_emails'), leads: mine('coach_leads'), clients: mine('client_profiles'),
          network: found.filter((f) => f.by === 'email' && !f.archived).map((f) => ({ id: f.id, email: f.email })), contacts: rowsOf(state, 'organisation_contacts'), own,
          keys: [...mine('coach_email_addresses').map((k) => k.key), ...STAND_IN_KEYS.map((k) => k.key)], waiting: mine('coach_email_waiting'),
        });
        if (!plan.new) return { new: false, links: 0, waiting: 0 };
        await saveRows(userId, [['coach_emails', plan.email], ...plan.links.map((l) => ['coach_email_links', l]), ...plan.waiting.map((w) => ['coach_email_waiting', w]),
          ...plan.leads.map((l) => ['coach_leads', l]), ...plan.events.map((e) => ['coach_lead_events', e]), ...plan.clients.map((c) => ['client_profiles', c])]);
        if (plan.body) await saveEmailBody(userId, coachId, plan.emailId, plan.body).catch(() => {});
        return { new: true, links: plan.links.length, waiting: plan.waiting.length };
      };
      if (on.copyIn) {
        for (const payload of stand.copyIn.handOver()) {
          const read = readInbound(payload, { domain: STAND_IN_DOMAIN });
          if (read.problem) continue;
          if (read.kind === 'todo') {
            const made = todoFromEmail(read.email, { id: newId(), coachId, todos: mine('coach_todos'), nowIso: new Date().toISOString() });
            if (made.todo) { await saveRow(userId, 'coach_todos', made.todo); out.todos += 1; }
          } else {
            // Which way it went, as the server decides it for the real address (api/coach-email-in.js): from the owner it was sent, from anyone else it came in.
            const answer = await log({ ...read.email, direction: directionOf(read.email, own), source: 'copy_in' });
            if (answer.new) out.logged += 1;
            out.waiting += answer.waiting || 0;
          }
        }
      }
      if (on.gmail) {
        const cursorKey = standKey(userId, 'gmail-cursor');
        const done = await gmailOnce({ gmail: stand.gmail, cursor: readJson(cursorKey), on: logGmail, log });
        if (!done.problem) writeJson(cursorKey, done.cursor);
        out.logged += done.logged;
        out.waiting += done.waiting;
      }
    } catch { /* it is asked again on the next round */ } finally { busy.current = false; }
    return out;
  }, [userId, isOwner]);

  useEffect(() => {
    if (!isOwner || LIVE) return undefined;
    const timer = setTimeout(round, 1200);
    const onShow = () => { if (document.visibilityState === 'visible') round(); };
    document.addEventListener('visibilitychange', onShow);
    // A build that isn't live gives the suites, and a tester, the stand-ins by hand: an invented email "arrives", then a round logs it.
    window.__clarityEmailSync = { round, copyIn: () => standInsNow(userId).copyIn, gmail: () => standInsNow(userId).gmail, keys: () => STAND_IN_KEYS, domain: STAND_IN_DOMAIN };
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); delete window.__clarityEmailSync; };
  }, [isOwner, round, userId]);
  return null;
}

// ---------------------------------------------------------------- emails on a timeline that isn't a lead's

/** Emails on a client's or a contact's timeline: each row opens its email (Leads' own panel). `rows`: crm.js's emailsOn. */
export function EmailRows({ rows }) {
  const { emails } = useCoachPortal();
  const [openId, setOpenId] = useState(null);
  if (!rows.length) return null;
  return (
    <>
      {rows.map((r) => (
        <TimelineRow key={r.id} when={r.when} title={r.title} lines={[r.tag]} className="cc-lead-mail" onClick={() => setOpenId(r.emailId)} />
      ))}
      <EmailPanel email={openId ? emails.find((e) => e.id === openId) || null : null} onClose={() => setOpenId(null)} />
    </>
  );
}
