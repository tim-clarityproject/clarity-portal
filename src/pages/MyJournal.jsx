import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import { useAutoExpandTextarea } from '../hooks/useAutoExpandTextarea';
import { formatReviewDate } from '../lib/dateFormatter';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import NamingModal from '../components/NamingModal';
import SavedConfirmation from '../components/SavedConfirmation';
import HomeHeader from '../components/HomeHeader';

export default function MyJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const reviewType = location.state?.reviewType || 'after-action';
  const [selectedDate, setSelectedDate] = useState(location.state?.selectedDate || new Date().toISOString().split('T')[0]);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isEditMode = !!location.state?.selectedDate;

  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('');
  const [reviewTitle, setReviewTitle] = useState('');
  const [intentionality, setIntentionality] = useState(3);
  const [communication, setCommunication] = useState(3);
  const [progress, setProgress] = useState(3);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [currentTitle, setCurrentTitle] = useState('');

  const refQ1 = useAutoExpandTextarea(q1);
  const refQ2 = useAutoExpandTextarea(q2);
  const refQ3 = useAutoExpandTextarea(q3);
  const refQ4 = useAutoExpandTextarea(q4);

  const afterActionQuestions = [
    { id: 'q1', label: 'What did I intend to happen?', value: q1, setter: setQ1 },
    { id: 'q2', label: 'What actually happened?', value: q2, setter: setQ2 },
    { id: 'q3', label: 'Why was there a difference?', value: q3, setter: setQ3 },
    { id: 'q4', label: 'What can I learn from this?', value: q4, setter: setQ4 },
  ];

  const progressQuestions = [
    { id: 'q1', label: "What's been going well?", value: q1, setter: setQ1 },
    { id: 'q2', label: 'What have you learned recently?', value: q2, setter: setQ2 },
    { id: 'q3', label: 'What next steps will expand your performance potential?', value: q3, setter: setQ3 },
  ];

  const weeklyMomentumQuestions = [
    { id: 'q1', label: 'What moved forward this week?', value: q1, setter: setQ1 },
    { id: 'q2', label: 'What did you do better this week?', value: q2, setter: setQ2 },
    { id: 'q3', label: "What's one priority for next week?", value: q3, setter: setQ3 },
  ];

  let questions = [];
  let pageTitle = '';
  if (reviewType === 'progress') {
    questions = progressQuestions;
    pageTitle = 'Progress Review';
  } else if (reviewType === 'weekly-momentum') {
    questions = weeklyMomentumQuestions;
    pageTitle = 'Weekly Momentum Review';
  } else {
    questions = afterActionQuestions;
    pageTitle = 'After-Action Review';
  }

  // Clear form when review type changes
  useEffect(() => {
    if (!isEditMode) {
      setQ1('');
      setQ2('');
      setQ3('');
      setQ4('');
      setReviewTitle('');
      setIntentionality(3);
      setCommunication(3);
      setProgress(3);
    }
  }, [reviewType, isEditMode]);

  useEffect(() => {
    if (user && isEditMode) {
      loadEntry(selectedDate);
    }
  }, [selectedDate, user, isEditMode, reviewType]);

  const loadEntry = async (date) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const entryId = location.state?.entryId;
      let query = supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id);

      if (entryId) {
        query = query.eq('id', entryId);
      } else {
        query = query.eq('entry_date', date).eq('review_type', reviewType);
      }

      const { data, error } = await query;

      if (data && data.length > 0) {
        setCurrentTitle(data[0].title || '');
        setReviewTitle(data[0].title || '');
        try {
          const parsed = JSON.parse(data[0].content);
          setQ1(parsed.q1 || '');
          setQ2(parsed.q2 || '');
          setQ3(parsed.q3 || '');
          setQ4(parsed.q4 || '');
          if (parsed.intentionality) setIntentionality(parsed.intentionality);
          if (parsed.communication) setCommunication(parsed.communication);
          if (parsed.progress) setProgress(parsed.progress);
        } catch (e) {
          setQ1('');
          setQ2('');
          setQ3('');
          setQ4('');
          setIntentionality(3);
          setCommunication(3);
          setProgress(3);
        }
      } else {
        setCurrentTitle('');
        setReviewTitle('');
        setQ1('');
        setQ2('');
        setQ3('');
        setQ4('');
      }
    } catch (err) {
      setQ1('');
      setQ2('');
      setQ3('');
      setQ4('');
    } finally {
      setIsLoading(false);
    }
  };

  const needsNaming = reviewType !== 'after-action' && !currentTitle;

  const handleSaveClick = () => {
    if (!user) {
      alert('Please log in to save reviews');
      return;
    }
    if (reviewType === 'after-action') {
      if (!reviewTitle.trim()) {
        alert('Please enter what you are reviewing');
        return;
      }
      handleSaveConfirmed(reviewTitle);
    } else if (reviewType === 'weekly-momentum') {
      // Generate date-based title for weekly momentum reviews
      const dateTitle = formatReviewDate(selectedDate);
      handleSaveConfirmed(dateTitle);
    } else if (needsNaming) {
      setShowNamingModal(true);
    } else {
      handleSaveConfirmed(currentTitle);
    }
  };

  const handleSaveConfirmed = async (reviewName) => {
    setShowNamingModal(false);
    setIsSaving(true);
    try {
      let entryContent;
      if (reviewType === 'progress') {
        entryContent = JSON.stringify({ q1, q2, q3, reviewType });
      } else if (reviewType === 'weekly-momentum') {
        entryContent = JSON.stringify({ q1, q2, q3, intentionality, communication, progress, reviewType });
      } else {
        entryContent = JSON.stringify({ q1, q2, q3, q4, reviewType });
      }

      const existingEntryId = location.state?.entryId;
      let savedEntryId = existingEntryId;

      if (existingEntryId && isEditMode) {
        // Update existing entry if editing
        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({ content: entryContent, title: reviewName, updated_at: new Date().toISOString() })
          .eq('id', existingEntryId);

        if (updateError) {
          console.error('Error updating entry:', updateError);
          throw updateError;
        }
      } else {
        // Always insert new entry (allow multiple reviews per day)
        const { data: insertedData, error: insertError } = await supabase
          .from('journal_entries')
          .insert([{
            user_id: user.id,
            entry_date: selectedDate,
            content: entryContent,
            title: reviewName,
            review_type: reviewType,
            created_at: new Date().toISOString(),
          }])
          .select();

        if (insertError) {
          console.error('Error inserting entry:', insertError);
          throw insertError;
        }

        if (!insertedData || insertedData.length === 0) {
          throw new Error('Failed to retrieve saved review ID');
        }

        savedEntryId = insertedData[0].id;
      }

      setCurrentTitle(reviewName);
      clearProgress();
      setSaved(true);
      setTimeout(() => {
        navigate('/review-summary', { state: { selectedDate, reviewType, entryId: savedEntryId } });
      }, 1000);
    } catch (error) {
      console.error('Error saving review:', error);
      alert(`Failed to save review: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const sectionStyle = { marginBottom: '28px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', borderLeft: '3px solid #F08571' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#666', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        input[type="range"] {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right, #F08571 0%, #F08571 var(--value), #e5e5e5 var(--value), #e5e5e5 100%);
          outline: none;
          cursor: pointer;
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #F08571;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #F08571;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        input[type="range"]::-moz-range-track {
          background: transparent;
          border: none;
        }
        input[type="range"]::-moz-range-progress {
          background: #F08571;
          height: 6px;
          border-radius: 3px;
        }
      `}</style>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>{pageTitle}</h1>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>
            Select date:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            style={inputStyle}
          />
        </div>

        {reviewType === 'weekly-momentum' && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '20px' }}>
              Rate your week (1-5)
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Intentionality</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={intentionality}
                  onChange={(e) => {
                    setIntentionality(parseInt(e.target.value));
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  onInput={(e) => {
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#F08571', minWidth: '30px', textAlign: 'center' }}>
                  {intentionality}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Communication</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={communication}
                  onChange={(e) => {
                    setCommunication(parseInt(e.target.value));
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  onInput={(e) => {
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#F08571', minWidth: '30px', textAlign: 'center' }}>
                  {communication}
                </span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Progress</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={progress}
                  onChange={(e) => {
                    setProgress(parseInt(e.target.value));
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  onInput={(e) => {
                    const percent = ((parseInt(e.target.value) - 1) / 4) * 100;
                    e.target.style.background = `linear-gradient(to right, #F08571 0%, #F08571 ${percent}%, #e5e5e5 ${percent}%, #e5e5e5 100%)`;
                  }}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#F08571', minWidth: '30px', textAlign: 'center' }}>
                  {progress}
                </span>
              </div>
            </div>
          </div>
        )}

        {reviewType === 'after-action' && (
          <div style={sectionStyle}>
            <label style={labelStyle}>
              What are you reviewing?
            </label>
            <input
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Type here"
              style={inputStyle}
            />
          </div>
        )}

        {questions.map((q) => {
          const textareaRef = q.id === 'q1' ? refQ1 : q.id === 'q2' ? refQ2 : q.id === 'q3' ? refQ3 : refQ4;
          return (
          <div key={q.id} style={sectionStyle}>
            <label style={labelStyle}>
              {q.label}
            </label>
            <textarea
              ref={textareaRef}
              value={q.value}
              onChange={(e) => q.setter(e.target.value)}
              disabled={isLoading}
              placeholder="Type here"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px 12px',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'none',
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? 'not-allowed' : 'text',
              }}
              onFocus={(e) => !isLoading && (e.target.style.borderColor = '#F08571')}
              onBlur={(e) => !isLoading && (e.target.style.borderColor = '#e5e5e5')}
            />
          </div>
          );
        })}

      </div>

      {/* Fixed bottom bar */}
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
      }}>
        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', position: 'absolute', left: '32px' }}>
            ✓ {pageTitle} saved
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (window.confirm(`Delete this ${pageTitle}? It will be lost forever.`)) {
                navigate('/my-reviews');
              }
            }}
            title={`Delete ${pageTitle}`}
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              color: '#F08571',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Trash2 size={18} />
          </button>

          <button
            onClick={() => {
              const hasContent = q1.trim() || q2.trim() || q3.trim() || q4.trim();
              if (hasContent) {
                if (reviewType === 'after-action') {
                  if (reviewTitle.trim()) {
                    handleSaveConfirmed(reviewTitle);
                  } else {
                    alert('Please enter what you are reviewing');
                  }
                } else if (reviewType === 'weekly-momentum') {
                  // Generate date-based title for weekly momentum reviews
                  const dateTitle = formatReviewDate(selectedDate);
                  handleSaveConfirmed(dateTitle);
                } else if (needsNaming) {
                  setShowNamingModal(true);
                } else {
                  handleSaveConfirmed(currentTitle);
                }
              }
            }}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
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
            Save as Draft
          </button>

          <button
            onClick={handleSaveClick}
            disabled={isSaving}
            style={{
              padding: '10px 20px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: '600',
              border: 'none',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              transition: 'all 0.2s',
              opacity: isSaving ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSaving) e.currentTarget.style.backgroundColor = '#e07560';
            }}
            onMouseLeave={(e) => {
              if (!isSaving) e.currentTarget.style.backgroundColor = '#F08571';
            }}
          >
            {isSaving ? 'Finishing...' : 'Finish'}
          </button>
        </div>
      </div>

      <NamingModal
        isOpen={showNamingModal}
        itemType="review"
        onConfirm={handleSaveConfirmed}
        onCancel={() => setShowNamingModal(false)}
      />

      <SavedConfirmation
        isVisible={saved}
        onDismiss={() => setSaved(false)}
      />
    </div>
  );
}
