import { useCallback, useRef, useState } from 'react';
import {
  BoldCrosshair,
  BrandMark,
  CalendarPopover,
  ChatButton,
  Button,
  Checkbox,
  Chip,
  ChipRow,
  Choice,
  Collapsible,
  CoachContext,
  ColourModeChoice,
  Crosshair,
  DisclosureArrow,
  DatePicker,
  Dropdown,
  EmptyState,
  ErrorMessage,
  FilterButton,
  FloatingOrb,
  GoogleButton,
  HubCard,
  IconButton,
  ImpactTag,
  List,
  ListRow,
  Loading,
  LoggingRow,
  PageHeader,
  Popup,
  SavedIndicator,
  SaveStatus,
  SavingIndicator,
  Section,
  SegmentedControl,
  SlidePanel,
  StatusAction,
  MultiChoice,
  TextBox,
  TextField,
  SmallWin,
  Stat,
  StatGroup,
  Tile,
  TileGrid,
  ToastProvider,
  useToast,
  useAutosave,
  WillSyncIndicator,
} from '../../components/design';
import { GallerySection, New } from './galleryKit';
import { contrast, startingValue, usePretendServer, ViewContext, useGalleryView } from './galleryUtils';
import SprintTool from './SprintTool';
import { useSprintDemo } from './useSprintDemo';
import './designReference.css';

// The design gallery: every shared component from src/components/design,
// live, in dark and light side by side, laid out like
// design-reference-v3.html (approved by Tim, 23 Oct), with its rules
// beside it. Invented example text only. It never signs in or reads the
// database, and exists only on previews and local development (see
// vite.config.js).

const TOC = [
  ['c1', 'Colour'], ['c2', 'Type'], ['c3', 'Page header'], ['c4', 'Sections and questions'],
  ['c5', 'Buttons'], ['c6', 'Crosshairs'], ['c7', 'Stats'], ['c9', 'Lists'], ['c10', 'Logging rows'],
  ['c11', 'Tiles'], ['c12', 'Controls'], ['c20', 'Drop-downs'], ['c23', 'Pills on phones'], ['c24', 'Who can see this'], ['c25', 'Steady text box'], ['c26', 'Focus mode'], ['c28', 'Calendar'], ['c27', 'Guided tools'], ['c21', 'Filter'], ['c22', 'Show less'],
  ['c13', 'Messages'], ['c14', 'Loading'], ['c15', 'Panels'], ['c16', 'Empty space'],
  ['c17', 'Breathe button'], ['c29', 'Bold crosshair'], ['c30', 'Status changes'], ['c18', 'Sign in'], ['c19', 'Choosing a mode'],
];

// The colour table (design-reference-v3.html): name, what it's for, dark,
// light, and the light colour's contrast on the light background.
const LIGHT_BG = '#F9F8F5';
const COLOURS = [
  ['Background', 'Page', '#000000', '#F9F8F5', 'none'],
  ['Surface', 'Tiles, Mission pill', '#111110', '#EFEDE8', 'none'],
  ['Boxes', 'Text and number boxes', '#0B0B0B', '#FFFFFF', 'none'],
  ['Lines', 'Dividers, tracks', '#262626', '#DCDAD3', 'none'],
  ['Faint lines', 'Rows in lists', '#1A1A1A', '#E9E7E1', 'none'],
  ['Box edges', 'Fields, checkboxes, steppers', '#636362', '#858480', 'measure'],
  ['Outlined buttons', 'Outlined button edge', '#3C3C3B', '#B9B7B1', 'none'],
  ['Text', 'Main text, this week', '#FFFFFF', '#000000', 'measure'],
  ['Secondary text', 'Lines under things', '#A3A3A0', '#4A4A49', 'measure'],
  ['Labels', 'Small labels, examples', '#7F7F7C', '#636362', 'measure'],
  ['Coral, buttons', 'The one main button, ticks', '#FF6F5C', '#FF6F5C', 'black text 7.7 to 1'],
  ['Coral, text and lines', 'Live score, bars, selected', '#FF6F5C', '#C2412E', 'measure'],
  ['Soft coral', 'Needs you', '#FFBD9E', '#A84E28', 'measure'],
  ['Mint', 'Saved, done', '#5FEFBB', '#0B7A52', 'measure'],
  ['Below standard', 'Weeks under the standard', '#636362', '#8F8D88', 'measure'],
  ['Weeks to come', 'Dial, empty segments', '#262626', '#DCDAD3', 'none'],
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'day', label: 'Day review' },
  { value: 'aar', label: 'After-action review' },
  { value: 'debrief', label: 'Weekly performance debrief' },
];

const WHEN_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO or executive' },
  { value: 'coach', label: 'Head coach' },
  { value: 'leader', label: 'Leader' },
  { value: 'other', label: 'Other' },
];

const STRATEGY_OPTIONS = [
  { value: 's1', label: 'Maintain my availability to do good work' },
  { value: 's2', label: 'Lead the team through the restructure' },
  { value: 's3', label: 'Protect deep work every morning' },
];

function Swatch({ hex }) {
  return (
    <span className="dr-sw2">
      <i style={{ background: hex }} />
      {hex}
    </span>
  );
}

