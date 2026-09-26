import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, Mail, X, ChevronLeft } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function StopDoingAuditSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [audit, setAudit] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    if (decisionId && user) {
      loadAudit();
    }
  }, [decisionId, user]);

  const loadAudit = async () => {
    if (!user) {
      setError('User not authenticated');
      setIsLoading(false);
      return;
    }

    if (!decisionId) {
      setError('No audit ID provided');
      setIsLoading(false);
      return;
    }

    try {
      console.log('[StopDoingAuditSummary] Loading audit:', { decisionId, userId: user.id });

      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[StopDoingAuditSummary] Supabase error:', error);
        setError(`Failed to load audit: ${error.message || 'Unknown error'}`);
      } else if (data) {
        console.log('[StopDoingAuditSummary] Audit loaded successfully');
        setAudit(data);
      } else {
        console.warn('[StopDoingAuditSummary] No audit found');
        setError('Audit not found');
      }
    } catch (err) {
      console.error('[StopDoingAuditSummary] Exception:', err);
      setError(`Error loading audit: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/stop-doing-audit', { state: { decisionId, ...audit.form_data } });
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleSendEmail = () => {
    if (!emailInput.trim()) {
      alert('Please enter at least one email address');
      return;
    }
    alert('Email feature coming soon');
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading audit...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ maxWidth: '500px', textAlign: 'center' }}>
            <p style={{ color: '#F08571', fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0' }}>Error Loading Audit</p>
            <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.6', margin: '0 0 20px 0' }}>
              {error}
            </p>
            <button
              onClick={() => navigate('/decision-history')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#F08571',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F08571'}
            >
              Back to Decisions
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Audit not found</p>
        </div>
      </div>
    );
  }

  const data = audit.form_data || {};
  const getTotalTime = () => {
    return data.items?.reduce((total, item) => total + (parseFloat(item.timePerWeek) || 0), 0) || 0;
  };

  const getActionColor = (action) => {
    const colors = {
      'Stop': '#F08571',
      'Automate': '#4A90E2',
      'Delegate': '#7ED321',
      'Defer': '#F5A623'
    };
    return colors[action] || '#999';
  };

  const getSelectedActivityInfo = () => {
    return data.items?.find(item => item.activity === data.firstAction) || null;
  };

  const selectedActivity = getSelectedActivityInfo();

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <button
          onClick={() => navigate('/decision-history')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '8px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            borderRadius: '6px',
            transition: 'all 0.2s',
            marginBottom: '24px',
            fontSize: '13px',
            fontWeight: '600',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          className="no-print"
        >
          <ChevronLeft size={20} />
          <span style={{ marginLeft: '4px' }}>Back to My Decisions</span>
        </button>

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            Stop Doing Audit
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Stop Doing Audit
          </span>
        </div>

        {/* Activities Section */}
        <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Time-Sink Activities ({getTotalTime().toFixed(1)} hours/week)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.items?.map((item, index) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '6px',
                  border: '1px solid #f0f0f0'
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#333', margin: '0 0 4px 0' }}>
                    {index + 1}. {item.activity}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        backgroundColor: getActionColor(item.action),
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}
                    >
                      {item.action}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, minWidth: '60px', textAlign: 'right' }}>
                  {parseFloat(item.timePerWeek) || 0}h/week
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Action */}
        {selectedActivity && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Taking Action First
            </h2>
            <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 8px 0' }}>
                {selectedActivity.activity}
              </p>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    backgroundColor: getActionColor(selectedActivity.action),
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}
                >
                  {selectedActivity.action}
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  Reclaim {parseFloat(selectedActivity.timePerWeek) || 0} hours/week
                </span>
              </div>
            </div>
          </div>
        )}

        {/* How Specifically Will Take Action */}
        {data.actionHow && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              How Specifically Will You Take Action
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.actionHow}
            </p>
          </div>
        )}

        {/* Time Use Reflection */}
        {data.timeUse && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What You'll Do With the Time Instead
            </h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap', textTransform: 'none' }}>
              {data.timeUse}
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
            Edit Audit
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
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
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
            <Download size={14} />
            Download PDF
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print {
            display: none;
          }
          @page {
            margin: 2cm;
            size: A4;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
