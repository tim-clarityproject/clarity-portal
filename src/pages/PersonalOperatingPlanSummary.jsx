import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BackArrow from '../components/BackArrow';

export default function PersonalOperatingPlanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [mission, setMission] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [tactics, setTactics] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;

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
      const { data: missionData } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (missionData) {
        setMission(missionData);

        const { data: strategiesData } = await supabase
          .from('strategies')
          .select('*')
          .eq('mission_id', missionData.id)
          .order('sort_order', { ascending: true });

        if (strategiesData) {
          setStrategies(strategiesData);

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
        }
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>Loading plan...</p>
        </div>
      </div>
    );
  }

  if (!mission) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
        <HomeHeader isGuest={isGuest} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px' }}>No operating plan found</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px', paddingBottom: '100px' }} className="page-container print-container">
        <BackArrow />

        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }} className="no-print">
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, flex: 1 }}>
            Personal Operating Plan
          </h1>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', backgroundColor: '#F08571', padding: '6px 12px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            Operating Plan
          </span>
        </div>

        {/* Mission Section */}
        <div style={{ marginBottom: '24px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Mission
          </h2>
          <div style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: 0, lineHeight: '1.6' }}>
              {mission.mission_statement}
            </p>
          </div>
        </div>

        {/* Strategies Section */}
        {strategies.length > 0 && (
          <div style={{ marginBottom: '24px', paddingLeft: '24px', borderLeft: '4px solid #F08571' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Strategies
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {strategies.map((strategy) => (
                <div key={strategy.id} style={{ backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #f0f0f0' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 12px 0' }}>
                    {strategy.strategy_name}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px 0', lineHeight: '1.5' }}>
                    {strategy.description}
                  </p>

                  {/* Tactics for this strategy */}
                  {tactics[strategy.id] && tactics[strategy.id].length > 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e5e5' }}>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Tactics
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tactics[strategy.id].map((tactic) => (
                          <li key={tactic.id} style={{ fontSize: '13px', color: '#555', lineHeight: '1.5' }}>
                            {tactic.tactic_name}
                            {tactic.description && (
                              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                                {tactic.description}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap', paddingTop: '32px', borderTop: '1px solid #f0f0f0', justifyContent: 'flex-end' }} className="no-print">
          <button
            onClick={() => navigate('/personal-operating-plan', { state: { isGuest } })}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#333',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Edit Plan
          </button>

          <button
            onClick={handleDownloadPDF}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#333',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#F08571';
              e.currentTarget.style.backgroundColor = '#f9f9f9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e5e5';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
