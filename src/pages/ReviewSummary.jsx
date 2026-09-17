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


  useEffect(() => {
    const loadReview = async () => {
      if (!user || !selectedDate) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('entry_date', selectedDate)
          .eq('review_type', reviewType)
          .single();

        if (error) {
          console.error('Error fetching review:', error);
          setIsLoading(false);
          return;
        }

        setReview(data);
      } catch (err) {
        console.error('Error loading review:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReview();
  }, [selectedDate, reviewType, user?.id]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999' }}>Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
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
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </h2>
      <div style={{
        backgroundColor: '#f9f9f9',
        padding: '16px',
        borderRadius: '8px',
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#555',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
      }}>
        {content || <span style={{ color: '#999', fontStyle: 'italic' }}>No content provided</span>}
      </div>
    </div>
  );

  const isAfterAction = reviewType === 'after-action';
  const pageTitle = isAfterAction ? 'After Action Review' : 'Progress Review';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
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
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/my-reviews', { state: { isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F08571',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              padding: 0,
            }}
          >
            ← Back to Reviews
          </button>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff', backgroundColor: '#F08571', padding: '4px 12px', borderRadius: '4px', textTransform: 'uppercase' }}>
            {isAfterAction ? 'After Action' : 'Progress'}
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
          {pageTitle}
        </h1>

        {/* Date */}
        <p style={{ fontSize: '14px', color: '#999', marginBottom: '48px' }}>
          {formatDateWithOrdinal(review.entry_date)}
        </p>

        {/* After Action Review Sections */}
        {isAfterAction && (
          <>
            <SectionBlock
              title="What was supposed to happen?"
              content={parsedContent.q1}
            />
            <SectionBlock
              title="What actually happened?"
              content={parsedContent.q2}
            />
            <SectionBlock
              title="Why was there a difference?"
              content={parsedContent.q3}
            />
            <SectionBlock
              title="What can we learn from this?"
              content={parsedContent.q4}
            />
          </>
        )}

        {/* Progress Review Sections */}
        {!isAfterAction && (
          <>
            <SectionBlock
              title="What's been going well?"
              content={parsedContent.q1}
            />
            <SectionBlock
              title="What have you learned recently?"
              content={parsedContent.q2}
            />
            <SectionBlock
              title="What next steps will expand your performance potential?"
              content={parsedContent.q3}
            />
          </>
        )}

        {/* Action Button */}
        <div style={{ marginTop: '48px', display: 'flex', gap: '12px' }}>
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
