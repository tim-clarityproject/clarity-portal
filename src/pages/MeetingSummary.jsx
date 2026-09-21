import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, X, ChevronLeft } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function MeetingSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  useEffect(() => {
    if (decisionId && user) {
      loadMeeting();
    }
  }, [decisionId, user]);

  const loadMeeting = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setMeeting(data);
      }
    } catch (error) {
      // Silently handle load errors
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

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading meeting...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
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
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} className="no-print" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <button
          onClick={() => navigate('/my-plans', { state: { isGuest } })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            marginBottom: '16px',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#e07560'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#F08571'}
          className="no-print"
        >
          <ChevronLeft size={18} />
          Back to Meeting Plans
        </button>

        {/* Meeting Title - Only on Screen */}
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '0 0 24px 0' }} className="no-print">
          {data.title || 'Meeting Plan'}
        </h1>

        {/* Title for Print */}
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'black', margin: '0 0 24px 0' }} className="print-only">
          {data.title || 'Meeting Plan'}
        </h1>

        {/* Meeting Details - Compact Grid */}
        <div style={{ backgroundColor: '#fafafa', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #f0f0f0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>{formatDate(data.date)}</p>
          </div>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>{formatTime(data.time)}</p>
          </div>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chair</p>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>{data.chair || '—'}</p>
          </div>
        </div>

        {/* Meeting Context */}
        {data.meetingContext && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Context</h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>{data.meetingContext}</p>
          </div>
        )}

        {/* Attendee Preparation */}
        {data.preReads && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preparation</h2>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-wrap' }}>{data.preReads}</p>
          </div>
        )}

        {/* Objectives */}
        {data.objectives && data.objectives.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Objectives</h2>
            <ol style={{ fontSize: '13px', color: '#666', margin: '0', paddingLeft: '20px', lineHeight: '1.6' }}>
              {data.objectives.map((obj) => (
                <li key={obj.id} style={{ marginBottom: '4px' }}>{obj.text}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Meeting Agenda */}
        {data.flowItems && data.flowItems.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Meeting Agenda</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Item</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Aim</th>
                    <th style={{ padding: '8px', textAlign: 'left', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Lead</th>
                    <th style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px', width: '50px' }}>Min</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flowItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px', color: '#333', fontWeight: '500' }}>{item.item}</td>
                      <td style={{ padding: '8px', color: '#666', fontSize: '12px' }}>{item.aim}</td>
                      <td style={{ padding: '8px', color: '#666', fontSize: '12px' }}>{item.lead}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#666', fontSize: '12px', fontWeight: '600' }}>{item.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: '#999', marginTop: '6px', marginBottom: 0, fontWeight: '600' }}>
              Total: {data.flowItems.reduce((sum, item) => sum + (parseInt(item.length) || 0), 0)} minutes
            </p>
          </div>
        )}

        <style>{`
          .print-only {
            display: none !important;
          }

          @page {
            size: A4 landscape;
            margin: 0;
            padding: 0;
            /* Hide browser headers and footers */
            @top-left { content: none; }
            @top-center { content: none; }
            @top-right { content: none; }
            @bottom-left { content: none; }
            @bottom-center { content: none; }
            @bottom-right { content: none; }
          }

          @media print {
            * {
              margin: 0 !important;
              padding: 0 !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only {
              display: block !important;
            }
            .page-container {
              padding: 0.5in !important;
              max-width: 100% !important;
              margin: 0 !important;
            }
            .mission-container {
              display: none !important;
            }
            button {
              display: none !important;
            }
            svg {
              display: none !important;
            }
            /* Hide any timestamp or date elements */
            time, [data-timestamp], [class*="time"], [class*="date"] {
              display: none !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body, html {
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            body::before, body::after {
              display: none !important;
            }
            h1 {
              margin: 0 0 20px 0 !important;
              padding: 0 !important;
              page-break-after: avoid;
              font-size: 28px !important;
              font-weight: bold !important;
              color: #000 !important;
              border-bottom: 2px solid #F08571;
              padding-bottom: 12px;
            }
            h2 {
              page-break-after: avoid;
              margin: 20px 0 12px 0 !important;
              font-size: 14px !important;
              font-weight: 600 !important;
              color: #333 !important;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border-bottom: 2px solid #F08571;
              padding-bottom: 8px;
            }
            p {
              margin: 0 !important;
              font-size: 12px !important;
              color: #333 !important;
            }
            div {
              page-break-inside: avoid;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              font-size: 12px !important;
              margin: 12px 0 !important;
              border: 1px solid #ddd !important;
            }
            td, th {
              padding: 8px 10px !important;
              border: 1px solid #ddd !important;
              text-align: left !important;
            }
            th {
              background-color: #f5f5f5 !important;
              font-weight: 600 !important;
              color: #333 !important;
            }
            tr:nth-child(even) {
              background-color: #fafafa !important;
            }
            /* Hide header background */
            div[style*="backgroundColor: '#fafafa'"] {
              background-color: white !important;
              border: 1px solid #ddd !important;
            }
            /* Meeting details grid */
            div[style*="gridTemplateColumns"] {
              display: grid !important;
              grid-template-columns: 1fr 1fr 1fr !important;
              gap: 16px !important;
              margin-bottom: 24px !important;
              padding: 16px !important;
              border: 1px solid #ddd !important;
              background: white !important;
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
            e.currentTarget.style.backgroundColor = '#f9f9f9';
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
            className="no-print"
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
          }}
          className="no-print">
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

          </div>
        </>
      )}
    </div>
  );
}
