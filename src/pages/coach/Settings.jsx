import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { AddButton, Button, Dropdown, InlineChoice, PageHeader, SearchField, SlidePanel, SwitchRow, TextField, useColourMode, useIsPhone, useToast } from '../../components/design';
import { zonePlace, isZone } from '../../lib/time';
import { parseDbTimestamp, getLocalDateKey } from '../../lib/dateFormatter';
import { newId, removeRow, rowsOf, saveRow, keyOf } from '../../lib/coach/store';
import { addCoach, decideProfile, saveCapacity, saveCoachDetails, saveCoachFacts, switchCoach } from '../../lib/coach/actions';
import { capacityFromTyped } from '../../lib/coach/day';
import { clean, coverState, dayWords, hoursWords, isEmail, NOTIFICATION_KINDS, notificationOn, parseHours, rangeWords, START_ZONES } from '../../lib/coach/model';
import { SETTINGS_SECTIONS } from '../../lib/coach/navigation';
import { Back, Line, SettingRow, TextLink, useCoachPortal } from './parts';
import { useHiddenHelp } from './help';
import BookingSettings from './BookingSettings';

// Settings, two panes (M11, version 3.4): on a laptop the list of sections
// on the left and the chosen one on the right; on a phone the list, and
// each section opens full screen with Back. Each setting is one calm row:
// its label, its value and Edit. A box shows only while editing, with Save
// and Cancel. Switches for on and off.
//
// Built fully now: Your details, Away and cover (cover is the owner's),
// Notifications, Coaches (owner), Look, Tags and fields, the Activity log
// (owner), and since run 3 Booking (BookingSettings.jsx), Working hours and
// Time zones, which the calendar and booking read. Rows and storage now,
// put to work in later runs: My calendars' connection, Email, Note layouts.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const LOOKS = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'device', label: 'Match my device' }];
const LAYOUTS = [
  ['first', 'First session', ['What brought them to coaching', 'What good looks like in 6 months', 'What to watch for']],
  ['regular', 'Regular session', ['Focus', 'Insight', 'Next time']],
  ['review', 'Review', ['Progress against the goals', 'What has shifted', 'What to keep doing']],
  ['close', 'Close', ['The biggest change', 'What they carry on with', 'A line for the testimonial']],
];

const textEditor = (props = {}) => ({ value, setValue, label }) => (
  <TextField label={label} value={value ?? ''} onChange={(e) => setValue(e.target.value)} autoFocus {...props} />
);

function useSettingsSave() {
  const { userId, settings } = useCoachPortal();
  return (change) => saveRow(userId, 'coach_settings', { ...settings, ...change });
}

function useSaved() {
  const toast = useToast();
  return async (work, { message = 'Saved', onUndo } = {}) => {
    try {
      const status = await work();
      toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true });
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      throw error;
    }
  };
}

// ---------------------------------------------------------------- Your details
function YourDetails() {
  const { coach, isOwner, settings, reloadRole, reloadCoaches } = useCoachPortal();
  const { user } = useContext(AuthContext);
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const details = async (change, undo) => {
    await saved(async () => { await saveCoachDetails(coach, change); reloadRole(); reloadCoaches(); }, {
      onUndo: () => saveCoachDetails({ ...coach, ...change }, undo).then(() => { reloadRole(); reloadCoaches(); }).catch(() => {}),
    });
  };
  const ways = coach.contact_ways || [];
  const way = (key, label) => (
    <SwitchRow
      key={key}
      label={label}
      checked={ways.includes(key)}
      onChange={(on) => details({ contact_ways: on ? [...new Set([...ways, key])] : ways.filter((w) => w !== key) }, { contact_ways: ways }).catch(() => {})}
    />
  );
  const zone = settings.time_zone || null;
  const zoneOptions = [...new Set([...(settings.time_zones || START_ZONES), 'Europe/London', ...(zone ? [zone] : [])])].map((z) => ({ value: z, label: zonePlace(z) })).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <>
      <SettingRow
        label="Name clients see"
        value={coach.display_first_name}
        editor={textEditor({ autoComplete: 'given-name', maxLength: 60 })}
        check={(v) => (clean(v) ? null : 'Type the name clients see to carry on.')}
        onSave={(v) => details({ display_first_name: clean(v) }, { display_first_name: coach.display_first_name })}
      />
      {'full_name' in coach && (
        <SettingRow
          label="Full name"
          value={coach.full_name || ''}
          words={coach.full_name || 'Not added yet'}
          editor={textEditor({ autoComplete: 'name', maxLength: 120 })}
          onSave={(v) => details({ full_name: clean(v) || null }, { full_name: coach.full_name || null })}
        />
      )}
      <SettingRow label="Email" value={user?.email || ''} still />
      <SettingRow
        label="Mobile"
        value={coach.mobile || ''}
        words={coach.mobile || 'Not added yet'}
        editor={textEditor({ type: 'tel', autoComplete: 'tel', inputMode: 'tel', placeholder: '+44 7700 900123' })}
        check={(v) => (!clean(v) || /^\+[0-9]{6,15}$/.test(clean(v).replace(/[\s()-]/g, '')) ? null : 'Type the number with its country code, such as +44 7700 900123.')}
        onSave={(v) => details({ mobile: clean(v).replace(/[\s()-]/g, '') || null }, { mobile: coach.mobile || null })}
      />
      <SettingRow
        label="Time zone"
        value={zone}
        words={zone ? zonePlace(zone) : 'Not chosen yet'}
        editor={({ value, setValue }) => <Dropdown label="Time zone" options={zoneOptions} value={value} onChange={setValue} />}
        check={(v) => (v && isZone(v) ? null : 'Choose a time zone to carry on.')}
        onSave={(v) => saved(() => saveSettings({ time_zone: v }), { onUndo: () => saveSettings({ time_zone: zone }) })}
      />
      <p className="cc-small-label">How clients can reach you</p>
      {way('email', 'Email')}
      {way('whatsapp', 'WhatsApp')}
      {way('imessage', 'iMessage')}
    </>
  );
}

