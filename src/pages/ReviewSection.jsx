import { useNavigate, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import HomeHeader from '../components/HomeHeader';
import { designTokens } from '../lib/designTokens';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const REVIEW_ITEMS = [
  { id: 'after-action', title: 'After-Action Review', description: 'Reflect on what you learned from recent events', route: '/my-journal', state: { reviewType: 'after-action' } },
  { id: 'weekly-momentum', title: 'Weekly Momentum Review', description: 'Assess your progress and reset for the week ahead', route: '/my-journal', state: { reviewType: 'weekly-momentum' } },
  { id: 'pop-review', title: 'Personal Operating Plan Review', description: 'Review your mission, strategies, and tactics', needsFetch: true, route: '/personal-operating-plan-review' },
  { id: 'my-reviews', title: 'My Reviews', description: 'View all your completed reviews', route: '/my-reviews' },
];

export default function ReviewSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  const handleReviewSelect = async (item) => {
    if (item.needsFetch) {
      // For Personal Operating Plan Review, fetch the latest mission ID
      try {
        const { data: missionData } = await supabase
          .from('missions')
          .select('id')
          .eq('user_id', user?.id)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (missionData) {
          navigate(item.route, { state: { missionId: missionData.id } });
        }
      } catch (err) {
        console.error('Error fetching mission:', err);
      }
    } else {
      // For other reviews, navigate with optional state
      const state = item.state ? { ...location.state, ...item.state } : { ...location.state };
      navigate(item.route, { state });
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: designTokens.colors.text.primary, marginTop: '0', marginBottom: '0' }}>Review</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '0' }}>
          {REVIEW_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleReviewSelect(item)}
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
