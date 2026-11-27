import { useState } from 'react';
import {
  AddLink, Button, Card, CalendarBar, Checkbox, ControlRow, Counter, Empty, Figure, FrameMenu, InlineChoice, Label,
  MonthGrid, MoreLink, NumberBox, PageOpening, QuickAdd, Row, SectionTabs, ToolFrame,
} from '../../components/design';
import Chevron from '../../components/design/Chevron';
import { dayTitle, monthTitle } from '../../components/design/Blocks';
import './blocks25.css';

// The 25 Nov design reference's "Controls", "Blocks", "Calendar" and "Frame"
// sections, drawn with the portal's own shared parts at the reference's sizes
// (polish 1, the side-by-side). Invented content only, the reference's own.
// data-m marks what tests/design/side-by-side.mjs measures here and in the
// reference.

const TODAY = '2026-11-25';
const HAS = new Set(['2026-11-02', '2026-11-12', '2026-11-18', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);

export default function Blocks25() {
  const [often, setOften] = useState('two');
  const [late, setLate] = useState('yes');
  const [coffees, setCoffees] = useState(2);
  const [steps, setSteps] = useState('8400');
  const [mission, setMission] = useState(true);
  const [saved, setSaved] = useState(true);
  const [sleep, setSleep] = useState('well');
  const [qa, setQa] = useState(false);
  const [todos, setTodos] = useState(['Send the board pack to Priya', 'Draft the Q1 hiring plan']);
  const [day, setDay] = useState(TODAY);
  const [view, setView] = useState('month');
  const [tab, setTab] = useState('profile');
  const [step, setStep] = useState(1);
  return (
    <div className="ui-root b25">
      <main className="b25-ref">
        <PageOpening title="Design reference" line="Everything the portal is built from, after Tim's walk and the Made Studios review." />

        <section className="b25-sec" id="controls">
          <Label>Controls</Label>
          <p className="b25-lead">One shape, one height in a row.</p>
          <div className="b25-field">
            <label htmlFor="b25-name">What should we call you?</label>
            <input id="b25-name" className="ds-field" placeholder="Your first name" data-m="box" />
          </div>
          <div className="b25-field">
            <span className="b25-q">How often do you want to meet?</span>
            <button type="button" className="ds-dd" data-m="dropdown" aria-expanded="false">
              <span className="ds-dd-value">Every 2 weeks</span>
              <Chevron direction="down" beside="words" />
            </button>
          </div>
          <div className="b25-row" data-m="ctlrow-buttons">
            <Button variant="primary" data-m="btn">Start my debrief</Button>
            <Button data-m="ghost">Not now</Button>
            <MoreLink href="#controls">View all sessions</MoreLink>
          </div>
          <ControlRow name="Late finishes" sub="1 this week, no more than 2">
            <InlineChoice ariaLabel="Late finishes" options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} value={late} onChange={setLate} />
          </ControlRow>
          <ControlRow name="Coffees" sub="2 today, no more than 2">
            <Counter value={coffees} onChange={setCoffees} label="Coffees" />
          </ControlRow>
          <ControlRow name="Steps" sub="8,400 of 10,000 today">
            <NumberBox value={steps} onChange={setSteps} unit="steps" label="Steps" />
          </ControlRow>
          <ControlRow name="Show my Mission at the top">
            <button type="button" role="switch" className="ds-switch" aria-checked={mission} aria-label="Show my Mission at the top" onClick={() => setMission((v) => !v)} data-m="switch" />
          </ControlRow>
          <Checkbox checked={saved} onChange={setSaved}>I’ve saved them somewhere safe.</Checkbox>
          <div className="b25-field b25-mt">
            <InlineChoice label="How well did you sleep?" options={[{ value: 'poorly', label: 'Poorly' }, { value: 'ok', label: 'OK' }, { value: 'well', label: 'Well' }, { value: 'very', label: 'Very well' }]} value={sleep} onChange={setSleep} />
          </div>
          <Card label="To-dos" add={<AddLink label="Add a to-do" onClick={() => setQa((v) => !v)} expanded={qa} />} quickAdd={(
            <QuickAdd
              open={qa}
              onClose={() => setQa(false)}
              onAdd={(name) => setTodos((t) => [...t, name])}
              more={<><Button>Today</Button><Button>How long?</Button></>}
            />
          )} data-m="card-add">
            {todos.map((t, i) => <Row key={t} name={t} value={i === 0 ? 'Today' : 'Fri'} />)}
          </Card>
        </section>

        <section className="b25-sec" id="blocks">
          <Label>Blocks</Label>
          <p className="b25-lead">The page opening, card, list row, empty state and figures.</p>
          <div className="b25-demo">
            <PageOpening label="Page opening" title="My sessions" line="Your coaching sessions, past and coming, are all here." action={<Button variant="primary">Book a session</Button>} as="h3" />
          </div>
          <div className="ds-grid2">
            <Card label="What needs you" link={{ children: 'View all', href: '#blocks' }} data-m="card">
              <Row name="Sign your coaching agreement" value="Due Fri 27 Nov" />
              <Row name="Settle invoice CLARITY-0142" value="£750" />
              <Row name="Prep for Thursday's session" value="~3 minutes" />
            </Card>
            <Card label="Upcoming" link={{ children: 'View calendar', href: '#calendar' }}>
              <Row name="Coaching session with Tim" value="Thu 26 Nov, 09:00" />
              <Row name="Monthly review opens" value="Tue 1 Dec" />
            </Card>
          </div>
          <div className="ds-grid2">
            <Card label="Your documents">
              <Empty action={{ children: 'Ask Tim for something', href: '#blocks' }}>Nothing here yet. When Tim shares a document with you, it appears here.</Empty>
            </Card>
            <Card>
              <div className="b25-sm">Average of finished weeks</div>
              <Figure value="72" unit="%" />
              <div className="b25-sm">Up 6 points on last sprint</div>
            </Card>
          </div>
          <Card label="Your coaching">
            <div className="ds-q">Six months of one-to-one coaching</div>
            <Figure value="£750" unit="/month" />
            <div className="b25-gap" />
            <Row name="4 Jan to 2 Jul 2027" value="6 months" />
            <Row name="12 coaching sessions, 60 minutes" value="3 used" />
            <Row name="Ad hoc support by email and WhatsApp" value="Between sessions" />
            <Row name="The Clarity Portal, Executive level" value="Included" />
            <Row name="Strategic Alignment Health Check" value="March" />
            <MoreLink href="#blocks">Read the agreement</MoreLink>
          </Card>
          <SectionTabs tabs={[{ key: 'profile', label: 'Profile' }, { key: 'coaching', label: 'Coaching' }, { key: 'mission', label: 'Mission' }, { key: 'look', label: 'Look' }, { key: 'settings', label: 'Settings' }, { key: 'questions', label: 'Questions' }]} value={tab} onChange={setTab} />
        </section>

        <section className="b25-sec" id="calendar">
          <Label>Calendar</Label>
          <p className="b25-lead">Every calendar: the coach’s, the client’s, the booking page and date pickers.</p>
          <CalendarBar
            title={monthTitle(TODAY)}
            onPrev={() => {}}
            onNext={() => {}}
            onToday={() => setDay(TODAY)}
            view={view}
            onView={setView}
          />
          <MonthGrid month={TODAY} today={TODAY} selected={day} onSelect={setDay} hasItems={(k) => HAS.has(k)} />
          <div className="ds-open-label b25-mt">{dayTitle(day)}</div>
          <Row name="Sam Carter" sub="Coaching session" value="09:00" />
          <Row name="Alex Morgan" sub="Coaching session" value="11:30" />
        </section>

        <section className="b25-sec" id="frame">
          <Label>Frame and menu</Label>
          <div className="b25-framedemo">
            <div className="b25-fr">
              <aside className="b25-side">
                <FrameMenu
                  groups={[[{ key: 'home', name: 'Home', to: '#frame', current: true }], [{ key: 'dash', name: 'Dashboard', to: '#frame' }, { key: 'plan', name: 'Plan', to: '#frame' }, { key: 'reset', name: 'Reset', to: '#frame' }, { key: 'review', name: 'Review', to: '#frame' }], [{ key: 'inter', name: 'Interpersonal', to: '#frame' }, { key: 'strat', name: 'Strategic', to: '#frame' }]]}
                  foot={[{ key: 'acct', name: 'My Account', to: '#frame' }]}
                  onSignOut={() => {}}
                  onGo={() => {}}
                />
              </aside>
              <div className="b25-frmain">
                <PageOpening title="Good morning, Sam" line="Wed 25 Nov. Here’s your day." as="h3" />
              </div>
            </div>
          </div>
        </section>

        <section className="b25-sec" id="tool">
          <Label>Tool frame</Label>
          <ToolFrame
            step={step}
            steps={3}
            name="Plan my day"
            question={step === 1 ? 'How did you sleep last night?' : step === 2 ? 'What are your top three today?' : 'Which habits are you keeping today?'}
            onClose={() => setStep(1)}
            onNext={() => setStep((s) => Math.min(3, s + 1))}
            onBack={step > 1 ? () => setStep((s) => s - 1) : undefined}
            onSkip={() => setStep((s) => Math.min(3, s + 1))}
          >
            <div className="b25-field">
              <span className="b25-q">How many hours?</span>
              <Counter value={8} step={0.5} label="Hours" onChange={() => {}} />
            </div>
          </ToolFrame>
        </section>
      </main>
    </div>
  );
}
