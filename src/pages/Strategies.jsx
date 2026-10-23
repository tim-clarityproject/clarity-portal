import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';

export default function Strategies() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [strategies, setStrategies] = useState(() => location.state?.strategies || []);

  const risks = location.state?.risks || [];
  const path = location.state?.path || 'personal';

  useEffect(() => {
    if (!location.state?.decisionId && !location.state?.strategies) {
      setStrategies([]);
      updateFormData('strategies', []);
      localStorage.removeItem('clarity_form_data');
    }
  }, []);

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    updateFormData('strategies', strategies);
    const finalDecisionId = newDecisionId || location.state?.decisionId;
    navigate('/project-list', { state: { ...location.state, ...formData, strategies, path, decisionId: finalDecisionId } });
  };

  const handleStrategyChange = (index, value) => {
    const newStrategies = [...strategies];
    newStrategies[index] = value;
    setStrategies(newStrategies);
    updateFormData('strategies', newStrategies);
  };

  const getNumberColor = (index) => {
    if (index === 0) return 'var(--coral-text)';
    if (index === 1) return 'var(--mint-text)';
    return 'var(--text-2)';
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <PageHeader title="Strategic alignment" meta={[location.state?.problemTitle]} />
          <h2 className="ds-question">Now, what's your strategy?</h2>
          <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '75%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Risks */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px', textAlign: 'center' }}>
                How you could fail
              </h2>
              <p style={{ fontSize: '12px', color: 'transparent', margin: 0, textAlign: 'center' }}>
                placeholder
              </p>
            </div>
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

          {/* Right Column - Strategies */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px', textAlign: 'center' }}>
                Your strategies
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--label)', margin: 0, textAlign: 'center', fontStyle: 'italic' }}>
                Clue: it might be the exact opposite of how you could fail
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {risks.map((risk, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '80px' }}>
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
                  <textarea
                    value={strategies[index] || ''}
                    onChange={(e) => handleStrategyChange(index, e.target.value)}
                    placeholder="Type here"
                    style={{
                      backgroundColor: 'var(--card)',
                      color: 'var(--text)',
                      flex: 1,
                      padding: '12px 16px',
                      border: '2px solid var(--field-line)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none',
                      minHeight: '80px',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--coral-text)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--field-line)'}
                  />
                </div>
              ))}
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ strategies }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={true}
          onBack={() => navigate('/risks-assessment', { state: { ...formData, ...location.state } })}
        />
      </div>

    </div>
  );
}
