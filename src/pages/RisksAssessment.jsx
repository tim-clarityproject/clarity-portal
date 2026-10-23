import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import SaveDiscardButtons from '../components/SaveDiscardButtons';

import DesignHeader from '../components/DesignHeader';
import { PageHeader, TextField, Button } from '../components/design';

export default function RisksAssessment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const [risks, setRisks] = useState(() => location.state?.risks || ['', '', '']);

  useLoadDecision(updateFormData);

  const path = location.state?.path || 'personal';

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

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    const filledRisks = risks.filter(risk => risk.trim());
    if (filledRisks.length >= 1) {
      updateFormData('risks', filledRisks);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      const nextPage = path === 'team' ? '/critical-success-factors' : '/strategies';
      navigate(nextPage, { state: { ...location.state, risks: filledRisks, path, decisionId: finalDecisionId } });
    }
  };

  const filledCount = risks.filter(risk => risk.trim()).length;
  const canSubmit = filledCount >= 1;

  const getNumberColor = (index) => {
    if (index === 0) return 'var(--coral-text)';
    if (index === 1) return 'var(--mint-text)';
    return 'var(--text-2)';
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <PageHeader title="Strategic alignment" meta={[location.state?.problemTitle]} />
          <h2 className="ds-question">If you wanted to make sure you failed, what would you do?</h2>
          <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '50%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', flex: 1, maxWidth: '512px', margin: '0 auto 24px', width: '100%' }}>
            {risks.map((risk, index) => (
              <div key={index} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '58px' }}>
                <span
                  style={{
                    color: 'var(--coral-text)',
                    fontSize: '20px',
                    minWidth: '24px',
                  }}
                >
                  {index + 1}.
                </span>
                <div style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
                  <TextField
                    aria-label={`Way to fail ${index + 1}`}
                    value={risk}
                    onChange={(e) => handleRiskChange(index, e.target.value)}
                    placeholder="Type here"
                  />
                </div>
                {index >= 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRisk(index)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--coral-text)',
                      padding: '4px',
                    }}
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <Button variant="outline" icon="plus" type="button" onClick={handleAddRisk} style={{ marginBottom: '32px' }}>Add another</Button>
        </form>

        <SaveDiscardButtons
          formData={{ risks }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={canSubmit}
          onBack={() => navigate('/goal-setting', { state: { ...location.state, path } })}
        />
      </div>
    </div>
  );
}
