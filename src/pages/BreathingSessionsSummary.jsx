import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateWithOrdinal } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function BreathingSessionsSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  const loadSessions = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('breathing_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('session_date', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Error loading sessions:', error);
        setIsLoading(false);
        return;
      }

      setSessions(data || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getBreathingTypeLabel = (mode) => {
    const labels = {
      'box': 'Box Breathing',
      'sigh': 'Sigh of Relief',
      '478': '4-7-8 Breathing',
      'alternate': 'Alternate Nostril'
    };
    return labels[mode] || mode;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getTotalTime = () => {
    return sessions.reduce((total, session) => total + (session.duration_seconds || 0), 0);
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            Breathing Sessions
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Breathing History
          </span>
        </div>

        {/* Summary Stats */}
        {sessions.length > 0 && (
          <div style={{ marginBottom: '24px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Summary
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ backgroundColor: '#f9f9f9', padding: '12px 16px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                <p style={{ fontSize: '12px', color: '#999', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Sessions
                </p>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>
                  {sessions.length}
                </p>
              </div>
              <div style={{ backgroundColor: '#f9f9f9', padding: '12px 16px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                <p style={{ fontSize: '12px', color: '#999', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Time
                </p>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>
                  {Math.floor(getTotalTime() / 60)}m
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sessions List */}
        {sessions.length > 0 ? (
          <div style={{ marginBottom: '24px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recent Sessions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessions.map((session) => (
                <div key={session.id} style={{ backgroundColor: '#f9f9f9', padding: '12px 16px', borderRadius: '6px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0 }}>
                      {getBreathingTypeLabel(session.breathing_mode)}
                    </p>
                    <p style={{ fontSize: '12px', color: '#999', margin: '4px 0 0 0' }}>
                      {formatDateWithOrdinal(session.session_date)}
                    </p>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#F08571', margin: 0 }}>
                    {formatDuration(session.duration_seconds)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '24px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
              No breathing sessions recorded yet. Start a session to begin tracking your practice.
            </p>
          </div>
        )}

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', paddingTop: '32px', borderTop: '1px solid #f0f0f0', justifyContent: 'flex-end' }} className="no-print">
          <button
            onClick={() => navigate('/welcome')}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#333',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Back Home
          </button>

          <button
            onClick={() => window.print()}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#333',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