// ---------------------------------------------------------------- Away and cover
function AwayAndCover() {
  const { userId, coach, isOwner, state, coaches, clients, todayKey } = useCoachPortal();
  const saved = useSaved();
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [problem, setProblem] = useState(null);
  const [cover, setCover] = useState(null);
  const away = rowsOf(state, 'coach_away').filter((a) => a.coach_id === coach.id && a.ends_on >= todayKey).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const covers = rowsOf(state, 'coach_cover').filter((c) => coverState(c, todayKey) !== 'over').sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const others = coaches.filter((c) => c.coach_id !== coach.id && c.active);
  const nameOf = (id) => coaches.find((c) => c.coach_id === id)?.full_name || coaches.find((c) => c.coach_id === id)?.first_name || 'A coach';
  const add = async (e) => {
    e.preventDefault();
    if (!from || !to) { setProblem('Choose the first and last day to carry on.'); return; }
    if (to < from) { setProblem('The last day comes after the first.'); return; }
    const row = { id: newId(), coach_id: coach.id, starts_on: from, ends_on: to };
    await saved(() => saveRow(userId, 'coach_away', row), { onUndo: () => removeRow(userId, 'coach_away', row.id) }).catch(() => {});
    setAdding(false); setFrom(''); setTo(''); setProblem(null);
  };
  const removeAway = (row) => saved(() => removeRow(userId, 'coach_away', row.id).then(() => 'saved'), { message: 'Deleted', onUndo: () => saveRow(userId, 'coach_away', row) }).catch(() => {});
  const STATE = { waiting: 'Waiting for the client to agree', before: 'Agreed', on: 'Covering now' };
  return (
    <>
      {away.length === 0 && <p className="cc-quiet">You have no time away planned.</p>}
      {away.map((a) => (
        <div key={a.id} className="cc-setrow">
          <span className="cc-setrow-label">Away</span>
          <span className="cc-setrow-value">{rangeWords(a.starts_on, a.ends_on, todayKey)}</span>
          <TextLink aria-label={`Delete away ${rangeWords(a.starts_on, a.ends_on, todayKey)}`} onClick={() => removeAway(a)}>Delete</TextLink>
        </div>
      ))}
      {adding ? (
        <form noValidate className="cc-setrow cc-setrow--edit" onSubmit={add}>
          <span className="cc-setrow-label">Away</span>
          <div className="cc-setrow-edit">
            <div className="cc-two">
              <TextField label="First day" type="date" value={from} min={todayKey} onChange={(e) => { setFrom(e.target.value); setProblem(null); }} autoFocus />
              <TextField label="Last day" type="date" value={to} min={from || todayKey} onChange={(e) => { setTo(e.target.value); setProblem(null); }} />
            </div>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
            <div className="cc-setrow-saves">
              <Button variant="primary" type="submit">Save</Button>
              <Button variant="text" onClick={() => { setAdding(false); setProblem(null); }}>Cancel</Button>
            </div>
          </div>
        </form>
      ) : <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add time away</AddButton></div>}

      {isOwner && (
        <>
          <p className="cc-small-label">Cover</p>
          {covers.length === 0 && <p className="cc-quiet">No cover is set up.</p>}
          {covers.map((c) => {
            const client = clients.find((p) => p.id === c.profile_id);
            return (
              <Line key={c.id} title={`${nameOf(c.cover_coach_id)} covers ${client?.name || 'a client'}`} small={`${rangeWords(c.starts_on, c.ends_on, todayKey)}. ${STATE[coverState(c, todayKey)]}.`}>
                <span className="cc-line-actions">
                  {!c.client_agreed_at && <TextLink onClick={() => saved(() => saveRow(userId, 'coach_cover', { ...c, client_agreed_at: new Date().toISOString() }), { onUndo: () => saveRow(userId, 'coach_cover', c) }).catch(() => {})}>Record their yes</TextLink>}
                  <TextLink aria-label={`Delete cover for ${client?.name || 'a client'}`} onClick={() => saved(() => removeRow(userId, 'coach_cover', c.id).then(() => 'saved'), { message: 'Deleted', onUndo: () => saveRow(userId, 'coach_cover', c) }).catch(() => {})}>Delete</TextLink>
                </span>
              </Line>
            );
          })}
          {others.length > 0 && clients.length > 0
            ? <div className="cc-add"><AddButton onClick={() => setCover({ cover_coach_id: others[0].coach_id, profile_id: '', starts_on: away[0]?.starts_on || '', ends_on: away[0]?.ends_on || '' })}>Add cover</AddButton></div>
            : <p className="cc-note">{others.length === 0 ? 'Cover needs another coach. Add one under Coaches.' : 'Cover is for a client. Add one under Clients.'}</p>}
          <p className="cc-note">Each client agrees first, and the cover coach sees only what they share, between the dates.</p>
          <CoverPanel draft={cover} setDraft={setCover} others={others} />
        </>
      )}
    </>
  );
}

