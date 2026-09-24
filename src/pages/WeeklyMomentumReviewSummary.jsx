import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateWithOrdinal } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function WeeklyMomentumReviewSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;
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
            .eq('review_type', 'weekly-momentum')
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
  }, [selectedDate, user?.id, entryId]);

  const handleDownloadPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Review not found</p>
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

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>
              Weekly Momentum Review
            </h1>
            <p style={{ fontSize: '13px', color: '#999', margin: '8px 0 0 0' }}>
              Week of {formatDateWithOrdinal(review.entry_date)}
            </p>
          </div>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Weekly Review
          </span>
        </div>

        {parsedContent.whatWentWell && (
          <SectionBlock
            title="What Went Well"
            content={parsedContent.whatWentWell}
          />
        )}

        {parsedContent.whatNeedsWork && (
          <SectionBlock
            title="What Needs Work"
            content={parsedContent.whatNeedsWork}
          />
        )}

        {parsedContent.nextWeeksPriority && (
          <SectionBlock
            title="Next Week's Priority"
            content={parsedContent.nextWeeksPriority}
          />
        )}

        {parsedContent.howAreYouFeeling && (
          <SectionBlock
            title="How Are You Feeling"
            content={parsedContent.howAreYouFeeling}
          />
        )}

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', paddingTop: '32px', borderTop: '1px solid #f0f0f0', justifyContent: 'flex-end' }} className="no-print">
          <button
            onClick={() => navigate('/my-journal', { state: { isGuest } })}
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
            Back to Journal
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
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