function ColourTable() {
  return (
    <table className="dr-ct">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Dark</th>
          <th scope="col">Light</th>
          <th scope="col" className="dr-hide-s">Light contrast</th>
        </tr>
      </thead>
      <tbody>
        {COLOURS.map(([name, use, dark, light, check]) => (
          <tr key={name}>
            <td>{name}<br /><span className="dr-ct-note">{use}</span></td>
            <td><Swatch hex={dark} /></td>
            <td><Swatch hex={light} /></td>
            <td className="dr-hide-s dr-ct-note">
              {check === 'measure' && `${contrast(light, LIGHT_BG).toFixed(1)} to 1`}
              {check === 'none' && 'not text'}
              {check !== 'measure' && check !== 'none' && check}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TypeDemo() {
  return (
    <div className="dr-type">
      <div><small>Page title, Nekst capitals</small><span className="dr-type-page">Performance Sprint 4</span></div>
      <div><small>Screen question, sentence case</small><span className="dr-type-question">What 2 to 4 results would show your mission is moving?</span></div>
      <div><small>Body, 17px</small><span>Enter today’s number for each habit.</span></div>
      <div><small>Secondary, 15px</small><span className="dr-type-secondary">Your performance score updates as you go.</span></div>
      <div><small>Big number, Nekst Light</small><span className="dr-type-number">78%</span></div>
    </div>
  );
}

function PageHeaderDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader as="h3" title="Performance Sprint 4" meta={['8 weeks · 28 Sep to 22 Nov']} onSystemLink={() => setOpen(true)} />
      <SystemPopup open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SystemPopup({ open, onClose }) {
  const [part, setPart] = useState('plan');
  return (
    <Popup open={open} onClose={onClose} title="How it fits together">
      <div className="dr-stack dr-stack--fill">
        <Choice
          label="Which part would you like to read about?"
          options={[{ value: 'plan', label: 'The plan' }, { value: 'sprint', label: 'The sprint' }]}
          value={part}
          onChange={setPart}
        />
        {part === 'plan' ? (
          <div>
            <p className="dr-quiet">My Mission sits at the top.</p>
            <p className="dr-quiet">Under it, a few Outcome Objectives say what you want to be true.</p>
            <p className="dr-quiet">Strategies are how you’ll get there.</p>
          </div>
        ) : (
          <div>
            <p className="dr-quiet">Each Performance Sprint holds the habits and to-dos you log.</p>
            <p className="dr-quiet">Your Performance score shows how much of the week’s plan you did.</p>
          </div>
        )}
      </div>
    </Popup>
  );
}

function SectionDemo() {
  return (
    <div className="dr-stack dr-stack--fill">
      <Section as="h4" title="Outcome Objectives" />
      <div>
        <p className="dr-question">What 2 to 4 results would show your mission is moving?</p>
        <p className="dr-nudge">Pick ones you can track.</p>
      </div>
    </div>
  );
}

function ButtonsDemo() {
  const toast = useToast();
  return (
    <div className="dr-stack">
      <div className="dr-row">
        <Button variant="primary" onClick={() => toast.show('Saved')}>Save my mission</Button>
        <Button icon="plus" onClick={() => toast.show('This adds a to-do.')}>Add a to-do</Button>
        <Button variant="text" onClick={() => toast.show('Sprint details open here.')}>See the sprint details</Button>
      </div>
      <span className="dr-small">The coral button on hover, then disabled, for comparison:</span>
      <div className="dr-row" aria-hidden="true">
        <span className="ds-btn ds-btn--primary dr-hover-sample">Save my mission</span>
        <span className="ds-btn ds-btn--primary" aria-disabled="true">Save my mission</span>
      </div>
    </div>
  );
}

function CrosshairDemo() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <div className="dr-stack">
      <span className="dr-small">Standard crosshair: add and close only</span>
      <div className="dr-row">
        <Crosshair size="md" />
        <Crosshair size="md" tone="white" />
        <IconButton label="Close" onClick={() => toast.show('Close closes what’s open.')} />
      </div>
      <span className="dr-small">DisclosureArrow: anything that opens (tap to turn it)</span>
      <div className="dr-row">
        <button type="button" className="dr-arrow-demo" aria-expanded={open} aria-label="Turn the arrow" onClick={() => setOpen((v) => !v)}>
          <DisclosureArrow open={open} />
        </button>
      </div>
    </div>
  );
}

function StatsDemo() {
  return (
    <StatGroup>
      <Stat
        label="Performance score this week"
        value="78%"
        live
        note={<><span className="ds-line">Your usual 72 to 84%.</span><span className="ds-line">Standard 85%.</span></>}
        bar={0.78}
      />
      <Stat label="Training sessions" value="3 of 4" note="This week" />
    </StatGroup>
  );
}

function ListDemo() {
  const toast = useToast();
  return (
    <List label="Recent reviews">
      <ListRow title="Board pitch" type="After-action review" date="Today" onClick={() => toast.show('The review opens here.')} />
      <ListRow title="Wednesday reflections" type="Review my day" date="Mon 19 Oct" onClick={() => toast.show('The review opens here.')} />
    </List>
  );
}

function LoggingDemo() {
  const [steps, setSteps] = useState('6200');
  const [sessions, setSessions] = useState(2);
  const stepsNumber = Number(steps) || 0;
  return (
    <div>
      <LoggingRow
        name="Steps"
        detail={`${stepsNumber.toLocaleString('en-GB')} of 10,000 today`}
        value={steps}
        onChange={setSteps}
        unit="steps"
        entryLabel="Steps today"
        progress={stepsNumber / 10000}
      />
      <LoggingRow
        name="Training sessions"
        detail={`${sessions} of 4 this week`}
        kind="stepper"
        value={sessions}
        onChange={setSessions}
        min={0}
        max={14}
        entryLabel="Training sessions this week"
      />
    </div>
  );
}

function TilesDemo() {
  const toast = useToast();
  return (
    <TileGrid>
      <Tile
        serves={[1, 2]}
        name="Maintain my availability to do good work"
        score={{ label: 'Performance score this week', value: '82%' }}
        onClick={() => toast.show('This Strategy opens here.')}
      />
      <Tile
        name="Grow through referrals"
        flag="No habits yet"
        score={{ label: 'Serves 1 objective', value: '' }}
        onClick={() => toast.show('This Strategy opens here.')}
      />
      <HubCard name="Weekly performance debrief" description="Score your week and set up the next one." onClick={() => toast.show('The debrief opens here.')} />
    </TileGrid>
  );
}

function ControlsDemo() {
  const [view, setView] = useState('today');
  const [week, setWeek] = useState('today');
  const [todo, setTodo] = useState('');
  const [ticked, setTicked] = useState(['case']);
  const tick = (key) => (on) => setTicked((t) => (on ? [...t, key] : t.filter((k) => k !== key)));
  return (
    <div className="dr-stack dr-stack--fill">
      <SegmentedControl
        label="View"
        options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]}
        value={view}
        onChange={setView}
      />
      <ChipRow label="When">
        {[['today', 'Today'], ['week', 'This week'], ['later', 'Later']].map(([value, label]) => (
          <Chip key={value} pressed={week === value} onClick={() => setWeek(value)}>{label}</Chip>
        ))}
      </ChipRow>
      <TextBox label="What needs doing?" who="me" value={todo} onChange={setTodo} placeholder="e.g. Prepare the board pack for Thursday" lines="one" />
      <ul className="dr-ticks" aria-label="To-dos this week">
        <li><Checkbox checked={ticked.includes('case')} onChange={tick('case')} after={<ImpactTag editing>High impact</ImpactTag>}>Draft the case study</Checkbox></li>
        <li><Checkbox checked={ticked.includes('board')} onChange={tick('board')}>Send the board pack</Checkbox></li>
        <li><Checkbox checked={ticked.includes('phone')} onChange={tick('phone')}>Phone off by 21:00</Checkbox></li>
      </ul>
    </div>
  );
}

const MEASURE_OPTIONS = [
  { value: 'cnt', label: 'Count', hint: 'e.g. training sessions' },
  { value: 'amt', label: 'Amount with a unit', hint: 'e.g. steps or litres of water' },
  { value: 'yn', label: 'Yes or no', hint: 'e.g. phone off by 21:00' },
  { value: 'lim', label: 'Keep under a limit', hint: 'e.g. no more than 2 late finishes' },
  { value: 'rate', label: 'Rating 1 to 5', hint: 'e.g. focus, rated each day' },
];

function ChoicesDemo() {
  const [strategy, setStrategy] = useState('s2');
  const [measure, setMeasure] = useState('cnt');
  return (
    <div className="dr-stack dr-stack--fill">
      <Choice label="Which Strategy?" options={STRATEGY_OPTIONS} value={strategy} onChange={setStrategy} />
      <Choice label="How will you measure it?" options={MEASURE_OPTIONS} value={measure} onChange={setMeasure} />
    </div>
  );
}

function PillsDemo() {
  const [when, setWhen] = useState('today');
  const [recovery, setRecovery] = useState(2);
  const [role, setRole] = useState('ceo');
  return (
    <div className="dr-stack dr-stack--fill">
      <Choice
        label="When will you do it?"
        options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'later', label: 'Later' }]}
        value={when}
        onChange={setWhen}
      />
      <Choice
        label="How long a Recovery?"
        options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} week${n > 1 ? 's' : ''}` }))}
        value={recovery}
        onChange={setRecovery}
      />
      <Choice
        label="Which best describes you?"
        form="rows"
        options={[
          { value: 'ceo', label: 'CEO or executive' },
          { value: 'coach', label: 'Head coach' },
          { value: 'leader', label: 'Leader' },
          { value: 'other', label: 'Other' },
        ]}
        value={role}
        onChange={setRole}
      />
    </div>
  );
}

function WhoSeesDemo() {
  const [shared, setShared] = useState(true);
  const [mission, setMission] = useState('Lead with clarity so the business grows and the best people want to stay.');
  const [well, setWell] = useState('');
  const [team, setTeam] = useState('Win back the two key accounts');
  return (
    <div className="dr-stack dr-stack--fill">
      <TextBox label="What’s your mission?" who={shared ? 'coach' : 'me'} value={mission} onChange={setMission} maxLength={120} />
      <ChipRow label="Sharing">
        <Chip pressed={shared} onClick={() => setShared((v) => !v)}>Share my mission with my coach</Chip>
      </ChipRow>
      <TextBox label="What went well today?" who="me" value={well} onChange={setWell} placeholder="e.g. I held the line in the board meeting" />
      <TextBox label="What’s the team’s one priority this quarter?" who="team" value={team} onChange={setTeam} lines="one" />
    </div>
  );
}

function SteadyBoxDemo({ mode }) {
  const key = `gallery-journal-${mode || 'page'}`;
  const [entry, setEntry] = useState(() => startingValue(key, ''));
  const [noSignal, setNoSignal] = useState(false);
  const [save, setOffline] = usePretendServer(key);
  const state = useAutosave(entry, save, { draftKey: key });
  return (
    <div className="dr-stack dr-stack--fill">
      <TextBox
        label="What’s on your mind?"
        who="me"
        value={entry}
        onChange={setEntry}
        placeholder="Write anything, and it saves as you go."
        saveState={state}
      />
      <ChipRow label="Example">
        <Chip pressed={noSignal} onClick={() => { setNoSignal(!noSignal); setOffline(!noSignal); }}>Lose the signal</Chip>
      </ChipRow>
    </div>
  );
}

function FocusModeDemo({ mode }) {
  const key = `gallery-focus-${mode || 'page'}`;
  const [answer, setAnswer] = useState(() => startingValue(key, ''));
  const [save] = usePretendServer(key);
  const state = useAutosave(answer, save, { draftKey: key });
  return (
    <div className="dr-stack dr-stack--fill">
      <TextBox
        label="What would make the next sprint even better?"
        who="me"
        value={answer}
        onChange={setAnswer}
        placeholder="e.g. Finish by 18:30 on 4 nights a week"
        saveState={state}
        focusMode
      />
      <div className="dr-laptop-only">
        <p className="dr-small">On a laptop the box stays in the page and grows.</p>
        <p className="dr-small">To see focus mode, open this page on a phone and tap the box.</p>
      </div>
    </div>
  );
}

function GuidedDemo({ mode }) {
  const toast = useToast();
  const [role, setRole] = useState('ceo');
  const [full, setFull] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const calendarFrom = useRef(null);
  const openCalendar = useCallback((e) => {
    calendarFrom.current = e.currentTarget;
    setCalendar(true);
  }, []);
  const demo = useSprintDemo(mode || 'page', role, openCalendar);
  const closed = (why) => { if (why !== 'finished') toast.show('Saved for later.'); };
  return (
    <div className="dr-stack dr-stack--fill">
      <Choice label="Which best describes you?" options={ROLE_OPTIONS} value={role} onChange={setRole} />
      <div className="dr-row">
        <Button onClick={() => setFull(true)}>See it full screen</Button>
      </div>
      <div className="dr-tool-frame">
        <SprintTool demo={demo} layout="framed" role={role} onClose={closed} />
      </div>
      <SprintTool demo={demo} layout="fullscreen" open={full} role={role} onClose={(why) => { setFull(false); closed(why); }} />
      <CalendarPopover
        open={calendar}
        onClose={() => setCalendar(false)}
        anchorRef={calendarFrom}
        title="When does it start?"
        value={demo.answers.start}
        onChange={(start) => demo.set({ start, extraStart: start })}
      />
    </div>
  );
}

function CalendarDemo() {
  const [by, setBy] = useState(null);
  return (
    <div className="dr-stack dr-stack--fill">
      <DatePicker label="By when?" value={by} onChange={setBy} />
    </div>
  );
}

function FilterDemo() {
  const [type, setType] = useState('all');
  const [when, setWhen] = useState('any');
  const parts = [
    type !== 'all' && `${TYPE_OPTIONS.find((o) => o.value === type).label.toLowerCase()}s`,
    when !== 'any' && WHEN_OPTIONS.find((o) => o.value === when).label.toLowerCase(),
  ].filter(Boolean);
  return (
    <FilterButton label="Filter" applied={parts.join(' from ')} onClear={() => { setType('all'); setWhen('any'); }}>
      <Dropdown label="Which type?" options={TYPE_OPTIONS} value={type} onChange={setType} />
      <Dropdown label="From when?" options={WHEN_OPTIONS} value={when} onChange={setWhen} />
    </FilterButton>
  );
}

function CollapsibleDemo() {
  return (
    <Collapsible summary="Sprint details: average 74%, 26 days left">
      <p>Average performance score so far: 74%, across 3 weeks.</p>
      <p>26 days left in Performance Sprint 4, then Recovery.</p>
    </Collapsible>
  );
}

function MessagesDemo() {
  const toast = useToast();
  return (
    <div className="dr-stack">
      <SavedIndicator />
      <SmallWin>Done, 3 of 4 this week.</SmallWin>
      <span className="ds-toast ds-toast--shown dr-static-toast" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        <span className="ds-toast-text">Deleted</span>
        <span className="ds-toast-undo">Undo</span>
      </span>
      <ErrorMessage>
        <span className="ds-line">That didn’t save.</span>
        <span className="ds-line">Check your connection and try again.</span>
      </ErrorMessage>
      <div className="dr-row">
        <Button onClick={() => toast.show('Added to this week.')}>Show a toast</Button>
        <Button onClick={() => toast.saved({ message: 'Deleted', onUndo: () => toast.show('Back again.') })}>Show Deleted with Undo</Button>
      </div>
    </div>
  );
}

function LoadingDemo() {
  const [key, setKey] = useState(0);
  const [state, setState] = useState('saved');
  const timer = useRef(null);
  const save = () => {
    clearTimeout(timer.current);
    setState('saving');
    timer.current = setTimeout(() => setState('saved'), 1200);
  };
  return (
    <div className="dr-stack dr-stack--fill">
      <div className="dr-loadbox"><Loading key={key} label="Loading your plan" /></div>
      <div className="dr-row">
        <SavingIndicator />
        <span className="dr-small">then</span>
        <SavedIndicator />
        <span className="dr-small">or</span>
        <WillSyncIndicator />
      </div>
      <div className="dr-row">
        <Button variant="text" onClick={() => setKey((k) => k + 1)}>Load again</Button>
        <Button variant="text" onClick={save}>Save my entry</Button>
        <SaveStatus state={state} />
      </div>
    </div>
  );
}

// Add panels keep one order (Tim, 23 Oct): what it is, which Strategy,
// how much it helped or will help, then when, last.
const IMPACT_OPTIONS = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];
const WEEK_OPTIONS = [{ value: 'this', label: 'This week' }, { value: 'next', label: 'Next week' }];
const DAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => ({ value: d, label: d }));

function PanelsDemo() {
  const toast = useToast();
  const [panel, setPanel] = useState(false);
  const [winPanel, setWinPanel] = useState(false);
  const [popup, setPopup] = useState(false);
  const [todo, setTodo] = useState({ text: '', strategy: 's1', impact: 'medium', week: 'this' });
  const [win, setWin] = useState({ text: '', strategies: [], impact: 'medium', day: 'Friday' });
  const box = useRef(null);
  const winBox = useRef(null);
  return (
    <div className="dr-stack dr-stack--fill">
      <div className="dr-mini" aria-hidden="true">
        <div className="dr-mini-page">Page underneath</div>
        <div className="dr-mini-scrim" />
        <div className="dr-mini-sheet">
          <div className="dr-mini-title">Add a to-do<Crosshair variant="close" size="sm" /></div>
          <div className="dr-mini-line dr-mini-line--box" />
          <div className="dr-mini-line" />
          <div className="dr-mini-line dr-mini-line--70" />
        </div>
      </div>
      <div className="dr-row">
        <Button icon="plus" onClick={() => setPanel(true)}>Add a to-do</Button>
        <Button icon="plus" onClick={() => setWinPanel(true)}>Add an unplanned win</Button>
        <Button onClick={() => setPopup(true)}>See how it fits together</Button>
      </div>
      <SlidePanel
        open={panel}
        onClose={() => setPanel(false)}
        title="Add a to-do"
        initialFocusRef={box}
        footer={<Button variant="primary" disabled={!todo.text.trim()} onClick={() => { setPanel(false); setTodo((t) => ({ ...t, text: '' })); toast.saved({ message: 'Added to this week.', onUndo: () => toast.show('Removed.') }); }}>Add my to-do</Button>}
      >
        <div className="dr-panel-form">
          <TextBox ref={box} label="What needs doing?" who="me" value={todo.text} onChange={(text) => setTodo((t) => ({ ...t, text }))} placeholder="e.g. Send the board pack to the chair" />
          <Choice label="Which Strategy does it serve?" options={STRATEGY_OPTIONS} value={todo.strategy} onChange={(strategy) => setTodo((t) => ({ ...t, strategy }))} />
          <Choice label="How much will it help?" options={IMPACT_OPTIONS} value={todo.impact} onChange={(impact) => setTodo((t) => ({ ...t, impact }))} />
          <Choice label="Which week?" options={WEEK_OPTIONS} value={todo.week} onChange={(week) => setTodo((t) => ({ ...t, week }))} />
        </div>
      </SlidePanel>
      <SlidePanel
        open={winPanel}
        onClose={() => setWinPanel(false)}
        title="Add an unplanned win"
        initialFocusRef={winBox}
        footer={<Button variant="primary" disabled={!win.text.trim() || win.strategies.length === 0} onClick={() => { setWinPanel(false); setWin((w) => ({ ...w, text: '', strategies: [] })); toast.show('Added to your Performance Evidence.'); }}>Add my win</Button>}
      >
        <div className="dr-panel-form">
          <TextBox ref={winBox} label="What did you do?" who="me" value={win.text} onChange={(text) => setWin((w) => ({ ...w, text }))} placeholder="e.g. Closed the renewal with the biggest client" />
          <MultiChoice
            label="Which Strategies did it help?"
            hint="Pick all that apply."
            options={STRATEGY_OPTIONS}
            values={win.strategies}
            onChange={(strategies) => setWin((w) => ({ ...w, strategies }))}
          />
          <Choice label="How much did it help?" options={IMPACT_OPTIONS} value={win.impact} onChange={(impact) => setWin((w) => ({ ...w, impact }))} />
          <Choice label="Which day?" options={DAY_OPTIONS} value={win.day} onChange={(day) => setWin((w) => ({ ...w, day }))} />
        </div>
      </SlidePanel>
      <SystemPopup open={popup} onClose={() => setPopup(false)} />
    </div>
  );
}

function MilestoneDemo() {
  const [done, setDone] = useState(false);
  return (
    <div className="dr-milestone">
      <p className="dr-milestone-title">Publish my coaching book</p>
      <p className="dr-milestone-meta">Objective 4 · milestone · by 30 Jun 2027</p>
      <StatusAction done={done} onChange={setDone} />
    </div>
  );
}

function EmptyDemo() {
  const toast = useToast();
  return (
    <EmptyState
      as="h3"
      question="What’s one thing that would move this week forward?"
      action={{ label: 'Add a to-do', onClick: () => toast.show('This adds a to-do.') }}
    />
  );
}

function OrbDemo() {
  const toast = useToast();
  return (
    <div className="dr-stack">
      <FloatingOrb placement="inline" onBreathe={() => toast.show('Breathe opens here.')} />
      <p className="dr-phone-only dr-quiet">The Breathe button is desktop only, so it isn’t shown on a phone.</p>
      <span className="dr-small">In the desktop header, top right:</span>
      <ChatButton onClick={() => toast.show('A message to your coach opens here.')} />
    </div>
  );
}

function BoldCrossDemo() {
  return (
    <div className="dr-stack dr-stack--fill">
      <span className="dr-small">Desktop menu button</span>
      <div className="dr-hdr" aria-hidden="true">
        <BoldCrosshair size={26} />
        <span className="dr-hdr-pill">My Mission</span>
        <span className="dr-hdr-space" />
      </div>
      <span className="dr-small">Phone bar, centre button</span>
      <div className="dr-pbar" aria-hidden="true">
        <i />
        <i />
        <BoldCrosshair size={36} />
        <i />
        <i />
      </div>
      <span className="dr-small">Home Screen icon and favicon: white on black in both modes</span>
      <div className="dr-row" aria-hidden="true">
        <span className="dr-icon"><BoldCrosshair tone="icon" className="dr-icon-cross" /></span>
        <span className="dr-icon dr-icon--small"><BoldCrosshair tone="icon" className="dr-icon-cross" /></span>
      </div>
    </div>
  );
}

function SignInDemo() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  return (
    <div className="dr-signin">
      <BrandMark size={48} />
      <div className="dr-signin-brand">The Clarity Portal</div>
      <div className="dr-signin-core">Clarity drives performance.</div>
      <GoogleButton onClick={() => toast.show('Google sign-in starts here.')} />
      <div className="dr-or">or</div>
      <div className="dr-signin-fields">
        <TextField label="Email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" defaultValue="password" />
      </div>
      <Button variant="primary" className="dr-signin-btn" onClick={() => toast.show('Signing in happens here.')}>Sign in</Button>
      <Button variant="text" onClick={() => toast.show('The password reset opens here.')}>Forgotten your password?</Button>
      <span className="dr-signin-alt">New here?</span>
      <Button variant="text" onClick={() => toast.show('Create my account opens here.')}>Create my account</Button>
    </div>
  );
}

function ModeDemo() {
  return <ColourModeChoice />;
}

function Gallery() {
  const [view, setView] = useGalleryView();
  return (
    <ViewContext.Provider value={view}>
      <div className="dr-wrap">
        <h1 className="dr-title">Clarity Design Reference</h1>
        <p className="dr-lead">Version 3: dark and light.</p>
        <p className="dr-lead">Every part of the portal is shown in both modes side by side, with its rules beside it.</p>
        <p className="dr-lead">Items marked “new” were added or changed in Phase 0b.</p>
        <div className="dr-rule" aria-hidden="true" />
        <div className="dr-switches">
          <ColourModeChoice label="How should the portal look?" />
          <SegmentedControl
            label="Show"
            options={[{ value: 'both', label: 'Side by side' }, { value: 'one', label: 'This mode only' }]}
            value={view}
            onChange={setView}
          />
        </div>
        <nav className="dr-toc" aria-label="Sections">
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <GallerySection
          id="c1"
          title="Colour"
          rules={(
            <>
              <p><New /><b>Every colour has a dark and a light value.</b></p>
              <p>Pages only ever use the names, never a colour code, so both modes always match.</p>
              <p><b>Light mode is built on the brand off-white</b> (#F9F8F5) with brand black text.</p>
              <p><b>Coral and mint are too pale to read as text on off-white</b>, so light mode uses deeper versions for text, lines and numbers.</p>
              <p>Coral buttons keep their black text in both modes.</p>
              <p>Every text colour passes WCAG AA (4.5 to 1); box edges pass 3 to 1.</p>
              <p>The last column shows each light colour against the background.</p>
              <p><b>Below-standard weeks are neutral grey</b> in both modes, never coral, soft coral or red.</p>
              <p>No gradients, no shadows, in either mode.</p>
            </>
          )}
        >
          <div className="dr-pane dr-pane--table"><ColourTable /></div>
        </GallerySection>

        <GallerySection id="c2" title="Type" demo={TypeDemo} rules={(
          <>
            <p><b>Nekst capitals only for short names:</b> page titles, section names and buttons.</p>
            <p><b>Screen questions are sentence case in DM Sans</b>, so long questions read easily.</p>
            <p>Nekst Light for numbers 24px and up.</p>
            <p>Body 17px.</p>
            <p>Nothing below 12px.</p>
            <p>No bold text anywhere.</p>
          </>
        )} />

        <GallerySection id="c3" title="Page header" demo={PageHeaderDemo} rules={(
          <>
            <p><New /><b>No intro line under the title.</b></p>
            <p>The title is enough; any explanation sits behind the small “i”.</p>
            <p>A quiet meta line, then the coral rule, once per page.</p>
          </>
        )} />

        <GallerySection id="c4" title="Sections and questions" demo={SectionDemo} rules={(
          <>
            <p><b>Section headings are names</b>, easy to scan.</p>
            <p><b>Screen headings ask a question</b> of about 12 words or fewer, with a short nudge underneath that starts with a verb.</p>
          </>
        )} />

        <GallerySection id="c5" title="Buttons" demo={ButtonsDemo} rules={(
          <>
            <p><b>One coral button per screen</b>, the same coral with black text in both modes.</p>
            <p>Outlined buttons for everything else; a text link for minor actions.</p>
            <p><New /><b>Hover never looks disabled</b> (23 Oct): a slightly brighter coral in dark and a slightly deeper coral in light, with black text in both.</p>
            <p>A disabled coral button is the coral at 35% opacity.</p>
            <p><b>“My” where it’s theirs</b> (Save my mission, Add my win, Add my to-do), otherwise verb and thing (Add a to-do, See it full screen).</p>
            <p>Never Submit, OK or Go.</p>
          </>
        )} />

        <GallerySection id="c6" title="Crosshairs" demo={CrosshairDemo} rules={(
          <>
            <p><New /><b>Standard crosshair for add and close only</b> (Tim, 23 Oct): a plus to add, turned 45° to close, from the logo’s own crop. Nowhere else.</p>
            <p><New /><b>DisclosureArrow for anything that opens</b>: drop-downs, folded sections and expandable rows. It is one half of the same crosshair, its corner pointing down, and it turns to point up while open.</p>
            <p>Coral or white on dark; deep coral or black on light.</p>
            <p>Never a typed + or ×, never smaller than 14px.</p>
            <p>The bold crosshair has its own section below.</p>
          </>
        )} />

        <GallerySection id="c7" title="Stats" demo={StatsDemo} rules={(
          <>
            <p><b>Label first, then the number</b>, then one line saying what it means.</p>
            <p>The live score is coral in dark and deep coral in light.</p>
            <p>Counts read “3 of 4”.</p>
          </>
        )} />

        <GallerySection id="c9" title="Lists" demo={ListDemo} rules={(
          <>
            <p>Title and date only, the type as a small grey word.</p>
            <p>The whole row opens it.</p>
            <p>Dates: Today, Yesterday, then “Mon 19 Oct”.</p>
          </>
        )} />

        <GallerySection id="c10" title="Logging rows" demo={LoggingDemo} rules={(
          <>
            <p>One habit per row: name, one grey line, the entry, a thin bar.</p>
            <p><New />Box edges use the edges colour in both modes so the box is always visible (3 to 1).</p>
          </>
        )} />

        <GallerySection id="c11" title="Tiles" demo={TilesDemo} rules={(
          <>
            <p><New />Tiles sit on the slightly raised surface colour, in both modes.</p>
            <p>Soft coral means something needs them, always with words (“No habits yet”), never colour alone.</p>
          </>
        )} />

        <GallerySection id="c12" title="Controls" demo={ControlsDemo} rules={(
          <>
            <p>Segmented control for views; chips for on and off; large text boxes for anything written.</p>
            <p><New /><b>One tick box size everywhere</b> (Tim, 23 Oct): an 18px box with a 1.5px edge in the box-edge colour, 5px corners and a 12px tick, in a 44px tap area.</p>
            <p>Tick boxes are only for lists: to-dos, yes-or-no habits and the terms box at sign-up.</p>
            <p>A ticked box has a deep coral edge in light mode, so it passes 3 to 1.</p>
          </>
        )} />

        <GallerySection id="c20" title="Drop-downs" demo={ChoicesDemo} rules={(
          <>
            <p><New /><b>Branded drop-downs</b> (Tim, 22 Oct): the list opens just below the box in the portal’s style, or above it only when there isn’t room.</p>
            <p>It never covers the box.</p>
            <p>On a phone a panel slides up with the question as its title.</p>
            <p><New /><b>Room to breathe</b>: 20px of space at each side, 15px top and bottom, at least 58px high, 14px corners.</p>
            <p>Long choices wrap onto a second line rather than squeezing.</p>
            <p>Options are 16px and at least 52px high.</p>
            <p>The chosen option has a coral tick as well as a shade.</p>
            <p><New />The arrow points down, and turns to point up while the list is open.</p>
            <p>Arrow keys, Enter, Escape and typing to jump all work, and screen readers hear each option.</p>
          </>
        )} />

        <GallerySection id="c23" title="Pills on phones" demo={PillsDemo} rules={(
          <>
            <p><New /><b>On a phone, a row of pills always sits on one line with equal-width buttons and never wraps</b> (Tim, 23 Oct).</p>
            <p>If the choices can’t fit that way, they become full-width answer rows: “How long a Recovery?” is rows on a phone and pills on a laptop.</p>
            <p>Decided by measuring the real space, again on every resize and at larger text sizes.</p>
            <p>Long or many choices use the drop-down.</p>
            <p>One-tap answer lists, like “Which best describes you?”, are always rows.</p>
          </>
        )} />

        <GallerySection id="c24" title="Who can see this" demo={WhoSeesDemo} rules={(
          <>
            <p><New /><b>Every box that holds something personal shows a small lock and who can see it</b>: “Only you”, “You and [coach’s first name]” or “Your team” (Tim, 23 Oct; experience rule 44).</p>
            <p>It sits at the right of the question above the box, 13px, in the label colour.</p>
            <p>Screen readers hear “Who can see this: Only you”.</p>
            <p>It changes the moment something is shared, and back if sharing is undone.</p>
            <p>Turn the sharing chip on and off to see it.</p>
            <p>The coach’s first name comes from the client’s own coach, never typed into the code.</p>
            <p>Here it is example data.</p>
          </>
        )} />

        <GallerySection id="c25" title="The steady text box" demo={SteadyBoxDemo} rules={(
          <>
            <p><New /><b>Typing never jumps</b> (Tim, 21 Oct).</p>
            <p>The box grows smoothly as you type; the line being typed stays just above the keyboard, and the page never scrolls back and forth.</p>
            <p>Box colour, an edge that turns coral when you’re typing, 17px text, 20px of space each side, at least 88px tall when empty.</p>
            <p><b>It saves by itself</b>: Saving, then Saved.</p>
            <p>With no signal it says Will sync, keeps a copy on the device and tries again until it goes.</p>
            <p>Nothing is lost if the app closes.</p>
          </>
        )} />

        <GallerySection id="c26" title="Focus mode" demo={FocusModeDemo} rules={(
          <>
            <p><New /><b>Writing on a phone opens a full-screen writing page</b>: the question at the top, the lock label, just the words, a quiet Saved, and Done.</p>
            <p>Nothing else on the page moves.</p>
            <p>It fits the space above the keyboard, so the line being typed stays in sight.</p>
            <p>Done, or a swipe down, closes it and puts you back in the same place, with what you wrote in the box.</p>
            <p>Nothing needs saving by hand.</p>
            <p>For long writing only: journal, reflections and debrief answers.</p>
            <p>On a laptop the box stays in the page and grows smoothly.</p>
          </>
        )} />

        <GallerySection id="c28" title="Calendar" demo={CalendarDemo} rules={(
          <>
            <p><New /><b>Dates are picked from the portal’s own calendar</b>, never typed: the question as its title, the month with previous and next, today marked, past days greyed out, the chosen day filled.</p>
            <p>On a laptop it opens beside the field like the drop-down; on a phone it slides up from the bottom.</p>
            <p><New />The box has the same arrow as a drop-down, pointing up while the calendar is open.</p>
            <p>Weeks start on Monday.</p>
            <p>Arrow keys move a day or a week, Page Up and Page Down change the month, Enter picks.</p>
            <p>Dates show as “Mon 26 Oct”.</p>
          </>
        )} />

        <GallerySection id="c27" title="Guided tools" wide demo={GuidedDemo} rules={(
          <>
            <p><New /><b>One shared component for every tool people work through in order</b>, one question per screen, as M6’s set-up flows.</p>
            <p>This demo uses M6’s Start a sprint wording.</p>
            <p>Desktop opens focused, full screen: the header and menu step back.</p>
            <p>The top bar has the tool’s name, Saving and Saved, and the rotated crosshair to close, which returns you to where you came from.</p>
            <p>The step list shows where you are (tap any step to jump); on phone it becomes the slim line under the top bar.</p>
            <p>Question tools use the % complete bar instead.</p>
            <p>Never a “Step 1 of 3” line.</p>
            <p>Each step: a small label with an optional “i”, the question in sentence case, a short nudge, an optional “See an example” for your role, a one-off tip, then the step itself.</p>
            <p>Back on the left (the arrow alone on phone), a quiet Skip, and the coral button.</p>
            <p>Steps slide across; with reduced motion they fade.</p>
            <p>Everything saves as you go, and the summary at the end lets you change any answer.</p>
            <p><New /><b>Statements people rate</b> (writing rule 51): the heading is the task, then the statement in a soft panel, then the who-sees label and the answers.</p>
            <p><New /><b>Smaller, in quotation marks</b> (Tim, 23 Oct): 18px on desktop and 17px on phone, with curly quotation marks the panel adds itself.</p>
            <p>See the Bouncing back step.</p>
          </>
        )} />

        <GallerySection id="c21" title="Filter" demo={FilterDemo} rules={(
          <>
            <p>One Filter button opens the drop-downs; its arrow turns to point up while they are open.</p>
            <p>Underneath, one plain line says what is applied, with Clear.</p>
          </>
        )} />

        <GallerySection id="c22" title="Show less, reveal more" demo={CollapsibleDemo} rules={(
          <>
            <p>One line with the key fact and the arrow; tap to see the detail.</p>
            <p><New />The arrow turns to point up while it is open.</p>
          </>
        )} />

        <GallerySection id="c13" title="Messages" demo={MessagesDemo} rules={(
          <>
            <p><b>Saved</b> is just “Saved”, in mint (deep green in light).</p>
            <p><New /><b>Small wins</b>: the tick fills coral and a few words show.</p>
            <p><New /><b>Toasts</b> are black with white text in both modes.</p>
            <p>Deleting shows “Deleted” with Undo; no “Are you sure?”.</p>
            <p><New /><b>Errors</b> say what happened, then what to do, on a soft coral tint.</p>
          </>
        )} />

        <GallerySection id="c14" title="Loading" demo={LoadingDemo} rules={(
          <>
            <p>The rotating crosshair, after about 0.3 seconds, with one short line.</p>
            <p>With reduced motion it fades instead.</p>
          </>
        )} />

        <GallerySection id="c15" title="Panels" demo={PanelsDemo} rules={(
          <>
            <p><New />The page underneath dims: strongly in dark, lightly in light, so it never looks muddy.</p>
            <p>Full screen on phone; swipe down or Escape closes.</p>
            <p><New /><b>Panels never jump</b> (Tim, 23 Oct).</p>
            <p>A panel animates only when it opens.</p>
            <p>Changing anything inside it updates only that part, and it keeps its place and focus.</p>
            <p><New /><b>Add panels keep one order</b>: what it is, which Strategy, how much it helped or will help, then when.</p>
            <p>An unplanned win can help several Strategies, and counts as done in each one picked.</p>
          </>
        )} />

        <GallerySection id="c16" title="Empty space" demo={EmptyDemo} rules={(
          <>
            <p><New /><b>A question, then the button.</b></p>
            <p>No tours, no long explanations.</p>
          </>
        )} />

        <GallerySection id="c17" title="Breathe button" demo={OrbDemo} rules={(
          <>
            <p><New /><b>Breathe only, with its name</b> (Tim, 23 Oct).</p>
            <p>A slim pill, bottom right, desktop only: the small breathing orb and the word “Breathe”.</p>
            <p>One click opens Breathe.</p>
            <p><b>Chat to [coach’s first name] sits in the desktop header</b>, top right, as a quiet labelled button, e.g. “Chat to Tim”.</p>
            <p>Always the client’s own coach, never “Dr.”.</p>
            <p>Phone has no floating button.</p>
            <p>Coral on the in-breath, mint on the out-breath; deeper coral and green in light.</p>
          </>
        )} />

        <GallerySection id="c29" title="The bold crosshair" demo={BoldCrossDemo} rules={(
          <>
            <p><New /><b>Two crosshairs, never mixed up</b> (Tim, 22 Oct).</p>
            <p>The bold one is its own component, so a build can never swap one for the other.</p>
            <p>Drawn as clean lines at 2 times the standard line, with the gap between the two halves the same size as the standard crosshair’s.</p>
            <p>Only four places: the Home Screen icon, the favicon, the desktop menu button and the phone bar’s centre button.</p>
            <p>The menus get it in Phase 0c.</p>
            <p>White in dark mode and black in light mode.</p>
            <p>The app icons stay white on black, filling about 69% of the square.</p>
          </>
        )} />

        <GallerySection id="c30" title="Status changes" demo={MilestoneDemo} rules={(
          <>
            <p><New /><b>A quiet link for a single status change</b> (Tim, 23 Oct), such as a milestone.</p>
            <p>The status sits on its own line, “Not yet” or “Done” in mint.</p>
            <p>Under it, a quiet underlined link says what it does.</p>
            <p>Never a tick box beside a title, and nothing beside a title bigger than the title.</p>
            <p>The link is 13px with a 44px tap area that doesn’t push the layout.</p>
          </>
        )} />

        <GallerySection id="c18" title="Sign in" demo={SignInDemo} rules={(
          <>
            <p><New /><b>Google’s button follows Google’s rules</b>: their four-colour “G”, the words “Continue with Google”, their light version on light and their dark version on dark, never recoloured.</p>
            <p>The logo uses Emblem NEGATIVE (white crosshair) on dark and Emblem POSITIVE (black crosshair) on light.</p>
            <p>The one coral button is Sign in.</p>
            <p>The sign-in boxes are labelled “Email” and “Password”, an approved exception to “labels are questions” (Tim, 23 Oct).</p>
          </>
        )} />

        <GallerySection id="c19" title="Choosing a mode" demo={ModeDemo} rules={(
          <>
            <p><New /><b>In My Account: Light, Dark or Match my device.</b></p>
            <p>Match my device is the starting choice; it follows the phone or laptop, including switching at night.</p>
            <p>The phone’s top bar matches: black in dark, off-white in light.</p>
            <p>Emails and PDFs stay light.</p>
          </>
        )} />
      </div>
    </ViewContext.Provider>
  );
}

// Example data: in the portal this is the client's own coach's first name.
const EXAMPLE_COACH = 'Tim';

export default function DesignReference() {
  return (
    <div className="ui-root dr-page">
      <CoachContext.Provider value={EXAMPLE_COACH}>
        <ToastProvider>
          <Gallery />
        </ToastProvider>
      </CoachContext.Provider>
    </div>
  );
}
