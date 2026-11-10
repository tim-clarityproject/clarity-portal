import { useState } from 'react';
import {
  AddButton,
  Button,
  DesktopMenu,
  HubAnchor,
  HubGroup,
  HubGrid,
  HubRecent,
  HubTeams,
  HubTile,
  PhoneBar,
  PinPanel,
  TileMenu,
  useToast,
} from '../../components/design';

// The portal's navigation and the hub pages' parts (Phase 4 step 1, mock-up
// M3). Invented content only; every link stays on the gallery.

const AREAS = [
  { key: 'home', name: 'Home', line: 'Today', to: '#home' },
  { key: 'personal', name: 'Personal', line: 'Dashboard, plan, reset, review', to: '#personal', current: true },
  { key: 'interpersonal', name: 'Interpersonal', line: 'Meetings and conversations', to: '#interpersonal' },
  { key: 'strategic', name: 'Strategic', line: 'Health Check and strategy', to: '#strategic' },
  { key: 'account', name: 'My Account', line: 'Settings, coaching, chat to Tim', to: '#account' },
];

// The desktop menu's rows (option A, the slim panel), Home marked.
const DESKTOP = {
  top: [{ key: 'home', name: 'Home', to: '#home', current: true }],
  groups: [
    { title: 'Personal', items: [{ key: 'dash', name: 'Dashboard', to: '#dashboard' }, { key: 'plan', name: 'Plan', to: '#plan' }, { key: 'reset', name: 'Reset', to: '#reset' }, { key: 'review', name: 'Review', to: '#review' }] },
    { title: 'With others', items: [{ key: 'interpersonal', name: 'Interpersonal', to: '#interpersonal' }, { key: 'strategic', name: 'Strategic', to: '#strategic' }] },
  ],
  foot: [{ key: 'account', name: 'My Account', to: '#account' }],
};
const PINS = [
  { key: 'meet', name: 'Meeting planner', to: '#meet' },
  { key: 'journal', name: 'Journal', to: '#journal' },
  { key: 'grow', name: 'Get unstuck', to: '#grow' },
];

const PIN_GROUPS = [
  { title: 'Plan', tools: [{ key: 'pmd', name: 'Plan my day' }, { key: 'grow', name: 'Get unstuck' }, { key: 'inv', name: 'Pre-mortem' }, { key: 'time', name: 'Time audit' }] },
  { title: 'Reset', tools: [{ key: 'breathe', name: 'Breathe' }, { key: 'wind', name: 'Sleep wind down' }, { key: 'pp', name: 'Pressure plan' }, { key: 'journal', name: 'Journal' }] },
  { title: 'Interpersonal', tools: [{ key: 'meet', name: 'Meeting planner' }, { key: 'fb', name: 'Give difficult feedback' }] },
];

function useSay() {
  const toast = useToast();
  return (what) => toast.show(what);
}

export function DesktopMenuDemo() {
  const say = useSay();
  return (
    <DesktopMenu
      inline
      open
      menu={DESKTOP}
      pins={PINS}
      onGo={(item) => say(`Opens ${item.name}.`)}
      onSignOut={() => say('Signs out.')}
      id="dr-desktop-menu"
    />
  );
}

export function PhoneNavDemo() {
  const say = useSay();
  const [open, setOpen] = useState(true);
  return (
    <div className="dr-phone-nav">
      {open && (
        <TileMenu
          inline
          open
          areas={AREAS.filter((a) => a.key !== 'home')}
          pins={PINS.slice(0, 2)}
          onGo={(item) => say(`Opens ${item.name}.`)}
          onLogToday={() => say('Opens Log today.')}
          onBreathe={() => say('Opens Breathe.')}
          id="dr-tile-menu"
        />
      )}
      <PhoneBar
        className="ds-phone-bar--inline"
        menuOpen={open}
        onMenu={() => setOpen((o) => !o)}
        onGo={(which) => say(which === 'home' ? 'Goes to Home.' : 'Opens the Performance Sprint.')}
        current="home"
        homeHref="#home"
        weekHref="#week"
        menuId="dr-tile-menu"
      />
    </div>
  );
}

export function HubTilesDemo() {
  const say = useSay();
  const go = (name) => (e) => { e.preventDefault(); say(`Opens ${name}.`); };
  return (
    <>
      <HubGrid>
        <HubTile big name="Plan" line="Set your direction and decide well." time="6 tools" href="#plan" onClick={go('Plan')} />
        <HubTile big name="Reset" line="Get back to your best when the pressure is on." time="3 tools" href="#reset" onClick={go('Reset')} />
      </HubGrid>
      <HubGroup title="Decide">
        <HubTile name="Plan my day" line="Choose what matters most today." time="~3 minutes" live="Done today" good href="#pmd" onClick={go('Plan my day')} />
        <HubTile name="Pre-mortem" line="Test a plan by imagining it went wrong." time="~10 minutes" live="Draft saved" href="#inv" onClick={go('Pre-mortem')} />
      </HubGroup>
      <HubAnchor>
        <HubTile name="Strategic Alignment Health Check" line="See whether your team’s work matches its strategy." time="~15 minutes" href="#hc" onClick={go('the Health Check')} />
        <AddButton onClick={() => say('Starts a new Health Check.')}>Start a new Health Check</AddButton>
      </HubAnchor>
    </>
  );
}

export function PinPanelDemo() {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(['grow', 'journal']);
  const toggle = (key, on) => {
    setPinned((p) => (on ? (p.includes(key) || p.length >= 3 ? p : [...p, key]) : p.filter((k) => k !== key)));
    say('Saved');
  };
  return (
    <>
      <Button variant="text" onClick={() => setOpen(true)}>Pin tools to my menu</Button>
      <PinPanel open={open} onClose={() => setOpen(false)} groups={PIN_GROUPS} pinned={pinned} onToggle={toggle} />
    </>
  );
}

export function SavedItemsDemo() {
  const say = useSay();
  const open = (name) => () => say(`Opens ${name}.`);
  return (
    <>
      <HubAnchor>
        <HubTile name="Strategic Alignment Health Check" line="See whether your team’s work matches its strategy." time="~15 minutes" href="#hc" onClick={(e) => { e.preventDefault(); say('Opens the Health Check.'); }} />
        <HubTeams
          teams={[
            { key: 'lead', team: 'Leadership team', line: '3 versions, latest Mon 12 Oct', onClick: open('the Leadership team’s versions in My Plans') },
            { key: 'product', team: 'Product team', line: '1 version, Wed 2 Sep', onClick: open('the Product team’s version in My Plans') },
          ]}
        />
        <AddButton onClick={() => say('Starts a new Health Check.')}>Start a new Health Check</AddButton>
      </HubAnchor>
      <HubRecent
        title="My Plans"
        items={[
          { key: 'a', title: 'Today’s plan', type: 'Plan my day', date: 'Today', onClick: open('today’s plan') },
          { key: 'b', title: 'Referral pipeline', type: 'Get unstuck', date: 'Mon 19 Oct', onClick: open('Referral pipeline') },
          { key: 'c', title: 'Harbour proposal', type: 'Pre-mortem', date: 'Wed 14 Oct', onClick: open('Harbour proposal') },
        ]}
        linkLabel="Open My Plans"
        onOpenAll={() => say('Opens My Plans, filtered to Personal.')}
      />
    </>
  );
}
