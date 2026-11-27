import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddButton, Button, IconButton, SlidePanel, Stepper, SwitchRow, TextBox, TextField, useToast } from '../../components/design';
import { addDays, instantAt } from '../../lib/time/index.js';
import { newId, saveRow } from '../../lib/coach/store';
import {
  BOOK_PATHS, BOOKING_LIMIT_ROWS, HOURS_NAMES, bookingLimits, bookingLimitWords, CALL_TYPE_ROWS, callTypeLine, callTypeProblem, dayBeforeWords, limitToSave, numberProblem, openLinksLine, publicLink,
  questionLabel, QUESTIONS_MAX, questionsToSave, REMINDER_SWITCHES,
} from '../../lib/coach/calendar';
import { InlineLink, SettingRow, TextLink } from './parts';
import { useCalendar } from './calendarParts';
import { copyWords, LinkPanel, useStartCallTypes } from './BookCall';
import { shownCallName } from '../../lib/callNames.js';
import './booking.css';

// Settings, Booking (Phase 6a run 3; M11's "setph"): the reminders people
// get before a call, the limits every booking keeps to (a number editor
// each, written as numbers), each call type's own page (its length, the
// gaps either side, the notice needed, the calls a day, its questions and
// its link, with Copy) and the single-use links. Associates have their own.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const LIMIT_KEYS = { gap: 'gap', per_day: 'perDay', notice: 'notice', ahead: 'ahead' };

const numberEditor = (row) => function NumberEditor({ value, setValue, label }) {
  return <Stepper label={label} value={Number(value) || 0} min={row.min} max={row.max} step={row.step} unit={row.unit} onChange={(n) => setValue(String(n))} />;
};

