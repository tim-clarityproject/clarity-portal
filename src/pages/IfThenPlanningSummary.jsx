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
      console.log('[IfThenPlanningSummary] loadPlanning: fetching decisionId =', decisionId, 'user =', user.id);
      loadPlanning();
    } else {
      console.log('[IfThenPlanningSummary] Missing decisionId or user:', { decisionId, userId: user?.id });
      setIsLoading(false);
    }
  }, [decisionId, user]);

  const loadPlanning = async () => {
    if (!user) {
      console.warn('[IfThenPlanningSummary] loadPlanning: no user');
      setIsLoading(false);
      return;
    }
    try {
      console.log('[IfThenPlanningSummary] loadPlanning: querying for decisionId =', decisionId);
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[IfThenPlanningSummary] Query error:', error);
        throw error;
      }

      if (data) {
        console.log('[IfThenPlanningSummary] Planning loaded successfully:', data.id);
        setPlanning(data);
      } else {
        console.warn('[IfThenPlanningSummary] No data returned for decisionId', decisionId);
      }
    } catch (error) {
      console.error('[IfThenPlanningSummary] Error loading planning:', error.message);
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

  const formatTagName = (toolType) => {
    if (toolType === 'if_then_planning') return 'If-Then Plan';
    const words = toolType
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    const separator = toolType.includes('_') ? '-' : ' ';
    return words.join(separator);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', marginTop: '100px', paddingBottom: '100px' }} className="page-container print-container">
        {/* Back to Decisions Button */}
        <button
          onClick={() => navigate('/decision-history', { state: { isGuest } })}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            padding: 0,
            marginBottom: '24px',
          }}
          className="no-print"
        >
          ← Back to Decisions
        </button>

        {/* Title and Tag */}
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            {planning.title || 'If-Then Planning'}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }} className="no-print">
            {formatTagName(planning.tool_type)}
          </span>
        </div>

        {/* Scenarios */}
        {items && items.length > 0 && (
          <div style={{ marginBottom: '0' }}>
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
                    <p style={{ fontSize: '13px', color: '#333', margin: 0, lineHeight: '1.5', fontWeight: '500' }}>{item.ifCondition}</p>
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
