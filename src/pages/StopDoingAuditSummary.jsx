import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, Mail, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function StopDoingAuditSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [audit, setAudit] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    if (decisionId && user) {
      loadAudit();
    }
  }, [decisionId, user]);

  const loadAudit = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data) {
        setAudit(data);
      }
    } catch (error) {
      console.error('Error loading audit:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/stop-doing-audit', { state: { isGuest, decisionId, ...audit.form_data } });
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
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading audit...</p>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
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
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '100px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '0 0 32px 0' }} className="no-print">
          Stop Doing Audit
        </h1>

        {/* Activities Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
                  backgroundColor: '#fafafa',
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
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Taking Action First
            </h2>
            <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #F08571' }}>
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

        {/* Time Use Reflection */}
        {data.timeUse && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What You'll Do With the Time Instead
            </h2>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>
              {data.timeUse}
            </p>
          </div>
        )}

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', paddingTop: '32px', borderTop: '1px solid #f0f0f0', justifyContent: 'space-between', className: 'no-print' }}>
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
