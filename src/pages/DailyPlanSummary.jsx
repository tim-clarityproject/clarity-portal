import { useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function DailyPlanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;
  const [plan, setPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (decisionId && user) {
      loadPlan();
    }
  }, [decisionId, user]);

  const loadPlan = async () => {
    try {
      console.log('[DailyPlanSummary] loadPlan: fetching decisionId =', decisionId, 'user =', user.id);
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[DailyPlanSummary] Query error:', error);
        throw error;
      }

      if (data) {
        console.log('[DailyPlanSummary] Plan loaded successfully:', data.id);
        setPlan(data);
      } else {
        console.warn('[DailyPlanSummary] No data returned for decisionId', decisionId);
      }
    } catch (error) {
      console.error('[DailyPlanSummary] Error loading plan:', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDailyPlanDate = (isoString) => {
    const date = new Date(isoString);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    return `${weekday} ${ordinal(day)} ${month}, ${year}`;
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '56px', textAlign: 'center' }} className="page-container">
          <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '56px', textAlign: 'center' }} className="page-container">
          <p style={{ color: '#999', fontSize: '14px' }}>Plan not found</p>
          <button
            onClick={() => navigate('/plan-my-day', { state: { isGuest } })}
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

  const formData = plan.form_data || {};

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '56px', paddingBottom: '120px' }} className="page-container">
        {/* Back Button */}
        <button
          onClick={() => navigate('/my-plans', { state: { isGuest } })}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            padding: 0,
            marginBottom: '24px',
          }}
        >
          ← Back to Daily Plans
        </button>

        {/* Title and Tag */}
        <div style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            {formatDailyPlanDate(plan.created_at)}
          </h1>
          <span style={{
            backgroundColor: '#F08571',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
          }}>
            Daily Intentions
          </span>
        </div>

        <div style={{ marginBottom: '48px', display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              Top Priority
            </h2>
            <p style={{ fontSize: '14px', color: '#666', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {formData.topPriority || '—'}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              What's within your control today?
            </h2>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {formData.showUp}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '12px' }}>
              What don't you want to do?
            </h2>
            <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {formData.notDo}
            </p>
          </div>
        </div>

      </div>

      {/* Fixed bottom bar for making new decisions */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fafafa',
        borderTop: '1px solid #e5e5e5',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate('/decision-tools', { state: { isGuest } })}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            borderRadius: '6px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#F08571';
            e.currentTarget.style.backgroundColor = '#f9f9f9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e5e5';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          + Make another decision
        </button>
      </div>
    </div>
  );
}