/** One call type's page, edited in the side panel. */
function CallTypePanel({ cal, type, onClose }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!type) return;
    setD({ ...type, name: shownCallName(type.name), questions: (type.questions || []).map((q) => ({ id: q.id, label: questionLabel(q), kind: q.kind, required: q.required === true })) });
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type?.id]);
  if (!type || !d) return <SlidePanel open={false} onClose={onClose} title="Booking page" />;
  const set = (patch) => { setD((was) => ({ ...was, ...patch })); setProblem(null); };
  const link = publicLink(window.location.origin, BOOK_PATHS.page(type.page_key));
  const copy = async () => { const ok = await copyWords(link); toast.show(ok ? 'Link copied' : 'That didn’t copy. Select the link and copy it yourself.'); };
  const save = async () => {
    if (busy.current) return;
    const line = callTypeProblem(d);
    if (line) { setProblem(line); return; }
    busy.current = true;
    const next = { ...type, ...Object.fromEntries(CALL_TYPE_ROWS.map((r) => [r.key, Number(d[r.key])])), name: d.name.trim() === shownCallName(type.name) ? type.name : d.name.trim(), description: String(d.description || '').trim() || null, active: d.active !== false, questions: questionsToSave(d.questions, newId) };
    try {
      const status = await saveRow(cal.userId, 'coach_call_types', next);
      toast.saved({ message: status === 'queued' ? 'Will sync' : 'Saved', long: true, onUndo: () => saveRow(cal.userId, 'coach_call_types', type).catch(() => {}) });
      onClose();
    } catch { setProblem(SAVE_PROBLEM); } finally { busy.current = false; }
  };
  return (
    <SlidePanel draftKey={`booking-page:${type.key || type.id}`} open onClose={onClose} title={`${shownCallName(type.name)} page`} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" className="ds-panel-go" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><TextBox lines="one" label="Name" value={d.name} maxLength={80} onChange={(v) => set({ name: v })} /></div>
      <div className="cc-field"><TextBox label="A line under the name" value={d.description || ''} maxLength={300} onChange={(v) => set({ description: v })} /></div>
      {CALL_TYPE_ROWS.map((r) => (
        <div key={r.key} className="cc-field cc-book-count">
          <span className="cc-field-label">{r.label}</span>
          <Stepper label={r.label} value={Number(d[r.key]) || 0} min={r.min} max={r.max} step={r.step} unit={r.unit} onChange={(n) => set({ [r.key]: n })} />
        </div>
      ))}
      <div className="cc-field">
        <span className="cc-field-label">Questions before booking</span>
        {d.questions.map((q, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="cc-book-question">
            <TextBox lines="one" ariaLabel={`Question ${i + 1}`} value={q.label} maxLength={200} onChange={(v) => set({ questions: d.questions.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
            <IconButton label={`Remove question ${i + 1}`} onClick={() => set({ questions: d.questions.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {d.questions.length < QUESTIONS_MAX && <AddButton onClick={() => set({ questions: [...d.questions, { label: '', kind: 'long', required: false }] })}>Add question</AddButton>}
      </div>
      <div className="cc-field cc-todo-switch"><SwitchRow label="Open for booking" note="Switched off, the page says it’s closed." checked={d.active !== false} onChange={(on) => set({ active: on })} /></div>
      <div className="cc-field"><TextField label="Its link" value={link} readOnly onFocus={(e) => e.target.select()} onChange={() => {}} /></div>
      <div className="cc-acts"><TextLink onClick={copy}>Copy link</TextLink></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

export default function BookingSettings() {
  const cal = useCalendar();
  const navigate = useNavigate();
  const toast = useToast();
  useStartCallTypes(cal);
  const { settings, coachZone, todayKey } = cal;
  const booking = settings.booking || {};
  const [editing, setEditing] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const set = async (next) => {
    try {
      const status = await saveRow(cal.userId, 'coach_settings', { ...settings, booking: next });
      toast.saved({ message: status === 'queued' ? 'Will sync' : 'Saved', long: true, onUndo: () => saveRow(cal.userId, 'coach_settings', { ...settings, booking }).catch(() => {}) });
    } catch (error) { toast.error(SAVE_PROBLEM); throw error; }
  };
  const limits = bookingLimits(settings);
  const words = bookingLimitWords(settings);
  const example = instantAt(addDays(todayKey, 1), '09:00', coachZone);
  const copy = async (t) => { const ok = await copyWords(publicLink(window.location.origin, BOOK_PATHS.page(t.page_key))); toast.show(ok ? 'Link copied' : 'That didn’t copy. Open Edit and copy it there.'); };
  const type = editing ? cal.callTypes.find((t) => t.id === editing) || null : null;
  return (
    <>
      <p className="cc-small-label">Reminders</p>
      {REMINDER_SWITCHES.map((s) => (
        <SwitchRow key={s.key} label={s.label} checked={s.startsOn ? booking[s.key] !== false : booking[s.key] === true} onChange={(on) => set({ ...booking, [s.key]: on }).catch(() => {})} />
      ))}
      <p className="cc-small-label">What the email says</p>
      <p className="cc-quiet">{dayBeforeWords(example, coachZone, cal.coach.display_first_name || '')}</p>
      <p className="cc-note">Each person reads the time in their own time zone.</p>

      <p className="cc-small-label">Limits</p>
      {BOOKING_LIMIT_ROWS.map((row) => (
        <SettingRow
          key={row.key}
          label={row.label}
          value={String(limits[LIMIT_KEYS[row.key]])}
          words={words[row.key]}
          editor={numberEditor(row)}
          check={(v) => numberProblem(row, v)}
          onSave={(v) => set(limitToSave(booking, row.key, v))}
        />
      ))}

      <p className="cc-small-label">Pages and links</p>
      {cal.callTypes.map((t) => (
        <div key={t.id} className="cc-setrow">
          <span className="cc-setrow-label">{shownCallName(t.name)} page</span>
          <span className="cc-setrow-value">{t.active === false ? 'Closed' : callTypeLine(t)}</span>
          <span className="cc-setrow-acts">
            <TextLink aria-label={`Copy the ${shownCallName(t.name)} page’s link`} onClick={() => copy(t)}>Copy link</TextLink>
            <Button variant="text" aria-label={`Edit ${shownCallName(t.name)} page`} onClick={() => setEditing(t.id)}>Edit</Button>
          </span>
        </div>
      ))}
      <div className="cc-setrow">
        <span className="cc-setrow-label">Single-use links</span>
        <span className="cc-setrow-value">{openLinksLine(cal.bookingLinks, todayKey)}</span>
        <Button variant="text" aria-label="Make a single-use link" onClick={() => setLinkOpen(true)}>Make one</Button>
      </div>
      {HOURS_NAMES.bookingNote.map((line) => <p key={line} className="cc-note">{line}</p>)}
      {/* No Open for calls block ahead: the pages have nothing to offer, so it says so here (P11). */}
      {!(cal.openBlocks || []).some((b) => new Date(b.ends_at) > new Date()) && <p className="cc-note">{HOURS_NAMES.noOpenTimes} <InlineLink onClick={() => navigate('/coach/calendar/open')}>Open for calls</InlineLink></p>}

      <CallTypePanel cal={cal} type={type} onClose={() => setEditing(null)} />
      <LinkPanel cal={cal} open={linkOpen} start={null} onClose={() => setLinkOpen(false)} />
    </>
  );
}
