import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, DatePicker, Dropdown, InlineChoice, SlidePanel, TextField, useToast } from '../../components/design';
import { rowsOf, saveRows } from '../../lib/coach/store';
import { addDays, dayWords, firstName } from '../../lib/coach/model';
import { instantFrom, oneRecapWords, SESSION_KINDS, SESSION_LENGTHS, sessionRow, toWriteUp } from '../../lib/coach/day';
import { addSession } from '../../lib/coach/sessionActions';
import { removePairs } from '../../lib/coach/todoActions';
import { Row, useCoachPortal } from './parts';
import './sessions.css';

// Sessions, in parts (Phase 6a run 2, step 5; M11): who a session is with,
// the list of sessions on a client's or a group's page, and Add session.
// The brief, After a call and the client's and group's pages all use them.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
export const LENGTHS = SESSION_LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` }));
const CLIENT_KINDS = ['coaching', 'three_way', 'review'].map((k) => ({ value: k, label: SESSION_KINDS[k] }));

/** Runs a save, then says so with Undo for 10 seconds; an error says what happened, then what to do. */
export function useSay() {
  const toast = useToast();
  return async (work, message = 'Saved', onUndo) => {
    try {
      const status = await work();
      if (message) toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true });
      return true;
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      return false;
    }
  };
}

/** Who a session is with: the client or the group, their name, and where their page is. */
export function useSessionWho() {
  const { clients, groups, state } = useCoachPortal();
  const members = rowsOf(state, 'coach_group_members');
  return (session) => {
    if (!session) return null;
    if (session.group_id) {
      const group = groups.find((g) => g.id === session.group_id) || null;
      const people = members.filter((m) => m.group_id === session.group_id);
      return { group, client: null, name: group?.name || 'Group', first: 'the group', people: people.length, members: people, to: group ? `/coach/groups/${group.id}` : '/coach/clients?tab=groups' };
    }
    const client = clients.find((c) => c.id === session.profile_id) || null;
    return { group: null, client, name: client?.name || 'Client', first: firstName(client?.name) || 'your client', people: 0, members: [], to: client ? `/coach/clients/${client.id}` : '/coach/clients' };
  };
}

/** Every session given, newest first, each row opening After a call. A group's written-up session says "One recap to all 6". */
export function SessionRows({ sessions, people = 0, label }) {
  const { todayKey, now } = useCoachPortal();
  const navigate = useNavigate();
  const sorted = [...sessions].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  if (!sorted.length) return null;
  return (
    <div className="cc-rows cc-ses-rows" role="list" aria-label={label}>
      {sorted.map((s) => {
        const r = sessionRow(s, todayKey);
        const waiting = !s.outcome && toWriteUp([s], now).length > 0;
        const facts = people > 0 && s.outcome === 'held' ? [r.facts[0], oneRecapWords(people), ...r.facts.slice(1)] : waiting ? [...r.facts, 'To write up'] : r.facts;
        return (
          <div key={s.id} role="listitem">
            <Row title={r.title} facts={facts} when={r.when} label={`${r.title}, ${[...facts, r.when].filter(Boolean).join(', ')}. Open`} onClick={() => navigate(`/coach/sessions/${s.id}`)} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Add session: the day, the time, how long and the kind. A group's is a
 * Group session, and each member who counts against their own engagement
 * is named on it. The button is never greyed out.
 * @param {{ open: boolean, onClose: () => void, profile?: object, group?: object, engagement?: object }} props
 */
export function AddSessionPanel({ open, onClose, profile = null, group = null, engagement = null }) {
  const { userId, coach, state, todayKey } = useCoachPortal();
  const say = useSay();
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [kind, setKind] = useState('coaching');
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const usual = engagement && SESSION_LENGTHS.includes(Number(engagement.default_minutes)) ? String(engagement.default_minutes) : '60';
  useEffect(() => { if (open) { setDay(''); setTime(''); setMinutes(usual); setKind('coaching'); setProblem(null); } }, [open, usual]);

  const add = async () => {
    if (busy.current) return; // one session a press
    const startsAt = instantFrom(day, time);
    if (!startsAt) { setProblem('Choose the day and the time to carry on.'); return; }
    busy.current = true;
    try {
      let made = null;
      const ok = await say(async () => {
        made = await addSession(userId, {
          coachId: coach.id, profileId: profile?.id || null, groupId: group?.id || null, engagementId: engagement?.id || null,
          kind: group ? 'group' : kind, startsAt, minutes: Number(minutes),
          members: group ? rowsOf(state, 'coach_group_members').filter((m) => m.group_id === group.id) : [], engagements: rowsOf(state, 'engagements'),
        });
        return 'saved';
      }, 'Session added', () => (made ? removePairs(userId, made.pairs) : null));
      if (ok) onClose();
    } finally { busy.current = false; }
  };

  return (
    <SlidePanel draftKey={`session:new:${engagement?.id || profile?.id || group?.id || 'none'}`} open={open} onClose={onClose} title="Add session" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" className="ds-panel-go" onClick={add}>Add session</Button></div>}>
      <div className="cc-field cc-two cc-ses-two">
        <DatePicker label="Which day?" value={day} min={addDays(todayKey, -730)} max={addDays(todayKey, 730)} placeholder="Choose a day" format={(k) => dayWords(k, todayKey)} onChange={(k) => { setDay(k); setProblem(null); }} />
        <TextField label="What time?" type="time" step={900} value={time} onChange={(e) => { setTime(e.target.value); setProblem(null); }} />
      </div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <div className="cc-field"><InlineChoice label="How long is it?" form="pills" options={LENGTHS} value={minutes} onChange={setMinutes} /></div>
      {!group && <div className="cc-field"><Dropdown label="What kind is it?" options={CLIENT_KINDS} value={kind} onChange={setKind} /></div>}
    </SlidePanel>
  );
}

/** Saves rows again (Undo for something deleted). */
export const putBack = (userId, pairs) => saveRows(userId, pairs).catch(() => {});
