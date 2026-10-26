import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

import DesignHeader from '../components/DesignHeader';
import { PageHeader, TextBox } from '../components/design';

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

  // List numbers are neutral: coral is never a data colour and green
  // only means good (Tim, 26 Oct).
  const getNumberColor = () => 'var(--text-2)';

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <PageHeader title="Strategic alignment" meta={[location.state?.problemTitle]} />
          <h2 className="ds-question">Now, what's your strategy?</h2>
          <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '75%', backgroundColor: 'var(--text)', transition: 'width 0.3s ease' }} />
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
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px', textAlign: 'center' }}>
                How it could go wrong
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
                    minHeight: '88px',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-2)',
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
                Clue: it might be the exact opposite of how it could go wrong
              </p>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {risks.map((risk, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '88px' }}>
                  <span
                    style={{
                      color: 'var(--text-2)',
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
                      ariaLabel={`Strategy ${String.fromCharCode(65 + index)}`}
                      lines="many"
                      value={strategies[index] || ''}
                      onChange={(text) => handleStrategyChange(index, text)}
                      placeholder="Type here"
                    />
                  </div>
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
