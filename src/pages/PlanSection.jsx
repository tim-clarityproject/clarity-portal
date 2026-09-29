import { useNavigate, useLocation } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';
import { designTokens } from '../lib/designTokens';

const PLAN_ITEMS = [
  { id: 'pop', title: 'Personal Operating Plan', description: 'Define your mission, strategies, and tactics', route: '/personal-operating-plan' },
  { id: 'daily', title: 'Daily Intentions', description: 'Plan your day with clear priorities', route: '/plan-my-day' },
  { id: 'meeting', title: 'Meeting Planner', description: 'Organize and prepare effective meetings', route: '/plan-meeting' },
  { id: 'my-plans', title: 'My Plans', description: 'View and manage all your plans', route: '/my-plans' },
];

export default function PlanSection() {
  const navigate = useNavigate();
  const location = useLocation();

  const handlePlanSelect = (route) => {
    navigate(route, { state: { ...location.state } });
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: designTokens.colors.text.primary, marginTop: '0', marginBottom: '0' }}>Plan</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '0' }}>
          {PLAN_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handlePlanSelect(item.route)}
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
