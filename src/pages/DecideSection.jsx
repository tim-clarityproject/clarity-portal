import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';
import { designTokens } from '../lib/designTokens';

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
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: designTokens.colors.text.primary, marginTop: '0', marginBottom: '0' }}>Decide</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '0' }}>
          {DECIDE_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleDecideSelect(item.route)}
              style={{
                padding: '20px',
                backgroundColor: 'white',
                border: '2px solid #e5e5e5',
                borderRadius: '12px',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.2s',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minHeight: '140px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#F08571';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e5e5';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{item.title}</div>
                <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
