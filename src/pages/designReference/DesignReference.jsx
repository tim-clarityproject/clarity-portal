import { useRef, useState } from 'react';
import AutoGrowTextarea from '../../components/ui/AutoGrowTextarea';
import {
  Button,
  Checkbox,
  Chip,
  ChipRow,
  Choice,
  Collapsible,
  Crosshair,
  Dropdown,
  EmptyState,
  FilterButton,
  FloatingOrb,
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
  Stat,
  StatGroup,
  Tile,
  TileGrid,
  ToastProvider,
  useToast,
  WillSyncIndicator,
} from '../../components/design';
import './designReference.css';

// The design gallery: every shared component from src/components/design,
// live, laid out like design-reference-v2.html (approved by Tim, 22 Oct),
// each with a one-line note. Invented example text only. It never signs
// in or reads the database, and exists only on previews and local
// development (see vite.config.js).

const SWATCHES = [
  ['var(--black)', 'Background', '#000000'],
  ['var(--grey-brand)', 'Brand grey', '#3C3C3B, outlines'],
  ['var(--grey-brand-2)', 'Brand grey', '#4A4A49'],
  ['var(--grey-brand-3)', 'Brand grey', '#636362'],
  ['var(--line)', 'Line', '#262626, interface'],
  ['var(--text-2)', 'Secondary text', '#A3A3A0, interface'],
  ['var(--label)', 'Labels', '#7F7F7C, interface'],
  ['var(--mint-soft)', 'Soft mint', '#89F3CD'],
  ['var(--coral)', 'Coral', 'actions, live score'],
  ['var(--coral-soft)', 'Soft coral', 'needs you, urgent'],
  ['var(--mint)', 'Mint', 'saved, done, wins'],
];

