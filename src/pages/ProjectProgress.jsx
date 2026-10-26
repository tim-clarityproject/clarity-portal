import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import SaveProgressModal from '../components/SaveProgressModal';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import { autoSaveFormData } from '../lib/saveProgress';

import DesignHeader from '../components/DesignHeader';
import { PageHeader } from '../components/design';

export default function ProjectProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const projects = location.state?.projects || [];
  const path = location.state?.path || 'team';

  useLoadDecision(updateFormData);

  const [progress, setProgress] = useState(() => location.state?.progress || getFieldValue('progress') || {});
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    // Sync progress from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.progress && Object.keys(location.state.progress).length > 0) {
      setProgress(location.state.progress);
      updateFormData('progress', location.state.progress);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear progress and localStorage
      setProgress({});
      updateFormData('progress', {});
      localStorage.removeItem('clarity_form_data');
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.matrix]);

  // Auto-save form data when progress changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.keys(progress).length > 0) {
        autoSaveFormData({ progress, path });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [progress, path]);

  const handleProgressChange = (projectIndex, value) => {
    const newProgress = { ...progress };
    newProgress[projectIndex] = parseInt(value);
    setProgress(newProgress);
    updateFormData('progress', newProgress);
  };

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    updateFormData('progress', progress);
    const finalDecisionId = newDecisionId || location.state?.decisionId;
    navigate('/project-scatter', { state: { ...location.state, progress, decisionId: finalDecisionId } });
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px' }}>
          <PageHeader title="Strategic alignment" />
          <h2 className="ds-question">What is the progress status of each project?</h2>
          <div style={{ marginTop: '24px', width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '75%', backgroundColor: 'var(--text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Scale Legend */}
        <div style={{ marginBottom: '48px', padding: '20px', backgroundColor: 'var(--raised)', borderRadius: '12px', display: 'flex', gap: '24px', justifyContent: 'center', fontSize: 'calc(13 * var(--u, 1px))', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text)', fontSize: 'calc(14 * var(--u, 1px))' }}>1</span> Not Started</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text)', fontSize: 'calc(14 * var(--u, 1px))' }}>2</span> Planning</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text)', fontSize: 'calc(14 * var(--u, 1px))' }}>3</span> In Progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text)', fontSize: 'calc(14 * var(--u, 1px))' }}>4</span> Near Complete</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: 'var(--text)', fontSize: 'calc(14 * var(--u, 1px))' }}>5</span> Completed</div>
        </div>

        {/* Projects Progress */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '48px' }}>
          {projects.map((project, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', backgroundColor: 'var(--raised)', borderRadius: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'calc(16 * var(--u, 1px))', color: 'var(--text)', marginBottom: '12px' }}>
                  {project}
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={progress[index] || 3}
                  onChange={(e) => handleProgressChange(index, e.target.value)}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                    accentColor: 'var(--coral)',
                    height: '6px',
                  }}
                />
              </div>
              <div style={{
                textAlign: 'center',
                fontWeight: '500',
                color: 'var(--text)',
                fontSize: 'calc(14 * var(--u, 1px))',
                flexShrink: 0,
                border: '2px solid var(--field-line)',
                borderRadius: '8px',
                padding: '8px 12px',
                minWidth: '50px',
              }}>
                {progress[index] || 3}/5
              </div>
            </div>
          ))}
        </form>

        <SaveDiscardButtons
          formData={{ progress }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={true}
          onBack={() => navigate('/project-matrix', { state: { ...location.state } })}
        />
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="project-progress"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
