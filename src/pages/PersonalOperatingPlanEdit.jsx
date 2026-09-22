import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function PersonalOperatingPlanEdit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isGuest = location.state?.isGuest || false;
  const missionId = location.state?.missionId;
  const isNew = location.state?.isNew || false;

  const [missionTitle, setMissionTitle] = useState('');
  const [strategies, setStrategies] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!isNew);

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
        .is('archived_at', null)
        .single();

      if (mission) {
        setMissionTitle(mission.title);

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
        }
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addStrategy = () => {
    const newStrategy = {
      id: `temp-${Date.now()}`,
      name: 'New Strategy',
      description: '',
      sort_order: strategies.length,
      tactics: [],
      isNew: true
    };
    setStrategies([...strategies, newStrategy]);
  };

  const updateStrategy = (index, field, value) => {
    const updated = [...strategies];
    updated[index][field] = value;
    setStrategies(updated);
  };

  const deleteStrategy = (index) => {
    setStrategies(strategies.filter((_, i) => i !== index));
  };

  const moveStrategy = (index, direction) => {
    const updated = [...strategies];
    if (direction === 'up' && index > 0) {
      [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    } else if (direction === 'down' && index < updated.length - 1) {
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    }
    setStrategies(updated);
  };

  const addTactic = (strategyIndex) => {
    const updated = [...strategies];
    updated[strategyIndex].tactics.push({
      id: `temp-${Date.now()}`,
      action: 'New tactic',
      type: 'tickable',
      sort_order: updated[strategyIndex].tactics.length,
      isNew: true
    });
    setStrategies(updated);
  };

  const updateTactic = (strategyIndex, tacticIndex, field, value) => {
    const updated = [...strategies];
    updated[strategyIndex].tactics[tacticIndex][field] = value;
    setStrategies(updated);
  };

  const deleteTactic = (strategyIndex, tacticIndex) => {
    const updated = [...strategies];
    updated[strategyIndex].tactics = updated[strategyIndex].tactics.filter((_, i) => i !== tacticIndex);
    setStrategies(updated);
  };

  const savePlan = async () => {
    if (!missionTitle.trim()) {
      alert('Mission title is required');
      return;
    }

    setIsSaving(true);
    try {
      let currentMissionId = missionId;

      // Create or update mission
      if (isNew || !currentMissionId) {
        const { data: mission, error } = await supabase
          .from('missions')
          .insert([{
            user_id: user.id,
            title: missionTitle
          }])
          .select()
          .single();

        if (error) throw error;
        currentMissionId = mission.id;
      } else {
        await supabase
          .from('missions')
          .update({ title: missionTitle })
          .eq('id', currentMissionId);
      }

      // Save strategies and tactics
      for (let sIndex = 0; sIndex < strategies.length; sIndex++) {
        const strategy = strategies[sIndex];
        let strategyId = strategy.id;

        if (strategy.isNew) {
          const { data: newStrategy, error } = await supabase
            .from('strategies')
            .insert([{
              mission_id: currentMissionId,
              name: strategy.name,
              description: strategy.description,
              sort_order: sIndex
            }])
            .select()
            .single();

          if (error) throw error;
          strategyId = newStrategy.id;
        } else {
          await supabase
            .from('strategies')
            .update({
              name: strategy.name,
              description: strategy.description,
              sort_order: sIndex
            })
            .eq('id', strategyId);
        }

        // Save tactics
        for (let tIndex = 0; tIndex < strategy.tactics.length; tIndex++) {
          const tactic = strategy.tactics[tIndex];

          if (tactic.isNew) {
            await supabase
              .from('tactics')
              .insert([{
                strategy_id: strategyId,
                action: tactic.action,
                type: tactic.type,
                target_value: tactic.type === 'measurable' ? tactic.target_value : null,
                unit: tactic.type === 'measurable' ? tactic.unit : null,
                current_value: tactic.type === 'measurable' ? tactic.current_value : null,
                is_done: tactic.type === 'tickable' ? false : null,
                sort_order: tIndex
              }]);
          } else {
            await supabase
              .from('tactics')
              .update({
                action: tactic.action,
                type: tactic.type,
                target_value: tactic.type === 'measurable' ? tactic.target_value : null,
                unit: tactic.type === 'measurable' ? tactic.unit : null,
                current_value: tactic.type === 'measurable' ? tactic.current_value : null,
                sort_order: tIndex
              })
              .eq('id', tactic.id);
          }
        }
      }

      navigate('/personal-operating-plan', { state: { isGuest } });
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#999' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '40px 32px' }} className="page-container">
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: '0 0 32px 0' }}>Edit Plan</h1>

        {/* Mission Title */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#999', marginBottom: '8px' }}>
            MISSION STATEMENT
          </label>
          <input
            type="text"
            value={missionTitle}
            onChange={(e) => setMissionTitle(e.target.value)}
            placeholder="Enter your mission"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Strategies */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: '0 0 16px 0' }}>Strategies</h2>

          {strategies.map((strategy, sIndex) => (
            <div key={strategy.id} style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  onClick={() => moveStrategy(sIndex, 'up')}
                  disabled={sIndex === 0}
                  style={{ padding: '4px 8px', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '4px', cursor: sIndex === 0 ? 'not-allowed' : 'pointer', opacity: sIndex === 0 ? 0.5 : 1 }}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveStrategy(sIndex, 'down')}
                  disabled={sIndex === strategies.length - 1}
                  style={{ padding: '4px 8px', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '4px', cursor: sIndex === strategies.length - 1 ? 'not-allowed' : 'pointer', opacity: sIndex === strategies.length - 1 ? 0.5 : 1 }}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  onClick={() => deleteStrategy(sIndex)}
                  style={{ padding: '4px 8px', backgroundColor: '#fff0ee', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto', color: '#F08571' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <input
                type="text"
                value={strategy.name}
                onChange={(e) => updateStrategy(sIndex, 'name', e.target.value)}
                placeholder="Strategy name"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  boxSizing: 'border-box'
                }}
              />
              <textarea
                value={strategy.description || ''}
                onChange={(e) => updateStrategy(sIndex, 'description', e.target.value)}
                placeholder="Why this matters"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  minHeight: '60px',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />

              {/* Tactics */}
              <div style={{ paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', margin: '0 0 8px 0' }}>TACTICS</p>
                {strategy.tactics.map((tactic, tIndex) => (
                  <div key={tactic.id} style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <button
                        onClick={() => deleteTactic(sIndex, tIndex)}
                        style={{ padding: '4px 8px', backgroundColor: '#fff0ee', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#F08571', marginLeft: 'auto' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={tactic.action}
                      onChange={(e) => updateTactic(sIndex, tIndex, 'action', e.target.value)}
                      placeholder="Action"
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '13px',
                        border: '1px solid #e5e5e5',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        boxSizing: 'border-box'
                      }}
                    />

                    <select
                      value={tactic.type}
                      onChange={(e) => updateTactic(sIndex, tIndex, 'type', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '13px',
                        border: '1px solid #e5e5e5',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="tickable">Tickable (Done/Not Done)</option>
                      <option value="measurable">Measurable (Value/Target)</option>
                    </select>

                    {tactic.type === 'measurable' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                          type="number"
                          value={tactic.target_value || ''}
                          onChange={(e) => updateTactic(sIndex, tIndex, 'target_value', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="Target"
                          style={{
                            padding: '6px',
                            fontSize: '13px',
                            border: '1px solid #e5e5e5',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                        <input
                          type="text"
                          value={tactic.unit || ''}
                          onChange={(e) => updateTactic(sIndex, tIndex, 'unit', e.target.value)}
                          placeholder="Unit (e.g., reps, km)"
                          style={{
                            padding: '6px',
                            fontSize: '13px',
                            border: '1px solid #e5e5e5',
                            borderRadius: '4px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => addTactic(sIndex)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'white',
                    border: '1px dashed #e5e5e5',
                    borderRadius: '4px',
                    color: '#999',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#f9f9f9';
                    e.target.style.borderColor = '#F08571';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'white';
                    e.target.style.borderColor = '#e5e5e5';
                  }}
                >
                  + Add tactic
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addStrategy}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'white',
              border: '2px dashed #e5e5e5',
              borderRadius: '6px',
              color: '#999',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f9f9f9';
              e.target.style.borderColor = '#F08571';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'white';
              e.target.style.borderColor = '#e5e5e5';
            }}
          >
            + Add strategy
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/personal-operating-plan', { state: { isGuest } })}
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
            onClick={savePlan}
            disabled={isSaving}
            style={{
              flex: 1,
              padding: '10px 20px',
              backgroundColor: isSaving ? '#ccc' : '#F08571',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              fontWeight: '600',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !isSaving && (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !isSaving && (e.target.style.backgroundColor = '#F08571')}
          >
            {isSaving ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
