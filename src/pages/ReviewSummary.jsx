import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateWithOrdinal } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';

export default function ReviewSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;
  const reviewType = location.state?.reviewType || 'after-action';
  const selectedDate = location.state?.selectedDate;
  const entryId = location.state?.entryId;


  useEffect(() => {
    const loadReview = async () => {
      if (!user || !selectedDate) {
        setIsLoading(false);
        return;
      }

      try {
        let query = supabase
          .from('journal_entries')
          .select('*')
          .eq('user_id', user.id);

        if (entryId) {
          query = query.eq('id', entryId);
        } else {
          query = query
            .eq('entry_date', selectedDate)
            .eq('review_type', reviewType)
            .order('created_at', { ascending: false })
            .limit(1);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching review:', error);
          setIsLoading(false);
          return;
        }

        if (data && data.length > 0) {
          setReview(data[0]);
        }
      } catch (err) {
        console.error('Error loading review:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReview();
  }, [selectedDate, reviewType, user?.id, entryId]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999' }}>Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999' }}>Review not found</p>
        </div>
      </div>
    );
  }

  let parsedContent = {};
  try {
    parsedContent = JSON.parse(review.content);
  } catch (e) {
    parsedContent = {};
  }

  const SectionBlock = ({ title, content }) => (
    <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
      <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </h2>
      <div style={{
        backgroundColor: '#f9f9f9',
        padding: '16px',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.6',
        color: '#666',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
      }}>
        {content || <span style={{ color: '#999', fontStyle: 'italic' }}>No content provided</span>}
      </div>
    </div>
  );

  const isAfterAction = reviewType === 'after-action';
  const isProgressReview = reviewType === 'progress';
  const isWeeklyMomentum = reviewType === 'weekly-momentum';
  const pageTitle = isAfterAction ? 'After-Action Review' : isProgressReview ? 'Progress Review' : 'Weekly Momentum Review';

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @page {
          margin: 0.4in 0.5in;
          padding: 0;
          @bottom-right { content: ''; }
          @bottom-left { content: ''; }
          @top-right { content: ''; }
          @top-left { content: ''; }
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body { margin: 0; padding: 0; }
          html { margin: 0; padding: 0; }
          button { display: none !important; }
          [style*="flex-direction: column"] > div:first-child { display: none !important; }
          div[style*="padding: 64px 32px"] { padding: 16px 24px !important; }
          h1 { margin-top: 4px !important; margin-bottom: 12px !important; page-break-after: avoid; }
          h2 { page-break-after: avoid; margin-top: 8px !important; margin-bottom: 6px !important; }
          div[style*="marginBottom: '32px'"] { margin-bottom: 12px !important; }
          div[style*="marginBottom: '48px'"] { margin-bottom: 12px !important; }
        }
      `}</style>
      <style>{`
        .page-container {
          padding: 64px 32px;
        }
        @media (max-width: 768px) {
          .page-container {
            padding: 32px 16px;
          }
        }
      `}</style>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="page-container">
        {/* Back Button */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/my-reviews', { state: { isGuest } })}
            style={{
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
          >
            ← Back to Reviews
          </button>
        </div>

        {/* Title and Tag */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#000', margin: '0 0 24px 0', flex: 1 }}>
            {review.title || pageTitle}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            {isAfterAction ? 'After-Action Review' : isProgressReview ? 'Progress Review' : 'Weekly Momentum Review'}
          </span>
        </div>

        {/* Date */}
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
          {formatDateWithOrdinal(review.entry_date)}
        </p>

        {/* After-Action Review Sections */}
        {isAfterAction && (
          <>
            {parsedContent.q1 && (
              <SectionBlock
                title="What did I intend to happen?"
                content={parsedContent.q1}
              />
            )}
            {parsedContent.q2 && (
              <SectionBlock
                title="What actually happened?"
                content={parsedContent.q2}
              />
            )}
            {parsedContent.q3 && (
              <SectionBlock
                title="Why was there a difference?"
                content={parsedContent.q3}
              />
            )}
            {parsedContent.q4 && (
              <SectionBlock
                title="What can I learn from this?"
                content={parsedContent.q4}
              />
            )}
          </>
        )}

        {/* Progress Review Sections */}
        {isProgressReview && (
          <>
            {parsedContent.q1 && (
              <SectionBlock
                title="What's been going well?"
                content={parsedContent.q1}
              />
            )}
            {parsedContent.q2 && (
              <SectionBlock
                title="What have you learned recently?"
                content={parsedContent.q2}
              />
            )}
            {parsedContent.q3 && (
              <SectionBlock
                title="What next steps will expand your performance potential?"
                content={parsedContent.q3}
              />
            )}
          </>
        )}

        {/* Weekly Momentum Review Sections */}
        {isWeeklyMomentum && (
          <>
            {parsedContent.q1 && (
              <SectionBlock
                title="What moved forward this week?"
                content={parsedContent.q1}
              />
            )}
            {parsedContent.q2 && (
              <SectionBlock
                title="What did you do better this week?"
                content={parsedContent.q2}
              />
            )}
            {parsedContent.q3 && (
              <SectionBlock
                title="What's one priority for next week?"
                content={parsedContent.q3}
              />
            )}

            {/* Ratings Section */}
            <div style={{ marginBottom: '16px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Weekly Ratings
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Intentionality</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#F08571' }}>{parsedContent.intentionality || '—'}/5</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(parsedContent.intentionality || 0) * 20}%`, backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Communication</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#F08571' }}>{parsedContent.communication || '—'}/5</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(parsedContent.communication || 0) * 20}%`, backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Progress</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#F08571' }}>{parsedContent.progress || '—'}/5</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e5e5', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(parsedContent.progress || 0) * 20}%`, backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Action Button */}
        <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/my-journal', { state: { isGuest, selectedDate: review.entry_date, reviewType } })}
            style={{
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