function CoverPanel({ draft, setDraft, others }) {
  const { userId, coach, clients } = useCoachPortal();
  const saved = useSaved();
  const [problem, setProblem] = useState(null);
  if (!draft) return <SlidePanel open={false} onClose={() => setDraft(null)} title="Add cover" />;
  const set = (change) => { setDraft({ ...draft, ...change }); setProblem(null); };
  const save = async () => {
    if (!draft.profile_id) { setProblem('Choose a client to carry on.'); return; }
    if (!draft.starts_on || !draft.ends_on) { setProblem('Choose the first and last day to carry on.'); return; }
    if (draft.ends_on < draft.starts_on) { setProblem('The last day comes after the first.'); return; }
    const row = { id: newId(), coach_id: coach.id, cover_coach_id: draft.cover_coach_id, profile_id: draft.profile_id, starts_on: draft.starts_on, ends_on: draft.ends_on, client_agreed_at: null, created_by: userId };
    await saved(() => saveRow(userId, 'coach_cover', row), { onUndo: () => removeRow(userId, 'coach_cover', row.id) }).catch(() => {});
    setDraft(null);
  };
  return (
    <SlidePanel open onClose={() => setDraft(null)} title="Add cover" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={save}>Add cover</Button></div>}>
      <div className="cc-field"><Dropdown label="Cover coach" options={others.map((c) => ({ value: c.coach_id, label: c.full_name || c.first_name }))} value={draft.cover_coach_id} onChange={(v) => set({ cover_coach_id: v })} /></div>
      <div className="cc-field"><Dropdown label="Client" placeholder="Choose a client" options={clients.filter((p) => p.status !== 'past').map((p) => ({ value: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label))} value={draft.profile_id} onChange={(v) => set({ profile_id: v })} /></div>
      <div className="cc-field cc-two">
        <TextField label="First day" type="date" value={draft.starts_on} onChange={(e) => set({ starts_on: e.target.value })} />
        <TextField label="Last day" type="date" value={draft.ends_on} min={draft.starts_on || undefined} onChange={(e) => set({ ends_on: e.target.value })} />
      </div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <p className="cc-note">The client is asked first. Nothing is shared until they agree.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Notifications
function Notifications() {
  const { settings, isOwner } = useCoachPortal();
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const set = (change, undo) => saved(() => saveSettings(change), { onUndo: () => saveSettings(undo) }).catch(() => {});
  const quiet = settings.quiet_from && settings.quiet_to ? `${String(settings.quiet_from).slice(0, 5)} to ${String(settings.quiet_to).slice(0, 5)}` : '';
  const parseQuiet = (text) => {
    const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:to|-|–)\s*(\d{1,2})[:.](\d{2})\s*$/i.exec(text || '');
    if (!m) return null;
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
    const p = (n) => String(n).padStart(2, '0');
    return { quiet_from: `${p(h1)}:${p(m1)}`, quiet_to: `${p(h2)}:${p(m2)}` };
  };
  return (
    <>
      {NOTIFICATION_KINDS.filter((k) => !k.owner || isOwner).map((k) => (
        <SwitchRow
          key={k.key}
          label={k.label}
          note={k.note}
          checked={notificationOn(settings, k.key)}
          onChange={(on) => set({ notifications: { ...(settings.notifications || {}), [k.key]: on } }, { notifications: settings.notifications || {} })}
        />
      ))}
      <SwitchRow label="On my phone" note="Phone notifications arrive with the phone app. This keeps your choice." checked={settings.phone_notifications === true} onChange={(on) => set({ phone_notifications: on }, { phone_notifications: settings.phone_notifications === true })} />
      <SettingRow
        label="Quiet hours"
        value={quiet}
        words={quiet || 'None'}
        editor={textEditor({ placeholder: '21:00 to 07:00' })}
        check={(v) => (!clean(v) || parseQuiet(v) ? null : 'Type the hours like 21:00 to 07:00.')}
        onSave={(v) => set(clean(v) ? parseQuiet(v) : { quiet_from: null, quiet_to: null }, { quiet_from: settings.quiet_from || null, quiet_to: settings.quiet_to || null })}
      />
      <p className="cc-note">The bell in the header keeps everything, whatever you choose here.</p>
    </>
  );
}

// ---------------------------------------------------------------- the calendar's settings (Booking is its own file: BookingSettings.jsx)
function WorkingHours() {
  const { settings, coach, reloadRole } = useCoachPortal();
  const hoursAWeek = Number(coach.capacity_hours_week ?? 15);
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const block = (key, title, start) => {
    const hours = settings[key] && Object.keys(settings[key]).length ? settings[key] : start;
    return (
      <>
        <p className="cc-small-label">{title}</p>
        {DAYS.map(([day, label]) => (
          <SettingRow
            key={`${key}-${day}`}
            label={label}
            value={hours[day] ? hoursWords(hours[day]) : ''}
            words={hoursWords(hours[day])}
            editor={textEditor({ placeholder: '09:00 to 17:00' })}
            check={(v) => (!clean(v) || parseHours(v) ? null : 'Type the hours like 09:00 to 17:00, or leave it empty for a day off.')}
            onSave={(v) => saved(() => saveSettings({ [key]: { ...hours, [day]: clean(v) ? parseHours(v) : null } }), { onUndo: () => saveSettings({ [key]: hours }) })}
          />
        ))}
      </>
    );
  };
  const week = Object.fromEntries(DAYS.slice(0, 5).map(([d]) => [d, { from: '09:00', to: '17:00' }]));
  return (
    <>
      {block('working_hours', 'Your working day', week)}
      {block('booking_hours', 'Open for bookings', {})}
      <p className="cc-small-label">Capacity</p>
      <SettingRow
        label="Coaching hours each week"
        value={String(hoursAWeek)}
        words={`${hoursAWeek} hours`}
        editor={textEditor({ inputMode: 'decimal' })}
        check={(v) => (capacityFromTyped(v) == null ? 'Type a number of hours from 1 to 80.' : null)}
        onSave={(v) => saved(async () => { await saveCapacity(coach, capacityFromTyped(v)); reloadRole(); }, { onUndo: () => saveCapacity(coach, hoursAWeek).then(reloadRole).catch(() => {}) })}
      />
      <p className="cc-note">Each day has its own hours. Today’s over-full line and booking follow them, and they can be dragged on the calendar.</p>
    </>
  );
}

function TimeZones() {
  const { settings } = useCoachPortal();
  const saved = useSaved();
  const toast = useToast();
  const saveSettings = useSettingsSave();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const list = Array.isArray(settings.time_zones) && settings.time_zones.length ? settings.time_zones : START_ZONES;
  const second = settings.second_time_zone || null;
  const all = [...new Set([...START_ZONES, ...list])];
  const shown = all.filter((z) => !clean(q) || zonePlace(z).toLowerCase().includes(clean(q).toLowerCase()));
  const toggle = (zone, on) => {
    if (!on && list.length === 1) { toast.show('Keep at least one time zone.'); return; }
    const next = on ? all.filter((z) => list.includes(z) || z === zone) : list.filter((z) => z !== zone);
    saved(() => saveSettings({ time_zones: next, second_time_zone: next.includes(second) ? second : null }), { onUndo: () => saveSettings({ time_zones: list, second_time_zone: second }) }).catch(() => {});
  };
  return (
    <>
      <SettingRow
        label="Second time zone"
        value={second}
        words={second ? zonePlace(second) : 'None'}
        editor={({ value, setValue }) => <Dropdown label="Second time zone" options={list.map((z) => ({ value: z, label: zonePlace(z) }))} value={value} onChange={setValue} />}
        onSave={(v) => saved(() => saveSettings({ second_time_zone: v || null }), { onUndo: () => saveSettings({ second_time_zone: second }) })}
      />
      <p className="cc-note">It shows beside your own time on the calendar, and the calendar’s time column offers every city on your list.</p>
      <div className="cc-setrow">
        <span className="cc-setrow-label">Your list</span>
        <span className="cc-setrow-value">{list.length} {list.length === 1 ? 'city' : 'cities'}</span>
        <TextLink onClick={() => setEditing(true)}>Edit this list</TextLink>
      </div>
      <SlidePanel open={editing} onClose={() => setEditing(false)} title="Your time zones">
        <SearchField label="Search cities" placeholder="Search cities" value={q} onChange={setQ} />
        <div className="cc-setlist">
          {shown.length === 0 && <p className="cc-quiet">No city matches.</p>}
          {shown.map((z) => <SwitchRow key={z} label={zonePlace(z)} checked={list.includes(z)} onChange={(on) => toggle(z, on)} />)}
        </div>
      </SlidePanel>
    </>
  );
}

function Calendars() {
  const { settings } = useCoachPortal();
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const cals = settings.calendars || {};
  const set = (key, on) => saved(() => saveSettings({ calendars: { ...cals, [key]: on } }), { onUndo: () => saveSettings({ calendars: cals }) }).catch(() => {});
  return (
    <>
      <SwitchRow label="Work" note="Titles for you, Busy to everyone else" checked={cals.work !== false} onChange={(on) => set('work', on)} />
      <SwitchRow label="Personal" note="Titles for you, Busy to everyone else" checked={cals.personal === true} onChange={(on) => set('personal', on)} />
      <SwitchRow label="Family" note="Titles for you, Busy to everyone else" checked={cals.family === true} onChange={(on) => set('family', on)} />
      <p className="cc-note">Google Calendar connects when the calendar arrives. Clients and associates only ever see these as Busy.</p>
    </>
  );
}

function Email() {
  const { settings } = useCoachPortal();
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const email = settings.email || {};
  return (
    <>
      <SwitchRow label="Log Gmail with clients and leads" note="One line each on their timeline" checked={email.log_gmail === true} onChange={(on) => saved(() => saveSettings({ email: { ...email, log_gmail: on } }), { onUndo: () => saveSettings({ email }) }).catch(() => {})} />
      <p className="cc-note">This keeps your choice. Emails start to log when Leads and the pipeline arrive. Associates never see your inbox.</p>
    </>
  );
}

function NoteLayouts() {
  const { settings } = useCoachPortal();
  const saved = useSaved();
  const saveSettings = useSettingsSave();
  const layouts = settings.note_layouts || {};
  return (
    <>
      {LAYOUTS.map(([key, label, start]) => {
        const prompts = Array.isArray(layouts[key]) && layouts[key].length ? layouts[key] : start;
        return (
          <SettingRow
            key={key}
            label={label}
            value={prompts.join(', ')}
            editor={textEditor({ maxLength: 400 })}
            check={(v) => (clean(v) ? null : 'Type at least one prompt to carry on.')}
            onSave={(v) => saved(() => saveSettings({ note_layouts: { ...layouts, [key]: v.split(',').map(clean).filter(Boolean).slice(0, 8) } }), { onUndo: () => saveSettings({ note_layouts: layouts }) })}
          />
        );
      })}
      <p className="cc-note">Prompts are split by commas. After a call uses them when recaps arrive.</p>
    </>
  );
}

// ---------------------------------------------------------------- Tags and fields
const KINDS = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'choice', label: 'Choice' }];
const kindWords = (f) => (f.kind === 'choice' ? `Choice from ${(f.options || []).length}` : KINDS.find((k) => k.value === f.kind)?.label || '');

