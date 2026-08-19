import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep4WillDo() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const { user } = useContext(AuthContext);
  const [willDo, setWillDo] = useState(location.state?.will_do || '');
  const [isSaving, setIsSaving] = useState(false);
  const isGuest = location.state?.isGuest || false;

  const handleSave = async () => {
    if (!willDo.trim()) return;

    if (isGuest) {
      alert('Please log in to save decisions');
      return;
    }

    setIsSaving(true);
    try {
      const decisionData = {
        goal: location.state?.goal,
        constraints: location.state?.constraints,
        opportunities: location.state?.opportunities,
        options: location.state?.options || [],
        will_do: willDo,
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
            tool_type: 'grow',
            ...decisionData
          }]);
      }

      navigate('/decisions-log', { state: { isGuest } });
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
            onClick={() => navigate('/grow-step-3', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>What will I do?</h1>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', color: '#999', marginBottom: '24px' }}>Step 4 of 4</p>

          <textarea
            value={willDo}
            onChange={(e) => setWillDo(e.target.value)}
            placeholder="What are you committing to do?"
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
            disabled={!willDo.trim() || isSaving || isGuest}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: (!willDo.trim() || isSaving || isGuest) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!willDo.trim() || isSaving || isGuest) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!willDo.trim() || isSaving || isGuest) || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!willDo.trim() || isSaving || isGuest) || (e.target.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Save Decision'}
          </button>

          <button
            onClick={() => navigate('/grow-step-3', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
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
            onClick={() => navigate('/decisions-log', { state: { isGuest } })}
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
