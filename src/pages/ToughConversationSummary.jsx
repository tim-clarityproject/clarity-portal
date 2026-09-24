import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function ToughConversationSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [conversation, setConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const decisionId = location.state?.decisionId;

  useEffect(() => {
    if (decisionId && user) {
      loadConversation();
    }
  }, [decisionId, user]);

  const loadConversation = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data) {
        setConversation(data);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/tough-conversation-step-1', { state: { decisionId, ...conversation.form_data } });
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Conversation not found</p>
        </div>
      </div>
    );
  }

  const data = conversation.form_data || {};

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            {conversation.title || 'Tough Conversation'}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Tough Conversation
          </span>
        </div>

        {/* Observation Section */}
        {data.observation && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Observation
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.observation}
            </p>
          </div>
        )}

        {/* Impact Section */}
        {data.impact && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Impact
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.impact}
            </p>
          </div>
        )}

        {/* Need Section */}
        {data.need && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What You Need
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.need}
            </p>
          </div>
        )}

        {/* Coaching Questions Section */}
        {data.selectedQuestions && data.selectedQuestions.length > 0 && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Coaching Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.selectedQuestions.map((question, index) => (
                <div key={index} style={{ backgroundColor: '#f9f9f9', padding: '12px 16px', borderRadius: '6px', border: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0 }}>
                    {question}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Question Section */}
        {data.customQuestion && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Question
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.customQuestion}
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
            Edit Conversation
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
