import { useNavigate, useLocation } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';

const DECIDE_ITEMS = [
  { id: 'tools', title: 'Decision Tools', description: 'Access all available decision-making frameworks', route: '/decision-tools' },
  { id: 'history', title: 'My Decisions', description: 'Review all your past decisions', route: '/decision-history' },
];

export default function DecideSection() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleDecideSelect = (route) => {
    navigate(route, { state: { ...location.state } });
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text)', marginTop: '0', marginBottom: '0' }}>Decide</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '0' }}>
          {DECIDE_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleDecideSelect(item.route)}
              style={{
                padding: '20px',
                backgroundColor: 'var(--raised)',
                border: '2px solid var(--line)',
                borderRadius: '12px',
                color: 'var(--text)',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'border-color 0.2s',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minHeight: '140px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--coral-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text-2)' }}>{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
