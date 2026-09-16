import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
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
  const isGuest = location.state?.isGuest || false;
  const isEditMode = !!location.state?.selectedDate;

  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');
  const [q4, setQ4] = useState('');

  const afterActionQuestions = [
    { id: 'q1', label: 'What was supposed to happen?', value: q1, setter: setQ1 },
    { id: 'q2', label: 'What actually happened?', value: q2, setter: setQ2 },
    { id: 'q3', label: 'Why was there a difference?', value: q3, setter: setQ3 },
    { id: 'q4', label: 'What can we learn from this?', value: q4, setter: setQ4 },
  ];

  const progressQuestions = [
    { id: 'q1', label: "What's been going well?", value: q1, setter: setQ1 },
    { id: 'q2', label: 'What have you learned recently?', value: q2, setter: setQ2 },
    { id: 'q3', label: 'What next steps will expand your performance potential?', value: q3, setter: setQ3 },
  ];

  const questions = reviewType === 'progress' ? progressQuestions : afterActionQuestions;
  const pageTitle = reviewType === 'progress' ? 'Progress Review' : 'After Action Review';

  useEffect(() => {
    if (user && !isGuest && isEditMode) {
      loadEntry(selectedDate);
    }
  }, [selectedDate, user, isGuest, isEditMode]);

  const loadEntry = async (date) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('entry_date', date);

      if (data && data.length > 0) {
        try {
          const parsed = JSON.parse(data[0].content);
          setQ1(parsed.q1 || '');
          setQ2(parsed.q2 || '');
          setQ3(parsed.q3 || '');
          setQ4(parsed.q4 || '');
        } catch (e) {
          setQ1('');
          setQ2('');
          setQ3('');
          setQ4('');
        }
      } else {
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

  const handleSave = async () => {
    if (!user || isGuest) {
      alert('Please log in to save reviews');
      return;
    }

    setIsSaving(true);
    try {
      const entryContent = reviewType === 'progress'
        ? JSON.stringify({ q1, q2, q3, reviewType })
        : JSON.stringify({ q1, q2, q3, q4, reviewType });

      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', user.id)
        .eq('entry_date', selectedDate)
        .eq('review_type', reviewType)
        .single();

      if (existing) {
        await supabase
          .from('journal_entries')
          .update({ content: entryContent, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('journal_entries')
          .insert([{
            user_id: user.id,
            entry_date: selectedDate,
            content: entryContent,
            review_type: reviewType,
            created_at: new Date().toISOString(),
          }]);
      }

      setSaved(true);
      setTimeout(() => {
        navigate('/my-reviews', { state: { isGuest } });
      }, 1000);
    } catch (error) {
      console.error('Error saving review:', error);
      alert('Failed to save review');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>{pageTitle}</h1>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: '500' }}>
              Select date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={{
                padding: '10px 12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            />
          </div>

          <p style={{ fontSize: '13px', color: '#999', marginBottom: '24px' }}>
            {formatDate(selectedDate)}
          </p>
        </div>

        <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {questions.map((q) => (
            <div key={q.id}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                {q.label}
              </label>
              <textarea
                value={q.value}
                onChange={(e) => q.setter(e.target.value)}
                disabled={isLoading}
                placeholder={`Answer: ${q.label.toLowerCase()}`}
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '12px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  boxSizing: 'border-box',
                  outline: 'none',
                  resize: 'vertical',
                  opacity: isLoading ? 0.6 : 1,
                  cursor: isLoading ? 'not-allowed' : 'text',
                }}
                onFocus={(e) => !isLoading && (e.target.style.borderColor = '#F08571')}
                onBlur={(e) => !isLoading && (e.target.style.borderColor = '#e5e5e5')}
              />
            </div>
          ))}
        </div>

        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            ✓ {pageTitle} saved
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSave}
            disabled={isSaving || isGuest}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: isGuest ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !isGuest && !isSaving && (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !isGuest && !isSaving && (e.target.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : `Save ${pageTitle}`}
          </button>

          <button
            onClick={() => {
              if (window.confirm(`Delete this ${pageTitle}? It will be lost forever.`)) {
                navigate('/my-reviews', { state: { isGuest } });
              }
            }}
            title={`Delete ${pageTitle}`}
            style={{
              padding: '8px',
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
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            <Trash2 size={18} />
          </button>

          <button
            onClick={() => {
              const hasContent = q1.trim() || q2.trim() || q3.trim() || q4.trim();
              if (hasContent) {
                const choice = window.confirm(`Save this ${pageTitle} first?\n\nOK = Save\nCancel = Discard and view reviews`);
                if (choice) {
                  handleSave().then(() => {
                    navigate('/my-reviews', { state: { isGuest } });
                  });
                } else {
                  navigate('/my-reviews', { state: { isGuest } });
                }
              } else {
                navigate('/my-reviews', { state: { isGuest } });
              }
            }}
            style={{
              padding: '14px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Reviews
          </button>
        </div>
      </div>
    </div>
  );
}
