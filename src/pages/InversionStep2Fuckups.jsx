import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function InversionStep2Fuckups() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const [fuckups, setFuckups] = useState(location.state?.fuckups || ['', '']);
  const isGuest = location.state?.isGuest || false;

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
  };

  const handleAddFuckup = () => {
    setFuckups([...fuckups, '']);
  };

  const handleRemoveFuckup = (index) => {
    const newFuckups = fuckups.filter((_, i) => i !== index);
    setFuckups(newFuckups);
  };

  const handleNext = () => {
    const filledFuckups = fuckups.filter(f => f.trim());
    if (filledFuckups.length >= 1) {
      updateFormData('fuckups', filledFuckups);
      navigate('/inversion-step-3', {
        state: {
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
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/inversion-step-1', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>List all the ways you could fuck this up</h1>
        </div>

        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Step 2 of 3</p>

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
                    color: '#d32f2f',
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

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleNext}
            disabled={!canSubmit}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: !canSubmit ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: !canSubmit ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !canSubmit || (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !canSubmit || (e.target.style.backgroundColor = '#F08571')}
          >
            Next
          </button>

          <button
            onClick={() => navigate('/inversion-step-1', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
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
      </div>
    </div>
  );
}
