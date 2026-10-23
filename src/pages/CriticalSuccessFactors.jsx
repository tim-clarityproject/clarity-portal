import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import SaveProgressModal from '../components/SaveProgressModal';

import DesignHeader from '../components/DesignHeader';
import { PageHeader, TextBox } from '../components/design';

export default function CriticalSuccessFactors() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [factors, setFactors] = useState(() => location.state?.factors || ['', '']);
  const [showSaveModal, setShowSaveModal] = useState(false);

  useLoadDecision(updateFormData);

  const path = location.state?.path || 'team';
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

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    const filledFactors = factors.filter(factor => factor.trim());
    if (filledFactors.length >= 1) {
      updateFormData('factors', filledFactors);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/project-list', { state: { ...location.state, factors: filledFactors, path, decisionId: finalDecisionId } });
    }
  };

  const filledCount = factors.filter(factor => factor.trim()).length;
  const canSubmit = filledCount >= 1;

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <PageHeader title="Strategic alignment" meta={[location.state?.problemTitle]} />
          <h2 className="ds-question">List the factors you feel are critical to achieving your team's objective</h2>
          <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '40%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <style>{`
          .ui-root .g1-two-col { display: flex; gap: 48px; flex: 1; }
          @media (max-width: 768px) {
            .ui-root .g1-two-col { flex-direction: column; gap: 32px; }
          }
        `}</style>
        {/* Two Column Layout */}
        <div className="g1-two-col">
          {/* Left Column - Risks */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '16px', textAlign: 'center' }}>
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
                      color: 'var(--coral-text)',
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
                      backgroundColor: 'var(--raised)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
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
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px', textAlign: 'center' }}>
                Critical Success Factors
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--label)', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                Hint: the opposite of how you would fail
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {risks.map((risk, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '80px' }}>
                  <span
                    style={{
                      color: 'var(--coral-text)',
                      fontSize: '16px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: '1',
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <div style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
                    <TextBox
                      ariaLabel={`Critical success factor ${String.fromCharCode(65 + index)}`}
                      lines="one"
                      value={factors[index] || ''}
                      onChange={(text) => handleFactorChange(index, text)}
                      placeholder="Type here"
                    />
                  </div>
                </div>
              ))}
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ factors }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={canSubmit}
          onBack={() => navigate('/risks-assessment', { state: { ...formData, ...location.state } })}
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
