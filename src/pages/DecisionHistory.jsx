import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Edit } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { formatDateWithOrdinal } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function DecisionHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisions, setDecisions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (user && !isGuest) {
      loadDecisions();
    }
  }, [user, isGuest]);

  const loadDecisions = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setDecisions(data);
      }
    } catch (error) {
      console.error('Error loading decisions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDailyPlanDate = (dateStr) => {
    const date = new Date(dateStr);
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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTagName = (toolType) => {
    const words = toolType
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1));

    // Use hyphen for underscored names, space for hyphenated names
    const separator = toolType.includes('_') ? '-' : ' ';
    return words.join(separator);
  };

  const formatDateAndTime = (timeStr) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr_ = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr_}`;
  };

  const handleEdit = (decision, e) => {
    e.stopPropagation();
    const editPageMap = {
      grow: '/grow-step-1',
      inversion: '/inversion-step-1',
      'tough-conversation': '/tough-conversation-step-1',
      'strategic-alignment': '/goal-setting',
      'daily_plan': '/plan-my-day',
      'if_then_planning': '/if-then-planning',
    };
    const editPage = editPageMap[decision.tool_type] || '/decision-tools';
    navigate(editPage, { state: { isGuest, decisionId: decision.id, ...decision.form_data } });
  };

  const handleDelete = async (decisionId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this decision?')) return;

    try {
      await supabase
        .from('decisions')
        .delete()
        .eq('id', decisionId);
      setDecisions(decisions.filter(d => d.id !== decisionId));
      clearProgress();
    } catch (error) {
      console.error('Error deleting decision:', error);
      alert('Failed to delete decision');
    }
  };

  const truncateContent = (content, length = 100) => {
    if (!content) return '';
    return content.length > length ? content.substring(0, length) + '...' : content;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '48px' }}>My Decisions</h1>

        {isLoading ? (
          <p style={{ color: '#999', fontSize: '14px', textAlign: 'center' }}>Loading...</p>
        ) : decisions.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '32px' }}>
            <p style={{ color: '#999', fontSize: '14px', marginBottom: '16px' }}>No decisions yet</p>
            <button
              onClick={() => navigate('/decision-tools', { state: { isGuest } })}
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
              Make a Decision
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {decisions
              .filter((decision) => decision.tool_type !== 'daily_plan')
              .map((decision) => {
              return (
              <button
                key={decision.id}
                onClick={() => {
                  let route = '/decision-summary';
                  if (decision.tool_type === 'daily_plan') route = '/daily-plan-summary';
                  if (decision.tool_type === 'if_then_planning') route = '/if-then-planning-summary';
                  navigate(route, { state: { isGuest, decisionId: decision.id, ...decision } });
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
                    {decision.tool_type === 'daily_plan' ? (
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
                        {formatDailyPlanDateAndTime(decision.created_at)}
                      </p>
                    ) : (
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
                        {decision.title ? truncateContent(decision.title, 60) : 'Untitled Decision'}
                      </p>
                    )}
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
                      {decision.tool_type === 'daily_plan' ? 'Daily Plan' : formatTagName(decision.tool_type)}
                    </span>
                    {(decision.draft || decision.status === 'draft') && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#fff',
                          backgroundColor: '#999',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Draft
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '34px' }}>
                    <p style={{ fontSize: '13px', color: '#999', margin: 0, whiteSpace: 'nowrap', lineHeight: '34px' }}>
                      {decision.tool_type === 'daily_plan' ? '' : formatDateAndTime(decision.created_at)}
                    </p>
                    <button
                      onClick={(e) => handleEdit(decision, e)}
                      title="Edit decision"
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
                      onClick={(e) => handleDelete(decision.id, e)}
                      title="Delete decision"
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
              </button>
            );
            })}

          </div>
        )}
      </div>

      {/* Fixed bottom bar for making new decisions - always visible */}
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
            e.currentTarget.style.backgroundColor = '#FEE5DE';
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