export function FieldPanel({ draft, setDraft }) {
  const { userId, coach, fields, state } = useCoachPortal();
  const saved = useSaved();
  const [problem, setProblem] = useState(null);
  if (!draft) return <SlidePanel open={false} onClose={() => setDraft(null)} title="Add field" />;
  const isNew = !fields.some((f) => f.id === draft.id);
  const set = (change) => { setDraft({ ...draft, ...change }); setProblem(null); };
  const save = async () => {
    const name = clean(draft.name);
    if (!name) { setProblem('Type the field’s name to carry on.'); return; }
    if (fields.some((f) => f.id !== draft.id && f.name.toLowerCase() === name.toLowerCase())) { setProblem('You already have a field with that name.'); return; }
    const options = draft.kind === 'choice' ? [...new Set(String(draft.optionsText || '').split(/[\n,]/).map(clean).filter(Boolean))].slice(0, 60) : [];
    if (draft.kind === 'choice' && options.length < 2) { setProblem('Type at least 2 choices to carry on.'); return; }
    const before = fields.find((f) => f.id === draft.id);
    const row = { id: draft.id, coach_id: coach.id, applies_to: 'client', name, kind: draft.kind, options, position: before?.position ?? fields.length };
    await saved(() => saveRow(userId, 'coach_fields', row), { message: isNew ? 'Field added' : 'Saved', onUndo: () => (before ? saveRow(userId, 'coach_fields', before) : removeRow(userId, 'coach_fields', row.id)) }).catch(() => {});
    setDraft(null);
  };
  const remove = async () => {
    const before = fields.find((f) => f.id === draft.id);
    const values = rowsOf(state, 'coach_field_values').filter((v) => v.field_id === draft.id);
    await saved(async () => {
      for (const v of values) await removeRow(userId, 'coach_field_values', keyOf('coach_field_values', v));
      await removeRow(userId, 'coach_fields', draft.id);
      return 'saved';
    }, { message: 'Deleted', onUndo: async () => { await saveRow(userId, 'coach_fields', before); for (const v of values) await saveRow(userId, 'coach_field_values', v); } }).catch(() => {});
    setDraft(null);
  };
  return (
    <SlidePanel
      open
      onClose={() => setDraft(null)}
      title={isNew ? 'Add field' : 'Edit field'}
      footer={<div className="cc-panel-foot">{isNew ? <span /> : <TextLink onClick={remove}>Delete</TextLink>}<Button variant="primary" onClick={save}>{isNew ? 'Add the field' : 'Save my edit'}</Button></div>}
    >
      <div className="cc-field"><TextField label="Name" value={draft.name} placeholder="e.g. Sector" maxLength={60} onChange={(e) => set({ name: e.target.value })} /></div>
      {isNew && <div className="cc-field"><InlineChoice label="Kind" options={KINDS} value={draft.kind} onChange={(v) => set({ kind: v })} form="pills" /></div>}
      {draft.kind === 'choice' && (
        <div className="cc-field">
          <label className="cc-field-label" htmlFor="cc-field-options">Choices, one on each line</label>
          <textarea id="cc-field-options" className="cc-paste" value={draft.optionsText || ''} onChange={(e) => set({ optionsText: e.target.value })} />
        </div>
      )}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

function TagsAndFields() {
  const { userId, coach, tags, fields, state } = useCoachPortal();
  const saved = useSaved();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  const [field, setField] = useState(null);
  const links = rowsOf(state, 'coach_tag_links');
  const uses = (id) => links.filter((l) => l.tag_id === id).length;
  const taken = (n, except) => tags.some((t) => t.id !== except && t.name.toLowerCase() === clean(n).toLowerCase());
  const add = async (e) => {
    e.preventDefault();
    if (!clean(name)) { setProblem('Type the tag’s name to carry on.'); return; }
    if (taken(name)) { setProblem('You already have that tag.'); return; }
    const row = { id: newId(), coach_id: coach.id, name: clean(name).slice(0, 40), position: tags.length };
    await saved(() => saveRow(userId, 'coach_tags', row), { message: 'Tag added', onUndo: () => removeRow(userId, 'coach_tags', row.id) }).catch(() => {});
    setName(''); setAdding(false); setProblem(null);
  };
  const removeTag = async (tag) => {
    const mine = links.filter((l) => l.tag_id === tag.id);
    await saved(async () => {
      for (const l of mine) await removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', l));
      await removeRow(userId, 'coach_tags', tag.id);
      return 'saved';
    }, { message: 'Deleted', onUndo: async () => { await saveRow(userId, 'coach_tags', tag); for (const l of mine) await saveRow(userId, 'coach_tag_links', l); } }).catch(() => {});
  };
  return (
    <>
      <p className="cc-small-label">Tags</p>
      {tags.length === 0 && <p className="cc-quiet">Tags are your own plain words for grouping clients, leads, to-dos and the library. Clients never see them.</p>}
      {tags.map((t) => (
        <SettingRow
          key={t.id}
          label={t.name}
          value={t.name}
          words={`${uses(t.id)} ${uses(t.id) === 1 ? 'use' : 'uses'}`}
          editor={({ value, setValue, label }) => (
            <>
              <TextField label={`Rename ${label}`} value={value ?? ''} maxLength={40} onChange={(e) => setValue(e.target.value)} autoFocus />
              <TextLink onClick={() => removeTag(t)}>Delete this tag</TextLink>
            </>
          )}
          check={(v) => (!clean(v) ? 'Type the tag’s name to carry on.' : taken(v, t.id) ? 'You already have that tag.' : null)}
          onSave={(v) => saved(() => saveRow(userId, 'coach_tags', { ...t, name: clean(v).slice(0, 40) }), { onUndo: () => saveRow(userId, 'coach_tags', t) })}
        />
      ))}
      {adding ? (
        <form noValidate className="cc-setrow cc-setrow--edit" onSubmit={add}>
          <span className="cc-setrow-label">New tag</span>
          <div className="cc-setrow-edit">
            <TextField label="Tag" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setProblem(null); }} autoFocus />
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
            <div className="cc-setrow-saves"><Button variant="primary" type="submit">Save</Button><Button variant="text" onClick={() => { setAdding(false); setProblem(null); }}>Cancel</Button></div>
          </div>
        </form>
      ) : <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add tag</AddButton></div>}

      <p className="cc-small-label">Custom fields</p>
      {fields.length === 0 && <p className="cc-quiet">Add your own fields for clients: text, a number, a date or a choice from a list.</p>}
      {fields.map((f) => (
        <div key={f.id} className="cc-setrow">
          <span className="cc-setrow-label">{f.name}</span>
          <span className="cc-setrow-value">{kindWords(f)}</span>
          <TextLink aria-label={`Edit ${f.name}`} onClick={() => setField({ id: f.id, name: f.name, kind: f.kind, optionsText: (f.options || []).join('\n') })}>Edit</TextLink>
        </div>
      ))}
      <div className="cc-add"><AddButton onClick={() => setField({ id: newId(), name: '', kind: 'text', optionsText: '' })}>Add field</AddButton></div>
      <FieldPanel draft={field} setDraft={setField} />
    </>
  );
}

