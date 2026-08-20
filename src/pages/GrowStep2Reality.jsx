import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep2Reality() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const [constraints, setConstraints] = useState(location.state?.constraints || '');
  const [opportunities, setOpportunities] = useState(location.state?.opportunities || '');
  const isGuest = location.state?.isGuest || false;

  const handleNext = () => {
    if (constraints.trim() || opportunities.trim()) {
      updateFormData('constraints', constraints);
      updateFormData('opportunities', opportunities);
      navigate('/grow-step-3', {
        state: {
          ...formData,
          constraints,
          opportunities,
          isGuest,
          decisionId: location.state?.decisionId
        }
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/grow-step-1', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>What's your reality?</h1>
        </div>

        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Step 2 of 4</p>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            What are your constraints?
          </label>
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="What limitations or obstacles exist?"
            style={{
              width: '100%',
              minHeight: '150px',
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

          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
            What opportunities do you have?
          </label>
          <textarea
            value={opportunities}
            onChange={(e) => setOpportunities(e.target.value)}
            placeholder="What advantages or resources are available?"
            style={{
              width: '100%',
              minHeight: '150px',
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
            onClick={handleNext}
            disabled={!constraints.trim() && !opportunities.trim()}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: (!constraints.trim() && !opportunities.trim()) ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: (!constraints.trim() && !opportunities.trim()) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (!constraints.trim() && !opportunities.trim()) || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => (!constraints.trim() && !opportunities.trim()) || (e.target.style.backgroundColor = '#F08571')}
          >
            Next
          </button>

          <button
            onClick={() => navigate('/grow-step-1', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
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
        </div>

        <SaveDiscardButtons formData={{ constraints, opportunities }} pageType="decision" toolType="grow" />
      </div>
    </div>
  );
}
