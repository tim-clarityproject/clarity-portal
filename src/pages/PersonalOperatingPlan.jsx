import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateAndTime } from '../lib/dateFormatter';
import { designTokens, applyTypography } from '../lib/designTokens';
import HomeHeader from '../components/HomeHeader';

export default function PersonalOperatingPlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tactics, setTactics] = useState({});
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Safety check: redirect if no valid session
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', {
        state: { returnTo: location.pathname, fromDirect: true },
        replace: true
      });
    }
  }, [authLoading, user, navigate, location]);

  useEffect(() => {
    if (user && !isGuest) {
      loadPlan();
    }
  }, [user, isGuest]);

  const loadPlan = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Load user's mission
      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (missionData) {
        setMission(missionData);

        // Load strategies for this mission
        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionData.id)
          .order('sort_order', { ascending: true });

        if (strategiesData) {
          setStrategies(strategiesData);

          // Load tactics for each strategy
          const tacticsByStrategy = {};
          for (const strategy of strategiesData) {
            const { data: tacticsData } = await supabase
              .from('tactics')
              .select('*')
              .eq('strategy_id', strategy.id)
              .order('sort_order', { ascending: true });

            tacticsByStrategy[strategy.id] = tacticsData || [];
          }
          setTactics(tacticsByStrategy);

          // Expand all strategies by default for full visibility
          if (strategiesData.length > 0) {
            const allExpanded = {};
            strategiesData.forEach(s => {
              allExpanded[s.id] = true;
            });
            setExpandedStrategies(allExpanded);
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

  const handleArchiveMission = async () => {
    const confirmed = window.confirm(
      'Archive this mission? It will be moved to your archived missions, but you can restore it anytime. All reviews will be preserved.'
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'Are you sure? This cannot be undone immediately (but you can restore it later). Your mission data is safe.'
    );
    if (!doubleConfirm) return;

    try {
      await supabase
        .from('missions')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', mission.id)
        .eq('user_id', user.id);

      navigate('/personal-operating-plan-edit', { state: { isGuest, isNew: true } });
    } catch (error) {
      console.error('Error archiving mission:', error);
      alert('Failed to archive mission');
    }
  };

  const getTacticDisplay = (tactic) => {
    const tacticText = tactic.name || tactic.action || 'Untitled tactic';

    if (tactic.is_done !== undefined) {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={tactic.is_done || false}
            disabled
            style={{
              width: '16px',
              height: '16px',
              cursor: 'not-allowed',
              accentColor: '#F08571',
              appearance: 'none',
              WebkitAppearance: 'none',
              border: '2px solid #ccc',
              borderRadius: '3px',
              backgroundColor: tactic.is_done ? '#F08571' : 'white',
            }}
          />
          <span style={{ fontSize: '13px', color: '#333' }}>{tacticText}</span>
        </label>
      );
    } else if (tactic.target_value !== undefined) {
      return (
        <div>
          <div style={{ fontSize: '13px', color: '#333', marginBottom: '4px' }}>{tacticText}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            {tactic.current_value || '0'} / {tactic.target_value} {tactic.unit || ''}
          </div>
        </div>
      );
    }
    return <span style={{ fontSize: '13px', color: '#333' }}>{tacticText}</span>;
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', textAlign: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', textAlign: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px', marginBottom: '24px' }}>No personal operating plan yet</p>
          <button
            onClick={() => navigate('/personal-operating-plan-edit', { state: { isGuest, isNew: true } })}
            style={{
              padding: '14px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Create Your Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <style>{`
        .pop-page-container {
          padding: 64px 32px;
        }
        @media (max-width: 768px) {
          .pop-page-container {
            padding: 32px 16px;
          }
        }
      `}</style>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="pop-page-container">

        {/* MISSION SECTION - Premium Hero with Coral Background */}
        <div style={{
          backgroundColor: designTokens.colors.primary,
          padding: designTokens.spacing.xl,
          borderRadius: designTokens.borderRadius.lg,
          boxShadow: designTokens.shadow.coral,
          marginBottom: designTokens.layout.gapBetweenSections,
        }}>
          <p style={{ ...designTokens.typography.label, color: 'white', margin: `0 0 ${designTokens.spacing.md} 0`, opacity: 0.9 }}>Your Mission</p>
          <h1 style={{ ...designTokens.typography.h1, color: 'white', margin: '0' }}>
            {mission.title}
          </h1>
        </div>

        {/* STRATEGIES SECTION - Premium Cards */}
        <div style={{ marginBottom: '48px' }}>
          {strategies.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
              <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>No strategies yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {strategies.map(strategy => (
                <div
                  key={strategy.id}
                  style={{
                    backgroundColor: designTokens.colors.background.default,
                    border: `1px solid ${designTokens.colors.border.medium}`,
                    borderRadius: designTokens.borderRadius.lg,
                    borderLeft: `4px solid ${designTokens.colors.primary}`,
                    overflow: 'hidden',
                    boxShadow: designTokens.shadow.sm,
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = designTokens.shadow.md;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = designTokens.shadow.sm;
                  }}
                >
                  <button
                    onClick={() => toggleStrategy(strategy.id)}
                    style={{
                      width: '100%',
                      padding: designTokens.spacing.lg,
                      backgroundColor: designTokens.colors.background.default,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = designTokens.colors.background.secondary}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = designTokens.colors.background.default}
                  >
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <h3 style={{ ...designTokens.typography.h3, color: designTokens.colors.text.primary, margin: `0 0 ${designTokens.spacing.sm} 0` }}>
                        {strategy.name}
                      </h3>
                      {strategy.description && (
                        <p style={{ ...designTokens.typography.bodySm, color: designTokens.colors.text.secondary, margin: 0 }}>
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
                        marginLeft: '16px',
                        marginTop: '2px',
                      }}
                    />
                  </button>

                  {/* TACTICS - Premium Details */}
                  {expandedStrategies[strategy.id] && (
                    <div style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #f0f0f0' }}>
                      {tactics[strategy.id]?.length === 0 ? (
                        <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>No tactics yet</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {tactics[strategy.id]?.map((tactic, index) => (
                            <div
                              key={tactic.id}
                              style={{
                                paddingBottom: index < tactics[strategy.id].length - 1 ? '16px' : '0',
                                borderBottom: index < tactics[strategy.id].length - 1 ? '1px solid #f0f0f0' : 'none',
                              }}
                            >
                              <div style={{ marginBottom: '6px' }}>
                                {getTacticDisplay(tactic)}
                              </div>
                              {tactic.last_reviewed_at && (
                                <div style={{ fontSize: '11px', color: '#bbb', marginTop: '4px' }}>
                                  Last reviewed: {formatDateAndTime(tactic.last_reviewed_at)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS - Premium Styling */}
        <div style={{ display: 'flex', gap: designTokens.spacing.sm, marginBottom: designTokens.spacing.xl }}>
          <button
            onClick={() => navigate('/personal-operating-plan-edit', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              ...designTokens.button.secondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = designTokens.colors.primary;
              e.currentTarget.style.backgroundColor = designTokens.colors.background.secondary;
              e.currentTarget.style.color = designTokens.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = designTokens.colors.border.medium;
              e.currentTarget.style.backgroundColor = designTokens.colors.background.default;
              e.currentTarget.style.color = designTokens.colors.text.primary;
            }}
          >
            Edit Plan
          </button>
          <button
            onClick={() => navigate('/personal-operating-plan-review', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              ...designTokens.button.primary,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = designTokens.button.primary.hoverBackgroundColor}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = designTokens.colors.primary}
          >
            Review Plan
          </button>
        </div>

        {/* ARCHIVE BUTTON - Tertiary Action */}
        <div style={{ paddingTop: designTokens.spacing.lg, borderTop: `1px solid ${designTokens.colors.border.medium}` }}>
          <button
            onClick={handleArchiveMission}
            style={{
              ...designTokens.button.tertiary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#d32f2f';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = designTokens.colors.text.tertiary;
            }}
            title="Archived missions and their reviews are stored in your Profile settings."
          >
            Archive Mission
          </button>
          <p style={{ ...designTokens.typography.caption, color: designTokens.colors.text.disabled, margin: `${designTokens.spacing.sm} 0 0 0` }}>
            Archived missions and their reviews are stored in your Profile settings.
          </p>
        </div>

      </div>
    </div>
  );
}
