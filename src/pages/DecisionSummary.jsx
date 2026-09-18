import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function DecisionSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decision, setDecision] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    const loadDecision = async () => {
      const decisionId = location.state?.decisionId;
      if (!decisionId || !user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('decisions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching decision:', error);
          setIsLoading(false);
          return;
        }

        setDecision(data);
      } catch (err) {
        console.error('Error loading decision:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDecision();
  }, [location.state?.decisionId, user?.id]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999' }}>Loading decision...</p>
        </div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999' }}>Decision not found</p>
        </div>
      </div>
    );
  }

  const formData = decision.form_data || {};
  const toolType = decision.tool_type;

  const formatTagName = (type) => {
    return type
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const SectionBlock = ({ title, content }) => (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </h2>
      <div style={{
        backgroundColor: '#f9f9f9',
        padding: '16px',
        borderRadius: '8px',
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#555',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
      }}>
        {content || <span style={{ color: '#999', fontStyle: 'italic' }}>No content provided</span>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @page {
          margin: 0.4in 0.5in;
          padding: 0;
          @bottom-right {
            content: '';
          }
          @bottom-left {
            content: '';
          }
          @top-right {
            content: '';
          }
          @top-left {
            content: '';
          }
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
          }
          html {
            margin: 0;
            padding: 0;
          }
          button {
            display: none !important;
          }
          [style*="flex-direction: column"] > div:first-child {
            display: none !important;
          }
          div[style*="padding: 64px 32px"] {
            padding: 16px 24px !important;
          }
          h1 {
            margin-top: 4px !important;
            margin-bottom: 12px !important;
            page-break-after: avoid;
          }
          h2 {
            page-break-after: avoid;
            margin-top: 8px !important;
            margin-bottom: 6px !important;
          }
          div[style*="marginBottom: '32px'"] {
            margin-bottom: 12px !important;
          }
          div[style*="marginBottom: '48px'"] {
            margin-bottom: 12px !important;
          }
          svg {
            max-width: 100%;
            page-break-inside: auto;
            margin-top: 0 !important;
            margin-bottom: 12px !important;
          }
          div[style*="display: grid"] {
            page-break-inside: auto;
          }
        }
      `}</style>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/decision-history', { state: { isGuest } })}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            padding: 0,
            marginBottom: '24px',
          }}
        >
          ← Back to Decisions
        </button>

        {/* Title and Tag */}
        <div style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            {decision.title || 'Untitled Decision'}
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            {formatTagName(toolType)}
          </span>
        </div>

        {/* GROW Specific Sections */}
        {toolType === 'grow' && (
          <>
            <SectionBlock
              title="Your Goal"
              content={formData.goal || decision.title}
            />
            <SectionBlock
              title="Your Reality"
              content={formData.constraints}
            />
            {formData.options && formData.options.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Your Options Prioritised
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.options.map((option, idx) => (
                    <div key={idx} style={{ marginBottom: idx < formData.options.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                      <span style={{ fontWeight: '600' }}>{idx + 1}.</span> {option}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Your Goal - shown for non-GROW, non-Tough Conversation types */}
        {toolType !== 'tough-conversation' && toolType !== 'grow' && (
          <SectionBlock
            title="Your Goal"
            content={formData.goal || decision.title}
          />
        )}

        {/* Inversion Specific Sections */}
        {toolType === 'inversion' && (
          <>
            {formData.fuckups && formData.fuckups.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Ways to Fail
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.fuckups.map((fuckup, idx) => (
                    <div key={idx} style={{ marginBottom: idx < formData.fuckups.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                      <span style={{ fontWeight: '600' }}>{idx + 1}.</span> {fuckup}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Strategic Alignment Specific Sections */}
        {toolType === 'strategic-alignment' && (
          <>
            {formData.risks && formData.risks.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  How You Would Fail
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.risks.map((risk, idx) => (
                    <div key={idx} style={{ marginBottom: idx < formData.risks.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                      <span style={{ fontWeight: '600' }}>{idx + 1}.</span> {risk}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.factors && formData.factors.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Critical Success Factors
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.factors.map((factor, idx) => (
                    <div key={idx} style={{ marginBottom: idx < formData.factors.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                      <span style={{ fontWeight: '600' }}>{String.fromCharCode(65 + idx)}.</span> {factor}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.projects && formData.projects.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Projects / Lines of Effort
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.projects.map((project, idx) => (
                    <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                      <span style={{ fontWeight: '600' }}>{String.fromCharCode(65 + idx)}.</span> {project}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.matrix && Object.keys(formData.matrix).length > 0 && formData.factors && formData.factors.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Strategic Importance Scores
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', paddingBottom: '12px', borderBottom: '2px solid #333', fontWeight: '600' }}>Project</th>
                        <th style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '2px solid #333', fontWeight: '600' }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.projects && formData.projects.map((project, projectIdx) => {
                        const score = formData.factors.reduce((sum, _, factorIdx) => sum + (formData.matrix[`${projectIdx}-${factorIdx}`] || 0), 0);
                        return (
                          <tr key={projectIdx}>
                            <td style={{ paddingTop: '8px', paddingBottom: '8px', color: '#555' }}>{String.fromCharCode(65 + projectIdx)}. {project}</td>
                            <td style={{ textAlign: 'center', paddingTop: '8px', paddingBottom: '8px', color: '#F08571', fontWeight: '600' }}>{score}/{formData.factors.length * 3}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {formData.progress && Object.keys(formData.progress).length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Progress Status
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.projects && formData.projects.map((project, idx) => {
                    const progress = formData.progress[idx] || 0;
                    const progressLabels = ['Not Started', 'Planning', 'In Progress', 'Near Complete', 'Completed'];
                    return (
                      <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '16px' : 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
                          {String.fromCharCode(65 + idx)}. {project}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          {progressLabels[progress] || 'Not Set'} ({progress}/5)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Strategic Alignment Scatter Plot Visualization */}
        {toolType === 'strategic-alignment' && formData.factors && formData.factors.length > 0 && formData.projects && formData.projects.length > 0 && (
          <>
            {/* Gartner Magic Quadrant */}
            <div style={{ marginTop: '64px', marginBottom: '48px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#333', marginBottom: '32px', textAlign: 'center' }}>
                Are you allocating your resources appropriately?
              </h2>

              <svg width={850} height={600} style={{ backgroundColor: 'white', display: 'block', margin: '0 auto', marginBottom: '32px' }} onClick={() => setSelectedProjectIdx(null)}>
                {/* Quadrant setup calculations */}
                {(() => {
                  const svgWidth = 850, svgHeight = 600;
                  const topPadding = 60, bottomPadding = 80, leftPadding = 90, rightPadding = 130;
                  const plotWidth = svgWidth - leftPadding - rightPadding;
                  const plotHeight = svgHeight - topPadding - bottomPadding;
                  const midX = leftPadding + plotWidth / 2;
                  const midY = topPadding + plotHeight / 2;
                  const maxImportance = formData.factors.length * 3;
                  const importanceThreshold = maxImportance / 2;
                  const progressThreshold = 3;
                  const scaleX = (progressValue) => leftPadding + ((progressValue - 1) / 4) * plotWidth;
                  const scaleY = (importanceValue) => svgHeight - bottomPadding - (importanceValue / (maxImportance + 2)) * plotHeight;

                  const projectData = formData.projects.map((project, projectIdx) => {
                    const projectProgress = formData.progress ? (formData.progress[projectIdx] || 0) : 0;
                    const importance = formData.factors.reduce((sum, _, factorIdx) => sum + (formData.matrix[`${projectIdx}-${factorIdx}`] || 0), 0);
                    return {
                      name: project,
                      progress: projectProgress + 1,
                      importance: importance,
                    };
                  });

                  return (
                    <g>
                      {/* Quadrant backgrounds */}
                      <rect x={leftPadding} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity={hoveredQuadrant === 'topLeft' ? '0.15' : '0.08'} />
                      <rect x={midX} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#5ECCC0" opacity={hoveredQuadrant === 'topRight' ? '0.2' : '0.12'} />
                      <rect x={leftPadding} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#e5e5e5" opacity={hoveredQuadrant === 'bottomLeft' ? '0.15' : '0.08'} />
                      <rect x={midX} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity={hoveredQuadrant === 'bottomRight' ? '0.12' : '0.05'} />

                      {/* Axis lines */}
                      <line x1={leftPadding} y1={midY} x2={svgWidth - rightPadding} y2={midY} stroke="#333" strokeWidth="2" />
                      <line x1={midX} y1={topPadding} x2={midX} y2={svgHeight - bottomPadding} stroke="#333" strokeWidth="2" />

                      {/* X-axis scale */}
                      {[1, 2, 3, 4, 5].map((tick) => (
                        <g key={`x-${tick}`}>
                          <line x1={scaleX(tick)} y1={midY} x2={scaleX(tick)} y2={midY + 6} stroke="#333" strokeWidth="1" />
                          <text x={scaleX(tick)} y={midY + 22} textAnchor="middle" fontSize="12" fill="#333" fontWeight="500">{tick}</text>
                        </g>
                      ))}

                      {/* Y-axis scale */}
                      {[1, 2, 3, 4, 5].map((tick) => {
                        const val = Math.round((tick / 5) * (maxImportance + 2));
                        return val <= maxImportance ? (
                          <g key={`y-${tick}`}>
                            <line x1={leftPadding - 6} y1={scaleY(val)} x2={leftPadding} y2={scaleY(val)} stroke="#333" strokeWidth="1" />
                            <text x={leftPadding - 12} y={scaleY(val) + 4} textAnchor="end" fontSize="12" fill="#333" fontWeight="500">{val}</text>
                          </g>
                        ) : null;
                      })}

                      {/* Axis labels */}
                      <text x={svgWidth / 2} y={svgHeight - 20} textAnchor="middle" fontSize="12" fill="#666" fontWeight="500">Project Progress →</text>
                      <text x={20} y={svgHeight / 2} textAnchor="middle" fontSize="12" fill="#666" fontWeight="500" transform={`rotate(-90 20 ${svgHeight / 2})`}>Strategic Importance →</text>

                      {/* Project dots */}
                      {projectData.map((project, idx) => {
                        const x = scaleX(project.progress);
                        const y = scaleY(project.importance);
                        const isSelected = selectedProjectIdx === idx;
                        return (
                          <g key={idx} onClick={() => setSelectedProjectIdx(isSelected ? null : idx)}>
                            <circle cx={x} cy={y} r={isSelected ? 8 : 6} fill="#F08571" opacity={isSelected ? 1 : 0.7} style={{ cursor: 'pointer', transition: 'all 0.2s' }} />
                            <text x={x} y={y + 16} textAnchor="middle" fontSize={isSelected ? '12' : '11'} fill={isSelected ? '#F08571' : '#333'} fontWeight={isSelected ? '700' : '500'}>{project.name}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              </svg>

              {/* Quadrant explanation panels */}
              <div style={{ marginBottom: '48px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '16px', textAlign: 'center' }}>
                  What does each quadrant mean?
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  <div style={{ padding: '12px', backgroundColor: 'rgba(240, 133, 113, 0.1)', borderRadius: '8px', borderLeft: '3px solid #F08571' }} onMouseEnter={() => setHoveredQuadrant('topLeft')} onMouseLeave={() => setHoveredQuadrant(null)}>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Do you need to allocate resources to these projects?</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>High importance, low progress</div>
                  </div>
                  <div style={{ padding: '12px', backgroundColor: 'rgba(94, 204, 192, 0.1)', borderRadius: '8px', borderLeft: '3px solid #5ECCC0' }} onMouseEnter={() => setHoveredQuadrant('topRight')} onMouseLeave={() => setHoveredQuadrant(null)}>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>These projects are doing great.</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>High importance, high progress</div>
                  </div>
                  <div style={{ padding: '12px', backgroundColor: 'rgba(229, 229, 229, 0.3)', borderRadius: '8px', borderLeft: '3px solid #999' }} onMouseEnter={() => setHoveredQuadrant('bottomLeft')} onMouseLeave={() => setHoveredQuadrant(null)}>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Should this project be deferred or cancelled?</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Low importance, low progress</div>
                  </div>
                  <div style={{ padding: '12px', backgroundColor: 'rgba(240, 133, 113, 0.05)', borderRadius: '8px', borderLeft: '3px solid #F08571' }} onMouseEnter={() => setHoveredQuadrant('bottomRight')} onMouseLeave={() => setHoveredQuadrant(null)}>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: '#333', marginBottom: '6px' }}>Do you need to reallocate resources to other projects?</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Low importance, high progress</div>
                  </div>
                </div>
              </div>

              {/* Project panels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                {(() => {
                  const svgWidth = 850, svgHeight = 600;
                  const topPadding = 60, bottomPadding = 80, leftPadding = 90, rightPadding = 130;
                  const plotWidth = svgWidth - leftPadding - rightPadding;
                  const plotHeight = svgHeight - topPadding - bottomPadding;
                  const midX = leftPadding + plotWidth / 2;
                  const midY = topPadding + plotHeight / 2;
                  const maxImportance = formData.factors.length * 3;

                  const projectData = formData.projects.map((project, projectIdx) => {
                    const projectProgress = formData.progress ? (formData.progress[projectIdx] || 0) : 0;
                    const importance = formData.factors.reduce((sum, _, factorIdx) => sum + (formData.matrix[`${projectIdx}-${factorIdx}`] || 0), 0);
                    return {
                      name: project,
                      progress: projectProgress,
                      importance: importance,
                    };
                  });

                  return projectData.map((project, idx) => {
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
                              {project.importance}/{formData.factors.length * 3}
                            </div>
                          </div>
                        </div>
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
                  });
                })()}
              </div>
            </div>
          </>
        )}

        {/* Tough Conversation Specific Sections */}
        {toolType === 'tough-conversation' && (
          <>
            {(formData.observation || formData.impact || formData.need) && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Your Feedback Script
                </h2>
                <div style={{
                  backgroundColor: '#f9f9f9',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#555',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}>
                  I've noticed {formData.observation}. The impact of that is {formData.impact}. So, what I need from you is {formData.need}.
                </div>
              </div>
            )}

            {((formData.selectedQuestions && formData.selectedQuestions.length > 0) || formData.customQuestion) && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Your Coaching Questions
                </h2>
                <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
                  {formData.selectedQuestions && formData.selectedQuestions.length > 0 && (
                    <>
                      {['What\'s already working that we can build upon?', 'What part of this is within your control?', 'What would others notice first if things improved?', 'What\'s one behaviour you\'d keep, start, or stop?', 'When have you handled this well before?', 'What\'s the simplest next step you could take?', 'What strengths could you use here?', 'What support would help you the most?'].map((q, idx) => (
                        formData.selectedQuestions.includes(idx) && (
                          <div key={idx} style={{ marginBottom: '12px', color: '#555', fontSize: '14px' }}>
                            • {q}
                          </div>
                        )
                      ))}
                    </>
                  )}
                  {formData.customQuestion && (
                    <div style={{ color: '#555', fontSize: '14px', marginTop: formData.selectedQuestions && formData.selectedQuestions.length > 0 ? '12px' : 0, paddingTop: formData.selectedQuestions && formData.selectedQuestions.length > 0 ? '12px' : 0, borderTop: formData.selectedQuestions && formData.selectedQuestions.length > 0 ? '1px solid #e5e5e5' : 'none' }}>
                      • {formData.customQuestion}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* What you said you'd do - not shown for Tough Conversation or Strategic Alignment */}
        {toolType !== 'tough-conversation' && toolType !== 'strategic-alignment' && (
          <SectionBlock
            title={toolType === 'grow' ? 'What you said you\'d do' : 'Action You Said You\'d Take'}
            content={formData.will_do || formData.plan}
          />
        )}

        {/* Meta Info */}
        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e5e5e5', fontSize: '12px', color: '#999' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            Status: <span style={{ fontWeight: '600', color: '#333' }}>{decision.status === 'completed' ? 'Completed' : 'Draft'}</span>
          </p>
          <p style={{ margin: 0 }}>
            Created: <span style={{ fontWeight: '600', color: '#333' }}>{new Date(decision.created_at).toLocaleDateString()}</span>
          </p>
        </div>

        {/* Share as PDF Button */}
        <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Share as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
