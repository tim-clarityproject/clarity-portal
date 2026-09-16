import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep2Fuckups() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const isFreshStart = !location.state?.decisionId && !location.state?.goal;
  const [fuckups, setFuckups] = useState(() => isFreshStart ? ['', ''] : (location.state?.fuckups || getFieldValue('fuckups') || ['', '']));
  const isGuest = location.state?.isGuest || false;

  // Clear fuckups only on true fresh start
  useEffect(() => {
    if (isFreshStart) {
      setFuckups(['', '']);
      updateFormData('fuckups', ['', '']);
      localStorage.removeItem('clarity_form_data');
    }
  }, [isFreshStart, updateFormData]);

  useEffect(() => {
    if (location.state?.fuckups) {
      setFuckups(location.state.fuckups);
      updateFormData('fuckups', location.state.fuckups);
    }
  }, [location.state?.fuckups, updateFormData]);

  const handleFuckupChange = (index, value) => {
    const newFuckups = [...fuckups];
    newFuckups[index] = value;
    setFuckups(newFuckups);
    updateFormData('fuckups', newFuckups);
  };

  const handleAddFuckup = () => {
    const newFuckups = [...fuckups, ''];
    setFuckups(newFuckups);
    updateFormData('fuckups', newFuckups);
  };

  const handleRemoveFuckup = (index) => {
    const newFuckups = fuckups.filter((_, i) => i !== index);
    setFuckups(newFuckups);
    updateFormData('fuckups', newFuckups);
  };

  const handleNext = () => {
    const filledFuckups = fuckups.filter(f => f.trim());
    if (filledFuckups.length >= 1) {
      updateFormData('fuckups', filledFuckups);
      navigate('/inversion-step-3', {
        state: {
          ...location.state,
          ...formData,
          fuckups: filledFuckups,
          isGuest,
          decisionId: location.state?.decisionId
        }
      });
    }
  };

  const filledCount = fuckups.filter(f => f.trim()).length;
  const canSubmit = filledCount >= 1;

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
                placeholder={`What could go wrong ${index + 1}`}
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
            e.target.style.backgroundColor = '#FEE5DE';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#e5e5e5';
            e.target.style.backgroundColor = 'transparent';
          }}
        >
          + Add
        </button>

        <SaveDiscardButtons
          formData={{ fuckups }}
          pageType="decision"
          toolType="inversion"
          onNext={handleNext}
          canNext={canSubmit}
          onBack={() => navigate('/inversion-step-1', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
        />
      </div>
    </div>
  );
}
