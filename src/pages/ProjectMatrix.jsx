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
import { Crosshair } from '../components/design';

export default function ProjectMatrix() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData, getFieldValue } = useContext(FormContext);
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'team';

  useLoadDecision(updateFormData);

  const [projects, setProjects] = useState(location.state?.projects || ['', '']);
  const [matrix, setMatrix] = useState(() => location.state?.matrix || {});
  const [showSaveModal, setShowSaveModal] = useState(false);

  useEffect(() => {
    // Sync matrix from location.state when it exists (e.g., coming back from next page or resuming draft)
    if (location.state?.matrix && Object.keys(location.state.matrix).length > 0) {
      setMatrix(location.state.matrix);
      updateFormData('matrix', location.state.matrix);
    } else if (!location.state?.decisionId) {
      // Fresh decision: clear matrix and localStorage
      setMatrix({});
      updateFormData('matrix', {});
      localStorage.removeItem('clarity_form_data');
      localStorage.removeItem('strategic-alignment-autosave');
      localStorage.removeItem('strategic-alignment-progress');
    }
  }, [location.state?.projects]);

  // Auto-save form data when matrix changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const filledProjects = projects.filter(p => p.trim());
      if (filledProjects.length > 0) {
        autoSaveFormData({ projects: filledProjects, matrix, path });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [matrix, projects, path]);

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
    const newMatrix = { ...matrix };
    delete newMatrix[index];
    setProjects(newProjects);
    updateFormData('projects', newProjects);
    setMatrix(newMatrix);
    updateFormData('matrix', newMatrix);
  };

  const handleMatrixChange = (projectIndex, factorIndex, value) => {
    const newMatrix = { ...matrix };
    const key = `${projectIndex}-${factorIndex}`;
    newMatrix[key] = value;
    setMatrix(newMatrix);
    updateFormData('matrix', newMatrix);
  };

  const handleSubmit = (e, newDecisionId) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }
    const filledProjects = projects.filter(p => p.trim());
    if (filledProjects.length >= 1) {
      updateFormData('projects', filledProjects);
      updateFormData('matrix', matrix);
      const finalDecisionId = newDecisionId || location.state?.decisionId;
      navigate('/project-progress', {
        state: { ...location.state, projects: filledProjects, matrix, path, decisionId: finalDecisionId }
      });
    }
  };

  const filledProjects = projects.filter(p => p.trim()).length;
  const canSubmit = filledProjects >= 1;

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--text)', lineHeight: '1.4', wordSpacing: '0.1em', marginBottom: '24px' }}>
            How much does each project/line of effort contribute to your Critical Success Factors?
          </h1>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '50%', backgroundColor: 'var(--coral-text)', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        <div style={{ marginBottom: '24px', display: 'flex', gap: '24px', justifyContent: 'center', fontSize: '13px', color: 'var(--text-2)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: 'var(--card)', border: '1px solid var(--line)', boxSizing: 'border-box' }} />
            <span>None</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: 'var(--line)' }} />
            <span>Low</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: 'var(--coral-soft-text)' }} />
            <span>Medium</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: 'var(--coral)' }} />
            <span>High</span>
          </div>
        </div>

        <div style={{ flex: 1, marginBottom: '48px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--quiet-line)', fontWeight: 'bold', backgroundColor: 'var(--raised)', minWidth: '150px' }}>
                  Project
                </th>
                {factors.map((factor, index) => (
                  <th key={index} style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid var(--quiet-line)', fontWeight: 'bold', backgroundColor: 'var(--raised)', minWidth: '140px', borderLeft: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--label)', marginBottom: '4px' }}>CSF</div>
                    {factor}
                  </th>
                ))}
                <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid var(--quiet-line)', fontWeight: 'bold', backgroundColor: 'var(--raised)', minWidth: '120px', borderLeft: '1px solid var(--line)', fontSize: '14px', color: 'var(--text)' }}>
                  Strategic Importance Score
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, projectIndex) => (
                <tr key={projectIndex}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type="text" value={project} onChange={(e) => handleProjectChange(projectIndex, e.target.value)} placeholder="Type here" style={{ backgroundColor: 'var(--card)', color: 'var(--text)', width: '100%', padding: '12px 28px', border: '2px solid var(--field-line)', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} onFocus={(e) => e.target.style.borderColor = 'var(--coral-text)'} onBlur={(e) => e.target.style.borderColor = 'var(--field-line)'} />
                      {projectIndex >= 1 && (
                        <button type="button" onClick={() => handleRemoveProject(projectIndex)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', padding: '4px', backgroundColor: 'transparent', color: 'var(--label)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }} onMouseEnter={(e) => e.target.style.color = 'var(--coral-text)'} onMouseLeave={(e) => e.target.style.color = 'var(--label)'}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                  {factors.map((factor, factorIndex) => {
                    const key = `${projectIndex}-${factorIndex}`;
                    const currentValue = matrix[key] || 0;
                    const getColor = (val) => { if (val === 0) return 'var(--card)'; if (val === 1) return 'var(--line)'; if (val === 2) return 'var(--coral-soft-text)'; return 'var(--coral)'; };
                    const getLabel = (val) => { const labels = ['None', 'Low', 'Medium', 'High']; return labels[val]; };
                    return (
                      <td key={key} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px' }}>
                          <button onClick={() => { if (currentValue > 0) { handleMatrixChange(projectIndex, factorIndex, currentValue - 1); } }} style={{ background: 'none', border: 'none', color: 'var(--label)', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', transition: 'all 0.2s', lineHeight: '1', fontWeight: 'bold' }} onMouseEnter={(e) => e.target.style.color = 'var(--text)'} onMouseLeave={(e) => e.target.style.color = 'var(--label)'} title="Decrease">−</button>
                          <div style={{ width: '40px', height: '32px', backgroundColor: getColor(currentValue), border: currentValue === 0 ? '1px solid var(--line)' : 'none', boxSizing: 'border-box', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '10px', color: currentValue === 0 ? 'var(--label)' : currentValue === 1 ? 'var(--text)' : 'var(--on-coral)', cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s', title: 'Click to cycle or use buttons', lineHeight: '1', letterSpacing: '-0.3px' }}>
                            {getLabel(currentValue)}
                          </div>
                          <button onClick={() => { if (currentValue < 3) { handleMatrixChange(projectIndex, factorIndex, currentValue + 1); } }} style={{ background: 'none', border: 'none', color: 'var(--label)', cursor: 'pointer', fontSize: '16px', padding: '2px 4px', transition: 'all 0.2s', lineHeight: '1', fontWeight: 'bold', display: 'flex', alignItems: 'center' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--label)'} title="Increase" aria-label="Increase"><Crosshair size="sm" /></button>
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)', textAlign: 'center', fontWeight: '600', color: 'var(--coral-text)' }}>
                    {factors.reduce((sum, _, factorIndex) => sum + (matrix[`${projectIndex}-${factorIndex}`] || 0), 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={handleAddProject} style={{ width: '100%', padding: '12px', backgroundColor: 'transparent', color: 'var(--coral-text)', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', transition: 'all 0.2s', marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--coral-hover)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--coral-text)'}>
          <Crosshair />
          Add another
        </button>

        <SaveDiscardButtons
          formData={{ matrix }}
          pageType="decision"
          toolType="strategic-alignment"
          onNext={(newDecisionId) => handleSubmit(null, newDecisionId)}
          canNext={canSubmit}
          onBack={() => navigate('/project-list', { state: { ...location.state } })}
        />
      </div>

      <SaveProgressModal
        formData={formData}
        currentPage="project-matrix"
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />
    </div>
  );
}