// ---------------------------------------------------------------- Coaches (owner)
function Coaches() {
  const { coach, coaches, admin, reloadCoaches } = useCoachPortal();
  const location = useLocation();
  const saved = useSaved();
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(location.state?.open === 'coach');
  const [form, setForm] = useState({ firstName: '', fullName: '', email: '' });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const others = coaches.filter((c) => c.coach_id !== coach.id);
  // A rate reads "£100/hr" with no spaces, and a screen reader hears "per hour" (Tim, 19 Nov).
  const money = (c) => (c.hourly_rate == null ? null : (
    <span className="cc-rate">
      {new Intl.NumberFormat('en-GB', { style: 'currency', currency: c.rate_currency || 'GBP', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(c.hourly_rate))}
      <span aria-hidden="true">/hr</span><span className="ds-sr"> per hour</span>
    </span>
  ));
  const facts = (c) => {
    const words = [c.active ? 'Associate' : 'Switched off', c.clients == null ? null : `${c.clients} ${Number(c.clients) === 1 ? 'client' : 'clients'}`].filter(Boolean).join(', ');
    return c.hourly_rate == null ? words : <>{words}, {money(c)}</>;
  };
  const chosen = others.find((c) => c.coach_id === open) || null;
  const theirs = chosen ? admin.filter((a) => a.coach_id === chosen.coach_id && a.status !== 'past') : [];
  const run = (work, message) => saved(async () => { await work(); reloadCoaches(); }, { message }).catch(() => {});
  const add = async () => {
    if (busy) return;
    if (!clean(form.firstName)) { setProblem('Type their first name to carry on.'); return; }
    if (!isEmail(clean(form.email).toLowerCase())) { setProblem('Type their email to carry on.'); return; }
    setBusy(true);
    try {
      const answer = await addCoach({ firstName: clean(form.firstName), fullName: clean(form.fullName) || null, email: clean(form.email).toLowerCase() });
      toast.show(answer.sent ? `The invite is on its way to ${clean(form.email).toLowerCase()}.` : 'Added. Nothing is sent from a preview.');
      setAdding(false); setForm({ firstName: '', fullName: '', email: '' }); setProblem(null);
      reloadCoaches();
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {others.length === 0 && <p className="cc-quiet">You’re the only coach. An associate you add gets their own sign-in and sees only their own clients.</p>}
      {others.map((c) => (
        <div key={c.coach_id} className="cc-setrow">
          <span className="cc-setrow-label">{c.full_name || c.first_name}</span>
          <span className="cc-setrow-value">{facts(c)}</span>
          <TextLink aria-label={`Edit ${c.full_name || c.first_name}`} onClick={() => setOpen(c.coach_id)}>{c.profile_waiting ? `Approve ${c.first_name}’s profile` : 'Edit'}</TextLink>
        </div>
      ))}
      <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add coach</AddButton></div>

      <SlidePanel open={Boolean(chosen)} onClose={() => setOpen(null)} title={chosen ? chosen.full_name || chosen.first_name : ''}>
        {chosen && (
          <>
            {chosen.profile_waiting && (
              <div className="cc-acts">
                <Button variant="primary" onClick={() => run(() => decideProfile(chosen.coach_id, true), 'Profile approved')}>Approve the profile</Button>
                <TextLink onClick={() => run(() => decideProfile(chosen.coach_id, false), 'Asked for an edit')}>Ask for an edit</TextLink>
              </div>
            )}
            <SettingRow
              label="Pay an hour"
              value={chosen.hourly_rate == null ? '' : String(Number(chosen.hourly_rate))}
              words={money(chosen) || 'Not set'}
              editor={textEditor({ inputMode: 'decimal' })}
              check={(v) => (!clean(v) || (Number(v) >= 0 && Number(v) <= 100000) ? null : 'Type an amount, such as 100.')}
              onSave={(v) => run(() => saveCoachFacts(chosen.coach_id, { hourly_rate: clean(v) ? Number(v) : null }))}
            />
            <p className="cc-small-label">{chosen.first_name}’s clients</p>
            {theirs.length === 0 && <p className="cc-quiet">{chosen.first_name} has no clients yet.</p>}
            {theirs.map((a) => (
              <div key={a.profile_id} className="cc-setrow cc-setrow--still">
                <span className="cc-setrow-label">{a.name}</span>
                <span className="cc-setrow-value">{[a.organisation_name, a.sessions_total ? `${Math.max(0, a.sessions_total - a.sessions_held)} of ${a.sessions_total} to go` : null].filter(Boolean).join(', ')}</span>
              </div>
            ))}
            <p className="cc-note">You see their names, engagements and sessions, never their coaching notes.</p>
            <SwitchRow
              label="Switched on"
              note={theirs.length ? `Move ${chosen.first_name}’s clients before switching them off.` : 'Switched off, they can’t open the coach portal.'}
              checked={chosen.active}
              onChange={(on) => run(() => switchCoach(chosen.coach_id, on), on ? 'Switched on' : 'Switched off')}
            />
          </>
        )}
      </SlidePanel>

      <SlidePanel open={adding} onClose={() => setAdding(false)} title="Add coach" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" aria-busy={busy || undefined} onClick={add}>Send the invite</Button></div>}>
        <div className="cc-field"><TextField label="First name" value={form.firstName} maxLength={60} autoComplete="off" onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setProblem(null); }} /></div>
        <div className="cc-field"><TextField label="Full name" value={form.fullName} maxLength={120} autoComplete="off" onChange={(e) => { setForm({ ...form, fullName: e.target.value }); setProblem(null); }} /></div>
        <div className="cc-field"><TextField label="Email" type="email" value={form.email} autoComplete="off" onChange={(e) => { setForm({ ...form, email: e.target.value }); setProblem(null); }} /></div>
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        <p className="cc-note">They get an invite to set their password, then sign in at the coaches’ page. They see only their own clients.</p>
      </SlidePanel>
    </>
  );
}

