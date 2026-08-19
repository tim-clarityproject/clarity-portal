import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function MyJournal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [selectedDate, setSelectedDate] = useState(location.state?.selectedDate || new Date().toISOString().split('T')[0]);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isGuest = location.state?.isGuest || false;
  const isEditMode = !!location.state?.selectedDate;

  const question = "What are you grateful for today? What progress did you make?";

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
        setContent(data[0].content);
      } else {
        setContent('');
      }
    } catch (err) {
      setContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || isGuest) {
      alert('Please log in to save journal entries');
      return;
    }

    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', user.id)
        .eq('entry_date', selectedDate)
        .single();

      if (existing) {
        await supabase
          .from('journal_entries')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('journal_entries')
          .insert([{
            user_id: user.id,
            entry_date: selectedDate,
            content,
            created_at: new Date().toISOString(),
          }]);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving journal entry:', error);
      alert('Failed to save entry');
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
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/welcome', { state: { isGuest } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>My Journal</h1>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '24px' }}>
            {question}
          </h2>

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

        <div style={{ marginBottom: '32px' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading}
            placeholder="Write your reflection here..."
            style={{
              width: '100%',
              minHeight: '300px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '14px',
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

        {saved && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            ✓ Entry saved
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
            {isSaving ? 'Saving...' : 'Save Entry'}
          </button>

          <button
            onClick={() => {
              if (window.confirm('Discard this entry? It will be lost forever.')) {
                setContent('');
              }
            }}
            title="Discard entry"
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              color: '#d32f2f',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#d32f2f';
              e.target.style.backgroundColor = '#ffebee';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            🗑️
          </button>

          <button
            onClick={() => {
              if (content.trim()) {
                const choice = window.confirm('Save this as a draft first?\n\nOK = Save draft\nCancel = Discard and view history');
                if (choice) {
                  handleSave().then(() => {
                    navigate('/journal-history', { state: { isGuest } });
                  });
                } else {
                  navigate('/journal-history', { state: { isGuest } });
                }
              } else {
                navigate('/journal-history', { state: { isGuest } });
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
            View History
          </button>
        </div>
      </div>
    </div>
  );
}
