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
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            }}
          >
            ← Back to Decisions
          </button>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#fff', backgroundColor: '#F08571', padding: '4px 12px', borderRadius: '4px', textTransform: 'uppercase' }}>
            {toolType === 'grow' ? 'GROW' : toolType === 'inversion' ? 'Inversion' : toolType === 'strategic-alignment' ? 'Strategic Alignment' : toolType === 'tough-conversation' ? 'Tough Conversation' : 'Decision'}
          </span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
          {decision.title || 'Untitled Decision'}
        </h1>

        {/* GROW Specific Sections */}
        {toolType === 'grow' && (
          <>
            <SectionBlock
              title="Goal"
              content={formData.goal || decision.title}
            />
            <SectionBlock
              title="Reality"
              content={formData.constraints}
            />
            <SectionBlock
              title="Options"
              content={formData.opportunities}
            />
            {formData.options && formData.options.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Options Considered
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

        {/* What you said you'd do - not shown for Tough Conversation */}
        {toolType !== 'tough-conversation' && (
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
      </div>
    </div>
  );
}
