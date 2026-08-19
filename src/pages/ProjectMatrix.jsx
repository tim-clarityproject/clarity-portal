import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';

import HomeHeader from '../components/HomeHeader';

export default function ProjectMatrix() {
  const navigate = useNavigate();
  const location = useLocation();
  const { formData, updateFormData } = useContext(FormContext);
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'team';
  const isGuest = location.state?.isGuest || false;

  const [projects, setProjects] = useState(location.state?.projects || ['', '']);
  const [matrix, setMatrix] = useState(location.state?.matrix || {});

  const handleProjectChange = (index, value) => {
    const newProjects = [...projects];
    newProjects[index] = value;
    setProjects(newProjects);
  };

  const handleAddProject = () => {
    const newProjects = [...projects, ''];
    setProjects(newProjects);
  };

  const handleRemoveProject = (index) => {
    const newProjects = projects.filter((_, i) => i !== index);
    const newMatrix = { ...matrix };
    delete newMatrix[index];
    setProjects(newProjects);
    setMatrix(newMatrix);
  };

  const handleMatrixChange = (projectIndex, factorIndex, value) => {
    const newMatrix = { ...matrix };
    const key = `${projectIndex}-${factorIndex}`;
    newMatrix[key] = value;
    setMatrix(newMatrix);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filledProjects = projects.filter(p => p.trim());
    if (filledProjects.length >= 1) {
      updateFormData('projects', filledProjects);
      updateFormData('matrix', matrix);
      navigate('/project-progress', {
        state: { ...location.state, ...formData, goal: location.state?.goal, factors, projects: filledProjects, matrix, path, isGuest }
      });
    }
  };

  const filledProjects = projects.filter(p => p.trim()).length;
  const canSubmit = filledProjects >= 1;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1400px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', lineHeight: '1.4', wordSpacing: '0.1em' }}>
            How do your projects contribute to your Critical Success Factors?
          </h1>
        </div>

        <div style={{ marginBottom: '24px', display: 'flex', gap: '24px', justifyContent: 'center', fontSize: '13px', color: '#666' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: '#e5e5e5' }} />
            <span>None</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: '#F0A89E' }} />
            <span>Low</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: '#D07560' }} />
            <span>Medium</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '2px', backgroundColor: '#C0574C' }} />
            <span>High</span>
          </div>
        </div>

        <div style={{ flex: 1, marginBottom: '48px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #333', fontWeight: 'bold', backgroundColor: '#f9f9f9', minWidth: '150px' }}>
                  Project
                </th>
                {factors.map((factor, index) => (
                  <th key={index} style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #333', fontWeight: 'bold', backgroundColor: '#f9f9f9', minWidth: '140px', borderLeft: '1px solid #e5e5e5' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>CSF</div>
                    {factor}
                  </th>
                ))}
                <th style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #333', fontWeight: 'bold', backgroundColor: '#f9f9f9', minWidth: '120px', borderLeft: '1px solid #e5e5e5' }}>
                  <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Total</div>
                  Importance
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, projectIndex) => (
                <tr key={projectIndex}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', position: 'relative' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type="text" value={project} onChange={(e) => handleProjectChange(projectIndex, e.target.value)} placeholder="Project name..." style={{ width: '100%', padding: '12px 28px', border: '2px solid #e5e5e5', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} onFocus={(e) => e.target.style.borderColor = '#F08571'} onBlur={(e) => e.target.style.borderColor = '#e5e5e5'} />
                      {projectIndex >= 1 && (
                        <button type="button" onClick={() => handleRemoveProject(projectIndex)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', padding: '4px', backgroundColor: 'transparent', color: '#999', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }} onMouseEnter={(e) => e.target.style.color = '#d32f2f'} onMouseLeave={(e) => e.target.style.color = '#999'}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                  {factors.map((factor, factorIndex) => {
                    const key = `${projectIndex}-${factorIndex}`;
                    const currentValue = matrix[key] || 0;
                    const getColor = (val) => { if (val === 0) return '#e5e5e5'; if (val === 1) return '#F0A89E'; if (val === 2) return '#D07560'; return '#C0574C'; };
                    const getLabel = (val) => { const labels = ['None', 'Low', 'Medium', 'High']; return labels[val]; };
                    return (
                      <td key={key} style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', borderLeft: '1px solid #e5e5e5', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px' }}>
                          <button onClick={() => { if (currentValue < 3) { handleMatrixChange(projectIndex, factorIndex, currentValue + 1); } }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '12px', padding: '2px 4px', transition: 'all 0.2s', lineHeight: '1' }} onMouseEnter={(e) => e.target.style.color = '#333'} onMouseLeave={(e) => e.target.style.color = '#999'} title="Increase">▲</button>
                          <div style={{ width: '40px', height: '32px', backgroundColor: getColor(currentValue), borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '12px', color: currentValue === 0 ? '#999' : 'white', cursor: 'pointer', userSelect: 'none', transition: 'all 0.2s', title: 'Click to cycle or use arrows' }}>
                            {getLabel(currentValue)}
                          </div>
                          <button onClick={() => { if (currentValue > 0) { handleMatrixChange(projectIndex, factorIndex, currentValue - 1); } }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '12px', padding: '2px 4px', transition: 'all 0.2s', lineHeight: '1' }} onMouseEnter={(e) => e.target.style.color = '#333'} onMouseLeave={(e) => e.target.style.color = '#999'} title="Decrease">▼</button>
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', borderLeft: '1px solid #e5e5e5', textAlign: 'center', fontWeight: '600', color: '#F08571' }}>
                    {factors.reduce((sum, _, factorIndex) => sum + (matrix[`${projectIndex}-${factorIndex}`] || 0), 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={handleAddProject} style={{ width: '100%', padding: '12px', backgroundColor: 'transparent', color: '#F08571', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', transition: 'all 0.2s', marginBottom: '48px' }} onMouseEnter={(e) => e.target.style.color = '#e07560'} onMouseLeave={(e) => e.target.style.color = '#F08571'}>
          Add another
        </button>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', marginBottom: '24px' }}>
          <button type="button" onClick={() => navigate('/project-list', { state: { ...formData, ...location.state, isGuest } })} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '0', transition: 'all 0.2s', display: 'flex', alignItems: 'center' }} onMouseEnter={(e) => { const div = e.target.querySelector('div'); if (div) { div.style.backgroundColor = '#e8e8e8'; div.style.transform = 'translateX(-2px)'; } }} onMouseLeave={(e) => { const div = e.target.querySelector('div'); if (div) { div.style.backgroundColor = '#f5f5f5'; div.style.transform = 'translateX(0)'; } }}>
            <BackArrow />
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit} style={{ padding: '16px 32px', backgroundColor: !canSubmit ? '#ccc' : '#F08571', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: !canSubmit ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => !canSubmit || (e.target.style.backgroundColor = '#e07560')} onMouseLeave={(e) => !canSubmit || (e.target.style.backgroundColor = '#F08571')}>
            Continue
          </button>
        </div>

        <div style={{ textAlign: 'center', color: '#999', fontSize: '14px' }}>
          Step 3/5
        </div>
      </div>
    </div>
  );
}
