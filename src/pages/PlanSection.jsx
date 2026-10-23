import { useNavigate } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import PageHeading from '../components/PageHeading';

const CARDS = [
  { title: 'Plan my day', description: 'Set your intentions and priorities.', route: '/plan-my-day' },
  { title: 'Personal operating plan', description: 'Define your mission, strategies and tactics.', route: '/personal-operating-plan' },
  { title: 'All planning tools', description: 'Meetings, decisions, contingencies and more.', route: '/planning-tools' },
];

function ClockIcon() {
  return (
    <svg className="hub-history-card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function PlanSection() {
  const navigate = useNavigate();

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-header">
          <PageHeading pageKey="planSection" title="Plan" overline="" rule={false} />
        </div>

        <div className="dt-cards dt-cards--three">
          {CARDS.map((card) => (
            <button key={card.title} type="button" className="dt-card dt-card--row" onClick={() => navigate(card.route)}>
              <span className="dt-card-text">
                <span className="dt-card-title">{card.title}</span>
                <span className="dt-card-desc">{card.description}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="dt-soon-label" style={{ marginTop: 'var(--space-6)' }}>Your history</p>
        <button type="button" className="hub-history-card" onClick={() => navigate('/my-plans')}>
          <span>
            <span className="hub-history-card-title">My Plans</span>
            <span className="hub-history-card-desc">Your daily plans, meeting plans and decisions.</span>
          </span>
          <ClockIcon />
        </button>
      </div>
    </div>
  );
}
