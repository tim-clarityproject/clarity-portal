import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep3Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [plan, setPlan] = useState(() => location.state?.plan || '');
  const [isSaving, setIsSaving] = useState(false);
  const isGuest = location.state?.isGuest || false;
  const fuckups = location.state?.fuckups || [];

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

  const handleSave = async () => {
    if (!plan.trim() || !goal.trim()) return;

    if (isGuest) {
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

      if (location.state?.decisionId) {
        const { error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
            status: 'completed',
            draft: false
          })
          .eq('id', location.state.decisionId);
        if (error) throw error;
      } else {
        const title = location.state?.problemTitle || new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        const { error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'inversion',
            title,
            form_data: formDataComplete,
            status: 'completed',
            draft: false
          }]);
        if (error) throw error;
      }

      clearProgress();
      navigate('/decision-history', { state: { isGuest } });
    } catch (error) {
      console.error('Error saving decision:', error);
      console.error('Error details:', error.message);
      alert(`Failed to save decision: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
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
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>
        {location.state?.problemTitle && (
          <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {location.state.problemTitle}
          </p>
        )}
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
              resize: 'vertical',
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
            placeholder="What will you do to address these potential problems?"
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
            }}
            onFocus={(e) => e.target.style.borderColor = '#F08571'}
            onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        <SaveDiscardButtons
          formData={{ plan }}
          pageType="decision"
          toolType="inversion"
          onNext={handleSave}
          canNext={plan.trim() && goal.trim() && !isSaving && !isGuest}
          onBack={() => navigate('/inversion-step-2', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
          nextLabel={isSaving ? 'Saving...' : 'Finish'}
        />
      </div>
    </div>
  );
}
