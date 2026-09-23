import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function IfThenPlanningSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const decisionId = location.state?.decisionId;

  const [planning, setPlanning] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (decisionId && user) {
      loadPlanning();
    } else {
      setIsLoading(false);
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

      if (error) {
        throw error;
      }

      if (data) {
        setPlanning(data);
      }
    } catch (error) {
      // Silently handle load errors
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

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!planning) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Planning not found</p>
        </div>
      </div>
    );
  }

  const data = planning.form_data || {};
  const items = data.items || [];

  const formatTagName = (toolType) => {
    if (toolType === 'if_then_planning') return 'If-Then Plan';
    const words = toolType
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    const separator = toolType.includes('_') ? '-' : ' ';
    return words.join(separator);
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <style>{`
        .page-container {
          padding: 64px 32px;
          padding-bottom: 100px;
        }
        @media (max-width: 768px) {
          .page-container {
            padding: 32px 16px;
            padding-bottom: 100px;
          }
        }
      `}</style>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="page-container print-container">
        {/* Back to Decisions Button */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F08571',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              padding: '4px 8px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e07560'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#F08571'}
            className="no-print"
          >
            ← Back to Decisions
          </button>
        </div>

        {/* Title and Tag */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#000', margin: 0, flex: 1 }}>
            {planning.title || 'If-Then Planning'}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }} className="no-print">
            {formatTagName(planning.tool_type)}
          </span>
        </div>

        {/* Scenarios */}
        {items && items.length > 0 && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scenarios</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map((item, index) => (
                <div key={index} style={{
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px',
                  alignItems: 'start',
                }}>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>If This Happens</p>
                    <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' }}>{item.ifCondition}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Then My Response Will Be</p>
                    <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' }}>{item.thenAction}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!items || items.length === 0 && (
          <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' }}>No scenarios planned yet</p>
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
            e.currentTarget.style.backgroundColor = '#f9f9f9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e5e5';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
