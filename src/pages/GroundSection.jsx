import { useNavigate } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';
import pageText from '../content/pageText';

const CARDS = [
  { title: 'Breathe', description: 'Calm your nervous system and ground yourself.', route: '/breathe' },
  { title: 'Daily Journal', description: 'Write down what is on your mind.', route: '/daily-journal' },
  { title: 'Scenario Planning', description: 'Get clear on what you will do in different scenarios.', route: '/if-then-planning' },
];

function ClockIcon() {
  return (
    <svg className="hub-history-card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function GroundSection() {
  const navigate = useNavigate();

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-header">
          <PageHeader title="Ground" info={pageText.groundSection} />
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
        <button type="button" className="hub-history-card" onClick={() => navigate('/breathing-sessions-summary')}>
          <span>
            <span className="hub-history-card-title">Breathing Sessions</span>
            <span className="hub-history-card-desc">Every breathing session you have finished.</span>
          </span>
          <ClockIcon />
        </button>
        <button type="button" className="hub-history-card" onClick={() => navigate('/daily-journals')}>
          <span>
            <span className="hub-history-card-title">My Journals</span>
            <span className="hub-history-card-desc">Your daily journals, saved and in progress.</span>
          </span>
          <ClockIcon />
        </button>
      </div>
    </div>
  );
}