// ---------------------------------------------------------------- Activity log (owner)
function ActivityLog() {
  const { state, todayKey } = useCoachPortal();
  const rows = rowsOf(state, 'activity_log').sort((a, b) => parseDbTimestamp(b.created_at) - parseDbTimestamp(a.created_at)).slice(0, 200);
  const when = (at) => {
    const d = parseDbTimestamp(at);
    const key = getLocalDateKey(d);
    const p = (n) => String(n).padStart(2, '0');
    return key === todayKey ? `Today, ${p(d.getHours())}:${p(d.getMinutes())}` : dayWords(key, todayKey);
  };
  if (rows.length === 0) return <p className="cc-quiet">Nothing is logged yet. Moving a client, a merge, a deletion and an export each show here.</p>;
  return rows.map((r) => (
    <div key={r.id} className="cc-setrow cc-setrow--still">
      <span className="cc-setrow-label">{when(r.created_at)}</span>
      <span className="cc-setrow-value">{[r.actor_name, r.summary].filter(Boolean).join(' ')}</span>
    </div>
  ));
}

// ---------------------------------------------------------------- Look
function Look() {
  const { choice, setChoice } = useColourMode();
  const help = useHiddenHelp();
  return (
    <>
    <SettingRow
      label="Look"
      value={choice}
      words={LOOKS.find((l) => l.value === choice)?.label}
      editor={({ value, setValue }) => <InlineChoice ariaLabel="Look" options={LOOKS} value={value} onChange={setValue} form="pills" />}
      onSave={async (v) => { setChoice(v); }}
    />
    <Line title="Hidden help" small={help.count === 0 ? 'Nothing is hidden.' : help.count === 1 ? '1 explanation is hidden.' : `${help.count} explanations are hidden.`}>
      {help.count > 0 && <Button variant="text" onClick={help.showAll}>Show it again</Button>}
    </Line>
    </>
  );
}

