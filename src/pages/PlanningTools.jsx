import { useNavigate } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';
import pageText from '../content/pageText';

const PLAN_ROWS = [
  { title: 'Plan my day', description: 'Set your intentions and priorities.', route: '/plan-my-day' },
  { title: 'Meeting planner', description: "Bad meetings kill team morale. Let's get it right.", route: '/plan-meeting' },
  { title: 'Personal operating plan', description: 'Define your mission, strategies and tactics.', route: '/personal-operating-plan' },
];

// Same routes as the Decision tools hub (prompt 7). Inversion is not in
// the mock-up's Decide group (it predates the tool) - added here since
// it is a live tool today; see build summary point 4.
const DECIDE_ROWS = [
  { title: "I'm feeling anxious about an uncertain situation", description: 'Prepare for uncertain situations with contingency plans.', route: '/if-then-planning' },
  { title: "I've got too many things to do", description: 'Reclaim hours by stopping or delegating time-sink activities.', route: '/stop-doing-audit' },
  { title: 'I need to give tough feedback', description: 'Create a script for giving feedback.', route: '/tough-conversation-step-1' },
  { title: "I want to make sure something doesn't go wrong", description: 'Look at the risks before you start, then plan to prevent them.', route: '/inversion-step-1' },
];

const COMING_SOON_ROWS = [
  { title: "I'm navigating a tricky decision", description: 'Use the GROW model to get clear on the way forward.' },
  { title: 'I need to provide my team direction', description: "Assess how your current projects align with your team's objective." },
  { title: 'I need to make a new hire', description: 'Plan and prepare for bringing on new team members.' },
  { title: 'I need to onboard a new team member', description: 'Guide and support new team members in their first weeks.' },
  { title: 'I want to focus my energy wisely', description: 'Decide where your time and attention matter most.' },
  { title: 'I want to set meaningful goals', description: 'Turn your mission into goals you can act on.' },
];

function LockIcon() {
  return (
    <svg className="ptl-lock-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export default function PlanningTools() {
  const navigate = useNavigate();

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-header">
          <PageHeader title="All planning tools" info={pageText.planningTools} />
        </div>

        <p className="ptl-group">Plan</p>
        <div className="ptl-list">
          {PLAN_ROWS.map((row) => (
            <button key={row.title} type="button" className="ptl-row" onClick={() => navigate(row.route)}>
              <span>
                <span className="ptl-row-title">{row.title}</span>
                <span className="ptl-row-desc">{row.description}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="ptl-group">Decide</p>
        <div className="ptl-list">
          {DECIDE_ROWS.map((row) => (
            <button key={row.title} type="button" className="ptl-row" onClick={() => navigate(row.route)}>
              <span>
                <span className="ptl-row-title">{row.title}</span>
                <span className="ptl-row-desc">{row.description}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="ptl-group">Coming soon</p>
        <div className="ptl-list">
          {COMING_SOON_ROWS.map((row) => (
            <div key={row.title} className="ptl-row ptl-row--locked" aria-disabled="true">
              <span>
                <span className="ptl-row-title">{row.title}</span>
                <span className="ptl-row-desc">{row.description}</span>
              </span>
              <span className="ptl-lock-tag">
                <LockIcon />
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
