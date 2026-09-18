import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import SaveProgressModal from '../components/SaveProgressModal';

import HomeHeader from '../components/HomeHeader';

export default function CriticalSuccessFactors() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [factors, setFactors] = useState(() => location.state?.factors || ['', '']);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useLoadDecision(updateFormData);

  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;
  const risks = location.state?.risks || [];

  useEffect(() => {
    // Sync factors from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.factors && location.state.factors.length > 0) {
      setFactors(location.state.factors);
      updateFormData('factors', location.state.factors);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear factors and localStorage
      setFactors(['', '']);
      updateFormData('factors', ['', '']);
      localStorage.removeItem('clarity_form_data');
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.risks]);

  const handleFactorChange = (index, value) => {
    const newFactors = [...factors];
    newFactors[index] = value;
    setFactors(newFactors);
    updateFormData('factors', newFactors);
  };

  const handleAddFactor = () => {
    const newFactors = [...factors, ''];
    setFactors(newFactors);
    updateFormData('factors', newFactors);
  };

  const handleRemoveFactor = (index) => {
    const newFactors = factors.filter((_, i) => i !== index);
    setFactors(newFactors);
    updateFormData('factors', newFactors);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filledFactors = factors.filter(factor => factor.trim());
    if (filledFactors.length >= 1) {
      updateFormData('factors', filledFactors);
      navigate('/project-list', { state: { ...location.state, factors: filledFactors, path, isGuest } });
    }
  };

  const filledCount = factors.filter(factor => factor.trim()).length;
  const canSubmit = filledCount >= 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          {location.state?.problemTitle && (
            <p style={{ fontSize: '13px', color: '#999', fontWeight: '500', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {location.state.problemTitle}
            </p>
          )}
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '24px' }}>
            List the factors you feel are critical to achieving your team's objective
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '40%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Risks */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '16px', textAlign: 'center' }}>
              How you would fail
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {risks.map((risk, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    height: '80px',
                  }}
                >
                  <span
                    style={{
                      color: '#F08571',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: '1',
                    }}
                  >
                    {index + 1}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: '#f5f5f5',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#333',
                    }}
                  >
                    {risk}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Critical Success Factors */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '4px', textAlign: 'center' }}>
                Critical Success Factors
              </h2>
              <p style={{ fontSize: '12px', color: '#999', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                (Hint: The opposite of how you would fail)
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {risks.map((risk, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '80px' }}>
                  <span
                    style={{
                      color: '#F08571',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: '1',
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <textarea
                    value={factors[index] || ''}
                    onChange={(e) => handleFactorChange(index, e.target.value)}
                    placeholder="Type here..."
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid #e5e5e5',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none',
                      minHeight: '80px',
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#F08571'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
                  />
                </div>
              ))}
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ factors }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={handleSubmit}
          canNext={canSubmit}
          onBack={() => navigate('/risks-assessment', { state: { ...formData, ...location.state, isGuest } })}
        />
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="critical-success-factors"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
