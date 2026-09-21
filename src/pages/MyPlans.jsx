import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Edit } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';

export default function MyPlans() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('daily-plans'); // 'daily-plans' or 'meetings'
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (user && !isGuest) {
      loadPlans();
    }
  }, [user, isGuest]);

  const loadPlans = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('user_id', user.id)
        .in('tool_type', ['daily_plan', 'plan_meeting'])
        .order('created_at', { ascending: false });

      if (data) {
        setPlans(data);
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDailyPlanDateAndTime = (dateStr) => {
    const date = new Date(dateStr);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    return `${weekday} ${ordinal(day)} ${month}, ${year} - ${time}`;
  };

  const handleEdit = (plan, e) => {
    e.stopPropagation();
    const editPageMap = {
      daily_plan: '/plan-my-day',
      plan_meeting: '/plan-meeting',
    };
    const editPage = editPageMap[plan.tool_type] || '/plan-my-day';
    const navState = { isGuest, decisionId: plan.id, ...plan.form_data };
    console.log('[MyPlans] handleEdit -> navigating to', editPage, 'with state:', navState);
    navigate(editPage, { state: navState });
  };

  const handleDelete = async (planId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this plan?')) return;

    try {
      await supabase
        .from('decisions')
        .delete()
        .eq('id', planId);
      setPlans(plans.filter(p => p.id !== planId));
      clearProgress();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Failed to delete plan');
    }
  };

  const truncateContent = (content, length = 100) => {
    if (!content) return '';
    return content.length > length ? content.substring(0, length) + '...' : content;
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '16px' }}>My Plans</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setFilter('daily-plans')}
              style={{
                padding: '8px 16px',
                backgroundColor: filter === 'daily-plans' ? '#F08571' : 'transparent',
                border: `2px solid ${filter === 'daily-plans' ? '#F08571' : '#e5e5e5'}`,
                borderRadius: '6px',
                color: filter === 'daily-plans' ? 'white' : '#333',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (filter !== 'daily-plans') {
                  e.target.style.borderColor = '#F08571';
                  e.target.style.backgroundColor = '#f9f9f9';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== 'daily-plans') {
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              My Daily Intentions
            </button>
            <button
              onClick={() => setFilter('meetings')}
              style={{
                padding: '8px 16px',
                backgroundColor: filter === 'meetings' ? '#F08571' : 'transparent',
                border: `2px solid ${filter === 'meetings' ? '#F08571' : '#e5e5e5'}`,
                borderRadius: '6px',
                color: filter === 'meetings' ? 'white' : '#333',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (filter !== 'meetings') {
                  e.target.style.borderColor = '#F08571';
                  e.target.style.backgroundColor = '#f9f9f9';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== 'meetings') {
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              My Meeting Plans
            </button>
          </div>
        </div>

        {isLoading ? (
          <p style={{ color: '#999', fontSize: '14px', textAlign: 'center' }}>Loading...</p>
        ) : plans.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '32px' }}>
            <p style={{ color: '#999', fontSize: '14px', marginBottom: '16px' }}>No plans yet</p>
            <button
              onClick={() => {
                const route = filter === 'meetings' ? '/plan-meeting' : '/plan-my-day';
                navigate(route, { state: { isGuest } });
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#F08571',
                color: 'white',
                fontWeight: '600',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#e07560';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#F08571';
              }}
            >
              Create a Plan
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {plans
              .filter((plan) => {
                if (filter === 'meetings') {
                  return plan.tool_type === 'plan_meeting';
                } else if (filter === 'daily-plans') {
                  return plan.tool_type === 'daily_plan';
                }
                return true;
              })
              .map((plan) => (
                <div
                  key={plan.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const route = plan.tool_type === 'daily_plan' ? '/daily-plan-summary' : '/meeting-summary';
                    navigate(route, { state: { isGuest, decisionId: plan.id, ...plan } });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const route = plan.tool_type === 'daily_plan' ? '/daily-plan-summary' : '/meeting-summary';
                      navigate(route, { state: { isGuest, decisionId: plan.id, ...plan } });
                    }
                  }}
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9f9f9',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: '70px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                    e.currentTarget.style.borderColor = '#F08571';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9f9f9';
                    e.currentTarget.style.borderColor = '#e5e5e5';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', width: '100%' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
                        {plan.tool_type === 'daily_plan' ? formatDailyPlanDateAndTime(plan.created_at) : plan.title || 'Meeting'}
                      </p>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          color: 'white',
                          backgroundColor: '#F08571',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {plan.tool_type === 'daily_plan' ? 'Daily Plan' : 'Meeting Plan'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '34px' }}>
                      {plan.tool_type === 'plan_meeting' && (
                        <p style={{ fontSize: '13px', color: '#999', margin: 0, whiteSpace: 'nowrap', lineHeight: '34px' }}>
                          {plan.form_data && plan.form_data.date && plan.form_data.time
                            ? `${new Date(plan.form_data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} ${new Date(`2000-01-01T${plan.form_data.time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                            : new Date(plan.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + new Date(plan.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                          }
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '34px' }}>
                      <button
                        onClick={(e) => handleEdit(plan, e)}
                        title="Edit plan"
                        style={{
                          padding: '8px',
                          backgroundColor: 'transparent',
                          color: '#F08571',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '34px',
                          width: '34px',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(plan.id, e)}
                        title="Delete plan"
                        style={{
                          padding: '8px',
                          backgroundColor: 'transparent',
                          color: '#F08571',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '34px',
                          width: '34px',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Fixed bottom bar for creating new plans */}
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
          onClick={() => {
            const route = filter === 'meetings' ? '/plan-meeting' : '/plan-my-day';
            navigate(route, { state: { isGuest } });
          }}
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
          + Create a Plan
        </button>
      </div>
    </div>
  );
}
