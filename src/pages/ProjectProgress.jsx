import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import { autoSaveFormData } from '../lib/saveProgress';

import HomeHeader from '../components/HomeHeader';

export default function ProjectProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const projects = location.state?.projects || [];
  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;

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
    navigate('/project-scatter', { state: { ...location.state, progress, isGuest, decisionId: finalDecisionId } });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, marginTop: '100px', display: 'flex', flexDirection: 'column', maxWidth: '1024px', marginTop: '100px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', lineHeight: '1.4', marginBottom: '24px' }}>
            What is the progress status of each project?
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '75%', backgroundColor: '#F08571', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Scale Legend */}
        <div style={{ marginBottom: '48px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px', display: 'flex', gap: '24px', justifyContent: 'center', fontSize: '13px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>1</span> Not Started</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>2</span> Planning</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>3</span> In Progress</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>4</span> Near Complete</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontWeight: 'bold', color: '#333', fontSize: '14px' }}>5</span> Completed</div>
        </div>

        {/* Projects Progress */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '48px' }}>
          {projects.map((project, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '16px', color: '#333', marginBottom: '12px' }}>
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
                    accentColor: '#F08571',
                    height: '6px',
                  }}
                />
              </div>
              <div style={{
                textAlign: 'center',
                fontWeight: '500',
                color: '#000',
                fontSize: '14px',
                flexShrink: 0,
                border: '2px solid #F08571',
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
          onBack={() => navigate('/project-matrix', { state: { ...location.state, isGuest } })}
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
