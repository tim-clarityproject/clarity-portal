import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, Mail, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function MeetingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    if (decisionId && user) {
      loadMeeting();
    }
  }, [decisionId, user]);

  const loadMeeting = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data) {
        setMeeting(data);
      }
    } catch (error) {
      console.error('Error loading meeting:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/plan-meeting', { state: { isGuest, decisionId, ...meeting.form_data } });
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleSendEmail = () => {
    if (!emailInput.trim()) {
      alert('Please enter at least one email address');
      return;
    }
    // TODO: Integrate with email service
    alert('Email feature coming soon');
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Meeting not found</p>
        </div>
      </div>
    );
  }

  const data = meeting.form_data || {};
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return timeStr;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        {/* Meeting Title */}
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '0 0 32px 0' }} className="no-print">
          {data.title || 'Meeting Plan'}
        </h1>

        {/* Meeting Details Card */}
        <div style={{ backgroundColor: '#fafafa', padding: '24px', borderRadius: '8px', marginBottom: '32px', border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div>
              <p style={{ fontSize: '12px', fontWeight: '500', color: '#999', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>{formatDate(data.date)}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', fontWeight: '500', color: '#999', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>{formatTime(data.time)}</p>
            </div>
          </div>
          <div>
            <p style={{ fontSize: '12px', fontWeight: '500', color: '#999', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chair</p>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0 }}>{data.chair || '—'}</p>
          </div>
        </div>

        {/* Meeting Context */}
        {data.meetingContext && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>Meeting Context</h2>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>{data.meetingContext}</p>
          </div>
        )}

        {/* Attendee Preparation */}
        {data.preReads && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>Attendee Preparation</h2>
            <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>{data.preReads}</p>
          </div>
        )}

        {/* Objectives */}
        {data.objectives && data.objectives.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>Objectives</h2>
            <ol style={{ fontSize: '14px', color: '#666', margin: '0', paddingLeft: '24px', lineHeight: '1.8' }}>
              {data.objectives.map((obj) => (
                <li key={obj.id} style={{ marginBottom: '6px' }}>{obj.text}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Meeting Agenda */}
        {data.flowItems && data.flowItems.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>Meeting Agenda</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aim</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lead</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#999', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '70px' }}>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flowItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px', color: '#333' }}>{item.item}</td>
                      <td style={{ padding: '10px', color: '#666' }}>{item.aim}</td>
                      <td style={{ padding: '10px', color: '#666' }}>{item.lead}</td>
                      <td style={{ padding: '10px', color: '#666' }}>{item.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '12px', marginBottom: 0 }}>
              Total: {data.flowItems.reduce((sum, item) => sum + (parseInt(item.length) || 0), 0)} minutes
            </p>
          </div>
        )}

        <style>{`
          @media print {
            .no-print {
              display: none;
            }
            .page-container {
              padding: 0;
            }
          }
        `}</style>
      </div>

      {/* Action Buttons */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fafafa',
        borderTop: '1px solid #e5e5e5',
        padding: '12px 32px',
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 10,
      }} className="no-print">
        <button
          onClick={handleEdit}
          style={{
            padding: '10px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
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
          Edit
        </button>
        <button
          onClick={() => setShareModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#F08571',
            color: 'white',
            fontWeight: '600',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e07560'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F08571'}
        >
          <Mail size={16} />
          Share
        </button>
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <>
          <div
            onClick={() => setShareModalOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              zIndex: 99,
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
            zIndex: 100,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>Share Meeting</h2>
              <button
                onClick={() => setShareModalOpen(false)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#999',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.color = '#333'}
                onMouseLeave={(e) => e.target.style.color = '#999'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Download Option */}
            <button
              onClick={() => {
                handleDownloadPDF();
                setShareModalOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '12px',
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
              <Download size={18} style={{ color: '#F08571', flexShrink: 0 }} />
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0 }}>Download PDF</p>
                <p style={{ fontSize: '12px', color: '#999', margin: '4px 0 0 0' }}>Save to your computer</p>
              </div>
            </button>

            {/* Email Option */}
            <div style={{ paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email to Attendees</p>
              <input
                type="email"
                placeholder="Enter email addresses (comma separated)"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
              />
              <button
                onClick={handleSendEmail}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: '#F08571',
                  color: 'white',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
              >
                Send PDF
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
