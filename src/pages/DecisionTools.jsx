import { useNavigate, useLocation } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';
import pageText from '../content/pageText';

const LIVE_CARDS = [
  { id: 'tough-conversation', title: 'I need to give tough feedback', description: 'Create a script for giving feedback', route: '/tough-conversation-step-1' },
  { id: 'stop-doing', title: "I've got too many things to do", description: 'Reclaim hours by stopping or delegating time-sink activities', route: '/stop-doing-audit' },
  { id: 'if-then', title: "I'm feeling anxious about an uncertain situation", description: 'Prepare for uncertain situations with contingency plans', route: '/if-then-planning' },
  { id: 'inversion', title: "I want to make sure something doesn't go wrong", description: 'Look at the risks before you start, then plan to prevent them.', route: '/inversion-step-1' },
  { id: 'personal-operating-plan', title: 'I want to shape my personal operating plan', description: 'Define your mission, strategies, and tactics', route: '/personal-operating-plan' },
];

const COMING_SOON = [
  { title: "I'm navigating a tricky decision", description: 'Use the GROW model to get clear on the way forward' },
  { title: 'I need to provide my team direction', description: "Assess how your current projects align with your team's objective" },
  { title: 'I need to make a new hire', description: 'Plan and prepare for bringing on new team members' },
  { title: 'I need to onboard a new team member', description: 'Guide and support new team members in their first weeks' },
  { title: 'I want to focus my energy wisely', description: 'Allocate your priorities wisely' },
  { title: 'I want to set meaningful goals', description: 'Set meaningful, values-aligned goals' },
  { title: 'I want to get better at what I do', description: 'Create an individual development plan' },
  { title: 'I need to create alignment in my team', description: 'Improve team clarity and shared direction' },
  { title: 'I want to improve my habits', description: 'Build better habits and break unhelpful ones' },
  { title: 'I want to get out of a rut', description: "Refocus on what's working and build momentum" },
  { title: 'I want to feel more connected to my mission', description: 'Reconnect with your intention and "why"' },
  { title: 'I want to cultivate gratitude', description: 'Shift perspective and boost wellbeing' },
  { title: 'I need to look after my wellbeing', description: 'Human performance audit and recovery' },
  { title: 'I need to set team goals and OKRs', description: 'Define and align on team objectives' },
  { title: 'I need to assess team health and performance', description: 'Assess team dynamics and performance' },
];

function LockIcon() {
  return (
    <svg className="dt-soon-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export default function DecisionTools() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="dt-hrow">
          <div>
            <PageHeader title="Decision tools" info={pageText.decisionTools} />
          </div>
          <button type="button" className="ui-btn-ghost" onClick={() => navigate('/decision-history')}>
            My decisions
          </button>
        </div>

        <div className="dt-cards">
          {LIVE_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              className="dt-card"
              onClick={() => navigate(card.route, { state: { ...location.state, problemTitle: card.title } })}
            >
              <span className="dt-card-title">{card.title}</span>
              <span className="dt-card-desc">{card.description}</span>
            </button>
          ))}
        </div>

        <div className="dt-soon">
          <p className="dt-soon-label">Coming soon</p>
          <div className="dt-soon-list">
            {COMING_SOON.map((item) => (
              <div className="dt-soon-item" key={item.title}>
                <LockIcon />
                <span>
                  {item.title}
                  <small>{item.description}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
