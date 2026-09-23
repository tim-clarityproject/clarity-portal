import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatDateAndTime } from '../lib/dateFormatter';
import HomeHeader from '../components/HomeHeader';

export default function PersonalOperatingPlan() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;

  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tactics, setTactics] = useState({});
  const [expandedStrategies, setExpandedStrategies] = useState({});
  const [isLoading, setIsLoading] = useState(true);

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
    if (tactic.is_done !== undefined) {
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={tactic.is_done || false}
            disabled
            style={{ width: '16px', height: '16px', cursor: 'not-allowed', accentColor: '#F08571' }}
          />
          <span style={{ fontSize: '13px', color: '#333' }}>{tactic.name}</span>
        </label>
      );
    } else if (tactic.target_value !== undefined) {
      return (
        <div>
          <div style={{ fontSize: '13px', color: '#333', marginBottom: '4px' }}>{tactic.name}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            {tactic.current_value || '0'} / {tactic.target_value} {tactic.unit || ''}
          </div>
        </div>
      );
    }
    return <span style={{ fontSize: '13px', color: '#333' }}>{tactic.name}</span>;
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

        {/* MISSION SECTION - Premium Hero */}
        <div style={{
          backgroundColor: '#f9f9f9',
          padding: '32px',
          borderRadius: '8px',
          border: '1px solid #e5e5e5',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
          marginBottom: '48px',
        }}>
          <p style={{ fontSize: '11px', color: '#999', margin: '0 0 12px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Mission</p>
          <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#333', margin: '0', lineHeight: '1.3', letterSpacing: '-0.3px' }}>
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
                    backgroundColor: 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    borderLeft: '4px solid #F08571',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                  }}
                >
                  <button
                    onClick={() => toggleStrategy(strategy.id)}
                    style={{
                      width: '100%',
                      padding: '20px',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                        {strategy.name}
                      </h3>
                      {strategy.description && (
                        <p style={{ fontSize: '13px', color: '#666', margin: 0, lineHeight: '1.5' }}>
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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
          <button
            onClick={() => navigate('/personal-operating-plan-edit', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.color = '#333';
            }}
          >
            Edit Plan
          </button>
          <button
            onClick={() => navigate('/personal-operating-plan-review', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: '#F08571',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F08571'}
          >
            Review Plan
          </button>
        </div>

        {/* ARCHIVE BUTTON - Tertiary Action */}
        <div style={{ paddingTop: '24px', borderTop: '1px solid #e5e5e5' }}>
          <button
            onClick={handleArchiveMission}
            style={{
              padding: '10px 16px',
              backgroundColor: 'white',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              color: '#999',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.color = '#999';
            }}
          >
            Archive Mission
          </button>
        </div>

      </div>
    </div>
  );
}