const TOC = [
  ['c1', 'Colour'], ['c2', 'Type'], ['c3', 'Page header'], ['c4', 'Section'], ['c5', 'Buttons'],
  ['c6', 'Crosshair'], ['c7', 'Stats'], ['c8', 'Lists'], ['c9', 'Logging rows'],
  ['c10', 'Tiles and hub cards'], ['c11', 'Controls'], ['c17', 'Choices'], ['c18', 'Filter'],
  ['c19', 'Show less'], ['c12', 'Feedback'], ['c16', 'Loading'], ['c13', 'Panels'],
  ['c14', 'Empty state'], ['c15', 'Floating button'],
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

const STRATEGY_OPTIONS = [
  { value: 's1', label: 'Maintain my availability to do good work' },
  { value: 's2', label: 'Lead the team through the restructure' },
  { value: 's3', label: 'Protect deep work every morning' },
];

function GallerySection({ id, title, rules, children, demoClass = '' }) {
  return (
    <section className="dr-c" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="dr-h2" id={`${id}-h`}>{title}</h2>
      <div className={`dr-demo ${demoClass}`.trim()}>{children}</div>
      <div className="dr-rules">{rules}</div>
    </section>
  );
}

function Gallery() {
  const toast = useToast();

  const [steps, setSteps] = useState('6200');
  const [sessions, setSessions] = useState(2);
  const [view, setView] = useState('today');
  const [week, setWeek] = useState('this');
  const [todo, setTodo] = useState('Book a physio assessment before the end of the month');
  const [done, setDone] = useState(true);
  const [editing, setEditing] = useState(true);
  const [when, setWhen] = useState('today');
  const [strategy, setStrategy] = useState('s1');
  const [filterType, setFilterType] = useState('all');
  const [filterWhen, setFilterWhen] = useState('any');
  const [saveState, setSaveState] = useState('saved');
  const [loadingKey, setLoadingKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftWhen, setDraftWhen] = useState('today');
  const [draftImpact, setDraftImpact] = useState('high');
  const saveTimer = useRef(null);
  const draftBox = useRef(null);

  const stepsNumber = Number(steps) || 0;
  const filterParts = [
    filterType !== 'all' && TYPE_OPTIONS.find((o) => o.value === filterType).label.toLowerCase() + 's',
    filterWhen !== 'any' && WHEN_OPTIONS.find((o) => o.value === filterWhen).label.toLowerCase(),
  ].filter(Boolean);
  const applied = filterParts.length ? filterParts.join(' from ') : '';

  const trySaving = () => {
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(() => setSaveState('saved'), 1200);
  };

  const addTodo = () => {
    setPanelOpen(false);
    const saved = draft;
    setDraft('');
    toast.saved({
      onUndo: () => {
        setDraft(saved);
        toast.show('To-do removed.');
      },
    });
  };

  return (
    <div className="dr-wrap">
      <h1 className="dr-title">Clarity Design Reference</h1>
      <p className="dr-lead">
        Version 2, the calm style, following The Clarity Project brand guide 2025. “Clarity over complexity.
        Presence is power.” Every page in the overhaul is built from these parts and nothing else. If a page
        needs something that isn’t here, it’s added here first, then used.
      </p>
      <div className="dr-rule" aria-hidden="true" />
      <nav className="dr-toc" aria-label="Components">
        {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <GallerySection
        id="c1"
        title="Colour"
        demoClass="dr-sw"
        rules={(
          <>
            <p><b>Coral is for actions and the live score only.</b> Labels, tags and other numbers are white or grey.</p>
            <p>Mint only means done or saved. Soft coral only means something needs you (for example an overdue item).</p>
            <p><b>Below-standard weeks are neutral grey</b>, never coral, soft coral or red, so a deficit is never highlighted (Tim, 22 Oct).</p>
            <p>Brand colours are exact. The three “interface” greys are approved extras for readability on black; no other greys.</p>
            <p>No gradients (except the logo mark itself), no shadows.</p>
          </>
        )}
      >
        {SWATCHES.map(([colour, name, note]) => (
          <div key={`${name}${note}`}>
            <i style={{ background: colour }} />
            <b>{name}</b>
            <span>{note}</span>
          </div>
        ))}
      </GallerySection>

      <GallerySection
        id="c2"
        title="Type"
        demoClass="dr-type"
        rules={(
          <>
            <p><b>Nekst capitals only for page titles, section titles and buttons.</b> Small labels are sentence case in DM Sans.</p>
            <p>Nekst is the brand typeface: Regular for titles and buttons, <b>Light for numbers 24px and up</b>. DM Sans for body text and labels (approved pairing for readability).</p>
            <p>Body 17px, so screens read well when shared on a call. Nothing below 12px.</p>
            <p>No overline above titles.</p>
          </>
        )}
      >
        <div><small>Page title</small><span className="dr-type-page">Performance Sprint 4</span></div>
        <div><small>Section title</small><span className="dr-type-section">Log today</span></div>
        <div><small>Body, 17px</small><span>Enter today’s number for each habit.</span></div>
        <div><small>Secondary, 15px</small><span className="dr-type-secondary">Your performance score updates as you go.</span></div>
        <div><small>Small label, 13px</small><span className="dr-type-label">Performance score this week</span></div>
        <div><small>Big number, Nekst Light</small><span className="dr-type-number">78%</span></div>
      </GallerySection>

      <GallerySection
        id="c3"
        title="Page header"
        rules={(
          <>
            <p>Title, then <b>one sentence saying the page’s job</b>, then a quiet meta line (version, dates, the system link), then the coral rule.</p>
            <p>The coral rule appears once per page, here only.</p>
          </>
        )}
      >
        <PageHeader
          as="h3"
          title="Performance Sprint 4"
          job="Where you do the work. Log today’s habits, tick off your to-dos and watch your performance score build."
          meta={['8 weeks · 28 Sep to 22 Nov']}
          onSystemLink={() => setPopupOpen(true)}
        />
      </GallerySection>

      <GallerySection
        id="c4"
        title="Section"
        rules={(
          <>
            <p><b>Action-led title</b> (what you do here), one short line, a divider above.</p>
            <p>The line shows on first visit, then collapses to a small “i”.</p>
            <p>Numbers on sections only when they are a real sequence.</p>
          </>
        )}
      >
        <Section as="h4" title="Log today" line="Wednesday 21 Oct. Enter today’s number for each habit." />
      </GallerySection>

      <GallerySection
        id="c5"
        title="Buttons"
        rules={(
          <>
            <p><b>One coral button per screen</b>, for the thing most people come to do, visible without scrolling.</p>
            <p>Everything else is outlined, or a text link for minor actions. Icon buttons are 44px round targets around the crosshair.</p>
            <p><b>Verb plus object</b>: never Open, Go, Submit or Continue on their own.</p>
          </>
        )}
      >
        <div className="dr-row">
          <Button variant="primary" onClick={() => toast.show('Today is logged.')}>Log today</Button>
          <Button icon="plus" onClick={() => setPanelOpen(true)}>Add a to-do</Button>
          <Button variant="text" onClick={() => toast.show('Sprint details would open here.')}>Sprint details</Button>
        </div>
      </GallerySection>

      <GallerySection
        id="c6"
        title="Crosshair"
        rules={(
          <>
            <p>The crosshair from the logo mark is <b>every plus</b>. Turned 45°, it is <b>every close</b>.</p>
            <p>Never a typed + or ×, never smaller than 14px.</p>
          </>
        )}
      >
        <div className="dr-row">
          <Crosshair size="md" />
          <span className="dr-quiet">Add</span>
          <IconButton label="Close" onClick={() => toast.show('Close would close what’s open.')} />
          <span className="dr-quiet">Close</span>
        </div>
      </GallerySection>

      <GallerySection
        id="c7"
        title="Stats"
        rules={(
          <>
            <p><b>Label first, then the number</b>, then one line saying what it means. Never a number on its own.</p>
            <p>Scores show against the person’s usual range and the standard. Only the live score is coral.</p>
          </>
        )}
      >
        <StatGroup>
          <Stat label="Performance score this week" value="78%" live note="Your usual 72 to 84% · standard 85%" bar={0.78} />
          <Stat label="Sprint ends in" value="32 days" note="Then Recovery" />
        </StatGroup>
      </GallerySection>

      <GallerySection
        id="c8"
        title="Lists"
        rules={<p>Title and date only; the type as a small grey word. <b>No buttons on rows</b>: the whole row opens it.</p>}
      >
        <List label="Recent reviews">
          <ListRow title="Wednesday 21 Oct" type="Day review" date="Today" onClick={() => toast.show('The day review would open here.')} />
          <ListRow title="Board pitch" type="After-action review" date="18 Oct" onClick={() => toast.show('The after-action review would open here.')} />
        </List>
      </GallerySection>

      <GallerySection
        id="c9"
        title="Logging rows"
        rules={(
          <>
            <p>One habit per row: name, one grey line (today against today’s target, and its strategy), the entry, a thin bar.</p>
            <p>Numbers open the number keypad on phone, with the unit shown. Counters use a minus and the crosshair plus.</p>
            <p><b>Impact tags only when editing</b>, never while logging.</p>
          </>
        )}
      >
        <LoggingRow
          name="Steps"
          detail={`${stepsNumber.toLocaleString('en-GB')} of 10,000 today · Maintain my availability`}
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
          progress={sessions / 4}
        />
      </GallerySection>

      <GallerySection
        id="c10"
        title="Tiles and hub cards"
        rules={(
          <>
            <p>A tile shows only what’s needed to choose it; detail opens on tap.</p>
            <p>Hub pages (Plan tools, Review tools…) are tiles with a name and a one-line performance description, most used first.</p>
          </>
        )}
      >
        <TileGrid>
          <Tile
            serves={[1, 2]}
            name="Maintain my availability to do good work"
            score={{ label: 'Performance score this week', value: '82%' }}
            onClick={() => toast.show('This Strategy would open here.')}
          />
          <HubCard
            name="Weekly performance debrief"
            description="Score your week and set up the next one."
            onClick={() => toast.show('The debrief would open here.')}
          />
        </TileGrid>
      </GallerySection>

      <GallerySection
        id="c11"
        title="Controls"
        demoClass="dr-stack dr-stack--fill"
        rules={(
          <>
            <p>Segmented control for views; chips for picking one of several; large text boxes for anything written.</p>
            <p>Tap targets at least 44px.</p>
          </>
        )}
      >
        <SegmentedControl
          label="View"
          options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]}
          value={view}
          onChange={setView}
        />
        <ChipRow label="Week">
          {[['this', 'This week'], ['5', 'Week 5'], ['6', 'Week 6']].map(([value, label]) => (
            <Chip key={value} pressed={week === value} onClick={() => setWeek(value)}>{label}</Chip>
          ))}
        </ChipRow>
        <div>
          <label htmlFor="dr-todo" className="ds-field-label">What needs doing?</label>
          <AutoGrowTextarea id="dr-todo" className="ds-textbox" value={todo} onChange={setTodo} />
        </div>
        <div className="dr-row">
          <Checkbox
            checked={done}
            onChange={setDone}
            after={<ImpactTag editing={editing}>High impact</ImpactTag>}
          >
            Draft the case study
          </Checkbox>
          <Chip pressed={editing} onClick={() => setEditing((v) => !v)}>Editing</Chip>
          <span className="dr-small">(impact shown when editing)</span>
        </div>
      </GallerySection>

      <GallerySection
        id="c17"
        title="Choices: pills or a dropdown"
        demoClass="dr-stack dr-stack--fill"
        rules={(
          <>
            <p><b>Pills only when every option fits on one line on a phone</b> (about four short words). Otherwise a dropdown (Tim, 22 Oct).</p>
            <p>The shared Choice decides by itself, measured at phone width, so the same choice looks the same everywhere.</p>
          </>
        )}
      >
        <Choice
          label="When will you do it?"
          options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'later', label: 'Later' }]}
          value={when}
          onChange={setWhen}
        />
        <Choice label="Which Strategy does it serve?" options={STRATEGY_OPTIONS} value={strategy} onChange={setStrategy} />
      </GallerySection>

      <GallerySection
        id="c18"
        title="Filter"
        rules={(
          <>
            <p>One Filter button opens the dropdowns. Underneath, <b>one plain line says what is applied</b>, with a Clear link.</p>
            <p>The crosshair plus turns 45° while the dropdowns are open.</p>
          </>
        )}
      >
        <FilterButton
          label="Filter reviews"
          applied={applied}
          onClear={() => { setFilterType('all'); setFilterWhen('any'); }}
        >
          <Dropdown label="Type" options={TYPE_OPTIONS} value={filterType} onChange={setFilterType} />
          <Dropdown label="When" options={WHEN_OPTIONS} value={filterWhen} onChange={setFilterWhen} />
        </FilterButton>
      </GallerySection>

      <GallerySection
        id="c19"
        title="Show less, reveal more"
        rules={(
          <>
            <p>Each page shows only what’s needed now. <b>One line with the key fact</b> and the crosshair plus; tap to see the detail.</p>
            <p>The plus turns 45° to close. The detail grows smoothly; the page never jumps.</p>
          </>
        )}
      >
        <Collapsible summary="Sprint details: average 74%, 26 days left">
          <p>Average performance score so far: 74%, across 3 weeks.</p>
          <p>26 days left in Performance Sprint 4, then Recovery.</p>
        </Collapsible>
      </GallerySection>

      <GallerySection
        id="c12"
        title="Feedback"
        demoClass="dr-stack"
        rules={(
          <>
            <p><b>Saving is automatic</b>, shown by a quiet mint “Saved”. No Save buttons; Finish only where something is completed.</p>
            <p>After an action, one short toast for about 3 seconds; “Saved · Undo” for about 5 seconds. Errors are calm, and nothing is lost.</p>
          </>
        )}
      >
        <SavedIndicator />
        <span className="ds-toast ds-toast--shown" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          <span className="ds-toast-text">Added to this week.</span>
        </span>
        <div className="dr-row">
          <Button onClick={() => toast.show('Added to this week.')}>Show a toast</Button>
          <Button onClick={() => toast.saved({ onUndo: () => toast.show('Undone.') })}>Show Saved with Undo</Button>
          <Button onClick={() => toast.error()}>Show the error toast</Button>
        </div>
      </GallerySection>

      <GallerySection
        id="c16"
        title="Loading and saving"
        demoClass="dr-stack dr-stack--fill"
        rules={(
          <>
            <p><b>Loading</b>: the brand crosshair rotating, centred in the space that is loading, with one short line saying what is loading. It appears only after about 0.3 seconds, so fast loads never flash. It replaces every grey “Loading…” text.</p>
            <p><b>Saving</b>: a small grey rotating crosshair and “Saving”, which becomes the mint “Saved” once the server confirms. With no signal it says “Will sync” until the entry can be sent.</p>
            <p>With reduced motion, the crosshair gently fades instead of spinning.</p>
          </>
        )}
      >
        <div className="dr-loadbox">
          <Loading key={loadingKey} label="Loading your plan" />
        </div>
        <div className="dr-row">
          <SavingIndicator />
          <span className="dr-then">then</span>
          <SavedIndicator />
          <span className="dr-small">or</span>
          <WillSyncIndicator />
        </div>
        <div className="dr-row">
          <Button variant="text" onClick={() => setLoadingKey((k) => k + 1)}>Load again</Button>
          <Button variant="text" onClick={trySaving}>Save an entry</Button>
          <Button variant="text" onClick={() => { clearTimeout(saveTimer.current); setSaveState('offline'); }}>Lose the signal</Button>
          <SaveStatus state={saveState} />
        </div>
      </GallerySection>

      <GallerySection
        id="c13"
        title="Panels"
        demoClass="dr-stack dr-stack--fill"
        rules={(
          <>
            <p><b>Slide-across panel</b> for adding or editing (full screen on phone): big text box first, choices below.</p>
            <p><b>Centred pop-up</b> for explanations, like the Individual Performance System (full screen on phone).</p>
            <p>Both close with the crosshair, Escape or a tap outside, and with a swipe down on phone.</p>
          </>
        )}
      >
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
        <div className="dr-mini dr-mini--pop" aria-hidden="true">
          <div className="dr-mini-page">Page underneath</div>
          <div className="dr-mini-scrim" />
          <div className="dr-mini-pop">
            <div className="dr-mini-title">How it fits together<Crosshair variant="close" size="sm" /></div>
            <div className="dr-mini-line" />
            <div className="dr-mini-line dr-mini-line--80" />
            <div className="dr-mini-line dr-mini-line--60" />
          </div>
        </div>
        <div className="dr-row">
          <Button icon="plus" onClick={() => setPanelOpen(true)}>Add a to-do</Button>
          <Button onClick={() => setPopupOpen(true)}>See how it fits together</Button>
        </div>
      </GallerySection>

      <GallerySection
        id="c14"
        title="Empty state"
        rules={<p><b>One clear next step</b> and one button, with a small quiet grey crosshair. No tours.</p>}
      >
        <EmptyState
          as="h3"
          title="Start your first Performance Sprint"
          line="Pick how many weeks, then choose the habits you’ll log each day."
          action={{ label: 'Start a sprint', onClick: () => toast.show('The sprint set-up would start here.') }}
          onSystemLink={() => setPopupOpen(true)}
        />
      </GallerySection>

      <GallerySection
        id="c15"
        title="Floating button"
        rules={(
          <>
            <p>One floating button, bottom right: <b>a miniature of the breathing orb</b>, breathing slowly (4 seconds in, 4 out), coral on the in-breath and mint on the out, with the brand crosshair turning in the centre. Tap it to choose Breathe or Chat to Dr. Tim.</p>
            <p><b>Desktop only.</b> Never on phone, where it gets in the way: there, Breathe is in Personal → Ground and Chat to Dr. Tim is in the Account tab.</p>
            <p>With reduced motion it stays still.</p>
          </>
        )}
      >
        <FloatingOrb
          placement="inline"
          onBreathe={() => toast.show('Breathe would open here.')}
          onChat={() => toast.show('Chat to Dr. Tim would open here.')}
        />
        <p className="dr-phone-only dr-quiet">The floating button is desktop only, so it isn’t shown on a phone.</p>
      </GallerySection>

      <SlidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Add a to-do"
        initialFocusRef={draftBox}
        footer={(
          <Button variant="primary" onClick={addTodo} disabled={!draft.trim()}>Add the to-do</Button>
        )}
      >
        <div className="dr-panel-form">
          <div>
            <label htmlFor="dr-draft" className="ds-field-label">What needs doing?</label>
            <AutoGrowTextarea
              ref={draftBox}
              id="dr-draft"
              className="ds-textbox"
              value={draft}
              onChange={setDraft}
              placeholder="For example, send the board pack to Sam"
            />
          </div>
          <Choice
            label="When will you do it?"
            options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]}
            value={draftWhen}
            onChange={setDraftWhen}
          />
          <Choice
            label="Impact"
            options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]}
            value={draftImpact}
            onChange={setDraftImpact}
          />
          <Choice label="Which Strategy does it serve?" options={STRATEGY_OPTIONS} value={strategy} onChange={setStrategy} />
        </div>
      </SlidePanel>

      <Popup open={popupOpen} onClose={() => setPopupOpen(false)} title="How it fits together">
        <div className="dr-stack">
        <p className="dr-quiet">
          My Mission sits at the top. Under it, a few Outcome Objectives say what you want to be true by the end of the year.
        </p>
        <p className="dr-quiet">
          Strategies are how you’ll get there, and Tactics are the habits and to-dos you log in each Performance Sprint.
        </p>
        <p className="dr-quiet">Your performance score shows how well this week’s work matched the plan.</p>
        </div>
      </Popup>
    </div>
  );
}

export default function DesignReference() {
  return (
    <div className="ui-root dr-page">
      <ToastProvider>
        <Gallery />
      </ToastProvider>
    </div>
  );
}
