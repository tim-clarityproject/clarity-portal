import { useLocation, useNavigate } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function DailyPlanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;
  const plan = location.state?.plan;

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (!plan) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', textAlign: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Plan not found</p>
          <button
            onClick={() => navigate('/plan-my-day')}
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Create a Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            Daily Plan Summary
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            {formatDate(plan.createdAt)}
          </p>
        </div>

        <div style={{ marginBottom: '48px', display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              What would make today a success?
            </h2>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {plan.success}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              How do you want to show up?
            </h2>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {plan.showUp}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              What don't you want to do?
            </h2>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {plan.notDo}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/plan-my-day')}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (e.target.style.backgroundColor = '#F08571')}
          >
            Create Another Plan
          </button>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            View All Plans
          </button>
        </div>
      </div>
    </div>
  );
}
