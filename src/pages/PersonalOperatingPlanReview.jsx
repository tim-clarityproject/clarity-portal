import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { designTokens } from '../lib/designTokens';
import HomeHeader from '../components/HomeHeader';

export default function PersonalOperatingPlanReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const missionId = location.state?.missionId;

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [reviewData, setReviewData] = useState({});
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (missionId && user) {
      loadPlan();
    }
  }, [missionId, user]);

  const loadPlan = async () => {
    try {
      const { data: mission } = await supabase
        .from('missions')
        .select('*')
        .eq('id', missionId)
        .eq('user_id', user.id)
        .single();

      if (mission) {
        setMission(mission);

        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionId)
          .order('sort_order', { ascending: true });

        if (strategiesData) {
          const strategiesWithTactics = await Promise.all(
            strategiesData.map(async (strategy) => {
              const { data: tactics } = await supabase
                .from('tactics')
                .select('*')
                .eq('strategy_id', strategy.id)
                .order('sort_order', { ascending: true });

              return {
                ...strategy,
                tactics: tactics || []
              };
            })
          );
          setStrategies(strategiesWithTactics);

          // Initialize review data
          const initial = {};
          strategiesWithTactics.forEach(strategy => {
            strategy.tactics.forEach(tactic => {
              initial[tactic.id] = {
                isDone: tactic.is_done || false,
                value: tactic.current_value || '',
                note: ''
              };
            });
          });
          setReviewData(initial);

          if (strategiesWithTactics.length > 0) {
            setExpandedStrategies({ [strategiesWithTactics[0].id]: true });
          }
        }
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStrategy = (strategyId) => {
    setExpandedStrategies(prev => ({
      ...prev,
      [strategyId]: !prev[strategyId]
    }));
  };

  const updateReview = (tacticId, field, value) => {
    setReviewData(prev => ({
      ...prev,
      [tacticId]: {
        ...prev[tacticId],
        [field]: value
      }
    }));
  };

  const submitReview = async () => {
    setIsSubmitting(true);
    try {
      // Create mission_progress review
      const snapshotData = {
        mission_id: missionId,
        mission_title: mission.title,
        strategies: strategies.map(strategy => ({
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          tactics: strategy.tactics.map(tactic => ({
            id: tactic.id,
            action: tactic.action,
            type: tactic.type,
            target_value: tactic.target_value,
            unit: tactic.unit,
            current_value: tactic.current_value,
            is_done: tactic.is_done,
            // Reviewed data
            reviewed_is_done: tactic.type === 'tickable' ? reviewData[tactic.id].isDone : null,
            reviewed_value: tactic.type === 'measurable' ? reviewData[tactic.id].value : null,
            reviewed_note: reviewData[tactic.id].note || null,
            review_date: new Date().toISOString()
          }))
        }))
      };

      const { error } = await supabase
        .from('mission_progress_reviews')
        .insert([{
          mission_id: missionId,
          user_id: user.id,
          review_data: snapshotData
        }]);

      if (error) throw error;

      // Update last_reviewed_at on tactics
      for (const strategy of strategies) {
        for (const tactic of strategy.tactics) {
          await supabase
            .from('tactics')
            .update({ last_reviewed_at: new Date().toISOString() })
            .eq('id', tactic.id);
        }
      }

      navigate('/personal-operating-plan');
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999' }}>Loading...</p>
      </div>
    );
  }

  if (!mission) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <p style={{ color: '#999' }}>Plan not found</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '40px 32px' }} className="page-container">

        {/* Page Title */}
        <h1 style={{ ...designTokens.typography.h1, color: designTokens.colors.text.primary, marginTop: '0', marginBottom: designTokens.spacing.xl, paddingBottom: designTokens.spacing.lg, borderBottom: `2px solid ${designTokens.colors.primary}` }}>
          Review your progress
        </h1>

        {/* Strategies Section */}
        {strategies.map(strategy => (
          <div key={strategy.id} style={{ marginBottom: '16px', border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => toggleStrategy(strategy.id)}
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: '#fafafa',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
            >
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: '0 0 4px 0' }}>
                  {strategy.name}
                </h3>
                {strategy.description && (
                  <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
                    {strategy.description}
                  </p>
                )}
              </div>
              <ChevronDown
                size={20}
                style={{
                  color: '#999',
                  transform: expandedStrategies[strategy.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px'
                }}
              />
            </button>

            {/* Tactics Review */}
            {expandedStrategies[strategy.id] && (
              <div style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid #e5e5e5' }}>
                {strategy.tactics.map((tactic, index) => (
                  <div key={tactic.id} style={{ marginBottom: index < strategy.tactics.length - 1 ? '24px' : '0', paddingBottom: index < strategy.tactics.length - 1 ? '24px' : '0', borderBottom: index < strategy.tactics.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>
                      {tactic.action}
                    </p>

                    {tactic.type === 'tickable' ? (
                      // Tickable review
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <input
                          type="checkbox"
                          checked={reviewData[tactic.id]?.isDone || false}
                          onChange={(e) => updateReview(tactic.id, 'isDone', e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                            accentColor: '#F08571',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            border: '2px solid #ccc',
                            borderRadius: '3px',
                            backgroundColor: reviewData[tactic.id]?.isDone ? '#F08571' : 'white',
                          }}
                        />
                        <label style={{ cursor: 'pointer', fontSize: '11px', color: '#666' }}>Mark as done</label>
                      </div>
                    ) : (
                      // Measurable review
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '6px' }}>
                          Current value ({tactic.unit})
                        </label>
                        <input
                          type="number"
                          value={reviewData[tactic.id]?.value || ''}
                          onChange={(e) => updateReview(tactic.id, 'value', e.target.value ? parseFloat(e.target.value) : '')}
                          placeholder={`Target: ${tactic.target_value} ${tactic.unit}`}
                          style={{
                            width: '100%',
                            padding: '8px',
                            fontSize: '13px',
                            border: '1px solid #e5e5e5',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          Target: {tactic.target_value} {tactic.unit}
                        </div>
                      </div>
                    )}

                    {/* Note */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '6px' }}>
                        Note (optional)
                      </label>
                      <textarea
                        value={reviewData[tactic.id]?.note || ''}
                        onChange={(e) => updateReview(tactic.id, 'note', e.target.value)}
                        placeholder="Add a reflection or comment..."
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '13px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '4px',
                          minHeight: '60px',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={() => navigate('/personal-operating-plan')}
            style={{
              flex: 1,
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'white';
            }}
          >
            Cancel
          </button>
          <button
            onClick={submitReview}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '10px 20px',
              backgroundColor: isSubmitting ? '#ccc' : '#F08571',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !isSubmitting && (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !isSubmitting && (e.target.style.backgroundColor = '#F08571')}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
}
