import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useContext } from 'react';
import BackArrow from '../components/BackArrow';
import SaveDiscardButtons from '../components/SaveDiscardButtons';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function ProjectScatter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);

  const projects = location.state?.projects || [];
  const matrix = location.state?.matrix || {};
  const progress = location.state?.progress || {};
  const factors = location.state?.factors || [];
  const path = location.state?.path || 'personal';
  const isGuest = location.state?.isGuest || false;

  const handleSaveToLog = async () => {
    if (isGuest || !user) {
      alert('Please log in to save decisions');
      return;
    }

    setIsSaving(true);
    try {
      const formDataComplete = {
        goal: location.state?.goal || '',
        risks: location.state?.risks || [],
        strategies: location.state?.strategies || [],
        factors: factors || [],
        projects: projects || [],
        matrix: matrix || {},
        progress: progress || {}
      };

      const decisionId = location.state?.decisionId;
      const title = location.state?.problemTitle || new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

      if (decisionId) {
        // Update existing draft
        const { error } = await supabase
          .from('decisions')
          .update({
            form_data: formDataComplete,
            draft: false,
            status: 'completed'
          })
          .eq('id', decisionId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Insert new decision
        const { error } = await supabase
          .from('decisions')
          .insert([{
            user_id: user.id,
            tool_type: 'strategic-alignment',
            title,
            form_data: formDataComplete,
            draft: false,
            status: 'completed'
          }]);
        if (error) throw error;
      }

      navigate('/decision-history', { state: { isGuest } });
    } catch (error) {
      console.error('Error saving decision:', error);
      alert(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate importance totals for each project
  const projectData = projects.map((project, index) => {
    const importance = factors.reduce((sum, _, factorIndex) => {
      const value = matrix[`${index}-${factorIndex}`] || 0;
      return sum + value;
    }, 0);

    const projectProgress = progress[index] || 3;

    return {
      name: project,
      progress: projectProgress,
      importance: importance,
    };
  });

  // Max possible importance is (number of CSFs × 3), then add 2 for padding
  const maxPossibleImportance = factors.length > 0 ? factors.length * 3 : 3;
  const maxImportance = maxPossibleImportance;
  const importanceThreshold = maxImportance / 2;
  const progressThreshold = 3;

  // Classify projects into quadrants
  const getQuadrant = (proj) => {
    if (proj.progress >= progressThreshold && proj.importance >= importanceThreshold) return 'leaders';
    if (proj.progress < progressThreshold && proj.importance >= importanceThreshold) return 'visionaries';
    if (proj.progress < progressThreshold && proj.importance < importanceThreshold) return 'niche';
    return 'rising';
  };

  // SVG dimensions and scaling
  const svgWidth = 850;
  const svgHeight = 600;
  const topPadding = 60;
  const bottomPadding = 80;
  const leftPadding = 90;
  const rightPadding = 130;
  const plotWidth = svgWidth - leftPadding - rightPadding;
  const plotHeight = svgHeight - topPadding - bottomPadding;
  const midX = leftPadding + plotWidth / 2;
  const midY = topPadding + plotHeight / 2;

  // Scale functions
  const scaleX = (progressValue) => leftPadding + ((progressValue - 1) / 4) * plotWidth;
  const scaleY = (importanceValue) => svgHeight - bottomPadding - (importanceValue / (maxImportance + 2)) * plotHeight;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @page {
          margin: 0.3in 0.5in;
          padding: 0;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          html {
            margin: 0;
            padding: 0;
          }
          button {
            display: none !important;
          }
          [class*="SaveDiscardButtons"] {
            display: none !important;
          }
          svg {
            page-break-inside: avoid;
          }
          div {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Prevent breaking within grid sections */
          div[style*="display: grid"] {
            page-break-inside: avoid;
          }
        }
      `}</style>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '40px 32px' }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', lineHeight: '1.4' }}>
            Are you allocating your resources (time, capital, energy, staff) appropriately?
          </h1>
        </div>

        {/* Gartner Magic Quadrant */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '48px' }}>
          <svg width={svgWidth} height={svgHeight} style={{ backgroundColor: 'white' }} onClick={() => setSelectedProjectIdx(null)}>
            {/* Click-to-deselect background */}
            <rect x={leftPadding} y={topPadding} width={plotWidth} height={plotHeight} fill="transparent" pointerEvents="none" />

            {/* Quadrant backgrounds */}
            {/* Top-Left: Visionaries (Coral) */}
            <rect
              x={leftPadding}
              y={topPadding}
              width={plotWidth / 2}
              height={plotHeight / 2}
              fill="#F08571"
              opacity={hoveredQuadrant === 'topLeft' ? '0.15' : '0.08'}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredQuadrant('topLeft')}
              onMouseLeave={() => setHoveredQuadrant(null)}
            />
            {/* Top-Right: Leaders (Teal) */}
            <rect
              x={midX}
              y={topPadding}
              width={plotWidth / 2}
              height={plotHeight / 2}
              fill="#5ECCC0"
              opacity={hoveredQuadrant === 'topRight' ? '0.2' : '0.12'}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredQuadrant('topRight')}
              onMouseLeave={() => setHoveredQuadrant(null)}
            />
            {/* Bottom-Left: Niche (Gray) */}
            <rect
              x={leftPadding}
              y={midY}
              width={plotWidth / 2}
              height={plotHeight / 2}
              fill="#e5e5e5"
              opacity={hoveredQuadrant === 'bottomLeft' ? '0.15' : '0.08'}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredQuadrant('bottomLeft')}
              onMouseLeave={() => setHoveredQuadrant(null)}
            />
            {/* Bottom-Right: Rising Stars (Coral Light) */}
            <rect
              x={midX}
              y={midY}
              width={plotWidth / 2}
              height={plotHeight / 2}
              fill="#F08571"
              opacity={hoveredQuadrant === 'bottomRight' ? '0.12' : '0.05'}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredQuadrant('bottomRight')}
              onMouseLeave={() => setHoveredQuadrant(null)}
            />


            {/* Axis lines */}
            <line x1={leftPadding} y1={midY} x2={svgWidth - rightPadding} y2={midY} stroke="#333" strokeWidth="2" />
            <line x1={midX} y1={topPadding} x2={midX} y2={svgHeight - bottomPadding} stroke="#333" strokeWidth="2" />

            {/* X-axis scale and ticks */}
            {[1, 2, 3, 4, 5].map((tick) => (
              <g key={`x-tick-${tick}`}>
                <line x1={scaleX(tick)} y1={midY} x2={scaleX(tick)} y2={midY + 6} stroke="#333" strokeWidth="1" />
                <text x={scaleX(tick)} y={midY + 22} textAnchor="middle" fontSize="12" fill="#333" fontWeight="500" pointerEvents="none" style={{ textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>
                  {tick}
                </text>
              </g>
            ))}

            {/* Y-axis scale and ticks - centered on vertical line */}
            {Array.from({ length: Math.ceil(maxImportance + 2) + 1 }, (_, i) => i).map((tick, idx) => (
              <g key={`y-tick-${idx}`}>
                <line x1={midX - 4} y1={scaleY(tick)} x2={midX + 4} y2={scaleY(tick)} stroke="#333" strokeWidth="1" />
                <text x={midX - 15} y={scaleY(tick) + 4} textAnchor="end" fontSize="12" fill="#333" fontWeight="500" pointerEvents="none" style={{ textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>
                  {tick}
                </text>
              </g>
            ))}

            {/* Axis titles */}
            <text x={svgWidth - rightPadding + 15} y={midY - 8} fontSize="12" fill="#333" fontWeight="bold">
              Project Progress
            </text>
            <text x={midX} y={topPadding - 15} textAnchor="middle" fontSize="12" fill="#333" fontWeight="bold">
              Strategic Importance
            </text>

            {/* Data points with labels */}
            {projectData.map((project, idx) => {
              const x = scaleX(project.progress);
              const y = scaleY(project.importance);
              const labelX = x + 12;
              const labelY = y - 10;
              const isSelected = selectedProjectIdx === idx;
              return (
                <g key={idx} style={{ cursor: 'pointer' }} onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProjectIdx(isSelected ? null : idx);
                }}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 10 : 7}
                    fill="#F08571"
                    opacity={isSelected ? 1 : 0.8}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 10 : 7}
                    fill="none"
                    stroke="#F08571"
                    strokeWidth={isSelected ? 3 : 2}
                    opacity={isSelected ? 0.8 : 0.4}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  {/* Project name label */}
                  <text
                    x={labelX}
                    y={labelY}
                    fontSize={isSelected ? '12' : '11'}
                    fill={isSelected ? '#F08571' : '#333'}
                    fontWeight={isSelected ? '700' : '500'}
                    pointerEvents="none"
                    style={{ transition: 'all 0.2s ease' }}
                  >
                    {project.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Quadrant Tips */}
          <div style={{ marginTop: '48px', marginBottom: '48px', width: '100%', maxWidth: '850px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '16px', textAlign: 'center' }}>
              What does each quadrant mean?
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div
                style={{ padding: '12px', backgroundColor: 'rgba(240, 133, 113, 0.1)', borderRadius: '8px', borderLeft: '3px solid #F08571', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={() => setHoveredQuadrant('topLeft')}
                onMouseLeave={() => setHoveredQuadrant(null)}
              >
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Do you need to allocate resource to these projects?</div>
                <div style={{ fontSize: '11px', color: '#666' }}>High importance, low progress</div>
              </div>
              <div
                style={{ padding: '12px', backgroundColor: 'rgba(94, 204, 192, 0.1)', borderRadius: '8px', borderLeft: '3px solid #5ECCC0', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={() => setHoveredQuadrant('topRight')}
                onMouseLeave={() => setHoveredQuadrant(null)}
              >
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>These projects are doing great.</div>
                <div style={{ fontSize: '11px', color: '#666' }}>High importance, high progress</div>
              </div>
              <div
                style={{ padding: '12px', backgroundColor: 'rgba(229, 229, 229, 0.3)', borderRadius: '8px', borderLeft: '3px solid #999', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={() => setHoveredQuadrant('bottomLeft')}
                onMouseLeave={() => setHoveredQuadrant(null)}
              >
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Should this project be deferred or cancelled?</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Low importance, low progress</div>
              </div>
              <div
                style={{ padding: '12px', backgroundColor: 'rgba(240, 133, 113, 0.05)', borderRadius: '8px', borderLeft: '3px solid #F08571', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={() => setHoveredQuadrant('bottomRight')}
                onMouseLeave={() => setHoveredQuadrant(null)}
              >
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Do you need to reallocate resources to other projects?</div>
                <div style={{ fontSize: '11px', color: '#666' }}>Low importance, high progress</div>
              </div>
            </div>
          </div>

          {/* Project breakdown */}
          <div style={{ marginTop: '48px', width: '100%', maxWidth: '850px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              {projectData.map((project, idx) => {
                const isSelected = selectedProjectIdx === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedProjectIdx(isSelected ? null : idx)}
                    style={{
                      padding: '16px',
                      backgroundColor: isSelected ? '#FEE5DE' : '#f9f9f9',
                      borderRadius: '8px',
                      borderLeft: '4px solid #F08571',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(240, 133, 113, 0.15)' : 'none',
                      transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '14px', color: isSelected ? '#F08571' : '#333', marginBottom: '12px' }}>
                      {project.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px' }}>
                      <div>
                        <div style={{ color: '#666', marginBottom: '4px', fontSize: '12px' }}>Project Progress</div>
                        <div style={{ fontWeight: '600', color: '#F08571', fontSize: '18px' }}>
                          {project.progress}/5
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#666', marginBottom: '4px', fontSize: '12px' }}>Strategic Importance</div>
                        <div style={{ fontWeight: '600', color: '#000', fontSize: '18px' }}>
                          {project.importance}
                        </div>
                      </div>
                    </div>
                    {/* Visual progress bar */}
                    <div style={{ marginTop: '12px', height: '4px', backgroundColor: '#e5e5e5', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          backgroundColor: '#F08571',
                          width: `${(project.progress / 5) * 100}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
          <SaveDiscardButtons
            formData={{ matrix, progress, factors }}
            pageType="decision"
            toolType="team-focus"
            onNext={handleSaveToLog}
            canNext={true}
            onBack={() => navigate('/project-progress', { state: { ...location.state, isGuest } })}
            nextLabel="Finish"
          />

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
            <button
              onClick={() => window.print()}
              style={{
                padding: '12px 24px',
                backgroundColor: 'transparent',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#FEE5DE';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              Export as PDF
            </button>

            {path === 'team' && (
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Project Portfolio Matrix',
                      text: 'Check out my project portfolio analysis',
                    });
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Link copied to clipboard!');
                  }
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  color: '#333',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = '#F08571';
                  e.target.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Share
              </button>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
