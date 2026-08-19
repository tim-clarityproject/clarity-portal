import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function DecisionsLog() {
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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/welcome', { state: { isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>My Decisions</h1>
        </div>

        {/* Available Tools Section */}
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Decision-Making Tools</h2>
          <button
            onClick={() => navigate('/grow-step-1', { state: { isGuest } })}
            style={{
              width: '100%',
              padding: '24px',
              backgroundColor: '#f9f9f9',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              color: '#333',
              transition: 'all 0.2s',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f0f0f0';
              e.target.style.borderColor = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#f9f9f9';
              e.target.style.borderColor = '#e5e5e5';
            }}
          >
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>GROW Model</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#999' }}>Goal, Reality, Options, Will Do</p>
            </div>
          </button>
        </div>

        {/* Past Decisions Section */}
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Past Decisions</h2>
          {isLoading ? (
            <p style={{ color: '#999', fontSize: '14px', textAlign: 'center' }}>Loading...</p>
          ) : decisions.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', paddingTop: '32px' }}>No past decisions yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {decisions.map((decision) => (
                <button
                  key={decision.id}
                  onClick={() => navigate('/grow-step-1', { state: { isGuest, decisionId: decision.id } })}
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9f9f9',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
                          {decision.goal ? truncateContent(decision.goal, 60) : 'Untitled Decision'}
                        </p>
                        <span style={{ fontSize: '12px', color: '#999' }}>
                          {formatTime(decision.created_at)}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                        {formatDate(decision.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(decision.id, e)}
                      title="Delete decision"
                      style={{
                        padding: '8px',
                        backgroundColor: 'transparent',
                        color: '#d32f2f',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: '12px',
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
