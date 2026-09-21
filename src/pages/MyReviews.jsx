import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Edit } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateWithOrdinal } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';

export default function MyReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (user && !isGuest) {
      loadEntries();
    }
  }, [user, isGuest]);

  const loadEntries = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        setEntries(data);
      }
    } catch (error) {
      console.error('Error loading journal entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const handleDelete = async (entryId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this entry?')) return;

    try {
      await supabase
        .from('journal_entries')
        .delete()
        .eq('id', entryId);
      setEntries(entries.filter(e => e.id !== entryId));
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry');
    }
  };

  const truncateContent = (content, length = 100) => {
    return content.length > length ? content.substring(0, length) + '...' : content;
  };

  const getEntryPreview = (content) => {
    try {
      const parsed = JSON.parse(content);
      const answers = [parsed.q1, parsed.q2, parsed.q3, parsed.q4].filter(a => a && a.trim());
      return truncateContent(answers.join(' '));
    } catch (e) {
      return truncateContent(content);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '24px' }}>My Reviews</h1>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
          <button
            onClick={() => setFilterType('all')}
            style={{
              padding: '8px 16px',
              backgroundColor: filterType === 'all' ? '#F08571' : 'transparent',
              color: filterType === 'all' ? 'white' : '#333',
              border: `2px solid ${filterType === 'all' ? '#F08571' : '#e5e5e5'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'all') {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#FEE5DE';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'all') {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }
            }}
          >
            All Reviews
          </button>
          <button
            onClick={() => setFilterType('weekly-momentum')}
            style={{
              padding: '8px 16px',
              backgroundColor: filterType === 'weekly-momentum' ? '#F08571' : 'transparent',
              color: filterType === 'weekly-momentum' ? 'white' : '#333',
              border: `2px solid ${filterType === 'weekly-momentum' ? '#F08571' : '#e5e5e5'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'weekly-momentum') {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#FEE5DE';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'weekly-momentum') {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }
            }}
          >
            Weekly Momentum Reviews
          </button>
          <button
            onClick={() => setFilterType('after-action')}
            style={{
              padding: '8px 16px',
              backgroundColor: filterType === 'after-action' ? '#F08571' : 'transparent',
              color: filterType === 'after-action' ? 'white' : '#333',
              border: `2px solid ${filterType === 'after-action' ? '#F08571' : '#e5e5e5'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'after-action') {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#FEE5DE';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'after-action') {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }
            }}
          >
            After-Action Reviews
          </button>
          <button
            onClick={() => setFilterType('progress')}
            style={{
              padding: '8px 16px',
              backgroundColor: filterType === 'progress' ? '#F08571' : 'transparent',
              color: filterType === 'progress' ? 'white' : '#333',
              border: `2px solid ${filterType === 'progress' ? '#F08571' : '#e5e5e5'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'progress') {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#FEE5DE';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'progress') {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }
            }}
          >
            Progress Reviews
          </button>
        </div>

        {isLoading ? (
          <p style={{ color: '#999', fontSize: '14px', textAlign: 'center' }}>Loading...</p>
        ) : entries.filter(e => filterType === 'all' || e.review_type === filterType).length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '48px', paddingBottom: '120px' }}>
            <p style={{ color: '#999', fontSize: '14px' }}>No reviews yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {entries.filter(e => filterType === 'all' || e.review_type === filterType).map((entry) => (
              <button
                key={entry.id}
                onClick={() => navigate('/review-summary', { state: { isGuest, selectedDate: entry.entry_date, reviewType: entry.review_type } })}
                style={{
                  padding: '16px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '70px',
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', width: '100%' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
                      {entry.title || (entry.review_type === 'after-action' ? 'After-Action Review' : entry.review_type === 'progress' ? 'Progress Review' : 'Weekly Momentum Review')}
                    </p>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'white',
                        backgroundColor: '#F08571',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.review_type === 'after-action' ? 'After-Action Review' : 'Progress Review'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '34px' }}>
                    <p style={{ fontSize: '13px', color: '#999', margin: 0, whiteSpace: 'nowrap', lineHeight: '34px' }}>
                      {formatDateWithOrdinal(entry.entry_date)} {formatTime(entry.created_at)}
                    </p>
                    <button
                      onClick={() => navigate('/my-journal', { state: { isGuest, selectedDate: entry.entry_date, reviewType: entry.review_type, entryId: entry.id } })}
                      title="Edit review"
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
                        height: '34px',
                        width: '34px',
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(entry.id, e)}
                      title="Delete entry"
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
                        height: '34px',
                        width: '34px',
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom bar for creating new reviews - always visible */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fafafa',
        borderTop: '1px solid #e5e5e5',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'center',
        gap: '12px',
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate('/my-journal', { state: { isGuest, reviewType: 'weekly-momentum' } })}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
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
          + Weekly Momentum Review
        </button>
        <button
          onClick={() => navigate('/my-journal', { state: { isGuest, reviewType: 'after-action' } })}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
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
          + After-Action Review
        </button>
        <button
          onClick={() => navigate('/my-journal', { state: { isGuest, reviewType: 'progress' } })}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            color: '#333',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
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
          + Progress Review
        </button>
      </div>
    </div>
  );
}
