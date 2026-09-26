import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import NamingModal from '../components/NamingModal';
import SavedConfirmation from '../components/SavedConfirmation';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep3Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [plan, setPlan] = useState(() => location.state?.plan || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(location.state?.title || '');
  const fuckups = location.state?.fuckups || [];

  useLoadDecision(updateFormData);

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.fuckups) {
      setGoal('');
      setPlan('');
      updateFormData('goal', '');
      updateFormData('plan', '');
      localStorage.removeItem('clarity_form_data');
    }
  }, []);

  useEffect(() => {
    if (location.state?.goal) {
      setGoal(location.state.goal);
      updateFormData('goal', location.state.goal);
    }
    if (location.state?.plan) {
      setPlan(location.state.plan);
      updateFormData('plan', location.state.plan);
    }
  }, [location.state?.goal, location.state?.plan, updateFormData]);

  const needsNaming = !currentTitle || currentTitle.match(/^\w{3},\s\w{3}\s\d{1,2},\s\d{4}$/);

  const handleSaveClick = (newDecisionId) => {
    if (!plan.trim() || !goal.trim()) return;

    if (false) {
      alert('Please log in to save decisions');
      return;
    }

    // Store the newDecisionId if provided (from SaveDiscardButtons auto-save)
    if (newDecisionId) {
      location.state.decisionId = newDecisionId;
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

      let decisionId = location.state?.decisionId;

      if (decisionId) {
        const { error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
            title: decisionName,
            status: 'completed',
            draft: false
          })
          .eq('id', decisionId);
        if (error) throw error;
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
        if (data && data.length > 0) {
          decisionId = data[0].id;
        }
      }

      setCurrentTitle(decisionName);
      clearProgress();
      setSaved(true);
      setTimeout(() => {
        navigate('/inversion-thinking-summary', { state: { decisionId } });
      }, 1500);
    } catch (error) {
      console.error('Error saving decision:', error);
      console.error('Error details:', error.message);
      alert(`Failed to save decision: ${error.message}`);
    } finally {
      setIsSaving(false);
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

        <SaveDiscardButtons
          formData={{ plan }}
          pageType="decision"
          toolType="inversion"
          onNext={handleSaveClick}
          canNext={plan.trim() && goal.trim() && !isSaving}
          onBack={() => navigate('/inversion-step-2', { state: { ...formData, decisionId: location.state?.decisionId } })}
          nextLabel={isSaving ? 'Saving...' : 'Finish'}
        />

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
