import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import { useLoadDecision } from '../hooks/useLoadDecision';
import BackArrow from '../components/BackArrow';
import SaveProgressModal from '../components/SaveProgressModal';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import { autoSaveFormData } from '../lib/saveProgress';

import DesignHeader from '../components/DesignHeader';
import { Crosshair, PageHeader } from '../components/design';

export default function ProjectList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'team';

  useLoadDecision(updateFormData);

  const [projects, setProjects] = useState(() => location.state?.projects || ['', '']);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const goal = location.state?.goal || '';

  useEffect(() => {
    // Sync projects from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.projects && location.state.projects.length > 0) {
      setProjects(location.state.projects);
      updateFormData('projects', location.state.projects);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear projects and localStorage
      setProjects(['', '']);
      updateFormData('projects', ['', '']);
      localStorage.removeItem('clarity_form_data');
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.factors]);

  // Auto-save form data when projects change
  useEffect(() => {
    const timer = setTimeout(() => {
      const filledProjects = projects.filter(p => p.trim());
      if (filledProjects.length > 0) {
        autoSaveFormData({ projects: filledProjects, path });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [projects, path]);

  const handleProjectChange = (index, value) => {
    const newProjects = [...projects];
    newProjects[index] = value;
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleAddProject = () => {
    const newProjects = [...projects, ''];
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleRemoveProject = (index) => {
    const newProjects = projects.filter((_, i) => i !== index);
    setProjects(newProjects);
    updateFormData('projects', newProjects);
  };

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    const filledProjects = projects.filter(p => p.trim());
    if (filledProjects.length >= 1) {
      updateFormData('projects', filledProjects);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/project-matrix', {
        state: { ...location.state, projects: filledProjects, path, decisionId: finalDecisionId }
      });
    }
  };

  const filledProjects = projects.filter(p => p.trim()).length;
  const canSubmit = filledProjects >= 1;

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1024px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/decision-history')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid var(--outline)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = 'var(--coral-text)';
              e.target.style.backgroundColor = 'var(--raised)';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = 'var(--outline)';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>

        <PageHeader title="Strategic alignment" meta={['Where my team should focus']} />
        <h2 className="ds-question">List your projects</h2>

        <div style={{ marginTop: '24px', marginBottom: '32px' }}>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '25%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'flex', gap: '48px', flex: 1 }}>
          {/* Left Column - Critical Success Factors */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '16px', textAlign: 'center' }}>
              Critical Success Factors
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {factors.map((factor, index) => (
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
                    {factor}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Projects */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '16px', textAlign: 'center' }}>
              Projects / Lines of Effort
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
              {projects.map((project, index) => (
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
                    value={project}
                    onChange={(e) => handleProjectChange(index, e.target.value)}
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
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(index)}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      color: 'var(--coral-text)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      marginTop: '50px',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--coral-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--coral-text)'}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                <span style={{ minWidth: '20px' }}></span>
                <button
                  type="button"
                  onClick={handleAddProject}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'transparent',
                    color: 'var(--coral-text)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--coral-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--coral-text)'}
                >
                  <Crosshair />
                  Add another
                </button>
              </div>
            </form>
          </div>
        </div>

        <SaveDiscardButtons
          formData={{ projects }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={canSubmit}
          onBack={() => navigate('/critical-success-factors', { state: { ...formData, ...location.state } })}
        />
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="project-list"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
