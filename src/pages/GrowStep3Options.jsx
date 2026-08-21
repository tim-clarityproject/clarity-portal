import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import HomeHeader from '../components/HomeHeader';

export default function GrowStep3Options() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const [options, setOptions] = useState(location.state?.options || ['', '']);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    if (location.state?.options) {
      setOptions(location.state.options);
      updateFormData('options', location.state.options);
    }
  }, [location.state?.options, updateFormData]);

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
  };

  const handleNext = () => {
    const filledOptions = options.filter(option => option.trim());
    if (filledOptions.length >= 1) {
      updateFormData('options', filledOptions);
      navigate('/grow-step-4', {
        state: {
          ...location.state,
          ...formData,
          options: filledOptions,
          isGuest,
          decisionId: location.state?.decisionId
        }
      });
    }
  };

  const filledCount = options.filter(option => option.trim()).length;
  const canSubmit = filledCount >= 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/grow-step-2', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <BackArrow />
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>What options do you have?</h1>
        </div>

        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Step 3 of 4</p>

        <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {options.map((option, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
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
              {options.length > 2 && (
                <button
                  onClick={() => handleRemoveOption(index)}
                  title="Remove option"
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
          onClick={handleAddOption}
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
          + Add Option
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
            onClick={() => navigate('/grow-step-2', { state: { ...formData, isGuest, decisionId: location.state?.decisionId } })}
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
