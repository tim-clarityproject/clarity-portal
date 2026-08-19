import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep3Plan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [goal, setGoal] = useState(location.state?.goal || '');
  const [plan, setPlan] = useState(location.state?.plan || '');
  const [isSaving, setIsSaving] = useState(false);
  const isGuest = location.state?.isGuest || false;
  const fuckups = location.state?.fuckups || [];

  const handleSave = async () => {
    if (!plan.trim() || !goal.trim()) return;

    if (isGuest) {
      alert('Please log in to save decisions');
      return;
    }

    setIsSaving(true);
    try {
      const decisionData = {
        goal,
        fuckups,
        plan,
      };

      if (location.state?.decisionId) {
        await supabase
          .from('decisions')
          .update(decisionData)
          .eq('id', location.state.decisionId);
      } else {
        await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'inversion',
            ...decisionData
          }]);
      }

      navigate('/decision-tools', { state: { isGuest } });
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
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/inversion-step-2', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>So what will you do?</h1>
        </div>

        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Step 3 of 3</p>

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

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSave}
            disabled={!plan.trim() || !goal.trim() || isSaving || isGuest}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: (!plan.trim() || !goal.trim() || isSaving || isGuest) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!plan.trim() || !goal.trim() || isSaving || isGuest) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!plan.trim() || !goal.trim() || isSaving || isGuest) || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!plan.trim() || !goal.trim() || isSaving || isGuest) || (e.target.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Save Decision'}
          </button>

          <button
            onClick={() => navigate('/inversion-step-2', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
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
            Back
          </button>

          <button
            onClick={() => navigate('/decision-tools', { state: { isGuest } })}
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
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
