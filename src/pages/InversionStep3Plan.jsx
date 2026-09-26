import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import NamingModal from '../components/NamingModal';
import SavedConfirmation from '../components/SavedConfirmation';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep3Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const decisionId = location.state?.decisionId;

  const [goal, setGoal] = useState(location.state?.goal || '');
  const [plan, setPlan] = useState(location.state?.plan || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(location.state?.problemTitle || '');
  const fuckups = location.state?.fuckups || [];

  const needsNaming = !currentTitle || currentTitle.match(/^\w{3},\s\w{3}\s\d{1,2},\s\d{4}$/);

  const handleSaveClick = () => {
    if (!plan.trim() || !goal.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    if (!user) {
      alert('Please log in to save decisions');
      return;
    }

    if (needsNaming) {
      setShowNamingModal(true);
    } else {
      handleSaveConfirmed(currentTitle);
    }
  };

  const handleSaveConfirmed = async (decisionName) => {
    setShowNamingModal(false);
    setIsSaving(true);
    try {
      const formDataComplete = {
        goal,
        fuckups,
        plan,
      };

      let finalDecisionId = decisionId;

      if (decisionId) {
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
            title: decisionName,
            status: 'completed',
            draft: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to update - no rows affected');
      } else {
        const { data, error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'inversion',
            title: decisionName,
            form_data: formDataComplete,
            status: 'completed',
            draft: false
          }])
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to save - no rows returned');
        finalDecisionId = data[0].id;
      }

      setCurrentTitle(decisionName);
      clearProgress();
      setSaved(true);
      setTimeout(() => {
        navigate('/inversion-thinking-summary', { state: { decisionId: finalDecisionId } });
      }, 1500);
    } catch (error) {
      console.error('Error saving decision:', error);
      alert(`Failed to save: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user) {
      alert('Please log in to save decisions');
      return;
    }

    setIsSaving(true);
    try {
      const formDataComplete = {
        goal,
        fuckups,
        plan,
      };

      const dateTitle = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const title = currentTitle || dateTitle;

      if (decisionId) {
        const { data, error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
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
          .insert([{
            user_id: user.id,
            tool_type: 'inversion',
            title,
            form_data: formDataComplete,
            status: 'draft',
            draft: true
          }])
          .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Failed to save draft - no rows returned');
      }

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
    navigate('/inversion-step-2', { state: { decisionId, goal, fuckups, problemTitle: currentTitle } });
  };

  const handleDelete = () => {
    if (window.confirm('Discard this entry?')) {
      setGoal('');
      setPlan('');
      clearProgress();
      navigate('/decision-tools');
    }
  };

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
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>So what will you do?</h1>

        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '100%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
        </div>

        {/* Goal Section */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            Goal (you can revise)
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              boxSizing: 'border-box',
              outline: 'none',
              resize: 'none',
              marginBottom: '24px',
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        {/* Fuckups Section */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            Ways this could go wrong
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {fuckups.map((fuckup, index) => (
              <div
                key={index}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#666',
                }}
              >
                {fuckup}
              </div>
            ))}
          </div>
        </div>

        {/* Plan Section */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            Your plan to mitigate these risks
          </label>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
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
            onClick={handleSaveClick}
            disabled={!(plan.trim() && goal.trim()) || isSaving}
            style={{
              padding: '12px 24px',
              backgroundColor: (!(plan.trim() && goal.trim()) || isSaving) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!(plan.trim() && goal.trim()) || isSaving) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!(plan.trim() && goal.trim()) || isSaving) || (e.currentTarget.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!(plan.trim() && goal.trim()) || isSaving) || (e.currentTarget.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Finish'}
          </button>
        </div>

        <NamingModal
          isOpen={showNamingModal}
          itemType="decision"
          onConfirm={handleSaveConfirmed}
          onCancel={() => setShowNamingModal(false)}
        />
      </div>

      <SavedConfirmation
        isVisible={saved}
        onDismiss={() => setSaved(false)}
      />
    </div>
  );
}
