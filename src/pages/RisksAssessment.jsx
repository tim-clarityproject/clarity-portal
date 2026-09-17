import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

import HomeHeader from '../components/HomeHeader';

export default function RisksAssessment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [risks, setRisks] = useState(() => location.state?.risks || ['', '', '']);

  const path = location.state?.path || 'personal';
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    // Sync risks from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.risks && location.state.risks.length > 0) {
      setRisks(location.state.risks);
      updateFormData('risks', location.state.risks);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear risks and localStorage
      setRisks(['', '', '']);
      updateFormData('risks', ['', '', '']);
      localStorage.removeItem('clarity_form_data');
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.goal]);

  const handleRiskChange = (index, value) => {
    const newRisks = [...risks];
    newRisks[index] = value;
    setRisks(newRisks);
    updateFormData('risks', newRisks);
  };

  const handleAddRisk = () => {
    const newRisks = [...risks, ''];
    setRisks(newRisks);
    updateFormData('risks', newRisks);
  };

  const handleRemoveRisk = (index) => {
    const newRisks = risks.filter((_, i) => i !== index);
    setRisks(newRisks);
    updateFormData('risks', newRisks);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filledRisks = risks.filter(risk => risk.trim());
    if (filledRisks.length >= 1) {
      updateFormData('risks', filledRisks);
      const nextPage = path === 'team' ? '/critical-success-factors' : '/strategies';
      navigate(nextPage, { state: { ...location.state, risks: filledRisks, path, isGuest } });
    }
  };

  const filledCount = risks.filter(risk => risk.trim()).length;
  const canSubmit = filledCount >= 1;

  const getNumberColor = (index) => {
    if (index === 0) return '#F08571';
    if (index === 1) return '#5ECCC0';
    return '#666';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          {location.state?.problemTitle && (
            <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {location.state.problemTitle}
            </p>
          )}
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '24px' }}>
            If you wanted to make sure you failed, what would you do?
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '50%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', flex: 1, maxWidth: '512px', margin: '0 auto 24px', width: '100%' }}>
            {risks.map((risk, index) => (
              <div key={index} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', height: '48px' }}>
                <span
                  style={{
                    color: '#F08571',
                    fontWeight: 'bold',
                    fontSize: '20px',
                    minWidth: '24px',
                  }}
                >
                  {index + 1}.
                </span>
                <input
                  type="text"
                  value={risk}
                  onChange={(e) => handleRiskChange(index, e.target.value)}
                  placeholder="Type here"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '2px solid #e5e5e5',
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#F08571'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
                />
                {index >= 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRisk(index)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#F08571',
                      padding: '4px',
                    }}
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddRisk}
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
            + Add another
          </button>
        </form>

        <SaveDiscardButtons
          formData={{ risks }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={handleSubmit}
          canNext={canSubmit}
          onBack={() => navigate('/goal-setting', { state: { ...location.state, path, isGuest } })}
        />
      </div>
    </div>
  );
}
