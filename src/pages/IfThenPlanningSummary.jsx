import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, X } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function IfThenPlanningSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [planning, setPlanning] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    if (decisionId && user) {
      loadPlanning();
    }
  }, [decisionId, user]);

  const loadPlanning = async () => {
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

      if (error) throw error;
      if (data) {
        setPlanning(data);
      }
    } catch (error) {
      console.error('Error loading planning:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigate('/if-then-planning', { state: { isGuest, decisionId, ...planning.form_data } });
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
          <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!planning) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Planning not found</p>
        </div>
      </div>
    );
  }

  const data = planning.form_data || {};
  const items = data.items || [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        {/* Title - Only on Screen */}
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '0 0 24px 0' }} className="no-print">
          If-Then Planning
        </h1>

        {/* Title for Print */}
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', margin: '0 0 16px 0', display: 'none' }} className="print-only">
          If-Then Planning
        </h1>

        {/* Subtitle */}
        <p style={{ fontSize: '13px', color: '#999', margin: '0 0 20px 0', fontWeight: '500' }}>
          Contingency plans for uncertain situations
        </p>

        {/* Scenarios Table */}
        {items && items.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scenarios</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>When This Happens</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>My Response Will Be</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px', color: '#333', fontWeight: '500' }}>{item.ifCondition}</td>
                      <td style={{ padding: '10px', color: '#666' }}>{item.thenAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: '#999', marginTop: '8px', marginBottom: 0, fontWeight: '600' }}>
              Total scenarios: {items.length}
            </p>
          </div>
        )}

        {!items || items.length === 0 && (
          <div style={{ padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px', color: '#999' }}>
            <p style={{ fontSize: '13px', margin: 0 }}>No scenarios planned yet</p>
          </div>
        )}

        <style>{`
          @page {
            margin: 0.4in 0.5in;
            padding: 0;
          }

          @media print {
            .no-print {
              display: none !important;
            }
            .print-only {
              display: block !important;
            }
            .page-container {
              padding: 0 !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            body, html {
              margin: 0 !important;
              padding: 0 !important;
            }
            h1 {
              margin-top: 0 !important;
              margin-bottom: 8px !important;
              page-break-after: avoid;
            }
            h2 {
              page-break-after: avoid;
              margin-top: 4px !important;
              margin-bottom: 4px !important;
            }
            div {
              page-break-inside: avoid;
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
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', margin: 0 }}>Share Planning</h2>
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
              <div style={{ color: '#F08571', flexShrink: 0 }}>📄</div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0 }}>Download PDF</p>
                <p style={{ fontSize: '12px', color: '#999', margin: '4px 0 0 0' }}>Save to your computer</p>
              </div>
            </button>

            {/* Email Option */}
            <div style={{ paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</p>
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
