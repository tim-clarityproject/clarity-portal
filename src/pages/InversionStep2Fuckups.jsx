import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep2Fuckups() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [fuckups, setFuckups] = useState(location.state?.fuckups || ['', '']);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleFuckupChange = (index, value) => {
    const newFuckups = [...fuckups];
    newFuckups[index] = value;
    setFuckups(newFuckups);
  };

  const handleAddFuckup = () => {
    setFuckups([...fuckups, '']);
  };

  const handleRemoveFuckup = (index) => {
    const newFuckups = fuckups.filter((_, i) => i !== index);
    setFuckups(newFuckups);
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const filledFuckups = fuckups.filter(f => f.trim());
      if (filledFuckups.length < 1) {
        alert('Please list at least one potential failure');
        setIsSaving(false);
        return;
      }

      const formData = { goal: location.state?.goal || '', fuckups: filledFuckups, plan: location.state?.plan || '' };
      let savedId = decisionId;
      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = location.state?.problemTitle || dateTitle;

      if (decisionId) {
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update - no rows affected');
        savedId = data[0].id;
      } else {
        const { data, error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'inversion',
            title,
            form_data: formData,
            status: 'completed',
          })
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to create - no rows returned');
        savedId = data[0].id;
      }

      setIsSaved(true);
      clearProgress();
      setTimeout(() => {
        navigate('/inversion-step-3', { state: { decisionId: savedId, goal: location.state?.goal, fuckups: filledFuckups, problemTitle: title } });
      }, 500);
    } catch (error) {
      console.error('Error saving:', error);
      alert(`Failed to save: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { goal: location.state?.goal || '', fuckups, plan: location.state?.plan || '' };
      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = location.state?.problemTitle || dateTitle;

      if (decisionId) {
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formData,
            status: 'draft',
            draft: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update draft - no rows affected');
      } else {
        const { data, error } = await supabase
          .from('decisions')
          .insert({
            user_id: user.id,
            tool_type: 'inversion',
            title,
            form_data: formData,
            status: 'draft',
            draft: true,
          })
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to save draft - no rows returned');
      }

      setIsSaved(true);
      clearProgress();
      alert('Saved as draft');
      navigate('/decision-history');
    } catch (error) {
      console.error('Error saving draft:', error);
      alert(`Failed to save draft: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate('/inversion-step-1', { state: { decisionId, goal: location.state?.goal, problemTitle: location.state?.problemTitle } });
  };

  const handleDelete = () => {
    if (window.confirm('Discard this entry?')) {
      setFuckups(['', '']);
      clearProgress();
      navigate('/decision-tools');
    }
  };

  const filledCount = fuckups.filter(f => f.trim()).length;
  const canSubmit = filledCount >= 1;

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>List all the ways you could fuck this up</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '66.67%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {fuckups.map((fuckup, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <input
                type="text"
                value={fuckup}
                onChange={(e) => handleFuckupChange(index, e.target.value)}
                placeholder="Type here"
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
              {fuckups.length > 2 && (
                <button
                  onClick={() => handleRemoveFuckup(index)}
                  title="Remove"
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
                    marginTop: '2px',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleAddFuckup}
          style={{
            padding: '12px 24px',
            backgroundColor: 'transparent',
            border: '2px solid #e5e5e5',
            borderRadius: '8px',
            color: '#333',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            marginBottom: '32px',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = '#F08571';
            e.target.style.backgroundColor = '#f9f9f9';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#e5e5e5';
            e.target.style.backgroundColor = 'transparent';
          }}
        >
          + Add
        </button>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', marginTop: '32px', flexWrap: 'wrap' }}>
          <button
            onClick={handleBack}
            style={{
              padding: '12px 24px',
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
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Back
          </button>

          <button
            onClick={handleDelete}
            title="Delete this entry"
            style={{
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#F08571',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ×
          </button>

          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              color: '#F08571',
              fontWeight: '600',
              border: '2px solid #F08571',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
              opacity: isSaving ? 0.7 : 1,
            }}
            onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#f9f9f9')}
            onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Save as Draft
          </button>

          <button
            onClick={handleSave}
            disabled={!canSubmit || isSaving}
            style={{
              padding: '12px 24px',
              backgroundColor: (!canSubmit || isSaving) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!canSubmit || isSaving) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!canSubmit || isSaving) || (e.currentTarget.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!canSubmit || isSaving) || (e.currentTarget.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
