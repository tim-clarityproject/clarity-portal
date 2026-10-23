import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatUkDate } from '../lib/dateFormatter';
import DesignHeader from '../components/DesignHeader';
import { BackLink } from '../components/ui/DiscardLink';
import pageText from '../content/pageText';
import { Loading, PageHeader } from '../components/design';

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
        <div className="plan-page"><Loading label="Loading your decision" className="ds-loading--page" /></div>
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
          <PageHeader title={decision.title || 'Untitled decision'} info={pageText.decisionSummary} meta={[TYPE_LABEL[toolType] || toolType, `Created ${formatUkDate(decision.created_at)}`]} />
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
  return (
    <>
      {formData.risks?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>How you would fail</h2>
          <div style={{ backgroundColor: 'var(--raised)', padding: '16px', borderRadius: '8px' }}>
            {formData.risks.map((risk, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.risks.length - 1 ? '12px' : 0, color: 'var(--text-2)', fontSize: '14px' }}>
                <span>{idx + 1}.</span> {risk}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.factors?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Critical success factors</h2>
          <div style={{ backgroundColor: 'var(--raised)', padding: '16px', borderRadius: '8px' }}>
            {formData.factors.map((factor, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.factors.length - 1 ? '12px' : 0, color: 'var(--text-2)', fontSize: '14px' }}>
                <span>{String.fromCharCode(65 + idx)}.</span> {factor}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.projects?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Projects / lines of effort</h2>
          <div style={{ backgroundColor: 'var(--raised)', padding: '16px', borderRadius: '8px' }}>
            {formData.projects.map((project, idx) => (
              <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '12px' : 0, color: 'var(--text-2)', fontSize: '14px' }}>
                <span>{String.fromCharCode(65 + idx)}.</span> {project}
              </div>
            ))}
          </div>
        </div>
      )}

      {formData.matrix && Object.keys(formData.matrix).length > 0 && formData.factors?.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategic importance scores</h2>
          <div style={{ backgroundColor: 'var(--raised)', padding: '16px', borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '12px', borderBottom: '2px solid var(--quiet-line)', fontWeight: '600' }}>Project</th>
                  <th style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '2px solid var(--quiet-line)', fontWeight: '600' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {formData.projects?.map((project, projectIdx) => {
                  const score = formData.factors.reduce((sum, _, factorIdx) => sum + (formData.matrix[`${projectIdx}-${factorIdx}`] || 0), 0);
                  return (
                    <tr key={projectIdx}>
                      <td style={{ paddingTop: '8px', paddingBottom: '8px', color: 'var(--text-2)' }}>{String.fromCharCode(65 + projectIdx)}. {project}</td>
                      <td style={{ textAlign: 'center', paddingTop: '8px', paddingBottom: '8px', color: 'var(--coral-text)' }}>{score}/{formData.factors.length * 3}</td>
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
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress status</h2>
          <div style={{ backgroundColor: 'var(--raised)', padding: '16px', borderRadius: '8px' }}>
            {formData.projects?.map((project, idx) => {
              const progress = formData.progress[idx] || 0;
              const progressLabels = ['Not started', 'Planning', 'In progress', 'Near complete', 'Completed'];
              return (
                <div key={idx} style={{ marginBottom: idx < formData.projects.length - 1 ? '16px' : 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '6px' }}>{String.fromCharCode(65 + idx)}. {project}</div>
                  <div style={{ fontSize: '12px', color: 'var(--label)' }}>{progressLabels[progress] || 'Not set'}, {progress}/5</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {formData.factors?.length > 0 && formData.projects?.length > 0 && (
        <div style={{ marginTop: '48px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '32px', textAlign: 'center' }}>
            Are you allocating your resources appropriately?
          </h2>

          <svg width={850} height={600} style={{ backgroundColor: 'var(--raised)', display: 'block', margin: '0 auto', marginBottom: '32px', maxWidth: '100%', height: 'auto' }} onClick={() => setSelectedProjectIdx(null)}>
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
                  <rect x={leftPadding} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="var(--coral)" opacity={hoveredQuadrant === 'topLeft' ? '0.15' : '0.08'} />
                  <rect x={midX} y={topPadding} width={plotWidth / 2} height={plotHeight / 2} fill="var(--mint-text)" opacity={hoveredQuadrant === 'topRight' ? '0.2' : '0.12'} />
                  <rect x={leftPadding} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="var(--label)" opacity={hoveredQuadrant === 'bottomLeft' ? '0.15' : '0.08'} />
                  <rect x={midX} y={midY} width={plotWidth / 2} height={plotHeight / 2} fill="var(--coral)" opacity={hoveredQuadrant === 'bottomRight' ? '0.12' : '0.05'} />
                  <line x1={leftPadding} y1={midY} x2={svgWidth - rightPadding} y2={midY} stroke="var(--text-2)" strokeWidth="2" />
                  <line x1={midX} y1={topPadding} x2={midX} y2={svgHeight - bottomPadding} stroke="var(--text-2)" strokeWidth="2" />
                  {[1, 2, 3, 4, 5].map((tick) => (
                    <g key={`x-${tick}`}>
                      <line x1={scaleX(tick)} y1={midY} x2={scaleX(tick)} y2={midY + 6} stroke="var(--text-2)" strokeWidth="1" />
                      <text x={scaleX(tick)} y={midY + 22} textAnchor="middle" fontSize="12" fill="var(--text)" fontWeight="500">{tick}</text>
                    </g>
                  ))}
                  {[1, 2, 3, 4, 5].map((tick) => {
                    const val = Math.round((tick / 5) * (maxImportance + 2));
                    return val <= maxImportance ? (
                      <g key={`y-${tick}`}>
                        <line x1={leftPadding - 6} y1={scaleY(val)} x2={leftPadding} y2={scaleY(val)} stroke="var(--text-2)" strokeWidth="1" />
                        <text x={leftPadding - 12} y={scaleY(val) + 4} textAnchor="end" fontSize="12" fill="var(--text)" fontWeight="500">{val}</text>
                      </g>
                    ) : null;
                  })}
                  <text x={svgWidth / 2} y={svgHeight - 20} textAnchor="middle" fontSize="12" fill="var(--text-2)" fontWeight="500">Project progress →</text>
                  <text x={20} y={svgHeight / 2} textAnchor="middle" fontSize="12" fill="var(--text-2)" fontWeight="500" transform={`rotate(-90 20 ${svgHeight / 2})`}>Strategic importance →</text>
                  {projectData.map((project, idx) => {
                    const x = scaleX(project.progress);
                    const y = scaleY(project.importance);
                    const isSelected = selectedProjectIdx === idx;
                    return (
                      <g key={idx} onClick={(e) => { e.stopPropagation(); setSelectedProjectIdx(isSelected ? null : idx); }}>
                        <circle cx={x} cy={y} r={isSelected ? 8 : 6} fill="var(--coral)" opacity={isSelected ? 1 : 0.7} style={{ cursor: 'pointer' }} />
                        <text x={x} y={y + 16} textAnchor="middle" fontSize={isSelected ? '12' : '11'} fill={isSelected ? 'var(--coral-text)' : 'var(--text)'} fontWeight={isSelected ? '700' : '500'}>{project.name}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>

          <div style={{ padding: '24px', backgroundColor: 'var(--raised)', borderRadius: '12px', border: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '16px', textAlign: 'center' }}>What does each quadrant mean?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--coral-soft-tint)', borderRadius: '8px', borderLeft: '3px solid var(--coral-text)' }} onMouseEnter={() => setHoveredQuadrant('topLeft')} onMouseLeave={() => setHoveredQuadrant(null)}>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>Do you need to allocate resources to these projects?</div>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>High importance, low progress</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--mint-tint)', borderRadius: '8px', borderLeft: '3px solid var(--mint-text)' }} onMouseEnter={() => setHoveredQuadrant('topRight')} onMouseLeave={() => setHoveredQuadrant(null)}>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>These projects are doing great.</div>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>High importance, high progress</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--card)', borderRadius: '8px', borderLeft: '3px solid var(--label)' }} onMouseEnter={() => setHoveredQuadrant('bottomLeft')} onMouseLeave={() => setHoveredQuadrant(null)}>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>Should this project be deferred or cancelled?</div>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Low importance, low progress</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: 'var(--card)', borderRadius: '8px', borderLeft: '3px solid var(--coral-text)' }} onMouseEnter={() => setHoveredQuadrant('bottomRight')} onMouseLeave={() => setHoveredQuadrant(null)}>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '6px' }}>Do you need to reallocate resources to other projects?</div>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Low importance, high progress</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
