import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function InversionThinkingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [thinking, setThinking] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  useEffect(() => {
    if (decisionId && user) {
      loadThinking();
    }
  }, [decisionId, user]);

  const loadThinking = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data) {
        setThinking(data);
      }
    } catch (error) {
      console.error('Error loading thinking:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/inversion-step-1', { state: { isGuest, decisionId, ...thinking.form_data } });
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading thinking...</p>
        </div>
      </div>
    );
  }

  if (!thinking) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Thinking not found</p>
        </div>
      </div>
    );
  }

  const data = thinking.form_data || {};

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            {thinking.title || 'Inversion Thinking'}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Inversion Thinking
          </span>
        </div>

        {/* Goal Section */}
        {data.goal && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Goal
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.goal}
            </p>
          </div>
        )}

        {/* Failure Modes Section */}
        {data.fuckups && data.fuckups.length > 0 && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What Could Go Wrong
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.fuckups.map((mode, index) => (
                <div key={index} style={{ backgroundColor: '#f9f9f9', padding: '12px 16px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0 }}>
                    {mode}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prevention Plan Section */}
        {data.plan && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Prevention Plan
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.plan}
            </p>
          </div>
        )}

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', paddingTop: '32px', borderTop: '1px solid #f0f0f0', justifyContent: 'space-between' }} className="no-print">
          <button
            onClick={handleEdit}
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
            Edit Thinking
          </button>

          <button
            onClick={handleDownloadPDF}
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