const PANES = { you: YourDetails, away: AwayAndCover, notifications: Notifications, booking: BookingSettings, hours: WorkingHours, zones: TimeZones, calendars: Calendars, email: Email, tags: TagsAndFields, layouts: NoteLayouts, coaches: Coaches, log: ActivityLog, look: Look };

export default function Settings() {
  const { isOwner } = useCoachPortal();
  const { section } = useParams();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const sections = SETTINGS_SECTIONS.filter((s) => !s.owner || isOwner);
  const known = sections.find((s) => s.key === section);
  // An address for a section this coach doesn't have goes back to the list.
  useEffect(() => { if (section && !known) navigate('/coach/settings', { replace: true }); }, [section, known, navigate]);
  const chosen = known || (isPhone ? null : sections[0]);
  const Pane = chosen ? PANES[chosen.key] : null;

  if (isPhone && !chosen) {
    return (
      <div className="cc-page">
        <div className="cc-col">
          <PageHeader title="Settings" />
          <div className="cc-rows">
            {sections.map((s) => (
              <button key={s.key} type="button" className="cc-row" onClick={() => navigate(`/coach/settings/${s.key}`)}><span><b>{s.label}</b></span><span /></button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (isPhone) {
    return (
      <div className="cc-page">
        <div className="cc-col">
          <Back to="Settings" onClick={() => navigate('/coach/settings')} />
          <PageHeader title={chosen.label} />
          <div className="cc-settings"><section className="cc-setpane" aria-label={chosen.label}><Pane /></section></div>
        </div>
      </div>
    );
  }
  return (
    <div className="cc-page">
      <div className="cc-col cc-col--wide">
        <PageHeader title="Settings" />
        <div className="cc-settings">
          <nav className="cc-setnav" aria-label="Settings sections">
            {sections.map((s) => (
              <button key={s.key} type="button" className="cc-setnav-item" aria-current={s.key === chosen.key ? 'true' : undefined} onClick={() => navigate(`/coach/settings/${s.key}`)}>{s.label}</button>
            ))}
          </nav>
          <section className="cc-setpane ds-section" aria-labelledby="cc-set-h">
            <div className="ds-section-head"><h2 id="cc-set-h" className="ds-section-title">{chosen.label}</h2></div>
            <Pane key={chosen.key} />
          </section>
        </div>
      </div>
    </div>
  );
}
