import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep1Goal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [goal, setGoal] = useState(location.state?.goal || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (decisionId && user) {
      loadDecision();
    }
  }, [decisionId, user]);

  const loadDecision = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();

      if (data && data.form_data) {
        const formData = data.form_data;
        setGoal(formData.goal || data.title || '');
      }
    } catch (error) {
      console.error('Error loading decision:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { goal, fuckups: location.state?.fuckups || [], plan: location.state?.plan || '' };
      let savedId = decisionId;
      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = location.state?.problemTitle || dateTitle;

      if (decisionId) {
        console.log('[InversionStep1] Updating with decisionId:', decisionId);
        const { data, error } = await supabase
          .from('decisions')
          .update({
            title,
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        if (error) {
          console.error('[InversionStep1] Update error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.error('[InversionStep1] SILENT FAILURE: UPDATE returned 0 rows');
          throw new Error('Failed to update inversion - no rows affected');
        }

        savedId = data[0].id;
      } else {
        console.log('[InversionStep1] Creating new inversion');
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

        if (error) {
          console.error('[InversionStep1] Insert error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.error('[InversionStep1] SILENT FAILURE: INSERT returned 0 rows');
          throw new Error('Failed to create inversion - no rows returned');
        }

        savedId = data[0].id;
      }

      setIsSaved(true);
      clearProgress();
      setTimeout(() => {
        navigate('/inversion-step-2', { state: { decisionId: savedId, goal, problemTitle: title } });
      }, 500);
    } catch (error) {
      console.error('Error saving inversion:', error);
      alert(`Failed to save: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const formData = { goal, fuckups: location.state?.fuckups || [], plan: location.state?.plan || '' };
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

        if (error) {
          console.error('[InversionStep1] Draft update error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          throw new Error('Failed to update draft - no rows affected');
        }
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

        if (error) {
          console.error('[InversionStep1] Draft insert error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          throw new Error('Failed to save draft - no rows returned');
        }
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

  const handleDelete = () => {
    if (window.confirm('Discard this entry?')) {
      setGoal('');
      clearProgress();
      navigate('/decision-tools');
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '120px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
              What's your goal?
            </h1>
          </div>
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
              flexShrink: 0,
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

        <div style={{ marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '24px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '33.33%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>

          {isLoading && <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>Loading decision...</p>}

          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Type here"
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
              resize: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', marginTop: '24px' }}>
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
              display: 'flex',
              alignItems: 'center',
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
            disabled={!goal.trim() || isSaving}
            style={{
              padding: '12px 24px',
              backgroundColor: (!goal.trim() || isSaving) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!goal.trim() || isSaving) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!goal.trim() || isSaving) || (e.currentTarget.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!goal.trim() || isSaving) || (e.currentTarget.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
