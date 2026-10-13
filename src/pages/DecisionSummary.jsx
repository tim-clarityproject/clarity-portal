import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import { summaryStyles } from '../styles/summaryStyles';

// Types with their own dedicated, design-system summary page now - an
// old bookmark/link that still points here gets sent on rather than
// trying to re-render (and risk drifting from) that page's content.
const REDIRECT_ROUTE = {
  inversion: '/inversion-thinking-summary',
  'tough-conversation': '/tough-conversation-summary',
  if_then_planning: '/if-then-planning-summary',
  stop_doing_audit: '/stop-doing-audit-summary',
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
};

const TYPE_LABEL = {
  grow: 'GROW',
  'strategic-alignment': 'Strategic alignment',
};

const EDIT_ROUTE = {
  grow: '/grow-step-1',
  'strategic-alignment': '/goal-setting',
};

export default function DecisionSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decision, setDecision] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState(null);
  const decisionId = location.state?.decisionId;

  useEffect(() => {
    const loadDecision = async () => {
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
          console.error('[DecisionSummary] load failed:', error);
          setIsLoading(false);
          return;
        }
        if (REDIRECT_ROUTE[data.tool_type]) {
          navigate(REDIRECT_ROUTE[data.tool_type], { replace: true, state: { decisionId } });
          return;
        }
        setDecision(data);
      } catch (err) {
        console.error('[DecisionSummary] load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadDecision();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  if (isLoading) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Loading...</p></div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page"><p className="ui-subtitle">Decision not found.</p></div>
      </div>
    );
  }

  const formData = decision.form_data || {};
  const toolType = decision.tool_type;

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page">
        <div className="plan-back-row">
          <BackLink onClick={() => navigate('/decision-history')} label="Back to my decisions" />
        </div>

        <div className="plan-summary-head">
          <span className="plan-overline">{TYPE_LABEL[toolType] || toolType}</span>
          <div className="ui-title">{decision.title || 'Untitled decision'}</div>
          <p className="ui-subtitle">Created {formatUkDate(decision.created_at)}</p>
        </div>

        {toolType === 'grow' && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <p className="plan-sum-label">Your goal</p>
              <p className="plan-sum-value">{formData.goal || decision.title || <span className="plan-none">Not recorded.</span>}</p>
            </div>
            {formData.constraints && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Constraints</p>
                <p className="plan-sum-value">{formData.constraints}</p>
              </div>
            )}
            {formData.opportunities && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Opportunities</p>
                <p className="plan-sum-value">{formData.opportunities}</p>
              </div>
            )}
            {formData.options?.length > 0 && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">Your options, prioritised</p>
                <div className="plan-sum-value plan-sum-value--list">
                  <ol style={{ margin: 0, padding: 0, listStylePosition: 'inside' }}>
                    {formData.options.map((option, idx) => <li key={idx}>{option}</li>)}
                  </ol>
                </div>
              </div>
            )}
            {formData.will_do && (
              <div className="plan-sum-row">
                <p className="plan-sum-label">What you said you'd do</p>
                <p className="plan-sum-value">{formData.will_do}</p>
              </div>
            )}
          </div>
        )}

        {/* Strategic alignment: kept as its existing content/visualisation
            (scatter plot + tables) rather than forced into the shared
            two-column layout - see build summary point 4. Not reachable
            from the hub (Coming soon), but already-saved rows must stay
            openable. */}
        {toolType === 'strategic-alignment' && (
          <StrategicAlignmentBody
            formData={formData}
            selectedProjectIdx={selectedProjectIdx}
            setSelectedProjectIdx={setSelectedProjectIdx}
            hoveredQuadrant={hoveredQuadrant}
            setHoveredQuadrant={setHoveredQuadrant}
          />
        )}

        {toolType !== 'grow' && toolType !== 'strategic-alignment' && (
          <div className="plan-sum">
            <div className="plan-sum-row">
              <p className="plan-sum-label">Details</p>
              <p className="plan-sum-value" style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(formData, null, 2)}
              </p>
            </div>
          </div>
        )}

        <div className="plan-actions">
          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => navigate(EDIT_ROUTE[toolType] || '/decision-tools', { state: { decisionId: decision.id, ...formData, problemTitle: decision.title } })}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function StrategicAlignmentBody({ formData, selectedProjectIdx, setSelectedProjectIdx, hoveredQuadrant, setHoveredQuadrant }) {
  const SectionBlock = ({ title, content }) => (
    <div style={{ ...summaryStyles.section, marginTop: '32px' }}>
      <h2 style={summaryStyles.sectionHeading}>{title}</h2>
      <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6', color: '#666', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {content || <span style={{ color: '#999', fontStyle: 'italic' }}>No content provided</span>}
      </div>
    </div>
  );

  return (
    <>
      {formData.risks?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>How you would fail</h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
            {formData.risks.map((risk, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.risks.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                <span style={{ fontWeight: '600' }}>{idx + 1}.</span> {risk}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.factors?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Critical success factors</h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
            {formData.factors.map((factor, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.factors.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                <span style={{ fontWeight: '600' }}>{String.fromCharCode(65 + idx)}.</span> {factor}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.projects?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Projects / lines of effort</h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
            {formData.projects.map((project, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '12px' : 0, color: '#555', fontSize: '14px' }}>
                <span style={{ fontWeight: '600' }}>{String.fromCharCode(65 + idx)}.</span> {project}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.matrix && Object.keys(formData.matrix).length > 0 && formData.factors?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategic importance scores</h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '12px', borderBottom: '2px solid #333', fontWeight: '600' }}>Project</th>
                  <th style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '2px solid #333', fontWeight: '600' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {formData.projects?.map((project, projectIdx) => {
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
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress status</h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px' }}>
            {formData.projects?.map((project, idx) => {
              const progress = formData.progress[idx] || 0;
              const progressLabels = ['Not started', 'Planning', 'In progress', 'Near complete', 'Completed'];
              return (
                <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '16px' : 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>{String.fromCharCode(65 + idx)}. {project}</div>
                  <div style={{ fontSize: '12px', color: '#999' }}>{progressLabels[progress] || 'Not set'} ({progress}/5)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {formData.factors?.length > 0 && formData.projects?.length > 0 && (
        <div style={{ marginTop: '48px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#333', marginBottom: '32px', textAlign: 'center' }}>
            Are you allocating your resources appropriately?
          </h2>

          <svg width={850} height={600} style={{ backgroundColor: 'white', display: 'block', margin: '0 auto', marginBottom: '32px', maxWidth: '100%', height: 'auto' }} onClick={() => setSelectedProjectIdx(null)}>
            {(() => {
              const svgWidth = 850, svgHeight = 600;
              const topPadding = 60, bottomPadding = 80, leftPadding = 90, rightPadding = 130;
              const plotWidth = svgWidth - leftPadding - rightPadding;
              const plotHeight = svgHeight - topPadding - bottomPadding;
              const midX = leftPadding + plotWidth / 2;
              const midY = topPadding + plotHeight / 2;
              const maxImportance = formData.factors.length * 3;
              const scaleX = (progressValue) => leftPadding + ((progressValue - 1) / 4) * plotWidth;
              const scaleY = (importanceValue) => svgHeight - bottomPadding - (importanceValue / (maxImportance + 2)) * plotHeight;

              const projectData = formData.projects.map((project, projectIdx) => {
                const projectProgress = formData.progress ? (formData.progress[projectIdx] || 0) : 0;
                const importance = formData.factors.reduce((sum, _, factorIdx) => sum + (formData.matrix?.[`${projectIdx}-${factorIdx}`] || 0), 0);
                return { name: project, progress: projectProgress + 1, importance };
              });

              return (
                <g>
                  <rect x={leftPadding} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity={hoveredQuadrant === 'topLeft' ? '0.15' : '0.08'} />
                  <rect x={midX} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="#5ECCC0" opacity={hoveredQuadrant === 'topRight' ? '0.2' : '0.12'} />
                  <rect x={leftPadding} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#e5e5e5" opacity={hoveredQuadrant === 'bottomLeft' ? '0.15' : '0.08'} />
                  <rect x={midX} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="#F08571" opacity={hoveredQuadrant === 'bottomRight' ? '0.12' : '0.05'} />
                  <line x1={leftPadding} y1={midY} x2={svgWidth - rightPadding} y2={midY} stroke="#333" strokeWidth="2" />
                  <line x1={midX} y1={topPadding} x2={midX} y2={svgHeight - bottomPadding} stroke="#333" strokeWidth="2" />
                  {[1, 2, 3, 4, 5].map((tick) => (
                    <g key={`x-${tick}`}>
                      <line x1={scaleX(tick)} y1={midY} x2={scaleX(tick)} y2={midY + 6} stroke="#333" strokeWidth="1" />
                      <text x={scaleX(tick)} y={midY + 22} textAnchor="middle" fontSize="12" fill="#333" fontWeight="500">{tick}</text>
                    </g>
                  ))}
                  {[1, 2, 3, 4, 5].map((tick) => {
                    const val = Math.round((tick / 5) * (maxImportance + 2));
                    return val <= maxImportance ? (
                      <g key={`y-${tick}`}>
                        <line x1={leftPadding - 6} y1={scaleY(val)} x2={leftPadding} y2={scaleY(val)} stroke="#333" strokeWidth="1" />
                        <text x={leftPadding - 12} y={scaleY(val) + 4} textAnchor="end" fontSize="12" fill="#333" fontWeight="500">{val}</text>
                      </g>
                    ) : null;
                  })}
                  <text x={svgWidth / 2} y={svgHeight - 20} textAnchor="middle" fontSize="12" fill="#666" fontWeight="500">Project progress →</text>
                  <text x={20} y={svgHeight / 2} textAnchor="middle" fontSize="12" fill="#666" fontWeight="500" transform={`rotate(-90 20 ${svgHeight / 2})`}>Strategic importance →</text>
                  {projectData.map((project, idx) => {
                    const x = scaleX(project.progress);
                    const y = scaleY(project.importance);
                    const isSelected = selectedProjectIdx === idx;
                    return (
                      <g key={idx} onClick={(e) => { e.stopPropagation(); setSelectedProjectIdx(isSelected ? null : idx); }}>
                        <circle cx={x} cy={y} r={isSelected ? 8 : 6} fill="#F08571" opacity={isSelected ? 1 : 0.7} style={{ cursor: 'pointer' }} />
                        <text x={x} y={y + 16} textAnchor="middle" fontSize={isSelected ? '12' : '11'} fill={isSelected ? '#F08571' : '#333'} fontWeight={isSelected ? '700' : '500'}>{project.name}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>

          <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '16px', textAlign: 'center' }}>What does each quadrant mean?</h3>
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
        </div>
      )}
    </>
  );
}
