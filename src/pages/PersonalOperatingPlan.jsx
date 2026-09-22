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

          // Expand first strategy by default
          if (strategiesData.length > 0) {
            setExpandedStrategies({ [strategiesData[0].id]: true });
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

      navigate('/my-account', { state: { isGuest, tab: 'archived-missions' } });
    } catch (error) {
      console.error('Error archiving mission:', error);
      alert('Failed to archive mission');
    }
  };

  const getTacticDisplay = (tactic) => {
    if (tactic.type === 'tickable') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={tactic.is_done || false}
            disabled
            style={{ width: '18px', height: '18px' }}
          />
          <span style={{ textDecoration: tactic.is_done ? 'line-through' : 'none' }}>
            {tactic.action}
          </span>
        </div>
      );
    } else {
      return (
        <div>
          <div>{tactic.action}</div>
          <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            {tactic.current_value || 0} / {tactic.target_value} {tactic.unit}
          </div>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  if (!mission) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
          <p style={{ color: '#999', fontSize: '14px', marginBottom: '24px' }}>No personal operating plan yet</p>
          <button
            onClick={() => navigate('/personal-operating-plan-edit', { state: { isGuest, isNew: true } })}
            style={{
              padding: '12px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '40px 32px' }} className="page-container">
        {/* Mission Section - Fixed at top */}
        <div style={{ marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '12px', color: '#999', margin: '0 0 8px 0', fontWeight: '500' }}>YOUR MISSION</p>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', margin: '0 0 16px 0' }}>
            {mission.title}
          </h1>
        </div>

        {/* Strategies Section */}
        <div style={{ marginBottom: '32px' }}>
          {strategies.length === 0 ? (
            <p style={{ color: '#999', fontSize: '14px' }}>No strategies yet</p>
          ) : (
            strategies.map(strategy => (
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

                {/* Tactics */}
                {expandedStrategies[strategy.id] && (
                  <div style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid #e5e5e5' }}>
                    {tactics[strategy.id]?.length === 0 ? (
                      <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>No tactics yet</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {tactics[strategy.id]?.map((tactic, index) => (
                          <div key={tactic.id} style={{ paddingBottom: '12px', borderBottom: index < tactics[strategy.id].length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                            <div style={{ marginBottom: '8px' }}>
                              {getTacticDisplay(tactic)}
                            </div>
                            {tactic.last_reviewed_at && (
                              <div style={{ fontSize: '11px', color: '#bbb' }}>
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
            ))
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
          <button
            onClick={() => navigate('/personal-operating-plan-edit', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              padding: '12px 24px',
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
            Edit Plan
          </button>
          <button
            onClick={() => navigate('/personal-operating-plan-review', { state: { isGuest, missionId: mission.id } })}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: '#F08571',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
          >
            Review Plan
          </button>
        </div>

        {/* Archive Button */}
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e5e5' }}>
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
              fontSize: '13px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.color = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.color = '#999';
            }}
          >
            Archive Mission
          </button>
        </div>
      </div>
    </div>
  );
}
