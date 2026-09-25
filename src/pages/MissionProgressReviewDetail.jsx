import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Download } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateAndTime } from '../lib/dateFormatter';
import { generateMissionProgressPDF } from '../lib/pdfExport';
import HomeHeader from '../components/HomeHeader';

export default function MissionProgressReviewDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const reviewId = location.state?.reviewId;

  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (reviewId && user) {
      loadReview();
    }
  }, [reviewId, user]);

  const loadReview = async () => {
    try {
      const { data, error } = await supabase
        .from('mission_progress_reviews')
        .select('*')
        .eq('id', reviewId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (data) {
        setReview(data);
        if (data.review_data?.strategies?.length > 0) {
          setExpandedStrategies({ [data.review_data.strategies[0].id]: true });
        }
      }
    } catch (error) {
      console.error('Error loading review:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStrategy = (strategyId) => {
    setExpandedStrategies(prev => ({
      ...prev,
      [strategyId]: !prev[strategyId]
    }));
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      generateMissionProgressPDF(review);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <p style={{ color: '#999' }}>Review not found</p>
        </div>
      </div>
    );
  }

  const data = review.review_data;
  if (!data) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <p style={{ color: '#999' }}>Invalid review data</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '40px 32px' }} className="page-container">
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={() => navigate('/my-reviews')}
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#999',
              cursor: 'pointer',
              marginBottom: '16px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.color = '#999';
            }}
          >
            ← Back to Reviews
          </button>
          <p style={{ fontSize: '12px', color: '#999', margin: '0 0 8px 0', fontWeight: '500' }}>MISSION REVIEW</p>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', margin: '0 0 8px 0' }}>
            {data.mission_title}
          </h1>
          <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
            Reviewed on {formatDateAndTime(review.created_at)}
          </p>
        </div>

        {/* Export Button */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            style={{
              padding: '10px 16px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontWeight: '600',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isExporting ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isExporting && (e.target.style.borderColor = '#F08571')}
            onMouseLeave={(e) => !isExporting && (e.target.style.borderColor = '#e5e5e5')}
          >
            <Download size={16} />
            {isExporting ? 'Exporting...' : 'Download PDF'}
          </button>
        </div>

        {/* Strategies Section */}
        <div style={{ marginBottom: '32px' }}>
          {data.strategies && data.strategies.length > 0 ? (
            data.strategies.map(strategy => (
              <div key={strategy.id} style={{ marginBottom: '16px', border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleStrategy(strategy.id)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#fafafa',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
                >
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: '0 0 4px 0' }}>
                      {strategy.name}
                    </h3>
                    {strategy.description && (
                      <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
                        {strategy.description}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    size={20}
                    style={{
                      color: '#999',
                      transform: expandedStrategies[strategy.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                      marginLeft: '16px'
                    }}
                  />
                </button>

                {/* Tactics */}
                {expandedStrategies[strategy.id] && (
                  <div style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid #e5e5e5' }}>
                    {strategy.tactics && strategy.tactics.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {strategy.tactics.map((tactic, index) => (
                          <div key={tactic.id} style={{ paddingBottom: '12px', borderBottom: index < strategy.tactics.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 8px 0' }}>
                              {tactic.action}
                            </p>

                            {/* Tactic Status */}
                            <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                              {tactic.type === 'tickable' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    type="checkbox"
                                    checked={tactic.reviewed_is_done || false}
                                    disabled
                                    style={{ width: '16px', height: '16px' }}
                                  />
                                  <span style={{ fontSize: '13px', color: '#333' }}>
                                    {tactic.reviewed_is_done ? 'Done' : 'Not done'}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontSize: '13px', color: '#333', fontWeight: '600' }}>
                                    {tactic.reviewed_value || 0} / {tactic.target_value} {tactic.unit}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Reflection Note */}
                            {tactic.reviewed_note && (
                              <div style={{ padding: '8px', backgroundColor: '#f9f9f9', borderRadius: '4px', borderLeft: '3px solid #F08571' }}>
                                <p style={{ fontSize: '12px', color: '#999', margin: '0 0 4px 0', fontWeight: '600' }}>Note:</p>
                                <p style={{ fontSize: '13px', color: '#333', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {tactic.reviewed_note}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>No tactics</p>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#999', fontSize: '14px' }}>No strategies in this review</p>
          )}
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={() => navigate('/my-reviews')}
            style={{
              width: '100%',
              padding: '12px 24px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'white';
            }}
          >
            Back to Reviews
          </button>
        </div>
      </div>
    </div>
  );
}
